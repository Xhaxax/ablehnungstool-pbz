'use strict';
const L = require('./_lib');

/* Liefert den ganzen Datenbestand. Mit ?v=<Version> kommt nur {unchanged:true}, wenn sich nichts geaendert hat. */
module.exports = L.api({ methods: ['GET'] }, async (req, res, params) => {
  const q = L.getSql();
  const m = await q`select v from meta where k = 'version'`;
  const cur = Number(m[0].v);
  if (params.get('v') && Number(params.get('v')) === cur) return L.json(res, 200, { unchanged: true, v: cur });
  const rows = await q`select kind, id, data || jsonb_build_object('rev', rev) as data from docs`;
  const locks = await q`select id, user_id, user_name, at, until from locks where until > now()`;
  const out = { v: cur, cfg: null, abl: [], massn: [], locks: {} };
  for (const r of rows) {
    if (r.kind === 'cfg') out.cfg = r.data;
    else if (r.kind === 'abl') out.abl.push(r.data);
    else if (r.kind === 'massn') out.massn.push(r.data);
  }
  for (const l of locks) out.locks[l.id] = { userId: l.user_id, user: l.user_name, at: new Date(l.at).toISOString(), until: new Date(l.until).toISOString() };
  L.json(res, 200, out);
});
