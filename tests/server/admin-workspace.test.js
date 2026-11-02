import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../../assets/admin-workspace.js';
const {people,search,changes,transfer}=globalThis.UARLWorkspace;
function league(){return {
 events:[{id:'race1',name:'Daytona race',division:'d1',date:'2026-11-08',track:'Daytona'},{id:'race2',name:'Talladega',division:'open',date:'2026-11-10'}],
 records:[{id:'result1',event:'Daytona official',division:'d1',date:'2026-11-01',finishes:[]}],
 drivers:{teams:[{id:'alpha',name:'Alpha Racing',make:'Toyota',logo:'/alpha.png',brandColor:'#ff0000',entries:[{user:'MaxUser',name:'Roster Max',number:'19',status:'Full-Time',numberImage:'/19.png',signatureImage:'/max.png',seatType:'Full-Time',charterType:'FT'},{name:'OPEN',number:'20',status:'Open FT',seatType:'Full-Time',charterType:'FT'}],pendingDrivers:[{user:'PendingUser',name:'Pending Driver',numberPending:true,status:'Signed'}]},{id:'beta',name:'Beta Motors',make:'Ford',logo:'/beta.png',entries:[{user:'OtherUser',name:'Jordan',number:'21',status:'Full-Time'},{name:'OPEN',number:'05',status:'Open FT',seatType:'Full-Time',charterType:'FT',customCharterFlag:true}]}],profiles:{MaxUser:{alias:'Profile Max',wins:9},OtherUser:{alias:'Jordan'},OpenUser:{alias:'Open Alias'},FreeUser:{alias:'Free Agent'},ProfileOnly:{alias:'Profile Person'}},openEntries:[{user:'OpenUser',number:'18',make:'Chevrolet'},{user:'MaxUser',number:'29',make:'Toyota'}],freeAgents:[{user:'FreeUser',name:'Free Driver',former:'Old Team'},{user:'MaxUser',name:'Old Max'}],recentMoves:[{driver:'Someone',team:'Alpha Racing',number:'40',signedAt:'2026-10-01'}]},
 paints:[{id:'paint1',name:'Roster Max',number:'19',title:'Primary Scheme',team:'Alpha Racing'}],history:{divisions:[{id:'cup',name:'Cup Series',division:'D1',seasons:[]}],league:{winners:[]}},guide:[{tag:'h2',text:'Championship eligibility'},{tag:'p',text:'Drivers must race.'}],conduct:[{id:'R1',text:'Race fairly',group:'race'}],race:{drivers:[{id:'old',name:'Derived Driver'}],schedule:[{id:'race1'}],series:{d1:{name:'Cup'}}}
};}
const snapshot=data=>JSON.stringify(data);
const person=(data,source,user)=>people(data).find(row=>row.source===source&&row.user===user);

test('people prefers roster presentation while preserving separate participation and same-name users',()=>{
 const data=league();data.drivers.teams[1].entries.push({user:'SecondJordan',name:'Jordan',number:'22',status:'Full-Time'});data.drivers.profiles.SecondJordan={alias:'Jordan'};
 const before=snapshot(data),rows=people(data);
 assert.equal(rows.find(row=>row.user==='MaxUser'&&row.source==='team').name,'Roster Max');
 assert.equal(rows.filter(row=>row.user==='MaxUser').length,2); // D1 and Open are distinct selections.
 assert.equal(rows.filter(row=>row.user==='MaxUser'&&['profile','freeAgent'].includes(row.source)).length,0);
 assert.equal(rows.filter(row=>row.name==='Jordan').length,2);
 assert.ok(rows.some(row=>row.source==='pending'&&row.user==='PendingUser'));
 assert.ok(rows.some(row=>row.source==='profile'&&row.user==='ProfileOnly'));
 assert.equal(rows.some(row=>row.name==='OPEN'),false);
 assert.equal(new Set(rows.map(row=>row.key)).size,rows.length);assert.equal(snapshot(data),before);
});
test('keys stay unique even for duplicate team IDs and whitespace/case usernames resolve profiles',()=>{
 const data=league();data.drivers.teams[1].id='alpha';data.drivers.teams[1].entries.push({user:' maxuser ',number:'19',status:'Full-Time'});
 const rows=people(data);assert.equal(new Set(rows.map(row=>row.key)).size,rows.length);
 assert.equal(rows.find(row=>row.user==='maxuser').name,'Profile Max');
});
test('search ranks records, finds roster drivers/team context and preserves role restrictions',()=>{
 const data=league(),before=snapshot(data);
 const max=search(data,'roster max','owner');assert.equal(max[0].section,'teams');assert.equal(max[0].step,2);
 assert.ok(search(data,'Open Alias','admin').some(row=>row.section==='open'));
 assert.ok(search(data,'daytona','race_control').some(row=>row.section==='schedule'));
 assert.ok(search(data,'daytona','race_control').some(row=>row.section==='results'));
 for(const query of ['roster max','alpha','profile max','primary scheme','race fairly'])assert.deepEqual(search(data,query,'race_control'),[]);
 assert.deepEqual(search(data,'daytona','unknown'),[]);assert.deepEqual(search(data,' ','owner'),[]);assert.equal(snapshot(data),before);
});
test('search returns at most thirty results with stable collection indices',()=>{
 const data=league();data.events=Array.from({length:50},(_,index)=>({id:'e'+index,name:'Event '+index}));const found=search(data,'event','admin');assert.equal(found.length,30);assert.ok(found.every(row=>data.events[row.index].name===row.title));
});
test('changes groups edits per entry and uses readable field names without mutating snapshots',()=>{
 const before=league(),after=structuredClone(before);after.drivers.teams[0].entries[0].name='Updated';after.drivers.teams[0].entries[0].number='019';after.drivers.teams[0].owner='Owner';
 const first=snapshot(before),second=snapshot(after),list=changes(before,after);
 assert.equal(list.length,1);assert.equal(list[0].section,'teams');assert.equal(list[0].kind,'updated');assert.deepEqual(list[0].fields,['Roster entries','Owner']);assert.equal(snapshot(before),first);assert.equal(snapshot(after),second);
});
test('changes matches IDs and usernames, detects adds/removals and does not conflate same-name profiles',()=>{
 const before=league(),after=structuredClone(before);after.events.splice(0,1);after.events.push({id:'race3',name:'New race'});after.drivers.profiles.OtherUser.alias='Updated Jordan';after.drivers.profiles.AnotherJordan={alias:'Jordan'};
 const list=changes(before,after);
 assert.ok(list.some(row=>row.section==='schedule'&&row.kind==='removed'&&row.title==='Daytona race'));
 assert.ok(list.some(row=>row.section==='schedule'&&row.kind==='added'&&row.title==='New race'));
 assert.ok(list.some(row=>row.section==='profiles'&&row.kind==='updated'&&row.title==='Updated Jordan'));
 assert.ok(list.some(row=>row.section==='profiles'&&row.kind==='added'&&row.title==='Jordan'));
});
test('deleting an unkeyed guide entry does not mark the following text as edited',()=>{
 const before=league(),after=structuredClone(before);after.guide.splice(0,1);const list=changes(before,after).filter(row=>row.section==='guide');assert.equal(list.length,1);assert.equal(list[0].kind,'removed');assert.equal(list[0].title,'Championship eligibility');
});
test('generated race drivers/schedules are ignored but league-level edits remain visible',()=>{
 const before=league(),after=structuredClone(before);after.race.drivers.push({name:'Different'});after.race.schedule=[];assert.deepEqual(changes(before,after),[]);after.history.league.winners.push(['Winner',1]);assert.equal(changes(before,after).at(-1).section,'advanced');
});
test('transfer preserves destination charter/team metadata, opens the old seat and announces once',()=>{
 const data=league(),previousRecords=snapshot(data.records),profiles=snapshot(data.drivers.profiles),history=snapshot(data.history),source=person(data,'team','MaxUser');
 const result=transfer(data,{personKey:source.key,teamId:'beta',number:'05',seatIndex:1,announce:true,date:'2026-11-02'});
 assert.deepEqual(result,{teamIndex:1,entryIndex:1,name:'Roster Max'});
 const old=data.drivers.teams[0].entries[0],entry=data.drivers.teams[1].entries[1];
 assert.equal(old.number,'19');assert.equal(old.name,'OPEN');assert.equal(old.status,'Open FT');assert.equal(old.user,undefined);assert.equal(old.numberImage,undefined);assert.equal(old.signatureImage,undefined);assert.equal(old.charterType,'FT');
 assert.equal(entry.user,'MaxUser');assert.equal(entry.name,'Roster Max');assert.equal(entry.number,'05');assert.equal(entry.charterType,'FT');assert.equal(entry.customCharterFlag,true);assert.equal(entry.numberImage,'/19.png');assert.equal(entry.signatureImage,'/max.png');assert.equal(data.drivers.teams[1].logo,'/beta.png');
 assert.equal(data.drivers.recentMoves[0].team,'Beta Motors');assert.equal(data.drivers.recentMoves[0].number,'05');assert.equal(data.drivers.freeAgents.some(row=>row.user==='MaxUser'),false);
 assert.equal(snapshot(data.records),previousRecords);assert.equal(snapshot(data.drivers.profiles),profiles);assert.equal(snapshot(data.history),history);
});
test('a free-agent signing appends an entry, removes free agency and can omit an announcement',()=>{
 const data=league(),source=person(data,'freeAgent','FreeUser'),count=data.drivers.recentMoves.length;
 transfer(data,{personKey:source.key,teamId:'beta',number:'80',seatIndex:null,announce:false,date:'2026-11-02'});
 assert.equal(data.drivers.teams[1].entries.at(-1).user,'FreeUser');assert.equal(data.drivers.freeAgents.length,1);assert.equal(data.drivers.recentMoves.length,count);
});
test('pending drivers are removed from pending after assignment while Open participation remains',()=>{
 const pending=league();transfer(pending,{personKey:person(pending,'pending','PendingUser').key,teamId:'beta',number:'05',seatIndex:1,date:'2026-11-02'});assert.equal(pending.drivers.teams[0].pendingDrivers.length,0);assert.equal(pending.drivers.teams[1].entries[1].user,'PendingUser');
 const open=league(),entry=structuredClone(open.drivers.openEntries[0]);transfer(open,{personKey:person(open,'open','OpenUser').key,teamId:'beta',number:'05',seatIndex:1,date:'2026-11-02'});assert.deepEqual(open.drivers.openEntries[0],entry);
});
test('an existing driver can correct their own seat number without vacating the seat',()=>{
 const data=league();transfer(data,{personKey:person(data,'team','MaxUser').key,teamId:'alpha',number:'019',seatIndex:0,date:'2026-11-02'});assert.equal(data.drivers.teams[0].entries[0].user,'MaxUser');assert.equal(data.drivers.teams[0].entries[0].number,'019');
});
test('invalid transfers are atomic: occupied/duplicate/missing targets, usernames and dates',()=>{
 const cases=[{teamId:'beta',number:'21',seatIndex:0},{teamId:'beta',number:'21',seatIndex:null},{teamId:'missing',number:'2',seatIndex:null},{teamId:'beta',number:'x',seatIndex:null},{teamId:'beta',number:'2',seatIndex:99},{teamId:'beta',number:'2',seatIndex:null,date:'2026-02-30'}];
 for(const options of cases){const data=league(),before=snapshot(data);assert.throws(()=>transfer(data,{personKey:person(data,'team','MaxUser').key,date:'2026-11-02',...options}));assert.equal(snapshot(data),before);}
 const data=league();data.drivers.teams[0].entries.push({name:'No Username',number:'90',status:'Signed'});const before=snapshot(data),entry=people(data).find(row=>row.name==='No Username');assert.throws(()=>transfer(data,{personKey:entry.key,teamId:'beta',number:'3'}),/username/);assert.equal(snapshot(data),before);
});
test('a selection from Open cannot silently duplicate an existing D1 seat',()=>{
 const data=league(),before=snapshot(data);assert.throws(()=>transfer(data,{personKey:person(data,'open','MaxUser').key,teamId:'beta',number:'05',seatIndex:1}),/another D1 seat/);assert.equal(snapshot(data),before);
});


test('reordering guide entries is a visible order change',()=>{
 const before=league(),after=structuredClone(before);after.guide.reverse();const list=changes(before,after).filter(row=>row.section==='guide');assert.equal(list.length,2);assert.ok(list.every(row=>row.fields.includes('Order')));
});
test('a signing cannot inherit stale artwork from an empty destination charter',()=>{
 const data=league();data.drivers.teams[1].entries[1].numberImage='/old-car.png';data.drivers.teams[1].entries[1].signatureImage='/old-driver.png';
 transfer(data,{personKey:person(data,'freeAgent','FreeUser').key,teamId:'beta',number:'05',seatIndex:1,date:'2026-11-02'});
 assert.equal(data.drivers.teams[1].entries[1].numberImage,undefined);assert.equal(data.drivers.teams[1].entries[1].signatureImage,undefined);
});


test('vacating a part-time charter does not relabel it as a full-time seat',()=>{
 const data=league();data.drivers.teams[0].entries[0].seatType='Part-Time';data.drivers.teams[0].entries[0].charterType='PT';
 transfer(data,{personKey:person(data,'team','MaxUser').key,teamId:'beta',number:'05',seatIndex:1,date:'2026-11-02'});
 assert.equal(data.drivers.teams[0].entries[0].status,'Open PT');assert.equal(data.drivers.teams[0].entries[0].charterType,'PT');
});
test('a name-only free-agent alias does not duplicate an already represented roster identity',()=>{
 const data=league();data.drivers.freeAgents.push({name:'Profile Max'});assert.equal(people(data).filter(row=>row.user==='MaxUser'&&row.source==='freeAgent').length,0);
});


test('a source seat marked part-time only by status remains an open part-time seat',()=>{
 const data=league();delete data.drivers.teams[0].entries[0].seatType;delete data.drivers.teams[0].entries[0].charterType;data.drivers.teams[0].entries[0].status='Part-Time';
 transfer(data,{personKey:person(data,'team','MaxUser').key,teamId:'beta',number:'05',seatIndex:1,date:'2026-11-02'});
 assert.equal(data.drivers.teams[0].entries[0].status,'Open PT');
});


test('car-number search accepts a hash prefix and still finds its roster team',()=>{
 const data=league();const result=search(data,'#19','owner');assert.ok(result.some(row=>row.section==='teams'&&row.index===0));
 assert.ok(search(data,'#19','race_control').every(row=>['schedule','results'].includes(row.section)));
});
