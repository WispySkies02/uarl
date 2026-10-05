(function () {
  "use strict";

  var cache = null;
  var promise = null;
  var PREVIEW_KEY = "uarl-admin-preview-v1";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalize(data) {
    data = data && typeof data === "object" ? data : {};
    ["events", "records", "paints", "guide", "conduct"].forEach(function (key) {
      if (!Array.isArray(data[key])) data[key] = [];
    });
    if (!data.drivers || typeof data.drivers !== "object") data.drivers = {};
    ["teams", "openEntries", "freeAgents", "recentMoves"].forEach(function (key) {
      if (!Array.isArray(data.drivers[key])) data.drivers[key] = [];
    });
    if (!data.drivers.profiles || typeof data.drivers.profiles !== "object") data.drivers.profiles = {};
    if (!data.race || typeof data.race !== "object") data.race = { drivers: [], schedule: [], series: {} };
    if (!data.history || typeof data.history !== "object") data.history = { league: { winners: [] }, divisions: [] };
    function numberOrder(a,b) {
      var an=parseInt(a&&a.number,10),bn=parseInt(b&&b.number,10);
      if(Number.isFinite(an)&&Number.isFinite(bn)&&an!==bn)return an-bn;
      if(Number.isFinite(an)!==Number.isFinite(bn))return Number.isFinite(an)?-1:1;
      return String(a&&a.number||"").localeCompare(String(b&&b.number||""),undefined,{numeric:true});
    }
    data.drivers.openEntries.sort(numberOrder);
    data.drivers.teams.forEach(function(team){if(Array.isArray(team.entries))team.entries.sort(numberOrder);});
    data.paints = data.paints.map(function (paint) {
      if (!paint.search) {
        paint.search = [paint.name, paint.handle, paint.number, paint.team, paint.division, paint.make, paint.series, paint.title, paint.body, paint.id]
          .filter(Boolean).join(" ").toLowerCase();
      }
      return paint;
    });
    data.race.schedule = data.events.map(function (event) {
      return {
        id: event.id, division: event.division, start: event.start || event.date, name: event.name || event.event,
        track: event.track, exhibition: Boolean(event.exhibition), round: event.round, originalStart: event.originalStart,
        scheduleStatus: event.scheduleStatus, crownJewel: Boolean(event.crownJewel), chase: Boolean(event.chase), special: event.special
      };
    });
    var archivedDrivers = Array.isArray(data.race.drivers) ? data.race.drivers.filter(function (driver) { return driver.division === "d2"; }) : [];
    var activeDrivers = [];
    data.drivers.teams.forEach(function (team) {
      (team.entries || []).forEach(function (entry) {
        if (!entry.user || /^Open/.test(entry.status || "") || /Development|Part-Time Charter/.test(entry.status || "")) return;
        var profile = data.drivers.profiles[entry.user] || {};
        activeDrivers.push({
          id: entry.user, name: profile.alias || entry.name || entry.user, number: entry.number, division: "d1",
          team: team.name, make: team.make, careerWins: Number(profile.wins || 0), careerTitles: Number(profile.championships || 0),
          careerRank: Number(profile.rank || 0), status: entry.status || "FT"
        });
      });
    });
    data.drivers.openEntries.forEach(function (entry) {
      var profile = data.drivers.profiles[entry.user] || {};
      activeDrivers.push({
        id: entry.user, name: entry.name || profile.alias || entry.user, number: entry.number, division: "open",
        team: entry.team || "Independent entry", make: entry.make || "Generic", careerWins: Number(profile.wins || 0),
        careerTitles: Number(profile.championships || 0), careerRank: Number(profile.rank || 0), status: entry.status || "FT"
      });
    });
    data.race.drivers = activeDrivers.concat(archivedDrivers).sort(function(a,b){return String(a.division||"").localeCompare(String(b.division||""))||numberOrder(a,b);});
    function identityKey(value){return String(value||"").trim().toLowerCase();}
    function guestIdentity(record,entry){
      if(entry.user)return entry.user;
      if(entry.driverId)return entry.driverId;
      var slug=identityKey(entry.name||("car-"+(entry.number||"unknown"))).replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
      entry.driverId="guest:"+(record.division||"series")+":"+slug;return entry.driverId;
    }
    function recordCandidates(record){
      var candidates=data.race.drivers.filter(function(driver){return driver.division===record.division;}).map(function(driver){return {id:driver.id,user:driver.id,name:driver.name,number:String(driver.number||"")};});
      (record.entries||[]).forEach(function(entry){var id=guestIdentity(record,entry);candidates.push({id:id,user:entry.user||"",name:entry.name||entry.user||("Car #"+entry.number),number:String(entry.number||"")});});
      return candidates;
    }
    function resolveParticipant(record,row,nameField,idField){
      if(!row||typeof row!=="object")return;
      var candidates=recordCandidates(record),id=identityKey(row[idField]||row.username||row.user||row.driverId),name=identityKey(row[nameField]),number=String(row.number||"");
      var match=id&&candidates.find(function(driver){return identityKey(driver.id)===id||identityKey(driver.user)===id;});
      if(!match&&name)match=candidates.find(function(driver){return identityKey(driver.name)===name||identityKey(driver.user)===name||identityKey(driver.id)===name;});
      if(!match&&!name&&number)match=candidates.find(function(driver){return driver.number===number;});
      if(match){row[idField]=match.id;row[nameField]=match.name;row.number=row.number||match.number;}
      else if(!row[idField]){var fallback=String(row[nameField]||row.number||"unknown").toLowerCase().replace(/[^a-z0-9]+/g,"-");row[idField]="guest:"+(record.division||"series")+":"+fallback;}
      if(!row[nameField])row[nameField]=row.user||row.username||row.driverId||("Car #"+(row.number||"—"));
    }
    data.records.forEach(function(record){
      if(!Array.isArray(record.entries))record.entries=[];
      record.entries.forEach(function(entry){guestIdentity(record,entry);});
      (record.qualifying||[]).forEach(function(row){resolveParticipant(record,row,"name","username");});
      (record.finishes||[]).forEach(function(row){resolveParticipant(record,row,"name","username");});
      (record.stages||[]).forEach(function(stage){(stage.results||[]).forEach(function(row){resolveParticipant(record,row,"name","username");});});
      (record.bonuses||[]).forEach(function(row){resolveParticipant(record,row,"driver","driverUsername");});
      if(record.winner){var winner={name:record.winner,username:record.winnerUsername};resolveParticipant(record,winner,"name","username");record.winner=winner.name;record.winnerUsername=winner.username;}
      if(record.pole){var pole={name:record.pole,username:record.poleUsername};resolveParticipant(record,pole,"name","username");record.pole=pole.name;record.poleUsername=pole.username;}
    });
    return data;
  }

  function previewData() {
    if (new URLSearchParams(location.search).get("preview") !== "admin") return null;
    try {
      var value = localStorage.getItem(PREVIEW_KEY);
      return value ? normalize(JSON.parse(value)) : null;
    } catch (error) {
      return null;
    }
  }

  function load(force) {
    var preview = previewData();
    if (preview) return Promise.resolve(clone(preview));
    if (cache && !force) return Promise.resolve(clone(cache));
    if (promise && !force) return promise.then(clone);
    promise = fetch("/.netlify/functions/admin-publish", { cache: "no-store", credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) throw new Error("Live data is unavailable");
        return response.json();
      })
      .then(function (record) {
        if (record && record.data) return record.data;
        throw new Error("No live data has been published");
      })
      .catch(function () {
        return fetch("/data/uarl.json?runtime=1", { cache: "no-store" }).then(function (response) {
          if (!response.ok) throw new Error("Unable to load UARL data (" + response.status + ")");
          return response.json();
        });
      })
      .then(function (data) {
        cache = normalize(data);
        return clone(cache);
      })
      .finally(function () { promise = null; });
    return promise;
  }

  function formatDate(start) {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", timeZoneName: "short"
      }).format(new Date(start)).replace(" EDT", " ET").replace(" EST", " ET");
    } catch (error) {
      return start || "Date TBA";
    }
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function renderSchedule(root, events) {
    if (!root || !Array.isArray(events)) return;
    ["d1", "d2", "open"].forEach(function (division) {
      var section = root.querySelector('[data-uarl-series-section="' + division + '"]');
      if (!section) return;
      var list = section.querySelector(".uarl-race-list");
      if (!list) return;
      var rows = events.filter(function (event) { return event.division === division; })
        .sort(function (a, b) { return new Date(a.start || a.date) - new Date(b.start || b.date); });
      list.innerHTML = rows.map(function (event) {
        var specialClass = event.id && event.id.indexOf("clash") !== -1 ? " uarl-special-clash" : event.id && event.id.indexOf("allstar") !== -1 ? " uarl-special-allstar" : "";
        var flags = [event.crownJewel ? "CROWN JEWEL" : "", event.chase ? "THE CHASE" : "", event.special || ""].filter(Boolean);
        var round = event.round == null ? "EX" : String(event.round).padStart(2, "0");
        var label = formatDate(event.start || event.date);
        return '<li class="uarl-race-row' + specialClass + '" data-event-id="' + esc(event.id) + '" data-race-label="' + esc(label) + '" data-race-start="' + esc(event.start || event.date) + '" data-series="' + esc(division) + '" data-laps="' + esc(event.laps || "") + '" data-crown-jewel="' + String(Boolean(event.crownJewel)) + '" data-schedule-status="' + esc(event.scheduleStatus || "") + '">' +
          '<div class="uarl-round"><small>' + (event.round == null ? "Event" : "Round") + '</small>' + round + '</div>' +
          '<div class="uarl-race-name">' + esc(event.name || event.event || "Event TBA") + (flags.length ? '<small class="uarl-runtime-flags">' + esc(flags.join(" · ")) + '</small>' : "") + '</div>' +
          '<div class="uarl-track">' + esc(event.track || "Track TBA") + '</div>' +
          '<time class="uarl-race-date" datetime="' + esc(event.start || event.date) + '"><small>Race day</small>' + esc(label) + (event.laps ? '<span>' + esc(event.laps) + ' laps</span>' : "") + '</time></li>';
      }).join("");
    });
  }

  window.UARLData = {
    load: load,
    normalize: normalize,
    renderSchedule: renderSchedule,
    previewKey: PREVIEW_KEY
  };
})();
