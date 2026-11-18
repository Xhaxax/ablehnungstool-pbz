'use strict';
/* Gemeinsame Bausteine der Cloud-Schnittstelle (Vercel Functions + Postgres, z. B. Neon).
   Dateien mit Unterstrich werden von Vercel nicht als eigene Funktion veroeffentlicht. */
const crypto = require('crypto');

const MAX_BODY = 4 * 1024 * 1024;
const SESSION_DAYS = 14;
const COOKIE = 'at_session';

let sqlImpl = null;
let schemaDone = null;

function getSql() {
  if (!sqlImpl) {
    const { neon } = require('@neondatabase/serverless');
    sqlImpl = neon(process.env.DATABASE_URL);
  }
  return sqlImpl;
}
/* nur fuer Tests */
function setSql(fn) { sqlImpl = fn; schemaDone = null; }

function ensureSchema() {
  if (!schemaDone) {
    schemaDone = (async () => {
      const q = getSql();
      await q`create table if not exists docs (
        kind text not null, id text not null, rev integer not null default 1,
        data jsonb not null, updated_at timestamptz not null default now(),
        primary key (kind, id))`;
      await q`create table if not exists files (
        abl text not null, name text not null, type text, b64 text not null,
        primary key (abl, name))`;
      await q`create table if not exists locks (
        id text primary key, user_id text not null, user_name text not null,
        at timestamptz not null default now(), until timestamptz not null)`;
      await q`create table if not exists meta (k text primary key, v bigint not null)`;
      await q`insert into meta (k, v) values ('version', 1) on conflict (k) do nothing`;
    })().catch((e) => { schemaDone = null; throw e; });
  }
  return schemaDone;
}

async function bumpVersion() {
  const r = await getSql()`update meta set v = v + 1 where k = 'version' returning v`;
  return Number(r[0].v);
}

/* ---------- Konfiguration und Anmeldung ---------- */
function configured() {
  return !!(process.env.DATABASE_URL && process.env.TEAM_PASSWORD && process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16);
}
const hmac = (txt) => crypto.createHmac('sha256', process.env.SESSION_SECRET).update(txt).digest('base64url');
function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
function makeCookie(req) {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const secure = (req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https' ? '; Secure' : '';
  return `${COOKIE}=${exp}.${hmac(String(exp))}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}
function clearCookie() { return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`; }
function isAuthed(req) {
  if (!configured()) return false;
  const raw = req.headers.cookie || '';
  const m = raw.split(';').map((s) => s.trim()).find((s) => s.startsWith(COOKIE + '='));
  if (!m) return false;
  const [exp, sig] = m.slice(COOKIE.length + 1).split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  try { return safeEqual(sig, hmac(exp)); } catch (e) { return false; }
}

/* ---------- Antworten und Eingaben ---------- */
function json(res, status, obj, headers) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  Object.entries(headers || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(obj));
}
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
function readBody(req) {
  return new Promise((resolve, reject) => {
    const parts = []; let size = 0; let tooBig = false;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { tooBig = true; parts.length = 0; } else if (!tooBig) parts.push(c); });
    req.on('end', () => (tooBig ? reject(new HttpError(413, 'Datei zu gross (max. 4 MB)')) : resolve(Buffer.concat(parts))));
    req.on('error', reject);
  });
}
async function readJson(req) {
  const b = await readBody(req);
  if (!b.length) return {};
  try { return JSON.parse(b.toString('utf8')); } catch (e) { throw new HttpError(400, 'Ungueltiges JSON'); }
}
const ID_RE = /^[A-Za-z0-9_.\-]{1,80}$/;
function checkId(v, what) { if (!ID_RE.test(v || '')) throw new HttpError(400, 'Ungueltige ' + (what || 'ID')); return v; }
function checkName(v) { if (!v || v.length > 160 || /[\\/]/.test(v)) throw new HttpError(400, 'Ungueltiger Dateiname'); return v; }

/* Huelle fuer jede Funktion: Konfiguration, Anmeldung, Schema, Fehlerbehandlung */
function api(opts, fn) {
  return async (req, res) => {
    try {
      if (!configured()) return json(res, 503, { error: 'cloud-nicht-eingerichtet' });
      if (opts.auth !== false && !isAuthed(req)) return json(res, 401, { error: 'anmeldung-erforderlich' });
      if (opts.methods && !opts.methods.includes(req.method)) return json(res, 405, { error: 'methode-nicht-erlaubt' });
      await ensureSchema();
      await fn(req, res, new URL(req.url, 'http://localhost').searchParams);
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e);
      if (!res.headersSent) json(res, e instanceof HttpError ? e.status : 500, { error: e instanceof HttpError ? e.message : 'serverfehler' });
    }
  };
}

module.exports = { getSql, setSql, ensureSchema, bumpVersion, configured, isAuthed, makeCookie, clearCookie, safeEqual, json, readBody, readJson, checkId, checkName, HttpError, api };
