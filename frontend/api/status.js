'use strict';
const { data } = require('../lib/store');
const { json } = require('../lib/http');

module.exports = (req, res) => {
  const sheets = Object.fromEntries(Object.entries(data).filter(([k]) => k !== '_meta').map(([k, v]) => [k, v.length]));
  json(res, 200, { data: { data_source: 'data.json', meta: data._meta || {}, sheets }, ai: { configured: Boolean(process.env.OPENROUTER_API_KEY), model: process.env.OPENROUTER_MODEL || 'google/gemini-3-flash-preview' }, web_search: { configured: Boolean(process.env.OPENROUTER_API_KEY), provider: 'openrouter:web_search' } });
};
