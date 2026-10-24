import React, { useState, useEffect } from 'react';
import { Wrench, CheckCircle, AlertTriangle, XCircle, RefreshCw, Smartphone, ShieldAlert, Cpu } from 'lucide-react';

interface DiagnosticReport {
  timestamp: string;
  adb: { ok: boolean; version: string; message: string };
  scrcpy: { ok: boolean; version: string; message: string };
  server: { ok: boolean; url: string };
  devices: {
    total: number;
    healthy: number;
    unauthorized: number;
    offline: number;
    list: Array<{ serial: string; state: string; isWifi: boolean }>;
  };
  issues: string[];
  suggestedFixes: Array<{
    action: string;
    serial?: string;
    label: string;
    instructions?: string;
  }>;
}

interface FixConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshDevices: () => void;
  onToast: (msg: string, icon?: string) => void;
}

export const FixConnectionModal: React.FC<FixConnectionModalProps> = ({
  isOpen,
  onClose,
  onRefreshDevices,
  onToast
}) => {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const runDiagnostics = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://127.0.0.1:3001/api/diagnostics/check');
      const data = await res.json();
      if (data.success) {
        setReport(data.report);
      }
    } catch (e: any) {
      onToast('Diagnostics failed: ' + e.message, '⚠️');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runDiagnostics();
    }
  }, [isOpen]);

  const handleRestartAdb = async () => {
    setActionInProgress('restarting_adb');
    try {
      const res = await fetch('http://127.0.0.1:3001/api/adb/restart', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onToast('ADB Server restarted successfully!', '🔄');
        await runDiagnostics();
        onRefreshDevices();
      } else {
        onToast('Failed to restart ADB', '❌');
      }
    } catch (e: any) {
      onToast('Error: ' + e.message, '❌');
    } finally {
      setActionInProgress(null);
    }
  };

  if (!isOpen) return null;

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
          maxWidth: 620,
          background: '#ffffff',
          borderRadius: 16,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh'
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
                background: 'rgba(37, 99, 235, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Wrench size={20} color="#60a5fa" />
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                Fix My Connection Assistant
              </h2>
              <p style={{ fontSize: 12, margin: 0, color: '#94a3b8' }}>
                Automated self-healing diagnostics & driver troubleshooting
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

        {/* Body */}
        <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <RefreshCw className="spin" size={32} color="#2563eb" style={{ margin: '0 auto 12px' }} />
              <p style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>Analyzing ADB, network ports, & USB drivers...</p>
            </div>
          ) : report ? (
            <>
              {/* Status Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* ADB Status */}
                <div
                  style={{
                    padding: 14,
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    background: report.adb.ok ? '#f0fdf4' : '#fef2f2',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                  }}
                >
                  {report.adb.ok ? <CheckCircle size={18} color="#16a34a" /> : <XCircle size={18} color="#dc2626" />}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Google ADB Platform</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {report.adb.ok ? `Version ${report.adb.version} Active` : 'ADB Service Offline'}
                    </div>
                  </div>
                </div>

                {/* Scrcpy Engine */}
                <div
                  style={{
                    padding: 14,
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    background: report.scrcpy.ok ? '#f0fdf4' : '#fef2f2',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                  }}
                >
                  <Cpu size={18} color="#2563eb" />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>scrcpy v5.0.1 Engine</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>60 FPS Ultra-low latency</div>
                  </div>
                </div>
              </div>

              {/* Devices Detection State */}
              <div
                style={{
                  padding: 16,
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Smartphone size={16} color="#2563eb" />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Connected Devices:</span>
                    <span className="badge badge-cyan" style={{ fontSize: 11 }}>{report.devices.total} Detected</span>
                  </div>
                  <button
                    onClick={runDiagnostics}
                    className="btn-secondary"
                    style={{ padding: '4px 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <RefreshCw size={11} /> Re-scan
                  </button>
                </div>

                {report.devices.list.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>
                    No USB or Wi-Fi devices currently detected.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {report.devices.list.map((d, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          background: '#ffffff',
                          borderRadius: 8,
                          border: '1px solid #e2e8f0'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', fontFamily: 'monospace' }}>
                            {d.serial}
                          </span>
                          <span style={{ fontSize: 11, color: '#64748b' }}>({d.isWifi ? 'Wi-Fi' : 'USB'})</span>
                        </div>
                        <span
                          className={`badge ${d.state === 'device' ? 'badge-green' : d.state === 'unauthorized' ? 'badge-amber' : 'badge-red'}`}
                          style={{ fontSize: 11 }}
                        >
                          {d.state.toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Issues & Suggested Fixes */}
              {report.issues.length > 0 && (
                <div
                  style={{
                    padding: 16,
                    borderRadius: 10,
                    background: '#fffbeb',
                    border: '1px solid #fef3c7'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: '#b45309', fontWeight: 700, fontSize: 13 }}>
                    <AlertTriangle size={16} />
                    <span>Diagnostics Findings & Recommendations</span>
                  </div>
                  <ul style={{ margin: '0 0 14px 18px', padding: 0, fontSize: 12, color: '#78350f', lineHeight: 1.6 }}>
                    {report.issues.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>

                  {/* Fix Buttons */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button
                      onClick={handleRestartAdb}
                      disabled={actionInProgress === 'restarting_adb'}
                      className="btn-primary"
                      style={{ padding: '7px 14px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <RefreshCw size={13} className={actionInProgress === 'restarting_adb' ? 'spin' : ''} />
                      <span>Restart ADB Server (1-Click Fix)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Step-by-Step Mobile Setup Guide */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase' }}>
                  Quick Phone Troubleshooting (All Brands):
                </div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                  1. <strong>Unlock phone</strong> and tap <strong>Allow</strong> on the "Allow USB debugging?" popup.<br />
                  2. If popup didn't appear: unplug USB cable, wait 2 seconds, plug into a <strong>different USB port</strong> (prefer USB 3.0 on back of PC).<br />
                  3. In Phone Settings ➔ <strong>Developer Options</strong>: ensure <strong>USB Debugging</strong> is enabled.<br />
                  4. For <strong>Xiaomi / Redmi / POCO</strong>: also enable "USB debugging (Security settings)".<br />
                  5. For <strong>Vivo / iQOO / Realme</strong>: enable "OTG" in Settings if required.
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10
          }}
        >
          <button onClick={onClose} className="btn-secondary" style={{ padding: '8px 18px' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
