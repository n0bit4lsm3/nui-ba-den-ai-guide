import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock, Gauge, Sparkles, TramFront, Wallet } from 'lucide-react';

import {
  Bank, BowlFood, Camera, FlowerLotus, Heart, HourglassMedium, MoonStars, Sun, SunHorizon, Users, UsersThree,
} from '@phosphor-icons/react';

import { API_URL, assetUrl } from '../api';
import { COMPANIONS, PURPOSES, TIMES, rank } from '../pages/ItineraryPage';

// Duotone icons for the planner choices, keyed by option key.
const ICONS = {
  dawn: SunHorizon, half: HourglassMedium, full: Sun, evening: MoonStars,
  pilgrim: FlowerLotus, photo: Camera, history: Bank, food: BowlFood,
  family: UsersThree, couple: Heart, friends: Users,
};

// "Lên kế hoạch ngay" on the home page: the itinerary planner, shown in the
// content sheet under the hero instead of on a separate page.
function Choices({ step, label, options, value, onChange }) {
  return (
    <div className="plan2-group">
      <h3><span>{step}</span> {label}</h3>
      <div className="plan2-options">
        {options.map((option) => {
          const active = option.key === value;
          const Icon = ICONS[option.key];
          return (
            <button
              aria-pressed={active}
              className={active ? 'plan2-option is-active' : 'plan2-option'}
              key={option.key}
              onClick={() => onChange(active ? null : option.key)}
              type="button"
            >
              <span className="plan2-icon">{Icon && <Icon size={24} weight="duotone" />}</span>
              <b>{option.label}</b>
              {option.hint && <small>{option.hint}</small>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Route({ steps }) {
  // A step is either a stop (has a name) or a transfer note; the note is shown
  // on the stop it leads to, e.g. "cáp Vân Sơn" above the summit statue.
  const stops = [];
  let via = '';
  steps.forEach((step) => {
    if (!step.name) { via = step.note || via; return; }
    stops.push({ ...step, via: step.note || via });
    via = '';
  });
  return (
    <ol className="plan2-route">
      {stops.map((stop, index) => (
        <li key={`${stop.destination_id || stop.name}-${index}`}>
          {stop.via && <span className="plan2-via"><TramFront size={14} /> {stop.via}</span>}
          <div className="plan2-stop">
            <span className="plan2-no">{index + 1}</span>
            {stop.image_url ? <img alt="" loading="lazy" src={assetUrl(stop.image_url)} /> : <span className="plan2-noimg" />}
            <span>
              <b>{stop.name}</b>
              {stop.location && <small>{stop.location}</small>}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function PlanPanel({ onClose, onAsk }) {
  const [itineraries, setItineraries] = useState([]);
  const [loadError, setLoadError] = useState(false);
  const [time, setTime] = useState(null);
  const [purpose, setPurpose] = useState(null);
  const [companion, setCompanion] = useState(null);
  const [pickedId, setPickedId] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/api/itineraries`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => setItineraries(Array.isArray(data.itineraries) ? data.itineraries : []))
      .catch((error) => { if (error.name !== 'AbortError') setLoadError(true); });
    return () => controller.abort();
  }, []);

  useEffect(() => setPickedId(null), [time, purpose, companion]);

  const ranked = useMemo(() => rank(itineraries, { time, purpose, companion }), [itineraries, time, purpose, companion]);
  const hasChoice = Boolean(time || purpose || companion);
  const matched = hasChoice && ranked[0]?.score > 0;
  // Before any choice (or when nothing matches) show the first itinerary so the panel is never empty.
  const best = itineraries.find((it) => it.id === pickedId) || (matched ? ranked[0].it : itineraries[0]);
  const others = itineraries.filter((it) => it !== best);

  return (
    <section className="explore-panel plan2">
      <header className="explore-head">
        <h2>Lên kế hoạch tham quan</h2>
        <button className="explore-back" onClick={onClose} type="button"><ArrowLeft size={18} /> Trang chủ</button>
        <p className="plan2-lead">Chọn vài điều bên dưới, AI Guide gợi ý lộ trình hợp với bạn.</p>
      </header>

      <div className="plan2-body">
        <div className="plan2-form">
          <Choices label="Bạn có bao nhiêu thời gian?" onChange={setTime} options={TIMES} step={1} value={time} />
          <Choices label="Bạn đi để làm gì?" onChange={setPurpose} options={PURPOSES} step={2} value={purpose} />
          <Choices label="Bạn đi cùng ai?" onChange={setCompanion} options={COMPANIONS} step={3} value={companion} />

          {others.length > 0 && (
            <div className="plan2-others">
              <h3>Lịch trình khác</h3>
              <div className="plan2-chips">
                {others.map((it) => (
                  <button key={it.id} onClick={() => setPickedId(it.id)} type="button">
                    {it.title} <small>{it.duration}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="plan2-result" aria-live="polite">
          {loadError && <p className="plan2-empty">Chưa tải được lịch trình. Kiểm tra kết nối rồi thử lại.</p>}
          {best && (
            <>
              <span className="plan2-badge">
                <Sparkles size={14} />
                {pickedId ? 'Lịch trình bạn chọn' : matched ? 'Gợi ý hợp với bạn' : hasChoice ? 'Chưa có lịch trình khớp, thử lịch trình phổ biến' : 'Lịch trình phổ biến'}
              </span>
              <h3>{best.title}</h3>
              <div className="plan2-meta">
                {best.duration && <span><Clock size={15} /> {best.duration}</span>}
                {best.difficulty_level && <span><Gauge size={15} /> {best.difficulty_level}</span>}
                {best.suitable_for && <span>{best.suitable_for}</span>}
              </div>

              {Array.isArray(best.steps) && best.steps.length > 0 && <Route steps={best.steps} />}

              {best.description && <p className="plan2-desc">{best.description}</p>}
              {best.estimated_cost_note && (
                <div className="plan2-cost">
                  <b><Wallet size={16} /> Chi phí ước tính</b>
                  <p>{best.estimated_cost_note}</p>
                </div>
              )}

              <button
                className="explore-primary plan2-ask"
                onClick={() => onAsk(/^lịch trình/i.test(best.title) ? best.title : `Lịch trình ${best.title}`)}
                type="button"
              >
                <img alt="" src="/ai-avatar.png" /> Hỏi AI Guide về lịch trình này
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
