// Shared test-mode rules (API engine and Claude Code engine) and the report tool schemas.
export const TEST_RULES = `
TEST MODE is on and you are producing a formal test report.

WHO TESTS: read the brief, work out who really uses this product (for example teacher, student, admin, parent, customer) and test every feature from that person's point of view. When several logins are given (User 1, User 2, ...), use the login of the role the case needs. Put the role in "persona" on each check.

EFFICIENCY (important: every call re-sends the whole conversation, so fewer calls = faster and far cheaper):
- Observe once, then plan. Run a whole test case in ONE batch call (device_batch / web_batch) containing the steps AND the assert steps (web_assert_text, web_assert_url, assert_text, assert_no_crash). Use single calls only to look at a screen or to recover from a failure.
- Aim for at most 3 tool calls per test case: one batch, one report_check, and one look only if needed. Never look again after a step that succeeded. Do not take screenshots: one is attached to every check automatically, so just leave the screen showing the result.
- If a saved automated test already covers a case, replay it with automation_run instead of testing by hand.
- Cases that start from the same screen or login: run them back to back. Do not reopen the app or log in again between them.
- If a step fails, try one alternative, then mark the case fail or blocked and move on.

REPORT: after each case call report_check with id, title, status (pass|fail|blocked), evidence (what you saw) and, whenever you can:
  module (the page or feature), persona, category (functional|ui|ux|accessibility|performance|security|compatibility|content),
  description (what the case checks), steps (short list of what you did), issues (anything that went wrong while performing, even on a pass), expected, actual, remark (max 80 chars, printed under the screenshot), and for fail or blocked also severity (critical|major|minor|cosmetic), location (the exact page and button or field) and suggestion (how to fix it).
Also watch for problems the test case did not ask about: buttons that do nothing or are disabled by mistake, wrong or unclear labels, misaligned, overlapping or cut-off elements, missing validation or error messages, slow loading, and (web) console errors and failed requests. If you see one while a case passes, still list it under defects in finish_report.

FINISH: when every case is done call finish_report with
  summary (what was tested, what failed, likely cause, overall verdict),
  personas [{name, goal}],
  coverage {tested: [pages and features covered], notTested: [{area, reason}]}  (list pages and features you saw but did not test),
  defects [{title, severity, category, location, steps, expected, actual, persona}]  (extra problems found),
  suggestions [{type: enhancement|optimization|ux|accessibility|performance|security, text, priority: high|medium|low}],
  risks [text].
Never mark a case pass without evidence. Use blocked only when the case could not be run, and say why.`;

const S = (description) => ({ type: 'string', description });
const SA = (description) => ({ type: 'array', items: { type: 'string' }, description });
export const CHECK_PROPS = {
  id: S('Test case id, e.g. TC-01'), title: { type: 'string' }, status: { type: 'string', enum: ['pass', 'fail', 'blocked'] }, evidence: S('What you observed'),
  module: S('Page or feature this case belongs to'), persona: S('Role you tested as, e.g. Teacher'),
  category: { type: 'string', enum: ['functional', 'ui', 'ux', 'accessibility', 'performance', 'security', 'compatibility', 'content'] },
  steps: SA('Short list of what you did'), expected: S('Expected result'), actual: S('Actual result'),
  severity: { type: 'string', enum: ['critical', 'major', 'minor', 'cosmetic'], description: 'For fail or blocked' },
  location: S('Exact page and button or field where the problem is'), suggestion: S('How to fix or improve it'),
  description: S('One or two lines: what this test case checks and why'), issues: SA('Problems that happened while performing the steps (errors, delays, odd behaviour), even if the case passed'), remark: S('Very short note (max 80 chars) printed under the screenshot')
};
export const FINISH_PROPS = {
  summary: S('What was tested, what failed, likely cause, overall verdict'),
  personas: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, goal: { type: 'string' } } } },
  coverage: { type: 'object', properties: { tested: SA('Pages / features covered'), notTested: { type: 'array', items: { type: 'object', properties: { area: { type: 'string' }, reason: { type: 'string' } } } } } },
  defects: { type: 'array', description: 'Extra problems seen that are not a failed test case', items: { type: 'object', properties: { title: { type: 'string' }, severity: { type: 'string', enum: ['critical', 'major', 'minor', 'cosmetic'] }, category: { type: 'string' }, location: { type: 'string' }, steps: SA('Steps to see it'), expected: { type: 'string' }, actual: { type: 'string' }, persona: { type: 'string' } } } },
  suggestions: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', description: 'enhancement | optimization | ux | accessibility | performance | security' }, text: { type: 'string' }, priority: { type: 'string', enum: ['high', 'medium', 'low'] } } } },
  risks: SA('Risks for release')
};
