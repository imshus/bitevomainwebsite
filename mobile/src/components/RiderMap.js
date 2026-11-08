// The order's live trip on a map, as on the website (frontend/src/components/RiderMap.jsx): the rider (the rider
// app's blue, with a bike and a cone pointing the way they're heading), the rider app's kitchen and home pins,
// the road route to the kitchen or the door, and a chip with the time of the ride the rider is on now.
// The map is Leaflet + OpenStreetMap tiles in a web view (no Google key). The road route and the times come from
// the order screen (useLiveTrip in lib/eta.js; a dashed straight line without a route); this file tells the
// page in the web view where everything is.
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import Svg, { Circle, Path } from 'react-native-svg';
import { SITE_URL } from '../config';
import { C } from '../theme';

// The web view's address, so OpenStreetMap's tile servers see where their tiles are shown (as for the website).
const BASE_URL = `${SITE_URL.replace(/\/$/, '')}/`;

/**
 * rider       { lat, lng, heading } the rider's live position
 * home        { lat, lng } the delivery address, or null when it has no location
 * kitchen     { lat, lng } the kitchen, or null when its position isn't set
 * leg         'to_kitchen' (before pickup: the route and chip are to the kitchen) or 'to_customer'
 * route       the road route to where the rider is heading (useLiveTrip), or null
 * eta         the arrival time (useLiveTrip): its `leg` is the ride the rider is on now, for the chip
 * distanceKm  the straight distance from the API to where the rider is heading, for the chip without a time
 */
export default function RiderMap({ rider, home, kitchen, leg = 'to_customer', route, eta, distanceKm }) {
  const toKitchen = leg === 'to_kitchen';
  const target = toKitchen ? kitchen : home; // where the rider is heading now
  const web = useRef(null);
  const ready = useRef(false);
  const [failed, setFailed] = useState(false);

  // Everything the map draws, sent to the page whenever it changes (and once the page is ready).
  const scene = JSON.stringify({
    rider: { lat: rider.lat, lng: rider.lng, heading: rider.heading ?? null },
    kitchen: kitchen ? { lat: kitchen.lat, lng: kitchen.lng } : null,
    home,
    leg,
    target: target ? { lat: target.lat, lng: target.lng } : null,
    line: route?.line?.length > 1 ? route.line : null,
  });
  const send = () => { if (ready.current) web.current?.injectJavaScript(`window.bitevo && window.bitevo.update(${scene});true;`); };
  useEffect(send, [scene]);

  const onMessage = e => {
    const m = e.nativeEvent.data;
    if (m === 'ready') { ready.current = true; send(); }
    if (m === 'failed') setFailed(true);
  };
  // Links in the map (the OpenStreetMap credit) open in the browser, not in the map's box.
  const onLink = req => {
    if (/^https?:/.test(req.url) && !req.url.startsWith(BASE_URL)) { Linking.openURL(req.url).catch(() => {}); return false; }
    return true;
  };
  const recenter = () => web.current?.injectJavaScript('window.bitevo && window.bitevo.frame();true;');

  // The chip, as delivery apps show it: the rider's ride now (to the kitchen, then to the door), the time big,
  // what it's to and how far small. It's an estimate, so it says "about". (The card above the map gives the
  // arrival time at the door, cooking time included.)
  const where = toKitchen ? 'to the kitchen' : 'to your door';
  const chip = toKitchen && distanceKm != null && distanceKm < 0.1 ? { big: 'At the kitchen' }
    : !toKitchen && distanceKm != null && distanceKm < 0.2 ? { big: 'Almost there' }
    : eta ? { big: `~${eta.leg.minutes} min`, small: `${where} · ${eta.leg.km} km` }
    : distanceKm != null ? { big: `${distanceKm} km`, small: where }
    : { big: toKitchen ? 'Going to the kitchen' : 'On the way' };

  const gmaps = `https://www.google.com/maps/search/?api=1&query=${rider.lat},${rider.lng}`;
  return (
    <View style={st.wrap}>
      <View style={st.frame}>
        {failed ? (
          <View style={st.failed}><Text style={st.failedText}>The map couldn’t load. Check your internet connection.</Text></View>
        ) : (
          <WebView
            ref={web}
            source={{ html: PAGE, baseUrl: BASE_URL }}
            originWhitelist={['*']}
            onMessage={onMessage}
            onShouldStartLoadWithRequest={onLink}
            setSupportMultipleWindows={false}
            onError={() => setFailed(true)}
            scrollEnabled={false}
            overScrollMode="never"
            bounces={false}
            style={st.web}
            accessibilityLabel={toKitchen ? 'Map with your delivery partner on the way to the kitchen' : 'Map with your delivery partner on the way to you'}
          />
        )}
        <View style={st.eta} pointerEvents="none" accessibilityLiveRegion="polite">
          <Text style={st.etaBig}>{chip.big}</Text>
          {chip.small ? <Text style={st.etaSmall} numberOfLines={1}>{chip.small}</Text> : null}
        </View>
        {!failed && (
          <Pressable style={st.recenter} onPress={recenter} accessibilityRole="button" accessibilityLabel="Show the rider and your address" hitSlop={6}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={2} strokeLinecap="round">
              <Circle cx="12" cy="12" r="3.5" /><Path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><Circle cx="12" cy="12" r="7.5" />
            </Svg>
          </Pressable>
        )}
      </View>
      <Pressable onPress={() => Linking.openURL(gmaps).catch(() => {})} accessibilityRole="link" hitSlop={8}>
        <Text style={st.open}>Open in Google Maps</Text>
      </Pressable>
    </View>
  );
}

// The page in the web view: the website's map (pins and rider dot from frontend/src/order.css), driven by
// window.bitevo.update(scene) from the app. It says 'ready' once it can take a scene, 'failed' if Leaflet
// couldn't be fetched.
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<style>
html,body,#map{margin:0;padding:0;height:100%;background:#EEF0F1;font-family:sans-serif}
.tiles{filter:saturate(.45) contrast(.96) brightness(1.04)}
.leaflet-control-attribution{font-size:10px;background:rgba(255,255,255,.8)!important}
.map-icon{background:none;border:0}
.pin{width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);margin:1px 0 0 0;display:grid;place-items:center;border:3px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.3);box-sizing:border-box}
.pin span{transform:rotate(45deg);display:grid;place-items:center}
.pin--kitchen{background:${C.ink}}
.pin--drop{background:${C.red}}
.rider-dot{position:relative;width:56px;height:56px}
.rider-dot__bike{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;box-sizing:border-box;display:grid;place-items:center;background:#1A73E8;border:3px solid #fff;box-shadow:0 0 0 0 rgba(26,115,232,.45),0 2px 8px rgba(0,0,0,.3);animation:pulse 2s infinite}
.rider-dot__cone{position:absolute;inset:0;display:none;transform:rotate(var(--heading,0deg));background:conic-gradient(from -28deg at 50% 50%,rgba(26,115,232,.38) 0 56deg,transparent 56deg);border-radius:50%;-webkit-mask:radial-gradient(circle,#000 0 70%,transparent 71%);mask:radial-gradient(circle,#000 0 70%,transparent 71%)}
.rider-dot.has-heading .rider-dot__cone{display:block}
@keyframes pulse{70%{box-shadow:0 0 0 14px rgba(26,115,232,0),0 2px 8px rgba(0,0,0,.3)}100%{box-shadow:0 0 0 0 rgba(26,115,232,0),0 2px 8px rgba(0,0,0,.3)}}
@media (prefers-reduced-motion:reduce){.rider-dot__bike{animation:none}}
</style></head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
(function () {
  function say(m) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(m); }
  if (!window.L) { say('failed'); return; }
  var STORE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16l-1.5-5h-13z"/><path d="M5 9v11h14V9"/><path d="M9 20v-5h6v5"/></svg>';
  var HOME = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></svg>';
  var BIKE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>';
  function pin(kind, svg) { return L.divIcon({ className: 'map-icon', html: '<div class="pin pin--' + kind + '"><span>' + svg + '</span></div>', iconSize: [36, 44], iconAnchor: [18, 42] }); }
  var riderIcon = L.divIcon({ className: 'map-icon', html: '<div class="rider-dot"><div class="rider-dot__cone"></div><div class="rider-dot__bike">' + BIKE + '</div></div>', iconSize: [56, 56], iconAnchor: [28, 28] });
  function ll(p) { return [p.lat, p.lng]; }
  var map = null, layers = {}, s = null, framed = false, leg = null;

  // The rider and where they're heading, with room at the top for the arrival chip.
  function frame() {
    if (!map || !s) return;
    var pts = [s.rider, s.target || s.home].filter(Boolean).map(ll);
    if (pts.length > 1) map.fitBounds(pts, { paddingTopLeft: [44, 84], paddingBottomRight: [56, 44], maxZoom: 17 });
    else map.setView(pts[0], 16);
  }
  // Adds, moves or removes one layer.
  function place(key, wanted, create, update) {
    if (!wanted) { if (layers[key]) { layers[key].remove(); delete layers[key]; } }
    else if (!layers[key]) layers[key] = create().addTo(map);
    else update(layers[key]);
  }

  function update(next) {
    s = next;
    if (!map) {
      // Start at the rider, so markers are drawn straight away (Leaflet waits for a first view to draw them).
      map = L.map('map', { center: ll(s.rider), zoom: 15, zoomControl: false, dragging: false, tap: false });
      map.attributionControl.setPrefix(false);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, className: 'tiles',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
    }
    place('kitchen', s.kitchen, function () { return L.marker(ll(s.kitchen), { icon: pin('kitchen', STORE), keyboard: false, interactive: false, zIndexOffset: 200 }); },
      function (m) { m.setLatLng(ll(s.kitchen)); });
    place('home', s.home, function () { return L.marker(ll(s.home), { icon: pin('drop', HOME), keyboard: false, interactive: false, zIndexOffset: 300 }); },
      function (m) { m.setLatLng(ll(s.home)); });
    // The road route runs between the nearest roads; join it to the rider's exact spot and the pin itself.
    var line = s.target ? (s.line ? [ll(s.rider)].concat(s.line, [ll(s.target)]) : [ll(s.rider), ll(s.target)]) : null;
    var style = { color: '${C.red}', weight: 5, opacity: 0.85, lineCap: 'round', dashArray: s.line ? null : '2 10', interactive: false };
    place('route', line, function () { return L.polyline(line, style); }, function (p) { p.setLatLngs(line); p.setStyle(style); });
    place('rider', true, function () { return L.marker(ll(s.rider), { icon: riderIcon, keyboard: false, interactive: false, zIndexOffset: 1000 }); },
      function (m) { m.setLatLng(ll(s.rider)); });
    var dot = layers.rider.getElement() && layers.rider.getElement().querySelector('.rider-dot');
    if (dot) {
      dot.classList.toggle('has-heading', s.rider.heading != null);
      dot.style.setProperty('--heading', (s.rider.heading || 0) + 'deg');
    }
    // The first time (and once picked up, when the trip now ends at the door), frame the trip; after that only
    // follow the rider at the edge, so the customer's own zoom isn't undone every few seconds.
    if (!framed || leg !== s.leg) { framed = true; leg = s.leg; frame(); }
    else if (!map.getBounds().pad(-0.15).contains(ll(s.rider))) map.panTo(ll(s.rider));
  }

  window.bitevo = { update: update, frame: frame };
  say('ready');
})();
</script></body></html>`;

const st = StyleSheet.create({
  wrap: { marginTop: 14 },
  frame: { height: 260, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.line, backgroundColor: '#EEF0F1' },
  web: { flex: 1, backgroundColor: '#EEF0F1' },
  failed: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  failedText: { color: C.muted, fontSize: 13.5, textAlign: 'center' },
  eta: {
    position: 'absolute', left: 12, top: 12, maxWidth: '88%', flexDirection: 'row', alignItems: 'baseline', gap: 7,
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.white,
    shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  etaBig: { fontSize: 16, fontWeight: '800', color: C.ink },
  etaSmall: { fontSize: 12.5, color: C.muted, flexShrink: 1 },
  recenter: {
    position: 'absolute', right: 12, bottom: 26, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.white, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  open: { marginTop: 8, fontSize: 13.5, fontWeight: '700', color: C.red },
});
