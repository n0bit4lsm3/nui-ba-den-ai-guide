// Mountain logo (artwork supplied by the team). Two cut-outs of the same
// drawing: white for photo/dark backgrounds, navy for light backgrounds.
export function Logo({ color = '#fff', height = 34 }) {
  const src = color === '#fff' ? '/logo-mountain-white.png' : '/logo-mountain-dark.png';
  return <img alt="" className="brand-logo" height={height} src={src} style={{ height, width: 'auto' }} />;
}

export function BrandMark() {
  return (
    <div className="home-brand">
      <Logo />
      <span>NÚI BÀ ĐEN<small>Tây Ninh · Việt Nam</small></span>
    </div>
  );
}
