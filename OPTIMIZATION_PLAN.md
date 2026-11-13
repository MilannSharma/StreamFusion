# StreamFusion — Optimisation plan before the next EXE

Goal: a smaller, faster, safer installer that works on a clean PC. Do the items in order; each has a way to check it.
Baseline today (v3.1.2): installer 92 MB, `dist` JS bundle 1.21 MB in one chunk, `server/index.js` 923 lines, `App.tsx` 2 982 lines, `asar: false`, version still 3.1.2.

## P0 — Must be done before building (correctness and safety)

| # | What | Why | Check |
|---|---|---|---|
| 1 | **Version bump** to 3.2.0 in `package.json` (`productName`, `artifactName` follow) and the About page | Many features added since 3.1.2 (AI engine, projects, M5, live screen) | About shows 3.2.0; installer name matches |
| 2 | **Clean-PC run**: install the EXE on a PC/VM without Node, Chrome extras, Claude Code | The app must work when none of the dev tools exist | Open each page; Web testing shows "install/auto-download Chrome"; AI card shows "Install Claude" |
| 3 | **Packaged server entry**: confirm `server/**` runs from the packaged path (not `z:\…`) and the MCP script path in "Add to Claude Code" points inside the install folder | Paths were only tested from source | One-click "Add to Claude Code" then `claude mcp list` works from the installed app |
| 4 | **Exclude test/dev files** from the build: add `!server/**/*.test.mjs`, `!scripts/**`, `!**/*.md` (except what is shown in-app) | Do not ship tests/notes | Unpack and look |
| 5 | **CLI in the packaged app**: `npm run sf:run` needs Node. Decide: ship `StreamFusion.exe --cli …` (runs `ELECTRON_RUN_AS_NODE`) or document "CI uses the repo" | CI users will not have the repo | `StreamFusion.exe --cli --file t.yaml` returns exit code 0/1 |
| 6 | **Secrets audit**: grep the whole tree and `release/` for API keys, tokens, `.env`, saved logins | An API key was pasted earlier in chat; rotate it | No hits; user rotates the key |
| 7 | **Crash safety**: unhandled promise rejections in `server/index.js` and each router must not kill the server (add `process.on('unhandledRejection')` log-only) | One bad adb call should not drop the AI session | Kill adb mid-run: server stays up |

## P1 — Size and startup

| # | What | Expected gain | How |
|---|---|---|---|
| 8 | **Enable `asar: true`** with `asarUnpack` for `scrcpy-bin` (already `extraResources`), `playwright-core` driver, native files | Faster install and start (thousands of small files become one), smaller disk use | Build; start app; Web testing and mirror still work |
| 9 | **Split the 1.2 MB JS bundle**: lazy-load pages (`ProjectsPage`, `WebStudio`, `EmulatorStudio`, Settings sections) with `React.lazy`; manual chunks for `lucide-react`, avatar, lottie | First paint about 40–60% less JS | `vite build` sizes; startup time measured with `performance.now()` log |
| 10 | **`lucide-react` imports**: confirm named imports only (tree-shaking), no `import *` | Smaller bundle | Bundle analyzer (`rollup-plugin-visualizer`) once |
| 11 | **Drop unused deps**: `@anthropic-ai/sdk` is only used by the API engine (keep), check `lottie-web` and `electron-updater` really used; move runtime-only libs from `devDependencies` to `dependencies` if the packaged app needs them (`react` etc. are bundled by Vite, fine) | Smaller `node_modules` in package | `depcheck` |
| 12 | **Image**: `StreamFusion.png` is 350 KB inside `dist`; convert to WebP/resize (the UI shows it tiny) | −300 KB | Visual check |
| 13 | **Compression**: NSIS `compression: maximum` is already likely default; try `7z` solid (`"compression": "maximum"`) and compare | Maybe −5–8 MB | Compare installer sizes |
| 14 | **Lazy server modules**: load Playwright (`playwright-core`), `docx`, `pdfkit` only on first use (dynamic `import()`); today they load at boot | Server boot faster, lower idle RAM | Measure `node server/index.js` time-to-listen |
| 15 | **Idle RAM / CPU**: the app should do nothing when no page needs it — check pollers (`/api/devices` every 4 s on Emulator page, MCP status, web status 2.5 s). Pause when the tab/window is hidden (`document.visibilityState`) and when the page is not active | Lower battery and CPU | Task Manager while idle in tray |

## P2 — Runtime performance

| # | What | Why | Check |
|---|---|---|---|
| 16 | **AI screenshots 3 s on some phones** (`screencap` over USB). Options: take a frame from the live H.264 stream for `screenshot` tool, or use `screencap -p` on device when it is faster; cache the last frame for 300 ms | The agent waits 3 s per look; faster tests, fewer tokens | Time `screenshot` tool before/after |
| 17 | **Live stream polish**: auto-quality (4 → 2 Mbps on Wi-Fi), stop the stream when the app window is minimised, reuse one `screenrecord` for several viewers | Lower USB/Wi-Fi load, battery | Wi-Fi device test |
| 18 | **`ui_tree` cost**: cache for 500 ms and diff; many AI steps call it back to back | Faster steps | Step timing |
| 19 | **Replay speed**: reuse one browser page, skip the per-step 1.2 s retry wait when the tool error is deterministic (selector syntax) | Quicker CI runs | Run the sample test: seconds per step |
| 20 | **Report builder**: stream PDF/DOCX, downscale evidence screenshots to 900 px JPEG at build time (PNG kept on disk) | Smaller reports (today every shot is a full PNG) | Report size before/after |

## P3 — Token and cost optimisation (AI)

| # | What | Status |
|---|---|---|
| 21 | Zero-token replay of recorded tests | Done (M5) |
| 22 | Assert tools + text snapshot first, screenshots only when needed (prompt rule) | Done |
| 23 | Keep only 1 image in history, shorter tool results | Done |
| 24 | **Default model**: Sonnet for execution, Opus only for planning/triage; add "Auto" that picks Sonnet and escalates on failure | To do |
| 25 | **Prompt caching** on tools block as well (`cache_control` on the last tool) | To do |
| 26 | **JPEG screenshots to the AI** (needs an image encoder; try `sharp` or a tiny JPEG encoder; PNG kept for reports) | To do — about 3–5× fewer image tokens |
| 27 | **MCP `automation_run` tool** so Claude Code replays saved tests instead of redoing them with AI | To do |
| 28 | Token meter in the UI for the Claude Code engine (it reports usage; show it like the API engine) | To do |

## P4 — Code health (so the next features are cheaper)

| # | What | Why |
|---|---|---|
| 29 | Split `App.tsx` (2 982 lines) into page files: `Devices`, `Mirror`, `Settings`, `About`; keep state in small hooks | Faster HMR, easier changes, smaller risk |
| 30 | Split `server/index.js` (923 lines): `mirror/`, `recordings/`, `wifi/` routers like the newer modules | Same |
| 31 | Run `tsc --noEmit` and `npm test` in a `prebuild` script so a broken build never ships | Safety |
| 32 | Add tests: format parser (done), recorder redaction (done), plus runner failure paths, project store, `extract.js` (.docx) | Regression safety |
| 33 | Windows line endings: add `.gitattributes` (`* text=auto`) to stop the LF/CRLF warnings | Clean diffs |

## P5 — UX polish before release

- One design language: neutral surfaces, one accent, system font, no heavy borders. The Test form is done; apply the same to the AI toolbar, Projects detail, Settings.
- Empty states and errors in plain words (no jargon), one next action each.
- Check 100%, 125%, 150% Windows scaling and small laptops (1366×768). Zoom is locked at 100%.
- First-run: guide only once, skip = never again (done); verify after clean install.

## Release checklist (run in this order)

1. `git status` clean, version bumped, changelog written.
2. `npx tsc --noEmit -p .` and `npm test` pass.
3. `npm run build:exe`, note installer size and compare with 92.7 MB.
4. Install on a clean Windows VM: install → first run guide → connect phone (USB) → Screen Mirror → Emulator page → Web test (Chrome auto-download) → Projects → Test mode with a tiny test → report PDF/DOCX → Save as automated test → run it with 0 tokens.
5. Update check works (`electron-updater` against the GitHub release), uninstall leaves no processes (adb, scrcpy, screenrecord, Chrome child).
6. Sign the installer if a certificate exists (SmartScreen warning otherwise) and publish the release.

## Suggested order of work

`P0 (1–7)` → `P1 (8, 9, 14, 15)` → `P2 (16, 20)` → `P3 (24–26)` → build + clean-PC test → ship. P4 can follow the release.
