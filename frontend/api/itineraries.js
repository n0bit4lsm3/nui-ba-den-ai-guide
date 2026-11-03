'use strict';
const { itineraries } = require('../lib/store');
const { json } = require('../lib/http');

module.exports = (req, res) => {
  const items = itineraries();
  json(res, 200, { total: items.length, itineraries: items });
};
