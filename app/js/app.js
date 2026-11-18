/* App-Rahmen: Start, Benutzer, Rechte, Navigation, Router */
(function (TA) {
  'use strict';
  const S = TA.store;
  const app = (TA.app = { views: {}, busy: false, current: null });
  TA.views = app.views;

  const ROLES = {
    admin: 'Admin', rm: 'Ressourcenmanagement', pl: 'Projektleitung', qs: 'Qualitätssicherung', tl: 'Teamleitung'
  };
  const RIGHTS = {
    importieren: ['admin', 'rm', 'pl', 'qs', 'tl'],
    bewerten: ['admin', 'pl', 'qs', 'tl'],
    stammdaten: ['admin', 'rm', 'pl', 'qs', 'tl'],
    massnahmen: ['admin', 'rm', 'tl'],
    verwalten: ['admin'],
    loeschen: ['admin']
  };
  app.ROLES = ROLES; app.RIGHTS = RIGHTS;
  app.RIGHT_LABELS = {
    importieren: 'Mails importieren und Ablehnungen anlegen', stammdaten: 'Projektdaten, Zeichner und QS eintragen',
    bewerten: 'Fehler kategorisieren und Bewertung abschließen', massnahmen: 'Maßnahmen dokumentieren (Gespräche, Schulungen)',
    verwalten: 'Kategorien, Benutzer, Listen und Regeln verwalten', loeschen: 'Ablehnungen löschen'
  };

  app.user = () => {
    const id = localStorage.getItem('ablehnungstool-user');
    return (S.cfg && S.cfg.users.find((u) => u.id === id && u.aktiv !== false)) || null;
  };
  app.can = (right) => {
    const u = app.user(); if (!u) return false;
    return (u.roles || []).some((r) => (RIGHTS[right] || []).includes(r));
  };

  /* ---------- Navigation ---------- */
  const NAV = [
    { r: 'uebersicht', label: 'Übersicht', icon: 'grid' },
    { r: 'liste', label: 'Ablehnungen', icon: 'list', count: () => [...S.abl.values()].filter((a) => a.status !== 'bewertet' && app.dauerOk(a)).length, countTitle: 'offen' },
    { r: 'auswertung', label: 'Auswertung', icon: 'chart' },
    { r: 'empfehlungen', label: 'Empfehlungen', icon: 'bulb', count: () => TA.analysis.empfehlungen().length, countTitle: 'aktuell' }
  ];
  const TITLES = { a: 'Ablehnung', blatt: 'Gesprächsblatt', einstellungen: 'Einstellungen' };
  app.navCollapsed = () => document.documentElement.classList.contains('nav-zu');
  function syncState() {
    if (S.mode === 'local') return { cls: 'warn', text: 'Nur in diesem Browser', title: 'Daten liegen nur in diesem Browser – nicht für die Teamarbeit.' };
    if (S.syncError) return { cls: 'off', text: S.mode === 'cloud' ? 'Cloud nicht erreichbar' : 'Ordner nicht erreichbar', title: S.syncError };
    return { cls: 'ok', text: 'Aktuell · ' + (S.lastSync ? TA.fmtTime(S.lastSync) : '–'), title: (S.mode === 'cloud' ? 'Cloud-Datenbank' : 'Datenordner ' + S.folderName()) + ' – klicken zum Aktualisieren' };
  }
  app.refreshNav = () => renderNav(app.current ? (app.current.name === 'a' ? 'liste' : app.current.name) : 'uebersicht');
  function renderNav(route) {
    const side = document.getElementById('side'), nav = document.getElementById('nav');
    side.hidden = false; document.getElementById('topbar').hidden = false;
    const zu = app.navCollapsed();
    nav.innerHTML = NAV.map((n) => {
      if (n.sep) return `<div class="sep">${n.sep}</div>`;
      let c = ''; try { const v = n.count ? n.count() : 0; if (v) c = `<span class="cnt" title="${v} ${n.countTitle}">${v}</span>`; } catch (e) { c = ''; }
      return `<a href="#/${n.r}"${route === n.r ? ' aria-current="page"' : ''} title="${zu ? n.label : ''}">${TA.icons[n.icon]}<span class="lbl">${n.label}</span>${c}</a>`;
    }).join('');
    const nw = document.getElementById('side-new');
    nw.innerHTML = app.can('importieren') ? `<button type="button" class="btn-new" id="btn-new" title="Neue Ablehnung erfassen">${TA.icons.plus}<span class="lbl">Neue Ablehnung</span></button>` : '';
    const bn = document.getElementById('btn-new'); if (bn) bn.onclick = () => app.openNew();
    const tg = document.getElementById('nav-toggle');
    tg.innerHTML = TA.icons.collapse;
    tg.setAttribute('aria-label', zu ? 'Navigation ausklappen' : 'Navigation einklappen'); tg.title = tg.getAttribute('aria-label');
    tg.onclick = () => {
      const z = !app.navCollapsed();
      document.documentElement.classList.toggle('nav-zu', z);
      localStorage.setItem('ablehnungstool-nav', z ? 'zu' : 'auf');
      renderNav(app.current ? (app.current.name === 'a' ? 'liste' : app.current.name) : route);
    };
    document.getElementById('tb-right').innerHTML = `${S.mode === 'local' ? '<a class="btn btn-secondary btn-sm" href="#/einstellungen/daten" title="Daten liegen nur in diesem Browser">Speicherort wählen</a>' : ''}<a class="tb-icon${route === 'einstellungen' ? ' on' : ''}" href="#/einstellungen" title="Einstellungen" aria-label="Einstellungen"${route === 'einstellungen' ? ' aria-current="page"' : ''}>${TA.icons.gear}</a>`;
    renderUser();
  }
  function renderUser() {
    const u = app.user(); const el = document.getElementById('userchip');
    if (!u) { el.hidden = true; return; }
    el.hidden = false;
    const st = syncState();
    el.title = `${u.name} – Benutzer wechseln`;
    el.innerHTML = `<span class="avatar">${TA.esc(TA.initials(u.name))}<i class="st ${st.cls}" title="${TA.esc(st.text)}"></i></span><span class="lbl">${TA.esc(u.name)}</span><span class="lbl chev">${TA.icons.chevron}</span>`;
    el.onclick = () => app.pickUser(true);
  }

  /* ---------- Benutzer waehlen / ersten Admin anlegen ---------- */
  const roleText = (u) => (u.roles || []).map((r) => ROLES[r]).join(' · ') || 'ohne Rolle';
  app.pickUser = async (switching) => {
    const users = S.cfg.users.filter((u) => u.aktiv !== false).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    if (!users.length) return app.firstAdmin();
    const cur = app.user();
    const body = `<p class="muted" style="margin-top:-4px">Wähle deinen Namen. Er erscheint im Verlauf jeder Ablehnung, die du bearbeitest.</p>
      <div class="userpick" role="listbox" aria-label="Benutzer">${users.map((u) => `<button type="button" role="option" data-u="${TA.esc(u.id)}" aria-selected="${cur && cur.id === u.id}"><span class="avatar">${TA.esc(TA.initials(u.name))}</span><span class="up-t"><b>${TA.esc(u.name)}</b><small>${TA.esc(roleText(u))}</small></span>${cur && cur.id === u.id ? `<span class="up-cur">${TA.icons.check}</span>` : ''}</button>`).join('')}</div>`;
    const v = await TA.modal(switching ? 'Benutzer wechseln' : 'Wer arbeitet gerade?', body, switching ? [{ label: 'Abbrechen', value: null, cls: 'btn-ghost' }] : [], {
      noEsc: !switching,
      onOpen: (bg, close) => { bg.querySelectorAll('[data-u]').forEach((b) => (b.onclick = () => close(b.dataset.u))); const f = bg.querySelector('[data-u]'); if (f) f.focus(); }
    });
    if (v) { localStorage.setItem('ablehnungstool-user', v); renderUser(); app.route(); }
  };
  app.firstAdmin = async () => {
    const v = await TA.modal('Ersten Admin anlegen', `<p class="muted">Am gewählten Speicherort ist noch kein Benutzer angelegt. Lege dich als Admin an, danach kannst du unter Einstellungen weitere Personen mit Rollen anlegen.</p>
      <div class="field"><label for="fa-name">Name · Pflichtfeld</label><input id="fa-name" class="input" placeholder="z. B. Shaiel Schmöhe" autocomplete="name"></div>`,
    [{ label: 'Admin anlegen', value: true, cls: 'btn-primary' }], {
      noEsc: true,
      validate: (bg) => { const i = bg.querySelector('#fa-name'); if (!i.value.trim()) { i.focus(); i.setAttribute('aria-invalid', 'true'); return false; } return true; },
      collect: (bg) => bg.querySelector('#fa-name').value.trim()
    });
    if (!v) return;
    const u = { id: TA.uid('u-'), name: v, roles: ['admin'], aktiv: true };
    await S.saveCfg((c) => c.users.push(u));
    localStorage.setItem('ablehnungstool-user', u.id);
    renderUser(); app.route();
  };

  /* ---------- Verbinden ---------- */
  function connectScreen(state) {
    document.getElementById('side').hidden = true; document.getElementById('topbar').hidden = true;
    document.documentElement.classList.add('no-shell');
    app._authShown = state === 'login';
    const v = document.getElementById('view');
    const fs = S.supportsFs, cloud = S.cloudAvail, login = state === 'login';
    const cloudCard = cloud ? `<div class="card stack">
        <div><h2>Gemeinsame Cloud-Datenbank</h2><p class="small muted" style="margin:0">Alle arbeiten in einer gemeinsamen Datenbank – in jedem Browser, auch Firefox, ohne Laufwerk. Anmeldung mit dem Team-Passwort.</p></div>
        <form id="c-form" class="stack" autocomplete="off"><div class="field"><label for="c-pw">Team-Passwort</label><input id="c-pw" type="password" class="input" autocomplete="current-password" required></div>
        <div><button type="submit" class="btn btn-primary" id="c-login">Anmelden</button></div></form></div>` : '';
    const fsCard = login ? '' : `<div class="card stack">
        <div><h2>Ordner auf dem Laufwerk</h2><p class="small muted" style="margin:0">Alle Ablehnungen, Mails und Einstellungen liegen als einzelne Dateien in <b>einem gemeinsamen Ordner</b>, z. B. auf dem Laufwerk oder in einem mit OneDrive synchronisierten SharePoint-Ordner. Jede Person wählt denselben Ordner. Nur in Edge und Chrome.</p></div>
        ${state === 'permission'
    ? `<div><button type="button" class="btn btn-primary" id="c-grant">Zugriff auf „${TA.esc(S.root.name)}“ erlauben</button> <button type="button" class="btn btn-ghost" id="c-pick">Anderen Ordner wählen</button></div><p class="small muted" style="margin:0">Der Browser fragt nach jedem Neustart einmal nach der Erlaubnis.</p>`
    : fs ? '<div><button type="button" class="btn btn-primary" id="c-pick">Ordner auswählen</button></div>'
      : '<p class="notice" style="margin:0">Dieser Browser kann nicht auf Ordner zugreifen. Dafür bitte Microsoft Edge oder Google Chrome verwenden.</p>'}
      </div>`;
    const localCard = login ? '' : `<div class="card stack"><div><h2>Ohne Speicherort ausprobieren</h2><p class="small muted" style="margin:0">Speichert nur in diesem Browser. Gut zum Testen, nicht für die Teamarbeit.</p></div><div><button type="button" class="btn btn-secondary" id="c-local">Ausprobieren</button></div></div>`;
    v.innerHTML = `<div style="max-width:720px;margin:40px auto">
      <div class="overline">Einrichtung</div><h1>${login ? 'Anmelden' : 'Speicherort wählen'}</h1>
      <p class="help">${login ? 'Deine Sitzung ist abgelaufen oder du bist noch nicht angemeldet.' : 'Wo sollen die Daten liegen? Du kannst das später unter Einstellungen → Daten &amp; Import ändern.'}</p>
      <div class="stack" style="margin-top:16px">${cloudCard}${fsCard}${localCard}</div></div>`;
    const go = async (fn) => { try { await fn(); await afterReady(); } catch (e) { if (e.name !== 'AbortError') TA.toast(e.message || String(e), { error: true }); } };
    const pick = v.querySelector('#c-pick'); if (pick) pick.onclick = () => go(S.connect);
    const grant = v.querySelector('#c-grant'); if (grant) grant.onclick = () => go(S.regrant);
    const loc = v.querySelector('#c-local'); if (loc) loc.onclick = () => go(async () => S.useLocal());
    const form = v.querySelector('#c-form');
    if (form) {
      form.onsubmit = (e) => { e.preventDefault(); const b = v.querySelector('#c-login'); b.disabled = true; go(() => S.login(v.querySelector('#c-pw').value)).finally(() => { b.disabled = false; }); };
      if (login) setTimeout(() => v.querySelector('#c-pw').focus(), 50);
    }
  }

  async function afterReady() {
    document.documentElement.classList.remove('no-shell');
    app._authShown = false;
    document.getElementById('side').hidden = false; document.getElementById('topbar').hidden = false;
    if (!app.user()) { await app.pickUser(false); if (!app.user()) return; }
    renderUser();
    app.route();
    if (!app._timer) {
      app._timer = setInterval(() => { if (!document.hidden) S.sync(false); }, 45000);
      window.addEventListener('focus', () => S.sync(false));
    }
  }

  /* ---------- Seitenpanel „Neue Ablehnung“ ---------- */
  app.openNew = () => {
    if (!app.can('importieren')) return;
    const root = document.getElementById('drawer-root');
    if (root.firstChild) return;
    const last = document.activeElement;
    root.innerHTML = `<div class="drawer-bg" data-close></div>
      <section class="drawer" role="dialog" aria-modal="true" aria-labelledby="dr-t">
        <div class="drawer-head"><div><h2 id="dr-t">Neue Ablehnung</h2><p class="small muted">TMC-Mail, Korrektur-PDF oder Mailtext – das Tool trennt die Fehlerpunkte.</p></div><div class="spacer"></div><button type="button" class="tb-icon" data-close aria-label="Schließen">${TA.icons.x}</button></div>
        <div class="drawer-body" id="dr-body"></div>
      </section>`;
    const close = () => {
      if (!root.firstChild) return;
      root.classList.add('closing');
      setTimeout(() => { root.innerHTML = ''; root.classList.remove('closing'); }, TA.reducedMotion() ? 0 : 200);
      document.removeEventListener('keydown', onKey);
      if (last && last.focus) last.focus();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    root.querySelectorAll('[data-close]').forEach((b) => (b.onclick = close));
    app.closeNew = close;
    app.views.neu(root.querySelector('#dr-body'), [], { drawer: true });
    setTimeout(() => { const d = root.querySelector('#drop'); if (d) d.focus(); }, 50);
  };

  /* ---------- Seitentitel in die Kopfleiste, Icons an Kartentitel ---------- */
  function decorate(el) {
    const nm = app.current && app.current.name;
    if (['uebersicht', 'liste', 'auswertung', 'empfehlungen'].includes(nm) && el.id === 'view' && !el.querySelector(':scope > .dauer') && app.dauerBanner) { const b = app.dauerBanner(); if (b) el.insertAdjacentHTML('afterbegin', b); }
    const ph = el.querySelector('.pagehead');
    if (ph && !ph.dataset.moved) {
      const h1 = ph.querySelector('h1'); const ov = ph.querySelector('.overline');
      if (h1) {
        ph.dataset.moved = '1';
        document.getElementById('tb-title').replaceChildren(...h1.childNodes);
        document.getElementById('tb-over').replaceChildren(...(ov ? ov.childNodes : []));
        h1.remove(); if (ov) ov.remove();
        const rest = ph.textContent.trim() || ph.querySelector('button,a,select,input');
        if (!rest) ph.remove(); else ph.classList.add('pagehead-slim');
      }
    }
    el.querySelectorAll('.card h2:not([data-ico]), .tabs [role="tab"]:not([data-ico])').forEach((h) => {
      h.dataset.ico = '1';
      const svg = TA.iconFor(h.textContent);
      if (svg) h.insertAdjacentHTML('afterbegin', `<span class="h-ico" aria-hidden="true">${svg}</span>`);
    });
  }
  let observer = null;
  function watch(el) {
    if (observer) observer.disconnect();
    decorate(el);
    observer = new MutationObserver(() => { observer.disconnect(); decorate(el); observer.observe(el, { childList: true, subtree: true }); });
    observer.observe(el, { childList: true, subtree: true });
  }

  /* ---------- Filter einklappbar (ein Icon, Zahl der aktiven Filter) ---------- */
  app.filterPanel = (root) => {
    const btn = root.querySelector('.filter-toggle'), panel = root.querySelector('.filter-panel');
    if (!btn || !panel) return;
    const key = 'ablehnungstool-fp-' + panel.id;
    const badge = btn.querySelector('.fbadge');
    const count = () => {
      let n = 0;
      panel.querySelectorAll('select:not([data-nocount])').forEach((s) => { if (s.selectedIndex > 0) n++; });
      panel.querySelectorAll('input[type=checkbox]').forEach((c) => { if (c.checked) n++; });
      panel.querySelectorAll('.seg [aria-pressed="true"]').forEach((b) => { if (b.dataset.st) n++; });
      badge.textContent = n; badge.hidden = !n;
    };
    const set = (open) => {
      panel.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.classList.toggle('on', open); sessionStorage.setItem(key, open ? '1' : '0');
    };
    btn.onclick = () => set(panel.hidden);
    panel.addEventListener('change', () => setTimeout(count, 0));
    panel.addEventListener('click', () => setTimeout(count, 0));
    set(sessionStorage.getItem(key) === '1'); count();
  };

  /* ---------- Router ---------- */
  app.go = (hash) => { if (location.hash === hash) app.route(); else location.hash = hash; };
  /* frischer Inhaltsbereich ohne alte Event-Listener */
  app.freshView = () => { const old = document.getElementById('view'); const el = old.cloneNode(false); old.replaceWith(el); watch(el); return el; };
  app.route = () => {
    if (!S.cfg || !app.user()) return;
    const parts = (location.hash || '#/uebersicht').replace(/^#\/?/, '').split('/');
    let name = parts[0] || 'uebersicht';
    if (name === 'neu') { history.replaceState(null, '', '#/uebersicht'); name = 'uebersicht'; setTimeout(app.openNew, 0); }
    const view = app.views[name] || app.views.uebersicht;
    if (app.leave) { try { app.leave(); } catch (e) { console.error(e); } app.leave = null; }
    app.busy = false;
    app.current = { name, params: parts.slice(1).map(decodeURIComponent) };
    const draw = () => {
      renderNav(name === 'a' ? 'liste' : name);
      const n = NAV.find((x) => x.r === name);
      document.getElementById('tb-title').textContent = TITLES[name] || (n ? n.label : '');
      document.getElementById('tb-over').textContent = '';
      const el = app.freshView();
      try { view(el, app.current.params); }
      catch (e) { console.error(e); el.innerHTML = `<div class="notice">Die Seite konnte nicht angezeigt werden: ${TA.esc(e.message)}</div>`; }
      el.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    };
    draw();
    app._drawn = true;
  };
  window.addEventListener('hashchange', app.route);
  window.addEventListener('beforeunload', (e) => { if (app.dirty) { e.preventDefault(); e.returnValue = ''; } });

  S.on((what) => {
    if (what === 'auth') { if (!app._authShown) connectScreen('login'); return; }
    if (!app.current) return;
    renderNav(app.current.name === 'a' ? 'liste' : app.current.name);
    if (what === 'data' && !app.busy) {
      const v = app.views[app.current.name];
      if (v && v.live) { const y = window.scrollY; v(app.freshView(), app.current.params); window.scrollTo(0, y); }
    }
    if (what === 'data' && app.onData) app.onData();
  });

  app.start = async () => {
    try {
      const st = await S.init();
      if (st === 'ready') await afterReady(); else connectScreen(st);
    } catch (e) {
      console.error(e); connectScreen('connect');
      TA.toast('Speicherort konnte nicht geöffnet werden: ' + (e.message || e), { error: true });
    }
  };

  /* ---------- gemeinsame Bausteine ---------- */
  app.statusBadge = (a) => {
    if (a.status === 'bewertet') return '<span class="badge b-bewertet">Bewertet</span>';
    if (a.status === 'bewertung') return '<span class="badge b-bewertung">In Bewertung</span>';
    return '<span class="badge b-import">Importiert</span>';
  };
  app.lockBadge = (a) => {
    const l = S.lockOf(a.id); const u = app.user();
    return l && u && l.userId !== u.id ? `<span class="lock" title="gesperrt bis ${TA.fmtTime(l.until)}">● ${TA.esc(l.user)} bearbeitet</span>` : '';
  };
  app.options = (list, sel, empty = '– wählen –') =>
    (empty !== null ? `<option value="">${TA.esc(empty)}</option>` : '') +
    TA.uniq(list.concat(sel ? [sel] : [])).map((x) => `<option${x === sel ? ' selected' : ''}>${TA.esc(x)}</option>`).join('');
  app.history = (field) => TA.uniq([...S.abl.values()].map((a) => a[field]));
  app.datalist = (id, values) => `<datalist id="${id}">${TA.sortDe(TA.uniq(values)).map((v) => `<option value="${TA.esc(v)}">`).join('')}</datalist>`;
})(window.TA);
