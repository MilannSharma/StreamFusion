// API key lives in Electron safeStorage (encrypted by the OS); falls back to localStorage in a plain browser.
const secrets = (window as any).electronAPI?.secrets;
const KEY_NAME = 'anthropic_api_key';

export const loadKey = async (): Promise<string> => {
  try { if (secrets) return (await secrets.get(KEY_NAME)) || ''; } catch (e) {}
  try { return localStorage.getItem(KEY_NAME) || ''; } catch (e) { return ''; }
};
export const saveKey = async (v: string) => {
  try { if (secrets) await secrets.set(KEY_NAME, v); else localStorage.setItem(KEY_NAME, v); } catch (e) { try { localStorage.setItem(KEY_NAME, v); } catch (e2) {} }
  window.dispatchEvent(new Event('sf-key-changed'));
};
// Chat panels call this to send the user to Settings (e.g. when no API key is set).
export type SettingsSection = 'mirror' | 'emulator' | 'web' | 'ai' | 'appearance';
export const openSettings = (section: SettingsSection = 'ai') =>
  window.dispatchEvent(new CustomEvent('sf-open-settings', { detail: section }));
