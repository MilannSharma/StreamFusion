# Contributing to StreamFusion

Thanks for helping! Bug reports, ideas, docs and code are all welcome.

## Ways to help
- **Report a bug** with the [bug template](https://github.com/MilannSharma/StreamFusion/issues/new?template=bug_report.md). Include your Windows version, phone model and Android version, and what you expected.
- **Suggest a feature** with the [feature template](https://github.com/MilannSharma/StreamFusion/issues/new?template=feature_request.md). Explain the problem it solves, not only the idea.
- **Fix something**: look for issues labelled `good first issue` or `help wanted`.

## Set up
Requirements: Windows 10/11, Node.js 20+, Git.

```bash
git clone https://github.com/<your-fork>/StreamFusion.git
cd StreamFusion
npm install
npm run dev        # server + Vite + Electron
npm test           # unit tests
npx tsc --noEmit -p .   # type-check
```

If port 3001 is busy (for example the installed app is running), use `npm run dev:force`.

## Pull requests
1. Fork, then branch from `main` (`fix/short-name` or `feat/short-name`).
2. Keep the change focused: one fix or feature per pull request.
3. Make sure `npm test` and the type-check pass.
4. For UI changes add a screenshot or a short clip to the pull request.
5. Explain **what** changed and **why**.

## Code guidelines
- UI: React 19 + TypeScript. Keep screens compact and avoid long scrolling.
- Windows: every background `execFile` / `spawn` / `exec` must pass `windowsHide: true`, or a console window flashes on screen.
- Keep user-facing text short, plain and friendly. No jargon.
- Do not add a dependency unless the feature truly needs it.
- Never commit secrets, API keys or personal data (saved phones, logins, reports).

## Commit messages
Short and clear: `fix: ...`, `feat: ...`, `docs: ...`, `chore: ...`.

## License
By contributing you agree that your work is released under the [MIT License](LICENSE).
