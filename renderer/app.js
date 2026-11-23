'use strict';
const store = window.api || {
  load: async () => JSON.parse(localStorage.getItem('db') || 'null'),
  save: async d => localStorage.setItem('db', JSON.stringify(d)),
  backup: async d => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d)])); a.download = 'backup.json'; a.click(); return true; },
  restore: async () => null,
  xlsx: async () => false
};

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ymOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const hms = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad(s / 3600 | 0)}:${pad(s % 3600 / 60 | 0)}:${pad(s % 60)}`; };
const hm = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const mins = t => { const [h, m] = (t || '0:0').split(':'); return +h * 60 + +m; };
const money = v => `${v.toFixed(2)} ${db.biz.cur}`;
const save = () => store.save(db);
const emp = id => db.emps.find(e => e.id === (id || S.eid));
const setPath = (o, p, v) => { const k = p.split('.'); const l = k.pop(); k.forEach(x => o = o[x]); o[l] = v; };

const newDb = () => ({ admin: '0000', biz: { name: '', cur: '₪', ms: 1 }, emps: [], shifts: [] });
const newEmp = (name, code) => ({
  id: uid(), name, code, rate: 0,
  tierOn: false, tierH: 8, tierR: 0,
  todOn: false, todT: '17:00', todR: 0,
  brkOn: false, brkMin: 15, brkMode: 'a',
  priv: { hide: false, hideH: false, hideP: false, period: 'm' }
});

let db, S = { scr: 'home' }, Rp = { ym: '', rep: 'all' };

/* ---------- calculations ---------- */
const shiftsOf = (e, key) => db.shifts.filter(s => s.e === e.id && dk(new Date(s.i)) === key).sort((a, b) => a.i - b.i);

function dayCalc(e, key, now) {
  const ss = shiftsOf(e, key);
  if (!ss.length) return { ms: 0, pay: 0 };
  const iv = [];
  ss.forEach((s, k) => {
    iv.push([s.i, s.o || now]);
    const n = ss[k + 1];
    if (n && s.o && e.brkOn) {
      const al = e.brkMin * 6e4, gap = n.i - s.o;
      if (gap <= al) iv.push([s.o, n.i]);
      else if (e.brkMode === 'a') iv.push([s.o, s.o + al]);
    }
  });
  let ms = 0, pay = 0;
  iv.forEach(([a, b]) => {
    for (let t = a; t < b; t += 6e4) {
      const d = Math.min(6e4, b - t);
      let r = e.rate;
      if (e.tierOn && ms >= e.tierH * 36e5) r = e.tierR;
      if (e.todOn) { const x = new Date(t); if (x.getHours() * 60 + x.getMinutes() >= mins(e.todT)) r = e.todR; }
      pay += r * d / 36e5; ms += d;
    }
  });
  return { ms, pay };
}

const pStart = d => { const D = db.biz.ms; return d.getDate() >= D ? new Date(d.getFullYear(), d.getMonth(), D) : new Date(d.getFullYear(), d.getMonth() - 1, D); };

function monthCalc(e, start, now) {
  let ms = 0, pay = 0;
  const end = new Date(start.getFullYear(), start.getMonth() + 1, start.getDate());
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const c = dayCalc(e, dk(d), now); ms += c.ms; pay += c.pay;
  }
  return { ms, pay };
}

/* ---------- views ---------- */
function home() {
  const vis = db.emps.filter(e => !e.priv.hide);
  return `<div class="center"><h1 class="title">${esc(db.biz.name || 'שעון נוכחות')}</h1>
  <div class="login"><input id="code" type="password" inputmode="numeric" placeholder="הזנת קוד" autocomplete="off"><button data-a="login">כניסה</button></div>
  <div class="msg err">${S.err || ''}</div>
  ${!db.emps.length ? '<p class="msg">אין עדיין עובדים</p>' : `<div class="grid">${vis.map(card).join('')}</div>`}</div>`;
}

function card(e) {
  const p = e.priv;
  const blk = (k, lab) => `<div class="cl"><small>${lab}</small>
    ${p.hideH ? '' : `<div class="t" data-t="h${k}:${e.id}">00:00:00</div>`}
    ${p.hideP ? '' : `<div class="t p" data-t="p${k}:${e.id}">0.00</div>`}</div>`;
  return `<div class="emp"><h3>${esc(e.name)}</h3>
    ${p.period !== 'd' ? blk('m', 'החודש') : ''}${p.period !== 'm' ? blk('d', 'היום') : ''}</div>`;
}

function empView(e, edit) {
  const day = S.day, today = dk(new Date());
  const ss = shiftsOf(e, day);
  const open = db.shifts.some(s => s.e === e.id && !s.o);
  const satNow = new Date().getDay() === 6, satSel = new Date(day + 'T12:00').getDay() === 6;
  const rows = ss.map((s, i) => edit
    ? `<div class="shift"><b>משמרת ${i + 1}</b><input type="time" value="${hm(s.i)}" data-s="${s.id}" data-f="i"><input type="time" value="${s.o ? hm(s.o) : ''}" data-s="${s.id}" data-f="o"><button class="ghost" data-a="delshift" data-id="${s.id}">מחיקה</button></div>`
    : `<div class="shift"><b>משמרת ${i + 1}</b><span>כניסה ${hm(s.i)}</span><span>${s.o ? 'יציאה ' + hm(s.o) : 'במשמרת'}</span></div>`).join('');
  const p = e.priv, off = p.hide;
  const tg = (f, v, dis) => `<label class="sw"><input type="checkbox" data-e="${e.id}" data-f="${f}" ${v ? 'checked' : ''} ${dis ? 'disabled' : ''}><i></i></label>`;
  const panel = S.panel && !edit ? `<aside class="drawer"><div class="bar"><h3 style="flex:1">הגדרות אישיות</h3><button class="ghost" data-a="panel">סגירה</button></div>
    <p><b>מה יוצג עליי במסך הראשי</b></p>
    <div class="list">
      <div class="row"><span>הסתר אותי משאר העובדים</span>${tg('priv.hide', p.hide)}</div>
      <div class="row"><span>הסתר את השעות שלי</span>${tg('priv.hideH', p.hideH, off)}</div>
      <div class="row"><span>הסתר את השכר שלי</span>${tg('priv.hideP', p.hideP, off)}</div>
      <div class="row"><span>תקופת תצוגה</span><select data-e="${e.id}" data-f="priv.period" ${off ? 'disabled' : ''}>
        <option value="m" ${p.period === 'm' ? 'selected' : ''}>נתוני החודש</option>
        <option value="d" ${p.period === 'd' ? 'selected' : ''}>נתוני היום</option>
        <option value="dm" ${p.period === 'dm' ? 'selected' : ''}>היום והחודש</option></select></div>
    </div></aside>` : '';
  return `<div class="center">
  <div class="bar"><button class="ghost back" data-a="${edit ? 'backemp' : 'home'}">→</button><h2>${esc(e.name)}${edit ? ' (מצב עריכה)' : ''}</h2>${edit ? '' : '<button class="ghost" data-a="panel">הגדרות אישיות</button>'}</div>
  <div class="clock"><div class="big" data-t="clock:">00:00:00</div><div>${new Date().toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div></div>
  ${edit ? '' : `<div class="btns"><button data-a="in" ${open || satNow ? 'disabled' : ''}>כניסה</button><button class="danger" data-a="out" ${open ? '' : 'disabled'}>יציאה</button></div>`}
  <div class="dayrow"><label>תאריך: <input type="date" value="${day}" data-a2="day"></label></div>
  <div class="two">
    <div class="box"><small>${day === today ? 'היום' : day}</small><div class="t" data-t="hs:${e.id}">00:00:00</div><div class="t p" data-t="ps:${e.id}">0.00</div></div>
    <div class="box"><small>החודש</small><div class="t" data-t="hm:${e.id}">00:00:00</div><div class="t p" data-t="pm:${e.id}">0.00</div></div>
  </div>
  <div class="box"><h3>משמרות</h3>${rows || '<p class="msg">אין משמרות ביום זה</p>'}
  ${edit ? `<button class="plus" data-a="addshift" ${satSel ? 'disabled' : ''}>הוספת משמרת</button>` : ''}</div>${panel}</div>`;
}

const row = (l, c, cls = '') => `<div class="row ${cls}"><span>${l}</span>${c}</div>`;
const tog = (e, f) => `<label class="sw"><input type="checkbox" data-e="${e.id}" data-f="${f}" ${e[f] ? 'checked' : ''}><i></i></label>`;
const num = (e, f) => `<input type="number" step="any" data-e="${e.id}" data-f="${f}" value="${e[f]}">`;

function setView(e) {
  return `<div class="bar"><button class="ghost back" data-a="backemps">→</button><h2>${esc(e.name)}</h2></div>
  <div class="list">
    ${row('תעריף לשעה', num(e, 'rate'))}
    ${row('שינוי תעריף לפי כמות שעות עבודה', tog(e, 'tierOn'))}
    ${e.tierOn ? row('לאחר כמה שעות', num(e, 'tierH'), 'sub') + row('התעריף החדש', num(e, 'tierR'), 'sub') : ''}
    ${row('שינוי תעריף לפי שעה ביום', tog(e, 'todOn'))}
    ${e.todOn ? row('משעה', `<input type="time" data-e="${e.id}" data-f="todT" value="${e.todT}">`, 'sub') + row('התעריף החדש', num(e, 'todR'), 'sub') : ''}
    ${row('מצב הפסקה', tog(e, 'brkOn'))}
    ${e.brkOn ? row('משך הפסקה מותר (דקות)', num(e, 'brkMin'), 'sub') + row('במקרה של חריגה', `<select data-e="${e.id}" data-f="brkMode" style="width:260px"><option value="a" ${e.brkMode === 'a' ? 'selected' : ''}>משולם עד משך ההפסקה המותר</option><option value="b" ${e.brkMode === 'b' ? 'selected' : ''}>ההפסקה אינה משולמת</option></select>`, 'sub') : ''}
    <div class="row btn" data-a="editemp"><span>עריכת דף העובד</span><span>‹</span></div>
    <div class="row btn" data-a="delemp"><span style="color:var(--warn)">מחיקת עובד</span></div>
  </div>`;
}

const addView = () => `<div class="bar"><button class="ghost back" data-a="backemps">→</button><h2>הוספת עובד</h2></div>
  <div class="list">${row('שם העובד', '<input type="text" id="nn">')}${row('קוד אישי', '<input type="text" id="nc" inputmode="numeric">')}</div>
  <div class="msg err">${S.err || ''}</div><button data-a="saveemp">שמירה</button>`;

const TABS = [['ov', 'סקירה כללית'], ['emps', 'עובדים'], ['exp', 'ייצוא והדפסה'], ['biz', 'הגדרות עסק'], ['dat', 'נתונים ואבטחה']];
const tabs = {
  ov() {
    const now = Date.now(), open = db.shifts.filter(s => !s.o), st = pStart(new Date());
    let tm = 0, tp = 0;
    db.emps.forEach(e => { const c = monthCalc(e, st, now); tm += c.ms; tp += c.pay; });
    return `<h2>סקירה כללית</h2><div class="stat" style="margin-top:14px">
      <div class="box"><small>במשמרת כעת</small><div class="t">${open.length}</div></div>
      <div class="box"><small>שעות החודש</small><div class="t">${hms(tm)}</div></div>
      <div class="box"><small>שכר החודש</small><div class="t p">${money(tp)}</div></div></div>
      <div class="list">${open.length ? open.map(s => { const e = emp(s.e); return `<div class="row"><b>${esc(e ? e.name : '')}</b><span>נכנס ב-${hm(s.i)}</span><span>${hms(now - s.i)}</span></div>`; }).join('') : '<div class="row"><span>אין כרגע עובדים במשמרת</span></div>'}</div>`;
  },
  emps() {
    return `<h2>עובדים</h2><div class="list" style="margin-top:14px">${db.emps.map(e => `<div class="row btn" data-a="setemp" data-id="${e.id}"><b>${esc(e.name)}</b><span>‹</span></div>`).join('') || '<div class="row"><span>אין עדיין עובדים</span></div>'}</div>
      <button class="plus" data-a="addemp" aria-label="הוספת עובד">+</button>`;
  },
  exp() {
    return `<h2>ייצוא והדפסה</h2><div class="list" style="margin:14px 0">
      ${row('חודש', `<input type="month" value="${Rp.ym}" data-a2="ym">`)}
      ${row('דוח עבור', `<select data-a2="rep"><option value="all">כל העובדים</option>${db.emps.map(e => `<option value="${e.id}" ${Rp.rep === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select>`)}</div>
      <div class="btns" style="justify-content:start"><button data-a="xlsx">ייצוא לאקסל</button><button class="ghost" data-a="print">הדפסה</button></div>`;
  },
  biz() {
    return `<h2>הגדרות עסק</h2><div class="list" style="margin-top:14px">
      ${row('שם העסק', `<input type="text" data-b="name" value="${esc(db.biz.name)}">`)}
      ${row('מטבע', `<select data-b="cur">${['₪', '$', '€', '£'].map(c => `<option ${db.biz.cur === c ? 'selected' : ''}>${c}</option>`).join('')}</select>`)}
      ${row('יום תחילת חודש (1–28)', `<input type="number" min="1" max="28" data-b="ms" value="${db.biz.ms}">`)}</div>`;
  },
  dat() {
    return `<h2>נתונים ואבטחה</h2><div class="list" style="margin-top:14px">
      ${row('שינוי קוד מנהל', '<span style="display:flex;gap:8px"><input type="text" id="ncode" inputmode="numeric" placeholder="קוד חדש"><button data-a="chgcode">שמירה</button></span>')}
      <div class="row btn" data-a="backup"><span>הורדת קובץ גיבוי</span></div>
      <div class="row btn" data-a="restore"><span>טעינת קובץ גיבוי</span></div></div>
      <div class="msg">${S.err || ''}</div>`;
  }
};

function admin() {
  if (S.sub === 'edit') return empView(emp(), true);
  if (S.sub) return `<div class="center">${S.sub === 'add' ? addView() : setView(emp())}</div>`;
  return `<div class="layout"><nav class="side">${TABS.map(([k, n]) => `<button data-a="tab" data-id="${k}" class="${S.tab === k ? 'on' : ''}">${n}</button>`).join('')}<div class="sp"></div><button data-a="home">יציאה</button></nav><main class="main">${tabs[S.tab]()}</main></div>`;
}

function render() {
  const m0 = $('.main'), st = m0 ? m0.scrollTop : 0, w = window.scrollY;
  $('#app').innerHTML = S.scr === 'home' ? home() : S.scr === 'emp' ? empView(emp(), false) : admin();
  S.err = '';
  const m1 = $('.main'); if (m1) m1.scrollTop = st;
  window.scrollTo(0, w);
  tick();
  const c = $('#code'); if (c) c.focus();
}

function tick() {
  const now = Date.now(), cache = {};
  document.querySelectorAll('[data-t]').forEach(el => {
    const [k, id] = el.dataset.t.split(':');
    if (k === 'clock') { el.textContent = new Date(now).toLocaleTimeString('he-IL', { hour12: false }); return; }
    const e = emp(id); if (!e) return;
    const key = k[1] + id;
    if (!cache[key]) cache[key] = k[1] === 'm' ? monthCalc(e, pStart(new Date(now)), now) : dayCalc(e, k[1] === 'd' ? dk(new Date(now)) : S.day, now);
    el.textContent = k[0] === 'h' ? hms(cache[key].ms) : money(cache[key].pay);
  });
}

/* ---------- reports ---------- */
function report() {
  const [y, m] = Rp.ym.split('-').map(Number), st = new Date(y, m - 1, db.biz.ms), now = Date.now();
  const end = new Date(y, m, db.biz.ms), title = `${db.biz.name || 'שעון נוכחות'} - דוח ${pad(m)}/${y}`;
  const e = emp(Rp.rep === 'all' ? '-' : Rp.rep), cur = `שכר (${db.biz.cur})`;
  let T = 0, P = 0;
  if (!e) {
    const rows = [['עובד', 'שעות', cur]];
    db.emps.forEach(x => { const c = monthCalc(x, st, now); T += c.ms; P += c.pay; rows.push([x.name, hms(c.ms), +c.pay.toFixed(2)]); });
    rows.push(['סה"כ', hms(T), +P.toFixed(2)]);
    return { title, rows };
  }
  const rows = [['תאריך', 'משמרות', 'שעות', cur]];
  for (let d = new Date(st); d < end; d.setDate(d.getDate() + 1)) {
    const k = dk(d), ss = shiftsOf(e, k); if (!ss.length) continue;
    const c = dayCalc(e, k, now); T += c.ms; P += c.pay;
    rows.push([k, ss.map(s => `${hm(s.i)}-${s.o ? hm(s.o) : ''}`).join(', '), hms(c.ms), +c.pay.toFixed(2)]);
  }
  rows.push(['סה"כ', '', hms(T), +P.toFixed(2)]);
  return { title: `${title} - ${e.name}`, rows };
}

/* ---------- actions ---------- */
const A = {
  login() {
    const c = $('#code').value.trim(); if (!c) return;
    if (c === db.admin) S = { scr: 'admin', tab: 'ov' };
    else {
      const e = db.emps.find(x => x.code === c);
      if (!e) { S.err = 'קוד שגוי. נסו שוב.'; return render(); }
      S = { scr: 'emp', eid: e.id, day: dk(new Date()) };
    }
    render();
  },
  home() { S = { scr: 'home' }; render(); },
  panel() { S.panel = !S.panel; render(); },
  in() { db.shifts.push({ id: uid(), e: S.eid, i: Date.now(), o: null }); save(); S.day = dk(new Date()); render(); },
  out() { const s = db.shifts.find(x => x.e === S.eid && !x.o); if (s) s.o = Date.now(); save(); render(); },
  tab(id) { S.tab = id; render(); },
  setemp(id) { S.sub = 'set'; S.eid = id; render(); },
  addemp() { S.sub = 'add'; render(); },
  backemps() { S.sub = null; render(); },
  backemp() { S.sub = 'set'; render(); },
  editemp() { S.sub = 'edit'; S.day = dk(new Date()); render(); },
  saveemp() {
    const n = $('#nn').value.trim(), c = $('#nc').value.trim();
    if (!n || !c) { S.err = 'יש להזין שם וקוד.'; return render(); }
    if (c === db.admin || db.emps.some(x => x.code === c)) { S.err = 'הקוד כבר בשימוש. בחרו קוד אחר.'; return render(); }
    db.emps.push(newEmp(n, c)); save(); S.sub = null; render();
  },
  delemp() {
    if (!confirm('למחוק את העובד ואת כל המשמרות שלו?')) return;
    db.emps = db.emps.filter(e => e.id !== S.eid); db.shifts = db.shifts.filter(s => s.e !== S.eid);
    save(); S.sub = null; render();
  },
  addshift() {
    const d = S.day;
    db.shifts.push({ id: uid(), e: S.eid, i: new Date(d + 'T09:00').getTime(), o: new Date(d + 'T17:00').getTime() });
    save(); render();
  },
  delshift(id) { db.shifts = db.shifts.filter(s => s.id !== id); save(); render(); },
  async xlsx() { const r = report(); await store.xlsx(r.rows, r.title.replace(/[\\/:*?"<>|]/g, '-')); },
  print() {
    const r = report();
    $('#print').innerHTML = `<h2>${esc(r.title)}</h2><table dir="rtl">${r.rows.map((x, i) => `<tr>${x.map(c => i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`).join('')}</tr>`).join('')}</table>`;
    window.print();
  },
  chgcode() {
    const c = $('#ncode').value.trim();
    if (!c || db.emps.some(e => e.code === c)) { S.err = 'הקוד ריק או כבר בשימוש אצל עובד.'; return render(); }
    db.admin = c; save(); S.err = 'הקוד עודכן.'; render();
  },
  async backup() { await store.backup(db); },
  async restore() {
    const d = await store.restore();
    if (!d || !d.emps || !d.shifts || !d.biz) { S.err = 'הקובץ אינו קובץ גיבוי תקין.'; return render(); }
    if (!confirm('הנתונים הקיימים יוחלפו. להמשיך?')) return;
    db = d; await save(); S.err = 'הנתונים נטענו.'; render();
  }
};

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-a]'); if (!el) return;
  const f = A[el.dataset.a]; if (f) f(el.dataset.id);
});
document.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.id === 'code') A.login(); });
document.addEventListener('change', ev => {
  const t = ev.target, d = t.dataset;
  const val = t.type === 'checkbox' ? t.checked : t.type === 'number' ? (parseFloat(t.value) || 0) : t.value;
  if (d.a2) { if (d.a2 === 'day') { S.day = val || dk(new Date()); render(); } else Rp[d.a2] = val; return; }
  if (d.b) { db.biz[d.b] = d.b === 'ms' ? Math.min(28, Math.max(1, Math.round(val) || 1)) : val; save(); return; }
  if (d.s) {
    const s = db.shifts.find(x => x.id === d.s), day = dk(new Date(s.i));
    if (d.f === 'i') { if (val) s.i = new Date(`${day}T${val}`).getTime(); }
    else { s.o = val ? new Date(`${day}T${val}`).getTime() : null; if (s.o && s.o < s.i) s.o += 864e5; }
    save(); render(); return;
  }
  if (d.e) {
    const e = emp(d.e); setPath(e, d.f, val);
    if (t.type === 'checkbox') { if (d.f === 'tierOn' && val) e.todOn = false; if (d.f === 'todOn' && val) e.tierOn = false; }
    save();
    if (t.type === 'checkbox' || t.tagName === 'SELECT') render();
  }
});

setInterval(tick, 1000);
(async () => {
  db = (await store.load()) || newDb();
  Rp.ym = ymOf(pStart(new Date()));
  render();
})();
