import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Camera, Clock, Flower2, Heart, Hourglass, Landmark, Moon, Sun, Sunrise, Users, UsersRound, UtensilsCrossed,
} from 'lucide-react';

import { API_URL, assetUrl } from '../api';

// All choices are matched against text columns of the itineraries sheet, so a
// new row in Excel shows up here without code changes.
export const TIMES = [
  { key: 'dawn', label: 'Sáng sớm', hint: 'Chuyến cáp đầu', icon: Sunrise, match: (it) => /sáng sớm/i.test(it.best_time) },
  { key: 'half', label: 'Nửa ngày', hint: 'Khoảng 3–4 giờ', icon: Hourglass, match: (it) => /^0\.5/.test(it.duration) },
  { key: 'full', label: 'Cả ngày', hint: 'Sáng đến chiều', icon: Sun, match: (it) => /^1 ngày/.test(it.duration) },
  { key: 'evening', label: 'Chiều tối', hint: 'Sau 17h', icon: Moon, match: (it) => /17h|tối|đêm/i.test(`${it.best_time} ${it.title}`) },
];

// The suitable_for column mixes reasons for the trip with who comes along, so
// the two are asked separately.
export const PURPOSES = [
  { key: 'pilgrim', label: 'Hành hương', icon: Flower2, match: (it) => /tâm linh/i.test(it.suitable_for) },
  { key: 'photo', label: 'Săn mây, chụp ảnh', icon: Camera, match: (it) => /photo|check-in/i.test(it.suitable_for) },
  { key: 'history', label: 'Lịch sử, văn hóa', icon: Landmark, match: (it) => /lịch sử|văn hóa/i.test(it.suitable_for) },
  { key: 'food', label: 'Ăn uống', icon: UtensilsCrossed, match: (it) => /ẩm thực/i.test(it.suitable_for) },
];

export const COMPANIONS = [
  { key: 'family', label: 'Gia đình', hint: 'Có người lớn tuổi', icon: Users, match: (it) => /gia đình|lớn tuổi/i.test(it.suitable_for) },
  { key: 'couple', label: 'Cặp đôi', hint: 'Đi hai người', icon: Heart, match: (it) => /couple/i.test(it.suitable_for) },
  { key: 'friends', label: 'Bạn bè', hint: 'Nhóm trẻ, sinh viên', icon: UsersRound, match: (it) => /nhóm trẻ|sinh viên/i.test(it.suitable_for) },
];

export function rank(itineraries, picks) {
  const defs = [[TIMES, picks.time], [PURPOSES, picks.purpose], [COMPANIONS, picks.companion]]
    .map(([options, key]) => options.find((item) => item.key === key))
    .filter(Boolean);
  return itineraries
    .map((it) => ({ it, score: defs.reduce((sum, def) => sum + (def.match(it) ? 2 : 0), 0) }))
    .sort((a, b) => b.score - a.score);
}

function ChoiceGroup({ label, options, value, onChange }) {
  return (
    <div className="plan-group">
      <h3>{label}</h3>
      <div className="plan-options">
        {options.map((option) => {
          const Icon = option.icon;
          const active = option.key === value;
          return (
            <button
              aria-pressed={active}
              className={active ? 'plan-option is-active' : 'plan-option'}
              key={option.key}
              onClick={() => onChange(active ? null : option.key)}
              type="button"
            >
              <Icon size={22} />
              <span>
                <b>{option.label}</b>
                {option.hint && <small>{option.hint}</small>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Timeline({ steps }) {
  return (
    <ol className="plan-timeline">
      {steps.map((step, index) => (
        <li key={`${step.destination_id || step.note}-${index}`}>
          {step.note && <small className="plan-transfer">{step.note}</small>}
          {step.name && (
            <div className="plan-stop">
              {step.image_url ? <img alt="" loading="lazy" src={assetUrl(step.image_url)} /> : <span className="plan-stop-dot" />}
              <span>
                <b>{step.name}</b>
                {step.location && <small>{step.location}</small>}
              </span>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function ItineraryPage({ onBack, onAsk }) {
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
      .catch(() => setLoadError(true));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setPickedId(null);
  }, [time, purpose, companion]);

  const ranked = useMemo(
    () => rank(itineraries, { time, purpose, companion }),
    [itineraries, time, purpose, companion],
  );
  const hasChoice = Boolean(time || purpose || companion);
  const best = pickedId
    ? itineraries.find((it) => it.id === pickedId)
    : hasChoice && ranked[0]?.score > 0
      ? ranked[0].it
      : null;
  const alternatives = ranked.filter(({ it, score }) => it !== best && (score > 0 || !hasChoice)).map(({ it }) => it).slice(0, 3);

  return (
    <div className="phone">
      <div className="page plan-page">
        <button className="back-btn" onClick={onBack} type="button">
          <ArrowLeft size={22} /> Địa điểm
        </button>

        <div>
          <h2>Lên lịch trình</h2>
          <p className="small-text">Chọn vài điều bên dưới, mình gợi ý lộ trình phù hợp từ các lịch trình có sẵn.</p>
        </div>

        <ChoiceGroup label="Bạn có bao nhiêu thời gian?" options={TIMES} value={time} onChange={setTime} />
        <ChoiceGroup label="Bạn đi để làm gì?" options={PURPOSES} value={purpose} onChange={setPurpose} />
        <ChoiceGroup label="Bạn đi cùng ai?" options={COMPANIONS} value={companion} onChange={setCompanion} />

        {loadError && <p className="plan-empty">Chưa tải được lịch trình. Kiểm tra kết nối rồi thử lại.</p>}

        {best ? (
          <section className="plan-result" aria-live="polite">
            <div className="plan-result-head">
              <small>Gợi ý cho bạn</small>
              <h3>{best.title}</h3>
              <p className="plan-meta">
                <Clock size={16} /> {best.duration}
                {best.difficulty_level && <> · {best.difficulty_level}</>}
              </p>
            </div>

            <Timeline steps={best.steps} />

            <p>{best.description}</p>
            {best.best_time && <p className="small-text">Thời điểm nên đi: {best.best_time}.</p>}
            {best.estimated_cost_note && (
              <div className="plan-cost">
                <b>Chi phí ước tính</b>
                <p>{best.estimated_cost_note}</p>
              </div>
            )}

            <button className="primary-btn" onClick={() => onAsk(/^lịch trình/i.test(best.title) ? best.title : `Lịch trình ${best.title}`)} type="button">
              <img alt="" className="mascot-btn-icon" src="/mascot-160.png" /> Hỏi AI Guide về lịch trình này
            </button>
          </section>
        ) : (
          hasChoice && itineraries.length > 0 && (
            <p className="plan-empty">Chưa có lịch trình nào khớp cả hai lựa chọn. Thử đổi một trong hai, hoặc chọn bên dưới.</p>
          )
        )}

        {alternatives.length > 0 && (
          <div className="plan-alternatives">
            <h3>{best ? 'Lịch trình khác' : 'Các lịch trình có sẵn'}</h3>
            {alternatives.map((it) => (
              <button className="plan-alt" key={it.id} onClick={() => setPickedId(it.id)} type="button">
                <b>{it.title}</b>
                <small>{it.duration} · {it.suitable_for}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
