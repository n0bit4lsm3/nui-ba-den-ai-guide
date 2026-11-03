/* Núi Bà Đen AI Guide – rule/retrieval engine that simulates the chatbot pipeline:
 *   question → entities + intent (chatbot_intents) → sheet filter (validity date, is_active) → templated answer + sources.
 * Works in the browser (window.NBDBot) and in Node (module.exports) for automated tests. */
(function (root) {
  'use strict';

  // ---------- text helpers ----------
  const norm = (s) => (s == null ? '' : String(s))
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd')
    .toLowerCase().replace(/[^a-z0-9\s:/.]/g, ' ').replace(/\s+/g, ' ').trim();
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const vnDate = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  const isoToVn = (s) => (/^\d{4}-\d\d-\d\d$/.test(s || '') ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s);
  const hhmm = (t) => (t ? String(t).slice(0, 5) : '');
  const money = (n) => (n === 0 ? 'Miễn phí' : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ');
  const lcFirst = (x) => { const v = String(x || ''); return /^(Tây Ninh|Núi Bà|Ga Bà|Sun World|TP\.|Hồ Dầu|Chùa Bà|Linh Sơn|Tượng Phật|Vân Sơn|Tâm An)/.test(v) ? v : v.charAt(0).toLowerCase() + v.slice(1); };
  const WD = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const uniq = (a) => [...new Set(a.filter(Boolean))];
  const addMin = (t, m) => { const [h, mi] = t.split(':').map(Number); const x = h * 60 + mi + m; return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; };

  // ---------- date parsing ----------
  function parseWhen(t, today) {
    const add = (n) => { const x = new Date(today); x.setDate(x.getDate() + n); return x; };
    const nextDow = (dow) => add((dow - today.getDay() + 7) % 7);
    const WORD = { hai: 1, ba: 2, tu: 3, nam: 4, sau: 5, bay: 6 };
    let d = null; let m;
    if (/\b(hom nay|toi nay|sang nay|chieu nay|bay gio)\b/.test(t)) d = new Date(today);
    else if (/\b(ngay mai|mai)\b/.test(t)) d = add(1);
    else if (/\bngay mot\b/.test(t)) d = add(2);
    else if ((m = t.match(/\b(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*(\d{2,4}))?\b/))) {
      let y = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : today.getFullYear();
      const cand = new Date(y, Number(m[2]) - 1, Number(m[1]));
      if (!m[3] && cand < new Date(today.getFullYear(), today.getMonth(), today.getDate())) cand.setFullYear(y + 1);
      if (!isNaN(cand) && Number(m[2]) <= 12) d = cand;
    } else if ((m = t.match(/\b(?:thu|t)\s*([2-7])\b/))) d = nextDow(Number(m[1]) - 1);
    else if ((m = t.match(/\bthu (hai|ba|tu|nam|sau|bay)\b/))) d = nextDow(WORD[m[1]]);
    else if (/\b(chu nhat|cn)\b/.test(t)) d = nextDow(0);
    if (d && /tuan sau|tuan toi/.test(t) && (d - today) / 864e5 < 7) d.setDate(d.getDate() + 7);
    let dayType = null;
    if (d) dayType = d.getDay() === 0 || d.getDay() === 6 ? 'weekend' : 'weekday';
    else if (/cuoi tuan|thu 7 chu nhat/.test(t)) dayType = 'weekend';
    else if (/ngay thuong|trong tuan|dau tuan/.test(t)) dayType = 'weekday';
    return { date: d, dayType };
  }

  // ---------- entity extraction ----------
  function extract(q, today) {
    const t = norm(q);
    const raw = String(q).toLowerCase();
    const e = { t };
    const word = (forms) => new RegExp(`(^|[^\\p{L}])(${forms})(?=[^\\p{L}]|$)`, 'u').test(raw);
    e.saysVe = word('vé|ve');
    e.saysGia = word('giá|gia');
    e.saysTien = word('tiền|tien');
    e.vanson = /van son|len (toi |den |tren )?dinh|(toi|den|ra) dinh|dinh nui|cap dinh|tuyen dinh|cap len dinh/.test(t);
    // "buffet / nhà hàng Vân Sơn" is a restaurant name, not the Vân Sơn cable line
    if (/(buffet|nha hang|bup phe)( \w+)? van son/.test(t) && !/cap|tuyen/.test(t)) { e.vanson = false; e.buffet = true; }
    e.chuahang = /chua hang|chua ba|dien ba/.test(t);
    e.saysChuaBa = /chua ba|dien ba/.test(t) && !/chua hang|\bcap\b/.test(t);
    if (/\b(2|hai) tuyen|ca (2|hai) tuyen|ca dinh (va|lan) chua/.test(t)) { e.vanson = true; e.chuahang = true; e.combo = true; }
    e.taman = /tam an/.test(t);
    e.buffet = e.buffet || /buffet|bup phe|bufet/.test(t);
    e.combo = /combo|tron goi|ca 2 tuyen|ca hai tuyen|2 tuyen|hai tuyen|ca dinh (va|lan) chua/.test(t);
    e.night = /sau 17|17h|17 gio|5h chieu|5 gio chieu|buoi toi|ban dem|ve dem|\btoi nay\b|hoang hon|di toi|\bdem\b|ve toi|ve buoi toi/.test(t);
    e.oneway = /1 chieu|mot chieu/.test(t);
    if (e.oneway && !e.vanson && !e.taman && !e.chuahang) { e.chuahang = true; e.onewayGeneric = true; }
    e.entrance = /ve cong|vao cong|phi tham quan|phi vao|ve vao cua|ve vao khu|cong khu/.test(t);
    e.yearpass = /ve nam|the nam/.test(t);
    e.fastpass = /uu tien|fast ?pass|wow pass|khong xep hang|khoi xep hang/.test(t);
    e.guide = /huong dan vien|\bhdv\b|thuyet minh/.test(t);
    e.tamlinh = /khu tam linh|tam linh/.test(t);
    e.gate = /\bcong\b(?! khu tam)/.test(t) && /mo|dong|gio/.test(t);
    e.student = /sinh vien|\bsv\b/.test(t);
    e.local = /nguoi (dan )?tay ninh|dan tay ninh|ho khau tay ninh|cccd tay ninh|nguoi dia phuong|long an|o tay ninh|que tay ninh/.test(t);
    e.monk = /tang ni|su thay|ni co|nha su|tu si/.test(t);
    e.elderly = /\b(nguoi gia|cao tuoi|lon tuoi|ong ba|ong noi|ong ngoai|ba noi|ba ngoai|bo me gia|ba me gia|cha me gia)\b/.test(t);
    e.child = /tre em|tre con|tre nho|\bbe\b|em be|con nho|\bchau\b|thieu nhi|\bte\b|con (minh|toi|em)|dua nho|dua tre|con nit|be nho/.test(t);
    e.adult = /nguoi lon\b|\bnl\b/.test(t);
    e.disabled = /khuyet tat/.test(t);
    e.poor = /ho ngheo/.test(t);
    e.vegetarian = /(^|[^\p{L}])chay([^\p{L}]|$)/u.test(raw) || /an chay|mon chay|do chay|thuc an chay/.test(t);
    let m;
    if ((m = t.match(/\b([12])\s*m\s*(\d{1,2})\b/))) e.height = Number(m[1]) + Number(m[2].padEnd(2, '0')) / 100;
    else if ((m = t.match(/\b(\d{2,3})\s*cm\b/))) e.height = Number(m[1]) / 100;
    else if ((m = t.match(/\b([12])\s*m\b/))) e.height = Number(m[1]);
    if ((m = t.match(/\b(duoi |tren |tu )?(\d{1,3})\s*tuoi\b/))) {
      e.age = Number(m[2]) - (m[1] === 'duoi ' ? 0.5 : 0);
      if (e.age < 16) e.child = true;
      if (e.age >= 60) e.elderly = true;
    }
    if (/tren 80|tu 80/.test(t)) { e.elderly = true; e.age = e.age || 80; }
    if ((m = t.match(/\b(\d+)\s*(nguoi lon|nl)\b/))) e.nAdult = Number(m[1]);
    if ((m = t.match(/\b(\d+)\s*(tre em|tre|be|chau|em be|te|con|dua nho|dua tre|dua|con nit)\b/))) e.nChild = Number(m[1]);
    if (!e.nAdult && !e.nChild && (m = t.match(/\b(\d+)\s*nguoi\b/))) e.nAdult = Number(m[1]);
    e.when = parseWhen(t, today);
    // a clock time like "8h tối", "19h", "7 giờ sáng"
    if ((m = t.match(/\b(\d{1,2})\s*(?:h|gio)(?:\s*(\d{2}))?\s*(sang|trua|chieu|toi|dem)?\b/)) && !/\b\d+\s*(?:h|gio)\s*(?:bay|chay) /.test(t)) {
      let h = Number(m[1]); const part = m[3];
      if ((part === 'chieu' || part === 'toi' || part === 'dem') && h < 12) h += 12;
      if (h <= 24) e.clock = `${pad(h)}:${m[2] || '00'}`;
    }
    return e;
  }

  // ---------- intent detection (mirrors chatbot_intents) ----------
  const RX = {
    greet: /^(xin chao|chao|hello|hi|alo|hey)( ban| ad| admin| shop| em| anh| chi)?$/,
    thanks: /^(cam on|thank|thanks|tks|ok cam on)/,
    outOfScope: /\b(da lat|phu quoc|vung tau|ha long|da nang|nha trang|sa pa|sapa|fansipan|gia vang|bitcoin|chung khoan|xo so|bong da|ty gia|lai suat|thoi su)\b/,
    contact: /ban ve online|ve online|online|truc tuyen|mua ve (o|tai) (cong|quay|ga|cho)|mua (ve )?truc tiep|quay ve|mua tai cho|lien he|so dien thoai|\bsdt\b|email|website|trang web|dat ve|mua ve online|mua ve o dau|mua ve dau|tong dai|cham soc khach hang/,
    refund: /\bhoan\b|hoan ve|huy ve|doi ve|tra ve|hoan tien|hoan huy|doi tra|\bhuy\b/,
    stay: /khach san|nha nghi|homestay|o lai|ngu lai|ngu tren|luu tru|qua dem|thue phong|\bphong\b|cam trai/,
    foodOutside: /mang (theo )?(do an|thuc an|do uong|nuoc|do)|tu mang|mang vao|dem do an/,
    food: /\ban\b|an uong|do an|mon an|nha hang|quan an|dac san|\bmon\b|an trua|an toi|an sang|cafe|ca phe|\bkem\b|do uong|an gi|an chay|mon chay|doi truong|qua tang|lam qua|food|muoi tom|banh trang|banh canh|bo to|mua o dau|mua gi/,
    price: /bao nhieu tien|het bao nhieu|ton bao nhieu|mat bao nhieu|\bcombo\b|\bphi\b|mien phi|giam gia|duoc giam|\bgiam\b|uu dai|khuyen mai|\bre\b|re hon|tiet kiem|\bmat ve\b|tinh ve/,
    hours: /may h mo|mo luc may|dong luc may|may h dong|ngung chay|mo cua|dong cua|van hanh|chuyen cuoi|chuyen dau|chuyen som|mo den|den may gio|may gio (mo|dong|chay|ket thuc|bat dau)|chay (tu|den) may gio|chay den|lich chay|gio mo|gio dong|gio chay|gio hoat dong|gio phuc vu|phuc vu (tu|den|may gio)/,
    hoursLoose: /con (di|len|chay)|con kip|may gio|\bgio\b|may h\b|\bmay h |luc nao|khi nao|vao gio nao|gio nao|an vao luc/,
    events: /su kien|dang dang|dang den|trien lam|thang nay|tuan nay|sap toi|co gi moi|co gi vui|hoat dong gi|thang 11|thang 12|toi thu 7|toi thu bay/,
    explore: /choi gi|lam gi (o|tai|khi|de|cho)|lam gi\s*$|co gi (hay|vui|dep|de|choi|xem|tham quan|dac biet)|co gi\s*(khong|ko|k)?\s*$|\bdi dau\b|tham quan (gi|dau|nhung|cho nao)|diem (tham quan|den)|co nhung (gi|diem|cho)|nen (xem|di) (gi|dau)|choi o dau|trai nghiem gi|hoat dong gi|co gi$/,
    layout: /(?<!(san|bien|ngam|dam|tang) )(may|bao nhieu) (khu|tang|khu vuc|phan)\b|chia (tang|khu|lam may|thanh may)|bo cuc|so do khu|cau truc khu/,
    itineraryCost: /chi phi|du tru|tong chi|het bao nhieu tien 1 ngay|mang bao nhieu tien/,
  };

  const NOT_FOOD = /an toan|an tam|an yen|binh an|an lac|tam an|cau an|an nhien|an khang|an ninh|nut doi|\bdoi (gi|duoc|ve|lich)\b/g;
  const foodTest = (t) => RX.food.test(t.replace(NOT_FOOD, ' '));
  const NOT_PRICE = /gia dinh|gia tri|tham gia|gia vi|\b(nguoi|ba me|bo me|cha me|me|bo|ong|ba|cu|ong ba) gia\b|tien thach|thien tien|tien canh/g;
  const priceTest = (t) => RX.price.test(t.replace(NOT_PRICE, ' '));

  function detectIntent(e) {
    const t = e.t;
    if (RX.greet.test(t)) return 'greeting';
    if (RX.thanks.test(t)) return 'thanks';
    if (RX.outOfScope.test(t) && !foodTest(t)) return 'out_of_scope';
    if (RX.refund.test(t)) return 'faq';
    if (RX.contact.test(t)) return 'faq';
    if (RX.stay.test(t)) return 'faq';
    if (/limousine|xe khach|xe buyt|\bbus\b|nha xe|\bgrab\b|taxi|xang xe|gui xe|giu xe|bai xe|xe may.*cho gui(?! do)/.test(t) && !(e.vanson || e.chuahang || e.taman || e.buffet || e.combo)) return 'faq';
    if (RX.foodOutside.test(t)) return 'food';
    const askHowMuch = /\bbao nhieu\b|\bbn\b|het nhieu|gia sao/.test(t) && !/(cao|do cao|rong|dai|xa|nang|sau|lau|tuoi|mon) bao nhieu/.test(t) && !/bao nhieu (gio|phut|tieng|lau|km|met|m\b|mon|tuoi|tang|khu|nguoi|cho|ngay|do|cay|so|nam|mua)/.test(t) && (e.vanson || e.chuahang || e.taman || e.buffet || e.combo || e.entrance || /cap treo|\bcap\b/.test(t));
    const priceWords = askHowMuch || priceTest(t) || e.nAdult || e.nChild || ((e.saysVe || e.saysGia || e.saysTien) && !/\bgia (dinh|tri)\b/.test(t));
    const hoursWords = RX.hours.test(t) || (RX.hoursLoose.test(t) && (e.vanson || e.chuahang || e.taman || e.buffet || e.tamlinh || e.venueHit || /cap treo|\bcap\b|cong|khu du lich/.test(t)) && !/\bnen\b|san may|\bdep\b|hop ly/.test(t));
    if (RX.itineraryCost.test(t) && !e.buffet && !e.vanson && !e.chuahang && !e.taman && !e.combo) return 'faq';
    const priceExplicit = e.saysGia || e.saysVe || e.saysTien || /bao nhieu|\bbn\b|het nhieu|mien phi|giam/.test(t) || e.nAdult || e.nChild;
    if (hoursWords && (!priceWords || !priceExplicit)) return 'hours';
    if (RX.events.test(t) && !priceWords && !e.destHit && !/thoi tiet|nhiet do|\bmua (kho|mua)\b|co mua|troi mua|mua khong|nong|lanh/.test(t)) return 'events';
    if (priceWords && (e.buffet || e.vanson || e.chuahang || e.taman || e.combo || e.night || e.entrance || e.yearpass || e.fastpass || e.guide ||
        e.student || e.local || e.monk || e.elderly || e.child || e.disabled || e.poor || e.height || e.nAdult || e.nChild || /cap treo|\bcap\b|ve tham quan|bang gia|gia ve|mua ve|loai ve/.test(t))) return 'pricing';
    if (e.buffet && !foodTest(t.replace('buffet', ''))) return hoursWords ? 'hours' : 'pricing';
    if (e.vegetarian || foodTest(t) || (e.venueHit && !hoursWords)) return 'food';
    const destNamed = e.destHit;
    if (RX.layout.test(t) && !destNamed) return 'layout';
    if (RX.explore.test(t) && !destNamed && !/neu|bi lac|lac duong|cap cuu/.test(t)) return 'explore';
    if (priceWords && (e.saysVe || e.saysGia)) return 'pricing';
    return 'faq';
  }

  // ---------- engine ----------
  function createBot(DATA) {
    const D = DATA;
    const byId = {};
    for (const [sheet, rows] of Object.entries(D)) {
      if (!Array.isArray(rows)) continue;
      for (const r of rows) { const id = Object.values(r)[0]; if (id) byId[id] = { sheet, row: r }; }
    }
    const intentDef = Object.fromEntries((D.chatbot_intents || []).map((i) => [i.intent_name, i]));
    const INTENT_MAP = { pricing: 'pricing_ticket', hours: 'opening_hours', food: 'food_stay', events: 'events_now', explore: 'explore_overview', layout: 'area_layout' };

    // ----- FAQ / KB retrieval index (idf over question + keywords) -----
    const STOP = new Set('co khong la o the nao gi duoc cho toi minh ban em anh chi oi a nhe voi va cua nhu thi se can nen di den nui ba den nhieu may ah vay ha hong k ko dc khi tai ra vao len xuong con cac nhung mot roi muon biet xin giup'.split(' '));
    const SYN = [[/\b(cho (minh |toi |em )?hoi|xin hoi|hoi tham|cho (minh|toi|em) biet)\b/g, ''], [/\b(thanh pho ho chi minh|tp\.? ?hcm|tphcm|ho chi minh|sai gon|\bsg\b)\b/g, 'hcm'], [/\bkhach san\b/g, 'khachsan'], [/\bnha nghi\b/g, 'nhanghi'], [/\bhoan\b|hoan huy|huy ve|doi tra/g, 'hoan'], [/\bmua ve\b/g, 'muave ve'], [/\bmua (online|truc tuyen)\b/g, 'muave online'], [/\bmua (o dau|gi|lam qua)\b/g, 'muasam'], [/\b(xe )?(bus|buyt)\b/g, 'xebuyt'], [/lam bang gi|chat lieu|duc tu|lam tu gi|bang chat gi/g, 'chatlieu'], [/chi phi|het (khoang )?bao nhieu tien|ton (khoang )?bao nhieu|du tru/g, 'chiphi'], [/\bvia ba\b/g, 'viaba'], [/\b(gui|dau|do|giu) xe\b|bai (dau |gui |do |giu )?xe|cho gui\b(?! do)/g, 'baixe'], [/tuyen cap|cap treo/g, 'captreo'], [/\b(may|bao nhieu) ngay\b/g, 'songay'], [/\btet\b|thang gieng|ram thang gieng|hoi xuan/g, 'thanggieng'], [/di tich( lich su)?|khang chien|di san (van hoa|lich su|khang chien)/g, 'ditich'], [/phuong tien cong cong|xe cong cong/g, 'congcong'], [/(may|nhung|bao nhieu|cac) cach (nao )?(de )?(di|den|toi)?/g, 'nhieucach cachdi'], [/\b(co on khong|on khong|phu hop|thich hop|hop khong)\b/g, 'phuhop'], [/\b(nguoi gia|(ba|bo|cha) me gia|ong ba|nguoi lon tuoi|cao tuoi|lon tuoi|nguoi gia yeu)\b/g, 'caotuoi'], [/\bbang (gi|phuong tien gi|xe gi|cach nao)\b|di chuyen|cach (nao )?(de )?di|di bang (gi|phuong tien gi)|di nhu the nao|lam sao (de )?(den|di|toi)|phuong tien|di lai/g, 'cachdi'], [/\b(grab|xanh sm|xe cong nghe|xe om|taxi)\b/g, 'taxi'], [/chup (hinh|anh)|song ao|check ?in/g, 'chupanh'], [/nguy hiem|an toan|rui ro/g, 'antoan'], [/mat bao lau|het bao lau|bao lau|bao nhieu (phut|tieng)|may (tieng|phut)/g, 'baolau'], [/khoang cach|bao xa|bao nhieu km|cach bao nhieu|co xa khong/g, 'baoxa'], [/\b(leo bo|leo nui|di bo len|leo len)\b/g, 'trekking'], [/\b(lanh|ret|nhiet do)\b/g, 'nhietdo'], [/khan cap|cap cuu|cuu ho|tai nan|gap nan/g, 'khancap'], [/\bcccd\b|can cuoc|chung minh nhan dan|giay to/g, 'cccd'], [/so dien thoai|\bsdt\b|so lien he|hotline|duong day nong/g, 'hotline']];
    const STOP_TONED = new Set('có không là ở thế nào gì được cho tôi mình bạn em anh chị ơi à nhé với và của như thì sẽ cần nên đi đến núi bà đen nhiều mấy ạ vậy hả hông k ko dc đc khi tại ra vào lên xuống con các những một rồi a nhiêu sao làm nha nhỉ hở hổng hỏng gì đâu nè đó này kia muốn biết xin giúp'.split(' '));
    // 1) synonyms are matched on the plain (unaccented) text, 2) a stopword is dropped only if the user did not type
    //    it with different diacritics (khỉ ≠ khi, chỗ ≠ cho); such accented look-alikes are kept with an 'x' suffix.
    const toks = (s) => {
      const words = String(s || '').toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      const forms = {};
      for (const w of words) { const k = norm(w); (forms[k] = forms[k] || []).push(w); }
      let x = words.map(norm).join(' ');
      SYN.forEach(([a, b]) => { x = x.replace(a, b); });
      const out = [];
      for (const w of x.split(' ')) {
        if (!w) continue;
        if (!STOP.has(w)) { out.push(w); continue; }
        const f = forms[w] && forms[w].shift();
        if (f && f !== w && !STOP_TONED.has(f)) out.push(w + 'x');
      }
      return out;
    };
    const grams = (w) => { const g = [...w]; for (let i = 0; i + 1 < w.length; i++) g.push(w[i] + '_' + w[i + 1]); return g; };
    const docsSrc = (D.faq || []).filter((f) => f.answer && !/^Truy xuất/.test(f.answer))
      .concat((D.travel_tips || []).map((r) => ({ faq_id: r.tip_id, question: r.question_pattern, answer: r.answer_snippet, keywords: r.topic, related_sheet: 'travel_tips', source_url: r.source_url })))
      .concat((D.events_culture || []).filter((r) => !/Expired/i.test(r.verification_status || '')).map((r) => ({ faq_id: r.event_id, question: r.event_name, answer: `${r.event_name}: ${r.time_period}. ${r.description}`, keywords: r.location, related_sheet: 'events_culture', source_url: r.source_url })))
      .concat((D.weather_info || []).map((r) => {
        const mm = String(r.months || '').match(/^(\d{1,2})-(\d{1,2})$/);
        const months = []; if (mm) { let a = Number(mm[1]); const z = Number(mm[2]); for (let i = 0; i < 12; i++) { months.push(a); if (a === z) break; a = a % 12 + 1; } }
        return { faq_id: r.weather_id, question: `Thời tiết ${r.season}${mm ? ` tháng ${months.join(', ')}` : ''}`, answer: mm ? `Tháng ${months.length > 3 ? months[0] + '–' + months[months.length - 1] : months.join(', ')} là ${lcFirst(r.season)}: ${lcFirst(r.typical_condition)} ${r.avoid_or_note}` : `${r.season}: ${lcFirst(r.typical_condition)} ${r.avoid_or_note}`,
          keywords: 'thoi tiet mua ' + months.map((x) => 'thang ' + x).join(' '), related_sheet: 'weather_info', source_url: r.source_url };
      }))
      .concat((D.knowledge_base || []).map((r) => ({ faq_id: r.kb_id, question: r.title, answer: r.content, keywords: r.keywords, related_sheet: 'knowledge_base', source_url: r.source_url, _kb: true })));
    const toned = (s) => String(s || '').toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const faqDocs = docsSrc.map((f) => ({
      f, set: new Set(grams(toks(f.question)).concat(grams(toks(f.keywords || '')))), qset: new Set(grams(toks(f.question))),
      tset: new Set(toned(f.question + ' ' + (f.keywords || ''))),
    }));
    const df = {};
    faqDocs.forEach((d) => d.set.forEach((g) => { df[g] = (df[g] || 0) + 1; }));
    const idf = (g) => Math.log(1 + faqDocs.length / (1 + (df[g] || 0))) * (g.includes('_') ? 1.6 : 1);

    function searchFaq(q, only) {
      const qg = uniq(grams(toks(q)));
      // accent check: words the user typed WITH diacritics must match the doc's diacritics (tầng ≠ tảng, mùa ≠ mua)
      const qToned = {};
      for (const w of toned(q)) { const k = norm(w); if (w !== k) (qToned[k] = qToned[k] || []).push(w); }
      const accentW = (d, g) => g.split('_').reduce((m, part) => {
        const forms = qToned[part];
        return forms && !forms.some((w) => d.tset.has(w)) ? Math.min(m, 0.2) : m;
      }, 1);
      const nUni = qg.filter((g) => !g.includes('_')).length;
      const unknown = qg.filter((g) => !g.includes('_') && g.length >= 3 && !/\d/.test(g) && !df[g]).length;
      const uniTotal = qg.filter((g) => !g.includes('_')).reduce((s, g) => s + idf(g), 0) || 1;
      const biTotal = qg.filter((g) => g.includes('_')).reduce((s, g) => s + idf(g), 0);
      let best = null;
      for (const d of faqDocs) {
        if (only && !only(d)) continue;
        let su = 0; let sb = 0; let sq = 0; let strong = 0; let strongMass = 0;
        for (const g of qg) {
          const w = accentW(d, g);
          if (d.set.has(g)) { if (g.includes('_')) sb += idf(g) * w; else { su += idf(g) * w; if (w >= 0.5) { strong++; strongMass += idf(g); } } }
          if (d.qset.has(g)) sq += idf(g) * w;
        }
        const qLen = [...d.qset].reduce((a, g) => a + idf(g), 0) || 1;
        let score = (0.6 * (su / uniTotal) + 0.15 * (biTotal ? sb / biTotal : 0) + 0.25 * (sq / qLen)) * (d.f._kb ? 0.85 : 1) * (d.f.priority === 'High' ? 1.04 : 1);
        // evidence rule: a multi-keyword question must match at least 2 keywords to be trusted
        if (nUni >= 2 && strong < 2 && strongMass / uniTotal < 0.55) score *= 0.55;
        if (unknown) score *= Math.pow(0.6, unknown);
        if (!best || score > best.score) best = { score, doc: d.f };
      }
      return best || { score: 0 };
    }

    // ----- destination matching -----
    // aliases come from Excel: destinations.search_aliases (comma-separated) + the destination name itself
    const ALIAS = Object.fromEntries((D.destinations || []).map((d) => [d.dest_id,
      uniq([norm(d.name)].concat(String(d.search_aliases || '').split(',').map((a) => norm(a)))).filter((a) => a.length >= 3)]));
    function matchDest(t) {
      let best = null;
      for (const [id, al] of Object.entries(ALIAS)) {
        for (const a of al) if (t.includes(a) && (!best || a.length > best.len)) best = { id, len: a.length };
      }
      return best ? (D.destinations || []).find((x) => x.dest_id === best.id) : null;
    }
    const destImage = (id) => {
      const m = (D.media_assets || []).filter((x) => x.dest_id === id).sort((a, b) => (String(b.is_primary) === 'TRUE') - (String(a.is_primary) === 'TRUE'))[0];
      return m ? { url: m.image_url, alt: m.alt_text || m.caption } : null;
    };

    // restaurant opening rows (Excel: operation_hours.service_category = restaurant, is_active = yes)
    const restaurantHours = () => {
      const rest = (D.operation_hours || []).filter((r) => r.is_active === 'yes' && r.service_category === 'restaurant');
      const main = rest.find((r) => !/suất/i.test(r.service_name));
      const slots = rest.filter((r) => /suất/i.test(r.service_name));
      return { main, slots, rows: rest, range: main ? `${hhmm(main.opening_time)}–${hhmm(main.closing_time)}` : '', slotTxt: slots.map((r) => `${hhmm(r.opening_time)}–${hhmm(r.closing_time)}`).join(' và ') };
    };
    const scheduleDate = () => {
      const v = (D.operation_hours || []).filter((r) => r.is_active === 'yes' && r.service_category === 'cable_car').map((r) => r.valid_from).filter((x) => /^\d{4}/.test(x || '')).sort().pop();
      return v ? isoToVn(v) : '';
    };

    // ----- pricing helpers -----
    const isActivePrice = (r, dayIso) => {
      if (!/^đang áp dụng/.test(r.applicability_status || '')) return false;
      if (r.valid_from && /^\d{4}/.test(r.valid_from) && dayIso < r.valid_from) return false;
      if (r.valid_to && /^\d{4}/.test(r.valid_to) && dayIso > r.valid_to) return false;
      return true;
    };
    const routesOf = (r) => { const n = norm(r.service_name); return { vs: n.includes('van son'), ch: n.includes('chua hang'), ta: n.includes('tam an') }; };
    const isAdult = (r) => /^người lớn( \(|$)/.test(r.customer_type || '');
    const isChild = (r) => /^trẻ em \(/.test(r.customer_type || '');
    const dayLabel = (d) => (/ngày thường/.test(d) ? 'ngày thường T2–T6' : /cuối tuần/.test(d) ? 'cuối tuần T7, CN' : '');

    function groupRows(rows) {
      const g = new Map();
      for (const r of rows) {
        const k = r.service_name + '|' + r.valid_day_type;
        if (!g.has(k)) g.set(k, { name: r.service_name, day: r.valid_day_type, cat: r.service_category, rows: [] });
        const it = g.get(k);
        it.rows.push(r);
        if (isAdult(r)) it.nl = r; else if (isChild(r)) it.te = r; else (it.other = it.other || []).push(r);
      }
      return [...g.values()];
    }
    function lineFor(it, who) {
      const dl = dayLabel(it.day) ? ` (${dayLabel(it.day)})` : '';
      if (it.nl || it.te) {
        const parts = [];
        if (it.nl && who !== 'child') parts.push(`**${it.nl.price_text}** người lớn`);
        if (it.te && who !== 'adult') parts.push(`**${it.te.price_text}** trẻ em`);
        return `- ${it.name}${dl}: ${parts.join(' · ')}`;
      }
      return it.other.map((r) => `- ${r.service_name}: **${r.price_text}**${r.service_category === 'yearly_pass' ? ` – ${String(r.conditions).toLowerCase()}` : ''}${/^(người lớn & trẻ em|đoàn khách)$/.test(r.customer_type) ? '' : ` (${r.customer_type})`}`).join('\n');
    }

    function answerPricing(e, ctx) {
      const t = e.t;
      const date = e.when.date || ctx.today;
      const dayIso = iso(date);
      const all = D.services_pricing || [];
      const current = all.filter((r) => /^đang áp dụng/.test(r.applicability_status || ''));
      let active = all.filter((r) => isActivePrice(r, dayIso));
      let expiredNote = '';
      const cats = new Set();
      const notes = [];
      let who = e.adult && !e.child ? 'adult' : e.child && !e.adult ? 'child' : null;
      const wantRoutes = { vs: e.vanson, ch: e.chuahang, ta: e.taman };
      const nRoutes = Object.values(wantRoutes).filter(Boolean).length;

      // height / age logic
      if (e.height != null) {
        if (e.height < 1) { cats.add('free_policy'); notes.push(`Bé cao ${String(e.height).replace('.', 'm').replace(/^0m/, '')}${e.height < 1 ? ' (dưới 1m)' : ''} được **miễn phí vé cáp treo**. Lưu ý: không miễn phí buffet hoặc combo có buffet.`); who = 'child'; }
        else if (e.height <= 1.4) { who = 'child'; notes.push(`Cao ${e.height.toFixed(2).replace('.', 'm')} → mua **vé trẻ em** (áp dụng cho khách cao 1m–1m4).`); }
        else { who = 'adult'; notes.push(`Cao trên 1m4 → mua **vé người lớn**.`); }
      }
      if (e.monk) { cats.add('free_policy'); }
      if (e.elderly) {
        if (e.age >= 80 || /80/.test(t)) cats.add('free_policy');
        else if (e.age >= 60) notes.push(`Người ${e.age} tuổi **chưa thuộc diện miễn vé cáp treo** (chỉ áp dụng từ 80 tuổi), nhưng được **giảm 50% vé cổng** theo NQ 36/2026.`);
        cats.add('entrance_exemption');
        if (!e.age) cats.add('free_policy');
      }
      if (e.disabled || e.poor) cats.add('entrance_exemption');
      if (e.child && e.age != null && e.age < 6) cats.add('entrance_exemption');
      if (/mien phi|duoc giam|\bgiam\b|uu dai|khuyen mai|re hon|tiet kiem/.test(t) && !e.student && !e.local && !e.monk && !e.elderly && !e.height && !e.child && !e.disabled && !e.poor) {
        ['night_ticket', 'student', 'local_discount', 'free_policy'].forEach((c) => cats.add(c));
      }
      if (e.student) cats.add('student');
      if (e.local) cats.add('local_discount');
      if (e.entrance) { cats.add('entrance'); if (!e.student && !e.local) cats.add('entrance_exemption'); }
      if (e.yearpass) cats.add('yearly_pass');
      if (e.fastpass) cats.add('priority');
      if (e.guide) cats.add('tour_guide');
      const discountMode = e.student || e.local;
      if (!discountMode) {
        if (/combo hoang hon|hoang hon 986/.test(t)) cats.add('night_combo_food');
        else if (e.night) { cats.add('night_ticket'); if (e.buffet || foodTest(t) || /hoang hon/.test(t)) cats.add('night_combo_food'); }
        else if (e.buffet) { if (e.combo || nRoutes >= 2) cats.add('combo_buffet'); else cats.add('buffet'); }
        else if (nRoutes || e.combo) { if (nRoutes >= 2 || e.combo) cats.add('combo_cable'); if (nRoutes === 1 && !e.combo) cats.add('cable_car'); }
      }
      const includeQ = /bao gom|co gom|gom ca|da gom|gom (nhung )?gi|tinh ca|co kem|kem theo|co luon|co (nhung )?gi trong/.test(t);
      if (includeQ && [...cats].some((c) => !/^entrance/.test(c))) { cats.delete('entrance'); cats.delete('entrance_exemption'); }
      let overview = false;
      if (!cats.size) { overview = true; ['entrance', 'cable_car', 'combo_cable', 'buffet'].forEach((c) => cats.add(c)); }

      let rows = active.filter((r) => cats.has(r.service_category));
      if (!rows.length && current.some((r) => cats.has(r.service_category))) {
        // requested ticket types exist but none valid on that date → answer with latest prices, clearly marked as reference
        const maxTo = current.filter((r) => cats.has(r.service_category)).map((r) => r.valid_to).filter((v) => /^\d{4}/.test(v || '')).sort().pop();
        expiredNote = `Bảng giá hiện có chỉ áp dụng đến **${isoToVn(maxTo)}**; giá cho ngày ${vnDate(date)} chưa được công bố. Dưới đây là giá gần nhất để bạn **tham khảo**:`;
        active = current;
        rows = active.filter((r) => cats.has(r.service_category));
      }
      // route filter
      const routeCats = new Set(['cable_car', 'night_ticket', 'student', 'local_discount', 'combo_buffet', 'combo_cable']);
      if (nRoutes) {
        rows = rows.filter((r) => {
          if (!routeCats.has(r.service_category)) return true;
          const rr = routesOf(r);
          const isCombo = /combo/i.test(r.service_name);
          if (r.service_category === 'combo_buffet') return nRoutes >= 2 ? rr.vs && rr.ch : (wantRoutes.vs ? true : rr.ch);
          if (nRoutes >= 2 || e.combo) return isCombo && Object.keys(wantRoutes).every((k) => !wantRoutes[k] || rr[k]);
          return !isCombo && Object.keys(wantRoutes).every((k) => wantRoutes[k] === rr[k]);
        });
      }
      // one-way
      if (e.oneway) {
        if (wantRoutes.vs || wantRoutes.ta) notes.push('Tuyến Vân Sơn và Tâm An **chỉ bán vé khứ hồi**; chỉ tuyến Chùa Hang có vé 1 chiều.');
        if (!nRoutes || wantRoutes.ch) rows = active.filter((r) => r.direction === '1 chiều').concat(rows.filter((r) => !wantRoutes.ch));
        else rows = rows.concat(active.filter((r) => r.direction === '1 chiều'));
      } else if (cats.has('cable_car')) rows = rows.filter((r) => r.direction !== '1 chiều' || !wantRoutes.ch || e.oneway);
      // day type for buffet combos
      if (e.when.dayType) rows = rows.filter((r) => !/ngày thường|cuối tuần/.test(r.valid_day_type) || (e.when.dayType === 'weekday') === /ngày thường/.test(r.valid_day_type));
      // free policy filtering by persona
      if (cats.has('free_policy') && (e.monk || e.elderly || e.height != null)) {
        rows = rows.filter((r) => r.service_category !== 'free_policy' || (e.monk && /Tăng Ni/.test(r.service_name)) ||
          (e.elderly && /80 tuổi/.test(r.service_name) && (!e.age || e.age >= 80)) || (e.height != null && e.height < 1 && /dưới 1m/.test(r.service_name)));
      }
      if (cats.has('entrance_exemption') && e.elderly && !e.disabled && !e.poor) {
        rows = rows.filter((r) => r.service_category !== 'entrance_exemption' || /Giảm 50%/.test(r.service_name));
      }

      const groups = groupRows(rows);
      // ----- natural-language composer: direct answer first, only what was asked, at most one tip -----
      const shortName = (n) => n.replace(/^(Sinh viên|Sau 17h|Người dân Tây Ninh): /, '').replace(/^Vé cáp treo tuyến /, 'Cáp ').replace(/^Vé cáp /, 'Cáp ')
        .replace(/ \((khứ hồi|2 chiều)\)/, '').replace(/Đỉnh Vân Sơn/g, 'Vân Sơn').replace(/^Combo Hoàng Hôn 986m_(\d) \((.*)\)$/, 'Gói $1 ($2)').replace(/^Thuê hướng dẫn viên /, '').replace(/ \(Unlimited Cable car card\)/, '').replace(/HOẶC/g, 'hoặc').replace(/^Vé vào cổng khu du lịch Núi Bà Đen$/, 'Vé vào cổng').replace(/ \(mua lẻ\)/, ' (mua lẻ)');
      const items = [];
      for (const g of groups) { let it = items.find((x) => x.name === g.name); if (!it) { it = { name: g.name, cat: g.cat, days: [] }; items.push(it); } it.days.push(g); }
      const priceOf = (g) => {
        if (who === 'child' && g.te) return `**${g.te.price_text}** (vé trẻ em)`;
        if (who === 'adult' && g.nl) return `**${g.nl.price_text}**`;
        return `**${g.nl ? g.nl.price_text : '?'}** người lớn${g.te ? `, **${g.te.price_text}** trẻ em` : ''}`;
      };
      const fmtItem = (it) => {
        const nm = shortName(it.name); const d = it.days;
        if (d.length === 2 && d.every((g) => g.nl)) {
          const [wd, we] = /ngày thường/.test(d[0].day) ? d : [d[1], d[0]];
          if (who === 'child' && wd.te) return `${nm}: trẻ em **${wd.te.price_text}** ngày thường, **${we.te.price_text}** cuối tuần`;
          return `${nm}: **${wd.nl.price_text}** ngày thường, **${we.nl.price_text}** cuối tuần${who !== 'adult' && wd.te ? ` (trẻ em ${wd.te.price_text} / ${we.te.price_text})` : ''}`;
        }
        const g = d[0]; const dl = dayLabel(g.day) && !e.when.dayType ? ` (${dayLabel(g.day)})` : '';
        if (g.nl || g.te) return `${nm}${dl}: ${priceOf(g)}`;
        return g.other.map((r) => (r.service_category === 'yearly_pass' ? `${r.conditions}: **${r.price_text}**` : `${shortName(r.service_name)}: **${r.price_text}**`)).join('\n- ');
      };
      const lines = [];
      const bullets = (list) => list.forEach((it) => lines.push('- ' + fmtItem(it)));
      const has = (c) => rows.some((r) => r.service_category === c);
      const onlyCats = (...cs) => rows.length && rows.every((r) => cs.includes(r.service_category));
      const isWE = date.getDay() === 0 || date.getDay() === 6;
      if (expiredNote) lines.push(expiredNote);
      else if (items.some((it) => it.days.some((g) => /ngày thường|cuối tuần/.test(g.day))) && e.when.dayType && !(e.nAdult || e.nChild) && items.length > 1) lines.push(e.when.date ? `${WD[date.getDay()]} ${vnDate(date)} là ${isWE ? 'cuối tuần' : 'ngày thường'}:` : `Giá ${isWE || e.when.dayType === 'weekend' ? 'cuối tuần (T7, CN)' : 'ngày thường (T2–T6)'}:`);

      // persona answers (who / age / height) – these ARE the answer
      const persona = [];
      if (e.height != null && e.height < 1) persona.push('Bé cao dưới 1m được **miễn phí vé cáp treo** (không miễn phí buffet hoặc combo có buffet).');
      else if (e.height != null && e.height <= 1.4) persona.push(`Bé cao ${e.height.toFixed(2).replace('.', 'm').replace(/0$/, '')} tính **vé trẻ em** (dành cho khách cao 1m–1m4)${nRoutes ? ':' : ' – giá vé trẻ em:'}`);
      else if (e.height != null) persona.push('Cao trên 1m4 thì mua **vé người lớn**:');
      if (e.monk) persona.push('Tăng Ni được **miễn phí vé cáp treo** khi có chứng nhận Tăng Ni hoặc Chứng điệp thọ giới (không miễn buffet).');
      if (e.elderly && (e.age >= 80 || (!e.age && /80/.test(t)))) persona.push('Người từ 80 tuổi được **miễn phí vé cáp treo**, chỉ cần mang CCCD hoặc hộ chiếu (không miễn buffet).');
      else if (e.elderly && e.age >= 60) persona.push(`Người ${e.age} tuổi **chưa thuộc diện miễn vé cáp** (chỉ miễn từ 80 tuổi), nhưng được **giảm 50% vé cổng** (còn 5.000đ) khi mang CCCD.`);
      else if (e.elderly) persona.push('Người từ 80 tuổi được **miễn phí vé cáp treo** (mang CCCD); người từ 60 tuổi được **giảm 50% vé cổng** (còn 5.000đ).');
      if (e.disabled) persona.push('Người khuyết tật đặc biệt nặng được **miễn vé cổng**, người khuyết tật nặng được **giảm 50% vé cổng** (mang giấy xác nhận); giá cáp treo tính bình thường.');
      if (e.poor) persona.push('Người thuộc hộ nghèo được **giảm 50% vé cổng** (còn 5.000đ) khi có giấy chứng nhận hộ nghèo; giá cáp treo tính bình thường.');
      if (e.child && e.age != null && e.age < 6) persona.push(`${e.entrance ? 'Không mất. ' : ''}Trẻ dưới 6 tuổi (hoặc cao dưới 1m) được **miễn vé cổng**${e.entrance ? '' : ' và miễn vé cáp nếu cao dưới 1m'}.`);
      persona.forEach((x) => lines.push(x));
      const personaDone = persona.length && !(e.height != null && e.height >= 1) && (rows.every((r) => /free_policy|entrance_exemption/.test(r.service_category)) || (e.child && e.age < 6 && e.entrance));

      if (!personaDone) {
        const cableItems = items.filter((it) => !/^entrance/.test(it.cat) && it.cat !== 'free_policy');
        if ((e.nAdult || e.nChild) && items.some((it) => it.days.some((g) => g.nl || g.te))) {
          const its = overview ? items.filter((x) => (x.cat === 'cable_car' && /Vân Sơn/.test(x.name)) || x.cat === 'combo_cable') : [items.find((x) => /^combo/.test(x.cat)) || items.find((x) => x.days.some((g) => g.nl)) || items[0]];
          if (overview) lines.push('Tùy bạn đi tuyến nào, ví dụ:');
          for (const it of its) for (const p of it.days) {
            const nl = (e.nAdult || 0) * (p.nl ? p.nl.price_vnd : 0); const te = (e.nChild || 0) * (p.te ? p.te.price_vnd : 0);
            const gate = (e.nAdult || 0) * 10000 + (e.nChild || 0) * 5000;
            const calc = [e.nAdult && p.nl ? `${e.nAdult} × ${money(p.nl.price_vnd)}` : '', e.nChild && p.te ? `${e.nChild} × ${money(p.te.price_vnd)}` : ''].filter(Boolean).join(' + ');
            lines.push(`${shortName(it.name)}${dayLabel(p.day) ? ` (${dayLabel(p.day)})` : ''} cho ${e.nAdult ? e.nAdult + ' người lớn' : ''}${e.nAdult && e.nChild ? ' + ' : ''}${e.nChild ? e.nChild + ' trẻ em' : ''}: ${calc} = **${money(nl + te)}**, cộng vé cổng ${money(gate)} là **${money(nl + te + gate)}**.`);
          }
        } else if (includeQ) {
          const it = cableItems[0] || items[0]; const r0 = it && (it.days[0].nl || it.days[0].rows[0]);
          const yesNo = /(co |bao )gom .* (khong|ko)\b|co bao gom|(co |da )?tinh .* (khong|ko)\b|co kem .* khong/.test(t);
          if (r0) {
            const excl = String(r0.excluded_services || '').toLowerCase(); const incl = lcFirst(r0.included_services || '');
            const asked = excl.split(',').map((x) => x.trim()).find((x) => x && t.includes(norm(x)));
            if (yesNo && asked) lines.push(`Không, ${shortName(it.name)} **không bao gồm ${asked}**${/cổng/.test(asked) ? ' (10.000đ người lớn, 5.000đ trẻ em, mua riêng)' : ''}. Gói này gồm ${incl}.`);
            else lines.push(`**${shortName(it.name)}** gồm ${incl}; giá ${priceOf(it.days[0])}.`);
          }
        } else if (overview) {
          if (!expiredNote && !persona.length && who !== 'child') lines.push('Giá vé cáp treo khứ hồi hiện tại (áp dụng đến 31/12/2026):');
          const ov = items.filter((it) => /cable_car|combo_cable/.test(it.cat) && !/1 chiều/.test(it.name));
          if (who === 'child') {
            const list = ov.map((it) => `${lcFirst(shortName(it.name))} **${it.days[0].te.price_text}**`).join(', ');
            if (e.height != null) { lines.length = 0; lines.push(`${/khong\s*$|phai mua/.test(t) ? 'Có, b' : 'B'}é cao ${e.height.toFixed(2).replace('.', 'm').replace(/0$/, '')} tính **vé trẻ em** (1m–1m4): ${list}.`); }
            else lines.push(`Vé trẻ em (cao 1m–1m4): ${list}. Bé dưới 1m được miễn phí vé cáp.`);
          }
          else {
            bullets(ov);
            const gate = rows.find((r) => r.service_category === 'entrance' && isAdult(r));
            lines.push(`Bé dưới 1m miễn phí${gate ? `; vé vào cổng ${gate.price_text} tính riêng` : ''}. Sinh viên, người Tây Ninh và vé sau 17h có giá rẻ hơn.`);
          }
        } else if (onlyCats('entrance', 'entrance_exemption') && has('entrance')) {
          const it = items.find((x) => x.cat === 'entrance');
          lines.push(`Vé vào cổng khu du lịch là ${priceOf(it.days[0])} (chưa gồm cáp treo).`);
          if (has('entrance_exemption') && !persona.length) lines.push('Trẻ dưới 6 tuổi và người khuyết tật đặc biệt nặng được miễn; người từ 60 tuổi, trẻ 6–16 tuổi, hộ nghèo được giảm 50%.');
        } else if (onlyCats('buffet', 'combo_buffet') && has('buffet') && !e.combo) {
          const bf = items.find((x) => x.cat === 'buffet');
          const rh = restaurantHours();
          const exists = /co .*buffet|buffet .*khong|o dau/.test(t);
          lines.push(who === 'child' && bf.days[0].te ? `Vé buffet trẻ em (cao 1m–1m4) là **${bf.days[0].te.price_text}**, mua kèm vé cáp lên đỉnh.` : `${exists && rh.main ? `Có, trên đỉnh có Buffet Vân Sơn (mở ${rh.range}). ` : ''}Vé buffet mua lẻ ${priceOf(bf.days[0])} (cần có vé cáp lên đỉnh).`);
        } else if (cableItems.length === 1 && e.height != null && e.height >= 1 && e.height <= 1.4 && cableItems[0].days[0].te) {
          const it = cableItems[0];
          lines.length = 0;
          lines.push(`${/khong\s*$|phai mua/.test(t) ? 'Có, ' : ''}bé cao ${e.height.toFixed(2).replace('.', 'm').replace(/0$/, '')} tính **vé trẻ em** (1m–1m4): ${lcFirst(shortName(it.name))}${it.cat === 'cable_car' && !/1 chiều/.test(it.name) ? ' khứ hồi' : ''} **${it.days[0].te.price_text}**.`.replace(/^b/, 'B'));
        } else if (cableItems.length === 1 && cableItems[0].days.length <= 2 && cableItems[0].days.every((g) => g.nl || g.te) && !has('student') && !has('local_discount')) {
          const it = cableItems[0];
          const label = it.cat === 'cable_car' ? `Vé ${shortName(it.name).replace(/^Cáp /, 'cáp ')}${/1 chiều/.test(it.name) ? '' : ' (khứ hồi)'}` : shortName(it.name);
          if (it.days.length === 2) lines.push(fmtItem(it).replace(/^([^:]+):/, '$1 giá') + '.');
          else lines.push(`${label}${dayLabel(it.days[0].day) ? ` (${dayLabel(it.days[0].day)})` : ''} giá ${priceOf(it.days[0])}${it.cat === 'night_ticket' ? ', áp dụng khi lên cáp từ 17:00' : ''}${it.cat === 'night_combo_food' ? ' (lên cáp từ 17:00)' : ''}.`);
        } else {
          const intro = has('student') ? 'Có, sinh viên được giá riêng khi xuất trình **thẻ sinh viên** còn hạn:'
            : has('local_discount') ? 'Có, người có hộ khẩu Tây Ninh (gồm **Long An** cũ) được giá ưu đãi khi mang CCCD, mua tại quầy:'
            : onlyCats('night_combo_food') ? 'Combo Hoàng Hôn 986m (vé cáp sau 17h kèm 1 suất ăn tối):'
            : has('night_ticket') ? 'Lên cáp từ **17:00** được giá rẻ hơn:'
            : has('yearly_pass') ? 'Vé năm cáp treo (đi không giới hạn trong năm):'
            : has('tour_guide') ? 'Thuê hướng dẫn viên (1 HDV cho tối đa 20 khách; quá giờ phụ thu **150.000đ**/giờ/HDV):'
            : has('priority') ? '' : '';
          const one = (cableItems.length ? cableItems : items);
          if ((has('student') || has('local_discount')) && one.length === 1) {
            const g = one[0].days[0]; const pr = g.nl || g.te ? priceOf(g) : `**${g.other[0].price_text}**`;
            lines.push(has('student') ? `Có, sinh viên đi ${lcFirst(shortName(one[0].name))} giá ${pr} (xuất trình thẻ sinh viên còn hạn).` : `Có, người có hộ khẩu Tây Ninh (gồm **Long An** cũ) đi ${lcFirst(shortName(one[0].name))} giá ${pr} (mang CCCD, mua tại quầy).`);
          } else if (has('priority') && items.length === 1) lines.push('WOW PASS Silver (lối đi ưu tiên, không phải xếp hàng) phụ thu **300.000đ**/người, mua thêm kèm vé cáp.');
          else {
            if (intro) lines.push(intro);
            bullets(cableItems.length ? cableItems : items);
          }
        }
        if (e.onewayGeneric) lines.unshift('Có, nhưng chỉ tuyến Chùa Hang (lên Chùa Bà) có vé 1 chiều; Vân Sơn và Tâm An chỉ bán khứ hồi.');
        if (e.oneway && (wantRoutes.vs || wantRoutes.ta)) {
          const ow = active.filter((r) => r.direction === '1 chiều');
          const rt = active.filter((r) => r.service_category === 'cable_car' && routesOf(r).vs && !routesOf(r).ch);
          lines.length = 0;
          lines.push(`Không, tuyến Vân Sơn (và Tâm An) **chỉ bán vé khứ hồi**: ${rt.find(isAdult) ? rt.find(isAdult).price_text : ''} người lớn, ${rt.find(isChild) ? rt.find(isChild).price_text : ''} trẻ em. Vé 1 chiều chỉ có ở tuyến Chùa Hang: ${ow.find(isAdult) ? ow.find(isAdult).price_text : ''} / ${ow.find(isChild) ? ow.find(isChild).price_text : ''}.`);
        }
        // one tip at most
        if (has('buffet') && e.buffet && !e.combo && !e.night && who !== 'child') {
          const vs = active.find((r) => r.service_category === 'cable_car' && routesOf(r).vs && isAdult(r));
          const bf = active.find((r) => r.service_category === 'buffet' && isAdult(r));
          const cb = active.find((r) => r.service_category === 'combo_buffet' && /ngày thường/.test(r.valid_day_type) && isAdult(r) && !routesOf(r).ch);
          if (vs && bf && cb) lines.push(`💡 Mua combo cáp Vân Sơn + buffet chỉ ${cb.price_text} (ngày thường), rẻ hơn mua lẻ ${money(vs.price_vnd + bf.price_vnd)}.`);
        } else if (/re hon|tiet kiem|uu dai|giam/.test(t) && has('cable_car') && nRoutes === 1 && !e.night && !discountMode && !e.oneway) {
          const n = active.find((r) => r.service_category === 'night_ticket' && Object.keys(wantRoutes).every((k) => !!wantRoutes[k] === routesOf(r)[k]) && isAdult(r));
          if (n) lines.push(`💡 Lên cáp sau 17h chỉ còn ${n.price_text}.`);
        }
      }
      // free-policy rows not covered by a persona sentence (e.g. "có ưu đãi gì")
      if (!persona.length && has('free_policy') && !overview) lines.push('Miễn vé cáp cho bé dưới 1m, Tăng Ni và người từ 80 tuổi (không miễn buffet).');

      return {
        text: lines.join('\n'), rows: rows.map((r) => r.service_id), sheets: ['services_pricing'],
        sources: uniq(rows.map((r) => String(r.source_url || '').split(' ; ')[0])),
        filters: { ngay: vnDate(date), loai_ve: [...cats], tuyen: Object.keys(wantRoutes).filter((k) => wantRoutes[k]), doi_tuong: who || 'cả hai', hieu_luc: expiredNote ? 'hết hạn → tham khảo' : 'valid_from ≤ ngày ≤ valid_to' },
        followups: overview ? ['Giá combo buffet cuối tuần?', 'Sinh viên có giảm không?', 'Vé sau 17h bao nhiêu?'] : ['Còn trẻ em thì sao?', 'Có combo rẻ hơn không?', 'Cáp chạy mấy giờ?'],
      };
    }

    function answerHours(e, ctx) {
      const t = e.t;
      const active = (D.operation_hours || []).filter((r) => r.is_active === 'yes');
      const explicit = !!(e.when.date || e.when.dayType);
      const day = e.when.date || ctx.today;
      const dayType = e.when.dayType || (day.getDay() % 6 === 0 ? 'weekend' : 'weekday');
      const isToday = !e.when.date && !e.when.dayType;
      const sameDay = (r) => r.day_type === 'cả tuần' || (dayType === 'weekend') === /thứ 7/.test(r.day_type);
      const other = (r) => r.day_type !== 'cả tuần' && !sameDay(r);
      const when = e.when.date ? `${WD[day.getDay()]}, ${vnDate(day)}` : e.when.dayType ? (dayType === 'weekend' ? 'Cuối tuần (T7, CN)' : 'Ngày thường (T2–T6)') : `Hôm nay (${WD[day.getDay()]}, ${vnDate(day)})`;
      const rng = (r) => `${hhmm(r.opening_time)}–${hhmm(r.closing_time)}`;
      const lines = []; const used = [];
      // a named food place (Excel food_stay.search_aliases) that is not the buffet → its own opening hours
      const venue = matchVenue(t);
      if (venue && !/buffet/i.test(venue.type || '') && !e.clock) {
        used.push(venue.item_id);
        const nm = venue.name.replace(/ \((Trạm|suất)[^)]*\)$/i, '');
        const oh = String(venue.opening_hours || '');
        const m = oh.match(/(\d\d:\d\d)\s*[–-]\s*(\d\d:\d\d)/);
        const tentative = /tham khảo|xác minh/i.test(oh + ' ' + (venue.verification_status || ''));
        const sp = active.find((x) => x.service_category === 'spiritual_area' && sameDay(x));
        const vs = active.find((x) => x.service_category === 'cable_car' && /Vân Sơn/.test(x.service_name) && sameDay(x));
        let txt;
        if (m) txt = `**${nm}** mở khoảng **${m[1]}–${m[2]}**${tentative ? ' (giờ tham khảo, chưa có thông báo chính thức)' : ''}.`;
        else if (/giờ khu đỉnh/i.test(oh)) { if (sp) used.push(sp.operation_id); txt = `**${nm}** chưa có giờ riêng, mở theo giờ khu đỉnh${sp ? ` – ${isToday ? 'hôm nay' : lcFirst(when)} khoảng **${rng(sp)}**` : ''}.`; }
        else if (/17:00/.test(oh)) { if (vs) used.push(vs.operation_id); txt = `**${nm}** áp dụng khi lên cáp từ **17:00**${vs ? `; ${isToday ? 'hôm nay' : lcFirst(when)} cáp Vân Sơn chạy đến **${hhmm(vs.closing_time)}**` : ''}.`; }
        else txt = oh ? `**${nm}**: ${oh}.` : `Mình chưa có giờ mở cửa của **${nm}**.`;
        return { text: txt, rows: uniq(used), sheets: ['food_stay', 'operation_hours'], sources: uniq([String(venue.source_url || '').split(' ; ')[0]]), filters: { dia_diem_an_uong: nm, food_stay_opening_hours: oh || '—' }, followups: ['Buffet mở mấy giờ?', 'Nhà hàng có món gì?'] };
      }
      const wantRest = e.buffet || (/an trua|nha hang/.test(t) && !venue);
      const wantSpirit = e.tamlinh;
      const wantGate = e.gate || /cong khu|cong vao|khu du lich (mo|dong)|mo cua khu/.test(t);
      const routes = !wantSpirit && (e.vanson || e.chuahang || e.taman) ? { 'Vân Sơn': e.vanson, 'Chùa Hang': e.chuahang, 'Tâm An': e.taman } : null;
      const wantCable = routes || (!wantRest && !wantSpirit && !wantGate) || /cap/.test(t);
      const lastOnly = /chuyen .{0,20}cuoi|cuoi cung|dong cua|den may gio|ket thuc|mo den|ngung chay|may gio dong/.test(t);
      const firstOnly = /chuyen (cap )?(dau|som)|bat dau chay/.test(t) && !lastOnly;
      // cable: group lines with identical hours ("cáp Vân Sơn và Chùa Hang chạy 05:30–20:30")
      const cablePhrase = (pred) => {
        const rs = active.filter((r) => r.service_category === 'cable_car' && pred(r) && (!routes || Object.keys(routes).some((k) => routes[k] && r.service_name.includes(k))));
        rs.forEach((r) => used.push(r.operation_id));
        const by = {};
        rs.forEach((r) => { const k = lastOnly ? hhmm(r.closing_time) : firstOnly ? hhmm(r.opening_time) : rng(r); (by[k] = by[k] || []).push(r.service_name.replace('Tuyến cáp ', '').replace('Đỉnh ', '')); });
        return Object.entries(by).map(([k, names]) => `cáp ${names.join(' và ')} ${lastOnly ? 'chuyến cuối lúc' : firstOnly ? 'chạy từ' : 'chạy'} **${k}**`).join(', ');
      };
      if (e.clock) {
        const cab = active.filter((r) => r.service_category === 'cable_car' && sameDay(r));
        const ok = cab.filter((r) => hhmm(r.closing_time) > e.clock && hhmm(r.opening_time) <= e.clock);
        const no = cab.filter((r) => !ok.includes(r));
        cab.forEach((r) => used.push(r.operation_id));
        const nm = (r) => r.service_name.replace('Tuyến cáp ', '').replace('Đỉnh ', '');
        lines.push(ok.length ? `Lúc ${e.clock} ${isToday ? 'hôm nay' : ''} vẫn đi được: cáp ${ok.map(nm).join(' và ')} chạy đến **${hhmm(ok[0].closing_time)}**.`.replace('  ', ' ') : `Lúc ${e.clock} không còn tuyến cáp nào chạy.`);
        if (no.length) lines.push(`Cáp ${no.map(nm).join(', ')} thì ${no.every((r) => hhmm(r.closing_time) <= e.clock) ? `đã dừng lúc ${hhmm(no[0].closing_time)}` : `chưa chạy (mở lúc ${hhmm(no[0].opening_time)})`}.`);
      } else {
        if (wantCable) {
          const ph = cablePhrase(sameDay);
          if (ph) lines.push(`${e.saysChuaBa && !wantSpirit ? 'Chùa Bà chưa có giờ mở cửa riêng trong dữ liệu; khách lên chùa bằng cáp Chùa Hang. ' : ''}${when}: ${ph}.`);
          if (!explicit && !routes && !lastOnly && !firstOnly) { const ph2 = cablePhrase(other); if (ph2) lines.push(`${dayType === 'weekend' ? 'Ngày thường (T2–T6)' : 'Cuối tuần (T7, CN)'}: ${ph2}.`); }
          else if (!explicit && routes) { const ph2 = cablePhrase(other); if (ph2 && ph2 !== cablePhrase(sameDay)) lines.push(`(${dayType === 'weekend' ? 'Ngày thường' : 'Cuối tuần'}: ${ph2}.)`); }
        }
        if (wantRest) {
          const rh = restaurantHours(); rh.rows.forEach((r) => used.push(r.operation_id));
          if (rh.main && lastOnly && !/suat/.test(t)) lines.push(`Buffet Vân Sơn đóng cửa lúc **${hhmm(rh.main.closing_time)}**${rh.slots.length ? ` (suất cuối ${rng(rh.slots[rh.slots.length - 1])})` : ''}.`);
          else if (rh.main) lines.push(/suat 1|suat mot/.test(t) && rh.slots[0] ? `Suất 1 của buffet: **${rng(rh.slots[0])}**.` : /suat 2|suat hai/.test(t) && rh.slots[1] ? `Suất 2 của buffet: **${rng(rh.slots[1])}**.` : `Buffet Vân Sơn mở **${rh.range}** hằng ngày${rh.slots.length ? `, chia ${rh.slots.length} suất: **${rh.slotTxt}** – nên đến đúng giờ suất đã chọn` : ''}.`);
        }
        if (wantSpirit) {
          const r = active.find((x) => x.service_category === 'spiritual_area' && sameDay(x));
          if (r) { used.push(r.operation_id); lines.push(`${when}: khu tâm linh trên đỉnh ${lastOnly ? `đóng cửa lúc **${hhmm(r.closing_time)}**` : `mở **${rng(r)}**`}.`); }
        }
        if (wantGate) {
          const vs = active.find((x) => x.service_category === 'cable_car' && /Vân Sơn/.test(x.service_name) && sameDay(x));
          const g = active.find((x) => x.service_category === 'entrance_gate'); if (g) used.push(g.operation_id);
          if (vs) lines.push(`Cổng khu du lịch mở trước giờ cáp 1 tiếng và đóng sau 1 tiếng – ${isToday ? 'hôm nay' : when.toLowerCase()} khoảng **${addMin(hhmm(vs.opening_time), -60)}–${addMin(hhmm(vs.closing_time), 60)}**.`);
        }
      }
      if (!lines.length) lines.push('Mình chưa có thông tin giờ cho dịch vụ này.');
      return {
        text: lines.join('\n'), rows: uniq(used), sheets: ['operation_hours'],
        sources: uniq(used.map((id) => byId[id] && String(byId[id].row.source_url || '').split(' ; ')[0])),
        filters: { is_active: 'yes', ngay: when, loai_ngay: dayType },
        followups: ['Buffet mở mấy giờ?', 'Giá vé sau 17h?', 'Nên đi lúc mấy giờ?'],
      };
    }

    const VENUE_ALIAS = (D.food_stay || []).map((r) => ({ r, al: uniq([norm(r.name)].concat(String(r.search_aliases || '').split(',').map(norm))).filter((a) => a.length >= 3) }));
    function matchVenue(t) {
      let best = null;
      for (const v of VENUE_ALIAS) for (const a of v.al) if (t.includes(a) && (!best || a.length > best.len)) best = { r: v.r, len: a.length };
      return best && best.r;
    }
    function answerVenue(v, e, ctx) {
      const date = e.when.date || ctx.today;
      const active = (D.services_pricing || []).filter((r) => isActivePrice(r, iso(date)));
      const rh = restaurantHours();
      const isBuffet = /buffet/i.test(v.type || ''); const isDinner = /ăn tối/i.test(v.type || '');
      const used = [v.item_id]; const lines = [];
      const sd = v.short_description || String(v.description || '').split('. ')[0];
      const askWhere = /o dau|cho nao|vi tri|nam dau|nam o/.test(e.t);
      const askMenu = /mon gi|co gi|an gi|ban gi|menu|thuc don|gom|bao nhieu mon|may mon/.test(e.t);
      const askPrice = /gia|bao nhieu|tien/.test(e.t);
      let price = '';
      if (isBuffet) {
        const nl = active.find((r) => r.service_category === 'buffet' && isAdult(r)); const te = active.find((r) => r.service_category === 'buffet' && isChild(r));
        if (nl) { used.push(nl.service_id); price = `vé **${nl.price_text}** người lớn${te ? `, **${te.price_text}** trẻ em` : ''}`; }
        rh.rows.forEach((r) => used.push(r.operation_id));
      } else if (isDinner) {
        const n = active.filter((r) => r.service_category === 'night_combo_food' && isAdult(r)).sort((a, b) => a.price_vnd - b.price_vnd)[0];
        if (n) { used.push(n.service_id); price = `từ **${n.price_text}**/người lớn`; }
      }
      const hours = isBuffet && rh.main ? `mở **${rh.range}** (2 suất: ${rh.slotTxt})` : v.opening_hours && !/^Theo giờ/i.test(v.opening_hours) ? (/^\d|^Tham khảo/i.test(v.opening_hours) ? `giờ ${String(v.opening_hours).replace(/^Tham khảo /i, 'tham khảo ')}` : lcFirst(v.opening_hours)) : '';
      if (askWhere) lines.push(`**${v.name}** ${/Food – đặc sản/i.test(v.type) ? 'có ở' : 'nằm ở'} ${lcFirst(v.location_scope)}${hours ? `, ${hours}` : ''}.`);
      else if (askMenu) lines.push(`**${v.name.replace(/ \(.*\)$/, '')}** – ${lcFirst(String(v.description).split('. ')[0].replace(/^(Nhà hàng|Buffet trưa) /, (w) => (/Buffet/.test(w) ? 'buffet trưa ' : '')).replace(/\.$/, ''))}.`);
      else if (askPrice && price) lines.push(`**${v.name}**: ${price}${isBuffet ? ' (cần có vé cáp lên đỉnh)' : ''}.`);
      else lines.push(`Có, **${v.name}** ở ${lcFirst(v.location_scope)} – ${sd}${hours ? `; ${hours}` : ''}${price ? `; ${price}` : ''}.`);
      if (!isBuffet && !isDinner && askPrice && v.price_note) lines.push(`Giá: ${v.price_note}`);
      return { text: lines.join('\n'), rows: uniq(used), sheets: ['food_stay', 'operation_hours', 'services_pricing'], sources: uniq(String(v.source_url || '').split(' ; ')),
        filters: { dia_diem_an_uong: v.name }, followups: ['Có món chay không?', 'Còn chỗ ăn nào khác?', 'Buffet giá bao nhiêu?'] };
    }

    function answerFood(e, ctx) {
      const t = e.t;
      const venue = !/nhung (cho|quan|nha hang)|cho nao|an gi|an uong|khac\b|tat ca|danh sach|dac san|an sang|an trua|an toi|bua (sang|trua|toi)/.test(t) && !e.vegetarian && !RX.foodOutside.test(t) ? matchVenue(t) : null;
      if (venue) return answerVenue(venue, e, ctx);
      const FS = D.food_stay || [];
      const byType = (re) => FS.filter((r) => re.test(r.type || ''));
      const date = e.when.date || ctx.today;
      const active = (D.services_pricing || []).filter((r) => isActivePrice(r, iso(date)));
      const p = (pred) => active.filter(pred);
      const rh = restaurantHours();
      const used = [];
      const lines = [];
      const srcOf = (r) => String(r.source_url || '').split(' ; ')[0];
      if (RX.foodOutside.test(t)) {
        const pol = byType(/^Policy/i);
        pol.forEach((r) => { used.push(r.item_id); lines.push(r.description); });
        return { text: lines.join('\n') || 'Chưa có thông tin chính thức về việc mang đồ ăn vào khu du lịch.', rows: used, sheets: ['food_stay'], sources: uniq(pol.map(srcOf)), filters: { food_stay_type: 'Policy' }, followups: ['Trên núi có những chỗ ăn nào?', 'Có món chay không?'] };
      }
      const bfNl = p((r) => r.service_category === 'buffet' && isAdult(r))[0];
      const bfTe = p((r) => r.service_category === 'buffet' && isChild(r))[0];
      const cbs = p((r) => r.service_category === 'combo_buffet' && isAdult(r) && !routesOf(r).ch);
      const night = p((r) => r.service_category === 'night_combo_food' && isAdult(r)).sort((x, y) => x.price_vnd - y.price_vnd);
      const specialty = /dac san|lam qua|qua tang|mua ve|mon ngon|nen thu|muoi tom|banh trang|bo to|mua o dau/.test(t) && !/tren (nui|dinh)/.test(t);
      const meal = /an sang|bua sang|buoi sang/.test(t) ? 'sang' : /an trua|bua trua/.test(t) ? 'trua' : /an toi|bua toi|buoi toi/.test(t) ? 'toi' : null;
      if (meal && !e.vegetarian && !specialty) {
        const inArea = FS.filter((x) => /trong khu/i.test(x.type || ''));
        const nm = (r) => r.name.replace(/ \(.*\)$/, '');
        if (meal === 'sang') {
          const early = inArea.filter((r) => /0[5-8]:\d\d/.test(r.opening_hours || '') || /Drink/i.test(r.type));
          early.forEach((r) => used.push(r.item_id));
          lines.push(`Buổi sáng có **${nm(early[0])}** (mở từ khoảng ${String(early[0].opening_hours).match(/\d\d:\d\d/)[0]}, giờ tham khảo) – ${early[0].short_description}${early[1] ? `; hoặc **${nm(early[1])}** (${early[1].short_description})` : ''}. Buffet Vân Sơn chỉ mở từ ${rh.main ? hhmm(rh.main.opening_time) : '10:00'}.`);
        } else if (meal === 'trua') {
          const bf = inArea.find((r) => /buffet/i.test(r.type)); const hv = inArea.find((r) => /gọi món/i.test(r.type));
          [bf, hv].filter(Boolean).forEach((r) => used.push(r.item_id)); rh.rows.forEach((x) => used.push(x.operation_id));
          lines.push(`Ăn trưa phổ biến nhất là **${nm(bf)}**: ${bfNl ? bfNl.price_text : '?'} người lớn, ${bfTe ? bfTe.price_text : '?'} trẻ em, mở ${rh.range} (suất ${rh.slotTxt.replace(' và ', ' hoặc ')}).${hv ? ` Muốn gọi món thì có **${nm(hv)}** (${hv.short_description}, giá theo món).` : ''}`);
        } else {
          const dn = inArea.find((r) => /ăn tối/i.test(r.type)); const hv = inArea.find((r) => /gọi món/i.test(r.type));
          [dn, hv].filter(Boolean).forEach((r) => used.push(r.item_id));
          lines.push(`Buổi tối có **${nm(dn)}**: ${dn.short_description}${night[0] ? `, từ **${night[0].price_text}**` : ''}.${hv ? ` Hoặc gọi món ở **${nm(hv)}** (giờ tham khảo ${hv.opening_hours.replace(/^Tham khảo /i, '')}).` : ''}`);
        }
        return { text: lines.join('\n'), rows: uniq(used), sheets: ['food_stay', 'services_pricing', 'operation_hours'], sources: uniq(used.map((id) => byId[id] && String(byId[id].row.source_url || '').split(' ; ')[0])), filters: { bua: meal }, followups: ['Có món chay không?', 'Buffet mở mấy giờ?'] };
      }
      const buffetLine = (row) => {
        const dt = e.when.dayType;
        const cbTxt = cbs.filter((r) => !dt || (dt === 'weekend') === /cuối tuần/.test(r.valid_day_type)).map((r) => `${r.price_text} ${/ngày thường/.test(r.valid_day_type) ? 'ngày thường' : 'cuối tuần'}`).join(' / ');
        rh.rows.forEach((r) => used.push(r.operation_id));
        return `- **${row.name}** (${row.location_scope}): ${String(row.description).split('. ')[0]}. Mở **${rh.range}**${rh.slots.length ? `, chia ${rh.slots.length} suất: ${rh.slotTxt}` : ''}. Vé lẻ **${bfNl ? bfNl.price_text : '?'}** người lớn / **${bfTe ? bfTe.price_text : '?'}** trẻ em (cần có vé cáp lên đỉnh)${cbTxt ? `; combo cáp Vân Sơn + buffet **${cbTxt}** (người lớn)` : ''}.`;
      };
      if (e.vegetarian) {
        const veg = byType(/món chay/i); veg.forEach((r) => used.push(r.item_id));
        byType(/buffet|ăn tối/i).forEach((r) => used.push(r.item_id));
        lines.push(`Có. **Buffet Vân Sơn** (${rh.range}, ${bfNl ? bfNl.price_text : ''}/người lớn) có món chay trong thực đơn.${night[0] ? ` Buổi tối, **Combo Hoàng Hôn** có bún chả giò khoai môn chay (từ ${night[0].price_text}, kèm vé cáp sau 17h).` : ''}`);
      } else if (specialty) {
        const sp = byType(/đặc sản/i); const out = byType(/ngoài khu/i);
        sp.forEach((r) => used.push(r.item_id)); out.forEach((r) => used.push(r.item_id));
        const gift = /qua|mua/.test(t);
        lines.push(gift ? `Mua làm quà thì có **muối tôm Tây Ninh** và **bánh tráng phơi sương**; ăn tại chỗ nên thử ${sp.filter((r) => !/muối tôm/i.test(r.name)).map((r) => r.short_description || r.name).slice(0, 3).join(', ')}.`
          : `Nên thử: ${sp.map((r) => `**${r.short_description || r.name}**`).join(', ')}.`);
        if (out[0]) lines.push(`Quán gần núi được giới thiệu: ${String(out[0].description).replace(/^Một số quán được giới thiệu: /, '').split('. ')[0].replace(/ \([^)]*\)/g, '')}.`);
      } else {
        lines.push('Trên đỉnh núi có mấy chỗ ăn:');
        let dinner = null;
        for (const r of FS.filter((x) => /trong khu/i.test(x.type || ''))) {
          used.push(r.item_id);
          const sd = r.short_description || String(r.description).split('. ')[0];
          const nm = r.name.replace(/ \(.*\)$/, '');
          if (/buffet/i.test(r.type)) { rh.rows.forEach((x) => used.push(x.operation_id)); lines.push(`- **${nm}** – ${sd}; ${rh.range} (suất ${rh.slotTxt.replace(' và ', ' hoặc ')}), ${bfNl ? bfNl.price_text : '?'} người lớn / ${bfTe ? bfTe.price_text : '?'} trẻ em.`); continue; }
          if (/ăn tối/i.test(r.type)) { dinner = r; continue; }
          lines.push(`- **${nm}** – ${sd}.`);
        }
        if (dinner && night[0]) lines.push(`Buổi tối có **${dinner.name.replace(/ \(.*\)$/, '')}** – vé cáp sau 17h kèm 1 suất ăn tối, từ **${night[0].price_text}**.`);
        const sp = byType(/đặc sản/i);
        if (sp.length) { sp.forEach((r) => used.push(r.item_id)); lines.push(`Xuống núi nên thử ${uniq(sp.map((r) => r.short_description || r.name)).slice(0, 3).join(', ')}.`); }
      }
      return {
        text: lines.join('\n'), rows: uniq(used), sheets: ['food_stay', 'services_pricing', 'operation_hours'],
        sources: uniq(used.map((id) => byId[id] && String(byId[id].row.source_url || '').split(' ; ')[0])),
        filters: { gia: 'đang áp dụng', gio: 'is_active = yes', food_stay_type: e.vegetarian ? 'món chay' : specialty ? 'đặc sản / ngoài khu' : 'trong khu + đặc sản' },
        followups: ['Có món chay không?', 'Có được mang đồ ăn vào không?', 'Giá combo buffet cuối tuần?'],
      };
    }

    function answerEvents(e, ctx) {
      const ev = (D.events_culture || []).filter((r) => !/Expired/i.test(r.verification_status || '') && Number(r.display_priority || 50) < 99 && !/^quanh năm$/i.test(String(r.time_period || '').trim()));
      ev.sort((a, b) => Number(a.display_priority || 50) - Number(b.display_priority || 50));
      const named = ev.filter((r) => { const n = norm(r.event_name).replace(/^(dai le|le|hoi) /, '').split(/[/&(,–-]/)[0].trim().split(' ').slice(0, 2).join(' '); return n.length >= 5 && e.t.includes(n); });
      const pickAll = named.length ? named : /dang dang|toi thu 7|toi thu bay/.test(e.t) ? ev.filter((r) => /thứ bảy|17:00|17h/i.test(r.time_period || '')) : ev;
      const mon = (e.t.match(/thang (\d{1,2})\b/) || [])[1];
      const recurring = (r) => /hằng (tuần|ngày)|định kỳ|thứ bảy|hằng ngày/i.test(r.time_period || '');
      const pick = mon && !named.length ? pickAll.filter((r) => recurring(r) || new RegExp(`tháng ${mon}\\b`).test(r.time_period || '')) : pickAll;
      const lines = [];
      const tbd = (r) => (/Announced|cần xác minh/i.test(r.verification_status) && !/chưa có ngày/i.test(r.time_period || '') ? ' (chưa có ngày chính thức)' : '');
      if (pick.length === 1 || named.length) {
        for (const r of pick.slice(0, 2)) lines.push(`**${r.event_name}** – ${r.time_period}${tbd(r)}. ${String(r.description).split('; ')[0].replace(/\.$/, '')}.`);
      } else {
        const tonight = /hom nay|toi nay/.test(e.t) && ctx.today.getDay() === 6;
        lines.push(tonight ? 'Hôm nay thứ Bảy, buổi tối có **lễ dâng đăng** ở quảng trường Tượng Phật Bà. Các hoạt động khác:' : /toi thu (7|bay)/.test(e.t) ? 'Tối thứ Bảy trên núi có:' : mon ? `Tháng ${mon} ở Núi Bà Đen có:` : 'Các sự kiện, hoạt động ở Núi Bà Đen:');
        for (const r of pick.slice(0, 4)) if (!(tonight && /dâng đăng/i.test(r.event_name))) lines.push(`- **${r.event_name}** – ${String(r.time_period).replace(/\.$/, '')}${tbd(r)}`);
      }
      return { text: lines.join('\n'), rows: pick.map((r) => r.event_id), sheets: ['events_culture'], sources: uniq(pick.map((r) => String(r.source_url || '').split(' ; ')[0])), filters: { sap_xep: 'display_priority', bo_qua: 'Expired / display_priority ≥ 99' }, followups: ['Vé sau 17h bao nhiêu?', 'Lễ Vía Bà vào ngày nào?'] };
    }

    // ----- explore ("chơi gì / có gì") & layout ("mấy khu / tầng"): Excel FAQ first, then generated from destinations.zone -----
    const ZONES = [
      { key: 'dinh', re: /tren dinh|khu dinh|dinh nui|o dinh|len dinh|tren nui|tren do/, match: /đỉnh/i, label: 'Đỉnh núi', how: 'Cáp Vân Sơn từ Ga Bà Đen (~8 phút) hoặc cáp Tâm An từ Chùa Bà', intro: 'Lên đỉnh bằng cáp Vân Sơn (khoảng 8 phút), trên đó có:' },
      { key: 'chua', re: /chua ba|dien ba|suon nui|chua hang|khu chua/, match: /chùa bà|sườn/i, label: 'Chùa Bà – Điện Bà', how: 'Cáp Chùa Hang từ Ga Bà Đen (~5 phút) hoặc đi bộ đường hành hương', intro: 'Đi cáp Chùa Hang (khoảng 5 phút) lên khu Chùa Bà – Điện Bà, ở đó có:' },
      { key: 'chan', re: /chan nui|duoi chan|khu chan|duoi nui/, match: /chân núi/i, label: 'Chân núi', how: 'Đi bộ/xe nội khu từ cổng chính', intro: 'Khu chân núi (đi bộ từ cổng chính) có:' },
    ];
    function faqByIntent(intent, q) {
      const cands = (D.faq || []).filter((f) => f.intent === intent && f.answer);
      if (!cands.length) return null;
      const hit = searchFaq(q, (d) => d.f.intent === intent);
      return hit.doc || cands[0];
    }
    function zoneList(z) {
      return (D.destinations || []).filter((d) => z.match.test(d.zone || '') && !/xác minh/i.test(d.zone || ''));
    }
    function answerExplore(e, q) {
      const z = ZONES.find((x) => x.re.test(e.t));
      if (!z) {
        const f = faqByIntent('explore_overview', q);
        if (f) return { text: f.answer, rows: [f.faq_id], sheets: ['faq', 'destinations', 'activities'], sources: uniq(String(f.source_url || '').split(' ; ')), filters: { faq_intent: 'explore_overview' }, followups: ['Trên đỉnh có gì?', 'Khu chân núi có gì?', 'Lịch trình 1 ngày?'] };
      }
      const zones = z ? [z] : ZONES;
      const lines = []; const used = [];
      for (const zz of zones) {
        const ds = zoneList(zz);
        if (!ds.length) continue;
        lines.push(z ? zz.intro : `**${zz.label}**:`);
        for (const d of ds) {
          used.push(d.dest_id);
          (D.activities || []).filter((a) => a.dest_id === d.dest_id).forEach((a) => used.push(a.activity_id));
          lines.push(`- **${d.name}** – ${lcFirst(String(d.key_facts || d.description_short).replace(/\.$/, ''))}`);
        }
      }
      const unk = (D.destinations || []).filter((d) => /xác minh/i.test(d.zone || ''));
      if (!z && unk.length) lines.push(`> Chưa rõ khu: ${unk.map((d) => d.name).join(', ')}.`);
      return { text: lines.join('\n'), rows: used, sheets: ['destinations', 'activities'], sources: uniq(used.filter((x) => /^TN/.test(x)).slice(0, 4).map((id) => byId[id].row.source_url)), image: used[0] ? destImage(used[0]) : null,
        filters: { zone: z ? z.label : 'tất cả', bo_qua: "zone = 'Cần xác minh'" }, followups: ['Giá vé cáp lên đó?', 'Nên đi lúc nào?', 'Ăn uống ở đâu?'] };
    }
    function answerLayout(e, q) {
      const f = faqByIntent('area_layout', q);
      if (f) return { text: f.answer, rows: [f.faq_id], sheets: ['faq', 'destinations', 'transportation'], sources: uniq(String(f.source_url || '').split(' ; ')), filters: { faq_intent: 'area_layout' }, followups: ['Trên đỉnh có gì?', 'Đi Núi Bà Đen chơi gì?', 'Giá vé cáp treo?'] };
      const lines = ['Khu du lịch gồm các khu theo độ cao:'];
      ZONES.slice().reverse().forEach((zz) => { const ds = zoneList(zz); if (ds.length) lines.push(`- **${zz.label}**: ${ds.map((d) => d.name).join(', ')}.`); });
      const cab = (D.transportation || []).filter((r) => /cáp treo/i.test(r.transport_mode || ''));
      if (cab.length) lines.push(`Các tuyến cáp: ${cab.map((r) => `${r.transport_mode.replace(/^Cáp treo tuyến /i, '')} (${r.origin} → ${r.destination}, ${r.estimated_duration})`).join('; ')}.`);
      return { text: lines.join('\n'), rows: [], sheets: ['destinations', 'transportation'], sources: [], filters: { nguon: 'destinations.zone' }, followups: [] };
    }

    function answerFaqOrDest(e, q) {
      const dest = matchDest(e.t);
      let hit = searchFaq(q);
      if (dest && !/tuyen cap|cap treo|\bcap\b|di bang|phuong tien|len dinh/.test(e.t)) {
        // a named place: only FAQ rows about THAT place may answer (avoid "Tượng Phật Bà" → "Tượng Phật nhập niết bàn")
        const al = ALIAS[dest.dest_id] || [];
        const scoped = searchFaq(q, (d) => String(d.f.related_id || '').includes(dest.dest_id) || al.some((a) => norm(d.f.question).includes(a)));
        hit = scoped.score >= 0.3 ? scoped : { score: 0 };
      }
      const wantsCard = /gioi thieu|thong tin ve|ke ve|co gi (hay|dep|dac biet|de xem|de choi)|\bco gi\s*$/.test(e.t);
      const attr = [[/nam nao|bao gio|khi nao (xay|lap|co)|xay (tu|nam|khi)|thanh lap|xay dung|co tu|bao nhieu nam/, /\b(1[0-9]{3}|20[0-9]{2})\b/, 'năm xây dựng/thành lập'], [/ai xay|ai lap|ai sang lap|nguoi xay/, /sư tổ|hòa thượng|xây bởi|do .* xây/i, 'người xây dựng']];
      if (dest && hit.score < 0.3) {
        const a = attr.find(([q2]) => q2.test(e.t));
        if (a && !a[1].test(String(dest.description_detail || '') + ' ' + String(dest.description_short || ''))) {
          return { text: `Dữ liệu hiện **chưa có thông tin** về ${a[2]} của **${dest.name}**. Thông tin đang có: ${dest.description_short}\nBạn có thể hỏi Ban Quản lý KDL (0276) 3823.378 để biết thêm.`, rows: [dest.dest_id], sheets: ['destinations'], sources: [dest.source_url], filters: { thieu_thong_tin: a[2] }, followups: ['Giới thiệu ' + dest.name, 'Đi đến đó bằng cách nào?'] };
        }
      }
      const moveQ = /tuyen cap|cap treo|\bcap\b|di bang|phuong tien|len dinh/.test(e.t);
      if (dest && (hit.score < (moveQ ? 0.34 : 0.55) || wantsCard)) {
        const lc0 = lcFirst;
        if (/o dau|nam o|nam dau|vi tri|cho nao/.test(e.t)) {
          return { text: `**${dest.name}** nằm ở ${lc0(dest.location)}${dest.zone && !/xác minh/i.test(dest.zone) && !norm(dest.location).includes(norm(dest.zone).split(' ')[0]) ? ` (${lc0(dest.zone)})` : ''}. Đi bằng ${lc0(dest.transport)}.`, rows: [dest.dest_id], sheets: ['destinations'], sources: [dest.source_url], filters: { hoi: 'vị trí' }, followups: ['Giới thiệu ' + dest.name, 'Nên đi lúc nào?'] };
        }
        if (dest.key_facts && /cao bao nhieu|rong bao nhieu|bao nhieu met|dai bao nhieu|nam nao|lap nam|xay nam|tho ai|lam bang|chatlieu|bao nhieu tang|may tang/.test(e.t)) {
          return { text: `**${dest.name}**: ${lc0(dest.key_facts)}`, rows: [dest.dest_id], sheets: ['destinations'], sources: [dest.source_url], filters: { hoi: 'dữ kiện' }, followups: ['Giới thiệu ' + dest.name, 'Đi đến đó bằng cách nào?'] };
        }
        const sents = String(dest.description_detail || '').split(/(?<=\.)\s+/);
        const facts = dest.key_facts || sents.find((x) => /\d/.test(x) && x.length <= 200) || '';
        const lines = [`**${dest.name}** – ${String(dest.description_short).replace(/\.$/, '')}.`];
        if (facts && facts !== dest.description_short) lines.push(facts);
        const lc = (x) => String(x).charAt(0).toLowerCase() + String(x).slice(1);
        const tr = /chân núi/i.test(dest.zone || '') && /^cáp treo$/i.test(dest.transport || '') ? '' : `Đi bằng ${lc(dest.transport)}; `;
        lines.push(`${tr}nên đến ${lc(String(dest.best_time).replace(/; đẹp nhất /, ', đẹp nhất '))}; tham quan khoảng ${dest.estimated_duration}.`.replace(/^n/, 'N'));
        return { text: lines.join('\n'), rows: [dest.dest_id], sheets: ['destinations', 'media_assets'], sources: [dest.source_url], image: destImage(dest.dest_id), score: hit.score, filters: { khop_dia_diem: dest.name }, followups: ['Giá vé cáp lên đó?', 'Nên đi lúc nào?'] };
      }
      if (hit.score >= 0.34) {
        const f = hit.doc;
        const rel = String(f.related_id || '');
        const dId = (rel.match(/TN\d{3}/) || [])[0] || (dest && dest.dest_id);
        const yesNoQ = /khong\s*\??$|\bko\b|\bk\b\s*\??$|duoc khong|chua\s*\??$|co phai|phai khong|\bhong\b/.test(e.t);
        const ans = !yesNoQ ? String(f.answer).replace(/^(Có|Không|Được)[.,:]\s+(\S)/, (m, a, c) => c.toUpperCase()) : f.answer;
        return {
          text: ans, rows: [f.faq_id].concat(rel ? [rel] : []), sheets: uniq(['faq'].concat(String(f.related_sheet || '').split(/\s*\+\s*/))),
          sources: uniq(String(f.source_url || '').split(' ; ')), image: dId ? destImage(dId) : null, score: hit.score,
          filters: { faq_khop: f.question, do_khop: hit.score.toFixed(2) }, followups: [],
        };
      }
      if (dest) return answerFaqOrDest(Object.assign({}, e, { t: e.t + ' gioi thieu' }), 'giới thiệu ' + dest.name);
      return null;
    }

    const RX_ITIN = /lich trinh|lo trinh|ke hoach|toi uu|nen di (nhu )?the nao|di (sao|the nao|nhu the nao) cho (du|tron|toi uu|hop ly|hieu qua)|sap xep (thoi gian|lich|chuyen)|goi y (chuyen|cach) di/;
    const RX_ITIN_SPEC = /\b(1|mot|ca|2|hai) ngay\b|nua ngay|buoi sang|sang som|san may|hanh huong|chua ba|chan nui|lich su|chieu toi|hoang hon|buoi toi|\bdem\b|sau 17|gia dinh|lon tuoi|nguoi gia|cao tuoi|ong ba|tre em|em be|nguoi lon|sinh vien|couple|nhom|chup (anh|hinh)|photo|khu dinh|tren dinh|chi phi|bao nhieu|tiet kiem|re/;
    const FALLBACK = (q) => ({
      text: 'Mình **chưa có thông tin** chính thức về điều này. Bạn có thể gọi hotline Sun World **1800 1000** hoặc Ban quản lý **(0276) 3823.378** để hỏi trực tiếp nhé.',
      rows: [], sheets: [], sources: [], filters: {}, followups: ['Giá vé cáp treo bao nhiêu?', 'Ăn uống trên núi thế nào?', 'Lịch trình 1 ngày?'],
    });

    // ----- conversation state for follow-ups -----
    let last = null;
    const CARRY = ['vanson', 'chuahang', 'taman', 'buffet', 'combo', 'night', 'oneway', 'entrance', 'yearpass', 'fastpass', 'guide', 'tamlinh'];
    const PERSONA = ['student', 'local', 'monk', 'elderly', 'child', 'adult', 'disabled', 'poor', 'height', 'age', 'nAdult', 'nChild'];

    function ask(q, opts) {
      const today = (opts && opts.today) || new Date();
      const ctx = { today };
      let e = extract(q, today);
      e.destHit = !!matchDest(e.t);
      e.venueHit = !!matchVenue(e.t);
      let intent = detectIntent(e);
      let followup = false;
      const short = e.t.split(' ').length <= 9;
      const hasProduct = CARRY.some((k) => e[k]);
      const hasPersona = PERSONA.some((k) => e[k] != null && e[k] !== false);
      const carryProduct = last && short && !hasProduct && ['pricing', 'hours', 'food'].includes(last.intent) && CARRY.some((k) => last.e[k]) && ['pricing', 'hours'].includes(intent) && !/cap treo|cac tuyen|khu du lich/.test(e.t);
      if (last && short && !hasProduct && (carryProduct || hasPersona || e.when.date || e.when.dayType || /con|thi sao|the con|vay con|con\s+.*thi/.test(e.t)) &&
          ['pricing', 'hours', 'food'].includes(last.intent) && (intent === 'faq' || intent === last.intent || (['pricing', 'hours'].includes(intent) && CARRY.some((k) => last.e[k]) && !/cap treo|cac tuyen|khu du lich/.test(e.t))) && !RX.outOfScope.test(e.t)) {
        const merged = Object.assign({}, e);
        CARRY.forEach((k) => { merged[k] = last.e[k]; });
        if (!hasPersona) PERSONA.forEach((k) => { merged[k] = last.e[k]; });
        if (!e.when.date && !e.when.dayType) merged.when = last.e.when;
        e = merged; if (intent === 'faq') intent = last.intent; followup = true;
      }
      let res;
      if (!last && !hasProduct && !e.destHit && /^(con|the con|vay con|thi sao|con .* thi sao|con .*\?$)/.test(e.t) && e.t.split(' ').length <= 6) {
        res = { text: 'Bạn đang hỏi về giá vé, giờ hoạt động hay chỗ nào cụ thể? Ví dụ: “giá vé cáp Vân Sơn cho trẻ em” hoặc “cuối tuần cáp chạy mấy giờ”.', rows: [], sheets: [], sources: [], filters: {}, followups: ['Giá vé cáp treo bao nhiêu?', 'Cáp chạy mấy giờ?'] };
        intent = 'clarify';
      } else if (intent === 'greeting') res = { text: 'Xin chào! Mình là **AI Guide Núi Bà Đen** 🌿. Bạn muốn hỏi về giá vé, giờ cáp treo, ăn uống, lịch trình hay điểm tham quan nào?', rows: [], sheets: [], sources: [], filters: {}, followups: ['Giá vé cáp treo bao nhiêu?', 'Ăn uống như thế nào?', 'Nên đi săn mây lúc nào?'] };
      else if (intent === 'thanks') res = { text: 'Không có gì! Chúc bạn có chuyến đi Núi Bà Đen thật vui 🙏. Cần gì cứ hỏi mình nhé.', rows: [], sheets: [], sources: [], filters: {}, followups: [] };
      else if (intent === 'out_of_scope') res = { text: 'Mình là trợ lý du lịch **Núi Bà Đen (Tây Ninh)** nên chưa có thông tin cho câu hỏi này. Bạn muốn hỏi gì về Núi Bà Đen không?', rows: [], sheets: [], sources: [], filters: {}, followups: ['Giá vé cáp treo bao nhiêu?', 'Có gì chơi ở Núi Bà Đen?'] };
      else if (intent === 'faq' && !hasProduct && !e.destHit && RX_ITIN.test(e.t) && !RX_ITIN_SPEC.test(e.t)) {
        // generic "nên đi thế nào / lịch trình" → ask which of the 6 Excel itineraries fits before recommending
        res = { text: 'Mình có sẵn vài lịch trình gợi ý. Bạn có **bao nhiêu thời gian** và đi để làm gì? Chọn một bên dưới hoặc nói rõ hơn, ví dụ "cả ngày cùng gia đình" hay "sáng sớm săn mây".', rows: (D.itineraries || []).map((i) => i.itinerary_id), sheets: ['itineraries'], sources: [], filters: { hoi_lai: 'thời gian + mục đích' },
          followups: ['Lịch trình cả ngày', 'Lịch trình săn mây sáng sớm', 'Lịch trình hành hương Chùa Bà', 'Lịch trình buổi tối sau 17h'] };
        intent = 'itinerary';
      }
      else if (intent === 'pricing') res = answerPricing(e, ctx);
      else if (intent === 'hours') res = answerHours(e, ctx);
      else if (intent === 'food') res = answerFood(e, ctx);
      else if (intent === 'events') res = answerEvents(e, ctx);
      else if (intent === 'explore' || intent === 'layout') {
        const hit = searchFaq(q, (d) => !/explore_overview|area_layout/.test(d.f.intent || ''));
        if (hit.score >= 0.6 && !ZONES.some((z) => z.re.test(e.t))) { res = answerFaqOrDest(e, q); intent = 'faq'; }
        else res = intent === 'explore' ? answerExplore(e, q) : answerLayout(e, q);
      }
      else res = answerFaqOrDest(e, q) || FALLBACK(q);
      const fr = res.rows && res.rows[0] && byId[res.rows[0]];
      if (fr && fr.sheet === 'faq' && /^(explore_overview|area_layout)$/.test(fr.row.intent || '')) intent = fr.row.intent === 'explore_overview' ? 'explore' : 'layout';
      const iname = INTENT_MAP[intent] || (res.sheets && res.sheets[0] === 'destinations' ? 'destination_detail' : intent === 'faq' ? 'faq_retrieval' : intent);
      res.intent = iname;
      res.intentDef = intentDef[iname] || null;
      res.followup = followup;
      res.entities = Object.fromEntries(Object.entries(e).filter(([k, v]) => k !== 't' && k !== 'when' && v !== false && v != null));
      if (e.when.date) res.entities.ngay = vnDate(e.when.date);
      if (e.when.dayType) res.entities.loai_ngay = e.when.dayType;
      last = { intent, e };
      return res;
    }

    return { ask, reset: () => { last = null; }, _internals: { extract, detectIntent, searchFaq, norm, toks } };
  }

  const api = { createBot, norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NBDBot = api;
})(typeof window !== 'undefined' ? window : globalThis);
