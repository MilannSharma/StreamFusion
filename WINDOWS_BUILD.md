# Windows Build & Packaging

## Build Command

```bash
npm run pack
```

This command:
1. Builds the React frontend → `dist/`
2. Compiles Electron backend (TypeScript) → `dist-electron/`
3. Bundles tools/ folder with scrcpy + adb → `dist-app/resources/tools/`
4. Creates Windows NSIS installer → `dist-app/Streamfusion Setup 1.0.0.exe`

## Output

- **Installer**: `dist-app/Streamfusion Setup 1.0.0.exe`
- **Unpacked App**: `dist-app/win-unpacked/`
- **Bundled Tools**: `dist-app/win-unpacked/resources/tools/scrcpy-win64-v3.3.3/`
  - `adb.exe`
  - `scrcpy.exe`

## Installation

Users can run the `.exe` on a fresh Windows PC with no dependencies:
- No Node.js required
- No adb required (bundled)
- No scrcpy required (bundled)

## Production Paths

In `electron/main.ts`:
- `getToolsPath()` returns `process.resourcesPath/tools` when packaged
- `getScrcpyDir()` returns `getToolsPath()/scrcpy-win64-v3.3.3`

All binary paths automatically resolve to bundled versions in production.

## Configuration

See `package.json` `build` field for:
- NSIS installer settings
- Included files and resources
- Application metadata
