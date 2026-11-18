/* Auswertung und Empfehlungen (nur bewertete Ablehnungen) */
(function (TA) {
  'use strict';
  const A = (TA.analysis = {});

  A.hkName = (id) => { const h = TA.store.cfg.hauptkategorien.find((x) => x.id === id); return h ? h.name : (id ? 'Unbekannt' : ''); };
  A.faName = (id) => { const f = TA.store.cfg.fehlerarten.find((x) => x.id === id); return f ? f.name : ''; };
  A.faById = (id) => TA.store.cfg.fehlerarten.find((x) => x.id === id);

  A.isZaehlbar = (p) => p.berechtigt !== 'nein' && p.verschuldet !== 'nein';

  A.dauer = null;
  A.ablehnungen = (f = {}) => [...TA.store.abl.values()].filter((a) => {
    if (A.dauer && !A.dauer(a)) return false;
    if (f.status && a.status !== f.status) return false;
    if (f.von && (a.datumAblehnung || '') < f.von) return false;
    if (f.bis && (a.datumAblehnung || '') > f.bis) return false;
    if (f.zeichner && a.zeichner !== f.zeichner) return false;
    if (f.qs && a.qs !== f.qs) return false;
    if (f.cluster && a.cluster !== f.cluster) return false;
    if (f.plan && a.planvariante !== f.plan) return false;
    return true;
  });

  /* Eine Zeile je Fehlerpunkt, gewichtet mit Anzahl */
  A.rows = (f = {}) => {
    const out = [];
    A.ablehnungen({ ...f, status: 'bewertet' }).forEach((a) => (a.punkte || []).forEach((p) => {
      if (!f.mitUnberechtigt && p.berechtigt === 'nein') return;
      if (f.nurVerschuldet && p.verschuldet === 'nein') return;
      if (f.hk && p.hk !== f.hk) return;
      if (f.fa && p.fehlerart !== f.fa) return;
      out.push({ a, p, _w: Math.max(1, +p.anzahl || 1), datum: a.datumAblehnung, zeichner: a.zeichner, qs: a.qs, hk: p.hk, fa: p.fehlerart });
    }));
    return out;
  };
  A.sum = (rows) => rows.reduce((s, r) => s + r._w, 0);

  A.kpis = (f) => {
    const abl = A.ablehnungen({ ...f, status: 'bewertet' });
    const all = A.rows({ ...f, mitUnberechtigt: true });
    const rows = all.filter((r) => r.p.berechtigt !== 'nein');
    const fehler = A.sum(rows);
    const versch = A.sum(rows.filter((r) => r.p.verschuldet === 'ja')) + 0.5 * A.sum(rows.filter((r) => r.p.verschuldet === 'teilweise'));
    const unber = A.sum(all.filter((r) => r.p.berechtigt === 'nein'));
    const standorte = TA.groupCount(abl, (a) => a.standortId);
    const wdh = [...standorte.values()].filter((n) => n > 1).reduce((s, n) => s + n - 1, 0);
    return {
      ablehnungen: abl.length, fehler, jeAbl: abl.length ? fehler / abl.length : null,
      verschuldet: fehler ? versch / fehler : null, unberechtigt: A.sum(all) ? unber / A.sum(all) : null,
      wiederholungen: wdh, major: A.sum(rows.filter((r) => r.p.schwere === 'major'))
    };
  };

  A.top = (rows, keyFn, n) => [...TA.groupCount(rows, keyFn)].sort((a, b) => b[1] - a[1]).slice(0, n || 999);

  A.monthly = (f, monate = 12) => {
    const end = f.bis || TA.isoToday();
    const keys = [];
    const d = new Date(end.slice(0, 7) + '-01');
    for (let i = monate - 1; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); keys.push(x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0')); }
    const abl = TA.groupCount(A.ablehnungen({ ...f, status: 'bewertet', von: keys[0] + '-01' }), (a) => TA.monthKey(a.datumAblehnung));
    return keys.map((k) => ({ key: k, label: TA.monthLabel(k), n: abl.get(k) || 0 }));
  };

  A.heat = (rows, by) => {
    const hks = TA.store.cfg.hauptkategorien.filter((h) => h.aktiv !== false);
    const people = A.top(rows, (r) => r[by]).map((x) => x[0]);
    const m = new Map();
    rows.forEach((r) => { if (!r[by]) return; const k = r[by] + '|' + r.hk; m.set(k, (m.get(k) || 0) + r._w); });
    let max = 0; m.forEach((v) => { if (v > max) max = v; });
    return { hks, people, get: (p, h) => m.get(p + '|' + h) || 0, max };
  };
  A.level = (v, max) => { if (!v) return 0; if (!max) return 1; const r = v / max; return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1; };

  /* ---------- Empfehlungen ---------- */
  const lastMassnahme = (typ, pred) => {
    let best = null;
    TA.store.massn.forEach((m) => { if ((!typ || m.typ === typ) && pred(m) && (!best || m.datum > best.datum)) best = m; });
    return best;
  };

  A.empfehlungen = () => {
    const R = TA.store.cfg.regeln;
    const heute = TA.isoToday();
    const out = [];
    const zaehl = (tage) => A.rows({ von: TA.addDays(heute, -tage) }).filter((r) => A.isZaehlbar(r.p));

    if (R.gespraech.aktiv) {
      const rows = zaehl(R.gespraech.tage);
      const m = new Map();
      rows.forEach((r) => {
        if (!r.zeichner || !r.fa) return;
        const lm = lastMassnahme('gespraech', (x) => x.betrifft === r.zeichner && (!x.fehlerart || x.fehlerart === r.fa));
        if (lm && r.datum <= lm.datum) return;
        const k = r.zeichner + '|' + r.fa;
        const e = m.get(k) || { zeichner: r.zeichner, fa: r.fa, hk: r.hk, n: 0, abl: new Set(), qs: 0 };
        e.n += r._w; e.abl.add(r.a.id); if (r.a.qs && !/nicht/i.test(r.a.qs)) e.qs += r._w;
        m.set(k, e);
      });
      m.forEach((e) => {
        if (e.n < R.gespraech.anzahl) return;
        const lm = lastMassnahme('gespraech', (x) => x.betrifft === e.zeichner);
        out.push({
          id: 'g|' + e.zeichner + '|' + e.fa, typ: 'gespraech', prio: e.n >= R.gespraech.anzahl * 2 ? 3 : 2,
          titel: `Qualitätsgespräch mit ${e.zeichner} führen`,
          grund: `„${A.faName(e.fa)}“ ${e.n}× in den letzten ${R.gespraech.tage} Tagen (Schwelle ${R.gespraech.anzahl}), in ${e.abl.size} Ablehnung${e.abl.size === 1 ? '' : 'en'}.` +
            (e.qs ? ` ${e.qs}× trotz QS durchgegangen.` : '') + (lm ? ` Letztes Gespräch: ${TA.fmtDate(lm.datum)}.` : ' Bisher kein Gespräch dokumentiert.'),
          vorschlag: `Fehlerart „${A.faName(e.fa)}“ als festen Punkt der Selbstkontrolle vor der Einreichung aufnehmen und an einem Beispiel durchgehen.`,
          betrifft: e.zeichner, hk: e.hk, fehlerart: e.fa, abl: [...e.abl]
        });
      });
    }

    if (R.qs.aktiv) {
      const rows = zaehl(R.qs.tage).filter((r) => r.qs && !/nicht/i.test(r.qs));
      const m = new Map();
      rows.forEach((r) => {
        const lm = lastMassnahme('qs', (x) => x.betrifft === r.qs && (!x.hk || x.hk === r.hk));
        if (lm && r.datum <= lm.datum) return;
        const k = r.qs + '|' + r.hk;
        const e = m.get(k) || { qs: r.qs, hk: r.hk, n: 0, abl: new Set() };
        e.n += r._w; e.abl.add(r.a.id); m.set(k, e);
      });
      const proQs = new Map();
      m.forEach((e) => { if (e.n >= R.qs.anzahl) { if (!proQs.has(e.qs)) proQs.set(e.qs, []); proQs.get(e.qs).push(e); } });
      proQs.forEach((list, qs) => {
        list.sort((x, y) => y.n - x.n);
        const abl = new Set(); list.forEach((e) => e.abl.forEach((id) => abl.add(id)));
        out.push({
          id: 'q|' + qs, typ: 'qs', prio: list.length > 1 ? 1 : 2,
          titel: `QS-Checkliste mit ${qs} schärfen`,
          grund: `In den letzten ${R.qs.tage} Tagen trotz QS bis zum TMC gekommen: ${list.map((e) => `${e.n}× „${A.hkName(e.hk)}“`).join(', ')} (Schwelle ${R.qs.anzahl} je Kategorie).`,
          vorschlag: `Prüfpunkte zu ${list.map((e) => '„' + A.hkName(e.hk) + '“').join(' und ')} in der QS-Checkliste ergänzen oder schärfen.`,
          betrifft: qs, hk: list.length === 1 ? list[0].hk : '', abl: [...abl]
        });
      });
    }

    if (R.schulung.aktiv) {
      const rows = zaehl(R.schulung.tage);
      const m = new Map();
      rows.forEach((r) => {
        if (!r.hk || !r.zeichner) return;
        const lm = lastMassnahme('schulung', (x) => !x.hk || x.hk === r.hk);
        if (lm && r.datum <= lm.datum) return;
        const e = m.get(r.hk) || { hk: r.hk, z: new Set(), n: 0, abl: new Set() };
        e.z.add(r.zeichner); e.n += r._w; e.abl.add(r.a.id); m.set(r.hk, e);
      });
      m.forEach((e) => {
        if (e.z.size < R.schulung.zeichner) return;
        const lm = lastMassnahme('schulung', (x) => x.hk === e.hk);
        const topFa = A.top(rows.filter((r) => r.hk === e.hk), (r) => r.fa, 3).map((x) => A.faName(x[0])).filter(Boolean);
        out.push({
          id: 's|' + e.hk, typ: 'schulung', prio: e.z.size >= R.schulung.zeichner + 2 ? 3 : 2,
          titel: `Teamschulung „${A.hkName(e.hk)}“ ansetzen`,
          grund: `${e.n} Fehler bei ${e.z.size} Zeichnern in den letzten ${R.schulung.tage} Tagen (Schwelle ${R.schulung.zeichner} Zeichner).` + (lm ? ` Letzte Schulung zum Thema: ${TA.fmtDate(lm.datum)}.` : ''),
          vorschlag: topFa.length ? `Schwerpunkte: ${topFa.join(', ')}.` : '',
          betrifft: 'Team', hk: e.hk, abl: [...e.abl]
        });
      });
    }

    if (R.auffrischen.aktiv) {
      const seen = new Set();
      [...TA.store.massn.values()].filter((m) => m.typ === 'schulung' && m.hk).sort((a, b) => b.datum.localeCompare(a.datum)).forEach((m) => {
        if (seen.has(m.hk)) return; seen.add(m.hk);
        const alt = TA.daysBetween(m.datum, heute);
        if (alt < R.auffrischen.tage) return;
        const seit = A.rows({ von: m.datum, hk: m.hk }).filter((r) => A.isZaehlbar(r.p));
        if (!A.sum(seit)) return;
        if (out.some((x) => x.id === 's|' + m.hk)) return;
        out.push({
          id: 'a|' + m.hk, typ: 'schulung', prio: 1,
          titel: `Schulung „${A.hkName(m.hk)}“ auffrischen`,
          grund: `Letzte Schulung am ${TA.fmtDate(m.datum)} (vor ${alt} Tagen); seitdem ${A.sum(seit)} Fehler dieser Kategorie.`,
          vorschlag: 'Kurze Auffrischung im Teammeeting, 15 Minuten reichen.', betrifft: 'Team', hk: m.hk, abl: TA.uniq(seit.map((r) => r.a.id))
        });
      });
    }

    if (R.wiederholung.aktiv) {
      const von = TA.addDays(heute, -R.wiederholung.tage);
      const m = new Map();
      [...TA.store.abl.values()].filter((a) => (a.datumAblehnung || '') >= von && a.standortId).forEach((a) => {
        const e = m.get(a.standortId) || { st: a.standortId, abl: [] }; e.abl.push(a); m.set(a.standortId, e);
      });
      m.forEach((e) => {
        if (e.abl.length < R.wiederholung.anzahl) return;
        const lm = lastMassnahme('prozess', (x) => x.betrifft === e.st);
        if (lm && e.abl.every((a) => a.datumAblehnung <= lm.datum)) return;
        const offen = e.abl.filter((a) => a.wiederholung).length;
        out.push({
          id: 'w|' + e.st, typ: 'prozess', prio: e.abl.length >= R.wiederholung.anzahl + 2 ? 3 : 1,
          titel: `Standort ${e.st}: offene Korrekturen vor der Wiedereinreichung abhaken`,
          grund: `${e.abl.length} Ablehnungen in den letzten ${R.wiederholung.tage} Tagen` + (offen ? `, davon ${offen} mit „Korrektur nicht umgesetzt“ / erneuter Ablehnung.` : '.'),
          vorschlag: 'Vor der nächsten Einreichung alle Punkte der letzten Ablehnungen gemeinsam mit der Projektleitung abhaken.',
          betrifft: e.st, abl: e.abl.map((a) => a.id)
        });
      });
    }

    (R.eigene || []).filter((r) => r.aktiv !== false).forEach((r) => {
      const flt = { von: TA.addDays(heute, -r.tage) };
      if (r.cluster) flt.cluster = r.cluster;
      if (r.zeichner) flt.zeichner = r.zeichner;
      let rows = A.rows(flt).filter((x) => A.isZaehlbar(x.p));
      if (r.hk) rows = rows.filter((x) => x.hk === r.hk);
      if (r.fehlerart) rows = rows.filter((x) => x.fa === r.fehlerart);
      const keyOf = r.gruppe === 'zeichner' ? (x) => x.zeichner : r.gruppe === 'standort' ? (x) => x.a.standortId : r.gruppe === 'qs' ? (x) => (x.qs && !/nicht/i.test(x.qs) ? x.qs : '') : () => 'Team';
      const m = new Map();
      rows.forEach((x) => {
        const g = keyOf(x); if (!g) return;
        const lm = lastMassnahme(null, (mm) => mm.regel === r.id && mm.betrifft === g);
        if (lm && x.datum <= lm.datum) return;
        const e = m.get(g) || { g, n: 0, abl: new Set() };
        e.n += x._w; e.abl.add(x.a.id); m.set(g, e);
      });
      m.forEach((e) => {
        if (e.n < r.anzahl) return;
        out.push({
          id: 'x|' + r.id + '|' + e.g, typ: r.massnahme || 'gespraech', prio: e.n >= r.anzahl * 2 ? 3 : 2, regel: r.id,
          titel: (r.titel || 'Eigene Regel') + (r.gruppe && r.gruppe !== 'team' ? ': ' + e.g : ''),
          grund: `${e.n}× in den letzten ${r.tage} Tagen (Schwelle ${r.anzahl})${r.hk ? ' · ' + A.hkName(r.hk) : ''}${r.fehlerart ? ' · ' + A.faName(r.fehlerart) : ''}${r.cluster ? ' · ' + r.cluster : ''}.`,
          vorschlag: r.vorschlag || '', betrifft: e.g, hk: r.hk || '', fehlerart: r.fehlerart || '', abl: [...e.abl]
        });
      });
    });

    const hidden = JSON.parse(localStorage.getItem('ablehnungstool-ausgeblendet') || '{}');
    return out.filter((e) => !(hidden[e.id] && hidden[e.id] > heute)).sort((a, b) => b.prio - a.prio);
  };
  A.ausblenden = (id, tage) => {
    const h = JSON.parse(localStorage.getItem('ablehnungstool-ausgeblendet') || '{}');
    h[id] = TA.addDays(TA.isoToday(), tage); localStorage.setItem('ablehnungstool-ausgeblendet', JSON.stringify(h));
  };

  /* Vorschlaege fuer die Fehlerart: eigene Historie (Haeufigkeit), optional je Hauptkategorie */
  A.faHaeufigkeit = () => {
    const m = new Map();
    TA.store.abl.forEach((a) => (a.punkte || []).forEach((p) => { if (p.fehlerart) m.set(p.fehlerart, (m.get(p.fehlerart) || 0) + 1); }));
    return m;
  };

  /* Vorbelegung aus der letzten Ablehnung am gleichen Standort */
  A.vorgaenger = (standortId, exceptId) => {
    if (!standortId) return null;
    return [...TA.store.abl.values()].filter((a) => a.standortId === standortId && a.id !== exceptId)
      .sort((a, b) => (b.datumAblehnung || '').localeCompare(a.datumAblehnung || ''))[0] || null;
  };

  /* Was fehlt noch, bevor eine Bewertung abgeschlossen werden kann? */
  A.fehlt = (a) => {
    const out = [];
    if (!a.standortId) out.push({ text: 'Standort-ID', field: 'standortId' });
    if (!a.projekt) out.push({ text: 'Projektnummer', field: 'projekt' });
    if (!a.zeichner) out.push({ text: 'Zeichner', field: 'zeichner' });
    const pts = a.punkte || [];
    if (!pts.length) out.push({ text: 'mindestens ein Fehlerpunkt', field: null });
    pts.forEach((p, i) => {
      const f = [];
      if (!p.hk) f.push('Hauptkategorie');
      if (!p.fehlerart) f.push('Fehlerart');
      if (!p.verschuldet) f.push('Verschuldet');
      if (f.length) out.push({ text: `Punkt ${i + 1}: ${f.join(', ')}`, point: p.id });
    });
    return out;
  };

  A.status = (a) => {
    const pts = a.punkte || [];
    const fertig = pts.filter((p) => p.hk && p.fehlerart && p.verschuldet).length;
    return { gesamt: pts.length, fertig, offen: pts.length - fertig, komplett: pts.length > 0 && fertig === pts.length && !!a.zeichner };
  };
})(window.TA);
