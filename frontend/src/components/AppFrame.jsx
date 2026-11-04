import { useState } from 'react';
import { Check, PhoneCall } from 'lucide-react';

import SkyScene from './SkyScene';
import SupportSheet from './SupportSheet';

// App shell: a slim top bar (brand, 3-step progress, support) over the animated
// sky, with each page on a plain white sheet underneath.
const STEPS = [
  { key: 'video', label: 'Xem video', order: 1 },
  { key: 'landing', label: 'Chọn địa điểm', order: 2 },
  { key: 'chatbot', label: 'Hỏi AI Guide', order: 3 },
];
const STEP_ORDER = { video: 1, landing: 2, itinerary: 2, chatbot: 3, thankyou: 4 };

export default function AppFrame({ step, destination, videoWatched, onGo, children }) {
  const current = STEP_ORDER[step] || 1;
  const [supportOpen, setSupportOpen] = useState(false);
  const activeStep = STEPS.find((item) => item.order === current) || STEPS[STEPS.length - 1];

  return (
    <div className="app-shell">
      <SkyScene />

      <header className="app-bar">
        <button className="app-brand" onClick={() => onGo('video')} type="button">
          <img alt="" src="/mascot-160.png" />
          <span>AI Guide <b>Núi Bà Đen</b></span>
        </button>

        <ol className="app-steps" aria-label="Các bước">
          {STEPS.map((item) => {
            const state = item.order === current ? 'is-active' : item.order < current ? 'is-done' : '';
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
                  <span className="app-step-no">{state === 'is-done' ? <Check size={14} strokeWidth={3} /> : item.order}</span>
                  <span className="app-step-label">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="app-step-mobile">
          Bước {Math.min(current, 3)}/3 · {activeStep.label}
        </div>

        <button className="app-support" onClick={() => setSupportOpen(true)} type="button">
          <PhoneCall size={18} />
          <span>Hỗ trợ</span>
        </button>
      </header>

      <main className="app-main">{children}</main>

      <SupportSheet onClose={() => setSupportOpen(false)} open={supportOpen} />
    </div>
  );
}
