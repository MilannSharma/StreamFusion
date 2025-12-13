# Stremfusion v1.0.0

<div align="center">

![Stremfusion Screenshot](./assets/logo/images/Screenshot%202025-12-14%20011644.png)

**A powerful desktop application for Android device mirroring and streaming control**

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/MilannSharma/stremfusion/blob/main/LICENSE)
[![Electron](https://img.shields.io/badge/Electron-39.2.6-blue.svg)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19.2.3-61dafb.svg)](https://react.dev/)
[![Windows](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078d4.svg)](https://www.microsoft.com/windows)

[Features](#-features) • [Installation](#-installation) • [Usage](#-usage) • [Troubleshooting](#-troubleshooting) • [License](#-license)

</div>

---

## 📱 About Stremfusion

**Stremfusion** is a modern, feature-rich desktop application that enables seamless Android device mirroring and control directly from your Windows PC. Built with cutting-edge web technologies and packaged as a native desktop application using Electron, Stremfusion delivers professional-grade device streaming with an intuitive, responsive user interface.

Whether you're a developer, content creator, or just want to view and interact with your Android device on a larger screen, Stremfusion provides everything you need in one elegant package.

### ✨ Core Capabilities

- **🎥 Real-time HD Mirroring** - Stream your Android device screen with high-quality video
- **🔍 Automatic Device Detection** - Instantly detects connected Android devices via USB
- **📊 Real-time Status Monitoring** - Live monitoring of ADB, USB debugging, and device status
- **⚡ Easy Device Controls** - Simple one-click controls to start/stop streaming
- **📝 Live Terminal Output** - Real-time logs and debugging information
- **🎛️ OBS Integration** - Auto-configure OBS scenes (optional feature)
- **🖥️ Native Desktop App** - Full Electron desktop experience without browser overhead
- **🔐 Secure & Local** - All processing happens locally, no internet required

---

## 🎯 Key Features

### Device Management
- **Multi-Device Support**: Connect and manage multiple Android devices
- **Device Information**: View device model, ID, and connection state
- **Real-time Detection**: Automatic polling every 2 seconds
- **USB Debugging Control**: Monitor and manage USB debugging status

### Streaming Control
- **One-Click Streaming**: Start/stop streaming with a single button
- **High Performance**: Optimized for smooth, lag-free streaming
- **Adaptive Bitrate**: Automatic quality adjustment based on connection
- **Window Management**: Dedicated streaming window with full device control

### System Monitoring
- **Backend Status**: Real-time backend service status
- **ADB Integration**: Complete Android Debug Bridge support
- **Connection Diagnostics**: Detailed diagnostic information
- **Performance Metrics**: Monitor resource usage and connection quality

### Developer-Friendly
- **Live Logs**: Terminal output with detailed execution logs
- **Debug Mode**: Enhanced logging for troubleshooting
- **Settings Panel**: Comprehensive configuration options
- **Help & Documentation**: Built-in help and online documentation

---

## 🚀 Quick Start

### System Requirements

| Requirement | Minimum | Recommended |
|---|---|---|
| **OS** | Windows 10 (64-bit) | Windows 11 (64-bit) |
| **RAM** | 2 GB | 4 GB |
| **Storage** | 500 MB | 1 GB |
| **USB** | USB 2.0 | USB 3.0 |
| **Android** | 5.0 (API 21+) | 10.0+ |

### Installation (3 Easy Steps)

#### Step 1: Download & Install

```bash
# Download the latest release:
# https://github.com/MilannSharma/StreamFusion/releases/download/v1.0.0/Streamfusion-v1.0.0.zip
#
# Extract the ZIP file and run the installer:
# Streamfusion Setup 1.0.0.exe (102 MB)
```

#### Step 2: Enable USB Debugging

**On Your Android Device:**

1. Go to **Settings** → **About Phone**
2. Tap **Build Number** 7 times (until you see "Developer Mode enabled")
3. Go to **Settings** → **Developer Options**
4. Enable **USB Debugging**
5. Authorize your PC when prompted

**On Windows:**

1. Connect your Android device via USB
2. Accept the authorization prompt on your device
3. Launch Stremfusion - your device will appear automatically

#### Step 3: Start Streaming

1. Click the **Start Streaming** button
2. A new window opens with your device screen
3. Use your mouse/keyboard to control your device
4. Click **Stop Streaming** when done

---

## 💻 How to Use

### Main Interface

```
┌─────────────────────────────────────────────────────────────────┐
│  📱 Stremfusion                                    ⚙️  ❓  ⊞  □  ✕ │
├─────────────────────────────────────────────────────────────────┤
│  Backend: ● Online   ADB: ● Ready   Android: ● Connected (i2219)│
│  iOS: ● Not Connected   USB Debugging: ● Enabled                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Device: Samsung Galaxy A12                                     │
│  Model: I2219 | ID: 10BEBF17QT004HB                             │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ▶️  START STREAMING  █ STOP STREAMING                       │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  TERMINAL OUTPUT:                                               │
│  [12:50:43 AM]  System initialized...                           │
│  [12:50:43 AM]  Waiting for device connection...                │
│                                                                 │
│  SYSTEM READY                                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Step-by-Step Operations

#### 1️⃣ Launching the Application

```bash
# Option A: From Start Menu
Windows → Search "Stremfusion" → Click to launch

# Option B: From Desktop Shortcut
Double-click the Stremfusion icon on your desktop

# Option C: Direct Execution
C:\Users\[YourUsername]\AppData\Local\Programs\Streamfusion\Streamfusion.exe
```

#### 2️⃣ Connecting Your Device

```
1. Plug in Android device via USB cable
   ↓
2. Unlock your device (if locked)
   ↓
3. Check top status bar for "Android: ● Connected"
   ↓
4. Device appears in the device selector
   ↓
5. Ready to stream!
```

#### 3️⃣ Starting a Stream

```
Step 1: Select Device (if multiple connected)
        └─ Choose from dropdown in controls panel

Step 2: Click "START STREAMING" button
        └─ Blue button in the controls section

Step 3: New window opens
        └─ Shows your device screen

Step 4: Interact with device
        └─ Use mouse/keyboard as if holding phone

Step 5: Stop when done
        └─ Click red "STOP STREAMING" button
```

#### 4️⃣ Monitoring Status

**Status Bar Information:**

| Status | Meaning | Action |
|--------|---------|--------|
| **Backend: 🟢 Online** | Service running | No action needed |
| **Backend: 🔴 Offline** | Service stopped | Restart app |
| **ADB: 🟢 Ready** | Android Debug Bridge connected | No action needed |
| **ADB: 🟠 Not Ready** | ADB not found | Reconnect device |
| **Android: 🟢 Connected** | Device detected | Ready to stream |
| **Android: 🔴 Disconnected** | No device found | Plug in device |
| **USB Debugging: 🟢 Enabled** | Debugging active | No action needed |
| **USB Debugging: 🔴 Disabled** | Must be enabled | Enable in settings |

#### 5️⃣ Using Settings

```
Click ⚙️ Settings icon (top right)
    ↓
Available options:
    • Video Quality (bitrate, resolution)
    • Audio Settings (if supported)
    • Auto-Config OBS
    • Advanced Options
    ↓
Apply Settings
    ↓
Restart streaming if needed
```

#### 6️⃣ Viewing Help

```
Click ❓ Help icon (top right)
    ↓
Documentation link opens in browser
    ↓
Browse FAQs and troubleshooting guides
```

---

## 🔧 Troubleshooting

### Common Issues & Solutions

#### ❌ Device Not Detected

**Symptoms:** Device list is empty or shows "No devices"

**Solutions:**
```
1. ✓ Check USB cable (try different cable)
2. ✓ Try different USB port (USB 3.0 preferred)
3. ✓ Ensure USB Debugging is ENABLED
   Settings → Developer Options → USB Debugging: ON
4. ✓ Unlock your device
5. ✓ Restart Stremfusion
6. ✓ Restart your Android device
7. ✓ Check Windows Defender firewall
```

#### ❌ ADB Not Ready

**Symptoms:** Status bar shows "ADB: Not Ready"

**Solutions:**
```
1. ✓ Disconnect USB cable
2. ✓ Wait 5 seconds
3. ✓ Reconnect USB cable
4. ✓ Accept permission dialog on device
5. ✓ Restart Stremfusion completely
6. ✓ If still failing, restart your device
```

#### ❌ Black/Empty Stream Window

**Symptoms:** Streaming window opens but is completely black

**Solutions:**
```
1. ✓ Unlock your Android device
2. ✓ Increase device brightness to maximum
3. ✓ Disconnect and reconnect device
4. ✓ Restart streaming (Stop → Start)
5. ✓ Restart both Stremfusion and Android device
6. ✓ Check device isn't in sleep mode
```

#### ❌ Laggy/Choppy Stream

**Symptoms:** Video is stuttering or delayed

**Solutions:**
```
1. ✓ Close background applications
2. ✓ Reduce video bitrate:
     Settings → Video Quality → Lower bitrate
3. ✓ Reduce resolution:
     Settings → Video Quality → Max 1024px
4. ✓ Use USB 3.0 port (higher bandwidth)
5. ✓ Use shorter/better quality USB cable
6. ✓ Close browser windows and heavy apps
```

#### ❌ Authorization Popup Not Appearing

**Symptoms:** Device connects but no permission dialog

**Solutions:**
```
1. ✓ Check "Always allow from this computer"
2. ✓ Revoke debugging authorizations:
     Settings → Developer Options → Revoke authorizations
3. ✓ Disconnect and reconnect device
4. ✓ Accept new permission dialog
```

### Advanced Troubleshooting

#### Check Device via Command Line

```bash
# Open Command Prompt/PowerShell and run:
adb devices -l

# Expected output:
# List of devices attached
# DEVICE_ID    device product:... model:... device:...
```

#### View Detailed Logs

1. Open Stremfusion
2. Check "TERMINAL OUTPUT" section at bottom
3. Look for error messages
4. Copy logs for support

#### Reset ADB

```bash
# In Command Prompt/PowerShell:
adb kill-server
adb start-server
adb devices
```

---

## 📋 System Architecture

### Technology Stack

```
┌─────────────────────────────────────────────────────────┐
│                    Stremfusion v1.0.0                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Frontend (React + Vite)                                │
│  ├─ React 19.2.3 - UI Framework                         │
│  ├─ Vite 6.2.0 - Build Tool                             │
│  ├─ Tailwind CSS - Styling                              │
│  └─ TypeScript - Type Safety                            │
│                                                         │
│  Desktop App (Electron)                                 │
│  ├─ Electron 39.2.6 - Desktop Framework                 │
│  ├─ Node.js - Runtime                                   │
│  └─ TypeScript - Backend Logic                          │ 
│                                                         │
│  Android Communication (ADB)                            │
│  ├─ ADB (Android Debug Bridge)                          │
│  ├─ scrcpy 3.3.3 - Screen Mirroring                     │
│  └─ Device Polling (2s interval)                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Bundled Components

| Component | Version | Purpose |
|-----------|---------|---------|
| **Electron** | 39.2.6 | Desktop app framework |
| **React** | 19.2.3 | UI framework |
| **Vite** | 6.2.0 | Frontend bundler |
| **TypeScript** | ~5.8.2 | Type-safe code |
| **scrcpy** | 3.3.3 | Android screen mirroring |
| **ADB** | Latest | Device communication |
| **Tailwind CSS** | Latest | UI styling |

---

## 📦 Installation Methods

### Method 1: Windows Installer (Recommended)

**Pros:**
- ✓ Automatic installation
- ✓ Creates shortcuts
- ✓ Easy uninstall via Settings
- ✓ Automatic updates ready

**Steps:**
```bash
1. Download: Streamfusion Setup 1.0.0.exe
2. Double-click to run installer
3. Follow on-screen prompts
4. Launch from Start Menu
```

### Method 2: Portable Version

**Pros:**
- ✓ No installation required
- ✓ Can run from USB drive
- ✓ No registry changes

**Steps:**
```bash
1. Extract: dist-app\win-unpacked\
2. Run: Streamfusion.exe directly
3. No installation needed
```

### Method 3: Developer Install (from source)

**Requirements:**
- Node.js 16+
- npm or yarn
- Windows 10/11

**Steps:**
```bash
# Clone repository
git clone https://github.com/MilannSharma/stremfusion.git
cd stremfusion

# Install dependencies
npm install

# Run in development mode
npm run electron:dev

# Build for production
npm run build

# Create installer
npm run pack
```

---

## 🔐 Privacy & Security

### Data Privacy

✅ **We collect NO personal data**
- No analytics tracking
- No telemetry
- No user data collection
- All processing is local

### Security Features

✅ **USB Debugging Protection**
- Only enable on trusted devices
- Authorization required per device
- Revocable at any time

✅ **No Internet Required**
- Works entirely over USB
- No cloud dependencies
- Fully offline capable

✅ **Open Source**
- Full transparency
- MIT License
- Code auditable by community

### Security Best Practices

1. **Only enable USB Debugging on trusted devices**
2. **Revoke authorization from untrusted computers**
3. **Keep Windows Defender/Antivirus updated**
4. **Keep Android device updated**
5. **Don't share devices with enabled debugging**

---

## 📄 License

MIT License - See [LICENSE](./LICENSE) file for full text

```
Copyright (c) 2025 Milan Sharma

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 👨‍💻 Author & Credits

### Created By

**Milan Sharma**
- 🔗 GitHub: [@MilannSharma](https://github.com/MilannSharma)
- 🌐 Portfolio: [GitHub Profile](https://github.com/MilannSharma)
- 📧 Contact: Via GitHub profile

### Powered By

**Nexa**
- AI-powered development assistance
- Advanced optimization and integration
- Development partner for excellence

### Open Source Projects Used

We stand on the shoulders of giants. Special thanks to:

- **[scrcpy](https://github.com/Genymobile/scrcpy)** - Android screen mirroring excellence
- **[Electron](https://github.com/electron/electron)** - Cross-platform desktop framework
- **[React](https://github.com/facebook/react)** - Modern UI library
- **[Vite](https://github.com/vitejs/vite)** - Next-gen frontend build tool
- **[Tailwind CSS](https://github.com/tailwindlabs/tailwindcss)** - Utility-first CSS

---

## 🚀 Getting Help

### Documentation

- 📖 **README.md** - Full project documentation
- 📋 **INSTALL.md** - Installation guide
- 🆘 **TROUBLESHOOTING.md** - Common issues & solutions
- 💻 **API.md** - Developer API reference

### Support Resources

- **GitHub Issues** - [Report bugs or request features](https://github.com/MilannSharma/stremfusion/issues)
- **Android Docs** - [USB Debugging Guide](https://developer.android.com/tools/adb)
- **scrcpy Wiki** - [Advanced configuration](https://github.com/Genymobile/scrcpy/wiki)
- **Electron Docs** - [Framework documentation](https://www.electronjs.org/docs)

### Community

- Share tips and tricks
- Help other users
- Report issues on GitHub
- Contribute improvements

---

## 📊 Project Statistics

```
Language Distribution:
  TypeScript:  45%
  React/TSX:   35%
  CSS/Tailwind: 15%
  HTML:         5%

Lines of Code: ~4,500
Components:    10+
Features:      12+
Platforms:     1 (Windows - Expandable)
```

---

## 🗺️ Roadmap

### v1.1.0 (Planned)
- [ ] macOS support
- [ ] Linux support
- [ ] Audio streaming
- [ ] Custom bitrate profiles
- [ ] Device screenshots
- [ ] Session recording

### v1.2.0 (Planned)
- [ ] iOS support
- [ ] Web dashboard
- [ ] Remote streaming (over network)
- [ ] Cloud sync settings
- [ ] Multi-device concurrent streaming

### v2.0.0 (Future)
- [ ] Mobile app companion
- [ ] Advanced gesture support
- [ ] Game streaming optimization
- [ ] AI-powered enhancements

---

## ⭐ Show Your Support

If Stremfusion has been helpful to you:

- ⭐ **Star this repository** - Help others discover it
- 🔗 **Share with friends** - Spread the word
- 💬 **Leave feedback** - Tell us what you think
- 🐛 **Report issues** - Help us improve
- ✨ **Contribute code** - Join the development

---

## 🤝 Contributing

We welcome contributions! Whether you're fixing bugs, adding features, or improving documentation:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

---

## 📞 Contact & Social

- **GitHub**: [@MilannSharma](https://github.com/MilannSharma)
- **Issues**: [GitHub Issues](https://github.com/MilannSharma/stremfusion/issues)
- **Discussions**: [GitHub Discussions](https://github.com/MilannSharma/stremfusion/discussions)

---

## 📝 Version History

### v1.0.0 - Release (December 14, 2025)

**Initial Release Features:**
- ✅ Android device mirroring
- ✅ Real-time device detection
- ✅ System status monitoring
- ✅ Streaming controls
- ✅ Terminal output logging
- ✅ Settings panel
- ✅ Windows installer
- ✅ MIT License
- ✅ Full documentation

---

## ⚖️ Legal Notice

Stremfusion is provided "as-is" without any warranty. Users are responsible for:
- Compliance with applicable laws
- Adherence to device manufacturer terms
- Responsible use of device access
- Privacy of device data

---

## 🙏 Acknowledgments

Thank you to everyone who has contributed, tested, reported issues, and helped improve Stremfusion!

**Special thanks to:**
- The open-source community
- All beta testers
- GitHub users who reported issues
- Contributors and maintainers

---

<div align="center">

### Made with ❤️ by Milan Sharma
### Powered by Nexa
### Licensed under MIT

**[⬆ Back to top](#stremfusion-v100)**

</div>

---

**Last Updated:** December 14, 2025  
**Current Version:** v1.0.0  
**Status:** Active Development  
**License:** MIT





### Stremfusion v1.0.0 is Fully OpenSource Just Give credit To respective devlopers...!