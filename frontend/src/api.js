// Empty means same origin: Vercel serves /api next to the page, and the Vite dev
// server proxies /api to `npm run dev:api` (or the Python backend) on port 8003.
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const PUBLIC_APP_URL = (
  import.meta.env.VITE_PUBLIC_APP_URL || 'https://ai-ecotourism-assistant.vercel.app'
).replace(/\/$/, '');

export function assetUrl(url) {
  if (!url || typeof url !== 'string') return '';
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (url.startsWith('/') && API_URL) return `${API_URL}${url}`;
  return url;
}
