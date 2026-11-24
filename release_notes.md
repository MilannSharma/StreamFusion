# StreamFusion v3.3.4

## Reports
- Every case now has its own real screenshots (2-3) taken while the test ran, never a wrong or late one.
- New sections: Crashes and ANRs, Performance, Re-renders and smoothness, UI and UX, Accessibility.
- App and Web are separate parts of one report. The Web part also appears when the browser ran in the background during an app test.
- The action-log appendix is removed.
- New "Detection coverage" section: says clearly what the automatic checks could not see, and why.

## Problems found from the app itself (no test case needed)
- App log: server errors, network failures, JS errors, skipped frames, out-of-memory, permission problems.
- APK scan: servers the app talks to, hardcoded secrets (masked), plain-http use, risky settings, sensitive permissions, server reachability and certificate expiry.
- API traffic watch: 4xx/5xx, slow or huge calls, repeated-call loops. Names only, never the contents. If the app refuses the proxy (certificate pinning) the traffic passes untouched, and the phone's proxy is always removed afterwards.
- Real phones: API watching is off by default; turn it on in the test brief (same Wi-Fi needed).
- A check that fails or hangs never breaks the test; it is listed in the coverage section.
