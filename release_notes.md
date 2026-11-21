# StreamFusion v3.3.3

## Testing
- Live, plain-language steps in the chat ("Opening the site", "Typing into password", "Checking the result") instead of "Working...".
- A browser step that never answers no longer freezes the test (75 s limit, then it reconnects).
- The hidden background browser is closed after an app test.
- A missing website URL or login no longer stops the test: only those cases are marked blocked, all other cases still run, and you are asked once at the end.
- Counter reads "3/7 done - testing case 4".

## Reports
- File name: `Project - Module (date time)`, in Downloads and in the Save dialog.
- Every case shows whether it ran on the App, the Browser or both, and gets the screenshot of the right side.
- New section "Earlier issues": bugs from earlier runs of the project, shown as fixed, still failing or not re-tested. The AI now re-tests open issues of the same feature as REG cases.

## History
- Chat history shows only the chats of the current project.

## Fixes
- "setWebBackground is not defined" error when starting an app test.
