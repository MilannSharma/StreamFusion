# Stremfusion - Installation & Setup Guide

## 📦 Quick Installation

### Prerequisites

Before installing Stremfusion, ensure you have:
- **Windows 10/11 (64-bit)**
- **At least 500 MB free disk space**
- **Android device with USB Debugging capability**
- **USB cable** (USB 3.0 recommended)

---

## 🚀 Installation Steps

### Step 1: Download the Installer

1. Navigate to the **Releases** page
2. Download: **Streamfusion Setup 1.0.0.exe**
3. Save to your **Downloads** folder (or preferred location)

### Step 2: Run the Installer

```
1. Double-click "Streamfusion Setup 1.0.0.exe"
2. Windows SmartScreen may appear:
   • Click "More info"
   • Click "Run anyway" (safe - this is our app)
3. Follow the installation wizard:
   • Accept license agreement
   • Choose installation folder (default recommended)
   • Create desktop shortcut (recommended)
   • Select Start Menu folder
4. Click "Install"
5. Wait for installation to complete (1-2 minutes)
6. Click "Finish" to launch Stremfusion
```

### Step 3: Initial Setup

```
✅ Stremfusion launches for the first time
✅ You'll see the main interface with Status bar
✅ Status shows: Backend, ADB, Android, iOS, USB Debugging status
✅ Application is ready for device connection
```

---

## 📱 Enable USB Debugging on Your Android Device

USB Debugging must be enabled to use Stremfusion. Follow these steps:

### For Android 5.0 - 10.x

```
1. Go to Settings → About Phone
2. Find "Build Number" (usually near bottom)
3. Tap "Build Number" 7 times rapidly
   └─ You should see: "You are now a developer!"
4. Go back to Settings
5. New option appears: "Developer Options" or "Developer Settings"
6. Open "Developer Options"
7. Scroll down to find "USB Debugging"
8. Toggle "USB Debugging" ON
9. You may see: "Allow USB Debugging?"
   └─ Tap "Allow"
```

### For Android 11+

```
1. Go to Settings → About Phone
2. Tap "Build Number" 7 times rapidly
3. Go back to main Settings
4. Scroll to bottom, find "System" or "Advanced"
5. Tap "Developer Options"
6. Scroll to "Debugging" section
7. Toggle "USB Debugging" ON
8. Confirm when dialog appears
```

### Authorization on Windows PC

```
1. After enabling USB Debugging, connect your device to PC via USB
2. Unlock your Android device
3. You should see a dialog: "Allow USB Debugging?"
4. Check "Always allow from this computer" (optional but recommended)
5. Tap "Allow"
6. Device is now authorized!
```

---

## 🎮 Operating Stremfusion

### Launching the Application

**From Windows Start Menu:**
```
1. Click Start button (Windows logo)
2. Type "Stremfusion"
3. Click "Streamfusion" in results
4. Application launches
```

**From Desktop Shortcut:**
```
1. Double-click "Stremfusion" icon on desktop
2. Application launches
```

**From File Explorer:**
```
1. Open File Explorer
2. Navigate to: C:\Users\[YourName]\AppData\Local\Programs\Streamfusion\
3. Double-click "Streamfusion.exe"
```

### Main Interface Overview

```
┌──────────────────────────────────────────────────────────┐
│ 📱 Stremfusion                        [⚙️] [❓] [□] [✕]  │
├──────────────────────────────────────────────────────────┤
│ Status: Backend 🟢 | ADB 🟢 | Android 🟢 | USB Debug 🟢 │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  Device Information:                                      │
│  Model: Samsung Galaxy A12                               │
│  Device ID: 10BEBF17QT004HB                              │
│                                                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │       ▶️ START STREAMING                        │    │
│  └─────────────────────────────────────────────────┘    │
│                                                           │
│  Terminal Output:                                         │
│  └─ [12:50 AM] System initialized                        │
│                                                           │
│  © Stremfusion | Created by Milan | Powered by Nexa    │
└──────────────────────────────────────────────────────────┘
```

### Basic Operation

#### 1. Connect Your Device

```
Step 1: Plug Android device into USB port
        └─ Use USB 3.0 port if available

Step 2: Unlock your device
        └─ Device must be unlocked to stream

Step 3: Wait 2-3 seconds for detection
        └─ Stremfusion polls every 2 seconds

Step 4: Check status bar
        └─ Should show: "Android: 🟢 Connected"

Step 5: Your device appears in device list
        └─ Ready to stream!
```

#### 2. Start Streaming

```
Click "▶️ START STREAMING" button
    ↓
New window opens (streaming window)
    ↓
Device screen appears in window
    ↓
Move mouse over window to control device
    ↓
Click in window and use keyboard
```

#### 3. Interact with Your Device

```
✓ Move mouse to control pointer
✓ Click to tap screen
✓ Double-click for double-tap
✓ Right-click for menu/back button
✓ Scroll with mouse wheel
✓ Press keyboard keys as normal
```

#### 4. Stop Streaming

```
Click "■ STOP STREAMING" button
    ↓
Streaming window closes
    ↓
Control returned to main interface
    ↓
Ready for next stream or device
```

### Status Bar Information

| Icon | Meaning | Status |
|------|---------|--------|
| 🟢 | Online/Ready | Working perfectly |
| 🟠 | Warning | Minor issue (check tips) |
| 🔴 | Offline/Error | Needs attention |

**Status Meanings:**

- **Backend 🟢**: Server running (needed for streaming)
- **ADB 🟢**: Android Debug Bridge ready
- **Android 🟢**: Device connected and detected
- **iOS**: iOS device status (not supported in v1.0)
- **USB Debugging 🟢**: Debugging enabled on device

### Settings Panel

**To open settings:**
```
1. Click ⚙️ icon (top right)
2. Available options:
   • Video Quality (resolution, bitrate)
   • Audio Settings (if supported)
   • Auto-Configure OBS
   • Advanced Options
3. Make desired changes
4. Click "Save" or "Apply"
5. Settings take effect immediately or on next stream
```

---

## 🆘 Troubleshooting

### Device Not Detected

**Problem:** "Android: 🔴 Not Connected" or device list is empty

**Solutions:**

```
Quick Fix:
1. Check USB cable is properly connected
2. Unlock your Android device
3. Try different USB port (USB 3.0 if available)
4. Restart Stremfusion

If still not working:
5. Disconnect device, wait 5 seconds
6. Reconnect device
7. Accept authorization dialog on device
8. Restart your Android device
9. Check Device Manager for unknown devices
```

### USB Debugging Not Enabled

**Problem:** "USB Debugging: 🔴 Disabled"

**Solution:**

```
On Android Device:
1. Settings → Developer Options
2. Find "USB Debugging"
3. Toggle ON (ensure it's switched on)
4. If toggle is grayed out:
   • Restart device
   • Reconnect USB cable
   • Try again
```

### ADB Not Ready

**Problem:** "ADB: 🔴 Not Ready"

**Solution:**

```
In Stremfusion:
1. Check status bar shows correct state
2. Disconnect USB cable
3. Wait 3 seconds
4. Reconnect USB cable
5. Authorize on device if prompted
6. Wait for ADB to initialize (up to 5 seconds)

If still failing:
7. Close Stremfusion completely
8. Restart Stremfusion
9. Plug in device again
```

### Black/Empty Streaming Window

**Problem:** Stream window opens but screen is completely black

**Solution:**

```
1. Ensure device is UNLOCKED
2. Increase device brightness to maximum
3. Stop streaming (click button)
4. Wait 3 seconds
5. Start streaming again
6. If still black:
   • Restart both device and Stremfusion
   • Try different USB port
   • Update Android device software
```

### Laggy or Stuttering Stream

**Problem:** Video is choppy, delayed, or unresponsive

**Solution:**

```
Quick Fixes:
1. Close unnecessary background applications
2. Disable browser sync
3. Use USB 3.0 port instead of USB 2.0
4. Try shorter USB cable
5. Reduce video bitrate in Settings:
   ⚙️ Settings → Video Quality → Bitrate (Lower)

Advanced:
6. Disconnect other USB devices
7. Update USB drivers:
   • Windows Update
   • Device Manager
8. Disable USB Selective Suspend:
   • Device Manager → USB Root Hubs
   • Properties → Power Management
   • Uncheck "Allow this device to be suspended"
```

### Permission Denied Errors

**Problem:** "Permission Denied" in terminal output

**Solution:**

```
1. Revoke all debugging authorizations:
   • Device: Settings → Developer Options
   • Find "Revoke USB Debugging Authorizations"
   • Tap to revoke all

2. Disconnect USB cable

3. Restart Stremfusion

4. Reconnect device

5. Accept new permission dialog carefully:
   • Ensure you're looking at device screen
   • Click "Allow"
   • Check "Always allow" if desired
```

### Installation Issues

**Problem:** "Windows Defender SmartScreen prevented execution"

**Solution:**

```
1. SmartScreen warning appears
2. Click "More info"
3. Click "Run anyway"
4. Click "Yes" when asked for permissions
5. Installation proceeds normally
```

**Problem:** "Not enough space" error

**Solution:**

```
1. Stremfusion requires ~500 MB
2. Check available disk space:
   • Right-click Drive C:
   • Select "Properties"
   • Check "Free space"
3. If <500 MB:
   • Delete temporary files
   • Uninstall unused programs
   • Clear Windows cache
4. Retry installation
```

---

## 🔧 Uninstallation

### Via Windows Settings (Recommended)

```
1. Open Windows Settings (Win + I)
2. Go to "Apps" → "Apps & features"
3. Search for "Streamfusion"
4. Click "Streamfusion"
5. Click "Uninstall"
6. Confirm uninstallation
7. Wait for process to complete
8. Restart computer (optional)
```

### Via Control Panel

```
1. Open Control Panel
2. Go to "Programs" → "Programs and Features"
3. Find "Streamfusion" in list
4. Click on it
5. Click "Uninstall" button
6. Follow uninstallation wizard
7. Restart computer (optional)
```

### Manual Uninstallation (If needed)

```
1. Close Stremfusion completely
2. Open File Explorer
3. Navigate to: C:\Users\[YourName]\AppData\Local\Programs\Streamfusion\
4. Delete entire folder
5. Delete desktop shortcut
6. Delete Start Menu shortcut:
   • Right-click Start
   • Select "All Apps"
   • Find "Stremfusion"
   • Right-click → "Uninstall"
```

---

## 📋 System Specifications

### Minimum Requirements

| Component | Requirement |
|-----------|------------|
| **OS** | Windows 10 64-bit |
| **RAM** | 2 GB |
| **Storage** | 500 MB free |
| **Processor** | Intel/AMD 2 GHz+ |
| **USB** | USB 2.0 or higher |

### Recommended Specifications

| Component | Recommendation |
|-----------|--------------|
| **OS** | Windows 11 64-bit |
| **RAM** | 4 GB or higher |
| **Storage** | SSD with 1 GB free |
| **Processor** | Intel/AMD 4-core 2.5 GHz+ |
| **USB** | USB 3.0+ |

### Supported Android Versions

- Android 5.0 (API 21) - Minimum
- Android 6.0 - 10.x - Full support
- Android 11 - 14 - Full support
- Android 15+ - Testing in progress

---

## 🛠️ Developer Setup & Building

### For Developers: Build from Source

If you want to build Stremfusion from source or contribute:

#### Prerequisites

```bash
# Install Node.js (16.x or higher)
# Download from: https://nodejs.org/

# Verify installation:
node --version
npm --version
```

#### Clone Repository

```bash
# Clone the project
git clone https://github.com/MilannSharma/stremfusion.git
cd stremfusion
```

#### Install Dependencies

```bash
# Install all required packages
npm install

# This downloads ~500MB (Electron, build tools, etc.)
# Takes 2-5 minutes depending on internet speed
```

#### Development Mode

```bash
# Run app in development mode with hot reload
npm run electron:dev

# Or use shorthand
npm start

# Features:
# • Automatic reload on file changes
# • DevTools enabled for debugging
# • Console logs visible in terminal
# • Full source maps for debugging
```

#### Build for Production

```bash
# Create optimized build
npm run build

# Output goes to ./dist folder
# Includes:
# • Minified JavaScript (~270 KB)
# • Optimized HTML/CSS
# • Bundled assets
```

#### Create Windows Installer

```bash
# Build and create .exe installer
npm run pack

# Output:
# • Streamfusion Setup 1.0.0.exe (102 MB)
# • dist-app/ folder with unpacked app
# • Suitable for distribution

# File locations:
# - Installer: ./dist-app/Streamfusion Setup 1.0.0.exe
# - Unpacked app: ./dist-app/win-unpacked/Streamfusion.exe
```

#### Project Structure

```
stremfusion/
├── electron/              # Electron main process
│   ├── main.ts           # App entry, window creation
│   └── preload.ts        # IPC bridge
├── components/           # React components
│   ├── Header.tsx
│   ├── Controls.tsx
│   ├── StatusBar.tsx
│   └── ...
├── services/            # API & utilities
│   └── api.ts
├── public/              # Static assets
│   └── assets/
├── dist/                # Built app (production)
├── dist-electron/       # Compiled Electron files
├── dist-app/            # Packaged app + installer
├── package.json         # Dependencies & scripts
├── tsconfig.json        # TypeScript config
├── vite.config.ts       # Vite build config
└── README.md            # Documentation
```

#### Key npm Scripts

```bash
npm run electron:dev     # Start dev mode
npm run build            # Build production
npm run pack             # Create installer
npm run preview          # Preview production build
npm run typecheck        # Check TypeScript
npm run lint             # Lint code
npm run format           # Format code (Prettier)
```

#### Configuration Files

- **vite.config.ts** - Frontend bundler settings
- **electron-builder.yml** - Installer configuration
- **tsconfig.json** - TypeScript compiler settings
- **package.json** - Dependencies & build scripts

#### Debugging

```bash
# Enable detailed logging:
DEBUG=* npm run electron:dev

# Open DevTools in running app:
Press: Ctrl+Shift+I

# View main process logs:
Check terminal output

# View preload/IPC logs:
Check DevTools console
```

#### Building for macOS/Linux (Future)

```bash
# The codebase supports multi-platform builds:
# Current: Windows only
# Future: macOS and Linux support planned

# To add platform support:
# 1. Update vite.config.ts
# 2. Update electron-builder.yml
# 3. Test on target platform
# 4. Adjust scrcpy paths for platform
```

#### Performance Optimization

```bash
# Optimize build size:
npm run build -- --optimize

# Measure build performance:
npm run build -- --profile

# Analyze bundle size:
npm run analyze

# Check for unused code:
npm run audit
```

#### Contributing Code

```bash
# Fork repository on GitHub

# Create feature branch:
git checkout -b feature/your-feature-name

# Make changes and test:
npm run electron:dev

# Commit with clear messages:
git commit -m "Add: description of changes"

# Push to your fork:
git push origin feature/your-feature-name

# Create Pull Request on GitHub
```

#### Technology Stack (Developer)

| Technology | Purpose | Version |
|-----------|---------|---------|
| **Electron** | Desktop framework | 39.2.6 |
| **React** | UI library | 19.2.3 |
| **Vite** | Build tool | 6.2.0 |
| **TypeScript** | Type safety | ~5.8.2 |
| **Tailwind CSS** | Styling | Latest |
| **Node.js** | Runtime | 16+ |
| **npm** | Package manager | 7+ |

#### Troubleshooting Build Issues

**Issue: `npm install` fails**
```bash
# Clear cache and retry:
npm cache clean --force
rm -r node_modules package-lock.json
npm install
```

**Issue: Electron won't launch**
```bash
# Kill any running instances:
taskkill /F /IM electron.exe

# Clear build cache:
rm -r dist dist-electron dist-app

# Rebuild:
npm run build
npm run electron:dev
```

**Issue: Module not found error**
```bash
# Reinstall dependencies:
npm install

# Check imports:
npm run typecheck

# Clear cache:
npm cache clean --force
```

---

## 📞 Support & Resources

### Documentation
- **README.md** - Full project documentation
- **INSTALL.md** - This installation guide
- **LICENSE** - MIT License text

### Getting Help
- **GitHub Issues** - Report bugs or request features
- **GitHub Discussions** - Ask questions
- **Developer Documentation** - See DEVELOPER_GUIDE.md (if available)

### Online Resources
- **Android ADB Docs** - https://developer.android.com/tools/adb
- **Electron Docs** - https://www.electronjs.org/docs
- **React Docs** - https://react.dev
- **scrcpy GitHub** - https://github.com/Genymobile/scrcpy

---

## ✅ Verification Checklist

After installation, verify everything works:

```
✓ Stremfusion launches without errors
✓ Status bar shows green icons (Backend, ADB, etc.)
✓ Device detects when connected
✓ USB Debugging shows enabled
✓ Can start streaming successfully
✓ Device screen displays in streaming window
✓ Mouse/keyboard controls work
✓ Can stop streaming without errors
✓ Settings panel opens and responds
✓ Help links work correctly
```

---

## 📝 Version Information

| Item | Details |
|------|---------|
| **Version** | 1.0.0 |
| **Release Date** | December 14, 2025 |
| **Status** | Stable Release |
| **Windows Support** | 10/11 (64-bit) |
| **Installer Size** | ~102 MB |

---

## 🔐 Privacy & Security Notes

✅ **No data collection**
- No analytics
- No telemetry
- No cloud services required

✅ **Local processing only**
- All mirroring happens over USB
- No internet required
- Complete offline capability

✅ **Secure defaults**
- USB Debugging requires device confirmation
- Authorization can be revoked anytime
- No elevated privileges required

---

## 📄 License

MIT License - Created by Milan Sharma
Powered by Nexa

See LICENSE file for full text.

---

<div align="center">

**Need more help? Check the README.md or visit GitHub Issues**

[GitHub Repository](https://github.com/MilannSharma/stremfusion) • [Report Issue](https://github.com/MilannSharma/stremfusion/issues) • [Documentation](README.md)

**Made with ❤️ by Milan Sharma | Powered by Nexa**

</div>
