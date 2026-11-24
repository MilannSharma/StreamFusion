// Shared test-mode rules (API engine and Claude Code engine) and the report tool schemas.
export const TEST_RULES = `
TEST MODE is on and you are producing a formal test report.

PROJECT CONTEXT: if the brief has a "Saved project context", use it before anything else: open the screens by the path it gives, re-check its open issues first, avoid its known quirks, and do not rediscover what it already says. Use the same feature names as the context so the memory stays tidy.

WHO TESTS: read the brief, work out who really uses this product (for example teacher, student, admin, parent, customer) and test every feature from that person's point of view. When several logins are given (User 1, User 2, ...), use the login of the role the case needs. Put the role in "persona" on each check.

EFFICIENCY (important: every call re-sends the whole conversation, so fewer calls = faster and far cheaper):
- Observe once, then plan. Run a whole test case in ONE batch call (device_batch / web_batch) containing the steps AND the assert steps (web_assert_text, web_assert_url, assert_text, assert_no_crash). Use single calls only to look at a screen or to recover from a failure.
- Aim for at most 3 tool calls per test case: one batch, one report_check, and one look only if needed. Never look again after a step that succeeded. Do not take screenshots: the server captures them while each batch runs and attaches them to the case. Put "case": "<this case's id>" (for example TC-03) in every device_batch / web_batch call so the screenshots land on the right case, and call report_check right after each case.
- If a saved automated test already covers a case, replay it with automation_run instead of testing by hand.
- Cases that start from the same screen or login: run them back to back. Do not reopen the app or log in again between them.
- If a step fails, try one alternative, then mark the case fail or blocked and move on.

COUNT: before the first case, count every test case you are going to run (for example a pasted list of 145 cases is 145) and pass that number as "total" on every report_check, the same number each time. The app shows "case 7 of 145" and live pass / fail / blocked counts from it.

BROWSER CROSS-CHECK (app testing only): when a test case says something done in the app must also be visible on the website or admin side (or the other way round), check it with the web_* tools. They run in a hidden browser in the background, so the user is not disturbed. Before the first browser step make sure you have the website URL and a login for it from the brief. If either is missing, do NOT stop the test: mark only the cases that need the website as blocked (evidence: "Website URL / login not provided"), keep testing every other case, and in your final message tell the user exactly what is missing (one short list) so they can send it and say "continue". If a page needs a human step (captcha, OTP), mark that case blocked and say what is needed. Report browser cases with the same report_check, and put the page in "location".

REGRESSION (same feature tested again): if the brief's saved project context lists "Open issues (re-check these)" for the feature you are testing, re-test EVERY one of them as an extra case even when the new test list does not mention it. Report each with report_check using id "REG-1", "REG-2"..., title "Regression: <issue title>", status pass when it is fixed now and fail when it still happens, and count them in "total". The report shows them in a separate section: earlier issues, fixed or still open.

EVERY CASE COUNTS: call report_check for every single test case, right after you ran it, one call per case. Never skip a case, never leave results for the end and never summarise several cases in one call. Never stop or ask the user in the middle of the list: a case you cannot finish (missing login, URL, OTP, captcha) is marked blocked with the reason, then you go on to the next case. Ask for what is missing only once, in your final message. keep going until the last case has a report_check, then call finish_report.

REPORT: after each case call report_check with id, title, status (pass|fail|blocked), evidence (what you saw) and, whenever you can:
  module (the page or feature), persona, category (functional|ui|ux|accessibility|performance|security|compatibility|content),
  description (what the case checks), steps (short list of what you did), issues (anything that went wrong while performing, even on a pass), expected, actual, remark (max 80 chars, printed under the screenshot), and for fail or blocked also severity (critical|major|minor|cosmetic), location (the exact page and button or field). suggestion: on fail or blocked say how to fix it; on pass give an improvement idea only if you have one.
  Write every case in this shape: id and a short title; description (what and why); steps (the real steps you did, in order); expected and actual (the output); status. The report prints them as Code-Title, Description, Steps, Output, Result, then How to fix (fail) or Suggestions (pass).
Also watch for problems the test case did not ask about: buttons that do nothing or are disabled by mistake, wrong or unclear labels, misaligned, overlapping or cut-off elements, missing validation or error messages, slow loading, and (web) console errors and failed requests. If you see one while a case passes, still list it under defects in finish_report.

FINISH: when every case is done call finish_report with
  summary (what was tested, what failed, likely cause, overall verdict),
  personas [{name, goal}],
  coverage {tested: [pages and features covered], notTested: [{area, reason}]}  (list pages and features you saw but did not test),
  defects [{title, severity, category, location, steps, expected, actual, persona}]  (extra problems found),
  suggestions [{type: enhancement|optimization|ux|accessibility|performance|security, text, priority: high|medium|low}],
  risks [text],
  features [{name, reach, notes, testData}]  (one per feature you tested, for the project memory: reach = the menu path to get there, e.g. "Home > Students > Add"; notes = short quirks you learned, e.g. "back key closes the form"; testData = non-secret data that worked. Never include passwords or logins).
Never write report file paths, URLs or download links in your reply: the app shows the PDF and DOCX buttons by itself. Keep the final message short: verdict, the failed cases, what was not tested.
Never mark a case pass without evidence. Use blocked only when the case could not be run, and say why.`;

const S = (description) => ({ type: 'string', description });
const SA = (description) => ({ type: 'array', items: { type: 'string' }, description });
export const CHECK_PROPS = {
  id: S('Test case id, e.g. TC-01'), total: { type: 'number', description: 'How many test cases this whole run has (the same number on every call), so the app can show case 7 of 145' }, title: { type: 'string' }, status: { type: 'string', enum: ['pass', 'fail', 'blocked'] }, evidence: S('What you observed'),
  module: S('Page or feature this case belongs to'), persona: S('Role you tested as, e.g. Teacher'),
  category: { type: 'string', enum: ['functional', 'ui', 'ux', 'accessibility', 'performance', 'security', 'compatibility', 'content'] },
  steps: SA('Short list of what you did'), expected: S('Expected result'), actual: S('Actual result'),
  severity: { type: 'string', enum: ['critical', 'major', 'minor', 'cosmetic'], description: 'For fail or blocked' },
  location: S('Exact page and button or field where the problem is'), suggestion: S('If fail or blocked: how to fix it. If pass: an optional improvement idea (leave empty if none)'),
  description: S('One or two lines: what this test case checks and why'), issues: SA('Problems that happened while performing the steps (errors, delays, odd behaviour), even if the case passed'), remark: S('Very short note (max 80 chars) printed under the screenshot'),
  findings: { type: 'array', description: 'Problems you SEE on the screens of this case (not failed checks): visual / layout (ui), flow or wording (ux), slowness (performance), flicker or repeated redraw (rerender), crash, accessibility. Short title each; it is listed in the matching report section with this case screenshot.', items: { type: 'object', properties: { type: { type: 'string', enum: ['ui', 'ux', 'crash', 'performance', 'rerender', 'accessibility'] }, title: { type: 'string' }, severity: { type: 'string', enum: ['critical', 'major', 'minor', 'cosmetic'] } }, required: ['type', 'title'] } }
};
export const FINISH_PROPS = {
  summary: S('What was tested, what failed, likely cause, overall verdict'),
  personas: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, goal: { type: 'string' } } } },
  coverage: { type: 'object', properties: { tested: SA('Pages / features covered'), notTested: { type: 'array', items: { type: 'object', properties: { area: { type: 'string' }, reason: { type: 'string' } } } } } },
  defects: { type: 'array', description: 'Extra problems seen that are not a failed test case', items: { type: 'object', properties: { title: { type: 'string' }, severity: { type: 'string', enum: ['critical', 'major', 'minor', 'cosmetic'] }, category: { type: 'string' }, location: { type: 'string' }, steps: SA('Steps to see it'), expected: { type: 'string' }, actual: { type: 'string' }, persona: { type: 'string' } } } },
  suggestions: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', description: 'enhancement | optimization | ux | accessibility | performance | security' }, text: { type: 'string' }, priority: { type: 'string', enum: ['high', 'medium', 'low'] } } } },
  risks: SA('Risks for release'),
  features: { type: 'array', description: 'Per feature tested, for the project memory (no passwords)', items: { type: 'object', properties: { name: { type: 'string' }, reach: S('Menu path to reach it, e.g. Home > Students > Add'), notes: SA('Short quirks you learned about this feature'), testData: S('Non-secret test data that worked') } } }
};
