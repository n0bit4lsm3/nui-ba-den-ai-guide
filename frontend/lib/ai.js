// AI guide: answers from the knowledge base (data.json) through an LLM on
// OpenRouter, and lets the model search the web itself when the data has no
// answer.
'use strict';

const kb = require('./kb');
const { destinations } = require('./store');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = () => process.env.OPENROUTER_MODEL || 'google/gemini-3-flash-preview';
const TIMEOUT_MS = 50000;

const str = (v) => (v == null ? '' : String(v).trim());

// The model ends its reply with "[[nguon: ID1, ID2]]" naming the rows it used;
// the marker is cut from what the visitor sees and turned into source links.
const SOURCE_MARK = '[[';
const SOURCE_RE = /\[\[\s*ngu[oồ]n\s*:([^\]]*)\]\]\s*$/i;

const BUSY_TEXT = 'Xin lỗi, AI Guide đang bận nên chưa trả lời được. Bạn thử lại sau ít phút, hoặc bấm **Hỗ trợ** ở góc trên để gọi hotline nhé.';

const SOURCE_LABELS = [['sunworld.vn', 'Sun World Ba Den Mountain'], ['khudulichnuibaden.tayninh.gov.vn', 'Ban quản lý KDL Núi Bà Đen']];

function todayInVietnam() {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date());
}

function systemPrompt(dest) {
  return `Bạn là "AI Guide Núi Bà Đen", hướng dẫn viên du lịch AI của Khu du lịch Quốc gia Núi Bà Đen (Tây Ninh).
Hôm nay là ${todayInVietnam()} (giờ Việt Nam).${dest ? `\nKhách đang đứng ở / quan tâm địa điểm: ${dest.name} (${dest.dest_code}). "Ở đây", "chỗ này" là nói về địa điểm này.` : ''}

CÁCH TRẢ LỜI
1. Ưu tiên tuyệt đối DỮ LIỆU NỘI BỘ (các dòng có mã trong ngoặc vuông ở tin nhắn của khách). Đây là dữ liệu chính thức đã kiểm tra.
2. Chỉ khi dữ liệu nội bộ không có hoặc không đủ (thời tiết hôm nay, sự kiện mới, tin tức, thông tin ngoài Núi Bà Đen…), hãy dùng công cụ web_search để tự tìm. Khi dùng thông tin từ web, nói rõ "theo thông tin trên internet" và ưu tiên nguồn chính thức, mới nhất; bỏ qua bài viết cũ hơn 1 năm nếu câu hỏi cần thông tin hiện tại.
3. Không bao giờ bịa giá vé, giờ mở cửa, số điện thoại. Không tìm được thì nói chưa có thông tin và chỉ khách gọi hotline.
4. Trả lời bằng ngôn ngữ khách dùng, THẬT NGẮN GỌN vì khách đọc trên điện thoại khi đang tham quan:
   - Tối đa khoảng 60 từ. Câu đầu trả lời thẳng vào điều khách hỏi; thêm tối đa 3 gạch đầu dòng ngắn nếu thật cần.
   - Chỉ nêu đúng điều được hỏi, không liệt kê mọi lựa chọn. Hỏi giá thì nêu giá phù hợp nhất (+ 1 combo rẻ hơn nếu có); khách muốn chi tiết sẽ hỏi tiếp.
   - Không chào, không nhắc lại câu hỏi, không câu kết kiểu "Chúc bạn…", không tiêu đề.
   - Câu nhắc "Giá có thể thay đổi, xem booking.sunworld.vn hoặc gọi 1800 1000." CHỈ thêm khi câu trả lời có giá vé/dịch vụ hoặc giờ hoạt động lấy từ dữ liệu nội bộ; KHÔNG thêm khi nói về thời tiết, địa điểm, đường đi hay thông tin từ web.
   - Dùng **in đậm** cho con số quan trọng.
5. Chỉ trả lời chủ đề du lịch, Núi Bà Đen, Tây Ninh và chuyến đi của khách; câu hỏi không liên quan thì từ chối nhẹ nhàng.
6. Dòng cuối cùng, viết đúng dạng [[nguon: MÃ1, MÃ2]] liệt kê mã các dòng dữ liệu nội bộ bạn đã dùng (để trống nếu không dùng: [[nguon: ]]).

QUY TẮC NGHIỆP VỤ
${kb.answerRules()}

DANH SÁCH ĐỊA ĐIỂM (mã: tên)
${kb.destinationNames()}`;
}

function userPrompt(question, docs) {
  const context = docs.length ? docs.map((d) => d.text).join('\n\n') : '(không tìm thấy dòng dữ liệu nào liên quan)';
  return `DỮ LIỆU NỘI BỘ LIÊN QUAN:\n${context}\n\n---\nCÂU HỎI CỦA KHÁCH: ${question}`;
}

function sourceLabel(url, fallback) {
  let host = '';
  try { host = new URL(url).hostname; } catch { return null; }
  return (SOURCE_LABELS.find(([domain]) => host.endsWith(domain)) || [null, fallback || host])[1];
}

function buildRetrieval({ dest, docs, usedIds, citations, usage }) {
  const sources = [];
  const seen = new Set();
  const add = (url, title, type) => {
    if (!url || seen.has(url)) return;
    const label = sourceLabel(url, title);
    if (!label) return;
    seen.add(url); sources.push({ title: label, url, source_type: type });
  };
  const used = usedIds.map((id) => kb.getDoc(id)).filter(Boolean);
  for (const doc of used) add(doc.sourceUrl, '', 'database');
  for (const c of citations) add(c.url, c.title, 'web');

  // Show the destination's photo when the answer is about that place.
  const shown = used.find((d) => d.sheet === 'destinations') || (dest && used.some((d) => d.destId === dest.dest_code) ? { id: dest.dest_code } : null);
  const shownDest = shown && [...destinations().values()].find((d) => d.dest_code === shown.id);
  const media = shownDest && shownDest.image_url
    ? [{ url: shownDest.image_url, caption: shownDest.image_caption || shownDest.name, alt: shownDest.image_alt || shownDest.name, source_url: shownDest.source_url, destination: shownDest.name }]
    : [];

  return {
    model: MODEL(), used_llm: true, context_count: docs.length, used_ids: usedIds,
    destination_id: dest ? dest.id : null, destination: dest || null,
    web_searches: usage?.server_tool_use_details?.web_search_requests || 0, cost: usage?.cost ?? null,
    input_tokens: usage?.prompt_tokens ?? null, output_tokens: usage?.completion_tokens ?? null,
    media, sources: sources.slice(0, 5), followups: [],
  };
}

// Reads OpenRouter's SSE stream, forwarding visible text through onToken while
// holding back anything after "[[" so the source marker never flashes on screen.
async function readStream(res, onToken) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = ''; let text = ''; let sent = 0; let usage = null;
  const citations = [];

  const flush = (final) => {
    const cut = text.indexOf(SOURCE_MARK, Math.max(0, sent - SOURCE_MARK.length));
    // Keep the last character back too: it may be the first "[" of the marker.
    const end = cut >= 0 ? cut : final ? text.length : Math.max(sent, text.length - 1);
    if (end > sent) { onToken(text.slice(sent, end)); sent = end; }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
      let chunk;
      try { chunk = JSON.parse(line.slice(6)); } catch { continue; }
      if (chunk.error) throw new Error(chunk.error.message || 'OpenRouter stream error');
      if (chunk.usage) usage = chunk.usage;
      const delta = chunk.choices?.[0]?.delta || {};
      for (const a of delta.annotations || []) if (a.type === 'url_citation' && a.url_citation?.url) citations.push(a.url_citation);
      if (delta.content) { text += delta.content; if (onToken) flush(false); }
    }
  }
  if (onToken) flush(true);
  return { text, citations, usage };
}

// Only the last two exchanges matter for follow-ups; earlier replies are
// trimmed since the knowledge base is re-sent every turn anyway.
function toMessages(history) {
  return (history || [])
    .filter((h) => str(h.content) && ['user', 'assistant', 'bot'].includes(str(h.role).toLowerCase()))
    .slice(-4)
    .map((h) => {
      const role = str(h.role).toLowerCase() === 'user' ? 'user' : 'assistant';
      const content = str(h.content);
      return { role, content: role === 'assistant' && content.length > 400 ? `${content.slice(0, 400)}…` : content };
    });
}

/** Answers one chat turn. With onToken, visible text is streamed as it arrives. */
async function answer({ message, destination_id, history = [] }, onToken) {
  const question = str(message);
  const dest = destination_id ? destinations().get(Number(destination_id)) || null : null;
  const previousUser = (history || []).filter((h) => str(h.role).toLowerCase() === 'user').slice(-2).map((h) => str(h.content)).join(' ');
  const docs = kb.search(question, { context: previousUser, destCode: dest ? dest.dest_code : '' });

  if (!process.env.OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY is not set');
    if (onToken) onToken(BUSY_TEXT);
    return { answer: BUSY_TEXT, retrieval: { used_llm: false, error: 'not_configured', media: [], sources: [], followups: [] } };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Title': 'AI Guide Nui Ba Den',
      },
      body: JSON.stringify({
        model: MODEL(),
        stream: true,
        temperature: 0.3,
        max_tokens: 600,
        messages: [
          { role: 'system', content: systemPrompt(dest) },
          ...toMessages(history),
          { role: 'user', content: userPrompt(question, docs) },
        ],
        tools: [{ type: 'openrouter:web_search', parameters: { engine: 'exa', max_results: 3, max_uses: 1, max_characters: 1500 } }],
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);

    const { text, citations, usage } = await readStream(res, onToken);
    const match = text.match(SOURCE_RE);
    const visible = (match ? text.slice(0, match.index) : text.split(SOURCE_MARK)[0]).trim();
    const usedIds = match ? match[1].split(',').map(str).filter(Boolean) : [];
    if (!visible) throw new Error('empty answer');
    return { answer: visible, retrieval: buildRetrieval({ dest, docs, usedIds, citations, usage }) };
  } catch (err) {
    console.error('AI answer failed:', err.message || err);
    if (onToken) onToken(BUSY_TEXT);
    return { answer: BUSY_TEXT, retrieval: { used_llm: false, error: 'upstream', media: [], sources: [], followups: [] } };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { answer };
