(function () {
  "use strict";

  var DRAFT_KEY = "uarl-admin-draft-v1";
  var state = { data: null, original: null, section: "dashboard", selected: 0, step: 0, query: "", dirty: false, changes: 0, user: null, authMode: "login" };
  var view = document.querySelector("[data-admin-view]");
  var toastNode = document.querySelector("[data-toast]");
  var statusNode = document.querySelector("[data-save-status]");
  var statusDot = document.querySelector("[data-status-dot]");
  var publishDialog = document.querySelector("[data-publish-dialog]");
  var loginGate = document.querySelector("[data-login-gate]");
  var adminApp = document.querySelector("[data-admin-app]");
  var loginMessage = document.querySelector("[data-login-message]");
  var adminStarted = false;
  var pendingImageUploads = 0;
  var undoSnapshots=[],redoSnapshots=[],historyAnchor=null,editSession=null,historyRestoring=false;
  var artworkOpen=Object.create(null);
  var sectionNames={dashboard:'Home',schedule:'Schedule',results:'Results',standings:'Standings',teams:'Teams & rosters',profiles:'Driver roster',open:'Open Series',freeAgents:'Free agents',moves:'Signings',paints:'Paint Booth',history:'History',guide:'Rules & FAQ',conduct:'Conduct',advanced:'Advanced JSON',accounts:'Staff accounts'};
  var imports=window.UARLAdminImports({data:function(){return state.data;},esc:esc,header:renderHeader,commit:commitPendingEdit,render:render,recalculate:recalculateResult,toast:toast,applied:function(){changed();render();},canEditArtwork:canEditStandingsArtwork,editArtwork:editStandingsArtwork});

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
      title: "Results + Points", kicker: "Race Center", description: "Choose the race, paste your CSV, preview the calculated results, then apply and publish.", path: "records",
      itemTitle: function (x) { return x.event || x.name || "Untitled result"; }, itemMeta: function (x) { return [String(x.division || "").toUpperCase(), x.date, x.status].filter(Boolean).join(" · "); },
      template: function () { return { id: "result-" + Date.now(), division: "d1", event: "New Race Result", date: dateOnly(new Date()), start: new Date().toISOString(), track: "", status: "complete", eventType: "Points race", pointsEvent: true, exhibition: false, qualifying: [], stages: [], finishes: [], bonuses: [], winnerAutomatic:true }; },
      fields: [["id","Event ID"],["division","Division","select",["d1","d2","open"]],["event","Event name","textarea","wide"],["date","Date","date"],["start","Start time","datetime"],["track","Track"],["round","Round","number"],["laps","Laps","number"],["status","Status","select",["complete","official","pending"]],["eventType","Event type"],["winnerAutomatic","Winner follows first place","bool"],["winner","Winner","seriesDriver"],["pole","Pole winner","seriesDriver"],["pointsSummary","Points summary"],["pointsNote","Points note","textarea","wide"],["recordNote","Official record note","textarea","wide"],["pointsEvent","Points event","bool"],["exhibition","Exhibition","bool"],["qualifying","Qualifying classification","classification","wide"],["stages","Stage classifications","stages","wide"],["finishes","Race finish + points","finishes","wide"],["bonuses","Bonuses","bonuses","wide"]]
    },
    teams: {
      title: "Teams + Charters", kicker: "D1 paddock", description: "Team ownership, branding, entries, open seats, and special shared charters.", path: "drivers.teams",
      itemTitle: function (x) { return x.name || "Untitled team"; }, itemMeta: function (x) { return [x.owner && "Owner: " + x.owner, x.make, (x.entries || []).length + " entries"].filter(Boolean).join(" · "); },
      template: function () { return { id: "team-" + Date.now(), name: "New Team", owner: "", make: "Toyota", note: "", entries: [] }; },
      fields: [["id","Team ID"],["name","Team name"],["owner","Owner"],["ownerNote","Owner title / note"],["make","Manufacturer","select",["Toyota","Ford","Chevrolet","Generic"]],["founded","Founded"],["logo","Logo path / URL"],["brandColor","Primary color"],["brandColor2","Secondary color"],["note","Team description","textarea","wide"],["charterCount","Charter count","number"],["entries","Entries + charters","roster","wide"],["pendingDrivers","Pending drivers","roster","wide"]]
    },
    open: {
      title: "Open Series", kicker: "Independent entries", description: "Every active Open Series entry, including part-time status and manufacturer.", path: "drivers.openEntries",
      itemTitle: function (x) { return "#" + (x.number || "—") + " " + (x.name || profileName(x.user) || "Entry"); }, itemMeta: function (x) { return [x.user && "@" + x.user, x.make, x.status].filter(Boolean).join(" · "); },
      template: function () { return { number: "", user: "", make: "Toyota", status: "" }; },
      fields: [["number","Car number"],["user","Roblox username"],["name","Display name override"],["make","Manufacturer","select",["Toyota","Ford","Chevrolet","Generic"]],["status","Status","select",["","Full-Time","Part-Time","Development"]],["numberImage","Number art","image"],["signatureImage","Signature logo","image"]]
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
  function profileName(user) { var p = window.UARLData.driverProfile(user,state.data && state.data.drivers && state.data.drivers.profiles); return p && p.alias; }
  // Count changed entries against the published snapshot, not input events.
  // Stable IDs count each added, removed or edited entry once. Unkeyed rows
  // use multiset matching so deleting a row does not mark every later row changed.
  function entryChanges(before, after) {
    if (JSON.stringify(before) === JSON.stringify(after)) return 0;
    if (Array.isArray(before) && Array.isArray(after)) {
      var all=before.concat(after);
      if(all.length && all.every(function(item){return item && item.id;}) && new Set(before.map(function(item){return item.id;})).size===before.length && new Set(after.map(function(item){return item.id;})).size===after.length) {
        var a=new Map(before.map(function(item){return [item.id,item];})), b=new Map(after.map(function(item){return [item.id,item];}));
        return Array.from(new Set(Array.from(a.keys()).concat(Array.from(b.keys())))).reduce(function(sum,id){return sum+(JSON.stringify(a.get(id))!==JSON.stringify(b.get(id))?1:0);},0) || 1;
      }
      var remaining = before.map(function (item) { return JSON.stringify(item); }), added = 0;
      after.forEach(function (item) { var index = remaining.indexOf(JSON.stringify(item)); if (index < 0) added++; else remaining.splice(index, 1); });
      return Math.max(remaining.length, added, 1);
    }
    if (before && after && typeof before === "object" && typeof after === "object") {
      return Array.from(new Set(Object.keys(before).concat(Object.keys(after)))).reduce(function (sum, key) { return sum + entryChanges(before[key], after[key]); }, 0);
    }
    return 1;
  }
  function countChanges() {
    if (!state.original || !state.data) return 0;
    var total = 0;
    Object.keys(state.data).concat(Object.keys(state.original)).filter(function (key, index, keys) { return keys.indexOf(key) === index; }).forEach(function (key) {
      if (key === "drivers") {
        var before = state.original.drivers || {}, after = state.data.drivers || {};
        Array.from(new Set(Object.keys(before).concat(Object.keys(after)))).forEach(function (field) {
          if (field === "profiles") {
            var a = before.profiles || {}, b = after.profiles || {};
            Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).forEach(function (user) { if (JSON.stringify(a[user]) !== JSON.stringify(b[user])) total++; });
          } else total += entryChanges(before[field], after[field]);
        });
      } else if (key === "race") {
        var a=clone(state.original.race||{}), b=clone(state.data.race||{});
        delete a.drivers; delete b.drivers; delete a.schedule; delete b.schedule;
        total += entryChanges(a,b);
      } else total += entryChanges(state.original[key], state.data[key]);
    });
    return total;
  }

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
    var labels={dashboard:"Dashboard",schedule:"Schedule",results:"Results + points",standings:"Standings"};
    if(state.user.role!=="race_control")Object.assign(labels,{teams:"Teams + charters",profiles:"Driver roster",open:"Open Series",freeAgents:"Free agents",moves:"Recent moves",paints:"Paint Booth",history:"History",guide:"Rules + FAQ",conduct:"Conduct rulebook",advanced:"Advanced JSON"});
    if(state.user.role==="owner")labels.accounts="Staff accounts";
    if(!Object.prototype.hasOwnProperty.call(labels,state.section))state.section="dashboard";
    var picker=document.querySelector("[data-mobile-section]");
    var menu=document.querySelector('[data-admin-menu-items]');if(menu)menu.innerHTML=Object.keys(labels).map(function(key){return '<button type="button" data-section="'+key+'">'+labels[key]+'</button>';}).join('');
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
    state.user = null;resetHistory();document.querySelectorAll('.workspace-dialog[open]').forEach(function(dialog){dialog.close();});
    showLogin("You have been signed out.", false);
  }
  function changed() {
    if(!editSession&&!historyRestoring)recordHistory();
    state.changes = countChanges(); state.dirty = state.changes > 0;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state.data));
    setStatus(state.dirty ? "Draft saved · " + state.changes + " changed entr" + (state.changes === 1 ? "y" : "ies") + " not published" : "No unpublished changes", state.dirty ? "dirty" : "ready");
    updateDraftTools();updateWorkspacePreview();imports.dataChanged();
  }

  function draftTools() {
    return '<div class="draft-tools" aria-label="Draft actions"><button class="button ghost" type="button" data-workspace-undo '+(!undoSnapshots.length?'disabled':'')+' title="Undo last edit">↶ Undo</button><button class="button ghost" type="button" data-workspace-redo '+(!redoSnapshots.length?'disabled':'')+' title="Redo last edit">↷ Redo</button><button class="button ghost" type="button" data-review-changes>Review changes <span data-draft-total>'+countChanges()+'</span></button></div>';
  }
  function renderHeader(config) {
    return '<header class="view-head workspace-toolbar"><div><span class="eyebrow">'+esc(config.kicker)+'</span><h1>'+esc(config.title)+'</h1><p>'+esc(config.description)+'</p></div><div class="view-actions"><button class="button ghost" data-action="reload">Reload published</button>'+(config.path?'<button class="button" data-action="add">+ Add new</button>':'')+'</div></header>'+draftTools();
  }
  function workspaceChanges() { return window.UARLWorkspace.changes(state.original,state.data); }
  function renderDraftEntries(changes) {
    return changes.slice(0,8).map(function(change){return '<button type="button" '+(change.kind!=='removed'?'data-resume-section="'+esc(change.section)+'" data-resume-index="'+change.index+'"':'disabled')+'><span><b>'+esc(change.title)+'</b><small>'+esc(sectionNames[change.section]||change.section)+' · '+esc((change.fields||[]).slice(0,3).join(', ')||change.kind)+'</small></span><span class="workspace-chip">'+esc(change.kind)+'</span></button>';}).join('');
  }
  function renderDashboard() {
    var upcoming=state.data.events.filter(function(event){return new Date(event.start||event.date)>new Date();}).sort(function(a,b){return new Date(a.start||a.date)-new Date(b.start||b.date);})[0];
    var full=state.user&&state.user.role!=='race_control',changes=workspaceChanges();
    function task(key,icon,title,copy){return '<button type="button" class="workspace-task" data-workspace-task="'+key+'"><span class="task-icon" aria-hidden="true">'+icon+'</span><span class="task-title">'+title+'</span><span class="task-copy">'+copy+'</span></button>';}
    view.innerHTML='<div class="workspace-home"><header class="workspace-greeting"><span class="eyebrow">Your paddock</span><h1>What are we updating?</h1><p>'+esc(state.user&&state.user.displayName||'Welcome')+', jump straight to the job. Your work saves as a draft while you edit.</p></header>'+draftTools()+
      '<div class="workspace-home-grid"><section class="workspace-task-grid" aria-label="Common tasks">'+task('race','⚑','Record a race','Choose the race, paste a CSV, preview and apply.')+task('standings','≡','Update standings','Import a points CSV or correct a driver’s total.')+task('schedule','▦','Adjust an event','Go straight to the next event’s date and status.')+(full?task('roster','▰','Update a roster','Choose a team and edit its drivers.')+task('transfer','⇄','Move or sign a driver','Update the roster and announcement together.')+task('paint','◆','Add a paint scheme','Use saved driver details instead of retyping them.')+task('search','⌕','Find & edit anything','Search drivers, races, teams and site content.'):'')+'</section>'+
      '<article class="workspace-next-event"><span class="eyebrow">Next on the calendar</span>'+(upcoming?'<h2>'+esc(upcoming.name)+'</h2><p>'+esc(upcoming.date)+' · '+esc(upcoming.track)+'</p><span class="workspace-chip">'+esc(String(upcoming.division||'').toUpperCase())+'</span><button type="button" class="button ghost" data-workspace-task="schedule">Edit this event →</button>':'<h2>Calendar up to date</h2><p>Add the next event whenever you’re ready.</p><button class="button ghost" data-section="schedule">Open schedule</button>')+(state.data.events.length?'<button class="button ghost" type="button" data-start-race>Start a new race entry →</button>':'')+'</article></div>'+
      '<section class="workspace-draft-panel"><header><div><span class="eyebrow">Pick up where you left off</span><h2>'+ (changes.length?'Your unpublished work':'A clear desk')+'</h2></div><button class="button ghost" data-review-changes>Review all changes</button></header>'+(changes.length?'<div class="draft-entry-list">'+renderDraftEntries(changes)+'</div>':'<p>No unfinished edits. Choose a task above to get started.</p>')+'</section></div>';
  }
  function recordHistory() {
    if(!state.data)return;
    if(historyAnchor&&JSON.stringify(historyAnchor)!==JSON.stringify(state.data)){
      undoSnapshots.push(clone(historyAnchor));if(undoSnapshots.length>30)undoSnapshots.shift();redoSnapshots=[];
    }
    historyAnchor=clone(state.data);
  }
  function commitPendingEdit(){if(editSession){editSession=null;recordHistory();updateDraftTools();}}
  function resetHistory(){undoSnapshots=[];redoSnapshots=[];editSession=null;historyAnchor=state.data&&clone(state.data);updateDraftTools();}
  function updateDraftTools(){
    document.querySelectorAll('[data-workspace-undo]').forEach(function(button){button.disabled=(!undoSnapshots.length&&!(editSession&&historyAnchor&&JSON.stringify(historyAnchor)!==JSON.stringify(state.data)))||pendingImageUploads>0;});
    document.querySelectorAll('[data-workspace-redo]').forEach(function(button){button.disabled=!redoSnapshots.length||pendingImageUploads>0||Boolean(editSession&&historyAnchor&&JSON.stringify(historyAnchor)!==JSON.stringify(state.data));});
    document.querySelectorAll('[data-draft-total]').forEach(function(node){node.textContent=countChanges();});
  }
  function restoreHistory(redo){
    commitPendingEdit();if(pendingImageUploads){toast('Wait for the image upload to finish.',true);return;}
    var from=redo?redoSnapshots:undoSnapshots,to=redo?undoSnapshots:redoSnapshots;if(!from.length)return;
    to.push(clone(state.data));state.data=from.pop();historyAnchor=clone(state.data);historyRestoring=true;changed();historyRestoring=false;render();toast(redo?'Edit restored.':'Last edit undone.');
  }
  function goToEntry(section,index,step){
    if(section==='standings'){var entry=(state.data.standings||[])[index];if(entry)imports.selectDivision(entry.division);}
    commitPendingEdit();state.section=section;state.selected=Math.max(0,Number(index)||0);state.step=step==null?(section==='teams'?2:0):step;state.query='';render();
  }
  function canEditStandingsArtwork(){return Boolean(state.user&&['owner','admin'].includes(state.user.role));}
  function editStandingsArtwork(division,user){
    if(!canEditStandingsArtwork())return;
    commitPendingEdit();
    var data=window.UARLData.normalize(clone(state.data));
    var row=window.UARLStandings.calculate(data,division).find(function(entry){return entry.id===user;});
    var target=row&&window.UARLStandingsArtwork.resolve(state.data,division,row).target;
    if(!target){toast('This driver has no matching current roster entry for number art.',true);return;}
    var step=target.section==='open'?1:target.section==='teams'&&target.field==='pendingDrivers'?3:2;
    if(target.field)artworkOpen[target.section+':'+target.index+':'+target.field+':'+target.row]=true;
    goToEntry(target.section,target.index,step);
    var selector='[data-image-upload][data-image-key="numberImage"]'+(target.field?'[data-image-field="'+target.field+'"][data-image-row="'+target.row+'"]':'');
    var input=view.querySelector(selector);
    if(input){
      for(var ancestor=input.parentElement;ancestor&&ancestor!==view;ancestor=ancestor.parentElement)if(ancestor.tagName==='DETAILS')ancestor.open=true;
      input.focus({preventScroll:true});input.closest('.image-upload').scrollIntoView({block:'nearest'});
    }
  }
  function openWorkspaceSearch(){if(!state.data)return;commitPendingEdit();var dialog=document.querySelector('[data-workspace-search-dialog]');dialog.showModal();var input=dialog.querySelector('[data-workspace-search]');input.value='';renderWorkspaceSearch('');input.focus();}
  function renderWorkspaceSearch(query){
    var results=window.UARLWorkspace.search(state.data,query,state.user&&state.user.role);
    document.querySelector('[data-workspace-search-results]').innerHTML=results.length?results.map(function(result){return '<button type="button" class="workspace-search-result" data-search-section="'+esc(result.section)+'" data-search-index="'+result.index+'" data-search-step="'+(result.step||0)+'"><b>'+esc(result.title)+'</b><small>'+esc(result.meta)+'</small></button>';}).join(''):'<p>'+(query.trim()?'No matching records. Try a name, number, team or track.':'Type a driver, team, car number or race to jump to its editor.')+'</p>';
  }
  function openChanges(){
    commitPendingEdit();var changes=workspaceChanges(),dialog=document.querySelector('[data-workspace-changes-dialog]');
    dialog.querySelector('[data-workspace-changes-list]').innerHTML=changes.length?changes.map(function(change){return '<article><header><b>'+esc(change.title)+'</b><span class="workspace-chip">'+esc(change.kind)+'</span></header><p>'+esc(sectionNames[change.section]||change.section)+'</p><ul>'+(change.fields||[]).map(function(field){return '<li>'+esc(field)+'</li>';}).join('')+'</ul>'+(change.kind!=='removed'?'<button class="button ghost" data-resume-section="'+esc(change.section)+'" data-resume-index="'+change.index+'">Continue editing →</button>':'')+'</article>';}).join(''):'<p>No unpublished changes.</p>';
    dialog.showModal();
  }
  function workspaceTask(task){
    if(task==='search')return openWorkspaceSearch();
    if(task==='transfer')return openTransfer();
    if(task==='race'){
      var pending=state.data.records.findIndex(function(record){return record.status==='pending'||JSON.stringify(record)!==JSON.stringify((state.original.records||[]).find(function(old){return old.id===record.id;}));});
      if(pending>=0){goToEntry('results',pending,0);return;}
      state.section='results';state.selected=0;state.step=0;addItem();return;
    }
    if(task==='standings')return goToEntry('standings',0);
    if(task==='roster')return goToEntry('teams',0,2);
    if(task==='schedule'){
      var events=state.data.events,index=events.map(function(event,index){return {event:event,index:index};}).filter(function(pair){return new Date(pair.event.start||pair.event.date)>new Date();}).sort(function(a,b){return new Date(a.event.start||a.event.date)-new Date(b.event.start||b.event.date);})[0];
      return goToEntry('schedule',index?index.index:0,1);
    }
    if(task==='paint'){state.section='paints';state.selected=0;state.step=0;addItem();}
  }
  function peopleOptions(people,selectedKey){return '<option value="">Choose a saved driver</option>'+people.map(function(person){return '<option value="'+esc(person.key)+'" data-user="'+esc(person.user)+'" '+(person.key===selectedKey?'selected':'')+'>'+esc((person.number?'#'+person.number+' · ':'')+person.name+' · '+(person.team||person.source)+(person.user?' (@'+person.user+')':''))+'</option>';}).join('');}
  function paintAssist(){var paint=state.data.paints[state.selected],people=window.UARLWorkspace.people(state.data).filter(function(person){return person.source==='team'||person.source==='open';}),selected=people.find(function(person){return identityText(person.user)===identityText(paint.handle)&&String(person.number)===String(paint.number)&&person.team===paint.team;});return '<div class="workspace-assist"><label>Fill driver details from the roster<select data-paint-driver>'+peopleOptions(people,selected&&selected.key)+'</select></label><small>Name, username, number, team and manufacturer fill together. You can still edit any field.</small></div>';}

  function prefillPaint(input){
    var person=window.UARLWorkspace.people(state.data).find(function(person){return person.key===input.value;});if(!person)return;
    var paint=state.data.paints[state.selected];Object.assign(paint,{name:person.name,handle:person.user,number:person.number,team:person.team,make:person.make,division:person.division,series:person.division==='open'?'Open Series':'D1 · L.L. Bean Cup Series'});
    if(!paint.body||/^BBR (Toyota|Ford|Chevrolet|Generic) Body$/.test(paint.body))paint.body='BBR '+person.make+' Body';
    paint.search=[paint.name,paint.handle,paint.number,paint.team,paint.make,paint.title].filter(Boolean).join(' ').toLowerCase();changed();render();toast('Driver details filled. Add the scheme title and image.');
  }
  function openTransfer(){
    if(!state.user||state.user.role==='race_control')return;commitPendingEdit();
    var represented=new Set(),dialog=document.querySelector('[data-transfer-dialog]'),people=window.UARLWorkspace.people(state.data).filter(function(person){var user=identityText(person.user);if(!user||represented.has(user))return false;represented.add(user);return true;});
    dialog.querySelector('[data-transfer-person]').innerHTML=peopleOptions(people);
    dialog.querySelector('[data-transfer-team]').innerHTML='<option value="">Choose destination team</option>'+state.data.drivers.teams.map(function(team){return '<option value="'+esc(team.id)+'">'+esc(team.name)+'</option>';}).join('');
    dialog.querySelector('[data-transfer-number]').value='';dialog.querySelector('[data-transfer-message]').textContent='';dialog.querySelector('[data-transfer-announce]').checked=true;updateTransferSeats();dialog.showModal();
  }
  function updateTransferSeats(){
    var dialog=document.querySelector('[data-transfer-dialog]'),team=state.data.drivers.teams.find(function(team){return team.id===dialog.querySelector('[data-transfer-team]').value;}),person=window.UARLWorkspace.people(state.data).find(function(person){return person.key===dialog.querySelector('[data-transfer-person]').value;});
    var seats=dialog.querySelector('[data-transfer-seat]');seats.innerHTML='<option value="new">Add an entry</option>'+(team?team.entries.map(function(entry,index){var vacant=!(entry.user||entry.username||entry.driverId)&&(!entry.name||/^(OPEN|VACANT|TBD|TBA)$/i.test(entry.name)||/^(?:(?:Part[ -]Time|Development|Shared)\s+)?(?:Entry|Charter|Seat)$/i.test(entry.name));return '<option value="'+index+'" '+(!vacant?'disabled':'')+'>#'+esc(entry.number||'—')+' · '+esc(vacant?'Available charter':window.UARLData.driverName(entry,state.data.drivers.profiles))+'</option>';}).join(''):'');
    var available=seats.querySelector('option[value]:not([value="new"]):not(:disabled)');if(available)seats.value=available.value;
    var number=dialog.querySelector('[data-transfer-number]');number.value=team&&available?team.entries[Number(available.value)].number:person&&person.number||'';updateTransferPreview();
  }
  function updateTransferPreview(){
    var dialog=document.querySelector('[data-transfer-dialog]'),person=window.UARLWorkspace.people(state.data).find(function(person){return person.key===dialog.querySelector('[data-transfer-person]').value;}),team=state.data.drivers.teams.find(function(team){return team.id===dialog.querySelector('[data-transfer-team]').value;});
    dialog.querySelector('[data-transfer-preview]').textContent=person&&team?person.name+' → '+team.name+' #'+dialog.querySelector('[data-transfer-number]').value+(person.number&&person.number!==dialog.querySelector('[data-transfer-number]').value&&person.numberImage?' · Review the number artwork after changing the car number.':''):'Choose a driver and their destination to preview the move.';
  }
  function siteToday(){var parts=new Intl.DateTimeFormat('en',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),date={};parts.forEach(function(part){date[part.type]=part.value;});return date.year+'-'+date.month+'-'+date.day;}
  function saveTransfer(event){
    event.preventDefault();var dialog=document.querySelector('[data-transfer-dialog]');
    try{var result=window.UARLWorkspace.transfer(state.data,{personKey:dialog.querySelector('[data-transfer-person]').value,teamId:dialog.querySelector('[data-transfer-team]').value,seatIndex:dialog.querySelector('[data-transfer-seat]').value==='new'?null:Number(dialog.querySelector('[data-transfer-seat]').value),number:dialog.querySelector('[data-transfer-number]').value,announce:dialog.querySelector('[data-transfer-announce]').checked,date:siteToday()});changed();dialog.close();goToEntry('teams',result.teamIndex,2);toast(result.name+' moved. Review your draft when ready.');}
    catch(error){dialog.querySelector('[data-transfer-message]').textContent=error.message;}
  }
  function renderWorkspacePreview(section,item){
    var title='',meta='',image='';
    if(section==='teams'){title=item.name;meta=[item.make,item.owner&&'Owner: '+item.owner,(item.entries||[]).length+' entries'].filter(Boolean).join(' · ');image=item.logo;}
    else if(section==='paints'){title=item.title||'New paint scheme';meta=[item.number&&'#'+item.number,item.name,item.team].filter(Boolean).join(' · ');image=item.image;}
    else if(section==='profiles'){title=item.alias||item.username;meta='@'+item.username;image=item.signatureImage;}
    else if(section==='schedule'){title=item.name;meta=[item.date,item.track,item.scheduleStatus||'Scheduled'].filter(Boolean).join(' · ');}
    else if(section==='open'){title=window.UARLData.driverName(item,state.data.drivers.profiles);meta=[item.number&&'#'+item.number,item.make,item.status].filter(Boolean).join(' · ');image=item.signatureImage;}
    if(!title)return '';
    return '<aside class="workspace-preview" aria-label="Entry preview">'+(image?'<img src="'+esc(image)+'" alt="" loading="lazy">':'')+'<div><span class="eyebrow">At a glance</span><h3>'+esc(title)+'</h3><p>'+esc(meta)+'</p></div></aside>';
  }
  function updateWorkspacePreview(){if(!state.data||!configs[state.section]&&state.section!=='profiles')return;var node=view.querySelector('.workspace-preview');if(node){var pair=currentConfigAndItems(),item=pair.items[state.selected];if(item)node.outerHTML=renderWorkspacePreview(state.section,item);}}

  function profileRows() {
    return Object.keys(state.data.drivers.profiles).map(function (user) { return Object.assign({}, state.data.drivers.profiles[user], { username:user }); });
  }
  function pendingDriverAccount(user) { return String(user||'').length>20&&/^new_driver_\d+$/.test(String(user)); }
  function driverProfileKey(user) {
    if(!state.data||!user)return '';
    var canonical=window.UARLResultDrivers.canonicalUser(state.data,user);
    return Object.keys(state.data.drivers.profiles).find(function(key){return identityText(key)===identityText(canonical);})||'';
  }
  function driverAccountCaption(user) {
    var key=driverProfileKey(user),profile=state.data.drivers.profiles[key];
    return profile&&profile.currentUsername||key||user||'';
  }
  function canEditDriverIdentity(){return Boolean(state.user&&['owner','admin'].includes(state.user.role));}
  function driverIdentityShortcut(user) {
    var key=driverProfileKey(user);
    return key&&!pendingDriverAccount(key)&&canEditDriverIdentity()?'<button type="button" class="button ghost" data-edit-driver-profile="'+esc(key)+'">Edit name or username</button>':'';
  }
  function openDriverIdentity(user) {
    if(!canEditDriverIdentity())return;
    var key=driverProfileKey(user),index=Object.keys(state.data.drivers.profiles).indexOf(key);
    if(index<0)return;
    goToEntry('profiles',index,0);
    var input=view.querySelector('[data-field="currentUsername"]');
    if(input){input.focus({preventScroll:true});input.closest('.field').scrollIntoView({block:'nearest'});}
  }
  function commitProfileAccount(input) {
    if(state.section!=='profiles'||!canEditDriverIdentity())return;
    var user=input.dataset.profileAccountKey,field=input.dataset.field;
    var rows=profileRows(),index=rows.findIndex(function(row){return row.username===user;});
    if(index<0)return;
    var profile=state.data.drivers.profiles[user],requested=String(input.value||'').trim().replace(/^@/,'');
    if(input.readOnly){if(field==='username')input.value=user;return;}
    input.setCustomValidity('');
    try {
      if(field==='username') {
        if(!pendingDriverAccount(user)){input.value=user;return;}
        if(!requested)return;
        if(pendingImageUploads)throw new Error('Wait for image uploads to finish before setting this account.');
        var draft=clone(state.data);
        window.UARLResultDrivers.updateUsername(draft,user,requested);
        var registered=clone(draft.drivers.profiles[user]);
        if(Array.isArray(registered.usernameAliases))registered.usernameAliases=registered.usernameAliases.filter(function(alias){return identityText(alias)!==identityText(user);});
        rows[index]=Object.assign({},registered,{username:requested});
        saveProfiles(rows);
        view.querySelectorAll('[data-profile-account]').forEach(function(node){
          if(node.dataset.profileAccountKey!==user)return;
          node.dataset.profileAccountKey=requested;
          node.readOnly=node.dataset.field==='username';
          node.value=node.dataset.field==='username'?requested:registered.currentUsername||'';
        });
        changed();
        return;
      }
      if(requested===String(profile.currentUsername||''))return;
      var before=JSON.stringify(profile);
      window.UARLResultDrivers.updateUsername(state.data,user,requested);
      input.value=state.data.drivers.profiles[user].currentUsername||'';
      if(JSON.stringify(state.data.drivers.profiles[user])!==before)changed();
    } catch(error) {
      input.value=field==='username'?'':profile.currentUsername||'';
      input.setCustomValidity(error.message);toast(error.message,true);
    }
  }
  function saveProfiles(rows) {
    var next = {}; rows.forEach(function (row) { var user = row.username; var value = clone(row); delete value.username; if (user) Object.defineProperty(next,user,{value:value,enumerable:true,writable:true,configurable:true}); }); state.data.drivers.profiles = next;
  }
  function profileConfig() {
    return { title:"Driver roster", kicker:"Permanent league drivers", description:"Manage driver identities, CSV names, series eligibility, and career profiles. A team assignment is optional.", path:"profiles", itemTitle:function(x){return x.alias||x.username||"Driver";}, itemMeta:function(x){return "@"+(x.username||"")+" · "+(x.csvDivisions||[]).join(" / ").toUpperCase();}, template:function(){return {username:"new_driver_"+Date.now(),alias:"New Driver",csvDivisions:["d1"],number:"",csvAliases:[],wins:0,championships:0,rank:0};}, fields:[["username","Driver account (original username)"],["currentUsername","Current Roblox username (optional)"],["alias","Display name"],["csvDivisions","Permanent roster series","divisions"],["number","Car number (leave blank until assigned)"],["csvAliases","Other names accepted in CSV","tags","wide"],["wins","Career wins","number"],["championships","Championships","number"],["rank","All-time rank","number"],["numberImage","Number art","image"],["signatureImage","Signature logo","image"]] };
  }

  function renderCollection(section) {
    var config = section === "profiles" ? profileConfig() : configs[section];
    var items = section === "profiles" ? profileRows() : getPath(config.path);
    if (state.selected >= items.length) state.selected = Math.max(0, items.length - 1);
    var query = state.query.toLowerCase();
    var filtered = items.map(function (item,index) { return {item:item,index:index}; }).filter(function (pair) { return !query || (config.itemTitle(pair.item)+" "+config.itemMeta(pair.item)).toLowerCase().includes(query); });
    var changedEntries=workspaceChanges().filter(function(change){return change.section===section&&change.kind!=='removed';});
    var rows = filtered.map(function (pair) {
      var image=section==='teams'?pair.item.logo:section==='paints'?pair.item.image:section==='profiles'?pair.item.signatureImage:null;
      var dirty=changedEntries.some(function(change){return change.index===pair.index;});
      return '<button class="item-row'+(pair.index===state.selected?' is-active':'')+'" data-select="'+pair.index+'">'+(image?'<img class="workspace-thumb" src="'+esc(image)+'" alt="" loading="lazy">':'')+'<span><strong>'+esc(config.itemTitle(pair.item))+'</strong><small>'+esc(config.itemMeta(pair.item))+'</small>'+(dirty?'<span class="workspace-chip">Draft</span>':'')+'</span></button>';
    }).join('');
    var current = items[state.selected];
    if(section==="results"&&current)recalculateResult(current);
    view.innerHTML = renderHeader(config) + '<div class="editor-layout"><details class="item-list item-picker workspace-records" '+(window.matchMedia('(min-width:761px)').matches||state.query?'open':'')+'><summary>Switch entry · '+esc(current?config.itemTitle(current):'Choose an entry')+'</summary><div class="list-tools"><input type="search" data-list-search value="' + esc(state.query) + '" placeholder="Search this section"><button type="button" data-action="add" aria-label="Add new">+</button></div><div class="list-scroll">' + (rows || '<div class="editor-empty">No entries yet.<br>Add the first one.</div>') + '</div></details><section class="editor-panel">' + (current ? renderEditor(config,current,state.selected) : '<div class="editor-empty">Select or add an entry.</div>') + '</section></div>';
    enhanceRows();
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
    record=record || (state.section==='results'&&state.data.records[state.selected]) || {division:division};
    return window.UARLResultDrivers.pool(state.data,record);
  }
  function driverOptionLabel(driver,number,invalid) {
    return (number?'#'+number+' · ':'')+driver.name+(driver.user&&!/^guest:/.test(driver.user)?' (@'+driver.user+')':'')+(invalid?' — not in race finish':driver.source==='saved'?' — saved result':'');
  }
  function seriesDriverSelect(value,attrs,identity,number,finishersOnly) {
    var record=state.data.records[state.selected],base=finishersOnly?window.UARLResultDrivers.bonusPool(state.data,record):seriesDriverPool(currentResultDivision(),null,record);
    var options=window.UARLResultDrivers.optionsForCurrent(base,value,identity,number);
    var selected=window.UARLResultDrivers.resolve(options,value,identity,number);
    var groups=new Map();
    options.forEach(function(driver){
      var group=driver.source==='saved'?'Saved result':driver.source==='guest'?'Saved race entries':driver.team|| (finishersOnly?'Race finish':'Roster');
      if(!groups.has(group))groups.set(group,[]);groups.get(group).push(driver);
    });
    return '<select data-driver-select '+attrs+'><option value="">'+(finishersOnly?'Choose a driver from this race finish':'Choose a roster driver')+'</option>'+Array.from(groups).map(function(group){
      return '<optgroup label="'+esc(group[0])+'">'+group[1].map(function(driver){
        var shownNumber=selected&&selected.key===driver.key&&number!==undefined?String(number==null?'':number):driver.number;
        var invalid=finishersOnly&&driver.source==='saved',label=driverOptionLabel(driver,shownNumber,invalid);
        return '<option value="'+esc(driver.key)+'" data-name="'+esc(driver.name)+'" data-source="'+esc(driver.source)+'" data-number="'+esc(driver.number)+'" data-user="'+esc(driver.user)+'" '+(selected&&selected.key===driver.key?'selected ':'')+(invalid?'disabled':'')+'>'+esc(label)+'</option>';
      }).join('')+'</optgroup>';
    }).join('')+'</select>';
  }
  var FINISH_POINTS=[50,45,42,40,38,36,34,32,30,28,27,26,25,24,23,22];
  var STAGE_POINTS=[5,4,3,2,1];
  var BONUS_POINTS={"Most laps led":3,"Fastest lap":2,"Fastest recorded practice":2};
  function identityText(value) { return String(value||"").trim().replace(/^@/,"").toLowerCase(); }
  function sameResultDriver(left,right) {
    var leftUser=identityText(left&&left.username||left&&left.driverUsername||left&&left.user),rightUser=identityText(right&&right.username||right&&right.driverUsername||right&&right.user);
    if(leftUser||rightUser)return Boolean(leftUser&&rightUser&&leftUser===rightUser);
    var leftName=identityText(left&&left.name||left&&left.driver),rightName=identityText(right&&right.name||right&&right.driver);
    return Boolean(leftName&&rightName&&leftName===rightName);
  }
  function seriesDriverInfo(name,identity,record,number) {
    var candidates=seriesDriverPool(record&&record.division||currentResultDivision(),null,record);
    return window.UARLResultDrivers.resolve(candidates,name,identity,number)||{};
  }
  function bonusPoints(name) { return BONUS_POINTS[name]||0; }
  function recalculateResult(record) {
    if(!record||!Array.isArray(record.finishes))return record;
    var isPoints=record.pointsEvent!==false&&!record.exhibition;
    function attachIdentity(row,nameKey,userKey) { var info=seriesDriverInfo(row[nameKey],row[userKey],record,row.number);if(info.user)row[userKey]=info.user;if(row.numberManual!==true&&!row.number&&info.number)row.number=info.number; }
    (record.qualifying||[]).forEach(function(row){attachIdentity(row,"name","username");});
    (record.stages||[]).forEach(function(stage){(stage.results||[]).forEach(function(row){attachIdentity(row,"name","username");});});
    record.finishes.forEach(function(row){attachIdentity(row,"name","username");});
    var poleInfo=seriesDriverInfo(record.pole,record.poleUsername,record);if(poleInfo.user)record.poleUsername=poleInfo.user;
    var winnerInfo=seriesDriverInfo(record.winner,record.winnerUsername,record);if(winnerInfo.user)record.winnerUsername=winnerInfo.user;
    if(record.winnerAutomatic){var first=record.finishes.find(function(row){return Number(row.position)===1;});record.winner=first&&first.name||'';record.winnerUsername=first&&first.username||'';}
    var finishers=window.UARLResultDrivers.bonusPool(state.data,record),awarded=new Set();
    (record.bonuses||[]).forEach(function(bonus){
      var recipient=window.UARLResultDrivers.resolve(finishers,bonus.driver,bonus.driverUsername,bonus.number);
      var awardKey=recipient&&bonus.name+':'+recipient.key;bonus.points=recipient&&!awarded.has(awardKey)?bonusPoints(bonus.name):0;if(recipient)awarded.add(awardKey);
      if(recipient){bonus.number=recipient.number;if(recipient.user)bonus.driverUsername=recipient.user;}
    });
    record.finishes.forEach(function(finish){
      var info=seriesDriverInfo(finish.name,finish.username,record,finish.number),eligible=finish.pointsEligible!==false&&isPoints,position=Number(finish.position),status=finish.resultStatus||"Finish";
      if(info.user)finish.username=info.user;if(finish.numberManual!==true&&!finish.number&&info.number)finish.number=info.number;
      var base=0;if(eligible){if(status==="DNQ")base=10;else if(status==="DNF")base=2;else if(position>0)base=FINISH_POINTS[Math.min(position,FINISH_POINTS.length)-1]||22;}
      var stagePoints=0,stageWins=0;
      if(eligible)(record.stages||[]).forEach(function(stage){var row=(stage.results||[]).find(function(result){return sameResultDriver(finish,result);});var stagePosition=row&&Number(row.position);if(stagePosition>0&&stagePosition<=STAGE_POINTS.length){stagePoints+=STAGE_POINTS[stagePosition-1];if(stagePosition===1)stageWins+=1;}});
      var earnedPole=sameResultDriver(finish,{name:record.pole,username:record.poleUsername}),polePoints=eligible&&earnedPole?5:0,extraPoints=eligible?(record.bonuses||[]).filter(function(bonus){return bonus.points>0&&sameResultDriver(finish,{driver:bonus.driver,driverUsername:bonus.driverUsername});}).reduce(function(sum,bonus){return sum+bonus.points;},0):0;
      finish.basePoints=base;finish.stagePoints=stagePoints;finish.stageWins=stageWins;finish.pole=Boolean(earnedPole);finish.bonusPoints=polePoints+extraPoints;finish.points=base+polePoints+extraPoints;finish.totalPoints=finish.points+stagePoints;
      finish.mostLapsLed=Boolean((record.bonuses||[]).some(function(bonus){return bonus.points>0&&bonus.name==='Most laps led'&&sameResultDriver(finish,{driver:bonus.driver,driverUsername:bonus.driverUsername});}));
    });
    return record;
  }
  function syncResultPoints(record) {
    view.querySelectorAll('[data-driver-select]').forEach(function(select){
      var option=select.selectedOptions[0];if(!option||!option.value)return;
      var row;
      if(select.dataset.sfield){
        var rows=record[select.dataset.sfield]||[];
        if(select.dataset.sparent!=null)rows=(rows[Number(select.dataset.sparent)]||{})[select.dataset.scollection]||[];
        row=rows[Number(select.dataset.srow)];
      } else if(select.dataset.field==='winner'||select.dataset.field==='pole') {
        var field=select.dataset.field;row=(record[field==='winner'?'finishes':'qualifying']||[]).find(function(row){return sameResultDriver(row,{name:record[field],username:record[field+'Username']});});
      }
      if(row)option.textContent=driverOptionLabel({name:option.dataset.name,user:option.dataset.user,source:option.dataset.source},String(row.number==null?'':row.number),option.disabled);
    });
    var review=view.querySelector('.race-review');if(review)review.outerHTML=raceReview(record);
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
    return '<div class="builder-row"><div class="builder-grid classification-grid"><label>Car #'+dataInput(field,row,'number',item.number,'text',parent,collection).replace('<input ','<input data-auto-number inputmode="numeric" title="Filled from the roster; edit for this race" ')+'</label><label>Position'+dataInput(field,row,"position",item.position,"number",parent,collection)+'</label><label class="builder-span-2">Driver'+seriesDriverSelect(item.name,attrs,item.username,item.number)+'</label>'+(finish?'<label>Result status<select data-sfield="'+esc(field)+'" data-srow="'+row+'" data-skey="resultStatus" data-stype="text">'+optionList(["Finish","DNF","DNQ"],item.resultStatus||"Finish")+'</select></label><label>Stage points<input type="number" data-auto-stage="'+row+'" readonly value="'+esc(item.stagePoints||0)+'" title="Calculated from stage results"></label><label>Total points<input type="number" data-auto-points="'+row+'" readonly value="'+esc(item.totalPoints||0)+'" title="Calculated automatically"></label><label class="builder-check">'+dataInput(field,row,"pointsEligible",item.pointsEligible!==false,"bool",parent,collection)+' Eligible</label>':'')+'</div>'+removeButton(field,row,parent,collection)+'</div>';
  }
  function winnerPairRow(field,row,pair,parent,collection,listId) {
    return '<div class="builder-row"><div class="builder-grid pair-grid"><label>Driver'+dataInput(field,row,"0",pair[0],"text",parent,collection,listId)+'</label><label>Wins'+dataInput(field,row,"1",pair[1],"number",parent,collection)+'</label></div>'+removeButton(field,row,parent,collection)+'</div>';
  }
  function driverMini(entry){var profile=window.UARLData.driverProfile(entry.user,state.data.drivers.profiles),numberImage=entry.numberImage||profile.numberImage,signature=entry.signatureImage||profile.signatureImage;return '<div class="driver-mini"><div class="driver-mini-number">'+(numberImage?'<img src="'+esc(numberImage)+'" alt="">':'#'+esc(entry.number||'—'))+'</div><div>'+(signature?'<img class="driver-mini-signature" src="'+esc(signature)+'" alt="'+esc(window.UARLData.driverName(entry,state.data.drivers.profiles))+'">':'<b>'+esc(window.UARLData.driverName(entry,state.data.drivers.profiles))+'</b>')+'<small>'+esc(entry.user?'@'+entry.user:entry.status||'Available seat')+'</small></div></div>';}
  function renderStructuredField(key,label,type,item) {
    var value=Array.isArray(item[key])?item[key]:[],listId='driver-list-'+key+'-'+state.selected;
    var suggestions='<datalist id="'+listId+'">'+driverSuggestions().map(function(name){return '<option value="'+esc(name)+'">';}).join("")+'</datalist>',rows="",addLabel="Add row",help="";
    if(type==="roster"){
      help="Enter an account for a new entry. For an assigned driver, use Edit name or username; use Move or sign a driver to change the person in a seat. Charter details and artwork remain available below.";
      addLabel="Add charter / entry";
      rows=value.map(function(entry,index){
        var known=driverProfileKey(entry.user),locked=known&&!pendingDriverAccount(known);
        var account=dataInput(key,index,"user",locked?driverAccountCaption(entry.user):entry.user,"text",null,null,listId);
        if(locked)account=account.replace('<input ','<input readonly data-assigned-driver-account="'+esc(known)+'" ');
        return '<div class="builder-row roster-row">'+driverMini(entry)+'<div class="builder-grid roster-grid">'+
          '<label>Car #'+dataInput(key,index,"number",entry.number)+'</label><div class="field"><label>Roblox username'+account+'</label>'+driverIdentityShortcut(entry.user)+'</div><label>Public display name'+dataInput(key,index,"name",entry.name,"text",null,null,listId)+'</label><label>Status<select data-sfield="'+esc(key)+'" data-srow="'+index+'" data-skey="status" data-stype="text">'+optionList(["","Full-Time","Signed","Open FT","Part-Time","Development","Inactive"],entry.status)+'</select></label>'+
          '<details class="seat-details"><summary>Charter details & signing date</summary><div class="builder-grid">'+
          '<label>Seat type<select data-sfield="'+esc(key)+'" data-srow="'+index+'" data-skey="seatType" data-stype="text">'+optionList(["","Full-Time","Part-Time","Development","Shared"],entry.seatType)+'</select></label><label>Charter type<select data-sfield="'+esc(key)+'" data-srow="'+index+'" data-skey="charterType" data-stype="text">'+optionList(["","FT","PT","DEV","FLEX"],entry.charterType)+'</select></label><label>Signed date'+dataInput(key,index,"signedAt",entry.signedAt,"date")+'</label><label class="builder-check">'+dataInput(key,index,"recent",entry.recent,"bool")+' Recent move</label></div></details>'+renderDriverArtwork(entry,key,index)+'</div>'+removeButton(key,index)+'</div>';
      }).join('');
    }else if(type==="classification"||type==="finishes"){
      addLabel=type==="finishes"?"Add finishing position":"Add qualifying position";rows=value.map(function(entry,index){return classificationRow(key,index,entry,type==="finishes",listId);}).join("");
    }else if(type==="bonuses"){
      addLabel="Add bonus";rows=value.map(function(entry,index){return '<div class="builder-row"><div class="builder-grid bonus-grid"><label>Bonus type<select data-sfield="'+esc(key)+'" data-srow="'+index+'" data-skey="name" data-stype="text">'+optionList(Object.keys(BONUS_POINTS),entry.name)+'</select></label><label>Driver'+seriesDriverSelect(entry.driver,'data-sfield="'+esc(key)+'" data-srow="'+index+'" data-skey="driver" data-stype="text"',entry.driverUsername,entry.number,true)+'</label><label>Car #<input type="text" data-auto-number readonly value="'+esc(entry.number||"")+'"></label><label>Points<input type="number" data-auto-bonus="'+index+'" readonly value="'+esc(entry.points||0)+'"></label></div>'+removeButton(key,index)+'</div>';}).join("");
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

  function renderDriverArtwork(entry,field,row){var key=state.section+':'+state.selected+':'+field+':'+row;return '<details class="roster-artwork" data-artwork-key="'+esc(key)+'" '+(artworkOpen[key]?'open':'')+'><summary>Number art & signature</summary><div class="builder-grid">'+renderImageControl('numberImage','Number art',entry,field,row)+renderImageControl('signatureImage','Signature logo',entry,field,row)+'</div></details>';}
  function renderImageControl(key, label, entry, field, row) {
    var attrs=' data-image-key="'+esc(key)+'"'+(field?' data-image-field="'+esc(field)+'" data-image-row="'+row+'"':'');
    var help=key==='numberImage'?'Optional PNG, JPEG or WebP. Standings fit number art into matching sizes on desktop and mobile; without an image, the car number stays as text. Large originals resize automatically, preserving transparency. Publish the draft to show it on the site.':'PNG, JPEG or WebP. Large images resize automatically; transparent backgrounds are preserved. Publish the draft to show this on the site.';
    return '<div class="field wide image-upload"><span>'+esc(label)+'</span>'+(entry[key]?'<img src="'+esc(entry[key])+'" alt="'+esc(label)+' preview"><button type="button" class="button ghost" data-image-clear'+attrs+'>Remove image</button>':'')+'<label class="button ghost">Upload '+esc(label.toLowerCase())+'<input type="file" accept="image/png,image/jpeg,image/webp" data-image-upload'+attrs+'></label><small>'+help+'</small><span data-image-status role="status"></span></div>';
  }
  async function prepareDriverImage(file) {
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG or WebP image.');
    var image=new Image(), url=URL.createObjectURL(file);
    try {
      await new Promise(function(resolve,reject){image.onload=resolve;image.onerror=function(){reject(new Error('This image could not be opened. Try a PNG, JPEG or WebP export.'));};image.src=url;});
      var artwork=window.UARLData.trimArtwork(image);
      var scale=Math.min(1,1600/artwork.width,1600/artwork.height),canvas=document.createElement('canvas');
      for(var attempt=0;attempt<5;attempt++) {
        canvas.width=Math.max(1,Math.round(artwork.width*scale));canvas.height=Math.max(1,Math.round(artwork.height*scale));
        canvas.getContext('2d').drawImage(artwork,0,0,canvas.width,canvas.height);
        var blob=await new Promise(function(resolve){canvas.toBlob(resolve,'image/webp',0.9);});
        if(blob&&blob.size<=2*1024*1024)return await new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(){resolve(reader.result);};reader.onerror=reject;reader.readAsDataURL(blob);});
        scale*=0.7;
      }
      throw new Error('Unable to resize this image. Try exporting it as a smaller PNG or WebP.');
    } finally { URL.revokeObjectURL(url); }
  }
  function imageTarget(input, items) {
    var entry=items[state.selected];
    return input.dataset.imageField ? entry[input.dataset.imageField][Number(input.dataset.imageRow)] : entry;
  }
  async function uploadDriverImage(input) {
    var file=input.files[0];if(!file)return;
    var pair=currentConfigAndItems(),target=imageTarget(input,pair.items),key=input.dataset.imageKey,section=state.section,selected=state.selected,data=state.data;
    var message=input.closest('.image-upload').querySelector('[data-image-status]');
    var artwork=input.closest('.roster-artwork');if(artwork){artwork.open=true;artworkOpen[artwork.dataset.artworkKey]=true;}
    pendingImageUploads++;updateDraftTools();input.disabled=true;message.textContent='Preparing image…';
    try {
      var image=await prepareDriverImage(file);message.textContent='Uploading…';
      var result=await accountRequest('upload-driver-image',{image:image});
      if(state.data!==data)throw new Error('The draft changed while uploading. Please select the image again.');
      var currentEdit=editSession;commitPendingEdit();
      if(section==='profiles') {
        var profile=state.data.drivers.profiles[target.username];
        if(!profile)throw new Error('The profile was renamed or removed while uploading. Please select the image again.');
        profile[key]=result.url;
      } else {var stillPresent=input.dataset.imageField?pair.items.some(function(owner){return (owner[input.dataset.imageField]||[]).includes(target);}):pair.items.includes(target);if(!stillPresent)throw new Error('This entry was removed while uploading. Please select the image again.');target[key]=result.url;}
      changed();
      if(state.section===section&&state.selected===selected&&!currentEdit)render();else if(input.isConnected){var container=input.closest('.image-upload');container.outerHTML=renderImageControl(key,key==='numberImage'?'Number art':'Signature logo',target,input.dataset.imageField,input.dataset.imageRow);}toast('Image saved to draft. Publish when ready.');
    } catch(error) { message.textContent=error.message;toast(error.message,true); }
    finally {pendingImageUploads--;input.disabled=false;input.value='';if(currentEdit&&document.activeElement===currentEdit.node)editSession=currentEdit;updateDraftTools();}
  }

  function renderField(field, item) {
    var key=field[0],label=field[1],type=field[2]||"text",options=Array.isArray(field[3])?field[3]:null,wide=field[3]==="wide"||field[4]==="wide",value=item[key];
    if(state.section==='profiles'&&(key==='username'||key==='currentUsername')) {
      var pending=pendingDriverAccount(item.username),readOnly=key==='username'?!pending:pending;
      var displayed=key==='username'&&pending?'':value||'';
      var help=key==='username'?(pending?'Enter the Roblox account for this new driver.':'Keep this account link. Use Current Roblox username below when the same person changes their username.'):'Changing this username keeps the same driver, results and team assignment. Leave it blank to display the original account name.';
      return '<label class="field"><span>'+esc(label)+'</span><input type="text" data-field="'+esc(key)+'" data-type="text" data-profile-account data-profile-account-key="'+esc(item.username)+'" aria-label="'+esc(label)+'" maxlength="20" '+(readOnly?'readonly ':'')+'value="'+esc(displayed)+'"'+(pending&&key==='username'?' placeholder="Enter Roblox username"':'')+'><small>'+help+'</small></label>';
    }
    if(state.section==='open'&&key==='user') {
      var known=driverProfileKey(value),locked=known&&!pendingDriverAccount(known);
      return '<div class="field"><label><span>'+esc(label)+'</span><input type="text" data-field="user" data-type="text" '+(locked?'readonly data-assigned-driver-account="'+esc(known)+'" ':'')+'value="'+esc(locked?driverAccountCaption(value):value||'')+'"></label>'+driverIdentityShortcut(value)+'</div>';
    }
    if (["roster","classification","finishes","stages","bonuses","tags","winnerTotals","seasons"].includes(type)) return renderStructuredField(key,label,type,item);
    if(key==='id')return '<details class="field wide internal-id"><summary>Advanced: reference ID</summary><label>'+esc(label)+'<input type="text" data-field="id" data-type="text" value="'+esc(value||'')+'"></label></details>';
    if (type === "image") return renderImageControl(key,label,item);
    if (type === "divisions") return '<fieldset class="field wide roster-series"><legend>'+esc(label)+'</legend>'+[["d1","D1 · Cup"],["open","Open Series"]].map(function(pair){return '<label><input type="checkbox" data-field="'+esc(key)+'" data-type="divisions" data-division-value="'+pair[0]+'" '+(Array.isArray(value)&&value.includes(pair[0])?'checked':'')+'>'+pair[1]+'</label>';}).join('')+'<small>Permanent entries are available for CSV imports even without a team or charter. Team entries are always available in their own series.</small></fieldset>';
    if (type === "seriesDriver") {
      var rows=key==='winner'?item.finishes:key==='pole'?item.qualifying:null;
      var row=rows&&rows.find(function(row){return sameResultDriver(row,{name:value,username:item[key+'Username']});});
      return '<label class="field"><span>'+esc(label)+'</span>'+seriesDriverSelect(value,'data-field="'+esc(key)+'" data-type="select"',item[key+"Username"],row&&row.number)+'</label>';
    }
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
    return '<div class="warning"><b>Roblox username needed:</b> '+Array.from(missing.values()).map(esc).join(", ")+'. Add it in Teams + Charters for a rostered driver, or Driver roster for a permanent entry. This prevents split standings and makes stage points follow the correct driver.</div>';
  }

  var editorGroups = {
    profiles:[['Identity',['username','currentUsername','alias','csvDivisions','number','csvAliases']],['Career',['wins','championships','rank']],['Artwork',['numberImage','signatureImage']]],
    open:[['Driver',['number','user','name','make','status']],['Artwork',['numberImage','signatureImage']]],
    freeAgents:[['Driver',['name','user']],['Previous entry',['former']]],
    moves:[['Signing',['driver','team','number','make','signedAt']]],
    paints:[['Driver',['division','series','number','name','handle','team','make']],['Scheme',['id','title','subtitle','image','body','scrAffiliate']],['Tags & search',['extra','search']]],
    conduct:[['Rule',['id','group','text']],['Penalty',['penalty','severe']]],
    results: [ ["Race", ["id","division","event","date","start","track","round","laps","status","eventType","pointsEvent","exhibition"]], ["Roster", []], ["Qualifying", ["pole","qualifying"]], ["Stages", ["stages"]], ["Finish", ["winnerAutomatic","winner","finishes"]], ["Bonuses", ["bonuses"]], ["Notes", ["pointsSummary","pointsNote","recordNote"]] ],
    teams: [ ["Team", ["id","name","owner","ownerNote","make","founded","note"]], ["Branding", ["logo","brandColor","brandColor2"]], ["Charters", ["charterCount","entries"]], ["Pending drivers", ["pendingDrivers"]] ],
    schedule: [ ["Event", ["id","division","series","name","track","round","laps"]], ["Date + status", ["date","start","scheduleStatus","scheduleNote","completed"]], ["Race format", ["exhibition","pointsEvent","crownJewel","chase","special"]], ["Original date", ["originalDate","originalStart"]] ]
  };
  function groupsFor(config) {
    if (editorGroups[state.section]) return editorGroups[state.section];
    var groups = [], batch = [];
    config.fields.forEach(function (field) {
      if (["roster","classification","finishes","stages","bonuses","tags","winnerTotals","seasons"].includes(field[2])) {
        if (batch.length) { groups.push([groups.length ? "More details" : "Overview", batch]); batch = []; }
        groups.push([field[1], [field[0]]]);
      } else {
        batch.push(field[0]);
        if (batch.length === 4) { groups.push([groups.length ? field[1] + " + details" : "Overview", batch]); batch = []; }
      }
    });
    if (batch.length) groups.push([groups.length ? "More details" : "Overview", batch]);
    return groups;
  }
  function scheduleOptions(record) {
    return '<label class="field wide schedule-link"><span>Scheduled race</span><select data-schedule-race><option value="">Unlinked / custom event</option>' + state.data.events.slice().sort(function(a,b){return new Date(a.start||a.date)-new Date(b.start||b.date);}).map(function(event){
      var taken=state.data.records.some(function(r){return r!==record && (r.id===event.id || r.scheduleEventId===event.id);});
      return '<option value="'+esc(event.id)+'" '+(record.id===event.id||record.scheduleEventId===event.id?'selected ':'')+(taken?'disabled':'')+'>'+esc(String(event.division).toUpperCase()+' · '+event.date+' · '+event.name+(taken?' (result exists)':''))+'</option>';
    }).join('')+'</select><small>Choosing a race fills its details and keeps the result linked to the schedule.</small></label>';
  }
  function applyScheduledRace(record, event) {
    ["division","date","start","track","round","laps","pointsEvent","exhibition","series","scheduleStatus"].forEach(function(key){ if (event[key] !== undefined) record[key]=clone(event[key]); else delete record[key]; });
    record.id=event.id; record.scheduleEventId=event.id; record.event=event.name;
    record.eventType=event.exhibition ? "Exhibition" : "Points race";
  }
  function nextUnrecordedRace() {
    return state.data.events.filter(function(event){return event.scheduleStatus!=="cancelled" && !state.data.records.some(function(record){return record.id===event.id || record.scheduleEventId===event.id;});}).sort(function(a,b){return new Date(a.start||a.date)-new Date(b.start||b.date);})[0];
  }
  function resultNavigation(groups) {
    function button(index,label){return '<button type="button" data-step="'+index+'" '+(index===state.step?'aria-current="step"':'')+'>'+esc(label)+'</button>';}
    return '<div class="editor-steps result-flow"><nav aria-label="Race entry">'+button(0,'1. Race & CSV')+button(4,'Manual corrections')+button(5,'2. Review & publish')+'</nav><details data-result-details '+([2,3,6].includes(state.step)?'open':'')+'><summary>Qualifying, stages & notes</summary><nav aria-label="More race details">'+[2,3,6].map(function(i){return button(i,groups[i][0]);}).join('')+'</nav></details></div>';
  }
  function renderFinisherPicker(record) {
    var all=seriesDriverPool(record.division,null,record),entered=(record.finishes||[]).map(function(row){return window.UARLResultDrivers.resolve(all,row.name,row.username,row.number);});
    var drivers=all.filter(function(driver){return !entered.some(function(found){return found&&found.key===driver.key;});});
    return '<details class="finisher-picker" data-finisher-picker><summary>+ Select drivers who raced</summary><p>Pick the participants once, then use the arrows to arrange their finish order. Numbers stay editable.</p><input type="search" data-finish-search placeholder="Find a driver or team" aria-label="Find a race participant"><div class="participant-list">'+drivers.map(function(driver){return '<label data-participant><input type="checkbox" data-finisher-choice value="'+esc(driver.key)+'"><span><b>'+esc((driver.number?'#'+driver.number+' · ':'')+driver.name)+'</b><small>'+esc([driver.team,driver.user&&'@'+driver.user].filter(Boolean).join(' · '))+'</small></span></label>';}).join('')+'</div><button type="button" class="button" data-add-finishers>Add selected drivers</button>'+(drivers.length?'':'<p>All current roster drivers are already listed. Add any new permanent driver under Driver roster.</p>')+'</details>';
  }
  function raceReview(record) {
    var issues=window.UARLResultDrivers.bonusIssues({drivers:state.data.drivers,race:state.data.race,records:[record]});
    return '<div class="race-review"><b>'+esc(record.event)+' · '+(record.finishes||[]).length+' finishers</b><p>Winner: '+esc(record.winner||'Not set')+' · '+(record.bonuses||[]).length+' awards</p><p>'+(issues.length?esc(issues[0].message):'Ready to review. Preview the site or publish when the order and awards are correct.')+'</p><button type="button" class="button ghost" data-action="preview">Preview race</button></div>';
  }
  function renderEditor(config,item,index) {
    var groups=groupsFor(config); state.step=Math.min(state.step,groups.length-1);if(state.section==="results"&&state.step===1)state.step=0;
    var group=groups[state.step],isResult=state.section==='results';
    var fields=config.fields.filter(function(f){return group[1].includes(f[0]);}).map(function(f){return renderField(f,item);}).join('');
    var linkedRace=isResult&&state.step===0;
    var body=linkedRace ? '<div class="field-grid">'+scheduleOptions(item)+'</div><details class="race-details" '+(item.scheduleEventId||state.data.events.some(function(e){return e.id===item.id;})?'':'open')+'><summary>Race details · '+esc(item.event)+' · '+esc(item.date)+'</summary><p>Filled from the schedule. Expand to review or correct the details.</p><div class="field-grid">'+fields+'</div></details>' : '<div class="field-grid">'+fields+'</div>';
    if(state.section==='paints')body=paintAssist()+body;
    if(state.section==='teams')body='<div class="workspace-assist"><button type="button" class="button" data-open-transfer>Move or sign a driver →</button><small>One action updates the roster and signing announcement.</small></div>'+body;
    if(!isResult)body=renderWorkspacePreview(state.section,item)+body;
    if(isResult&&state.step===4)body=renderFinisherPicker(item)+body;
    if(isResult&&state.step===5)body='<p class="editor-guidance">Awards are only available to drivers in this race finish. Choose who earned each bonus; no lap totals are needed.</p>'+body+raceReview(item);
    var next=isResult&&state.step===0?5:isResult&&state.step===4?5:state.step+1;
    var back=isResult&&state.step===4?0:isResult&&state.step===5?0:state.step-1;
    var final=isResult?state.step===5||state.step===6:state.step===groups.length-1;
    var total=currentConfigAndItems().items.length;
    return '<nav class="workspace-record-nav" aria-label="Record navigation"><button type="button" class="button ghost" data-record-next="-1" '+(!index?'disabled':'')+'>← Previous</button><span>'+(index+1)+' of '+total+'</span><button type="button" class="button ghost" data-record-next="1" '+(index>=total-1?'disabled':'')+'>Next →</button></nav><div class="editor-title"><div><small>ENTRY '+String(index+1).padStart(2,'0')+'</small><h2>'+esc(config.itemTitle(item))+'</h2></div></div>'+resultIdentityWarning(item)+(isResult?imports.results(item):'')+
      '<p class="editor-guidance">'+(isResult?'Paste the results CSV, preview it, then apply it to your draft. Manual corrections are optional.':'One section at a time. Edits save automatically.')+'</p>'+
      (isResult?resultNavigation(groups):'<nav class="editor-steps" aria-label="Entry sections">'+groups.map(function(g,i){return '<button type="button" data-step="'+i+'" '+(i===state.step?'aria-current="step"':'')+'>'+(i+1)+'. '+esc(g[0])+'</button>';}).join('')+'</nav>')+
      '<section aria-label="'+esc(group[0])+'"><h3 class="step-heading" tabindex="-1">'+esc(isResult&&state.step===5?'Awards & review':group[0])+'</h3>'+body+'</section>'+
      '<div class="step-actions"><button class="button ghost" data-step="'+back+'" '+(!state.step?'disabled':'')+'>← Back</button><span>'+(isResult?'Saved as a draft':'Section '+(state.step+1)+' of '+groups.length)+'</span>'+(final?'<button class="button" data-action="'+(isResult?'publish':'preview')+'">'+(isResult?'Review & publish':'Preview changes')+'</button>':'<button class="button" data-step="'+next+'">'+(isResult&&state.step===0?'Review & publish →':isResult&&state.step===4?'Assign bonuses →':'Next →')+'</button>')+'</div>'+
      '<footer class="editor-footer"><div class="shift-tools">'+(config.shifts?'<button class="button ghost" data-shift="-7">← Shift 1 week</button><button class="button ghost" data-shift="7">Shift 1 week →</button>':'')+'</div><div class="view-actions"><button class="button ghost" data-action="duplicate">Duplicate entry</button><button class="button danger" data-action="delete">Delete entry</button></div></footer>';
  }

  function addSelectedFinishers() {
    var record=structuredItem(),drivers=seriesDriverPool(record.division,null,record),selected=Array.from(view.querySelectorAll('[data-finisher-choice]:checked')).map(function(input){return input.value;});
    if(!selected.length){toast('Select the drivers who raced.');return;}
    selected.forEach(function(key){var driver=drivers.find(function(d){return d.key===key;});if(!driver)return;var row=structuredTemplate('finishes',record.finishes);row.position=Math.max(0,...record.finishes.map(function(r){return Number(r.position)||0;}))+1;row.name=driver.name;row.username=driver.user;row.number=driver.number;record.finishes.push(row);});
    recalculateResult(record);changed();render();toast('Drivers added. Use the arrows to set their finish order.');
  }
  function moveFinisher(button) {
    var record=structuredItem(),from=Number(button.dataset.moveFinish),to=from+Number(button.dataset.direction);
    if(to<0||to>=record.finishes.length)return;
    var row=record.finishes.splice(from,1)[0];record.finishes.splice(to,0,row);
    record.finishes.forEach(function(finish,index){finish.position=index+1;});recalculateResult(record);changed();render();
    var moved=view.querySelector('[data-move-finish="'+to+'"][data-direction="'+button.dataset.direction+'"]');if(moved){if(moved.disabled)moved=moved.closest('.entry-card').querySelector('.finish-order-controls button:not(:disabled)')||moved.closest('summary');moved.focus();}
  }

  // Compact row editors keep even a full roster or classification manageable.
  var rowOpen = {};
  function enhanceRows() {
    view.querySelectorAll('.structured-list > .builder-row, .structured-list > .nested-builder, .nested-rows > .builder-row').forEach(function(row, index){
      var field=row.closest('.structured-field'), key=state.section+':'+state.selected+':'+state.step+':'+index;
      var details=document.createElement('details'), summary=document.createElement('summary');
      details.className='entry-card'; details.open=Boolean(rowOpen[key]);
      var summaryLabel=document.createElement('span');summary.append(summaryLabel);
      function updateSummary() {
        var inputs=Array.from(row.querySelectorAll('input:not([type="checkbox"]), select'));
        var text=inputs.filter(function(input){return !input.readOnly && input.value;}).slice(0,3).map(function(input){return input.tagName==='SELECT'?input.selectedOptions[0].textContent:input.value;}).join(' · ');
        var rosterUser=row.querySelector('[data-sfield="entries"][data-skey="user"], [data-sfield="pendingDrivers"][data-skey="user"]');
        if(rosterUser) {
          function value(key) { var input=row.querySelector('[data-skey="'+key+'"]'); return input ? input.value : ''; }
          text=[value('number')&&'#'+value('number'),window.UARLData.driverName({name:value('name'),user:value('user')},state.data.drivers.profiles),value('status')].filter(Boolean).join(' · ');
        }
        var finish=row.querySelector('[data-sfield="finishes"][data-skey="position"]');
        if(finish){var select=row.querySelector('[data-driver-select]'),selected=select&&select.selectedOptions[0],car=row.querySelector('[data-auto-number]'),points=row.querySelector('[data-auto-points]');text='P'+finish.value+' · '+(car&&car.value?'#'+car.value+' · ':'')+(selected&&selected.dataset.name||'Choose driver')+(points?' · '+points.value+' pts':'');}
        summaryLabel.textContent=text || 'New entry — tap to fill in';
      }
      updateSummary();
      var position=row.querySelector('[data-sfield="finishes"][data-skey="position"]');
      if(position){var rowIndex=position.dataset.srow;var controls=document.createElement('span');controls.className='finish-order-controls';controls.innerHTML='<button type="button" data-move-finish="'+rowIndex+'" data-direction="-1" aria-label="Move finisher up" '+(rowIndex==='0'?'disabled':'')+'>↑</button><button type="button" data-move-finish="'+rowIndex+'" data-direction="1" aria-label="Move finisher down" '+(Number(rowIndex)===structuredItem().finishes.length-1?'disabled':'')+'>↓</button>';summary.append(controls);}
      row.addEventListener('input',function(){queueMicrotask(updateSummary);});
      details.addEventListener('toggle',function(){rowOpen[key]=details.open;});
      row.replaceWith(details); details.append(summary,row);
      if (state.openNewRow) {
        var marker=row.querySelector('[data-sfield="'+state.openNewRow.field+'"][data-srow="'+state.openNewRow.row+'"]'+(state.openNewRow.parent!=null?'[data-sparent="'+state.openNewRow.parent+'"]':''));
        if(marker)details.open=true;
      }
    });
    state.openNewRow=false;
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
      '<section class="accounts-layout"><div><article class="account-panel"><h2>Add staff member</h2><p class="account-help">Every person receives a unique username and password. Passwords are stored as secure hashes.</p><form class="account-form" data-account-create-form><label>Display name<input required data-new-display maxlength="60"></label><label>Username<input required data-new-username minlength="3" maxlength="32" pattern="[A-Za-z0-9._-]+"></label><label>Role<select data-new-role>'+roleOptions("race_control")+'</select></label><label>Temporary password<input required type="password" data-new-password minlength="10" autocomplete="new-password"></label><button class="button publish" type="submit">Create account</button></form></article><article class="account-panel" style="margin-top:14px"><h2>Role permissions</h2><p class="account-help"><b>Owner:</b> full website and account control.<br><b>Admin:</b> full website control without staff management.<br><b>Race Control:</b> schedule, results, and standings publishing only.</p></article></div><div><article class="account-panel"><h2>Current staff</h2><div class="account-list" data-account-list><div class="warning">Loading accounts…</div></div></article><article class="account-panel" style="margin-top:14px"><h2>Recent activity</h2><div class="audit-list" data-audit-list><div class="warning">Loading activity…</div></div></article></div></section>';
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
    commitPendingEdit();
    document.querySelectorAll("[data-section]").forEach(function (button) { button.classList.toggle("is-active",button.dataset.section===state.section);if(button.dataset.section===state.section)button.setAttribute("aria-current","page");else button.removeAttribute("aria-current"); });
    document.querySelector("[data-mobile-section]").value=state.section;
    var more=document.querySelector('[data-admin-more]');more.classList.toggle('is-active',!['dashboard','schedule','results'].includes(state.section));
    if (state.section === "dashboard") renderDashboard(); else if (state.section === "advanced") renderAdvanced(); else if(state.section==="accounts")renderAccounts(); else if(state.section==="standings")view.innerHTML=imports.standings(); else renderCollection(state.section);
  }

  function currentConfigAndItems() {
    var config = state.section === "profiles" ? profileConfig() : configs[state.section];
    var items = state.section === "profiles" ? profileRows() : getPath(config.path);
    return {config:config,items:items};
  }

  function commitItems(items) { if (state.section === "profiles") saveProfiles(items); }
  function structuredItem() { var pair=currentConfigAndItems();return pair.items[state.selected]; }
  function structuredTemplate(type,array) {
    if(type==="roster")return {number:"",user:"",name:"",status:"Full-Time",seatType:"",charterType:"",signedAt:"",recent:false};
    if(type==="classification")return {position:(array.length+1),number:"",name:""};
    if(type==="finishes")return {position:(array.length+1),number:"",name:"",resultStatus:"Finish",pointsEligible:true,points:0,stagePoints:0,bonusPoints:0,totalPoints:0};
    if(type==="bonuses")return {name:"Most laps led",driver:"",number:"",points:0};
    if(type==="tags")return "";
    if(type==="winnerTotals"||type==="pair")return ["",0];
    if(type==="stages")return {name:"Stage "+(array.length+1),results:[]};
    if(type==="seasons")return {number:array.length+1,champion:"",winners:[]};
    return {};
  }
  function addStructured(button) { var item=structuredItem(),key=button.dataset.sadd,type=button.dataset.stype;if(!Array.isArray(item[key]))item[key]=[];item[key].push(structuredTemplate(type,item[key]));state.openNewRow={field:key,row:item[key].length-1};if(state.section==="results")recalculateResult(item);changed();render(); }
  function addNestedStructured(button) { var item=structuredItem(),root=item[button.dataset.snadd],parent=root[Number(button.dataset.sparent)],collection=button.dataset.scollection;if(!Array.isArray(parent[collection]))parent[collection]=[];parent[collection].push(structuredTemplate(button.dataset.stype,parent[collection]));state.openNewRow={field:button.dataset.snadd,parent:Number(button.dataset.sparent),row:parent[collection].length-1};if(state.section==="results")recalculateResult(item);changed();render(); }
  function removeStructured(button) { if(!confirm("Remove this row?"))return;var item=structuredItem(),root=item[button.dataset.sremove],row=Number(button.dataset.srow);if(button.dataset.sparent!=null)root=root[Number(button.dataset.sparent)][button.dataset.scollection];root.splice(row,1);if(state.section==="results")recalculateResult(item);changed();render(); }
  function updateStructured(input) {
    if(input.hasAttribute('data-assigned-driver-account'))return;
    var item=structuredItem(),root=item[input.dataset.sfield],row=Number(input.dataset.srow),target;
    if(input.dataset.sparent!=null)target=root[Number(input.dataset.sparent)][input.dataset.scollection][row];else target=root[row];
    var value=input.dataset.stype==='bool'?input.checked:input.dataset.stype==='number'?(input.value===''?null:Number(input.value)):input.value;
    if(target==null||typeof target!=='object')root[row]=value;
    else if(input.hasAttribute('data-driver-select')) {
      var chosen=input.options[input.selectedIndex],nameKey=input.dataset.skey,userKey=nameKey==='driver'?'driverUsername':'username';
      var base=nameKey==='driver'?window.UARLResultDrivers.bonusPool(state.data,item):seriesDriverPool(item.division,null,item);
      var previous=window.UARLResultDrivers.resolve(base,target[nameKey],target[userKey],target.number);
      var same=previous&&previous.key===input.value,hadDriver=Boolean(target[nameKey]||target[userKey]);
      if(!same&&(!target.numberManual||hadDriver)||nameKey==='driver'){target.number=chosen&&chosen.dataset.number||'';delete target.numberManual;}
      target[nameKey]=chosen&&chosen.dataset.name||'';
      target[userKey]=chosen&&chosen.dataset.user|| (same?target[userKey]:'');
      var numberInput=input.closest('.builder-row').querySelector('[data-auto-number]');if(numberInput)numberInput.value=target.number||'';
    } else {
      target[Array.isArray(target)?Number(input.dataset.skey):input.dataset.skey]=value;
      if(state.section==='results'&&input.dataset.skey==='number')target.numberManual=true;
    }
    if(state.section==='results'){recalculateResult(item);syncResultPoints(item);}changed();
    if(input.dataset.sfield==='entries'||input.dataset.sfield==='pendingDrivers'){var card=input.closest('.builder-row'),mini=card&&card.querySelector('.driver-mini');if(mini)mini.outerHTML=driverMini(target);}
  }

  function addItem() { var pair=currentConfigAndItems(); var item=pair.config.template(); if(state.section==="results"){var next=nextUnrecordedRace();if(next)applyScheduledRace(item,next);} state.step=0; pair.items.push(item); commitItems(pair.items); state.selected=pair.items.length-1; state.query=""; changed(); render(); }
  function deleteItem() { var pair=currentConfigAndItems(); if(!pair.items[state.selected]||!confirm("Delete this entry? This can be undone by reloading the published data."))return; pair.items.splice(state.selected,1); commitItems(pair.items); state.selected=Math.max(0,state.selected-1); changed(); render(); }
  function duplicateItem() { var pair=currentConfigAndItems(); var copy=clone(pair.items[state.selected]); if(copy.id)copy.id=copy.id+"-copy-"+Date.now();if(state.section==="results")delete copy.scheduleEventId;if(state.section==='profiles'){copy.username='new_driver_'+Date.now();copy.currentUsername='';copy.usernameAliases=[];} pair.items.splice(state.selected+1,0,copy); commitItems(pair.items); state.selected+=1; changed(); render(); }
  function shiftEvent(days) { var event=getPath("events")[state.selected],amount=Number(days)*86400000; ["start","originalStart"].forEach(function(k){if(event[k])event[k]=new Date(new Date(event[k]).getTime()+amount).toISOString();}); ["date","originalDate"].forEach(function(k){if(event[k])event[k]=dateOnly(new Date(new Date(event[k]+"T12:00:00").getTime()+amount));}); changed(); render(); }

  async function reloadPublished() {
    if(state.dirty&&!confirm("Discard the browser draft and reload the currently published data?"))return;
    try { state.data=await window.UARLData.load(true); (state.data.records||[]).forEach(recalculateResult);state.original=clone(state.data); state.dirty=false;state.changes=0;localStorage.removeItem(DRAFT_KEY);resetHistory();setStatus("Published data loaded","ready");render();toast("Published website data reloaded."); } catch(error){toast(error.message,true);}
  }

  function exportData() { var blob=new Blob([JSON.stringify(state.data,null,2)+"\n"],{type:"application/json"});var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="uarl-data-backup-"+dateOnly(new Date())+".json";a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},1000); }
  function preview() { localStorage.setItem(window.UARLData.previewKey,JSON.stringify(state.data)); var route={schedule:"/schedule/",results:"/race-center/",standings:"/race-center/",teams:"/drivers/",profiles:"/drivers/",open:"/drivers/",freeAgents:"/drivers/",moves:"/drivers/",paints:"/paint-schemes/",history:"/history/",guide:"/competition-guide/"}[state.section]||"/"; window.open(route+"?preview=admin","_blank","noopener"); }

  function validRaceAwards() {
    var standingsErrors=window.UARLStandings.validate(state.data);if(standingsErrors.length){toast(standingsErrors[0],true);return false;}
    var issues=window.UARLResultDrivers.bonusIssues(state.data);
    if(!issues.length)return true;
    var issue=issues[0],record=state.data.records[issue.recordIndex];
    toast((record.event||record.name||'Race')+': '+issue.message,true);return false;
  }
  function openPublish() {
    if(!validRaceAwards())return;
    if(pendingImageUploads){toast("Wait for image uploads to finish before publishing.",true);return;}
    document.querySelector("[data-publish-summary]").innerHTML='<b>'+countChanges()+' changed entr'+(countChanges()===1?'y':'ies')+'</b><br>'+state.data.events.length+' events · '+state.data.records.length+' records · '+state.data.drivers.teams.length+' teams · '+state.data.paints.length+' paints';
    document.querySelector('[data-publish-summary]').innerHTML+='<div class="change-review">'+workspaceChanges().slice(0,8).map(function(change){return '<p><b>'+esc(change.title)+'</b> · '+esc(change.kind)+'<br><small>'+esc((change.fields||[]).slice(0,4).join(', '))+'</small></p>';}).join('')+'</div>';
    publishDialog.showModal();
  }
  async function publish() {
    if(!validRaceAwards())return;
    if(pendingImageUploads){toast("Wait for image uploads to finish before publishing.",true);return;}
    var note=document.querySelector("[data-publish-note]").value;var button=document.querySelector("[data-confirm-publish]");
    button.disabled=true;button.textContent="Publishing…";
    try { (state.data.records||[]).forEach(recalculateResult);var response=await fetch("/.netlify/functions/admin-publish",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({data:state.data,message:note})});var result=await response.json();if(response.status===401){publishDialog.close();showLogin(result.error);return;}if(!response.ok)throw new Error(result.error||"Publish failed."); state.original=clone(state.data);state.dirty=false;state.changes=0;localStorage.removeItem(DRAFT_KEY);localStorage.removeItem(window.UARLData.previewKey);resetHistory();setStatus("Published live","ready");publishDialog.close();render();toast(result.message||"Published successfully."); }
    catch(error){toast(error.message,true);} finally{button.disabled=false;button.textContent="Publish now";}
  }

  document.addEventListener("click",function(event){
    if(imports.click(event))return;
    if(event.target.closest('[data-open-search]')){openWorkspaceSearch();return;}
    if(event.target.closest('[data-close-workspace-dialog]')){event.target.closest('dialog').close();return;}
    if(event.target.closest('[data-workspace-undo]')){restoreHistory(false);return;}
    if(event.target.closest('[data-workspace-redo]')){restoreHistory(true);return;}
    if(event.target.closest('[data-review-changes]')){openChanges();return;}
    if(event.target.closest('[data-open-transfer]')){openTransfer();return;}
    var editDriver=event.target.closest('[data-edit-driver-profile]');if(editDriver){openDriverIdentity(editDriver.dataset.editDriverProfile);return;}
    if(event.target.closest('[data-workspace-publish]')){document.querySelector('[data-workspace-changes-dialog]').close();openPublish();return;}
    var task=event.target.closest('[data-workspace-task]');if(task){workspaceTask(task.dataset.workspaceTask);return;}
    var search=event.target.closest('[data-search-section]');if(search){document.querySelector('[data-workspace-search-dialog]').close();goToEntry(search.dataset.searchSection,search.dataset.searchIndex,Number(search.dataset.searchStep));return;}
    var resume=event.target.closest('[data-resume-section]');if(resume){if(resume.closest('dialog'))resume.closest('dialog').close();goToEntry(resume.dataset.resumeSection,resume.dataset.resumeIndex);return;}
    var nextRecord=event.target.closest('[data-record-next]');if(nextRecord){var pair=currentConfigAndItems();commitPendingEdit();state.selected=Math.max(0,Math.min(pair.items.length-1,state.selected+Number(nextRecord.dataset.recordNext)));render();return;}

    if(event.target.closest("[data-close-publish]")){publishDialog.close();return;}
    if(event.target.closest('[data-start-race]')){state.section='results';state.selected=0;state.step=0;addItem();return;}
    var move=event.target.closest('[data-move-finish]');if(move){event.preventDefault();moveFinisher(move);return;}
    if(event.target.closest('[data-add-finishers]')){addSelectedFinishers();return;}
    var clearImage=event.target.closest('[data-image-clear]');if(clearImage){var pair=currentConfigAndItems();delete imageTarget(clearImage,pair.items)[clearImage.dataset.imageKey];commitItems(pair.items);changed();render();return;}
    var structuredAdd=event.target.closest("[data-sadd]");if(structuredAdd){addStructured(structuredAdd);return;}
    var nestedAdd=event.target.closest("[data-snadd]");if(nestedAdd){addNestedStructured(nestedAdd);return;}
    var structuredRemove=event.target.closest("[data-sremove]");if(structuredRemove){removeStructured(structuredRemove);return;}
    if(event.target.closest("[data-account-refresh]")){loadAccounts();return;}
    var accountSave=event.target.closest("[data-account-save]");if(accountSave){saveAccount(accountSave.closest("[data-account-id]"));return;}
    var step=event.target.closest("[data-step]");if(step){state.step=Number(step.dataset.step);render();var heading=view.querySelector('.step-heading');if(heading){heading.focus();heading.scrollIntoView({block:'nearest'});}return;}
    var more=event.target.closest('[data-admin-more]');if(more){document.querySelector('[data-admin-menu]').showModal();return;}
    if(event.target.closest('[data-close-admin-menu]')){document.querySelector('[data-admin-menu]').close();return;}
    var section=event.target.closest("[data-section]");if(section){state.section=section.dataset.section;state.step=0;document.querySelector("[data-admin-menu]").close();state.selected=0;state.query="";render();return;}
    var select=event.target.closest("[data-select]");if(select){state.selected=Number(select.dataset.select);render();return;}
    var action=event.target.closest("[data-action]");if(action){var a=action.dataset.action;if(a==="add")addItem();else if(a==="delete")deleteItem();else if(a==="duplicate")duplicateItem();else if(a==="reload")reloadPublished();else if(a==="export")exportData();else if(a==="preview")preview();else if(a==="publish")openPublish();else if(a==="logout")logout();else if(a==="apply-json"){try{state.data=window.UARLData.normalize(JSON.parse(document.querySelector("[data-advanced-json]").value));changed();render();toast("Advanced JSON applied to the draft.");}catch(error){toast("Invalid JSON: "+error.message,true);}}return;}
    var shift=event.target.closest("[data-shift]");if(shift){shiftEvent(shift.dataset.shift);}
  });
  document.addEventListener("input",function(event){
    if(imports.input(event))return;
    if(event.target.matches('[data-profile-account]')){event.target.setCustomValidity('');return;}
    if(event.target.matches('[data-assigned-driver-account]')){event.target.value=driverAccountCaption(event.target.dataset.assignedDriverAccount);return;}
    if(event.target.matches('[data-workspace-search]')){renderWorkspaceSearch(event.target.value);return;}
    if(event.target.matches('[data-transfer-number]')){updateTransferPreview();return;}
    if(event.target.matches('[data-finish-search]')){var query=event.target.value.trim().toLowerCase();view.querySelectorAll('[data-participant]').forEach(function(label){label.hidden=!label.textContent.toLowerCase().includes(query);});return;}
    if(event.target.matches("[data-list-search]")){state.query=event.target.value;renderCollection(state.section);var input=document.querySelector("[data-list-search]");input.focus();input.setSelectionRange(input.value.length,input.value.length);return;}
    if(event.target.matches("[data-sfield]")){updateStructured(event.target);return;}
    if(!event.target.matches("[data-field]"))return;var pair=currentConfigAndItems(),item=pair.items[state.selected],field=event.target.dataset.field,type=event.target.dataset.type,value;
    if(type==="bool")value=event.target.checked;else if(type==="divisions")value=Array.from(view.querySelectorAll('[data-field="'+field+'"][data-type="divisions"]:checked')).map(function(input){return input.dataset.divisionValue;});else if(type==="number")value=event.target.value===""?null:Number(event.target.value);else if(type==="datetime")value=fromLocal(event.target.value);else if(type==="json"){try{value=JSON.parse(event.target.value);event.target.style.borderColor="";}catch(error){event.target.style.borderColor="var(--red)";return;}}else value=event.target.value;
    if(state.section==="results"&&(field==="winner"||field==="pole")){if(field==="winner")item.winnerAutomatic=false;var selected=event.target.options&&event.target.options[event.target.selectedIndex];item[field+"Username"]=selected&&selected.dataset.user||"";value=selected&&selected.dataset.name||value;}
    item[field]=value;commitItems(pair.items);if(state.section==="results"){recalculateResult(item);syncResultPoints(item);}changed();if(state.section==="results"&&field==="division")render();
  });
  document.addEventListener("change",function(event){if(event.target.matches('[data-paint-driver]')){commitPendingEdit();prefillPaint(event.target);return;}if(event.target.matches('[data-transfer-team],[data-transfer-person]')){updateTransferSeats();return;}if(event.target.matches('[data-transfer-seat]')){var dialog=document.querySelector('[data-transfer-dialog]'),team=state.data.drivers.teams.find(function(team){return team.id===dialog.querySelector('[data-transfer-team]').value;});if(team&&event.target.value!=='new')dialog.querySelector('[data-transfer-number]').value=team.entries[Number(event.target.value)].number;else{var person=window.UARLWorkspace.people(state.data).find(function(person){return person.key===dialog.querySelector('[data-transfer-person]').value;});dialog.querySelector('[data-transfer-number]').value=person&&!team.entries.some(function(entry){return String(entry.number)===person.number;})?person.number:'';}updateTransferPreview();return;}if(event.target.matches("[data-image-upload]")){uploadDriverImage(event.target);return;}if(event.target.matches('[data-schedule-race]')){var record=structuredItem(),id=event.target.value;if(!id){delete record.scheduleEventId;record.id='result-'+Date.now();changed();return;}var scheduled=state.data.events.find(function(e){return e.id===id;});if(!scheduled)return;if(['entries','qualifying','stages','finishes','bonuses'].some(function(key){return (record[key]||[]).length;})&&!confirm('Change the linked race and clear its classifications? This prevents carrying results into another race.')){render();return;}['entries','qualifying','stages','finishes','bonuses'].forEach(function(key){record[key]=[];});['winner','winnerUsername','pole','poleUsername'].forEach(function(key){delete record[key];});applyScheduledRace(record,scheduled);changed();render();return;}if(event.target.matches("[data-mobile-section]")){state.section=event.target.value;state.step=0;state.selected=0;state.query="";render();}if(event.target.matches("[data-import]")){var file=event.target.files[0];if(!file)return;file.text().then(function(text){state.data=window.UARLData.normalize(JSON.parse(text));changed();render();toast("Backup imported into the draft.");}).catch(function(error){toast("Could not import: "+error.message,true);});}});
  document.addEventListener('change',function(event){if(event.target.matches('[data-profile-account]'))commitProfileAccount(event.target);});
  document.addEventListener('toggle',function(event){if(event.target.matches('[data-artwork-key]'))artworkOpen[event.target.dataset.artworkKey]=event.target.open;},true);
  document.addEventListener('focusin',function(event){if(state.data&&event.target.matches('[data-field],[data-sfield],[data-advanced-json]')){commitPendingEdit();editSession={node:event.target};}});
  document.addEventListener('focusout',function(event){if(event.target.matches('[data-profile-account]'))commitProfileAccount(event.target);if(editSession&&event.target===editSession.node)commitPendingEdit();});
  document.addEventListener('keydown',function(event){if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&state.user){if(!document.querySelector('dialog[open]')||document.querySelector('[data-workspace-search-dialog]').open){event.preventDefault();if(!document.querySelector('[data-workspace-search-dialog]').open)openWorkspaceSearch();}}});
  document.querySelector('[data-transfer-form]').addEventListener('submit',saveTransfer);
  document.addEventListener("submit",function(event){var form=event.target.closest("[data-account-create-form]");if(form){event.preventDefault();createAccount(form);}});
  document.querySelector("[data-publish-form]").addEventListener("submit",function(event){event.preventDefault();publish();});

  async function initAdmin() {
    configureSections();
    try { var live=await window.UARLData.load();
      if(!live.conduct.length){try{var html=await fetch('/competition-guide/',{cache:'no-store'}).then(function(response){return response.text();});var doc=new DOMParser().parseFromString(html,'text/html');live.conduct=[];doc.querySelectorAll('.urg-accordion[data-urg-group]').forEach(function(group){group.querySelectorAll('.urg-rule').forEach(function(rule){var id=(rule.querySelector('.urg-rule-id')||{}).textContent||'';var copy=(rule.querySelector('.urg-rule-copy')||{}).textContent||'';var penalty=rule.querySelector('.urg-rule-penalty');if(id&&copy)live.conduct.push({id:id.trim(),group:group.getAttribute('data-urg-group')||'procedures',text:copy.trim(),penalty:penalty?penalty.textContent.trim():'',severe:Boolean(penalty&&penalty.classList.contains('is-severe'))});});});}catch(error){}}
      state.data=live;(live.records||[]).forEach(recalculateResult);state.original=clone(live);var draft=localStorage.getItem(DRAFT_KEY);if(draft){try{state.data=window.UARLData.normalize(JSON.parse(draft));(state.data.records||[]).forEach(recalculateResult);state.dirty=countChanges()>0;}catch(error){state.data=live;}}else state.data=live;resetHistory();if(state.dirty)setStatus("Recovered unpublished browser draft","dirty");else setStatus("Published data loaded","ready");render(); }
    catch(error){setStatus("Could not load website data","error");view.innerHTML='<div class="warning">'+esc(error.message)+'</div>';}
  }
  document.querySelector("[data-login-form]").addEventListener("submit",login);
  checkSession();
})();
