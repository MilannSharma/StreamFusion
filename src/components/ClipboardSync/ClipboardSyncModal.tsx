import React, { useState } from 'react';
import { Clipboard, Send, ArrowDownToLine, Sparkles, Check, Copy } from 'lucide-react';

interface ClipboardSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  serial: string;
  onToast: (msg: string, icon?: string) => void;
}

export const ClipboardSyncModal: React.FC<ClipboardSyncModalProps> = ({
  isOpen,
  onClose,
  serial,
  onToast
}) => {
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [recentSnippets, setRecentSnippets] = useState<string[]>([
    'नमस्ते! StreamFusion v3.1.0 clipboard sync test.',
    'https://github.com/MilannSharma/StreamFusion',
    'OTP / Code: 482910'
  ]);

  if (!isOpen) return null;

  const handleSendToPhone = async () => {
    if (!serial) {
      onToast('Please connect and select a phone first!', '⚠️');
      return;
    }
    if (!text.trim()) {
      onToast('Please enter some text to copy to phone', 'ℹ️');
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch('http://127.0.0.1:3001/api/control/clipboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial, text, action: 'send' })
      });
      const data = await res.json();
      if (data.success) {
        onToast('Copied to phone clipboard! (Hindi & Unicode supported)', '📋');
        if (!recentSnippets.includes(text.slice(0, 50))) {
          setRecentSnippets(prev => [text.slice(0, 50), ...prev.slice(0, 4)]);
        }
      } else {
        onToast('Failed to send text: ' + data.message, '❌');
      }
    } catch (e: any) {
      onToast('Error: ' + e.message, '❌');
    } finally {
      setIsSending(false);
    }
  };

  const handleInjectPaste = async () => {
    if (!serial) {
      onToast('Please connect and select a phone first!', '⚠️');
      return;
    }

    try {
      const res = await fetch('http://127.0.0.1:3001/api/control/clipboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial, action: 'paste' })
      });
      const data = await res.json();
      if (data.success) {
        onToast('Triggered paste on active phone app!', '✨');
      } else {
        onToast('Paste failed', '❌');
      }
    } catch (e: any) {
      onToast('Error: ' + e.message, '❌');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: 540,
          background: '#ffffff',
          borderRadius: 16,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, #1e293b, #0f172a)',
            color: '#ffffff'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Clipboard size={20} color="#60a5fa" />
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                Clipboard & Unicode Text Bridge
              </h2>
              <p style={{ fontSize: 12, margin: 0, color: '#94a3b8' }}>
                Send English, Hindi, Arabic, links & emojis directly to phone
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: 20,
              padding: 4
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
              Text to Copy on Phone:
            </label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Type or paste any text (including Hindi: नमस्ते, emojis: 🚀✨, or long passwords)..."
              rows={4}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                fontFamily: 'inherit',
                color: '#0f172a',
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Quick Snippets */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>
              Quick Templates:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {recentSnippets.map((snippet, idx) => (
                <button
                  key={idx}
                  onClick={() => setText(snippet)}
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #e2e8f0',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 11,
                    color: '#334155',
                    cursor: 'pointer',
                    maxWidth: 240,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {snippet}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              onClick={handleSendToPhone}
              disabled={isSending}
              className="btn-primary"
              style={{
                flex: 1,
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
            >
              <Send size={15} />
              <span>{isSending ? 'Sending...' : 'Copy to Phone Clipboard'}</span>
            </button>
            <button
              onClick={handleInjectPaste}
              className="btn-secondary"
              style={{
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
              title="Sends Android Ctrl+V Paste KeyEvent"
            >
              <ArrowDownToLine size={15} color="#2563eb" />
              <span>Paste on Phone</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            Tip: When mirroring, PC keyboard Ctrl+V automatically pastes directly.
          </span>
          <button onClick={onClose} className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
