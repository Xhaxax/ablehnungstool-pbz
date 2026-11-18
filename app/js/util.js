/* Hilfsfunktionen */
window.TA = window.TA || {};
(function (TA) {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  TA.esc = (v) => (v === null || v === undefined ? '' : String(v)).replace(/[&<>"']/g, (c) => ESC[c]);

  TA.uid = (p) => (p || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  TA.isoToday = () => new Date().toISOString().slice(0, 10);
  TA.nowIso = () => new Date().toISOString();

  TA.fmtDate = (iso) => {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso);
  };
  TA.fmtDateTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' +
      d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
  };
  TA.fmtTime = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
  };
  TA.fmtNum = (n, dec = 0) => (n === null || n === undefined || isNaN(n)) ? '–' :
    Number(n).toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  TA.fmtPct = (n) => (n === null || isNaN(n)) ? '–' : TA.fmtNum(n * 100, 0) + ' %';

  /* "05.08.26", "5.8.2026", "2026-08-05" -> ISO */
  TA.parseDate = (s) => {
    if (!s) return '';
    if (s instanceof Date) return isNaN(s) ? '' : s.toISOString().slice(0, 10);
    s = String(s).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (m) {
      let y = +m[3]; if (y < 100) y += 2000;
      return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    }
    const d = new Date(s);
    return isNaN(d) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  TA.excelDate = (v) => {
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      const d = new Date(Math.round((v - 25569) * 86400000));
      return d.toISOString().slice(0, 10);
    }
    return TA.parseDate(v);
  };
  TA.daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
  TA.addDays = (iso, n) => { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  TA.monthKey = (iso) => (iso || '').slice(0, 7);
  TA.monthLabel = (key) => {
    const [y, m] = key.split('-');
    return ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'][+m - 1] + ' ' + y.slice(2);
  };

  /* Standort-ID vereinheitlichen: "B148 D", "b148-d", "0W2j-W" -> "B148-D" */
  TA.normStandort = (s) => {
    if (!s) return '';
    const t = String(s).trim().toUpperCase().replace(/\s+/g, ' ');
    const m = t.match(/^([0-9A-Z]{4})[\s\-_.]?([A-Z])\b/);
    return m ? `${m[1]}-${m[2]}` : t;
  };
  TA.initials = (name) => (name || '?').split(/[\s.\-]+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  TA.reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  TA.norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/\s+/g, ' ').trim();

  TA.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  TA.clone = (o) => JSON.parse(JSON.stringify(o));
  TA.uniq = (arr) => [...new Set(arr.filter((x) => x !== null && x !== undefined && x !== ''))];
  TA.sortDe = (arr) => arr.slice().sort((a, b) => String(a).localeCompare(String(b), 'de'));
  TA.groupCount = (arr, keyFn) => {
    const m = new Map();
    arr.forEach((x) => { const k = keyFn(x); if (k === null || k === undefined || k === '') return; m.set(k, (m.get(k) || 0) + (x._w || 1)); });
    return m;
  };

  /* Toasts */
  TA.toast = (msg, opts = {}) => {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'toast' + (opts.error ? ' err' : '');
    el.innerHTML = `<span>${TA.esc(msg)}</span>` + (opts.action ? `<button type="button">${TA.esc(opts.action)}</button>` : '');
    if (opts.action) el.querySelector('button').onclick = () => { el.remove(); opts.onAction && opts.onAction(); };
    box.appendChild(el);
    setTimeout(() => el.remove(), opts.ms || (opts.action ? 8000 : 3500));
  };

  /* Modaler Dialog. body: HTML, buttons: [{label, cls, value}] -> Promise<value|null> */
  TA.modal = (title, body, buttons, opts = {}) => new Promise((resolve) => {
    const prev = document.activeElement;
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal${opts.wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="mdl-t">
      <h2 id="mdl-t">${TA.esc(title)}</h2><div class="mdl-body">${body}</div>
      <div class="actions">${(buttons || []).map((b, i) => `<button type="button" class="btn ${b.cls || 'btn-secondary'}" data-i="${i}">${TA.esc(b.label)}</button>`).join('')}</div></div>`;
    const close = (v) => { bg.remove(); document.removeEventListener('keydown', onKey, true); if (prev && prev.focus) prev.focus(); resolve(v); };
    const onKey = (e) => {
      if (e.key === 'Escape' && !opts.noEsc) { e.preventDefault(); close(null); }
      if (e.key === 'Tab') {
        const f = [...bg.querySelectorAll('button,input,select,textarea,a[href]')].filter((x) => !x.disabled);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    bg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (b) { const btn = buttons[+b.dataset.i]; const v = btn.value !== undefined ? btn.value : btn.label; if (opts.validate && v && opts.validate(bg, v) === false) return; close(opts.collect && v ? opts.collect(bg, v) : v); }
      else if (e.target === bg && !opts.noEsc) close(null);
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(bg);
    if (opts.onOpen) opts.onOpen(bg, close);
    const first = bg.querySelector('input,select,textarea') || bg.querySelector('.actions .btn-primary') || bg.querySelector('button');
    if (first) first.focus();
  });
  TA.confirm = (title, text, okLabel = 'Bestätigen', danger = false) =>
    TA.modal(title, `<p>${text}</p>`, [{ label: 'Abbrechen', value: null, cls: 'btn-ghost' }, { label: okLabel, value: true, cls: danger ? 'btn-danger' : 'btn-primary' }]);

  TA.download = (name, blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  TA.icons = {
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18M7 15v3M12 9v9M17 5v13"/></svg>',
    bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
    printer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>',
    tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>',
    scissors: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/></svg>',
    split: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M8 3H3v5M21 3l-7 7M3 3l7 7M12 22V12"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
    database: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/></svg>',
    briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M7 21h10M5 7h14M5 7l-3 7a4 4 0 0 0 6 0L5 7zM19 7l-3 7a4 4 0 0 0 6 0l-3-7z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="M22 4 12 14l-3-3"/></svg>',
    inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>',
    collapse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M3 21v-5h5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 15 5 5 5-5M7 9l5-5 5 5"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>',
    move: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    merge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>',
    graduation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>'
  };
  /* passendes Icon zu einem Titel (Kartentitel, Tabs) */
  const TITLE_ICONS = [
    [/^\s*meine\s+(ü|ue)bersicht|(ü|ue)bersicht zeigt/i, 'grid'], [/dauerfilter/i, 'sliders'], [/eigene kacheln/i, 'layers'], [/eigene regel/i, 'bulb'],
    [/benutzer|^\s*zeichner/i, 'users'], [/rollen|^\s*qs/i, 'shield'], [/^\s*clusterinfo/i, 'grid'], [/^\s*planvariante/i, 'file'], [/auswahllist/i, 'list'],
    [/regel|empfehl|schritte/i, 'bulb'], [/hauptkategor/i, 'layers'], [/kategor|fehlerart/i, 'tag'],
    [/^\s*daten\s*(&|und)/i, 'database'], [/mail/i, 'mail'], [/verlauf|zuletzt/i, 'clock'],
    [/fehlerpunkt|offene/i, 'alert'], [/projekt|personen/i, 'briefcase'], [/ursache|vereinbar/i, 'target'],
    [/heatmap/i, 'grid'], [/monat|zeitraum/i, 'calendar'], [/verschuld/i, 'scale'], [/cluster/i, 'pin'],
    [/plan/i, 'file'], [/maßnahm/i, 'check'], [/häufig|top/i, 'chart'], [/so geht/i, 'bulb']
  ];
  TA.iconFor = (text) => { const m = TITLE_ICONS.find(([re]) => re.test(text || '')); return m ? TA.icons[m[1]] : ''; };
})(window.TA);
