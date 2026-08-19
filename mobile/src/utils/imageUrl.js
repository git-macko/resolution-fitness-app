// Resolution Fitness App — image URL helper
// Resolves "/uploads/xxx.jpg" relative URLs against the backend base URL so
// images served by the Go backend render on any platform/emulator.
import { BASE_URL } from '../api/config';

export function resolveImageUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  const base = BASE_URL.replace(/\/+$/, '');
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${base}${path}`;
}

export default resolveImageUrl;
