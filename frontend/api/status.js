'use strict';
const { data } = require('../lib/store');
const { json } = require('../lib/http');

module.exports = (req, res) => {
  const sheets = Object.fromEntries(Object.entries(data).filter(([k]) => k !== '_meta').map(([k, v]) => [k, v.length]));
  json(res, 200, { data: { data_source: 'data.json', meta: data._meta || {}, sheets }, ai: { configured: false, model: 'rule-engine' }, web_search: { configured: false } });
};
