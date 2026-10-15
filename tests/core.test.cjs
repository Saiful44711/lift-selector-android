const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../shared/logic.js');
test('shared module is identical in backend/browser',()=>{assert.equal(fs.readFileSync('shared/logic.js','utf8'),fs.readFileSync('backend/Shared.gs','utf8'));assert.equal(fs.readFileSync('shared/logic.js','utf8'),fs.readFileSync('dist/logic.js','utf8'));});
test('gearless has no slip and uses mm',()=>{const r=core.calculate('calculateSpeedSlip',{motorType:'Gearless',diameter:240,ratedRpm:168,roping:2});assert.equal(r.carSpeed,1.0556);assert.equal(r.slipFrequency,null);});
test('geared frequency and roping are correct',()=>{const r=core.calculate('calculateSpeedSlip',{motorType:'Geared',diameter:700,ratedRpm:1750,roping:2,gearA:61,gearB:2,frequency:60,poles:4});assert.equal(r.syncRpm,1800);assert.equal(r.slipFrequency,1.6667);});
test('permission boundaries',()=>{assert.ok(!core.can('Selection','adminDeleteComponent'));assert.ok(!core.can('Full','adminUpdateUser'));assert.ok(!core.can('Selection','saveEngineeringRecord'));assert.ok(core.can('Admin','adminGetComponents'));assert.ok(!core.allowed('setupAdmin'));});
test('registration validation and component shape',()=>{assert.throws(()=>core.registration('','bad','short'));assert.equal(core.registration('Team',' X@example.test ','12345678').email,'x@example.test');assert.throws(()=>core.component([0,1,'MR','2:1'],4));assert.equal(core.scalar('=IMPORTXML(1)'),"'=IMPORTXML(1)");});
test('record recomputes untrusted client results',()=>{const r=core.record({version:1,id:'test-record-1234',action:'calculateMotorPower',inputs:{ratedRpm:1465,torque:192},result:{motorPowerKW:999},createdAt:new Date().toISOString()});assert.equal(r.result.motorPowerKW,29.45);});
test('CSV injection and backend URL checks',()=>{assert.ok(core.csv([['=1+1']]).includes("'=1+1"));assert.ok(!core.backendURL('http://evil.test'));assert.ok(core.backendURL('https://script.google.com/macros/s/demo/exec'));});
test('server adapter rejects unauthorized endpoint and role before mutation',()=>{let called=false;const c={LiftCore:core,ContentService:{MimeType:{JSON:'json'},createTextOutput(s){return {value:JSON.parse(s),setMimeType(){return this}}}},authUser_(){return {email:'s@example.test',role:'Selection'}}};vm.createContext(c);vm.runInContext(fs.readFileSync('backend/ApiAdapter.gs','utf8'),c);let reply=c.doPost({postData:{contents:JSON.stringify({version:1,action:'adminDeleteComponent',args:['token',3]})}});assert.equal(reply.value.ok,false);assert.match(reply.value.error,/permission/);reply=c.doPost({postData:{contents:JSON.stringify({version:1,action:'setupAdmin',args:[]})}});assert.equal(reply.value.ok,false);});
test('server outbox retries are idempotent and another account cannot reuse an ID',()=>{
 const rows=[['ID','OwnerEmail','Action','RecordJSON','SavedAt']];let email='first@example.test',released=0;
 const sheet={getDataRange(){return {getValues(){return rows;}}},appendRow(row){rows.push(row);}};
 const c={LiftCore:core,authUser_(){return {email,role:'Full'};},SS_(){return {getSheetByName(){return sheet;}}},LockService:{getScriptLock(){return {waitLock(){},releaseLock(){released++;}}}}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('backend/ApiAdapter.gs','utf8'),c);
 const record={version:1,id:'durable-record-1234',action:'calculateMotorPower',inputs:{ratedRpm:1465,torque:192},createdAt:new Date().toISOString()};
 assert.equal(c.saveEngineeringRecord('token',record).synced,true);assert.equal(c.saveEngineeringRecord('token',record).duplicate,true);assert.equal(rows.length,2);
 email='second@example.test';assert.throws(()=>c.saveEngineeringRecord('token',record),/another account/);assert.equal(c.listEngineeringRecords('token').length,0);assert.equal(released,3);
});
test('Total Power retains the existing generator formula and values',()=>{
 const r=core.calculate('calculatePowerAndAVR',{motorPowerKW:3.9,k2:.95,k3:.95,brakePowerBothW:324,tubeLightQty:4,panelLightQty:0,spotLightQty:4,crossFlowFanQty:2,othersFixedW:500});
 assert.equal(r.totalPowerKW,4.6228);assert.equal(r.suggestGeneratorKVA,8.668);assert.equal(r.suggestAVRKVA,11.557);
});
test('component bootstrap exposes only existing public report fields and bounds payload',()=>{
 const c={LiftCore:core};vm.createContext(c);vm.runInContext(fs.readFileSync('backend/Code.gs','utf8'),c);
 const headers=['Capacity (KG)','Speed (m/s)','Usage Type','Roping','Motor brand','Motor Model','Motor Type','InternalCost'];
 const record={sheetRow:3,values:[630,1,'MR','2:1','Fictional','DEMO','Gearless','SECRET_INTERNAL_COST']};
 c.readComponents_=()=>({headers,records:[record]});const snapshot=c.getSelectionDetails_();assert.equal(snapshot[3].inputs.capacity,630);assert.equal(JSON.stringify(snapshot).includes('SECRET_INTERNAL_COST'),false);
 assert.deepEqual(JSON.parse(JSON.stringify(snapshot[3])),JSON.parse(JSON.stringify(c.componentDetailsFromRecord_(headers,record))));
 c.readComponents_=()=>({headers,records:Array.from({length:1000},(_,i)=>({...record,sheetRow:i+3}))});assert.equal(Object.keys(c.getSelectionDetails_()).length,0);
});
