// Menu photos at the size a card shows them. Unsplash links are resized by Unsplash (w/h in the link);
// photos uploaded in the admin panel come back unchanged. (Plain text work: React Native's URL can't edit
// query strings.)
export function sized(src, w, h) {
  if (!src || !src.includes('images.unsplash.com')) return src;
  const [base, query = ''] = src.split('?');
  const params = query.split('&').filter(p => p && !/^(w|h|fit)=/.test(p));
  return `${base}?${[...params, `w=${w}`, `h=${h}`, 'fit=crop'].join('&')}`;
}
