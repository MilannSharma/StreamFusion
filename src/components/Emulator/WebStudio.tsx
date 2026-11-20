import React from 'react';
import { Globe } from 'lucide-react';
import { useEmulator } from './useEmulator';
import { AgentPanel } from './AgentPanel';

// Full-page web testing: AI chat on the left, your Chrome on the right. Separate from the phone emulator.
export const WebStudio: React.FC<{ active: boolean }> = ({ active }) => {
  const emu = useEmulator();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', minHeight: 48, borderBottom: '1px solid var(--border-subtle, #e2e8f0)' }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Globe size={15} color="#fff" /></div>
        <div style={{ fontWeight: 800, fontSize: 14.5 }}>Test Websites</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Your Chrome, controlled by the AI</div>
      </div>
      <AgentPanel emu={emu} world="web" active={active} fill />
    </div>
  );
};
