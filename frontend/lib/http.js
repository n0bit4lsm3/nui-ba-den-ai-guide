// Small helpers so the same handlers run on Vercel and on scripts/dev-api.mjs.
'use strict';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function badRequest(res, message) {
  return json(res, 400, { detail: message });
}

async function chatPayload(req, res) {
  let body;
  try { body = await readJson(req); } catch { badRequest(res, 'invalid JSON'); return null; }
  const message = String(body.message || '').trim();
  if (!message || message.length > 2000) { badRequest(res, 'message must be 1–2000 characters'); return null; }
  const history = Array.isArray(body.history) ? body.history.slice(-8).map((h) => ({ role: String(h.role || ''), content: String(h.content || '').slice(0, 2000) })) : [];
  return {
    message,
    destination_id: body.destination_id == null ? null : Number(body.destination_id) || null,
    session_id: String(body.session_id || 'default').slice(0, 120),
    history,
  };
}

module.exports = { json, readJson, badRequest, chatPayload };
