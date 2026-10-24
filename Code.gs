/**
 * ============================================================
 *  HISAAB — Google Sheet backend (Apps Script)
 * ------------------------------------------------------------
 *  Kaise lagayein (detail SETUP.md me hai):
 *   1. Naya Google Sheet kholein -> Extensions -> Apps Script
 *   2. Is file ka poora code paste karein -> Save
 *   3. (optional) setupPassword() chalayein, apna password daalein
 *   4. Deploy -> New deployment -> Web app
 *        Execute as: Me
 *        Who has access: Anyone
 *   5. Jo /exec URL mile, wo app ke Settings me paste karein
 * ============================================================
 */

var SHEET_NAME = 'ENTRIES';
var HEADERS = ['ID', 'Date', 'Type', 'Category', 'Amount', 'Note', 'Payment', 'CreatedAt'];

var LOAN_SHEET = 'UDHAAR';
var LOAN_HEADERS = ['ID', 'Date', 'Person', 'Type', 'Amount', 'Note', 'CreatedAt'];

var TOKEN_TTL = 21600;   // 6 ghante
var MAX_TRIES = 6;       // galat password ki limit
var LOCK_TTL = 900;      // 15 minute lockout

/* ----------------------------- helpers ----------------------------- */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function props_() {
  return PropertiesService.getScriptProperties();
}

function appPassword_() {
  return props_().getProperty('APP_PASSWORD') || '';
}

function todayStr_() {
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
}

function dateStr_(v, tz, withTime) {
  if (!v) return '';
  if (v instanceof Date) {
    return Utilities.formatDate(v, tz, withTime ? "yyyy-MM-dd'T'HH:mm:ss" : 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  if (withTime) return s;
  // "24/10/2026" ya "2026-10-24T..." jaisi values ko saaf karte hain
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return s.slice(0, 10);
}

/* ----------------------------- sheet ----------------------------- */

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);

  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setFontColor('#FFFFFF')
      .setBackground('#0D9488');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 200);
    sh.setColumnWidth(2, 100);
    sh.setColumnWidth(3, 90);
    sh.setColumnWidth(4, 130);
    sh.setColumnWidth(5, 100);
    sh.setColumnWidth(6, 240);
    sh.setColumnWidth(7, 90);
  }

  // Date aur CreatedAt ko text rakhte hain — timezone ki dikkat na ho
  sh.getRange('B:B').setNumberFormat('@');
  sh.getRange('H:H').setNumberFormat('@');
  return sh;
}

function readAll_() {
  var sh = getSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];

  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var values = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var out = [];

  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    if (!r[0]) continue;
    out.push({
      id: String(r[0]),
      date: dateStr_(r[1], tz),
      type: String(r[2] || 'expense'),
      category: String(r[3] || 'Other'),
      amount: Number(r[4]) || 0,
      note: String(r[5] || ''),
      payment: String(r[6] || 'cash'),
      createdAt: dateStr_(r[7], tz, true)
    });
  }
  return out;
}

function findRow_(sh, id) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return 0;
}

function rowFor_(entry) {
  return [
    String(entry.id || Utilities.getUuid()),
    String(entry.date || todayStr_()).slice(0, 10),
    entry.type === 'income' ? 'income' : 'expense',
    String(entry.category || 'Other'),
    Number(entry.amount) || 0,
    String(entry.note || ''),
    String(entry.payment || 'cash'),
    String(entry.createdAt || new Date().toISOString())
  ];
}

/* ----------------------------- udhaar khata ----------------------------- */

function getLoanSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(LOAN_SHEET);

  if (!sh) {
    sh = ss.insertSheet(LOAN_SHEET);
    sh.getRange(1, 1, 1, LOAN_HEADERS.length).setValues([LOAN_HEADERS]);
    sh.getRange(1, 1, 1, LOAN_HEADERS.length)
      .setFontWeight('bold')
      .setFontColor('#FFFFFF')
      .setBackground('#0F766E');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 200);
    sh.setColumnWidth(2, 100);
    sh.setColumnWidth(3, 150);
    sh.setColumnWidth(4, 100);
    sh.setColumnWidth(5, 100);
    sh.setColumnWidth(6, 240);
  }

  sh.getRange('B:B').setNumberFormat('@');
  sh.getRange('G:G').setNumberFormat('@');
  return sh;
}

function readLoans_() {
  var sh = getLoanSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];

  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var values = sh.getRange(2, 1, last - 1, LOAN_HEADERS.length).getValues();
  var out = [];

  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    if (!r[0]) continue;
    out.push({
      id: String(r[0]),
      date: dateStr_(r[1], tz),
      person: String(r[2] || ''),
      type: String(r[3] || 'given'),
      amount: Number(r[4]) || 0,
      note: String(r[5] || ''),
      createdAt: dateStr_(r[6], tz, true)
    });
  }
  return out;
}

function loanRowFor_(l) {
  var t = String(l.type || 'given');
  if (['given', 'taken', 'received', 'paid'].indexOf(t) < 0) t = 'given';
  return [
    String(l.id || Utilities.getUuid()),
    String(l.date || todayStr_()).slice(0, 10),
    String(l.person || '').slice(0, 60),
    t,
    Number(l.amount) || 0,
    String(l.note || ''),
    String(l.createdAt || new Date().toISOString())
  ];
}

/* ----------------------------- password ----------------------------- */

function issueToken_() {
  var tok = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('tok_' + tok, '1', TOKEN_TTL);
  return tok;
}

function tokenOk_(tok) {
  if (!tok) return false;
  return CacheService.getScriptCache().get('tok_' + tok) === '1';
}

function lockedUntil_() {
  var v = Number(CacheService.getScriptCache().get('app_locked') || 0);
  return v > Date.now() ? v : 0;
}

function registerFail_() {
  var c = CacheService.getScriptCache();
  var n = Number(c.get('app_fails') || 0) + 1;
  if (n >= MAX_TRIES) {
    c.put('app_fails', '0', LOCK_TTL);
    c.put('app_locked', String(Date.now() + LOCK_TTL * 1000), LOCK_TTL);
    return true;
  }
  c.put('app_fails', String(n), LOCK_TTL);
  return false;
}

function clearFails_() {
  var c = CacheService.getScriptCache();
  c.remove('app_fails');
  c.remove('app_locked');
}

// { ok:true, token } ya { ok:false, error }
function authenticate_(body, e) {
  // Password set nahi hai -> app khula hai
  if (!appPassword_()) return { ok: true, open: true, token: '' };

  var until = lockedUntil_();
  if (until) {
    return {
      ok: false,
      error: 'locked',
      message: 'Bahut zyada galat koshishein. ' +
        Math.max(1, Math.ceil((until - Date.now()) / 60000)) + ' minute baad try karein.'
    };
  }

  var tok = '';
  try { if (e && e.parameter && e.parameter.t) tok = e.parameter.t; } catch (err) {}
  if (!tok && body && body.token) tok = String(body.token);
  if (tokenOk_(tok)) return { ok: true, token: tok };

  var given = body && body.password != null ? String(body.password) : '';

  // Password hi nahi bheja (sirf purana/expired token) — ise galat koshish na ginein,
  // warna app kholte hi 6 koshishon me lock lag jata hai.
  if (!given) {
    return {
      ok: false,
      error: 'unauthorised',
      message: 'Password chahiye. App me Settings → Password daal kar Connect karein.'
    };
  }

  if (given === appPassword_()) {
    clearFails_();
    return { ok: true, token: issueToken_() };
  }

  var justLocked = registerFail_();
  return {
    ok: false,
    error: justLocked ? 'locked' : 'unauthorised',
    message: justLocked
      ? 'Bahut zyada galat koshishein. 15 minute baad try karein.'
      : 'Password galat hai.'
  };
}

/* ----------------------------- HTTP ----------------------------- */

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'ping';

    if (action === 'ping') {
      return json_({ ok: true, name: 'Hisaab API', time: new Date().toISOString() });
    }

    var gate = authenticate_(null, e);
    if (!gate.ok) return json_({ ok: false, error: 'unauthorised', message: gate.error });

    return json_({ ok: true, entries: readAll_() });
  } catch (err) {
    return json_({ ok: false, error: 'server', message: String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (err) {}

  try {
    var data = {};
    try {
      data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (err) {
      data = {};
    }

    var action = String(data.action || 'list');

    if (action === 'ping') {
      return json_({ ok: true, name: 'Hisaab API', time: new Date().toISOString() });
    }

    if (action === 'auth') {
      var a = authenticate_(data, e);
      if (!a.ok) return json_({ ok: false, error: 'unauthorised', message: a.error });
      return json_({ ok: true, token: a.token || '', open: !!a.open });
    }

    var gate = authenticate_(data, e);
    if (!gate.ok) {
      return json_({ ok: false, error: 'unauthorised', message: gate.error });
    }

    var sh = getSheet_();

    if (action === 'list') {
      return json_({ ok: true, entries: readAll_() });
    }

    if (action === 'loanList') {
      return json_({ ok: true, loans: readLoans_() });
    }

    if (action === 'loanAdd') {
      var lrow = loanRowFor_(data.loan || {});
      getLoanSheet_().appendRow(lrow);
      SpreadsheetApp.flush();
      return json_({ ok: true, id: lrow[0] });
    }

    if (action === 'loanUpdate') {
      var loan = data.loan || {};
      var lsh = getLoanSheet_();
      var lr = findRow_(lsh, loan.id);
      if (!lr) return json_({ ok: false, error: 'not-found', message: 'Udhaar entry nahi mili' });
      lsh.getRange(lr, 1, 1, LOAN_HEADERS.length).setValues([loanRowFor_(loan)]);
      SpreadsheetApp.flush();
      return json_({ ok: true });
    }

    if (action === 'loanDelete') {
      var lsh2 = getLoanSheet_();
      var lr2 = findRow_(lsh2, data.id);
      if (!lr2) return json_({ ok: false, error: 'not-found', message: 'Udhaar entry nahi mili' });
      lsh2.deleteRow(lr2);
      SpreadsheetApp.flush();
      return json_({ ok: true });
    }

    if (action === 'add') {
      var row = rowFor_(data.entry || {});
      sh.appendRow(row);
      SpreadsheetApp.flush();
      return json_({ ok: true, id: row[0] });
    }

    if (action === 'bulkAdd') {
      var list = data.entries || [];
      if (!list.length) return json_({ ok: true, added: 0 });
      var rows = list.map(rowFor_);
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
      SpreadsheetApp.flush();
      return json_({ ok: true, added: rows.length });
    }

    if (action === 'update') {
      var entry = data.entry || {};
      var r = findRow_(sh, entry.id);
      if (!r) return json_({ ok: false, error: 'not-found', message: 'Entry nahi mili' });
      var vals = rowFor_(entry);
      sh.getRange(r, 1, 1, HEADERS.length).setValues([vals]);
      SpreadsheetApp.flush();
      return json_({ ok: true });
    }

    if (action === 'delete') {
      var dr = findRow_(sh, data.id);
      if (!dr) return json_({ ok: false, error: 'not-found', message: 'Entry nahi mili' });
      sh.deleteRow(dr);
      SpreadsheetApp.flush();
      return json_({ ok: true });
    }

    return json_({ ok: false, error: 'unknown-action', message: 'Action samajh nahi aaya: ' + action });
  } catch (err) {
    return json_({ ok: false, error: 'server', message: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

/* ----------------------------- one-time setup ----------------------------- */

function setupSheet() {
  var sh = getSheet_();
  var lsh = getLoanSheet_();
  Logger.log('Sheet ready: ' + sh.getName() + ' (' + Math.max(0, sh.getLastRow() - 1) + ' entries)');
  Logger.log('Udhaar sheet ready: ' + lsh.getName() + ' (' + Math.max(0, lsh.getLastRow() - 1) + ' entries)');
}



// "Bahut zyada galat koshishein" wala lock turant hata deta hai (15 min wait nahi)
function resetLock() {
  clearFails_();
  Logger.log('Lock clear ho gaya. Ab app me Settings → Password daal kar Connect karein.');
}

function info() {
  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  Logger.log('Sheet      : ' + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log('Entries    : ' + Math.max(0, getSheet_().getLastRow() - 1));
  Logger.log('Password   : ' + (appPassword_() ? 'SET hai' : 'set nahi hai'));
  Logger.log('Web App URL: ' + (url || '(deploy karne ke baad milega)'));
}
