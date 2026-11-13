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

// Generic named secrets (project logins). Same OS-encrypted store as the API key.
export const loadSecret = async (name: string): Promise<string> => {
  try { if (secrets) return (await secrets.get(name)) || ''; } catch (e) {}
  try { return localStorage.getItem('sf_secret_' + name) || ''; } catch (e) { return ''; }
};
export const saveSecret = async (name: string, v: string) => {
  try { if (secrets) await secrets.set(name, v); else if (v) localStorage.setItem('sf_secret_' + name, v); else localStorage.removeItem('sf_secret_' + name); } catch (e) { try { localStorage.setItem('sf_secret_' + name, v); } catch (e2) {} }
};
export const loginSecretName = (projectId: string) => 'project_login_' + projectId;
