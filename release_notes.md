# 🚀 StreamFusion v2.0.0 — Official Release

## 🌟 Highlights & Major Changes

### 🐱 Interactive White Setup & Installation Experience
* **Pure White Modern Design**: Replaced default window chrome with an ultra-clean, minimalist white setup experience.
* **Animated Cat Lottie Engine**: Embedded delightful Cat playing animation (`Cat playing animation.lottie` / `cat-animation.json`) running offline via local lottie renderer.
* **Driver Readiness & Self-Check**: 0–100% interactive progress tracking verification of ADB Platform-Tools, Scrcpy codecs, Wi-Fi pairing daemon, and display wake engine.

### 📶 1-Click Persistent Wi-Fi Auto-Reconnect
* **Zero-Wire Reconnect**: Pair your phone once via USB; safely disconnect the cable.
* **Persistent Storage**: Saved devices are remembered in `saved_devices.json`. Next time your phone is connected to the same Wi-Fi, it shows as **Online** with an instant **Mirror** button—no USB cable required!

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
* **Installer**: `Z:\StreamFusion\latest app\StreamFusion-v2.0.0-Setup.exe` (109.26 MB)
* **Unpacked App**: `Z:\StreamFusion\release\win-unpacked\StreamFusion v2.0.0.exe` (337 MB)

### 🌐 Direct GitHub Release Download:
* [**⬇️ Download StreamFusion-v2.0.0-Setup.exe**](https://github.com/MilannSharma/StreamFusion/releases/download/v2.0.0/StreamFusion-v2.0.0-Setup.exe) (109 MB)
* [**🔗 View GitHub Release Page**](https://github.com/MilannSharma/StreamFusion/releases/tag/v2.0.0)

### 🛠️ Key Reliability & Architecture Fixes in v2.0.0:
* **Zero Blank White Screen**: Relative `./assets/` resolution and resilient `waitForServer()` health check prevent load timeouts.
* **100% Custom White UI Installer**: NSIS one-click execution skips legacy grey Windows wizards and boots straight into the Cat Playing Animation Setup screen.
* **Massive Size Reduction**: Reduced from 1.1 GB down to **337 MB** installed, installer shrunk from 333 MB to **109 MB** (67% smaller download!).
* **LAN Security Hardened**: Express backend binds strictly to `127.0.0.1` with local-only host verification and media-path sanitization.

---

**Developed with ❤️ by [Milann Sharma](https://github.com/MilannSharma)**
