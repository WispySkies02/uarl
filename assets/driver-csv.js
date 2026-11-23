(function (root) {
  "use strict";

  function text(value) { return String(value == null ? "" : value).trim(); }
  function identity(value) { return text(value).replace(/^@/, "").toLowerCase(); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function unique(values) { return Array.from(new Set(values.map(text).filter(Boolean))); }
  function account(entry) { return entry && (entry.user || entry.username || entry.driverId) || ""; }
  function placeholder(value) {
    return /^(?:open|vacant|tbd|tba)(?:\s+(?:car|seat|entry|charter|ft|pt|part[- ]time))*$/i.test(text(value)) || /^(?:(?:full[- ]time|part[- ]time|development|shared)(?:\s*\/\s*(?:full[- ]time|part[- ]time|development|shared))*\s+)?(?:car|entry|charter|seat)$/i.test(text(value));
  }
  function occupied(entry) { return Boolean(text(account(entry)) || text(entry && entry.name) && !placeholder(entry.name)); }
  function hasNumber(entry) { return entry && !entry.numberPending && /^\d{1,3}$/.test(text(entry.number)); }

  function preview(source, data, division) {
    division = division === undefined ? "d1" : text(division);
    var parsed = root.UARLRaceCSV.parse(source, "drivers"), errors = parsed.errors.slice(), warnings = [], rows = [];
    if (!["d1", "open"].includes(division)) errors.unshift("Choose D1 or Open Series before importing drivers.");
    if (errors.length) return { errors: errors, rows: rows, warnings: warnings, division: division };
    var drivers = clone(data && data.drivers || {});
    if (!drivers.profiles || typeof drivers.profiles !== "object" || Array.isArray(drivers.profiles)) drivers.profiles = {};
    if (division === "d1" && !Array.isArray(drivers.teams)) drivers.teams = [];
    if (division === "open" && !Array.isArray(drivers.openEntries)) drivers.openEntries = [];
    var profiles = drivers.profiles, seenAccounts = new Set(), seenSeats = new Set();

    function resolve(value) {
      var id = identity(value);
      var matches = Object.keys(profiles).filter(function (key) {
        var saved = profiles[key] || {};
        return [key, saved.currentUsername].concat(array(saved.usernameAliases)).some(function (name) { return id && identity(name) === id; });
      });
      return { key: matches.length === 1 ? matches[0] : "", ambiguous: matches.length > 1 };
    }
    function sameAccount(value, user) {
      var found = resolve(value);
      return !found.ambiguous && identity(found.key || value) === identity(user);
    }
    function assignments(user) {
      var found = [];
      array(drivers.teams).forEach(function (team, teamIndex) {
        ["entries", "pendingDrivers"].forEach(function (field) {
          array(team[field]).forEach(function (entry, index) {
            if (text(account(entry)) && sameAccount(account(entry), user)) found.push({ team: team, teamIndex: teamIndex, field: field, entry: entry, index: index });
          });
        });
      });
      return found;
    }
    function openAssignments(user) {
      return array(drivers.openEntries).map(function (entry, index) { return { entry: entry, index: index }; }).filter(function (item) {
        return text(account(item.entry)) && sameAccount(account(item.entry), user);
      });
    }
    function knownHandle(value) {
      var result = "";
      array(drivers.teams).forEach(function (team) {
        array(team.entries).concat(array(team.pendingDrivers)).forEach(function (entry) { if (!result && identity(account(entry)) === identity(value)) result = text(account(entry)).replace(/^@/, ""); });
      });
      array(drivers.openEntries).concat(array(drivers.freeAgents)).forEach(function (entry) { if (!result && identity(account(entry)) === identity(value)) result = text(account(entry)).replace(/^@/, ""); });
      return result;
    }
    function vacant(entry) {
      var next = Object.assign({}, entry, { name: "OPEN" });
      var type = text(entry.seatType || entry.charterType || entry.status);
      next.status = /part|^pt$/i.test(type) ? "Open PT" : /development|^dev$/i.test(type) ? "Open Development" : /shared/i.test(type) ? "Open Shared" : "Open FT";
      ["user", "username", "driverId", "numberImage", "signatureImage", "signedAt", "recent"].forEach(function (key) { delete next[key]; });
      if (!hasNumber(entry)) next.numberPending = true; else delete next.numberPending;
      return next;
    }
    function updateProfile(saved, user, username, name, number, previousName) {
      var profile = saved || { alias: name, currentUsername: username, usernameAliases: [], csvAliases: [], csvDivisions: [], number: "", wins: 0, championships: 0, rank: 0 };
      profile.csvAliases = unique(array(profile.csvAliases).concat([profile.alias, previousName, name].filter(function (alias) { return text(alias) && !placeholder(alias); })));
      profile.alias = name;
      profile.usernameAliases = unique(array(profile.usernameAliases).concat(user, username, profile.currentUsername || ""));
      profile.csvDivisions = unique(array(profile.csvDivisions).concat(division));
      // An Open entry owns its number independently of the driver's D1 profile.
      if (division === "d1" || !saved) profile.number = number;
      Object.defineProperty(profiles, user, { value: profile, enumerable: true, configurable: true, writable: true });
      return profile;
    }
    function preserveOpenArtwork(saved, user, number, line) {
      var divisions = saved && array(saved.csvDivisions), oldNumber = text(saved && saved.number);
      if (!saved || !divisions.includes("open") || divisions.includes("d1") || !text(saved.numberImage) || number === oldNumber) return true;
      var matches = openAssignments(user).filter(function (item) { return hasNumber(item.entry) && text(item.entry.number) === oldNumber; });
      if (matches.length !== 1) {
        errors.push(line + "Save this driver's number artwork on a unique Open Series entry before changing their D1 number, then preview the CSV again.");
        return false;
      }
      var entry = matches[0].entry;
      if (!text(entry.numberImage)) entry.numberImage = saved.numberImage;
      else if (text(entry.numberImage) !== text(saved.numberImage)) {
        var history = Array.isArray(saved.numberImageHistory) ? saved.numberImageHistory.slice() : Object.hasOwn(saved, "numberImageHistory") ? [saved.numberImageHistory] : [];
        if (!history.some(function (item) { return item && text(item.number) === oldNumber && text(item.url) === text(saved.numberImage); })) history.push({ number: oldNumber, url: saved.numberImage });
        saved.numberImageHistory = history;
      }
      delete saved.numberImage;
      return true;
    }
    function importOpen(line, name, username, suppliedNumber, teamText, user, current, saved, countBefore) {
      var number = suppliedNumber || (current && hasNumber(current.entry) ? text(current.entry.number) : "");
      var target = current && current.entry, targetIndex = current ? current.index : -1;
      if (number) {
        var numbered = drivers.openEntries.map(function (entry, index) { return { entry: entry, index: index }; }).filter(function (item) { return hasNumber(item.entry) && text(item.entry.number) === number; });
        if (numbered.length > 1) errors.push(line + "Open Series has duplicate #" + number + " entries. Resolve them before importing.");
        if (numbered.length === 1) {
          target = numbered[0].entry; targetIndex = numbered[0].index;
          if (occupied(target) && !sameAccount(account(target), user)) errors.push(line + "#" + number + " in Open Series already has another driver. This import cannot replace them.");
        }
        if (seenSeats.has(number)) errors.push(line + "Duplicate #" + number + " assignment in Open Series.");
        seenSeats.add(number);
      }
      if (errors.length !== countBefore) return;

      var profile = updateProfile(saved, user, username, name, number, current && current.entry.name);
      var next = Object.assign({}, current ? current.entry : target || {}, { user: user, name: name, number: number });
      ["username", "driverId"].forEach(function (key) { delete next[key]; });
      if (number) delete next.numberPending; else next.numberPending = true;
      if (teamText) next.team = teamText;
      else if (!current) delete next.team;
      if (!current) {
        ["numberImage", "signatureImage", "signedAt", "recent"].forEach(function (key) { delete next[key]; });
        next.make = "Generic";
        next.status = "Open Series";
      }
      if (current && number !== text(current.entry.number) && current.entry.numberImage) warnings.push(line + "The Open Series car number changes to " + (number ? "#" + number : "pending") + ". Review this entry’s number artwork; the uploaded image is preserved.");
      if (targetIndex >= 0) drivers.openEntries[targetIndex] = next; else drivers.openEntries.push(next);
      if (current && targetIndex !== current.index) drivers.openEntries.splice(current.index, 1);
      rows.push({ name: name, user: user, username: text(profile.currentUsername) || user, number: number, team: text(next.team), teamName: text(next.team) || "Independent entry", action: current ? "update" : "add" });
    }

    parsed.rows.forEach(function (row) {
      var line = "Line " + row.line + ": ", cells = row.cells, name = text(cells[0]), username = text(cells[1]).replace(/^@/, ""), suppliedNumber = text(cells[2]), teamText = text(cells[3]);
      var countBefore = errors.length;
      if (!name || placeholder(name)) errors.push(line + "DriverName must name a driver, not an open or vacant seat.");
      if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) errors.push(line + "Username must contain 3–20 letters, numbers or underscores.");
      if (suppliedNumber && !/^\d{1,3}$/.test(suppliedNumber)) errors.push(line + "Driver# must contain one to three digits or be blank. Leading zeros are kept.");
      var resolved = resolve(username);
      if (resolved.ambiguous) errors.push(line + "That username matches more than one registered driver. Resolve their account aliases before importing.");
      var existingHandle = resolved.key || knownHandle(username), user = existingHandle || username;
      if (seenAccounts.has(identity(user))) errors.push(line + "Duplicate driver account “" + username + "”. List each driver once, including former usernames.");
      seenAccounts.add(identity(user));
      var existing = division === "open" ? openAssignments(user) : assignments(user);
      if (existing.length > 1) errors.push(line + "This account already has multiple " + (division === "open" ? "Open Series" : "D1") + " entries. Resolve the duplicate roster entries before importing.");
      var current = existing[0], saved = Object.hasOwn(profiles, user) && profiles[user] || null;
      if (saved && (typeof saved !== "object" || Array.isArray(saved))) errors.push(line + "The existing driver profile is invalid. Repair it before importing.");
      if (division === "open") { importOpen(line, name, username, suppliedNumber, teamText, user, current, saved, countBefore); return; }
      var destination = current && current.team;
      if (teamText) {
        var matches = drivers.teams.filter(function (team) { return identity(team.id) === identity(teamText) || identity(team.name) === identity(teamText); });
        if (matches.length !== 1) errors.push(line + (matches.length ? "Team is ambiguous. Use a unique existing D1 team name or ID." : "Unknown team “" + teamText + "”. Use an existing D1 team name or ID, or leave Team blank."));
        destination = matches.length === 1 ? matches[0] : null;
      }
      var savedD1Number = saved && (!Array.isArray(saved.csvDivisions) || saved.csvDivisions.includes("d1")) && hasNumber(saved) ? text(saved.number) : "";
      var number = suppliedNumber || (current ? hasNumber(current.entry) ? text(current.entry.number) : "" : savedD1Number);
      var target = null, targetIndex = -1, targetField = number ? "entries" : "pendingDrivers";
      if (destination) {
        if (number) {
          var numbered = array(destination.entries).map(function (entry, index) { return { entry: entry, index: index }; }).filter(function (pair) { return hasNumber(pair.entry) && text(pair.entry.number) === number; });
          if (numbered.length > 1) errors.push(line + "This team has duplicate #" + number + " entries. Resolve them before importing.");
          if (numbered.length === 1) { target = numbered[0].entry; targetIndex = numbered[0].index; }
          if (target && occupied(target) && !sameAccount(account(target), user)) errors.push(line + "#" + number + " on " + destination.name + " already has another driver. This import cannot replace them.");
          if (!target && current && current.team === destination && current.field === "entries") { target = current.entry; targetIndex = current.index; }
          var seat = drivers.teams.indexOf(destination) + ":" + number;
          if (seenSeats.has(seat)) errors.push(line + "Duplicate #" + number + " assignment for " + destination.name + ".");
          seenSeats.add(seat);
        } else if (current && current.team === destination) { target = current.entry; targetIndex = current.index; targetField = current.field; }
      }
      if (errors.length !== countBefore) return;
      if (!preserveOpenArtwork(saved, user, number, line)) return;

      var oldNumber = current && hasNumber(current.entry) ? text(current.entry.number) : text(saved && saved.number);
      var profile = updateProfile(saved, user, username, name, number, current && current.entry.name);
      if (number !== oldNumber && oldNumber && (profile.numberImage || current && current.entry.numberImage)) warnings.push(line + "The car number changes from #" + oldNumber + " to " + (number ? "#" + number : "pending") + ". Review this driver’s number artwork; the uploaded image is preserved.");

      if (destination) {
        var sameSeat = current && target === current.entry;
        var next = Object.assign({}, target || {}, { user: user, name: name, number: number, status: target && target.status || current && current.entry.status || "Signed" });
        if (/^(?:open|vacant|inactive|disabled|retired|released|unsigned)\b/i.test(text(next.status))) next.status = "Signed";
        ["username", "driverId"].forEach(function (key) { delete next[key]; });
        if (number) delete next.numberPending; else next.numberPending = true;
        if (!sameSeat) {
          ["numberImage", "signatureImage", "signedAt", "recent"].forEach(function (key) { delete next[key]; });
          ["numberImage", "signatureImage"].forEach(function (key) { var image = current && current.entry[key] || profile[key]; if (image) next[key] = image; });
          if (current) ["signedAt", "recent"].forEach(function (key) { if (Object.hasOwn(current.entry, key)) next[key] = current.entry[key]; });
        }
        if (current && !sameSeat) {
          if (current.field === "entries") current.team.entries[current.index] = vacant(current.entry);
          else current.team.pendingDrivers.splice(current.index, 1);
        }
        if (!Array.isArray(destination[targetField])) destination[targetField] = [];
        if (targetIndex >= 0) destination[targetField][targetIndex] = next; else destination[targetField].push(next);
        if (Array.isArray(drivers.freeAgents)) drivers.freeAgents = drivers.freeAgents.filter(function (entry) { return !sameAccount(account(entry), user); });
      } else if (Array.isArray(drivers.freeAgents)) drivers.freeAgents.forEach(function (entry) { if (sameAccount(account(entry), user)) entry.name = name; });
      rows.push({ name: name, user: user, username: text(profile.currentUsername) || user, number: number, team: destination && text(destination.id) || "", teamName: destination && text(destination.name) || "Unassigned", action: !existingHandle ? "add" : current && destination && current.team !== destination ? "move" : "update" });
    });
    if (errors.length) return { errors: errors, rows: rows, warnings: warnings, division: division };
    return { errors: errors, rows: rows, drivers: drivers, warnings: warnings, division: division };
  }

  root.UARLDriverCSV = { preview: preview };
})(typeof window !== "undefined" ? window : globalThis);
