'use strict';
const { answer } = require('../lib/ai');
const { json, chatPayload } = require('../lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { detail: 'POST only' });
  const payload = await chatPayload(req, res);
  if (!payload) return undefined;
  const result = await answer(payload);
  return json(res, 200, { answer: result.answer, retrieval: result.retrieval });
};
