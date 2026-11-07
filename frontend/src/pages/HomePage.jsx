import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, PhoneCall, Play, Sparkles } from 'lucide-react';

import { API_URL, assetUrl } from '../api';
import ExplorePanel from '../components/ExplorePanel';
import PlanPanel from '../components/PlanPanel';
import HomeChat from '../components/HomeChat';
import { Logo } from '../components/Brand';
import { categoryFor, destinationMedia } from './LandingPage';

const INTRO_VIDEO_URL = import.meta.env.VITE_INTRO_VIDEO_URL || 'https://res.cloudinary.com/df6nsfnjk/video/upload/q_auto/f_auto/v1780989537/intro_nui_ba_den_xzcgcs.mp4';
const BOOKING_URL = 'https://sunworld.vn/ba-den';

// One featured place per zone, as on the design.
const ZONES = [
  { key: 'summit', tag: 'Đỉnh', place: 'Tượng Phật Bà Tây Bổ Đà Sơn' },
  { key: 'slope', tag: 'Thân', place: 'Động Ba Cô - Quan Âm Tự' },
  { key: 'foot', tag: 'Chân', place: 'Linh Sơn Hòa Đồng Tự' },
];



// Three short strokes fanning out, the "sparkle" drawn next to headings and the mascot.
function Burst({ className = '' }) {
  return (
    <svg aria-hidden="true" className={`burst ${className}`} fill="currentColor" viewBox="0 0 40 40">
      <path d="M24 2c1.1 7.7 6.3 12.9 14 14-7.7 1.1-12.9 6.3-14 14-1.1-7.7-6.3-12.9-14-14 7.7-1.1 12.9-6.3 14-14Z" />
      <path d="M9 24c.6 4 3.3 6.7 7 7-3.7.6-6.4 3.3-7 7-.6-3.7-3.3-6.4-7-7 3.7-.3 6.4-3 7-7Z" />
    </svg>
  );
}

function PinIcon({ size = 20 }) {
  return (
    <svg aria-hidden="true" height={size} viewBox="0 0 24 24" width={size}>
      <path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7z" fill="#12202b" />
      <circle cx="12" cy="9" fill="#fff" r="2.6" />
    </svg>
  );
}


export default function HomePage({ destination, onAsk, onAskAbout, onOpenChat }) {
  const [destinations, setDestinations] = useState(destination ? [destination] : []);
  // Question from the hero search box, answered in the chatbot card below.
  const [heroQuestion, setHeroQuestion] = useState(null);
  const [search, setSearch] = useState('');
  const [playing, setPlaying] = useState(false);
  const searchRef = useRef(null);
  const videoRef = useRef(null);
  const sheetRef = useRef(null);
  // Zone shown in the in-page destination list; null = home cards.
  const [exploreZone, setExploreZone] = useState(null);
  const [planOpen, setPlanOpen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    fetch(`${API_URL}/api/destinations`)
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data.destinations)) setDestinations(data.destinations); })
      .catch(() => {});
  }, []);

  const byName = (name) => destinations.find((item) => (item.name || '').trim() === name);
  const photoOf = (name) => assetUrl(destinationMedia(byName(name))[0]?.url);
  const statuePhoto = photoOf('Tượng Phật Bà Tây Bổ Đà Sơn');
  const heroUrl = '/hero-vista.jpg';

  const zones = useMemo(() => ZONES.map((zone) => ({
    ...zone,
    photo: photoOf(zone.place),
    // Open the list of the zone the place belongs to in the data.
    zoneKey: byName(zone.place) ? categoryFor(byName(zone.place)) : zone.key,
  })), [destinations]);


  function showInSheet() {
    requestAnimationFrame(() => sheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function openExplore(zone) {
    setPlanOpen(false);
    setExploreZone(zone || 'all');
    showInSheet();
  }

  function openPlan() {
    setExploreZone(null);
    setPlanOpen(true);
    showInSheet();
  }

  function askFromHero(event) {
    event.preventDefault();
    const text = search.trim();
    if (!text) return;
    setExploreZone(null);
    setPlanOpen(false);
    setHeroQuestion({ text, at: Date.now() });
    setSearch('');
    requestAnimationFrame(() => document.querySelector('.home-chat')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  return (
    <div className="home">
      <section className="home-hero" style={{ '--hero-img': `url(${heroUrl})` }}>
        <nav className="home-nav" aria-label="Điều hướng chính">
          <div className="home-brand">
            <Logo />
            <span>NÚI BÀ ĐEN<small>Tây Ninh · Việt Nam</small></span>
          </div>
          <div className="home-nav-right">
            <button className="home-support" onClick={() => window.dispatchEvent(new Event('nbd:support'))} type="button"><PhoneCall size={16} /> Hỗ trợ</button>
          </div>
        </nav>

        <div className="home-hero-text">
          <span className="home-script">Khám phá</span>
          <h1><Burst className="burst-title-left" />Núi Bà Đen<Burst className="burst-title" /></h1>
          <p>Hành trình tâm linh – Trải nghiệm trọn vẹn</p>
          <form className="home-search" onSubmit={askFromHero}>
            <Sparkles size={18} />
            <input onChange={(e) => setSearch(e.target.value)} placeholder="Hỏi AI Guide bất cứ điều gì về Núi Bà Đen…" ref={searchRef} value={search} />
            <button aria-label="Hỏi AI Guide" type="submit"><ArrowRight size={18} /></button>
          </form>
        </div>

        <div className="home-hero-mascot">
          <span className="home-hero-bubble">Cùng AI Guide,<br />khám phá Núi Bà Đen<br />thật dễ dàng!</span>
          <span className="home-mascot-row">
            <svg aria-hidden="true" className="home-curl" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" viewBox="0 0 50 60">
              <path d="M17 3C9 12 8 24 14 29c7 5 13-3 8-8s-14 0-12 10c2 10 15 17 30 16" />
              <path d="M40 47l-8-6M40 47l-9 5" />
            </svg>
            <img alt="AI Guide vẫy tay chào" className="home-mascot-girl" src="/mascot-girl.png" />
          </span>
        </div>
      </section>

      <div className="home-sheet" ref={sheetRef}>
        {planOpen ? (
          <PlanPanel onAsk={onAsk} onClose={() => setPlanOpen(false)} />
        ) : exploreZone ? (
          <ExplorePanel
            destinations={destinations}
            initialZone={exploreZone}
            key={exploreZone}
            onAskAbout={onAskAbout}
            onClose={() => setExploreZone(null)}
          />
        ) : (
        <div className="home-grid">
          <section className="home-card home-video">
            <h2><span className="home-play-icon"><Play size={12} fill="currentColor" /></span> AI Guide – Video hướng dẫn tham quan</h2>
            <div className="home-video-box">
              <video controls onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} playsInline poster={statuePhoto || heroUrl} preload="metadata" ref={videoRef} src={INTRO_VIDEO_URL} />
              {!playing && (
                <button aria-label="Phát video" className="home-play" onClick={() => videoRef.current?.play()} type="button">
                  <Play fill="currentColor" size={30} />
                </button>
              )}
              {!playing && <span className="home-video-bubble">Xin chào! Mình là AI Guide.<br />Cùng mình khám phá<br />Núi Bà Đen nhé!<Burst className="burst-bubble" /></span>}
            </div>
          </section>

          <section className="home-card home-zones">
            <h2><PinIcon /> Khám phá điểm tham quan <button className="home-link" onClick={() => openExplore('summit')} type="button">Xem tất cả <ArrowRight size={14} /></button></h2>
            <div className="home-zone-list">
              {zones.map((zone) => (
                <button className="home-zone" key={zone.key} onClick={() => openExplore(zone.zoneKey)} type="button">
                  <span className="home-zone-photo">
                    {zone.photo && <img alt="" loading="lazy" src={zone.photo} />}
                    <em>{zone.tag}</em>
                  </span>
                  <span className="home-zone-name"><b>{zone.place}</b><ArrowRight size={16} /></span>
                </button>
              ))}
            </div>
          </section>

          <HomeChat
            Avatar={() => <img alt="AI Guide" src="/ai-avatar.png" />}
            incoming={heroQuestion}
            onOpenFull={onOpenChat}
          />

          <section className="home-card home-map">
            <h2><PinIcon /> Mình đang ở đâu nhỉ? <a className="home-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Núi Bà Đen, Tây Ninh')}`} rel="noreferrer" target="_blank">Xem trên Google Maps <ArrowRight size={14} /></a></h2>
            <a
              className="home-map-box"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Núi Bà Đen, Tây Ninh')}`}
              rel="noreferrer"
              target="_blank"
              aria-label="Mở bản đồ Núi Bà Đen trên Google Maps"
            >
              <img alt="Ảnh vệ tinh khu Tượng Phật Bà Tây Bổ Đà Sơn" className="home-map-frame" loading="lazy" src="/map-statue.jpg" />
              <span className="home-map-pin"><PinIcon size={34} /></span>
              <span className="home-map-label">
                {statuePhoto && <img alt="" src={statuePhoto} />}
                <b>Tượng Phật Bà<br />Tây Bổ Đà Sơn</b>
              </span>
            </a>
          </section>

          <section className="home-banner">
            <h2>Trải nghiệm trọn vẹn <span>cùng Núi Bà Đen</span><Burst className="burst-banner" /></h2>
            <button className="home-cta" onClick={openPlan} type="button">Lên kế hoạch ngay <ArrowRight size={16} /></button>
          </section>
        </div>
        )}
      </div>
    </div>
  );
}
