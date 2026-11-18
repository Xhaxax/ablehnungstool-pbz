/* Ablehnung erfassen (Seitenpanel) und bearbeiten/bewerten (#/a/<id>) */
(function (TA) {
  'use strict';
  const S = TA.store, app = TA.app, A = TA.analysis, P = TA.parser, esc = TA.esc;

  const QUELLEN = { technik: 'TMC-Technik', minu: 'MiNu', pdf: 'Korrektur-PDF', manuell: 'Ergänzt', excel: 'Excel' };
  const hkShort = (name) => {
    let s = (name || '').replace(/\s*fehler$/i, '');
    if (/(ungs|heits|keits)$/.test(s)) s = s.slice(0, -1); else if (/er$/.test(s)) s = s.slice(0, -2);
    return s || name;
  };
  const hks = () => S.cfg.hauptkategorien.filter((h) => h.aktiv !== false);
  const verlauf = (a, text) => { (a.verlauf = a.verlauf || []).push({ at: TA.nowIso(), by: app.user().name, text }); };

  /* ================= ERFASSEN ================= */
  async function verarbeiten(files, pasted) {
    const mails = [], pdfs = [], fehler = [];
    for (const f of files) {
      try { const r = await P.readFile(f); (r.kind === 'pdf' ? pdfs : mails).push({ file: f, ...r }); }
      catch (e) { console.error(e); fehler.push(`${f.name}: ${e.message}`); }
    }
    if (pasted && pasted.trim()) mails.push({ file: new File([pasted], 'mailtext.txt', { type: 'text/plain' }), kind: 'mail', mail: P.parsePlain(pasted) });
    fehler.forEach((t) => TA.toast('Konnte nicht gelesen werden – ' + t, { error: true, ms: 8000 }));
    if (!mails.length && !pdfs.length) return;

    /* PDF-Anhaenge innerhalb der Mail mitnehmen */
    for (const m of mails) for (const at of (m.mail.files || [])) {
      if (/pdf/i.test(at.type) || /\.pdf$/i.test(at.name)) {
        try { pdfs.push({ file: new File([at.data], at.name, { type: 'application/pdf' }), kind: 'pdf', pdf: await P.parsePdf(at.data), ausMail: true }); } catch (e) { /* kein lesbares PDF */ }
      }
    }

    const m = mails[0];
    const d = m ? P.extract(m.mail) : { felder: {}, erkannt: new Set(), punkte: [], hinweise: [], korrekturdatei: false };
    pdfs.forEach((p) => d.punkte.push(...P.pointsFromPdf(p.pdf)));

    /* schon erfasst? */
    const f = d.felder;
    const dup = [...S.abl.values()].find((a) => (f.pruefId && a.pruefId === f.pruefId) || (f.planaktivitaet && a.planaktivitaet === f.planaktivitaet && a.datumAblehnung === f.datumAblehnung));
    if (dup) {
      const v = await TA.modal('Diese Ablehnung ist schon erfasst', `<p>Am ${TA.fmtDate(dup.datumAblehnung)} wurde für <b>${esc(dup.standortId)}</b> bereits eine Ablehnung mit derselben ${f.pruefId && dup.pruefId === f.pruefId ? 'Prüf-ID' : 'Planaktivität'} angelegt.</p>`,
        [{ label: 'Trotzdem neu anlegen', value: 'neu', cls: 'btn-ghost' }, { label: 'Vorhandene öffnen', value: 'open', cls: 'btn-primary' }]);
      if (v === 'open') { openAbl(dup.id); return; }
      if (v !== 'neu') return;
    }

    const a = {
      id: TA.uid('a-'), rev: 0, status: 'importiert', quelle: m ? 'mail' : 'pdf',
      standortId: f.standortId || '', tims: f.tims || '', standortName: f.standortName || '', projekt: '', cluster: '',
      planvariante: f.planvariante || '', index: f.index || '', datumEinreichung: '', datumAblehnung: f.datumAblehnung || TA.isoToday(),
      prueferTechnik: f.prueferTechnik || '', prueferMinu: f.prueferMinu || '', pruefId: f.pruefId || '', minuVorgang: f.minuVorgang || '',
      planaktivitaet: f.planaktivitaet || '', ticket: f.ticket || '', zeichner: '', qs: '',
      korrekturdatei: !!d.korrekturdatei || pdfs.length > 0, wiederholung: !!d.wiederholung, vorbehalt: !!d.vorbehalt, hinweise: d.hinweise || [],
      punkte: d.punkte.map((p) => ({ anzahl: 1, berechtigt: 'ja', verschuldet: 'ja', ...p })),
      erkannt: [...(d.erkannt || [])], betreff: m ? m.mail.subject : '', mailText: m ? (m.mail.text || '').slice(0, 30000) : '', core: d.core || '',
      dateien: [], verlauf: [], createdAt: TA.nowIso(), createdBy: app.user().name
    };
    const vg = A.vorgaenger(a.standortId);
    if (vg) {
      ['projekt', 'cluster', 'zeichner', 'qs', 'tims', 'standortName'].forEach((k) => { if (!a[k] && vg[k]) { a[k] = vg[k]; (a.uebernommen = a.uebernommen || []).push(k); } });
      a.vorgaengerId = vg.id;
    }
    verlauf(a, m ? `Mail importiert (${a.punkte.length} Fehlerpunkte erkannt)` : `Korrektur-PDF importiert (${a.punkte.length} Kommentare)`);
    for (const x of mails.concat(pdfs.filter((p) => !p.ausMail))) {
      const name = await S.saveAttachment(a.id, x.file.name, x.file);
      a.dateien.push({ name, typ: x.kind, at: TA.nowIso() });
    }
    await S.saveAbl(a);
    openAbl(a.id);
    TA.toast(`${a.punkte.length} Fehlerpunkte übernommen – bitte prüfen und kategorisieren`);
  }

  const neu = (el, params, opts) => {
    const inDrawer = !!(opts && opts.drawer);
    if (!app.can('importieren')) { el.innerHTML = '<div class="notice">Deine Rolle darf keine Ablehnungen anlegen.</div>'; return; }
    el.innerHTML = `
      <div class="stack">
        <label class="drop" id="drop" tabindex="0">
          ${TA.icons.upload}
          <b>Mail hierher ziehen oder klicken</b>
          <span class="muted">Outlook-Mail (.msg) oder gespeicherte Mail (.eml), gern zusammen mit der Korrektur-PDF</span>
          <input type="file" id="file" multiple accept=".msg,.eml,.txt,.pdf,message/rfc822,application/pdf" hidden>
        </label>
        <div class="or">oder Mailtext einfügen</div>
        <textarea class="input paste" id="paste" placeholder="Text der Ablehnungsmail hier einfügen (Strg+V) …"></textarea>
        <div class="toolbar" style="margin:0"><button type="button" class="btn btn-primary" id="go-paste" disabled>Fehler aus dem Text erkennen</button><span class="spacer"></span><button type="button" class="btn btn-ghost" id="go-empty">Ohne Mail anlegen</button></div>
        <ol class="steps-help">
          <li><b>Einlesen:</b> Standort, IDs, Prüfer, Plan und Index werden erkannt, die Fehler einzeln getrennt.</li>
          <li><b>Vorschlag:</b> Projekt, Zeichner und QS kommen von der letzten Ablehnung am selben Standort.</li>
          <li><b>Bewerten:</b> Kategorie je Punkt wählen – oder speichern, damit jemand anderes bewertet.</li>
        </ol>
        <p class="small muted" style="margin:0">Die Original-Mail wird im Datenordner abgelegt. Es wird nichts an externe Dienste geschickt.</p>
      </div>`;
    if (!inDrawer) el.insertAdjacentHTML('afterbegin', '<div class="pagehead"><div><h1>Neue Ablehnung</h1></div></div>');
    const drop = el.querySelector('#drop'), inp = el.querySelector('#file'), paste = el.querySelector('#paste'), goP = el.querySelector('#go-paste');
    const run = async (files, text) => {
      drop.classList.add('over'); drop.querySelector('b').textContent = 'Wird gelesen …';
      try { await verarbeiten(files, text); } catch (e) { console.error(e); TA.toast('Fehler beim Einlesen: ' + e.message, { error: true }); }
      finally { drop.classList.remove('over'); drop.querySelector('b').textContent = 'Mail hierher ziehen oder klicken'; }
    };
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
    inp.onchange = () => run([...inp.files]);
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); run([...e.dataTransfer.files]); });
    paste.oninput = () => (goP.disabled = paste.value.trim().length < 20);
    goP.onclick = () => run([], paste.value);
    el.querySelector('#go-empty').onclick = () => run([], ' ').then(async () => {
      const a = { id: TA.uid('a-'), rev: 0, status: 'importiert', quelle: 'manuell', punkte: [], dateien: [], verlauf: [], datumAblehnung: TA.isoToday(), createdAt: TA.nowIso(), createdBy: app.user().name };
      verlauf(a, 'Ohne Mail angelegt'); await S.saveAbl(a); openAbl(a.id);
    });
  };
  app.views.neu = neu;
  function openAbl(id) { if (app.closeNew) { app.closeNew(); app.closeNew = null; } app.go('#/a/' + id); }

  /* ================= DETAIL / BEWERTEN ================= */
  const detail = async (el, params) => {
    const id = params[0];
    let a = S.abl.get(id);
    if (!a) { el.innerHTML = '<div class="card empty"><b>Ablehnung nicht gefunden</b>Sie wurde gelöscht oder ist im Datenordner nicht vorhanden.<br><a class="btn btn-secondary" href="#/liste">Zur Liste</a></div>'; return; }
    a = TA.clone(a);
    const u = app.user();
    const canStamm = app.can('stammdaten'), canBew = app.can('bewerten');
    let readonly = !(canStamm || canBew);
    let lockInfo = null;
    app.busy = true;

    if (!readonly) {
      const r = await S.lock(id, u);
      if (!r.ok) { readonly = true; lockInfo = r.lock; }
    }
    const lockTimer = !readonly ? setInterval(() => S.lock(id, u), 5 * 60000) : null;
    app.leave = () => { clearInterval(lockTimer); if (!readonly) S.unlock(id, u); app.dirty = false; flush(); };

    /* ---------- Speichern (automatisch) ---------- */
    let saveTimer = null, saving = false, pending = false, editedLogged = false;
    async function doSave() {
      if (readonly) return;
      if (saving) { pending = true; return; }
      saving = true; setSaveInfo('Speichert …');
      try {
        const st = A.status(a);
        if (a.status === 'bewertet' && !st.komplett) { a.status = 'bewertung'; verlauf(a, 'Bewertung wieder geöffnet (unvollständig)'); TA.toast('Bewertung ist unvollständig und wieder „In Bewertung“'); }
        if (a.status === 'importiert' && (a.punkte || []).some((p) => p.hk || p.fehlerart)) a.status = 'bewertung';
        if (!editedLogged) { verlauf(a, 'bearbeitet'); editedLogged = true; }
        const saved = await S.saveAbl(a);
        a.rev = saved.rev; app.dirty = false;
        setSaveInfo('Gespeichert ' + TA.fmtTime(new Date()));
        refreshMeta();
      } catch (e) {
        if (e instanceof S.Conflict) {
          TA.toast('Jemand anderes hat diese Ablehnung inzwischen gespeichert. Der neue Stand wurde geladen.', { error: true, ms: 8000 });
          S.abl.set(e.disk.id, e.disk); app.dirty = false; app.route(); return;
        }
        console.error(e); setSaveInfo('Nicht gespeichert'); TA.toast('Speichern fehlgeschlagen: ' + e.message, { error: true, action: 'Erneut', onAction: doSave });
      } finally { saving = false; if (pending) { pending = false; doSave(); } }
    }
    const schedule = () => { if (readonly) return; app.dirty = true; setSaveInfo('Ungespeicherte Änderung'); clearTimeout(saveTimer); saveTimer = setTimeout(doSave, 700); };
    function flush() { if (saveTimer && app.dirty) { clearTimeout(saveTimer); doSave(); } }
    const setSaveInfo = (t) => { const x = el.querySelector('#d-save'); if (x) x.textContent = t; };

    /* ---------- Rendern ---------- */
    const L = S.cfg.listen;
    const fld = (k, label, opts = {}) => {
      const v = a[k] || '';
      const pre = (a.erkannt || []).includes(k) ? ' prefilled' : (a.uebernommen || []).includes(k) ? ' taken' : '';
      const dis = readonly || !canStamm ? ' disabled' : '';
      const req = opts.req ? ' <span class="req">· Pflichtfeld</span>' : '';
      let ctl;
      if (opts.type === 'select') ctl = `<select class="select" id="f-${k}" data-f="${k}"${dis}>${app.options(opts.list, v)}</select>`;
      else ctl = `<input class="input${opts.mono ? ' mono-in' : ''}" id="f-${k}" data-f="${k}" type="${opts.type || 'text'}" value="${esc(v)}"${opts.dl ? ` list="dl-${k}"` : ''}${dis} autocomplete="off">`;
      return `<div class="field${pre}"${opts.span ? ` style="grid-column:span ${opts.span}"` : ''}><label for="f-${k}">${label}${req}</label>${ctl}${opts.hint ? `<span class="hint">${opts.hint}</span>` : ''}</div>`;
    };

    function punktHtml(p, i) {
      const done = p.hk && p.fehlerart && p.verschuldet;
      const fa = p.fehlerart ? S.cfg.fehlerarten.find((x) => x.id === p.fehlerart) : null;
      const dis = readonly || !canBew ? ' disabled' : '';
      const seg = (k, opts) => `<div class="seg sm" role="group" data-k="${k}">${opts.map(([v, l, cls]) => `<button type="button" data-v="${v}" class="${cls || ''}" aria-pressed="${p[k] === v}"${dis}>${l}</button>`).join('')}</div>`;
      return `<div class="pt ${done ? 'done' : 'todo'}" data-p="${esc(p.id)}">
        <div class="pt-head">
          <span class="pt-num">${i + 1}</span>
          <span class="src ${p.quelle === 'minu' ? 'minu' : ''}">${esc(QUELLEN[p.quelle] || p.quelle || 'Ergänzt')}${p.seite ? ' · S. ' + p.seite : ''}</span>
          <textarea class="input pt-txt" data-k="text" rows="2" aria-label="Fehlertext Punkt ${i + 1}"${readonly || !canStamm ? ' disabled' : ''}>${esc(p.text)}</textarea>
          ${readonly ? '' : `<div class="pt-tools"><button type="button" class="btn btn-ghost btn-sm" data-act="split" title="Enthält dieser Punkt mehrere Fehler? Cursor im Text an die Trennstelle setzen und hier klicken – der Punkt wird in zwei Punkte geteilt.">${TA.icons.scissors}Teilen</button><button type="button" class="iconbtn" data-act="del" title="Punkt löschen" aria-label="Punkt löschen">${TA.icons.trash}</button></div>`}
        </div>
        ${p.verweis ? '<div class="notice" style="margin:8px 0 0 36px">Dieser Punkt verweist auf die Korrektur-PDF. Lade die PDF hoch, um die Kommentare als einzelne Punkte zu übernehmen.</div>' : ''}
        <div class="pt-ctl">
          <div class="pt-f"><span class="pt-l">Hauptkategorie</span><div class="seg" role="group" aria-label="Hauptkategorie" data-k="hk">${hks().map((h) => `<button type="button" data-v="${esc(h.id)}" title="${esc(h.name + ' – ' + (h.info || ''))}" aria-pressed="${p.hk === h.id}"${dis}>${esc(hkShort(h.name))}</button>`).join('')}</div></div>
          <div class="pt-f combo"><span class="pt-l">Fehlerart</span><input class="input fa-in" data-k="fehlerart" value="${esc(fa ? fa.name : '')}" placeholder="${p.hk ? 'Suchen oder neu anlegen …' : 'Suchen …'}" autocomplete="off" role="combobox" aria-expanded="false" aria-label="Fehlerart Punkt ${i + 1}"${dis}><ul class="combo-list" role="listbox" hidden></ul>${!p.fehlerart && p.text && !dis && !knownFa(p.text) ? `<button type="button" class="newfa" data-newfa="${esc(p.id)}" title="Dieser Grund passt zu keiner bekannten Fehlerart">${TA.icons.plus}Neuer Grund erkannt – als Fehlerart anlegen</button>` : ''}</div>
          <div class="pt-f"><span class="pt-l">Anzahl</span><input class="input num" type="number" min="1" max="99" data-k="anzahl" value="${esc(p.anzahl || 1)}" style="width:64px" aria-label="Anzahl"${dis}></div>
          <div class="pt-f"><span class="pt-l">Schwere</span>${seg('schwere', [['minor', 'Minor'], ['major', 'Major']])}</div>
          <div class="pt-f"><span class="pt-l">Berechtigt</span>${seg('berechtigt', [['ja', 'Ja'], ['nein', 'Nein', 'no']])}</div>
          <div class="pt-f"><span class="pt-l">Verschuldet</span>${seg('verschuldet', [['ja', 'Ja'], ['teilweise', 'Teilw.', 'part'], ['nein', 'Nein', 'no']])}</div>
        </div></div>`;
    }

    function render() {
      const st = A.status(a);
      const vg = a.vorgaengerId ? S.abl.get(a.vorgaengerId) : null;
      const sameSite = [...S.abl.values()].filter((x) => x.standortId && x.standortId === a.standortId && x.id !== a.id).sort((x, y) => (y.datumAblehnung || '').localeCompare(x.datumAblehnung || ''));
      el.innerHTML = `
      <div class="pagehead"><div><div class="overline"><a href="#/liste">Ablehnungen</a> / ${esc(a.standortId || 'neu')}</div>
        <h1>${esc(a.standortId || 'Ohne Standort')} ${esc(a.standortName || '')} <span id="d-badge">${app.statusBadge(a)}</span></h1>
        <p class="muted small" style="margin:4px 0 0">${esc([a.projekt && 'Projekt ' + a.projekt, a.cluster, [a.planvariante, a.index && 'Index ' + a.index].filter(Boolean).join(' '), a.datumAblehnung && 'abgelehnt am ' + TA.fmtDate(a.datumAblehnung)].filter(Boolean).join(' · '))}</p></div>
        <div class="spacer"></div>
        <span class="small muted" id="d-save" aria-live="polite">${readonly ? 'Nur lesen' : 'Änderungen werden automatisch gespeichert'}</span>
        ${a.status === 'bewertet' ? (canBew && !readonly ? '<button type="button" class="btn btn-secondary" id="d-reopen">Bewertung wieder öffnen</button>' : '')
    : (canBew && !readonly ? '<button type="button" class="btn btn-primary" id="d-finish">Bewertung abschließen</button>' : '')}
      </div>
      ${lockInfo ? `<div class="notice readonly-bar">${esc(lockInfo.user)} bearbeitet diese Ablehnung gerade (Sperre bis ${TA.fmtTime(lockInfo.until)} Uhr). Du siehst sie nur zum Lesen. <button type="button" class="btn btn-sm btn-secondary" id="d-force" style="margin-left:auto">Trotzdem übernehmen</button></div>` : ''}
      ${!canBew && !readonly ? '<div class="notice info">Deine Rolle trägt die Projektdaten ein. Kategorien und Verschuldung vergibt die Projektleitung oder QS.</div>' : ''}
      ${a.wiederholung || sameSite.length ? `<div class="notice">${a.wiederholung ? '<b>Erneute Ablehnung</b> – der TMC bemängelt offene bzw. nicht umgesetzte Korrekturen. ' : ''}${sameSite.length ? `Am Standort gibt es ${sameSite.length} weitere Ablehnung${sameSite.length > 1 ? 'en' : ''}: ${sameSite.slice(0, 4).map((x) => `<a href="#/a/${esc(x.id)}">${TA.fmtDate(x.datumAblehnung)}</a>`).join(', ')}` : ''}</div>` : ''}
      ${vg && (a.uebernommen || []).length ? `<div class="notice info">${esc((a.uebernommen || []).map((k) => ({ projekt: 'Projekt', cluster: 'Cluster', zeichner: 'Zeichner', qs: 'QS', tims: 'TIMS-Nr.', standortName: 'Standortname' })[k]).join(', '))} aus der Ablehnung vom ${TA.fmtDate(vg.datumAblehnung)} übernommen – bitte prüfen.</div>` : ''}
      <div id="d-missing"></div>
      <div class="grid g-73">
        <div class="stack">
          <section class="card" aria-labelledby="h-st">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><h2 id="h-st" style="margin:0">Projekt &amp; Personen</h2><div class="spacer"></div><div class="legend-in"><span><i></i>aus der Mail erkannt</span><span><i class="t"></i>von der letzten Ablehnung übernommen</span></div></div>
            <div class="fgrid">
              ${fld('standortId', 'Standort-ID', { req: true })}${fld('tims', 'TIMS-Nr.')}${fld('standortName', 'Standortname', { span: 2 })}
              ${fld('projekt', 'Projektnummer', { req: true, dl: true })}${fld('cluster', 'Clusterinfo', { type: 'select', list: L.cluster })}${fld('planvariante', 'Planvariante', { type: 'select', list: L.planvariante })}${fld('index', 'Index')}
              ${fld('zeichner', 'Zeichner', { req: true, dl: true })}${fld('qs', 'QS', { dl: true })}${fld('datumEinreichung', 'Eingereicht am', { type: 'date' })}${fld('datumAblehnung', 'Abgelehnt am', { type: 'date', req: true })}
              ${fld('prueferTechnik', 'Prüfer TMC-Technik', { dl: true })}${fld('prueferMinu', 'Prüfer MiNu', { dl: true })}${fld('pruefId', 'Prüf-ID')}${fld('planaktivitaet', 'Planaktivität')}
            </div>
            <label class="small" style="display:inline-flex;gap:6px;margin-top:12px"><input type="checkbox" data-f="korrekturdatei"${a.korrekturdatei ? ' checked' : ''}${readonly || !canStamm ? ' disabled' : ''}> Korrekturdatei (PDF) vom TMC vorhanden</label>
            ${app.datalist('dl-zeichner', L.zeichner.concat(app.history('zeichner')))}${app.datalist('dl-qs', L.qs.concat(app.history('qs')))}${app.datalist('dl-projekt', app.history('projekt'))}${app.datalist('dl-prueferTechnik', app.history('prueferTechnik'))}${app.datalist('dl-prueferMinu', app.history('prueferMinu'))}
          </section>

          <section class="card" aria-labelledby="h-pt">
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><h2 id="h-pt" style="margin:0">Fehlerpunkte</h2><span class="small muted" id="d-prog"></span>
              <div class="spacer"></div>
              ${!readonly && canBew ? '<span class="small muted">Für alle Punkte:</span><button type="button" class="btn btn-sm btn-secondary" data-all="berechtigt:ja">Berechtigt: Ja</button><button type="button" class="btn btn-sm btn-secondary" data-all="verschuldet:ja">Verschuldet: Ja</button><button type="button" class="btn btn-sm btn-secondary" data-all="schwere:minor">Schwere: Minor</button>' : ''}
            </div>
            <div class="progress" style="margin:10px 0 18px"><span id="d-bar" style="width:0"></span></div>
            ${readonly ? '' : '<p class="small muted" style="margin:0 0 14px">Steckt in einem Punkt mehr als ein Fehler? Cursor in den Text setzen und „Teilen“ klicken.</p>'}
            <div id="d-pts" class="pts"></div>
            ${readonly ? '' : '<button type="button" class="btn btn-secondary" id="d-add" style="margin-top:12px">+ Punkt ergänzen</button>'}
          </section>

          <section class="card" aria-labelledby="h-ur">
            <h2 id="h-ur">Ursache &amp; Maßnahme</h2>
            <div class="grid g2">
              ${[['ursachePlaner', 'Warum ist der Fehler beim Planer entstanden?'], ['ursacheQS', 'Warum ist der Fehler bei der QS durchgegangen?'], ['bemerkungPL', 'Bemerkung Projektleitung'], ['fehlerminimierung', 'Fehlerminimierung / Maßnahme'], ['bemerkungRM', 'Bemerkung Ressourcenmanagement']].map(([k, l]) =>
    `<div class="field"><label for="f-${k}">${l}</label><textarea class="input" id="f-${k}" data-f="${k}" rows="3"${readonly ? ' disabled' : ''}>${esc(a[k] || '')}</textarea></div>`).join('')}
            </div>
          </section>
        </div>

        <aside class="stack">
          <section class="card" aria-labelledby="h-ml">
            <h2 id="h-ml">Original-Mail</h2>
            ${a.betreff ? `<p class="mail-meta">${esc(a.betreff)}</p>` : ''}
            ${a.mailText ? `<div class="mailbox">${highlight(a)}</div>` : '<p class="small muted">Keine Mail hinterlegt.</p>'}
            <ul class="files">${(a.dateien || []).map((f) => `<li>${TA.icons.file} <a data-file="${esc(f.name)}">${esc(f.name)}</a></li>`).join('')}</ul>
            ${readonly ? '' : `<label class="btn btn-sm btn-secondary" style="margin-top:10px">Korrektur-PDF / Datei hinzufügen<input type="file" id="d-upload" accept=".pdf,.msg,.eml,.png,.jpg" multiple hidden></label>`}
          </section>
          <section class="card" aria-labelledby="h-vl">
            <h2 id="h-vl">Verlauf</h2>
            <ul class="timeline">${(a.verlauf || []).slice().reverse().slice(0, 12).map((v) => `<li><span class="small muted">${TA.fmtDateTime(v.at)} · ${esc(v.by)}</span>${esc(v.text)}</li>`).join('')}</ul>
          </section>
          ${app.can('loeschen') && !readonly ? '<button type="button" class="btn btn-danger btn-sm" id="d-del">Ablehnung löschen</button>' : ''}
        </aside>
      </div>`;
      renderPoints();
      refreshMeta();
    }

    function highlight(x) {
      let t = esc(x.mailText);
      const core = (x.core || '').trim();
      if (core) {
        const head = esc(core.slice(0, 60));
        const i = t.indexOf(head);
        if (i >= 0) {
          const endMark = t.search(/Eine Korrekturdatei finden Sie|Wir bitten um Korrektur/);
          const j = endMark > i ? endMark : Math.min(t.length, i + esc(core).length);
          t = t.slice(0, i) + '<mark>' + t.slice(i, j) + '</mark>' + t.slice(j);
        }
      }
      return t;
    }

    function renderPoints() {
      const box = el.querySelector('#d-pts');
      box.innerHTML = (a.punkte || []).length ? a.punkte.map(punktHtml).join('')
        : `<div class="empty"><b>Noch keine Fehlerpunkte</b>${a.korrekturdatei ? 'Die Fehler stehen vermutlich in der Korrektur-PDF. Lade sie rechts hoch – Kommentare werden als Punkte übernommen.' : 'Ergänze die Punkte manuell.'}</div>`;
    }

    const STOP = new Set(['bitte', 'nach', 'nicht', 'sind', 'wird', 'werden', 'auch', 'oder', 'sowie', 'diese', 'dieser', 'wurde', 'wurden', 'haben', 'noch', 'dass', 'beim', 'einer', 'eine', 'einen']);
    const words = (s) => TA.norm(s).split(/[^a-zäöüß0-9]+/).filter((w) => w.length > 3 && !STOP.has(w));
    function knownFa(text) {
      const tw = words(text); if (!tw.length) return true;
      return S.cfg.fehlerarten.some((f) => { const fw = words(f.name); if (!fw.length) return false; const hit = fw.filter((w) => tw.some((t) => t === w || t.startsWith(w.slice(0, 5)) || w.startsWith(t.slice(0, 5)))).length; return hit / fw.length >= 0.6; });
    }
    function faName(text) {
      let s = String(text || '').replace(/\s+/g, ' ').trim().replace(/^[-–•\d.)\s]+/, '');
      s = s.split(/[;:.,]| - | – | bitte /i)[0].trim();
      if (s.length > 70) s = s.slice(0, 67).replace(/\s+\S*$/, '') + '…';
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    async function newFaDialog(pt) {
      const hkOpt = hks().map((h) => `<option value="${esc(h.id)}"${pt.hk === h.id ? ' selected' : ''}>${esc(h.name)}</option>`).join('');
      const body = `<p class="muted small" style="margin-top:-4px">Dieser Grund passt zu keiner bekannten Fehlerart. Lege ihn neu an – danach steht er allen zur Auswahl.</p>
        <blockquote class="quote">${esc(pt.text)}</blockquote>
        <div class="field"><label for="nf-n">Name der Fehlerart</label><input id="nf-n" class="input" value="${esc(faName(pt.text))}"></div>
        <div class="field" style="margin-top:12px"><label for="nf-h">Hauptkategorie</label><select id="nf-h" class="select"><option value="">– wählen –</option>${hkOpt}</select></div>`;
      const v = await TA.modal('Neue Fehlerart anlegen', body, [{ label: 'Abbrechen', value: null, cls: 'btn-ghost' }, { label: 'Anlegen und zuweisen', value: true, cls: 'btn-primary' }], {
        collect: (m) => ({ name: m.querySelector('#nf-n').value.trim(), hk: m.querySelector('#nf-h').value }),
        validate: (m) => { if (!m.querySelector('#nf-n').value.trim() || !m.querySelector('#nf-h').value) { TA.toast('Bitte Name und Hauptkategorie angeben.', { error: true }); return false; } return true; }
      });
      if (!v) return;
      let fa = S.cfg.fehlerarten.find((f) => TA.norm(f.name) === TA.norm(v.name));
      if (!fa) { fa = { id: TA.uid('fa-'), name: v.name, hk: v.hk, aktiv: true }; await S.saveCfg((c) => { c.fehlerarten.push(fa); }); }
      pt.hk = fa.hk; pt.fehlerart = fa.id;
      renderPoints(); refreshMeta(); schedule(); TA.toast('Fehlerart angelegt und zugewiesen');
    }

    function gotoMissing(x) {
      let target = null;
      if (x.point) target = el.querySelector(`.pt[data-p="${x.point}"]`);
      else if (x.field) target = el.querySelector('#f-' + x.field);
      else target = el.querySelector('#d-add');
      if (!target) return;
      target.scrollIntoView({ block: 'center', behavior: TA.reducedMotion() ? 'auto' : 'smooth' });
      target.classList.add('flash'); setTimeout(() => target.classList.remove('flash'), 1600);
      const f = target.matches('input,select,button') ? target : target.querySelector('input,button'); if (f) f.focus({ preventScroll: true });
    }

    function refreshMeta() {
      const st = A.status(a);
      const p = el.querySelector('#d-prog'); if (p) p.textContent = st.gesamt ? `${st.fertig} von ${st.gesamt} vollständig bewertet` : '';
      const b = el.querySelector('#d-bar'); if (b) b.style.width = (st.gesamt ? (100 * st.fertig) / st.gesamt : 0) + '%';
      const badge = document.getElementById('d-badge'); if (badge) badge.innerHTML = app.statusBadge(a);
      el.querySelectorAll('.pt').forEach((row) => {
        const pt = a.punkte.find((x) => x.id === row.dataset.p); if (!pt) return;
        const done = pt.hk && pt.fehlerart && pt.verschuldet;
        row.classList.toggle('done', !!done); row.classList.toggle('todo', !done);
      });
      const miss = A.fehlt(a);
      const fin = el.querySelector('#d-finish');
      if (fin) fin.title = miss.length ? 'Es fehlen noch Angaben – siehe Hinweis unten' : 'Ablehnung geht in die Auswertung ein';
      const m = el.querySelector('#d-missing');
      if (m) m.innerHTML = a.status !== 'bewertet' && miss.length ? `<div class="todo-box"><b>Zum Abschließen noch nötig</b><ul>${miss.map((x, i) => `<li><button type="button" class="link-btn" data-goto="${i}">${esc(x.text)}</button></li>`).join('')}</ul></div>` : (a.status !== 'bewertet' && canBew ? '<div class="todo-box ok"><b>Alles ausgefüllt</b> – die Bewertung kann abgeschlossen werden.</div>' : '');
      if (m) m._miss = miss;
    }

    /* ---------- Fehlerart-Combobox ---------- */
    let comboState = null;
    function openCombo(input) {
      const row = input.closest('.pt'); const pt = a.punkte.find((x) => x.id === row.dataset.p);
      const list = input.parentElement.querySelector('.combo-list');
      const q = TA.norm(input.value);
      const freq = A.faHaeufigkeit();
      const fas = S.cfg.fehlerarten.filter((f) => f.aktiv !== false && (!pt.hk || f.hk === pt.hk))
        .filter((f) => !q || TA.norm(f.name).includes(q) || (comboState && comboState.showAll))
        .sort((x, y) => (freq.get(y.id) || 0) - (freq.get(x.id) || 0) || x.name.localeCompare(y.name, 'de')).slice(0, 40);
      const exact = S.cfg.fehlerarten.some((f) => TA.norm(f.name) === q && (!pt.hk || f.hk === pt.hk));
      let html = fas.map((f, i) => `<li role="option" data-fa="${esc(f.id)}" aria-selected="${i === 0 && q ? 'true' : 'false'}">${esc(f.name)}${!pt.hk ? ` <span class="c">${esc(hkShort(A.hkName(f.hk)))}</span>` : ''}${freq.get(f.id) ? `<span class="c">${freq.get(f.id)}×</span>` : ''}</li>`).join('');
      if (q && !exact) html += pt.hk ? `<li role="option" class="new" data-new="1" aria-selected="${fas.length ? 'false' : 'true'}">„${esc(input.value.trim())}“ als neue Fehlerart unter ${esc(A.hkName(pt.hk))} anlegen</li>` : '<li class="new" aria-disabled="true">Für eine neue Fehlerart zuerst die Hauptkategorie wählen</li>';
      if (!html) html = '<li aria-disabled="true">Keine Fehlerart gefunden</li>';
      list.innerHTML = html; list.hidden = false; input.setAttribute('aria-expanded', 'true');
      comboState = { input, list, pt };
    }
    function closeCombo() { if (comboState) { comboState.list.hidden = true; comboState.input.setAttribute('aria-expanded', 'false'); const fa = S.cfg.fehlerarten.find((f) => f.id === comboState.pt.fehlerart); comboState.input.value = fa ? fa.name : ''; } comboState = null; }
    async function pickCombo(li) {
      const { input, pt } = comboState;
      if (li.dataset.new) {
        const name = input.value.trim();
        const fa = { id: TA.uid('fa-'), name, hk: pt.hk, aktiv: true, neuVon: app.user().name, neuAm: TA.isoToday() };
        try { await S.saveCfg((c) => c.fehlerarten.push(fa)); } catch (e) { TA.toast('Fehlerart konnte nicht angelegt werden: ' + e.message, { error: true }); return; }
        pt.fehlerart = fa.id; TA.toast(`Neue Fehlerart „${name}“ angelegt`);
      } else if (li.dataset.fa) {
        pt.fehlerart = li.dataset.fa;
        const fa = S.cfg.fehlerarten.find((f) => f.id === pt.fehlerart);
        if (fa && pt.hk !== fa.hk) { pt.hk = fa.hk; input.closest('.pt').querySelectorAll('[data-k="hk"] button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === pt.hk)); }
      } else return;
      closeCombo(); schedule(); refreshMeta();
      const next = input.closest('.pt').nextElementSibling;
      if (next) { const nb = next.querySelector('[data-k="hk"] button'); if (nb) nb.focus(); }
    }

    /* ---------- Ereignisse ---------- */
    function bind() {
      el.addEventListener('input', (e) => {
        const t = e.target;
        if (t.dataset.f && t.type !== 'checkbox') { a[t.dataset.f] = t.dataset.f === 'standortId' ? t.value.toUpperCase() : t.value; schedule(); return; }
        const row = t.closest('.pt'); if (!row) return;
        const pt = a.punkte.find((x) => x.id === row.dataset.p);
        if (t.dataset.k === 'text') { pt.text = t.value; schedule(); }
        else if (t.dataset.k === 'anzahl') { pt.anzahl = Math.max(1, parseInt(t.value, 10) || 1); schedule(); }
        else if (t.dataset.k === 'fehlerart') { comboState = null; openCombo(t); }
      });
      el.addEventListener('change', (e) => {
        const t = e.target;
        if (t.dataset.f && t.type === 'checkbox') { a[t.dataset.f] = t.checked; schedule(); }
        else if (t.dataset.f && t.tagName === 'SELECT') { a[t.dataset.f] = t.value; schedule(); }
        else if (t.dataset.f === 'zeichner' || t.dataset.f === 'qs') addToList(t.dataset.f, t.value);
        else if (t.dataset.f === 'standortId') { a.standortId = TA.normStandort(t.value); t.value = a.standortId; schedule(); }
        if (t.id === 'd-upload') upload([...t.files]);
      });
      el.addEventListener('focusin', (e) => { if (e.target.classList.contains('fa-in')) { comboState = null; openCombo(e.target); } });
      el.addEventListener('focusout', (e) => { if (!e.target.classList.contains('fa-in')) return; const st = comboState; setTimeout(() => { if (st && comboState === st && st.input === e.target && !st.list.contains(document.activeElement)) closeCombo(); }, 150); });
      el.addEventListener('keydown', (e) => {
        if (!comboState || e.target !== comboState.input) return;
        const items = [...comboState.list.querySelectorAll('li[role="option"]')];
        let i = items.findIndex((x) => x.getAttribute('aria-selected') === 'true');
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); i = e.key === 'ArrowDown' ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1);
          items.forEach((x, j) => x.setAttribute('aria-selected', j === i)); if (items[i]) items[i].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') { e.preventDefault(); if (items[i]) pickCombo(items[i]); }
        else if (e.key === 'Escape') { e.preventDefault(); closeCombo(); }
      });
      el.addEventListener('mousedown', (e) => { const li = e.target.closest('.combo-list li'); if (li && comboState) { e.preventDefault(); pickCombo(li); } });

      el.addEventListener('click', async (e) => {
        const t = e.target;
        const segBtn = t.closest('.seg button[data-v]');
        if (segBtn && segBtn.closest('.pt') && !segBtn.disabled) {
          const row = segBtn.closest('.pt'); const pt = a.punkte.find((x) => x.id === row.dataset.p);
          const k = segBtn.closest('[data-k]').dataset.k; const v = segBtn.dataset.v;
          pt[k] = pt[k] === v && k !== 'hk' ? '' : v;
          if (k === 'hk') { const fa = S.cfg.fehlerarten.find((f) => f.id === pt.fehlerart); if (fa && fa.hk !== v) { pt.fehlerart = ''; row.querySelector('.fa-in').value = ''; } row.querySelector('.fa-in').placeholder = 'Suchen oder neu anlegen …'; }
          segBtn.closest('[data-k]').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === pt[k]));
          if (k === 'hk' && !pt.fehlerart) { const fi = row.querySelector('.fa-in'); fi.focus(); }
          schedule(); refreshMeta(); return;
        }
        const nfa = t.closest('[data-newfa]');
        if (nfa) { const pt = a.punkte.find((x) => x.id === nfa.dataset.newfa); if (pt) newFaDialog(pt); return; }
        const all = t.closest('[data-all]');
        if (all) { const [k, v] = all.dataset.all.split(':'); a.punkte.forEach((p) => (p[k] = v)); renderPoints(); refreshMeta(); schedule(); TA.toast('Für alle Punkte gesetzt'); return; }
        const act = t.closest('[data-act]');
        if (act) {
          const row = act.closest('.pt'); const idx = a.punkte.findIndex((x) => x.id === row.dataset.p); const pt = a.punkte[idx];
          if (act.dataset.act === 'del') {
            const removed = a.punkte.splice(idx, 1)[0]; renderPoints(); refreshMeta(); schedule();
            TA.toast('Punkt gelöscht', { action: 'Rückgängig', onAction: () => { a.punkte.splice(idx, 0, removed); renderPoints(); refreshMeta(); schedule(); } });
          } else if (act.dataset.act === 'split') {
            const ta = row.querySelector('.pt-txt'); let pos = ta.selectionStart;
            if (!pos || pos >= pt.text.length) { const parts = P.splitPoints(pt.text); if (parts.length > 1) { a.punkte.splice(idx, 1, ...parts.map((x, j) => ({ ...pt, id: j ? TA.uid('p-') : pt.id, text: x }))); } else { TA.toast('Cursor an die Stelle setzen, an der geteilt werden soll'); return; } }
            else { const l = pt.text.slice(0, pos).trim(), r = pt.text.slice(pos).replace(/^[\s;.,-]+/, '').trim(); if (!l || !r) return; pt.text = l; a.punkte.splice(idx + 1, 0, { ...pt, id: TA.uid('p-'), text: r, fehlerart: '', hk: '' }); }
            renderPoints(); refreshMeta(); schedule();
          }
          return;
        }
        if (t.id === 'd-add') { a.punkte.push({ id: TA.uid('p-'), quelle: 'manuell', text: '', anzahl: 1, berechtigt: 'ja', verschuldet: 'ja' }); renderPoints(); refreshMeta(); const last = el.querySelectorAll('.pt-txt'); last[last.length - 1].focus(); return; }
        if (t.closest('[data-goto]')) { const m = el.querySelector('#d-missing'); const x = m && m._miss && m._miss[+t.closest('[data-goto]').dataset.goto]; if (x) gotoMissing(x); return; }
        if (t.id === 'd-finish') {
          const miss = A.fehlt(a);
          if (miss.length) { TA.toast('Es fehlen noch Angaben: ' + miss[0].text + (miss.length > 1 ? ` (+${miss.length - 1})` : ''), { error: true }); gotoMissing(miss[0]); return; }
          a.status = 'bewertet'; a.bewertetAm = TA.nowIso(); a.bewertetVon = app.user().name; verlauf(a, 'Bewertung abgeschlossen');
          await doSave(); TA.toast('Bewertung abgeschlossen – die Ablehnung zählt jetzt in der Auswertung'); render(); return;
        }
        if (t.id === 'd-reopen') { a.status = 'bewertung'; verlauf(a, 'Bewertung wieder geöffnet'); await doSave(); render(); return; }
        if (t.id === 'd-force') {
          if (await TA.confirm('Bearbeitung übernehmen?', `${esc(lockInfo.user)} hat die Ablehnung geöffnet. Wenn ihr gleichzeitig speichert, gewinnt der zuletzt gespeicherte Stand.`, 'Übernehmen')) {
            await S.unlock(id, { id: lockInfo.userId }); await S.saveLockForce(id, u); app.route();
          }
          return;
        }
        if (t.id === 'd-del') {
          if (await TA.confirm('Ablehnung löschen?', `Die Ablehnung <b>${esc(a.standortId)}</b> vom ${TA.fmtDate(a.datumAblehnung)} mit ${a.punkte.length} Punkten und allen Anhängen wird endgültig aus dem Datenordner entfernt.`, 'Endgültig löschen', true)) {
            app.dirty = false; clearTimeout(saveTimer); await S.deleteAbl(a.id); TA.toast('Ablehnung gelöscht'); app.go('#/liste');
          }
          return;
        }
        const fl = t.closest('[data-file]');
        if (fl) { try { const f = await S.getAttachment(a.id, fl.dataset.file); TA.download(fl.dataset.file, f); } catch (er) { TA.toast(er.message, { error: true }); } }
      });
    }

    async function addToList(k, v) {
      v = (v || '').trim(); if (!v || /nicht erforderlich/i.test(v)) return;
      if (!S.cfg.listen[k].includes(v)) { try { await S.saveCfg((c) => { if (!c.listen[k].includes(v)) c.listen[k].push(v); }); } catch (e) { /* Liste optional */ } }
    }

    async function upload(files) {
      let neuePunkte = 0;
      for (const f of files) {
        const name = await S.saveAttachment(a.id, f.name, f);
        (a.dateien = a.dateien || []).push({ name, typ: /\.pdf$/i.test(f.name) ? 'pdf' : 'datei', at: TA.nowIso() });
        if (/\.pdf$/i.test(f.name)) {
          try {
            const pdf = await P.parsePdf(new Uint8Array(await f.arrayBuffer()));
            const pts = P.pointsFromPdf(pdf);
            if (pts.length) {
              const ok = await TA.modal('Kommentare aus der PDF übernehmen?', `<p>In <b>${esc(f.name)}</b> stehen ${pts.length} Kommentare:</p><ul class="small">${pts.slice(0, 12).map((p) => `<li>S. ${p.seite}: ${esc(p.text.slice(0, 140))}</li>`).join('')}${pts.length > 12 ? '<li>…</li>' : ''}</ul>`,
                [{ label: 'Nur ablegen', value: null, cls: 'btn-ghost' }, { label: `${pts.length} Punkte übernehmen`, value: true, cls: 'btn-primary' }]);
              if (ok) {
                a.punkte = a.punkte.filter((p) => !p.verweis || p.hk);
                a.punkte.push(...pts.map((p) => ({ anzahl: 1, berechtigt: 'ja', verschuldet: 'ja', ...p }))); neuePunkte += pts.length;
              }
            } else TA.toast('In der PDF wurden keine Kommentare gefunden – die Punkte bitte manuell ergänzen.');
          } catch (e) { TA.toast('PDF konnte nicht gelesen werden: ' + e.message, { error: true }); }
          a.korrekturdatei = true;
        }
      }
      verlauf(a, `Datei hinzugefügt: ${files.map((f) => f.name).join(', ')}` + (neuePunkte ? ` (${neuePunkte} Punkte übernommen)` : ''));
      await doSave(); render();
    }

    render(); bind();
  };
  app.views.a = detail;
})(window.TA);
