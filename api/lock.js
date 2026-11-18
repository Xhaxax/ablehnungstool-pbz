'use strict';
const L = require('./_lib');

const fmt = (l) => ({ userId: l.user_id, user: l.user_name, at: new Date(l.at).toISOString(), until: new Date(l.until).toISOString() });

/* POST { id, userId, userName, minutes, force } sperrt eine Ablehnung zum Bearbeiten.
   DELETE ?id=&userId= gibt sie wieder frei. */
module.exports = L.api({ methods: ['POST', 'DELETE'] }, async (req, res, params) => {
  const q = L.getSql();
  if (req.method === 'DELETE') {
    const id = L.checkId(params.get('id'));
    await q`delete from locks where id = ${id} and user_id = ${params.get('userId') || ''}`;
    const v = await L.bumpVersion();
    return L.json(res, 200, { ok: true, v });
  }
  const b = await L.readJson(req);
  const id = L.checkId(b.id);
  if (!b.userId || !b.userName) throw new L.HttpError(400, 'Benutzer fehlt');
  const mins = Math.min(120, Math.max(1, Number(b.minutes) || 20));
  const cur = await q`select * from locks where id = ${id} and until > now()`;
  if (cur.length && cur[0].user_id !== b.userId && !b.force) return L.json(res, 200, { ok: false, lock: fmt(cur[0]) });
  const r = await q`insert into locks (id, user_id, user_name, at, until)
    values (${id}, ${String(b.userId)}, ${String(b.userName).slice(0, 120)}, now(), now() + (${mins}::int * interval '1 minute'))
    on conflict (id) do update set user_id = excluded.user_id, user_name = excluded.user_name, at = now(), until = excluded.until
    returning *`;
  const v = await L.bumpVersion();
  L.json(res, 200, { ok: true, lock: fmt(r[0]), v });
});
