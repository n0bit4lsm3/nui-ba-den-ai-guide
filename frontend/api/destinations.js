'use strict';
const { destinations } = require('../lib/store');
const { json } = require('../lib/http');

module.exports = (req, res) => {
  const values = [...destinations().values()];
  json(res, 200, { total: values.length, destinations: values });
};
