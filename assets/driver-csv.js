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
    var profiles = drivers.profiles && typeof drivers.profiles === "object" && !Array.isArray(drivers.profiles) ? drivers.profiles : {};
    var seenAccounts = new Set(), seenSeats = new Set();

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
    function updateProfile(saved, user, username, name, number, previousName) {
      var profile = saved || { alias: name, currentUsername: username, usernameAliases: [], csvAliases: [], csvDivisions: [], number: "", wins: 0, championships: 0, rank: 0 };
      profile.csvAliases = unique(array(profile.csvAliases).concat([profile.alias, previousName, name].filter(function (alias) { return text(alias) && !placeholder(alias); })));
      profile.alias = name;
      profile.usernameAliases = unique(array(profile.usernameAliases).concat(user, username, profile.currentUsername || ""));
      profile.csvDivisions = unique(array(profile.csvDivisions).concat(division));
      // An Open entry owns its number independently of the driver's D1 profile.
      if (division === "d1" || !saved) profile.number = number;
      Object.defineProperty(profiles, user, { value: profile, enumerable: true, configurable: true, writable: true });
      drivers.profiles = profiles;
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
    function importOpen(name, username, number, teamText, user, saved) {
      if (!Array.isArray(drivers.openEntries)) drivers.openEntries = [];
      // Open numbers are shared by drivers. Reuse only a genuinely vacant row,
      // never a different driver's entry with the same car number.
      var targetIndex = number ? drivers.openEntries.findIndex(function (entry) { return hasNumber(entry) && text(entry.number) === number && !occupied(entry); }) : -1;
      var target = targetIndex >= 0 ? drivers.openEntries[targetIndex] : null;
      var profile = updateProfile(saved, user, username, name, number);
      var next = Object.assign({}, target || {}, { user: user, name: name, number: number, make: "Generic", status: "Open Series" });
      ["username", "driverId"].forEach(function (key) { delete next[key]; });
      if (number) delete next.numberPending; else next.numberPending = true;
      if (teamText) next.team = teamText; else delete next.team;
      ["numberImage", "signatureImage", "signedAt", "recent"].forEach(function (key) { delete next[key]; });
      if (targetIndex >= 0) drivers.openEntries[targetIndex] = next; else drivers.openEntries.push(next);
      rows.push({ name: name, user: user, username: text(profile.currentUsername) || user, number: number, team: text(next.team), teamName: text(next.team) || "Independent entry", action: "add" });
      seenAccounts.add(identity(user));
    }
    function skip(user, username, current, saved) {
      var entry = current.entry, team = current.team, repeated = seenAccounts.has(identity(user));
      var name = text(entry.name) || text(saved && saved.alias) || user;
      rows.push({ name: name, user: user, username: text(saved && saved.currentUsername) || username || user, number: hasNumber(entry) ? text(entry.number) : "", team: division === "d1" ? text(team.id) : text(entry.team), teamName: division === "d1" ? text(team.name) : text(entry.team) || "Independent entry", action: "skip", reason: repeated ? "Repeated CSV driver" : "Already on " + (division === "open" ? "Open Series" : "D1") + " roster" });
      seenAccounts.add(identity(user));
    }

    parsed.rows.forEach(function (row) {
      var line = "Line " + row.line + ": ", cells = row.cells, name = text(cells[0]), username = text(cells[1]).replace(/^@/, ""), suppliedNumber = text(cells[2]), teamText = text(cells[3]);
      var countBefore = errors.length;
      if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) errors.push(line + "Username must contain 3–20 letters, numbers or underscores.");
      var resolved = resolve(username);
      if (resolved.ambiguous) errors.push(line + "That username matches more than one registered driver. Resolve their account aliases before importing.");
      var existingHandle = resolved.key || knownHandle(username), user = existingHandle || username;
      var existing = division === "open" ? openAssignments(user) : assignments(user);
      if (existing.length > 1) errors.push(line + "This account already has multiple " + (division === "open" ? "Open Series" : "D1") + " entries. Resolve the duplicate roster entries before importing.");
      var current = existing[0], saved = Object.hasOwn(profiles, user) && profiles[user] || null;
      if (saved && (typeof saved !== "object" || Array.isArray(saved))) errors.push(line + "The existing driver profile is invalid. Repair it before importing.");
      if (errors.length !== countBefore) return;
      if (current) { skip(user, username, current, saved); return; }
      if (!name || placeholder(name)) errors.push(line + "DriverName must name a driver, not an open or vacant seat.");
      if (suppliedNumber && !/^\d{1,3}$/.test(suppliedNumber)) errors.push(line + "Driver# must contain one to three digits or be blank. Leading zeros are kept.");
      if (division === "open") { if (errors.length === countBefore) importOpen(name, username, suppliedNumber, teamText, user, saved); return; }
      var destination;
      if (teamText) {
        var matches = array(drivers.teams).filter(function (team) { return identity(team.id) === identity(teamText) || identity(team.name) === identity(teamText); });
        if (matches.length !== 1) errors.push(line + (matches.length ? "Team is ambiguous. Use a unique existing D1 team name or ID." : "Unknown team “" + teamText + "”. Use an existing D1 team name or ID, or leave Team blank only to keep an existing assignment."));
        destination = matches.length === 1 ? matches[0] : null;
      }
      if (!destination && !teamText) errors.push(line + "Team is required for D1. Enter an existing D1 team name or ID; leave it blank only for a driver already assigned to a team.");
      var savedD1Number = saved && (!Array.isArray(saved.csvDivisions) || saved.csvDivisions.includes("d1")) && hasNumber(saved) ? text(saved.number) : "";
      var number = suppliedNumber || savedD1Number;
      if (number && array(drivers.teams).some(function (team) {
        return array(team.entries).concat(array(team.pendingDrivers)).some(function (entry) {
          return occupied(entry) && hasNumber(entry) && text(entry.number) === number && !sameAccount(account(entry), user);
        });
      })) errors.push(line + "#" + number + " is already assigned to another D1 driver. D1 driver numbers must be unique across teams.");
      var target = null, targetIndex = -1, targetField = number ? "entries" : "pendingDrivers";
      if (destination) {
        if (number) {
          var numbered = array(destination.entries).map(function (entry, index) { return { entry: entry, index: index }; }).filter(function (pair) { return hasNumber(pair.entry) && text(pair.entry.number) === number; });
          if (numbered.length > 1) errors.push(line + "This team has duplicate #" + number + " entries. Resolve them before importing.");
          if (numbered.length === 1) { target = numbered[0].entry; targetIndex = numbered[0].index; }
          if (target && occupied(target) && !sameAccount(account(target), user)) errors.push(line + "#" + number + " on " + destination.name + " already has another driver. This import cannot replace them.");
          var seat = drivers.teams.indexOf(destination) + ":" + number;
          if (seenSeats.has(seat)) errors.push(line + "Duplicate #" + number + " assignment for " + destination.name + ".");
          seenSeats.add(seat);
        }
      }
      if (errors.length !== countBefore) return;
      if (!preserveOpenArtwork(saved, user, number, line)) return;

      var oldNumber = text(saved && saved.number);
      var profile = updateProfile(saved, user, username, name, number);
      if (number !== oldNumber && oldNumber && profile.numberImage) warnings.push(line + "The car number changes from #" + oldNumber + " to " + (number ? "#" + number : "pending") + ". Review this driver’s number artwork; the uploaded image is preserved.");

      if (destination) {
        var next = Object.assign({}, target || {}, { user: user, name: name, number: number, status: target && target.status || "Signed" });
        if (/^(?:open|vacant|inactive|disabled|retired|released|unsigned)\b/i.test(text(next.status))) next.status = "Signed";
        ["username", "driverId"].forEach(function (key) { delete next[key]; });
        if (number) delete next.numberPending; else next.numberPending = true;
        ["numberImage", "signatureImage", "signedAt", "recent"].forEach(function (key) { delete next[key]; });
        ["numberImage", "signatureImage"].forEach(function (key) { if (profile[key]) next[key] = profile[key]; });
        if (!Array.isArray(destination[targetField])) destination[targetField] = [];
        if (targetIndex >= 0) destination[targetField][targetIndex] = next; else destination[targetField].push(next);
        if (Array.isArray(drivers.freeAgents)) drivers.freeAgents = drivers.freeAgents.filter(function (entry) { return !sameAccount(account(entry), user); });
      }
      rows.push({ name: name, user: user, username: text(profile.currentUsername) || user, number: number, team: destination && text(destination.id) || "", teamName: destination && text(destination.name) || "Unassigned", action: "add" });
      seenAccounts.add(identity(user));
    });
    if (errors.length) return { errors: errors, rows: rows, warnings: warnings, division: division };
    return { errors: errors, rows: rows, drivers: drivers, warnings: warnings, division: division };
  }

  root.UARLDriverCSV = { preview: preview };
})(typeof window !== "undefined" ? window : globalThis);
