(function (root) {
  "use strict";

  var headers = { results: ["FinishingPosition", "Driver", "Qualifying", "Stage1", "Stage2", "FastestLap", "MostLapsLed"], standings: ["Position", "+/-", "Driver#", "DriverName", "Points"], drivers: ["DriverName", "Username", "Driver#", "Team"] };
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
    if (!errors.length && rows.length < 2 && kind !== "standings") errors.push("Add at least one driver below the header.");
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
  function standingsDriver(data, candidates, division, value, carNumber, pinned) {
    var label = text(value).replace(/^@/, "");
    if (root.UARLResultDrivers && root.UARLResultDrivers.confirmedStandingsUsername) label = text(root.UARLResultDrivers.confirmedStandingsUsername(data, label)).replace(/^@/, "");
    var id = identity(label), profiles = data.drivers && data.drivers.profiles || {};
    if (!id || /^(?:undefined|null)$/i.test(label)) return { error: "DriverName must contain a driver name or username." };
    function array(value) { return Array.isArray(value) ? value : []; }
    function canonical(user) { return root.UARLResultDrivers ? root.UARLResultDrivers.canonicalUser(data, user) : user; }
    function local(user) { return candidates.find(function (driver) { return identity(canonical(driver.id)) === identity(canonical(user)); }); }
    function rosterDriver(driver) {
      var user = canonical(driver.user);
      return local(user) || { id: user, name: text(driver.name) || user, number: "", division: division, team: "Independent entry", make: "Unlisted", rawPoints: 0 };
    }
    function profileDriver(user) {
      var saved = profiles[user] || {}, roster = globalRoster.find(function (driver) { return identity(canonical(driver.user)) === identity(canonical(user)); });
      return local(user) || (roster ? rosterDriver(roster) : { id: user, name: text(saved.alias) || user, number: "", division: division, team: "Independent entry", make: "Unlisted", rawPoints: 0 });
    }
    function distinct(rows) {
      var seen = new Set();
      return rows.filter(function (driver) {
        var key = identity(canonical(driver.id));
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
    }
    var keys = Object.keys(profiles);
    // Read both rosters without registering profiles or changing eligibility.
    var globalRoster = root.UARLResultDrivers && root.UARLResultDrivers.pool ? root.UARLResultDrivers.pool(data, { division: "d1" }).concat(root.UARLResultDrivers.pool(data, { division: "open" })).filter(function (driver) { return Boolean(text(driver.user)); }) : [];
    if (pinned != null) {
      if (typeof pinned !== "string" || !identity(pinned)) return { error: "The saved preview identity is invalid. Preview the CSV again." };
      var pinnedUser = canonical(pinned), pinnedDriver = local(pinnedUser), profileKey = keys.find(function (key) { return identity(key) === identity(pinnedUser); });
      if (!pinnedDriver && profileKey) pinnedDriver = profileDriver(profileKey);
      if (!pinnedDriver) {
        if (!/^[A-Za-z0-9_]{3,20}$/.test(pinnedUser) && !identity(pinnedUser).startsWith("standings:" + division + ":")) return { error: "The saved preview identity is invalid. Preview the CSV again." };
        pinnedDriver = { id: pinnedUser, name: label, number: "", division: division, team: "Independent entry", make: "Unlisted", rawPoints: 0 };
      }
      return { driver: pinnedDriver, usernameMatch: false, pinned: true };
    }
    // A verified account takes priority over a different driver's display name.
    var exact = distinct(candidates.filter(function (driver) { return identity(driver.id) === id; }).concat(globalRoster.filter(function (driver) { return identity(driver.user) === id; }).map(rosterDriver), keys.filter(function (key) { return identity(key) === id; }).map(profileDriver)));
    if (exact.length === 1) return { driver: exact[0], usernameMatch: true };
    var handles = distinct(globalRoster.filter(function (driver) {
      return array(driver.usernameAliases).some(function (handle) { return identity(handle) === id; });
    }).map(rosterDriver).concat(keys.filter(function (key) {
      var saved = profiles[key] || {};
      return [saved.currentUsername].concat(array(saved.usernameAliases)).some(function (handle) { return identity(handle) === id; });
    }).map(profileDriver)));
    if (exact.length > 1 || handles.length > 1) return { error: "That username matches more than one saved account. Use the driver's original username." };
    if (handles.length === 1) return { driver: handles[0], usernameMatch: true };
    var profileNames = keys.filter(function (key) {
      var saved = profiles[key] || {};
      return [saved.alias].concat(array(saved.csvAliases)).some(function (name) { return identity(name) === id; });
    });
    // Match the selected series before consulting profiles from other series.
    // Two different drivers may use the same public name in D1 and Open.
    var named = distinct(candidates.filter(function (driver) {
      return identity(driver.name) === id || array(driver.aliases).includes(id);
    }).concat(profileNames.filter(function (key) { return Boolean(local(key)); }).map(profileDriver)));
    var hadNameMatches = named.length > 0;
    // Number disambiguation is valid only against entries in this series. A
    // number from a different series must not select a different account.
    if (named.length > 1 && carNumber && named.every(function (driver) { return Boolean(local(driver.id)); })) named = named.filter(function (driver) { return text(driver.number) === carNumber; });
    if (named.length === 1) return { driver: named[0], usernameMatch: array(named[0].correction && named[0].correction.csvAliases).some(function (alias) { return identity(alias) === id; }) };
    if (hadNameMatches) return { error: "That name matches more than one driver. Use their Roblox username to keep their points separate." };
    var former = distinct(globalRoster.filter(function (driver) {
      return identity(driver.name) === id || array(driver.aliases).includes(id);
    }).map(rosterDriver).concat(profileNames.map(profileDriver)));
    if (former.length === 1) return { driver: former[0], usernameMatch: false };
    if (former.length > 1) return { error: "That name matches more than one driver. Use their Roblox username to keep their points separate." };
    // Posted standings may include former drivers without any current profile.
    // Name-only entries use their own namespace so a later roster name match
    // cannot silently absorb another person's saved total.
    var user = /^[A-Za-z0-9_]{3,20}$/.test(label) ? label : "standings:" + division + ":" + encodeURIComponent(id.replace(/\s+/g, " "));
    return { driver: local(user) || { id: user, name: label, number: "", division: division, team: "Independent entry", make: "Unlisted", rawPoints: 0 }, usernameMatch: user === label };
  }
  function results(source, data, record) {
    var parsed = parse(source, "results"), errors = parsed.errors, candidates = root.UARLResultDrivers.pool(data, record), seen = [new Set(), new Set(), new Set(), new Set()], drivers = new Set();
    var rows = parsed.rows.map(function (row) {
      var c = row.cells, driver = resolve(candidates, c[1]);
      if (!driver) errors.push("Line " + row.line + ": “" + c[1] + "” is unknown or ambiguous in this division. Use a Roblox username or saved CSV name from Driver roster.");
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
  function replaceStandingsIdentities(data, division, entries, replacements, errors) {
    function array(value) { return Array.isArray(value) ? value : []; }
    function canonical(user) { return identity(root.UARLResultDrivers ? root.UARLResultDrivers.canonicalUser(data, user) : user); }
    function refers(entry, user) {
      return Boolean(entry && [entry.user, entry.username, entry.driverId, entry.id, entry.driverUsername].some(function (value) { return text(value) && canonical(value) === user; }));
    }
    function rosterRefers(roster, user) {
      roster = roster || {};
      return Object.keys(roster.profiles || {}).some(function (key) {
        var saved = roster.profiles[key] || {};
        return [key, saved.currentUsername].concat(array(saved.usernameAliases)).some(function (value) { return text(value) && canonical(value) === user; });
      }) ||
        array(roster.teams).some(function (team) { return array(team.entries).concat(array(team.pendingDrivers)).some(function (entry) { return refers(entry, user); }); }) ||
        array(roster.openEntries).concat(array(roster.freeAgents), array(roster.archivedDrivers)).some(function (entry) { return refers(entry, user); });
    }
    function hasDriverHistory(user) {
      var roster = data.drivers || {};
      if (rosterRefers(roster, user) || rosterRefers(roster.previousRoster, user) || array(data.race && data.race.drivers).some(function (entry) { return refers(entry, user); })) return true;
      return array(data.records).some(function (record) {
        if ([record.winnerUsername, record.poleUsername].some(function (value) { return text(value) && canonical(value) === user; })) return true;
        var participants = array(record.entries).concat(array(record.finishes), array(record.qualifying), array(record.bonuses));
        array(record.stages).forEach(function (stage) { participants = participants.concat(array(stage.results)); });
        return participants.some(function (entry) { return refers(entry, user); });
      });
    }
    var imported = new Set(entries.map(function (entry) { return canonical(entry.username); })), selected = new Map(), removable = new Map();
    array(replacements).forEach(function (replacement) {
      if (!replacement || typeof replacement.from !== "string" || typeof replacement.to !== "string" || !identity(replacement.from) || !identity(replacement.to)) {
        errors.push("A selected driver correction is invalid. Check the preview again."); return;
      }
      var from = canonical(replacement.from), to = canonical(replacement.to);
      if (from === to) return;
      if (!imported.has(to)) { errors.push("The replacement driver must be included in this preview. Check the selected driver again."); return; }
      if (selected.has(from) && selected.get(from) !== to) { errors.push("A standings entry cannot be replaced by two different drivers in the same preview."); return; }
      selected.set(from, to);
      // An explicit preview choice can remove a mistaken standings-only entry.
      // Roster identities and recorded race history are never deleted or merged.
      if (!imported.has(from) && !hasDriverHistory(from)) {
        removable.set(from, replacement.from);
        var target = entries.find(function (entry) { return canonical(entry.username) === to; });
        var aliases = array(target.csvAliases).slice();
        array(data.standings).filter(function (entry) { return entry.division === division && canonical(entry.username) === to; }).forEach(function (entry) { aliases = aliases.concat(array(entry.csvAliases)); });
        if (typeof replacement.alias === "string") aliases.push(replacement.alias);
        if (/^[A-Za-z0-9_]{3,20}$/.test(text(replacement.from).replace(/^@/, ""))) aliases.push(replacement.from);
        array(data.standings).filter(function (entry) { return entry.division === division && canonical(entry.username) === from; }).forEach(function (entry) { aliases = aliases.concat([entry.name], array(entry.csvAliases)); });
        var prefix = "standings:" + division + ":";
        if (identity(replacement.from).startsWith(prefix)) {
          try { aliases.push(decodeURIComponent(text(replacement.from).replace(/^@/, "").slice(prefix.length))); } catch (error) { /* A malformed legacy ID is not a lookup name. */ }
        }
        var seen = new Set();
        aliases = aliases.filter(function (alias) {
          if (typeof alias !== "string" || !identity(alias) || /^(?:undefined|null)$/i.test(text(alias))) return false;
          var key = identity(alias);
          if (key === to || seen.has(key)) return false;
          seen.add(key); return true;
        }).map(text);
        if (aliases.length) target.csvAliases = aliases;
      }
    });
    var replaced = new Set();
    var saved = array(data.standings).filter(function (entry) {
      var user = canonical(entry.username);
      if (entry.division !== division || !removable.has(user)) return true;
      replaced.add(removable.get(user)); return false;
    });
    return { data: Object.assign({}, data, { standings: saved }), replacedIdentities: Array.from(replaced) };
  }
  function standings(source, data, division, options) {
    var parsed = parse(source, "standings"), errors = parsed.errors, candidates = root.UARLStandings.calculate(data, division, { allDrivers: true }), positions = new Set(), drivers = new Set(), entries = [], resolvedRows = [];
    var identities = options && Array.isArray(options.identities) ? options.identities : [];
    parsed.rows.forEach(function (row, index) {
      var c = row.cells, position = positive(c[0], "Position", row.line, errors), match = standingsDriver(data, candidates, division, c[3], c[2], identities[index]), driver = match.driver;
      resolvedRows.push(driver ? { id: driver.id, name: match.usernameMatch ? driver.name : c[3], number: match.pinned ? c[2] : c[2] || text(driver.number) } : null);
      unique(position, positions, "position", row.line, errors);
      if (!driver) errors.push("Line " + row.line + ": " + (match.error || "Enter a driver name or username."));
      if (driver) unique(identity(driver.id), drivers, "driver", row.line, errors);
      if (c[2] && !/^\d{1,3}$/.test(c[2])) errors.push("Line " + row.line + ": Driver# must contain one to three digits, or be blank while the number is pending (leading zeros are kept).");
      var unknownMovement = /^(?:-|—)?$/.test(c[1]), delta = unknownMovement ? null : Number(c[1]);
      if (!unknownMovement && (!/^[+-]?\d+$/.test(c[1]) || !Number.isSafeInteger(delta))) errors.push("Line " + row.line + ": +/- must be a signed whole number, 0, or - for unknown.");
      if (delta != null && position != null && (!Number.isSafeInteger(position + delta) || position + delta < 1)) errors.push("Line " + row.line + ": +/- must imply a valid previous position of 1 or higher.");
      var points = Number(c[4]);
      if (!/^-?\d+$/.test(c[4]) || !Number.isSafeInteger(points)) errors.push("Line " + row.line + ": Points must be a whole number.");
      if (driver && position && Number.isSafeInteger(points)) {
        try { entries.push(root.UARLStandings.correction(driver, points, { name: match.usernameMatch ? driver.name : c[3], number: match.pinned ? c[2] : c[2] || text(driver.number), previousPosition: delta == null ? null : position + delta, order: position })); }
        catch (error) { errors.push("Line " + row.line + ": " + error.message); }
      }
    });
    var inputRows = parsed.rows.map(function (row) { return row.cells.slice(); });
    if (errors.length) return { errors: errors, entries: [], rows: [], inputRows: inputRows, resolvedRows: resolvedRows, replacedIdentities: [] };
    var replacement = replaceStandingsIdentities(data, division, entries, options && options.replacements, errors);
    if (errors.length) return { errors: errors, entries: [], rows: [], inputRows: inputRows, resolvedRows: resolvedRows, replacedIdentities: [] };
    var saved = (Array.isArray(replacement.data.standings) ? replacement.data.standings : []).filter(function (entry) { return entry.division !== division; }).concat(entries);
    var tables = clone(data.standingsTables || {}), next = Object.assign({}, data, { standings: saved, standingsTables: tables });
    tables[division] = root.UARLStandings.snapshot(next, division, entries.map(function (entry) { return entry.username; }));
    var rows = root.UARLStandings.calculate(next, division);
    entries.forEach(function (entry) {
      var row = rows.find(function (row) { return identity(row.id) === identity(entry.username); });
      if (!row || row.position !== entry.order) errors.push(entry.name + ": Position " + entry.order + " would be " + (row ? row.position : "unavailable") + " at these points. Check totals and include any drivers above them.");
    });
    return { errors: errors, entries: entries, rows: rows, standings: saved, standingsTables: tables, inputRows: inputRows, resolvedRows: resolvedRows, replacedIdentities: replacement.replacedIdentities };
  }
  root.UARLRaceCSV = { headers: headers, parse: parse, results: results, standings: standings };
})(typeof window !== "undefined" ? window : globalThis);
