/*************************************************************
 * LIFT COMPONENT SELECTOR - Backend (Google Apps Script) v4
 * Design and develop by Md. Saiful Islam - Lift Electrical R&I
 *
 * HOW LOGIN WORKS:
 *  - The web app runs as the OWNER ("Execute as: Me"), so users do NOT
 *    need access to your Google Sheet and do NOT need a Google account.
 *  - Users register with name + email + password. The admin gets an
 *    email and approves them (and picks their role) in User Management.
 *  - Passwords are never stored in plain text (salted + keyed hash).
 *
 * ROLES
 *  Admin     -> everything, including editing data and managing users
 *  Full      -> Component Selection + Calculations
 *  Selection -> Component Selection only
 *
 * SPEED: sheet data and the user list are cached for a short time, and the
 * Component Selection dropdowns are filtered inside the browser, so most
 * clicks no longer wait for Google Sheets.
 *
 * FIRST-TIME SETUP: run setupAdmin() once (already done if you can log in).
 *************************************************************/

// ====== SETTINGS ======
// Must match your Sheet tab name EXACTLY (capital letters, spaces).
const COMPONENTS_SHEET_NAME = 'Components Selection';

const USERS_SHEET_NAME = 'Users';
const LOGS_SHEET_NAME = 'UsageLogs';
const TOKEN_LIFETIME_HOURS = 12;
const MAX_FAILED_LOGINS = 5;

const ROLE_ADMIN = 'Admin';
const ROLE_FULL = 'Full';
const ROLE_SELECTION = 'Selection';

const USER_HEADERS = ['Email', 'Name', 'Role', 'Status', 'Salt', 'PasswordHash', 'RequestedAt', 'ApprovedAt'];
const COL = { EMAIL: 1, NAME: 2, ROLE: 3, STATUS: 4, SALT: 5, HASH: 6, REQUESTED: 7, APPROVED: 8 };

const TOPICS = ['Login', 'Component Selection', 'Travel Time Calculation', 'Power Calculation',
  'Speed & Slip Calculation', 'Motor Power Justification', 'Energy Bill Calculation', 'Solar Sizing Calculation'];
const CALC_TOPICS = ['Travel Time Calculation', 'Power Calculation', 'Speed & Slip Calculation', 'Motor Power Justification', 'Energy Bill Calculation', 'Solar Sizing Calculation'];

const CACHE_COMPONENTS = 'cmp_v3';
const CACHE_USERS = 'usr_v3';

// How the 4 result tables are built. First item = exact column header in your
// Components sheet, second item = label shown in the app.
const CATEGORIES = [
  {
    title: '1. Selected Motor Data',
    fields: [
      ['Motor brand', 'Motor Brand'],
      ['Motor Model', 'Motor Model'],
      ['Motor Type', 'Motor Type'],
      ['Motor Power (KW)', 'Motor Power (kW)'],
      ['Motor Rated (A)', 'Motor Rated Current (A)'],
      ['Traction Sheave Dia (mm)', 'Traction Sheave Diameter (mm)'],
      ['Speed (m/s)', 'Speed (m/s)'],
      ['Rope Dia (mm)', 'Rope Diameter (mm)'],
      ['Rope Num', 'Rope Number'],
      ['Usage Type', 'Usage Type']
    ]
  },
  {
    title: '2. Recommended ARKEL Control System',
    fields: [
      ['Recommended ARKEL Controller KW', 'Controller Power (kW)'],
      ['Recommended ARKEL Controller Amp', 'Controller Current (A)'],
      ['Brake Resistor for ARKEL', 'Brake Resistor'],
      ['UPS for ARKEL', 'UPS']
    ]
  },
  {
    title: '3. Recommended NICE3000+ Control System',
    fields: [
      ['Recommended NICE3000+ Controller KW', 'Controller Power (kW)'],
      ['Recommended NICE3000+ Controller Amp', 'Controller Current (A)'],
      ['Brake Resistor for NICE3000+', 'Brake Resistor'],
      ['ARD For NICE3000+', 'ARD']
    ]
  },
  {
    title: '4. Power Supply Recommendation',
    fields: [
      ['Recommended AVR', 'Recommended AVR Rating'],
      ['Main Power Cable (RM)', 'Main Power Cable Size'],
      ['SDB main breaker', 'SDB Main Breaker Rating (A)']
    ]
  }
];

/* ===================== PAGE ===================== */

function doGet(e) {
  if (e && e.parameter && e.parameter.api === 'ping') return apiJson_({ok:true,version:1});
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Lift Component Selector')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// Runs automatically when someone edits the Sheet by hand: clears the cache
// so the app shows the new data immediately.
function onEdit(e) {
  try { cacheDel_([CACHE_COMPONENTS, CACHE_USERS]); } catch (err) { }
}

/* ===================== SMALL HELPERS ===================== */

function SS_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function normEmail_(e) { return String(e || '').trim().toLowerCase(); }
function norm_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function fmtDate_(d) {
  if (d instanceof Date) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  return String(d || '');
}
function round2_(n) { return Math.round(n * 100) / 100; }
function round3_(n) { return Math.round(n * 1000) / 1000; }
function round4_(n) { return Math.round(n * 10000) / 10000; }
function coerce_(v) { return LiftCore.scalar(v); }

/* ===================== CACHE ===================== */

function cacheGet_(key) {
  try {
    var s = CacheService.getScriptCache().get(key);
    return s ? JSON.parse(s) : null;
  } catch (e) { return null; }
}
function cachePut_(key, obj, ttlSeconds) {
  try { CacheService.getScriptCache().put(key, JSON.stringify(obj), ttlSeconds); } catch (e) { /* too big or unavailable: just skip */ }
}
function cacheDel_(keys) {
  try { CacheService.getScriptCache().removeAll(keys); } catch (e) { }
}
function clearUsersCache_() { cacheDel_([CACHE_USERS]); }
function clearComponentsCache_() { cacheDel_([CACHE_COMPONENTS]); }

/* ===================== SHEETS ===================== */

function ensureUsersSheet_() {
  var ss = SS_();
  var sh = ss.getSheetByName(USERS_SHEET_NAME);
  if (sh) {
    var header = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
    if (header.indexOf('PasswordHash') === -1) {
      // Old Users sheet from version 1 -> keep as a backup, start a fresh one
      sh.setName('Users_old_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss'));
      sh = null;
    }
  }
  if (!sh) {
    sh = ss.insertSheet(USERS_SHEET_NAME);
    sh.appendRow(USER_HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function ensureLogsSheet_() {
  var sh = SS_().getSheetByName(LOGS_SHEET_NAME);
  if (!sh) {
    sh = SS_().insertSheet(LOGS_SHEET_NAME);
    sh.appendRow(['Timestamp', 'Email', 'Action', 'Details']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function logUsage_(email, action, details) {
  try {
    ensureLogsSheet_().appendRow([new Date(), email, action, details || '']);
  } catch (e) { /* never block the user because logging failed */ }
}

/* ===================== PASSWORDS & TOKENS ===================== */

function getSecret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('AUTH_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('AUTH_SECRET', s);
  }
  return s;
}

function toHex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function hashPassword_(password, salt) {
  var sig = Utilities.computeHmacSha256Signature(salt + ':' + password, getSecret_());
  return 'h:' + toHex_(sig); // "h:" prefix stops Sheets from treating it as a number
}

function makeToken_(email) {
  var exp = Date.now() + TOKEN_LIFETIME_HOURS * 3600 * 1000;
  var payload = email + '|' + exp;
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, getSecret_()));
  return Utilities.base64EncodeWebSafe(payload) + '.' + sig;
}

function parseToken_(token) {
  try {
    var parts = String(token || '').split('.');
    if (parts.length !== 2) return null;
    var payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
    var expected = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, getSecret_()));
    if (expected !== parts[1]) return null;
    var i = payload.lastIndexOf('|');
    var email = payload.substring(0, i);
    var exp = Number(payload.substring(i + 1));
    if (!(exp > Date.now())) return null;
    return email;
  } catch (e) {
    return null;
  }
}

// All users (cached for 2 minutes; the cache is cleared whenever users change)
function getUsersList_() {
  var cached = cacheGet_(CACHE_USERS);
  if (cached) return cached;
  var data = ensureUsersSheet_().getDataRange().getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    list.push({
      row: i + 1,
      email: String(data[i][COL.EMAIL - 1]),
      name: String(data[i][COL.NAME - 1]),
      role: String(data[i][COL.ROLE - 1]),
      status: String(data[i][COL.STATUS - 1]),
      salt: String(data[i][COL.SALT - 1]),
      hash: String(data[i][COL.HASH - 1])
    });
  }
  cachePut_(CACHE_USERS, list, 120);
  return list;
}

function getUserRecord_(email) {
  email = normEmail_(email);
  var list = getUsersList_();
  for (var i = 0; i < list.length; i++) {
    if (list[i].email.toLowerCase() === email) return list[i];
  }
  return null;
}

function authUser_(token, allowedRoles) {
  var email = parseToken_(token);
  if (!email) throw new Error('SESSION_EXPIRED');
  var rec = getUserRecord_(email);
  if (!rec || rec.status !== 'Approved') throw new Error('SESSION_EXPIRED');
  if (allowedRoles && allowedRoles.indexOf(rec.role) === -1) {
    throw new Error('You do not have permission to do this.');
  }
  return rec;
}

function countPending_() {
  return getUsersList_().filter(function (u) { return u.status === 'Pending'; }).length;
}

function buildSession_(rec, token) {
  var isAdmin = rec.role === ROLE_ADMIN;
  var s = {
    token: token,
    email: rec.email,
    name: rec.name,
    role: rec.role,
    isAdmin: isAdmin,
    canCalculate: LiftCore.can(rec.role, 'calculateSpeedSlip'),
    pendingCount: isAdmin ? countPending_() : 0,
    index: [],
    indexError: ''
  };
  try {
    s.index = getSelectionIndex_();
  } catch (e) {
    s.indexError = String(e && e.message ? e.message : e).replace(/^(Error|Exception):\s*/i, '');
  }
  return s;
}

/* ---- brute-force / spam protection ---- */

function checkLock_(email) {
  var n = Number(CacheService.getScriptCache().get('fail:' + email) || 0);
  if (n >= MAX_FAILED_LOGINS) throw new Error('Too many failed attempts. Please try again in 15 minutes.');
}
function recordFail_(email) {
  var c = CacheService.getScriptCache();
  c.put('fail:' + email, String(Number(c.get('fail:' + email) || 0) + 1), 900);
}
function clearFails_(email) { CacheService.getScriptCache().remove('fail:' + email); }
function throttleRegistrations_() {
  var c = CacheService.getScriptCache();
  var n = Number(c.get('reg_count') || 0);
  if (n >= 30) throw new Error('Too many registration requests right now. Please try again later.');
  c.put('reg_count', String(n + 1), 3600);
}

/* ===================== ONE-TIME ADMIN SETUP ===================== */
/**
 * Only needed the very first time (or to recover a lost admin password).
 * WARNING: running this resets that admin's password to the one written below.
 */
function setupAdmin() {
  var ADMIN_NAME = 'Your Name';
  var ADMIN_EMAIL = 'your.email@gmail.com';
  var ADMIN_PASSWORD = 'ChangeThisPassword';

  var email = normEmail_(ADMIN_EMAIL);
  if (email === 'your.email@gmail.com' || String(ADMIN_PASSWORD).length < 8 || ADMIN_PASSWORD === 'ChangeThisPassword') {
    throw new Error('Edit ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD (at least 8 characters) inside setupAdmin() first.');
  }
  var sh = ensureUsersSheet_();
  clearUsersCache_();
  var rec = getUserRecord_(email);
  var salt = Utilities.getUuid();
  var hash = hashPassword_(ADMIN_PASSWORD, salt);
  if (rec) {
    sh.getRange(rec.row, COL.NAME).setValue(ADMIN_NAME);
    sh.getRange(rec.row, COL.ROLE).setValue(ROLE_ADMIN);
    sh.getRange(rec.row, COL.STATUS).setValue('Approved');
    sh.getRange(rec.row, COL.SALT).setValue(salt);
    sh.getRange(rec.row, COL.HASH).setValue(hash);
    sh.getRange(rec.row, COL.APPROVED).setValue(new Date());
  } else {
    sh.appendRow([email, ADMIN_NAME, ROLE_ADMIN, 'Approved', salt, hash, new Date(), new Date()]);
  }
  clearUsersCache_();
  Logger.log('Admin account is ready for ' + email + '. You can now log in to the web app.');
}

/* ===================== PUBLIC: REGISTER / LOGIN ===================== */

function register(name, email, password) {
  var clean = LiftCore.registration(name,email,password);
  name=clean.name;email=clean.email;password=clean.password;
  throttleRegistrations_();

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = ensureUsersSheet_();
    clearUsersCache_();                       // make sure the duplicate check sees fresh data
    if (getUserRecord_(email)) {
      throw new Error('This email is already registered. Please log in, or wait for admin approval.');
    }
    var salt = Utilities.getUuid();
    sh.appendRow([email, name, ROLE_SELECTION, 'Pending', salt, hashPassword_(password, salt), new Date(), '']);
    clearUsersCache_();
  } finally {
    lock.releaseLock();
  }
  notifyAdmins_(name, email);
  return 'Request sent! The admin has been notified. You can log in once your account is approved.';
}

function notifyAdmins_(name, email) {
  try {
    if (MailApp.getRemainingDailyQuota() < 1) return;
    var admins = getUsersList_()
      .filter(function (u) { return u.role === ROLE_ADMIN && u.status === 'Approved'; })
      .map(function (u) { return u.email; });
    if (!admins.length) return;
    var url = '';
    try { url = ScriptApp.getService().getUrl(); } catch (e) { }
    MailApp.sendEmail({
      to: admins.join(','),
      subject: 'New access request - Lift Component Selector',
      body: name + ' (' + email + ') has requested access to the Lift Component Selector.\n\n' +
        'To approve: open the app, go to "User Management", choose a role ' +
        '(Selection Only, or Selection + Calculation) and click Approve.\n\n' +
        (url ? 'App link: ' + url + '\n\n' : '') +
        'Lift Electrical R&I'
    });
  } catch (err) {
    console.error('Admin notification failed: ' + err);
  }
}

function login(email, password) {
  email = normEmail_(email);
  checkLock_(email);
  var rec = getUserRecord_(email);
  if (!rec || !rec.hash || hashPassword_(String(password || ''), rec.salt) !== rec.hash) {
    recordFail_(email);
    throw new Error('Incorrect email or password.');
  }
  if (rec.status === 'Pending') throw new Error('Your account is waiting for admin approval.');
  if (rec.status === 'Rejected') throw new Error('Your access request was declined by the admin.');
  if (rec.status !== 'Approved') throw new Error('Your account is not active.');
  clearFails_(email);
  return buildSession_(rec, makeToken_(rec.email));
}

function getSession(token) {
  var rec = authUser_(token);
  return buildSession_(rec, token);
}

// Fresh copy of the selection dropdown data (used after admin edits / periodically)
function refreshIndex(token) {
  authUser_(token);
  try {
    return { index: getSelectionIndex_(), error: '' };
  } catch (e) {
    return { index: [], error: String(e && e.message ? e.message : e).replace(/^(Error|Exception):\s*/i, '') };
  }
}

function changePassword(token, oldPassword, newPassword) {
  var rec = authUser_(token);
  if (hashPassword_(String(oldPassword || ''), rec.salt) !== rec.hash) throw new Error('Current password is incorrect.');
  newPassword = String(newPassword || '');
  if (newPassword.length < 8) throw new Error('New password must be at least 8 characters.');
  var sh = ensureUsersSheet_();
  var salt = Utilities.getUuid();
  sh.getRange(rec.row, COL.SALT).setValue(salt);
  sh.getRange(rec.row, COL.HASH).setValue(hashPassword_(newPassword, salt));
  clearUsersCache_();
  return 'Password changed successfully.';
}

// Called by the browser AFTER an action finishes, so logging never slows the screen down.
function logAction(token, action, details) {
  var rec = authUser_(token);
  if (TOPICS.indexOf(action) === -1) throw new Error('Unknown action.');
  if (CALC_TOPICS.indexOf(action) !== -1 && rec.role !== ROLE_ADMIN && rec.role !== ROLE_FULL) {
    throw new Error('You do not have permission to do this.');
  }
  logUsage_(rec.email, action, String(details || '').substring(0, 300));
  return true;
}

/* ===================== ADMIN: USERS ===================== */

function adminListUsers(token) {
  authUser_(token, LiftCore.roles('admin'));
  var data = ensureUsersSheet_().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    out.push({
      row: i + 1,
      email: String(data[i][COL.EMAIL - 1]),
      name: String(data[i][COL.NAME - 1]),
      role: String(data[i][COL.ROLE - 1]),
      status: String(data[i][COL.STATUS - 1]),
      requestedAt: fmtDate_(data[i][COL.REQUESTED - 1]),
      approvedAt: fmtDate_(data[i][COL.APPROVED - 1])
    });
  }
  var order = { Pending: 0, Approved: 1, Rejected: 2 };
  out.sort(function (a, b) {
    var d = (order[a.status] === undefined ? 3 : order[a.status]) - (order[b.status] === undefined ? 3 : order[b.status]);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
  return out;
}

// Pass null for role OR status to keep the existing value.
function adminUpdateUser(token, row, role, status) {
  var me = authUser_(token, LiftCore.roles('admin'));
  var sh = ensureUsersSheet_();
  row = Number(row);
  if (!(row >= 2 && row <= sh.getLastRow())) throw new Error('User not found.');
  var cur = sh.getRange(row, 1, 1, USER_HEADERS.length).getValues()[0];
  var curRole = String(cur[COL.ROLE - 1]);
  var curStatus = String(cur[COL.STATUS - 1]);
  var newRole = role || curRole;
  var newStatus = status || curStatus;
  if ([ROLE_ADMIN, ROLE_FULL, ROLE_SELECTION].indexOf(newRole) === -1) throw new Error('Invalid role.');
  if (['Pending', 'Approved', 'Rejected'].indexOf(newStatus) === -1) throw new Error('Invalid status.');
  if (String(cur[COL.EMAIL - 1]).toLowerCase() === me.email.toLowerCase() &&
    (newRole !== ROLE_ADMIN || newStatus !== 'Approved')) {
    throw new Error('You cannot remove your own admin access.');
  }
  sh.getRange(row, COL.ROLE).setValue(newRole);
  sh.getRange(row, COL.STATUS).setValue(newStatus);
  if (newStatus === 'Approved' && curStatus !== 'Approved') sh.getRange(row, COL.APPROVED).setValue(new Date());
  clearUsersCache_();
  return true;
}

function adminResetPassword(token, row) {
  authUser_(token, LiftCore.roles('admin'));
  var sh = ensureUsersSheet_();
  row = Number(row);
  if (!(row >= 2 && row <= sh.getLastRow())) throw new Error('User not found.');
  var temp = Utilities.getUuid().replace(/-/g, '').substring(0, 10);
  var salt = Utilities.getUuid();
  sh.getRange(row, COL.SALT).setValue(salt);
  sh.getRange(row, COL.HASH).setValue(hashPassword_(temp, salt));
  clearUsersCache_();
  return { email: String(sh.getRange(row, COL.EMAIL).getValue()), tempPassword: temp };
}

/* ===================== COMPONENTS: READ ===================== */

function readComponentsFresh_() {
  var sh = SS_().getSheetByName(COMPONENTS_SHEET_NAME);
  if (!sh) {
    throw new Error('Sheet tab "' + COMPONENTS_SHEET_NAME + '" was not found. Ask the admin to fix COMPONENTS_SHEET_NAME in Code.gs.');
  }
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 3 || lastCol < 1) return { headers: [], records: [] };
  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[1].map(function (h) { return String(h).trim(); });
  var n = headers.length;
  while (n > 0 && headers[n - 1] === '') n--;
  headers = headers.slice(0, n);
  var records = [];
  for (var i = 2; i < values.length; i++) {
    if (values[i][0] === '' || values[i][0] === null) continue;
    records.push({ sheetRow: i + 1, values: values[i].slice(0, n) });
  }
  return { headers: headers, records: records };
}

// Cached for 10 minutes (cleared automatically when the admin edits data in the app)
function readComponents_() {
  var cached = cacheGet_(CACHE_COMPONENTS);
  if (cached) return cached;
  var d = readComponentsFresh_();
  cachePut_(CACHE_COMPONENTS, d, 600);
  return d;
}

function colMap_(headers) {
  var m = {};
  headers.forEach(function (h, i) { m[norm_(h)] = i; });
  return m;
}

function needCol_(map, name) {
  var i = map[norm_(name)];
  if (i === undefined) throw new Error('Column "' + name + '" was not found in the Components sheet.');
  return i;
}

// Compact list used by the browser to filter capacity/speed/usage/roping/brand/model instantly
function getSelectionIndex_() {
  var d = readComponents_();
  var m = colMap_(d.headers);
  var iCap = needCol_(m, 'Capacity (KG)'), iSp = needCol_(m, 'Speed (m/s)'),
    iUse = needCol_(m, 'Usage Type'), iRope = needCol_(m, 'Roping'),
    iBrand = needCol_(m, 'Motor brand'), iModel = needCol_(m, 'Motor Model'), iType = needCol_(m, 'Motor Type');
  return d.records.map(function (r) {
    var v = r.values;
    return {
      r: r.sheetRow, c: Number(v[iCap]), s: Number(v[iSp]),
      u: String(v[iUse]), p: String(v[iRope]),
      b: String(v[iBrand]), m: String(v[iModel]), t: String(v[iType])
    };
  });
}

function getComponentDetails(token, sheetRow) {
  authUser_(token);
  var d = readComponents_();
  sheetRow = Number(sheetRow);
  var rec = null;
  for (var i = 0; i < d.records.length; i++) {
    if (d.records[i].sheetRow === sheetRow) { rec = d.records[i]; break; }
  }
  if (!rec) throw new Error('This item is no longer available. Please search again.');
  var m = colMap_(d.headers);
  function val(name) { var i = m[norm_(name)]; return i === undefined ? '' : rec.values[i]; }

  var categories = CATEGORIES.map(function (cat) {
    return {
      title: cat.title,
      items: cat.fields.map(function (f) {
        var v = val(f[0]);
        return { label: f[1], value: (v === '' || v === null) ? '-' : String(v) };
      })
    };
  });
  return {
    inputs: { capacity: val('Capacity (KG)'), speed: val('Speed (m/s)'), usageType: val('Usage Type'), roping: val('Roping') },
    categories: categories
  };
}

/* ===================== ADMIN: COMPONENTS EDIT ===================== */

function adminGetComponents(token) {
  authUser_(token, LiftCore.roles('admin'));
  var d = readComponentsFresh_();
  return {
    headers: d.headers,
    records: d.records.map(function (r) {
      return { sheetRow: r.sheetRow, values: r.values.map(function (v) { return String(v); }) };
    })
  };
}

// sheetRow = null -> add new row, otherwise update that row
function adminSaveComponent(token, sheetRow, values) {
  authUser_(token, LiftCore.roles('admin'));
  var d = readComponentsFresh_();
  var n = d.headers.length;
  if (!values || values.length !== n) throw new Error('Please fill the form again (column count mismatch).');
  var clean = LiftCore.component(values, n);
  for (var i = 0; i < Math.min(4, n); i++) {
    if (clean[i] === '') throw new Error('"' + d.headers[i] + '" is required.');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = SS_().getSheetByName(COMPONENTS_SHEET_NAME);
    if (sheetRow === null || sheetRow === undefined || sheetRow === '') {
      sh.appendRow(clean);
    } else {
      sheetRow = Number(sheetRow);
      if (!(sheetRow >= 3 && sheetRow <= sh.getLastRow())) throw new Error('Row not found.');
      sh.getRange(sheetRow, 1, 1, n).setValues([clean]);
    }
    clearComponentsCache_();
  } finally {
    lock.releaseLock();
  }
  return true;
}

function adminDeleteComponent(token, sheetRow) {
  authUser_(token, LiftCore.roles('admin'));
  var sh = SS_().getSheetByName(COMPONENTS_SHEET_NAME);
  sheetRow = Number(sheetRow);
  if (!(sh && sheetRow >= 3 && sheetRow <= sh.getLastRow())) throw new Error('Row not found.');
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    sh.deleteRow(sheetRow);
    clearComponentsCache_();
  } finally {
    lock.releaseLock();
  }
  return true;
}

/* ===================== CALCULATORS (Admin + Full only) ===================== */

function calculateTravelTime(token, input) {
  authUser_(token, LiftCore.roles('calculate'));
  return LiftCore.calculate('calculateTravelTime', input);
}

function calculatePowerAndAVR(token, input) {
  authUser_(token, LiftCore.roles('calculate'));
  return LiftCore.calculate('calculatePowerAndAVR', input);
}

// Speed uses sheave diameter in mm. Slip applies only to geared induction motors.
function calculateSpeedSlip(token, input) {
  authUser_(token, LiftCore.roles('calculate'));
  return LiftCore.calculate('calculateSpeedSlip', input);
}

// Motor power justification: P (kW) = Torque (Nm) x RPM / 9550
function calculateMotorPower(token, input) {
  authUser_(token, LiftCore.roles('calculate'));
  return LiftCore.calculate('calculateMotorPower', input);
}

/* ===================== ADMIN: DASHBOARD ===================== */

function adminStats(token) {
  authUser_(token, LiftCore.roles('admin'));
  var topics = TOPICS;
  var users = ensureUsersSheet_().getDataRange().getValues();
  var per = {};
  function blank() { return topics.map(function () { return 0; }); }
  for (var u = 1; u < users.length; u++) {
    if (String(users[u][COL.STATUS - 1]) !== 'Approved') continue;
    var em = String(users[u][COL.EMAIL - 1]).toLowerCase();
    per[em] = { name: String(users[u][COL.NAME - 1]), role: String(users[u][COL.ROLE - 1]), counts: blank(), last: null };
  }
  var logs = ensureLogsSheet_().getDataRange().getValues();
  var totals = blank();
  var totalEvents = 0;
  for (var i = 1; i < logs.length; i++) {
    var email = String(logs[i][1]).toLowerCase();
    var t = topics.indexOf(String(logs[i][2]));
    if (t === -1) continue;
    if (!per[email]) per[email] = { name: email, role: '', counts: blank(), last: null };
    per[email].counts[t]++;
    totals[t]++;
    totalEvents++;
    var ts = logs[i][0];
    if (ts instanceof Date && (!per[email].last || ts > per[email].last)) per[email].last = ts;
  }
  var rows = Object.keys(per).map(function (email) {
    var p = per[email];
    var total = p.counts.reduce(function (a, b) { return a + b; }, 0);
    return { email: email, name: p.name, role: p.role, counts: p.counts, total: total, lastActive: p.last ? fmtDate_(p.last) : '-' };
  });
  rows.sort(function (a, b) { return b.total - a.total; });
  return { topics: topics, rows: rows, totals: totals, totalEvents: totalEvents };
}
