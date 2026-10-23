# StreamFusion — Development Plan

> **Premium Windows Desktop Application for Android Screen Mirroring, Control & File Transfer**
> Built on scrcpy v5.0.1 · Electron + React · Standalone `.exe`

---

## 1. Project Overview

**StreamFusion** is a polished, professional Windows desktop application that wraps `scrcpy` into a beautiful GUI with extended capabilities — screen mirroring (USB & WiFi), audio forwarding, screen recording, drag-and-drop file transfer, clipboard sync, and deep configuration controls. The app ships as a single standalone `.exe` installer with all dependencies bundled.

### Brand Identity
- **Color Palette:** Cyan `#00D4FF` → Electric Blue `#0088FF` → Purple `#8B5CF6` (matches existing logo)
- **UI Theme:** Dark mode primary, minimal, glassmorphic panels, micro-animations
- **Typography:** Inter (UI), JetBrains Mono (terminal/logs)

---

## 2. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Desktop Shell** | Electron 33+ | Cross-platform shell, mature ecosystem, native window controls |
| **Frontend** | React 19 + TypeScript + Vite | Fast dev, component model, type safety |
| **Styling** | Vanilla CSS (custom design system) | Full control, no framework bloat, premium animations |
| **State** | Zustand | Lightweight, minimal boilerplate |
| **Backend (Main Process)** | Node.js (Electron main) | Spawn scrcpy/adb processes, file system access |
| **Mirroring Engine** | scrcpy v5.0.1 (bundled binary) | Industry standard, open-source, high performance |
| **Device Comms** | adb (bundled binary) | USB/WiFi device discovery, file transfer, shell commands |
| **Build / Package** | electron-builder | Standalone `.exe` NSIS installer for Windows |
| **Icons** | Lucide React | Consistent, minimal icon set |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Electron Main Process              │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐ │
│  │ ADB      │  │ Scrcpy   │  │ File Transfer     │ │
│  │ Manager  │  │ Manager  │  │ Manager           │ │
│  │          │  │          │  │ (adb push/pull)   │ │
│  └────┬─────┘  └────┬─────┘  └────┬──────────────┘ │
│       │              │             │                │
│  ┌────┴──────────────┴─────────────┴──────────────┐ │
│  │           IPC Bridge (contextBridge)            │ │
│  └────────────────────┬───────────────────────────┘ │
└───────────────────────┼─────────────────────────────┘
                        │
┌───────────────────────┼─────────────────────────────┐
│            Electron Renderer Process                │
│                                                     │
│  ┌─────────────────────────────────────────────────┐│
│  │                 React App                       ││
│  │                                                 ││
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ││
│  │  │Device│ │Mirror│ │Files │ │Record│ │Sett- │ ││
│  │  │Panel │ │View  │ │Panel │ │Panel │ │ings  │ ││
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

### Main Process Modules

| Module | Responsibility |
|--------|---------------|
| **AdbManager** | Device discovery (USB + WiFi), connection lifecycle, `adb tcpip`, `adb connect`, device info queries |
| **ScrcpyManager** | Spawn/kill scrcpy processes, build command-line args from user settings, monitor process health |
| **FileTransferManager** | `adb push`/`adb pull`, progress tracking, drag-and-drop handler, batch transfers |
| **RecordingManager** | scrcpy `--record` flag management, file naming, output directory management |
| **AudioManager** | scrcpy `--audio-codec`, `--no-audio` toggle, audio source selection |
| **ClipboardManager** | `--no-clipboard-autosync` toggle, manual copy/paste between devices |
| **ConfigStore** | Persist user settings to JSON (electron-store), profiles for different devices |
| **UpdateManager** | (Future) Auto-update via GitHub releases |

---

## 4. Feature Breakdown

### 4.1 — Device Connection & Discovery

| Feature | Details |
|---------|---------|
| **USB Auto-Detect** | Poll `adb devices` every 2s, auto-populate device list with model name, serial, Android version |
| **WiFi Connect** | One-click: detect USB device IP → `adb tcpip 5555` → `adb connect IP:5555` → disconnect USB prompt |
| **Manual WiFi** | Enter IP:port manually for already-configured devices |
| **Multi-Device** | Support connecting & mirroring multiple devices simultaneously (tabbed windows) |
| **Device Info Card** | Show device model, Android version, battery %, storage, screen resolution, IP address |
| **Connection Status** | Real-time status indicator (connected/disconnected/connecting) with auto-reconnect |
| **Saved Devices** | Remember previously connected WiFi devices for quick reconnect |

### 4.2 — Screen Mirroring

| Feature | Details |
|---------|---------|
| **Live Mirror** | Real-time screen display via scrcpy window (embedded or external) |
| **Touch Control** | Full touch input forwarding (tap, swipe, pinch) via mouse |
| **Keyboard Input** | Type on laptop keyboard → appears on phone |
| **Resolution Presets** | 480p / 720p / 1080p / Native / Custom (`--max-size`) |
| **Bitrate Control** | Slider: 1–50 Mbps (`--video-bit-rate`) |
| **FPS Control** | 15 / 30 / 60 / 120 FPS (`--max-fps`) |
| **Orientation Lock** | Lock portrait/landscape/auto (`--lock-video-orientation`) |
| **Crop Mode** | Crop specific region of screen (`--crop`) |
| **Display Selection** | Mirror specific display on multi-display devices (`--display-id`) |
| **Always on Top** | Pin mirror window above all windows (`--always-on-top`) |
| **Borderless Mode** | Remove window decorations (`--window-borderless`) |
| **Fullscreen** | Toggle fullscreen mirror (`--fullscreen`) |
| **Turn Off Screen** | Mirror with phone screen off to save battery (`--turn-screen-off`) |
| **Stay Awake** | Prevent device sleep while mirroring (`--stay-awake`) |
| **Show Touches** | Visualize touch points on mirror (`--show-touches`) |
| **Power Off on Close** | Turn screen off when disconnecting (`--power-off-on-close`) |

### 4.3 — Audio Streaming

| Feature | Details |
|---------|---------|
| **Audio Forward** | Stream device audio to PC (scrcpy v2.0+ built-in) |
| **Audio Codec** | Select codec: opus / aac / flac / raw (`--audio-codec`) |
| **Audio Bitrate** | Configure audio quality (`--audio-bit-rate`) |
| **Audio Source** | output (device speakers) / playback (apps) / mic (`--audio-source`) |
| **Audio Only Mode** | Stream audio without video (`--no-video`) |
| **Mute Toggle** | Quick mute/unmute button |
| **Audio Buffer** | Configure audio buffer for latency vs stability (`--audio-buffer`) |

### 4.4 — Screen Recording

| Feature | Details |
|---------|---------|
| **Record Session** | One-click record with scrcpy `--record` |
| **Format Selection** | MP4 / MKV / WebM (`--record-format`) |
| **Output Directory** | Configurable save location, default `~/Videos/StreamFusion/` |
| **Auto-Naming** | `StreamFusion_DeviceName_YYYY-MM-DD_HH-mm-ss.mp4` |
| **Record Timer** | Show elapsed time, optional max duration |
| **Record Audio** | Include device audio in recording |
| **Recording History** | List past recordings with quick open/delete actions |
| **No Mirror Record** | Record without displaying mirror (`--no-playback --record`) |

### 4.5 — File Transfer

| Feature | Details |
|---------|---------|
| **Drag & Drop → Device** | Drag files from Windows Explorer onto app → `adb push` to device |
| **Drag & Drop ← Device** | Browse device files → drag to Windows Explorer or desktop |
| **File Browser** | Built-in mobile file explorer (tree view via `adb shell ls`) |
| **Quick Paths** | Shortcuts: Downloads, DCIM, Pictures, Documents, Music, Videos |
| **Progress Bar** | Real-time transfer progress with speed indicator |
| **Batch Transfer** | Multi-file selection and transfer |
| **APK Install** | Drag `.apk` file → auto `adb install` with progress |
| **Screenshot Grab** | One-click screenshot → auto-pulled to PC (`adb exec-out screencap -p`) |

### 4.6 — Clipboard Sync

| Feature | Details |
|---------|---------|
| **Auto Sync** | Bi-directional clipboard sync (scrcpy default) |
| **Manual Paste** | Paste PC clipboard to device text field |
| **Clipboard History** | Keep last 20 clipboard entries |
| **Toggle** | Enable/disable auto-sync |

### 4.7 — Device Controls (Quick Actions)

| Feature | Details |
|---------|---------|
| **Volume Up/Down** | Virtual volume buttons |
| **Power Button** | Toggle screen on/off |
| **Home / Back / Recents** | Navigation buttons |
| **Rotate Screen** | Force rotation |
| **Notification Shade** | Pull down/up notifications |
| **Screen Off Mirror** | Mirror while device screen is off |
| **Open URL on Device** | Send URL from PC to device browser |
| **Run Shell Command** | Built-in adb shell terminal |

### 4.8 — Settings & Configuration

| Feature | Details |
|---------|---------|
| **Profiles** | Save/load config profiles per device or use-case (Gaming, Productivity, etc.) |
| **Video Codec** | h264 / h265 / av1 (`--video-codec`) |
| **Encoder Selection** | Choose hardware encoder (`--video-encoder`) |
| **Keyboard Mode** | sdk / uhid / aoa (`--keyboard`) |
| **Mouse Mode** | sdk / uhid / aoa (`--mouse`) |
| **Shortcut Keys** | Customize scrcpy keyboard shortcuts |
| **Recording Path** | Default save directory |
| **Startup Behavior** | Auto-connect last device, start minimized to tray, launch on Windows startup |
| **Theme** | Dark (default) / Darker / System |
| **Language** | English (expandable) |
| **Scrcpy Version** | Show bundled version, path to binary |
| **ADB Path** | Custom adb binary path override |
| **Reset Settings** | One-click reset all to defaults |

### 4.9 — In-App Guide & Help System

| Section | Content |
|---------|---------|
| **Getting Started** | Step-by-step: Enable USB Debugging → Connect → Mirror |
| **USB Debugging Guide** | Visual walkthrough for enabling developer options + USB debugging per Android version |
| **WiFi Setup Guide** | How wireless mirroring works, troubleshooting |
| **File Transfer Guide** | Drag & drop tutorial, file browser usage |
| **Audio Guide** | Audio forwarding setup, codec recommendations |
| **Recording Guide** | How to record, format comparison, output locations |
| **Keyboard Shortcuts** | Full shortcut reference table |
| **Troubleshooting** | Common issues: device not detected, black screen, lag fixes, WiFi disconnects |
| **FAQ** | Frequently asked questions |
| **About** | App version, credits, open-source licenses |

---

## 5. UI Design System

### 5.1 — Layout Structure

```
┌────────────────────────────────────────────────────────────┐
│  ◉ ◉ ◉   StreamFusion              ─  □  ✕              │  ← Custom Titlebar
├──────┬─────────────────────────────────────────────────────┤
│      │                                                     │
│  📱  │                                                     │
│      │                                                     │
│  📂  │              Main Content Area                      │
│      │         (Mirror / Files / Settings / Guide)         │
│  🎙️  │                                                     │
│      │                                                     │
│  ⚙️  │                                                     │
│      │                                                     │
│  ❓  │                                                     │
│      │                                                     │
├──────┴─────────────────────────────────────────────────────┤
│  Status Bar: Connected via USB · 1080p · 60fps · 8Mbps    │
└────────────────────────────────────────────────────────────┘
```

### 5.2 — Design Tokens

```css
/* Colors */
--bg-primary:      #0a0a0f;      /* Deep dark background */
--bg-secondary:    #12121a;      /* Card/panel background */
--bg-tertiary:     #1a1a2e;      /* Elevated surfaces */
--bg-glass:        rgba(255,255,255,0.03);  /* Glassmorphic panels */

--accent-cyan:     #00D4FF;      /* Primary accent */
--accent-blue:     #0088FF;      /* Secondary accent */
--accent-purple:   #8B5CF6;      /* Tertiary accent */
--accent-gradient: linear-gradient(135deg, #00D4FF, #0088FF, #8B5CF6);

--text-primary:    #E2E8F0;      /* Main text */
--text-secondary:  #94A3B8;      /* Muted text */
--text-tertiary:   #475569;      /* Disabled text */

--success:         #22C55E;      /* Connected, success states */
--warning:         #F59E0B;      /* Warnings */
--error:           #EF4444;      /* Errors, disconnect */

--border:          rgba(255,255,255,0.06);
--border-glow:     rgba(0,212,255,0.2);

/* Spacing */
--sidebar-width:   64px;
--statusbar-height: 32px;
--titlebar-height:  36px;

/* Radius */
--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 16px;

/* Transitions */
--transition-fast:   150ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-normal: 250ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-slow:   400ms cubic-bezier(0.4, 0, 0.2, 1);
```

### 5.3 — UI Principles

1. **Minimal Chrome** — Maximum content area, thin sidebar, compact status bar
2. **Glassmorphism** — Frosted glass panels with subtle backdrop blur
3. **Gradient Accents** — Cyan→Purple gradient on active states, buttons, progress bars
4. **Micro-animations** — Smooth page transitions, button hover effects, loading spinners
5. **Contextual Actions** — Right-click menus, hover toolbars, smart defaults
6. **Zero-Config Start** — Connect USB → auto-detect → one click to mirror
7. **Progressive Disclosure** — Simple view by default, expand for advanced settings

### 5.4 — Key UI Screens

| Screen | Description |
|--------|-------------|
| **Home / Devices** | Device cards with connection status, one-click connect/mirror buttons |
| **Mirror View** | Clean mirror display with floating toolbar (record, screenshot, controls) |
| **File Manager** | Split-pane: device files (left) ↔ PC files (right), drag between |
| **Audio Panel** | Audio source selector, codec picker, volume/mute, waveform visualizer |
| **Recordings** | Grid/list of past recordings with thumbnails, play/delete/open-folder |
| **Settings** | Categorized settings with search, profiles selector at top |
| **Guide** | Sidebar navigation with rich illustrated articles, step-by-step walkthroughs |
| **ADB Shell** | Embedded terminal with dark theme for advanced users |

---

## 6. Project Structure

```
StreamFusion/
├── package.json
├── electron-builder.yml            # Build & packaging config
├── vite.config.ts                  # Vite config for renderer
├── tsconfig.json
│
├── assets/                         # Icons, splash, logo
│   ├── StreamFusion.png
│   ├── icon.ico                    # Windows icon
│   └── tray-icon.png
│
├── scrcpy/                         # Bundled scrcpy binaries
│   ├── scrcpy.exe
│   ├── adb.exe
│   ├── scrcpy-server
│   └── *.dll                       # All required DLLs
│
├── src/
│   ├── main/                       # Electron Main Process
│   │   ├── index.ts                # App entry, window creation
│   │   ├── ipc-handlers.ts         # IPC channel registrations
│   │   ├── managers/
│   │   │   ├── AdbManager.ts       # adb device discovery & commands
│   │   │   ├── ScrcpyManager.ts    # scrcpy process lifecycle
│   │   │   ├── FileTransferManager.ts
│   │   │   ├── RecordingManager.ts
│   │   │   ├── AudioManager.ts
│   │   │   ├── ClipboardManager.ts
│   │   │   └── ConfigStore.ts      # Persistent settings
│   │   ├── utils/
│   │   │   ├── process-runner.ts   # Spawn & manage child processes
│   │   │   ├── device-parser.ts    # Parse adb output
│   │   │   └── paths.ts            # Resolve bundled binary paths
│   │   └── preload.ts              # contextBridge API exposure
│   │
│   ├── renderer/                   # React Frontend
│   │   ├── index.html
│   │   ├── main.tsx                # React entry
│   │   ├── App.tsx                 # Root component, routing
│   │   │
│   │   ├── styles/
│   │   │   ├── index.css           # Global styles, design tokens
│   │   │   ├── animations.css      # Keyframe animations
│   │   │   └── components/         # Component-specific styles
│   │   │
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Titlebar.tsx
│   │   │   │   ├── StatusBar.tsx
│   │   │   │   └── PageTransition.tsx
│   │   │   ├── devices/
│   │   │   │   ├── DeviceCard.tsx
│   │   │   │   ├── DeviceList.tsx
│   │   │   │   ├── WifiConnectModal.tsx
│   │   │   │   └── DeviceInfoPanel.tsx
│   │   │   ├── mirror/
│   │   │   │   ├── MirrorView.tsx
│   │   │   │   ├── MirrorToolbar.tsx
│   │   │   │   ├── ControlButtons.tsx
│   │   │   │   └── ResolutionPicker.tsx
│   │   │   ├── files/
│   │   │   │   ├── FileManager.tsx
│   │   │   │   ├── DeviceFileTree.tsx
│   │   │   │   ├── TransferProgress.tsx
│   │   │   │   └── DropZone.tsx
│   │   │   ├── audio/
│   │   │   │   ├── AudioPanel.tsx
│   │   │   │   └── AudioControls.tsx
│   │   │   ├── recording/
│   │   │   │   ├── RecordingPanel.tsx
│   │   │   │   └── RecordingHistory.tsx
│   │   │   ├── settings/
│   │   │   │   ├── SettingsPage.tsx
│   │   │   │   ├── SettingSection.tsx
│   │   │   │   ├── ProfileManager.tsx
│   │   │   │   └── controls/       # Sliders, toggles, selects
│   │   │   ├── guide/
│   │   │   │   ├── GuidePage.tsx
│   │   │   │   ├── GuideArticle.tsx
│   │   │   │   └── articles/       # Markdown guide content
│   │   │   ├── shell/
│   │   │   │   └── AdbShell.tsx
│   │   │   └── common/
│   │   │       ├── Button.tsx
│   │   │       ├── Modal.tsx
│   │   │       ├── Tooltip.tsx
│   │   │       ├── Toast.tsx
│   │   │       ├── Toggle.tsx
│   │   │       ├── Slider.tsx
│   │   │       ├── Select.tsx
│   │   │       └── Badge.tsx
│   │   │
│   │   ├── stores/
│   │   │   ├── useDeviceStore.ts
│   │   │   ├── useMirrorStore.ts
│   │   │   ├── useFileStore.ts
│   │   │   ├── useRecordingStore.ts
│   │   │   ├── useSettingsStore.ts
│   │   │   └── useGuideStore.ts
│   │   │
│   │   ├── hooks/
│   │   │   ├── useIpc.ts           # Type-safe IPC calls
│   │   │   ├── useDevices.ts
│   │   │   ├── useKeyboardShortcuts.ts
│   │   │   └── useTheme.ts
│   │   │
│   │   └── types/
│   │       ├── device.ts
│   │       ├── settings.ts
│   │       ├── ipc-channels.ts
│   │       └── file-transfer.ts
│   │
│   └── shared/                     # Shared types between main/renderer
│       ├── constants.ts
│       └── types.ts
│
├── guides/                         # Guide content (markdown)
│   ├── getting-started.md
│   ├── usb-debugging.md
│   ├── wifi-setup.md
│   ├── file-transfer.md
│   ├── audio-setup.md
│   ├── recording.md
│   ├── keyboard-shortcuts.md
│   ├── troubleshooting.md
│   └── faq.md
│
└── build/                          # Build resources
    ├── icon.ico
    ├── installer-banner.bmp
    └── license.txt
```

---

## 7. Implementation Phases

### Phase 1 — Foundation & Device Management ⏱️ ~3 hours
> **Goal:** Skeleton app with device detection and connection

- [ ] Initialize Electron + React + Vite + TypeScript project
- [ ] Set up custom design system (CSS tokens, global styles)
- [ ] Custom frameless titlebar with window controls
- [ ] Sidebar navigation (icon-only, tooltip labels)
- [ ] Status bar component
- [ ] AdbManager: device polling, USB detection, device info parsing
- [ ] Device list page with device cards (model, serial, battery, status)
- [ ] WiFi connection flow (auto-detect IP, `tcpip`, `connect`)
- [ ] Manual WiFi connect modal
- [ ] Connection status indicators with auto-reconnect
- [ ] Saved devices persistence

### Phase 2 — Screen Mirroring ⏱️ ~2 hours
> **Goal:** Full mirroring with all scrcpy display options

- [ ] ScrcpyManager: spawn scrcpy process with dynamic args
- [ ] Mirror launch button on device card (one-click)
- [ ] Resolution presets UI (dropdown / radio)
- [ ] Bitrate slider
- [ ] FPS selector
- [ ] Video codec selector (h264/h265/av1)
- [ ] Orientation lock toggle
- [ ] Display options: always-on-top, borderless, fullscreen
- [ ] Screen-off mirroring toggle
- [ ] Stay awake toggle
- [ ] Show touches toggle
- [ ] Mirror process health monitoring (auto-restart on crash)
- [ ] Floating toolbar over mirror window

### Phase 3 — Audio Streaming ⏱️ ~1 hour
> **Goal:** Audio forwarding with codec & source controls

- [ ] AudioManager: audio scrcpy flags
- [ ] Audio panel UI
- [ ] Audio codec picker (opus/aac/flac/raw)
- [ ] Audio bitrate slider
- [ ] Audio source selector (output/playback/mic)
- [ ] Audio-only mode toggle
- [ ] Mute/unmute quick button
- [ ] Audio buffer configuration

### Phase 4 — Screen Recording ⏱️ ~1.5 hours
> **Goal:** One-click recording with history management

- [ ] RecordingManager: `--record` flag, file management
- [ ] Record button with timer display
- [ ] Format selector (MP4/MKV/WebM)
- [ ] Output directory picker
- [ ] Auto-naming with device & timestamp
- [ ] Recording history panel with file list
- [ ] Open file / open folder / delete actions
- [ ] No-display recording mode

### Phase 5 — File Transfer ⏱️ ~2.5 hours
> **Goal:** Full file manager with drag-and-drop

- [ ] FileTransferManager: `adb push`, `adb pull`, `adb shell ls`
- [ ] Device file browser (tree view with lazy loading)
- [ ] Quick path shortcuts (DCIM, Downloads, etc.)
- [ ] PC ↔ Device split-pane file manager
- [ ] Drag & drop files from PC → device
- [ ] Drag & drop files from device file list → PC (save dialog)
- [ ] Transfer progress bars with speed indicator
- [ ] Batch multi-file transfer
- [ ] APK drag-to-install
- [ ] One-click screenshot grab to PC
- [ ] Right-click context menu (copy, move, delete, rename)

### Phase 6 — Device Controls & Clipboard ⏱️ ~1 hour
> **Goal:** Quick action buttons and clipboard sync

- [ ] Virtual navigation buttons (Home, Back, Recents)
- [ ] Volume up/down buttons
- [ ] Power button
- [ ] Rotate screen
- [ ] Notification shade toggle
- [ ] Clipboard sync toggle
- [ ] Manual clipboard paste
- [ ] Clipboard history (last 20 entries)
- [ ] Open URL on device
- [ ] ADB Shell terminal (embedded terminal)

### Phase 7 — Settings & Profiles ⏱️ ~1.5 hours
> **Goal:** Deep configuration with savable profiles

- [ ] Settings page with categorized sections
- [ ] Settings search
- [ ] Video settings section
- [ ] Audio settings section
- [ ] Connection settings section
- [ ] Input settings (keyboard/mouse mode)
- [ ] Recording settings
- [ ] Appearance settings (theme)
- [ ] Profile system: create / save / load / delete / rename
- [ ] Per-device auto-profile
- [ ] Startup behavior options (tray, auto-connect, Windows startup)
- [ ] Reset to defaults
- [ ] Export / Import settings

### Phase 8 — In-App Guide ⏱️ ~1 hour
> **Goal:** Rich help system with illustrated walkthroughs

- [ ] Guide page with sidebar article navigation
- [ ] Markdown article renderer
- [ ] Getting Started guide
- [ ] USB Debugging setup guide (with screenshots per Android version)
- [ ] WiFi setup guide
- [ ] File Transfer guide
- [ ] Audio setup guide
- [ ] Recording guide
- [ ] Keyboard shortcuts reference
- [ ] Troubleshooting guide
- [ ] FAQ
- [ ] About / License page
- [ ] Contextual help buttons (? icons throughout app linking to relevant guide)

### Phase 9 — Polish & Packaging ⏱️ ~2 hours
> **Goal:** Production-ready standalone `.exe`

- [ ] Micro-animations: page transitions, hover effects, loading states
- [ ] Toast notification system
- [ ] Error handling & user-friendly error messages
- [ ] System tray integration (minimize to tray, tray menu)
- [ ] Window position/size persistence
- [ ] Keyboard shortcuts for all major actions
- [ ] Performance optimization (lazy loading, virtualized lists)
- [ ] electron-builder config for Windows NSIS installer
- [ ] Bundle scrcpy/adb binaries with app
- [ ] Code-sign (if certificate available)
- [ ] App icon (.ico) from logo
- [ ] Splash screen on first launch
- [ ] Build standalone `.exe` installer

---

## 8. Scrcpy Command Reference

Key scrcpy flags we'll wire up through the UI:

```bash
# Connection
scrcpy --serial=SERIAL          # Target specific device
scrcpy --tcpip=IP:PORT          # WiFi connect

# Video
scrcpy --max-size=1080          # Resolution cap
scrcpy --video-bit-rate=8M      # Video bitrate
scrcpy --max-fps=60             # Frame rate cap
scrcpy --video-codec=h265       # Video codec
scrcpy --video-encoder=NAME     # Specific encoder

# Audio
scrcpy --audio-codec=opus       # Audio codec
scrcpy --audio-bit-rate=128K    # Audio bitrate
scrcpy --audio-source=output    # Audio source
scrcpy --no-audio               # Disable audio
scrcpy --no-video               # Audio-only mode

# Display
scrcpy --fullscreen             # Fullscreen
scrcpy --always-on-top          # Pin on top
scrcpy --window-borderless      # No borders
scrcpy --turn-screen-off        # Mirror with screen off
scrcpy --stay-awake             # Prevent sleep
scrcpy --show-touches           # Show touch indicators
scrcpy --lock-video-orientation=0  # Lock orientation

# Recording
scrcpy --record=file.mp4        # Record to file
scrcpy --record-format=mp4      # Recording format
scrcpy --no-playback --record=f # Record without display

# Input
scrcpy --keyboard=uhid          # Keyboard mode
scrcpy --mouse=uhid             # Mouse mode

# Clipboard
scrcpy --no-clipboard-autosync  # Disable clipboard sync

# Power
scrcpy --power-off-on-close     # Screen off on exit
```

---

## 9. Keyboard Shortcuts (App-Level)

| Action | Shortcut |
|--------|----------|
| Toggle Mirror | `Ctrl + M` |
| Start/Stop Recording | `Ctrl + R` |
| Take Screenshot | `Ctrl + Shift + S` |
| Toggle Audio | `Ctrl + A` |
| Open File Manager | `Ctrl + F` |
| Open Settings | `Ctrl + ,` |
| Open Guide | `F1` |
| Toggle Fullscreen | `F11` |
| Connect WiFi | `Ctrl + W` |
| Minimize to Tray | `Ctrl + H` |

---

## 10. Build & Distribution

### electron-builder Configuration

```yaml
appId: com.streamfusion.app
productName: StreamFusion
copyright: "Copyright © 2026 StreamFusion"

win:
  target:
    - target: nsis
      arch: [x64]
  icon: build/icon.ico

nsis:
  oneClick: false
  perMachine: true
  allowToChangeInstallationDirectory: true
  installerIcon: build/icon.ico
  uninstallerIcon: build/icon.ico
  license: build/license.txt

extraResources:
  - from: scrcpy/
    to: scrcpy/
    filter:
      - "**/*"

files:
  - "dist/**/*"
  - "node_modules/**/*"
  - "package.json"
```

### Output
- `StreamFusion-Setup-1.0.0.exe` — NSIS installer (~30–40 MB)
- Portable `.zip` option available

---

## 11. Success Criteria

- [ ] Connect any Android device via USB in under 5 seconds
- [ ] WiFi mirroring setup in under 30 seconds (one-click from USB)
- [ ] Sub-100ms mirror latency on USB, sub-200ms on WiFi
- [ ] Drag-and-drop file transfer with real-time progress
- [ ] One-click screen recording to local file
- [ ] Audio forwarding with configurable codec
- [ ] All settings persist across app restarts
- [ ] Standalone `.exe` installer under 50 MB
- [ ] Zero-crash stability during normal usage
- [ ] In-app guide covers all features with visual walkthroughs

---

## 12. Dependencies (npm)

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0",
    "lucide-react": "^0.450.0",
    "electron-store": "^10.0.0",
    "react-markdown": "^9.0.0"
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.6.0"
  }
}
```

---

> [!IMPORTANT]
> **Next Step:** Review this plan and confirm to proceed with **Phase 1 — Foundation & Device Management**. All phases will be built incrementally with testing at each stage.
