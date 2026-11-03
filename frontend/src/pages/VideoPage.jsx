import { useEffect, useRef, useState } from 'react';
import { SkipForward, Volume2 } from 'lucide-react';

import { assetUrl } from '../api';

const INTRO_VIDEO_URL = import.meta.env.VITE_INTRO_VIDEO_URL || 'https://res.cloudinary.com/df6nsfnjk/video/upload/q_auto/f_auto/v1780989537/intro_nui_ba_den_xzcgcs.mp4';

export default function VideoPage({ destination, onNext }) {
  const posterUrl = assetUrl(destination?.image_url);
  const [needsSoundTap, setNeedsSoundTap] = useState(false);
  const videoRef = useRef(null);

  async function playWithSound() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    video.volume = 1;

    try {
      await video.play();
      setNeedsSoundTap(false);
    } catch {
      // Autoplay with sound is blocked until the visitor taps the page.
      video.muted = true;
      try {
        await video.play();
      } catch {}
      setNeedsSoundTap(true);
    }
  }

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    playWithSound();
  }, [destination?.id]);

  return (
    <div className="phone">
      <div className="page video-page">
        <div className="topbar">
          <div>
            <h2>Khám phá nhanh Núi Bà Đen</h2>
            <p className="small-text">Video dài khoảng 1 phút. Xem xong, bạn chọn địa điểm rồi hỏi AI Guide.</p>
          </div>
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
          {needsSoundTap && (
            <button className="sound-unlock-btn" onClick={playWithSound} type="button">
              <Volume2 size={20} /> Bật tiếng
            </button>
          )}
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
