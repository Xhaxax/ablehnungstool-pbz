/* Empfehlungen, Massnahmen und Gespraechsblatt */
(function (TA) {
  'use strict';
  const S = TA.store, app = TA.app, A = TA.analysis, esc = TA.esc;
  const TYP = { gespraech: 'Qualitätsgespräch', qs: 'QS-Abstimmung', schulung: 'Schulung', prozess: 'Prozess' };
  const PRIO = { 3: ['b-major', 'Hoch'], 2: ['b-bewertung', 'Mittel'], 1: ['b-minor', 'Hinweis'] };

  function massnahmeDialog(pre) {
    const cfg = S.cfg;
    const zeichner = TA.sortDe(TA.uniq([...(cfg.listen.zeichner || []), ...(cfg.listen.qs || [])]));
    const body = `<div class="stack">
      <div class="field"><label for="m-typ">Art</label><select id="m-typ" class="select">${Object.entries(TYP).map(([k, l]) => `<option value="${k}"${pre.typ === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label for="m-datum">Datum · Pflichtfeld</label><input id="m-datum" type="date" class="input" value="${pre.datum || TA.isoToday()}"></div>
      <div class="field"><label for="m-betr">Betrifft (Person, „Team“ oder Standort)</label><input id="m-betr" class="input" list="m-dl" value="${esc(pre.betrifft || '')}"><datalist id="m-dl"><option>Team</option>${zeichner.map((z) => `<option>${esc(z)}</option>`).join('')}</datalist></div>
      <div class="field"><label for="m-hk">Hauptkategorie</label><select id="m-hk" class="select"><option value="">– alle –</option>${cfg.hauptkategorien.map((h) => `<option value="${h.id}"${pre.hk === h.id ? ' selected' : ''}>${esc(h.name)}</option>`).join('')}</select></div>
      ${pre.fehlerart ? `<p class="small muted" style="margin:0">Fehlerart: ${esc(A.faName(pre.fehlerart))}</p>` : ''}
      <div class="field"><label for="m-notiz">Notiz (Inhalt, Vereinbarung)</label><textarea id="m-notiz" class="input" rows="4">${esc(pre.notiz || '')}</textarea></div></div>`;
    return TA.modal('Maßnahme anlegen', body, [{ label: 'Abbrechen', value: null, cls: 'btn-ghost' }, { label: 'Speichern', value: true, cls: 'btn-primary' }], {
      collect: (m) => ({ typ: m.querySelector('#m-typ').value, datum: m.querySelector('#m-datum').value, betrifft: m.querySelector('#m-betr').value.trim(), hk: m.querySelector('#m-hk').value, notiz: m.querySelector('#m-notiz').value.trim() }),
      validate: (m) => {
        const msg = !m.querySelector('#m-datum').value ? 'Bitte ein Datum angeben.' : !m.querySelector('#m-betr').value.trim() ? 'Bitte angeben, wen die Maßnahme betrifft.' : '';
        if (msg) { TA.toast(msg, { error: true }); return false; }
        return true;
      }
    }).then(async (v) => {
      if (!v) return false;
      await S.saveMassnahme({ id: TA.uid('m'), ...v, fehlerart: pre.fehlerart || '', regel: pre.regel || '', by: app.user().name, at: TA.nowIso() });
      TA.toast('Maßnahme gespeichert. Die Zählung für diese Empfehlung beginnt ab jetzt neu.');
      return true;
    });
  }
  app.massnahmeDialog = massnahmeDialog;

  const empfehlungen = (el) => {
    const emp = A.empfehlungen();
    const massn = [...S.massn.values()].sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
    const canM = app.can('massnahmen');
    const wirkung = (m) => {
      const f = { hk: m.hk || '', fa: m.fehlerart || '' };
      const pred = (r) => A.isZaehlbar(r.p) && (m.betrifft === 'Team' || r.zeichner === m.betrifft || r.qs === m.betrifft || r.a.standortId === m.betrifft);
      const tage = Math.min(90, Math.max(1, TA.daysBetween(m.datum, TA.isoToday())));
      const vor = A.sum(A.rows({ ...f, von: TA.addDays(m.datum, -tage), bis: TA.addDays(m.datum, -1) }).filter(pred));
      const nach = A.sum(A.rows({ ...f, von: m.datum }).filter(pred));
      if (!vor && !nach) return '<span class="muted">noch keine Daten</span>';
      const cls = nach < vor ? 'down' : nach > vor ? 'up' : '';
      return `<span class="${cls}">${vor} → ${nach}</span> <span class="muted small">(je ${tage} Tage vorher/nachher)</span>`;
    };
    el.innerHTML = `
    <div class="pagehead"><div><div class="overline">Empfehlungen</div><h1>Nächste Maßnahmen</h1>
      <p class="muted small" style="margin:4px 0 0">Aus den abgeschlossenen Bewertungen abgeleitet. Mit „Maßnahme anlegen“ wird aus einer Empfehlung direkt ein Gespräch oder eine Schulung – danach zählt das Tool neu.</p></div>
      <div class="spacer"></div>${canM ? `<button class="btn btn-secondary" id="e-neu">${TA.icons.plus}Maßnahme anlegen</button>` : ''}</div>
    <div class="card" style="padding:0">
      ${emp.length ? emp.map((e, i) => `<div class="rec"><div class="stripe${e.prio === 3 ? '' : e.prio === 2 ? ' w' : ' i'}"></div><div>
        <span class="badge ${PRIO[e.prio][0]}">${PRIO[e.prio][1]}</span> <span class="badge b-sand">${TYP[e.typ]}</span>
        <h3 style="margin-top:8px">${esc(e.titel)}</h3><p class="why">${esc(e.grund)}</p>${e.vorschlag ? `<div class="massn-idee"><span>${TA.icons.bulb}Empfohlene Maßnahme</span>${esc(e.vorschlag)}</div>` : ''}</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${canM ? `<button class="btn btn-primary btn-sm" data-erl="${i}">${TA.icons.plus}Maßnahme anlegen</button>` : ''}
          ${e.typ === 'gespraech' ? `<a class="btn btn-secondary btn-sm" href="#/blatt/${encodeURIComponent(e.betrifft)}">Gesprächsblatt</a>` : ''}
          <button class="btn btn-ghost btn-sm" data-abl="${i}">${e.abl.length} Ablehnung${e.abl.length === 1 ? '' : 'en'} ansehen</button>
          <button class="btn btn-ghost btn-sm" data-hide="${i}">30 Tage ausblenden</button></div></div>`).join('')
      : `<div class="empty"><b>Keine offenen Empfehlungen</b>Die Schwellen der Regeln werden derzeit nicht überschritten.</div>`}
    </div>
    <div class="card" style="margin-top:16px"><h2>Dokumentierte Maßnahmen</h2>
      ${massn.length ? `<div style="overflow:auto"><table><thead><tr><th>Datum</th><th>Art</th><th>Betrifft</th><th>Thema</th><th>Notiz</th><th>Fehler vorher → nachher</th>${canM ? '<th></th>' : ''}</tr></thead><tbody>
      ${massn.map((m) => `<tr><td class="num">${TA.fmtDate(m.datum)}</td><td>${TYP[m.typ] || esc(m.typ)}</td><td>${esc(m.betrifft)}</td><td>${esc([A.hkName(m.hk), A.faName(m.fehlerart)].filter(Boolean).join(' · ') || 'allgemein')}</td><td class="small">${esc(m.notiz || '')}</td><td>${wirkung(m)}</td>${canM ? `<td><button class="iconbtn" data-del="${m.id}" aria-label="Maßnahme vom ${TA.fmtDate(m.datum)} löschen">${TA.icons.trash}</button></td>` : ''}</tr>`).join('')}
      </tbody></table></div>` : '<p class="muted small">Noch keine Maßnahmen dokumentiert. Nach einem Gespräch oder einer Schulung hier festhalten – dann zeigt das Tool, ob sie gewirkt hat.</p>'}
    </div>`;
    el.addEventListener('click', async (ev) => {
      const t = ev.target.closest('button'); if (!t) return;
      if (t.id === 'e-neu') { if (await massnahmeDialog({ typ: 'gespraech' })) empfehlungen(app.freshView()); return; }
      if (t.dataset.erl) { const e = emp[+t.dataset.erl]; if (await massnahmeDialog({ typ: e.typ, betrifft: e.betrifft, hk: e.hk, fehlerart: e.fehlerart, regel: e.regel, notiz: [e.vorschlag, e.grund].filter(Boolean).join('\n') })) empfehlungen(app.freshView()); return; }
      if (t.dataset.abl) { const e = emp[+t.dataset.abl]; app.openList({ ids: e.abl, label: e.titel }); return; }
      if (t.dataset.hide) { A.ausblenden(emp[+t.dataset.hide].id, 30); TA.toast('Für 30 Tage ausgeblendet.'); empfehlungen(app.freshView()); return; }
      if (t.dataset.del) {
        const ok = await TA.confirm('Maßnahme löschen?', 'Die Maßnahme wird endgültig entfernt. Die zugehörige Empfehlung kann danach wieder erscheinen.', 'Löschen', true);
        if (ok) { await S.deleteMassnahme(t.dataset.del); empfehlungen(app.freshView()); }
      }
    });
  };
  empfehlungen.live = true;
  app.views.empfehlungen = empfehlungen;

  /* ---------- Gespraechsblatt je Zeichner ---------- */
  const blatt = (el, params) => {
    const name = decodeURIComponent(params[0] || '');
    const tage = +(sessionStorage.getItem('ablehnungstool-blatt-tage') || 180);
    const von = TA.addDays(TA.isoToday(), -tage);
    const rows = A.rows({ zeichner: name, von }).filter((r) => A.isZaehlbar(r.p));
    const abl = A.ablehnungen({ zeichner: name, von });
    const team = A.rows({ von }).filter((r) => A.isZaehlbar(r.p));
    const teamZ = TA.uniq(team.map((r) => r.zeichner).filter(Boolean)).length || 1;
    const fa = A.top(rows, (r) => r.fa, 8);
    const hk = A.top(rows, (r) => r.hk);
    const emp = A.empfehlungen().filter((e) => e.betrifft === name);
    const massn = [...S.massn.values()].filter((m) => m.betrifft === name).sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
    const ursachen = abl.filter((a) => a.ursachePlaner).slice(0, 6);
    const gespr = massn.filter((m) => m.typ === 'gespraech');
    const gbPeople = TA.uniq([name, app.user().name, ...S.cfg.users.filter((u) => u.aktiv !== false).map((u) => u.name)].filter(Boolean));
    const gbPre = [name, app.user().name];
    el.innerHTML = `
    <div class="print-head"><img src="pbz-logo.png" alt="pbz"><span class="t">Gesprächsblatt Qualität · ${esc(name)}</span><span class="s">${TA.fmtDate(von)} – ${TA.fmtDate(TA.isoToday())}</span></div>
    <div class="pagehead no-print"><div><div class="overline"><a href="#/empfehlungen">Empfehlungen</a> / Gesprächsblatt</div><h1>${esc(name)}</h1></div><div class="spacer"></div>
      <select class="select" id="b-t" aria-label="Zeitraum">${[[90, 'Letzte 90 Tage'], [180, 'Letzte 6 Monate'], [365, 'Letzte 12 Monate']].map(([v, l]) => `<option value="${v}"${tage === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <button class="btn btn-secondary" id="b-print">${TA.icons.printer}Drucken / PDF</button>${app.can('massnahmen') ? `<button class="btn btn-primary" id="b-m">Gespräch dokumentieren</button>` : ''}</div>
    <div class="grid g4">
      <div class="card kpi"><div class="lbl">Ablehnungen</div><div class="val">${abl.length}</div><div class="cmp">im Zeitraum, alle Status</div></div>
      <div class="card kpi"><div class="lbl">Verschuldete Fehler</div><div class="val">${A.sum(rows)}</div><div class="cmp">Team-Durchschnitt je Zeichner: ${TA.fmtNum(A.sum(team) / teamZ, 1)}</div></div>
      <div class="card kpi"><div class="lbl">Major-Fehler</div><div class="val">${A.sum(rows.filter((r) => r.p.schwere === 'major'))}</div><div class="cmp">soweit eingestuft</div></div>
      <div class="card kpi"><div class="lbl">Letztes Gespräch</div><div class="val" style="font-size:22px">${massn.find((m) => m.typ === 'gespraech') ? TA.fmtDate(massn.find((m) => m.typ === 'gespraech').datum) : '–'}</div><div class="cmp">${massn.length} Maßnahme${massn.length === 1 ? '' : 'n'} dokumentiert</div></div>
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h2>Häufigste Fehlerarten</h2>${fa.length ? `<table><thead><tr><th>Fehlerart</th><th>Kategorie</th><th class="num">Anzahl</th></tr></thead><tbody>${fa.map(([id, n]) => `<tr><td>${esc(A.faName(id) || '–')}</td><td class="small">${esc(A.hkName((A.faById(id) || {}).hk))}</td><td class="num">${n}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">Keine verschuldeten Fehler im Zeitraum.</p>'}</div>
      <div class="card"><h2>Nach Hauptkategorie</h2>${hk.length ? `<div class="bars">${hk.map(([id, n]) => `<div class="row"><span>${esc(A.hkName(id))}</span><div class="bar-wrap"><div class="bar" style="width:${(n / hk[0][1]) * 100}%"></div></div><span class="num">${n}</span></div>`).join('')}</div>` : '<p class="muted small">–</p>'}</div>
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h2>Empfohlene Maßnahmen</h2>${emp.length ? `<ul class="help">${emp.map((e) => `<li><b>${esc(e.titel)}</b><br>${esc(e.grund)}<br>${esc(e.vorschlag || '')}</li>`).join('')}</ul>` : '<p class="muted small">Aktuell keine Regel überschritten.</p>'}
        ${ursachen.length ? `<h2 style="margin-top:20px">Genannte Ursachen</h2><p class="small muted" style="margin:-4px 0 10px">Aus den Bewertungen der Projektleitung. Ein Klick öffnet die Ablehnung mit allen Details.</p>${ursachen.map((a) => `<button type="button" class="ursache" data-id="${esc(a.id)}"><b class="u-head"><span class="mono">${esc(a.standortId)}</span><span class="u-date">${TA.fmtDate(a.datumAblehnung)}</span></b><span>${esc(a.ursachePlaner)}</span><small>${TA.icons.move}Ablehnung öffnen</small></button>`).join('')}` : ''}</div>
      <div class="card" id="gb-form"><h2>Gespräch dokumentieren</h2>
        ${app.can('massnahmen') ? `<div class="stack">
          <div class="field"><label for="gb-datum">Datum des Gesprächs</label><input id="gb-datum" type="date" class="input" value="${TA.isoToday()}"></div>
          <div class="field"><label>Beteiligte – wer war im Gespräch?</label><div class="chips-in" id="gb-tn">${gbPeople.map((p) => `<button type="button" aria-pressed="${gbPre.includes(p)}" data-n="${esc(p)}">${esc(p)}</button>`).join('')}</div>
            <div style="display:flex;gap:6px;margin-top:6px"><input class="input" id="gb-extra" placeholder="Weitere Person hinzufügen …" style="flex:1"><button type="button" class="btn btn-secondary" id="gb-add">Hinzufügen</button></div></div>
          <div class="field"><label for="gb-verein">Vereinbarungen und nächste Schritte</label><textarea id="gb-verein" class="input" rows="5" placeholder="Was wurde besprochen? Was wurde vereinbart (z. B. Checkliste nutzen, Selbstprüfung vor Abgabe, Schulung)?"></textarea></div>
          <div class="field"><label for="gb-next">Nachkontrolle am (optional)</label><input id="gb-next" type="date" class="input"></div>
          <div><button type="button" class="btn btn-primary" id="gb-save">Gespräch speichern</button></div></div>` : '<p class="muted small">Nur Rollen mit dem Recht „Maßnahmen dokumentieren“ können Gespräche eintragen.</p>'}
        ${gespr.length ? `<h3 style="margin:20px 0 8px;font-size:14px">Bisherige Gespräche</h3>${gespr.map((m) => `<div class="ursache" style="cursor:default"><b>${TA.fmtDate(m.datum)}${m.teilnehmer && m.teilnehmer.length ? ' · ' + esc(m.teilnehmer.join(', ')) : ''}</b><span>${esc(m.notiz || 'Keine Notiz')}</span>${m.nachkontrolle ? `<small>${TA.icons.calendar}Nachkontrolle am ${TA.fmtDate(m.nachkontrolle)}</small>` : ''}</div>`).join('')}` : ''}
        <div class="print-only"><p class="small muted" style="margin-top:14px">Unterschrift Zeichner/in &nbsp; · &nbsp; Teamleitung</p><div class="lines"><div></div></div></div></div>
    </div>
    <div class="card" style="margin-top:16px"><h2>Ablehnungen im Zeitraum</h2>${abl.length ? `<table class="ctr"><thead><tr><th>Datum</th><th>Standort</th><th>Plan</th><th>Status</th><th title="Fehlerpunkte = einzelne Mängel, die der TMC in der Ablehnung genannt hat">Fehlerpunkte</th></tr></thead><tbody>
      ${abl.sort((a, b) => (b.datumAblehnung || '').localeCompare(a.datumAblehnung || '')).map((a) => `<tr class="clickrow" data-id="${a.id}"><td>${TA.fmtDate(a.datumAblehnung)}</td><td class="mono">${esc(a.standortId)}</td><td>${esc([a.planvariante, a.index].filter(Boolean).join(' · '))}</td><td>${app.statusBadge(a)}</td><td>${(a.punkte || []).length}</td></tr>`).join('')}
    </tbody></table><p class="small muted" style="margin:12px 0 0">Fehlerpunkte sind die einzelnen Mängel, die der TMC in einer Ablehnung nennt. Eine Ablehnung kann mehrere enthalten.</p>` : '<p class="muted small">Keine.</p>'}</div>`;
    el.querySelector('#b-print').onclick = () => window.print();
    el.querySelector('#b-t').onchange = (e) => { sessionStorage.setItem('ablehnungstool-blatt-tage', e.target.value); blatt(app.freshView(), params); };
    const bm = el.querySelector('#b-m'); if (bm) bm.onclick = () => { const f = el.querySelector('#gb-form'); f.scrollIntoView({ block: 'center', behavior: TA.reducedMotion() ? 'auto' : 'smooth' }); f.classList.add('flash'); setTimeout(() => f.classList.remove('flash'), 1600); const v = el.querySelector('#gb-verein'); if (v) v.focus({ preventScroll: true }); };
    const tn = el.querySelector('#gb-tn');
    if (tn) {
      tn.addEventListener('click', (e) => { const b = e.target.closest('button[data-n]'); if (b) b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); });
      const addP = () => { const inp = el.querySelector('#gb-extra'); const v = inp.value.trim(); if (!v) return; const ex = [...tn.children].find((b) => b.dataset.n === v); if (ex) ex.setAttribute('aria-pressed', 'true'); else { const b = document.createElement('button'); b.type = 'button'; b.dataset.n = v; b.textContent = v; b.setAttribute('aria-pressed', 'true'); tn.appendChild(b); } inp.value = ''; };
      el.querySelector('#gb-add').onclick = addP;
      el.querySelector('#gb-extra').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addP(); } });
      el.querySelector('#gb-save').onclick = async () => {
        const datum = el.querySelector('#gb-datum').value, notiz = el.querySelector('#gb-verein').value.trim();
        const teilnehmer = [...tn.querySelectorAll('[aria-pressed="true"]')].map((b) => b.dataset.n);
        if (!datum) { TA.toast('Bitte ein Datum angeben.', { error: true }); return; }
        if (!teilnehmer.length) { TA.toast('Bitte mindestens eine beteiligte Person auswählen.', { error: true }); return; }
        await S.saveMassnahme({ id: TA.uid('m'), typ: 'gespraech', datum, betrifft: name, hk: '', fehlerart: '', teilnehmer, notiz, nachkontrolle: el.querySelector('#gb-next').value || '', by: app.user().name, at: TA.nowIso() });
        TA.toast('Gespräch gespeichert. Die Zählung beginnt ab jetzt neu.');
        blatt(app.freshView(), params);
      };
    }
    el.addEventListener('click', (e) => { const r = e.target.closest('tr[data-id],button.ursache[data-id]'); if (r) app.go('#/a/' + r.dataset.id); });
  };
  app.views.blatt = blatt;
})(window.TA);
