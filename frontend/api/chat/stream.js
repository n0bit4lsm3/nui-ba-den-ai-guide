'use strict';
// Same answer as /api/chat, streamed as server-sent events while the model writes.
const { answer } = require('../../lib/ai');
const { json, chatPayload } = require('../../lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { detail: 'POST only' });
  const payload = await chatPayload(req, res);
  if (!payload) return undefined;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write('event: start\ndata: {}\n\n');
  const result = await answer(payload, (token) => {
    res.write(`event: token\ndata: ${JSON.stringify({ token })}\n\n`);
  });
  res.write(`event: done\ndata: ${JSON.stringify({ answer: result.answer, retrieval: result.retrieval })}\n\n`);
  res.end();
  return undefined;
};
