/* Excel-Import der Altdaten: "Ablehnungen NEU 2026.xlsx" und "Ablehnungsuebersicht 2024.xlsm" */
(function (TA) {
  'use strict';
  const S = TA.store, n = TA.norm;
  const X = (TA.importExcel = {});

  const HKMAP = { 'planerischer fehler': 'hk-plan', 'darstellungsfehler': 'hk-darst', 'einreichungsfehler': 'hk-einr', 'einreichungs fehler': 'hk-einr', 'schonheitsfehler': 'hk-schoen', 'externer fehler': 'hk-ext' };
  const hkOf = (s) => { const k = n(s).replace(/\s*\(.*\)$/, ''); return HKMAP[k] || ''; };

  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const cellDate = (v) => {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const m = String(v).match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    return '';
  };
  const str = (v) => (v === null || v === undefined ? '' : String(v)).replace(/\r\n?/g, '\n').trim();
  const rowsOf = (ws) => XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  const findHeader = (rows, pred, max = 30) => { for (let i = 0; i < Math.min(rows.length, max); i++) if (rows[i].some((c) => pred(n(str(c))))) return i; return -1; };
  const colIdx = (head, pred) => head.findIndex((h) => pred(n(str(h))));
  const jaNein = (v) => { const t = n(str(v)); if (!t) return ''; if (/^ja\s*\/\s*nein|teil/.test(t)) return 'teilweise'; if (/^ja/.test(t)) return 'ja'; if (/^nein|^kein/.test(t)) return 'nein'; return ''; };
  const planNorm = (p) => { const t = str(p).toUpperCase().replace(/\s+/g, ''); if (!t) return ''; if (t === 'AS' || t === 'AS-BUILT' || t === 'BP') return 'AS-Built'; return t.replace(/-REV$/i, '-REV'); };

  /* Fehlerart im Katalog suchen oder fuer den Import vormerken */
  function faResolver(cfg) {
    const byName = new Map(cfg.fehlerarten.map((f) => [n(f.name) + '|' + f.hk, f]));
    const byNameOnly = new Map(cfg.fehlerarten.map((f) => [n(f.name), f]));
    const neu = [];
    return {
      neu,
      get(name, hk) {
        const nm = str(name).replace(/\s+/g, ' ');
        if (!nm) return '';
        const hit = byName.get(n(nm) + '|' + hk) || (!hk && byNameOnly.get(n(nm)));
        if (hit) return hit.id;
        const f = { id: TA.uid('fa-'), name: nm, hk: hk || 'hk-plan', aktiv: true, ausImport: true };
        byName.set(n(nm) + '|' + f.hk, f); byNameOnly.set(n(nm), f); neu.push(f);
        return f.id;
      }
    };
  }

  /* ---------- Format 2026: eine Zeile je Ablehnung mit Ablehnungstext ---------- */
  function parse2026(ws, sheetName) {
    const rows = rowsOf(ws);
    const hi = findHeader(rows, (c) => c === 'standort-id');
    if (hi < 0) return null;
    const head = rows[hi];
    const c = {
      st: colIdx(head, (h) => h === 'standort-id'), cl: colIdx(head, (h) => h.startsWith('clusterinfo')), pl: colIdx(head, (h) => h.startsWith('planvariante') || h.startsWith('plantyp')),
      ein: colIdx(head, (h) => h.includes('einreichung')), abl: colIdx(head, (h) => h.includes('datum der ablehnung')), pr: colIdx(head, (h) => h.startsWith('projektnummer')),
      ze: colIdx(head, (h) => h === 'zeichner'), qs: colIdx(head, (h) => h === 'qs'), tx: colIdx(head, (h) => h.startsWith('ablehnungstext')), ko: colIdx(head, (h) => h.startsWith('korrekturdatei')),
      bpl: colIdx(head, (h) => h === 'bemerkung pl'), ve: colIdx(head, (h) => h.includes('verschuldet')), bnv: colIdx(head, (h) => h.includes('nicht-verschuldung')),
      wa: colIdx(head, (h) => h.startsWith('warum')), brm: colIdx(head, (h) => h.startsWith('bemerkung rm')), fm: colIdx(head, (h) => h.startsWith('fehlerminimierung'))
    };
    const g = (r, k) => (c[k] >= 0 ? r[c[k]] : '');
    const items = [];
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i];
      const st = TA.normStandort(str(g(r, 'st'))), text = str(g(r, 'tx'));
      if (!st || !/^[0-9A-Z]{4}-[A-Z]$/.test(st)) continue;
      const datum = cellDate(g(r, 'abl'));
      const d = TA.parser.extract({ subject: '', text, date: '' });
      const ve = jaNein(g(r, 've'));
      const warum = str(g(r, 'wa'));
      const bnv = str(g(r, 'bnv'));
      const a = {
        id: 'x26-' + hash(st + '|' + datum + '|' + text.slice(0, 80)), rev: 0, quelle: 'excel2026', importDatei: sheetName,
        status: d.punkte.length ? 'bewertung' : 'importiert',
        standortId: st, tims: '', standortName: '', projekt: str(g(r, 'pr')).replace(/\s*\n\s*/g, ', '), cluster: str(g(r, 'cl')),
        planvariante: planNorm(g(r, 'pl')), index: d.felder.index || '', datumEinreichung: cellDate(g(r, 'ein')), datumAblehnung: datum,
        prueferTechnik: d.felder.prueferTechnik || '', prueferMinu: d.felder.prueferMinu || '', pruefId: '', minuVorgang: '', planaktivitaet: '', ticket: '',
        zeichner: str(g(r, 'ze')), qs: str(g(r, 'qs')), korrekturdatei: /^ja/i.test(str(g(r, 'ko'))) || !!d.korrekturdatei,
        wiederholung: !!d.wiederholung, vorbehalt: !!d.vorbehalt, hinweise: d.hinweise || [], erkannt: [],
        betreff: '', mailText: text, core: d.core || '',
        punkte: d.punkte.map((p) => ({ anzahl: 1, berechtigt: 'ja', verschuldet: ve === 'nein' ? 'nein' : 'ja', ...p })),
        ursachePlaner: warum, ursacheQS: '', bemerkungPL: [str(g(r, 'bpl')), bnv && 'Nicht verschuldet, weil: ' + bnv].filter(Boolean).join('\n'),
        bemerkungRM: str(g(r, 'brm')), fehlerminimierung: str(g(r, 'fm')),
        dateien: [], verlauf: [{ at: TA.nowIso(), by: 'Import', text: `Aus Excel übernommen (${sheetName}, Zeile ${i + 1})` }],
        createdAt: TA.nowIso(), createdBy: 'Import'
      };
      if (ve === 'teilweise') a.punkte.forEach((p) => { p.verschuldet = 'teilweise'; });
      items.push(a);
    }
    return { format: '2026', items, neuFa: [] };
  }

  /* ---------- Format 2024: Blatt "Ablehnungen" + Blatt "Ablehngründe" + "Kategorieübersicht" ---------- */
  function parse2024(wb, cfg, opts) {
    const find = (re) => wb.SheetNames.find((s) => re.test(n(s)));
    const sA = find(/^ablehnungen$/), sG = find(/^ablehngr/), sK = find(/^kategorie/);
    if (!sA) return null;
    const fa = faResolver(cfg);

    if (sK) {
      const rows = rowsOf(wb.Sheets[sK]);
      const hi = findHeader(rows, (c) => !!hkOf(c));
      if (hi >= 0) {
        const head = rows[hi].map((h) => hkOf(str(h)));
        for (let i = hi + 1; i < rows.length; i++) rows[i].forEach((v, j) => { if (head[j] && str(v) && !/^zu (den|der|dem) /i.test(str(v))) fa.get(v, head[j]); });
      }
    }

    const ra = rowsOf(wb.Sheets[sA]);
    const ha = findHeader(ra, (c) => c === 'pbz nr');
    if (ha < 0) return null;
    const H = ra[ha];
    const c = { nr: colIdx(H, (h) => h === 'pbz nr'), st: colIdx(H, (h) => h === 'standort'), cl: colIdx(H, (h) => h.startsWith('clusterinfo')), pl: colIdx(H, (h) => h === 'plantyp'),
      ze: colIdx(H, (h) => h === 'zeichner'), qs: colIdx(H, (h) => h.startsWith('pbz-planpr')), tmc: colIdx(H, (h) => h.startsWith('tmc-planpr')),
      ko: colIdx(H, (h) => h.startsWith('korrekturdatei')), dt: colIdx(H, (h) => h.startsWith('datum der ablehnung')) };
    const abl = [];
    for (let i = ha + 1; i < ra.length; i++) {
      const r = ra[i]; const st = TA.normStandort(str(r[c.st]));
      if (!st || !str(r[c.nr])) continue;
      const datum = cellDate(r[c.dt]);
      const tmc = str(r[c.tmc]);
      abl.push({
        id: 'x24-' + hash([str(r[c.nr]), st, str(r[c.pl]), str(r[c.ze]), datum, i].join('|')), rev: 0, quelle: 'excel2024', altdaten: true,
        status: 'bewertet', bewertetVon: 'Import', bewertetAm: TA.nowIso(),
        standortId: st, tims: '', standortName: '', projekt: str(r[c.nr]), cluster: str(r[c.cl]), planvariante: planNorm(r[c.pl]), index: '',
        datumEinreichung: '', datumAblehnung: datum, prueferTechnik: /planverwaltung/i.test(tmc) ? '' : tmc, prueferMinu: '', pruefId: '', minuVorgang: '', planaktivitaet: '', ticket: '',
        zeichner: str(r[c.ze]), qs: str(r[c.qs]), korrekturdatei: /^ja/i.test(str(r[c.ko])), wiederholung: false, vorbehalt: false, hinweise: [], erkannt: [],
        betreff: '', mailText: '', core: '', punkte: [], ursachePlaner: '', ursacheQS: '', bemerkungPL: '', bemerkungRM: '', fehlerminimierung: '',
        dateien: [], verlauf: [{ at: TA.nowIso(), by: 'Import', text: `Aus Excel übernommen (${sA}, Zeile ${i + 1})` }], createdAt: TA.nowIso(), createdBy: 'Import',
        _key: str(r[c.nr]) + '|' + st, _key2: str(r[c.nr]) + '|' + st + '|' + planNorm(r[c.pl]) + '|' + n(str(r[c.ze]))
      });
    }

    let ohneZuordnung = 0;
    if (sG) {
      const rg = rowsOf(wb.Sheets[sG]);
      const hg = findHeader(rg, (x) => x === 'fehler');
      if (hg >= 0) {
        const G = rg[hg];
        const g = { fe: colIdx(G, (h) => h === 'fehler'), an: colIdx(G, (h) => h === 'anzahl'), ka: colIdx(G, (h) => h === 'kategorie'), be: colIdx(G, (h) => h === 'berechtigt'),
          nr: colIdx(G, (h) => h.startsWith('pbz nr')), st: colIdx(G, (h) => h === 'standort'), ze: colIdx(G, (h) => h === 'zeichner'), pl: colIdx(G, (h) => h === 'plantyp') };
        /* Bloecke: aufeinanderfolgende Zeilen mit gleichem Schluessel gehoeren zu einer Ablehnung */
        const used = new Map();
        let lastKey = null, target = null;
        for (let i = hg + 1; i < rg.length; i++) {
          const r = rg[i]; const fe = str(r[g.fe]);
          if (!fe) continue;
          const st = TA.normStandort(str(r[g.st])), nr = str(r[g.nr]);
          const k2 = nr + '|' + st + '|' + planNorm(r[g.pl]) + '|' + n(str(r[g.ze]));
          if (k2 !== lastKey) {
            lastKey = k2;
            let cands = abl.filter((a) => a._key2 === k2);
            if (!cands.length) cands = abl.filter((a) => a._key === nr + '|' + st);
            const u = used.get(k2) || 0;
            target = cands.length ? cands[Math.min(u, cands.length - 1)] : null;
            used.set(k2, u + 1);
          }
          if (!target) { ohneZuordnung++; continue; }
          const hk = hkOf(str(r[g.ka]));
          const be = n(str(r[g.be]));
          target.punkte.push({
            id: TA.uid('p-'), quelle: 'import', text: fe, hk, fehlerart: fa.get(fe, hk), anzahl: Math.max(1, parseInt(r[g.an], 10) || 1),
            berechtigt: be === 'nein' ? 'nein' : 'ja', verschuldet: hk === 'hk-ext' || be === 'nein' ? 'nein' : (opts.verschuldetStandard || 'ja'), schwere: ''
          });
        }
      }
    }
    abl.forEach((a) => { delete a._key; delete a._key2; if (a.punkte.length && !a.zeichner) a.status = 'bewertung'; });
    return { format: '2024', items: abl, neuFa: fa.neu, ohneZuordnung };
  }

  X.analyse = async (file, opts = {}) => {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
    const cfg = S.cfg;
    let res = parse2024(wb, cfg, opts);
    if (!res) for (const sn of wb.SheetNames) { res = parse2026(wb.Sheets[sn], file.name); if (res && res.items.length) break; }
    if (!res || !res.items.length) throw new Error('In der Datei wurde keine bekannte Tabellenstruktur gefunden (Spalten "Standort-ID" + "Ablehnungstext" oder Blatt "Ablehnungen" mit "pbz Nr").');
    const vorhanden = res.items.filter((a) => S.abl.has(a.id)).length;
    res.items = res.items.filter((a) => !S.abl.has(a.id));
    res.vorhanden = vorhanden;
    res.punkte = res.items.reduce((s, a) => s + a.punkte.length, 0);
    res.zeichner = TA.uniq(res.items.map((a) => a.zeichner));
    res.qs = TA.uniq(res.items.map((a) => a.qs));
    res.cluster = TA.uniq(res.items.map((a) => a.cluster));
    res.plan = TA.uniq(res.items.map((a) => a.planvariante));
    res.von = res.items.map((a) => a.datumAblehnung).filter(Boolean).sort()[0] || '';
    res.bis = res.items.map((a) => a.datumAblehnung).filter(Boolean).sort().pop() || '';
    return res;
  };

  X.apply = async (res) => {
    if (res.neuFa.length || res.zeichner.length || res.qs.length || res.cluster.length || res.plan.length) {
      await S.saveCfg((c) => {
        const have = new Set(c.fehlerarten.map((f) => f.id));
        res.neuFa.forEach((f) => { if (!have.has(f.id)) c.fehlerarten.push(f); });
        const add = (k, vals) => { c.listen[k] = TA.sortDe(TA.uniq([...(c.listen[k] || []), ...vals])); };
        add('zeichner', res.zeichner); add('qs', res.qs); add('cluster', res.cluster); add('planvariante', res.plan);
      });
    }
    await S.saveMany(res.items);
    return res.items.length;
  };
})(window.TA);
