<div align="center">

<img src="public/logo-mark.png" alt="StreamFusion" width="110" />

# StreamFusion

**Android mirroring, wireless control and AI-driven app + web testing, in one Windows app.**

[![Release](https://img.shields.io/github/v/release/MilannSharma/StreamFusion?style=for-the-badge&color=4f46e5)](https://github.com/MilannSharma/StreamFusion/releases/latest)
[![Platform](https://img.shields.io/badge/Windows-x64-0078D6?style=for-the-badge&logo=windows)](https://github.com/MilannSharma/StreamFusion/releases/latest)
[![Electron](https://img.shields.io/badge/Electron-React%2019%20%2B%20Vite-61DAFB?style=for-the-badge&logo=react)](https://react.dev)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

[Download](https://github.com/MilannSharma/StreamFusion/releases/latest) · [Features](#features) · [AI testing](#ai-testing-and-reports) · [Install](#install) · [Build](#build-from-source)

</div>

---

## What is StreamFusion?

StreamFusion shows your Android phone on your PC with very low lag and lets you control it with mouse and keyboard. It also includes an **Android emulator studio** and an **AI testing assistant** that can test an Android app or a website for you, then write a detailed report.

Everything is bundled in one installer (scrcpy and adb included), so it works on a fresh PC.

## Features

### Mirror and control
- Screen mirroring over **USB or Wi-Fi** (scrcpy based, 60+ FPS, hardware decoding), with audio forwarding on Android 11+.
- **Wi-Fi memory**: connect once with USB, and the phone shows up as online next time without a cable. The phone list loads fast and shows what is cached while it re-checks.
- Virtual navigation bar (Back, Home, Recents, volume, notifications), screenshots, screen recording (MP4/MKV) and a recordings gallery.
- Drag and drop files to the phone, drag an `.apk` to install it, browse phone storage, clipboard sync, virtual screen presets.

### Emulator Studio
- Install and run an Android emulator from inside the app, with auto-repair if the install is missing or corrupt, and silent background updates.
- "Power on and test" in one click.

### AI testing and reports
- **App testing** (Android phone or emulator) and **Web testing** (built-in browser pane), driven by an AI chat.
- Works with the **Claude Code** you already have installed (no API key) or with an Anthropic API key.
- **Chat history**: every chat is saved, searchable, renamable, and an interrupted test can be resumed.
- **Test brief wizard**: project, feature, app or URL, up to three logins (User 1, 2, 3), test cases (paste or drop files), plus PRD and other documents. Pick files you saved earlier in the project.
- **Projects**: each project keeps a context file (who uses the product, pages covered, known issues, what is still untested) that updates after every run and is sent to the AI with the next test.
- **Fewer calls, lower cost**: batched test steps, compact screen trees, and rules that aim for about 3 tool calls per test case.
- The phone screen appears inside the chat with a Refresh button and a loading state.
- Built-in guide: a **?** button that walks you to the real buttons.
- Also available as an **MCP server**, so other AI tools can drive StreamFusion.

#### What a report contains
Branded PDF and DOCX, saved automatically to `Downloads\StreamFusion Reports`:
1. Result at a glance (verdict, pass rate, defects by severity, time)
2. Summary and the most important findings
3. The application under test (project, feature, app or URL, device, roles, documents) and the brief
4. Results by feature and by type of check
5. Defects with the exact page and button, expected vs actual
6. Test case list
7. Per test case: description, steps performed, issues while performing, expected, result with remark, how to fix, and a screenshot tagged with the case code
8. Coverage: what was tested and what was not
9. Suggestions (enhancement, performance, UX, accessibility, security), risks and next steps

## Install

1. Download `StreamFusion-v<version>-Setup.exe` from [Releases](https://github.com/MilannSharma/StreamFusion/releases/latest).
2. Run it. Shortcuts are created on the Desktop and Start menu, and the app updates itself later.
3. Enable **USB debugging** on your phone (Settings > About phone > tap Build number 7 times > Developer options > USB debugging), plug it in and allow the prompt.
4. Open StreamFusion and click **Mirror**.

For AI testing: install [Claude Code](https://claude.com/claude-code) and sign in from the AI Agent panel, or paste an Anthropic API key in its settings.

## Keyboard and mouse shortcuts

| Action | Shortcut |
| :--- | :--- |
| Wake phone | Double click, or `Alt` + `P` |
| Fullscreen | `Alt` + `F` |
| Back | `Alt` + `B` or right click |
| Home | `Alt` + `H` or middle click |
| Recents | `Alt` + `S` |
| Phone screen off / on | `Alt` + `O` / `Alt` + `Shift` + `O` |
| Volume | `Alt` + `Up` / `Down` |
| Notifications / quick settings | `Alt` + `N` / `Alt` + `Shift` + `N` |
| Copy phone clipboard | `Alt` + `C` |
| Paste to phone | `Ctrl` + `V` |

## Build from source

```bash
git clone https://github.com/MilannSharma/StreamFusion.git
cd StreamFusion
npm install
npm run dev          # server + Vite + Electron
npm test             # unit tests
npm run build:exe    # type-check, tests, then the Windows installer in release/
```

## Project layout

```
electron/    main process and preload
server/      Express backend: device, emulator, web, agent (chat, batch, prompts),
             automation, test reports, projects, MCP server
src/         React 19 UI (Emulator Studio, AI chat, test brief, guide)
public/      icons, fonts, animations
scrcpy-bin/  bundled scrcpy and adb
scripts/     dev and version helper scripts
```

## Credits and license

Developed by [Milann Sharma](https://github.com/MilannSharma). Built on [scrcpy](https://github.com/Genymobile/scrcpy) (Genymobile) and Android Debug Bridge (AOSP). MIT License, see [LICENSE](LICENSE).
