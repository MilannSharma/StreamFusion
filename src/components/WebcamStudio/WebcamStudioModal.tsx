import React, { useState } from 'react';
import { Camera, Monitor, Video, CheckCircle, ExternalLink, Sparkles, StopCircle, Play } from 'lucide-react';

interface WebcamStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  serial: string;
  isMirroring: boolean;
  onToast: (msg: string, icon?: string) => void;
}

export const WebcamStudioModal: React.FC<WebcamStudioModalProps> = ({
  isOpen,
  onClose,
  serial,
  isMirroring,
  onToast
}) => {
  const [activeTab, setActiveTab] = useState<'webcam' | 'virtual'>('webcam');
  const [cameraFacing, setCameraFacing] = useState<'back' | 'front'>('back');
  const [cameraSize, setCameraSize] = useState('1920x1080');
  const [cameraFps, setCameraFps] = useState(60);

  const [virtualDisplaySize, setVirtualDisplaySize] = useState('1920x1080/420');
  const [startApp, setStartApp] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);

  if (!isOpen) return null;

  const handleStartWebcam = async () => {
    if (!serial) {
      onToast('Please connect and select a phone first!', '⚠️');
      return;
    }

    setIsLaunching(true);
    try {
      const res = await fetch('http://127.0.0.1:3001/api/mirror/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial,
          mode: 'webcam',
          config: {
            isWebcam: true,
            cameraFacing,
            cameraSize,
            cameraFps,
            stayAwake: true
          }
        })
      });
      const data = await res.json();
      if (data.success) {
        onToast(`HD Webcam launched using ${cameraFacing} camera!`, '📹');
        onClose();
      } else {
        onToast('Failed to start webcam: ' + data.message, '❌');
      }
    } catch (e: any) {
      onToast('Error: ' + e.message, '❌');
    } finally {
      setIsLaunching(false);
    }
  };

  const handleStartVirtualDisplay = async () => {
    if (!serial) {
      onToast('Please connect and select a phone first!', '⚠️');
      return;
    }

    setIsLaunching(true);
    try {
      const res = await fetch('http://127.0.0.1:3001/api/mirror/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial,
          mode: 'virtual-display',
          config: {
            isVirtualDisplay: true,
            virtualDisplaySize,
            startApp: startApp.trim() || undefined,
            stayAwake: true
          }
        })
      });
      const data = await res.json();
      if (data.success) {
        onToast('Virtual Android Display spawned on PC!', '🖥️');
        onClose();
      } else {
        onToast('Failed to start virtual display: ' + data.message, '❌');
      }
    } catch (e: any) {
      onToast('Error: ' + e.message, '❌');
    } finally {
      setIsLaunching(false);
    }
  };

  const handleStopMirror = async () => {
    try {
      await fetch('http://127.0.0.1:3001/api/mirror/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial })
      });
      onToast('Session stopped', '⏹️');
    } catch (e) {}
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
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {activeTab === 'webcam' ? <Camera size={20} color="#60a5fa" /> : <Monitor size={20} color="#60a5fa" />}
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                {activeTab === 'webcam' ? 'Smartphone HD Webcam Studio' : 'Virtual Android Desktop Display'}
              </h2>
              <p style={{ fontSize: 12, margin: 0, color: '#94a3b8' }}>
                {activeTab === 'webcam' ? 'Turn your phone camera into a crisp 1080p/60FPS PC Webcam' : 'Run independent Android window without disturbing phone'}
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

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <button
            onClick={() => setActiveTab('webcam')}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              background: activeTab === 'webcam' ? '#ffffff' : 'transparent',
              borderBottom: activeTab === 'webcam' ? '2px solid #2563eb' : 'none',
              color: activeTab === 'webcam' ? '#2563eb' : '#64748b',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            <Camera size={16} />
            <span>Phone as HD Webcam</span>
          </button>
          <button
            onClick={() => setActiveTab('virtual')}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              background: activeTab === 'virtual' ? '#ffffff' : 'transparent',
              borderBottom: activeTab === 'virtual' ? '2px solid #2563eb' : 'none',
              color: activeTab === 'virtual' ? '#2563eb' : '#64748b',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            <Monitor size={16} />
            <span>Virtual Display (Secondary)</span>
            <span className="badge badge-amber" style={{ fontSize: 10, padding: '1px 5px' }}>Beta</span>
          </button>
        </div>

        {/* Tab 1: HD Webcam */}
        {activeTab === 'webcam' && (
          <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {/* Camera Lens Facing */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
                  Camera Lens:
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setCameraFacing('back')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: cameraFacing === 'back' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: cameraFacing === 'back' ? '#eff6ff' : '#ffffff',
                      color: cameraFacing === 'back' ? '#1d4ed8' : '#334155',
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                  >
                    Back (Primary Sensor)
                  </button>
                  <button
                    onClick={() => setCameraFacing('front')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: cameraFacing === 'front' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: cameraFacing === 'front' ? '#eff6ff' : '#ffffff',
                      color: cameraFacing === 'front' ? '#1d4ed8' : '#334155',
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                  >
                    Front (Selfie)
                  </button>
                </div>
              </div>

              {/* Resolution */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
                  Stream Quality:
                </label>
                <select
                  value={cameraSize}
                  onChange={e => setCameraSize(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 12,
                    fontWeight: 600,
                    outline: 'none',
                    background: '#ffffff'
                  }}
                >
                  <option value="1920x1080">1080p Full HD (1920 × 1080)</option>
                  <option value="1280x720">720p HD (1280 × 720) - Fast</option>
                  <option value="3840x2160">4K Ultra HD (if phone supports)</option>
                </select>
              </div>
            </div>

            {/* Launch Button */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleStartWebcam}
                disabled={isLaunching}
                className="btn-primary"
                style={{
                  flex: 1,
                  padding: '11px 20px',
                  fontSize: 14,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
              >
                <Video size={16} />
                <span>{isLaunching ? 'Launching Stream...' : 'Start HD Webcam Window'}</span>
              </button>
              {isMirroring && (
                <button
                  onClick={handleStopMirror}
                  className="btn-danger"
                  style={{ padding: '11px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <StopCircle size={16} />
                  <span>Stop</span>
                </button>
              )}
            </div>

            {/* OBS Virtual Camera Quick Guide */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: 16
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: '#0f172a', fontWeight: 700, fontSize: 13 }}>
                <Sparkles size={16} color="#2563eb" />
                <span>How to use in Zoom, Google Meet & Microsoft Teams:</span>
              </div>
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
                1. Click <strong>Start HD Webcam Window</strong> above to open your phone camera.<br />
                2. Open <strong>OBS Studio</strong> (Free from obsproject.com).<br />
                3. In OBS, click <strong>+</strong> under Sources ➔ <strong>Window Capture</strong> ➔ Select <code>StreamFusion HD Webcam</code>.<br />
                4. Click <strong>Start Virtual Camera</strong> in OBS Controls.<br />
                5. In Zoom/Meet/Discord settings, choose <strong>"OBS Virtual Camera"</strong> as your video camera!
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Virtual Display */}
        {activeTab === 'virtual' && (
          <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: 14, fontSize: 12, color: '#1e40af', lineHeight: 1.5 }}>
              <strong>What is Virtual Display?</strong><br />
              Creates a dedicated second Android screen on your PC monitor. You can use apps on PC while your physical phone display stays free for WhatsApp, phone calls, or navigation! (Requires Android 10+).
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
                Virtual Display Size & Density:
              </label>
              <select
                value={virtualDisplaySize}
                onChange={e => setVirtualDisplaySize(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  fontSize: 12,
                  fontWeight: 600,
                  outline: 'none',
                  background: '#ffffff'
                }}
              >
                <option value="1920x1080/420">1080p Desktop (1920 × 1080, 420 DPI) - Recommended</option>
                <option value="1280x720/320">720p Tablet (1280 × 720, 320 DPI)</option>
                <option value="2560x1440/560">1440p 2K (2560 × 1440, 560 DPI)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
                App to Start Directly (Optional Package Name):
              </label>
              <input
                type="text"
                placeholder="e.g. com.google.android.youtube or com.android.chrome (leave empty for launcher)"
                value={startApp}
                onChange={e => setStartApp(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  fontSize: 12,
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              onClick={handleStartVirtualDisplay}
              disabled={isLaunching}
              className="btn-primary"
              style={{
                padding: '11px 20px',
                fontSize: 14,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
            >
              <Monitor size={16} />
              <span>{isLaunching ? 'Spawning Display...' : 'Create Virtual Android Display'}</span>
            </button>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            justifyContent: 'flex-end'
          }}
        >
          <button onClick={onClose} className="btn-secondary" style={{ padding: '7px 16px', fontSize: 12 }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
