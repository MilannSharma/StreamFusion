export type Theme = 'light' | 'dark' | 'system';
const KEY = 'sf_theme';
export const getTheme = (): Theme => { try { return (localStorage.getItem(KEY) as Theme) || 'light'; } catch (e) { return 'light'; } };
export function applyTheme(t: Theme = getTheme()) {
  const dark = t === 'dark' || (t === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}
export function setTheme(t: Theme) { try { localStorage.setItem(KEY, t); } catch (e) {} applyTheme(t); }
