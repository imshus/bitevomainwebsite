import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Domains the dev/preview server may be reached on (besides localhost)
const allowedHosts = ['bitevo.in', 'www.bitevo.in'];

// The first offer banner is the biggest thing on the menu's first screen (see BannerSlider.jsx).
const FIRST_BANNER = {
  href: '/assets/banners/offer-first-order-800.webp',
  srcset: '/assets/banners/offer-first-order-800.webp 800w, /assets/banners/offer-first-order-1200.webp 1200w, /assets/banners/offer-first-order-1600.webp 1600w',
  sizes: '(max-width: 1172px) calc(100vw - 32px), 1140px',
};

// Font files the menu's first screen draws with: fetched alongside the app's code instead of after it.
const FIRST_FONTS = ['poppins-latin-400-normal', 'poppins-latin-600-normal', 'poppins-latin-700-normal', 'poppins-latin-ext-700-normal'];

// A small script near the top of the page (where index.html says <!-- early-start -->) that starts the menu
// and site settings downloading (and, on the menu, the first banner) while the app's code is still on its
// way. src/api.js picks the answers up. It sits above the stylesheets so it doesn't wait for them.
const EARLY_START_MARK = '<!-- early-start -->';
function earlyStart(apiBase) {
  const api = JSON.stringify(`${apiBase.replace(/\/$/, '')}/api`);
  const script = `(function () {
  var get = function (path) {
    return fetch(${api} + path, { credentials: 'include' }).then(function (r) { if (!r.ok) throw r; return r.json(); });
  };
  try {
    var early = window.__bitevoEarly = { '/config': get('/config'), '/menu': get('/menu') };
    for (var k in early) early[k].catch(function () {}); // the app asks again if these fail
  } catch (e) {}
  if (location.pathname === '/' || location.pathname === '/menu') {
    var l = document.createElement('link');
    l.rel = 'preload'; l.as = 'image'; l.href = ${JSON.stringify(FIRST_BANNER.href)};
    l.setAttribute('imagesrcset', ${JSON.stringify(FIRST_BANNER.srcset)});
    l.setAttribute('imagesizes', ${JSON.stringify(FIRST_BANNER.sizes)});
    l.setAttribute('fetchpriority', 'high');
    document.head.appendChild(l);
  }
})();`;
  return {
    name: 'bitevo-early-start',
    transformIndexHtml(html) {
      if (!html.includes(EARLY_START_MARK)) throw new Error(`index.html needs ${EARLY_START_MARK} in its <head>`);
      return html.replace(EARLY_START_MARK, `<script>${script}</script>`);
    },
  };
}

// Adds <link rel="preload"> tags for FIRST_FONTS to the built page (their file names carry a content hash).
function preloadFonts(names) {
  return {
    name: 'bitevo-preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html, { bundle }) => Object.keys(bundle || {})
        .filter(file => file.endsWith('.woff2') && names.some(name => file.includes(`/${name}-`)))
        .map(file => ({ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${file}`, crossorigin: '' }, injectTo: 'head' })),
    },
  };
}

export default defineConfig(({ mode }) => {
  // Settings from frontend/.env (see .env.example); variables set in the shell win.
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '');

  // The marketing site runs on 2000 and the admin panel on 2001; this ordering website sits on 2002.
  // In development, API calls go to the website API on 4001, and menu photos the admin panel uploaded
  // (/uploads/...) come from the admin API on 4000.
  const API = env.API_PROXY_TARGET || 'http://localhost:4001';
  const ADMIN_API = env.ADMIN_API_PROXY_TARGET || 'http://localhost:4000';
  const proxy = { '/api': API, '/uploads': ADMIN_API };

  return {
    plugins: [react(), earlyStart(env.VITE_API_URL || ''), preloadFonts(FIRST_FONTS)],
    server: { port: 2002, strictPort: true, proxy, allowedHosts },
    preview: { port: 2002, strictPort: true, proxy, allowedHosts },
    build: {
      rollupOptions: {
        output: {
          // React and the router change rarely. In a file of their own, they stay cached in visitors'
          // browsers when a site update only changes BiteVo's own code.
          manualChunks: id => (id.includes('node_modules') && !id.endsWith('.css') ? 'vendor' : undefined),
        },
      },
    },
  };
});
