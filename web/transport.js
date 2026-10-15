var DEFAULT_BACKEND='https://script.google.com/macros/s/AKfycbyRtoeBGHm3KpsOYubWsMZVq_2p4QjOOMvdiVMXIEmL_mDrPiUmt2d5WVTGXHp7NLT5/exec';
function readStore(key,fallback){try{return JSON.parse(localStorage.getItem(key))||fallback;}catch(e){return fallback;}}
function writeStore(key,value){localStorage.setItem(key,JSON.stringify(value));}
var APK_SETTINGS=readStore('lift-settings',{theme:'system',motion:false});
// Production mode and backend are pinned. Ignore legacy demo/custom-URL preferences.
var previousScope=APK_SETTINGS.mode==='demo'?'demo':APK_SETTINGS.backend;
if(previousScope&&previousScope!==DEFAULT_BACKEND)localStorage.removeItem('apk_lcs_token_v1');
APK_SETTINGS.mode='live';APK_SETTINGS.backend=DEFAULT_BACKEND;
writeStore('lift-settings',APK_SETTINGS);
var LAST_CALC=null,SYNC_BUSY=false;
if('serviceWorker' in navigator&&!(window.LiftNative&&LiftNative.isNative))window.addEventListener('load',function(){navigator.serviceWorker.register('./sw.js').catch(function(err){console.warn('Offline interface cache unavailable:',err.message);});});
function modeScope(){return DEFAULT_BACKEND;}
function scopedKey(kind){return 'lift-'+kind+':'+modeScope();}
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
  if(!navigator.onLine){
    var cache=readStore(scopedKey('cache'),{});
    if(action==='getSession'&&cache.session&&cache.session.token===args[0])result=cache.session;
    else if(action==='logAction')return true;
    else if(/^calculate/.test(action)&&SESSION&&LiftCore.can(SESSION.role,action))result=LiftCore.calculate(action,args[1]);
    else if(action==='refreshIndex'&&SESSION&&cache.session&&cache.session.email===SESSION.email)result={index:cache.session.index};
    else if(action==='getComponentDetails'&&SESSION&&LiftCore.can(SESSION.role,action)&&cache.details&&cache.details[args[1]])result=cache.details[args[1]];
    else throw new Error('Offline: login, approvals and component changes need internet. Saved calculations can use the outbox.');
  }else result=await rpc(action,args);
  if(action==='refreshIndex'&&SESSION){var cache=readStore(scopedKey('cache'),{});if(cache.session&&cache.session.email===SESSION.email){cache.session.index=result.index;cache.session.componentDetails=result.componentDetails||{};if(result.componentDetails)cache.details=Object.assign(cache.details||{},result.componentDetails);writeStore(scopedKey('cache'),cache);}}
  if(action==='getComponentDetails'&&APK_SETTINGS.mode==='live'){var cache=readStore(scopedKey('cache'),{});cache.details=cache.details||{};cache.details[args[1]]=result;writeStore(scopedKey('cache'),cache);}
  if(/^calculate/.test(action))LAST_CALC={action:action,inputs:JSON.parse(JSON.stringify(args[1])),result:result};
  return result;
}
var google={script:{get run(){var success=function(){},failure=function(){};var handler={get:function(target,key){if(key==='withSuccessHandler')return function(fn){success=fn;return new Proxy(target,handler);};if(key==='withFailureHandler')return function(fn){failure=fn;return new Proxy(target,handler);};return function(){var args=Array.prototype.slice.call(arguments);Promise.resolve().then(function(){return apiCall(key,args);}).then(success).catch(failure);};}};return new Proxy({},handler);}}};
function cacheSession(session){var cache=readStore(scopedKey('cache'),{});if(cache.session&&cache.session.email!==session.email)cache={};cache.session=session;if(session.componentDetails)cache.details=Object.assign(cache.details||{},session.componentDetails);writeStore(scopedKey('cache'),cache);setTimeout(function(){syncOutbox(true);},0);}
function applyTheme(){var dark=APK_SETTINGS.theme==='dark'||APK_SETTINGS.theme==='system'&&matchMedia('(prefers-color-scheme:dark)').matches;document.documentElement.dataset.theme=dark?'dark':'light';document.body.classList.toggle('motion-on',!!APK_SETTINGS.motion);}
function cycleTheme(){APK_SETTINGS.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';writeStore('lift-settings',APK_SETTINGS);applyTheme();}
function refreshShell(){document.getElementById('modeBadge').textContent='LIVE DATA';document.getElementById('connectionBadge').textContent=navigator.onLine?'Online':'Offline · saved data';applyTheme();}
function openSettings(){document.getElementById('themeSetting').value=APK_SETTINGS.theme;document.getElementById('motionSetting').checked=APK_SETTINGS.motion;document.getElementById('settingsDialog').showModal();}
function applySettings(){
  APK_SETTINGS={mode:'live',backend:DEFAULT_BACKEND,theme:document.getElementById('themeSetting').value,motion:document.getElementById('motionSetting').checked};
  writeStore('lift-settings',APK_SETTINGS);refreshShell();document.getElementById('settingsDialog').close();
}
function allRecords(){return readStore('lift-records',[]);}
function scopedRecords(){return allRecords().filter(function(item){return SESSION&&item.scope===modeScope()&&item.owner===SESSION.email;});}
async function saveLatestRecord(){
  if(!SESSION||!LiftCore.can(SESSION.role,'saveEngineeringRecord')){showMsg('Your account cannot save calculations.','error');return;}
  if(!LAST_CALC){showMsg('Calculate a result first. After changing inputs, calculate again before saving.','info');return;}
  try{var record=LiftCore.record({version:1,id:crypto.randomUUID(),createdAt:new Date().toISOString(),action:LAST_CALC.action,inputs:LAST_CALC.inputs,note:document.getElementById('recordNote').value});
    var items=allRecords();items.push({scope:modeScope(),owner:SESSION.email,record:record,synced:false,status:'Pending sync'});writeStore('lift-records',items);showMsg('Calculation saved on this device. Syncing when connected.','success');if(APK_SETTINGS.mode==='live')await syncOutbox(true);
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
async function exportLatest(){try{if(!LAST_CALC)throw new Error('Calculate a result first.');await exportText('lift-calculation.csv',LiftCore.csv([['Mode','Calculator','Inputs','Results'],['Live',LAST_CALC.action,JSON.stringify(LAST_CALC.inputs),JSON.stringify(LAST_CALC.result)]]));}catch(err){showMsg(err.message,'error');}}
async function exportRecords(){try{var rows=[['Mode','ID','Date','Calculator','Note','Sync','Inputs','Results']];scopedRecords().forEach(function(item){var r=item.record;rows.push(['Live',r.id,r.createdAt,r.action,r.note,item.status,JSON.stringify(r.inputs),JSON.stringify(r.result)]);});await exportText('lift-records.csv',LiftCore.csv(rows));}catch(err){document.getElementById('recordStatus').textContent=err.message;}}
document.addEventListener('DOMContentLoaded',function(){
  refreshShell();matchMedia('(prefers-color-scheme:dark)').addEventListener('change',applyTheme);
  document.getElementById('tab-calculation').addEventListener('input',function(e){if(e.target.id!=='recordNote')LAST_CALC=null;});
  var originalLogout=forceLogout;forceLogout=function(message){var key=scopedKey('cache');localStorage.removeItem(key);LAST_CALC=null;originalLogout(message);
    ['report','matchesList','ttResult','pwResult','ssResult','mpResult','energyResult','solarResult','statsArea','globalMsg','recordsList'].forEach(function(id){var el=document.getElementById(id);if(el)el.innerHTML='';});
    ['reportWrap','matchesCard','editorCard'].forEach(function(id){document.getElementById(id).classList.add('hidden');});
    var tbody=document.querySelector('#usersTable tbody');if(tbody)tbody.innerHTML='';
    document.getElementById('recordNote').value='';compData=null;editingRow=null;
  };
  printReport=async function(){var area=document.getElementById('apkPrintArea');area.innerHTML='<h1>Lift component report</h1><p>'+esc('Live')+'</p>'+document.getElementById('report').innerHTML;document.body.classList.add('printing');try{if(window.LiftNative&&LiftNative.isNative)await LiftNative.print.print();else window.print();}finally{document.body.classList.remove('printing');}};
});
window.addEventListener('online',async function(){
  refreshShell();if(!SESSION)return;
  var token=T();try{var session=await rpc('getSession',[token]);if(!SESSION||T()!==token)return;var active=document.querySelector('#nav button.active'),tab=active&&active.getAttribute('data-tab');startApp(session);if(tab&&((tab==='calculation'&&session.canCalculate)||(['users','components','dashboard'].indexOf(tab)>=0&&session.isAdmin)||['selection','account'].indexOf(tab)>=0))openTab(tab);}
  catch(err){if(/SESSION_EXPIRED/.test(err.message)){if(SESSION&&T()===token)forceLogout('Your session has expired. Connect and log in again; pending entries remain saved.');}else showMsg('Connection restored, but server verification failed. Pending entries remain saved. '+err.message,'info');}
});window.addEventListener('offline',refreshShell);
