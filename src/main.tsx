import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './theme-dark.css';
import '@bible-strong/avatar-react/styles.css';
import { applyTheme } from './components/Settings/theme';

applyTheme();
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// No pinch / Ctrl+wheel zoom: the layout is designed for 100%
window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

// Background pollers (device list, status checks) answer from their last result while the window is hidden or minimised:
// no adb calls and no CPU for a page nobody is looking at. Visible again = live data immediately.
(() => {
  const POLLED = /^\/api\/(devices$|web\/status|mcp\/live\/status|emulator\/(status|logs)|mirror\/status|agent\/claude\/status)/;
  const cache = new Map<string, { body: string; type: string }>();
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname + input.search : (input as Request).url;
    const method = (init?.method || (typeof input !== 'string' && !(input instanceof URL) ? (input as Request).method : 'GET')).toUpperCase();
    let path = ''; try { path = new URL(url, location.href).pathname + new URL(url, location.href).search; } catch (e) {}
    const poll = method === 'GET' && POLLED.test(path);
    if (poll && document.hidden && cache.has(path)) { const c = cache.get(path)!; return new Response(c.body, { status: 200, headers: { 'Content-Type': c.type } }); }
    const res = await orig(input as any, init);
    if (poll && res.ok) { try { cache.set(path, { body: await res.clone().text(), type: res.headers.get('Content-Type') || 'application/json' }); } catch (e) {} }
    return res;
  };
})();
