'use client';

import { useEffect } from 'react';

const KEY = 'whatstayed:appearance';
export type Look = 'system' | 'light' | 'dark';

/**
 * Midnight (the garden at night, the default), Daylight, or matching the device.
 * The page always carries data-theme="dark" or "light", so styles never depend on guessing.
 * Kept in this browser too, so it applies before the first paint.
 */
export function applyAppearance(v: Look) {
  const dark = v === 'dark' || (v === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* storage unavailable */
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1430' : '#fafbfd');
}

/** Runs before React, from the root layout: midnight unless this browser chose otherwise. */
export const appearanceScript = `try{var v=localStorage.getItem('${KEY}');var d=v==='light'?false:v==='system'?matchMedia('(prefers-color-scheme: dark)').matches:true;document.documentElement.dataset.theme=d?'dark':'light';}catch(e){document.documentElement.dataset.theme='dark';}`;

/** The account's saved choice wins over this browser's, once the profile is loaded. */
export default function Appearance({ value }: { value?: Look }) {
  useEffect(() => {
    if (value) applyAppearance(value);
  }, [value]);
  return null;
}
