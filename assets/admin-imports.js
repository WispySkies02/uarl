(function (root) {
  "use strict";

  root.UARLAdminImports = function (bridge) {
    var resultForms = new WeakMap(), standingForms = {}, division = "d1";
    var esc = bridge.esc, csv = root.UARLRaceCSV, standings = root.UARLStandings;
    var standingsLabels = csv.headers.standings.map(function (label, index) { return index === 1 ? "Change" : label; });
    function normalized() { return root.UARLData.normalize(JSON.parse(JSON.stringify(bridge.data()))); }
    function signature() { return JSON.stringify(bridge.data()); }
    function form(kind, record) {
      if (kind === "results") {
        if (!resultForms.has(record)) resultForms.set(record, { text: "", preview: null, open: !(record.finishes || []).length, message: "" });
        return resultForms.get(record);
      }
      if (!standingForms[division]) standingForms[division] = { text: "", preview: null, open: true, message: "" };
      return standingForms[division];
    }
    function context(node) {
      var widget = node.closest("[data-csv-kind]"), kind = widget.dataset.csvKind;
      var record = kind === "results" ? bridge.data().records[Number(widget.dataset.record)] : null;
      if (kind === "results" && !record) return null;
      return { widget: widget, kind: kind, record: record, form: form(kind, record) };
    }
    function table(headers, rows, label) {
      return '<div class="csv-table-scroll" role="region" aria-label="' + esc(label) + '" tabindex="0"><table class="csv-table"><thead><tr>' + headers.map(function (header) { return '<th scope="col">' + esc(header) + '</th>'; }).join("") + '</tr></thead><tbody>' + rows.join("") + '</tbody></table></div>';
    }
    function cells(values) { return '<tr>' + values.map(function (value) { return '<td>' + esc(value == null ? "—" : value) + '</td>'; }).join("") + '</tr>'; }
    function standingsDriver(row) { return '<div class="driver-with-manufacturer"><strong>' + esc(row.name) + '</strong>' + root.UARLManufacturerBadges.badge(row.make) + '</div>'; }
    function previewHTML(kind, state) {
      var preview = state.preview;
      if (!preview) return '<p class="csv-message" role="status">' + esc(state.message) + '</p>';
      if (preview.errors.length) return '<div class="csv-errors" role="alert"><b>Fix these before applying. Your draft has not changed.</b><ul>' + preview.errors.map(function (error) { return '<li>' + esc(error) + '</li>'; }).join("") + '</ul></div>';
      var stale = preview.signature !== signature(), content;
      if (kind === "results") {
        content = table(["Finish", "Driver", "Car #", "Qual.", "Stage 1", "Stage 2", "Fastest lap", "Most led", "Points"], preview.rows.map(function (row, index) {
          var finish = preview.record.finishes[index];
          return cells([row.position, row.driver.name + (row.driver.user ? " · @" + row.driver.user : ""), finish.number || "—", row.qualifying, row.stage1, row.stage2, row.fastestLap ? "Yes" : "No", row.mostLapsLed ? "Yes" : "No", finish.totalPoints]);
        }), "Results CSV preview");
      } else {
        content = table(standingsLabels, preview.rows.map(function (row) { return '<tr><td>' + esc(row.position) + '</td><td>' + standings.movementHTML(row.movement) + '</td><td>' + esc(row.number) + '</td><td>' + standingsDriver(row) + '</td><td>' + esc(row.points) + '</td></tr>'; }), "Standings CSV preview");
      }
      return '<div class="csv-preview" data-csv-preview><h4>Preview · ' + (kind === "results" ? preview.rows.length + ' finishers' : preview.entries.length + ' updated drivers') + '</h4>' + content + '<p class="csv-message" data-csv-status role="status">' + (stale ? 'The draft changed after this preview. Preview the CSV again before applying.' : 'Nothing applied yet. Check the drivers and totals, then save this preview to your draft.') + '</p><button type="button" class="button publish" data-csv-apply ' + (stale ? 'disabled' : '') + '>Apply preview to draft</button></div>';
    }
    function widget(kind, record) {
      var state = form(kind, record), index = kind === "results" ? bridge.data().records.indexOf(record) : "";
      var instructions = kind === "results" ? 'Use a Roblox username, roster display name, or saved CSV name. Driver roster includes permanent drivers without a team. Qualifying and stage positions can be blank; both awards need Yes or No.' : 'Use the roster display name, saved CSV name, or username. Enter +/- as +2, -1, 0, or - for unknown. Car numbers keep leading zeros.';
      var replacement = kind === "results" ? 'Apply replaces this race’s finish order, qualifying, stages, and Yes/No awards. Manual car numbers and points eligibility are kept. Review DNFs or DNQs in manual entry afterward.' : 'Apply sets the listed drivers’ totals for this division; other drivers keep their current totals. Later race results continue adding points. Movement uses the previous positions supplied by this import.';
      return '<details class="csv-import" data-csv-kind="' + kind + '" data-record="' + index + '" ' + (state.open ? 'open' : '') + '><summary><span>Import ' + kind + ' from CSV</span><small>Paste → Preview → Apply</small></summary><div class="csv-import-body"><p>' + instructions + '</p><label>CSV data<textarea data-csv-input rows="5" wrap="off" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="' + esc(csv.headers[kind].join(",")) + '">' + esc(state.text) + '</textarea></label><p class="csv-header-hint">Header: <code>' + esc(csv.headers[kind].join(",")) + '</code></p><p>' + replacement + '</p><button type="button" class="button" data-csv-preview-button>Preview CSV</button><div data-csv-output aria-live="polite">' + previewHTML(kind, state) + '</div></div></details>';
    }
    function results(record) { return widget("results", record); }
    function renderStandings() {
      var rows = standings.calculate(normalized(), division);
      var body = rows.map(function (row) {
        var correction = row.correction && row.correction.pointsAdjustment || 0;
        var details = correction ? '<details class="standings-correction"><summary>Correction ' + (correction > 0 ? '+' : '') + correction + '</summary><p>Race points: ' + row.rawPoints + '</p><button type="button" class="standings-reset" data-reset-points>Use race points</button></details>' : '';
        return '<tr data-standings-driver="' + esc(row.id) + '"><td>' + row.position + '</td><td>' + standings.movementHTML(row.movement) + '</td><td>' + esc(row.number || "—") + '</td><td>' + standingsDriver(row) + '</td><td><div class="standings-points-control"><input type="number" step="1" data-standings-points data-before="' + row.points + '" value="' + row.points + '" aria-label="Points for ' + esc(row.name) + '"><button type="button" class="button ghost" data-save-points hidden disabled>Save</button></div>' + details + '</td></tr>';
      });
      return bridge.header({ title: "Standings", kicker: "Race Center", description: "Import a points table or correct a driver’s total. Race results continue to update these totals automatically." }) + '<div class="standings-editor"><nav class="standings-divisions" aria-label="Standings division">' + [["d1", "D1 · Cup"], ["open", "Open Series"], ["d2", "D2 · Archive"]].map(function (pair) { return '<button class="button ' + (pair[0] === division ? '' : 'ghost') + '" type="button" data-standings-division="' + pair[0] + '" ' + (pair[0] === division ? 'aria-current="page"' : '') + '>' + pair[1] + '</button>'; }).join("") + '</nav>' + widget("standings") + '<section class="standings-manual"><header><div><h2>Points table</h2><p>Change a total and press Save. It stays in your draft until you publish.</p></div><label>Find a driver<input type="search" data-standings-search placeholder="Name or car number"></label></header>' + (rows.length ? table(standingsLabels, body, "Edit standings points") : '<p class="editor-empty">Add drivers to this division or enter its first race results to start the standings.</p>') + '</section></div>';
    }
    function click(event) {
      var button = event.target.closest("[data-csv-preview-button],[data-csv-apply],[data-standings-division],[data-save-points],[data-reset-points]");
      if (!button) return false;
      if (button.dataset.standingsDivision) { division = button.dataset.standingsDivision; bridge.render(); return true; }
      bridge.commit();
      if (button.matches("[data-save-points],[data-reset-points]")) {
        var tr = button.closest("[data-standings-driver]"), input = tr.querySelector("[data-standings-points]");
        var row = standings.calculate(normalized(), division).find(function (row) { return row.id === tr.dataset.standingsDriver; });
        if (!row || row.points !== Number(input.dataset.before)) { bridge.toast("The points changed. Reopen Standings before making this correction.", true); return true; }
        var points = button.matches("[data-reset-points]") ? row.rawPoints : Number(input.value);
        if (!input.value.trim() || !Number.isSafeInteger(points)) { bridge.toast("Enter a whole-number points total.", true); return true; }
        try { bridge.data().standings = standings.merge(bridge.data(), [standings.correction(row, points)]); }
        catch (error) { bridge.toast(error.message, true); return true; }
        bridge.applied(); bridge.toast("Points saved to draft. Future race points still add automatically."); return true;
      }
      var ctx = context(button); if (!ctx) return true;
      var state = ctx.form;
      if (button.matches("[data-csv-preview-button]")) {
        var data = normalized();
        state.preview = ctx.kind === "results" ? csv.results(state.text, data, ctx.record) : csv.standings(state.text, data, division);
        if (!state.preview.errors.length && ctx.kind === "results") bridge.recalculate(state.preview.record);
        state.preview.signature = signature();
        ctx.widget.querySelector("[data-csv-output]").innerHTML = previewHTML(ctx.kind, state);
      } else {
        var preview = state.preview;
        if (!preview || preview.errors.length || preview.signature !== signature()) { state.preview = null; state.message = "The draft changed. Preview the CSV again before applying."; ctx.widget.querySelector("[data-csv-output]").innerHTML = previewHTML(ctx.kind, state); return true; }
        state.preview = null; state.message = "CSV applied to your draft. You can still edit entries manually."; state.open = false;
        if (ctx.kind === "results") { var index = bridge.data().records.indexOf(ctx.record); bridge.data().records[index] = preview.record; resultForms.set(preview.record, state); }
        else bridge.data().standings = preview.standings;
        bridge.applied(); bridge.toast("CSV applied to draft. Review and publish when ready.");
      }
      return true;
    }
    function input(event) {
      var target = event.target;
      if (target.matches("[data-csv-input]")) {
        var ctx = context(target); if (!ctx) return true;
        ctx.form.text = target.value; ctx.form.preview = null; ctx.form.message = "CSV changed. Preview it before applying.";
        ctx.widget.querySelector("[data-csv-output]").innerHTML = previewHTML(ctx.kind, ctx.form); return true;
      }
      if (target.matches("[data-standings-search]")) {
        var query = target.value.trim().toLowerCase();
        document.querySelectorAll("[data-standings-driver]").forEach(function (row) { row.hidden = !row.textContent.toLowerCase().includes(query) && !row.dataset.standingsDriver.toLowerCase().includes(query); }); return true;
      }
      if (target.matches("[data-standings-points]")) {
        var save = target.closest("tr").querySelector("[data-save-points]");
        save.disabled = !target.value.trim() || !Number.isSafeInteger(Number(target.value)) || Number(target.value) === Number(target.dataset.before);
        save.hidden = save.disabled; return true;
      }
      return false;
    }
    function dataChanged() {
      document.querySelectorAll("[data-csv-kind]").forEach(function (widget) {
        var ctx = context(widget);
        if (ctx && ctx.form.preview && ctx.form.preview.signature !== signature()) widget.querySelector("[data-csv-output]").innerHTML = previewHTML(ctx.kind, ctx.form);
      });
    }
    document.addEventListener("toggle", function (event) { if (event.target.isConnected && event.target.matches("[data-csv-kind]")) { var ctx = context(event.target); if (ctx) ctx.form.open = event.target.open; } }, true);
    return { results: results, standings: renderStandings, click: click, input: input, dataChanged: dataChanged, selectDivision: function (value) { if (["d1", "d2", "open"].includes(value)) division = value; } };
  };
})(typeof window !== "undefined" ? window : globalThis);
