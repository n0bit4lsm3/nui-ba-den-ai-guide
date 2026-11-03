'use strict';
const { SUPPORT } = require('../lib/store');
const { json } = require('../lib/http');

module.exports = (req, res) => json(res, 200, SUPPORT);
