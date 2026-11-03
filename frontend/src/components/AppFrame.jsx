import { useState } from 'react';
import { Check, Clapperboard, Lock, MapPin, MessageCircleHeart, PhoneCall } from 'lucide-react';

import MascotHello from './MascotHello';
import SkyScene from './SkyScene';
import SupportSheet from './SupportSheet';

// Desktop shell: a sticky side panel with the guide, the three steps of the
// journey and the hotline. Hidden on phones, where each page fills the screen.
const STEPS = [
  { key: 'video', label: 'Xem video', icon: Clapperboard, order: 1 },
  { key: 'landing', label: 'Chọn địa điểm', icon: MapPin, order: 2 },
  { key: 'chatbot', label: 'Hỏi AI Guide', icon: MessageCircleHeart, order: 3 },
];
const STEP_ORDER = { video: 1, landing: 2, itinerary: 2, chatbot: 3, thankyou: 4 };

export default function AppFrame({ step, destination, videoWatched, onGo, children }) {
  const current = STEP_ORDER[step] || 1;
  const [supportOpen, setSupportOpen] = useState(false);

  return (
    <div className="app-shell">
      <SkyScene />
      <aside className="app-sidebar" aria-label="Hành trình">
        <div className="app-sidebar-hero">
          <MascotHello size={120} text={step === 'thankyou' ? 'Hẹn gặp lại!' : 'Xin chào!'} />
          <b>AI Guide Núi Bà Đen</b>
          <small>Hướng dẫn viên AI của bạn</small>
        </div>

        <ol className="app-steps">
          {STEPS.map((item) => {
            const Icon = item.icon;
            const state = item.order === current ? 'is-active' : item.order < current ? 'is-done' : '';
            // Later steps unlock only after the intro video has been watched.
            const locked = item.key !== 'video' && !videoWatched;
            const disabled = locked || (item.key === 'chatbot' && !destination);
            return (
              <li className={state} key={item.key}>
                <button
                  disabled={disabled}
                  onClick={() => onGo(item.key)}
                  title={locked ? 'Xem hết video giới thiệu để mở bước này' : undefined}
                  type="button"
                >
                  <span className="app-step-icon">
                    {state === 'is-done' ? <Check size={18} strokeWidth={3} /> : locked ? <Lock size={18} /> : <Icon size={20} />}
                  </span>
                  <span>{item.label}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <button className="app-hotline" onClick={() => setSupportOpen(true)} type="button">
          <PhoneCall size={20} />
          <span>
            <small>Khi bị lạc hoặc cần giúp</small>
            <b>Hotline & hỗ trợ</b>
          </span>
        </button>
      </aside>

      <SupportSheet onClose={() => setSupportOpen(false)} open={supportOpen} />

      {children}
    </div>
  );
}
