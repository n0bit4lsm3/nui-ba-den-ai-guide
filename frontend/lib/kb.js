// Knowledge base for the AI guide: every row of data.json becomes one small
// text document, ranked against the question with BM25 so only the relevant
// rows are sent to the model.
'use strict';

const data = require('./data.json');

const str = (v) => (v == null ? '' : String(v).trim());

// Sheets that describe how the old rule engine worked, not the destination.
const SKIP_SHEETS = new Set(['_meta', 'chatbot_intents', 'chatbot_rules', 'media_assets']);
// Columns still searched but not sent to the model: keywords, links, internal
// bookkeeping. They made up about a third of every prompt.
const SKIP_FIELDS = new Set([
  'query_keywords', 'keywords', 'seo_keyword', 'search_aliases', 'image_url', 'priority', 'display_priority', 'sort_order',
  'source_url', 'source_update', 'last_updated', 'last_verified', 'answer_strategy', 'note', 'related_sheet', 'related_id',
  'related_faq', 'related_questions', 'data_type', 'intent', 'topic', 'data_update_rule', 'google_maps_search_url',
]);

const normalize = (v) => str(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
  .replace(/[^a-z0-9]+/g, ' ').trim();

// Vietnamese words are mostly two syllables, so syllable pairs carry most of
// the meaning ("cap treo", "gia ve"); single syllables still help recall.
function terms(text) {
  const words = normalize(text).split(' ').filter(Boolean);
  const out = [...words];
  for (let i = 0; i < words.length - 1; i++) out.push(`${words[i]}_${words[i + 1]}`);
  return out;
}

// Rows that are archived, expired or switched off must never reach the model.
function isUsable(sheet, row) {
  const status = normalize(row.applicability_status);
  if (sheet === 'services_pricing' && status && !status.startsWith('dang ap dung')) return false;
  if (normalize(row.is_active) === 'no') return false;
  if (normalize(row.verification_status) === 'expired') return false;
  return true;
}

function rowId(sheet, row) {
  if (sheet === 'destinations') return str(row.dest_id);
  const key = Object.keys(row).find((k) => k.endsWith('_id') && k !== 'dest_id' && k !== 'place_id');
  return str(row[key]) || `${sheet}`;
}

function buildDocs() {
  const docs = [];
  for (const [sheet, rows] of Object.entries(data)) {
    if (SKIP_SHEETS.has(sheet) || !Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!isUsable(sheet, row)) continue;
      const id = rowId(sheet, row);
      // The row id is already in the header, so *_id columns other than place codes are dropped too.
      const lines = Object.entries(row)
        .filter(([k, v]) => !SKIP_FIELDS.has(k) && !(k.endsWith('_id') && k !== 'dest_id' && k !== 'place_id') && str(v))
        .map(([k, v]) => `${k}: ${str(v)}`);
      const text = `[${id}] (${sheet})\n${lines.join('\n')}`;
      // Search the sent text plus the keyword columns written for matching.
      const searchable = [text, row.query_keywords, row.keywords, row.search_aliases, row.seo_keyword, row.topic].map(str).join(' ');
      // source_url sometimes carries notes after the link ("…/gia-ve ; ảnh bảng giá: …").
      const sourceUrl = (str(row.source_url).match(/https?:\/\/[^\s;,|]+/) || [''])[0];
      docs.push({ id, sheet, destId: str(row.dest_id), sourceUrl, text, terms: terms(searchable) });
    }
  }
  return docs;
}

let index = null;
function getIndex() {
  if (index) return index;
  const docs = buildDocs();
  const df = new Map();
  for (const doc of docs) {
    doc.tf = new Map();
    for (const t of doc.terms) doc.tf.set(t, (doc.tf.get(t) || 0) + 1);
    for (const t of doc.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  }
  const avgLen = docs.reduce((sum, d) => sum + d.terms.length, 0) / Math.max(1, docs.length);
  index = { docs, df, avgLen, byId: new Map(docs.map((d) => [d.id, d])) };
  return index;
}

function bm25(doc, queryTerms, { df, avgLen, docs }) {
  const k1 = 1.2; const b = 0.75;
  let score = 0;
  for (const t of queryTerms) {
    const f = doc.tf.get(t);
    if (!f) continue;
    const n = df.get(t);
    const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
    // Syllable pairs are far more specific than single syllables.
    const weight = t.includes('_') ? 2 : 1;
    score += weight * idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * doc.terms.length) / avgLen)));
  }
  return score;
}

// `context` is earlier user turns, so follow-ups like "còn trẻ em thì sao?"
// still find the rows of the topic being discussed.
function search(question, { context = '', destCode = '', limit = 12 } = {}) {
  const idx = getIndex();
  const queryTerms = [...new Set(terms(question))];
  const contextTerms = [...new Set(terms(context))].filter((t) => !queryTerms.includes(t));
  const scored = idx.docs
    .map((doc) => {
      let score = bm25(doc, queryTerms, idx) + 0.35 * bm25(doc, contextTerms, idx);
      if (destCode && doc.destId === destCode) score *= 1.3;
      return { doc, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  // Drop the long tail of weak matches: they cost tokens and rarely help.
  const top = scored.length ? scored[0].score : 0;
  // At most a few rows per sheet, so the many FAQ rows don't crowd out the
  // price and opening-hours tables.
  const perSheet = {};
  const docs = [];
  for (const { doc, score } of scored) {
    if (score < top * 0.3 || docs.length >= limit) break;
    if ((perSheet[doc.sheet] = (perSheet[doc.sheet] || 0) + 1) > 5) continue;
    docs.push(doc);
  }

  // The destination the visitor picked is always in context.
  const picked = destCode && idx.docs.find((d) => d.sheet === 'destinations' && d.id === destCode);
  if (picked && !docs.includes(picked)) docs.unshift(picked);
  return docs;
}

function destinationNames() {
  return (data.destinations || []).map((d) => `${str(d.dest_id)}: ${str(d.name)}`).join('\n');
}

const answerRules = () => (data.chatbot_rules || []).map((r) => `- ${str(r.rule)}: ${str(r.detail)}`).join('\n');

module.exports = { search, destinationNames, answerRules, getDoc: (id) => getIndex().byId.get(id), normalize };
