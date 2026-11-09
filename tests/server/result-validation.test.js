import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateRaceBonuses,validateStandings,raceControlChangeOnly} from '../../netlify/functions/admin-publish.mjs';
import fs from 'node:fs';
const league=()=>({drivers:{teams:[{name:'Team',entries:[{user:'max',name:'Max',number:'19'},{user:'hayden',name:'Hayden',number:'20'}]}]},records:[{division:'d1',event:'Test Race',finishes:[{username:'max',name:'Max',number:'021',numberManual:true}],bonuses:[]}]});
test('the publish validator accepts archive data and actual finishers',()=>{
 assert.deepEqual(validateRaceBonuses(JSON.parse(fs.readFileSync(new URL('../../data/uarl.json',import.meta.url)))),[]);
 const data=league();data.records[0].bonuses=[{driver:'Max',driverUsername:'max',name:'Most laps led'}];assert.deepEqual(validateRaceBonuses(data),[]);
});
test('the publish validator rejects roster-only recipients, empty recipients and duplicate awards',()=>{
 const data=league();
 for(const bonuses of [[{name:'Most laps led',driver:'Hayden',driverUsername:'hayden'}],[{name:'Fastest lap',driver:''}],[{name:'Fastest lap',driver:'Max',driverUsername:'max'},{name:'Fastest lap',driver:'Max',driverUsername:'max'}]]){
  data.records[0].bonuses=bonuses;assert.ok(validateRaceBonuses(data).length);
 }
});
test('standings publishing rejects malformed corrections and duplicate division identities',()=>{
 const row={id:'d1:max',division:'d1',username:'max',name:'Max',number:'019',pointsAdjustment:-5,previousPosition:null,order:1};
 assert.deepEqual(validateStandings({}),[]);assert.deepEqual(validateStandings({standings:[row]}),[]);
 for(const standings of [{},[null],[{...row,pointsAdjustment:'100'}],[{...row,pointsAdjustment:Infinity}],[{...row,previousPosition:0}],[{...row,order:1.5}],[{...row,username:''}],[row,{...row}]])assert.ok(validateStandings({standings}).length);
});
test('Race Control can publish standings corrections while roster and account scope stay restricted',()=>{
 const current={events:[],records:[],race:{schedule:[],drivers:[{id:'max'}]},drivers:{teams:[{name:'Original'}]}};
 const next=structuredClone(current);next.standings=[{id:'d1:max',pointsAdjustment:5}];next.records=[{id:'race'}];
 assert.equal(raceControlChangeOnly(next,current),true);
 next.drivers.teams[0].name='Changed';assert.equal(raceControlChangeOnly(next,current),false);
 assert.equal(raceControlChangeOnly(next,null),false);
});
