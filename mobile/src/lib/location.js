// The phone's current location ("live address"): asks for location access once, reads the GPS position, then asks
// the API for the address there (/api/places/reverse: Google Maps, or OpenStreetMap without a Google key), with
// whether BiteVo delivers there. Used by the menu's "Delivering to" and the address form's auto-fill.
import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import { api } from '../api';

// Permissions are asked here (with a reason), not by the library.
Geolocation.setRNConfiguration({ skipPermissionRequests: true, locationProvider: 'auto' });

export class LocationError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'denied' | 'off' | 'timeout' | 'failed'
  }
}

async function allowed() {
  if (Platform.OS !== 'android') return true;
  const { ACCESS_FINE_LOCATION: FINE, ACCESS_COARSE_LOCATION: COARSE } = PermissionsAndroid.PERMISSIONS;
  if ((await PermissionsAndroid.check(FINE)) || (await PermissionsAndroid.check(COARSE))) return true;
  const result = await PermissionsAndroid.requestMultiple([FINE, COARSE]);
  return result[FINE] === PermissionsAndroid.RESULTS.GRANTED || result[COARSE] === PermissionsAndroid.RESULTS.GRANTED;
}

const read = options => new Promise((resolve, reject) => Geolocation.getCurrentPosition(p => resolve(p.coords), reject, options));

// { lat, lng, accuracy } (accuracy in metres).
export async function currentPosition() {
  if (!(await allowed())) throw new LocationError('denied', 'Location access is off for BiteVo. Allow it in your phone’s settings, or type your address.');
  let coords;
  try {
    // GPS first; if that's slow (indoors), the network's position is good enough to find the area.
    coords = await read({ enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
  } catch (first) {
    if (first?.code === 1) throw new LocationError('denied', 'Location access is off for BiteVo. Allow it in your phone’s settings, or type your address.');
    try {
      coords = await read({ enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
    } catch (err) {
      if (err?.code === 2) throw new LocationError('off', 'Turn on your phone’s location (GPS) and try again, or type your address.');
      if (err?.code === 3) throw new LocationError('timeout', 'Finding your location took too long. Try again near a window, or type your address.');
      throw new LocationError('failed', 'We couldn’t find your location. Please type your address.');
    }
  }
  return {
    lat: Math.round(coords.latitude * 1e6) / 1e6,
    lng: Math.round(coords.longitude * 1e6) / 1e6,
    accuracy: Math.round(coords.accuracy || 0),
  };
}

// The position and the address there: { lat, lng, accuracy, place } — place is null if the address lookup failed
// (the position is still good for the rider).
export async function currentPlace() {
  const here = await currentPosition();
  let place = null;
  try {
    place = await api.reverse(here.lat, here.lng);
  } catch {
    place = null;
  }
  return { ...here, place };
}

// Straight-line distance in km between two { lat, lng }.
export function distanceKm(a, b) {
  const rad = d => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
