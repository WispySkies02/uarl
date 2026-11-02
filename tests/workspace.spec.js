import {test, expect} from '@playwright/test';
import fs from 'node:fs';

const original=JSON.parse(fs.readFileSync(new URL('../data/uarl.json',import.meta.url)));
const draftKey='uarl-admin-draft-v1';
const personArtwork={numberImage:'/assets/aetherwing/numbers/28.png',signatureImage:'/assets/aetherwing/numbers/32.png'};
function workspaceData(){
 const data=structuredClone(original);
 data.events=[{id:'river-race',division:'d1',name:'River Speedway Race',track:'River Speedway',date:'2027-01-10',start:'2027-01-11T00:30:00.000Z',laps:60,round:1,pointsEvent:true},{id:'next-race',division:'d1',name:'Next Oval Race',track:'Next Oval',date:'2027-01-17',start:'2027-01-18T00:30:00.000Z',laps:80,round:2,pointsEvent:true}];
 data.records=[{id:'river-race',scheduleEventId:'river-race',division:'d1',event:'Pending River Race',date:'2027-01-10',start:'2027-01-11T00:30:00.000Z',status:'pending',track:'River Speedway',pointsEvent:true,entries:[],qualifying:[],stages:[],finishes:[],bonuses:[]}];
 data.drivers.teams=[{id:'source',name:'Source Racing',owner:'Source Owner',make:'Toyota',logo:'/assets/aetherwing/logo.webp',note:'Source team',entries:[{number:'19',user:'SourceUser',name:'Source Driver',status:'Full-Time',seatType:'Full-Time',charterType:'FT',...personArtwork}]},{id:'target',name:'Target Racing',owner:'Target Owner',make:'Ford',note:'Destination team',entries:[{number:'88',name:'OPEN',status:'Open FT',seatType:'Part-Time',charterType:'PT',customCharterNote:'Keep this charter metadata'}]}];
 data.drivers.profiles={SourceUser:{alias:'Profile Source',wins:4,championships:1,rank:3},FreeUser:{alias:'Free Driver',wins:0,championships:0,rank:0}};
 data.drivers.openEntries=[];
 data.drivers.freeAgents=[{name:'Stale Source Listing',user:'SourceUser',former:'Older Team'},{name:'Free Driver',user:'FreeUser',former:'Independent'}];
 data.drivers.recentMoves=[];
 data.paints=[];
 return data;
}
async function boot(page,{role='owner',data=workspaceData()}={}){
 await page.route('**/.netlify/functions/admin-publish**',route=>route.fulfill({json:route.request().url().includes('status=1')?{ready:true,user:{id:'workspace-test',displayName:'Workspace Owner',role}}:{data}}));
 await page.goto('/admin/');
 await expect(page.locator('[data-admin-app]')).toBeVisible();
 await expect(page.locator('[data-save-status]')).toHaveText('Published data loaded');
}
async function draft(page){return page.evaluate(async key=>{const value=localStorage.getItem(key);return value?JSON.parse(value):await window.UARLData.load();},draftKey);}
async function chooseUser(select,user){
 const value=await select.locator('option').evaluateAll((options,user)=>options.find(option=>option.dataset.user?.toLowerCase()===user.toLowerCase())?.value,user);
 expect(value,'Expected a stored driver choice for '+user).toBeTruthy();
 await select.selectOption(value);
}
const task=(page,name)=>page.locator('[data-workspace-task="'+name+'"]');

test('daily shortcuts open roster work directly and resume the pending race without duplicating it',async({page})=>{
 const data=workspaceData();await boot(page,{data});
 await task(page,'roster').click();
 await expect(page.locator('[data-sadd="entries"]')).toBeVisible();
 await expect(page.locator('.editor-steps [data-step="2"]')).toHaveAttribute('aria-current','step');
 await page.locator('.admin-sidebar [data-section="dashboard"]').click();
 await task(page,'race').click();
 await expect(page.locator('[data-admin-view]')).toContainText('Pending River Race');
 expect((await draft(page)).records.map(record=>record.id)).toEqual(['river-race']);
 await page.locator('.admin-sidebar [data-section="dashboard"]').click();await task(page,'race').click();
 expect((await draft(page)).records.map(record=>record.id)).toEqual(['river-race']);
});

test('global search jumps to the requested record and respects Race Control permissions',async({page})=>{
 await boot(page);
 await page.keyboard.press('Control+k');
 const searchDialog=page.locator('[data-workspace-search-dialog]');await expect(searchDialog).toBeVisible();
 await page.locator('[data-workspace-search]').fill('Target Racing');
 const target=page.locator('[data-search-section="teams"][data-search-index="1"]');await expect(target).toContainText('Target Racing');await target.click();
 await expect(searchDialog).not.toBeVisible();await expect(page.locator('.editor-title')).toContainText('Target Racing');
 await page.unroute('**/.netlify/functions/admin-publish**');await boot(page,{role:'race_control'});
 await expect(task(page,'roster')).toHaveCount(0);await expect(task(page,'paint')).toHaveCount(0);
 await page.locator('[data-open-search]').first().click();await page.locator('[data-workspace-search]').fill('Target Racing');
 await expect(page.locator('[data-search-section="teams"]')).toHaveCount(0);
 await page.locator('[data-workspace-search]').fill('River');
 await expect.poll(async()=>page.locator('[data-search-section]').count()).toBeGreaterThan(0);
 const sections=await page.locator('[data-search-section]').evaluateAll(nodes=>nodes.map(node=>node.dataset.searchSection));
 expect(sections.every(section=>['schedule','results'].includes(section))).toBe(true);
});

test('a paint can use stored driver details instead of asking for them again',async({page})=>{
 await boot(page);await task(page,'paint').click();
 await chooseUser(page.locator('[data-paint-driver]'),'SourceUser');
 const paint=(await draft(page)).paints.at(-1);
 expect(paint).toMatchObject({name:'Source Driver',handle:'SourceUser',number:'19',team:'Source Racing',make:'Toyota',division:'d1'});
 await expect(page.locator('[data-paint-driver] option:checked')).toContainText('Source Driver');
 await expect(page.locator('[data-save-status]')).toContainText('Draft saved');
});

test('one full text edit can be undone and redone and the review names the changed record',async({page})=>{
 await boot(page);await task(page,'roster').click();await page.locator('.editor-steps [data-step="0"]').click();
 const name=page.locator('[data-field="name"]');await expect(name).toHaveValue('Source Racing');
 await name.press('End');await name.pressSequentially(' renamed');await page.locator('.step-heading').click();
 await page.locator('[data-workspace-undo]').first().click();await expect(page.locator('[data-field="name"]')).toHaveValue('Source Racing');
 await page.locator('[data-workspace-redo]').first().click();await expect(page.locator('[data-field="name"]')).toHaveValue('Source Racing renamed');
 await page.locator('[data-review-changes]').first().click();
 const review=page.locator('[data-workspace-changes-dialog]');await expect(review).toBeVisible();
 await expect(review).toContainText('Source Racing renamed');await expect(review).toContainText(/Team name|Name/);
 await expect(review).not.toContainText('drivers.teams');
});

test('a roster transfer updates the related records as one undoable action without losing charter metadata',async({page})=>{
 const data=workspaceData();await page.clock.install({time:new Date('2026-11-03T02:00:00Z')});await boot(page,{data});await task(page,'roster').click();
 await page.locator('[data-open-transfer]').first().click();
 const dialog=page.locator('[data-transfer-dialog]');await expect(dialog).toBeVisible();
 await chooseUser(page.locator('[data-transfer-person]'),'SourceUser');
 await page.locator('[data-transfer-team]').selectOption('target');await page.locator('[data-transfer-seat]').selectOption('0');
 await expect(page.locator('[data-transfer-number]')).toHaveValue('88');await expect(page.locator('[data-transfer-announce]')).toBeChecked();
 await page.locator('[data-transfer-confirm]').click();await expect(dialog).not.toBeVisible();
 let current=await draft(page),source=current.drivers.teams.find(team=>team.id==='source'),target=current.drivers.teams.find(team=>team.id==='target');
 expect(source.entries[0]).toMatchObject({number:'19',name:'OPEN'});expect(source.entries[0].user).toBeFalsy();
 expect(source.entries[0].numberImage).toBeUndefined();expect(source.entries[0].signatureImage).toBeUndefined();
 expect(target.entries[0]).toMatchObject({number:'88',user:'SourceUser',name:'Source Driver',seatType:'Part-Time',charterType:'PT',customCharterNote:'Keep this charter metadata',...personArtwork});
 expect(current.drivers.teams.flatMap(team=>team.entries).filter(entry=>entry.user==='SourceUser')).toHaveLength(1);
 expect(current.drivers.freeAgents.some(person=>person.user==='SourceUser')).toBe(false);
 expect(current.drivers.recentMoves).toHaveLength(1);expect(current.drivers.recentMoves[0]).toMatchObject({driver:'Source Driver',team:'Target Racing',number:'88',make:'Ford',signedAt:'2026-11-02'});
 expect(current.drivers.profiles).toEqual(data.drivers.profiles);expect(current.records.map(record=>record.id)).toEqual(data.records.map(record=>record.id));
 await page.locator('[data-workspace-undo]').first().click();current=await draft(page);
 expect(current.drivers.teams[0].entries[0]).toMatchObject({number:'19',user:'SourceUser',...personArtwork});expect(current.drivers.teams[1].entries[0].name).toBe('OPEN');
 expect(current.drivers.recentMoves).toHaveLength(0);expect(current.drivers.freeAgents.some(person=>person.user==='SourceUser')).toBe(true);
 await page.locator('[data-workspace-redo]').first().click();current=await draft(page);expect(current.drivers.teams[1].entries[0].user).toBe('SourceUser');expect(current.drivers.recentMoves).toHaveLength(1);
});

test('workspace tasks and editing tools remain reachable without horizontal overflow on phones',async({page})=>{
 await boot(page);
 for(const width of [320,390,430,768,900,1024,1440]){
  await page.setViewportSize({width,height:844});
  await expect(task(page,'roster')).toBeVisible();await expect(task(page,'paint')).toBeVisible();
  await expect(page.locator('[data-open-search]').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.setViewportSize({width:390,height:844});await task(page,'roster').click();await expect(page.locator('[data-open-transfer]').first()).toBeVisible();
 await expect(page.locator('[data-workspace-undo]').first()).toBeVisible();
 await page.locator('[data-open-transfer]').first().click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/workspace-transfer-mobile.png'});
});


test('an image finishing upload preserves ongoing typing and gives the upload its own undo step',async({page})=>{
 await boot(page);await task(page,'roster').click();await page.locator('.entry-card>summary').first().click();
 let release,started=false;const wait=new Promise(resolve=>{release=resolve;});
 await page.route('**/.netlify/functions/admin-publish',async route=>{
  if(route.request().method()!=='POST')return route.fallback();
  const payload=route.request().postDataJSON();if(payload.action!=='upload-driver-image')return route.fallback();
  started=true;await wait;return route.fulfill({json:{url:'/assets/aetherwing/numbers/54.png'}});
 });
 await page.locator('[data-image-upload][data-image-key="numberImage"]').first().setInputFiles({name:'number.png',mimeType:'image/png',buffer:fs.readFileSync(new URL('../assets/aetherwing/numbers/28.png',import.meta.url))});
 await expect.poll(()=>started).toBe(true);
 const name=page.locator('[data-sfield="entries"][data-skey="name"]').first();await name.fill('Source Driver revised');
 release();await expect.poll(async()=>(await draft(page)).drivers.teams[0].entries[0].numberImage).toBe('/assets/aetherwing/numbers/54.png');
 await expect(name).toBeFocused();await name.press('End');await name.pressSequentially(' final');await page.locator('.step-heading').click();
 await page.locator('[data-workspace-undo]').first().click();let row=(await draft(page)).drivers.teams[0].entries[0];
 expect(row.name).toBe('Source Driver revised');expect(row.numberImage).toBe('/assets/aetherwing/numbers/54.png');
 await page.locator('[data-workspace-undo]').first().click();row=(await draft(page)).drivers.teams[0].entries[0];
 expect(row.name).toBe('Source Driver revised');expect(row.numberImage).toBe('/assets/aetherwing/numbers/28.png');
 await page.locator('[data-workspace-undo]').first().click();expect((await draft(page)).drivers.teams[0].entries[0].name).toBe('Source Driver');
});

test('transfer choices do not duplicate a driver who also races Open and new seats use an appropriate number',async({page})=>{
 const data=workspaceData();data.drivers.openEntries.push({user:'SourceUser',name:'Source Driver',number:'28',make:'Toyota'});
 await boot(page,{data});await task(page,'transfer').click();
 await expect(page.locator('[data-transfer-person] option[data-user="SourceUser"]')).toHaveCount(1);
 await chooseUser(page.locator('[data-transfer-person]'),'SourceUser');await page.locator('[data-transfer-team]').selectOption('target');
 await expect(page.locator('[data-transfer-number]')).toHaveValue('88');
 await page.locator('[data-transfer-seat]').selectOption('new');await expect(page.locator('[data-transfer-number]')).toHaveValue('19');
});
