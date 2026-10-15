const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const core=require('../shared/logic.js');
const fixture=require('./demo-fixture.cjs')(core);
const root=path.resolve('dist');fs.mkdirSync('test-results',{recursive:true});
const server=http.createServer((req,res)=>{let f=path.join(root,new URL(req.url,'http://localhost').pathname==='/'?'index.html':new URL(req.url,'http://localhost').pathname);if(!f.startsWith(root)||!fs.existsSync(f)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(f));});
let browser,context,page;const errors=[];let calculatorRequests=0;const wait=async(fn)=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,50));}throw new Error('Expected UI state did not appear.');};
async function text(sel){return page.locator(sel).innerText();}
async function login(email,pw='DemoPass123'){await page.locator('#loginEmail').fill(email);await page.locator('#loginPassword').fill(pw);await page.locator('#loginBtn').click();await wait(()=>page.locator('#app').isVisible());}
async function tab(name){if(page.viewportSize().width<1000)await page.locator('.menu-btn').click();await page.locator('#nav button[data-tab="'+name+'"]').click();}
async function pane(name){await page.locator('#calcSeg button[data-pane="'+name+'"]').click();}
async function logout(){await page.evaluate(()=>logout());await wait(()=>page.locator('#authScreen').isVisible());}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});
 context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.print=()=>{window.__printed=document.getElementById('apkPrintArea').innerHTML;};});
 // All accounts/data below are fictional; requests are intercepted before any backend traffic.
 await page.route('https://script.google.com/**',async route=>{try{const body=route.request().postDataJSON();let result;if(/^calculate/.test(body.action))calculatorRequests++;
 if(body.action==='saveEngineeringRecord')result={id:body.args[1].id,synced:true};
 else if(body.action==='listEngineeringRecords')result=[];
 else result=fixture(body.action,body.args);
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,version:1,result})});
 }catch(err){await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:false,version:1,error:err.message})});}});
 await page.goto(url);
 assert.equal(await page.evaluate(()=>APK_SETTINGS.mode),'live');
 assert.equal(await page.locator('#settingMode').count(),0);
 assert.equal(await page.locator('#backendUrl').count(),0);
 await page.locator('#settingsBtn').click();await page.locator('#themeSetting').selectOption('light');await page.getByRole('button',{name:'Apply settings'}).click();
 assert.equal(await page.evaluate(()=>APK_SETTINGS.backend),await page.evaluate(()=>DEFAULT_BACKEND));
 // Verify an existing installation's legacy demo/custom backend is migrated automatically.
 await page.evaluate(()=>{localStorage.setItem('lift-settings',JSON.stringify({mode:'demo',backend:'https://script.google.com/macros/s/old/exec',theme:'light'}));localStorage.setItem('apk_lcs_token_v1','fictional:old@example.test');});
 await page.reload();
 for(const [kind,width,height] of [['desktop',1440,900],['mobile',390,844]]){await page.setViewportSize({width,height});for(const theme of ['light','dark']){await page.evaluate(t=>{APK_SETTINGS.theme=t;applyTheme();},theme);await page.screenshot({path:'test-results/login-'+kind+'-'+theme+'.png',fullPage:true,animations:'disabled'});assert.ok(await page.evaluate(()=>Array.from(document.querySelectorAll('.login-brand img')).every(i=>i.complete&&i.naturalWidth>0)));}}
 await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>{APK_SETTINGS.theme='light';applyTheme();});
 assert.equal(await page.evaluate(()=>APK_SETTINGS.mode),'live');assert.equal(await page.evaluate(()=>loadToken()),null);
await page.evaluate(()=>navigator.serviceWorker.ready);await wait(()=>page.evaluate(()=>!!navigator.serviceWorker.controller));await page.locator('#loginBtn').click();await wait(async()=>/Incorrect/.test(await text('#authMsg')));
 await page.locator('#tabRegister').click();await page.locator('#regName').fill('Fictional New Engineer');await page.locator('#regEmail').fill('new@example.test');await page.locator('#regPassword').fill('TestPass123');await page.locator('#regBtn').click();await wait(async()=>/FICTIONAL demo request/.test(await text('#authMsg')));
 await page.locator('#loginEmail').fill('new@example.test');await page.locator('#loginPassword').fill('TestPass123');await page.locator('#loginBtn').click();await wait(async()=>/not approved/.test(await text('#authMsg')));
 await login('admin@example.test');await tab('users');await wait(()=>page.locator('#role-5').isVisible());await page.locator('#role-5').selectOption('Full');await wait(async()=>await page.locator('#role-5').inputValue()==='Full');await page.getByRole('button',{name:'Approve',exact:true}).click();await wait(async()=>!/Pending/.test(await text('#usersTable')));
 await tab('components');await page.getByRole('button',{name:'+ Add component'}).click();await page.locator('#saveCompBtn').click();await wait(async()=>/required|positive/.test(await text('#globalMsg')));
 const vals=[800,1,'MR','2:1','Fictional Demo C','DEMO-NEW','Gearless',7.5,18,320,8,5,11,'25 A',11,'25 A','Demo AVR','Demo UPS','Demo ARD','Demo R1','Demo R2','Demo cable','Demo breaker'];
 for(let i=0;i<vals.length;i++)await page.locator('#ef-'+i).fill(String(vals[i]));await page.locator('#saveCompBtn').click();await wait(async()=>/Component saved/.test(await text('#globalMsg')));
 await tab('dashboard');await wait(async()=>/Usage by feature/.test(await text('#statsArea')));await logout();
 await login('new@example.test','TestPass123');await tab('selection');await page.locator('#sel-capacity').selectOption('630');await page.locator('#searchBtn').click();await page.locator('.chip').first().click();await wait(()=>page.locator('#reportWrap').isVisible());assert.ok(await page.evaluate(()=>Object.keys(COMPONENT_DETAIL_CACHE).length>0));await page.getByRole('button',{name:/Print.*Save/}).click();assert.ok(await page.evaluate(()=>window.__printed.includes('Live')));
 await context.setOffline(true);
 assert.ok(await page.evaluate(()=>apiCall('getComponentDetails',[T(),3]).then(r=>r.categories.length>0)));
 await context.setOffline(false);
 await tab('calculation');await pane('speed');await page.locator('#ss-diameter').fill('240');await page.locator('#ss-rpm').fill('168');await page.getByRole('button',{name:'Calculate speed',exact:true}).click();await wait(async()=>/1.0556/.test(await text('#ssResult')));assert.ok(!/Slip frequency|Rotor slip/.test(await text('#ssResult')));
 await page.screenshot({path:'test-results/desktop-light.png',fullPage:true,animations:'disabled'});
 await page.locator('#ss-type').selectOption('Geared');await page.locator('#ss-diameter').fill('700');await page.locator('#ss-rpm').fill('1465');await page.locator('#ss-gearA').fill('61');await page.locator('#ss-gearB').fill('2');await page.getByRole('button',{name:'Calculate speed',exact:true}).click();await wait(async()=>/1.1667/.test(await text('#ssResult')));
 await pane('travel');await page.locator('#tt-height').fill('5');await page.locator('#tt-speed').fill('.1');await page.locator('#tt-acc').fill('.1');await page.locator('#pane-travel button').click();await wait(async()=>/51 s/.test(await text('#ttResult')));
 await pane('power');await page.locator('#pw-motor').fill('3.9');await page.locator('#pane-power button').click();await wait(async()=>/Total power/.test(await text('#pwResult')));
 for(const [id,v] of [['pw-brake','324'],['pw-tube','4'],['pw-panel','0'],['pw-spot','4'],['pw-fan','2'],['pw-others','500']])await page.locator('#'+id).fill(v);
 await page.locator('#pane-power button').click();await wait(async()=>/8.668/.test(await text('#pwResult')));assert.ok(!/Suggested AVR/.test(await text('#pwResult')));assert.equal(await page.locator('#calcSeg [data-pane="power"]').innerText(),'Total Power');assert.equal(await page.locator('#calcSeg [data-pane="speed"]').innerText(),'Nominal Speed & Slip frequency');
 await pane('motor');await page.locator('#mp-rpm').fill('1465');await page.locator('#mp-torque').fill('192');await page.locator('#pane-motor button').click();await wait(async()=>/29.45/.test(await text('#mpResult')));
 await pane('energy');await page.locator('#en-tariff').fill('12');await page.locator('#energyBtn').click();await wait(async()=>/5.24/.test(await text('#energyResult')));
 await page.locator('#recordNote').fill('Fictional lift acceptance');await page.locator('#saveRecordBtn').click();await wait(async()=>/saved on this device/.test(await text('#globalMsg')));
 const latestDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export latest CSV'}).click();const latest=await latestDownload;await latest.saveAs('test-results/latest.csv');assert.ok(fs.readFileSync('test-results/latest.csv','utf8').includes('Live'));
 await page.locator('#recordsBtn').click();const recordDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export records CSV'}).click();await (await recordDownload).saveAs('test-results/records.csv');await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'Use this result for solar sizing'}).click();await page.locator('#so-motorCurrent').fill('14');await page.locator('#solarBtn').click();await wait(async()=>/Battery modules/.test(await text('#solarResult')));
 await page.locator('#themeBtn').click();await page.screenshot({path:'test-results/desktop-dark.png',fullPage:true,animations:'disabled'});
 await page.setViewportSize({width:390,height:844});await pane('speed');await page.locator('#themeBtn').click();await page.screenshot({path:'test-results/mobile-light.png',fullPage:true,animations:'disabled'});await page.locator('#themeBtn').click();await page.screenshot({path:'test-results/mobile-dark.png',fullPage:true,animations:'disabled'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile horizontal overflow');
 await logout();await login('selection@example.test');assert.equal(await page.locator('#nav button[data-tab="calculation"]').isVisible(),false);
 const denied=await page.evaluate(()=>apiCall('adminDeleteComponent',[T(),3]).then(()=>false).catch(e=>/permission/.test(e.message)));assert.equal(denied,true);await logout();
 // Simulated LIVE transport exercises authenticated offline entry/reconnect without touching real Sheet.
 const ids=new Set();let writes=0,releaseFirstSave;const firstSaveGate=new Promise(resolve=>{releaseFirstSave=resolve;});
 await page.route('https://script.google.com/**',async route=>{const body=route.request().postDataJSON();let result;
  if(body.action==='ping')result={version:1};
  else if(body.action==='login'||body.action==='getSession')result={token:'live-test',email:'live@example.test',name:'Fictional Live Test',role:'Full',isAdmin:false,canCalculate:true,index:[]};
  else if(body.action==='saveEngineeringRecord'){const r=core.record(body.args[1]);ids.add(r.id);writes++;if(writes===1)await firstSaveGate;result={id:r.id,synced:true};}
  else if(body.action==='listEngineeringRecords')result=[];
  else if(body.action==='logAction')result=true;
  else if(/^calculate/.test(body.action))result=core.calculate(body.action,body.args[1]);
  else result={index:[]};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,version:1,result})});
 });
 await login('live@example.test','TestPass123');
 await tab('calculation');await pane('motor');await context.setOffline(true);
 const offlineDenied=await page.evaluate(()=>apiCall('adminDeleteComponent',[T(),3]).then(()=>false).catch(()=>true));assert.equal(offlineDenied,true);
 const offlineLoginDenied=await page.evaluate(()=>apiCall('login',['live@example.test','TestPass123']).then(()=>false).catch(()=>true));assert.equal(offlineLoginDenied,true);
await page.locator('#mp-rpm').fill('1465');await page.locator('#mp-torque').fill('192');await page.locator('#pane-motor button').click();await wait(async()=>/29.45/.test(await text('#mpResult')));await page.locator('#saveRecordBtn').click();await wait(async()=>await page.evaluate(()=>scopedRecords().some(r=>!r.synced)));
 await context.setOffline(false);await wait(()=>Promise.resolve(writes===1));await page.locator('#recordNote').fill('Saved during ongoing sync');await page.locator('#saveRecordBtn').click();await wait(()=>page.evaluate(()=>scopedRecords().length===2));releaseFirstSave();await wait(async()=>await page.evaluate(()=>scopedRecords().length===2&&scopedRecords().every(r=>r.synced)));assert.equal(ids.size,2);assert.equal(writes,2);
 await context.setOffline(true);await page.reload();await wait(()=>page.locator('#app').isVisible());assert.ok(await page.evaluate(()=>SESSION.email==='live@example.test'));await context.setOffline(false);
 assert.equal(calculatorRequests,0,'Local calculators must not wait on API requests');assert.deepEqual(errors,[]);console.log('PASS E2E: WLF branding, local calculations with zero calculator API calls, legacy generator regression, signup/login/approval, component entry+validation, dashboard, report print, all six calculators, CSV exports, roles, 4 real screenshots, offline live entry and automatic sync, scoped offline recovery.');
 fs.writeFileSync('test-results/verification.txt','All browser E2E checks passed. Live API calls were simulated; no real Sheet writes/accounts were used. Native OS print/share and phone behavior require device verification.\n');
})().catch(async err=>{console.error('E2E FAILED:',err.stack);if(page){console.error((await page.locator('body').innerText()).slice(0,4000));await page.screenshot({path:'test-results/failure.png',fullPage:true});}process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
