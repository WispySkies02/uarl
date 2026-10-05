
const $=(s,p=document)=>p.querySelector(s),$$=(s,p=document)=>[...p.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let D; async function load(){if(!D)D=await fetch("/data/uarl.json").then(r=>r.json());return D}
const col=d=>d==="d1"?"#ed3027":d==="d2"?"#2998ff":"#c6ef37";
function fmt(iso){return new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(iso))+" ET"}
function cd(iso){let n=new Date(iso)-Date.now();if(n<=0)return null;return {d:Math.floor(n/864e5),h:Math.floor(n/36e5)%24,m:Math.floor(n/6e4)%60,s:Math.floor(n/1e3)%60}}
function cdFull(iso){let x=cd(iso);if(!x)return `<span class="eyebrow">Event window reached</span>`;return [["d","Days"],["h","Hours"],["m","Minutes"],["s","Seconds"]].map(([k,l])=>`<span class="clock"><b>${String(x[k]).padStart(k==="d"?1:2,"0")}</b><small>${l}</small></span>`).join("")}
function tick(){ $$("[data-clock]").forEach(e=>{let x=cd(e.dataset.clock);e.textContent=x?`${x.d}D ${String(x.h).padStart(2,"0")}H ${String(x.m).padStart(2,"0")}M`:"EVENT WINDOW"});$$("[data-fullclock]").forEach(e=>e.innerHTML=cdFull(e.dataset.fullclock))}
function clocks(){tick();setInterval(tick,1000)}
function record(id){return D.records.find(r=>r.id===id)}

async function home(){
 await load();let now=Date.now(),up=D.events.filter(e=>new Date(e.start)>now&&e.division!=="d2").sort((a,b)=>new Date(a.start)-new Date(b.start)),n=up[0];
 if(n){
 $("#nextSeries").textContent=n.series;$("#nextName").textContent=n.name;
 $("#nextTrack").textContent=`${n.track} · ${fmt(n.start)}${n.laps?" · "+n.laps+" laps":""}`;
 $("#nextClock").dataset.fullclock=n.start;
 if($("#stripName")){
   $("#stripName").textContent=n.name;
   $("#stripMeta").textContent=`${n.series} · ${n.track} · ${fmt(n.start)}`;
   $("#stripClock").dataset.fullclock=n.start;
 }
}
 $("#queue").innerHTML=up.slice(1,5).map((e,i)=>`<div class="queueitem"><b>${String(i+2).padStart(2,"0")}</b><div><strong>${esc(e.name)}</strong><small>${esc(e.series)} · ${esc(e.track)}</small></div><small data-clock="${e.start}"></small></div>`).join("");clocks()
}
async function schedule(){
 await load();let div="all";const root=$("#schedule");
 function draw(){let arr=D.events.filter(e=>div==="all"||e.division===div),groups={};arr.forEach(e=>{let d=new Date(e.start),k=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",month:"long",year:"numeric"}).format(d);(groups[k]??=[]).push(e)});root.innerHTML=Object.entries(groups).map(([m,es])=>`<section class="month"><h2 class="monthtitle">${m}</h2>${es.map(e=>{let r=record(e.id);return `<article class="race" style="--accent:${col(e.division)}"><div class="rdate"><b>${new Date(e.start).toLocaleDateString("en-US",{timeZone:"America/New_York",day:"2-digit"})}</b><small>${e.division.toUpperCase()}</small></div><div><h3>${esc(e.name)}</h3><div class="rmeta">${esc(e.series)} · ${esc(e.track)}${e.laps?" · "+e.laps+" laps":""}</div></div><div class="rright"><strong>${fmt(e.start)}</strong><small>${e.pointsEvent?"Points Event":"Exhibition"}${e.crownJewel?" · Crown Jewel":""}${e.chase?" · The Chase":""}</small>${!e.completed?`<div class="raceclock" data-clock="${e.start}"></div>`:""}</div>${r?`<div class="dock"><div class="eyebrow">Official Record</div><div class="finishstrip">${(r.finishes||[]).map(f=>`<span class="fin"><b>P${f.position}</b>${esc(f.number?"#"+f.number+" ":"")}${esc(f.name)}</span>`).join("")}</div>${r.pointsNote?`<p>${esc(r.pointsNote)}</p>`:""}</div>`:""}</article>`}).join("")}</section>`).join("");$$(".race",root).forEach(e=>e.onclick=()=>e.classList.toggle("open"));clocks()}
 $$(".toolbar button").forEach(b=>b.onclick=()=>{$$(".toolbar button").forEach(x=>x.classList.remove("on"));b.classList.add("on");div=b.dataset.div;draw()});draw()
}
function standings(div){
 let ds=D.race.drivers.filter(x=>x.division===div).map(x=>({...x,points:0,starts:0,wins:0,top5:0}));let rs=D.records.filter(r=>r.division===div&&r.pointsEvent);
 rs.forEach(r=>(r.finishes||[]).forEach(f=>{let x=ds.find(d=>d.name.toLowerCase()===String(f.name).toLowerCase());if(!x)return;x.starts++;x.wins+=f.position===1;x.top5+=f.position<=5;if(div==="d2"&&f.name==="Taylor")x.points=55}));
 return ds.sort((a,b)=>b.points-a.points||b.wins-a.wins||b.careerWins-a.careerWins)
}
async function raceCenter(){
 await load();let div="d1",view="info";const main=$("#rcview");
 function title(){return div==="d1"?"L.L. Bean Cup Series":div==="d2"?"NFFF Grand National Archive":"Bangor Savings Bank Open Series"}
 function draw(){
  let rows=standings(div),rs=D.records.filter(r=>r.division===div),last=rs[rs.length-1];
  $("#rctitle").textContent=title();
  if(view==="info"){let ev=D.events.filter(e=>e.division===div).sort((a,b)=>new Date(a.start)-new Date(b.start)),next=ev.find(e=>new Date(e.start)>Date.now());main.innerHTML=`<h2>Race Information</h2><div class="databand"><div class="datum"><b>${ev.length}</b><span>Schedule Events</span></div><div class="datum"><b>${rows.length}</b><span>Rostered Drivers</span></div><div class="datum"><b>${rs.length}</b><span>Official Records</span></div><div class="datum"><b>${div==="d2"?"ARCHIVE":"ACTIVE"}</b><span>Series Status</span></div></div>${next?`<div class="note"><b>Next event:</b> ${esc(next.name)} · ${esc(next.track)} · ${fmt(next.start)}</div>`:""}${div==="d2"?`<div class="note">D2 was discontinued after Round 1. The completed Daytona record remains official and preserved here.</div>`:""}`}
  else if(view==="entry"){main.innerHTML=`<h2>Entry List</h2><div class="scoring">${rows.map((r,i)=>`<div class="score"><span class="pos">${String(i+1).padStart(2,"0")}</span><span class="num">#${esc(r.number)}</span><strong>${esc(r.name)}</strong><span class="pts">${esc(r.team||"")}</span></div>`).join("")}</div>`}
  else if(view==="results"){main.innerHTML=`<h2>Official Results</h2>${rs.length?rs.map(r=>`<div class="note"><b>${esc(r.event)}</b>${(r.finishes||[]).map(f=>`<div class="score"><span class="pos">P${f.position}</span><span class="num">${esc(f.number?"#"+f.number:"")}</span><strong>${esc(f.name)}</strong><span></span></div>`).join("")}</div>`).join(""):`<p>No official race result has been recorded yet.</p>`}`}
  else if(view==="points"){main.innerHTML=`<h2>Championship Points</h2><div class="scoring">${rows.map((r,i)=>`<div class="score"><span class="pos">${String(i+1).padStart(2,"0")}</span><span class="num">#${esc(r.number)}</span><strong>${esc(r.name)}</strong><span class="pts">${r.points||0} PTS</span></div>`).join("")}</div>${div==="d2"?`<div class="note">Taylor is the only rostered full-time D2 championship scorer from Daytona: 55 points. PT/substitute drivers do not inherit charter points.</div>`:""}`}
  else if(view==="stats"){let sorted=[...rows].sort((a,b)=>b.careerWins-a.careerWins);main.innerHTML=`<h2>Season & Career Stats</h2><div class="scoring">${sorted.map((r,i)=>`<div class="score"><span class="pos">${String(i+1).padStart(2,"0")}</span><span class="num">#${esc(r.number)}</span><strong>${esc(r.name)}</strong><span class="pts">${r.careerWins||0} WINS</span></div>`).join("")}</div>`}
  else if(view==="penalties")main.innerHTML=`<h2>Penalties</h2><div class="note">Official penalty information is preserved as part of Race Center. No additional penalty record is present in the current source dataset.</div>`;
  else main.innerHTML=`<h2>Replay</h2><div class="note">Replay and broadcast links appear here when they are attached to an official event record.</div>`;
 }
 $$(".rcnav button").forEach(b=>b.onclick=()=>{$$(".rcnav button").forEach(x=>x.classList.remove("on"));b.classList.add("on");view=b.dataset.view;draw()});$$(".seriespick button").forEach(b=>b.onclick=()=>{$$(".seriespick button").forEach(x=>x.classList.remove("on"));b.classList.add("on");div=b.dataset.div;draw()});draw()
}
async function paddock(){
 await load();let root=$("#teams"),q="";
 const teams=D.drivers.teams;
 const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
 function profile(e){return D.drivers.profiles?.[e.user]||{}}
 function isOpen(e){return String(e.status||"").toLowerCase().includes("open") || String(e.name||"").toUpperCase()==="OPEN"}
 function jump(id){let el=document.getElementById(id);if(el)el.scrollIntoView({behavior:"smooth",block:"start"})}

 // Team directory: desktop buttons + mobile selector.
 let jumpRoot=$("#teamJump"),select=$("#teamSelect");
 teams.forEach(t=>{
   let b=document.createElement("button");b.className="team-jump";b.textContent=t.name.replace(" Motorsports","").replace(" Racing","");
   b.onclick=()=>jump("team-"+slug(t.id||t.name));jumpRoot.insertBefore(b,select);
   let o=document.createElement("option");o.value="team-"+slug(t.id||t.name);o.textContent=t.name;select.appendChild(o);
 });
 select.onchange=()=>{if(select.value)jump(select.value)};
 $$(".paddock-jump [data-target]").forEach(b=>b.onclick=()=>jump(b.dataset.target));

 // Explicit market view of vacant FULL-TIME seats only.
 let opens=[];
 teams.forEach(t=>(t.entries||[]).forEach(e=>{
   if(isOpen(e) && !String(e.seatType||"").toLowerCase().includes("part") && !String(e.seatType||"").toLowerCase().includes("development"))
     opens.push({team:t,entry:e});
 }));
 $("#openCharters").innerHTML=opens.length?opens.map(x=>`<article class="open-charter">
   <div class="open-num">#${esc(x.entry.number)}</div>
   <div><h3>${esc(x.team.name)}</h3><p>Full-time charter currently listed as open on the UARL roster.</p></div>
   <div class="make">${esc(x.team.make||"")}</div><span class="open-badge">Available</span>
 </article>`).join(""):`<div class="market-empty">No full-time charters are currently marked open.</div>`;

 function draw(){
  root.innerHTML=teams.filter(t=>!q||JSON.stringify(t).toLowerCase().includes(q)).map(t=>{
   let ae=t.id==="aetherwing",entries=t.entries.filter(e=>!(ae&&["62","82"].includes(e.number))),shared=ae?t.entries.filter(e=>["62","82"].includes(e.number)):[],
   logo=ae?`<img src="/assets/aetherwing/logo.webp" alt="">`:`<div class="wordcrest">${esc(t.name.replace(" Motorsports","").replace(" Racing",""))}</div>`;
   let openCount=entries.filter(isOpen).length;
   return `<section id="team-${slug(t.id||t.name)}" class="teamstage" style="--team:${t.brandColor||"#2998ff"}"><div class="wrap">
    <div class="teamhead"><div class="crest">${logo}</div><div class="teamcopy"><div class="owner">${esc(t.make)} · Owner ${esc(t.owner)}</div><h2>${esc(t.name)}</h2>
    <div class="teamnavtag"><span>${entries.length} listed entries</span>${openCount?`<span style="color:var(--yellow)">${openCount} open full-time ${openCount===1?"charter":"charters"}</span>`:"<span>Roster filled</span>"}</div><p>${esc(t.note||"")}</p></div></div>
    <div class="roster">${entries.map(e=>{let p=profile(e),open=isOpen(e),art=ae&&["28","32","52","54","92"].includes(e.number)?`<img src="/assets/aetherwing/numbers/${e.number}.png">`:`<span class="rawnum">#${esc(e.number)}</span>`;
      return `<div class="driver ${open?"open-seat":""}"><div class="numstage">${art}</div><strong>${esc(e.name||p.alias||e.user||"OPEN")}</strong><small>${esc(e.user||"")}</small><small class="state">${open?"Available Full-Time Charter":esc(e.status)}</small>${p.wins!=null?`<small>${p.wins} career wins · ${p.championships||0} titles</small>`:""}</div>`}).join("")}</div>
    ${shared.length?`<div class="shared"><span class="eyebrow">6th Charter · One shared slot</span>${shared.map((e,i)=>`<div class="driver"><div class="numstage"><img src="/assets/aetherwing/numbers/${e.number}.png"></div><strong>${esc(e.name)}</strong><small>${esc(e.seatType)}</small></div>${i===0?'<span class="or">OR</span>':""}`).join("")}</div>`:""}
   </div></section>`}).join("")
 }
 $("#teamSearch").oninput=e=>{q=e.target.value.toLowerCase();draw()};draw();
 $("#freeagents").innerHTML=(D.drivers.freeAgents||[]).map((f,i)=>`<div class="finishrow"><b>${String(i+1).padStart(2,"0")}</b><span>${esc(f.alias||f.name||f.user||f.id)} ${f.user?`· ${esc(f.user)}`:""}</span></div>`).join("")
}
async function paint(){
 await load();let list=D.paints,active=list[0];function show(){if(!active)return;$("#car").src=active.image;$("#pnum").textContent="#"+active.number;$("#ptitle").textContent=active.title;$("#psub").textContent=`${active.name} · ${active.team} · ${active.make} · ${active.body}`;$("#copy").textContent="Copy Scheme ID · "+active.id;$("#copy").onclick=()=>navigator.clipboard.writeText(active.id)}
 function draw(){ $("#schemes").innerHTML=list.map((p,i)=>`<div class="scheme ${p.id===active.id?"on":""}" data-i="${i}"><strong>#${esc(p.number)} ${esc(p.title)}</strong><small>${esc(p.name)} · ${esc(p.team)}</small></div>`).join("");$$(".scheme").forEach(x=>x.onclick=()=>{active=list[+x.dataset.i];draw();show()})}
 $("#paintSearch").oninput=e=>{let q=e.target.value.toLowerCase();list=D.paints.filter(p=>p.search.includes(q));active=list[0]||D.paints[0];draw();show()};draw();show()
}
async function hist(){
 await load();let v="league";function get(){if(v==="league")return {name:"League-Wide",wins:D.history.league.winners,seasons:D.history.divisions.flatMap(d=>d.seasons.map(s=>({season:`${d.division} S${s.number}`,champion:s.champion})))};let d=D.history.divisions.find(x=>x.id===v);return {name:d.name,wins:d.winners,seasons:d.seasons.map(s=>({season:`Season ${s.number}`,champion:s.champion}))}}
 function draw(){let d=get(),mx=Math.max(...d.wins.map(x=>x[1]));$("#histname").textContent=d.name;$("#champs").innerHTML=d.seasons.map(s=>`<div class="champ"><small>${esc(s.season)}</small><strong>${esc(s.champion)}</strong></div>`).join("");$("#wins").innerHTML=d.wins.map((x,i)=>`<div class="winrow"><span class="rank">${String(i+1).padStart(2,"0")}</span><strong>${esc(x[0])}</strong><div class="meter"><i style="width:${x[1]/mx*100}%"></i></div><b>${x[1]}</b></div>`).join("");$$(".histnav button").forEach(b=>b.classList.toggle("on",b.dataset.v===v))}
 $$(".histnav button").forEach(b=>b.onclick=()=>{v=b.dataset.v;draw()});draw()
}
