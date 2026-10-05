(function () {
  "use strict";

  var DRAFT_KEY = "uarl-admin-draft-v1";
  var state = { data: null, original: null, section: "dashboard", selected: 0, query: "", dirty: false, changes: 0, user: null, authMode: "login" };
  var view = document.querySelector("[data-admin-view]");
  var toastNode = document.querySelector("[data-toast]");
  var statusNode = document.querySelector("[data-save-status]");
  var statusDot = document.querySelector("[data-status-dot]");
  var publishDialog = document.querySelector("[data-publish-dialog]");
  var loginGate = document.querySelector("[data-login-gate]");
  var adminApp = document.querySelector("[data-admin-app]");
  var loginMessage = document.querySelector("[data-login-message]");
  var adminStarted = false;

  var configs = {
    schedule: {
      title: "Schedule", kicker: "Race operations", description: "Every event, date, status, badge, and start time. The public countdown reads this exact list.", path: "events",
      itemTitle: function (x) { return x.name || "Untitled event"; }, itemMeta: function (x) { return [String(x.division || "").toUpperCase(), x.date || dateOnly(x.start), x.track].filter(Boolean).join(" · "); },
      template: function () { return { id: "new-event-" + Date.now(), division: "d1", series: "L.L. Bean Cup Series", date: dateOnly(new Date()), start: new Date().toISOString(), name: "New Event", track: "Track TBA", round: null, laps: null, exhibition: false, pointsEvent: true, crownJewel: false, chase: false, special: null }; },
      fields: [
        ["id","Event ID"],["division","Division","select",["d1","d2","open"]],["series","Full series name"],["name","Event name","textarea","wide"],["track","Track"],["round","Round","number"],["date","Display date","date"],["start","Start time","datetime"],["laps","Laps","number"],["scheduleStatus","Schedule status","select",["","scheduled","postponed","rescheduled","complete"]],["special","Special label"],["scheduleNote","Schedule note","textarea","wide"],["originalDate","Original date","date"],["originalStart","Original start","datetime"],["exhibition","Exhibition","bool"],["pointsEvent","Points event","bool"],["crownJewel","Crown Jewel","bool"],["chase","Chase race","bool"],["completed","Completed","bool"]
      ], shifts: true
    },
    results: {
      title: "Results + Points", kicker: "Race Center", description: "Official classifications, stages, bonuses, eligibility, and points. Add the result here once race control signs off.", path: "records",
      itemTitle: function (x) { return x.event || x.name || "Untitled result"; }, itemMeta: function (x) { return [String(x.division || "").toUpperCase(), x.date, x.status].filter(Boolean).join(" · "); },
      template: function () { return { id: "result-" + Date.now(), division: "d1", event: "New Race Result", date: dateOnly(new Date()), start: new Date().toISOString(), track: "", status: "complete", eventType: "Points race", pointsEvent: true, exhibition: false, qualifying: [], stages: [], finishes: [], bonuses: [] }; },
      fields: [["id","Event ID"],["division","Division","select",["d1","d2","open"]],["event","Event name","textarea","wide"],["date","Date","date"],["start","Start time","datetime"],["track","Track"],["round","Round","number"],["laps","Laps","number"],["status","Status","select",["complete","official","pending"]],["eventType","Event type"],["winner","Winner","seriesDriver"],["pole","Pole winner","seriesDriver"],["pointsSummary","Points summary"],["pointsNote","Points note","textarea","wide"],["recordNote","Official record note","textarea","wide"],["pointsEvent","Points event","bool"],["exhibition","Exhibition","bool"],["entries","Event-only / guest drivers","eventEntries","wide"],["qualifying","Qualifying classification","classification","wide"],["stages","Stage classifications","stages","wide"],["finishes","Race finish + points","finishes","wide"],["bonuses","Bonuses","bonuses","wide"]]
    },
    teams: {
      title: "Teams + Charters", kicker: "D1 paddock", description: "Team ownership, branding, entries, open seats, and special shared charters.", path: "drivers.teams",
      itemTitle: function (x) { return x.name || "Untitled team"; }, itemMeta: function (x) { return [x.owner && "Owner: " + x.owner, x.make, (x.entries || []).length + " entries"].filter(Boolean).join(" · "); },
      template: function () { return { id: "team-" + Date.now(), name: "New Team", owner: "", make: "Toyota", note: "", entries: [] }; },
      fields: [["id","Team ID"],["name","Team name"],["owner","Owner"],["ownerNote","Owner title / note"],["make","Manufacturer","select",["Toyota","Ford","Chevrolet","Generic"]],["founded","Founded"],["logo","Logo path / URL"],["brandColor","Primary color"],["brandColor2","Secondary color"],["note","Team description","textarea","wide"],["charterCount","Charter count","number"],["entries","Entries + charters","roster","wide"],["pendingDrivers","Pending drivers","roster","wide"]]
    },
    open: {
      title: "Open Series", kicker: "Independent entries", description: "Every active Open Series entry, including part-time status and manufacturer.", path: "drivers.openEntries",
      itemTitle: function (x) { return "#" + (x.number || "—") + " " + (profileName(x.user) || x.name || "Entry"); }, itemMeta: function (x) { return [x.user && "@" + x.user, x.make, x.status].filter(Boolean).join(" · "); },
      template: function () { return { number: "", user: "", make: "Toyota", status: "" }; },
      fields: [["number","Car number"],["user","Roblox username"],["name","Display name override"],["make","Manufacturer","select",["Toyota","Ford","Chevrolet","Generic"]],["status","Status","select",["","Full-Time","Part-Time","Development"]]]
    },
    freeAgents: {
      title: "Free Agents", kicker: "Driver market", description: "Available drivers and their most recent team or charter history.", path: "drivers.freeAgents",
      itemTitle: function (x) { return x.name || x.user || "Free agent"; }, itemMeta: function (x) { return [x.user && "@" + x.user, x.former].filter(Boolean).join(" · "); },
      template: function () { return { name: "New Driver", user: "", former: "" }; }, fields: [["name","Display name"],["user","Roblox username"],["former","Previous entry","textarea","wide"]]
    },
    moves: {
      title: "Recent Moves", kicker: "Transaction wire", description: "Signings and transfers displayed across the Drivers page.", path: "drivers.recentMoves",
      itemTitle: function (x) { return x.driver || "Driver move"; }, itemMeta: function (x) { return [x.team, x.number && "#" + x.number, x.signedAt].filter(Boolean).join(" · "); },
      template: function () { return { driver: "New Driver", team: "", number: "", make: "Toyota", signedAt: dateOnly(new Date()) }; }, fields: [["driver","Driver"],["team","Team"],["number","Number"],["make","Manufacturer","select",["Toyota","Ford","Chevrolet","Generic"]],["signedAt","Signed date","date"]]
    },
    paints: {
      title: "Paint Booth", kicker: "Livery archive", description: "Every paint’s presentation, search metadata, render, scheme ID, and SCR Affiliate status.", path: "paints",
      itemTitle: function (x) { return "#" + (x.number || "—") + " " + (x.title || "Untitled paint"); }, itemMeta: function (x) { return [x.name, x.team, String(x.division || "").toUpperCase(), x.scrAffiliate && "SCR Affiliate"].filter(Boolean).join(" · "); },
      template: function () { return { id: "", division: "d1", series: "D1 · L.L. Bean Cup Series", number: "", name: "", handle: "", team: "", title: "New Paint", subtitle: "", make: "Toyota", body: "BBR Toyota Body", extra: [], image: "", scrAffiliate: false }; },
      fields: [["id","Scheme ID"],["division","Division","select",["d1","d2","open"]],["series","Series label"],["number","Car number"],["name","Driver display name"],["handle","Roblox handle"],["team","Team"],["title","Primary sponsor / title"],["subtitle","Subtitle"],["make","Displayed manufacturer"],["body","Render body / template"],["image","Render image path / URL","textarea","wide"],["scrAffiliate","SCR Affiliate paint","bool"],["extra","Additional tags","tags","wide"],["search","Custom search keywords","textarea","wide"]]
    },
    history: {
      title: "History", kicker: "Record book", description: "Division identities, champions, season wins, and all-time winner tables.", path: "history.divisions",
      itemTitle: function (x) { return x.name || x.division || "Division"; }, itemMeta: function (x) { return [x.division, x.category, (x.seasons || []).length + " seasons"].filter(Boolean).join(" · "); },
      template: function () { return { id: "division-" + Date.now(), division: "New", category: "Series", name: "New Series", logo: "", theme: "cup", seasons: [], winners: [] }; },
      fields: [["id","Division ID"],["division","Short division name"],["category","Category"],["name","Full series name"],["logo","Logo URL","textarea","wide"],["theme","Theme key"],["seasons","Seasons, champions + wins","seasons","wide"],["winners","All-time winner totals","winnerTotals","wide"]]
    },
    guide: {
      title: "Rules + FAQ", kicker: "Competition guide", description: "The complete ordered content stream used by the competition guide.", path: "guide",
      itemTitle: function (x) { return (x.tag || "text").toUpperCase() + " · " + String(x.text || "Untitled").slice(0, 60); }, itemMeta: function (x) { return x.tag === "h2" || x.tag === "h3" ? "Section heading" : "Guide content"; },
      template: function () { return { tag: "p", text: "New rule or answer" }; }, fields: [["tag","Content type","select",["h2","h3","p","li"]],["text","Content","textarea","wide"]]
    },
    conduct: {
      title: "Conduct Rulebook", kicker: "Official regulations", description: "Rule numbers, categories, exact rule language, penalties, and severe-penalty emphasis.", path: "conduct",
      itemTitle: function (x) { return (x.id || "Rule") + " · " + String(x.text || "Untitled rule").slice(0,55); }, itemMeta: function (x) { return [x.group, x.penalty].filter(Boolean).join(" · "); },
      template: function () { return { id: "new-rule-" + Date.now(), group: "race", text: "New rule", penalty: "Staff discretion.", severe: false }; },
      fields: [["id","Rule number / ID"],["group","Rule category","select",["discord","race","penalties","procedures","staff"]],["text","Official rule language","textarea","wide"],["penalty","Penalty / outcome","textarea","wide"],["severe","Severe penalty styling","bool"]]
    }
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function getPath(path) { return path.split(".").reduce(function (value, key) { return value[key]; }, state.data); }
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) { return { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]; }); }
  function dateOnly(value) { var d = value instanceof Date ? value : new Date(value); return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0,10); }
  function toLocal(value) { if (!value) return ""; var d = new Date(value); if (Number.isNaN(d.getTime())) return value; var p = function (n) { return String(n).padStart(2,"0"); }; return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes()); }
  function fromLocal(value) { if (!value) return ""; var d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toISOString(); }
  function profileName(user) { var p = state.data && state.data.drivers && state.data.drivers.profiles && state.data.drivers.profiles[user]; return p && p.alias; }
  function countChanges() { return state.changes || (state.dirty ? 1 : 0); }

  function setStatus(text, mode) {
    statusNode.textContent = text;
    statusDot.className = "status-dot " + (mode || "ready");
  }
  function toast(message, error) {
    toastNode.textContent = message; toastNode.className = "toast show" + (error ? " error" : "");
    clearTimeout(toastNode._timer); toastNode._timer = setTimeout(function () { toastNode.classList.remove("show"); }, 3600);
  }
  function showLogin(message, needsSetup) {
    adminApp.hidden = true;
    loginGate.hidden = false;
    state.authMode = needsSetup ? "setup" : "login";
    document.querySelector("[data-login-title]").textContent = needsSetup ? "Create Owner" : "Race Control";
    document.querySelector("[data-login-copy]").textContent = needsSetup ? "Create the first personal account. This account controls staff access." : "Sign in with your personal staff account.";
    document.querySelector("[data-setup-fields]").hidden = !needsSetup;
    document.querySelector("[data-setup-name]").required = Boolean(needsSetup);
    document.querySelector("[data-setup-key]").required = Boolean(needsSetup);
    document.querySelector("[data-password-label]").textContent = needsSetup ? "Create password" : "Password";
    document.querySelector("[data-login-button]").textContent = needsSetup ? "Create Owner account" : "Sign in";
    loginMessage.textContent = message || "";
    var input = document.querySelector("[data-login-password]");
    if (input) { input.value = ""; input.focus(); }
  }
  function showAdmin(user) {
    if (user) state.user = user;
    loginGate.hidden = true;
    adminApp.hidden = false;
    document.querySelector("[data-current-user]").textContent = state.user ? state.user.displayName : "Staff";
    document.querySelector("[data-current-role]").textContent = state.user ? state.user.role.replace("_"," ") : "Account";
    document.querySelectorAll("[data-owner-only]").forEach(function(node){node.hidden=!state.user||state.user.role!=="owner";});
    document.querySelectorAll("[data-full-admin]").forEach(function(node){node.hidden=Boolean(state.user&&state.user.role==="race_control");});
    configureSections();
    if (!adminStarted) { adminStarted = true; initAdmin(); }
  }
  function configureSections() {
    if(!state.user)return;
    var labels={dashboard:"Dashboard",schedule:"Schedule",results:"Results + points"};
    if(state.user.role!=="race_control")Object.assign(labels,{teams:"Teams + charters",profiles:"Driver profiles",open:"Open Series",freeAgents:"Free agents",moves:"Recent moves",paints:"Paint Booth",history:"History",guide:"Rules + FAQ",conduct:"Conduct rulebook",advanced:"Advanced JSON"});
    if(state.user.role==="owner")labels.accounts="Staff accounts";
    if(!Object.prototype.hasOwnProperty.call(labels,state.section))state.section="dashboard";
    var picker=document.querySelector("[data-mobile-section]");
    if(picker){picker.innerHTML=Object.keys(labels).map(function(key){return '<option value="'+key+'">'+labels[key]+'</option>';}).join("");picker.value=state.section;}
  }
  async function checkSession() {
    try {
      var response = await fetch("/.netlify/functions/admin-publish?status=1", { cache:"no-store", credentials:"same-origin" });
      var result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not reach the account service.");
      if (!result.ready) return showLogin("Add UARL_ADMIN_KEY in Netlify before creating the Owner account.", false);
      if (result.user) return showAdmin(result.user);
      showLogin("", result.needsSetup);
    } catch (error) { showLogin(error.message || "Could not reach the secure login service.", false); }
  }
  async function login(event) {
    event.preventDefault();
    var password = document.querySelector("[data-login-password]").value;
    var username = document.querySelector("[data-login-username]").value;
    var button = document.querySelector("[data-login-button]");
    var requestBody = state.authMode === "setup" ? {action:"setup",username:username,password:password,displayName:document.querySelector("[data-setup-name]").value,setupKey:document.querySelector("[data-setup-key]").value} : {action:"login",username:username,password:password};
    loginMessage.textContent = ""; button.disabled = true; button.textContent = state.authMode === "setup" ? "Creating account…" : "Signing in…";
    try {
      var response = await fetch("/.netlify/functions/admin-publish", { method:"POST", credentials:"same-origin", headers:{"content-type":"application/json"}, body:JSON.stringify(requestBody) });
      var result = await response.json();
      if (!response.ok) throw new Error(result.error || "Sign-in failed.");
      showAdmin(result.user);
    } catch (error) { loginMessage.textContent = error.message; }
    finally { button.disabled = false; button.textContent = state.authMode === "setup" ? "Create Owner account" : "Sign in"; }
  }
  async function logout() {
    try { await fetch("/.netlify/functions/admin-publish", { method:"POST", credentials:"same-origin", headers:{"content-type":"application/json"}, body:JSON.stringify({action:"logout"}) }); } catch (error) {}
    if (publishDialog.open) publishDialog.close();
    state.user = null;
    showLogin("You have been signed out.", false);
  }
  function changed() {
    state.dirty = true; state.changes += 1;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state.data));
    setStatus("Draft saved · " + countChanges() + " change" + (countChanges() === 1 ? "" : "s") + " not published", "dirty");
  }

  function renderHeader(config) {
    return '<header class="view-head"><div><span class="eyebrow">' + esc(config.kicker) + '</span><h1>' + esc(config.title) + '</h1><p>' + esc(config.description) + '</p></div><div class="view-actions"><button class="button ghost" data-action="reload">Reload published</button>' + (config.path ? '<button class="button" data-action="add">+ Add new</button>' : '') + '</div></header>';
  }

  function renderDashboard() {
    var upcoming = state.data.events.filter(function (x) { return new Date(x.start || x.date) > new Date(); }).sort(function (a,b) { return new Date(a.start)-new Date(b.start); })[0];
    var openSeats = state.data.drivers.teams.reduce(function (sum,t) { return sum + (t.entries || []).filter(function (e) { return /^Open/.test(e.status || "") || e.name === "OPEN"; }).length; }, 0);
    view.innerHTML = renderHeader({ kicker:"UARL website", title:"Race Control", description:"One control center for the public schedule, results, standings inputs, rosters, paints, history, and competition guide." }) +
      '<section class="stat-grid"><article class="stat-card"><small>Scheduled events</small><strong>' + state.data.events.length + '</strong></article><article class="stat-card" style="--accent:var(--blue)"><small>Official records</small><strong>' + state.data.records.length + '</strong></article><article class="stat-card" style="--accent:var(--red)"><small>Paint schemes</small><strong>' + state.data.paints.length + '</strong></article><article class="stat-card" style="--accent:var(--green)"><small>Open D1 seats</small><strong>' + openSeats + '</strong></article></section>' +
      '<section class="dashboard-grid"><article class="dash-panel"><h2>Next event on the website</h2>' + (upcoming ? '<div class="next-event"><span>' + esc(String(upcoming.division).toUpperCase()) + ' · ' + esc(new Date(upcoming.start).toLocaleString([], {dateStyle:"full",timeStyle:"short"})) + '</span><h3>' + esc(upcoming.name) + '</h3><p>' + esc(upcoming.track) + (upcoming.scheduleNote ? '<br>' + esc(upcoming.scheduleNote) : '') + '</p></div>' : '<div class="next-event"><h3>Season complete</h3></div>') + '</article>' +
      '<article class="dash-panel"><h2>Publishing health</h2><div class="check-list"><div><span>Live website data</span><b>CONNECTED</b></div><div><span>Browser recovery draft</span><b>' + (state.dirty ? "SAVED" : "CLEAN") + '</b></div><div><span>Schedule countdown feed</span><b>CONNECTED</b></div><div><span>Secure publisher</span><b>SIGNED IN</b></div></div></article></section>';
  }

  function profileRows() {
    return Object.keys(state.data.drivers.profiles).map(function (user) { return Object.assign({ username:user }, state.data.drivers.profiles[user]); });
  }
  function saveProfiles(rows) {
    var next = {}; rows.forEach(function (row) { var user = row.username; var value = clone(row); delete value.username; if (user) next[user] = value; }); state.data.drivers.profiles = next;
  }
  function profileConfig() {
    return { title:"Driver Profiles", kicker:"Identity + career data", description:"Display names, Roblox usernames, career wins, championships, and historical rank.", path:"profiles", itemTitle:function(x){return x.alias||x.username||"Driver";}, itemMeta:function(x){return "@"+(x.username||"")+" · "+(x.wins||0)+" wins · "+(x.championships||0)+" titles";}, template:function(){return {username:"new_driver_"+Date.now(),alias:"New Driver",wins:0,championships:0,rank:0};}, fields:[["username","Roblox username"],["alias","Display name"],["wins","Career wins","number"],["championships","Championships","number"],["rank","All-time rank","number"]] };
  }

  function renderCollection(section) {
    var config = section === "profiles" ? profileConfig() : configs[section];
    var items = section === "profiles" ? profileRows() : getPath(config.path);
    if (state.selected >= items.length) state.selected = Math.max(0, items.length - 1);
    var query = state.query.toLowerCase();
    var filtered = items.map(function (item,index) { return {item:item,index:index}; }).filter(function (pair) { return !query || (config.itemTitle(pair.item)+" "+config.itemMeta(pair.item)).toLowerCase().includes(query); });
    var rows = filtered.map(function (pair) { return '<button class="item-row' + (pair.index === state.selected ? ' is-active' : '') + '" data-select="' + pair.index + '"><strong>' + esc(config.itemTitle(pair.item)) + '</strong><span>' + esc(config.itemMeta(pair.item)) + '</span></button>'; }).join("");
    var current = items[state.selected];
    if(section==="results"&&current)recalculateResult(current);
    view.innerHTML = renderHeader(config) + '<div class="editor-layout"><section class="item-list"><div class="list-tools"><input type="search" data-list-search value="' + esc(state.query) + '" placeholder="Search this section"><button type="button" data-action="add" aria-label="Add new">+</button></div><div class="list-scroll">' + (rows || '<div class="editor-empty">No entries yet.<br>Add the first one.</div>') + '</div></section><section class="editor-panel">' + (current ? renderEditor(config,current,state.selected) : '<div class="editor-empty">Select or add an entry.</div>') + '</section></div>';
  }

  function optionList(values,current) {
    var list=values.slice();if(current&&!list.includes(current))list.unshift(current);
    return list.map(function(value){return '<option value="'+esc(value)+'" '+(String(current||"")===value?'selected':'')+'>'+esc(value||"None")+'</option>';}).join("");
  }
  function driverSuggestions() {
    var values=[];
    Object.keys(state.data.drivers.profiles||{}).forEach(function(user){values.push(user);var alias=state.data.drivers.profiles[user].alias;if(alias)values.push(alias);});
    (state.data.drivers.teams||[]).forEach(function(team){(team.entries||[]).forEach(function(entry){if(entry.user)values.push(entry.user);if(entry.name&&entry.name!=="OPEN")values.push(entry.name);});});
    return Array.from(new Set(values.filter(Boolean))).sort(function(a,b){return a.localeCompare(b);});
  }
  function currentResultDivision() {
    if(state.section!=="results")return "d1";
    var records=getPath("records"),record=records[state.selected];return record&&record.division||"d1";
  }
  function seriesDriverPool(division,current,record) {
    var map=new Map();
    function add(name,number,user,source) {
      name=String(name||"").trim();if(!name||name.toUpperCase()==="OPEN")return;
      var key=(user?"user:"+String(user):"name:"+name).toLowerCase(),existing=map.get(key);if(!existing)map.set(key,{name:name,number:String(number||""),user:user||"",source:source||"roster"});else if(!existing.number&&number)existing.number=String(number);
    }
    if(division==="d1"){
      (state.data.drivers.teams||[]).forEach(function(team){(team.entries||[]).forEach(function(entry){if(/^Open/.test(entry.status||"")||String(entry.status||"").toLowerCase()==="inactive"||String(entry.name||"").toUpperCase()==="OPEN")return;var profile=state.data.drivers.profiles&&state.data.drivers.profiles[entry.user]||{};add(profile.alias||entry.name||entry.user,entry.number,entry.user,"D1 roster");});});
    }else if(division==="open"){
      (state.data.drivers.openEntries||[]).forEach(function(entry){var profile=state.data.drivers.profiles&&state.data.drivers.profiles[entry.user]||{};add(entry.name||profile.alias||entry.user,entry.number,entry.user,"Open roster");});
    }else if(division==="d2"){
      ((state.data.race&&state.data.race.drivers)||[]).filter(function(driver){return driver.division==="d2";}).forEach(function(driver){add(driver.name,driver.number,driver.id,"D2 archive");});
    }
    var selectedRecord=record||(state.section==="results"&&(state.data.records||[])[state.selected]);
    if(selectedRecord&&selectedRecord.division===division)(selectedRecord.entries||[]).forEach(function(entry){add(entry.name,entry.number,entry.user||entry.driverId,"Event entry");});
    (state.data.records||[]).filter(function(record){return record.division===division;}).forEach(function(record){
      (record.qualifying||[]).forEach(function(row){add(row.name,row.number,row.username,"Official result");});
      (record.finishes||[]).forEach(function(row){add(row.name,row.number,row.username,"Official result");});
      (record.stages||[]).forEach(function(stage){(stage.results||[]).forEach(function(row){add(row.name,row.number,row.username,"Official result");});});
      (record.bonuses||[]).forEach(function(row){add(row.driver,row.number,row.driverUsername,"Official result");});
      add(record.winner,"",record.winnerUsername,"Official result");add(record.pole,"",record.poleUsername,"Official result");
    });
    if(current&&!Array.from(map.values()).some(function(driver){return driver.name===current;}))add(current,"","","Existing result");
    return Array.from(map.values()).sort(function(a,b){var an=parseInt(a.number,10),bn=parseInt(b.number,10);if(Number.isFinite(an)&&Number.isFinite(bn)&&an!==bn)return an-bn;return a.name.localeCompare(b.name);});
  }
  function seriesDriverSelect(value,attrs,identity) {
    var pool=seriesDriverPool(currentResultDivision(),value);
    return '<select '+attrs+'><option value="">Select a series driver</option>'+pool.map(function(driver){var label=(driver.number?'#'+driver.number+' · ':'')+driver.name+(driver.user&&driver.user!==driver.name&&!/^guest:/.test(driver.user)?' (@'+driver.user.replace(/^@/,"")+')':'');var selected=identity?String(identity).toLowerCase()===String(driver.user).toLowerCase():String(value||"")===driver.name;return '<option value="'+esc(driver.name)+'" data-name="'+esc(driver.name)+'" data-number="'+esc(driver.number)+'" data-user="'+esc(driver.user)+'" '+(selected?'selected':'')+'>'+esc(label)+'</option>';}).join("")+'</select>';
  }
  function seriesDriverNumber(name,identity,record) {
    var match=seriesDriverInfo(name,identity,record);return match&&match.number||"";
  }
  var FINISH_POINTS=[50,45,42,40,38,36,34,32,30,28,27,26,25,24,23,22];
  var STAGE_POINTS=[5,4,3,2,1];
  var BONUS_POINTS={"Most laps led":3,"Fastest lap":2,"Fastest recorded practice":2};
  function identityText(value) { return String(value||"").trim().replace(/^@/,"").toLowerCase(); }
  function sameResultDriver(left,right) {
    var leftUser=identityText(left&&left.username||left&&left.driverUsername||left&&left.user),rightUser=identityText(right&&right.username||right&&right.driverUsername||right&&right.user);
    if(leftUser&&rightUser)return leftUser===rightUser;
    var leftName=identityText(left&&left.name||left&&left.driver),rightName=identityText(right&&right.name||right&&right.driver);
    return Boolean(leftName&&rightName&&leftName===rightName);
  }
  function seriesDriverInfo(name,identity,record) {
    var division=record&&record.division||currentResultDivision();
    return seriesDriverPool(division,name,record).find(function(driver){return identity&&identityText(driver.user)===identityText(identity)||identityText(driver.name)===identityText(name);})||{};
  }
  function bonusPoints(name) { return BONUS_POINTS[name]||0; }
  function recalculateResult(record) {
    if(!record||!Array.isArray(record.finishes))return record;
    var isPoints=record.pointsEvent!==false&&!record.exhibition;
    function attachIdentity(row,nameKey,userKey) { var info=seriesDriverInfo(row[nameKey],row[userKey],record);if(info.user)row[userKey]=info.user;if(!row.number&&info.number)row.number=info.number; }
    (record.qualifying||[]).forEach(function(row){attachIdentity(row,"name","username");});
    (record.stages||[]).forEach(function(stage){(stage.results||[]).forEach(function(row){attachIdentity(row,"name","username");});});
    var poleInfo=seriesDriverInfo(record.pole,record.poleUsername,record);if(poleInfo.user)record.poleUsername=poleInfo.user;
    var winnerInfo=seriesDriverInfo(record.winner,record.winnerUsername,record);if(winnerInfo.user)record.winnerUsername=winnerInfo.user;
    (record.bonuses||[]).forEach(function(bonus){bonus.points=bonusPoints(bonus.name);var info=seriesDriverInfo(bonus.driver,bonus.driverUsername,record);if(!bonus.number&&info.number)bonus.number=info.number;if(info.user)bonus.driverUsername=info.user;});
    record.finishes.forEach(function(finish){
      var info=seriesDriverInfo(finish.name,finish.username,record),eligible=finish.pointsEligible!==false&&isPoints,position=Number(finish.position),status=finish.resultStatus||"Finish";
      if(info.user)finish.username=info.user;if(!finish.number&&info.number)finish.number=info.number;
      var base=0;if(eligible){if(status==="DNQ")base=10;else if(status==="DNF")base=2;else if(position>0)base=FINISH_POINTS[Math.min(position,FINISH_POINTS.length)-1]||22;}
      var stagePoints=0,stageWins=0;
      if(eligible)(record.stages||[]).forEach(function(stage){var row=(stage.results||[]).find(function(result){return sameResultDriver(finish,result);});var stagePosition=row&&Number(row.position);if(stagePosition>0&&stagePosition<=STAGE_POINTS.length){stagePoints+=STAGE_POINTS[stagePosition-1];if(stagePosition===1)stageWins+=1;}});
      var earnedPole=sameResultDriver(finish,{name:record.pole,username:record.poleUsername}),polePoints=eligible&&earnedPole?5:0,extraPoints=eligible?(record.bonuses||[]).filter(function(bonus){return sameResultDriver(finish,{driver:bonus.driver,driverUsername:bonus.driverUsername});}).reduce(function(sum,bonus){return sum+bonusPoints(bonus.name);},0):0;
      finish.basePoints=base;finish.stagePoints=stagePoints;finish.stageWins=stageWins;finish.pole=Boolean(earnedPole);finish.bonusPoints=polePoints+extraPoints;finish.points=base+polePoints+extraPoints;finish.totalPoints=finish.points+stagePoints;
      var laps=(record.bonuses||[]).find(function(bonus){return bonus.driver===finish.name&&bonus.name==="Most laps led";});if(laps){finish.mostLapsLed=true;finish.lapsLed=Number(laps.lapsLed||0);finish.raceLaps=Number(laps.totalLaps||record.laps||0);}
    });
    return record;
  }
  function syncResultPoints(record) {
    (record.finishes||[]).forEach(function(finish,index){var node=document.querySelector('[data-auto-points="'+index+'"]'),stageNode=document.querySelector('[data-auto-stage="'+index+'"]');if(stageNode)stageNode.value=finish.stagePoints||0;if(node){node.value=finish.totalPoints||0;node.title=(finish.basePoints||0)+' finish/status + '+(finish.stagePoints||0)+' stage + '+(finish.bonusPoints||0)+' bonus';}});
    (record.bonuses||[]).forEach(function(bonus,index){var node=document.querySelector('[data-auto-bonus="'+index+'"]');if(node)node.value=bonus.points||0;});
  }
  function dataInput(field,row,key,value,type,parent,collection,listId) {
    var attrs=' data-sfield="'+esc(field)+'" data-srow="'+row+'" data-skey="'+esc(key)+'" data-stype="'+esc(type||"text")+'"';
    if(parent!=null)attrs+=' data-sparent="'+parent+'"';if(collection)attrs+=' data-scollection="'+esc(collection)+'"';
    if(type==="bool")return '<input type="checkbox"'+attrs+' '+(value?'checked':'')+'>';
    return '<input type="'+(type==="number"?'number':type==="date"?'date':'text')+'"'+attrs+(listId?' list="'+esc(listId)+'"':'')+' value="'+esc(value==null?"":value)+'">';
  }
  function removeButton(field,row,parent,collection) {
    return '<button type="button" class="builder-remove" data-sremove="'+esc(field)+'" data-srow="'+row+'"'+(parent!=null?' data-sparent="'+parent+'"':'')+(collection?' data-scollection="'+esc(collection)+'"':'')+' aria-label="Remove row">×</button>';
  }
  function classificationRow(field,row,item,finish,listId,parent,collection) {
    var attrs='data-sfield="'+esc(field)+'" data-srow="'+row+'" data-skey="name" data-stype="text"'+(parent!=null?' data-sparent="'+parent+'"':'')+(collection?' data-scollection="'+esc(collection)+'"':'');
    return '<div class="builder-row"><div class="builder-grid classification-grid"><label>Car #<input type="text" data-auto-number readonly value="'+esc(item.number||"")+'"></label><label>Position'+dataInput(field,row,"position",item.position,"number",parent,collection)+'</label><label class="builder-span-2">Driver'+seriesDriverSelect(item.name,attrs,item.username)+'</label>'+(finish?'<label>Result status<select data-sfield="'+esc(field)+'" data-srow="'+row+'" data-skey="resultStatus" data-stype="text">'+optionList(["Finish","DNF","DNQ"],item.resultStatus||"Finish")+'</select></label><label>Stage points<input type="number" data-auto-stage="'+row+'" readonly value="'+esc(item.stagePoints||0)+'" title="Calculated from stage results"></label><label>Total points<input type="number" data-auto-points="'+row+'" readonly value="'+esc(item.totalPoints||0)+'" title="Calculated automatically"></label><label class="builder-check">'+dataInput(field,row,"pointsEligible",item.pointsEligible,"bool",parent,collection)+' Eligible</label>':'')+'</div>'+removeButton(field,row,parent,collection)+'</div>';
  }
  function winnerPairRow(field,row,pair,parent,collection,listId) {
    return '<div class="builder-row"><div class="builder-grid pair-grid"><label>Driver'+dataInput(field,row,"0",pair[0],"text",parent,collection,listId)+'</label><label>Wins'+dataInput(field,row,"1",pair[1],"number",parent,collection)+'</label></div>'+removeButton(field,row,parent,collection)+'</div>';
  }
  function renderStructuredField(key,label,type,item) {
    var value=Array.isArray(item[key])?item[key]:(item[key]=[]),listId='driver-list-'+key+'-'+state.selected;
    var suggestions='<datalist id="'+listId+'">'+driverSuggestions().map(function(name){return '<option value="'+esc(name)+'">';}).join("")+'</datalist>',rows="",addLabel="Add row",help="";
    if(type==="eventEntries"){
      help="Use this for a verified substitute or one-off entrant who is not on the series roster. A Roblox username is required to keep standings and stage points attached to the correct driver.";addLabel="Add event-only driver";rows=value.map(function(entry,index){return '<div class="builder-row"><div class="builder-grid roster-grid"><label>Car #'+dataInput(key,index,"number",entry.number)+'</label><label>Driver name'+dataInput(key,index,"name",entry.name)+'</label><label>Roblox username'+dataInput(key,index,"user",entry.user)+'</label><label class="builder-check">'+dataInput(key,index,"pointsEligible",entry.pointsEligible!==false,"bool")+' Points eligible</label></div>'+removeButton(key,index)+'</div>';}).join("");
    }else if(type==="roster"){
      addLabel="Add charter / entry";rows=value.map(function(entry,index){return '<div class="builder-row roster-row"><div class="builder-grid roster-grid"><label>Car #'+dataInput(key,index,"number",entry.number)+'</label><label>Driver username'+dataInput(key,index,"user",entry.user,"text",null,null,listId)+'</label><label>Display name override'+dataInput(key,index,"name",entry.name,"text",null,null,listId)+'</label><label>Status<select data-sfield="'+esc(key)+'" data-srow="'+index+'" data-skey="status" data-stype="text">'+optionList(["","Full-Time","Signed","Open FT","Part-Time","Development","Inactive"],entry.status)+'</select></label><label>Seat type<select data-sfield="'+esc(key)+'" data-srow="'+index+'" data-skey="seatType" data-stype="text">'+optionList(["","Full-Time","Part-Time","Development","Shared"],entry.seatType)+'</select></label><label>Charter type<select data-sfield="'+esc(key)+'" data-srow="'+index+'" data-skey="charterType" data-stype="text">'+optionList(["","FT","PT","DEV","FLEX"],entry.charterType)+'</select></label><label>Signed date'+dataInput(key,index,"signedAt",entry.signedAt,"date")+'</label><label class="builder-check">'+dataInput(key,index,"recent",entry.recent,"bool")+' Recent move</label></div>'+removeButton(key,index)+'</div>';}).join("");
    }else if(type==="classification"||type==="finishes"){
      addLabel=type==="finishes"?"Add finishing position":"Add qualifying position";rows=value.map(function(entry,index){return classificationRow(key,index,entry,type==="finishes",listId);}).join("");
    }else if(type==="bonuses"){
      addLabel="Add bonus";rows=value.map(function(entry,index){return '<div class="builder-row"><div class="builder-grid bonus-grid"><label>Bonus type<select data-sfield="'+esc(key)+'" data-srow="'+index+'" data-skey="name" data-stype="text">'+optionList(Object.keys(BONUS_POINTS),entry.name)+'</select></label><label>Driver'+seriesDriverSelect(entry.driver,'data-sfield="'+esc(key)+'" data-srow="'+index+'" data-skey="driver" data-stype="text"',entry.driverUsername)+'</label><label>Car #<input type="text" data-auto-number readonly value="'+esc(entry.number||"")+'"></label><label>Points<input type="number" data-auto-bonus="'+index+'" readonly value="'+esc(bonusPoints(entry.name))+'"></label><label>Laps led'+dataInput(key,index,"lapsLed",entry.lapsLed,"number")+'</label><label>Total laps'+dataInput(key,index,"totalLaps",entry.totalLaps,"number")+'</label></div>'+removeButton(key,index)+'</div>';}).join("");
    }else if(type==="tags"){
      addLabel="Add tag";rows=value.map(function(tag,index){return '<div class="builder-row compact-row"><label class="builder-inline">Tag'+dataInput(key,index,"value",tag)+'</label>'+removeButton(key,index)+'</div>';}).join("");
    }else if(type==="winnerTotals"){
      addLabel="Add winner";rows=value.map(function(pair,index){return winnerPairRow(key,index,pair,null,null,listId);}).join("");
    }else if(type==="stages"){
      addLabel="Add stage";rows=value.map(function(stage,index){var results=Array.isArray(stage.results)?stage.results:[];return '<article class="nested-builder"><header><label>Stage name'+dataInput(key,index,"name",stage.name)+'</label>'+removeButton(key,index)+'</header><div class="nested-rows">'+results.map(function(entry,row){return classificationRow(key,row,entry,false,listId,index,"results");}).join("")+'</div><button type="button" class="builder-add small" data-snadd="'+esc(key)+'" data-sparent="'+index+'" data-scollection="results" data-stype="classification">+ Add stage position</button></article>';}).join("");
    }else if(type==="seasons"){
      addLabel="Add season";rows=value.map(function(season,index){var winners=Array.isArray(season.winners)?season.winners:[];return '<article class="nested-builder"><header><div class="builder-grid pair-grid"><label>Season #'+dataInput(key,index,"number",season.number,"number")+'</label><label>Champion'+dataInput(key,index,"champion",season.champion,"text",null,null,listId)+'</label></div>'+removeButton(key,index)+'</header><h4>Race winners</h4><div class="nested-rows">'+winners.map(function(pair,row){return winnerPairRow(key,row,pair,index,"winners",listId);}).join("")+'</div><button type="button" class="builder-add small" data-snadd="'+esc(key)+'" data-sparent="'+index+'" data-scollection="winners" data-stype="pair">+ Add winner</button></article>';}).join("");
    }
    return '<section class="field wide structured-field"><span>'+esc(label)+'</span>'+(help?'<p class="builder-help">'+esc(help)+'</p>':'')+'<div class="structured-list">'+(rows||'<div class="builder-empty">No rows yet.</div>')+'</div><button type="button" class="builder-add" data-sadd="'+esc(key)+'" data-stype="'+esc(type)+'">+ '+esc(addLabel)+'</button>'+suggestions+'</section>';
  }

  function renderField(field, item) {
    var key=field[0],label=field[1],type=field[2]||"text",options=Array.isArray(field[3])?field[3]:null,wide=field[3]==="wide"||field[4]==="wide",value=item[key];
    if (["eventEntries","roster","classification","finishes","stages","bonuses","tags","winnerTotals","seasons"].includes(type)) return renderStructuredField(key,label,type,item);
    if (type === "seriesDriver") return '<label class="field"><span>'+esc(label)+'</span>'+seriesDriverSelect(value,'data-field="'+esc(key)+'" data-type="select"',item[key+"Username"])+'</label>';
    if (type === "bool") return '<label class="field check-field' + (wide?' wide':'') + '"><input type="checkbox" data-field="' + esc(key) + '" data-type="bool" ' + (value?'checked':'') + '><span>' + esc(label) + '</span></label>';
    if (type === "select") return '<label class="field' + (wide?' wide':'') + '"><span>' + esc(label) + '</span><select data-field="' + esc(key) + '" data-type="select">' + options.map(function(o){return '<option value="'+esc(o)+'" '+(String(value||"")===String(o)?'selected':'')+'>'+esc(o||"None")+'</option>';}).join("") + '</select></label>';
    if (type === "textarea" || type === "json") return '<label class="field wide"><span>' + esc(label) + '</span><textarea class="' + (type==='json'?'json-field':'') + '" data-field="' + esc(key) + '" data-type="' + type + '">' + esc(type==='json'?JSON.stringify(value == null ? [] : value,null,2):(value||"")) + '</textarea></label>';
    var displayed = type === "datetime" ? toLocal(value) : (value == null ? "" : value);
    return '<label class="field' + (wide?' wide':'') + '"><span>' + esc(label) + '</span><input type="' + (type==='datetime'?'datetime-local':type) + '" data-field="' + esc(key) + '" data-type="' + esc(type) + '" value="' + esc(displayed) + '"></label>';
  }

  function resultIdentityWarning(record) {
    if(state.section!=="results")return "";
    var missing=new Map();
    function inspect(name,username) {
      name=String(name||"").trim();if(!name)return;
      var info=seriesDriverInfo(name,username,record),resolved=username||info.user;
      if(!resolved||/^guest:/i.test(resolved))missing.set(identityText(name),name);
    }
    (record.entries||[]).forEach(function(row){inspect(row.name,row.user||row.driverId);});
    (record.qualifying||[]).forEach(function(row){inspect(row.name,row.username);});
    (record.finishes||[]).forEach(function(row){inspect(row.name,row.username);});
    (record.stages||[]).forEach(function(stage){(stage.results||[]).forEach(function(row){inspect(row.name,row.username);});});
    if(!missing.size)return "";
    return '<div class="warning"><b>Roblox username needed:</b> '+Array.from(missing.values()).map(esc).join(", ")+'. Add it in Teams + Charters for a rostered driver, or Event-only drivers for a guest. This prevents split standings and makes stage points follow the correct driver.</div>';
  }

  function renderEditor(config,item,index) {
    return '<div class="editor-title"><div><small>ENTRY ' + String(index+1).padStart(2,"0") + '</small><h2>' + esc(config.itemTitle(item)) + '</h2></div><div class="view-actions"><button class="button" data-action="duplicate">Duplicate</button></div></div>'+resultIdentityWarning(item)+'<div class="field-grid">' + config.fields.map(function(f){return renderField(f,item);}).join("") + '</div><footer class="editor-footer"><div class="shift-tools">' + (config.shifts?'<button class="button ghost" data-shift="-7">← Shift 1 week</button><button class="button ghost" data-shift="7">Shift 1 week →</button>':'') + '</div><button class="button danger" data-action="delete">Delete entry</button></footer>';
  }

  function renderAdvanced() {
    view.innerHTML = renderHeader({kicker:"Power tools",title:"Advanced JSON",description:"Direct access to the complete canonical website dataset. Use this for uncommon fields that do not yet have a dedicated control."}) + '<div class="warning">Changes here affect every connected UARL page. Invalid JSON cannot be applied or published.</div><textarea class="advanced-editor" spellcheck="false" data-advanced-json>' + esc(JSON.stringify(state.data,null,2)) + '</textarea><div class="view-actions" style="margin-top:12px"><button class="button" data-action="apply-json">Apply JSON changes</button></div>';
  }

  async function accountRequest(action, values) {
    var response = await fetch("/.netlify/functions/admin-publish", {method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(Object.assign({action:action},values||{}))});
    var result = await response.json();
    if(response.status===401){showLogin(result.error,false);throw new Error(result.error);}
    if(!response.ok)throw new Error(result.error||"Account request failed.");
    return result;
  }

  function roleOptions(selected) {
    return [["owner","Owner"],["admin","Admin"],["race_control","Race Control"]].map(function(pair){return '<option value="'+pair[0]+'" '+(selected===pair[0]?'selected':'')+'>'+pair[1]+'</option>';}).join("");
  }

  function renderAccounts() {
    if(!state.user||state.user.role!=="owner"){state.section="dashboard";renderDashboard();return;}
    view.innerHTML='<header class="view-head"><div><span class="eyebrow">Administration</span><h1>Staff Accounts</h1><p>Create individual logins, assign permissions, reset passwords, and review who published website changes.</p></div><div class="view-actions"><button class="button ghost" data-account-refresh>Refresh</button></div></header>'+
      '<section class="accounts-layout"><div><article class="account-panel"><h2>Add staff member</h2><p class="account-help">Every person receives a unique username and password. Passwords are stored as secure hashes.</p><form class="account-form" data-account-create-form><label>Display name<input required data-new-display maxlength="60"></label><label>Username<input required data-new-username minlength="3" maxlength="32" pattern="[A-Za-z0-9._-]+"></label><label>Role<select data-new-role>'+roleOptions("race_control")+'</select></label><label>Temporary password<input required type="password" data-new-password minlength="10" autocomplete="new-password"></label><button class="button publish" type="submit">Create account</button></form></article><article class="account-panel" style="margin-top:14px"><h2>Role permissions</h2><p class="account-help"><b>Owner:</b> full website and account control.<br><b>Admin:</b> full website control without staff management.<br><b>Race Control:</b> schedule and results publishing only.</p></article></div><div><article class="account-panel"><h2>Current staff</h2><div class="account-list" data-account-list><div class="warning">Loading accounts…</div></div></article><article class="account-panel" style="margin-top:14px"><h2>Recent activity</h2><div class="audit-list" data-audit-list><div class="warning">Loading activity…</div></div></article></div></section>';
    loadAccounts();
  }

  async function loadAccounts() {
    try{
      var result=await accountRequest("list-users");
      var list=document.querySelector("[data-account-list]"),audit=document.querySelector("[data-audit-list]");
      if(!list||!audit)return;
      list.innerHTML=result.users.map(function(user){return '<article class="account-card" data-account-id="'+esc(user.id)+'"><div class="account-card-head"><div><strong>'+esc(user.displayName)+'</strong><span>@'+esc(user.username)+' · '+(user.lastLoginAt?'Last sign-in '+esc(new Date(user.lastLoginAt).toLocaleString()):'Never signed in')+'</span></div><span class="role-chip">'+esc(user.role.replace("_"," "))+'</span></div><div class="account-grid"><label class="account-field">Display name<input data-account-display value="'+esc(user.displayName)+'"></label><label class="account-field">Username<input data-account-username value="'+esc(user.username)+'"></label><label class="account-field">Role<select data-account-role>'+roleOptions(user.role)+'</select></label><label class="account-field">New password (optional)<input type="password" minlength="10" data-account-password autocomplete="new-password" placeholder="Leave unchanged"></label></div><div class="account-actions"><label class="account-toggle"><input type="checkbox" data-account-active '+(user.active?'checked':'')+'> Active account</label><button class="button" data-account-save>Save account</button></div></article>';}).join("");
      audit.innerHTML=result.audit.length?result.audit.map(function(item){return '<div class="audit-item"><b>'+esc(item.actorName||"System")+' · '+esc(item.detail||item.type)+'</b><span>'+esc(new Date(item.at).toLocaleString())+'</span></div>';}).join(""):'<p class="account-help">No account activity recorded yet.</p>';
    }catch(error){var list=document.querySelector("[data-account-list]");if(list)list.innerHTML='<div class="warning">'+esc(error.message)+'</div>';}
  }

  async function createAccount(form) {
    var button=form.querySelector("button");button.disabled=true;button.textContent="Creating…";
    try{var result=await accountRequest("create-user",{displayName:form.querySelector("[data-new-display]").value,username:form.querySelector("[data-new-username]").value,role:form.querySelector("[data-new-role]").value,password:form.querySelector("[data-new-password]").value});form.reset();toast(result.message);loadAccounts();}
    catch(error){toast(error.message,true);}finally{button.disabled=false;button.textContent="Create account";}
  }

  async function saveAccount(card) {
    var button=card.querySelector("[data-account-save]");button.disabled=true;button.textContent="Saving…";
    try{var result=await accountRequest("update-user",{id:card.dataset.accountId,displayName:card.querySelector("[data-account-display]").value,username:card.querySelector("[data-account-username]").value,role:card.querySelector("[data-account-role]").value,password:card.querySelector("[data-account-password]").value,active:card.querySelector("[data-account-active]").checked});if(state.user&&state.user.id===result.user.id)showAdmin(result.user);toast(result.message);loadAccounts();}
    catch(error){toast(error.message,true);}finally{button.disabled=false;button.textContent="Save account";}
  }

  function render() {
    document.querySelectorAll("[data-section]").forEach(function (button) { button.classList.toggle("is-active",button.dataset.section===state.section); });
    document.querySelector("[data-mobile-section]").value=state.section;
    if (state.section === "dashboard") renderDashboard(); else if (state.section === "advanced") renderAdvanced(); else if(state.section==="accounts")renderAccounts(); else renderCollection(state.section);
  }

  function currentConfigAndItems() {
    var config = state.section === "profiles" ? profileConfig() : configs[state.section];
    var items = state.section === "profiles" ? profileRows() : getPath(config.path);
    return {config:config,items:items};
  }

  function commitItems(items) { if (state.section === "profiles") saveProfiles(items); }
  function structuredItem() { var pair=currentConfigAndItems();return pair.items[state.selected]; }
  function structuredTemplate(type,array) {
    if(type==="eventEntries")return {number:"",name:"",user:"",pointsEligible:true};
    if(type==="roster")return {number:"",user:"",name:"",status:"Full-Time",seatType:"",charterType:"",signedAt:"",recent:false};
    if(type==="classification")return {position:(array.length+1),number:"",name:""};
    if(type==="finishes")return {position:(array.length+1),number:"",name:"",resultStatus:"Finish",pointsEligible:true,points:0,stagePoints:0,bonusPoints:0,totalPoints:0};
    if(type==="bonuses")return {name:"Most laps led",driver:"",number:"",points:0,lapsLed:0,totalLaps:0};
    if(type==="tags")return "";
    if(type==="winnerTotals"||type==="pair")return ["",0];
    if(type==="stages")return {name:"Stage "+(array.length+1),results:[]};
    if(type==="seasons")return {number:array.length+1,champion:"",winners:[]};
    return {};
  }
  function addStructured(button) { var item=structuredItem(),key=button.dataset.sadd,type=button.dataset.stype;if(!Array.isArray(item[key]))item[key]=[];item[key].push(structuredTemplate(type,item[key]));if(state.section==="results")recalculateResult(item);changed();render(); }
  function addNestedStructured(button) { var item=structuredItem(),root=item[button.dataset.snadd],parent=root[Number(button.dataset.sparent)],collection=button.dataset.scollection;if(!Array.isArray(parent[collection]))parent[collection]=[];parent[collection].push(structuredTemplate(button.dataset.stype,parent[collection]));if(state.section==="results")recalculateResult(item);changed();render(); }
  function removeStructured(button) { if(!confirm("Remove this row?"))return;var item=structuredItem(),root=item[button.dataset.sremove],row=Number(button.dataset.srow);if(button.dataset.sparent!=null)root=root[Number(button.dataset.sparent)][button.dataset.scollection];root.splice(row,1);if(state.section==="results")recalculateResult(item);changed();render(); }
  function updateStructured(input) {
    var item=structuredItem(),root=item[input.dataset.sfield],row=Number(input.dataset.srow),target;
    if(input.dataset.sparent!=null)target=root[Number(input.dataset.sparent)][input.dataset.scollection][row];else target=root[row];
    var value=input.dataset.stype==="bool"?input.checked:input.dataset.stype==="number"?(input.value===""?null:Number(input.value)):input.value;
    if(target==null||typeof target!=="object")root[row]=value;else {var selected=input.options&&input.selectedIndex>=0?input.options[input.selectedIndex]:null,selectedUser=selected&&selected.dataset.user||"";target[Array.isArray(target)?Number(input.dataset.skey):input.dataset.skey]=value;if(input.tagName==="SELECT"&&(input.dataset.skey==="name"||input.dataset.skey==="driver")){target.number=seriesDriverNumber(value,selectedUser);if(input.dataset.skey==="driver")target.driverUsername=selectedUser;else target.username=selectedUser;var numberInput=input.closest(".builder-row")&&input.closest(".builder-row").querySelector("[data-auto-number]");if(numberInput)numberInput.value=target.number;}}
    if(state.section==="results"){recalculateResult(item);syncResultPoints(item);}changed();
  }
  function addItem() { var pair=currentConfigAndItems(); pair.items.push(pair.config.template()); commitItems(pair.items); state.selected=pair.items.length-1; state.query=""; changed(); render(); }
  function deleteItem() { var pair=currentConfigAndItems(); if(!pair.items[state.selected]||!confirm("Delete this entry? This can be undone by reloading the published data."))return; pair.items.splice(state.selected,1); commitItems(pair.items); state.selected=Math.max(0,state.selected-1); changed(); render(); }
  function duplicateItem() { var pair=currentConfigAndItems(); var copy=clone(pair.items[state.selected]); if(copy.id)copy.id=copy.id+"-copy"; pair.items.splice(state.selected+1,0,copy); commitItems(pair.items); state.selected+=1; changed(); render(); }
  function shiftEvent(days) { var event=getPath("events")[state.selected],amount=Number(days)*86400000; ["start","originalStart"].forEach(function(k){if(event[k])event[k]=new Date(new Date(event[k]).getTime()+amount).toISOString();}); ["date","originalDate"].forEach(function(k){if(event[k])event[k]=dateOnly(new Date(new Date(event[k]+"T12:00:00").getTime()+amount));}); changed(); render(); }

  async function reloadPublished() {
    if(state.dirty&&!confirm("Discard the browser draft and reload the currently published data?"))return;
    try { state.data=await window.UARLData.load(true); state.original=clone(state.data); state.dirty=false;state.changes=0;localStorage.removeItem(DRAFT_KEY);setStatus("Published data loaded","ready");render();toast("Published website data reloaded."); } catch(error){toast(error.message,true);}
  }

  function exportData() { var blob=new Blob([JSON.stringify(state.data,null,2)+"\n"],{type:"application/json"});var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="uarl-data-backup-"+dateOnly(new Date())+".json";a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},1000); }
  function preview() { localStorage.setItem(window.UARLData.previewKey,JSON.stringify(state.data)); var route={schedule:"/schedule/",results:"/race-center/",teams:"/drivers/",profiles:"/drivers/",open:"/drivers/",freeAgents:"/drivers/",moves:"/drivers/",paints:"/paint-schemes/",history:"/history/",guide:"/competition-guide/"}[state.section]||"/"; window.open(route+"?preview=admin","_blank","noopener"); }

  function openPublish() {
    document.querySelector("[data-publish-summary]").innerHTML='<b>'+countChanges()+' draft change'+(countChanges()===1?'':'s')+'</b><br>'+state.data.events.length+' events · '+state.data.records.length+' records · '+state.data.drivers.teams.length+' teams · '+state.data.paints.length+' paints';
    publishDialog.showModal();
  }
  async function publish() {
    var note=document.querySelector("[data-publish-note]").value;var button=document.querySelector("[data-confirm-publish]");
    button.disabled=true;button.textContent="Publishing…";
    try { (state.data.records||[]).forEach(recalculateResult);var response=await fetch("/.netlify/functions/admin-publish",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({data:state.data,message:note})});var result=await response.json();if(response.status===401){publishDialog.close();showLogin(result.error);return;}if(!response.ok)throw new Error(result.error||"Publish failed."); state.original=clone(state.data);state.dirty=false;state.changes=0;localStorage.removeItem(DRAFT_KEY);localStorage.removeItem(window.UARLData.previewKey);setStatus("Published live","ready");publishDialog.close();toast(result.message||"Published successfully."); }
    catch(error){toast(error.message,true);} finally{button.disabled=false;button.textContent="Publish now";}
  }

  document.addEventListener("click",function(event){
    if(event.target.closest("[data-close-publish]")){publishDialog.close();return;}
    var structuredAdd=event.target.closest("[data-sadd]");if(structuredAdd){addStructured(structuredAdd);return;}
    var nestedAdd=event.target.closest("[data-snadd]");if(nestedAdd){addNestedStructured(nestedAdd);return;}
    var structuredRemove=event.target.closest("[data-sremove]");if(structuredRemove){removeStructured(structuredRemove);return;}
    if(event.target.closest("[data-account-refresh]")){loadAccounts();return;}
    var accountSave=event.target.closest("[data-account-save]");if(accountSave){saveAccount(accountSave.closest("[data-account-id]"));return;}
    var section=event.target.closest("[data-section]");if(section){state.section=section.dataset.section;state.selected=0;state.query="";render();return;}
    var select=event.target.closest("[data-select]");if(select){state.selected=Number(select.dataset.select);render();return;}
    var action=event.target.closest("[data-action]");if(action){var a=action.dataset.action;if(a==="add")addItem();else if(a==="delete")deleteItem();else if(a==="duplicate")duplicateItem();else if(a==="reload")reloadPublished();else if(a==="export")exportData();else if(a==="preview")preview();else if(a==="publish")openPublish();else if(a==="logout")logout();else if(a==="apply-json"){try{state.data=window.UARLData.normalize(JSON.parse(document.querySelector("[data-advanced-json]").value));changed();render();toast("Advanced JSON applied to the draft.");}catch(error){toast("Invalid JSON: "+error.message,true);}}return;}
    var shift=event.target.closest("[data-shift]");if(shift){shiftEvent(shift.dataset.shift);}
  });
  document.addEventListener("input",function(event){
    if(event.target.matches("[data-list-search]")){state.query=event.target.value;renderCollection(state.section);var input=document.querySelector("[data-list-search]");input.focus();input.setSelectionRange(input.value.length,input.value.length);return;}
    if(event.target.matches("[data-sfield]")){updateStructured(event.target);return;}
    if(!event.target.matches("[data-field]"))return;var pair=currentConfigAndItems(),item=pair.items[state.selected],field=event.target.dataset.field,type=event.target.dataset.type,value;
    if(type==="bool")value=event.target.checked;else if(type==="number")value=event.target.value===""?null:Number(event.target.value);else if(type==="datetime")value=fromLocal(event.target.value);else if(type==="json"){try{value=JSON.parse(event.target.value);event.target.style.borderColor="";}catch(error){event.target.style.borderColor="var(--red)";return;}}else value=event.target.value;
    if(state.section==="results"&&(field==="winner"||field==="pole")){var selected=event.target.options&&event.target.options[event.target.selectedIndex];item[field+"Username"]=selected&&selected.dataset.user||"";value=selected&&selected.dataset.name||value;}
    item[field]=value;commitItems(pair.items);if(state.section==="results"){recalculateResult(item);syncResultPoints(item);}changed();if(state.section==="results"&&field==="division")render();
  });
  document.addEventListener("change",function(event){if(event.target.matches('[data-sfield="entries"]')){render();return;}if(event.target.matches("[data-mobile-section]")){state.section=event.target.value;state.selected=0;state.query="";render();}if(event.target.matches("[data-import]")){var file=event.target.files[0];if(!file)return;file.text().then(function(text){state.data=window.UARLData.normalize(JSON.parse(text));changed();render();toast("Backup imported into the draft.");}).catch(function(error){toast("Could not import: "+error.message,true);});}});
  document.addEventListener("submit",function(event){var form=event.target.closest("[data-account-create-form]");if(form){event.preventDefault();createAccount(form);}});
  document.querySelector("[data-publish-form]").addEventListener("submit",function(event){event.preventDefault();publish();});

  async function initAdmin() {
    configureSections();
    try { var live=await window.UARLData.load();
      if(!live.conduct.length){try{var html=await fetch('/competition-guide/',{cache:'no-store'}).then(function(response){return response.text();});var doc=new DOMParser().parseFromString(html,'text/html');live.conduct=[];doc.querySelectorAll('.urg-accordion[data-urg-group]').forEach(function(group){group.querySelectorAll('.urg-rule').forEach(function(rule){var id=(rule.querySelector('.urg-rule-id')||{}).textContent||'';var copy=(rule.querySelector('.urg-rule-copy')||{}).textContent||'';var penalty=rule.querySelector('.urg-rule-penalty');if(id&&copy)live.conduct.push({id:id.trim(),group:group.getAttribute('data-urg-group')||'procedures',text:copy.trim(),penalty:penalty?penalty.textContent.trim():'',severe:Boolean(penalty&&penalty.classList.contains('is-severe'))});});});}catch(error){}}
      state.original=clone(live);var draft=localStorage.getItem(DRAFT_KEY);if(draft){try{state.data=window.UARLData.normalize(JSON.parse(draft));state.dirty=JSON.stringify(state.data)!==JSON.stringify(live);}catch(error){state.data=live;}}else state.data=live;if(state.dirty)setStatus("Recovered unpublished browser draft","dirty");else setStatus("Published data loaded","ready");render(); }
    catch(error){setStatus("Could not load website data","error");view.innerHTML='<div class="warning">'+esc(error.message)+'</div>';}
  }
  document.querySelector("[data-login-form]").addEventListener("submit",login);
  checkSession();
})();
