'use strict';
const { destinations } = require('../../lib/store');
const { json } = require('../../lib/http');

module.exports = (req, res) => {
  const id = Number(req.query && req.query.id);
  json(res, 200, destinations().get(id) || {});
};
