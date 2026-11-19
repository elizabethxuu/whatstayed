'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Speaking instead of typing, using the browser's own speech recognition (Chrome, Edge, Safari).
 * No audio is recorded or stored by What Stayed: the browser turns speech into text, which lands in
 * the writing line for the person to read and change before sending. In Chrome and Safari the
 * browser maker's service does the transcription.
 */
type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type Ctor = new () => Rec;

const ctor = (): Ctor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access is blocked for this site. You can allow it in your browser’s settings, or type instead.',
  'service-not-allowed': 'Speech recognition isn’t allowed here. You can type instead.',
  'audio-capture': 'No microphone was found. You can type instead.',
  network: 'Speech recognition couldn’t reach its service. You can type instead.',
};

export function useDictation(onText: (text: string, final: boolean) => void, onError: (msg: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Rec | null>(null);
  const finalText = useRef('');
  const cb = useRef({ onText, onError });
  cb.current = { onText, onError };

  useEffect(() => setSupported(!!ctor()), []);
  useEffect(() => () => rec.current?.abort(), []);

  const start = useCallback((base: string) => {
    const C = ctor();
    if (!C) return;
    const r = new C();
    r.lang = navigator.language || 'en-US';
    r.continuous = true;
    r.interimResults = true;
    finalText.current = base ? base.replace(/\s*$/, ' ') : '';
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText.current += res[0].transcript.trim() + ' ';
        else interim += res[0].transcript;
      }
      cb.current.onText((finalText.current + interim).replace(/\s+/g, ' ').trim(), !interim);
    };
    r.onerror = (e) => {
      if (e.error !== 'aborted' && e.error !== 'no-speech') cb.current.onError(ERRORS[e.error] || 'Voice input stopped. You can type instead.');
    };
    r.onend = () => setListening(false);
    rec.current = r;
    try {
      r.start(); // the browser asks for the microphone here, and only here
      setListening(true);
    } catch {
      cb.current.onError('Voice input couldn’t start. You can type instead.');
    }
  }, []);

  const stop = useCallback(() => {
    rec.current?.stop();
    setListening(false);
  }, []);

  return { supported, listening, start, stop };
}
