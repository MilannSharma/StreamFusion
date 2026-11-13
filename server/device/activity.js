// Shared "the phone is being used right now" signal. Background jobs (notification watcher) back off while the
// live screen or the agent is talking to the phone, so a slow phone is not asked ten things at once.
export const activity = { streams: 0, lastTool: 0 };
export const phoneInUse = () => activity.streams > 0 || Date.now() - activity.lastTool < 8000;
