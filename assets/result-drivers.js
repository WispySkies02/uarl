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
    "jjelliott2004": ["James", "JJ Whitlock"],
    "aokikoto": ["Wispy", "Hailey", "Hailey Bell"],
    "guillermochase": ["Gman", "Guillermo Chase"],
    "lancejuly": ["Lance", "Lance July"],
    "iikyle5larson": ["Rocky", "Regan Linney"],
    "anygameanytime09": ["Muffin"]
  };
  function register(data) {
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
  function profile(data, user) {
    var profiles = data.drivers && data.drivers.profiles || {};
    var key = Object.keys(profiles).find(function (key) { return identity(key) === identity(user); });
    return key ? profiles[key] : {};
  }
  function profileUser(data, name) {
    if (!nameIdentity(name)) return "";
    var profiles = data.drivers && data.drivers.profiles || {};
    var matches = Object.keys(profiles).filter(function (user) { return [profiles[user].alias].concat(profiles[user].csvAliases || []).some(function (alias) { return nameIdentity(alias) === nameIdentity(name); }); });
    return matches.length === 1 ? text(matches[0]).replace(/^@/, "") : "";
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
    var explicitName = text(entry.name || entry.driver);
    if (!user) user = profileUser(data, explicitName);
    var saved = profile(data, user);
    var name = explicitName || text(saved.alias) || user;
    return {
      key: user ? "user:" + identity(user) : "name:" + nameIdentity(name),
      name: name, number: number(entry.number), user: user,
      team: text(team), source: source,
      aliases: unique([nameIdentity(name), nameIdentity(explicitName), nameIdentity(saved.alias), identity(user)].concat((Array.isArray(saved.csvAliases) ? saved.csvAliases : []).map(nameIdentity), (Array.isArray(entry.csvAliases) ? entry.csvAliases : []).map(nameIdentity))),
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

  root.UARLResultDrivers = { register: register, pool: pool, resolve: resolve, optionsForCurrent: optionsForCurrent, bonusPool: bonusPool, bonusIssues: bonusIssues };
})(typeof window !== "undefined" ? window : globalThis);
