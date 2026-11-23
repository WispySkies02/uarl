(function (root) {
  "use strict";

  root.UARLAdminImports = function (bridge) {
    var resultForms = new WeakMap(), standingForms = {}, division = "d1";
    var driverForm = { text: "", preview: null, open: true, message: "", reading: false, readVersion: 0, division: "d1" };
    var esc = bridge.esc, csv = root.UARLRaceCSV, standings = root.UARLStandings;
    var standingsLabels = csv.headers.standings.map(function (label, index) { return index === 1 ? "Change" : label; });
    function normalized() { return root.UARLData.normalize(JSON.parse(JSON.stringify(bridge.data()))); }
    function signature() { return JSON.stringify(bridge.data()); }
    function canEditDrivers() { return Boolean(bridge.canEditDrivers && bridge.canEditDrivers()); }
    function seriesLabel(value) { return value === "open" ? "Open Series" : "D1 · Cup"; }
    function previewStale(kind, state) { return state.preview && (state.preview.signature !== signature() || kind === "drivers" && state.preview.division !== state.division); }
    function form(kind, record) {
      if (kind === "drivers") return driverForm;
      if (kind === "results") {
        if (!resultForms.has(record)) resultForms.set(record, { text: "", preview: null, open: !(record.finishes || []).length, message: "" });
        return resultForms.get(record);
      }
      if (!standingForms[division]) standingForms[division] = { text: "", preview: null, open: true, message: "" };
      return standingForms[division];
    }
    function context(node) {
      var widget = node.closest("[data-csv-kind]"); if (!widget) return null;
      var kind = widget.dataset.csvKind;
      var record = kind === "results" ? bridge.data().records[Number(widget.dataset.record)] : null;
      if (kind === "results" && !record) return null;
      return { widget: widget, kind: kind, record: record, form: form(kind, record) };
    }
    function table(headers, rows, label) {
      return '<div class="csv-table-scroll" role="region" aria-label="' + esc(label) + '" tabindex="0"><table class="csv-table"><thead><tr>' + headers.map(function (header) { return '<th scope="col">' + esc(header) + '</th>'; }).join("") + '</tr></thead><tbody>' + rows.join("") + '</tbody></table></div>';
    }
    function cells(values) { return '<tr>' + values.map(function (value) { return '<td>' + esc(value == null ? "—" : value) + '</td>'; }).join("") + '</tr>'; }
    function standingsDriver(row, data) {
      var username = standings.username(data, row);
      return '<div class="driver-with-manufacturer"><div class="standings-driver-label"><strong>' + esc(row.name) + '</strong>' + (username ? '<small class="standings-username">@' + esc(username) + '</small>' : '') + '</div>' + root.UARLManufacturerBadges.badge(row.make) + '</div>';
    }
    function previewHTML(kind, state) {
      var preview = state.preview;
      if (!preview) return '<p class="csv-message" role="status">' + esc(state.message) + '</p>';
      if (preview.errors.length) return '<div class="csv-errors" role="alert"><b>Fix these before applying. Your draft has not changed.</b><ul>' + preview.errors.map(function (error) { return '<li>' + esc(error) + '</li>'; }).join("") + '</ul></div>';
      var stale = previewStale(kind, state), content;
      if (kind === "results") {
        content = table(["Finish", "Driver", "Car #", "Qual.", "Stage 1", "Stage 2", "Fastest lap", "Most led", "Points"], preview.rows.map(function (row, index) {
          var finish = preview.record.finishes[index];
          return cells([row.position, row.driver.name + (row.driver.user ? " · @" + row.driver.user : ""), finish.number || "—", row.qualifying, row.stage1, row.stage2, row.fastestLap ? "Yes" : "No", row.mostLapsLed ? "Yes" : "No", finish.totalPoints]);
        }), "Results CSV preview");
      } else if (kind === "drivers") {
        var actions = { add: state.division === "open" ? "Add to Open Series" : "Add to D1 roster", skip: "Skip existing driver" };
        content = table(["DriverName", "Username", "Driver#", "Team", "Action"], preview.rows.map(function (row) {
          return cells([row.name, "@" + row.username, row.number || "Number pending", row.teamName || "No team", (actions[row.action] || row.action) + (row.reason ? " · " + row.reason : "")]);
        }), "Driver roster CSV preview");
      } else {
        var data = normalized();
        content = table(standingsLabels, preview.rows.map(function (row) { return '<tr><td>' + esc(row.position) + '</td><td>' + standings.movementHTML(row.movement) + '</td><td>' + root.UARLStandingsArtwork.html(data, division, row) + '</td><td>' + standingsDriver(row, data) + '</td><td>' + esc(row.points) + '</td></tr>'; }), "Standings CSV preview");
      }
      var warnings = (preview.warnings || []).length ? '<div class="csv-warnings"><b>Review before applying</b><ul>' + preview.warnings.map(function (warning) { return '<li>' + esc(warning) + '</li>'; }).join("") + '</ul></div>' : '';
      var additions = kind === "drivers" ? preview.rows.filter(function (row) { return row.action !== "skip"; }).length : 0;
      var noChanges = kind === "drivers" && additions === 0;
      var label = kind === "results" ? preview.rows.length + ' finishers' : kind === "drivers" ? additions + ' to add · ' + (preview.rows.length - additions) + ' skipped' : preview.entries.length + ' updated drivers';
      var ready = noChanges ? 'No new drivers to add. Existing roster entries were skipped.' : kind === "drivers" ? 'Nothing applied yet. Check the new drivers, numbers, and teams, then save this preview to your draft. Skipped drivers stay unchanged.' : 'Nothing applied yet. Check the drivers and totals, then save this preview to your draft.';
      return '<div class="csv-preview" data-csv-preview><h4>Preview · ' + label + (kind === "drivers" ? ' · ' + seriesLabel(state.division) : '') + '</h4>' + content + warnings + '<p class="csv-message" data-csv-status role="status">' + (stale ? 'The draft changed after this preview. Preview the CSV again before applying.' : ready) + '</p><button type="button" class="button publish" data-csv-apply ' + (stale || noChanges ? 'disabled' : '') + '>Apply preview to draft</button></div>';
    }
    function widget(kind, record) {
      var state = form(kind, record), index = kind === "results" ? bridge.data().records.indexOf(record) : "";
      var instructions = kind === "results" ? 'Use a Roblox username, roster display name, or saved CSV name. Driver roster includes permanent drivers without a team. Qualifying and stage positions can be blank; both awards need Yes or No.' : 'Use the roster display name, saved CSV name, or username. Enter +/- as +2, -1, 0, or - for unknown. Car numbers keep leading zeros.';
      var replacement = kind === "results" ? 'Apply replaces this race’s finish order, qualifying, stages, and Yes/No awards. Manual car numbers and points eligibility are kept. Review DNFs or DNQs in manual entry afterward.' : 'Apply sets the listed drivers’ totals for this division; other drivers keep their current totals. Later race results continue adding points. Movement uses the previous positions supplied by this import.';
      var upload = "", teams = "", selector = "";
      if (kind === "drivers") {
        instructions = 'Choose the series, then paste rows or upload a CSV. Usernames identify drivers; saved former usernames work too. Drivers already on this roster and repeated CSV accounts are skipped. Car numbers keep leading zeros.';
        selector = '<label class="csv-series-picker">Import into<select data-driver-csv-division aria-label="Import drivers into series"><option value="d1" ' + (state.division === "d1" ? 'selected' : '') + '>D1 · Cup</option><option value="open" ' + (state.division === "open" ? 'selected' : '') + '>Open Series</option></select></label>';
        replacement = state.division === "open" ? 'Team is optional for Open Series. Leave it blank for an independent entry. Different drivers may share the same car number; each keeps their own identity, points, and artwork. A blank Driver# leaves a new entry’s number pending. D1 assignments stay intact. Set a new entry’s manufacturer in the Open Series editor after import.' : 'New D1 roster drivers need a team and an available car number, or a pending number. Enter an existing team name or ID. Occupied numbers are never assigned to another D1 driver. Existing roster entries stay unchanged; use the entry editor or team transfer tools to change them. Changes stay in your draft until you publish.';
        upload = '<label class="csv-file-picker">Upload a CSV file<input type="file" accept=".csv,text/csv" data-csv-file></label>';
        if (state.division === "d1") teams = '<details class="csv-team-reference"><summary>Available teams</summary><ul>' + (bridge.data().drivers.teams || []).map(function (team) { return '<li>' + esc(team.name) + (team.id ? ' · <code>' + esc(team.id) + '</code>' : '') + '</li>'; }).join("") + '</ul></details>';
      }
      return '<details class="csv-import" data-csv-kind="' + kind + '" data-record="' + index + '" ' + (state.open ? 'open' : '') + '><summary><span>Import ' + kind + ' from CSV</span><small>Paste → Preview → Apply</small></summary><div class="csv-import-body"><p>' + instructions + '</p>' + selector + upload + '<label>CSV data<textarea data-csv-input rows="5" wrap="off" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="' + esc(csv.headers[kind].join(",")) + '">' + esc(state.text) + '</textarea></label><p class="csv-header-hint">Header: <code>' + esc(csv.headers[kind].join(",")) + '</code></p><p>' + replacement + '</p>' + teams + '<button type="button" class="button" data-csv-preview-button>Preview CSV</button><div data-csv-output aria-live="polite">' + previewHTML(kind, state) + '</div></div></details>';
    }
    function results(record) { return widget("results", record); }
    function renderDrivers() { return canEditDrivers() ? widget("drivers") : ""; }
    function renderStandings() {
      var data = normalized(), rows = standings.calculate(data, division);
      var body = rows.map(function (row) {
        var correction = row.correction && row.correction.pointsAdjustment || 0;
        var details = correction ? '<details class="standings-correction"><summary>Correction ' + (correction > 0 ? '+' : '') + correction + '</summary><p>Race points: ' + row.rawPoints + '</p><button type="button" class="standings-reset" data-reset-points>Use race points</button></details>' : '';
        var editable = bridge.canEditArtwork && bridge.canEditArtwork() && root.UARLStandingsArtwork.resolve(bridge.data(), division, row).target;
        var artwork = editable ? '<button type="button" class="button ghost standings-artwork-button" data-standings-artwork="' + esc(row.id) + '" aria-label="Number art for ' + esc(row.name) + '">Number art</button>' : '';
        var username = standings.username(data, row);
        return '<tr data-standings-driver="' + esc(row.id) + '" data-standings-search-text="' + esc([row.name, row.id, row.number, username, '@' + username].join(' ')) + '"><td>' + row.position + '</td><td>' + standings.movementHTML(row.movement) + '</td><td>' + root.UARLStandingsArtwork.html(data, division, row) + '</td><td>' + standingsDriver(row, data) + artwork + '</td><td><div class="standings-points-control"><input type="number" step="1" data-standings-points data-before="' + row.points + '" value="' + row.points + '" aria-label="Points for ' + esc(row.name) + '"><button type="button" class="button ghost" data-save-points hidden disabled>Save</button></div>' + details + '</td></tr>';
      });
      return bridge.header({ title: "Standings", kicker: "Race Center", description: "Import a points table or correct a driver’s total. Race results continue to update these totals automatically." }) + '<div class="standings-editor"><nav class="standings-divisions" aria-label="Standings division">' + [["d1", "D1 · Cup"], ["open", "Open Series"], ["d2", "D2 · Archive"]].map(function (pair) { return '<button class="button ' + (pair[0] === division ? '' : 'ghost') + '" type="button" data-standings-division="' + pair[0] + '" ' + (pair[0] === division ? 'aria-current="page"' : '') + '>' + pair[1] + '</button>'; }).join("") + '</nav>' + widget("standings") + '<section class="standings-manual"><header><div><h2>Points table</h2><p>Change a total and press Save. It stays in your draft until you publish.</p></div><label>Find a driver<input type="search" data-standings-search placeholder="Name or car number"></label></header>' + (rows.length ? table(standingsLabels, body, "Edit standings points") : '<p class="editor-empty">Add drivers to this division or enter its first race results to start the standings.</p>') + '</section></div>';
    }
    function click(event) {
      var button = event.target.closest("[data-csv-preview-button],[data-csv-apply],[data-standings-division],[data-save-points],[data-reset-points],[data-standings-artwork]");
      if (!button) return false;
      var driverWidget = button.closest('[data-csv-kind="drivers"]');
      if (driverWidget && !canEditDrivers()) { bridge.toast("Only Owners and Admins can import drivers.", true); return true; }
      if (button.dataset.standingsDivision) { division = button.dataset.standingsDivision; bridge.render(); return true; }
      bridge.commit();
      if (button.dataset.standingsArtwork) { if (bridge.editArtwork) bridge.editArtwork(division, button.dataset.standingsArtwork); return true; }
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
      if (state.reading) { bridge.toast("Wait for the CSV file to finish loading.", true); return true; }
      if (button.matches("[data-csv-preview-button]")) {
        var data = normalized();
        state.preview = ctx.kind === "results" ? csv.results(state.text, data, ctx.record) : ctx.kind === "drivers" ? root.UARLDriverCSV.preview(state.text, data, state.division) : csv.standings(state.text, data, division);
        if (!state.preview.errors.length && ctx.kind === "results") bridge.recalculate(state.preview.record);
        state.preview.signature = signature();
        ctx.widget.querySelector("[data-csv-output]").innerHTML = previewHTML(ctx.kind, state);
      } else {
        var preview = state.preview;
        if (!preview || preview.errors.length || previewStale(ctx.kind, state)) { state.preview = null; state.message = "The draft or selected series changed. Preview the CSV again before applying."; ctx.widget.querySelector("[data-csv-output]").innerHTML = previewHTML(ctx.kind, state); return true; }
        if (ctx.kind === "drivers") {
          var additions = preview.rows.filter(function (row) { return row.action !== "skip"; });
          if (!additions.length) { bridge.toast("No new drivers to add. Existing roster entries were skipped."); return true; }
          try { bridge.replaceDrivers(preview.drivers, additions, preview.division); }
          catch (error) { bridge.toast(error.message, true); return true; }
        }
        state.preview = null; state.message = "CSV applied to your draft. You can still edit entries manually."; state.open = false;
        if (ctx.kind === "results") { var index = bridge.data().records.indexOf(ctx.record); bridge.data().records[index] = preview.record; resultForms.set(preview.record, state); }
        else if (ctx.kind === "standings") bridge.data().standings = preview.standings;
        bridge.applied(); bridge.toast("CSV applied to draft. Review and publish when ready.");
      }
      return true;
    }
    function input(event) {
      var target = event.target;
      if (target.matches("[data-driver-csv-division]")) {
        if (!canEditDrivers()) return true;
        if (!["d1", "open"].includes(target.value)) { target.value = driverForm.division; return true; }
        bridge.commit();
        driverForm.division = target.value; driverForm.preview = null; driverForm.message = 'Series changed to ' + seriesLabel(target.value) + '. Preview the CSV before applying.';
        bridge.render();
        var selector = document.querySelector('[data-driver-csv-division]'); if (selector) selector.focus({ preventScroll: true });
        return true;
      }
      if (target.matches("[data-csv-file]")) {
        var fileContext = context(target); if (!fileContext || fileContext.kind !== "drivers" || !canEditDrivers()) return true;
        var file = target.files[0]; if (!file) return true;
        var state = fileContext.form, version = ++state.readVersion;
        state.reading = true; state.preview = null; state.message = "Loading CSV file…";
        fileContext.widget.querySelector("[data-csv-output]").innerHTML = previewHTML("drivers", state);
        file.text().then(function (source) {
          if (state.readVersion !== version) return;
          state.text = source; state.reading = false; state.message = "Loaded " + file.name + ". Preview the CSV before applying.";
          var current = document.querySelector('[data-csv-kind="drivers"]');
          if (current && canEditDrivers()) { current.querySelector("[data-csv-input]").value = source; current.querySelector("[data-csv-output]").innerHTML = previewHTML("drivers", state); }
        }).catch(function () {
          if (state.readVersion !== version) return;
          state.reading = false; state.message = "Could not read this CSV file. Try again or paste the data.";
          var current = document.querySelector('[data-csv-kind="drivers"]');
          if (current && canEditDrivers()) current.querySelector("[data-csv-output]").innerHTML = previewHTML("drivers", state);
        });
        target.value = ""; return true;
      }
      if (target.matches("[data-csv-input]")) {
        var ctx = context(target); if (!ctx) return true;
        if (ctx.kind === "drivers" && !canEditDrivers()) return true;
        if (ctx.kind === "drivers") { ctx.form.readVersion++; ctx.form.reading = false; }
        ctx.form.text = target.value; ctx.form.preview = null; ctx.form.message = "CSV changed. Preview it before applying.";
        ctx.widget.querySelector("[data-csv-output]").innerHTML = previewHTML(ctx.kind, ctx.form); return true;
      }
      if (target.matches("[data-standings-search]")) {
        var query = target.value.trim().toLowerCase();
        document.querySelectorAll("[data-standings-driver]").forEach(function (row) { row.hidden = !(row.dataset.standingsSearchText || row.textContent).toLowerCase().includes(query) && !row.dataset.standingsDriver.toLowerCase().includes(query); }); return true;
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
        if (ctx && previewStale(ctx.kind, ctx.form)) widget.querySelector("[data-csv-output]").innerHTML = previewHTML(ctx.kind, ctx.form);
      });
    }
    document.addEventListener("toggle", function (event) { if (event.target.isConnected && event.target.matches("[data-csv-kind]")) { var ctx = context(event.target); if (ctx) ctx.form.open = event.target.open; } }, true);
    return { results: results, drivers: renderDrivers, standings: renderStandings, click: click, input: input, dataChanged: dataChanged, selectDivision: function (value) { if (["d1", "d2", "open"].includes(value)) division = value; } };
  };
})(typeof window !== "undefined" ? window : globalThis);
