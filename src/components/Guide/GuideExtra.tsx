import React from 'react';
import { openSettings } from '../Emulator/secrets';

export type ExtraCategory = 'overview' | 'emulator' | 'web' | 'tests';

const h: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#2563eb', letterSpacing: '0.04em', marginBottom: 10 };
const p: React.CSSProperties = { fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 8px' };
const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="glass-panel" style={{ padding: 22, marginBottom: 16 }}>
    <div style={h}>{title}</div>
    {children}
  </div>
);
const Steps: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
    {items.map((it, i) => (
      <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ flex: '0 0 26px', height: 26, borderRadius: 8, background: 'rgba(99,102,241,0.14)', color: '#4338ca', fontWeight: 800, fontSize: 12.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
        <span style={{ ...p, margin: 0, paddingTop: 2 }}>{it}</span>
      </li>
    ))}
  </ol>
);
const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 12, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.28)', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{children}</div>
);
const Link: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button onClick={onClick} style={{ background: 'none', border: 'none', padding: 0, color: '#4f46e5', fontWeight: 700, cursor: 'pointer', fontSize: 'inherit', fontFamily: 'inherit' }}>{children}</button>
);
const Code: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <pre style={{ margin: '8px 0 0', padding: '10px 12px', background: '#0f172a', color: '#e2e8f0', borderRadius: 10, fontSize: 12, whiteSpace: 'pre-wrap', userSelect: 'text' }}>{children}</pre>
);

export const GuideExtra: React.FC<{ category: ExtraCategory }> = ({ category }) => {
  if (category === 'overview') return (<>
    <Card title="WHAT STREAMFUSION DOES">
      <p style={p}>StreamFusion has three areas. Pick what you need from the sidebar:</p>
      <ul style={{ ...p, paddingLeft: 20 }}>
        <li><b>Screen Mirror</b>: show and control your real Android phone on this PC (USB cable or Wi-Fi), record the screen, move files, use the phone as a webcam.</li>
        <li><b>Android Emulator</b>: a virtual Android phone for testing apps. An AI agent can tap, type and install apps for you.</li>
        <li><b>Web Testing</b>: a real Chromium browser the AI can drive to test websites.</li>
      </ul>
    </Card>
    <Card title="FIRST-TIME SETUP (2 MINUTES)">
      <Steps items={[
        <>For a real phone: follow <b>Mirror: USB</b> or <b>Mirror: Wi-Fi</b> in this guide.</>,
        <>For the AI features: open <Link onClick={() => openSettings('ai')}>Settings → AI &amp; API</Link> and paste your Anthropic API key. It is stored encrypted on this PC and sent only to Anthropic.</>,
        <>Emulator: open <b>Android Emulator</b> and press <b>Install</b> (one-time download, about 5.4 GB). Not bundled with the app.</>,
        <>Web: open <b>Web Testing</b> and press <b>Install Chromium</b> (one-time, about 150 MB).</>
      ]} />
      <Note>You do not need an API key for Screen Mirror, File Transfer or the manual emulator. The key is only for the built-in AI agent. Claude Code or other MCP clients can use their own login instead, see Settings → AI &amp; API.</Note>
    </Card>
    <Card title="WHERE THINGS ARE">
      <ul style={{ ...p, paddingLeft: 20 }}>
        <li><b>Settings</b>: Mirror quality, Emulator RAM and CPU, Web options, AI key, light or dark theme.</li>
        <li><b>About</b>: version, software updates, welcome tour.</li>
        <li><b>Sidebar</b>: collapses to icons and opens when you hover. Use the pin button to keep it open.</li>
      </ul>
    </Card>
  </>);

  if (category === 'emulator') return (<>
    <Card title="INSTALL AND POWER ON">
      <Steps items={[
        <>Open <b>Android Emulator</b> and press <b>Install emulator</b>. It downloads Java, the Android tools and an Android 14 system image. Wait for 100%.</>,
        <>Press <b>Power on</b> (top right, on the phone, or in the AI Agent chat). The phone appears inside StreamFusion.</>,
        <>When done, use <b>Power off</b> from the same place. Do not just close the app or kill the process.</>
      ]} />
      <Note><b>Boot time:</b> the very first start takes several minutes because Android prepares itself. Powering off from the button saves the phone state, so the next start resumes in seconds to about a minute. Closing StreamFusion also saves it, but give it a moment to finish.</Note>
      <Note><b>Requirements:</b> Windows Hypervisor Platform (WHPX) or virtualization enabled in BIOS. Check <b>Settings → Android Emulator</b> or the Emulator Studio Settings tab for the hardware check. 16 GB of PC RAM is recommended for the default 6 GB phone.</Note>
    </Card>
    <Card title="THE EMULATOR TABS">
      <ul style={{ ...p, paddingLeft: 20 }}>
        <li><b>Emulator</b>: power, factory reset, mirror in StreamFusion, install an APK (browse to a .apk file and press Install).</li>
        <li><b>AI Agent</b>: chat on the left, live phone on the right. You can also click the phone screen to tap, and use Back, Home and Recents.</li>
        <li><b>Apps</b>: installed user apps. Open or uninstall them.</li>
        <li><b>Logs</b>: live device log (logcat) for finding crashes.</li>
        <li><b>Settings</b>: RAM, CPU cores and app memory, plus the hardware check.</li>
      </ul>
    </Card>
    <Card title="USING THE AI AGENT">
      <Steps items={[
        <>Make sure an API key is saved (Settings → AI &amp; API). Without it the chat shows <i>Agent not connected</i>.</>,
        <>Install your app first (APK) or tell the agent which app to open.</>,
        <>Write what to do, for example: <i>"Open Settings, search for Wi-Fi and tell me what you see"</i> or <i>"Open the app, log in with test@example.com and check the home screen loads"</i>.</>,
        <>Watch each action appear as a card. <b>Stop</b> cancels at any time. If the emulator is off, the chat offers <b>Power on &amp; continue</b>.</>
      ]} />
      <p style={{ ...p, marginTop: 12 }}><b>Ask first / Auto:</b> in <i>Ask first</i> mode the agent must get your approval before risky actions (running shell commands, installing or uninstalling apps, clearing app data). <i>Auto</i> does not ask. Use Auto only on a disposable emulator.</p>
      <p style={p}><b>Model:</b> Opus is the most capable, Sonnet is faster and cheaper, Haiku is cheapest. The small counter in the chat header shows tokens used.</p>
    </Card>
    <Card title="PERFORMANCE TIPS">
      <ul style={{ ...p, paddingLeft: 20 }}>
        <li>If the PC feels slow, lower RAM or CPU cores in <Link onClick={() => openSettings('emulator')}>Settings → Android Emulator</Link> and restart the emulator.</li>
        <li>If the phone freezes or an app says "not responding", Power off, then Power on. Factory reset is the last resort and erases all emulator data.</li>
        <li>Prefer the in-app phone view. The separate emulator window is optional and heavier.</li>
      </ul>
    </Card>
  </>);

  if (category === 'web') return (<>
    <Card title="OPEN THE BROWSER">
      <Steps items={[
        <>Open <b>Web Testing</b> from the sidebar. If Chromium is missing, press <b>Install Chromium</b> once.</>,
        <>Press <b>Open browser</b>. It starts on Google. Type a URL in the address bar, or any words to search Google, then press Enter.</>,
        <>Click, scroll and type directly in the preview to control the page. Back, Forward and Reload are above it.</>
      ]} />
    </Card>
    <Card title="TEST WITH THE AI">
      <Steps items={[
        <>Save your API key in <Link onClick={() => openSettings('ai')}>Settings → AI &amp; API</Link>.</>,
        <>Write a task in the chat, for example: <i>"Open example.com, click the link and tell me the page title"</i>.</>,
        <>The agent reads the page structure (cheap), clicks, fills forms and checks the browser console and network requests for errors.</>
      ]} />
      <p style={{ ...p, marginTop: 12 }}>Use the <b>Desktop</b> dropdown to emulate a phone (Pixel, iPhone, iPad). The browser restarts in that mode. The browser keeps its own profile, so logins can stay between sessions.</p>
      <p style={p}>Use the panel button in the chat header to <b>hide the chat</b> and give the browser the full width. The agent keeps working while it is hidden.</p>
    </Card>
    <Card title="CHROME INSIDE THE ANDROID EMULATOR">
      <p style={p}>The agent can also control Chrome or a debuggable WebView app inside the emulator. Ask it to connect, for example: <i>"Attach to Chrome on the emulator and open example.com"</i>.</p>
      <Note>Open Chrome on the emulator once yourself and finish its welcome screen first, otherwise it has nothing to connect to. WebViews only work in apps that enable WebView debugging (usually debug builds). After this the web tools act on the phone. Close the browser to go back to the desktop browser.</Note>
    </Card>
    <Card title="OPTIONS">
      <p style={p}>In <Link onClick={() => openSettings('web')}>Settings → Web</Link> you can turn on a separate visible browser window. By default the browser runs hidden and is shown inside StreamFusion.</p>
    </Card>
  </>);

  return (<>
    <Card title="WHAT TEST MODE DOES">
      <p style={p}>Turn on <b>Test mode</b> in the AI chat (Android Emulator → AI Agent, or Web Testing). Give the agent your test cases. It runs each one, records PASS, FAIL or BLOCKED with the evidence it saw, takes a screenshot as proof, and builds a report you can download as <b>PDF</b> or <b>DOCX</b>.</p>
    </Card>
    <Card title="RUN A TEST">
      <Steps items={[
        <>Click <b>Test mode</b> in the chat header so it is highlighted.</>,
        <>Type your test cases in the box, or press <b>Attach test cases</b> to add files (.txt, .md, .csv, .json, .yaml, up to 300 KB each).</>,
        <>Press Send. Cards appear for every check as it finishes. You can keep watching the live phone or browser.</>,
        <>At the end a <b>Test report ready</b> card shows <b>PDF</b> and <b>DOCX</b> buttons. Older reports are under the document icon in the chat header.</>
      ]} />
    </Card>
    <Card title="HOW TO WRITE GOOD TEST CASES">
      <p style={p}>One case per line, with an ID and the expected result. The clearer the expected result, the more reliable the verdict:</p>
      <Code>{`TC-01: Open the app. Expected: the login screen is shown.
TC-02: Log in with a wrong password. Expected: an error message appears.
TC-03: Log in with test@example.com / Test@123. Expected: the home screen opens.`}</Code>
      <p style={{ ...p, marginTop: 12 }}>Add anything the agent should know, such as test accounts, the app package name or the URL to start from.</p>
    </Card>
    <Card title="WHAT IS IN THE REPORT">
      <ul style={{ ...p, paddingLeft: 20 }}>
        <li>Title, date, duration, device and AI model.</li>
        <li>Summary with the counts of passed, failed and blocked checks.</li>
        <li>Results table, then each check with its evidence text and screenshot.</li>
        <li>Action log of every step the agent took.</li>
      </ul>
      <Note>The AI judges from what it sees on the screen. Treat the report as a fast first pass and review failures yourself before filing bugs. Reports are saved on this PC and stay in the list until you remove them from the reports folder.</Note>
    </Card>
  </>);
};
