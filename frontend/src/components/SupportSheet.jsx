import { useEffect, useState } from 'react';
import { Buildings, ChatCircleText, HandPalm, Headset, Lifebuoy, MapPinLine, Phone, Siren, X } from '@phosphor-icons/react';

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

// Icons for the three "khi bị lạc" steps (in sheet order) and for each hotline kind.
const STEP_ICONS = [HandPalm, MapPinLine, ChatCircleText];
const CONTACT_ICONS = { emergency: Siren, management: Buildings, visitor_support: Headset };

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

  const contacts = support.contacts || FALLBACK_SUPPORT.contacts;
  const emergency = contacts.find((contact) => contact.kind === 'emergency');
  const hotlines = contacts.filter((contact) => contact !== emergency);
  const steps = support.lost_guidance || FALLBACK_SUPPORT.lost_guidance;

  return (
    <div className="sup2-overlay" onClick={onClose} role="presentation">
      <section
        aria-labelledby="support-title"
        aria-modal="true"
        className="sup2"
        id="support-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="sup2-head">
          <span className="sup2-badge"><Lifebuoy size={22} weight="duotone" /></span>
          <span>
            <h3 id="support-title">Hỗ trợ &amp; hotline</h3>
            <small>Núi Bà Đen luôn có người sẵn sàng giúp bạn</small>
          </span>
          <button aria-label="Đóng" className="sup2-close" onClick={onClose} type="button"><X size={18} /></button>
        </header>

        {emergency && (
          <a className="sup2-sos" href={`tel:${emergency.phone}`}>
            <span className="sup2-sos-icon"><Siren size={26} weight="duotone" /></span>
            <span className="sup2-sos-text">
              <b>Khẩn cấp: gọi {emergency.display_phone || emergency.phone}</b>
              <small>{emergency.description} Chỉ gọi khi có nguy hiểm, tai nạn.</small>
            </span>
            <span className="sup2-sos-call"><Phone size={18} weight="fill" /> Gọi {emergency.display_phone || emergency.phone}</span>
          </a>
        )}

        <div className="sup2-body">
          <div className="sup2-col">
            <h4>Khi bị lạc trên núi</h4>
            <ol className="sup2-steps">
              {steps.map((item, index) => {
                const Icon = STEP_ICONS[index] || ChatCircleText;
                return (
                  <li key={item}>
                    <span className="sup2-step-icon"><Icon size={20} weight="duotone" /><em>{index + 1}</em></span>
                    <p>{item}</p>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="sup2-col">
            <h4>Hotline hỗ trợ</h4>
            <div className="sup2-contacts">
              {hotlines.map((contact) => {
                const Icon = CONTACT_ICONS[contact.kind] || Headset;
                return (
                  <div className="sup2-contact" key={`${contact.kind}-${contact.phone}`}>
                    <span className="sup2-contact-icon"><Icon size={20} weight="duotone" /></span>
                    <span className="sup2-contact-info">
                      <b>{contact.name}</b>
                      <strong>{contact.display_phone || contact.phone}</strong>
                      <small>{contact.description}</small>
                    </span>
                    <a aria-label={`Gọi ${contact.name}`} className="sup2-call" href={`tel:${contact.phone}`}>
                      <Phone size={16} weight="fill" /> Gọi
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
