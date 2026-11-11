(function (root) {
  "use strict";

  function text(value) { return String(value == null ? "" : value).trim(); }
  function identity(value) { return text(value).replace(/^@/, "").toLowerCase(); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function unique(values) { return Array.from(new Set(values.filter(Boolean))); }
  function teamKey(value) { return identity(value).replace(/[^a-z0-9]/g, ""); }
  function set(object, key, value) { Object.defineProperty(object, key, { value: value, enumerable: true, configurable: true, writable: true }); }
  function hasName(value) { return typeof value === "string" && text(value) && !/^(undefined|null)$/i.test(text(value)); }
  function returnAetherwing(data) {
    var drivers = data.drivers;
    if (Number(drivers.aetherwingReturnVersion) >= 1) return;
    var profiles = drivers.profiles || (drivers.profiles = {});
    var current = drivers.teams || (drivers.teams = []);
    function canonical(user) { return identity(root.UARLResultDrivers ? root.UARLResultDrivers.canonicalUser(data, user) : user); }
    var team = current.find(function (team) { return team.id === "aetherwing" || teamKey(team.name) === "aetherwingemotorsports"; });
    if (!team) {
      var previous = array(drivers.previousRoster && drivers.previousRoster.teams).find(function (team) { return team.id === "aetherwing"; }) || {};
      team = { id: "aetherwing", name: "Aetherwing eMotorsports", owner: "", make: "Chevrolet", note: "", logo: "/assets/aetherwing/logo.webp", brandColor: "#ef1e23", brandColor2: "#ffffff", entries: [], pendingDrivers: [] };
      // Restore the identity, not the retired Toyota lineup or charter counts.
      ["owner", "ownerNote", "note", "founded", "logo", "brandColor", "brandColor2"].forEach(function (key) { if (Object.hasOwn(previous, key)) team[key] = previous[key]; });
      current.push(team);
    }
    team.make = "Chevrolet";
    if (!Array.isArray(team.entries)) team.entries = [];
    function open(number) { return { number: number, name: "OPEN", status: "Open FT", seatType: "Full-Time", charterType: "FT" }; }
    var user = root.UARLResultDrivers ? root.UARLResultDrivers.canonicalUser(data, "Raceartstudios") : "Raceartstudios";
    var key = Object.keys(profiles).find(function (key) { return identity(key) === identity(user); }) || user;
    var existing = [];
    current.forEach(function (owner) { ["entries", "pendingDrivers"].forEach(function (field) {
      array(owner[field]).forEach(function (entry, index) { if (entry.user && canonical(entry.user) === identity(key)) existing.push({ team: owner, field: field, index: index, entry: entry }); });
    }); });
    var member = existing.find(function (record) { return record.team === team; });
    var slot = team.entries.find(function (entry) { return text(entry.number) === "33"; });
    // A live team may already have been edited. Keep its occupied seats and any
    // existing assignment for this account instead of replacing a modern roster.
    var available = !member && (!slot || !slot.user && (!text(slot.name) || /^(open|tbd|vacant)$/i.test(text(slot.name))));
    if (member || available) {
      var saved = profiles[key] || {};
      if (!text(saved.alias) || canonical(saved.alias) === identity(key)) saved.alias = "Will";
      saved.csvAliases = unique(array(saved.csvAliases).concat("Will", "Raceartstudios"));
      saved.csvDivisions = unique(array(saved.csvDivisions).concat("d1"));
      if (text(saved.currentUsername) && identity(saved.currentUsername) !== "raceartstudios") saved.usernameAliases = unique(array(saved.usernameAliases).concat(saved.currentUsername));
      saved.currentUsername = "Raceartstudios";
      ["wins", "championships", "rank"].forEach(function (field) { if (saved[field] == null) saved[field] = 0; });
      if (available) {
        var prior = existing[0], entry = { number: "33", user: key, status: "Signed" };
        if (prior) {
          ["name", "signatureImage"].forEach(function (field) { if (Object.hasOwn(prior.entry, field)) entry[field] = prior.entry[field]; });
          if (text(prior.entry.number) === "33" && prior.entry.numberImage) entry.numberImage = prior.entry.numberImage;
        }
        if (prior || saved.numberImage && text(saved.number) !== "33") {
          drivers.aetherwingReturnBackup = { profile: clone(saved), entries: existing.map(function (record) { return { team: record.team.id, field: record.field, entry: clone(record.entry) }; }) };
        }
        if (saved.numberImage && text(saved.number) !== "33") {
          // An Open Series entry may still use the old number and its artwork.
          array(drivers.openEntries).forEach(function (openEntry) { if (canonical(openEntry.user) === identity(key) && text(openEntry.number) === text(saved.number) && !openEntry.numberImage) openEntry.numberImage = saved.numberImage; });
          delete saved.numberImage;
        }
        existing.forEach(function (record) {
          if (record.field === "pendingDrivers") record.team.pendingDrivers = record.team.pendingDrivers.filter(function (candidate) { return candidate !== record.entry; });
          else {
            var seatType = text(record.entry.seatType || record.entry.charterType || record.entry.status);
            var status = /part|^pt$/i.test(seatType) ? "Open PT" : /development|^dev$/i.test(seatType) ? "Open Development" : /shared/i.test(seatType) ? "Open Shared" : "Open FT";
            var vacant = Object.assign({}, record.entry, { name: "OPEN", status: status });
            ["user", "username", "driverId", "numberImage", "signatureImage", "signedAt", "recent", "numberPending"].forEach(function (field) { delete vacant[field]; });
            record.team.entries[record.index] = vacant;
          }
        });
        if (slot) {
          var seat = Object.assign({}, slot);
          ["user", "username", "driverId", "name", "numberImage", "signatureImage", "signedAt", "recent", "numberPending"].forEach(function (field) { delete seat[field]; });
          team.entries[team.entries.indexOf(slot)] = Object.assign(seat, entry);
        }
        else team.entries.push(entry);
        saved.number = "33";
      }
      if (member && !text(saved.number)) saved.number = text(member.entry.number);
      set(profiles, key, saved);
      drivers.freeAgents = array(drivers.freeAgents).filter(function (entry) { return canonical(entry.user || entry.username) !== identity(key); });
    }
    ["33", "42", "43"].forEach(function (number) { if (!team.entries.some(function (entry) { return text(entry.number) === number; })) team.entries.push(open(number)); });
    drivers.aetherwingReturnVersion = 1;
  }
  function presentation(data) {
    returnAetherwing(data);
    var drivers = data.drivers, profiles = drivers.profiles || {};
    function canonical(user) { return identity(root.UARLResultDrivers ? root.UARLResultDrivers.canonicalUser(data, user) : user); }
    var entries = array(drivers.teams).flatMap(function (team) { return array(team.entries).concat(array(team.pendingDrivers)); }).concat(array(drivers.openEntries));
    if (!(Number(drivers.displayNameVersion) >= 1)) {
      var jj = Object.keys(profiles).find(function (user) { return identity(user) === "jjelliott2004"; });
      if (jj) {
        var saved = profiles[jj], names = [saved.alias, "James", "JJ Whitlock", "JJ"];
        entries.forEach(function (entry) { if (canonical(entry.user) === identity(jj)) { names.push(entry.name); delete entry.name; } });
        saved.csvAliases = unique(array(saved.csvAliases).concat(names));
        saved.alias = "JJ";
        array(data.standings).forEach(function (row) { if (canonical(row.username) === identity(jj)) row.name = "JJ"; });
        array(data.race && data.race.drivers).forEach(function (driver) { if (canonical(driver.id) === identity(jj)) driver.name = "JJ"; });
      }
      drivers.displayNameVersion = 1;
    }
    // Earlier roster updates could omit a CSV name when an entry relied on its
    // profile name. Repair saved data and drafts without rebuilding the roster
    // or changing any points, car numbers, position changes or manual ordering.
    array(data.standings).forEach(function (row) {
      if (hasName(row.name)) return;
      var user = canonical(row.username);
      if (!user) return;
      var previous = array(drivers.previousRoster && drivers.previousRoster.standings).find(function (saved) { return saved.division === row.division && canonical(saved.username) === user && hasName(saved.name); });
      var source = row.division === "d1" ? array(drivers.teams).flatMap(function (team) { return array(team.entries).concat(array(team.pendingDrivers)); }) : row.division === "open" ? array(drivers.openEntries) : [];
      var entry = source.find(function (entry) { return canonical(entry.user) === user; });
      var profileKey = Object.keys(profiles).find(function (key) { return canonical(key) === user; });
      var archived = array(data.race && data.race.drivers).find(function (driver) { return driver.division === row.division && canonical(driver.id) === user && hasName(driver.name); });
      var names = [previous && previous.name, entry && entry.name, row.division === "d2" && archived && archived.name, profileKey && profiles[profileKey].alias, archived && archived.name, text(row.username)];
      row.name = names.find(hasName) || text(row.username);
    });
    return data;
  }

  // The league's supplied D1 roster. Open Series and historical race numbers are
  // independent of this list. Missing owners and TBD numbers remain unassigned.
  var teams = [
    { id: "dakota", name: "Dakota Sullivan Racing", make: "Chevrolet", entries: [
      ["16", "58bbwapache", "Dale Apache", "Dale"],
      ["19", "FueledByMayonnaise", "Max Stidham", "Max"],
      ["20", "UN88475544", "Haydon Hildebrand", "Nurtec"],
      ["61", "PlaneFan638", "", "Plane"],
      ["91", "OPTBlitzCC4589", "", "Opt"]
    ] },
    { id: "avery", name: "Avery Motorsports", make: "Ford", entries: [
      ["05", "pa05", "Payson Avery", "Payson"],
      ["5", "frogboy4783", "", "Frog"],
      ["6", "", "", "", "Open FT"],
      ["60", "codydgoforth", "Cody Goforth", "Cody"],
      ["72", "TBDAN1E", "Daniel Heale", "Daniel"],
      ["73", "", "", "", "Open PT"]
    ] },
    { id: "whitlock", name: "Goat Whitlock Motorsports", make: "Toyota", entries: [
      ["9", "ComoDW", "Jay Vixen", "Jay"],
      ["24", "John_Hunter38", "John Hunter", "John"],
      ["25", "JamesEklund", "James Eklund", "James Eklund"],
      ["28", "Aokikoto", "Hailey Waggonner", "Hailey"],
      ["84", "JJElliott2004", "JJ Whitlock", "JJ"]
    ] },
    { id: "goforth", name: "Goforth Motorsports", make: "Ford", entries: [
      ["1", "", "", "", "Open FT"],
      ["77", "kingofgamez_YT", "", "King", "", "Kingofgamez"],
      ["81", "GuillermoChase", "Guillermo Chase", "Gman"],
      ["88", "lancejuly", "Lance July", "Lance"],
      ["97", "", "", "", "Open PT"]
    ] },
    { id: "penske", name: "Team Penske", make: "Ford", entries: [
      ["22", "IIKyle5Larson", "Regan Linney", "Rocky"], ["", "", "", "", "Pending"]
    ] },
    { id: "sham", name: "Sham Motorsports", make: "Ford", entries: [
      ["2", "Muffin", "", "Muffin", "", "AnyGameAnyTime09"], ["", "", "", "", "Pending"]
    ] },
    { id: "winston-hermonstyne", name: "Winston-Hermonstyne Motorsports", make: "Toyota", entries: [
      ["11", "NoodlesLuv2011", "", "NoodlesLuv2011"], ["", "", "", "", "Pending"]
    ] }
  ];

  function apply(data) {
    if (!data || !data.drivers) return data;
    if (Number(data.drivers.assignmentVersion) >= 1) return presentation(data);
    var drivers = data.drivers, profiles = drivers.profiles || (drivers.profiles = {});
    var oldTeams = clone(array(drivers.teams)), oldProfiles = clone(profiles), oldFreeAgents = clone(array(drivers.freeAgents));
    var userMap = {}, members = {}, active = new Set(), activeNames = new Map();
    drivers.previousRoster = { teams: oldTeams, profiles: oldProfiles, freeAgents: oldFreeAgents, recentMoves: clone(array(drivers.recentMoves)), standings: clone(array(data.standings)), archivedDrivers: clone(array(data.race && data.race.drivers).filter(function (driver) { return driver.division === "d2"; })) };

    teams.forEach(function (team) {
      team.entries.forEach(function (row) {
        if (!row[1]) return;
        var supplied = row[1], legacy = row[5];
        var keys = Object.keys(profiles).filter(function (user) { return identity(user) === identity(supplied) || legacy && identity(user) === identity(legacy); });
        var key = keys.find(function (user) { return identity(user) === identity(supplied); }) || keys[0] || supplied;
        var saved = {};
        keys.filter(function (user) { return user !== key; }).forEach(function (user) { Object.assign(saved, profiles[user]); });
        Object.assign(saved, profiles[key] || {});
        ["wins", "championships"].forEach(function (field) { saved[field] = Math.max(Number(saved[field]) || 0, ...keys.map(function (user) { return Number(profiles[user][field]) || 0; })); });
        if (!(Number(saved.rank) > 0)) { var ranked = keys.map(function (user) { return Number(profiles[user].rank) || 0; }).filter(function (rank) { return rank > 0; }); if (ranked.length) saved.rank = ranked[0]; }
        if (!text(saved.alias) || identity(saved.alias) === identity(supplied)) saved.alias = row[3] || supplied;
        if (identity(supplied) === "aokikoto" && identity(saved.alias) === "wispy") saved.alias = "Hailey";
        if (identity(supplied) === "fueledbymayonnaise" && /^(fueledbymayo|fueledbymayonnaise)$/i.test(saved.alias)) saved.alias = "Max";
        saved.currentUsername = supplied;
        saved.usernameAliases = unique(array(saved.usernameAliases).concat(keys, legacy || "", supplied).map(identity)).filter(function (user) { return user !== identity(key); });
        saved.csvAliases = unique(array(saved.csvAliases).concat(keys.map(function (user) { return oldProfiles[user].alias; }), row[2], row[3], supplied, legacy || ""));
        saved.csvDivisions = unique(array(saved.csvDivisions).concat("d1"));
        saved.number = row[0];
        if (saved.wins == null) saved.wins = 0;
        if (saved.championships == null) saved.championships = 0;
        if (saved.rank == null) saved.rank = 0;
        keys.filter(function (user) { return user !== key; }).forEach(function (user) { delete profiles[user]; });
        set(profiles, key, saved);
        unique([key, supplied, legacy || ""].concat(keys, saved.usernameAliases)).forEach(function (user) { set(userMap, identity(user), key); });
        set(members, identity(supplied), { user: key, profile: saved });
        active.add(identity(key));
      });
    });

    function canonical(user) { return Object.hasOwn(userMap, identity(user)) ? userMap[identity(user)] : text(user); }
    function priorEntry(user) {
      for (var i = 0; i < oldTeams.length; i++) {
        var entry = array(oldTeams[i].entries).concat(array(oldTeams[i].pendingDrivers)).find(function (entry) { return entry.user && identity(canonical(entry.user)) === identity(user); });
        if (entry) return { entry: entry, team: oldTeams[i] };
      }
      return null;
    }
    drivers.teams = teams.map(function (spec) {
      var old = oldTeams.find(function (team) { return teamKey(team.name) === teamKey(spec.name); }) || oldTeams.find(function (team) { return team.id === spec.id; });
      var team = Object.assign({ id: spec.id, owner: "", note: "" }, old || {}, { name: spec.name, make: spec.make, pendingDrivers: [] });
      // Replace only the outdated bundled descriptions; custom copy is kept.
      if (team.id === "avery" && team.note === "The league owner’s Ford stable. Frog joins the #73 after the D2 shutdown.") team.note = "The league owner’s Ford stable, with Frog in the #5 and Payson in the #05.";
      if (team.id === "whitlock" && team.note === "James-owned Toyota team. Taylor moves up from the discontinued D2 series into the #48.") team.note = "James-owned Toyota team, fielding the #9, #24, #25, #28 and #84.";
      // Earlier charter counts describe the old roster. Branding, ownership,
      // descriptions, founding dates and other team metadata stay attached.
      delete team.charterCount;
      team.entries = spec.entries.map(function (row) {
        if (!row[1]) return { number: row[0], name: row[4] === "Pending" ? "TBD" : "OPEN", status: row[4], numberPending: !row[0], seatType: row[4] === "Open PT" ? "Part-Time" : row[4] === "Open FT" ? "Full-Time" : "", charterType: row[4] === "Open PT" ? "PT" : row[4] === "Open FT" ? "FT" : "" };
        var member = members[identity(row[1])], prior = priorEntry(member.user);
        var seat = old && array(old.entries).find(function (entry) { return !entry.user && text(entry.number) === row[0] && entry.name && !/^(open|tbd)$/i.test(entry.name); });
        var entry = Object.assign({}, prior ? prior.entry : seat || {}, { user: member.user, number: row[0], status: "Full-Time" });
        delete entry.username; delete entry.driverId; delete entry.numberPending; delete entry.recent;
        entry.seatType = "Full-Time"; entry.charterType = "FT";
        if (prior && text(prior.entry.number) !== row[0]) {
          delete entry.numberImage;
          delete member.profile.numberImage;
        } else if (prior && prior.team.id === "aetherwing" && !entry.numberImage && ["28", "32", "52", "54", "62", "82", "92"].includes(row[0])) entry.numberImage = "/assets/aetherwing/numbers/" + row[0] + ".png";
        var display = entry.name && !/^(open|tbd)$/i.test(entry.name) ? entry.name : member.profile.alias;
        // Keep an explicit roster override, but let other entries continue to
        // follow edits to their permanent profile's public display name.
        if (!entry.name || /^(open|tbd)$/i.test(entry.name)) delete entry.name;
        [display, row[2], row[3], row[1], member.user].filter(Boolean).forEach(function (name) { activeNames.set(identity(name), { team: team.name, number: row[0], make: team.make }); });
        return entry;
      });
      return team;
    });

    var freeAgents = oldFreeAgents.filter(function (entry) { return !active.has(identity(canonical(entry.user || entry.username))); });
    oldTeams.forEach(function (team) {
      array(team.entries).concat(array(team.pendingDrivers)).forEach(function (entry) {
        var user = canonical(entry.user || entry.username);
        if (!user || active.has(identity(user)) || freeAgents.some(function (entry) { return identity(entry.user) === identity(user); })) return;
        var saved = profiles[user] || {};
        freeAgents.push({ user: user, name: entry.name || saved.alias || user, former: [entry.number && "#" + entry.number, team.name, team.make].filter(Boolean).join(" · ") });
        if (profiles[user]) profiles[user].csvDivisions = unique(array(profiles[user].csvDivisions).concat("d1"));
      });
    });
    drivers.freeAgents = freeAgents;
    drivers.recentMoves = array(drivers.recentMoves).filter(function (move) {
      var current = activeNames.get(identity(move.driver));
      return current && current.team === move.team && current.number === text(move.number);
    }).map(function (move) { return Object.assign({}, move, { make: activeNames.get(identity(move.driver)).make }); });
    array(drivers.openEntries).forEach(function (entry) { if (entry.user) entry.user = canonical(entry.user); });
    array(data.race && data.race.drivers).forEach(function (driver) { if (driver.id) driver.id = canonical(driver.id); });
    array(data.records).forEach(function (record) {
      array(record.entries).forEach(function (entry) { if (entry.user) entry.user = canonical(entry.user); });
      array(record.qualifying).concat(array(record.finishes)).forEach(function (row) { if (row.username) row.username = canonical(row.username); });
      array(record.stages).forEach(function (stage) { array(stage.results).forEach(function (row) { if (row.username) row.username = canonical(row.username); }); });
      array(record.bonuses).forEach(function (row) { if (row.driverUsername) row.driverUsername = canonical(row.driverUsername); });
      ["winnerUsername", "poleUsername"].forEach(function (key) { if (record[key]) record[key] = canonical(record[key]); });
    });
    var correctionMap = new Map();
    array(data.standings).forEach(function (row) {
      var wasCanonical = identity(row.username) === identity(canonical(row.username));
      row.username = canonical(row.username);
      row.id = row.division + ":" + identity(row.username);
      var team = row.division === "d1" && drivers.teams.find(function (team) { return team.entries.some(function (entry) { return identity(entry.user) === identity(row.username); }); });
      var entry = team && team.entries.find(function (entry) { return identity(entry.user) === identity(row.username); });
      if (entry) {
        if (!row.nameManual || !hasName(row.name)) row.name = text(entry.name) || text((profiles[entry.user] || {}).alias) || text(row.name) || entry.user;
        row.number = entry.number;
      }
      if (!correctionMap.has(row.id) || wasCanonical) correctionMap.set(row.id, row);
    });
    if (Array.isArray(data.standings)) data.standings = Array.from(correctionMap.values());
    drivers.assignmentVersion = 1;
    return presentation(data);
  }

  root.UARLCurrentRoster = { apply: apply };
})(typeof window !== "undefined" ? window : globalThis);
