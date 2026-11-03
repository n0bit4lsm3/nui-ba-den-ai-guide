import { useEffect, useState } from 'react';
import { PhoneCall, X } from 'lucide-react';

import { API_URL } from '../api';

// "Khi bị lạc" guidance + hotlines. Used by the chat header and the desktop
// side panel. Falls back to built-in numbers when the API is unreachable.
const FALLBACK_SUPPORT = {
  lost_guidance: [
    'Dừng di chuyển và không tự đi sâu thêm.',
    'Bật định vị, chia sẻ vị trí và mô tả mốc gần nhất.',
    'Giữ liên lạc và tiết kiệm pin trong lúc chờ hỗ trợ.',
  ],
  contacts: [
    { kind: 'emergency', name: 'Tổng đài khẩn cấp quốc gia', phone: '112', display_phone: '112', description: 'Cứu nạn khẩn cấp 24/7, miễn phí cuộc gọi.' },
    { kind: 'management', name: 'Ban quản lý KDL Quốc gia Núi Bà Đen', phone: '02763823378', display_phone: '0276 3823 378', description: 'Hỗ trợ tại khu du lịch và thông tin điểm đến.' },
    { kind: 'visitor_support', name: 'Sun World Ba Den Mountain', phone: '0327222227', display_phone: '0327 222 227', description: 'Hỗ trợ dịch vụ và vấn đề phát sinh khi tham quan.' },
  ],
};

export default function SupportSheet({ open, onClose }) {
  const [support, setSupport] = useState(FALLBACK_SUPPORT);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/api/support`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((data) => {
        if (Array.isArray(data?.contacts) && data.contacts.length) setSupport(data);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="support-overlay" onClick={onClose} role="presentation">
      <section
        aria-labelledby="support-title"
        aria-modal="true"
        className="support-sheet"
        id="support-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="support-sheet-header">
          <div>
            <small>Hỗ trợ an toàn</small>
            <h3 id="support-title">Khi bị lạc trên Núi Bà Đen</h3>
          </div>
          <button aria-label="Đóng" onClick={onClose} type="button">
            <X size={19} />
          </button>
        </div>

        <ol className="lost-guidance">
          {(support.lost_guidance || FALLBACK_SUPPORT.lost_guidance).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>

        <div className="support-contact-list">
          {(support.contacts || FALLBACK_SUPPORT.contacts).map((contact) => (
            <a
              className={`support-contact ${contact.kind === 'emergency' ? 'is-emergency' : ''}`}
              href={`tel:${contact.phone}`}
              key={`${contact.kind}-${contact.phone}`}
            >
              <span className="support-phone-icon"><PhoneCall size={18} /></span>
              <span>
                <b>{contact.name}</b>
                <strong>{contact.display_phone || contact.phone}</strong>
                <small>{contact.description}</small>
              </span>
            </a>
          ))}
        </div>

        <p className="support-warning">
          Chỉ gọi 112 khi có nguy hiểm, tai nạn hoặc cần cứu nạn khẩn cấp.
        </p>
      </section>
    </div>
  );
}
