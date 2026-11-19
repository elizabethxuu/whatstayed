const {chromium,devices}=require('playwright');const B='http://localhost:3100';
const FIX={lisbon:[{lat:"38.7077",lon:"-9.1365",name:"Lisbon",display_name:"Lisbon, Portugal",address:{city:"Lisbon",state:"Lisbon",country:"Portugal"}}],
 sintra:[{lat:"38.8029",lon:"-9.3817",name:"Sintra",display_name:"Sintra, Lisbon, Portugal",address:{town:"Sintra",state:"Lisbon",country:"Portugal"}}],
 rev:{lat:"22.5787",lon:"113.0819",name:"Jiangmen",display_name:"Jiangmen, Guangdong, China",address:{city:"Jiangmen",state:"Guangdong",country:"China"}}};
let osm=[];
async function mockOSM(ctx){await ctx.route('https://nominatim.openstreetmap.org/**',r=>{const u=new URL(r.request().url());osm.push(u.pathname+'?q='+(u.searchParams.get('q')||''));
 if(u.pathname.startsWith('/reverse'))return r.fulfill({json:FIX.rev});const q=(u.searchParams.get('q')||'').toLowerCase();return r.fulfill({json:FIX[Object.keys(FIX).find(k=>q.includes(k))]||[]})});
 await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));}
(async()=>{const b=await chromium.launch();const T=[];const ok=(n,v,d='')=>T.push((v?'PASS ':'FAIL ')+n+(d?' — '+d:''));
const c=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2,permissions:['geolocation'],geolocation:{latitude:22.5787,longitude:113.0819}});await mockOSM(c);const A=require('./auth.js');await A.signup(c);
const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
const st=()=>A.state(p);
await p.goto(B+'/');await p.waitForTimeout(3000);ok('no map lookups on load',osm.length===0);
// memories are planted directly here; drafting through conversation is tested in conversation.js
const plant=async m=>{const id=await p.evaluate(async m=>(await (await fetch('/api/memories',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(m)})).json()).memory.id,m);await p.goto(B+'/?m='+id);await p.waitForSelector('.card');await p.waitForTimeout(600);return id};
await plant({place:'Lisbon',moment:'On the tram up to Alfama the bells were ringing and my mom held my hand',feeling:'held',weight:'tender'});
ok('new memory opens with "Add a place"',await p.isVisible('.card >> text=Add a place'));
ok('location optional: memory exists unplaced',Object.keys((await st()).locations).length===0);
// A. search
await p.click('.card >> text=Add a place');await p.waitForTimeout(300);ok('editor opens',await p.isVisible('.loc-ed'));
await p.click('.loc-chip');await p.waitForSelector('.loc-hits button');await p.click('.loc-hits button');await p.waitForTimeout(200);
ok('search fills city/country',(await p.inputValue('.loc-fields label:nth-child(3) input'))==='Lisbon'&&(await p.inputValue('.loc-fields label:nth-child(4) input'))==='Portugal');
await p.fill('.loc-fields label:nth-child(1) input','Tram 28');await p.fill('.loc-fields label:nth-child(2) input','Alfama');
await p.screenshot({path:'pl-editor.png'});
await p.click('text=Save place');await p.waitForTimeout(300);
let s=await st();let L=Object.values(s.locations)[0];ok('saved with coords + venue + neighborhood',!!L&&L.lat>38&&L.name==='Tram 28'&&L.neighborhood==='Alfama'&&L.city==='Lisbon',JSON.stringify(L));
ok('card shows place line',/Tram 28, Alfama, Lisbon, Portugal/.test(await p.textContent('.card-loc')));
// B. manual only
await plant({place:'Sintra',moment:'At sunset we ate grilled sardines and laughed until we cried',feeling:'free',weight:'light'});
await p.click('.card >> text=Add a place');await p.fill('.loc-fields label:nth-child(1) input','Praia da Adraga');await p.fill('.loc-fields label:nth-child(3) input','Sintra');await p.fill('.loc-fields label:nth-child(4) input','Portugal');await p.click('text=Save place');await p.waitForTimeout(300);
s=await st();ok('manual entry saved without coords',Object.values(s.locations).some(l=>l.city==='Sintra'&&l.lat===undefined));
// C. device location, with explanation first
await plant({place:'Jiangmen',moment:'The last morning she braided my hair and I knew I might not see her again',feeling:'held',weight:'heavy',echoes:'Lisbon',because:'both with family'});
await p.click('.card >> text=Add a place');await p.click('text=Use where I am now');
ok('explains before asking',await p.isVisible('.loc-ask')&&osm.filter(x=>x.startsWith('/reverse')).length===0);
await p.click('text=Share once');await p.waitForTimeout(800);ok('reverse fills Jiangmen',(await p.inputValue('.loc-fields label:nth-child(3) input'))==='Jiangmen');await p.click('text=Save place');await p.waitForTimeout(300);
s=await st();ok('device location saved',Object.values(s.locations).some(l=>l.city==='Jiangmen'&&l.source==='device'));
// E. suggestion needs approval
ok('suggestion shown, not tied yet',await p.isVisible('.card-suggest')&&(await st()).threads.length===0&&(await p.$$eval('.tree .thread',x=>x.length))===0,await p.textContent('.card-suggest').catch(()=>''));
await p.screenshot({path:'pl-suggest.png'});
await p.click('.card-suggest button:has-text("Tie them")');await p.waitForTimeout(1200);
s=await st();ok('approved → thread saved (suggested)',s.threads.length===1&&s.threads[0].origin==='suggested');ok('tree draws the thread',(await p.$$eval('.tree .thread',x=>x.length))===1);
// user-made tie
await p.focus('.blossom[aria-label^="Sintra"]');await p.keyboard.press('Enter');await p.waitForTimeout(400);await p.click('text=Tie a red thread…');await p.waitForTimeout(300);await p.click('.tie-list button >> text=bells');await p.fill('.tie-note input','Same trip');await p.click('text=Tie the thread');await p.waitForTimeout(400);
s=await st();ok('user-made tie saved',s.threads.length===2&&s.threads.some(t=>t.origin==='you'&&t.note==='Same trip'));
// C/D. Places
osm=[];await p.click('.rooms >> text=Places');await p.waitForURL('**/places');await p.waitForTimeout(1500);
ok('places loads with no lookups',osm.length===0);
ok('markers = real placed memories',(await p.$$('.a-mark')).length===2,String((await p.$$('.a-mark')).length));
ok('red arc between countries',(await p.$$('.a-thread')).length===1);
ok('gazetteer lists Sintra off-map',/Sintra[\s\S]*not on the map/.test(await p.textContent('.gazetteer')));
await p.screenshot({path:'pl-atlas.png'});
await p.click('.a-mark[aria-label^="Lisbon"]');await p.waitForTimeout(500);ok('marker reveals memories',/bells were ringing/.test(await p.textContent('.pl-peek')));
await p.screenshot({path:'pl-peek.png'});
await p.click('text=Open this place');await p.waitForTimeout(800);
const pg=await p.textContent('.pl-page');ok('place page: name, region, count, excerpt, threads',/Lisbon/.test(pg)&&/Portugal/.test(pg)&&/1 memory/.test(pg)&&/bells/.test(pg)&&/Jiangmen, China/.test(pg)&&/Same trip/.test(pg));
await p.screenshot({path:'pl-page.png',fullPage:true});
await p.click('a.pl-tie-place:has-text("Jiangmen")');await p.waitForTimeout(700);ok('follow thread to Jiangmen page',/Jiangmen/.test(await p.textContent('.pl-page h1')));
// edit off-map place via search to pin it
await p.goto(B+'/places');await p.waitForTimeout(1000);await p.click('.gz-row >> text=Sintra');await p.waitForTimeout(600);
await p.click('.pl-page >> text=Edit place');await p.fill('#locQ','Sintra');await p.waitForSelector('.loc-hits button');await p.click('.loc-hits button');await p.click('text=Save place');await p.waitForTimeout(500);
await p.goto(B+'/places');await p.waitForTimeout(1200);ok('edited place now pinned',(await p.$$('.a-mark')).length===3);
// zoom
const t0=await p.getAttribute('.atlas-svg > g','transform');await p.click('[aria-label="Zoom in"]');await p.waitForTimeout(200);const t1=await p.getAttribute('.atlas-svg > g','transform');ok('zoom changes view',t0!==t1,t1);
const bb=await (await p.$('.atlas-svg')).boundingBox();await p.mouse.move(bb.x+300,bb.y+200);await p.mouse.down();await p.mouse.move(bb.x+380,bb.y+240,{steps:5});await p.mouse.up();ok('drag pans',(await p.getAttribute('.atlas-svg > g','transform'))!==t1);
await p.click('text=Whole world');
// remove a location
await p.click('.gz-row >> text=Jiangmen');await p.waitForTimeout(500);await p.click('.pl-page >> text=Edit place');await p.click('text=Remove this place');await p.waitForTimeout(400);
s=await st();ok('remove location',!Object.values(s.locations).some(l=>l.city==='Jiangmen'));
await p.goto(B+'/places');await p.waitForTimeout(1000);ok('removed place leaves map; its arc goes, Lisbon–Sintra stays',(await p.$$('.a-mark')).length===2&&(await p.$$('.a-thread')).length===1);
ok('unplaced memory listed to add again',/Not yet placed[\s\S]*Jiangmen/.test(await p.textContent('.gazetteer')));
// untie + persistence
await p.click('.gz-row >> text=Lisbon');await p.waitForTimeout(500);const before=(await st()).threads.length;await p.click('.pl-tie >> text=untie');await p.waitForTimeout(300);ok('untie',(await st()).threads.length===before-1);
await p.reload();await p.waitForTimeout(1000);ok('persists after refresh',(await p.$$('.pl-tie')).length===before-1);
// garden + archives still fine
await p.goto(B+'/');await p.waitForTimeout(3000);ok('garden intact',(await p.$$('.blossom')).length===3);
await p.goto(B+'/archives');await p.waitForTimeout(800);ok('archives intact',await p.isVisible('.invite'));
ok('no JS errors',errs.length===0,JSON.stringify(errs));
// denied permission
const d=await b.newContext({viewport:{width:1280,height:800}});await mockOSM(d);const q=await d.newPage();await A.signup(d);for(const m0 of (await st()).memories)await d.request.post('http://localhost:3100/api/memories',{data:{place:m0.place,moment:m0.moment,feeling:m0.feeling,weight:m0.weight},headers:{origin:'http://localhost:3100'}});
await q.goto(B+'/places');await q.waitForTimeout(1200);await q.click('.gz-row.static >> text=Add a place');await q.click('text=Use where I am now');await q.click('text=Share once');await q.waitForTimeout(1500);
ok('denied → offers typing instead',/wasn’t shared|Couldn’t find/.test(await q.textContent('.loc-note')),await q.textContent('.loc-note'));
// phone
const m=await b.newContext({...devices['iPhone 13']});await mockOSM(m);const r=await m.newPage();await A.share(c,m);
await r.goto(B+'/places');await r.waitForTimeout(1500);ok('phone: no sideways scroll',(await r.evaluate(()=>document.documentElement.scrollWidth))<=390);await r.screenshot({path:'pl-m.png',fullPage:true});
await r.goto(B+'/');await r.waitForTimeout(1500);ok('phone: nav fits',(await r.evaluate(()=>document.documentElement.scrollWidth))<=390);await r.screenshot({path:'pl-m-garden.png'});
console.log(T.join('\n'));await b.close()})();
