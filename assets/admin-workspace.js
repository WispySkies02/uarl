(function (root) {
  "use strict";

  function text(value) { return String(value == null ? "" : value).trim(); }
  function identity(value) { return text(value).replace(/^@/, "").toLowerCase(); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function canonical(value) {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ":" + canonical(value[key]); }).join(",") + "}";
    return JSON.stringify(value);
  }
  function equal(a, b) { return canonical(a) === canonical(b); }
  function profileFor(data, user) {
    var profiles = data.drivers && data.drivers.profiles || {};
    var key = Object.keys(profiles).find(function (key) { return identity(key) === identity(user); });
    return key ? profiles[key] : {};
  }
  function inferredUser(data, name) {
    var profiles = data.drivers && data.drivers.profiles || {};
    var keys = Object.keys(profiles).filter(function (key) { return identity(profiles[key].alias) === identity(name); });
    return text(name) && keys.length === 1 ? keys[0] : "";
  }
  function placeholder(name) {
    return /^(open|vacant|tbd|tba)$/i.test(text(name)) || /^(?:(?:part[ -]time|development|shared)\s+)?(?:entry|charter|seat)$/i.test(text(name));
  }
  function occupied(entry) { entry = entry || {}; return Boolean(text(entry.user || entry.username || entry.driverId) || text(entry.name) && !placeholder(entry.name)); }
  function rosterPerson(entry) {
    entry = entry || {};
    return occupied(entry) && !/^(?:inactive|disabled|retired|released|unsigned)\b/i.test(text(entry.status));
  }
  function people(data) {
    data = data || {};
    var drivers = data.drivers || {}, rows = [], represented = new Set();
    function add(entry, context) {
      entry = entry || {};
      var user = text(entry.user || entry.username || entry.driverId).replace(/^@/, "") || inferredUser(data, entry.name);
      var profile = profileFor(data, user), name = text(entry.name) || text(profile.alias) || user;
      if (!name || placeholder(name)) return;
      var key = [context.source, context.teamId || "", context.teamIndex == null ? "" : context.teamIndex, context.entryIndex, identity(user) || identity(name), text(entry.number)].map(encodeURIComponent).join(":");
      rows.push({ key: key, user: user, name: name, number: text(entry.number), team: context.team || "", teamId: context.teamId || "", teamIndex: context.teamIndex, division: context.division || "d1", make: text(context.make || entry.make), numberImage: entry.numberImage || profile.numberImage || "", signatureImage: entry.signatureImage || profile.signatureImage || "", source: context.source, entryIndex: context.entryIndex });
      if (user) represented.add(identity(user));
    }
    array(drivers.teams).forEach(function (team, teamIndex) {
      ["entries", "pendingDrivers"].forEach(function (field) {
        array(team[field]).forEach(function (entry, entryIndex) {
          if (!rosterPerson(entry)) return;
          add(entry, { source: field === "entries" ? "team" : "pending", team: team.name, teamId: team.id || "", teamIndex: teamIndex, entryIndex: entryIndex, make: team.make, division: "d1" });
        });
      });
    });
    array(drivers.openEntries).forEach(function (entry, entryIndex) { if (rosterPerson(entry)) add(entry, { source: "open", team: entry.team || "Open Series", entryIndex: entryIndex, division: "open", make: entry.make }); });
    array(drivers.freeAgents).forEach(function (entry, entryIndex) {
      var user = text(entry.user || entry.username || entry.driverId) || inferredUser(data, entry.name);
      if (user && represented.has(identity(user))) return;
      add(entry, { source: "freeAgent", team: "Free agent", entryIndex: entryIndex, make: entry.make });
    });
    Object.keys(drivers.profiles || {}).forEach(function (user, entryIndex) {
      if (represented.has(identity(user))) return;
      add({ user: user }, { source: "profile", team: "Driver profile", entryIndex: entryIndex });
    });
    return rows;
  }

  var definitions = {
    schedule: { path: ["events"], label: "Schedule", title: function (row) { return row.name || "Untitled event"; }, meta: function (row) { return [row.division, row.date, row.track].filter(Boolean).join(" · "); } },
    results: { path: ["records"], label: "Results", title: function (row) { return row.event || row.name || "Untitled race"; }, meta: function (row) { return [row.division, row.date, row.status].filter(Boolean).join(" · "); } },
    teams: { path: ["drivers", "teams"], label: "Teams", title: function (row) { return row.name || "Untitled team"; }, meta: function (row) { return [row.owner, row.make, array(row.entries).length + " entries"].filter(Boolean).join(" · "); } },
    profiles: { path: ["drivers", "profiles"], label: "Driver profiles", title: function (row) { return row.alias || row.username || "Driver"; }, meta: function (row) { return "@" + row.username; } },
    open: { path: ["drivers", "openEntries"], label: "Open Series", title: function (row) { return [row.number && "#" + row.number, row.name || row.user || "Entry"].filter(Boolean).join(" · "); }, meta: function (row) { return [row.user, row.make, row.status].filter(Boolean).join(" · "); } },
    freeAgents: { path: ["drivers", "freeAgents"], label: "Free agents", title: function (row) { return row.name || row.user || "Driver"; }, meta: function (row) { return [row.user, row.former].filter(Boolean).join(" · "); } },
    moves: { path: ["drivers", "recentMoves"], label: "Recent moves", title: function (row) { return row.driver || "Driver move"; }, meta: function (row) { return [row.team, row.number && "#" + row.number, row.signedAt].filter(Boolean).join(" · "); } },
    paints: { path: ["paints"], label: "Paint Booth", title: function (row) { return [row.number && "#" + row.number, row.title || "Untitled paint"].filter(Boolean).join(" · "); }, meta: function (row) { return [row.name, row.handle, row.team, row.division].filter(Boolean).join(" · "); } },
    history: { path: ["history", "divisions"], label: "History", title: function (row) { return row.name || row.division || "Division"; }, meta: function (row) { return [row.division, row.category].filter(Boolean).join(" · "); } },
    guide: { path: ["guide"], label: "Rules + FAQ", title: function (row) { return text(row.text).slice(0, 80) || "Guide content"; }, meta: function (row) { return row.tag || "text"; } },
    conduct: { path: ["conduct"], label: "Conduct rulebook", title: function (row) { return [row.id, text(row.text).slice(0, 75)].filter(Boolean).join(" · ") || "Rule"; }, meta: function (row) { return [row.group, row.penalty].filter(Boolean).join(" · "); } }
  };
  function at(data, path) { return path.reduce(function (value, key) { return value && value[key]; }, data); }
  function rowsFor(data, section) {
    var value = at(data || {}, definitions[section].path);
    if (section === "profiles") return Object.keys(value || {}).map(function (user) { return Object.assign({ username: user }, value[user]); });
    return array(value);
  }
  function allowed(section, role) { return role === "owner" || role === "admin" || role === "race_control" && ["schedule", "results"].includes(section); }
  function search(data, query, role) {
    var normalizedQuery = identity(query).replace(/#(?=\d)/g, ""), terms = normalizedQuery.split(/\s+/).filter(Boolean), matches = [];
    if (!terms.length) return matches;
    Object.keys(definitions).forEach(function (section) {
      if (!allowed(section, role)) return;
      var definition = definitions[section];
      rowsFor(data, section).forEach(function (row, index) {
        var title = definition.title(row), meta = definition.meta(row), extras = [];
        if (section === "open") { var saved = profileFor(data, row.user); extras.push(saved.alias || ""); if (!row.name && saved.alias) title = [row.number && "#" + row.number, saved.alias].filter(Boolean).join(" · "); }
        if (section === "teams") array(row.entries).concat(array(row.pendingDrivers)).forEach(function (entry) { var profile = profileFor(data, entry.user); extras.push(entry.user || "", entry.name || "", profile.alias || "", entry.number || ""); });
        var haystack = identity([title, meta, definition.label].concat(extras).join(" "));
        if (!terms.every(function (term) { return haystack.includes(term); })) return;
        var titleText = identity(title), full = normalizedQuery, score = titleText === full ? 0 : titleText.startsWith(full) ? 1 : titleText.includes(full) ? 2 : 3;
        if (section === "teams" && extras.some(function (value) { return identity(value) === full; })) score = Math.min(score, 1);
        matches.push({ section: section, index: index, step: section === "teams" && extras.some(function (value) { return identity(value).includes(full); }) ? 2 : 0, title: title, meta: definition.label + (meta ? " · " + meta : ""), score: score });
      });
    });
    return matches.sort(function (a, b) { return a.score - b.score || a.title.localeCompare(b.title) || a.index - b.index; }).slice(0, 30).map(function (row) { var result = Object.assign({}, row); delete result.score; return result; });
  }

  var fieldLabels = { id: "ID", name: "Name", alias: "Display name", username: "Roblox username", user: "Roblox username", entries: "Roster entries", pendingDrivers: "Pending drivers", number: "Car number", owner: "Owner", ownerNote: "Owner note", make: "Manufacturer", logo: "Team logo", brandColor: "Primary color", brandColor2: "Secondary color", founded: "Founded", note: "Description", charterCount: "Charters", date: "Date", start: "Start time", track: "Track", round: "Round", laps: "Race laps", status: "Status", scheduleStatus: "Schedule status", scheduleNote: "Schedule note", events: "Schedule", event: "Race name", qualifying: "Qualifying", stages: "Stages", finishes: "Finish order", bonuses: "Awards", winner: "Winner", winnerUsername: "Winner identity", winnerAutomatic: "Automatic winner", pole: "Pole winner", poleUsername: "Pole identity", pointsEvent: "Points event", exhibition: "Exhibition", pointsSummary: "Points summary", pointsNote: "Points note", recordNote: "Record note", numberImage: "Number art", signatureImage: "Signature logo", paints: "Paint schemes", title: "Title", subtitle: "Subtitle", image: "Image", scrAffiliate: "SCR Affiliate", handle: "Roblox handle", body: "Render body", search: "Search keywords", extra: "Tags", signedAt: "Signing date", driver: "Driver", team: "Team", text: "Content", tag: "Content type", group: "Rule group", penalty: "Penalty", severe: "Severe penalty", wins: "Career wins", championships: "Championships", rank: "All-time rank", seasons: "Seasons", winners: "Winners" };
  function label(key) { return fieldLabels[key] || key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, function (letter) { return letter.toUpperCase(); }); }
  function fields(before, after) {
    return Array.from(new Set(Object.keys(before || {}).concat(Object.keys(after || {})))).filter(function (key) { return !equal(before && before[key], after && after[key]); }).map(label);
  }
  function rowKey(row) { return text(row && row.id) ? "id:" + text(row.id) : text(row && (row.username || row.user)) ? "user:" + identity(row.username || row.user) : ""; }
  function changes(original, draft) {
    original = original || {}; draft = draft || {};
    var output = [];
    Object.keys(definitions).forEach(function (section) {
      var before = rowsFor(original, section), after = rowsFor(draft, section), usedBefore = new Set(), usedAfter = new Set(), pairs = [];
      function pair(i, j) { usedBefore.add(i); usedAfter.add(j); pairs.push([i, j]); }
      var beforeKeys = before.map(rowKey), afterKeys = after.map(rowKey);
      before.forEach(function (row, i) {
        var key = beforeKeys[i];
        if (!key || beforeKeys.filter(function (other) { return other === key; }).length !== 1 || afterKeys.filter(function (other) { return other === key; }).length !== 1) return;
        pair(i, afterKeys.indexOf(key));
      });
      after.forEach(function (row, j) {
        if (usedAfter.has(j)) return;
        var i = before.findIndex(function (old, index) { return !usedBefore.has(index) && equal(old, row); });
        if (i >= 0) pair(i, j);
      });
      var remainingBefore = before.map(function (_, i) { return i; }).filter(function (i) { return !usedBefore.has(i) && !beforeKeys[i]; });
      var remainingAfter = after.map(function (_, j) { return j; }).filter(function (j) { return !usedAfter.has(j) && !afterKeys[j]; });
      remainingBefore.forEach(function (i, index) { if (index < remainingAfter.length) pair(i, remainingAfter[index]); });
      pairs.forEach(function (indices) {
        var i = indices[0], j = indices[1];
        var changed = fields(before[i], after[j]);
        if (before.length === after.length && i !== j) changed.push("Order");
        if (changed.length) output.push({ section: section, index: j, title: definitions[section].title(after[j]), kind: "updated", fields: changed });
      });
      after.forEach(function (row, index) { if (!usedAfter.has(index)) output.push({ section: section, index: index, title: definitions[section].title(row), kind: "added", fields: fields({}, row) }); });
      before.forEach(function (row, index) { if (!usedBefore.has(index)) output.push({ section: section, index: index, title: definitions[section].title(row), kind: "removed", fields: fields(row, {}) }); });
    });
    // Canonical collections are accounted for above; only the remaining site settings
    // are compared here. Generated race rosters/schedules must never double-count work.
    function remainder(data) {
      var value = clone(data);
      Object.keys(definitions).forEach(function (section) { var path = definitions[section].path, owner = path.slice(0, -1).reduce(function (current, key) { return current && current[key]; }, value); if (owner) delete owner[path[path.length - 1]]; });
      if (value.race) { delete value.race.drivers; delete value.race.schedule; }
      return value;
    }
    var beforeRest = remainder(original), afterRest = remainder(draft);
    if (!equal(beforeRest, afterRest)) output.push({ section: "advanced", index: 0, title: "Other site settings", kind: "updated", fields: fields(beforeRest, afterRest) });
    return output;
  }

  function transfer(data, options) {
    options = options || {};
    var person = people(data).find(function (row) { return row.key === options.personKey; });
    if (!person) throw new Error("Choose an existing driver first.");
    if (!/^[A-Za-z0-9_]{3,20}$/.test(person.user)) throw new Error("Add this driver's Roblox username before moving them.");
    var teams = data.drivers && data.drivers.teams;
    var matches = array(teams).map(function (team, index) { return { team: team, index: index }; }).filter(function (pair) { return text(pair.team.id) === text(options.teamId); });
    if (matches.length !== 1) throw new Error("Choose a destination team with a unique Team ID.");
    var team = matches[0].team, teamIndex = matches[0].index, number = text(options.number);
    if (!/^\d{1,3}$/.test(number)) throw new Error("Enter a car number using one to three digits.");
    var append = options.seatIndex == null || options.seatIndex === "" || options.seatIndex === "new";
    var seatIndex = append ? array(team.entries).length : Number(options.seatIndex);
    if (!append && (!/^\d+$/.test(String(options.seatIndex)) || !Number.isInteger(seatIndex) || !array(team.entries)[seatIndex])) throw new Error("Choose an existing open seat or add a new entry.");
    var sourceTeam = person.source === "team" || person.source === "pending" ? teams[person.teamIndex] : null;
    var source = sourceTeam && sourceTeam[person.source === "team" ? "entries" : "pendingDrivers"][person.entryIndex];
    var target = append ? {} : team.entries[seatIndex], sameSeat = source && source === target;
    if (!sameSeat && occupied(target)) throw new Error("That seat already has a driver. Choose an open seat.");
    if (array(team.entries).some(function (entry, index) { return index !== seatIndex && text(entry.number) === number; })) throw new Error("That car number is already used by this team.");
    var existing = [];
    array(teams).forEach(function (item, index) { ["entries", "pendingDrivers"].forEach(function (field) { array(item[field]).forEach(function (entry, entryIndex) { if (identity(entry.user || entry.username || entry.driverId || inferredUser(data, entry.name)) === identity(person.user)) existing.push({ teamIndex: index, field: field, entryIndex: entryIndex }); }); }); });
    if (existing.some(function (entry) { return !source || entry.teamIndex !== person.teamIndex || entry.field !== (person.source === "team" ? "entries" : "pendingDrivers") || entry.entryIndex !== person.entryIndex; })) throw new Error("This driver already has another D1 seat. Select that roster entry or resolve the duplicate before moving them.");
    var date = text(options.date) || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date + "T00:00:00Z").getTime()) || new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date) throw new Error("Choose a valid signing date.");
    if (sameSeat && text(source.number) === number) return { teamIndex: teamIndex, entryIndex: seatIndex, name: person.name };

    var nextTarget = Object.assign({}, target, { number: number, user: person.user, name: person.name, status: target.seatType || (source && source.status) || "Signed", signedAt: date, recent: true });
    if (/^open\b/i.test(nextTarget.status)) nextTarget.status = "Signed";
    ["username", "driverId", "numberImage", "signatureImage"].forEach(function (key) { delete nextTarget[key]; });
    if (person.numberImage) nextTarget.numberImage = person.numberImage;
    if (person.signatureImage) nextTarget.signatureImage = person.signatureImage;
    delete nextTarget.numberPending;
    var nextSource;
    if (source && !sameSeat && person.source === "team") {
      var seatType = text(source.seatType || source.charterType || source.status);
      var openStatus = /part|^pt$/i.test(seatType) ? "Open PT" : /development|^dev$/i.test(seatType) ? "Open Development" : /shared/i.test(seatType) ? "Open Shared" : "Open FT";
      nextSource = Object.assign({}, source, { name: "OPEN", status: openStatus });
      ["user", "username", "driverId", "numberImage", "signatureImage", "signedAt", "recent", "numberPending"].forEach(function (key) { delete nextSource[key]; });
    }
    // All validation is complete. These are the only mutations in the operation.
    if (!Array.isArray(team.entries)) team.entries = [];
    if (nextSource) sourceTeam.entries[person.entryIndex] = nextSource;
    if (person.source === "pending" && source && !sameSeat) sourceTeam.pendingDrivers.splice(person.entryIndex, 1);
    if (append) team.entries.push(nextTarget); else team.entries[seatIndex] = nextTarget;
    data.drivers.freeAgents = array(data.drivers.freeAgents).filter(function (entry) { return identity(entry.user || entry.username || entry.driverId || inferredUser(data, entry.name)) !== identity(person.user); });
    if (options.announce) {
      if (!Array.isArray(data.drivers.recentMoves)) data.drivers.recentMoves = [];
      data.drivers.recentMoves.unshift({ driver: person.name, team: team.name, number: number, make: team.make || person.make, signedAt: date });
    }
    return { teamIndex: teamIndex, entryIndex: seatIndex, name: person.name };
  }

  root.UARLWorkspace = { people: people, search: search, changes: changes, transfer: transfer };
})(typeof window !== "undefined" ? window : globalThis);
