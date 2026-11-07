import { useEffect, useRef, useState } from 'react';
import { Maximize2, Send } from 'lucide-react';
import { Clock, MapTrifold, NavigationArrow } from '@phosphor-icons/react';

import { API_URL } from '../api';
import { MarkdownMessage } from '../pages/ChatbotPage';

const QUICK_QUESTIONS = [
  { icon: Clock, text: 'Giờ mở cửa?' },
  { icon: NavigationArrow, text: 'Cách di chuyển?' },
  { icon: MapTrifold, text: 'Các điểm tham quan?' },
];

// Reads the /api/chat/stream server-sent events: "token" events carry pieces of
// the answer, "done" carries the final answer and follow-up questions.
async function streamAnswer(body, onToken) {
  const res = await fetch(`${API_URL}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let final = null;
  const handle = (block) => {
    const lines = block.split('\n');
    const event = lines.find((line) => line.startsWith('event: '))?.slice(7);
    const data = lines.find((line) => line.startsWith('data: '));
    if (!data) return;
    try {
      const parsed = JSON.parse(data.slice(6));
      if (event === 'done') final = parsed;
      else if (parsed.token) { text += parsed.token; onToken(text); }
    } catch {}
  };

  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() || '';
    blocks.forEach(handle);
    if (done) break;
  }
  if (buffer.trim()) handle(buffer);
  return { text: final?.answer || text, followups: final?.retrieval?.followups || [] };
}

async function plainAnswer(body) {
  const res = await fetch(`${API_URL}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return { text: data.answer || 'AI chưa có câu trả lời phù hợp.', followups: data.retrieval?.followups || [] };
}

// The home page chatbot card: answers right inside the card. `incoming` is a
// question typed in the hero search box ({ text, at }), sent as soon as it changes.
export default function HomeChat({ incoming, onOpenFull, Avatar }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState('');
  const bodyRef = useRef(null);
  const sessionRef = useRef(`home_${Date.now()}`);

  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming, loading]);

  useEffect(() => {
    if (incoming?.text) send(incoming.text);
  }, [incoming]);

  async function send(question) {
    const text = question.trim();
    if (!text || loading) return;
    const history = messages.slice(-8).map((m) => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text }));
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');
    setLoading(true);
    setStreaming('');

    const body = JSON.stringify({ destination_id: null, message: text, session_id: sessionRef.current, history });
    let reply;
    try {
      reply = await streamAnswer(body, setStreaming);
    } catch {
      try { reply = await plainAnswer(body); } catch { reply = { text: 'Hiện tại AI chưa kết nối được. Bạn thử lại sau nhé.', followups: [] }; }
    }
    setMessages((prev) => [...prev, { role: 'bot', text: reply.text, followups: reply.followups }]);
    setStreaming('');
    setLoading(false);
  }

  const last = messages[messages.length - 1];
  const chips = !loading && last?.role === 'bot' ? (last.followups || []).slice(0, 3) : [];

  return (
    <section className="home-card home-chat">
      <h2>
        Chatbot AI – Hỏi đáp cùng AI
        {onOpenFull && (
          <button aria-label="Mở chatbot toàn màn hình" className="home-chat-expand" onClick={onOpenFull} title="Mở toàn màn hình" type="button">
            <Maximize2 size={16} />
          </button>
        )}
      </h2>
      <div className="home-chat-body" ref={bodyRef}>
        <div className="home-msg">
          <span className="home-bot-avatar"><Avatar /></span>
          <div className="home-msg-text home-bubble">
            <p><b>Xin chào bạn! 👋</b><br />Mình là trợ lý AI của Núi Bà Đen. Bạn cần hỗ trợ gì hôm nay?</p>
          </div>
        </div>
        {messages.length === 0 && (
          <div className="home-suggest">
            {QUICK_QUESTIONS.map(({ icon: SuggestIcon, text }) => (
              <button key={text} onClick={() => send(text)} type="button">
                <span><SuggestIcon size={18} weight="duotone" /></span>{text}
              </button>
            ))}
          </div>
        )}
        {messages.map((message, index) => (
          message.role === 'user' ? (
            <div className="home-msg is-user" key={index}><p>{message.text}</p></div>
          ) : (
            <div className="home-msg" key={index}>
              <span className="home-bot-avatar"><Avatar /></span>
              <div className="home-msg-text home-bubble"><MarkdownMessage text={message.text} /></div>
            </div>
          )
        ))}
        {loading && (
          <div className="home-msg">
            <span className="home-bot-avatar"><Avatar /></span>
            <div className="home-msg-text home-bubble">
              {streaming ? <MarkdownMessage text={streaming} /> : <span className="home-typing"><i /><i /><i /></span>}
            </div>
          </div>
        )}
        {chips.length > 0 && (
          <div className="home-chips">
            {chips.map((text) => <button key={text} onClick={() => send(text)} type="button">{text}</button>)}
          </div>
        )}
      </div>
      <form className="home-chat-form" onSubmit={(event) => { event.preventDefault(); send(input); }}>
        <input disabled={loading} onChange={(event) => setInput(event.target.value)} placeholder={loading ? 'AI Guide đang trả lời…' : 'Nhập câu hỏi của bạn...'} value={input} />
        <button aria-label="Gửi" disabled={loading || !input.trim()} type="submit"><Send fill="currentColor" size={18} /></button>
      </form>
    </section>
  );
}
