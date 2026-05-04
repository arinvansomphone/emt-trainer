import { useEffect, useRef, useState } from 'react';

export function useSpeechRecognition({ onResult } = {}) {
  const Recog = typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;
  const supported = !!Recog;
  const recogRef = useRef(null);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!supported) return;
    const r = new Recog();
    r.lang = 'en-US';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const text = Array.from(e.results).map(r => r[0].transcript).join(' ').trim();
      if (text && onResult) onResult(text);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recogRef.current = r;
    return () => { try { r.abort(); } catch (_e) {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  function toggle() {
    if (!supported || !recogRef.current) return;
    if (listening) {
      recogRef.current.stop();
    } else {
      try { recogRef.current.start(); setListening(true); } catch (_e) { /* already started */ }
    }
  }

  return { supported, listening, toggle };
}
