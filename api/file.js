'use strict';
const L = require('./_lib');

/* Anhaenge (Original-Mail, Korrektur-PDF) je Ablehnung.
   PUT ?abl=&name=  Body = Dateiinhalt (max. 4 MB)
   GET ?abl=&name=  liefert die Datei
   DELETE ?abl=&name= */
module.exports = L.api({ methods: ['PUT', 'GET', 'DELETE'] }, async (req, res, params) => {
  const abl = L.checkId(params.get('abl'), 'Ablehnung');
  const name = L.checkName(params.get('name'));
  const q = L.getSql();

  if (req.method === 'PUT') {
    const buf = await L.readBody(req);
    if (!buf.length) throw new L.HttpError(400, 'Leere Datei');
    const type = String(req.headers['content-type'] || 'application/octet-stream').slice(0, 120);
    await q`insert into files (abl, name, type, b64) values (${abl}, ${name}, ${type}, ${buf.toString('base64')})
      on conflict (abl, name) do update set type = excluded.type, b64 = excluded.b64`;
    return L.json(res, 200, { ok: true, name });
  }
  if (req.method === 'DELETE') {
    await q`delete from files where abl = ${abl} and name = ${name}`;
    return L.json(res, 200, { ok: true });
  }
  const r = await q`select type, b64 from files where abl = ${abl} and name = ${name}`;
  if (!r.length) throw new L.HttpError(404, 'Datei nicht gefunden');
  const buf = Buffer.from(r[0].b64, 'base64');
  res.statusCode = 200;
  res.setHeader('Content-Type', r[0].type || 'application/octet-stream');
  res.setHeader('Content-Length', buf.length);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(buf);
});
