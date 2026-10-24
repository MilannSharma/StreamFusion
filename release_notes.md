# 🚀 StreamFusion v3.0.0 — Official Major Release

## 🌟 Highlights & Major Changes

### 🖤 Cinematic Pitch-Black Welcome Experience
* **Pure Black (#000000) Splash**: Launches into a sleek, cinema-grade pitch black canvas.
* **Glowing White Vector Cursive Animation**: The word "Welcome" is drawn in glowing white vector lines for the exact duration of the animation, then smoothly dissolves into the dashboard with a hardware-accelerated cubic-bezier transition.
* **Zero Window Flash**: Window background color starts in pure black from the very first frame of OS window creation, completely eliminating white flicker.

### 🐱 In-Memory High-Performance Cat Playing Lottie Engine
* **Embedded JSON Architecture**: Cat animation is bundled directly as an in-memory JSON module — eliminating all network/XHR delays, 404s, or file path resolution issues.
* **Byte-Level Verification**: Stripped corrupted EOF control characters so Lottie parses instantly without errors.
* **Interactive Device Setup**: 0–100% progress tracking verifying Google ADB Platform-Tools, Scrcpy codecs, Wi-Fi pairing daemon, and display wake engine.

### 📶 1-Click Persistent Wi-Fi Auto-Reconnect
* **Zero-Wire Reconnect**: Pair your phone once via USB; safely disconnect the cable.
* **Persistent Storage**: Saved devices are remembered locally. Next time your phone is connected to the same Wi-Fi, it shows as **Online** with an instant **Mirror** button—no USB cable required!

### 🔋 Smart Screen Stay-Awake & Double-Click Wake
* Automatically keeps phone display active during mirroring sessions (`svc power stayon true`).
* Automatically restores normal power behavior when mirror window closes (`svc power stayon false`).
* Double-click screen wake support using direct `KEYCODE_WAKEUP` command.

### ⚡ Scrcpy v5.0.1 & Google ADB Platform-Tools v37.0.1
* Hardware-accelerated H.264/H.265 video stream with ultra-low latency (<30ms).
* Auto-minimize host window on mirror launch so mobile screen takes center stage.

### 📁 Drag & Drop File Transfer & APK Push
* Instantly push files and APKs to phone internal storage by dropping them directly onto the app window.

---

### 📦 Downloads & Executables

### 🖥️ Local File on your PC:
* **Installer**: `Z:\StreamFusion\latest app\StreamFusion-v3.0.0-Setup.exe` (~87.8 MB)
* **Unpacked App**: `Z:\StreamFusion\release\win-unpacked\StreamFusion v3.0.0.exe` (~261 MB)

### 🌐 Direct GitHub Release Download:
* [**⬇️ Download StreamFusion-v3.0.0-Setup.exe**](https://github.com/MilannSharma/StreamFusion/releases/download/v3.0.0/StreamFusion-v3.0.0-Setup.exe) (87.8 MB)
* [**🔗 View GitHub Release Page**](https://github.com/MilannSharma/StreamFusion/releases/tag/v3.0.0)

### 🛠️ Key Reliability & Architecture Fixes in v3.0.0:
* **Ultra-Compact Binary Size**: Shrunk installer down to **87.8 MB** (73% smaller than original 333 MB build!), unpacked installation down to **261 MB** (down from 1.1+ GB).
* **Zero Blank White Screen**: Relative `./assets/` resolution and resilient `waitForServer()` health check prevent load timeouts.
* **100% Custom UI Installer**: NSIS one-click execution skips legacy Windows wizards and boots straight into the interactive Setup screen.
* **LAN Security Hardened**: Express backend binds strictly to `127.0.0.1` with local-only host verification and media-path sanitization. Private device IP addresses (`saved_devices.json`) strictly gitignored.

---

**Developed with ❤️ by [Milann Sharma](https://github.com/MilannSharma)**
