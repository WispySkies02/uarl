(function (root) {
  "use strict";

  var headers = { results: ["FinishingPosition", "Driver", "Qualifying", "Stage1", "Stage2", "FastestLap", "MostLapsLed"], standings: ["Position", "+/-", "Driver#", "DriverName", "Points"] };
  function text(value) { return String(value == null ? "" : value).trim(); }
  function identity(value) { return text(value).replace(/^@/, "").toLowerCase(); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function parse(source, kind) {
    var input = String(source || "").replace(/^\uFEFF/, ""), rows = [], cells = [], value = "", quoted = false, closed = false, line = 1, rowLine = 1, errors = [];
    function cell() { cells.push(text(value)); value = ""; closed = false; }
    function row() { cell(); if (cells.some(Boolean)) rows.push({ line: rowLine, cells: cells }); cells = []; }
    for (var i = 0; i < input.length; i++) {
      var char = input[i];
      if (quoted) {
        if (char === '"' && input[i + 1] === '"') { value += '"'; i++; }
        else if (char === '"') { quoted = false; closed = true; }
        else { value += char; if (char === "\n") line++; }
      } else if (char === '"') {
        if (text(value) || closed) { errors.push("Line " + line + ": unexpected quote. Quote the entire field and double any quotes inside it."); break; }
        value = ""; quoted = true;
      } else if (char === ",") cell();
      else if (char === "\n" || char === "\r") {
        row(); if (char === "\r" && input[i + 1] === "\n") i++; line++; rowLine = line;
      } else if (closed && /\S/.test(char)) { errors.push("Line " + line + ": unexpected text after a quoted field."); break; }
      else if (!closed) value += char;
    }
    if (quoted) errors.push("Line " + rowLine + ": a quoted field is missing its closing quote.");
    if (!errors.length && (value || cells.length || closed)) row();
    var expected = headers[kind];
    if (!errors.length && (!rows.length || rows[0].cells.length !== expected.length || rows[0].cells.some(function (cell, index) { return cell.toLowerCase() !== expected[index].toLowerCase(); }))) errors.push("Use this exact header: " + expected.join(","));
    if (!errors.length) rows.slice(1).forEach(function (row) { if (row.cells.length !== expected.length) errors.push("Line " + row.line + ": expected " + expected.length + " columns, found " + row.cells.length + ". Put names containing commas inside double quotes."); });
    if (!errors.length && rows.length < 2) errors.push("Add at least one driver below the header.");
    return { rows: errors.length ? [] : rows.slice(1), errors: errors };
  }
  function positive(value, label, line, errors, optional) {
    if (optional && value === "") return null;
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) { errors.push("Line " + line + ": " + label + " must be a positive whole number" + (optional ? " or blank." : ".")); return null; }
    return Number(value);
  }
  function flag(value, label, line, errors) {
    if (!/^(yes|no)$/i.test(value)) errors.push("Line " + line + ": " + label + " must be Yes or No.");
    return /^yes$/i.test(value);
  }
  function unique(value, seen, label, line, errors) {
    if (value == null) return;
    if (seen.has(value)) errors.push("Line " + line + ": duplicate " + label + " (" + value + ").");
    seen.add(value);
  }
  function resolve(candidates, value, number) {
    if (!identity(value)) return null;
    var exact = candidates.filter(function (driver) { return identity(driver.user || driver.id) === identity(value); });
    if (exact.length === 1) return exact[0];
    var named = candidates.filter(function (driver) { return identity(driver.name) === identity(value) || (driver.aliases || []).includes(identity(value)); });
    if (named.length > 1 && number) named = named.filter(function (driver) { return text(driver.number) === number; });
    return named.length === 1 ? named[0] : null;
  }
  function results(source, data, record) {
    var parsed = parse(source, "results"), errors = parsed.errors, candidates = root.UARLResultDrivers.pool(data, record), seen = [new Set(), new Set(), new Set(), new Set()], drivers = new Set();
    var rows = parsed.rows.map(function (row) {
      var c = row.cells, driver = resolve(candidates, c[1]);
      if (!driver) errors.push("Line " + row.line + ": “" + c[1] + "” is unknown or ambiguous. Use the Roblox username, or add a guest to this race first.");
      if (driver) unique(driver.key, drivers, "driver", row.line, errors);
      var positions = [positive(c[0], "FinishingPosition", row.line, errors), positive(c[2], "Qualifying", row.line, errors, true), positive(c[3], "Stage1", row.line, errors, true), positive(c[4], "Stage2", row.line, errors, true)];
      positions.forEach(function (value, index) { unique(value, seen[index], ["finishing position", "qualifying position", "Stage 1 position", "Stage 2 position"][index], row.line, errors); });
      return { driver: driver, position: positions[0], qualifying: positions[1], stage1: positions[2], stage2: positions[3], fastestLap: flag(c[5], "FastestLap", row.line, errors), mostLapsLed: flag(c[6], "MostLapsLed", row.line, errors) };
    });
    if (rows.length && !seen[0].has(1)) errors.push("Include finishing position 1 so the race has a winner.");
    if (errors.length) return { errors: errors, rows: [] };
    rows.sort(function (a, b) { return a.position - b.position; });
    var next = clone(record), oldFinishes = record.finishes || [];
    function previous(driver) {
      return oldFinishes.find(function (finish) { var found = root.UARLResultDrivers.resolve(candidates, finish.name, finish.username || finish.user || finish.driverId, finish.number); return found && found.key === driver.key; });
    }
    function entry(row, position) {
      var driver = row.driver, old = previous(driver);
      var username = driver.user || ("guest:" + (record.division || "series") + ":" + identity(driver.name).replace(/[^a-z0-9]+/g, "-"));
      return { position: position, name: driver.name, username: username, number: old && old.numberManual === true ? text(old.number) : driver.number, numberManual: Boolean(old && old.numberManual === true) };
    }
    function classification(column) { return rows.filter(function (row) { return row[column] != null; }).map(function (row) { return entry(row, row[column]); }).sort(function (a, b) { return a.position - b.position; }); }
    next.finishes = rows.map(function (row) {
      var eligible = (record.entries || []).find(function (guest) { return identity(guest.user || guest.driverId) === identity(row.driver.user); });
      var old = previous(row.driver);
      return Object.assign(entry(row, row.position), { resultStatus: "Finish", pointsEligible: (!eligible || eligible.pointsEligible !== false) && (!old || old.pointsEligible !== false) });
    });
    next.qualifying = classification("qualifying");
    next.stages = ["stage1", "stage2"].map(function (column, index) { return { name: "Stage " + (index + 1), results: classification(column) }; }).filter(function (stage) { return stage.results.length; });
    next.bonuses = (record.bonuses || []).filter(function (bonus) { return !["Fastest lap", "Most laps led"].includes(bonus.name) && rows.some(function (row) { return identity(row.driver.user) === identity(bonus.driverUsername); }); }).map(clone);
    rows.forEach(function (row) {
      [["fastestLap", "Fastest lap"], ["mostLapsLed", "Most laps led"]].forEach(function (award) {
        if (row[award[0]]) { var participant = entry(row, row.position); next.bonuses.push({ name: award[1], driver: participant.name, driverUsername: participant.username, number: participant.number, points: 0 }); }
      });
    });
    var pole = next.qualifying.find(function (entry) { return entry.position === 1; });
    next.pole = pole ? pole.name : ""; next.poleUsername = pole ? pole.username : "";
    next.winnerAutomatic = true; next.winner = next.finishes[0].name; next.winnerUsername = next.finishes[0].username;
    return { errors: [], rows: rows, record: next };
  }
  function standings(source, data, division) {
    var parsed = parse(source, "standings"), errors = parsed.errors, candidates = root.UARLStandings.calculate(data, division), positions = new Set(), drivers = new Set(), entries = [];
    parsed.rows.forEach(function (row) {
      var c = row.cells, position = positive(c[0], "Position", row.line, errors), driver = resolve(candidates, c[3], c[2]);
      unique(position, positions, "position", row.line, errors);
      if (!driver) errors.push("Line " + row.line + ": “" + c[3] + "” does not identify one driver in this division. Use their roster name or username; same-name drivers need the matching car number.");
      if (driver) unique(identity(driver.id), drivers, "driver", row.line, errors);
      if (!/^\d{1,3}$/.test(c[2])) errors.push("Line " + row.line + ": Driver# must contain one to three digits (leading zeros are kept).");
      var unknownMovement = /^(?:-|—)?$/.test(c[1]), delta = unknownMovement ? null : Number(c[1]);
      if (!unknownMovement && (!/^[+-]?\d+$/.test(c[1]) || !Number.isSafeInteger(delta))) errors.push("Line " + row.line + ": +/- must be a signed whole number, 0, or - for unknown.");
      if (delta != null && position != null && (!Number.isSafeInteger(position + delta) || position + delta < 1)) errors.push("Line " + row.line + ": +/- must imply a valid previous position of 1 or higher.");
      var points = Number(c[4]);
      if (!/^-?\d+$/.test(c[4]) || !Number.isSafeInteger(points)) errors.push("Line " + row.line + ": Points must be a whole number.");
      if (driver && position && Number.isSafeInteger(points)) {
        try { entries.push(root.UARLStandings.correction(driver, points, { name: c[3].replace(/^@/, "").toLowerCase() === identity(driver.id) ? driver.name : c[3], number: c[2], previousPosition: delta == null ? null : position + delta, order: position })); }
        catch (error) { errors.push("Line " + row.line + ": " + error.message); }
      }
    });
    if (errors.length) return { errors: errors, entries: [], rows: [] };
    var saved = root.UARLStandings.merge(data, entries), rows = root.UARLStandings.calculate(Object.assign({}, data, { standings: saved }), division);
    entries.forEach(function (entry) {
      var row = rows.find(function (row) { return identity(row.id) === identity(entry.username); });
      if (row.position !== entry.order) errors.push(entry.name + ": Position " + entry.order + " would be " + row.position + " at these points. Check totals and include any drivers above them.");
    });
    return { errors: errors, entries: entries, rows: rows, standings: saved };
  }
  root.UARLRaceCSV = { headers: headers, parse: parse, results: results, standings: standings };
})(typeof window !== "undefined" ? window : globalThis);
