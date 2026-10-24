/* ============================================================
   Hisaab — app logic
   ============================================================ */
(function () {
  'use strict';

  var P = window.HisaabParser;
  var API = window.HisaabAPI;

  /* ---------------- tiny helpers ---------------- */
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function inr(n) {
    var v = Number(n) || 0;
    return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayISO() { return isoDate(new Date()); }
  function monthKeyOf(dateStr) { return String(dateStr || '').slice(0, 7); }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function sum(list) {
    return list.reduce(function (a, e) { return a + (Number(e.amount) || 0); }, 0);
  }

  function toast(msg) {
    var el = $('#toast');
    $('#toastMsg').textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, 2400);
  }

  /* ---------------- state ---------------- */
  var LS = { cfg: 'hisaab.cfg.v1', entries: 'hisaab.entries.v1', queue: 'hisaab.queue.v1' };

  var State = {
    cfg: { apiUrl: '', token: '', lang: 'hi-IN', theme: 'light', seeded: false },
    entries: [],
    queue: [],
    month: { y: new Date().getFullYear(), m: new Date().getMonth() },
    view: 'report',
    catType: 'expense',
    search: '',
    filterType: '',
    filterCat: '',
    edit: null,
    conn: 'demo'
  };

  function load() {
    try {
      var c = JSON.parse(localStorage.getItem(LS.cfg) || 'null');
      if (c) Object.keys(State.cfg).forEach(function (k) { if (c[k] != null) State.cfg[k] = c[k]; });
    } catch (e) {}
    try {
      var e1 = JSON.parse(localStorage.getItem(LS.entries) || 'null');
      if (Array.isArray(e1)) State.entries = e1;
    } catch (e) {}
    try {
      var q = JSON.parse(localStorage.getItem(LS.queue) || 'null');
      if (Array.isArray(q)) State.queue = q;
    } catch (e) {}
  }

  function saveCfg() { try { localStorage.setItem(LS.cfg, JSON.stringify(State.cfg)); } catch (e) {} }
  function saveEntries() { try { localStorage.setItem(LS.entries, JSON.stringify(State.entries)); } catch (e) {} }
  function saveQueue() { try { localStorage.setItem(LS.queue, JSON.stringify(State.queue)); } catch (e) {} }

  /* ---------------- data helpers ---------------- */
  function normalizeEntry(e) {
    return {
      id: String(e.id || newId()),
      date: String(e.date || todayISO()).slice(0, 10),
      type: e.type === 'income' ? 'income' : 'expense',
      category: String(e.category || 'Other'),
      amount: Math.round((Number(e.amount) || 0) * 100) / 100,
      note: String(e.note || ''),
      payment: String(e.payment || 'cash'),
      createdAt: String(e.createdAt || new Date().toISOString())
    };
  }

  function monthKey() { return State.month.y + '-' + pad(State.month.m + 1); }

  function monthEntries() {
    var k = monthKey();
    return State.entries.filter(function (e) { return monthKeyOf(e.date) === k; });
  }

  function catInfo(name, type) {
    var c = P.categoryByName(name);
    if (c) return c;
    return { name: name || 'Other', icon: '📦', color: '#94A3B8', type: type || 'expense' };
  }

  function idxOf(id) {
    for (var i = 0; i < State.entries.length; i++) if (State.entries[i].id === id) return i;
    return -1;
  }

  /* ---------------- sync ---------------- */
  function setConn(state, text) {
    State.conn = state;
    var pill = $('#connPill');
    pill.setAttribute('data-state', state);
    $('#connText').textContent = text || {
      ok: 'Sheet', demo: 'Demo', syncing: 'Sync…', offline: 'Offline'
    }[state];

    var badge = $('#connBadge');
    if (badge) {
      badge.className = 'badge ' + (state === 'ok' ? 'ok' : state === 'offline' ? 'err' : state === 'syncing' ? 'warn' : '');
      badge.textContent = state === 'ok' ? 'Connected' : state === 'offline' ? 'Offline' : state === 'syncing' ? 'Sync…' : 'Demo';
    }

    var banner = $('#demoBanner');
    if (banner) banner.hidden = !(state === 'demo' && !API.isConfigured());

    updateDataStat();
  }

  function updateDataStat() {
    var el = $('#dataStat');
    if (!el) return;
    el.textContent = State.entries.length + ' entry cache me' +
      (State.queue.length ? ' · ' + State.queue.length + ' pending' : '') +
      (State.cfg.apiUrl ? '' : ' · Sheet connect nahi hai');
  }

  function applyPending() {
    State.queue.forEach(function (op) {
      if (op.op === 'add') {
        if (idxOf(op.data.id) < 0) State.entries.push(normalizeEntry(op.data));
      } else if (op.op === 'update') {
        var i = idxOf(op.data.id);
        if (i >= 0) State.entries[i] = normalizeEntry(op.data);
      } else if (op.op === 'delete') {
        var j = idxOf(op.id);
        if (j >= 0) State.entries.splice(j, 1);
      }
    });
  }

  function flushQueue() {
    if (!State.queue.length) return Promise.resolve();
    var op = State.queue[0];
    var p;
    if (op.op === 'add') p = API.add(op.data);
    else if (op.op === 'update') p = API.update(op.data);
    else p = API.remove(op.id);

    return p.then(function () {
      State.queue.shift();
      saveQueue();
      return flushQueue();
    });
  }

  var syncBusy = false;

  function sync(opts) {
    opts = opts || {};
    if (!API.isConfigured()) { setConn('demo'); return Promise.resolve(); }
    if (syncBusy) return Promise.resolve();
    syncBusy = true;
    setConn('syncing');

    return flushQueue()
      .then(function () { return API.list(); })
      .then(function (res) {
        if (!res || res.ok === false) throw new Error((res && (res.message || res.error)) || 'Sync fail');
        var list = (res.entries || []).map(normalizeEntry);
        State.entries = list;
        applyPending();
        saveEntries();
        render();
        setConn('ok');
      })
      .catch(function (err) {
        setConn(navigator.onLine ? 'offline' : 'offline', navigator.onLine ? 'Offline' : 'Offline');
        if (opts.manual) {
          toast(err.code === 'auth' ? 'Password galat hai — dobara connect karein' : (err.message || 'Sync nahi hua'));
        }
      })
      .then(function () { syncBusy = false; });
  }

  /* ---------------- commit ---------------- */
  function commit(entry, isNew) {
    entry = normalizeEntry(entry);
    if (isNew) {
      State.entries.unshift(entry);
      State.queue.push({ op: 'add', data: entry });
    } else {
      var i = idxOf(entry.id);
      if (i >= 0) State.entries[i] = entry;
      State.queue.push({ op: 'update', data: entry });
    }
    saveEntries();
    saveQueue();
    render();
    toast(isNew ? 'Entry save ho gayi ✓' : 'Entry update ho gayi ✓');
    if (API.isConfigured()) sync();
  }

  function removeEntry(id) {
    var i = idxOf(id);
    if (i < 0) return;
    State.entries.splice(i, 1);
    State.queue.push({ op: 'delete', id: id });
    saveEntries();
    saveQueue();
    render();
    toast('Entry delete ho gayi');
    if (API.isConfigured()) sync();
  }

  /* ---------------- rendering ---------------- */
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function renderHeader() {
    $('#monthLabel').textContent = MONTHS[State.month.m] + ' ' + State.month.y;
  }

  function render() {
    renderHeader();
    renderReport();
    renderEntries();
    updateDataStat();
  }

  function renderReport() {
    var list = monthEntries();
    var inc = sum(list.filter(function (e) { return e.type === 'income'; }));
    var exp = sum(list.filter(function (e) { return e.type === 'expense'; }));
    var bal = inc - exp;

    $('#sumIncome').textContent = inr(inc);
    $('#sumExpense').textContent = inr(exp);
    var b = $('#sumBalance');
    b.textContent = (bal < 0 ? '−' : '') + inr(Math.abs(bal));
    b.classList.toggle('neg', bal < 0);
    $('#cntLabel').textContent = list.length + ' entry';

    renderTrend(list);
    renderDonut(list);
    renderMini(list);
  }

  function renderTrend(list) {
    var days = new Date(State.month.y, State.month.m + 1, 0).getDate();
    var inc = [], exp = [], d;
    for (d = 0; d <= days; d++) { inc[d] = 0; exp[d] = 0; }
    list.forEach(function (e) {
      var day = Number(e.date.slice(8, 10));
      if (!day || day > days) return;
      if (e.type === 'income') inc[day] += Number(e.amount) || 0;
      else exp[day] += Number(e.amount) || 0;
    });

    var max = 1;
    for (d = 1; d <= days; d++) max = Math.max(max, inc[d], exp[d]);

    var html = '';
    for (d = 1; d <= days; d++) {
      var hi = inc[d] ? Math.max(3, Math.round(inc[d] / max * 100)) : 0;
      var he = exp[d] ? Math.max(3, Math.round(exp[d] / max * 100)) : 0;
      var label = (d === 1 || d % 5 === 0) ? d : '';
      html += '<div class="tcol" title="' + d + ': kharch ' + inr(exp[d]) + ', aamdani ' + inr(inc[d]) + '">' +
        '<div class="tbars">' +
        (hi ? '<i class="tbar in" style="height:' + hi + '%"></i>' : '') +
        (he ? '<i class="tbar" style="height:' + he + '%"></i>' : '') +
        (!hi && !he ? '<i class="tbar zero"></i>' : '') +
        '</div><span class="tlabel">' + label + '</span></div>';
    }
    $('#trend').innerHTML = html;
    $('#trendEmpty').hidden = list.length > 0;
  }

  function renderDonut(list) {
    var type = State.catType;
    var items = list.filter(function (e) { return e.type === type; });
    var total = sum(items);
    var byCat = {};

    items.forEach(function (e) {
      var name = e.category || 'Other';
      if (!byCat[name]) byCat[name] = { name: name, amount: 0, count: 0 };
      byCat[name].amount += Number(e.amount) || 0;
      byCat[name].count++;
    });

    var rows = Object.keys(byCat).map(function (k) { return byCat[k]; })
      .sort(function (a, b) { return b.amount - a.amount; });

    $('#catEmpty').hidden = rows.length > 0;
    $('#donutWrap').hidden = rows.length === 0;

    // donut svg
    var R = 56, C = 2 * Math.PI * R, off = 0;
    var segs = '';
    rows.forEach(function (r) {
      var info = catInfo(r.name, type);
      var len = total ? (r.amount / total) * C : 0;
      if (len <= 0) return;
      segs += '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="' + info.color + '" stroke-width="22" ' +
        'stroke-dasharray="' + Math.max(0, len - 1.5) + ' ' + (C - Math.max(0, len - 1.5)) + '" ' +
        'stroke-dashoffset="' + (-off) + '" stroke-linecap="butt"/>';
      off += len;
    });

    $('#donut').innerHTML =
      '<svg viewBox="0 0 140 140">' +
      '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="var(--line)" stroke-width="22"/>' +
      '<g transform="rotate(-90 70 70)">' + segs + '</g>' +
      '</svg>' +
      '<div class="donut-center"><strong>' + inr(total) + '</strong><span>' +
      (type === 'income' ? 'aamdani' : 'kharch') + '</span></div>';

    // list
    var html = rows.slice(0, 12).map(function (r) {
      var info = catInfo(r.name, type);
      var pct = total ? (r.amount / total * 100) : 0;
      return '<li><button class="cat-row" data-cat="' + esc(r.name) + '" data-type="' + type + '">' +
        '<span class="cat-ic" style="color:' + info.color + '">' + info.icon + '</span>' +
        '<span class="cat-mid">' +
        '<span class="cat-name">' + esc(r.name) + '<span class="cat-pct">' + pct.toFixed(0) + '%</span></span>' +
        '<span class="cat-bar"><i style="width:' + pct.toFixed(1) + '%;background:' + info.color + '"></i></span>' +
        '</span>' +
        '<span class="cat-amt">' + inr(r.amount) + '</span>' +
        '</button></li>';
    }).join('');

    $('#catList').innerHTML = html;
  }

  function entryRow(e) {
    var info = catInfo(e.category, e.type);
    var isIn = e.type === 'income';
    var sub = [];
    if (e.note) sub.push(e.note);
    if (e.payment && e.payment !== 'cash') sub.push(e.payment.toUpperCase());
    if (!sub.length) sub.push(isIn ? 'aamdani' : 'kharch');

    return '<li><button class="tx" data-id="' + esc(e.id) + '">' +
      '<span class="tx-ic" style="background:' + hexA(info.color, .12) + '">' + info.icon + '</span>' +
      '<span class="tx-mid">' +
      '<span class="tx-title">' + esc(e.category || 'Other') + '</span>' +
      '<span class="tx-sub">' + esc(sub.join(' · ')) + '</span>' +
      '</span>' +
      '<span class="tx-amt ' + (isIn ? 'in' : 'out') + '">' + (isIn ? '+' : '−') + inr(e.amount) + '</span>' +
      '</button></li>';
  }

  function hexA(hex, a) {
    var h = String(hex || '#94A3B8').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function renderMini(list) {
    var sorted = list.slice().sort(function (a, b) {
      return a.date === b.date ? String(b.createdAt).localeCompare(String(a.createdAt)) : String(b.date).localeCompare(String(a.date));
    });
    var rows = sorted.slice(0, 5);
    $('#txListMini').innerHTML = rows.length ? rows.map(entryRow).join('') :
      '<li class="empty">Is mahine koi entry nahi. Mic dabakar bolein 🎙</li>';
  }

  function dayLabel(dateStr) {
    var t = todayISO();
    var d = new Date(dateStr + 'T00:00:00');
    var y = new Date(); y.setDate(y.getDate() - 1);
    if (dateStr === t) return 'Aaj';
    if (dateStr === isoDate(y)) return 'Kal';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' });
  }

  function renderEntries() {
    var k = monthKey();
    var q = State.search.trim().toLowerCase();

    var list = State.entries.filter(function (e) {
      if (monthKeyOf(e.date) !== k) return false;
      if (State.filterType && e.type !== State.filterType) return false;
      if (State.filterCat && e.category !== State.filterCat) return false;
      if (q) {
        var hay = (e.category + ' ' + e.note + ' ' + e.payment).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });

    list.sort(function (a, b) {
      return a.date === b.date ? String(b.createdAt).localeCompare(String(a.createdAt)) : String(b.date).localeCompare(String(a.date));
    });

    var groups = {}, order = [];
    list.forEach(function (e) {
      if (!groups[e.date]) { groups[e.date] = []; order.push(e.date); }
      groups[e.date].push(e);
    });

    var html = order.map(function (d) {
      var dayTotal = groups[d].reduce(function (a, e) {
        return a + (e.type === 'income' ? Number(e.amount) : -Number(e.amount));
      }, 0);
      return '<li><div class="tx-day">' + esc(dayLabel(d)) + ' · ' + (dayTotal >= 0 ? '+' : '−') + inr(Math.abs(dayTotal)) + '</div></li>' +
        groups[d].map(entryRow).join('');
    }).join('');

    $('#txList').innerHTML = html;
    $('#txEmpty').hidden = list.length > 0;

    var chip = $('#filterChip');
    if (State.filterCat) {
      chip.hidden = false;
      $('#filterChipText').textContent = State.filterCat;
    } else {
      chip.hidden = true;
    }
  }

  /* ---------------- navigation ---------------- */
  function setView(v) {
    State.view = v;
    $$('.view').forEach(function (s) { s.classList.toggle('is-active', s.id === 'view-' + v); });
    $$('.bottomnav button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-view') === v); });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function shiftMonth(delta) {
    var m = State.month.m + delta, y = State.month.y;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    State.month = { y: y, m: m };
    render();
  }

  /* ---------------- sheets ---------------- */
  function openSheet(name) {
    var el = $('#sheet' + name.charAt(0).toUpperCase() + name.slice(1));
    if (!el) return;
    el.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeSheet(name) {
    var el = $('#sheet' + name.charAt(0).toUpperCase() + name.slice(1));
    if (!el) return;
    el.hidden = true;
    document.body.style.overflow = '';
    if (name === 'voice') stopListening();
  }

  /* ---------------- edit sheet ---------------- */
  function openEdit(entry, opts) {
    opts = opts || {};
    State.edit = {
      entry: normalizeEntry(entry),
      isNew: !!opts.isNew,
      type: (entry.type === 'income') ? 'income' : 'expense',
      category: entry.category || 'Other',
      payment: entry.payment || 'cash'
    };

    $('#editTitle').textContent = opts.isNew ? 'Naya entry' : 'Entry badlein';
    $('#fAmount').value = entry.amount ? entry.amount : '';
    $('#fDate').value = entry.date || todayISO();
    $('#fNote').value = entry.note || '';
    $('#editDelete').hidden = !!opts.isNew;
    $('#editHint').textContent = opts.hint || '';

    renderTypeSeg();
    renderCatChips();
    renderPayChips();
    openSheet('edit');

    if (!entry.amount) setTimeout(function () { $('#fAmount').focus(); }, 260);
  }

  function renderTypeSeg() {
    $$('#typeSeg button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-type') === State.edit.type);
    });
  }

  function renderCatChips() {
    var type = State.edit.type;
    var cats = P.categoriesFor(type);
    var html = cats.map(function (c) {
      return '<button type="button" data-cat="' + esc(c.name) + '"' +
        (c.name === State.edit.category ? ' class="on"' : '') + '>' +
        c.icon + ' ' + esc(c.name) + '</button>';
    }).join('');
    $('#catChips').innerHTML = html;
  }

  function renderPayChips() {
    $$('#payChips button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-pay') === State.edit.payment);
    });
  }

  function saveEdit() {
    if (!State.edit) return;
    var amt = parseFloat($('#fAmount').value);
    if (!amt || amt <= 0) { toast('Amount daalein'); $('#fAmount').focus(); return; }

    var entry = {
      id: State.edit.entry.id,
      createdAt: State.edit.entry.createdAt,
      amount: Math.round(amt * 100) / 100,
      date: $('#fDate').value || todayISO(),
      note: $('#fNote').value.trim(),
      type: State.edit.type,
      category: State.edit.category,
      payment: State.edit.payment
    };

    var isNew = State.edit.isNew;
    closeSheet('edit');
    commit(entry, isNew);
  }

  /* ---------------- voice ---------------- */
  var rec = null, recActive = false;

  function voiceSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function setVoiceStatus(t) { $('#voiceStatus').textContent = t; }

  function startListening() {
    if (recActive) { stopListening(); return; }

    if (!voiceSupported()) {
      setVoiceStatus('Is browser me voice support nahi hai — Chrome kholein ya neeche type karein.');
      return;
    }

    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    rec = new SR();
    rec.lang = State.cfg.lang || 'hi-IN';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onstart = function () {
      recActive = true;
      $('#micBig').classList.add('listening');
      setVoiceStatus('Sun raha hoon… bolein');
      $('#voiceHeard').textContent = '';
    };

    rec.onresult = function (ev) {
      var interim = '', finalText = '';
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalText += t; else interim += t;
      }
      if (interim) $('#voiceHeard').textContent = interim;
      if (finalText) {
        $('#voiceHeard').textContent = finalText;
        stopListening();
        handleCommand(finalText);
      }
    };

    rec.onerror = function (ev) {
      recActive = false;
      $('#micBig').classList.remove('listening');
      var map = {
        'not-allowed': 'Mic ki permission nahi mili. Browser settings me allow karein.',
        'service-not-allowed': 'Mic blocked hai. HTTPS par kholna padega.',
        'no-speech': 'Kuch sunai nahi diya — dobara bolein.',
        'network': 'Internet nahi mila. Voice ke liye online hona zaroori hai.',
        'audio-capture': 'Mic nahi mila.',
        'aborted': 'Ruk gaya.'
      };
      setVoiceStatus(map[ev.error] || ('Error: ' + ev.error));
    };

    rec.onend = function () {
      recActive = false;
      $('#micBig').classList.remove('listening');
      if ($('#voiceStatus').textContent === 'Sun raha hoon… bolein') {
        setVoiceStatus('Mic par tap karein');
      }
    };

    try {
      rec.start();
      if (navigator.vibrate) navigator.vibrate(18);
    } catch (e) {
      setVoiceStatus('Mic shuru nahi hua — dobara tap karein.');
    }
  }

  function stopListening() {
    if (rec) {
      try { rec.stop(); } catch (e) {}
    }
    recActive = false;
    var mic = $('#micBig');
    if (mic) mic.classList.remove('listening');
  }

  function handleCommand(text) {
    text = String(text || '').trim();
    if (!text) return;

    var parsed = P.parse(text);
    closeSheet('voice');

    var hint = 'Suna: “' + text + '”';
    if (!parsed.amount) hint += ' · amount nahi mila, khud daal dein.';

    openEdit({
      id: newId(),
      date: parsed.date,
      type: parsed.type,
      category: parsed.category,
      amount: parsed.amount,
      note: parsed.note,
      payment: parsed.payment,
      createdAt: new Date().toISOString()
    }, { isNew: true, hint: hint });
  }

  /* ---------------- export ---------------- */
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCsv() {
    var list = monthEntries().slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    if (!list.length) { toast('Is mahine koi entry nahi'); return; }

    var rows = [['Date', 'Type', 'Category', 'Amount', 'Note', 'Payment']];
    list.forEach(function (e) {
      rows.push([e.date, e.type, e.category, e.amount, e.note, e.payment]);
    });

    var csv = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hisaab-' + monthKey() + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('CSV download ho gayi');
  }

  /* ---------------- connect ---------------- */
  function connect() {
    var url = $('#apiUrl').value.trim();
    var pass = $('#apiPass').value;

    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(url) && !/^https?:\/\//.test(url)) {
      $('#connMsg').textContent = 'URL galat lag raha hai. /exec par khatam hone wala Apps Script URL daalein.';
      return;
    }

    $('#connMsg').textContent = 'Connect ho raha hai…';
    $('#btnConnect').disabled = true;

    API.setConfig(url, '');

    API.auth(pass)
      .then(function (res) {
        if (!res || res.ok === false) throw new Error((res && (res.message || res.error)) || 'Connect nahi hua');
        State.cfg.apiUrl = url;
        State.cfg.token = res.token || API.token || '';
        State.cfg.seeded = true;
        saveCfg();
        $('#connMsg').textContent = res.open ? 'Connected (koi password set nahi hai).' : 'Connected ✓';
        return sync({ manual: true });
      })
      .then(function () {
        if (State.conn === 'ok') {
          $('#connMsg').textContent = 'Connected ✓ ' + State.entries.length + ' entry mili.';
          toast('Sheet connect ho gaya ✓');
        }
      })
      .catch(function (err) {
        API.setConfig('', '');
        $('#connMsg').textContent = err.message || 'Connect nahi hua';
        setConn('demo');
      })
      .then(function () { $('#btnConnect').disabled = false; });
  }

  /* ---------------- theme ---------------- */
  function applyTheme(t) {
    State.cfg.theme = t === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', State.cfg.theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', State.cfg.theme === 'dark' ? '#0A1119' : '#0D9488');
    $$('#themeSeg button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-theme') === State.cfg.theme);
    });
    saveCfg();
  }

  /* ---------------- demo data ---------------- */
  function seedDemo() {
    var y = State.month.y, m = State.month.m;
    function d(day) { return y + '-' + pad(m + 1) + '-' + pad(day); }
    var today = new Date().getDate();
    var maxDay = Math.max(1, Math.min(today, new Date(y, m + 1, 0).getDate()));

    function day(p) { return Math.max(1, Math.min(maxDay, Math.round(maxDay * p))); }

    var demo = [
      { date: d(1), type: 'income', category: 'Salary', amount: 24000, note: 'monthly salary', payment: 'bank' },
      { date: d(day(.2)), type: 'expense', category: 'Rent', amount: 6000, note: 'ghar ka kiraya', payment: 'upi' },
      { date: d(day(.25)), type: 'expense', category: 'Grocery', amount: 1450, note: 'mahine ka kirana', payment: 'upi' },
      { date: d(day(.35)), type: 'expense', category: 'Food', amount: 60, note: 'chai aur samosa', payment: 'cash' },
      { date: d(day(.45)), type: 'expense', category: 'Travel', amount: 320, note: 'petrol', payment: 'upi' },
      { date: d(day(.55)), type: 'expense', category: 'Bills', amount: 890, note: 'bijli ka bill', payment: 'upi' },
      { date: d(day(.62)), type: 'income', category: 'Freelance', amount: 5000, note: 'website project', payment: 'bank' },
      { date: d(day(.7)), type: 'expense', category: 'Health', amount: 450, note: 'dawa', payment: 'cash' },
      { date: d(day(.78)), type: 'expense', category: 'Shopping', amount: 1200, note: 'kapde', payment: 'card' },
      { date: d(day(.85)), type: 'expense', category: 'Food', amount: 240, note: 'family dinner', payment: 'upi' },
      { date: d(day(.92)), type: 'expense', category: 'Education', amount: 1500, note: 'school fees', payment: 'bank' }
    ];

    State.entries = demo.map(function (e, i) {
      return normalizeEntry(Object.assign({ id: 'demo' + i, createdAt: new Date().toISOString() }, e));
    });
    State.cfg.seeded = true;
    saveCfg();
    saveEntries();
  }

  /* ---------------- events ---------------- */
  function bind() {
    $$('.bottomnav button').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.getAttribute('data-view')); });
    });

    $('#prevMonth').addEventListener('click', function () { shiftMonth(-1); });
    $('#nextMonth').addEventListener('click', function () { shiftMonth(1); });

    $('#addBtn').addEventListener('click', function () {
      openEdit({
        id: newId(),
        date: todayISO(),
        type: 'expense',
        category: 'Food',
        amount: 0,
        note: '',
        payment: 'cash',
        createdAt: new Date().toISOString()
      }, { isNew: true });
    });

    $('#fab').addEventListener('click', function () {
      openSheet('voice');
      setVoiceStatus('Mic par tap karein');
      $('#voiceHeard').textContent = '';
      $('#cmdInput').value = '';
      setTimeout(startListening, 320);
    });

    // close buttons
    $$('[data-close]').forEach(function (el) {
      el.addEventListener('click', function () { closeSheet(el.getAttribute('data-close')); });
    });

    // voice
    $('#micBig').addEventListener('click', startListening);
    $('#cmdGo').addEventListener('click', function () { handleCommand($('#cmdInput').value); });
    $('#cmdInput').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); handleCommand($('#cmdInput').value); }
    });
    $$('.chip-eg').forEach(function (b) {
      b.addEventListener('click', function () { handleCommand(b.getAttribute('data-eg')); });
    });

    // edit
    $('#typeSeg').addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b || !State.edit) return;
      var t = b.getAttribute('data-type');
      if (t === State.edit.type) return;
      State.edit.type = t;
      var cats = P.categoriesFor(t);
      State.edit.category = cats.length ? cats[0].name : (t === 'income' ? 'Other Income' : 'Other');
      renderTypeSeg();
      renderCatChips();
    });

    $('#catChips').addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b || !State.edit) return;
      State.edit.category = b.getAttribute('data-cat');
      renderCatChips();
    });

    $('#payChips').addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b || !State.edit) return;
      State.edit.payment = b.getAttribute('data-pay');
      renderPayChips();
    });

    $('#editSave').addEventListener('click', saveEdit);

    $('#editDelete').addEventListener('click', function () {
      if (!State.edit) return;
      if (!window.confirm('Ye entry delete karni hai?')) return;
      var id = State.edit.entry.id;
      closeSheet('edit');
      removeEntry(id);
    });

    // report interactions
    $('#catSeg').addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      State.catType = b.getAttribute('data-type');
      $$('#catSeg button').forEach(function (x) { x.classList.toggle('on', x === b); });
      renderDonut(monthEntries());
    });

    document.addEventListener('click', function (ev) {
      var catRow = ev.target.closest('.cat-row');
      if (catRow) {
        State.filterCat = catRow.getAttribute('data-cat');
        State.filterType = catRow.getAttribute('data-type') || '';
        $('#filterType').value = State.filterType;
        setView('entries');
        renderEntries();
        return;
      }
      var tx = ev.target.closest('.tx');
      if (tx) {
        var id = tx.getAttribute('data-id');
        var entry = State.entries[idxOf(id)];
        if (entry) openEdit(entry, { isNew: false });
      }
    });

    // entries filters
    $('#searchInput').addEventListener('input', function (ev) {
      State.search = ev.target.value;
      renderEntries();
    });
    $('#filterType').addEventListener('change', function (ev) {
      State.filterType = ev.target.value;
      renderEntries();
    });
    $('#filterChipClear').addEventListener('click', function () {
      State.filterCat = '';
      renderEntries();
    });

    // settings
    $('#btnConnect').addEventListener('click', connect);
    $('#demoBannerBtn').addEventListener('click', function () {
      setView('settings');
      $('#apiUrl').focus();
    });
    $('#btnSync').addEventListener('click', function () { sync({ manual: true }); });
    $('#btnExport').addEventListener('click', exportCsv);
    $('#btnReset').addEventListener('click', function () {
      if (!window.confirm('Local cache clear karein? Sheet ka data safe rahega.')) return;
      State.entries = [];
      State.queue = [];
      saveEntries(); saveQueue(); render();
      toast('Local cache clear ho gaya');
    });
    $('#langSel').addEventListener('change', function (ev) {
      State.cfg.lang = ev.target.value;
      saveCfg();
    });
    $('#themeSeg').addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      applyTheme(b.getAttribute('data-theme'));
    });

    window.addEventListener('online', function () { if (API.isConfigured()) sync(); });
  }

  /* ---------------- init ---------------- */
  function init() {
    load();
    applyTheme(State.cfg.theme);

    API.setConfig(State.cfg.apiUrl, State.cfg.token);
    $('#apiUrl').value = State.cfg.apiUrl || '';
    $('#langSel').value = State.cfg.lang || 'hi-IN';

    if (!State.cfg.apiUrl && !State.entries.length && !State.cfg.seeded) seedDemo();

    bind();
    render();

    if (API.isConfigured()) {
      sync();
    } else {
      setConn('demo');
    }

    // service worker (https/localhost par hi chalta hai)
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
