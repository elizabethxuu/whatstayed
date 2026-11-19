'use client';

import { useEffect } from 'react';

const KEY = 'whatstayed:appearance';

/** Light, dark, or following the device. Kept in this browser so it applies before the first paint. */
export function applyAppearance(v: 'system' | 'light' | 'dark') {
  const html = document.documentElement;
  if (v === 'system') delete html.dataset.theme;
  else html.dataset.theme = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* storage unavailable */
  }
  const dark = v === 'dark' || (v === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1b1c1a' : '#fefefc');
}

/** Runs before React, from the root layout: no flash of the wrong appearance. */
export const appearanceScript = `try{var v=localStorage.getItem('${KEY}');if(v==='light'||v==='dark')document.documentElement.dataset.theme=v;}catch(e){}`;

/** The account's saved choice wins over this browser's, once the profile is loaded. */
export default function Appearance({ value }: { value?: 'system' | 'light' | 'dark' }) {
  useEffect(() => {
    if (value) applyAppearance(value);
  }, [value]);
  return null;
}
