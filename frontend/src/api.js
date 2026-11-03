// Empty means same origin: Vercel serves /api next to the page, and the Vite dev
// server proxies /api to `npm run dev:api` (or the Python backend) on port 8003.
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
// Where the sample QR code points. Defaults to wherever the app is being
// served from, so a new deployment's QR opens that same deployment.
export const PUBLIC_APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '');

export function assetUrl(url) {
  if (!url || typeof url !== 'string') return '';
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (url.startsWith('/') && API_URL) return `${API_URL}${url}`;
  return url;
}
