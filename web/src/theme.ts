// Theme preference: 'auto' follows the OS, 'light'/'dark' force it.
// index.html has a tiny inline copy of applyTheme that runs BEFORE first paint
// (no flash of wrong theme) — keep the logic here in sync with it.

export type ThemePref = 'auto' | 'light' | 'dark';

const KEY = 'mynah.theme';
const META_COLOR: Record<'light' | 'dark', string> = { dark: '#0f1220', light: '#f3f4fa' };

export function getThemePref(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : 'auto';
}

function resolve(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'auto') return pref;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(pref: ThemePref): void {
  const mode = resolve(pref);
  if (mode === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[mode]);
}

export function setThemePref(pref: ThemePref): void {
  localStorage.setItem(KEY, pref);
  applyTheme(pref);
}

// In 'auto', follow live OS theme changes.
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (getThemePref() === 'auto') applyTheme('auto');
});
