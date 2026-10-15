// Add this file to the SAME bound Apps Script project. Existing HtmlService UI stays available.
function apiJson_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function doPost(e) {
  try {
    var body = e && e.postData && e.postData.contents;
    if (!body || body.length > 65000) throw new Error('Invalid or oversized API request.');
    var request = JSON.parse(body);
    if (request.version !== 1 || !LiftCore.allowed(request.action) || !Array.isArray(request.args) || request.args.length > 5) throw new Error('Unsupported API action/version.');
    var action = request.action, args = request.args;
    if (['login','register','ping'].indexOf(action) < 0) {
      var actor = authUser_(args[0]);
      if (!LiftCore.can(actor.role, action)) throw new Error('You do not have permission to do this.');
    }
    var actions = {
      ping: function(){return {version:1,name:'Lift Selector API'};},
      login:login,register:register,getSession:getSession,refreshIndex:refreshIndex,getComponentDetails:getComponentDetails,
      changePassword:changePassword,logAction:logAction,adminListUsers:adminListUsers,adminUpdateUser:adminUpdateUser,
      adminResetPassword:adminResetPassword,adminGetComponents:adminGetComponents,adminSaveComponent:adminSaveComponent,
      adminDeleteComponent:adminDeleteComponent,adminStats:adminStats,calculateSpeedSlip:calculateSpeedSlip,
      calculateTravelTime:calculateTravelTime,calculatePowerAndAVR:calculatePowerAndAVR,calculateMotorPower:calculateMotorPower,
      calculateEnergyBill:calculateEnergyBill,calculateSolarSizing:calculateSolarSizing,
      saveEngineeringRecord:saveEngineeringRecord,listEngineeringRecords:listEngineeringRecords
    };
    return apiJson_({ok:true,version:1,result:actions[action].apply(null,args)});
  } catch (err) { return apiJson_({ok:false,version:1,error:String(err.message || err).slice(0,500)}); }
}
function engineeringSheet_() {
  var sh=SS_().getSheetByName('EngineeringRecords');
  if(!sh){sh=SS_().insertSheet('EngineeringRecords');sh.appendRow(['ID','OwnerEmail','Action','RecordJSON','SavedAt']);sh.setFrozenRows(1);}
  return sh;
}
function saveEngineeringRecord(token, data) {
  var actor=authUser_(token,LiftCore.roles('calculate'));
  var clean=LiftCore.record(data); // Server recomputes results; client result/owner are never trusted.
  var lock=LockService.getScriptLock();lock.waitLock(15000);
  try {
    var sh=engineeringSheet_(),rows=sh.getDataRange().getValues();
    for(var i=1;i<rows.length;i++)if(String(rows[i][0])===clean.id){
      if(String(rows[i][1])!==actor.email)throw new Error('Record ID belongs to another account.');
      return {id:clean.id,synced:true,duplicate:true};
    }
    sh.appendRow([clean.id,actor.email,clean.action,JSON.stringify(clean),new Date()]);
    return {id:clean.id,synced:true};
  } finally {lock.releaseLock();}
}
function listEngineeringRecords(token) {
  var actor=authUser_(token,LiftCore.roles('calculate'));
  var sh=SS_().getSheetByName('EngineeringRecords');if(!sh)return [];
  return sh.getDataRange().getValues().slice(1).filter(function(row){return String(row[1])===actor.email;})
    .map(function(row){try{return {record:JSON.parse(row[3]),synced:true,owner:actor.email};}catch(e){return null;}}).filter(Boolean);
}
