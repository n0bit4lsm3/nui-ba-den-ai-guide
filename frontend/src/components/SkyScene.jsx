// Animated backdrop behind every page: sun, layered hills with the lone cone of
// Núi Bà Đen wearing its cloud "hat", a cable car climbing to the summit, birds
// and a few falling leaves. Pure SVG + CSS, no images, stays behind content.
export default function SkyScene() {
  return (
    <div className="sky-scene" aria-hidden="true">
      <div className="sky-sun" />

      <svg className="sky-birds" viewBox="0 0 120 40" fill="none" stroke="#5a7366" strokeLinecap="round" strokeWidth="2">
        <path d="M4 20c4-6 8-6 12 0M16 20c4-6 8-6 12 0" />
        <path d="M44 10c3-5 6-5 9 0M53 10c3-5 6-5 9 0" />
        <path d="M80 26c3-5 6-5 9 0M89 26c3-5 6-5 9 0" />
      </svg>

      <svg className="sky-hills" viewBox="0 0 1440 360" preserveAspectRatio="none">
        <path className="hill hill-back" d="M0 230 C120 200 200 160 330 180 S520 140 640 200 S820 120 960 160 S1180 230 1300 190 S1400 170 1440 180 L1440 360 L0 360Z" />
        <path className="hill hill-cone" d="M560 300 L700 120 Q720 95 740 120 L880 300Z" />
        <path className="hill hill-mid" d="M0 280 C160 250 260 230 400 260 S640 240 760 275 S980 230 1120 265 S1320 250 1440 270 L1440 360 L0 360Z" />
        <path className="hill hill-front" d="M0 330 C180 300 300 310 460 325 S760 300 900 322 S1200 300 1440 320 L1440 360 L0 360Z" />
        <g className="cloud-hat">
          <ellipse cx="722" cy="128" rx="54" ry="14" />
          <ellipse cx="700" cy="122" rx="26" ry="12" />
          <ellipse cx="744" cy="120" rx="30" ry="13" />
        </g>
        <line className="cable-line" x1="470" y1="296" x2="716" y2="128" />
        <g className="cable-car">
          <line x1="0" y1="0" x2="0" y2="10" />
          <rect x="-9" y="10" width="18" height="14" rx="4" />
          <rect x="-6" y="13" width="12" height="6" rx="2" fill="#dff1fb" />
        </g>
      </svg>

      <div className="sky-leaves">
        <span /><span /><span /><span /><span />
      </div>
    </div>
  );
}
