var DEFAULT_BACKEND='https://script.google.com/macros/s/AKfycbyRtoeBGHm3KpsOYubWsMZVq_2p4QjOOMvdiVMXIEmL_mDrPiUmt2d5WVTGXHp7NLT5/exec';
function readStore(key,fallback){try{return JSON.parse(localStorage.getItem(key))||fallback;}catch(e){return fallback;}}
function writeStore(key,value){localStorage.setItem(key,JSON.stringify(value));}
var APK_SETTINGS=readStore('lift-settings',{mode:'demo',backend:DEFAULT_BACKEND,theme:'system',motion:false});
var LAST_CALC=null,SYNC_BUSY=false;
if('serviceWorker' in navigator&&!(window.LiftNative&&LiftNative.isNative))window.addEventListener('load',function(){navigator.serviceWorker.register('./sw.js').catch(function(err){console.warn('Offline interface cache unavailable:',err.message);});});
var TOPIC_LIST=['Login','Component Selection','Travel Time Calculation','Power Calculation','Speed & Slip Calculation','Motor Power Justification','Energy Bill Calculation','Solar Sizing Calculation'];
var DEMO_HEADERS=['Capacity (KG)','Speed (m/s)','Usage Type','Roping','Motor brand','Motor Model','Motor Type','Motor Power (KW)','Motor Rated (A)','Traction Sheave Dia (mm)','Rope Dia (mm)','Rope Num','Recommended ARKEL Controller KW','Recommended ARKEL Controller Amp','Recommended NICE3000+ Controller KW','Recommended NICE3000+ Controller Amp','Recommended AVR','UPS for ARKEL','ARD For NICE3000+','Brake Resistor for ARKEL','Brake Resistor for NICE3000+','Main Power Cable (RM)','SDB main breaker'];
function newDemo(){return {users:[['admin@example.test','Demo Admin','Admin'],['full@example.test','Demo Engineer','Full'],['selection@example.test','Demo Technician','Selection']].map(function(u,i){return {row:i+2,email:u[0],name:u[1],role:u[2],status:'Approved',password:'DemoPass123',requestedAt:'Fictional',approvedAt:'Fictional'};}),records:[
{sheetRow:3,values:[630,1,'MR','2:1','Fictional Demo A','DEMO-630','Gearless',5.5,14,320,8,5,7.5,'18 A',7.5,'18 A','20 kVA','1500 VA','32 A','Demo resistor A','Demo resistor B','Demo cable','Demo breaker']},
{sheetRow:4,values:[630,1,'MR','2:1','Fictional Demo B','DEMO-GEAR','Geared',7.5,18,700,10,4,11,'25 A',11,'25 A','25 kVA','1500 VA','32 A','Demo resistor A','Demo resistor B','Demo cable','Demo breaker']},
{sheetRow:5,values:[450,1,'MRL','2:1','Fictional Demo A','DEMO-450','Gearless',3.9,10,240,8,4,5.5,'14 A',5.5,'14 A','15 kVA','1500 VA','32 A','Demo resistor A','Demo resistor B','Demo cable','Demo breaker']}],logs:[]};}
var DEMO_DB=readStore('lift-fictional-demo',newDemo());
function demoSave(){writeStore('lift-fictional-demo',DEMO_DB);}
function modeScope(){return APK_SETTINGS.mode==='demo'?'demo':APK_SETTINGS.backend;}
function scopedKey(kind){return 'lift-'+kind+':'+modeScope();}
function demoIndex(){return DEMO_DB.records.map(function(r){var v=r.values;return {r:r.sheetRow,c:Number(v[0]),s:Number(v[1]),u:String(v[2]),p:String(v[3]),b:String(v[4]),m:String(v[5]),t:String(v[6])};});}
function demoSession(user){return {token:'fictional:'+user.email,email:user.email,name:user.name,role:user.role,isAdmin:user.role==='Admin',canCalculate:LiftCore.can(user.role,'calculateSpeedSlip'),pendingCount:DEMO_DB.users.filter(function(u){return u.status==='Pending';}).length,index:demoIndex()};}
function demoCall(action,args){
  if(action==='ping')return {version:1,name:'FICTIONAL DEMO'};
  if(action==='register'){
    var clean=LiftCore.registration(args[0],args[1],args[2]),name=clean.name,email=clean.email,password=clean.password;
    if(DEMO_DB.users.some(function(u){return u.email===email;}))throw new Error('This demo email already exists.');
    DEMO_DB.users.push({row:Math.max.apply(null,DEMO_DB.users.map(function(u){return u.row;}))+1,email:email,name:name,password:password,role:'Selection',status:'Pending',requestedAt:'Fictional',approvedAt:''});demoSave();return 'FICTIONAL demo request created. Demo Admin can approve it. No email was sent.';
  }
  if(action==='login'){
    var u=DEMO_DB.users.find(function(u){return u.email===String(args[0]).trim().toLowerCase()&&u.password===args[1];});
    if(!u)throw new Error('Incorrect demo email or password.');if(u.status!=='Approved')throw new Error('Your demo access request is not approved.');return demoSession(u);
  }
  var email=String(args[0]||'').replace(/^fictional:/,''),actor=DEMO_DB.users.find(function(u){return u.email===email&&u.status==='Approved';});
  if(!actor)throw new Error('SESSION_EXPIRED');if(!LiftCore.can(actor.role,action))throw new Error('You do not have permission to do this.');
  if(/^calculate/.test(action))return LiftCore.calculate(action,args[1]);
  if(action==='getSession')return demoSession(actor);
  if(action==='refreshIndex')return {index:demoIndex()};
  if(action==='getComponentDetails'){
    var rec=DEMO_DB.records.find(function(r){return r.sheetRow===Number(args[1]);});if(!rec)throw new Error('Demo component not found.');
    var norm=function(v){return String(v).toLowerCase().replace(/[^a-z0-9]/g,'');};var map={};DEMO_HEADERS.forEach(function(h,i){map[norm(h)]=rec.values[i];});
    return {inputs:{capacity:rec.values[0],speed:rec.values[1],usageType:rec.values[2],roping:rec.values[3]},categories:LiftCore.categories.map(function(c){return {title:c.title,items:c.fields.map(function(f){return {label:f[1],value:String(map[norm(f[0])]||'-')};})};})};
  }
  if(action==='changePassword'){if(actor.password!==args[1])throw new Error('Current password is incorrect.');if(String(args[2]).length<8)throw new Error('Use at least 8 characters.');actor.password=args[2];demoSave();return 'Demo password changed.';}
  if(action==='adminListUsers')return DEMO_DB.users.map(function(u){var v=Object.assign({},u);delete v.password;return v;});
  if(action==='adminUpdateUser'){
    var target=DEMO_DB.users.find(function(u){return u.row===Number(args[1]);});if(!target)throw new Error('Demo user not found.');
    if(target.email===actor.email&&(args[2]&&args[2]!=='Admin'||args[3]&&args[3]!=='Approved'))throw new Error('You cannot revoke your own admin access.');
    if(args[2]){if(['Admin','Full','Selection'].indexOf(args[2])<0)throw new Error('Invalid role.');target.role=args[2];}if(args[3]){if(['Approved','Pending','Rejected'].indexOf(args[3])<0)throw new Error('Invalid status.');target.status=args[3];}demoSave();return true;
  }
  if(action==='adminResetPassword'){var target=DEMO_DB.users.find(function(u){return u.row===Number(args[1]);});if(!target)throw new Error('Demo user not found.');target.password='DemoPass123';demoSave();return {email:target.email,tempPassword:'DemoPass123'};}
  if(action==='adminGetComponents')return {headers:DEMO_HEADERS,records:DEMO_DB.records};
  if(action==='adminSaveComponent'){var values=LiftCore.component(args[2],DEMO_HEADERS.length);if(args[1]==null){DEMO_DB.records.push({sheetRow:Math.max.apply(null,DEMO_DB.records.map(function(r){return r.sheetRow;}))+1,values:values});}else{var row=DEMO_DB.records.find(function(r){return r.sheetRow===Number(args[1]);});if(!row)throw new Error('Demo row not found.');row.values=values;}demoSave();return true;}
  if(action==='adminDeleteComponent'){DEMO_DB.records=DEMO_DB.records.filter(function(r){return r.sheetRow!==Number(args[1]);});demoSave();return true;}
  if(action==='logAction'){DEMO_DB.logs.push({email:actor.email,action:args[1]});demoSave();return true;}
  if(action==='adminStats'){var rows=DEMO_DB.users.map(function(u){var counts=TOPIC_LIST.map(function(t){return DEMO_DB.logs.filter(function(l){return l.email===u.email&&l.action===t;}).length;});return {name:u.name,email:u.email,role:u.role,counts:counts,total:counts.reduce(function(a,b){return a+b;},0),lastActive:'Fictional'};});return {topics:TOPIC_LIST,rows:rows,totals:TOPIC_LIST.map(function(t,i){return rows.reduce(function(n,r){return n+r.counts[i];},0);}),totalEvents:DEMO_DB.logs.length};}
  throw new Error('Unsupported demo action.');
}
async function rpc(action,args){
  if(!LiftCore.allowed(action))throw new Error('Unsupported API action.');
  if(!LiftCore.backendURL(APK_SETTINGS.backend))throw new Error('Configure your trusted Apps Script /exec URL in Settings.');
  if(!navigator.onLine)throw new Error('Offline: reconnect to use this live action.');
  var body={version:1,action:action,args:args},payload;
  if(window.LiftNative&&LiftNative.isNative){var reply=await LiftNative.http.post({url:APK_SETTINGS.backend,headers:{'Content-Type':'text/plain'},data:JSON.stringify(body),responseType:'text',connectTimeout:20000,readTimeout:30000});payload=reply.data;}
  else{var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},30000);try{var reply=await fetch(APK_SETTINGS.backend,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(body),credentials:'omit',redirect:'follow',signal:controller.signal});payload=await reply.text();}catch(err){throw new Error('Backend connection failed. Check the API deployment and connection. On PC you can keep using the existing Apps Script web app. '+err.message);}finally{clearTimeout(timer);}}
  var data;try{data=typeof payload==='string'?JSON.parse(payload):payload;}catch(err){throw new Error('Backend returned a webpage instead of API JSON. Install/deploy ApiAdapter.gs in the same project and verify Execute as Me / intended Anyone access.');}
  if(!data||data.version!==1)throw new Error('Backend API version mismatch. Deploy the APK backend files first.');if(!data.ok)throw new Error(data.error||'Backend rejected the request.');return data.result;
}
async function apiCall(action,args){
  var result;
  if(APK_SETTINGS.mode==='demo')result=demoCall(action,args);
  else if(!navigator.onLine){
    var cache=readStore(scopedKey('cache'),{});
    if(action==='getSession'&&cache.session&&cache.session.token===args[0])result=cache.session;
    else if(action==='logAction')return true;
    else if(/^calculate/.test(action)&&SESSION&&LiftCore.can(SESSION.role,action))result=LiftCore.calculate(action,args[1]);
    else if(action==='refreshIndex'&&cache.session)result={index:cache.session.index};
    else if(action==='getComponentDetails'&&cache.details&&cache.details[args[1]])result=cache.details[args[1]];
    else throw new Error('Offline: login, approvals and component changes need internet. Saved calculations can use the outbox.');
  }else result=await rpc(action,args);
  if(action==='getComponentDetails'&&APK_SETTINGS.mode==='live'){var cache=readStore(scopedKey('cache'),{});cache.details=cache.details||{};cache.details[args[1]]=result;writeStore(scopedKey('cache'),cache);}
  if(/^calculate/.test(action))LAST_CALC={action:action,inputs:JSON.parse(JSON.stringify(args[1])),result:result};
  return result;
}
var google={script:{get run(){var success=function(){},failure=function(){};var handler={get:function(target,key){if(key==='withSuccessHandler')return function(fn){success=fn;return new Proxy(target,handler);};if(key==='withFailureHandler')return function(fn){failure=fn;return new Proxy(target,handler);};return function(){var args=Array.prototype.slice.call(arguments);Promise.resolve().then(function(){return apiCall(key,args);}).then(success).catch(failure);};}};return new Proxy({},handler);}}};
function cacheSession(session){var cache=readStore(scopedKey('cache'),{});cache.session=session;writeStore(scopedKey('cache'),cache);setTimeout(function(){syncOutbox(true);},0);}
function applyTheme(){var dark=APK_SETTINGS.theme==='dark'||APK_SETTINGS.theme==='system'&&matchMedia('(prefers-color-scheme:dark)').matches;document.documentElement.dataset.theme=dark?'dark':'light';document.body.classList.toggle('motion-on',!!APK_SETTINGS.motion);}
function cycleTheme(){APK_SETTINGS.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';writeStore('lift-settings',APK_SETTINGS);applyTheme();}
function refreshShell(){document.getElementById('modeBadge').textContent=APK_SETTINGS.mode==='demo'?'FICTIONAL DEMO':'LIVE DATA';document.getElementById('connectionBadge').textContent=navigator.onLine?'Online':'Offline';applyTheme();}
function openSettings(){document.getElementById('settingMode').value=APK_SETTINGS.mode;document.getElementById('backendUrl').value=APK_SETTINGS.backend;document.getElementById('themeSetting').value=APK_SETTINGS.theme;document.getElementById('motionSetting').checked=APK_SETTINGS.motion;document.getElementById('settingsStatus').textContent='';document.getElementById('settingsDialog').showModal();}
async function applySettings(){
  var mode=document.getElementById('settingMode').value,url=document.getElementById('backendUrl').value.trim();
  if(!LiftCore.backendURL(url)){document.getElementById('settingsStatus').textContent='Use an https://script.google.com/macros/s/.../exec URL.';return;}
  var changed=mode!==APK_SETTINGS.mode||url!==APK_SETTINGS.backend;
  APK_SETTINGS={mode:mode,backend:url,theme:document.getElementById('themeSetting').value,motion:document.getElementById('motionSetting').checked};writeStore('lift-settings',APK_SETTINGS);refreshShell();
  document.getElementById('demoHint').hidden=mode!=='demo';
  if(changed){forceLogout('Data mode/backend changed. Log in to the selected mode.');LAST_CALC=null;}
  document.getElementById('settingsDialog').close();
  if(mode==='live'&&navigator.onLine)try{await rpc('ping',[]);showMsg('Live API connected. Use your existing account.', 'success');}catch(err){showMsg(err.message,'error',true);}
}
function allRecords(){return readStore('lift-records',[]);}
function scopedRecords(){return allRecords().filter(function(item){return SESSION&&item.scope===modeScope()&&item.owner===SESSION.email;});}
async function saveLatestRecord(){
  if(!SESSION||!LiftCore.can(SESSION.role,'saveEngineeringRecord')){showMsg('Your account cannot save calculations.','error');return;}
  if(!LAST_CALC){showMsg('Calculate a result first. After changing inputs, calculate again before saving.','info');return;}
  try{var record=LiftCore.record({version:1,id:crypto.randomUUID(),createdAt:new Date().toISOString(),action:LAST_CALC.action,inputs:LAST_CALC.inputs,note:document.getElementById('recordNote').value});
    var items=allRecords();items.push({scope:modeScope(),owner:SESSION.email,record:record,synced:APK_SETTINGS.mode==='demo',status:APK_SETTINGS.mode==='demo'?'Fictional local record':'Pending sync'});writeStore('lift-records',items);showMsg(APK_SETTINGS.mode==='demo'?'Fictional calculation saved locally.':'Calculation saved on this device. Syncing when connected.','success');if(APK_SETTINGS.mode==='live')await syncOutbox(true);
  }catch(err){showMsg(err.message,'error');}
}
async function syncOutbox(quiet){
  if(SYNC_BUSY||APK_SETTINGS.mode!=='live'||!navigator.onLine||!SESSION)return;
  var scope=modeScope(),owner=SESSION.email,token=T();
  SYNC_BUSY=true;try{while(navigator.onLine&&SESSION&&SESSION.email===owner&&modeScope()===scope){
    var pending=allRecords().find(function(item){return !item.synced&&item.scope===scope&&item.owner===owner;});if(!pending)break;
    var error=null;try{await rpc('saveEngineeringRecord',[token,pending.record]);}catch(err){error=err.message;}
    // Re-read after the request so entries saved while syncing cannot be overwritten.
    var items=allRecords(),item=items.find(function(item){return item.scope===scope&&item.owner===owner&&item.record.id===pending.record.id;});
    if(item){if(error){item.error=error;item.status='Pending: '+error;}else{item.synced=true;item.status='Synced';delete item.error;}writeStore('lift-records',items);}
    if(error){if(!quiet)document.getElementById('recordStatus').textContent='Pending: '+error;break;}
  }renderRecords();}finally{SYNC_BUSY=false;}
}
function renderRecords(){var items=scopedRecords();document.getElementById('recordStatus').textContent=items.length+' record(s); '+items.filter(function(x){return !x.synced;}).length+' pending. Records are scoped to the current account/backend.';document.getElementById('recordsList').innerHTML=items.slice().reverse().map(function(item){return '<article class="record-item"><b>'+esc(item.record.action.replace(/^calculate/,''))+'</b><p>'+esc(item.record.note||'No note')+'</p><small>'+esc(item.record.createdAt)+' · '+esc(item.status||'Synced')+'</small>'+(item.error?'<p class="msg error">'+esc(item.error)+'</p>':'')+'</article>';}).join('')||'<p>No records saved yet.</p>';}
async function openRecords(){document.getElementById('recordsDialog').showModal();renderRecords();if(APK_SETTINGS.mode==='live'&&navigator.onLine&&SESSION){try{var remote=await rpc('listEngineeringRecords',[T()]),items=allRecords();for(var row of remote)if(!items.some(function(x){return x.scope===modeScope()&&x.owner===SESSION.email&&x.record.id===row.record.id;}))items.push({scope:modeScope(),owner:SESSION.email,record:row.record,synced:true,status:'Synced'});writeStore('lift-records',items);renderRecords();}catch(err){document.getElementById('recordStatus').textContent=err.message;}}}
async function exportText(name,text){if(window.LiftNative&&LiftNative.isNative){await LiftNative.shareFile(name,text);return;}var url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);}
async function exportLatest(){try{if(!LAST_CALC)throw new Error('Calculate a result first.');await exportText('lift-calculation.csv',LiftCore.csv([['Mode','Calculator','Inputs','Results'],[APK_SETTINGS.mode==='demo'?'FICTIONAL DEMO':'Live',LAST_CALC.action,JSON.stringify(LAST_CALC.inputs),JSON.stringify(LAST_CALC.result)]]));}catch(err){showMsg(err.message,'error');}}
async function exportRecords(){try{var rows=[['Mode','ID','Date','Calculator','Note','Sync','Inputs','Results']];scopedRecords().forEach(function(item){var r=item.record;rows.push([APK_SETTINGS.mode==='demo'?'FICTIONAL DEMO':'Live',r.id,r.createdAt,r.action,r.note,item.status,JSON.stringify(r.inputs),JSON.stringify(r.result)]);});await exportText('lift-records.csv',LiftCore.csv(rows));}catch(err){document.getElementById('recordStatus').textContent=err.message;}}
document.addEventListener('DOMContentLoaded',function(){
  refreshShell();matchMedia('(prefers-color-scheme:dark)').addEventListener('change',applyTheme);
  var hint=document.createElement('p');hint.className='note';hint.id='demoHint';hint.textContent='FICTIONAL DEMO: admin@example.test / full@example.test / selection@example.test — password DemoPass123. Change Settings to connect real data.';document.getElementById('loginForm').appendChild(hint);
  if(APK_SETTINGS.mode!=='demo')hint.hidden=true;
  document.getElementById('tab-calculation').addEventListener('input',function(e){if(e.target.id!=='recordNote')LAST_CALC=null;});
  var originalLogout=forceLogout;forceLogout=function(message){var key=scopedKey('cache');localStorage.removeItem(key);LAST_CALC=null;originalLogout(message);
    ['report','matchesList','ttResult','pwResult','ssResult','mpResult','energyResult','solarResult','statsArea','globalMsg','recordsList'].forEach(function(id){var el=document.getElementById(id);if(el)el.innerHTML='';});
    ['reportWrap','matchesCard','editorCard'].forEach(function(id){document.getElementById(id).classList.add('hidden');});
    var tbody=document.querySelector('#usersTable tbody');if(tbody)tbody.innerHTML='';
    document.getElementById('recordNote').value='';compData=null;editingRow=null;
  };
  printReport=async function(){var area=document.getElementById('apkPrintArea');area.innerHTML='<h1>Lift component report</h1><p>'+esc(APK_SETTINGS.mode==='demo'?'FICTIONAL DEMO':'Live')+'</p>'+document.getElementById('report').innerHTML;document.body.classList.add('printing');try{if(window.LiftNative&&LiftNative.isNative)await LiftNative.print.print();else window.print();}finally{document.body.classList.remove('printing');}};
});
window.addEventListener('online',function(){refreshShell();syncOutbox(true);});window.addEventListener('offline',refreshShell);
