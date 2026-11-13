# StreamFusion — Emulator + AI + Chromium Automation Plan

**Goal:** Ek lightweight Android emulator integrate karna jise Claude (ya koi bhi AI) API/MCP ke through 100% control kar sake (click, type, swipe, install, logs). App testing automate ho. Saath mein Chromium bhi ho taaki browser-based AI web testing ho sake.

---

## 1. Known Issues (fix later)

| # | Issue | Location |
|---|---|---|
| 1 | Emulator install fake hai: `/install` sirf `setTimeout` se progress dikhata hai, kuch download nahi hota | `server/routes/emulator.js:318` |
| 2 | `StreamFusionEmulator.exe` / `StreamFusionEngine.exe` sirf 558KB ke stubs hain, asli emulator nahi. `soul-android-emulator-main.zip` ka source unclear | `emulator-bin/` |
| 3 | `.gitignore` mein `*.exe` hai, emulator-bin git mein nahi jayega. Packaging mein `extraResources` chahiye | `.gitignore`, `package.json` |
| 4 | Bahut saare uncommitted changes (9 files, +819 lines) + untracked emulator code | git |
| 5 | Version mismatch: package.json 3.1.2 vs Plan.md v3.2.x. Plan.md 779 lines | `Plan.md` |
| 6 | `server/index.js` (887 lines) aur `App.tsx` bahut bade, split karna chahiye | server, src |
| 7 | Heavy folders: `release` 530MB, `latest app` 177MB | root |
| 8 | CRLF/LF warnings, `.gitattributes` missing | repo |
| 9 | Emulator route mein `/tap`, `/screenshot`, `/input` jaise AI-control endpoints nahi hain | `emulator.js` |

---

## 2. Emulator Choice

**Recommended:** Google Android Emulator (QEMU-based) + system image `google_apis x86_64 API 34`.
- On-demand download (~1.5GB), installer chhota rehta hai
- WHPX/HAXM acceleration, headless mode (`-no-window -gpu swiftshader_indirect`)
- ADB native, quick-boot snapshots

**Alternative:** BlissOS / Android-x86 on QEMU: halka, par kam stable.

---

## 3. Modules

### M0: Cleanup (~½ din)
- [x] Current changes commit karo
- [x] `.gitattributes` add karo
- [x] Fake install hatao (/install ab 501 deta hai, real installer M1 mein)
- [x] Emulator router ko `server/emulator/` mein split karo (router.js + helpers.js)
- [x] `.gitignore` fix (emulator-bin ignored, extraResources local build ke liye as-is)

### M1: Emulator Manager (real install)
- [x] Download `cmdline-tools`, `emulator`, `platform-tools`, system image (progress + resume)
- [x] Hardware check (virtualization/WHPX) + enable guide
- [x] AVD create (2GB RAM, 4 cores, quick-boot snapshot)
- [x] Endpoints: start, stop, reset, snapshot save/load
- [x] `EmulatorStudioModal` ko real backend se jodo

### M2: Device Control Layer (AI ko 100% access)
ADB based, real device aur emulator dono pe kaam karega.
- [x] `tap`, `swipe`, `long_press`, `type_text`, `key` (back/home/enter)
- [x] `screenshot` (downscaled) + `ui_tree` (uiautomator dump, compact JSON). Text-first, screenshot sirf zarurat pe
- [x] `install_apk`, `launch`, `clear_data`, `permissions`, `logcat`, `shell`
- [x] GPS / network / battery mock, rotate, file push/pull  (25 tools: `server/device/tools.js`, REST `GET /api/device/tools`, `POST /api/device/tool/:name`)

### M3: AI Connection Layer
Dono tarike chalenge, user jo chahe chune. Dono ek hi tool layer (M2) use karte hain.

**A. Built-in Chat Agent (app ke andar)**
- [x] Emulator Studio split layout: **left = chat/agent panel, right = live phone screen** (scrcpy). Tabs: Chat | Steps log | Test cases | Reports
- [x] Chat mein user instruction de, agent loop chalta hai: observe -> think -> act -> verify. Har step ek card (action, result, pass/fail)
- [x] Stop button, manual click on phone screen (user bhi control kar sake), agent ke tap ka marker (phone = polled screenshots ~1/sec; scrcpy live video baad mein)
- [ ] APK chat mein drop karke "isse test karo" support
- [x] Permission mode: "har action puchho" / "auto chalne do"
- [ ] Provider dropdown: abhi sirf Claude (Opus/Sonnet/Haiku 5.5). OpenAI, Gemini, OpenRouter, Ollama baad mein
- [x] Login = **API key**: Settings mein paste, Electron `safeStorage` mein encrypted. (Claude.ai subscription login third-party apps ke liye allowed nahi hai: build karne se pehle current Anthropic policy dobara check karni hai)
- [ ] Token saving: DONE = purane screenshots history se hatte hain (sirf 2 latest), system+tools cached, 40 step limit. BAAKI = UI tree diffs

**B. MCP Server (bahar ke AI ke liye)**
- [x] `streamfusion-mcp` jo M2 tools expose kare (Claude Code, Claude Desktop, Cursor, koi bhi MCP client) (`server/mcp/streamfusion-mcp.mjs`, stdio, 28 tools)
- [ ] Login user ke apne AI client ka rehta hai (e.g. Claude Code subscription), StreamFusion ko key nahi chahiye
- [x] Settings mein "Connect AI" button: MCP config ek click mein copy
- [ ] Same approval rules MCP pe (abhi MCP client ka apna permission prompt hi chalta hai) (M7)

**C. Baad mein (policy confirm hone par)**
- [ ] Chat box peeche `claude` CLI headless chalaye (user already logged in), sirf tab jab policy allow kare

### M4: Chromium Web Testing
- [x] Playwright Chromium, alag persistent profile (`web-profile`), on-demand install button (not bundled), browser path `%LOCALAPPDATA%\StreamFusion\browsers`
- [x] 16 tools (`web_*`): navigate, snapshot (a11y tree), screenshot, click, fill, press, select, wait, text, console, network, cookies, tabs, emulate (mobile presets), eval (dangerous), close. Agent + REST (`/api/web`) + MCP teeno use karte hain
- [x] Test mode report ka screenshot web ya phone, jo last use hua
- [x] Emulator ke andar Chrome/WebView: `web_attach_android` (adb forward + CDP). Chrome pehle ek baar khol ke welcome screen skip karna padta hai; WebView sirf debuggable apps mein
- [x] Web tab: live browser preview (click/scroll/type, URL bar, device emulation, Emulator Chrome button), chat hide/show

### Test Mode (M5/M6 ka pehla hissa)
- [x] Toggle in AI Agent: user test cases chat mein likhe ya files attach kare (.txt/.md/.csv/.json/.yaml)
- [x] AI har test case ke baad `report_check` (pass/fail/blocked + evidence), screenshot auto-attach; end pe `finish_report`
- [x] PDF + DOCX report (summary, results table, evidence screenshots, action log), reports list + download
- [ ] Video (screenrecord), flaky detection, AI bug summary, history dashboard

### M5: Test Automation Engine
- [ ] Test cases YAML/JSON mein (plain-English steps support)
- [ ] AI ke steps record karo aur bina AI ke replay (zero token cost)
- [ ] Assertions: text visible, screenshot compare, crash/ANR detect (logcat)
- [ ] Multi-device parallel run, CLI mode for CI

### M6: Reports & Dashboard
- [ ] Har run ka video (`screenrecord`), step screenshots, logs, HTML report
- [ ] Pass/fail history, flaky test detection
- [ ] AI-generated bug summary

### M7: Safety & Permissions
- [ ] Har tool call ka audit log
- [ ] Dangerous actions (uninstall, shell, reset) pe approval
- [ ] App allowlist + kill-switch
- [ ] API keys Electron `safeStorage` mein

### M8: Extras
- [ ] Self-healing selectors
- [ ] Natural language se test generation, AI-guided app exploration
- [ ] Accessibility + performance checks (FPS, memory)
- [ ] Record-my-actions → test
- [ ] Network throttling + proxy (mitmproxy)

---

## 4. Build Order

`M0 → M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8`

Sabse zyada value **M2 + M3** mein hai (yahan se Claude emulator control karne lagta hai). Tokens kam hon to M0–M3 pehle.

## 5. Decisions

- Emulator: **Google Android Emulator** (final). Installer ke saath nahi jata, user Install button dabaye tab download hota hai (~5.4GB disk: system image 4.2GB, emulator 1.1GB, Java 126MB). Install button ke paas ye size dikhana hai.
- AI connection: **dono** (built-in chat + MCP server), user jo theek lage.
