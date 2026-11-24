// Evidence for the report: real screenshots taken WHILE each case runs (not at the end), and which run is being recorded now.
import { addFrame, claimFrames, surfaceSince } from './runs.js';

let active = null; // the report that is being recorded right now (null = not in test mode: nothing is captured, no extra cost)
export const setActiveRun = (run) => { active = run || null; };
export const activeRun = () => active;

// Save one screenshot into the active report. caseId ties it to the test case that is running.
export function frame({ base64, world, caseId, note }) {
  if (!active || !base64) return null;
  try { return addFrame(active, { base64, world: world === 'web' ? 'web' : 'phone', caseId, note }); } catch (e) { return null; }
}

const labelOf = (shots, run) => {
  if (!shots.length) return surfaceSince(run).label;
  const web = shots.some(s => s.world === 'web'), app = shots.some(s => s.world !== 'web');
  return web && app ? 'App + Browser' : web ? 'Browser' : 'App';
};

// When a case is reported: attach ITS frames (up to 3). With no frame, a fresh screenshot is taken only if this case has just run
// (nothing was reported since the last step); otherwise the report says "not captured" instead of showing another screen.
export async function attachEvidence(run, ck, grab) {
  let shots = claimFrames(run, ck.id, 3);
  if (!shots.length) {
    const last = (run.steps || []).filter(s => !/^(report_|finish_report)/.test(s.name || '')).pop();
    const prev = run.checks[run.checks.length - 1];
    if (last && (!prev || new Date(prev.t) < new Date(last.t)) && Date.now() - new Date(last.t).getTime() < 25000) {
      const world = /^web_/.test(last.name) ? 'web' : 'phone';
      try { const b = await grab(world); const f = b && addFrame(run, { base64: b, world, caseId: ck.id, note: 'when reported' }); if (f) { f.used = true; shots = [f]; } } catch (e) {}
    }
  }
  return { screenshots: shots.map(f => ({ file: f.file, note: f.note, world: f.world })), screenshot: shots.length ? shots[shots.length - 1].file : null, surface: labelOf(shots, run) };
}
