import { useEffect, useRef } from 'react';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise = null;

function loadScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => { scriptPromise = null; s.remove(); reject(new Error('gsi load failed')); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

export default function GoogleSignInButton({ onCredential }) {
  const ref = useRef(null);
  const cb = useRef(onCredential);
  useEffect(() => { cb.current = onCredential; }, [onCredential]);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (resp) => cb.current?.(resp.credential),
        });
        window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', text: 'continue_with' });
      })
      .catch(() => { /* blocked or offline: email/password still works */ });
    return () => { cancelled = true; };
  }, []);

  if (!CLIENT_ID) return null;
  return <div ref={ref} className="min-h-[40px]" />;
}
