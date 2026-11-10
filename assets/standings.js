(function (root) {
  "use strict";

  function text(value) { return String(value == null ? "" : value).trim(); }
  function identity(value) { return text(value).replace(/^@/, "").toLowerCase(); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function number(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
  function hasName(value) { return typeof value === "string" && text(value) && !/^(undefined|null)$/i.test(text(value)); }
  function key(division, username) { return division + ":" + identity(username); }
  function matchingDriver(rows, entry) {
    var id = identity(entry.username || entry.user || entry.driverId || entry.id), name = identity(entry.name), car = text(entry.number);
    var exact = id && rows.find(function (row) { return identity(row.id) === id; });
    if (exact) return exact;
    if ((!id || /^guest:/.test(id)) && name) {
      var named = rows.filter(function (row) { return identity(row.name) === name || identity(row.id) === name || array(row.aliases).includes(name); });
      if (named.length === 1) return named[0];
    }
    if (!id && !name && car) {
      var numbered = rows.filter(function (row) { return text(row.number) === car; });
      if (numbered.length === 1) return numbered[0];
    }
    return null;
  }
  function scoredRecords(data, division) {
    return array(data.records).filter(function (record) { return record.division === division && record.pointsEvent !== false && !record.exhibition; });
  }
  function roster(data, division, records) {
    var all = array(data.race && data.race.drivers), rows = [];
    if (root.UARLResultDrivers && division !== "d2") root.UARLResultDrivers.pool(data, { division: division }).forEach(function (entry) {
      if (!entry.user) return;
      if (all.some(function (driver) { return driver.division === division && identity(driver.id) === identity(entry.user); })) {
        all = all.map(function (driver) { return driver.division === division && identity(driver.id) === identity(entry.user) ? Object.assign({}, driver, { aliases: entry.aliases }) : driver; });
      } else all = all.concat({ id: entry.user, name: entry.name, number: entry.number, division: division, team: entry.team, make: "Unlisted", aliases: entry.aliases, careerWins: 0, careerTitles: 0, careerRank: 0 });
    });
    all.filter(function (driver) { return driver.division === division && (division !== "d2" || driver.status === "FT"); }).forEach(function (driver) {
      if (!matchingDriver(rows, driver)) rows.push(Object.assign({}, driver));
    });
    if (division !== "d2") records.forEach(function (record) {
      array(record.finishes).forEach(function (finish) {
        if (matchingDriver(rows, finish)) return;
        var known = matchingDriver(all, finish), id = finish.username || finish.user || finish.driverId || (known && known.id) || ("guest:" + division + ":" + identity(finish.name || finish.number));
        rows.push({ id: id, name: finish.name || (known && known.name) || id, number: text(finish.number || (known && known.number)), division: division, team: finish.team || (known && known.team) || "Independent entry", make: finish.make || (known && known.make) || "Unlisted", careerWins: known ? known.careerWins : 0, careerTitles: known ? known.careerTitles : 0, careerRank: known ? known.careerRank : 0 });
      });
    });
    // Keep imported totals for former entrants, even if their roster seat changes.
    if (division !== "d2") array(data.standings).filter(function (row) { return row.division === division; }).forEach(function (saved) {
      if (!matchingDriver(rows, saved)) rows.push({ id: saved.username, name: saved.name, number: saved.number, division: division, team: "Independent entry", make: "Unlisted", careerWins: 0, careerTitles: 0, careerRank: 0 });
    });
    return rows;
  }
  function score(data, division, records) {
    var corrections = array(data.standings).filter(function (row) { return row.division === division; });
    var rows = roster(data, division, scoredRecords(data, division)).map(function (driver) {
      return Object.assign({}, driver, { name: hasName(driver.name) ? driver.name : text(driver.id) || "Driver pending", rawPoints: 0, points: 0, stagePoints: 0, starts: 0, wins: 0, top5: 0, top10: 0, poles: 0, stageWins: 0, finishTotal: 0, averageFinish: null, pointsPending: false });
    });
    records.forEach(function (record) {
      array(record.finishes).forEach(function (finish) {
        var row = matchingDriver(rows, finish);
        if (!row) return;
        var position = number(finish.finish || finish.position);
        row.rawPoints += number(finish.points) + number(finish.stagePoints);
        row.stagePoints += number(finish.stagePoints);
        row.pointsPending = row.pointsPending || Boolean(finish.pointsPending);
        row.starts++;
        row.wins += position === 1 ? 1 : 0;
        row.top5 += position > 0 && position <= 5 ? 1 : 0;
        row.top10 += position > 0 && position <= 10 ? 1 : 0;
        row.poles += finish.pole ? 1 : 0;
        row.stageWins += number(finish.stageWins);
        row.finishTotal += position;
        row.averageFinish = row.finishTotal / row.starts;
      });
    });
    rows.forEach(function (row) {
      var saved = corrections.find(function (entry) { return identity(entry.username) === identity(row.id); });
      row.correction = saved || null;
      row.points = row.rawPoints + number(saved && saved.pointsAdjustment);
      if (saved && saved.nameManual && hasName(saved.name)) row.name = saved.name;
      if (saved && saved.numberManual) row.number = saved.number;
    });
    rows.sort(function (a, b) {
      var orderA = a.correction && a.correction.orderManual ? a.correction.order : Number.MAX_SAFE_INTEGER, orderB = b.correction && b.correction.orderManual ? b.correction.order : Number.MAX_SAFE_INTEGER;
      return b.points - a.points || orderA - orderB || b.wins - a.wins || b.top5 - a.top5 || a.name.localeCompare(b.name);
    });
    rows.forEach(function (row, index) { row.position = index + 1; });
    return rows;
  }
  function calculate(data, division) {
    var records = scoredRecords(data, division), rows = score(data, division, records);
    var chronological = records.slice().sort(function (a, b) { return new Date(a.start || a.date || 0) - new Date(b.start || b.date || 0); });
    var previous = chronological.length > 1 ? score(data, division, chronological.slice(0, -1)) : [];
    rows.forEach(function (row) {
      var before = row.correction ? row.correction.previousPosition : (matchingDriver(previous, row) || {}).position;
      row.movement = before == null ? null : before - row.position;
    });
    return rows;
  }
  function movement(value) { return value == null ? "—" : value > 0 ? "+" + value : String(value); }
  function movementHTML(value) {
    var known = value != null && Number.isFinite(Number(value)), amount = known ? Math.abs(Number(value)) : 0;
    var direction = amount === 0 ? "unchanged" : Number(value) > 0 ? "up" : "down";
    var label = !known ? "Position change unavailable" : amount === 0 ? "No position change" : (direction === "up" ? "Up " : "Down ") + amount + " position" + (amount === 1 ? "" : "s");
    var display = amount === 0 ? "—" : (direction === "up" ? "▲ " : "▼ ") + amount;
    return '<span class="standings-movement standings-movement--' + direction + '" role="img" aria-label="' + label + '"><span aria-hidden="true">' + display + '</span></span>';
  }
  function correction(row, points, options) {
    options = options || {};
    if (!Number.isSafeInteger(points)) throw new Error("Points must be a whole number.");
    if (!Number.isSafeInteger(points - row.rawPoints)) throw new Error("The points correction is too large. Use a smaller total.");
    var saved = row.correction || {};
    return { id: key(row.division, row.id), division: row.division, username: row.id, name: options.name == null ? row.name : options.name, number: options.number == null ? text(row.number) : options.number, nameManual: options.name != null || Boolean(saved.nameManual), numberManual: options.number != null || Boolean(saved.numberManual), pointsAdjustment: points - row.rawPoints, previousPosition: Object.prototype.hasOwnProperty.call(options, "previousPosition") ? options.previousPosition : saved.previousPosition == null ? (row.movement == null ? null : row.position + row.movement) : saved.previousPosition, order: options.order || saved.order || row.position, orderManual: options.order != null || Boolean(saved.orderManual) };
  }
  function merge(data, entries) {
    var incoming = new Set(entries.map(function (row) { return row.id; }));
    return array(data.standings).filter(function (row) { return !incoming.has(row.id); }).concat(entries);
  }
  function validate(data) {
    if (data.standings == null) return [];
    if (!Array.isArray(data.standings)) return ["Standings corrections must be a list."];
    var seen = new Set(), errors = [];
    data.standings.forEach(function (row) {
      if (!row || !["d1", "d2", "open"].includes(row.division) || typeof row.username !== "string" || !text(row.username) || row.id !== key(row.division, row.username) || typeof row.name !== "string" || !text(row.name) || typeof row.number !== "string" || !Number.isSafeInteger(row.pointsAdjustment) || !Number.isSafeInteger(row.order) || row.order < 1 || row.previousPosition !== null && (!Number.isSafeInteger(row.previousPosition) || row.previousPosition < 1)) {
        errors.push("A standings correction has an invalid driver, points, or position."); return;
      }
      if (seen.has(row.id)) errors.push("A driver has duplicate standings corrections in the same division.");
      if (["nameManual", "numberManual", "orderManual"].some(function (field) { return row[field] != null && typeof row[field] !== "boolean"; })) errors.push("Standings override options must be true or false.");
      seen.add(row.id);
    });
    return errors;
  }
  root.UARLStandings = { calculate: calculate, matchingDriver: matchingDriver, movement: movement, movementHTML: movementHTML, correction: correction, merge: merge, validate: validate };
})(typeof window !== "undefined" ? window : globalThis);
