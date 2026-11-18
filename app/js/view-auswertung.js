/* Auswertung: Diagramme, Heatmap, PDF-Bericht */
(function (TA) {
  'use strict';
  const S = TA.store, app = TA.app, A = TA.analysis, esc = TA.esc;
  const KEY = 'ablehnungstool-auswertung';
  const defF = () => ({ zeitraum: '365', zeichner: '', qs: '', cluster: '', plan: '', mitUnberechtigt: false, heat: 'zeichner' });
  const getF = () => Object.assign(defF(), JSON.parse(sessionStorage.getItem(KEY) || '{}'));
  const setF = (f) => sessionStorage.setItem(KEY, JSON.stringify(f));
  const zeitVon = (z) => { const h = TA.isoToday(); if (!z) return ''; if (z === 'jahr') return h.slice(0, 4) + '-01-01'; return TA.addDays(h, -(+z)); };
  const zeitLabel = { '': 'gesamter Zeitraum', 90: 'letzte 90 Tage', 180: 'letzte 6 Monate', 365: 'letzte 12 Monate', jahr: 'dieses Jahr' };

  const drill = (rows, label) => app.openList({ ids: TA.uniq(rows.map((r) => r.a.id)), label });
  app.drill = drill;

  function bars(items, total, act) {
    const max = Math.max(1, ...items.map((i) => i.n));
    return `<div class="bars">${items.map((i, ix) => `<div class="row" data-act="${act}" data-i="${ix}" tabindex="0" role="button" aria-label="${esc(i.label)}: ${i.n} – Liste öffnen">
      <span title="${esc(i.label)}">${esc(i.label)}</span><div class="bar-wrap"><div class="bar${i.s ? ' s' : ''}" style="width:${(i.n / max) * 100}%"></div></div>
      <span class="num">${TA.fmtNum(i.n)}${total ? `<span class="cum"> · ${Math.round((i.n / total) * 100)} %</span>` : ''}</span></div>`).join('')}</div>`;
  }

  const auswertung = (el) => {
    const f = getF();
    const flt = { von: zeitVon(f.zeitraum), zeichner: f.zeichner, qs: f.qs, cluster: f.cluster, plan: f.plan, mitUnberechtigt: f.mitUnberechtigt };
    const rows = A.rows(flt);
    const k = A.kpis(flt);
    const total = A.sum(rows);
    const all = [...S.abl.values()].filter((a) => app.dauerOk(a));
    const opts = (key) => TA.sortDe(TA.uniq(all.map((a) => a[key]).filter(Boolean)));
    const sel = (id, key, label) => `<select class="select" id="${id}" aria-label="${label}"><option value="">${label}: alle</option>${opts(key).map((v) => `<option${f[id.slice(2)] === v ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>`;

    const hk = A.top(rows, (r) => r.hk).map(([id, n]) => ({ id, n, label: A.hkName(id) || 'ohne Kategorie' }));
    const fa = A.top(rows, (r) => r.fa, 10).map(([id, n]) => ({ id, n, label: A.faName(id) || 'ohne Fehlerart' }));
    let cum = 0; const top10 = fa.reduce((s, x) => s + x.n, 0);
    const mon = A.monthly({ ...flt, von: '' }, 12);
    const monMax = Math.max(1, ...mon.map((m) => m.n));
    const heat = A.heat(rows, f.heat);
    const versch = [['ja', 'durch uns verschuldet'], ['teilweise', 'teilweise verschuldet'], ['nein', 'nicht durch uns verschuldet']]
      .map(([v, l]) => ({ v, label: l, n: A.sum(rows.filter((r) => r.p.verschuldet === v)), s: v === 'nein' }));
    const cl = A.top(rows, (r) => r.a.cluster || '').map(([v, n]) => ({ v, n, label: v || 'ohne Cluster' }));
    const pl = A.top(rows, (r) => r.a.planvariante || '').map(([v, n]) => ({ v, n, label: v || 'ohne Planvariante' }));
    const PAL = ['#161E38', '#3A4772', '#7C86A6', '#D5B252', '#B9C0D4', '#8A5A00'];
    const sw = A.top(rows, (r) => r.p.schwere || '').map(([v, n]) => ({ v, n, label: v === 'major' ? 'Major' : v === 'minor' ? 'Minor' : 'nicht eingestuft', s: !v }));
    const st = A.top(rows, (r) => r.a.standortId || '', 8).map(([v, n]) => ({ v, n, label: v || 'ohne Standort' }));
    const pm = A.top(rows, (r) => r.a.prueferMinu || '', 8).map(([v, n]) => ({ v, n, label: v || 'unbekannt', s: !v }));
    const heute = TA.isoToday();
    const cur = A.rows({ ...flt, von: TA.addDays(heute, -90) });
    const prev = A.rows({ ...flt, von: TA.addDays(heute, -180), bis: TA.addDays(heute, -91) });
    const ins = [];
    const nCur = A.sum(cur), nPrev = A.sum(prev);
    if (nCur || nPrev) {
      const d = nCur - nPrev;
      ins.push({ lvl: d > 0 ? 'bad' : d < 0 ? 'ok' : 'info', icon: d > 0 ? 'alert' : 'check', t: d > 0 ? `Fehler steigen: ${nCur} in den letzten 90 Tagen (davor ${nPrev})` : d < 0 ? `Fehler sinken: ${nCur} in den letzten 90 Tagen (davor ${nPrev})` : `Fehlerzahl unverändert bei ${nCur}`, s: 'Vergleich: letzte 90 Tage gegen die 90 Tage davor', rows: cur, label: 'Letzte 90 Tage' });
    }
    if (fa.length && total) ins.push({ lvl: 'info', icon: 'tag', t: `„${fa[0].label}“ ist die häufigste Fehlerart`, s: `${fa[0].n}× – ${Math.round((fa[0].n / total) * 100)} % aller Fehler im Zeitraum`, rows: rows.filter((x) => x.fa === fa[0].id), label: fa[0].label });
    const zc = A.top(rows, (r) => r.zeichner || '').filter(([n]) => n);
    if (zc.length > 2) {
      const avg = zc.reduce((s, x) => s + x[1], 0) / zc.length;
      if (zc[0][1] >= avg * 1.5 && zc[0][1] >= 5) ins.push({ lvl: 'warn', icon: 'users', t: `${zc[0][0]} hat ${TA.fmtNum(zc[0][1] / avg, 1)}× so viele Fehler wie der Durchschnitt`, s: `${zc[0][1]} Fehler, Durchschnitt je Zeichner ${TA.fmtNum(avg, 1)}`, rows: rows.filter((x) => x.zeichner === zc[0][0]), label: zc[0][0] });
    }
    {
      const cm = new Map(A.top(cur, (r) => r.fa || '', 200)), pmv = new Map(A.top(prev, (r) => r.fa || '', 200));
      let best = null;
      cm.forEach((n, id) => { if (!id) return; const d = n - (pmv.get(id) || 0); if (n >= 3 && d >= 2 && (!best || d > best.d)) best = { id, n, d }; });
      if (best) ins.push({ lvl: 'bad', icon: 'alert', t: `„${A.faName(best.id)}“ nimmt zu: +${best.d} gegenüber dem Vorzeitraum`, s: `${best.n}× in den letzten 90 Tagen – Kandidat für eine Schulung`, rows: cur.filter((x) => x.fa === best.id), label: A.faName(best.id) });
    }
    const qsR = rows.filter((r) => r.qs && !/nicht erforderlich/i.test(r.qs));
    if (qsR.length >= 5 && total) ins.push({ lvl: 'warn', icon: 'shield', t: `${Math.round((A.sum(qsR) / total) * 100)} % der Fehler sind trotz QS durchgekommen`, s: `${A.sum(qsR)} von ${total} Fehlern bei Plänen mit QS`, rows: qsR, label: 'Trotz QS durchgekommen' });
    if (k.wiederholungen) ins.push({ lvl: 'warn', icon: 'refresh', t: `${k.wiederholungen} Ablehnung${k.wiederholungen === 1 ? '' : 'en'} am selben Standort wiederholt`, s: 'Meist: offene Korrektur nicht umgesetzt', rows: rows.filter((x) => x.a.wiederholung), label: 'Wiederholte Ablehnungen' });
    if (k.unberechtigt >= 0.1) ins.push({ lvl: 'info', icon: 'scale', t: `${TA.fmtPct(k.unberechtigt)} der Punkte waren nicht berechtigt`, s: 'Argumente fürs Gespräch mit dem TMC', rows: [], label: '' });
    const mkeys = mon.map((m) => m.key);
    const hkIds = A.top(rows, (r) => r.hk || '').map(([id]) => id).slice(0, 6);
    const byM = {}; rows.forEach((r) => { const key = TA.monthKey(r.a.datumAblehnung); if (!mkeys.includes(key)) return; const h = hkIds.includes(r.hk || '') ? (r.hk || '') : '_x'; (byM[key] = byM[key] || {})[h] = ((byM[key] || {})[h] || 0) + r._w; });
    const mTot = mkeys.map((key) => Object.values(byM[key] || {}).reduce((s, x) => s + x, 0));
    const mMax = Math.max(1, ...mTot);
    const legend = [...hkIds.map((id) => [id, A.hkName(id) || 'ohne Kategorie']), ...(Object.values(byM).some((o) => o._x) ? [['_x', 'weitere']] : [])];
    const colorOf = (id) => id === '_x' ? '#DDE1EA' : PAL[hkIds.indexOf(id) % PAL.length];
    const filtText = [zeitLabel[f.zeitraum] || '', f.zeichner && 'Zeichner ' + f.zeichner, f.qs && 'QS ' + f.qs, f.cluster, f.plan, f.mitUnberechtigt ? 'inkl. nicht berechtigter Punkte' : 'ohne nicht berechtigte Punkte'].filter(Boolean).join(' · ');

    el.innerHTML = `
    <div class="print-head"><img src="pbz-logo.png" alt="pbz"><span class="t">Auswertung TMC-Ablehnungen</span><span class="s">${esc(filtText)} · Stand ${TA.fmtDate(TA.isoToday())}</span></div>
    <div class="pagehead"><div><div class="overline">Auswertung</div><h1>Fehleranalyse</h1>
      <p class="muted small" style="margin:4px 0 0">Nur abgeschlossene Bewertungen · ${k.ablehnungen} Ablehnungen · ${TA.fmtNum(total)} Fehler · ${esc(filtText)}</p></div>
      <div class="spacer"></div><button class="btn btn-secondary no-print" id="a-print">${TA.icons.printer}PDF-Bericht</button></div>
    <div class="toolbar"><button type="button" class="btn btn-secondary filter-toggle" aria-expanded="false" aria-controls="a-panel">${TA.icons.sliders}<span>Filter</span><span class="fbadge" hidden></span></button></div>
    <div class="filter-panel" id="a-panel" hidden><div class="fp-row">
      <select class="select" data-nocount id="f-zeitraum" aria-label="Zeitraum">${[['90', 'Letzte 90 Tage'], ['180', 'Letzte 6 Monate'], ['365', 'Letzte 12 Monate'], ['jahr', 'Dieses Jahr'], ['', 'Gesamter Zeitraum']].map(([v, l]) => `<option value="${v}"${f.zeitraum === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      ${sel('f-zeichner', 'zeichner', 'Zeichner')}${sel('f-qs', 'qs', 'QS')}${sel('f-cluster', 'cluster', 'Cluster')}${sel('f-plan', 'planvariante', 'Planvariante')}
      <label class="small"><input type="checkbox" id="f-unb"${f.mitUnberechtigt ? ' checked' : ''}> Nicht berechtigte Punkte einbeziehen</label>
    </div></div>
    ${!rows.length ? `<div class="card empty"><b>Keine bewerteten Fehler im gewählten Zeitraum</b>In die Auswertung kommen nur Ablehnungen, deren Bewertung abgeschlossen ist.<br><a class="btn btn-secondary" href="#/liste">Offene Ablehnungen ansehen</a></div>` : `
    <div class="grid g4">
      <div class="card kpi"><div class="lbl">Ablehnungen</div><div class="val">${k.ablehnungen}</div><div class="cmp">${k.wiederholungen} davon wiederholt am selben Standort</div></div>
      <div class="card kpi"><div class="lbl">Fehler je Ablehnung</div><div class="val">${TA.fmtNum(k.jeAbl, 1)}</div><div class="cmp">${TA.fmtNum(k.fehler)} Fehler gesamt, ${TA.fmtNum(k.major)} Major</div></div>
      <div class="card kpi"><div class="lbl">Durch uns verschuldet</div><div class="val">${TA.fmtPct(k.verschuldet)}</div><div class="cmp">„teilweise“ zählt zur Hälfte</div></div>
      <div class="card kpi"><div class="lbl">Nicht berechtigt (TMC)</div><div class="val">${TA.fmtPct(k.unberechtigt)}</div><div class="cmp">Argumente fürs Gespräch mit dem TMC</div></div>
    </div>
    ${ins.length ? `<div class="card" style="margin-top:16px"><h2>Auffälligkeiten</h2><div class="insights">${ins.map((x, i) => `<button type="button" class="ins ${x.lvl}" data-ins="${i}"><span class="ins-ico">${TA.icons[x.icon]}</span><span><b>${esc(x.t)}</b><small>${esc(x.s)}</small></span></button>`).join('')}</div></div>` : ''}
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h2>Hauptkategorien</h2>${bars(hk, total, 'hk')}</div>
      <div class="card"><h2>Häufigste Fehlerarten</h2>${bars(fa, total, 'fa')}<p class="small muted" style="margin:4px 0 0">Die Top ${fa.length} machen ${total ? Math.round((top10 / total) * 100) : 0} % aller Fehler aus.</p></div>
    </div>
    <div class="card" style="margin-top:16px">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><h2 style="margin:0">Heatmap ${f.heat === 'qs' ? 'QS' : 'Zeichner'} × Hauptkategorie</h2><div class="spacer"></div>
        <div class="seg flat no-print" role="group" aria-label="Heatmap nach"><button data-heat="zeichner" aria-pressed="${f.heat !== 'qs'}">Zeichner</button><button data-heat="qs" aria-pressed="${f.heat === 'qs'}">QS</button></div></div>
      ${heat.people.length ? `<div style="overflow:auto"><table class="heat" style="margin-top:12px"><thead><tr><th class="rowh">${f.heat === 'qs' ? 'QS' : 'Zeichner'}</th>${heat.hks.map((h) => `<th>${esc(h.name)}</th>`).join('')}<th>Summe</th></tr></thead><tbody>
      ${heat.people.map((p) => `<tr><th class="rowh">${esc(p)}</th>${heat.hks.map((h) => { const v = heat.get(p, h.id); return `<td class="h${A.level(v, heat.max)}${v ? ' h-click' : ''}" ${v ? `data-hp="${esc(p)}" data-hh="${h.id}" tabindex="0" role="button" aria-label="${esc(p)}, ${esc(h.name)}: ${v}"` : ''}>${v}</td>`; }).join('')}<td class="num"><b>${heat.hks.reduce((s, h) => s + heat.get(p, h.id), 0)}</b></td></tr>`).join('')}
      </tbody></table></div><div class="legend">wenig <span class="h0"></span><span class="h1"></span><span class="h2"></span><span class="h3"></span><span class="h4"></span> viel · Klick auf eine Zelle öffnet die Ablehnungen</div>` : '<p class="muted small">Keine Zuordnung vorhanden.</p>'}
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h2>Ablehnungen pro Monat</h2><div class="cols">${mon.map((m, i) => `<div class="c${i === mon.length - 1 ? ' cur' : ''}" data-mon="${m.key}" title="${esc(m.label)}: ${m.n}" role="button" tabindex="0"><b>${m.n}</b><i style="height:${(m.n / monMax) * 120}px"></i><span>${esc(m.label.split(' ')[0])}</span></div>`).join('')}</div><p class="small muted" style="margin:8px 0 0">Letzte 12 Monate, aktueller Monat in Gold. Filter außer Zeitraum gelten.</p></div>
      <div class="card"><h2>Verschuldung</h2>${bars(versch, total, 'v')}</div>
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h2>Nach Cluster</h2>${bars(cl, total, 'cl')}</div>
      <div class="card"><h2>Nach Planvariante</h2>${bars(pl, total, 'pl')}</div>
    </div>
    <div class="card" style="margin-top:16px"><h2>Fehler pro Monat nach Hauptkategorie</h2>
      <div class="stack-cols">${mkeys.map((key, i) => `<div class="sc" data-mon="${key}" role="button" tabindex="0" title="${esc(mon[i].label)}: ${mTot[i]}"><b>${mTot[i]}</b><div class="st">${[...legend].map(([id]) => { const v = (byM[key] || {})[id] || 0; return v ? `<i style="height:${(v / mMax) * 130}px;background:${colorOf(id)}" title="${esc((legend.find((l) => l[0] === id) || [])[1] || '')}: ${v}"></i>` : ''; }).join('')}</div><span>${esc(mon[i].label.split(' ')[0])}</span></div>`).join('')}</div>
      <div class="leg">${legend.map(([id, name]) => `<span><i style="background:${colorOf(id)}"></i>${esc(name)}</span>`).join('')}</div></div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h2>Schwere der Fehler</h2>${bars(sw, total, 'sw')}</div>
      <div class="card"><h2>Standorte mit den meisten Fehlern</h2>${bars(st, total, 'st')}</div>
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h2>Nach Prüfer (TMC-MiNu)</h2>${bars(pm, total, 'pm')}</div>
      <div class="card"><h2>Fehler je Zeichner</h2>${bars(zc.slice(0, 8).map(([v, n]) => ({ v, n, label: v })), total, 'zc')}</div>
    </div>`}`;

    const upd = () => { setF(f); auswertung(app.freshView()); };
    app.filterPanel(el);
    el.querySelector('#a-print').onclick = () => window.print();
    el.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'f-unb') f.mitUnberechtigt = t.checked; else if (t.id && t.id.startsWith('f-')) f[t.id.slice(2)] = t.value; else return;
      upd();
    });
    const handle = (t) => {
      const hb = t.closest('[data-heat]'); if (hb) { f.heat = hb.dataset.heat; upd(); return; }
      const insEl = t.closest('[data-ins]');
      if (insEl) { const x = ins[+insEl.dataset.ins]; if (x && x.rows && x.rows.length) drill(x.rows, x.label); else TA.toast('Für diese Auffälligkeit gibt es keine Liste.'); return; }
      const row = t.closest('[data-act]');
      if (row) {
        const i = +row.dataset.i, act = row.dataset.act;
        const zlist = zc.slice(0, 8).map(([v, n]) => ({ v, n, label: v }));
        const src = { hk, fa, v: versch, cl, pl, sw, st, pm, zc: zlist }[act][i];
        const r = rows.filter((x) => act === 'hk' ? x.hk === src.id : act === 'fa' ? x.fa === src.id : act === 'v' ? x.p.verschuldet === src.v : act === 'cl' ? (x.a.cluster || '') === src.v : act === 'sw' ? (x.p.schwere || '') === src.v : act === 'st' ? (x.a.standortId || '') === src.v : act === 'pm' ? (x.a.prueferMinu || '') === src.v : act === 'zc' ? x.zeichner === src.v : (x.a.planvariante || '') === src.v);
        drill(r, src.label); return;
      }
      const c = t.closest('[data-hp]');
      if (c) { drill(rows.filter((x) => x[f.heat] === c.dataset.hp && x.hk === c.dataset.hh), `${c.dataset.hp} · ${A.hkName(c.dataset.hh)}`); return; }
      const m = t.closest('[data-mon]');
      if (m) { const ids = A.ablehnungen({ ...flt, von: '', status: 'bewertet' }).filter((a) => TA.monthKey(a.datumAblehnung) === m.dataset.mon).map((a) => a.id); app.openList({ ids, label: TA.monthLabel(m.dataset.mon) }); }
    };
    el.addEventListener('click', (e) => handle(e.target));
    el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button]')) { e.preventDefault(); handle(e.target); } });
  };
  auswertung.live = true;
  app.views.auswertung = auswertung;
})(window.TA);
