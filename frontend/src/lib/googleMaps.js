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

// The visitor's position from the browser, as { lat, lng }, with a friendly message when it fails.
export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Your browser can’t share your location. Search for your area instead.')); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(new Error(err.code === err.PERMISSION_DENIED
        ? 'Location access is turned off. Allow it in your browser settings, or search for your area instead.'
        : 'We couldn’t find your location. Search for your area instead.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });
}

// Groups a search and the place picked from it into one Places session (cheaper on Google's bill).
export const newSession = () => (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
