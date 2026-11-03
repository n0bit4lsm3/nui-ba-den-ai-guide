'use strict';
// Same answer as /api/chat, sent as server-sent events so the UI keeps its
// typing effect. The reply is already complete, so tokens are just words.
const { answer } = require('../../lib/store');
const { json, chatPayload } = require('../../lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { detail: 'POST only' });
  const payload = await chatPayload(req, res);
  if (!payload) return undefined;
  const result = answer(payload);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write('event: start\ndata: {}\n\n');
  for (const token of result.answer.match(/\S+\s*|\s+/g) || []) {
    res.write(`event: token\ndata: ${JSON.stringify({ token })}\n\n`);
  }
  res.write(`event: done\ndata: ${JSON.stringify({ answer: result.answer, retrieval: result.retrieval })}\n\n`);
  res.end();
  return undefined;
};
