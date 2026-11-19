/* Einstellungen: Benutzer, Listen, Regeln (Kategorien und Daten in view-admin2.js) */
(function (TA) {
  'use strict';
  const S = TA.store, app = TA.app, esc = TA.esc;
  const TABS = [['benutzer', 'Benutzer & Rollen'], ['kategorien', 'Kategorien'], ['listen', 'Auswahllisten'], ['regeln', 'Empfehlungsregeln'], ['daten', 'Daten & Import'], ['uebersicht', 'Meine Übersicht']];
  app.admin = app.admin || {};

  function einstellungen(el, params) {
    const tab = (params && params[0]) || 'benutzer';
    const darf = app.can('verwalten');
    const darfTab = tab === 'kategorien' ? app.can('kategorien') : darf;
    el.innerHTML = `
      <div class="pagehead"><div><div class="overline">Einstellungen</div><h1>Verwaltung</h1>
        <p class="muted small" style="margin:4px 0 0">Datenordner: <b>${esc(S.folderName())}</b>${darfTab ? '' : tab === 'kategorien' ? ' · Nur Admin und Projektleitung können hier ändern.' : ' · Nur Admins können hier ändern.'}</p></div></div>
      <div class="tabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" aria-selected="${k === tab}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div id="tabbody"></div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => app.go('#/einstellungen/' + b.dataset.tab)));
    const body = el.querySelector('#tabbody');
    const fn = { benutzer, listen, regeln, kategorien: app.admin.kategorien, daten: app.admin.daten, uebersicht: app.admin.uebersicht }[tab];
    if (fn) fn(body, darfTab); else body.innerHTML = '<div class="empty">Unbekannter Bereich.</div>';
  }

  /* ---------- Benutzer ---------- */
  function benutzer(el, darf) {
    const users = S.cfg.users;
    const roles = Object.entries(app.ROLES);
    el.innerHTML = `
      <div class="stack">
        <div class="card">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><h2 style="margin:0">Benutzer</h2><div class="spacer"></div>${darf ? '<button class="btn btn-primary btn-sm" data-add>Benutzer anlegen</button>' : ''}</div>
          <div class="tablewrap" style="border:0">
          <table><thead><tr><th>Name</th><th>Kürzel</th>${roles.map(([r, l]) => `<th style="text-align:center" title="${esc(l)}">${esc(r === 'admin' ? 'Admin' : r.toUpperCase())}</th>`).join('')}<th style="text-align:center">Aktiv</th><th></th></tr></thead>
          <tbody>${users.map((u) => `<tr data-u="${u.id}">
            <td>${darf ? `<div class="u-cell"><span class="avatar">${esc(TA.initials(u.name))}</span><input class="input" data-k="name" value="${esc(u.name)}" aria-label="Name"></div>` : `<div class="u-cell"><span class="avatar">${esc(TA.initials(u.name))}</span>${esc(u.name)}</div>`}</td>
            <td>${darf ? `<input class="input" style="width:70px" data-k="kuerzel" value="${esc(u.kuerzel || '')}" aria-label="Kürzel">` : esc(u.kuerzel || '')}</td>
            ${roles.map(([r, l]) => `<td style="text-align:center"><input type="checkbox" data-role="${r}" ${(u.roles || []).includes(r) ? 'checked' : ''} ${darf ? '' : 'disabled'} aria-label="${esc(l)} für ${esc(u.name)}"></td>`).join('')}
            <td style="text-align:center"><input type="checkbox" data-k="aktiv" ${u.aktiv !== false ? 'checked' : ''} ${darf && u.id !== app.user().id ? '' : 'disabled'} aria-label="aktiv"></td>
            <td>${darf && u.id !== app.user().id ? `<button class="iconbtn" data-del="${u.id}" title="Benutzer löschen" aria-label="${esc(u.name)} löschen">${TA.icons.trash}</button>` : ''}</td>
          </tr>`).join('')}</tbody></table></div>
          <p class="small muted">Bei der Anmeldung wählt jede Person ihren Namen aus. Ein Passwort gibt es nicht: Die Rollen regeln, wer was im Tool tun soll, sie ersetzen aber keine Zugriffsrechte auf den Ordner.</p>
        </div>
        <div class="card"><h2>Was die Rollen dürfen</h2>
          <table class="matrix"><thead><tr><th>Recht</th>${roles.map(([r]) => `<th title="${esc(app.ROLES[r])}">${esc(r.toUpperCase())}</th>`).join('')}</tr></thead>
          <tbody>${Object.entries(app.RIGHT_LABELS).map(([k, l]) => `<tr><td class="small">${esc(l)}</td>${roles.map(([r]) => `<td>${app.RIGHTS[k].includes(r) ? `<span class="rt-ok" title="darf">${TA.icons.tick}</span>` : '<span class="rt-no" title="darf nicht"></span>'}</td>`).join('')}</tr>`).join('')}</tbody></table>
          <p class="small muted">ADMIN Admin · RM Ressourcenmanagement · PL Projektleitung · QS Qualitätssicherung · TL Teamleitung</p>
        </div>
      </div>`;
    if (!darf) return;
    const upd = async (id, fn) => { await S.saveCfg((c) => { const u = c.users.find((x) => x.id === id); if (u) fn(u); }); TA.toast('Gespeichert'); };
    el.addEventListener('change', (e) => {
      const tr = e.target.closest('tr[data-u]'); if (!tr) return;
      const id = tr.dataset.u, t = e.target;
      if (t.dataset.role) {
        const r = t.dataset.role, on = t.checked;
        if (!on && r === 'admin' && S.cfg.users.filter((u) => (u.roles || []).includes('admin') && u.aktiv !== false).length <= 1) { t.checked = true; TA.toast('Mindestens ein Admin muss bleiben.', { error: true }); return; }
        upd(id, (u) => { u.roles = (u.roles || []).filter((x) => x !== r); if (on) u.roles.push(r); });
      } else if (t.dataset.k === 'aktiv') upd(id, (u) => { u.aktiv = t.checked; });
      else if (t.dataset.k) { const v = t.value.trim(); if (!v && t.dataset.k === 'name') { TA.toast('Der Name darf nicht leer sein.', { error: true }); return; } upd(id, (u) => { u[t.dataset.k] = v; }); }
    });
    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-add]')) {
        const v = await TA.modal('Benutzer anlegen', `
          <div class="field"><label for="nu-n">Name <span class="req">· Pflichtfeld</span></label><input id="nu-n" class="input" placeholder="z. B. Anna Berger"></div>
          <div class="field" style="margin-top:12px"><label>Rollen</label><div class="stack" style="gap:6px">${roles.map(([r, l]) => `<label class="small"><input type="checkbox" value="${r}" ${r === 'pl' ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div></div>`,
          [{ label: 'Abbrechen', value: null, cls: 'btn-ghost' }, { label: 'Anlegen', value: true, cls: 'btn-primary' }],
          { onOpen: (m) => m.querySelector('#nu-n').focus(),
            validate: (m) => { if (!m.querySelector('#nu-n').value.trim()) { TA.toast('Bitte einen Namen eingeben.', { error: true }); return false; } return true; },
            collect: (m) => ({ name: m.querySelector('#nu-n').value.trim(), roles: [...m.querySelectorAll('input[type=checkbox]:checked')].map((x) => x.value) }) });
        if (!v) return;
        await S.saveCfg((c) => c.users.push({ id: TA.uid('u-'), name: v.name, kuerzel: TA.initials(v.name), roles: v.roles, aktiv: true }));
        TA.toast(`${v.name} angelegt`); benutzer(app.freshTab(el), darf);
      }
      const del = e.target.closest('[data-del]');
      if (del) {
        const u = S.cfg.users.find((x) => x.id === del.dataset.del);
        if (!(await TA.confirm('Benutzer löschen?', `${u.name} kann sich danach nicht mehr anmelden. Bereits erfasste Einträge bleiben erhalten. Tipp: „Aktiv“ abwählen reicht meist.`, 'Löschen', true))) return;
        await S.saveCfg((c) => { c.users = c.users.filter((x) => x.id !== u.id); });
        benutzer(app.freshTab(el), darf);
      }
    });
  }

  app.freshTab = (el) => { const n = el.cloneNode(false); el.replaceWith(n); return n; };

  /* ---------- Auswahllisten ---------- */
  const LISTEN = [['zeichner', 'Zeichner'], ['qs', 'QS (Planprüfer pbz)'], ['cluster', 'Clusterinfo'], ['planvariante', 'Planvariante']];
  const FELD = { zeichner: 'zeichner', qs: 'qs', cluster: 'cluster', planvariante: 'planvariante' };
  function listen(el, darf) {
    const L = S.cfg.listen;
    const count = (k, v) => [...S.abl.values()].filter((a) => a[FELD[k]] === v).length;
    el.innerHTML = `<div class="grid g2">${LISTEN.map(([k, l]) => `
      <div class="card" data-list="${k}"><h2>${esc(l)}</h2>
        <div class="list-edit">${(L[k] || []).map((v, i) => `<div class="row"><input class="input" value="${esc(v)}" data-i="${i}" ${darf ? '' : 'disabled'} aria-label="${esc(l)} ${i + 1}"><span class="use-chip" title="${count(k, v) ? `in ${count(k, v)} Ablehnung(en) eingetragen` : 'noch in keiner Ablehnung eingetragen'}">${count(k, v) ? count(k, v) : ''}</span>${darf ? `<button class="iconbtn" data-rm="${i}" aria-label="${esc(v)} entfernen">${TA.icons.trash}</button>` : ''}</div>`).join('') || '<p class="small muted">Noch keine Einträge.</p>'}</div>
        ${darf ? `<div class="row" style="display:flex;gap:6px;margin-top:10px"><input class="input" style="flex:1" placeholder="Neuer Eintrag" data-new aria-label="Neuer Eintrag für ${esc(l)}"><button class="btn btn-secondary btn-sm" data-addl>Hinzufügen</button></div>` : ''}
      </div>`).join('')}</div>
      <p class="small muted">Umbenennen ändert auf Wunsch auch alle bestehenden Ablehnungen, z. B. um „Susi“ und „Susanne Fröhlich“ zusammenzuführen. Neue Zeichner und QS-Namen landen automatisch hier, sobald sie in einer Ablehnung eingetragen werden.</p>`;
    if (!darf) return;
    el.addEventListener('change', async (e) => {
      const inp = e.target.closest('input[data-i]'); if (!inp) return;
      const k = inp.closest('[data-list]').dataset.list, i = +inp.dataset.i, alt = L[k][i], neu = inp.value.trim();
      if (!neu || neu === alt) { inp.value = alt; return; }
      const betr = [...S.abl.values()].filter((a) => a[FELD[k]] === alt);
      const dop = L[k].includes(neu);
      if (betr.length && !(await TA.confirm(`„${alt}“ umbenennen?`, `${betr.length} Ablehnung(en) verwenden „${alt}“. Sie werden auf „${neu}“ umgestellt.${dop ? ' „' + neu + '“ gibt es schon – die Einträge werden zusammengeführt.' : ''}`, 'Umbenennen'))) { inp.value = alt; return; }
      await S.saveCfg((c) => { c.listen[k][i] = neu; c.listen[k] = TA.uniq(c.listen[k]); });
      if (betr.length) { betr.forEach((a) => { a[FELD[k]] = neu; }); await S.saveMany(betr); }
      TA.toast('Gespeichert'); listen(app.freshTab(el), darf);
    });
    el.addEventListener('click', async (e) => {
      const card = e.target.closest('[data-list]'); if (!card) return;
      const k = card.dataset.list;
      if (e.target.closest('[data-addl]')) {
        const inp = card.querySelector('[data-new]'); const v = inp.value.trim(); if (!v) { inp.focus(); return; }
        await S.saveCfg((c) => { c.listen[k] = TA.uniq([...(c.listen[k] || []), v]); });
        listen(app.freshTab(el), darf);
      }
      const rm = e.target.closest('[data-rm]');
      if (rm) { await S.saveCfg((c) => { c.listen[k].splice(+rm.dataset.rm, 1); }); listen(app.freshTab(el), darf); }
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-new]')) e.target.closest('[data-list]').querySelector('[data-addl]').click(); });
  }

  /* ---------- Regeln ---------- */
  const REGELN = [
    { r: 'gespraech', pre: 'g|', icon: 'users', titel: 'Qualitätsgespräch', text: 'Ein Zeichner macht dieselbe Fehlerart wiederholt.',
      satz: (R) => `Empfehlen, wenn ein Zeichner dieselbe Fehlerart <b>${R.anzahl}×</b> in <b>${R.tage} Tagen</b> macht.`,
      felder: [['anzahl', 'Häufigkeit', 2, 10, '×'], ['tage', 'Zeitraum', 30, 365, ' Tage']] },
    { r: 'qs', pre: 'q|', icon: 'shield', titel: 'QS-Checkliste schärfen', text: 'Fehler einer Kategorie rutschen bei derselben QS durch.',
      satz: (R) => `Empfehlen, wenn trotz QS <b>${R.anzahl}×</b> dieselbe Kategorie in <b>${R.tage} Tagen</b> beim TMC landet.`,
      felder: [['anzahl', 'Häufigkeit', 2, 10, '×'], ['tage', 'Zeitraum', 30, 365, ' Tage']] },
    { r: 'schulung', pre: 's|', icon: 'graduation', titel: 'Teamschulung', text: 'Eine Hauptkategorie betrifft mehrere Zeichner.',
      satz: (R) => `Empfehlen, wenn <b>${R.zeichner} Zeichner</b> in <b>${R.tage} Tagen</b> Fehler derselben Kategorie haben.`,
      felder: [['zeichner', 'Zeichner', 2, 10, ''], ['tage', 'Zeitraum', 30, 365, ' Tage']] },
    { r: 'auffrischen', pre: 'a|', icon: 'refresh', titel: 'Schulung auffrischen', text: 'Die letzte Schulung liegt lange zurück und die Fehler kommen wieder.',
      satz: (R) => `Erinnern, wenn die letzte Schulung zu einer Kategorie älter als <b>${R.tage} Tage</b> ist.`,
      felder: [['tage', 'Alter der Schulung', 60, 730, ' Tage']] },
    { r: 'wiederholung', pre: 'w|', icon: 'alert', titel: 'Wiederholte Ablehnung', text: 'Derselbe Standort wird mehrfach abgelehnt.',
      satz: (R) => `Prozesshinweis, wenn ein Standort <b>${R.anzahl}×</b> in <b>${R.tage} Tagen</b> abgelehnt wird.`,
      felder: [['anzahl', 'Ablehnungen', 2, 10, '×'], ['tage', 'Zeitraum', 30, 365, ' Tage']] }
  ];
  function regeln(el, darf) {
    const R = S.cfg.regeln;
    const treffer = (pre) => { try { return TA.analysis.empfehlungen().filter((e) => e.id.startsWith(pre)).length; } catch (e) { return 0; } };
    const card = (d) => {
      const r = R[d.r] || {}; const on = r.aktiv !== false; const n = on ? treffer(d.pre) : 0;
      return `<div class="rule${on ? '' : ' off'}" data-rule="${d.r}">
        <div class="rule-head"><span class="rule-ico">${TA.icons[d.icon] || TA.icons.bulb}</span>
          <div><h3>${d.titel}</h3><p class="small muted">${d.text}</p></div><div class="spacer"></div>
          <label class="switch" title="Regel ein/aus"><input type="checkbox" data-k="aktiv" ${on ? 'checked' : ''} ${darf ? '' : 'disabled'} aria-label="${d.titel} aktiv"><span></span></label></div>
        <p class="rule-satz" data-satz>${d.satz(r)}</p>
        <div class="rule-fields">${d.felder.map(([k, l, min, max, unit]) => `<label class="rng"><span>${l}<b data-v="${k}">${r[k]}${unit}</b></span>
          <input type="range" min="${min}" max="${max}" step="${max > 100 ? 15 : 1}" value="${r[k]}" data-k="${k}" data-unit="${unit}" ${darf && on ? '' : 'disabled'} aria-label="${d.titel}: ${l}"></label>`).join('')}</div>
        <div class="rule-foot" data-foot>${on ? (n ? `<span class="badge b-bewertung">${n} Empfehlung${n === 1 ? '' : 'en'} aktuell</span> <a href="#/empfehlungen">ansehen</a>` : '<span class="badge b-bewertet">derzeit nichts auffällig</span>') : '<span class="badge b-alt">ausgeschaltet</span>'}</div>
      </div>`;
    };
    el.innerHTML = `<div class="rules-intro"><p class="help" style="margin:0">Die Regeln entscheiden, wann das Tool eine Maßnahme vorschlägt. Gezählt werden nur bewertete, berechtigte und von uns verschuldete Fehler; eine dokumentierte Maßnahme setzt die Zählung zurück. Die Vorschau unten in jeder Karte rechnet sofort mit.</p></div>
      <div class="rules">${REGELN.map(card).join('')}</div>
      <div class="rules-own"><div class="rules-own-head"><div><h2>Eigene Regeln</h2><p class="small muted">Lege eigene Regeln an, um genau das zu überwachen, was dir wichtig ist – zum Beispiel eine bestimmte Fehlerart, einen Cluster oder einen Standort.</p></div>${darf ? '<button type="button" class="btn btn-primary" id="r-add">Eigene Regel anlegen</button>' : ''}</div><div class="rules" id="eigene"></div></div>`;
        const GRUPPEN = [['zeichner', 'je Zeichner'], ['standort', 'je Standort'], ['qs', 'je QS'], ['team', 'für das ganze Team']];
    const TYPEN = [['gespraech', 'Qualitätsgespräch'], ['schulung', 'Schulung'], ['qs', 'QS-Abstimmung'], ['prozess', 'Prozessänderung']];
    const eigene = () => S.cfg.regeln.eigene || [];
    const satzE = (r) => {
      const f = [r.hk && 'Kategorie „' + TA.analysis.hkName(r.hk) + '“', r.fehlerart && 'Fehlerart „' + TA.analysis.faName(r.fehlerart) + '“', r.cluster && 'Cluster ' + r.cluster, r.zeichner && 'Zeichner ' + r.zeichner].filter(Boolean);
      const g = (GRUPPEN.find((x) => x[0] === r.gruppe) || GRUPPEN[0])[1];
      return `Empfehlen, wenn ${g} <b>${r.anzahl}×</b> in <b>${r.tage} Tagen</b>${f.length ? ' (' + esc(f.join(', ')) + ')' : ''} ein Fehler vorkommt.`;
    };
    const renderEigene = () => {
      const box = el.querySelector('#eigene'); if (!box) return;
      let emp = []; try { emp = TA.analysis.empfehlungen(); } catch (e) { emp = []; }
      box.innerHTML = eigene().map((r) => {
        const on = r.aktiv !== false; const n = on ? emp.filter((x) => x.regel === r.id).length : 0;
        return `<div class="rule${on ? '' : ' off'}" data-eigen="${esc(r.id)}">
          <div class="rule-head"><span class="rule-ico">${TA.icons.bulb}</span><div><h3>${esc(r.titel)}</h3><p class="small muted">${esc((TYPEN.find((t) => t[0] === r.massnahme) || [])[1] || '')}</p></div><div class="spacer"></div>${darf ? `<label class="switch" title="Regel ein/aus"><input type="checkbox" data-eakt ${on ? 'checked' : ''} aria-label="${esc(r.titel)} aktiv"><span></span></label>` : ''}</div>
          <p class="rule-satz">${satzE(r)}</p>
          ${r.vorschlag ? `<p class="small muted" style="margin:0">Empfohlene Maßnahme: ${esc(r.vorschlag)}</p>` : ''}
          <div class="rule-foot">${!on ? '<span class="badge b-alt">ausgeschaltet</span>' : n ? `<span class="badge b-bewertung">${n} Empfehlung${n === 1 ? '' : 'en'} aktuell</span> <a href="#/empfehlungen">ansehen</a>` : '<span class="badge b-bewertet">derzeit nichts auffällig</span>'}<span class="spacer"></span>${darf ? `<button type="button" class="btn btn-ghost btn-sm" data-eedit>Bearbeiten</button><button type="button" class="iconbtn" data-edel title="Regel löschen" aria-label="Regel löschen">${TA.icons.trash}</button>` : ''}</div></div>`;
      }).join('') || '<div class="rule-empty">Noch keine eigenen Regeln. Lege eine an, wenn du etwas überwachen möchtest, das die Standardregeln nicht abdecken.</div>';
    };
    const eigeneDialog = (r0) => {
      const r = Object.assign({ gruppe: 'zeichner', anzahl: 3, tage: 90, massnahme: 'gespraech' }, r0 || {});
      const opt = (arr, sel, empty) => (empty ? `<option value="">${empty}</option>` : '') + arr.map(([v, l]) => `<option value="${esc(v)}"${String(sel) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('');
      const zeichner = TA.sortDe(TA.uniq([...(S.cfg.listen.zeichner || []), ...[...S.abl.values()].map((a) => a.zeichner).filter(Boolean)]));
      const body = `<div class="stack">
        <div class="field"><label for="x-t">Name der Regel</label><input id="x-t" class="input" value="${esc(r.titel || '')}" placeholder="z. B. Abschalthinweis vergessen"></div>
        <div class="field"><label for="x-g">Zählen …</label><select id="x-g" class="select">${opt(GRUPPEN, r.gruppe)}</select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="field"><label for="x-a">Ab wie vielen Fehlern</label><input id="x-a" type="number" min="1" class="input" value="${r.anzahl}"></div><div class="field"><label for="x-d">In wie vielen Tagen</label><input id="x-d" type="number" min="7" class="input" value="${r.tage}"></div></div>
        <div class="field"><label for="x-h">Nur Hauptkategorie</label><select id="x-h" class="select">${opt(S.cfg.hauptkategorien.map((h) => [h.id, h.name]), r.hk, 'Alle')}</select></div>
        <div class="field"><label for="x-f">Nur Fehlerart</label><select id="x-f" class="select">${opt(S.cfg.fehlerarten.slice().sort((a, b) => a.name.localeCompare(b.name, 'de')).map((f) => [f.id, f.name]), r.fehlerart, 'Alle')}</select></div>
        <div class="field"><label for="x-c">Nur Cluster</label><select id="x-c" class="select">${opt((S.cfg.listen.cluster || []).map((c) => [c, c]), r.cluster, 'Alle')}</select></div>
        <div class="field"><label for="x-z">Nur Zeichner</label><select id="x-z" class="select">${opt(zeichner.map((z) => [z, z]), r.zeichner, 'Alle')}</select></div>
        <div class="field"><label for="x-m">Art der empfohlenen Maßnahme</label><select id="x-m" class="select">${opt(TYPEN, r.massnahme)}</select></div>
        <div class="field"><label for="x-v">Was soll gemacht werden?</label><textarea id="x-v" class="input" rows="3" placeholder="z. B. Checkliste gemeinsam durchgehen">${esc(r.vorschlag || '')}</textarea></div></div>`;
      return TA.modal(r0 ? 'Eigene Regel bearbeiten' : 'Eigene Regel anlegen', body, [{ label: 'Abbrechen', value: null, cls: 'btn-ghost' }, { label: 'Speichern', value: true, cls: 'btn-primary' }], {
        collect: (m) => ({ titel: m.querySelector('#x-t').value.trim(), gruppe: m.querySelector('#x-g').value, anzahl: Math.max(1, +m.querySelector('#x-a').value || 1), tage: Math.max(7, +m.querySelector('#x-d').value || 90), hk: m.querySelector('#x-h').value, fehlerart: m.querySelector('#x-f').value, cluster: m.querySelector('#x-c').value, zeichner: m.querySelector('#x-z').value, massnahme: m.querySelector('#x-m').value, vorschlag: m.querySelector('#x-v').value.trim() }),
        validate: (m) => { if (!m.querySelector('#x-t').value.trim()) { TA.toast('Bitte der Regel einen Namen geben.', { error: true }); return false; } return true; }
      });
    };
    renderEigene();
    if (darf) {
      const saveList = async (fn) => { await S.saveCfg((c) => { c.regeln.eigene = c.regeln.eigene || []; fn(c.regeln.eigene); }); renderEigene(); };
      el.querySelector('#r-add').onclick = async () => { const v = await eigeneDialog(); if (v) { await saveList((l) => l.push({ id: TA.uid('r'), aktiv: true, ...v })); TA.toast('Regel angelegt'); } };
      const eb = el.querySelector('#eigene');
      eb.addEventListener('click', async (e) => {
        const box = e.target.closest('[data-eigen]'); if (!box) return;
        const id = box.dataset.eigen; const r = eigene().find((x) => x.id === id);
        if (e.target.closest('[data-eedit]')) { const v = await eigeneDialog(r); if (v) { await saveList((l) => Object.assign(l.find((x) => x.id === id), v)); TA.toast('Regel gespeichert'); } }
        else if (e.target.closest('[data-edel]')) { if (await TA.confirm('Regel löschen?', `„${esc(r.titel)}“ wird entfernt. Bereits angelegte Maßnahmen bleiben erhalten.`, 'Löschen', true)) { await saveList((l) => l.splice(l.findIndex((x) => x.id === id), 1)); TA.toast('Regel gelöscht'); } }
      });
      eb.addEventListener('change', async (e) => { const box = e.target.closest('[data-eigen]'); if (!box || !e.target.matches('[data-eakt]')) return; const on = e.target.checked; await saveList((l) => { l.find((x) => x.id === box.dataset.eigen).aktiv = on; }); TA.toast(on ? 'Regel eingeschaltet' : 'Regel ausgeschaltet'); });
    }
    if (!darf) return;
    const save = TA.debounce(async (rr, k, v) => { await S.saveCfg((c) => { c.regeln[rr][k] = v; }); TA.toast('Regel gespeichert'); }, 500);
    const refresh = (box) => {
      const d = REGELN.find((x) => x.r === box.dataset.rule), r = S.cfg.regeln[d.r];
      box.querySelector('[data-satz]').innerHTML = d.satz(r);
      const on = r.aktiv !== false, n = on ? treffer(d.pre) : 0;
      box.querySelector('[data-foot]').innerHTML = on ? (n ? `<span class="badge b-bewertung">${n} Empfehlung${n === 1 ? '' : 'en'} aktuell</span> <a href="#/empfehlungen">ansehen</a>` : '<span class="badge b-bewertet">derzeit nichts auffällig</span>') : '<span class="badge b-alt">ausgeschaltet</span>';
    };
    el.addEventListener('input', (e) => {
      const t = e.target; const box = t.closest('[data-rule]'); if (!box || t.type !== 'range') return;
      const v = parseInt(t.value, 10); S.cfg.regeln[box.dataset.rule][t.dataset.k] = v;
      box.querySelector(`[data-v="${t.dataset.k}"]`).textContent = v + t.dataset.unit;
      refresh(box); save(box.dataset.rule, t.dataset.k, v);
    });
    el.addEventListener('change', async (e) => {
      const t = e.target; const box = t.closest('[data-rule]'); if (!box || t.dataset.k !== 'aktiv') return;
      S.cfg.regeln[box.dataset.rule].aktiv = t.checked;
      box.classList.toggle('off', !t.checked);
      box.querySelectorAll('input[type=range]').forEach((x) => (x.disabled = !t.checked));
      refresh(box);
      await S.saveCfg((c) => { c.regeln[box.dataset.rule].aktiv = t.checked; }); TA.toast(t.checked ? 'Regel eingeschaltet' : 'Regel ausgeschaltet');
    });
  }

  app.views.einstellungen = einstellungen;
})(window.TA);
