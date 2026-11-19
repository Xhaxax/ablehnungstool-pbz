/* Uebersicht + Ablehnungsliste */
(function (TA) {
  'use strict';
  const S = TA.store, app = TA.app, A = TA.analysis, esc = TA.esc;

  /* Filter fuer die Liste von anderen Seiten aus setzen */
  app.openList = (filter) => { sessionStorage.setItem('ablehnungstool-liste', JSON.stringify(Object.assign(defaultFilter(), filter || {}))); app.go('#/liste'); };
  const defaultFilter = () => ({ q: '', status: '', zeichner: '', qs: '', cluster: '', plan: '', zeitraum: '', wdh: false, hk: '', fa: '', standort: '', ids: null, label: '', sort: 'datum', dir: -1 });

  function aufgabe(a) {
    const st = A.status(a);
    if (!st.gesamt && a.korrekturdatei) return 'Fehler stehen in der Korrektur-PDF – PDF hochladen oder Punkte eintragen';
    if (!st.gesamt) return 'Noch keine Fehlerpunkte erfasst';
    if (!a.zeichner) return 'Zeichner fehlt' + (st.offen ? ` · ${st.offen} von ${st.gesamt} Punkten ohne Kategorie` : '');
    if (st.offen) return `${st.offen} von ${st.gesamt} Punkten ohne Kategorie`;
    return 'Alle Punkte kategorisiert – Bewertung abschließen';
  }

  /* Persoenliche Einstellungen der Uebersicht (pro Benutzer, in diesem Browser) */
  const UEB_DEF = { aufgaben: true, empfehlungen: true, k_abl: true, k_je: true, k_ver: true, k_wdh: true, zuletzt: true, tage: 90, zeilen: 8, dCluster: [], dZeichner: '', kacheln: [] };
  app.uebDefaults = () => Object.assign({}, UEB_DEF);
  app.uebPrefs = () => { try { return Object.assign({}, UEB_DEF, JSON.parse(localStorage.getItem('ablehnungstool-ueb-' + app.user().id) || '{}')); } catch (e) { return Object.assign({}, UEB_DEF); } };
  app.setUebPrefs = (p) => localStorage.setItem('ablehnungstool-ueb-' + app.user().id, JSON.stringify(p));

  /* Dauerfilter: gilt fuer Uebersicht, Liste, Auswertung und Empfehlungen */
  app.dauerOk = (a) => {
    if (!app.user()) return true;
    const p = app.uebPrefs();
    if (p.dCluster.length && !p.dCluster.includes(a.cluster || '')) return false;
    if (p.dZeichner && a.zeichner !== p.dZeichner) return false;
    return true;
  };
  TA.analysis.dauer = (a) => app.dauerOk(a);
  app.dauerBanner = () => {
    if (!app.user()) return '';
    const p = app.uebPrefs(); const teile = [];
    if (p.dCluster.length) teile.push('Cluster: ' + p.dCluster.join(', '));
    if (p.dZeichner) teile.push('Zeichner: ' + p.dZeichner);
    return teile.length ? `<div class="dauer">${TA.icons.sliders}<span>Dauerfilter aktiv – <b>${TA.esc(teile.join(' · '))}</b>. Andere Ablehnungen werden ausgeblendet.</span><a href="#/einstellungen/uebersicht">Ändern</a></div>` : '';
  };
  const METRIK = { abl: 'Bewertete Ablehnungen', fehler: 'Fehlerpunkte (verschuldet)', offen: 'Offene Ablehnungen' };
  app.uebMetriken = METRIK;
  app.uebKacheln = (pf, heute) => (pf.kacheln || []).map((k) => {
    const flt = { zeichner: k.zeichner || undefined, cluster: k.cluster || undefined };
    if (k.tage) flt.von = TA.addDays(heute, -k.tage);
    let n;
    if (k.metrik === 'offen') n = TA.analysis.ablehnungen(flt).filter((a) => a.status !== 'bewertet').length;
    else if (k.metrik === 'fehler') n = TA.analysis.sum(TA.analysis.rows(flt).filter((r) => !k.hk || r.hk === k.hk));
    else n = TA.analysis.ablehnungen({ ...flt, status: 'bewertet' }).length;
    const teile = [k.tage ? `letzte ${k.tage} Tage` : 'gesamt', k.zeichner, k.cluster, k.hk ? TA.analysis.hkName(k.hk) : ''].filter(Boolean).join(' · ');
    return `<a class="card kpi" href="${k.metrik === 'offen' ? '#/liste' : '#/auswertung'}"><div class="val">${TA.fmtNum(n)}</div><div class="lbl">${TA.esc(k.titel || METRIK[k.metrik])}</div><div class="cmp">${TA.esc(teile)}</div></a>`;
  }).join('');

  /* ================= UEBERSICHT ================= */
  const uebersicht = (el) => {
    const u = app.user();
    const pf = app.uebPrefs();
    const all = [...S.abl.values()].filter((a) => app.dauerOk(a));
    const heute = TA.isoToday();
    const von = TA.addDays(heute, -pf.tage), vorVon = TA.addDays(heute, -2 * pf.tage);
    const k = A.kpis({ von }), kv = A.kpis({ von: vorVon, bis: TA.addDays(von, -1) });
    const offen = all.filter((a) => a.status !== 'bewertet').sort((a, b) => (b.datumAblehnung || '').localeCompare(a.datumAblehnung || ''));
    const emp = A.empfehlungen();
    const zuletzt = all.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 5);
    const delta = (a, b, dec, pct, goodDown = true) => {
      if (a === null || b === null || a === undefined || b === undefined) return 'kein Vergleichswert';
      const d = a - b; if (Math.abs(d) < 1e-9) return 'gleich wie Vorzeitraum';
      const cls = (d > 0) === goodDown ? 'up' : 'down';
      const v = pct ? TA.fmtNum(Math.abs(d) * 100, 0) + ' Pkt.' : TA.fmtNum(Math.abs(d), dec);
      return `<span class="${cls}">${d > 0 ? '+' : '−'}${v}</span> ggü. Vorzeitraum`;
    };

    if (!all.length) {
      el.innerHTML = `<div class="pagehead"><div><div class="overline">Übersicht</div><h1>Willkommen, ${esc(u.name.split(' ')[0])}</h1></div></div>
      <div class="card empty"><b>Noch keine Ablehnungen im Datenordner</b>Erfasse die erste Ablehnung aus einer TMC-Mail oder übernimm eure bisherigen Excel-Listen.<br>
      ${app.can('verwalten') ? '<a class="btn btn-secondary" href="#/einstellungen/daten">Altdaten aus Excel übernehmen</a>' : ''}<p class="small muted" style="margin-top:12px">Neue Ablehnungen erfasst du über „Neue Ablehnung“ oben in der Seitenleiste.</p></div>`;
      return;
    }

    el.innerHTML = `<div class="pagehead"><div><div class="overline">Übersicht</div><h1>Guten Tag, ${esc(u.name.split(' ')[0])}</h1></div><div class="spacer"></div><span class="muted small">Kennzahlen: letzte ${pf.tage} Tage (${TA.fmtDate(von)} – ${TA.fmtDate(heute)}), nur bewertete Ablehnungen · <a href="#/einstellungen/uebersicht">anpassen</a></span></div>
    <div class="grid${pf.aufgaben && pf.empfehlungen ? ' g-73' : ''}">
      ${pf.aufgaben ? `<div class="card">
        <h2>Offene Ablehnungen <span class="muted" style="font-weight:400">· ${offen.length}</span></h2>
        ${offen.length ? `<div class="tablewrap" style="border:0;box-shadow:none"><table class="ctr">
          <thead><tr><th>Abgelehnt</th><th>Standort</th><th>Was fehlt</th><th>Status</th><th></th></tr></thead>
          <tbody>${offen.slice(0, pf.zeilen).map((a) => `<tr class="clickrow" data-href="#/a/${esc(a.id)}"><td class="num">${TA.fmtDate(a.datumAblehnung)}</td><td><span class="mono">${esc(a.standortId)}</span><br><span class="small muted">${esc(a.zeichner || '')}</span></td><td class="small">${esc(aufgabe(a))} ${app.lockBadge(a)}</td><td>${app.statusBadge(a)}</td><td><a class="btn btn-sm btn-secondary" href="#/a/${esc(a.id)}">Öffnen</a></td></tr>`).join('')}</tbody></table></div>
          ${offen.length > pf.zeilen ? `<p class="small"><a href="#/liste" data-open="offen">Alle ${offen.length} offenen Ablehnungen anzeigen</a></p>` : ''}`
    : '<div class="empty"><b>Alles bewertet</b>Keine offenen Ablehnungen.</div>'}
      </div>` : ''}
      ${pf.empfehlungen ? `<div class="card">
        <h2>Empfehlungen</h2>
        ${emp.length ? emp.slice(0, 3).map((e) => `<p class="small"><span class="badge ${e.prio >= 3 ? 'b-major' : e.prio === 2 ? 'b-bewertung' : 'b-minor'}">${e.prio >= 3 ? 'Hoch' : e.prio === 2 ? 'Mittel' : 'Hinweis'}</span>&nbsp; ${esc(e.titel)}</p>`).join('') + `<a href="#/empfehlungen">Alle ${emp.length} Empfehlungen ansehen</a>`
    : '<p class="small muted">Aktuell löst keine Regel eine Empfehlung aus. Die Regeln laufen über alle bewerteten Ablehnungen.</p>'}
      </div>` : ''}
    </div>
    ${pf.k_abl || pf.k_je || pf.k_ver || pf.k_wdh || (pf.kacheln || []).length ? `<div class="grid" style="margin-top:16px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
      ${pf.k_abl ? `<a class="card kpi" href="#/auswertung"><div class="val">${k.ablehnungen}</div><div class="lbl">Bewertete Ablehnungen</div><div class="cmp">${delta(k.ablehnungen, kv.ablehnungen, 0)}</div></a>` : ''}
      ${pf.k_je ? `<a class="card kpi" href="#/auswertung"><div class="val">${TA.fmtNum(k.jeAbl, 1)}</div><div class="lbl">Fehler je Ablehnung</div><div class="cmp">${delta(k.jeAbl, kv.jeAbl, 1)}</div></a>` : ''}
      ${pf.k_ver ? `<a class="card kpi" href="#/auswertung"><div class="val">${TA.fmtPct(k.verschuldet)}</div><div class="lbl">durch uns verschuldet</div><div class="cmp">${TA.fmtPct(k.unberechtigt)} der Punkte nicht berechtigt</div></a>` : ''}
      ${pf.k_wdh ? `<a class="card kpi" href="#/liste" data-open="wdh"><div class="val">${k.wiederholungen}</div><div class="lbl">Wiederholte Ablehnungen</div><div class="cmp">gleicher Standort mehrfach abgelehnt</div></a>` : ''}
      ${app.uebKacheln(pf, heute)}
    </div>` : ''}
    ${pf.zuletzt ? `<div class="card" style="margin-top:16px"><h2>Zuletzt bearbeitet</h2>
      <table class="ctr"><tbody>${zuletzt.map((a) => `<tr class="clickrow" data-href="#/a/${esc(a.id)}"><td class="mono" style="width:110px">${esc(a.standortId)}</td><td>${esc(a.standortName || '')}</td><td>${app.statusBadge(a)}</td><td class="small muted">${esc((a.verlauf || []).slice(-1)[0] ? a.verlauf.slice(-1)[0].by + ': ' + a.verlauf.slice(-1)[0].text : '')}</td><td class="small muted num">${TA.fmtDateTime(a.updatedAt)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;

    el.querySelectorAll('[data-href]').forEach((r) => r.addEventListener('click', (e) => { if (!e.target.closest('a')) app.go(r.dataset.href); }));
    el.querySelectorAll('[data-open]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault(); app.openList(a.dataset.open === 'wdh' ? { wdh: true, zeitraum: '90', label: '' } : { status: 'offen' });
    }));
  };
  uebersicht.live = true;
  app.views.uebersicht = uebersicht;

  /* ================= LISTE ================= */
  let pageSize = 50;
  const liste = (el) => {
    let f; try { f = Object.assign(defaultFilter(), JSON.parse(sessionStorage.getItem('ablehnungstool-liste') || '{}')); } catch (e) { f = defaultFilter(); }
    const save = () => sessionStorage.setItem('ablehnungstool-liste', JSON.stringify(f));
    const all = [...S.abl.values()].filter((a) => app.dauerOk(a));
    const cfg = S.cfg;

    const apply = () => {
      const q = TA.norm(f.q);
      const heute = TA.isoToday();
      const standortCount = TA.groupCount(all, (a) => a.standortId);
      let rows = all.filter((a) => {
        if (f.ids && !f.ids.includes(a.id)) return false;
        if (f.status === 'offen' && a.status === 'bewertet') return false;
        if (f.status && f.status !== 'offen' && a.status !== f.status) return false;
        if (f.zeichner && a.zeichner !== f.zeichner) return false;
        if (f.qs && a.qs !== f.qs) return false;
        if (f.cluster && a.cluster !== f.cluster) return false;
        if (f.plan && a.planvariante !== f.plan) return false;
        if (f.standort && a.standortId !== f.standort) return false;
        if (f.zeitraum) { const von = f.zeitraum === 'jahr' ? heute.slice(0, 4) + '-01-01' : TA.addDays(heute, -(+f.zeitraum)); if ((a.datumAblehnung || '') < von) return false; }
        if (f.wdh && (standortCount.get(a.standortId) || 0) < 2) return false;
        if (f.hk || f.fa) { if (!(a.punkte || []).some((p) => (!f.hk || p.hk === f.hk) && (!f.fa || p.fehlerart === f.fa))) return false; }
        if (q) {
          const hay = TA.norm([a.standortId, a.standortName, a.projekt, a.tims, a.zeichner, a.qs, a.cluster, a.prueferTechnik, a.prueferMinu, ...(a.punkte || []).map((p) => p.text)].join(' '));
          if (!q.split(' ').every((w) => hay.includes(w))) return false;
        }
        return true;
      });
      const key = { datum: (a) => a.datumAblehnung || '', standort: (a) => a.standortId || '', projekt: (a) => String(a.projekt || ''), zeichner: (a) => a.zeichner || '', qs: (a) => a.qs || '', cluster: (a) => a.cluster || '', plan: (a) => a.planvariante || '', punkte: (a) => (a.punkte || []).length, status: (a) => a.status || '' }[f.sort] || ((a) => a.datumAblehnung || '');
      rows.sort((a, b) => { const x = key(a), y = key(b); return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'de')) * f.dir; });
      return rows;
    };

    const chips = () => {
      const c = [];
      if (f.label) c.push(['label', f.label]);
      if (f.hk) c.push(['hk', 'Kategorie: ' + A.hkName(f.hk)]);
      if (f.fa) c.push(['fa', 'Fehlerart: ' + A.faName(f.fa)]);
      if (f.standort) c.push(['standort', 'Standort: ' + f.standort]);
      if (f.qs) c.push(['qs', 'QS: ' + f.qs]);
      if (f.wdh) c.push(['wdh', 'Nur wiederholt abgelehnte Standorte']);
      return c;
    };

    const th = (k, label, cls = '') => `<th class="sortable ${cls}" data-sort="${k}" aria-sort="${f.sort === k ? (f.dir > 0 ? 'ascending' : 'descending') : 'none'}">${label}${f.sort === k ? (f.dir > 0 ? ' ▴' : ' ▾') : ''}</th>`;

    const draw = () => {
      const rows = apply();
      const shown = rows.slice(0, pageSize);
      const ch = chips();
      document.getElementById('l-count').textContent = rows.length;
      el.querySelector('#l-chips').innerHTML = ch.length ? ch.map(([k, t]) => `<span class="chip">${esc(t)}<button type="button" data-chip="${k}" aria-label="Filter ${esc(t)} entfernen">×</button></span>`).join('') + '<button type="button" class="btn btn-ghost btn-sm" id="l-reset">Alle Filter entfernen</button>' : '';
      el.querySelector('#l-table').innerHTML = rows.length ? `<table class="ctr">
        <thead><tr>${th('datum', 'Abgelehnt')}${th('standort', 'Standort')}${th('projekt', 'Projekt')}${th('cluster', 'Cluster')}${th('plan', 'Plan')}${th('zeichner', 'Zeichner')}${th('qs', 'QS')}${th('punkte', 'Punkte', 'num')}${th('status', 'Status')}<th>Bearbeitung</th></tr></thead>
        <tbody>${shown.map((a) => { const st = A.status(a); return `<tr class="clickrow" data-href="#/a/${esc(a.id)}" tabindex="0">
          <td class="num">${TA.fmtDate(a.datumAblehnung)}</td><td><span class="mono">${esc(a.standortId || '–')}</span><br><span class="small muted">${esc(a.standortName || '')}</span></td>
          <td class="num">${esc(a.projekt || '')}</td><td class="small">${esc(a.cluster || '')}</td><td class="small">${esc([a.planvariante, a.index].filter(Boolean).join(' · '))}</td>
          <td>${esc(a.zeichner || '')}</td><td class="small">${esc(a.qs || '')}</td><td class="num">${st.gesamt ? (st.offen ? `${st.fertig}/${st.gesamt}` : st.gesamt) : '–'}</td>
          <td>${app.statusBadge(a)}${a.quelle && a.quelle.startsWith('excel') ? ' <span class="badge b-alt" title="aus Excel übernommen">Alt</span>' : ''}</td><td>${app.lockBadge(a)}</td></tr>`; }).join('')}</tbody></table>
        <div class="tfoot"><span>${shown.length} von ${rows.length} angezeigt</span>${rows.length > shown.length ? '<button type="button" class="btn btn-sm btn-secondary" id="l-more">Mehr laden</button>' : ''}</div>`
        : `<div class="empty"><b>Keine Ablehnung passt zu den Filtern</b>Filter lockern oder zurücksetzen.</div>`;
    };

    const sel = (id, label, list, val) => `<select class="select" id="${id}" aria-label="${label}">${app.options(TA.sortDe(TA.uniq(list)), val, label + ': alle')}</select>`;
    el.innerHTML = `<div class="pagehead"><div><div class="overline">Ablehnungen</div><h1>Alle Ablehnungen <span class="muted" style="font-weight:400">· <span id="l-count"></span></span></h1></div><div class="spacer"></div>
      <button type="button" class="btn btn-secondary" id="l-xlsx">${TA.icons.download} Excel-Export</button></div>
    <div class="toolbar">
      <input class="input search" id="l-q" type="search" placeholder="Standort, Projekt-Nr., Zeichner, Fehlertext …" aria-label="Suchen" value="${esc(f.q)}">
      <div class="seg flat" id="l-seg" role="group" aria-label="Bearbeitungsstand">${[['offen', 'Offen', all.filter((a) => a.status !== 'bewertet').length], ['bewertet', 'Bewertet', all.filter((a) => a.status === 'bewertet').length], ['', 'Alle', all.length]].map(([v, l, n]) => `<button type="button" data-qs="${v}" aria-pressed="${(f.status === 'importiert' || f.status === 'bewertung' ? 'offen' : f.status) === v}">${l} <span class="muted">${n}</span></button>`).join('')}</div>
      <button type="button" class="btn btn-secondary filter-toggle" aria-expanded="false" aria-controls="l-panel">${TA.icons.sliders}<span>Filter</span><span class="fbadge" hidden></span></button>
    </div>
    <div class="filter-panel" id="l-panel" hidden>
      <div class="fp-row"><span class="fp-l">Status</span><div class="seg flat" role="group" aria-label="Status">${[['', 'Alle'], ['offen', 'Offen'], ['importiert', 'Importiert'], ['bewertung', 'In Bewertung'], ['bewertet', 'Bewertet']].map(([v, l]) => `<button type="button" data-st="${v}" aria-pressed="${f.status === v}">${l}</button>`).join('')}</div></div>
      <div class="fp-row">
      ${sel('l-z', 'Zeichner', cfg.listen.zeichner.concat(app.history('zeichner')), f.zeichner)}
      ${sel('l-c', 'Cluster', cfg.listen.cluster.concat(app.history('cluster')), f.cluster)}
      ${sel('l-p', 'Plan', cfg.listen.planvariante.concat(app.history('planvariante')), f.plan)}
      <select class="select" id="l-t" aria-label="Zeitraum">${[['', 'Zeitraum: alle'], ['30', 'Letzte 30 Tage'], ['90', 'Letzte 90 Tage'], ['180', 'Letzte 6 Monate'], ['365', 'Letzte 12 Monate'], ['jahr', 'Dieses Jahr']].map(([v, l]) => `<option value="${v}"${f.zeitraum === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <label class="small"><input type="checkbox" id="l-w"${f.wdh ? ' checked' : ''}> Nur wiederholt abgelehnte Standorte</label>
      </div>
    </div>
    <div class="toolbar" id="l-chips"></div>
    <div class="tablewrap" id="l-table"></div>`;
    app.filterPanel(el);

    const upd = () => { save(); pageSize = 50; draw(); };
    el.querySelector('#l-q').addEventListener('input', TA.debounce((e) => { f.q = e.target.value; upd(); }, 200));
    el.querySelectorAll('[data-qs]').forEach((b) => (b.onclick = () => { f.status = b.dataset.qs; el.querySelectorAll('[data-qs]').forEach((x) => x.setAttribute('aria-pressed', x === b)); el.querySelectorAll('[data-st]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.st === f.status)); upd(); }));
    el.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { f.status = b.dataset.st; el.querySelectorAll('[data-st]').forEach((x) => x.setAttribute('aria-pressed', x === b)); el.querySelectorAll('[data-qs]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.qs === (f.status === 'importiert' || f.status === 'bewertung' ? 'offen' : f.status))); upd(); }));
    [['l-z', 'zeichner'], ['l-c', 'cluster'], ['l-p', 'plan'], ['l-t', 'zeitraum']].forEach(([id, k]) => (el.querySelector('#' + id).onchange = (e) => { f[k] = e.target.value; upd(); }));
    el.querySelector('#l-w').onchange = (e) => { f.wdh = e.target.checked; upd(); };
    el.addEventListener('click', (e) => {
      const c = e.target.closest('[data-chip]');
      if (c) { const k = c.dataset.chip; if (k === 'label') { f.label = ''; f.ids = null; } else f[k] = k === 'wdh' ? false : ''; if (k === 'wdh') el.querySelector('#l-w').checked = false; upd(); return; }
      if (e.target.id === 'l-reset') { const keep = { sort: f.sort, dir: f.dir }; f = Object.assign(defaultFilter(), keep); save(); liste(el); return; }
      if (e.target.id === 'l-more') { pageSize += 50; draw(); return; }
      const s = e.target.closest('[data-sort]');
      if (s) { if (f.sort === s.dataset.sort) f.dir = -f.dir; else { f.sort = s.dataset.sort; f.dir = s.dataset.sort === 'datum' ? -1 : 1; } save(); draw(); return; }
      const r = e.target.closest('[data-href]'); if (r) app.go(r.dataset.href);
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const r = e.target.closest('[data-href]'); if (r) app.go(r.dataset.href); } });
    el.querySelector('#l-xlsx').onclick = () => exportExcel(apply());
    draw();
  };
  liste.live = true;
  app.views.liste = liste;

  function exportExcel(list) {
    const rows = [];
    list.forEach((a) => {
      const base = {
        'Standort-ID': a.standortId, Standortname: a.standortName, 'TIMS-Nr.': a.tims, Projektnummer: a.projekt, Clusterinfo: a.cluster, Planvariante: a.planvariante, Index: a.index,
        'Datum Einreichung': TA.fmtDate(a.datumEinreichung), 'Datum Ablehnung': TA.fmtDate(a.datumAblehnung), Zeichner: a.zeichner, QS: a.qs,
        'Prüfer Technik': a.prueferTechnik, 'Prüfer MiNu': a.prueferMinu, Korrekturdatei: a.korrekturdatei ? 'ja' : 'nein', Status: a.status
      };
      const pts = a.punkte && a.punkte.length ? a.punkte : [null];
      pts.forEach((p, i) => rows.push(Object.assign({}, base, {
        'Punkt Nr.': p ? i + 1 : '', Quelle: p ? p.quelle : '', Fehlertext: p ? p.text : '', Hauptkategorie: p ? A.hkName(p.hk) : '', Fehlerart: p ? A.faName(p.fehlerart) : '',
        Anzahl: p ? (p.anzahl || 1) : '', Schwere: p ? p.schwere || '' : '', Berechtigt: p ? p.berechtigt || '' : '', Verschuldet: p ? p.verschuldet || '' : '',
        'Warum beim Planer': a.ursachePlaner || '', 'Warum bei QS durchgegangen': a.ursacheQS || '', 'Bemerkung PL': a.bemerkungPL || '', 'Bemerkung RM': a.bemerkungRM || '', Fehlerminimierung: a.fehlerminimierung || ''
      })));
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0] || {}).map((k) => ({ wch: k === 'Fehlertext' ? 80 : Math.min(30, Math.max(10, k.length + 2)) }));
    ws['!autofilter'] = { ref: ws['!ref'] };
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Fehlerpunkte');
    XLSX.writeFile(wb, `TMC-Ablehnungen_${TA.isoToday()}.xlsx`);
  }
  app.exportExcel = exportExcel;
})(window.TA);
