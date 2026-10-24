# 🚀 StreamFusion v3.1.0 — Official Major Release

## 🌟 Highlights & Major Changes

### 🐱 Real NSIS Cat Animation Installer (Phase 0.1)
* **Real-time Extraction Visuals**: When you double-click `StreamFusion-v3.1.0-Setup.exe`, a borderless, pure white installer window immediately opens displaying the playing cat animation above an extraction progress bar.
* **Native C# Companion Engine**: Compiled using native Windows compiler `csc.exe` (`CatSetupProgress.exe`, 186 KB) with embedded animated GIF (`installer-cat.gif`, 175 KB). Zero third-party runtime dependencies required.
* **Auto-Updater Friendly**: Completely silent in background update mode (`${If} ${Silent}`), keeping differential updates seamless.

### 🖤 Cinema-Grade One-Time Welcome Experience (Phase 0.2 & 0.3)
* **Single Playback & Instant Persistence**: The cursive glowing white "Welcome" animation on pure black canvas plays once (`loop: false`).
* **Instant Settings Store**: Calls `/api/settings` immediately on animation start to record `welcomeSeen: true`, guaranteeing that mid-animation closures or restarts will never trigger duplicate splash screens.
* **Smooth 0.8s Cubic-Bezier Dissolve**: At the `complete` event (or 9.5s fallback), the canvas gracefully fades out to reveal the dashboard.
* **Replay Button**: A dedicated "Replay Welcome Screen" button in Settings lets you watch the animation on-demand anytime.

### 📁 Full-Featured Mobile File Manager (Phase 0.4)
* **Direct Fast File Push**: Direct filesystem path push via `adb push` through Electron 34 `webUtils.getPathForFile` (zero memory buffer overhead, handles 5 GB+ files easily).
* **Category Quick Chips**: Instant navigation chips for `Internal Storage`, `Downloads`, `DCIM (Camera)`, `Pictures`, `Movies`, `Music`, and `Documents`.
* **Breadcrumbs & Folder Navigation**: Clickable breadcrumb path bar with `Up` level button and full directory hierarchy.
* **Full File Operations**: Upload files/folders, Download to PC (`~/Downloads/StreamFusion`), Create New Folder, Rename, Delete, and Toggle Hidden Files (`.`).
* **Hindi & Space Handling**: Full UTF-8 support for filenames with spaces and Hindi characters (e.g. `मेरा फोटो.jpg`).

### 🔄 In-App Differential Auto-Updater (Phase 0.5)
* **Powered by `electron-updater`**: Differential `.blockmap` updates hooked directly to GitHub Releases (`MilannSharma/StreamFusion`).
* **Settings Tab UI**: "Check for Updates" button, progress bar showing real-time download percentage, and 1-click "Restart & Install" action.

### 🔋 Power Mirroring & Screen-Off Mode (Phase 1.1)
* **Turn Phone Screen Off While Mirroring**: Enables `--turn-screen-off` so the phone's physical display remains pitch black while streaming 60 FPS on your PC monitor (drastically reduces phone heat and saves battery).
* **Stay Awake & Power Off on Close**: Controls device wake state while connected and powers off display on mirror exit.

### 📋 Bi-Directional Hindi / Unicode Clipboard Sync (Phase 1.2)
* **Unicode & Hindi Text Bridge**: Send any text (Hindi: `नमस्ते भारत`, emojis, long URLs) directly to Android's clipboard via dedicated modal and ADB injection.
* **Direct Paste Trigger**: 1-click "Paste on Phone" button injects Android `KEYCODE_PASTE` into whatever app is currently open on phone.

### 🔔 System Tray & Device Connect Alerts (Phase 1.3)
* **Close to Tray**: Minimizes StreamFusion into Windows notification area when closing the window.
* **Tray Quick Menu**: Right-click to "Open StreamFusion" or "Quit".
* **Connect Alert**: Windows desktop notification toast when your phone connects via USB or Wi-Fi.

### 🛠️ 'Fix My Connection' Self-Healing Diagnostics (Phase 1.4)
* **Automated 5-Point Health Check**: Probes ADB binary, Express backend (`127.0.0.1:3001`), device status (`device`, `unauthorized`, `offline`), and wireless port 5555.
* **1-Click Self-Healing**: 1-click "Restart ADB Server" button cleans hung daemon processes instantly.
* **Brand Troubleshooting Guides**: Interactive instructions for Xiaomi, Vivo/iQOO, Samsung, and Realme.

### 📱 Multi-Device Concurrent Mirroring (Phase 2.1)
* **Concurrent Streaming**: Run 2 or more Android phones on PC simultaneously!
* **Independent Scrcpy Instances**: Dynamic ports (`--port=27183:27199`) and unique window titles (`StreamFusion - PhoneName`).
* **Per-Device Cards**: Individual "Start Mirror" and "Stop" buttons on each connected device card.

### 💬 Android Notification Mirroring (Phase 2.2)
* **Windows Desktop Alerts**: Forwards incoming phone notifications (Messages, WhatsApp, Calls) to Windows desktop notification banners with app name and message preview.
* **Privacy Controls**: Toggle notification forwarding on/off anytime in Settings.

### 📹 Smartphone HD Webcam Studio (Phase 3.1)
* **1080p 60FPS Webcam**: Stream your phone's primary back sensor or selfie camera as a high-definition webcam using `--video-source=camera`.
* **OBS Virtual Camera Integration**: Step-by-step visual guide on connecting the stream into Zoom, Google Meet, and Microsoft Teams.

### 🖥️ Virtual Android Desktop Display (Phase 3.2)
* **Secondary Desktop Mode**: Uses `--new-display=1920x1080/420` to spawn an independent Android virtual display on your PC. Use apps on PC without locking or disturbing your phone screen!

---

### 📦 Downloads & Executables (v3.1.0)

* **Installer**: `Z:\StreamFusion\latest app\StreamFusion-v3.1.0-Setup.exe` (~88.2 MB)
* **Timestamped Copy**: `Z:\StreamFusion\latest app\StreamFusion-v3.1.0-Setup_[2026-10-24_12-58].exe`
* **SHA-256**: `0667940A8FE951D0DBAA8625E4279E702B0FAAB220145948EDB146CB761B8B4F`
* **Unpacked App**: `Z:\StreamFusion\release\win-unpacked\StreamFusion v3.1.0.exe` (~261 MB)

---

**Developed with ❤️ by [Milann Sharma](https://github.com/MilannSharma)**
