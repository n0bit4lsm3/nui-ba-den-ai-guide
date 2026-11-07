import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Clock, MapPin, Navigation } from 'lucide-react';

import { assetUrl } from '../api';
import { categoryFor, destinationMedia } from '../pages/LandingPage';

// "Xem tất cả" on the home page: the destination list and detail, shown in the
// content sheet under the hero instead of on a separate page.
const TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'summit', label: 'Đỉnh núi', tag: 'Đỉnh' },
  { key: 'slope', label: 'Thân núi', tag: 'Thân' },
  { key: 'foot', label: 'Chân núi', tag: 'Chân' },
];
const TAG = Object.fromEntries(TABS.filter((tab) => tab.tag).map((tab) => [tab.key, tab.tag]));

export default function ExplorePanel({ destinations, initialZone = 'all', onClose, onAskAbout }) {
  const [zone, setZone] = useState(initialZone || 'all');
  const [selectedId, setSelectedId] = useState(null);
  const [photo, setPhoto] = useState(0);
  // Advances every 3s: card photos slide to their next image, and so does the detail gallery.
  const [tick, setTick] = useState(0);

  useEffect(() => setPhoto(0), [selectedId]);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setInterval(() => setTick((value) => value + 1), 3000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setPhoto((value) => {
      const count = destinationMedia(destinations.find((item) => item.id === selectedId)).length;
      return count > 1 ? (value + 1) % count : value;
    });
  }, [tick]);

  const counts = useMemo(() => destinations.reduce(
    (acc, item) => ({ ...acc, [categoryFor(item)]: (acc[categoryFor(item)] || 0) + 1 }),
    { all: destinations.length },
  ), [destinations]);

  const list = useMemo(() => {
    // destinations.display_order (Excel) pins a place near the top; the rest keep sheet order.
    const rank = (item) => (Number(item.display_order) > 0 ? Number(item.display_order) : Number.MAX_SAFE_INTEGER);
    return destinations
      .filter((item) => zone === 'all' || categoryFor(item) === zone)
      .sort((a, b) => rank(a) - rank(b));
  }, [destinations, zone]);

  const selected = destinations.find((item) => item.id === selectedId);

  if (selected) {
    const media = destinationMedia(selected);
    const step = (delta) => setPhoto((photo + delta + media.length) % media.length);

    return (
      <section className="explore-panel">
        <header className="explore-head">
          <button className="explore-back" onClick={() => setSelectedId(null)} type="button"><ArrowLeft size={18} /> Danh sách</button>
        </header>
        <div className="explore-detail">
          <div className="explore-gallery">
            <span className="explore-track" style={{ transform: `translateX(-${photo * 100}%)` }}>
              {media.map((item, index) => (
                <img alt={item.alt_text || item.caption || selected.name} key={`${item.url}-${index}`} src={assetUrl(item.url)} />
              ))}
            </span>
            {media.length > 1 && (
              <>
                <button aria-label="Ảnh trước" className="explore-nav is-prev" onClick={() => step(-1)} type="button"><ChevronLeft /></button>
                <button aria-label="Ảnh tiếp theo" className="explore-nav is-next" onClick={() => step(1)} type="button"><ChevronRight /></button>
                <span className="explore-count">{photo + 1}/{media.length}</span>
              </>
            )}
            {TAG[categoryFor(selected)] && <em className="explore-tag">{TAG[categoryFor(selected)]}</em>}
          </div>
          <div className="explore-info">
            <h2>{selected.name}</h2>
            <p className="explore-meta"><MapPin size={16} /> {selected.location || 'Tây Ninh, Việt Nam'}</p>
            {selected.estimated_duration && <p className="explore-meta"><Clock size={16} /> {selected.estimated_duration}</p>}
            <p className="explore-text">{selected.description_detail || selected.short_description}</p>
            {selected.navigation_note && <p className="explore-note">{selected.navigation_note}</p>}
            <div className="explore-actions">
              <button className="explore-primary" onClick={() => onAskAbout(selected)} type="button">
                <img alt="" src="/mascot-hero.png" /> Hỏi AI Guide về địa điểm này
              </button>
              {selected.google_maps_url && (
                <a className="explore-secondary" href={selected.google_maps_url} rel="noreferrer" target="_blank">
                  <Navigation size={18} /> Mở Google Maps
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="explore-panel">
      <header className="explore-head">
        <h2>Khám phá điểm tham quan</h2>
        <div className="explore-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              aria-selected={zone === tab.key}
              className={zone === tab.key ? 'is-active' : ''}
              key={tab.key}
              onClick={() => setZone(tab.key)}
              role="tab"
              type="button"
            >
              {tab.label} <span>{counts[tab.key] || 0}</span>
            </button>
          ))}
        </div>
        <button className="explore-back" onClick={onClose} type="button"><ArrowLeft size={18} /> Trang chủ</button>
      </header>
      <div className="explore-grid">
        {list.map((item) => {
          const media = destinationMedia(item);
          const index = media.length ? tick % media.length : 0;
          return (
            <button className="explore-card" key={item.id || item.name} onClick={() => setSelectedId(item.id)} type="button">
              <span className="explore-card-photo">
                <span className="explore-track" style={{ transform: `translateX(-${index * 100}%)` }}>
                  {media.map((photoItem, i) => (
                    <img alt="" key={`${photoItem.url}-${i}`} loading="lazy" src={assetUrl(photoItem.url)} />
                  ))}
                </span>
                {media.length > 1 && <span className="explore-count">{index + 1}/{media.length}</span>}
                {TAG[categoryFor(item)] && <em className="explore-tag">{TAG[categoryFor(item)]}</em>}
              </span>
              <span className="explore-card-body">
                <b>{item.name}</b>
                <small><MapPin size={14} /> {item.location || 'Tây Ninh, Việt Nam'}</small>
                {item.short_description && <span className="explore-card-desc">{item.short_description}</span>}
              </span>
              <ArrowRight className="explore-card-arrow" size={18} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
