import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Domains the dev/preview server may be reached on (besides localhost)
const allowedHosts = ['bitevo.in', 'www.bitevo.in'];

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
    plugins: [react()],
    server: { port: 2002, strictPort: true, proxy, allowedHosts },
    preview: { port: 2002, strictPort: true, proxy, allowedHosts },
  };
});
