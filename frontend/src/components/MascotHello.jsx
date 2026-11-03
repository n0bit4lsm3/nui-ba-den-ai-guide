import { useEffect, useRef } from 'react';

// Animated greeting: the guide waves hello in a short clip cut from the intro
// video. Falls back to the still avatar where motion is reduced.
export default function MascotHello({ size = 96, bubble = true, text = 'Xin chào!' }) {
  const videoRef = useRef(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    videoRef.current?.play().catch(() => {});
  }, []);

  return (
    <div className="mascot-hello" style={{ '--size': `${size}px` }}>
      {bubble && <span className="mascot-hello-bubble" aria-hidden="true">{text}</span>}
      {reduced ? (
        <img alt="AI Guide vẫy tay chào" src="/mascot-160.png" />
      ) : (
        <video
          ref={videoRef}
          aria-label="AI Guide vẫy tay chào"
          autoPlay
          loop
          muted
          playsInline
          poster="/mascot-512.png"
          preload="auto"
        >
          <source src="/mascot-hello.webm" type="video/webm" />
          <source src="/mascot-hello.mp4" type="video/mp4" />
        </video>
      )}
    </div>
  );
}
