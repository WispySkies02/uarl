import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../../assets/result-drivers.js';
const {pool,resolve,optionsForCurrent,bonusPool,bonusIssues}=globalThis.UARLResultDrivers;
const base=()=>({drivers:{teams:[{name:'Current Team',entries:[{name:'Max',number:'19',status:'Signed'},{name:'Hayden',user:'Hayden_User',number:'20',status:'Full-Time'}]}],profiles:{Max_User:{alias:'Max'},Hayden_User:{alias:'Hayden'}},openEntries:[{user:'Open_User',name:'Open Racer',number:'05'}]},records:[{division:'d1',finishes:[{name:'Max',username:'Max_User',number:'7'},{name:'Hayden'},{name:'Old Driver',username:'old_user',number:'99'}]}],race:{drivers:[{division:'d2',id:'archive_user',name:'Archive Racer',number:'24'}]}});

test('new race choices come from its division roster, not previous race classifications',()=>{
 const data=base(),before=JSON.stringify(data),choices=pool(data,{division:'d1'});
 assert.deepEqual(choices.map(d=>d.name),['Max','Hayden']);
 assert.deepEqual(choices.map(d=>d.number),['19','20']);
 assert.equal(choices.filter(d=>d.name==='Max').length,1);
 assert.equal(choices.filter(d=>d.name==='Hayden').length,1);
 assert.equal(JSON.stringify(data),before);
 assert.deepEqual(pool(data,{division:'open'}).map(d=>d.name),['Open Racer']);
 assert.deepEqual(pool(data,{division:'d2'}).map(d=>d.name),['Archive Racer']);
});
test('roster overrides win over aliases and placeholders or inactive seats are excluded',()=>{
 const data=base();data.drivers.teams[0].entries.push({user:'Named_User',name:'Roster Name',number:'21'},{name:'OPEN',number:'22',status:'Open FT'},{name:'Part-Time Charter',number:'23'},{user:'inactive_user',name:'Inactive',status:'Inactive'});
 data.drivers.profiles.Named_User={alias:'Old Profile Name'};
 const choices=pool(data,{division:'d1'});
 assert.deepEqual(choices.map(d=>d.name),['Max','Hayden','Roster Name']);
 assert.equal(resolve(choices,'Old Profile Name').name,'Roster Name');
});
test('Max name-only and username rows deduplicate without erasing the roster car number',()=>{
 const data=base();data.drivers.teams[0].entries.push({name:'Max',user:'Max_User',number:'19'});
 const choices=pool(data,{division:'d1'});
 assert.equal(choices.filter(d=>d.name==='Max').length,1);
 assert.equal(resolve(choices,'Max','max_user').number,'19');
 assert.equal(optionsForCurrent(choices,'Max','Max_User','88').filter(d=>d.name==='Max').length,1);
});
test('same-name drivers with different known usernames stay distinct and numbers never supply identity',()=>{
 const data=base();data.drivers.teams[0].entries.push({user:'Other_Hayden',name:'Hayden',number:'20'});
 const choices=pool(data,{division:'d1'});
 assert.equal(choices.filter(d=>d.name==='Hayden').length,2);
 assert.equal(resolve(choices,'Hayden','Other_Hayden').user,'Other_Hayden');
 assert.equal(resolve(choices,'Hayden','unknown_user','20'),undefined);
 assert.equal(resolve(choices,'Hayden','', '20'),undefined);
 assert.equal(resolve(choices,'','', '19'),undefined);
});
test('a current race guest overrides roster presentation and number for that identity only',()=>{
 const data=base(),record={division:'d1',entries:[{user:'HAYDEN_user',name:'Guest Display',number:'08'},{user:'one_off',name:'One Off',number:'09'}]};
 const choices=pool(data,record);
 assert.equal(choices.filter(d=>d.user.toLowerCase()==='hayden_user').length,1);
 assert.equal(resolve(choices,'Hayden','Hayden_User').number,'08');
 assert.equal(resolve(choices,'Hayden','Hayden_User').name,'Guest Display');
 assert.equal(pool(data,{division:'d1'}).some(d=>d.name==='One Off'),false);
});
test('saved historical participant is retained only in its own selected field',()=>{
 const choices=pool(base(),{division:'d1'});
 const historical=optionsForCurrent(choices,'Old Driver','old_user','99');
 assert.equal(historical.length,choices.length+1);
 assert.equal(historical.at(-1).source,'saved');
 assert.equal(optionsForCurrent(choices,'','').some(d=>d.user==='old_user'),false);
 assert.equal(optionsForCurrent(choices,'#20 Hayden','','20').length,choices.length);
});
test('an explicit saved username can fill a uniquely matched unverified roster identity without duplication',()=>{
 const data=base();delete data.drivers.profiles.Max_User;
 const choices=pool(data,{division:'d1'}),options=optionsForCurrent(choices,'Max','Max_User','19');
 assert.equal(options.filter(d=>d.name==='Max').length,1);
 assert.equal(resolve(options,'Max','Max_User').user,'Max_User');
});
test('bonuses only offer this race finishers, preserve manual numbers and do not import old bonus recipients',()=>{
 const data=base(),record={division:'d1',finishes:[{name:'Max',username:'Max_User',number:'019'},{name:'#20 Hayden',number:'77'}],bonuses:[{driver:'Old Driver',driverUsername:'old_user'}]};
 const choices=bonusPool(data,record);
 assert.deepEqual(choices.map(d=>[d.name,d.number]),[['Max','019'],['Hayden','77']]);
 assert.equal(choices.some(d=>d.user==='old_user'),false);
 assert.equal(bonusPool(data,{division:'d1',finishes:[],bonuses:record.bonuses}).length,0);
});
test('ambiguous profile aliases do not invent an identity for a name-only signing',()=>{
 const data=base();data.drivers.profiles.Another_Max={alias:'Max'};
 const choices=pool(data,{division:'d1'});
 assert.equal(choices.find(d=>d.name==='Max').user,'');
});

test('Open Series is a division label, not a vacant seat status',()=>{
 const data=base();data.drivers.openEntries[0].status='Open Series';
 assert.equal(pool(data,{division:'open'}).length,1);
});

test('synthetic legacy guest identities converge by unique name while known usernames remain authoritative',()=>{
 const choices=pool(base(),{division:'d1'});
 assert.equal(resolve(choices,'Hayden','guest:d1:hayden').user,'Hayden_User');
 assert.equal(optionsForCurrent(choices,'Hayden','guest:d1:hayden').length,choices.length);
 assert.equal(resolve(choices,'Max','LegacyMax'),undefined);
 assert.equal(optionsForCurrent(choices,'Max','LegacyMax').filter(d=>d.name==='Max').length,2);
});
test('ambiguous legacy names do not merge synthetic identities into one of multiple same-name drivers',()=>{
 const data=base();data.drivers.teams[0].entries.push({name:'Hayden',user:'other_hayden',number:'20'});
 assert.equal(resolve(pool(data,{division:'d1'}),'Hayden','guest:d1:hayden'),undefined);
});
test('bonus pool keeps explicitly cleared manual numbers and numeric zero overrides',()=>{
 const data=base();
 let record={division:'d1',finishes:[{name:'Hayden',username:'Hayden_User',number:'',numberManual:true}]};
 assert.equal(bonusPool(data,record)[0].number,'');
 record.finishes[0].number=0;
 assert.equal(bonusPool(data,record)[0].number,'0');
});
test('bonus issues identify outsiders, empty selections and repeated awards, but allow shared winners',()=>{
 const data=base();data.records=[{division:'d1',finishes:[{name:'Max',username:'Max_User'},{name:'Hayden',username:'Hayden_User'}],bonuses:[
  {name:'Fastest lap',driver:'Max',driverUsername:'Max_User'},
  {name:'Fastest lap',driver:'Hayden',driverUsername:'Hayden_User'},
  {name:'Fastest lap',driver:'Max',driverUsername:'max_user'},
  {name:'Most laps led',driver:'Outsider',driverUsername:'outside'},
  {name:'Fastest recorded practice',driver:''}
 ]}];
 assert.deepEqual(bonusIssues(data).map(x=>[x.recordIndex,x.bonusIndex]),[[0,2],[0,3],[0,4]]);
});
test('bonus duplicate detection recognizes name-only and subsequently supplied usernames as the same finisher',()=>{
 const data=base();delete data.drivers.profiles.Max_User;
 data.records=[{division:'d1',finishes:[{name:'Max',number:'19'}],bonuses:[{name:'Fastest lap',driver:'Max'},{name:'Fastest lap',driver:'Max',driverUsername:'verified_max'}]}];
 assert.deepEqual(bonusIssues(data).map(x=>x.bonusIndex),[1]);
});
test('existing repository race bonuses pass recipient validation',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../../data/uarl.json',import.meta.url)));
 assert.deepEqual(bonusIssues(data),[]);
});

test('null and blank bonus rows are invalid selections rather than validation crashes',()=>{
 const data=base();data.records=[{division:'d1',finishes:[null,{}],bonuses:[null,{}]}];
 assert.deepEqual(bonusIssues(data).map(x=>x.bonusIndex),[0,1]);
});
