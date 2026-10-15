const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const core=require('../shared/logic.js'),fixture=require('./demo-fixture.cjs')(core);
let calcCalls=0,detailCalls=0,browser,page;const errors=[];
const bridge=`<script>
function fakeRunner(){
 var success=function(){},failure=function(){},runner;
 runner=new Proxy({}, {get:function(target,key){
  if(key==='withSuccessHandler')return function(fn){success=fn;return runner;};
  if(key==='withFailureHandler')return function(fn){failure=fn;return runner;};
  return function(){var args=Array.from(arguments);fetch('/rpc',{method:'POST',body:JSON.stringify({action:key,args:args})}).then(function(r){return r.json();}).then(function(r){if(!r.ok)throw Error(r.error);return r.result;}).then(success).catch(failure);};
 }});return runner;
}
var google={script:{get run(){return fakeRunner();}}};
window.print=function(){window.__printChecked=true;};
</script>`;
const source=fs.readFileSync('backend/Index.html','utf8').replace(/<\?!= include\('([^']+)'\); \?>/g,(_,name)=>fs.readFileSync('backend/'+name+'.html','utf8')).replace('</head>',bridge+'</head>');
const server=http.createServer((req,res)=>{if(req.url==='/rpc'){let body='';req.on('data',b=>body+=b);req.on('end',()=>{try{const {action,args}=JSON.parse(body);if(/^calculate/.test(action))calcCalls++;if(action==='getComponentDetails')detailCalls++;const result=fixture(action,args);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,result}));}catch(e){res.end(JSON.stringify({ok:false,error:e.message}));}});return;}res.setHeader('Content-Type','text/html');res.end(source);});
async function wait(fn){for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('Expected Apps Script UI state missing');}
async function tab(name){if(page.viewportSize().width<1000)await page.locator('.menu-btn').click();await page.locator('#nav [data-tab="'+name+'"]').click();}
async function pane(name){await page.locator('#calcSeg [data-pane="'+name+'"]').click();}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await wait(()=>page.locator('#authScreen').isVisible());await wait(()=>page.locator('.login-brand img').evaluate(i=>i.complete&&i.naturalWidth>0));
 await page.screenshot({path:'test-results/web-login-desktop.png',fullPage:true});
 await page.locator('#loginEmail').fill('full@example.test');await page.locator('#loginPassword').fill('DemoPass123');await page.locator('#loginBtn').click();await wait(()=>page.locator('#app').isVisible());
 await page.locator('#sel-capacity').selectOption('630');await page.locator('#searchBtn').click();await page.locator('.chip').first().click();await wait(()=>page.locator('#reportWrap').isVisible());assert.equal(detailCalls,0,'Bootstrap snapshot must avoid a component-detail round trip');assert.ok(await page.locator('.report-company-logo').evaluate(i=>i.complete&&i.naturalWidth>0));
 await tab('calculation');await pane('power');for(const [id,v] of [['pw-motor','3.9'],['pw-brake','324'],['pw-tube','4'],['pw-spot','4'],['pw-fan','2']])await page.locator('#'+id).fill(v);await page.locator('#pane-power button').click();await wait(async()=>/8.668/.test(await page.locator('#pwResult').innerText()));assert.ok(!/Suggested AVR/.test(await page.locator('#pwResult').innerText()));
 await pane('speed');await page.locator('#ss-diameter').fill('240');await page.locator('#ss-rpm').fill('168');await page.locator('#pane-speed button').click();await wait(async()=>/1.0556/.test(await page.locator('#ssResult').innerText()));assert.ok(/Lift Nominal Car Speed/.test(await page.locator('#ssResult').innerText()));
 await pane('travel');await page.locator('#tt-height').fill('15');await page.locator('#tt-speed').fill('1');await page.locator('#tt-acc').fill('.5');await page.locator('#pane-travel button').click();await wait(async()=>/17 s/.test(await page.locator('#ttResult').innerText()));
 await pane('motor');await page.locator('#mp-rpm').fill('168');await page.locator('#mp-torque').fill('312.65');await page.locator('#pane-motor button').click();await wait(async()=>/5.5/.test(await page.locator('#mpResult').innerText()));
 await pane('energy');await page.locator('#en-tariff').fill('12');await page.locator('#energyBtn').click();await wait(async()=>/5.24/.test(await page.locator('#energyResult').innerText()));
 await pane('solar');await page.locator('#so-motorCurrent').fill('14');await page.locator('#solarBtn').click();await wait(async()=>/Battery modules/.test(await page.locator('#solarResult').innerText()));assert.equal(calcCalls,0);
 await page.evaluate(()=>logout());await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/web-login-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 console.log('PASS Apps Script rendered UI: company logo, all six local calculators, generator unchanged, AVR hidden, cached component report, mobile layout. Actual Apps Script hosting/deployment not simulated.');
})().catch(async err=>{console.error(err);console.error('PAGE ERRORS',errors);if(page){console.error((await page.locator('body').innerText()).slice(0,2500));await page.screenshot({path:'test-results/web-failure.png',fullPage:true});}process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
