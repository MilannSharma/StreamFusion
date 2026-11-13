import React from 'react';
import { Globe } from 'lucide-react';
import { useEmulator } from './useEmulator';
import { AgentPanel } from './AgentPanel';

// Full-page web testing: AI chat on the left, your Chrome on the right. Separate from the phone emulator.
export const WebStudio: React.FC<{ active: boolean }> = ({ active }) => {
  const emu = useEmulator();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Globe size={20} color="#fff" /></div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Web Testing</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Your Chrome controlled by the AI agent, with live preview and test reports</div>
        </div>
      </div>
      <AgentPanel emu={emu} world="web" active={active} fill />
    </div>
  );
};
