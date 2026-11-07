import { useEffect, useRef } from 'react';
import { ArrowRight, Lock, PhoneCall } from 'lucide-react';

import { assetUrl } from '../api';
import { BrandMark } from '../components/Brand';

const INTRO_VIDEO_URL = import.meta.env.VITE_INTRO_VIDEO_URL || 'https://res.cloudinary.com/df6nsfnjk/video/upload/q_auto/f_auto/v1780989537/intro_nui_ba_den_xzcgcs.mp4';

export default function VideoPage({ destination, onNext, onWatched, watched }) {
  const posterUrl = assetUrl(destination?.image_url);
  const videoRef = useRef(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    const video = videoRef.current;
    if (!video) return undefined;

    // Browsers only allow sound after the visitor has touched the page. Try
    // with sound first; if blocked, start muted and unmute on the first touch
    // anywhere, so no separate "bật tiếng" button is needed.
    const events = ['pointerdown', 'touchstart', 'keydown'];
    const unmute = () => {
      video.muted = false;
      video.volume = 1;
      video.play().catch(() => {});
      events.forEach((name) => document.removeEventListener(name, unmute, true));
    };

    video.muted = false;
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(() => {});
      events.forEach((name) => document.addEventListener(name, unmute, true));
    });

    return () => events.forEach((name) => document.removeEventListener(name, unmute, true));
  }, [destination?.id]);

  return (
    <div className="vid2" style={{ '--hero-img': 'url(/hero-vista.jpg)' }}>
      <nav className="cb2-nav" aria-label="Điều hướng chính">
        <BrandMark />
        <button className="home-support cb2-support" onClick={() => window.dispatchEvent(new Event('nbd:support'))} type="button">
          <PhoneCall size={16} /> Hỗ trợ
        </button>
      </nav>

      <main className="vid2-main">
        <header className="vid2-head">
          <span className="home-script">Chào mừng đến</span>
          <h1>Khám phá nhanh Núi Bà Đen</h1>
        </header>

        <div className="vid2-frame">
          <video
            ref={videoRef}
            autoPlay
            controls
            playsInline
            poster={posterUrl || undefined}
            preload="auto"
            src={INTRO_VIDEO_URL}
            onEnded={onWatched}
            onError={onWatched}
          />
        </div>

        <div className="vid2-foot">
          <button className={watched ? 'vid2-cta is-ready' : 'vid2-cta'} disabled={!watched} onClick={onNext} type="button">
            {watched ? <>Bắt đầu khám phá <ArrowRight size={18} /></> : <><Lock size={16} /> Xem hết video để tiếp tục</>}
          </button>
        </div>
      </main>
    </div>
  );
}
