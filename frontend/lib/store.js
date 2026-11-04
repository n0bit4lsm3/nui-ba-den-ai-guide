// Data shared by the Vercel serverless functions in /api (port of
// backend/app/db/postgres.py). The chat itself lives in ai.js.
'use strict';

const data = require('./data.json');

const QR_CODES = {
  ECO_NUI_BA_DEN_001: { destination_id: 1, expired: false },
};

const SUPPORT = {
  title: 'Hotline & hỗ trợ Núi Bà Đen',
  lost_guidance: [
    'Dừng di chuyển và không tự đi sâu thêm.',
    'Giữ liên lạc, bật định vị và chia sẻ vị trí hiện tại.',
    'Mô tả mốc gần nhất, tình trạng sức khỏe và số người trong nhóm.',
  ],
  contacts: [
    {
      kind: 'emergency',
      name: 'Tổng đài khẩn cấp quốc gia',
      phone: '112',
      display_phone: '112',
      description: 'Cứu nạn khẩn cấp 24/7, miễn phí cuộc gọi.',
      source_url: 'https://xaydungchinhsach.chinhphu.vn/tong-dai-so-112-tiep-nhan-24-7-cac-thong-tin-ve-su-co-thien-tai-tham-hoa-119250902150528929.htm',
    },
    {
      kind: 'management',
      name: 'Ban quản lý KDL Quốc gia Núi Bà Đen',
      phone: '02763823378',
      display_phone: '0276 3823 378',
      description: 'Hỗ trợ tại khu du lịch và thông tin điểm đến.',
      source_url: 'https://khudulichnuibaden.tayninh.gov.vn/',
    },
    {
      kind: 'visitor_support',
      name: 'Sun World Ba Den Mountain',
      phone: '0327222227',
      display_phone: '0327 222 227',
      description: 'Hỗ trợ dịch vụ và vấn đề phát sinh khi tham quan.',
      source_url: 'https://sunworld.vn/ba-den/di-chuyen',
    },
  ],
};

const str = (v) => (v == null ? '' : String(v).trim());

// ---------- destinations ----------

function mediaSortKey(m) {
  const primary = ['1', 'true', 'yes', 'y', 'x'].includes(str(m.is_primary).toLowerCase()) ? 0 : 1;
  const order = Number.parseInt(str(m.sort_order), 10);
  return [primary, Number.isFinite(order) ? order : 999999, str(m.media_id)];
}

function destinationMedia(rows) {
  return rows
    .filter((r) => str(r.media_type || 'image').toLowerCase() === 'image' && str(r.image_url))
    .sort((a, b) => {
      const ka = mediaSortKey(a); const kb = mediaSortKey(b);
      return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2]);
    })
    .map((m) => ({
      id: str(m.media_id), type: str(m.media_type || 'image'), url: str(m.image_url), caption: str(m.caption),
      alt_text: str(m.alt_text), source_url: str(m.source_url), is_primary: str(m.is_primary), sort_order: str(m.sort_order),
    }));
}

function googleMapsUrl(nav, name, location) {
  const configured = str(nav.google_maps_search_url);
  if (configured.startsWith('https://www.google.com/maps/') || configured.startsWith('https://maps.google.com/')) return configured;
  const query = [name, location, 'Tây Ninh, Việt Nam'].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query).replace(/%20/g, '+')}`;
}

let destinationsCache = null;
function destinations() {
  if (destinationsCache) return destinationsCache;
  const mediaByDest = {}; const navByDest = {};
  for (const m of data.media_assets || []) (mediaByDest[str(m.dest_id)] = mediaByDest[str(m.dest_id)] || []).push(m);
  for (const n of data.maps_navigation || []) if (!navByDest[str(n.dest_id)]) navByDest[str(n.dest_id)] = n;

  const result = new Map();
  (data.destinations || []).forEach((record, i) => {
    const index = i + 1; const destId = str(record.dest_id);
    const media = destinationMedia(mediaByDest[destId] || []);
    const cover = media[0] || {}; const nav = navByDest[destId] || {};
    const name = str(record.name) || 'Điểm đến Núi Bà Đen'; const location = str(record.location);
    result.set(index, {
      id: index, dest_code: destId, name, category: str(record.category), location,
      short_description: str(record.description_short), description_detail: str(record.description_detail),
      highlight: str(record.highlight), best_time: str(record.best_time), estimated_duration: str(record.estimated_duration),
      travel_type: str(record.travel_type), difficulty_level: str(record.difficulty_level), transport: str(record.transport),
      seo_keyword: str(record.seo_keyword), source_url: str(record.source_url), display_order: str(record.display_order),
      google_maps_url: googleMapsUrl(nav, name, location), map_place_name: str(nav.place_name), map_area: str(nav.area),
      navigation_note: str(nav.navigation_note), coordinates_or_altitude: str(nav.coordinates_or_altitude),
      image_url: str(cover.url), image_caption: str(cover.caption), image_alt: str(cover.alt_text), media_assets: media,
    });
  });
  destinationsCache = result;
  return result;
}

// ---------- itineraries ----------

const SEQ_STEP_RE = /^(?:\(([^)]*)\)\s*)?(TN\d+)?\s*(?:\(([^)]*)\))?$/;
function itineraries() {
  const byCode = new Map([...destinations().values()].map((d) => [d.dest_code, d]));
  return (data.itineraries || []).map((row) => {
    const steps = [];
    for (let raw of str(row.dest_sequence).split('>')) {
      raw = raw.trim(); if (!raw) continue;
      const m = raw.match(SEQ_STEP_RE);
      const note = m ? str(m[1] || m[3]) : raw.replace(/^[( ]+|[) ]+$/g, '');
      const dest = m && m[2] ? byCode.get(m[2]) : null;
      steps.push({
        note, destination_id: dest ? dest.id : null, name: dest ? dest.name : '',
        location: dest ? dest.location : '', image_url: dest ? dest.image_url : '',
      });
    }
    return {
      id: str(row.itinerary_id), title: str(row.title), duration: str(row.duration), suitable_for: str(row.suitable_for),
      description: str(row.description), best_time: str(row.best_time), estimated_cost_note: str(row.estimated_cost_note),
      difficulty_level: str(row.difficulty_level), source_url: str(row.source_url), steps,
    };
  });
}

module.exports = { QR_CODES, SUPPORT, data, destinations, itineraries };
