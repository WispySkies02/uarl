import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const original=JSON.parse(fs.readFileSync(new URL('../data/uarl.json',import.meta.url)));

test('new-team public name survives roster editing and appears in the website preview', async ({page}) => {
  await page.route('**/.netlify/functions/admin-publish**',route=>route.fulfill({json:route.request().url().includes('status=1')?{ready:true,user:{id:'local',displayName:'Test',role:'owner'}}:{data:null}}));
  await page.goto('/admin/');
  await page.locator('.admin-sidebar [data-section="teams"]').click();
  await page.locator('.view-head [data-action="add"]').click();
  await page.locator('[data-field="name"]').fill('Transfer Racing');
  await page.locator('.editor-steps [data-step="2"]').click();
  await page.locator('[data-sadd="entries"]').click();
  await page.locator('[data-sfield="entries"][data-skey="number"]').fill('99');
  await page.locator('[data-sfield="entries"][data-skey="user"]').fill('Roster_Test_User');
  await page.locator('[data-sfield="entries"][data-skey="name"]').fill('Test Display');
  await page.locator('.step-heading').click();
  await expect(page.locator('.entry-card>summary')).toContainText('#99 · Test Display');
  const entry=await page.evaluate(()=>JSON.parse(localStorage.getItem('uarl-admin-draft-v1')).drivers.teams.at(-1).entries[0]);
  expect(entry.user).toBe('Roster_Test_User');expect(entry.name).toBe('Test Display');
  const popup=page.waitForEvent('popup');
  await page.locator('[data-action="preview"]').first().click();
  const preview=await popup;
  await expect(preview.locator('.pp-team-stage').filter({hasText:'Transfer Racing'}).locator('.pp-stage-entry')).toContainText('Test Display');
  await preview.locator('[data-view="drivers"]').click();
  const card=preview.locator('.pp-driver').filter({hasText:'Transfer Racing'});
  await expect(card.locator('h3')).toHaveText('Test Display');
  await expect(card.locator('.user')).toHaveText('@Roster_Test_User');
  await card.locator('[data-driver]').click();
  await expect(preview.locator('#pp-dialog-title')).toHaveText('Test Display');
  await expect(preview.locator('.pp-profile-user')).toHaveText('@Roster_Test_User');
});

test('roster overrides, profile fallback and usernames agree across cards, dialogs and results data', async ({page}) => {
  const fixture=structuredClone(original);
  const source=fixture.drivers.teams[0].entries.find(e=>e.user);
  const user=source.user;
  const existing=fixture.drivers.profiles[user];
  existing.alias='Profile Alias';
  fixture.drivers.teams.forEach(team=>{team.entries=team.entries.filter(e=>e.user!==user);});
  fixture.drivers.teams.push({id:'transfer',name:'Transfer Racing',owner:'Test',make:'Toyota',note:'',entries:[
    {...source,user,name:'Roster Override'},
    {number:'97',user:'NEW_USERNAME',name:'New Display',status:'Full-Time'},
    {number:'96',user:'NO_PROFILE',status:'Full-Time'}
  ],pendingDrivers:[{numberPending:true,user:'PENDING_USERNAME',name:'Pending Display',status:'Signed'}]});
  fixture.drivers.openEntries.push({number:'95',user:'OPEN_USERNAME',name:'Open Display',make:'Toyota'});
  await page.route('**/.netlify/functions/admin-publish**',route=>route.fulfill({json:{data:fixture}}));
  await page.goto('/drivers/');
  const team=page.locator('.pp-team-stage').filter({hasText:'Transfer Racing'});
  await expect(team).toContainText('Roster Override');await expect(team).toContainText('New Display');
  await page.locator('[data-view="drivers"]').click();
  const cards=page.locator('.pp-driver');
  for(const name of ['Roster Override','New Display','NO_PROFILE','Pending Display']) await expect(cards.locator('h3').filter({hasText:new RegExp('^'+name+'$')})).toHaveCount(1);
  await page.locator('[data-view="open"]').click();
  const open=page.locator('[data-open-grid] .pp-driver').filter({hasText:'Open Display'});
  await expect(open).toBeVisible();await open.locator('[data-driver]').click();
  await expect(page.locator('#pp-dialog-title')).toHaveText('Open Display');
  const resolved=await page.evaluate(async()=>{
    const data=await window.UARLData.load();
    return {drivers:data.race.drivers,lookup:[
      window.UARLData.driverName({name:' ',user:' legacyUSER '},{LegacyUser:{alias:'Stored Alias'}}),
      window.UARLData.driverName({name:'Explicit',user:'legacyuser'},{LegacyUser:{alias:'Stored Alias'}})
    ]};
  });
  expect(resolved.drivers.find(d=>d.id===user)).toMatchObject({name:'Roster Override',team:'Transfer Racing',careerWins:existing.wins});
  expect(resolved.drivers.find(d=>d.id==='NEW_USERNAME').name).toBe('New Display');
  expect(resolved.drivers.find(d=>d.id==='OPEN_USERNAME').name).toBe('Open Display');
  expect(resolved.lookup).toEqual(['Stored Alias','Explicit']);
});

test('large transparent artwork uploads as a resized image and appears in the public preview', async ({page}) => {
  const uploads=[];
  await page.context().route('**/.netlify/functions/admin-publish**',async route=>{
    const request=route.request();
    if(request.method()==='POST'){
      const body=request.postDataJSON();expect(body.action).toBe('upload-driver-image');
      uploads.push(body.image);
      return route.fulfill({json:{url:'/.netlify/functions/admin-publish?image=00000000-0000-0000-0000-'+String(uploads.length).padStart(12,'0')}});
    }
    if(request.url().includes('?image='))return route.fulfill({contentType:'image/webp',body:Buffer.from(uploads.at(-1).split(',')[1],'base64')});
    return route.fulfill({json:request.url().includes('status=1')?{ready:true,user:{id:'test',role:'owner',displayName:'Test'}}:{data:null}});
  });
  await page.goto('/admin/');await page.locator('.admin-sidebar [data-section="teams"]').click();
  await page.locator('.editor-steps [data-step="2"]').click();
  await page.locator('.entry-card>summary').first().click();
  const large=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=3600;canvas.height=1800;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(100,100,1500,700);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const file={name:'large-transparent.png',mimeType:'image/png',buffer:Buffer.from(large,'base64')};
  for(const key of ['numberImage','signatureImage']) {
    await page.locator('[data-image-upload][data-image-key="'+key+'"]').first().setInputFiles(file);
    await expect(page.locator('[data-image-clear][data-image-key="'+key+'"]').first()).toBeVisible();
  }
  expect(uploads).toHaveLength(2);
  const dimensions=await page.evaluate(async url=>{
    const image=new Image();image.src=url;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    return {width:image.width,height:image.height,alpha:ctx.getImageData(0,0,1,1).data[3]};
  },uploads[0]);
  expect(Math.max(dimensions.width,dimensions.height)).toBeLessThanOrEqual(1600);
  expect(dimensions.alpha).toBe(0);
  expect(dimensions.height).toBeLessThan(800);
  expect(Buffer.from(uploads[0].split(',')[1],'base64').length).toBeLessThan(2*1024*1024);
  const popup=page.waitForEvent('popup');await page.locator('[data-action="preview"]').first().click();const preview=await popup;
  const team=preview.locator('.pp-team-stage').filter({hasText:original.drivers.teams[0].name});
  await expect(team.locator('.pp-upload-number img')).toHaveCount(1);
  await expect(team.locator('.pp-driver-signature')).toHaveCount(1);
  await page.locator('[data-image-clear][data-image-key="numberImage"]').first().click();
  const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('uarl-admin-draft-v1')));
  expect(data.drivers.teams[0].entries[0].numberImage).toBeUndefined();
  expect(data.drivers.teams[0].entries[0].signatureImage).toBeTruthy();
});


test('signatures replace visible names while retaining accessible names and text fallback', async ({page}) => {
  const fixture=structuredClone(original);
  fixture.drivers.teams.push({id:'signature-test',name:'Signature Racing',owner:'Test',make:'Toyota',note:'',entries:[
    {number:'99',user:'SIGNATURE_USER',name:'Signature Driver',status:'Full-Time',signatureImage:'/test-signature.png'},
    {number:'98',user:'TEXT_USER',name:'Text Driver',status:'Full-Time'},
    {number:'97',user:'BROKEN_USER',name:'Broken Image Driver',status:'Full-Time',signatureImage:'/broken-signature.png'}
  ],pendingDrivers:[{numberPending:true,user:'PENDING_USER',name:'Pending Signature',signatureImage:'/test-signature.png'}]});
  fixture.drivers.profiles.OPEN_SIGNATURE={alias:'Open Signature',signatureImage:'/test-signature.png'};
  fixture.drivers.openEntries.push({number:'96',user:'OPEN_SIGNATURE',make:'Toyota'});
  await page.route('**/test-signature.png',route=>route.fulfill({contentType:'image/png',body:fs.readFileSync(new URL('../assets/aetherwing/numbers/28.png',import.meta.url))}));
  await page.route('**/broken-signature.png',route=>route.fulfill({status:404,body:''}));
  await page.route('**/.netlify/functions/admin-publish**',route=>route.fulfill({json:{data:fixture}}));
  await page.goto('/drivers/');
  const team=page.locator('.pp-team-stage').filter({hasText:'Signature Racing'});
  const label=team.locator('.pp-stage-person strong').filter({hasText:'Signature Driver'});
  await expect(label.locator('.pp-name-text')).toHaveClass(/pp-visually-hidden/);
  await expect(label.locator('img')).toBeVisible();
  await expect(team.locator('.pp-name-text').filter({hasText:'Text Driver'})).not.toHaveClass(/pp-visually-hidden/);
  const broken=team.locator('.pp-stage-person strong').filter({hasText:'Broken Image Driver'});
  await broken.scrollIntoViewIfNeeded();
  await expect(broken.locator('.pp-name-text')).not.toHaveClass(/pp-visually-hidden/);
  await expect(broken.locator('img')).toHaveCount(0);
  await page.locator('[data-view="drivers"]').click();
  const card=page.locator('.pp-driver').filter({hasText:'Signature Driver'});
  await expect(card.getByRole('heading',{name:'Signature Driver'})).toHaveCount(1);
  await expect(card.locator('h3 .pp-name-text')).toHaveClass(/pp-visually-hidden/);
  await expect(card.locator('.user')).toHaveText('@SIGNATURE_USER');
  await expect(page.locator('.pp-driver').filter({hasText:'Pending Signature'}).locator('h3 img')).toHaveCount(1);
  await card.getByRole('button',{name:'Open Signature Driver profile'}).click();
  await expect(page.locator('#pp-dialog-title .pp-name-text')).toHaveClass(/pp-visually-hidden/);
  await expect(page.getByRole('heading',{name:'Signature Driver',level:2})).toHaveCount(1);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.locator('[data-view="open"]').click();
  const open=page.locator('[data-open-grid] .pp-driver').filter({hasText:'Open Signature'});
  await expect(open.locator('h3 .pp-name-text')).toHaveClass(/pp-visually-hidden/);
  await expect(open.locator('h3 img')).toBeVisible();
});

test('mobile roster art fits its visible pixels instead of transparent source margins', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  const files=await page.evaluate(()=>{
    function artwork(width,height){const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=1000;const ctx=canvas.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(400,400,width,height);return canvas.toDataURL('image/png').split(',')[1];}
    return {number:artwork(80,110),signature:artwork(320,60)};
  });
  for(const key of ['number','signature'])await page.route('**/padded-'+key+'.png',route=>route.fulfill({contentType:'image/png',body:Buffer.from(files[key],'base64')}));
  const fixture=structuredClone(original);
  fixture.drivers.teams.push({id:'art-size',name:'Artwork Sizing',owner:'Test',make:'Toyota',note:'',entries:[{number:'28',user:'ART_USER',name:'Artwork Driver',status:'Full-Time',numberImage:'/padded-number.png',signatureImage:'/padded-signature.png'}]});
  await page.route('**/.netlify/functions/admin-publish**',route=>route.fulfill({json:{data:fixture}}));
  await page.goto('/drivers/');
  const team=page.locator('.pp-team-stage').filter({hasText:'Artwork Sizing'});
  await team.scrollIntoViewIfNeeded();
  const number=team.locator('.pp-upload-number img'),signature=team.locator('.pp-driver-signature');
  for(const image of [number,signature]) {
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveAttribute('data-artwork-fitted','true');
    await expect(image).toHaveAttribute('src',/^data:image\/webp/);
  }
  const metrics=await signature.evaluate(async image=>{await image.decode();return {width:image.getBoundingClientRect().width,height:image.getBoundingClientRect().height,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight};});
  expect(metrics.width).toBeGreaterThanOrEqual(240);expect(metrics.height).toBeGreaterThanOrEqual(76);
  expect(metrics.naturalWidth/metrics.naturalHeight).toBeGreaterThan(3);
  const numberMetrics=await number.evaluate(async image=>{await image.decode();return {height:image.getBoundingClientRect().height,width:image.naturalWidth,heightPixels:image.naturalHeight};});
  expect(numberMetrics.height).toBeGreaterThanOrEqual(100);expect(numberMetrics.width).toBeLessThan(150);expect(numberMetrics.heightPixels).toBeLessThan(150);
  await page.screenshot({path:'test-results/roster-artwork-mobile.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
