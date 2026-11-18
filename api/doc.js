'use strict';
const L = require('./_lib');

const KINDS = ['abl', 'massn', 'cfg'];

/* PUT ?kind=abl|massn|cfg&id=...  Body { doc, baseRev, force }
   DELETE ?kind&id
   Aenderungen werden nur angenommen, wenn die Revision passt (sonst 409 mit dem aktuellen Stand). */
module.exports = L.api({ methods: ['PUT', 'DELETE'] }, async (req, res, params) => {
  const kind = params.get('kind');
  if (!KINDS.includes(kind)) throw new L.HttpError(400, 'Ungueltige Art');
  const id = L.checkId(params.get('id'));
  const q = L.getSql();

  if (req.method === 'DELETE') {
    await q`delete from docs where kind = ${kind} and id = ${id}`;
    if (kind === 'abl') {
      await q`delete from files where abl = ${id}`;
      await q`delete from locks where id = ${id}`;
    }
    const v = await L.bumpVersion();
    return L.json(res, 200, { ok: true, v });
  }

  const body = await L.readJson(req);
  const doc = body.doc;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new L.HttpError(400, 'Dokument fehlt');
  if (kind !== 'cfg' && doc.id !== id) throw new L.HttpError(400, 'ID stimmt nicht');
  const data = JSON.stringify(Object.assign({}, doc, { rev: undefined }));
  const base = Number(body.baseRev) || 0;

  let rev = null;
  if (body.force || kind === 'massn') {
    const r = await q`insert into docs (kind, id, rev, data) values (${kind}, ${id}, 1, ${data}::jsonb)
      on conflict (kind, id) do update set rev = docs.rev + 1, data = excluded.data, updated_at = now() returning rev`;
    rev = r[0].rev;
  } else {
    const upd = await q`update docs set data = ${data}::jsonb, rev = rev + 1, updated_at = now()
      where kind = ${kind} and id = ${id} and rev = ${base} returning rev`;
    if (upd.length) rev = upd[0].rev;
    else {
      const cur = await q`select data || jsonb_build_object('rev', rev) as data, rev from docs where kind = ${kind} and id = ${id}`;
      if (cur.length) return L.json(res, 409, { error: 'konflikt', current: cur[0].data });
      const ins = await q`insert into docs (kind, id, rev, data) values (${kind}, ${id}, ${base + 1}, ${data}::jsonb)
        on conflict (kind, id) do nothing returning rev`;
      if (!ins.length) {
        const c2 = await q`select data || jsonb_build_object('rev', rev) as data from docs where kind = ${kind} and id = ${id}`;
        return L.json(res, 409, { error: 'konflikt', current: c2[0] && c2[0].data });
      }
      rev = ins[0].rev;
    }
  }
  const v = await L.bumpVersion();
  L.json(res, 200, { ok: true, rev, v });
});
