/* Import: .eml, .msg, .pdf, eingefuegter Text  ->  Entwurf einer Ablehnung mit Fehlerpunkten */
(function (TA) {
  'use strict';
  const P = (TA.parser = {});

  /* ================= Bytes / Zeichensaetze ================= */
  const bin = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return s; };
  const fromBin = (s) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
  function decode(u8, cs) {
    cs = (cs || 'utf-8').toLowerCase().replace(/^"|"$/g, '');
    if (cs === 'us-ascii' || cs === 'ascii') cs = 'utf-8';
    try { return new TextDecoder(cs, { fatal: cs === 'utf-8' }).decode(u8); }
    catch (e) { try { return new TextDecoder('windows-1252').decode(u8); } catch (e2) { return bin(u8); } }
  }
  const b64 = (s) => { try { return fromBin(atob(s.replace(/[^A-Za-z0-9+/=]/g, ''))); } catch (e) { return new Uint8Array(); } };
  const qp = (s) => fromBin(s.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))));

  function mimeWords(s) {
    return (s || '').replace(/\?=\s+=\?/g, '?==?').replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (m, cs, enc, txt) => {
      const bytes = enc.toUpperCase() === 'B' ? b64(txt) : qp(txt.replace(/_/g, ' '));
      return decode(bytes, cs);
    });
  }
  function headers(block) {
    const h = {};
    block.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach((line) => {
      const i = line.indexOf(':'); if (i < 1) return;
      const k = line.slice(0, i).trim().toLowerCase(); const v = line.slice(i + 1).trim();
      if (!(k in h)) h[k] = v;
    });
    return h;
  }
  const param = (v, name) => { const m = (v || '').match(new RegExp(name + '\\*?=\\s*(?:"([^"]*)"|([^;\\s]*))', 'i')); return m ? mimeWords(m[1] !== undefined ? m[1] : m[2]) : ''; };

  /* ================= HTML -> Text ================= */
  P.htmlToText = (html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('style,script,head,title').forEach((n) => n.remove());
    const out = [];
    const BLOCK = /^(P|DIV|BR|LI|TR|H[1-6]|TABLE|UL|OL|BLOCKQUOTE|SECTION|ARTICLE|HEADER|FOOTER)$/;
    (function walk(n) {
      n.childNodes.forEach((c) => {
        if (c.nodeType === 3) out.push(c.nodeValue.replace(/\s+/g, ' '));
        else if (c.nodeType === 1) {
          if (c.tagName === 'BR') { out.push('\n'); return; }
          const blk = BLOCK.test(c.tagName);
          if (blk) out.push('\n');
          if (c.tagName === 'LI') out.push('- ');
          if (c.tagName === 'TD' || c.tagName === 'TH') out.push(' ');
          walk(c);
          if (blk) out.push('\n');
        }
      });
    })(doc.body || doc);
    return out.join('').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  };

  /* ================= EML ================= */
  function entity(raw, acc) {
    const sep = raw.search(/\r?\n\r?\n/);
    const hb = sep < 0 ? raw : raw.slice(0, sep);
    const body = sep < 0 ? '' : raw.slice(sep).replace(/^\r?\n\r?\n/, '');
    const h = headers(hb);
    const ct = h['content-type'] || 'text/plain';
    const type = ct.split(';')[0].trim().toLowerCase();
    if (type.startsWith('multipart/')) {
      const bd = param(ct, 'boundary'); if (!bd) return h;
      const parts = body.split(new RegExp('\\r?\\n?--' + bd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:--)?[ \\t]*\\r?\\n?'));
      parts.forEach((p) => { if (p.trim() && p.trim() !== '--') entity(p, acc); });
      return h;
    }
    const enc = (h['content-transfer-encoding'] || '').toLowerCase();
    const bytes = enc === 'base64' ? b64(body) : enc === 'quoted-printable' ? qp(body) : fromBin(body);
    const disp = (h['content-disposition'] || '').toLowerCase();
    const fname = param(h['content-disposition'], 'filename') || param(ct, 'name');
    if (type === 'message/rfc822') { const inner = P.parseEml(bytes); acc.text.push(inner.text); return h; }
    if (!disp.startsWith('attachment') && (type === 'text/plain' || type === 'text/html') && !(fname && disp.startsWith('attachment'))) {
      const txt = decode(bytes, param(ct, 'charset'));
      if (type === 'text/plain') acc.text.push(txt); else acc.html.push(txt);
    } else if (fname || disp.startsWith('attachment')) {
      acc.files.push({ name: fname || 'anhang', type, data: bytes });
    }
    return h;
  }
  P.parseEml = (u8) => {
    const raw = bin(u8);
    const looksMime = /^(?:[\w-]+:.*\r?\n)+/m.test(raw.slice(0, 4000)) && /\n(content-type|mime-version|received|message-id):/i.test('\n' + raw.slice(0, 8000));
    if (!looksMime) return P.parsePlain(decode(u8, 'utf-8'));
    const acc = { text: [], html: [], files: [] };
    const h = entity(raw, acc);
    let text = acc.text.join('\n\n').trim();
    if ((!text || text.length < 40) && acc.html.length) text = P.htmlToText(acc.html.join('\n'));
    return {
      subject: mimeWords(h.subject || ''), from: mimeWords(h.from || ''), date: h.date ? new Date(h.date).toISOString() : '',
      text, files: acc.files.filter((f) => !/^image\//.test(f.type))
    };
  };

  /* Text, wie ihn Outlook/Programme beim Kopieren liefern: "Von: ... Betreff: ..." */
  P.parsePlain = (text) => {
    text = (text || '').replace(/\r\n/g, '\n');
    const get = (re) => { const m = text.match(re); return m ? m[1].trim() : ''; };
    const subject = get(/^(?:Betreff|Subject):\s*(.+)$/im);
    const dateRaw = get(/^(?:Datum|Gesendet|Date|Sent):\s*(.+)$/im);
    let date = '';
    if (dateRaw) {
      const d = new Date(dateRaw); if (!isNaN(d)) date = d.toISOString();
      else { const iso = TA.parseDate((dateRaw.match(/\d{1,2}\.\d{1,2}\.\d{2,4}/) || [''])[0]); if (iso) date = iso + 'T12:00:00Z'; }
    }
    return { subject, from: get(/^(?:Von|From):\s*(.+)$/im), date, text, files: [] };
  };

  /* ================= MSG (Outlook) ueber SheetJS-CFB ================= */
  P.parseMsg = (u8) => {
    if (!window.XLSX || !XLSX.CFB) throw new Error('MSG-Leser nicht geladen.');
    const cfb = XLSX.CFB.read(u8, { type: 'array' });
    const top = {}; const att = {};
    cfb.FullPaths.forEach((p, i) => {
      const parts = p.split('/').filter(Boolean);
      const e = cfb.FileIndex[i]; if (!e || !e.content) return;
      const n = parts[parts.length - 1];
      if (parts.length === 2) top[n] = e.content;
      else if (parts.length === 3 && /^__attach_version1\.0_/i.test(parts[1])) { (att[parts[1]] = att[parts[1]] || {})[n] = e.content; }
    });
    const prop = (map, tag) => {
      const u = map['__substg1.0_' + tag + '001F']; if (u) return new TextDecoder('utf-16le').decode(new Uint8Array(u)).replace(/\u0000+$/, '');
      const a = map['__substg1.0_' + tag + '001E']; if (a) return new TextDecoder('windows-1252').decode(new Uint8Array(a)).replace(/\u0000+$/, '');
      return '';
    };
    const subject = prop(top, '0037');
    let text = prop(top, '1000');
    if (!text || text.length < 40) {
      const hb = top['__substg1.0_10130102']; const hs = prop(top, '1013');
      const html = hb ? decode(new Uint8Array(hb), 'utf-8') : hs;
      if (html) text = P.htmlToText(html);
    }
    const th = prop(top, '007D');
    const dm = th.match(/^Date:\s*(.+)$/im);
    let date = dm ? new Date(dm[1]).toISOString() : '';
    const files = Object.values(att).map((m) => {
      const data = m['__substg1.0_37010102'];
      return data ? { name: prop(m, '3707') || prop(m, '3704') || 'anhang', type: prop(m, '370E') || '', data: new Uint8Array(data) } : null;
    }).filter((f) => f && !/^image\//.test(f.type) && !/\.(png|jpe?g|gif)$/i.test(f.name));
    if (!text) throw new Error('In der .msg-Datei wurde kein lesbarer Text gefunden. Bitte den Mailtext kopieren und einfügen.');
    return { subject, from: prop(top, '0C1A'), date, text, files };
  };

  /* ================= PDF (Text + Kommentare) ================= */
  P.parsePdf = async (u8) => {
    if (!window.pdfjsLib) throw new Error('PDF-Leser nicht geladen.');
    const doc = await pdfjsLib.getDocument({ data: u8, isEvalSupported: false }).promise;
    const pages = []; const notes = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      pages.push(tc.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' ').trim());
      const an = await page.getAnnotations();
      an.forEach((a) => {
        const t = (a.contentsObj && a.contentsObj.str) || a.contents || (a.richText && a.richText.str) || '';
        if (t && t.trim() && !['Link', 'Widget', 'Popup'].includes(a.subtype)) notes.push({ page: i, text: t.trim(), author: (a.titleObj && a.titleObj.str) || '' });
      });
    }
    return { text: pages.join('\n\n'), pages, notes };
  };

  /* ================= Ablehnungsmail auswerten ================= */
  const ABBR = /(?:^|\s)(lt|ggf|bzw|z\.\s?b|u\.\s?a|ua|inkl|bsp|ca|nr|max|min|mind|opt|pkt|evtl|vgl|bspw|usw|etc|sog|lfd|abs|allg|ehem|gem|zzgl|o\.\s?ä|i\.\s?d\.\s?r|d\.\s?h|mech|elektr|ca)\.$/i;
  const BOILER = [
    /^(erneute\s+)?ablehnung\s*[!:.]*$/i,
    /^bei fragen zur ablehnung bitte an die mitnutzung wenden/i,
    /^_{3,}$/, /^-{3,}$/,
    /^bemerkungen des pr(ü|ue)fers/i,
    /^ablehnung\s*!?\s*$/i
  ];
  const STATUS_RE = /^\s*(?:\d{1,2}\.\d{1,2}\.\d{2,4}\s*[-–]?\s*)?(?:nachtrag\s+[\d.]+\s*[-–]\s*)?(?:erneute\s+)?(ablehnung!?|freigabe unter vorbe?halt(?:\s+(?:AP|EP))?|freigabe mit auflagen?|auflage zur n(?:ä|ae)chsten planbearbeitung|bei der n(?:ä|ae)chsten planbearbeitung beachten|offene korrekturen?)((?:\s+(?:der\s+)?(?:AP|EP|BP|AS-Built|Bestandsplan|Ausf\S*plan|Entwurfsplan)(?:\s*\/\s*(?:AP|EP))?(?:\s+Index\s+[A-Z0-9]+)?)?(?:\s*[-–]\s*(?:bei der n(?:ä|ae)chsten planbearbeitung beachten|korrekturen wurden nicht umgesetzt|wegen offenen korrekturen))?)\s*[:!.]?\s*/i;
  const nameFix = (n) => { const m = (n || '').trim().match(/^([^,]+),\s*([^,]+)$/); return m ? `${m[2].trim()} ${m[1].trim()}` : (n || '').trim(); };

  function splitSentences(s) {
    const out = []; let cur = '';
    const re = /([.!?])(\s+)(?=[A-ZÄÖÜ0-9„"(])/g;
    let last = 0; let m;
    while ((m = re.exec(s))) {
      const piece = s.slice(last, m.index + 1);
      cur += piece;
      if (!ABBR.test(cur.trim()) && !/\d\.$/.test(cur.trim()) && cur.trim().length > 12) { out.push(cur.trim()); cur = ''; }
      last = m.index + 1 + m[2].length;
    }
    cur += s.slice(last); if (cur.trim()) out.push(cur.trim());
    return out;
  }

  P.splitPoints = (s) => {
    s = (s || '').replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
    s = s.split('\n').filter((l) => !BOILER.some((re) => re.test(l.trim()))).join('\n');
    s = s.replace(/\s\.(?=[A-ZÄÖÜ])/g, '. ').replace(/([a-zäöüß)])\.(?=[A-ZÄÖÜ][a-zäöü])/g, '$1. ').trim();
    if (!s) return [];
    let items = [];
    const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
    const bullet = /^([-–•*·]|\d{1,2}[.)]|[a-z][)])\s+/;
    const bulletLines = lines.filter((l) => bullet.test(l)).length;
    if (bulletLines >= 2 || (bulletLines >= 1 && lines.length >= 2)) {
      let cur = null;
      lines.forEach((l) => {
        if (bullet.test(l)) { if (cur !== null) items.push(cur); cur = l.replace(bullet, ''); }
        else if (cur === null) items.push(l);
        else cur += ' ' + l;
      });
      if (cur !== null) items.push(cur);
    } else if (/\s;\s|;\s*\n|;\s(?=[A-ZÄÖÜ])/.test(s)) {
      items = s.replace(/\n/g, ' ').split(/\s*;\s*/);
    } else if (lines.length > 1 && lines.every((l) => l.length > 15)) {
      items = lines;
    } else {
      items = splitSentences(s.replace(/\n/g, ' '));
    }
    const out = [];
    items.forEach((it) => {
      it = it.replace(bullet, '').replace(/\s+\.\s*$/, '').replace(/\s{2,}/g, ' ').trim();
      if (/;\s/.test(it) && it.length > 160) { it.split(/\s*;\s*/).forEach((x) => x.trim() && out.push(x.trim())); return; }
      out.push(it);
    });
    return out.map((t) => t.replace(/^[,;:.\s]+|[;,\s]+$/g, '').trim())
      .filter((t) => t.length >= 4 && !BOILER.some((re) => re.test(t)));
  };

  const PLAN_RE = /\b(AP\s*\/\s*EP|EP\s*\/\s*AP|AP|EP|BP|Ausf(?:ü|ue)hrungsplan|Bestandsplan|Entwurfsplan)\b(?:\s*-?\s*Rev)?\s+Index\s+([A-Z]\d{0,2}|\d{1,2})\b/i;
  function planOf(txt) {
    const m = (txt || '').match(PLAN_RE); if (!m) return null;
    let v = m[1].toUpperCase().replace(/\s+/g, '');
    if (/^BESTANDSPLAN|^BP/.test(v)) v = 'AS-Built';
    else if (/^AUSF/.test(v)) v = 'AP';
    else if (/^ENTWURF/.test(v)) v = 'EP';
    else if (v.includes('/')) v = 'EP';
    return { planvariante: v, index: m[2].toUpperCase() };
  }

  /* text: kompletter Mailtext, subject: Betreff */
  P.extract = (mail) => {
    const subject = (mail.subject || '').trim();
    let text = (mail.text || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
    const d = { felder: {}, erkannt: new Set(), punkte: [], hinweise: [], korrekturdatei: false };
    const set = (k, v) => { if (v !== undefined && v !== null && String(v).trim() !== '') { d.felder[k] = String(v).trim(); d.erkannt.add(k); } };

    /* Betreff: "Ablehnung nach Planpruefung fuer VT Standort DE-TIMS-39333 (B148 D) Wiehl-Sued (A1) #1403176" */
    const hay = subject + '\n' + text.slice(0, 1500);
    let m = hay.match(/(DE-TIMS-\d+)\s*\(\s*([0-9A-Z]{4})[\s\-]+([A-Z])\s*\)\s*([^\n(#]*?)\s*(?:\(([^)]+)\))?\s*(?:#(\d+))?\s*$/im);
    if (m) { set('tims', m[1]); set('standortId', `${m[2]}-${m[3]}`); set('standortName', m[4]); if (m[6]) set('ticket', m[6]); }
    if (!d.felder.standortId) {
      m = text.match(/f(?:ü|ue)r den Standort\s+([0-9A-Z]{4})[\s\-]([A-Z])\s+(.+?)\s+wurde nach Pr(?:ü|ue)fung/i);
      if (m) { set('standortId', `${m[1]}-${m[2]}`); set('standortName', m[3]); }
    }
    m = text.match(/Pr(?:ü|ue)f-ID:\s*(\d+)/i); if (m) set('pruefId', m[1]);
    m = text.match(/Minu-Vorgang:\s*(\d+)/i); if (m) set('minuVorgang', m[1]);
    m = text.match(/Planaktivit(?:ä|ae)t(?::| mit der ID)\s*(\d+)/i); if (m) set('planaktivitaet', m[1]);
    m = text.match(/Pr(?:ü|ue)fer:\s*([^,\n]+?)\s*,\s*Telefon/i); if (m) set('prueferTechnik', m[1]);
    m = text.match(/Pr(?:ü|ue)fer MiNu:\s*([^,\n]+?)\s*,\s*Telefon/i); if (m) set('prueferMinu', m[1]);
    if (mail.date) set('datumAblehnung', mail.date.slice(0, 10));

    /* Kern: zwischen "Bemerkungen des Pruefers" und dem Standardtext */
    let core = text;
    const start = text.search(/Bemerkungen des Pr(?:ü|ue)fers/i);
    if (start >= 0) core = text.slice(start);
    const end = core.search(/Eine Korrekturdatei finden Sie|Wir bitten um Korrektur, Bereitstellung|Nutzen Sie dazu bitte folgenden Link|Mit freundlichen Gr(?:ü|ue)(?:ß|ss)en/i);
    if (end > 0) core = core.slice(0, end);
    m = core.match(/^Bemerkungen des Pr(?:ü|ue)fers,?\s*([^:\n]{2,60}?)\s*:/i);
    if (m) { if (!d.felder.prueferTechnik) set('prueferTechnik', m[1]); core = core.slice(m[0].length); }

    /* Technik-Teil / MiNu-Teil trennen */
    const mi = core.search(/\b(?:T?MC|TMC)[\s\-]+M[iI][nN][uU]\b/);
    const technik = mi >= 0 ? core.slice(0, mi) : core;
    let minu = mi >= 0 ? core.slice(mi) : '';

    if (minu) {
      /* Kopf: "TMC-Minu 05.08.26 - Rochna, Dominik: ABLEHNUNG Bestandsplan Index S" */
      const hm = minu.match(/^[^\n:]*?M[iI][nN][uU]\b([^:\n]{0,80}?):\s*/);
      if (hm) {
        const head = hm[1];
        const dm = head.match(/(\d{1,2}\.\d{1,2}\.\d{2,4})/);
        if (dm) d.hinweise.push('MiNu-Datum ' + TA.fmtDate(TA.parseDate(dm[1])));
        const nm = head.replace(/\d{1,2}\.\d{1,2}\.\d{2,4}/, '').replace(/^[\s\-–]+|[\s\-–]+$/g, '').replace(/^-\s*/, '');
        if (nm && !d.felder.prueferMinu && !/^(FM|PM)$/i.test(nm)) set('prueferMinu', nameFix(nm.replace(/\s*\/.*$/, '')));
        minu = minu.slice(hm[0].length);
      }
      const sm = minu.match(STATUS_RE);
      if (sm) {
        const st = sm[0];
        d.hinweise.push(st.replace(/[:!.\s]+$/, '').trim());
        if (/vorbe?halt|auflage|n(ä|ae)chsten planbearbeitung/i.test(st)) d.vorbehalt = true;
        if (/erneute|\bnachtrag\s+\d|nicht umgesetzt|offenen korrekturen/i.test(st)) d.wiederholung = true;
        const pl = planOf(st); if (pl) { set('planvariante', pl.planvariante); set('index', pl.index); }
        minu = minu.slice(st.length);
      }
    }
    if (!d.felder.planvariante) { const pl = planOf(core); if (pl) { set('planvariante', pl.planvariante); set('index', pl.index); } }
    if (/erneute ablehnung|\bnachtrag\s+\d|korrekturen wurden nicht umgesetzt|immer noch nicht/i.test(core)) d.wiederholung = true;

    const push = (quelle, arr) => arr.forEach((t) => {
      const verweis = /PDF-Korrektur-Datei|Korrekturdatei|Korrekturplan|Korrektur TMC/i.test(t);
      if (verweis) d.korrekturdatei = true;
      d.punkte.push({ id: TA.uid('p-'), quelle, text: t, verweis });
    });
    push('technik', P.splitPoints(technik.replace(/^\s*(ablehnung|erneute ablehnung)\s*[!:]*\s*/i, '')));
    push('minu', P.splitPoints(minu));
    if (/Korrekturdatei finden Sie/i.test(text) && d.punkte.some((p) => p.verweis)) d.korrekturdatei = true;
    d.core = core.trim();
    return d;
  };

  /* PDF-Kommentare -> Punkte */
  P.pointsFromPdf = (pdf) => {
    if (pdf.notes && pdf.notes.length) return pdf.notes.map((n) => ({ id: TA.uid('p-'), quelle: 'pdf', text: n.text.replace(/\s+/g, ' '), seite: n.page }));
    return [];
  };

  /* Datei -> {mail, pdf} */
  P.readFile = async (file) => {
    const u8 = new Uint8Array(await file.arrayBuffer());
    const n = file.name.toLowerCase();
    if (n.endsWith('.pdf') || file.type === 'application/pdf') return { kind: 'pdf', pdf: await P.parsePdf(u8), u8 };
    if (n.endsWith('.msg')) return { kind: 'mail', mail: P.parseMsg(u8), u8 };
    if (n.endsWith('.eml') || n.endsWith('.txt') || n.endsWith('.mht') || file.type.startsWith('message/') || file.type.startsWith('text/')) return { kind: 'mail', mail: P.parseEml(u8), u8 };
    if (u8[0] === 0xD0 && u8[1] === 0xCF) return { kind: 'mail', mail: P.parseMsg(u8), u8 };
    return { kind: 'mail', mail: P.parseEml(u8), u8 };
  };
})(window.TA);
