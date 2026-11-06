// Loads the Google Maps JavaScript API once, only when a map is first shown.
// The key comes from /api/config (the API's GOOGLE_MAPS_BROWSER_KEY).

let loading = null;

export function loadGoogleMaps(key) {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const ready = '__bitevoMapsReady';
      window[ready] = () => { delete window[ready]; resolve(window.google.maps); };
      // Google calls this when the key is wrong or the Maps JavaScript API isn't enabled for it.
      window.gm_authFailure = () => window.dispatchEvent(new Event('bitevo:maps-auth-failed'));
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key, v: 'weekly', loading: 'async', callback: ready, region: 'IN', language: 'en' })}`;
      script.async = true;
      script.onerror = () => { loading = null; script.remove(); reject(new Error('The map couldn’t load.')); };
      document.head.appendChild(script);
    });
  }
  return loading;
}

// The visitor's position from the browser, as { lat, lng, accuracy } (accuracy in metres), with a friendly
// message when it fails. `fallback` ends that message (what to do instead); `fresh` skips a cached position.
export function currentPosition({ fallback = 'Search for your area instead.', fresh = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error(`Your browser can’t share your location. ${fallback}`)); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy || 0) || null }),
      err => reject(new Error(err.code === err.PERMISSION_DENIED
        ? `Location access is turned off. Allow it in your browser settings. ${fallback}`
        : `We couldn’t find your location. ${fallback}`)),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: fresh ? 0 : 60000 },
    );
  });
}

// Groups a search and the place picked from it into one Places session (cheaper on Google's bill).
export const newSession = () => (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
