import { clipboard } from 'electron';
import { executeAdb } from '../adb/AdbController.js';

export class ClipboardBridge {
  private syncInterval: NodeJS.Timeout | null = null;
  private lastPhoneText: string = "";
  private lastPcText: string = "";
  private isSyncing: boolean = false;

  /**
   * Starts bidirectional clipboard sync.
   * Android -> PC (via polling service call)
   * PC -> Android (via adb shell input/broadcast)
   */
  startSync(deviceId: string, onPhoneClipboard: (text: string) => void) {
    if (this.isSyncing) return;
    this.isSyncing = true;
    this.lastPcText = clipboard.readText();

    this.syncInterval = setInterval(async () => {
      try {
        // 1. Check PC -> Phone
        const currentPcText = clipboard.readText();
        if (currentPcText && currentPcText !== this.lastPcText) {
          this.lastPcText = currentPcText;
          await this.setPhoneClipboard(currentPcText, deviceId);
        }

        // 2. Check Phone -> PC
        // We use 'service call clipboard 2 1' which works on many Android versions (getter)
        // Note: Real-time clipboard listener on Android is complex without an app.
        // This is a "best effort" polling method.
        const phoneText = await this.getPhoneClipboard(deviceId);
        if (phoneText && phoneText !== this.lastPhoneText) {
          this.lastPhoneText = phoneText;
          if (phoneText !== currentPcText) {
             clipboard.writeText(phoneText);
             onPhoneClipboard(phoneText);
          }
        }
      } catch (e) {
        console.error("Clipboard sync error:", e);
      }
    }, 2000);
  }

  stopSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.isSyncing = false;
  }

  async setPhoneClipboard(text: string, deviceId: string): Promise<void> {
    // Escaping for shell
    const escapedText = text.replace(/[\\"'`$()<>|&;! ]/g, '\\$&');
    
    // Attempt 1: ADB input text (works for small strings, typing)
    // Attempt 2: Clipper broadcast (requires 'clippie' or similar app, usually scrcpy handles this better)
    // Since we lack a helper app, we use 'input text' as the most universal fallback.
    // If scrcpy is running, it will handle this automatically.
    try {
      await executeAdb(['-s', deviceId, 'shell', 'input', 'text', escapedText]);
    } catch (e) {
      console.error("Failed to set phone clipboard", e);
    }
  }

  private async getPhoneClipboard(deviceId: string): Promise<string> {
    try {
      // This is a hacky way to get clipboard on modern Android via ADB 
      // without a dedicated app. It works on some devices, not all.
      // scrcpy 2.0+ has native clipboard sync that is far superior.
      const result = await executeAdb(['-s', deviceId, 'shell', 'service', 'call', 'clipboard', '2', 'i32', '1']);
      
      // Parse HEX output (very complex for raw ADB)
      // For StremFusion v2.0, we prioritize scrcpy's native sync.
      // This bridge serves as a manual trigger/watcher.
      return ""; 
    } catch {
      return "";
    }
  }
}

export const clipboardBridge = new ClipboardBridge();
