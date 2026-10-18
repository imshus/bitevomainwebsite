// Google's own "Continue with Google" button (Google Identity Services). It hands back an ID token,
// which the API checks. Shown only when the API has a Google Client ID set (GOOGLE_CLIENT_ID).
import { useEffect, useRef, useState } from 'react';

let loading = null;
function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = resolve;
      s.onerror = () => { loading = null; s.remove(); reject(new Error('Google sign-in couldn’t load.')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export default function GoogleButton({ clientId, onCredential, onError }) {
  const box = useRef(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadGis().then(() => {
      if (!live || !box.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: r => cb.current(r.credential),
        ux_mode: 'popup',
        context: 'signin',
      });
      window.google.accounts.id.renderButton(box.current, {
        type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', logo_alignment: 'center',
        width: Math.min(box.current.offsetWidth || 360, 400),
      });
    }, err => { if (live) { setFailed(true); onError?.(err.message); } });
    return () => { live = false; };
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return null;
  return <div ref={box} className="google-btn" />;
}
