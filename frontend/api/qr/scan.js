'use strict';
const { QR_CODES, destinations } = require('../../lib/store');
const { json, readJson } = require('../../lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { detail: 'POST only' });
  let body; try { body = await readJson(req); } catch { return json(res, 400, { detail: 'invalid JSON' }); }
  const qr = QR_CODES[String(body.qr_code || '').trim()];
  if (!qr) return json(res, 200, { status: 'invalid', message: 'QR không thuộc hệ thống.' });
  if (qr.expired) return json(res, 200, { status: 'expired', message: 'QR đã hết hạn.' });
  return json(res, 200, { status: 'valid', message: 'Quét QR thành công.', destination: destinations().get(qr.destination_id) || {} });
};
