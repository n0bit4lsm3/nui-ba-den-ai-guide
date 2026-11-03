import { useEffect, useRef } from 'react';
import { SkipForward } from 'lucide-react';

import { assetUrl } from '../api';
import MascotHello from '../components/MascotHello';

const INTRO_VIDEO_URL = import.meta.env.VITE_INTRO_VIDEO_URL || 'https://res.cloudinary.com/df6nsfnjk/video/upload/q_auto/f_auto/v1780989537/intro_nui_ba_den_xzcgcs.mp4';

export default function VideoPage({ destination, onNext }) {
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
    <div className="phone">
      <div className="page video-page">
        <div className="topbar">
          <div>
            <div className="badge">AI Guide Núi Bà Đen</div>
            <h2>Khám phá nhanh Núi Bà Đen</h2>
            <p className="small-text">Video dài khoảng 1 phút. Xem xong, bạn chọn địa điểm rồi hỏi AI Guide.</p>
          </div>
          <MascotHello size={88} />
        </div>

        <div className="video-box">
          <video
            ref={videoRef}
            className="intro-video"
            autoPlay
            controls
            playsInline
            poster={posterUrl || undefined}
            preload="auto"
            src={INTRO_VIDEO_URL}
          />
        </div>

        <button className="primary-btn" onClick={onNext}>
          Chọn địa điểm
        </button>

        <button className="secondary-btn" onClick={onNext}>
          <SkipForward size={18} /> Bỏ qua video
        </button>
      </div>
    </div>
  );
}
