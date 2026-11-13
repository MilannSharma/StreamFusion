# StreamFusion — FINAL optimisation plan (before the next EXE)

Goal: a smaller, faster, safer installer where every tool works on a clean PC. Work in the order of the phases at the bottom.
Measured baseline (v3.1.2): installer 92.7 MB · one 1.21 MB JS bundle · `App.tsx` 2 982 lines · `server/index.js` 923 lines · `asar: false` · AI tool definitions ~2.4 k tokens (phone) / ~1.8 k tokens (web) per request.

## A. Audit of what exists (tested on a real phone, Android 16, USB)

| Area | Result | Status |
|---|---|---|
| Screen Mirror: normal, HD Webcam, Virtual Display | Start, status and stop all work | OK |
| Recording (config `recordSession`) | MP4 written to `Videos\StreamFusion`, listed in My Recordings | OK |
| Screenshot (`/api/control/screenshot`), wake, clipboard, terminal, display info, saved-device list | Work | OK |
| Status bar action | Works but leaves the shade open; add a collapse action | To do |
| **Fix Connection** (`/api/adb/restart`) | Answered before the USB phone re-registered, so the phone looked gone for ~10 s and mirrors failed | **Fixed**: waits until a device is back and reports the count |
| App list | Every label was "Android" / package tail | **Fixed**: readable names (known apps + smart fallback) |
| **Notifications** | Watched only by the open page (throttled or stopped when hidden), flooded old alerts on start, showed "USB debugging on / Charging" noise, no alerts after quitting | **Fixed** (see B) |
| `GET /api/wifi/saved` | 404 (only DELETE exists) | To do (add list route or remove the call) |
| Emulator tools (28 device tools) | Work; 3 s `screencap` per AI screenshot on this phone | See D |
| Web tools (22) | Own Chrome, tabs, asserts work | See D |
| Wi-Fi mirror / pairing | Not re-tested in this audit (needs a Wi-Fi phone) | To test |

## B. Notifications when the app is closed (done)

- The **server** now watches the phone (adb, every 4 s) and keeps a queue; ongoing, foreground-service, group-summary and system notifications are dropped; the first scan only records what is already there; the same notification alerts at most every 30 s.
- The **Electron main process** polls the queue and shows **native Windows notifications** (click opens the app). The main process is not throttled while the window is hidden in the tray.
- Window closed = app stays in the tray (setting already existed). New setting **Start with Windows (hidden in tray)** so alerts also arrive after a restart. Quit from the tray stops alerts by design.
- Windows gets an `AppUserModelID`, so toasts show under "StreamFusion".
- Still to do: per-app mute list, "reply / open on phone" actions, Wi-Fi phones when the server restarts, test the packaged EXE with the window closed and with autostart.

## C. Before building (must do)

1. Version bump to 3.2.0 (`package.json`, About, tray tooltip now follows the version).
2. Clean Windows VM run: install, first-run guide, USB phone, mirror, emulator page, web test (Chrome auto-download), projects, test mode report, save as automated test, replay with 0 tokens, notification alert with the window closed.
3. Packaged paths: server and the MCP script inside the install folder; "Add to Claude Code" works from the installed app.
4. Build excludes: `!server/**/*.test.mjs`, `!scripts/**`, notes (`*.md`) not needed at runtime.
5. CLI in the packaged app (`StreamFusion.exe --cli …` using `ELECTRON_RUN_AS_NODE`) or document that CI uses the repo.
6. Secrets audit of source and `release/`; the API key pasted earlier in chat must be rotated.
7. Server never dies from one bad adb call: `unhandledRejection` handler that logs only.
8. `prebuild` script runs `tsc --noEmit` and `npm test`.

## D. Tool optimisation (emulator, phone, web, mirror)

**Speed**
- AI `screenshot` takes ~3 s (raw `screencap` over USB). Take the frame from the live H.264 stream when it is running, otherwise `screencap -p` on the device; cache a frame for 300 ms.
- `ui_tree`: cache 500 ms; skip a second dump when the screen did not change.
- Reuse one `screenrecord` stream for several viewers, stop it when the window is minimised or the page is hidden, lower bitrate on Wi-Fi.
- Replay: no retry wait when the error is deterministic (bad selector); reuse the same browser page.
- Pollers pause when hidden: `/api/devices` (4 s), web status (2.5 s), MCP status.

**Tokens**
- Tool definitions are 4.2 k tokens per request (phone + web would be sent together by an external MCP client). Shorten descriptions, drop rarely used tools from the default set (`shell`, `set_battery`, `set_network`, `rotate` behind an "advanced" switch), and put `cache_control` on the tools block.
- Default to Sonnet for execution; Opus only for planning/triage ("Auto" escalates on failure).
- JPEG screenshots to the AI (PNG stays for reports); smaller `maxDim` (540–700).
- MCP tool `automation_run` so Claude Code replays saved tests instead of redoing them.
- Show token use for the Claude Code engine like the API engine.

**Correctness**
- Status bar collapse; `wifi/saved` route; Wi-Fi and pairing tests; WebView CDP; multi-device selection in every tool (`serial` is required but some UI paths still default to the emulator).
- Emulator: confirm graceful stop on Quit, snapshot boot time, one-click "Install APK" for the real phone as well (today only the emulator).

## E. App size and startup

- `asar: true` with unpacked `scrcpy-bin`, Playwright driver and native files (faster install and start).
- Split the JS bundle: lazy pages (`ProjectsPage`, `WebStudio`, `EmulatorStudio`, Settings sections), manual chunks for icons and avatar; target first paint JS −40–60 %.
- Check tree-shaking (`lucide-react` named imports), run a bundle analyzer once, `depcheck` for unused packages.
- Resize `StreamFusion.png` (350 KB) to WebP.
- Load `playwright-core`, `docx`, `pdfkit` only on first use (dynamic import) so the server boots faster and idles smaller.
- Report builder: embed 900 px JPEG evidence (PNG stays on disk) to shrink PDF/DOCX.

## F. Code health

- Split `App.tsx` into page files and small hooks; split `server/index.js` into `mirror/`, `recordings/`, `wifi/` routers.
- Tests to add: runner failure paths, project store, `extract.js`, notification parser (a sample of real `dumpsys` output), friendly app names.
- `.gitattributes` (`* text=auto`) to stop LF/CRLF warnings.

## G. UI polish

- One design language everywhere: neutral surfaces, one accent, system font, hairline borders. Done: test form. Next: AI toolbar, Projects detail, Settings, Mirror page.
- Plain-word errors with one next action; empty states.
- Check Windows scaling 100/125/150 % and 1366×768. Zoom is locked at 100 %.

## Release checklist

1. `git status` clean, version bumped, notes written.
2. `npx tsc --noEmit -p .` and `npm test` pass.
3. `npm run build:exe`; compare size with 92.7 MB.
4. Clean-VM test (list in C.2).
5. Update check works; uninstall leaves no processes (adb, scrcpy, screenrecord, Chrome child).
6. Sign the installer if a certificate exists; publish.

## Order of work

1. **Done now:** notifications in background, app names, Fix Connection wait.
2. **Phase 1 (correctness):** status bar collapse, `wifi/saved`, Wi-Fi/pairing tests, C.7, C.8.
3. **Phase 2 (speed and tokens):** D (screenshot speed, tool-definition trimming, prompt cache, Sonnet default, JPEG).
4. **Phase 3 (size):** E (asar, lazy pages, dynamic imports).
5. **Phase 4:** C (version, packaged paths, clean-VM test) → build → ship. F and G can follow the release.
