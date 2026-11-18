'use strict';
const L = require('./_lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* POST { password } meldet an, DELETE meldet ab. */
module.exports = L.api({ auth: false, methods: ['POST', 'DELETE'] }, async (req, res) => {
  if (req.method === 'DELETE') return L.json(res, 200, { ok: true }, { 'Set-Cookie': L.clearCookie() });
  const body = await L.readJson(req);
  if (typeof body.password !== 'string' || !body.password || !L.safeEqual(body.password, process.env.TEAM_PASSWORD)) {
    await sleep(800);
    throw new L.HttpError(401, 'passwort-falsch');
  }
  L.json(res, 200, { ok: true }, { 'Set-Cookie': L.makeCookie(req) });
});
