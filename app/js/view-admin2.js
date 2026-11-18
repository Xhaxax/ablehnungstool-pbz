/* Einstellungen: Kategorien und Daten/Import */
(function (TA) {
  'use strict';
  TA.app.admin = TA.app.admin || {};
  const S = TA.store, app = TA.app, esc = TA.esc;

  /* ---------- Kategorien ---------- */
  const HK_FARBEN = ['#161E38', '#7A6337', '#1F5FAD', '#1E7A4C', '#B3261E', '#5B6688', '#8A5A00'];
  app.admin.kategorien = function (el, darf) {
    const c = S.cfg;
    const use = new Map();
    for (const a of S.abl.values()) for (const p of a.punkte || []) if (p.fehlerart) use.set(p.fehlerart, (use.get(p.fehlerart) || 0) + 1);
    const hkList = c.hauptkategorien;
    let sel = el.dataset.hk || (hkList[0] && hkList[0].id) || '';
    if (sel !== '*' && !hkList.some((h) => h.id === sel)) sel = (hkList[0] && hkList[0].id) || '*';
    const q = (el.dataset.q || '').trim();
    const nq = TA.norm(q);
    const fasAll = c.fehlerarten;
    const inHk = (h) => fasAll.filter((f) => f.hk === h.id);
    const usageHk = (h) => inHk(h).reduce((s, f) => s + (use.get(f.id) || 0), 0);
    const fas = fasAll.filter((f) => (sel === '*' || f.hk === sel) && (!nq || TA.norm(f.name).includes(nq)))
      .sort((x, y) => (y.aktiv !== false) - (x.aktiv !== false) || (use.get(y.id) || 0) - (use.get(x.id) || 0) || x.name.localeCompare(y.name, 'de'));
    const selHk = hkList.find((h) => h.id === sel);
    const farbe = (h) => HK_FARBEN[Math.max(0, hkList.indexOf(h)) % HK_FARBEN.length];
    const hkName = (id) => (hkList.find((h) => h.id === id) || {}).name || '–';
    el.innerHTML = `
      <div class="kat">
        <aside class="kat-side">
          <div class="kat-side-head"><h3>Hauptkategorien</h3>${darf ? `<button class="iconbtn add" id="hk-add" title="Hauptkategorie anlegen" aria-label="Hauptkategorie anlegen">${TA.icons.plus}</button>` : ''}</div>
          <button type="button" class="hk-item${sel === '*' ? ' on' : ''}" data-sel="*"><span class="hk-dot" style="background:var(--line-strong)"></span><span class="hk-t"><b>Alle Fehlerarten</b><small>${fasAll.length} Einträge</small></span></button>
          ${hkList.map((h) => `<button type="button" class="hk-item${sel === h.id ? ' on' : ''}${h.aktiv === false ? ' inactive' : ''}" data-sel="${h.id}">
            <span class="hk-dot" style="background:${farbe(h)}"></span>
            <span class="hk-t"><b>${esc(h.name)}</b><small>${inHk(h).length} Fehlerarten${usageHk(h) ? ` · ${usageHk(h)}× verwendet` : ''}</small></span></button>`).join('')}
          <p class="small muted" style="margin:12px 4px 0">Hauptkategorien sind die grobe Einteilung für Diagramme und Heatmap.</p>
        </aside>
        <section class="kat-main card">
          <div class="kat-head">
            <div style="min-width:0">
              <div class="tb-overline">${sel === '*' ? 'Alle Hauptkategorien' : 'Hauptkategorie'}</div>
              <h3 class="kat-title">${sel === '*' ? 'Alle Fehlerarten' : esc(selHk.name)}${selHk && selHk.aktiv === false ? ' <span class="badge b-alt">inaktiv</span>' : ''}</h3>
              ${selHk && selHk.beschreibung ? `<p class="small muted" style="margin:2px 0 0">${esc(selHk.beschreibung)}</p>` : ''}
            </div>
            <div class="spacer"></div>
            ${darf && selHk ? `<button class="btn btn-sm btn-ghost" id="hk-edit">${TA.icons.edit} Bearbeiten</button>` : ''}
          </div>
          <div class="kat-tools">
            <label class="search-in">${TA.icons.search}<input class="input" id="fa-q" type="search" placeholder="Fehlerart suchen" aria-label="Fehlerart suchen" value="${esc(q)}"></label>
            ${darf && selHk ? `<div class="add-in"><input class="input" id="fa-new" placeholder="Neue Fehlerart in „${esc(selHk.name)}“" aria-label="Neue Fehlerart"><button class="btn btn-primary btn-sm" id="fa-add">${TA.icons.plus} Anlegen</button></div>` : ''}
          </div>
          <ul class="fa-list" role="list">${fas.map((f) => `<li class="fa-row${f.aktiv === false ? ' inactive' : ''}" data-fa="${f.id}">
              <span class="hk-dot" style="background:${farbe(hkList.find((h) => h.id === f.hk))}" title="${esc(hkName(f.hk))}"></span>
              ${darf ? `<input class="fa-name" data-k="name" value="${esc(f.name)}" aria-label="Name der Fehlerart">` : `<span class="fa-name">${esc(f.name)}</span>`}
              ${sel === '*' ? `<span class="small muted fa-hk">${esc(hkName(f.hk))}</span>` : ''}
              ${use.get(f.id) ? `<span class="use-chip" title="in ${use.get(f.id)} Fehlerpunkt(en) verwendet">${use.get(f.id)}</span>` : '<span class="use-chip empty" title="noch nicht verwendet"></span>'}
              ${darf ? `<label class="switch sm" title="${f.aktiv === false ? 'inaktiv – wird nicht mehr vorgeschlagen' : 'aktiv'}"><input type="checkbox" data-k="aktiv" ${f.aktiv !== false ? 'checked' : ''} aria-label="${esc(f.name)} aktiv"><span></span></label>
                <button class="iconbtn" data-move="${f.id}" title="In andere Hauptkategorie verschieben" aria-label="Verschieben">${TA.icons.move}</button>
                <button class="iconbtn" data-merge="${f.id}" title="Mit anderer Fehlerart zusammenführen" aria-label="Zusammenführen">${TA.icons.merge}</button>` : ''}
            </li>`).join('') || `<li class="empty">${q ? 'Keine Fehlerart passt zur Suche.' : 'Noch keine Fehlerarten in dieser Kategorie.'}</li>`}</ul>
          <p class="small muted" style="margin:10px 0 0">Namen direkt anklicken zum Umbenennen. Ausgeschaltete Fehlerarten bleiben in alten Bewertungen erhalten, werden aber nicht mehr vorgeschlagen.</p>
        </section>
      </div>`;

    const rerender = (patch) => { const n = el.cloneNode(false); Object.assign(n.dataset, patch || {}); el.replaceWith(n); app.admin.kategorien(n, darf); return n; };
    el.querySelectorAll('[data-sel]').forEach((b) => b.addEventListener('click', () => rerender({ hk: b.dataset.sel, q: '' })));
    const qIn = el.querySelector('#fa-q');
    qIn.addEventListener('input', TA.debounce(() => { const n = rerender({ q: qIn.value }).querySelector('#fa-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250));
    if (!darf) return;

    const addFa = async () => {
      const inp = el.querySelector('#fa-new'); const name = inp.value.trim();
      if (!name) { inp.focus(); return; }
      if (S.cfg.fehlerarten.some((f) => TA.norm(f.name) === TA.norm(name))) { TA.toast('Diese Fehlerart gibt es schon.', { error: true }); return; }
      await S.saveCfg((cc) => cc.fehlerarten.push({ id: TA.uid('fa-'), name, hk: sel, aktiv: true }));
      TA.toast('Fehlerart angelegt'); const n = rerender(); const ni = n.querySelector('#fa-new'); if (ni) ni.focus();
    };
    const fa = el.querySelector('#fa-add'); if (fa) fa.addEventListener('click', addFa);
    const fn = el.querySelector('#fa-new'); if (fn) fn.addEventListener('keydown', (e) => { if (e.key === 'Enter') addFa(); });

    const hkDialog = async (h) => {
      const v = await TA.modal(h ? 'Hauptkategorie bearbeiten' : 'Hauptkategorie anlegen', `
        <div class="field"><label for="hk-n">Name <span class="req">· Pflichtfeld</span></label><input id="hk-n" class="input" value="${esc(h ? h.name : '')}" placeholder="z. B. Einreichungsfehler"></div>
        <div class="field" style="margin-top:12px"><label for="hk-d">Beschreibung</label><input id="hk-d" class="input" value="${esc(h ? h.beschreibung || '' : '')}" placeholder="z. B. Unterlagen fehlen oder falsch eingereicht"></div>
        ${h ? `<label class="small" style="display:flex;gap:8px;margin-top:12px"><input type="checkbox" id="hk-a" ${h.aktiv !== false ? 'checked' : ''}> aktiv (wird bei der Bewertung angeboten)</label>` : ''}`,
        [{ label: 'Abbrechen', value: null, cls: 'btn-ghost' }, { label: h ? 'Speichern' : 'Anlegen', value: true, cls: 'btn-primary' }],
        { onOpen: (m) => m.querySelector('#hk-n').focus(),
          validate: (m) => { if (!m.querySelector('#hk-n').value.trim()) { TA.toast('Bitte einen Namen eingeben.', { error: true }); return false; } return true; },
          collect: (m) => ({ name: m.querySelector('#hk-n').value.trim(), beschreibung: m.querySelector('#hk-d').value.trim(), aktiv: m.querySelector('#hk-a') ? m.querySelector('#hk-a').checked : true }) });
      if (!v) return;
      let id = h && h.id;
      await S.saveCfg((cc) => {
        if (h) Object.assign(cc.hauptkategorien.find((x) => x.id === h.id), v);
        else { id = TA.uid('hk-'); cc.hauptkategorien.push({ id, ...v }); }
      });
      TA.toast('Gespeichert'); rerender({ hk: id });
    };
    el.querySelector('#hk-add').addEventListener('click', () => hkDialog(null));
    const he = el.querySelector('#hk-edit'); if (he) he.addEventListener('click', () => hkDialog(selHk));

    el.addEventListener('change', async (e) => {
      const t = e.target; const row = t.closest('[data-fa]'); if (!row) return;
      const val = t.type === 'checkbox' ? t.checked : t.value.trim();
      if (t.dataset.k === 'name' && !val) { t.value = (S.cfg.fehlerarten.find((f) => f.id === row.dataset.fa) || {}).name || ''; return; }
      await S.saveCfg((cc) => { const f = cc.fehlerarten.find((x) => x.id === row.dataset.fa); if (f) f[t.dataset.k] = val; });
      if (t.dataset.k === 'aktiv') row.classList.toggle('inactive', !val);
      TA.toast('Gespeichert');
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('fa-name')) e.target.blur(); });
    el.addEventListener('click', async (e) => {
      const mv = e.target.closest('[data-move]');
      if (mv) {
        const f = S.cfg.fehlerarten.find((x) => x.id === mv.dataset.move);
        const ziel = await TA.modal('Fehlerart verschieben', `<p>„<b>${esc(f.name)}</b>“ gehört künftig zu:</p>
          <div class="field"><select class="select" id="mv-z" aria-label="Neue Hauptkategorie">${hkList.map((h) => `<option value="${h.id}" ${h.id === f.hk ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select></div>
          <p class="small muted">Bereits bewertete Fehlerpunkte mit dieser Fehlerart werden mit umgestellt.</p>`,
          [{ label: 'Abbrechen', value: null, cls: 'btn-ghost' }, { label: 'Verschieben', value: true, cls: 'btn-primary' }], { collect: (m) => m.querySelector('#mv-z').value });
        if (!ziel || ziel === f.hk) return;
        const betroffen = [...S.abl.values()].filter((a) => (a.punkte || []).some((p) => p.fehlerart === f.id));
        betroffen.forEach((a) => a.punkte.forEach((p) => { if (p.fehlerart === f.id) p.hk = ziel; }));
        if (betroffen.length) await S.saveMany(betroffen);
        await S.saveCfg((cc) => { cc.fehlerarten.find((x) => x.id === f.id).hk = ziel; });
        TA.toast(`Verschoben nach „${hkName(ziel)}“`); rerender();
        return;
      }
      const b = e.target.closest('[data-merge]'); if (!b) return;
      const src = S.cfg.fehlerarten.find((f) => f.id === b.dataset.merge);
      const others = S.cfg.fehlerarten.filter((f) => f.id !== src.id).sort((x, y) => x.name.localeCompare(y.name, 'de'));
      const ziel = await TA.modal('Fehlerart zusammenführen', `<p>Alle Verwendungen von <b>${esc(src.name)}</b> gehen auf die gewählte Fehlerart über. Danach wird „${esc(src.name)}“ entfernt.</p>
        <div class="field"><label for="mg-z">Zusammenführen mit</label><select class="select" id="mg-z">${others.map((f) => `<option value="${f.id}">${esc(f.name)} (${esc(hkName(f.hk))})</option>`).join('')}</select></div>`,
        [{ label: 'Abbrechen', value: null, cls: 'btn-ghost' }, { label: 'Zusammenführen', value: true, cls: 'btn-primary' }], { collect: (m) => m.querySelector('#mg-z').value });
      if (!ziel) return;
      const zf = S.cfg.fehlerarten.find((f) => f.id === ziel);
      const betroffen = [...S.abl.values()].filter((a) => (a.punkte || []).some((p) => p.fehlerart === src.id));
      betroffen.forEach((a) => a.punkte.forEach((p) => { if (p.fehlerart === src.id) { p.fehlerart = zf.id; p.hk = zf.hk; } }));
      if (betroffen.length) await S.saveMany(betroffen);
      await S.saveCfg((cc) => { cc.fehlerarten = cc.fehlerarten.filter((f) => f.id !== src.id); });
      TA.toast(`Zusammengeführt – ${betroffen.length} Ablehnung(en) angepasst`); rerender();
    });
  };

  /* ---------- Meine Uebersicht (persoenlich) ---------- */
  app.admin.uebersicht = function (el) {
    { const n = el.cloneNode(false); el.replaceWith(n); el = n; }
    const pf = app.uebPrefs();
    const A = TA.analysis;
    const zeichner = TA.sortDe(TA.uniq([...(S.cfg.listen.zeichner || []), ...[...S.abl.values()].map((a) => a.zeichner).filter(Boolean)]));
    const clusters = TA.sortDe(TA.uniq([...(S.cfg.listen.cluster || []), ...[...S.abl.values()].map((a) => a.cluster).filter(Boolean)]));
    const sw = (k, titel, text, icon) => `<label class="opt"><span class="opt-ico">${TA.icons[icon]}</span><span class="opt-t"><b>${titel}</b><small>${text}</small></span><span class="switch"><input type="checkbox" data-k="${k}" ${pf[k] ? 'checked' : ''} aria-label="${titel}"><span></span></span></label>`;
    el.innerHTML = `<div class="grid g2">
      <div class="card"><h2>Was die Übersicht zeigt</h2>
        <div class="opts">
          ${sw('aufgaben', 'Offene Ablehnungen', 'Was bei jeder Ablehnung noch fehlt, direkt zum Öffnen.', 'alert')}
          ${sw('empfehlungen', 'Empfehlungen', 'Die nächsten Maßnahmen aus den Regeln.', 'bulb')}
          ${sw('k_abl', 'Kennzahl: Bewertete Ablehnungen', 'Anzahl im gewählten Zeitraum mit Vergleich.', 'check')}
          ${sw('k_je', 'Kennzahl: Fehler je Ablehnung', 'Durchschnittliche Zahl der Fehlerpunkte.', 'target')}
          ${sw('k_ver', 'Kennzahl: Durch uns verschuldet', 'Anteil der Fehler, die bei uns lagen.', 'scale')}
          ${sw('k_wdh', 'Kennzahl: Wiederholte Ablehnungen', 'Standorte, die mehrfach abgelehnt wurden.', 'refresh')}
          ${sw('zuletzt', 'Zuletzt bearbeitet', 'Die zuletzt geänderten Ablehnungen.', 'clock')}
        </div></div>
      <div class="stack"><div class="card"><h2>Zeitraum und Umfang</h2>
        <div class="field"><label for="u-tage">Zeitraum der Kennzahlen</label><select class="select" id="u-tage">${[[30, 'Letzte 30 Tage'], [90, 'Letzte 90 Tage'], [180, 'Letzte 6 Monate'], [365, 'Letzte 12 Monate']].map(([v, l]) => `<option value="${v}"${pf.tage === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field" style="margin-top:12px"><label for="u-zeilen">Offene Ablehnungen anzeigen</label><select class="select" id="u-zeilen">${[5, 8, 12, 20].map((v) => `<option value="${v}"${pf.zeilen === v ? ' selected' : ''}>${v} Zeilen</option>`).join('')}</select></div>
        <p class="small muted" style="margin:14px 0 0">Die Auswahl gilt nur für dich und wird auf diesem Rechner gespeichert. Andere sehen ihre eigene Übersicht.</p>
        <div class="toolbar" style="margin:14px 0 0"><a class="btn btn-primary" href="#/uebersicht">Übersicht ansehen</a><button type="button" class="btn btn-ghost" id="u-reset">Zurücksetzen</button></div></div>
        <div class="card"><h2>Dauerfilter</h2>
          <p class="small muted" style="margin:-4px 0 12px">Du bearbeitest nur bestimmte Cluster oder Zeichner? Dann blendet das Tool alles andere in Übersicht, Liste, Auswertung und Empfehlungen dauerhaft aus.</p>
          <div class="field"><label>Cluster (keine Auswahl = alle)</label><div class="chips-in" id="u-dc">${clusters.map((c) => `<button type="button" data-c="${esc(c)}" aria-pressed="${pf.dCluster.includes(c)}">${esc(c)}</button>`).join('')}</div></div>
          <div class="field" style="margin-top:12px"><label for="u-dz">Zeichner</label><select class="select" id="u-dz"><option value="">Alle Zeichner</option>${zeichner.map((z) => `<option${pf.dZeichner === z ? ' selected' : ''}>${esc(z)}</option>`).join('')}</select></div></div>
        <div class="card"><h2>Eigene Kacheln</h2>
          <p class="small muted" style="margin:-4px 0 12px">Lege selbst Kennzahlen an, zum Beispiel „Fehlerpunkte Darstellungsfehler bei A1-Neubau“ oder „Offene Ablehnungen von A. Berger“. Sie erscheinen in der Übersicht.</p>
          <div class="kachel-list">${(pf.kacheln || []).map((k, i) => `<div class="kachel-item"><div><b>${esc(k.titel || app.uebMetriken[k.metrik])}</b><small>${esc([app.uebMetriken[k.metrik], k.tage ? 'letzte ' + k.tage + ' Tage' : 'gesamt', k.zeichner, k.cluster, k.hk ? A.hkName(k.hk) : ''].filter(Boolean).join(' · '))}</small></div><span class="spacer"></span><button type="button" class="iconbtn" data-kdel="${i}" title="Kachel löschen" aria-label="Kachel löschen">${TA.icons.trash}</button></div>`).join('') || '<p class="small muted" style="margin:0">Noch keine eigenen Kacheln.</p>'}</div>
          <button type="button" class="btn btn-secondary" id="u-kadd" style="margin-top:12px">${TA.icons.plus}Kachel hinzufügen</button></div></div>
    </div>`;
    el.addEventListener('click', async (e) => {
      const c = e.target.closest('#u-dc button[data-c]');
      if (c) { const on = c.getAttribute('aria-pressed') !== 'true'; c.setAttribute('aria-pressed', on); pf.dCluster = pf.dCluster.filter((x) => x !== c.dataset.c); if (on) pf.dCluster.push(c.dataset.c); app.setUebPrefs(pf); app.refreshNav(); TA.toast('Dauerfilter gespeichert'); return; }
      const d = e.target.closest('[data-kdel]');
      if (d) { pf.kacheln.splice(+d.dataset.kdel, 1); app.setUebPrefs(pf); TA.toast('Kachel gelöscht'); app.admin.uebersicht(el); return; }
      if (e.target.closest('#u-kadd')) {
        const opt = (arr, sel) => arr.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
        const body = `<div class="stack">
          <div class="field"><label for="k-m">Was soll gezählt werden?</label><select id="k-m" class="select">${Object.entries(app.uebMetriken).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
          <div class="field"><label for="k-t">Titel (optional)</label><input id="k-t" class="input" placeholder="z. B. Offene Ablehnungen A1-Neubau"></div>
          <div class="field"><label for="k-z">Zeitraum</label><select id="k-z" class="select"><option value="0">Gesamt</option><option value="30">Letzte 30 Tage</option><option value="90" selected>Letzte 90 Tage</option><option value="180">Letzte 6 Monate</option><option value="365">Letzte 12 Monate</option></select></div>
          <div class="field"><label for="k-zc">Zeichner</label><select id="k-zc" class="select"><option value="">Alle</option>${opt(zeichner)}</select></div>
          <div class="field"><label for="k-c">Cluster</label><select id="k-c" class="select"><option value="">Alle</option>${opt(clusters)}</select></div>
          <div class="field"><label for="k-h">Hauptkategorie (nur bei Fehlerpunkten)</label><select id="k-h" class="select"><option value="">Alle</option>${S.cfg.hauptkategorien.map((h) => `<option value="${esc(h.id)}">${esc(h.name)}</option>`).join('')}</select></div></div>`;
        const v = await TA.modal('Eigene Kachel anlegen', body, [{ label: 'Abbrechen', value: null, cls: 'btn-ghost' }, { label: 'Hinzufügen', value: true, cls: 'btn-primary' }], {
          collect: (m) => ({ id: TA.uid('k'), metrik: m.querySelector('#k-m').value, titel: m.querySelector('#k-t').value.trim(), tage: +m.querySelector('#k-z').value, zeichner: m.querySelector('#k-zc').value, cluster: m.querySelector('#k-c').value, hk: m.querySelector('#k-h').value })
        });
        if (!v) return;
        pf.kacheln = [...(pf.kacheln || []), v]; app.setUebPrefs(pf); TA.toast('Kachel hinzugefügt'); app.admin.uebersicht(el);
      }
    });
    el.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'u-dz') { pf.dZeichner = t.value; app.setUebPrefs(pf); app.refreshNav(); TA.toast('Dauerfilter gespeichert'); return; }
      if (t.dataset.k) pf[t.dataset.k] = t.checked; else if (t.id === 'u-tage') pf.tage = +t.value; else if (t.id === 'u-zeilen') pf.zeilen = +t.value; else return;
      app.setUebPrefs(pf); TA.toast('Gespeichert');
    });
    el.querySelector('#u-reset').addEventListener('click', () => { app.setUebPrefs(app.uebDefaults()); app.refreshNav(); TA.toast('Zurückgesetzt'); app.admin.uebersicht(el); });
  };

  /* ---------- Daten & Import ---------- */
  app.admin.daten = function (el, darf) {
    const anz = S.abl.size, alt = [...S.abl.values()].filter((a) => a.altdaten).length;
    el.innerHTML = `
      <div class="grid g2">
        <div class="card">
          <h2>Altdaten aus Excel übernehmen</h2>
          <p class="help">Unterstützt werden <b>„Ablehnungen NEU 2026“</b> (eine Zeile je Ablehnung, Spalte „Ablehnungstext“) und die <b>„Ablehnungsübersicht 2024“</b> (Blätter „Ablehnungen“, „Ablehngründe“, „Kategorieübersicht“). Bereits übernommene Zeilen werden beim zweiten Import erkannt und übersprungen.</p>
          ${darf || app.can('importieren') ? `<div class="drop" id="x-drop" tabindex="0" role="button" aria-label="Excel-Datei auswählen" style="min-height:140px">
            ${TA.icons.upload || ''}<b>Excel-Datei hierher ziehen</b><span class="muted small">oder klicken (.xlsx, .xlsm, .xls)</span></div>
            <input type="file" id="x-file" accept=".xlsx,.xlsm,.xls" hidden>
            <div id="x-res"></div>` : '<p class="muted">Nur Admins und Importberechtigte können Daten übernehmen.</p>'}
        </div>
        <div class="card">
          <h2>Datenbestand</h2>
          ${S.mode === 'local' ? `<div class="notice" style="margin:0 0 14px"><b>Nur dieser Browser.</b>&nbsp;Andere sehen deine Daten nicht. Wähle einen gemeinsamen Speicherort (Ordner oder Cloud), damit alle mit denselben Daten arbeiten.</div>` : ''}
          <dl class="kv"><dt>Speicherort</dt><dd>${esc(S.folderName())}${S.mode === 'local' ? ' <span class="badge b-bewertung">nur dieser Browser</span>' : ''}</dd>
            <dt>Ablehnungen</dt><dd>${TA.fmtNum(anz)}${alt ? ` (davon ${TA.fmtNum(alt)} Altdaten)` : ''}</dd>
            <dt>Maßnahmen</dt><dd>${TA.fmtNum(S.massn.size)}</dd>
            <dt>Fehlerarten</dt><dd>${TA.fmtNum(S.cfg.fehlerarten.length)}</dd>
            <dt>Letzter Abgleich</dt><dd>${S.lastSync ? TA.fmtDateTime(S.lastSync) : '–'}</dd></dl>
          <div class="toolbar" style="margin-top:16px">
            ${S.supportsFs ? `<button class="btn ${S.mode === 'fs' ? 'btn-secondary' : 'btn-primary'}" data-switch="fs">${S.mode === 'fs' ? 'Anderen Ordner wählen' : 'Ordner auf dem Laufwerk wählen'}</button>` : ''}${S.cloudAvail && S.mode !== 'cloud' ? `<button class="btn btn-primary" data-switch="cloud">Zur Cloud-Datenbank wechseln</button>` : ''}${S.mode === 'cloud' ? `<button class="btn btn-secondary" id="d-logout">Abmelden</button>` : ''}
            <button class="btn btn-secondary" id="d-backup">${TA.icons.download || ''} Sicherung herunterladen (JSON)</button>
            ${S.mode !== 'local' ? '<button class="btn btn-ghost" id="d-sync">Jetzt abgleichen</button>' : ''}
          </div>
          <p class="small muted">Die Daten liegen als einzelne Dateien im Datenordner (eine Datei je Ablehnung). Sichert die IT den Ordner mit, ist keine weitere Sicherung nötig.</p>
          ${darf && alt ? `<hr style="border:0;border-top:1px solid var(--line);margin:16px 0"><button class="btn btn-danger btn-sm" id="d-delalt">Alle Altdaten entfernen (${alt})</button>
            <p class="small muted">Nur für einen sauberen Neu-Import gedacht. Selbst erfasste Ablehnungen bleiben erhalten.</p>` : ''}
        </div>
      </div>`;

    const switchTo = async (kind) => {
      const snap = S.snapshot();
      const vorher = S.mode;
      try {
        if (kind === 'fs') {
          if (!S.supportsFs) { TA.toast('Dieser Browser kann keine Ordner verbinden. Bitte Edge oder Chrome verwenden.', { error: true, ms: 7000 }); return; }
          await S.connect();
        } else {
          const pw = await TA.modal('In der Cloud anmelden', '<div class="field"><label for="sw-pw">Team-Passwort</label><input id="sw-pw" type="password" class="input" autocomplete="current-password"></div>',
            [{ label: 'Abbrechen', value: null, cls: 'btn-ghost' }, { label: 'Anmelden', value: true, cls: 'btn-primary' }],
            { collect: (m) => m.querySelector('#sw-pw').value, validate: (m) => { if (!m.querySelector('#sw-pw').value) { m.querySelector('#sw-pw').focus(); return false; } return true; } });
          if (!pw) return;
          await S.login(pw);
        }
      } catch (e) { if (e.name !== 'AbortError') TA.toast(e.message || String(e), { error: true }); return; }
      const leer = S.abl.size === 0 && !S.cfg.users.length;
      const ziel = kind === 'fs' ? `Ordner \u201e${S.folderName()}\u201c` : 'Cloud-Datenbank';
      if (leer && (snap.abl.length || snap.cfg.users.length)) {
        const ok = await TA.confirm('Bisherige Daten \u00fcbernehmen?', `In der ${kind === 'fs' ? 'gew\u00e4hlten ' : ''}${ziel} liegen noch keine Daten. Sollen die ${snap.abl.length} Ablehnungen, ${snap.cfg.users.length} Benutzer und alle Einstellungen vom bisherigen Speicherort dorthin kopiert werden? Original-Mails und PDFs werden nicht mitkopiert.`, '\u00dcbernehmen', false);
        if (ok) { try { await S.migrateLocal(snap); TA.toast('Daten \u00fcbernommen'); } catch (e) { TA.toast('\u00dcbernahme fehlgeschlagen: ' + e.message, { error: true }); } }
      } else TA.toast(`Speicherort: ${ziel}`);
      if (!app.user()) await app.pickUser(false);
      app.route();
    };
    el.querySelectorAll('[data-switch]').forEach((b) => b.addEventListener('click', () => switchTo(b.dataset.switch)));
    const lo = el.querySelector('#d-logout');
    if (lo) lo.addEventListener('click', async () => { await S.logout(); location.reload(); });
    const backup = el.querySelector('#d-backup');
    backup.addEventListener('click', () => {
      const data = { exportiert: TA.nowIso(), config: S.cfg, ablehnungen: [...S.abl.values()], massnahmen: [...S.massn.values()] };
      TA.download(`ablehnungstool-sicherung-${TA.isoToday()}.json`, new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    });
    const sy = el.querySelector('#d-sync');
    if (sy) sy.addEventListener('click', async () => { await S.sync(true); TA.toast('Abgeglichen'); });
    const da = el.querySelector('#d-delalt');
    if (da) da.addEventListener('click', async () => {
      if (!(await TA.confirm('Altdaten entfernen?', `Es werden ${alt} aus Excel übernommene Ablehnungen gelöscht.`, 'Entfernen', true))) return;
      for (const a of [...S.abl.values()].filter((x) => x.altdaten)) await S.deleteAbl(a.id);
      TA.toast('Altdaten entfernt'); app.route();
    });

    const drop = el.querySelector('#x-drop'); if (!drop) return;
    const inp = el.querySelector('#x-file'), out = el.querySelector('#x-res');
    const run = async (file) => {
      out.innerHTML = '<p class="muted">Datei wird gelesen …</p>';
      let res;
      try { res = await TA.importExcel.analyse(file); }
      catch (e) { console.error(e); out.innerHTML = `<div class="notice" style="margin-top:12px">${esc(e.message)}</div>`; return; }
      const fmt = res.format === '2024' ? 'Ablehnungsübersicht 2024' : 'Ablehnungen NEU 2026';
      const offen = res.items.filter((a) => a.status !== 'bewertet').length;
      out.innerHTML = `<div class="card" style="margin-top:12px;box-shadow:none">
        <h3>${esc(file.name)} <span class="badge b-sand">${fmt}</span></h3>
        <dl class="kv"><dt>Neue Ablehnungen</dt><dd><b>${TA.fmtNum(res.items.length)}</b>${res.vorhanden ? ` · ${res.vorhanden} schon vorhanden (übersprungen)` : ''}</dd>
          <dt>Fehlerpunkte</dt><dd>${TA.fmtNum(res.punkte)}</dd>
          <dt>Zeitraum</dt><dd>${TA.fmtDate(res.von)} – ${TA.fmtDate(res.bis)}</dd>
          <dt>Zeichner</dt><dd>${esc(res.zeichner.join(', ')) || '–'}</dd>
          ${res.neuFa.length ? `<dt>Neue Fehlerarten</dt><dd>${res.neuFa.length}</dd>` : ''}
          ${res.ohneZuordnung ? `<dt>Gründe ohne Ablehnung</dt><dd>${res.ohneZuordnung} (keine passende Zeile in „Ablehnungen“)</dd>` : ''}</dl>
        <p class="small muted" style="margin-top:10px">${res.format === '2024'
          ? 'Kategorie und Fehlerart kommen aus „Ablehngründe“. Annahme: „Externer Fehler“ = nicht verschuldet, alles andere = verschuldet; „ns“ bei „Berechtigt“ wird als berechtigt übernommen. Ablehnungen ohne Gründe zählen nur in der Menge.'
          : `Die Fehlerpunkte werden wie bei einer Mail aus dem Ablehnungstext getrennt. ${offen} Ablehnungen landen als <b>offen</b> in der Liste, damit Kategorie und Fehlerart nachgetragen werden können.`}</p>
        <div class="toolbar" style="margin-top:12px"><button class="btn btn-primary" id="x-go" ${res.items.length ? '' : 'disabled'}>${TA.fmtNum(res.items.length)} Ablehnungen übernehmen</button><button class="btn btn-ghost" id="x-cancel">Verwerfen</button></div>
      </div>`;
      out.querySelector('#x-cancel').addEventListener('click', () => { out.innerHTML = ''; });
      out.querySelector('#x-go').addEventListener('click', async (e) => {
        e.target.disabled = true; e.target.textContent = 'Wird übernommen …';
        try { const n = await TA.importExcel.apply(res); TA.toast(`${n} Ablehnungen übernommen`); app.go(res.format === '2024' ? '#/auswertung' : '#/liste'); }
        catch (err) { console.error(err); TA.toast('Übernahme fehlgeschlagen: ' + err.message, { error: true, ms: 8000 }); e.target.disabled = false; }
      });
    };
    drop.addEventListener('click', () => inp.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
    inp.addEventListener('change', () => { if (inp.files[0]) run(inp.files[0]); inp.value = ''; });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) run(f); });
  };
})(window.TA);
