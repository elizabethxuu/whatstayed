'use client';

import { useEffect } from 'react';

const KEY = 'whatstayed:appearance';
/** stored values (kept for saved profiles): 'light' = Dawn, 'system' = Follow the day, 'dark' = Night */
export type Look = 'system' | 'light' | 'dark';
type Scene = 'light' | 'midday' | 'dusk' | 'dark';

/** the garden's light for a local hour: dawn in the morning, bright at midday, gold at dusk, night after dark */
export function sceneFor(hour: number): Scene {
  if (hour >= 5 && hour < 11) return 'light';
  if (hour >= 11 && hour < 16) return 'midday';
  if (hour >= 16 && hour < 20) return 'dusk';
  return 'dark';
}

const SKY: Record<Scene, string> = { light: '#F7F4EF', midday: '#F8F7F3', dusk: '#F6EBDD', dark: '#1B2033' };

function sceneOf(v: Look | null): Scene {
  if (v === 'dark') return 'dark';
  if (v === 'system') return sceneFor(new Date().getHours());
  return 'light';
}

let timer: ReturnType<typeof setInterval> | undefined;

/**
 * Dawn is the default and stays put. "Follow the day" lets the garden's light change with the clock;
 * "Night" keeps the evening scene. The page always carries one data-theme value, so CSS never guesses.
 */
export function applyAppearance(v: Look) {
  const set = () => {
    const s = sceneOf(v);
    document.documentElement.dataset.theme = s;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', SKY[s]);
  };
  set();
  clearInterval(timer);
  if (v === 'system') timer = setInterval(set, 5 * 60 * 1000);
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* storage unavailable */
  }
}

/** Runs before React, from the root layout, so the first paint already has the right light. */
export const appearanceScript = `try{var v=localStorage.getItem('${KEY}');var h=new Date().getHours();var s=v==='dark'?'dark':v==='system'?(h>=5&&h<11?'light':h>=11&&h<16?'midday':h>=16&&h<20?'dusk':'dark'):'light';document.documentElement.dataset.theme=s;}catch(e){document.documentElement.dataset.theme='light';}`;

/** The account's saved choice wins over this browser's, once the profile is loaded. */
export default function Appearance({ value }: { value?: Look }) {
  useEffect(() => {
    if (value) applyAppearance(value);
  }, [value]);
  return null;
}
