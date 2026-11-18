/* Datenablage: ein Ordner auf dem Laufwerk / SharePoint (File System Access API) oder lokal im Browser */
(function (TA) {
  'use strict';

  const LOCK_MIN = 20;
  const DIRS = ['ablehnungen', 'massnahmen', 'anhaenge', 'sperren'];

  const HK = [
    { id: 'hk-plan', name: 'Planerischer Fehler', info: 'Etwas wurde vergessen / fehlt' },
    { id: 'hk-darst', name: 'Darstellungsfehler', info: 'Vorhanden, aber falsch' },
    { id: 'hk-einr', name: 'Einreichungsfehler', info: 'Unterlagen, Fotos, Dateien bei der Einreichung' },
    { id: 'hk-schoen', name: 'Schönheitsfehler', info: 'Lesbarkeit, Anordnung, Tippfehler' },
    { id: 'hk-ext', name: 'Externer Fehler', info: 'Nicht durch uns verursacht (Vorgaben, Prüfer, Dritte)' }
  ];
  const FA = {
    'hk-plan': ['Offene Korrektur nicht umgesetzt', 'Mieter-Auflage / Wunschkonfiguration nicht eingearbeitet', 'Hinweis zu Leistungsreduzierung/Abschaltung vergessen',
      'Steig- und Rettungsweg nicht dargestellt', 'Kennzeichnung LWL-/Elt-Zuleitung fehlt', 'Planung entspricht nicht Muster', 'Bauteilnummer (BOM) nicht angegeben',
      'Kabelangaben fehlen (Anzahl/Länge/Typ)', 'Mitnutzer nicht angegeben', 'Bauteil vergessen'],
    'hk-darst': ['Anbaustelle in AT-Tabelle falsch', 'Plankopf / Planungsphase / Indexverlauf falsch', 'Höhenkote falsch', 'Antennen-/RRU-Typ falsch',
      'Kabelanzahl zwischen AT-Tabelle und Kabelweg abweichend', 'Darstellung Option/geplant/Bestand falsch', 'Verweis/Kennzeichnung falsch platziert', 'Bauteilindex ist falsch', 'Schnitt falsch dargestellt'],
    'hk-einr': ['Fotos fehlen / falsch', 'Stahlbauzeichnung nicht mit eingereicht', 'Statikstempel fehlt / alter Index', 'Dateibezeichnung falsch', 'Belegungsprüfung falsch / falsches Format'],
    'hk-schoen': ['Schriftüberlappung', 'Schreibfehler', 'Plottfenster / Hinweiskästchen abgeschnitten', 'Strichstärke zu dünn'],
    'hk-ext': ['Belegungsprüfung falsch (extern)', 'Prüfer hat falsch geprüft', 'Vorgabe geändert ohne Info', 'Baumangel vor Ort']
  };

  function defaultConfig() {
    const fehlerarten = [];
    Object.keys(FA).forEach((hk) => FA[hk].forEach((name) => fehlerarten.push({ id: TA.uid('fa-'), name, hk, aktiv: true })));
    return {
      version: 1, rev: 0,
      users: [],
      hauptkategorien: HK.map((h) => ({ ...h, aktiv: true })),
      fehlerarten,
      listen: {
        zeichner: [], qs: ['nicht erforderlich'],
        cluster: ['A1-Neubau', 'A1-Umbau', 'A1-Umbau (DFMG)', 'A1-Umbau (VF-RiFu)', 'A1-Umbau (RiFu)', 'A1-Sonderprojekt', '1&1', 'C/D-Palermo', 'non-VFDE', 'DFMG + VFDE joint 1&1'],
        planvariante: ['AP', 'AP-REV', 'EP', 'EP-REV', 'AS-Built', 'BNetzA']
      },
      regeln: {
        gespraech: { aktiv: true, anzahl: 3, tage: 90 },
        qs: { aktiv: true, anzahl: 3, tage: 90 },
        schulung: { aktiv: true, zeichner: 3, tage: 90 },
        auffrischen: { aktiv: true, tage: 180 },
        wiederholung: { aktiv: true, anzahl: 3, tage: 180 }
      }
    };
  }

  /* ---------- IndexedDB fuer den Ordner-Handle ---------- */
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('ablehnungstool', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function idbGet(k) { const db = await idb(); return new Promise((res) => { const t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result); t.onerror = () => res(null); }); }
  async function idbSet(k, v) { const db = await idb(); return new Promise((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => res(); }); }

  const S = {
    mode: null,          /* 'fs' | 'local' | 'cloud' */
    root: null, dirs: {},
    cfg: null,
    abl: new Map(), mt: new Map(),
    massn: new Map(),
    locks: new Map(),
    lastSync: null, syncError: null,
    listeners: new Set()
  };
  TA.store = S;
  S.supportsFs = typeof window.showDirectoryPicker === 'function';
  S.on = (fn) => { S.listeners.add(fn); return () => S.listeners.delete(fn); };
  S.emit = (what) => S.listeners.forEach((fn) => { try { fn(what); } catch (e) { console.error(e); } });
  S.folderName = () => (S.mode === 'fs' && S.root ? S.root.name : S.mode === 'cloud' ? 'Cloud-Datenbank' : 'Browser-Speicher');

  /* ---------- Cloud (Vercel + Datenbank) ---------- */
  S.cloudAvail = false; S.cloudV = 0;
  class AuthError extends Error { constructor() { super('Bitte anmelden.'); this.auth = true; } }
  const ERR = { 'cloud-nicht-eingerichtet': 'Die Cloud ist noch nicht eingerichtet.', 'passwort-falsch': 'Das Passwort stimmt nicht.', serverfehler: 'Serverfehler. Bitte später erneut versuchen.', 'anmeldung-erforderlich': 'Bitte anmelden.' };
  async function api(path, opts = {}) {
    const o = Object.assign({ credentials: 'same-origin', cache: 'no-store' }, opts);
    if (o.json !== undefined) { o.method = o.method || 'POST'; o.headers = Object.assign({ 'Content-Type': 'application/json' }, o.headers); o.body = JSON.stringify(o.json); delete o.json; }
    let r;
    try { r = await fetch('/api/' + path, o); } catch (e) { throw new Error('Keine Verbindung zum Server.'); }
    if (r.status === 401) { S.emit('auth'); throw new AuthError(); }
    return r;
  }
  async function apiJson(path, opts) {
    const r = await api(path, opts);
    const d = await r.json().catch(() => ({}));
    if (!r.ok && r.status !== 409) throw new Error(ERR[d.error] || d.error || 'Serverfehler (' + r.status + ')');
    d._status = r.status; return d;
  }
  const enc = encodeURIComponent;
  S.cloudHealth = async () => {
    if (!/^https?:$/.test(location.protocol)) return null;
    try { const r = await fetch('/api/health', { credentials: 'same-origin', cache: 'no-store' }); if (!r.ok) return null; const d = await r.json(); return d && typeof d.cloud === 'boolean' ? d : null; } catch (e) { return null; }
  };
  S.login = async (password) => {
    let r;
    try { r = await fetch('/api/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }); } catch (e) { throw new Error('Keine Verbindung zum Server.'); }
    if (r.status === 401) throw new Error('Das Passwort stimmt nicht.');
    if (!r.ok) throw new Error('Anmeldung nicht möglich (' + r.status + ').');
    localStorage.setItem('ablehnungstool-modus', 'cloud');
    await openCloud();
  };
  S.logout = async () => { try { await fetch('/api/login', { method: 'DELETE', credentials: 'same-origin' }); } catch (e) { /* egal */ } };
  function setCfg(c) {
    const n = upgradeCfg(c);
    if (S.cfg) { Object.keys(S.cfg).forEach((k) => delete S.cfg[k]); Object.assign(S.cfg, n); } else S.cfg = n;
  }
  function applyState(d) {
    S.cloudV = d.v;
    if (d.cfg) setCfg(d.cfg);
    S.abl = new Map((d.abl || []).map((a) => [a.id, a]));
    S.massn = new Map((d.massn || []).map((m) => [m.id, m]));
    S.locks = new Map(Object.entries(d.locks || {}));
  }
  async function cloudSync(force) {
    const d = await apiJson('state' + (force || !S.cloudV ? '' : '?v=' + S.cloudV));
    if (d.unchanged) return false;
    applyState(d); return true;
  }
  async function openCloud() {
    S.mode = 'cloud';
    const d = await apiJson('state');
    applyState(d);
    if (!d.cfg) { S.cfg = null; await S.saveCfg(() => {}); }
    S.lastSync = new Date(); S.syncError = null;
  }

  /* ---------- Datei-Helfer ---------- */
  async function readJson(dir, name) {
    try { const fh = await dir.getFileHandle(name); const f = await fh.getFile(); return { data: JSON.parse(await f.text()), mtime: f.lastModified }; }
    catch (e) { if (e.name === 'NotFoundError') return null; throw e; }
  }
  async function writeFile(dir, name, content) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(content); await w.close();
  }
  const writeJson = (dir, name, obj) => writeFile(dir, name, JSON.stringify(obj, null, 1));
  async function removeEntry(dir, name, recursive) { try { await dir.removeEntry(name, { recursive: !!recursive }); } catch (e) { if (e.name !== 'NotFoundError') throw e; } }
  const safeName = (n) => String(n || 'datei').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);

  /* ---------- lokaler Modus ---------- */
  const LS = 'ablehnungstool-daten';
  function localLoad() {
    let d = null; try { d = JSON.parse(localStorage.getItem(LS)); } catch (e) { d = null; }
    S.cfg = (d && d.cfg) || defaultConfig();
    S.abl = new Map(((d && d.abl) || []).map((a) => [a.id, a]));
    S.massn = new Map(((d && d.massn) || []).map((m) => [m.id, m]));
  }
  function localSave() {
    try { localStorage.setItem(LS, JSON.stringify({ cfg: S.cfg, abl: [...S.abl.values()].map(stripMailFiles), massn: [...S.massn.values()] })); }
    catch (e) { TA.toast('Browser-Speicher ist voll. Bitte einen Datenordner verbinden.', { error: true }); }
  }
  const stripMailFiles = (a) => a;
  const localFiles = new Map();

  /* ---------- Verbinden ---------- */
  S.init = async () => {
    const health = await S.cloudHealth();
    S.cloudAvail = !!(health && health.cloud);
    const pref = localStorage.getItem('ablehnungstool-modus');
    if (pref === 'cloud' && S.cloudAvail) { if (!health.loggedIn) return 'login'; await openCloud(); return 'ready'; }
    if (pref === 'local' || (!S.supportsFs && !S.cloudAvail)) { S.mode = 'local'; localLoad(); return 'ready'; }
    if (S.supportsFs) {
      const h = await idbGet('root');
      if (h) {
        S.root = h;
        const p = await h.queryPermission({ mode: 'readwrite' });
        if (p === 'granted') { await openRoot(); return 'ready'; }
        return 'permission';
      }
    }
    return 'connect';
  };
  S.connect = async () => {
    const h = await window.showDirectoryPicker({ id: 'ablehnungstool', mode: 'readwrite' });
    S.root = h; await idbSet('root', h);
    localStorage.setItem('ablehnungstool-modus', 'fs');
    await openRoot();
  };
  S.regrant = async () => {
    const p = await S.root.requestPermission({ mode: 'readwrite' });
    if (p !== 'granted') throw new Error('Zugriff wurde nicht erlaubt.');
    await openRoot();
  };
  S.useLocal = () => { localStorage.setItem('ablehnungstool-modus', 'local'); S.mode = 'local'; localLoad(); };
  S.resetFolder = async () => { await idbSet('root', null); localStorage.removeItem('ablehnungstool-modus'); };
  S.snapshot = () => ({ cfg: JSON.parse(JSON.stringify(S.cfg)), abl: [...S.abl.values()].map((a) => JSON.parse(JSON.stringify(a))), massn: [...S.massn.values()].map((m) => JSON.parse(JSON.stringify(m))) });
  S.migrateLocal = async (snap) => {
    await S.saveCfg((c) => { Object.keys(snap.cfg).forEach((k) => { if (k !== 'rev') c[k] = snap.cfg[k]; }); });
    for (const a of snap.abl) { a.rev = 0; await S.saveAbl(a, { force: true }); }
    for (const m of snap.massn) await S.saveMassnahme(m);
  };

  async function openRoot() {
    S.mode = 'fs';
    for (const d of DIRS) S.dirs[d] = await S.root.getDirectoryHandle(d, { create: true });
    const c = await readJson(S.root, 'config.json');
    if (c) S.cfg = upgradeCfg(c.data);
    else { S.cfg = defaultConfig(); await writeJson(S.root, 'config.json', S.cfg); }
    await S.sync(true);
  }
  function upgradeCfg(c) {
    const d = defaultConfig();
    c.users = c.users || []; c.hauptkategorien = c.hauptkategorien || d.hauptkategorien; c.fehlerarten = c.fehlerarten || d.fehlerarten;
    c.listen = Object.assign(d.listen, c.listen || {}); c.regeln = Object.assign(d.regeln, c.regeln || {});
    return c;
  }

  /* ---------- Synchronisieren (liest nur geaenderte Dateien) ---------- */
  let syncing = false;
  S.sync = async (force) => {
    if (S.mode === 'cloud') {
      if (syncing) return;
      syncing = true; let changed = false;
      try { changed = await cloudSync(force); S.lastSync = new Date(); S.syncError = null; }
      catch (e) { if (!e.auth) { console.error(e); S.syncError = e.message || String(e); } }
      finally { syncing = false; }
      S.emit(changed ? 'data' : 'sync'); return;
    }
    if (S.mode !== 'fs' || syncing) return;
    syncing = true;
    let changed = false;
    try {
      const c = await readJson(S.root, 'config.json');
      if (c && (force || c.data.rev !== S.cfg.rev)) { S.cfg = upgradeCfg(c.data); changed = true; }
      const seen = new Set();
      const jobs = [];
      for await (const [name, h] of S.dirs.ablehnungen.entries()) {
        if (h.kind !== 'file' || !name.endsWith('.json')) continue;
        const id = name.slice(0, -5); seen.add(id);
        jobs.push((async () => {
          const f = await h.getFile();
          if (!force && S.mt.get(id) === f.lastModified) return;
          try { S.abl.set(id, JSON.parse(await f.text())); S.mt.set(id, f.lastModified); changed = true; } catch (e) { console.warn('Datei defekt', name, e); }
        })());
        if (jobs.length > 24) { await Promise.all(jobs); jobs.length = 0; }
      }
      await Promise.all(jobs);
      [...S.abl.keys()].forEach((id) => { if (!seen.has(id)) { S.abl.delete(id); changed = true; } });
      const ms = new Map();
      for await (const [name, h] of S.dirs.massnahmen.entries()) {
        if (h.kind === 'file' && name.endsWith('.json')) { try { ms.set(name.slice(0, -5), JSON.parse(await (await h.getFile()).text())); } catch (e) { /* defekt */ } }
      }
      if (ms.size !== S.massn.size || [...ms.keys()].some((k) => !S.massn.has(k))) changed = true;
      S.massn = ms;
      const locks = new Map();
      const now = Date.now();
      for await (const [name, h] of S.dirs.sperren.entries()) {
        if (h.kind !== 'file' || !name.endsWith('.json')) continue;
        try { const l = JSON.parse(await (await h.getFile()).text()); if (new Date(l.until).getTime() > now) locks.set(name.slice(0, -5), l); } catch (e) { /* defekt */ }
      }
      if (JSON.stringify([...locks]) !== JSON.stringify([...S.locks])) changed = true;
      S.locks = locks;
      S.lastSync = new Date(); S.syncError = null;
    } catch (e) {
      console.error(e); S.syncError = e.message || String(e);
    } finally { syncing = false; }
    S.emit(changed ? 'data' : 'sync');
  };

  /* ---------- Speichern ---------- */
  class Conflict extends Error { constructor(disk) { super('Konflikt'); this.disk = disk; } }
  S.Conflict = Conflict;

  S.saveAbl = async (a, opts = {}) => {
    a.updatedAt = TA.nowIso();
    if (S.mode === 'local') { a.rev = (a.rev || 0) + 1; S.abl.set(a.id, a); localSave(); S.emit('data'); return a; }
    if (S.mode === 'cloud') {
      const r = await apiJson('doc?kind=abl&id=' + enc(a.id), { method: 'PUT', json: { doc: a, baseRev: a.rev || 0, force: !!opts.force } });
      if (r._status === 409) throw new Conflict(r.current);
      a.rev = r.rev; S.abl.set(a.id, a); S.emit('data'); return a;
    }
    const disk = await readJson(S.dirs.ablehnungen, a.id + '.json');
    if (disk && !opts.force && (disk.data.rev || 0) !== (a.rev || 0)) throw new Conflict(disk.data);
    a.rev = (a.rev || 0) + 1;
    await writeJson(S.dirs.ablehnungen, a.id + '.json', a);
    const f = await (await S.dirs.ablehnungen.getFileHandle(a.id + '.json')).getFile();
    S.mt.set(a.id, f.lastModified); S.abl.set(a.id, a);
    S.emit('data'); return a;
  };
  S.saveMany = async (list) => {
    for (const a of list) {
      if (S.mode === 'cloud') {
        a.updatedAt = a.updatedAt || TA.nowIso();
        const r = await apiJson('doc?kind=abl&id=' + enc(a.id), { method: 'PUT', json: { doc: a, baseRev: a.rev || 0, force: true } });
        a.rev = r.rev; S.abl.set(a.id, a); continue;
      }
      a.rev = (a.rev || 0) + 1; a.updatedAt = a.updatedAt || TA.nowIso();
      if (S.mode === 'fs') await writeJson(S.dirs.ablehnungen, a.id + '.json', a);
      S.abl.set(a.id, a);
    }
    if (S.mode === 'local') localSave(); else await S.sync(false);
    S.emit('data');
  };
  S.deleteAbl = async (id) => {
    if (S.mode === 'fs') { await removeEntry(S.dirs.ablehnungen, id + '.json'); await removeEntry(S.dirs.anhaenge, id, true); await removeEntry(S.dirs.sperren, id + '.json'); }
    if (S.mode === 'cloud') await apiJson('doc?kind=abl&id=' + enc(id), { method: 'DELETE' });
    S.abl.delete(id); if (S.mode === 'local') localSave(); S.emit('data');
  };
  S.saveCfg = async (mutator) => {
    if (S.mode === 'cloud') {
      for (let i = 0; i < 4; i++) {
        if (i > 0) await cloudSync(true);
        const base = S.cfg ? JSON.parse(JSON.stringify(S.cfg)) : defaultConfig();
        mutator(base);
        const r = await apiJson('doc?kind=cfg&id=main', { method: 'PUT', json: { doc: base, baseRev: (S.cfg && S.cfg.rev) || 0 } });
        if (r._status === 409) continue;
        base.rev = r.rev; setCfg(base); S.emit('data'); return;
      }
      throw new Error('Die Einstellungen konnten nicht gespeichert werden, weil jemand gleichzeitig ändert. Bitte erneut versuchen.');
    }
    if (S.mode === 'fs') { const c = await readJson(S.root, 'config.json'); if (c) S.cfg = upgradeCfg(c.data); }
    mutator(S.cfg);
    S.cfg.rev = (S.cfg.rev || 0) + 1;
    if (S.mode === 'fs') await writeJson(S.root, 'config.json', S.cfg); else localSave();
    S.emit('data');
  };
  S.saveMassnahme = async (m) => {
    if (S.mode === 'cloud') await apiJson('doc?kind=massn&id=' + enc(m.id), { method: 'PUT', json: { doc: m, force: true } });
    if (S.mode === 'fs') await writeJson(S.dirs.massnahmen, m.id + '.json', m);
    S.massn.set(m.id, m); if (S.mode === 'local') localSave(); S.emit('data');
  };
  S.deleteMassnahme = async (id) => {
    if (S.mode === 'cloud') await apiJson('doc?kind=massn&id=' + enc(id), { method: 'DELETE' });
    if (S.mode === 'fs') await removeEntry(S.dirs.massnahmen, id + '.json');
    S.massn.delete(id); if (S.mode === 'local') localSave(); S.emit('data');
  };

  /* ---------- Anhaenge (Original-Mail, Korrektur-PDF) ---------- */
  S.saveAttachment = async (ablId, name, blob) => {
    const n = safeName(name);
    if (S.mode === 'cloud') {
      if (blob && blob.size > 4 * 1024 * 1024) throw new Error('Die Datei ist zu gro\u00df (max. 4 MB).');
      const r = await api('file?abl=' + enc(ablId) + '&name=' + enc(n), { method: 'PUT', body: blob, headers: { 'Content-Type': (blob && blob.type) || 'application/octet-stream' } });
      if (!r.ok) throw new Error(r.status === 413 ? 'Die Datei ist zu groß (max. 4 MB).' : 'Die Datei konnte nicht gespeichert werden (' + r.status + ').');
      return n;
    }
    if (S.mode === 'fs') { const d = await S.dirs.anhaenge.getDirectoryHandle(ablId, { create: true }); await writeFile(d, n, blob); }
    else localFiles.set(ablId + '/' + n, blob);
    return n;
  };
  S.getAttachment = async (ablId, name) => {
    if (S.mode === 'cloud') {
      const r = await api('file?abl=' + enc(ablId) + '&name=' + enc(name));
      if (!r.ok) throw new Error('Datei nicht gefunden.');
      const b = await r.blob(); return new File([b], name, { type: b.type });
    }
    if (S.mode === 'fs') { const d = await S.dirs.anhaenge.getDirectoryHandle(ablId); return (await d.getFileHandle(name)).getFile(); }
    const b = localFiles.get(ablId + '/' + name); if (!b) throw new Error('Datei ist nur in der Sitzung verfügbar, in der sie hochgeladen wurde.'); return b;
  };
  S.removeAttachment = async (ablId, name) => {
    if (S.mode === 'cloud') { try { await api('file?abl=' + enc(ablId) + '&name=' + enc(name), { method: 'DELETE' }); } catch (e) { /* weg */ } return; }
    if (S.mode === 'fs') { try { const d = await S.dirs.anhaenge.getDirectoryHandle(ablId); await removeEntry(d, name); } catch (e) { /* weg */ } }
    else localFiles.delete(ablId + '/' + name);
  };

  /* ---------- Sperren ---------- */
  S.lockOf = (id) => { const l = S.locks.get(id); return l && new Date(l.until) > new Date() ? l : null; };
  S.lock = async (id, user) => {
    if (S.mode === 'cloud') {
      const r = await apiJson('lock', { json: { id, userId: user.id, userName: user.name, minutes: LOCK_MIN } });
      if (r.lock) S.locks.set(id, r.lock);
      return r.ok ? { ok: true, lock: r.lock } : { ok: false, lock: r.lock };
    }
    if (S.mode !== 'fs') return { ok: true };
    const cur = await readJson(S.dirs.sperren, id + '.json');
    if (cur && cur.data.userId !== user.id && new Date(cur.data.until) > new Date()) { S.locks.set(id, cur.data); return { ok: false, lock: cur.data }; }
    const l = { userId: user.id, user: user.name, at: TA.nowIso(), until: new Date(Date.now() + LOCK_MIN * 60000).toISOString() };
    await writeJson(S.dirs.sperren, id + '.json', l); S.locks.set(id, l);
    return { ok: true, lock: l };
  };
  S.saveLockForce = async (id, user) => {
    if (S.mode === 'cloud') { const r = await apiJson('lock', { json: { id, userId: user.id, userName: user.name, minutes: LOCK_MIN, force: true } }); if (r.lock) S.locks.set(id, r.lock); return; }
    if (S.mode !== 'fs') return;
    const l = { userId: user.id, user: user.name, at: TA.nowIso(), until: new Date(Date.now() + LOCK_MIN * 60000).toISOString() };
    await writeJson(S.dirs.sperren, id + '.json', l); S.locks.set(id, l);
  };
  S.unlock = async (id, user) => {
    if (S.mode === 'cloud') { try { await apiJson('lock?id=' + enc(id) + '&userId=' + enc(user.id), { method: 'DELETE' }); } catch (e) { /* egal */ } S.locks.delete(id); return; }
    if (S.mode !== 'fs') return;
    const cur = await readJson(S.dirs.sperren, id + '.json');
    if (cur && cur.data.userId === user.id) await removeEntry(S.dirs.sperren, id + '.json');
    S.locks.delete(id);
  };

  /* ---------- Sicherung ---------- */
  S.exportBackup = () => JSON.stringify({ exportiert: TA.nowIso(), cfg: S.cfg, ablehnungen: [...S.abl.values()], massnahmen: [...S.massn.values()] }, null, 1);
  S.importBackup = async (obj) => {
    if (!obj || !obj.cfg || !Array.isArray(obj.ablehnungen)) throw new Error('Keine gültige Sicherung.');
    await S.saveCfg((c) => Object.assign(c, obj.cfg, { rev: c.rev }));
    await S.saveMany(obj.ablehnungen);
    for (const m of obj.massnahmen || []) await S.saveMassnahme(m);
  };

  S.defaultConfig = defaultConfig;
})(window.TA);
