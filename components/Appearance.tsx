'use client';

import { useEffect } from 'react';

const KEY = 'whatstayed:appearance';
export type Look = 'system' | 'light' | 'dark';

/**
 * Sky (light blue and white, the default), Midnight, or matching the device.
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
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1430' : '#e3eefe');
}

/** Runs before React, from the root layout: sky unless this browser chose otherwise. */
export const appearanceScript = `try{var v=localStorage.getItem('${KEY}');var d=v==='dark'?true:v==='system'?matchMedia('(prefers-color-scheme: dark)').matches:false;document.documentElement.dataset.theme=d?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}`;

/** The account's saved choice wins over this browser's, once the profile is loaded. */
export default function Appearance({ value }: { value?: Look }) {
  useEffect(() => {
    if (value) applyAppearance(value);
  }, [value]);
  return null;
}
