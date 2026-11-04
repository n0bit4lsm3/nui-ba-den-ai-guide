import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MoreHorizontal, PhoneCall, Send } from 'lucide-react';

import { API_URL, assetUrl } from '../api';
import MascotHello from '../components/MascotHello';
import SupportSheet from '../components/SupportSheet';


function isSafeUrl(url) {
  return /^(https?:\/\/|mailto:|tel:)/i.test(url);
}

function renderInline(text, keyPrefix) {
  const parts = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^\s)]+\)|\$[^$]+\$|\\\([\s\S]+?\\\)|https?:\/\/[^\s<)]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));

    const token = match[0];
    const key = `${keyPrefix}-${parts.length}`;

    if (token.startsWith('**')) {
      parts.push(<strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>);
    } else if (token.startsWith('`')) {
      parts.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('[')) {
      const link = token.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
      const href = link?.[2] || '';
      parts.push(
        isSafeUrl(href) ? (
          <a href={href} key={key} rel="noreferrer" target="_blank">
            {link[1]}
          </a>
        ) : (
          link?.[1] || token
        ),
      );
    } else if (token.startsWith('$')) {
      parts.push(<span className="math-inline" key={key}>{token.slice(1, -1)}</span>);
    } else if (token.startsWith('\\(')) {
      parts.push(<span className="math-inline" key={key}>{token.slice(2, -2)}</span>);
    } else {
      const href = token.replace(/[.,;:!?]+$/, '');
      parts.push(
        <a href={href} key={key} rel="noreferrer" target="_blank">
          Mở nguồn chính thức ↗
        </a>,
      );
      if (href.length < token.length) parts.push(token.slice(href.length));
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function isMarkdownTableLine(line) {
  const value = String(line || '').trim();
  return value.startsWith('|') && value.endsWith('|') && value.split('|').length >= 4;
}

function isMarkdownDividerLine(line) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(String(line || '').trim());
}

function splitMarkdownRow(line) {
  return String(line || '')
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function normalizeMarkdownText(text) {
  const raw = String(text || '')
    .replace(/\r\n?/g, '\n')
    // Two letters before the digit so short labels such as "T7" stay intact.
    .replace(/(?<=\p{L}{2})(?=\d)/gu, ' ')
    .replace(/(?<=\d)(?=(?:đ|vnđ|vnd|đồng|phút|giờ|tiếng|km|mét|người|lượt|vé)\b)/giu, ' ')
    .replace(/(?<=[,;:!?])(?=\p{L})/gu, ' ')
    .replace(/(?<!\d):(?=\d)/g, ': ')
    .replace(/(?<=\.)(?=\p{L})/gu, ' ')
    .trim()
    .replace(/(^|\n)\s*\u2022\s+/g, '$1- ')
    .replace(
      /\s+(L\u01b0u \u00fd|Luu y|M\u1eb9o|Meo|Ngu\u1ed3n|Nguon|G\u1ee3i \u00fd|Goi y|C\u1ea7n bi\u1ebft|Can biet|Quan tr\u1ecdng|Quan trong):/g,
      '\n\n$1:',
    );

  const lines = raw.split('\n').map((line) => line.trim());
  const lineType = (line) => {
    if (isMarkdownTableLine(line) || isMarkdownDividerLine(line)) return 'table';
    if (/^(?:[-*]|\u2022)\s+/.test(line) || /^\d+\.\s+/.test(line)) return 'list';
    return 'text';
  };
  const grouped = [];

  lines.forEach((line) => {
    if (!line) {
      if (grouped.length && grouped[grouped.length - 1] !== '') grouped.push('');
      return;
    }
    const prev = grouped[grouped.length - 1];
    if (prev && lineType(prev) !== lineType(line)) grouped.push('');
    grouped.push(line);
  });

  return grouped.join('\n').replace(/\n{3,}/g, '\n\n');
}

const CALLOUT_LABEL_PATTERN = /^(L\u01b0u \u00fd|Luu y|M\u1eb9o|Meo|Ngu\u1ed3n|Nguon|G\u1ee3i \u00fd|Goi y|C\u1ea7n bi\u1ebft|Can biet|Quan tr\u1ecdng|Quan trong):/i;

function calloutType(block) {
  const label = String(block || '').trim().match(CALLOUT_LABEL_PATTERN)?.[1];
  if (!label) return null;
  if (/^(Ngu\u1ed3n|Nguon)$/i.test(label)) return 'source';
  if (/^(M\u1eb9o|Meo|G\u1ee3i \u00fd|Goi y)$/i.test(label)) return 'tip';
  if (/^(Quan tr\u1ecdng|Quan trong)$/i.test(label)) return 'important';
  return 'note';
}

function displayCalloutLabel(label) {
  if (/^Luu y$/i.test(label)) return 'L\u01b0u \u00fd';
  if (/^Meo$/i.test(label)) return 'M\u1eb9o';
  if (/^Nguon$/i.test(label)) return 'Ngu\u1ed3n';
  if (/^Goi y$/i.test(label)) return 'G\u1ee3i \u00fd';
  if (/^Can biet$/i.test(label)) return 'C\u1ea7n bi\u1ebft';
  if (/^Quan trong$/i.test(label)) return 'Quan tr\u1ecdng';
  return label;
}

function stripCalloutLabel(block) {
  return String(block || '').trim().replace(CALLOUT_LABEL_PATTERN, '').trim();
}

function MarkdownMessage({ text }) {
  const blocks = normalizeMarkdownText(text).split(/\n{2,}/);

  return (
    <div className="markdown-message">
      {blocks.map((block, index) => {
        const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
        const key = `block-${index}`;

        if (!lines.length) return null;

        const type = calloutType(block);
        if (type) {
          const label = lines[0].match(CALLOUT_LABEL_PATTERN)?.[1] || '';
          return (
            <div className={`message-callout ${type}`} key={key}>
              <span>{displayCalloutLabel(label)}</span>
              <p>{renderInline(stripCalloutLabel(lines.join(' ')), key)}</p>
            </div>
          );
        }

        if (lines.length >= 2 && isMarkdownTableLine(lines[0]) && isMarkdownDividerLine(lines[1])) {
          const headers = splitMarkdownRow(lines[0]);
          const rows = lines.slice(2).filter(isMarkdownTableLine).map((line) => splitMarkdownRow(line));
          return (
            <div className="markdown-table-wrap" key={key}>
              <table>
                <thead>
                  <tr>
                    {headers.map((header, cellIndex) => (
                      <th key={`${key}-h-${cellIndex}`}>{renderInline(header, `${key}-h-${cellIndex}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={`${key}-r-${rowIndex}`}>
                      {headers.map((_, cellIndex) => (
                        <td key={`${key}-r-${rowIndex}-${cellIndex}`}>
                          {renderInline(row[cellIndex] || '', `${key}-r-${rowIndex}-${cellIndex}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (/^\$\$[\s\S]*\$\$$/.test(block.trim())) {
          return <div className="math-block" key={key}>{block.trim().slice(2, -2).trim()}</div>;
        }

        if (lines.every((line) => /^[-*]\s+/.test(line) || /^\u2022\s+/.test(line))) {
          return (
            <ul key={key}>
              {lines.map((line, itemIndex) => {
                const clean = line.replace(/^[-*]\s+/, '').replace(/^\u2022\s+/, '');
                return <li key={`${key}-${itemIndex}`}>{renderInline(clean, `${key}-${itemIndex}`)}</li>;
              })}
            </ul>
          );
        }

        if (lines.every((line) => /^\d+\.\s+/.test(line))) {
          return (
            <ol key={key}>
              {lines.map((line, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderInline(line.replace(/^\d+\.\s+/, ''), `${key}-${itemIndex}`)}</li>
              ))}
            </ol>
          );
        }

        if (lines.every((line) => /^>\s?/.test(line))) {
          return <blockquote key={key}>{renderInline(lines.map((line) => line.replace(/^>\s?/, '')).join(' '), key)}</blockquote>;
        }

        if (/^#{1,3}\s+/.test(lines[0])) {
          const level = lines[0].match(/^#+/)?.[0].length || 3;
          const content = lines[0].replace(/^#{1,3}\s+/, '');
          return level === 1 ? <h3 key={key}>{renderInline(content, key)}</h3> : <h4 key={key}>{renderInline(content, key)}</h4>;
        }

        return <p key={key}>{renderInline(lines.join(' '), key)}</p>;
      })}
    </div>
  );
}

function MessageMedia({ media = [] }) {
  const images = media.filter((item) => item?.url).slice(0, 3);
  if (!images.length) return null;

  return (
    <div className="message-media" aria-label="Hình ảnh liên quan">
      {images.map((item, index) => {
        const imageUrl = assetUrl(item.url);
        return (
          <figure key={`${item.url}-${index}`}>
            <img
              alt={item.alt || item.caption || 'Ảnh địa điểm'}
              loading="lazy"
              onError={(event) => { event.currentTarget.closest('figure')?.classList.add('is-hidden'); }}
              src={imageUrl}
            />
            {(item.caption || item.destination) && (
              <figcaption>{item.caption || item.destination}</figcaption>
            )}
          </figure>
        );
      })}
    </div>
  );
}

function MessageSources({ sources = [] }) {
  const visibleSources = sources
    .filter((source) => source?.url && isSafeUrl(source.url))
    .slice(0, 5);
  if (!visibleSources.length) return null;

  return (
    <div className="message-sources">
      <span>Nguồn tham khảo</span>
      {visibleSources.map((source) => (
        <a href={source.url} key={source.url} rel="noreferrer" target="_blank">
          {source.citation_index ? `[${source.citation_index}] ` : ''}
          {source.title || 'Xem nguồn'}
        </a>
      ))}
    </div>
  );
}

export default function ChatbotPage({ destination, initialQuestion, onInitialQuestionUsed, onBack, onDone }) {
  const [messages, setMessages] = useState([
    {
      role: 'bot',
      text: `Xin chào! Mình là AI Guide. Bạn hỏi gì về ${destination?.name || 'Núi Bà Đen'} cũng được: giá vé, giờ cáp treo, ăn uống, đường đi…`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasAsked, setHasAsked] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [visibleStreamingText, setVisibleStreamingText] = useState('');
  const [supportOpen, setSupportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDoneOpen, setConfirmDoneOpen] = useState(false);
  const menuRef = useRef(null);
  const chatBoxRef = useRef(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const prevLoadingRef = useRef(false);
  const sessionIdRef = useRef(`session_${destination?.id || 'default'}_${Date.now()}`);
  const initialQuestionRef = useRef(initialQuestion);

  useEffect(() => {
    const question = initialQuestionRef.current;
    if (!question) return;
    initialQuestionRef.current = null;
    onInitialQuestionUsed?.();
    ask(question);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeMenu = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeMenu);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!confirmDoneOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setConfirmDoneOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [confirmDoneOpen]);

  useEffect(() => {
    if (!loading && prevLoadingRef.current) {
      setStreamingText('');
      setVisibleStreamingText('');
    }
    prevLoadingRef.current = loading;
  }, [loading]);

  const scrollToBottom = (behavior = 'smooth') => {
    const box = chatBoxRef.current;
    if (box) {
      box.scrollTo({ top: box.scrollHeight, behavior });
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, visibleStreamingText]);

  useEffect(() => {
    if (!loading) {
      setVisibleStreamingText('');
      return;
    }
    if (visibleStreamingText.length >= streamingText.length) return;

    const timer = window.setTimeout(() => {
      const nextLength = Math.min(streamingText.length, visibleStreamingText.length + 3);
      setVisibleStreamingText(streamingText.slice(0, nextLength));
    }, 18);

    return () => window.clearTimeout(timer);
  }, [loading, streamingText, visibleStreamingText]);

  useEffect(() => {
    if (!loading && streamingText) {
      setStreamingText('');
      setVisibleStreamingText('');
    }
    inputRef.current?.focus();
  }, [messages, loading]);

  async function ask(question = input) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || loading) return;

    const history = messages
      .filter((message) => message.role === 'user' || message.role === 'bot')
      .slice(-8)
      .map((message) => ({
        role: message.role === 'bot' ? 'assistant' : 'user',
        content: message.text,
      }));

    setHasAsked(true);
    setMessages((prev) => [...prev, { role: 'user', text: cleanQuestion }]);
    setInput('');
    setLoading(true);
    setStreamingText('');
    setVisibleStreamingText('');

    const sessionId = sessionIdRef.current;

    const requestBody = JSON.stringify({
      destination_id: destination?.id ?? null,
      message: cleanQuestion,
      session_id: sessionId,
      history,
    });

    async function askWithoutStream() {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 60000);

      try {
        const fallbackRes = await fetch(`${API_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
          signal: controller.signal,
        });

        if (!fallbackRes.ok) throw new Error(`HTTP ${fallbackRes.status}`);
        const data = await fallbackRes.json();
        return {
          text: data.answer || 'AI chưa có câu trả lời phù hợp.',
          media: data.retrieval?.media || [],
          sources: data.retrieval?.sources || [],
          followups: data.retrieval?.followups || [],
        };
      } finally {
        window.clearTimeout(timeout);
      }
    }

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 60000);

      const res = await fetch(`${API_URL}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let botText = '';
      let standardizedText = '';
      let botMedia = [];
      let botSources = [];
      let botFollowups = [];
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const eventBlocks = buffer.split('\n\n');
        buffer = eventBlocks.pop() || '';

        for (const eventBlock of eventBlocks) {
          const lines = eventBlock.split('\n');
          const eventName = lines.find((line) => line.startsWith('event: '))?.slice(7);
          const dataLine = lines.find((line) => line.startsWith('data: '));

          if (eventName === 'done') {
            if (dataLine) {
              try {
                const data = JSON.parse(dataLine.slice(6));
                standardizedText = data.answer || '';
                botMedia = data.retrieval?.media || [];
                botSources = data.retrieval?.sources || [];
                botFollowups = data.retrieval?.followups || [];
              } catch {}
            }
            continue;
          }
          if (dataLine) {
            try {
              const data = JSON.parse(dataLine.slice(6));
              if (data.token) {
                botText += data.token;
                setStreamingText(botText);
                setVisibleStreamingText(botText);
                scrollToBottom('auto');
              }
            } catch {}
          }
        }
      }

      window.clearTimeout(timeout);

      if (buffer.trim()) {
        const lines = buffer.split('\n');
        const eventName = lines.find((line) => line.startsWith('event: '))?.slice(7);
        const dataLine = lines.find((line) => line.startsWith('data: '));
        if (dataLine) {
          try {
            const data = JSON.parse(dataLine.slice(6));
            if (eventName === 'done') {
              standardizedText = data.answer || '';
              botMedia = data.retrieval?.media || [];
              botSources = data.retrieval?.sources || [];
              botFollowups = data.retrieval?.followups || [];
            } else if (data.token) {
              botText += data.token;
              setStreamingText(botText);
              setVisibleStreamingText(botText);
            }
          } catch {}
        }
      }

      if (standardizedText) botText = standardizedText;

      if (botText) {
        setMessages((prev) => [
          ...prev,
          { role: 'bot', text: botText, media: botMedia, sources: botSources, followups: botFollowups },
        ]);
      }
    } catch (e) {
      try {
        const answer = await askWithoutStream();
        setMessages((prev) => [
          ...prev,
          { role: 'bot', text: answer.text, media: answer.media, sources: answer.sources, followups: answer.followups },
        ]);
        setLoading(false);
        setStreamingText('');
        return;
      } catch (fallbackError) {
        console.error('Chat backend error', {
          apiUrl: API_URL || window.location.origin,
          streamError: e,
          fallbackError,
        });
      }
      setMessages((prev) => [
        ...prev,
        { role: 'bot', text: 'Hiện tại AI chưa kết nối được backend. Bạn thử lại sau nhé.' },
      ]);
    }

    setLoading(false);
    setStreamingText('');
  }

  return (
    <div className="phone">
      <div className="chat-bg" aria-hidden="true" />
      <div className="page chatbot-page">
        <div className="chatbot-nav-row">
          <button className="back-btn" onClick={onBack}>
            <ArrowLeft size={22} /> <img alt="" src="/mascot-160.png" /> <span>{destination?.name || 'Địa điểm'}</span>
          </button>
          <button
            aria-controls="support-dialog"
            aria-expanded={supportOpen}
            aria-label="Mở hotline và hỗ trợ khi bị lạc"
            className="support-trigger"
            onClick={() => setSupportOpen(true)}
            title="Hotline & hỗ trợ"
            type="button"
          >
            <PhoneCall aria-hidden="true" size={22} />
          </button>
          <div className="chatbot-menu-wrap" ref={menuRef}>
            <button
              aria-controls="chatbot-actions"
              aria-expanded={menuOpen}
              aria-label="Tùy chọn trải nghiệm"
              className="chatbot-menu-trigger"
              onClick={() => setMenuOpen((open) => !open)}
              type="button"
            >
              <MoreHorizontal aria-hidden="true" size={22} />
            </button>
            {menuOpen && (
              <div className="chatbot-actions" id="chatbot-actions">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDoneOpen(true);
                  }}
                  type="button"
                >
                  Hoàn tất trải nghiệm
                </button>
              </div>
            )}
          </div>
        </div>

        {!hasAsked && (
          <div className="quick-questions" aria-label="Câu hỏi gợi ý">
            <button onClick={() => ask('Có gì chơi ở đây?')}><em>🎡</em>Có gì chơi?</button>
            <button onClick={() => ask('Giá vé cáp treo bao nhiêu?')}><em>🎫</em>Giá vé cáp treo?</button>
            <button onClick={() => ask('Cáp treo chạy mấy giờ?')}><em>🕒</em>Giờ cáp treo?</button>
            <button onClick={() => ask('Ăn uống trên núi thế nào?')}><em>🍜</em>Ăn uống ở đâu?</button>
            <button onClick={() => ask('Nên đi săn mây lúc nào?')}><em>☁️</em>Săn mây lúc nào?</button>
            <button onClick={() => ask('Gợi ý lịch trình đi Núi Bà Đen')}><em>🗺️</em>Gợi ý lịch trình</button>
          </div>
        )}

        {!hasAsked && (
          <div className="chat-intro">
            <MascotHello bubble={false} size={64} />
            <span>
              <b>AI Guide Núi Bà Đen</b>
              <small>Hỏi gì cũng được, mình trả lời theo dữ liệu chính thức.</small>
            </span>
          </div>
        )}

        <div className="chat-box" aria-live="polite" ref={chatBoxRef}>
          {messages.map((message, index) => (
            <div className={`msg ${message.role === 'user' ? 'user' : 'bot'}`} key={index}>
              <MarkdownMessage text={message.text} />
              {message.role === 'bot' && <MessageMedia media={message.media} />}
              {message.role === 'bot' && <MessageSources sources={message.sources} />}
              {message.role === 'bot' && !loading && index === messages.length - 1 && message.followups?.length > 0 && (
                <div className="quick-questions followup-questions" aria-label="Hỏi tiếp">
                  {message.followups.map((question) => (
                    <button key={question} onClick={() => ask(question)} type="button">{question}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="msg bot streaming-bubble">
              {visibleStreamingText ? (
                <>
                  <MarkdownMessage text={visibleStreamingText} />
                  <span className="typing-cursor" />
                </>
              ) : (
                <span className="typing-dots" aria-label="Đang trả lời"><i /><i /><i /></span>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form className="chat-input" onSubmit={(event) => { event.preventDefault(); ask(); }}>
          <input
            disabled={loading}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Nhập câu hỏi"
            ref={inputRef}
            value={input}
          />
          <button aria-label="Gửi câu hỏi" disabled={loading || !input.trim()} type="submit">
            <Send size={20} /> Gửi
          </button>
        </form>

        {confirmDoneOpen && (
          <div className="finish-overlay" onClick={() => setConfirmDoneOpen(false)} role="presentation">
            <section
              aria-describedby="finish-description"
              aria-labelledby="finish-title"
              aria-modal="true"
              className="finish-dialog"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <h3 id="finish-title">Hoàn tất trải nghiệm?</h3>
              <p id="finish-description">Bạn muốn kết thúc phần khám phá tại địa điểm này?</p>
              <div className="finish-dialog-actions">
                <button autoFocus onClick={() => setConfirmDoneOpen(false)} type="button">
                  Tiếp tục khám phá
                </button>
                <button className="finish-confirm-btn" onClick={onDone} type="button">
                  Hoàn tất
                </button>
              </div>
            </section>
          </div>
        )}

        <SupportSheet onClose={() => setSupportOpen(false)} open={supportOpen} />
      </div>
    </div>
  );
}



