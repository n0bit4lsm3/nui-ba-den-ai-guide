// Line-delimited JSON bridge so the Python backend can drive engine.js.
// Request:  {"id": 1, "op": "init", "data": {...}}
//           {"id": 2, "op": "ask", "session": "abc", "q": "...", "today": "2026-11-03"}
// Response: {"id": 2, "ok": true, "result": {...}} or {"id": 2, "ok": false, "error": "..."}
'use strict';
const readline = require('readline');
const { createBot } = require('./engine.js');

const MAX_SESSIONS = 500;
let data = null;
const sessions = new Map();

function botFor(session) {
  let bot = sessions.get(session);
  if (bot) {
    sessions.delete(session);
  } else {
    bot = createBot(data);
    if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
  }
  sessions.set(session, bot);
  return bot;
}

function handle(msg) {
  if (msg.op === 'init') {
    data = msg.data;
    sessions.clear();
    return { sessions: 0 };
  }
  if (msg.op === 'ask') {
    if (!data) throw new Error('engine not initialised');
    const [y, m, d] = String(msg.today || '').split('-').map(Number);
    const today = y ? new Date(y, m - 1, d) : new Date();
    return botFor(String(msg.session || 'default')).ask(String(msg.q || ''), { today });
  }
  throw new Error(`unknown op ${msg.op}`);
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  let msg = {};
  try {
    msg = JSON.parse(line);
    process.stdout.write(JSON.stringify({ id: msg.id, ok: true, result: handle(msg) }) + '\n');
  } catch (err) {
    process.stdout.write(JSON.stringify({ id: msg.id, ok: false, error: String(err && err.message || err) }) + '\n');
  }
});
