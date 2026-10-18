// Food photos are served from Unsplash (free Unsplash License). Swap the ids for your own photos later.
export const photo = (id, w, h, q = 75) =>
  `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&q=${q}&auto=format`;

// Menu photos at a given size. Unsplash links are resized by Unsplash; other photos (e.g. uploaded in
// the admin panel) come back unchanged.
export function sized(src, w, h) {
  try {
    const url = new URL(src, window.location.origin);
    if (url.hostname !== 'images.unsplash.com') return src;
    url.searchParams.set('w', String(w));
    url.searchParams.set('h', String(h));
    url.searchParams.set('fit', 'crop');
    return url.toString();
  } catch {
    return src;
  }
}

// srcset for a 4:3 menu photo, so phones download a smaller file than desktops.
export function srcSet(src) {
  if (!src?.includes('images.unsplash.com')) return undefined;
  return `${sized(src, 320, 240)} 320w, ${sized(src, 600, 450)} 600w, ${sized(src, 800, 600)} 800w`;
}
