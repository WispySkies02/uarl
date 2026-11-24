(function (root) {
  "use strict";

  function text(value) { return String(value == null ? "" : value).trim(); }
  function identity(value) { return text(value).replace(/^@/, "").toLowerCase(); }
  function nameIdentity(value) { return identity(value).replace(/^#\s*\d+[a-z]?\s*[·:–—-]?\s*/i, ""); }
  function number(value) { return text(value); }
  function unique(values) { return Array.from(new Set(values.filter(Boolean))); }
  // Confirmed league identities. These add lookup names; they never replace the
  // display name, team, or number an administrator has saved.
  var confirmedNames = {
    "58bbwapache": ["Dale", "Dale Apache"],
    "un88475544": ["Nurtec", "Haydon Hildebrand"],
    "pa05": ["Payson", "Payson Avery"],
    "codydgoforth": ["Cody", "Cody Goforth"],
    "tbdan1e": ["Daniel", "Daniel Heale"],
    "comodw": ["Jay", "Jay Vixen"],
    "john_hunter38": ["John", "John Hunter"],
    "jjelliott2004": ["James", "JJ", "JJ Whitlock"],
    "aokikoto": ["Wispy", "Hailey", "Hailey Bell"],
    "guillermochase": ["Gman", "Guillermo Chase"],
    "lancejuly": ["Lance", "Lance July"],
    "iikyle5larson": ["Rocky", "Regan Linney"],
    "anygameanytime09": ["Muffin"]
  };
  function registerInitialRoster(data) {
    data = data || {};
    if (!data.drivers || typeof data.drivers !== "object") data.drivers = {};
    var drivers = data.drivers;
    if (!drivers.profiles || typeof drivers.profiles !== "object") drivers.profiles = {};
    var profiles = drivers.profiles;
    if (Number(drivers.rosterVersion) >= 1) return data;
    function ensure(user, fallbackName) {
      var key = Object.keys(profiles).find(function (key) { return identity(key) === identity(user); }) || user;
      if (!Object.hasOwn(profiles, key)) Object.defineProperty(profiles, key, { value: { alias: fallbackName, wins: 0, championships: 0, rank: 0 }, enumerable: true, writable: true, configurable: true });
      var saved = profiles[key];
      if (!Array.isArray(saved.csvDivisions)) saved.csvDivisions = ["d1"];
      return saved;
    }
    ensure("UN88475544", "Nurtec");
    ensure("AnyGameAnyTime09", "Muffin");
    (drivers.freeAgents || []).forEach(function (entry) {
      var user = text(entry.user || entry.username).replace(/^@/, "");
      if (!/^[A-Za-z0-9_]{3,20}$/.test(user)) return;
      var saved = ensure(user, text(entry.name) || user);
      saved.csvDivisions = unique(saved.csvDivisions.concat("d1"));
    });
    Object.keys(profiles).forEach(function (user) {
      var names = Object.hasOwn(confirmedNames, identity(user)) ? confirmedNames[identity(user)] : null;
      if (names) profiles[user].csvAliases = unique((Array.isArray(profiles[user].csvAliases) ? profiles[user].csvAliases : []).concat(names));
    });
    // Carry verified entries from older race records into the permanent roster.
    // Saved classifications keep their race-specific numbers and presentation.
    (data.records || []).forEach(function (record) {
      if (!["d1", "open"].includes(record.division)) return;
      (record.entries || []).forEach(function (entry) {
        var user = text(entry.user || entry.username).replace(/^@/, "");
        if (!/^[A-Za-z0-9_]{3,20}$/.test(user)) return;
        var key = Object.keys(profiles).find(function (key) { return identity(key) === identity(user); }) || user;
        if (!Object.hasOwn(profiles, key)) Object.defineProperty(profiles, key, { value: { alias: text(entry.name) || user, wins: 0, championships: 0, rank: 0 }, enumerable: true, writable: true, configurable: true });
        var saved = profiles[key];
        saved.csvDivisions = unique((Array.isArray(saved.csvDivisions) ? saved.csvDivisions : []).concat(record.division));
        if (entry.name) saved.csvAliases = unique((Array.isArray(saved.csvAliases) ? saved.csvAliases : []).concat(text(entry.name)));
      });
    });
    drivers.rosterVersion = 1;
    return data;
  }
  function registerNumbers(data) {
    data = registerInitialRoster(data);
    var drivers = data.drivers;
    if (Number(drivers.rosterVersion) >= 2) return data;
    // Apply the confirmed current number once, including already-published data
    // and browser drafts. Older race classifications retain their own numbers.
    var muffin = Object.keys(drivers.profiles).find(function (user) { return identity(user) === "anygameanytime09"; });
    if (muffin) drivers.profiles[muffin].number = "2";
    (drivers.teams || []).forEach(function (team) {
      (team.entries || []).concat(team.pendingDrivers || []).forEach(function (entry) {
        if (identity(entry.user || entry.username) === "anygameanytime09") entry.number = "2";
      });
    });
    (drivers.freeAgents || []).forEach(function (entry) { if (identity(entry.user || entry.username) === "anygameanytime09" && Object.hasOwn(entry, "number")) entry.number = "2"; });
    (data.standings || []).forEach(function (entry) { if (entry.division === "d1" && identity(entry.username) === "anygameanytime09") entry.number = "2"; });
    drivers.rosterVersion = 2;
    return data;
  }
  function register(data) {
    data = registerNumbers(data);
    data = root.UARLCurrentRoster ? root.UARLCurrentRoster.apply(data) : data;
    repairJJUsername(data);
    // Roster membership uses the permanent account, while currentUsername is a label.
    var drivers = data.drivers;
    (drivers.teams || []).forEach(function (team) { (team.entries || []).concat(team.pendingDrivers || []).forEach(function (entry) { if (entry.user) entry.user = canonicalUser(data, entry.user); }); });
    (drivers.openEntries || []).forEach(function (entry) { if (entry.user) entry.user = canonicalUser(data, entry.user); });
    repairConfirmedStandingsIdentities(data);
    return data;
  }
  function confirmedStandingsConflict(data) {
    data = data || {};
    var drivers = data.drivers || {}, source = "pxssls", profiles = drivers.profiles || {};
    function array(value) { return Array.isArray(value) ? value : []; }
    function references(entry) {
      return entry && [entry.user, entry.username, entry.driverId, entry.driverUsername, entry.id].some(function (value) { return identity(value) === source; });
    }
    function profileReferences(savedProfiles) {
      return Object.keys(savedProfiles || {}).some(function (user) {
        var saved = savedProfiles[user] || {};
        return [user, saved.currentUsername].concat(array(saved.usernameAliases)).some(function (value) { return identity(value) === source; });
      });
    }
    if (profileReferences(profiles) || profileReferences(drivers.previousRoster && drivers.previousRoster.profiles)) return true;
    function rosterReferences(roster) {
      roster = roster || {};
      return array(roster.teams).some(function (team) { return array(team.entries).concat(array(team.pendingDrivers)).some(references); }) || array(roster.openEntries).concat(array(roster.freeAgents), array(roster.archivedDrivers)).some(references);
    }
    if (rosterReferences(drivers) || rosterReferences(drivers.previousRoster) || array(data.race && data.race.drivers).some(references)) return true;
    return array(data.records).some(function (record) {
      return identity(record.winnerUsername) === source || identity(record.poleUsername) === source || array(record.entries).concat(array(record.finishes), array(record.qualifying), array(record.bonuses)).some(references) || array(record.stages).some(function (stage) { return array(stage.results).some(references); });
    });
  }
  function confirmedStandingsUsername(data, value) {
    // The user confirmed this exact imported typo belongs to pxssis. This is
    // deliberately not a spelling-similarity rule for other driver accounts.
    return canonicalUser(data || {}, identity(value) === "pxssls" && !confirmedStandingsConflict(data) ? "pxssis" : value);
  }
  function repairConfirmedStandingsIdentities(data) {
    if (!data || !data.drivers || Number(data.drivers.standingsIdentityVersion) >= 1) return data;
    var drivers = data.drivers, saved = Array.isArray(data.standings) ? data.standings : [], source = "pxssls", target = canonicalUser(data, "pxssis"), targetKey = identity(target);
    if (confirmedStandingsConflict(data)) { drivers.standingsIdentityVersion = 1; return data; }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function points(value) { var result = Number(value); return Number.isFinite(result) ? result : 0; }
    function rawPoints(division) {
      if (root.UARLStandings && root.UARLStandings.calculate) {
        var row = root.UARLStandings.calculate(data, division, { allDrivers: true }).find(function (row) { return identity(canonicalUser(data, row.id)) === targetKey; });
        return row ? row.rawPoints : 0;
      }
      var total = 0, uncertain = false;
      (data.records || []).filter(function (record) { return record.division === division && record.pointsEvent !== false && !record.exhibition; }).forEach(function (record) {
        (record.finishes || []).forEach(function (finish) {
          var user = finish.username || finish.user || finish.driverId;
          if (!user) { uncertain = true; return; }
          if (identity(canonicalUser(data, user)) === targetKey) total += points(finish.points) + points(finish.stagePoints);
        });
      });
      // Drivers pages do not load the scorer. Defer an ambiguous legacy result
      // until the scorer is available instead of guessing its raw points.
      return uncertain ? null : total;
    }
    var deferred = false;
    ["d1", "open"].forEach(function (division) {
      var originals = saved.filter(function (row) { return row.division === division && [source, targetKey].includes(identity(canonicalUser(data, row.username))); });
      if (!originals.some(function (row) { return identity(row.username) === source; })) return;
      var winner = originals[originals.length - 1], wrongWinner = identity(winner.username) === source, raw = wrongWinner ? rawPoints(division) : 0;
      if (raw == null) { deferred = true; return; }
      var next = Object.assign({}, winner, { id: division + ":" + targetKey, username: target });
      if (wrongWinner) next.pointsAdjustment = points(winner.pointsAdjustment) - raw;
      if (!Number.isSafeInteger(next.pointsAdjustment)) { deferred = true; return; }
      if (identity(next.name) === source) {
        var profileName = profile(data, target).alias;
        var roster = division === "open" ? drivers.openEntries || [] : (drivers.teams || []).flatMap(function (team) { return (team.entries || []).concat(team.pendingDrivers || []); });
        var entry = roster.find(function (row) { return identity(canonicalUser(data, row.user || row.username || row.driverId)) === targetKey; });
        var canonicalName = originals.filter(function (row) { return identity(row.username) !== source && text(row.name) && identity(row.name) !== source; }).map(function (row) { return row.name; }).pop();
        next.name = text(profileName) || text(entry && entry.name) || text(canonicalName) || target;
      }
      next.csvAliases = unique(originals.flatMap(function (row) { return Array.isArray(row.csvAliases) ? row.csvAliases : []; }).concat("Pxssls").map(text));
      if (!Array.isArray(drivers.standingsIdentityBackups)) drivers.standingsIdentityBackups = [];
      drivers.standingsIdentityBackups.push({ from: "Pxssls", to: target, division: division, standings: clone(originals) });
      var originalSet = new Set(originals);
      saved = saved.filter(function (row) { return !originalSet.has(row) || row === winner; }).map(function (row) { return row === winner ? next : row; });
      data.standings = saved;
    });
    if (!deferred) drivers.standingsIdentityVersion = 1;
    return data;
  }
  function repairJJUsername(data) {
    var drivers = data.drivers, profiles = drivers.profiles || {};
    if (Number(drivers.jjUsernameVersion) >= 1) return;
    // The user confirmed these two handles belong to JJ. Never infer account
    // changes from a shared display name, car number or manufacturer.
    var original = "JJElliott2004", current = "JamesRacer22", keys = Object.keys(profiles);
    var oldKey = keys.find(function (key) { return identity(key) === identity(original); });
    var newKey = keys.find(function (key) { return identity(key) === identity(current); });
    var stable = oldKey || original;
    var sources = unique([oldKey, newKey]);
    var roster = (drivers.teams || []).flatMap(function (team) { return (team.entries || []).concat(team.pendingDrivers || []); }).concat(drivers.openEntries || []);
    if (!sources.length && !roster.some(function (entry) { return [identity(original), identity(current)].includes(identity(entry.user)); })) return;
    var merged = {};
    sources.forEach(function (key) { Object.assign(merged, profiles[key]); });
    ["numberImage", "signatureImage"].forEach(function (field) {
      var artwork = sources.map(function (key) { return profiles[key][field]; }).filter(function (value) { return text(value); });
      if (artwork.length) merged[field] = artwork[artwork.length - 1];
    });
    if (sources.some(function (key) { return key !== stable; })) drivers.jjUsernameBackup = sources.map(function (key) { return { user: key, profile: JSON.parse(JSON.stringify(profiles[key])) }; });
    ["wins", "championships"].forEach(function (field) { merged[field] = Math.max(0, ...sources.map(function (key) { return Number(profiles[key][field]) || 0; })); });
    if (!(Number(merged.rank) > 0)) { var ranks = sources.map(function (key) { return Number(profiles[key].rank) || 0; }).filter(function (rank) { return rank > 0; }); merged.rank = ranks[0] || 0; }
    if (!text(merged.alias)) merged.alias = "JJ";
    if (!text(merged.number)) merged.number = "84";
    merged.usernameAliases = unique(sources.flatMap(function (key) { return [key, profiles[key].currentUsername].concat(profiles[key].usernameAliases || []); }).concat(original, current).map(text));
    merged.csvAliases = unique(sources.flatMap(function (key) { return profiles[key].csvAliases || []; }).concat("JJ", "JJ Whitlock", original, current));
    merged.csvDivisions = unique(sources.flatMap(function (key) { return profiles[key].csvDivisions || []; }).concat("d1"));
    merged.currentUsername = current;
    sources.forEach(function (key) { if (key !== stable) delete profiles[key]; });
    Object.defineProperty(profiles, stable, { value: merged, enumerable: true, configurable: true, writable: true });
    drivers.jjUsernameVersion = 1;
  }
  function profile(data, user) {
    var profiles = data.drivers && data.drivers.profiles || {};
    var key = Object.keys(profiles).find(function (key) { return identity(key) === identity(user); });
    return key ? profiles[key] : {};
  }
  function profileUser(data, name) {
    if (!nameIdentity(name)) return "";
    var profiles = data.drivers && data.drivers.profiles || {};
    var matches = Object.keys(profiles).filter(function (user) { return [profiles[user].alias, profiles[user].currentUsername].concat(profiles[user].csvAliases || []).some(function (alias) { return nameIdentity(alias) === nameIdentity(name); }); });
    return matches.length === 1 ? text(matches[0]).replace(/^@/, "") : "";
  }
  function canonicalUser(data, value) {
    var profiles = data.drivers && data.drivers.profiles || {}, id = identity(value);
    var exact = Object.keys(profiles).find(function (user) { return identity(user) === id; });
    if (exact) return exact;
    var renamed = Object.keys(profiles).filter(function (user) { return [profiles[user].currentUsername].concat(profiles[user].usernameAliases || []).some(function (alias) { return identity(alias) === id; }); });
    return id && renamed.length === 1 ? renamed[0] : text(value).replace(/^@/, "");
  }
  function updateUsername(data, user, value) {
    var profiles = data.drivers && data.drivers.profiles || {};
    var key = canonicalUser(data, user), saved = profiles[key];
    if (!Object.hasOwn(profiles, key) || !saved || typeof saved !== "object") throw new Error("This driver no longer exists. Reload the roster before editing.");
    var next = text(value).replace(/^@/, "");
    if (next && !/^[A-Za-z0-9_]{3,20}$/.test(next)) throw new Error("Enter a Roblox username with 3–20 letters, numbers or underscores.");
    var conflict = next && Object.keys(profiles).some(function (other) {
      return other !== key && [other, profiles[other].currentUsername].concat(profiles[other].usernameAliases || []).some(function (name) { return identity(name) === identity(next); });
    });
    if (conflict) throw new Error("That username already belongs to another driver. Their records have not been combined.");
    saved.usernameAliases = unique((saved.usernameAliases || []).concat(saved.currentUsername || "", key).map(function (name) { return text(name).replace(/^@/, ""); }));
    saved.currentUsername = next;
    return key;
  }
  function active(entry) {
    entry = entry || {};
    var status = text(entry.status), name = text(entry.name);
    if (/^open\b/i.test(status) && !/^open\s+series$/i.test(status) || /^(vacant|inactive|disabled|retired|released|unsigned)\b/i.test(status)) return false;
    if (/^(open|vacant|tbd|tba)$/i.test(name)) return false;
    if (!entry.user && /^(?:(?:part[ -]time|development|shared)\s+)?(?:entry|charter|seat)$/i.test(name)) return false;
    return Boolean(text(entry.user || entry.driverId) || name);
  }
  function driver(data, entry, team, source) {
    entry = entry || {};
    var user = text(entry.user || entry.username || entry.driverUsername || entry.driverId).replace(/^@/, "");
    if (user) user = canonicalUser(data, user);
    var explicitName = text(entry.name || entry.driver);
    if (!user) user = profileUser(data, explicitName);
    var saved = profile(data, user);
    var name = explicitName || text(saved.alias) || user;
    return {
      key: user ? "user:" + identity(user) : "name:" + nameIdentity(name),
      name: name, number: number(entry.number), user: user,
      team: text(team), source: source,
      aliases: unique([nameIdentity(name), nameIdentity(explicitName), nameIdentity(saved.alias), identity(user), identity(saved.currentUsername)].concat((Array.isArray(saved.csvAliases) ? saved.csvAliases : []).map(nameIdentity), (Array.isArray(entry.csvAliases) ? entry.csvAliases : []).map(nameIdentity), (Array.isArray(saved.usernameAliases) ? saved.usernameAliases : []).map(identity))),
      usernameAliases: unique([saved.currentUsername].concat(saved.usernameAliases || []).map(identity)).filter(function (alias) { return alias !== identity(user); }),
      explicitName: Boolean(explicitName)
    };
  }
  function aliasMatches(candidate, name) {
    var key = nameIdentity(name);
    return Boolean(key && (nameIdentity(candidate.name) === key || (candidate.aliases || []).includes(key)));
  }
  function merge(target, incoming) {
    target.aliases = unique((target.aliases || []).concat(incoming.aliases || []));
    if (!target.number && incoming.number) target.number = incoming.number;
    if (!target.team && incoming.team) target.team = incoming.team;
    if (incoming.source === "guest" || incoming.source === "finish") {
      if (incoming.explicitName) target.name = incoming.name;
      if (incoming.number) target.number = incoming.number;
      target.source = incoming.source;
    }
    return target;
  }
  function deduplicate(raw) {
    var known = new Map(), unnamed = [];
    raw.forEach(function (candidate) {
      if (!candidate.name && !candidate.user) return;
      if (candidate.user) {
        var key = identity(candidate.user);
        if (known.has(key)) merge(known.get(key), candidate);
        else known.set(key, Object.assign({}, candidate, { aliases: candidate.aliases.slice() }));
      } else unnamed.push(candidate);
    });
    var result = Array.from(known.values());
    unnamed.forEach(function (candidate) {
      // A name-only signing and a verified roster entry may describe one driver.
      // Never merge two known usernames simply because their names or numbers match.
      var matches = result.filter(function (other) { return other.user && aliasMatches(other, candidate.name); });
      if (matches.length === 1) { merge(matches[0], candidate); return; }
      var same = result.find(function (other) {
        return !other.user && nameIdentity(other.name) === nameIdentity(candidate.name) &&
          other.number === candidate.number && other.team === candidate.team;
      });
      if (same) merge(same, candidate); else result.push(Object.assign({}, candidate, { aliases: candidate.aliases.slice() }));
    });
    result.forEach(function (candidate) {
      if (candidate.user) return;
      var sameName = result.filter(function (other) { return !other.user && nameIdentity(other.name) === nameIdentity(candidate.name); });
      if (sameName.length > 1) candidate.key += ":" + encodeURIComponent(candidate.team) + ":" + encodeURIComponent(candidate.number);
    });
    return result.sort(function (a, b) {
      var an = parseInt(a.number, 10), bn = parseInt(b.number, 10);
      if (Number.isFinite(an) !== Number.isFinite(bn)) return Number.isFinite(an) ? -1 : 1;
      if (Number.isFinite(an) && an !== bn) return an - bn;
      return a.name.localeCompare(b.name) || identity(a.user).localeCompare(identity(b.user)) || a.team.localeCompare(b.team);
    });
  }
  function pool(data, record) {
    data = data || {}; record = record || {};
    var drivers = data.drivers || {}, raw = [], division = record.division || "d1";
    if (division === "d1") {
      (drivers.teams || []).forEach(function (team) {
        (team.entries || []).concat(team.pendingDrivers || []).filter(active).forEach(function (entry) {
          raw.push(driver(data, entry, team.name, "roster"));
        });
      });
    } else if (division === "open") {
      (drivers.openEntries || []).filter(active).forEach(function (entry) { raw.push(driver(data, entry, entry.team || "Open Series", "roster")); });
    } else if (division === "d2") {
      ((data.race || {}).drivers || []).filter(function (entry) { return entry.division === "d2"; }).forEach(function (entry) {
        raw.push(driver(data, Object.assign({}, entry, { user: entry.user || entry.id }), entry.team, "archive"));
      });
    }
    if (division !== "d2") Object.keys(drivers.profiles || {}).forEach(function (user) {
      var saved = drivers.profiles[user];
      if (!Array.isArray(saved.csvDivisions) || !saved.csvDivisions.includes(division) || !active({ user: user, status: saved.status })) return;
      raw.push(driver(data, { user: user, name: saved.alias, number: saved.number }, "Unassigned driver", "registered"));
    });
    (record.entries || []).filter(active).forEach(function (entry) { raw.push(driver(data, entry, "Race guest", "guest")); });
    return deduplicate(raw);
  }
  function resolve(candidates, name, user, carNumber) {
    candidates = candidates || [];
    var id = identity(user);
    if (id) {
      var exact = candidates.find(function (candidate) { return identity(candidate.user) === id; });
      if (exact) return exact;
      var renamed = candidates.filter(function (candidate) { return (candidate.usernameAliases || []).includes(id); });
      if (renamed.length === 1) return renamed[0];
      // Synthetic guest IDs represent legacy name-only rows, not verified
      // Roblox usernames. They may converge on one unambiguous current driver.
      if (/^guest:/i.test(id)) {
        var provisional = candidates.filter(function (candidate) { return aliasMatches(candidate, name); });
        return provisional.length === 1 ? provisional[0] : undefined;
      }
      // Keep a verified saved identity when its uniquely matched roster row has no
      // username yet. An explicit username must never resolve to another user.
      var unverified = candidates.filter(function (candidate) { return !candidate.user && aliasMatches(candidate, name); });
      if (unverified.length === 1) return Object.assign({}, unverified[0], { user: text(user).replace(/^@/, ""), key: "user:" + id });
      return undefined;
    }
    var named = candidates.filter(function (candidate) { return aliasMatches(candidate, name); });
    if (named.length === 1) return named[0];
    if (named.length > 1 && named.every(function (candidate) { return !candidate.user; })) {
      var numbered = named.filter(function (candidate) { return candidate.number && candidate.number === number(carNumber); });
      if (numbered.length === 1) return numbered[0];
    }
    return undefined;
  }
  function optionsForCurrent(candidates, name, user, carNumber) {
    var options = (candidates || []).slice(), matched = resolve(options, name, user, carNumber);
    if (matched) {
      // Preserve a supplied verified username on a name-only roster row, without
      // rendering it a second time as a historical/saved driver.
      if (!options.includes(matched)) {
        var index = options.findIndex(function (candidate) { return candidate.key === matched.key || !candidate.user && aliasMatches(candidate, matched.name); });
        if (index >= 0) options[index] = matched;
      }
      return options;
    }
    if (!text(name) && !text(user)) return options;
    var savedName = text(name).replace(/^#\s*\d+[a-z]?\s*[·:–—-]?\s*/i, "") || text(user);
    options.push({ key: "saved:" + (identity(user) ? "user:" + identity(user) : "name:" + nameIdentity(savedName)), name: savedName, user: text(user).replace(/^@/, ""), number: number(carNumber), team: "", source: "saved", aliases: unique([nameIdentity(savedName), identity(user)]) });
    return options;
  }
  function bonusPool(data, record) {
    record = record || {};
    var roster = pool(data, record);
    var finishes = (record.finishes || []).filter(function (row) { return row && text(row.name || row.driver || row.username || row.driverUsername || row.user); }).map(function (row) {
      var user = row.username || row.driverUsername || row.user;
      var matched = resolve(roster, row.name || row.driver, user, row.number);
      var entry = matched ? Object.assign({}, matched, { name: matched.name, user: /^guest:/i.test(identity(user)) ? matched.user || user : user || matched.user, number: row.numberManual ? number(row.number) : number(row.number) || matched.number }) : row;
      var candidate = driver(data, entry, matched && matched.team, "finish");
      candidate.aliases = unique(candidate.aliases.concat(nameIdentity(row.name || row.driver)));
      return candidate;
    });
    return deduplicate(finishes);
  }

  function bonusIssues(data) {
    var issues = [];
    ((data || {}).records || []).forEach(function (record, recordIndex) {
      record = record || {};
      var candidates = bonusPool(data, record), seen = new Set();
      (record.bonuses || []).forEach(function (bonus, bonusIndex) {
        bonus = bonus || {};
        var recipient = resolve(candidates, bonus.driver, bonus.driverUsername, bonus.number);
        if (!recipient) {
          issues.push({ recordIndex: recordIndex, bonusIndex: bonusIndex, message: "Choose a driver from this race's finishing results for bonus " + (bonusIndex + 1) + "." });
          return;
        }
        // resolve may attach an explicitly supplied identity to an unverified
        // finisher. Its original finisher key still identifies this recipient.
        var original = candidates.find(function (candidate) { return candidate.key === recipient.key; });
        if (!original) original = candidates.find(function (candidate) { return !candidate.user && aliasMatches(candidate, recipient.name); });
        var key = identity(bonus.name) + ":" + (original || recipient).key;
        if (seen.has(key)) issues.push({ recordIndex: recordIndex, bonusIndex: bonusIndex, message: "This driver already has the " + (text(bonus.name) || "same") + " bonus in this race." });
        seen.add(key);
      });
    });
    return issues;
  }

  root.UARLResultDrivers = { register: register, canonicalUser: canonicalUser, confirmedStandingsUsername: confirmedStandingsUsername, repairConfirmedStandingsIdentities: repairConfirmedStandingsIdentities, updateUsername: updateUsername, pool: pool, resolve: resolve, optionsForCurrent: optionsForCurrent, bonusPool: bonusPool, bonusIssues: bonusIssues };
})(typeof window !== "undefined" ? window : globalThis);
