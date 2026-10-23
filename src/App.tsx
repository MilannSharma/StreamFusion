import React, { useState, useEffect } from 'react';
import {
  Smartphone, Wifi, Folder, Video, Settings, HelpCircle,
  RefreshCw, Play, Square, Camera, Download, Upload,
  CheckCircle, AlertCircle, Sparkles, FileText, PlayCircle,
  Minus, Square as WindowMax, X, Github, Cable, Radio, ArrowRight,
  Edit2, Check
} from 'lucide-react';

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      openExternal: (url: string) => void;
      openPath: (path: string) => void;
      createShortcuts?: () => Promise<boolean>;
    };
    lottie?: any;
  }
}

function CatPlayingLottie({ size = 220 }: { size?: number }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = React.useState(false);

  React.useEffect(() => {
    let anim: any = null;
    let cancelled = false;
    let attempts = 0;

    const tryInit = () => {
      if (cancelled) return;
      const lottie = window.lottie;
      if (lottie && containerRef.current) {
        try {
          anim = lottie.loadAnimation({
            container: containerRef.current,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            path: './cat-animation.json'
          });
        } catch (e) {
          console.error('Lottie load error', e);
          setLoadError(true);
        }
      } else {
        attempts++;
        if (attempts < 30) {
          setTimeout(tryInit, 100);
        } else {
          setLoadError(true);
        }
      }
    };

    tryInit();
    return () => {
      cancelled = true;
      if (anim) anim.destroy();
    };
  }, []);

  return (
    <div style={{ width: size, height: size * 0.78, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {loadError && (
        <div style={{ fontSize: 52, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.1))' }}>🐱✨</div>
      )}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'devices' | 'files' | 'recordings' | 'settings' | 'guide'>('devices');
  const [devices, setDevices] = useState<any[]>([]);
  const [savedDevices, setSavedDevices] = useState<any[]>([]);
  const [selectedSerial, setSelectedSerial] = useState<string>('');
  const [mirrorStatus, setMirrorStatus] = useState({ isMirroring: false, isRecording: false, device: null as any });
  const [toast, setToast] = useState<{ message: string; icon: string; visible: boolean }>({ message: '', icon: '', visible: false });
  const [isScanning, setIsScanning] = useState(false);
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    try {
      return !localStorage.getItem('streamfusion_v2_setup_complete');
    } catch (e) {
      return true;
    }
  });

  const [setupProgress, setSetupProgress] = useState(25);
  const [setupStage, setSetupStage] = useState('Verifying Google ADB Platform-Tools v37.0.1...');

  useEffect(() => {
    if (showWelcome) {
      setSetupProgress(30);
      setSetupStage('Verifying Google ADB Platform-Tools v37.0.1...');
      fetch('/api/health')
        .then(res => res.json())
        .then(health => {
          setSetupProgress(65);
          setSetupStage('Initializing Scrcpy v5.0.1 Zero-Latency Codec Engine...');
          setTimeout(() => {
            setSetupProgress(90);
            setSetupStage('Configuring Wireless Wi-Fi Auto-Reconnect...');
            setTimeout(() => {
              setSetupProgress(100);
              setSetupStage('StreamFusion v2.0.0 is Ready to Stream!');
            }, 500);
          }, 500);
        })
        .catch(() => {
          setSetupProgress(100);
          setSetupStage('StreamFusion v2.0.0 Ready!');
        });
    }
  }, [showWelcome]);

  const dismissWelcome = () => {
    try {
      window.electronAPI?.createShortcuts?.();
      localStorage.setItem('streamfusion_v2_setup_complete', 'true');
    } catch (e) {}
    setShowWelcome(false);
  };

  // Custom Nicknames stored in localStorage
  const [customNames, setCustomNames] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('streamfusion_custom_names') || '{}');
    } catch (e) {
      return {};
    }
  });
  const [editingSerial, setEditingSerial] = useState<string | null>(null);
  const [editInputName, setEditInputName] = useState('');

  // Simple Config State
  const [config, setConfig] = useState({
    profile: 'Balanced',
    maxSize: 1080,
    bitrateMbps: 8,
    maxFps: 60,
    videoCodec: 'h264',
    audioEnabled: true,
    turnScreenOff: false,
    stayAwake: true,
    fullscreen: false,
    recordFormat: 'mp4'
  });

  // Wireless Mirror Modal State
  const [wirelessModalOpen, setWirelessModalOpen] = useState(false);
  const [wirelessStep, setWirelessStep] = useState<'connect_usb' | 'ready_to_switch' | 'switching' | 'success_unplug'>('connect_usb');
  const [wirelessTargetDevice, setWirelessTargetDevice] = useState<any>(null);
  const [manualIpMode, setManualIpMode] = useState(false);
  const [manualIp, setManualIp] = useState('');

  // Files State
  const [currentRemotePath, setCurrentRemotePath] = useState('/sdcard/Download/');
  const [remoteFiles, setRemoteFiles] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  // Recordings & Screenshots State
  const [recordings, setRecordings] = useState<any[]>([]);

  // Guide State
  const [selectedBrand, setSelectedBrand] = useState<'samsung' | 'xiaomi' | 'pixel' | 'oneplus' | 'vivo' | 'motorola'>('samsung');
  const [guideCategory, setGuideCategory] = useState<'usb' | 'wifi' | 'shortcuts' | 'faq'>('usb');

  // Compute Active Device
  const selectedDevice = devices.find(d => d.serial === selectedSerial) || devices[0] || null;
  const usbConnectedDevice = devices.find(d => !d.isWifi);
  const wifiConnectedDevice = devices.find(d => d.isWifi);

  // Helper: Get user-customized or automatic phone name
  const getDeviceName = (dev: any) => {
    if (!dev) return 'Android Phone';
    if (customNames[dev.serial]) return customNames[dev.serial];
    return dev.displayName || dev.model || 'Android Phone';
  };

  const handleSaveRename = (serial: string, newName: string) => {
    const trimmed = newName.trim();
    const updated = { ...customNames };
    if (trimmed) {
      updated[serial] = trimmed;
    } else {
      delete updated[serial];
    }
    setCustomNames(updated);
    try {
      localStorage.setItem('streamfusion_custom_names', JSON.stringify(updated));
    } catch (e) {}
    setEditingSerial(null);
    showToast(`Device renamed to "${trimmed || 'Default'}"`, '✏️');
  };

  const showToast = (message: string, icon = 'ℹ️') => {
    setToast({ message, icon, visible: true });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 4000);
  };

  const openUrlSafely = (url: string) => {
    if (window.electronAPI && window.electronAPI.openExternal) {
      window.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  // Poll devices & mirror status
  const fetchDevices = async () => {
    setIsScanning(true);
    try {
      const res = await fetch('/api/devices');
      const data = await res.json();
      if (data.success) {
        setDevices(data.devices || []);
        if (data.savedDevices) {
          setSavedDevices(data.savedDevices);
        }
        if (!selectedSerial && data.devices && data.devices.length > 0) {
          setSelectedSerial(data.devices[0].serial);
        }
      }
    } catch (e) {
    } finally {
      setTimeout(() => setIsScanning(false), 400);
    }
  };

  // Reconnect to a saved Wi-Fi phone with 1 click
  const handleReconnectSavedWifi = async (dev: any) => {
    const targetName = dev.displayName || dev.model || dev.ip;
    showToast(`Connecting to ${targetName} (${dev.ip})...`, '📶');
    try {
      const res = await fetch('/api/wifi/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: dev.ip, port: dev.port || 5555 })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Connected to ${targetName}!`, '✅');
        fetchDevices();
      } else {
        showToast(`Connection failed: ${data.message || data.error}`, '❌');
      }
    } catch (e: any) {
      showToast(`Error: ${e.message}`, '❌');
    }
  };

  // Wake screen if phone screen is off or locked
  const handleWakeScreen = async () => {
    const dev = selectedDevice;
    if (!dev) return;
    showToast('Waking up phone screen...', '💡');
    try {
      await fetch('/api/control/wake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: dev.serial })
      });
    } catch (e) {}
  };

  const fetchMirrorStatus = async () => {
    try {
      const res = await fetch('/api/mirror/status');
      const data = await res.json();
      setMirrorStatus(data);
    } catch (e) {}
  };

  useEffect(() => {
    fetchDevices();
    fetchMirrorStatus();
    const interval = setInterval(() => {
      fetchDevices();
      fetchMirrorStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [selectedSerial]);

  // Load files when tab changes
  useEffect(() => {
    if (activeTab === 'files' && selectedDevice) {
      loadRemoteFiles(currentRemotePath);
    }
    if (activeTab === 'recordings') {
      loadRecordings();
    }
  }, [activeTab, selectedDevice]);

  // Open Wireless Setup Modal
  const openWirelessMirrorModal = (targetDevice?: any) => {
    const target = targetDevice || usbConnectedDevice || selectedDevice;
    setWirelessTargetDevice(target || null);
    if (target && !target.isWifi) {
      setWirelessStep('ready_to_switch');
    } else if (usbConnectedDevice) {
      setWirelessTargetDevice(usbConnectedDevice);
      setWirelessStep('ready_to_switch');
    } else {
      setWirelessStep('connect_usb');
    }
    setWirelessModalOpen(true);
  };

  // Switch phone to wireless
  const handleMakeWirelessNow = async () => {
    const target = wirelessTargetDevice || usbConnectedDevice;
    if (!target) {
      showToast('Please connect phone with USB Cable first', '⚠️');
      return;
    }

    setWirelessStep('switching');
    try {
      const res = await fetch('/api/wifi/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: target.serial })
      });
      const data = await res.json();
      if (data.success) {
        setWirelessStep('success_unplug');
        fetchDevices();
      } else {
        showToast(`Wireless setup failed: ${data.message || data.error}`, '❌');
        setWirelessStep('ready_to_switch');
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`, '❌');
      setWirelessStep('ready_to_switch');
    }
  };

  // Connect via manual IP
  const handleManualIpConnect = async () => {
    if (!manualIp.trim()) {
      showToast('Please enter device IP address', '⚠️');
      return;
    }
    showToast(`Connecting to ${manualIp}...`, '📶');
    try {
      const res = await fetch('/api/wifi/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: manualIp.trim(), port: 5555 })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Connected to phone!`, '✅');
        setWirelessModalOpen(false);
        fetchDevices();
      } else {
        showToast(`Connection failed: ${data.message || data.error}`, '❌');
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`, '❌');
    }
  };

  // Start Screen Mirroring
  const startMirror = async (record = false, targetSerial?: string) => {
    const serialToUse = targetSerial || selectedDevice?.serial;
    const deviceObj = devices.find(d => d.serial === serialToUse) || selectedDevice;

    if (!serialToUse || !deviceObj) {
      showToast('Please connect an Android phone first!', '⚠️');
      return;
    }

    const friendlyName = getDeviceName(deviceObj);

    try {
      showToast(record ? 'Starting Mirror with Recording...' : `Opening ${friendlyName}...`, '🚀');
      const res = await fetch('/api/mirror/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial: serialToUse,
          deviceName: friendlyName,
          model: deviceObj.model,
          config: {
            ...config,
            recordSession: record
          }
        })
      });
      const data = await res.json();
      if (data.success) {
        setMirrorStatus({ isMirroring: true, isRecording: record, device: deviceObj });
        showToast(`Mirroring active: ${friendlyName}`, '✨');
        if (wirelessModalOpen) setWirelessModalOpen(false);

        // Auto-minimize StreamFusion so phone mirror window is visible on desktop!
        if (window.electronAPI && typeof window.electronAPI.minimize === 'function') {
          setTimeout(() => {
            window.electronAPI?.minimize();
          }, 600);
        }
      } else {
        showToast(`Could not start mirror: ${data.error}`, '❌');
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`, '❌');
    }
  };

  // Stop Mirroring
  const stopMirror = async () => {
    try {
      await fetch('/api/mirror/stop', { method: 'POST' });
      setMirrorStatus({ isMirroring: false, isRecording: false, device: null });
      showToast('Mirroring ended', '⏹️');
      if (activeTab === 'recordings') loadRecordings();
    } catch (err: any) {
      showToast(`Failed: ${err.message}`, '❌');
    }
  };

  // Take Screenshot
  const takeScreenshot = async () => {
    if (!selectedDevice) return;
    showToast('Capturing screenshot...', '📸');
    try {
      const res = await fetch('/api/control/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: selectedDevice.serial })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Screenshot saved!', '🖼️');
      }
    } catch (e) {}
  };

  // Files Listing
  const loadRemoteFiles = async (folderPath: string) => {
    if (!selectedDevice) return;
    try {
      let res = await fetch(`/api/files/list?serial=${encodeURIComponent(selectedDevice.serial)}&path=${encodeURIComponent(folderPath)}`);
      if (!res.ok) {
        res = await fetch(`/api/files?serial=${encodeURIComponent(selectedDevice.serial)}&path=${encodeURIComponent(folderPath)}`);
      }
      const data = await res.json();
      if (data.success) {
        setRemoteFiles(data.files || []);
        setCurrentRemotePath(data.currentPath || folderPath);
      }
    } catch (e) {}
  };

  // Upload File
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedDevice) return;
    setIsUploading(true);
    setUploadStatus(`Sending ${files[0].name}...`);

    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('serial', selectedDevice.serial);
    formData.append('remotePath', currentRemotePath);

    try {
      const res = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Sent ${files[0].name} to phone Downloads`, '📁');
        loadRemoteFiles(currentRemotePath);
      } else {
        showToast(`Failed to send: ${data.error}`, '❌');
      }
    } catch (err: any) {
      showToast(`Upload error: ${err.message}`, '❌');
    } finally {
      setIsUploading(false);
      setUploadStatus('');
    }
  };

  // Recordings
  const loadRecordings = async () => {
    try {
      const res = await fetch('/api/recordings/list');
      const data = await res.json();
      if (data.success) {
        setRecordings(data.recordings || []);
      }
    } catch (e) {}
  };

  // Presets
  const applyPreset = (presetName: string) => {
    switch (presetName) {
      case 'Ultra 1080p':
        setConfig(prev => ({ ...prev, profile: 'Ultra 1080p', maxSize: 1080, bitrateMbps: 16, maxFps: 60 }));
        break;
      case 'Balanced':
        setConfig(prev => ({ ...prev, profile: 'Balanced', maxSize: 1080, bitrateMbps: 8, maxFps: 60 }));
        break;
      case 'Wireless Low Latency':
        setConfig(prev => ({ ...prev, profile: 'Wireless Low Latency', maxSize: 720, bitrateMbps: 3, maxFps: 30 }));
        break;
    }
    showToast(`Preset "${presetName}" applied`, '⚙️');
  };

  // Brand Guide Data
  const brandSteps: Record<string, { brandName: string; steps: { title: string; desc: string; tip?: string }[]; warning?: string }> = {
    samsung: {
      brandName: 'Samsung Galaxy (One UI)',
      steps: [
        {
          title: 'Open Settings & About Phone',
          desc: 'Open the "Settings" app on your Samsung phone and scroll to the bottom to tap "About phone".'
        },
        {
          title: 'Tap Software Information',
          desc: 'Tap on "Software information" to find your build number.'
        },
        {
          title: 'Tap Build Number 7 Times',
          desc: 'Find "Build number" and tap it 7 times quickly. Enter your lock screen PIN when prompted.',
          tip: 'A message will confirm: "Developer mode has been enabled".'
        },
        {
          title: 'Turn On USB Debugging',
          desc: 'Go back to Settings, tap "Developer options" at the bottom, and toggle ON "USB debugging".'
        },
        {
          title: 'Plug In & Tap Allow',
          desc: 'Connect USB Cable to your PC. On your phone screen, check "Always allow from this computer" and tap "Allow".'
        }
      ]
    },
    xiaomi: {
      brandName: 'Xiaomi, Redmi & POCO (HyperOS / MIUI)',
      warning: 'Important for Xiaomi: Turn ON both "USB Debugging" AND "USB Debugging (Security settings)" to allow PC mouse and keyboard control.',
      steps: [
        {
          title: 'Open Settings & About Phone',
          desc: 'Go to Settings -> About phone (at the top in HyperOS / MIUI).'
        },
        {
          title: 'Tap OS Version 7 Times',
          desc: 'Tap "OS Version" (or "MIUI Version") 7 times until it says "You are now a developer!".'
        },
        {
          title: 'Open Additional Settings',
          desc: 'Go to Settings -> Additional settings -> Developer options.'
        },
        {
          title: 'Enable USB Debugging & Security',
          desc: 'Turn ON "USB debugging", "USB debugging (Security settings)", and "Install via USB".'
        },
        {
          title: 'Connect & Tap Allow',
          desc: 'Plug into PC using a USB Cable, accept the prompt, and select "Always allow".'
        }
      ]
    },
    pixel: {
      brandName: 'Google Pixel & Stock Android (Nothing, Motorola)',
      steps: [
        {
          title: 'Open Settings -> About Phone',
          desc: 'Open your phone Settings and scroll down to "About phone".'
        },
        {
          title: 'Tap Build Number 7 Times',
          desc: 'Scroll to the bottom to find "Build number". Tap it 7 times in a row.'
        },
        {
          title: 'Open System -> Developer Options',
          desc: 'Go back to Settings -> System -> Developer options.'
        },
        {
          title: 'Enable USB Debugging',
          desc: 'Toggle the switch next to "USB debugging" to ON and tap OK.'
        },
        {
          title: 'Allow USB Debugging Popup',
          desc: 'Plug your USB Cable in, tap "Always allow from this computer", then press "Allow".'
        }
      ]
    },
    oneplus: {
      brandName: 'OnePlus, Realme & OPPO (OxygenOS / ColorOS)',
      steps: [
        {
          title: 'Open Settings -> About Device',
          desc: 'Open Settings, tap "About device", then select "Version".'
        },
        {
          title: 'Tap Build Number 7 Times',
          desc: 'Tap "Build number" 7 times and enter your device PIN.'
        },
        {
          title: 'Open Additional Settings',
          desc: 'Go back to Settings -> Additional settings (or System settings) -> Developer options.'
        },
        {
          title: 'Turn on USB Debugging',
          desc: 'Switch on "USB debugging".'
        },
        {
          title: 'Connect USB Cable',
          desc: 'Plug your phone into your laptop/PC via USB Cable and tap Allow.'
        }
      ]
    },
    vivo: {
      brandName: 'Vivo & iQOO (Funtouch OS / OriginOS)',
      steps: [
        {
          title: 'Open Settings -> About Phone',
          desc: 'Go to phone Settings and tap "About phone" -> "Software info".'
        },
        {
          title: 'Tap Build Number 7 Times',
          desc: 'Rapidly tap "Build number" 7 times until developer options are unlocked.'
        },
        {
          title: 'Open System Management',
          desc: 'Go back to Settings -> System -> Developer options.'
        },
        {
          title: 'Enable USB Debugging',
          desc: 'Toggle ON "USB debugging".'
        },
        {
          title: 'Plug In & Authorize',
          desc: 'Connect USB Cable to PC, check "Always allow", and tap OK.'
        }
      ]
    },
    motorola: {
      brandName: 'Motorola & Other Android Devices',
      steps: [
        {
          title: 'Settings -> About Phone',
          desc: 'Scroll to the bottom of the Settings menu and tap "About phone".'
        },
        {
          title: 'Tap Build Number 7 Times',
          desc: 'Tap "Build number" 7 times until you see "You are now a developer!".'
        },
        {
          title: 'System -> Developer Options',
          desc: 'Return to Settings -> System -> Advanced -> Developer options.'
        },
        {
          title: 'Toggle USB Debugging',
          desc: 'Turn on the "USB debugging" switch and approve the prompt.'
        },
        {
          title: 'Plug in USB Cable',
          desc: 'Plug in your USB Cable and tap Allow on your phone.'
        }
      ]
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-deep)' }}>
      {/* 1. Custom Frameless Titlebar */}
      <header className="drag-region" style={{
        height: 52,
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 0 0 16px',
        zIndex: 100,
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        {/* StreamFusion Logo & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img
            src="/StreamFusion.png"
            alt="StreamFusion Logo"
            style={{ width: 34, height: 34, objectFit: 'contain' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 16,
              fontWeight: 800,
              background: 'var(--gradient-brand)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: -0.3
            }}>
              StreamFusion
            </span>
            <span className="badge badge-cyan" style={{ fontSize: 10, padding: '2px 7px' }}>v1.0</span>
          </div>
        </div>

        {/* Dual Live Connection Indicators on Top Bar */}
        <div className="no-drag" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* USB Cable Indicator */}
          {usbConnectedDevice ? (
            <div className="badge badge-green" title={`USB Cable Phone: ${getDeviceName(usbConnectedDevice)}`}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a' }} />
              <span>USB Cable: <strong>{getDeviceName(usbConnectedDevice)}</strong></span>
            </div>
          ) : (
            <div className="badge" style={{ background: '#f1f5f9', color: '#94a3b8', border: '1px solid #e2e8f0' }} title="No phone connected via USB Cable">
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#cbd5e1' }} />
              <span>USB Cable: Not Connected</span>
            </div>
          )}

          {/* Wireless Wi-Fi Indicator */}
          {wifiConnectedDevice ? (
            <div className="badge badge-cyan" title={`Wireless Phone: ${getDeviceName(wifiConnectedDevice)}`}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#0284c7' }} />
              <span>Wireless Wi-Fi: <strong>{getDeviceName(wifiConnectedDevice)}</strong></span>
            </div>
          ) : (
            <div className="badge" style={{ background: '#f1f5f9', color: '#94a3b8', border: '1px solid #e2e8f0' }} title="No phone connected via Wireless Wi-Fi">
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#cbd5e1' }} />
              <span>Wireless Wi-Fi: Not Connected</span>
            </div>
          )}

          {/* Mirror Active Indicator */}
          {mirrorStatus.isMirroring && (
            <div className="badge badge-brand pulse">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ffffff' }} />
              <span>MIRROR LIVE</span>
            </div>
          )}
        </div>

        {/* Right Window Controls */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* Window Control Buttons */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button
              onClick={() => window.electronAPI?.minimize()}
              className="win-ctrl-btn"
              title="Minimize"
            >
              <Minus size={15} />
            </button>
            <button
              onClick={() => window.electronAPI?.maximize()}
              className="win-ctrl-btn"
              title="Maximize / Restore"
            >
              <WindowMax size={13} />
            </button>
            <button
              onClick={() => window.electronAPI?.close()}
              className="win-ctrl-btn close-btn"
              title="Close"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main Workspace (Floating Sidebar + Content) */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Floating Sidebar Dock */}
        <aside style={{
          width: 230,
          margin: '16px 0 16px 16px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 16,
          boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.05), 0 8px 10px -6px rgba(15, 23, 42, 0.02)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '16px 12px',
          zIndex: 10
        }}>
          {/* Navigation Links */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              onClick={() => setActiveTab('devices')}
              className={`sidebar-tab ${activeTab === 'devices' ? 'active' : ''}`}
            >
              <Smartphone size={16} /> Screen Mirror
            </button>

            <button
              onClick={() => setActiveTab('files')}
              className={`sidebar-tab ${activeTab === 'files' ? 'active' : ''}`}
            >
              <Folder size={16} /> File Transfer
            </button>

            <button
              onClick={() => setActiveTab('recordings')}
              className={`sidebar-tab ${activeTab === 'recordings' ? 'active' : ''}`}
            >
              <Video size={16} /> My Recordings
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`sidebar-tab ${activeTab === 'settings' ? 'active' : ''}`}
            >
              <Settings size={16} /> Display &amp; Quality
            </button>

            <button
              onClick={() => setActiveTab('guide')}
              className={`sidebar-tab ${activeTab === 'guide' ? 'active' : ''}`}
            >
              <HelpCircle size={16} /> How to Connect
            </button>
          </div>

          {/* Connected Phone Status Card */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 12
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>PHONE STATUS</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {selectedDevice ? getDeviceName(selectedDevice) : 'No Phone Found'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: mirrorStatus.isMirroring ? 8 : 0 }}>
              {selectedDevice ? `${selectedDevice.isWifi ? '📶 Wireless Wi-Fi' : '🔌 USB Cable'}` : 'Plug in via USB Cable'}
            </div>

            {mirrorStatus.isMirroring && (
              <button onClick={stopMirror} className="btn-danger" style={{ width: '100%', padding: '8px 0', fontSize: 12 }}>
                <Square size={14} /> Stop Mirroring
              </button>
            )}
          </div>
        </aside>

        {/* Content Main Panel */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px 30px', position: 'relative', background: 'var(--bg-deep)' }}>
          {/* TAB 1: SCREEN MIRROR (HOME) */}
          {activeTab === 'devices' && (
            <div>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-main)' }}>Screen Mirroring</h1>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Project and control your Android phone on your computer screen.</p>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={fetchDevices}
                    className="btn-secondary"
                    style={{ padding: '8px 16px', fontSize: 13 }}
                  >
                    <RefreshCw size={14} className={isScanning ? 'pulse' : ''} />
                    <span>Scan Devices</span>
                  </button>
                  <button
                    onClick={() => openWirelessMirrorModal()}
                    className="btn-primary"
                    style={{ padding: '8px 18px', fontSize: 13 }}
                  >
                    <Wifi size={14} />
                    <span>Wireless Mirror</span>
                  </button>
                </div>
              </div>

              {/* Saved Wi-Fi Devices (Auto-Paired, No USB Cable Needed) */}
              {savedDevices.filter(s => !devices.some(d => d.serial === s.serial || d.ipAddress === s.ip)).length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Saved Wi-Fi Devices · Wire-Free (No USB Needed)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {savedDevices.filter(s => !devices.some(d => d.serial === s.serial || d.ipAddress === s.ip)).map(saved => (
                      <div
                        key={saved.ip}
                        className="glass-panel"
                        style={{
                          padding: '16px 20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: '#ffffff',
                          border: '1.5px solid #bfdbfe',
                          borderRadius: 14
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          <div style={{
                            width: 48,
                            height: 48,
                            borderRadius: 12,
                            background: '#eff6ff',
                            border: '1px solid #93c5fd',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 22
                          }}>
                            📶
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)' }}>
                                {saved.displayName || saved.model}
                              </span>
                              <span className="badge badge-cyan" style={{ fontSize: 10 }}>
                                Saved Wi-Fi Phone
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              IP: <strong>{saved.ip}</strong> · Plug-free Wireless Streaming
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleReconnectSavedWifi(saved)}
                          className="btn-primary"
                          style={{ padding: '9px 18px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          <Play size={14} /> ⚡ Connect Wire-Free
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Connected Device Cards or Empty State */}
              {devices.length === 0 ? (
                <div className="glass-panel" style={{ padding: 48, textAlign: 'center' }}>
                  <div style={{
                    width: 70,
                    height: 70,
                    borderRadius: '50%',
                    background: '#eff6ff',
                    border: '1.5px solid #bfdbfe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 18px'
                  }}>
                    <Cable size={34} style={{ color: '#2563eb' }} />
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-main)', marginBottom: 8 }}>
                    Connect Your Phone with USB Cable
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 480, margin: '0 auto 24px', lineHeight: 1.6 }}>
                    Connect your Android phone to this computer using a <strong>USB Cable</strong>. Unlock your phone and tap <strong>Allow</strong> if a prompt appears.
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
                    <button onClick={fetchDevices} className="btn-primary" style={{ padding: '10px 22px' }}>
                      <RefreshCw size={15} className={isScanning ? 'pulse' : ''} /> Scan for Phone
                    </button>
                    <button onClick={() => openWirelessMirrorModal()} className="btn-secondary" style={{ padding: '10px 20px' }}>
                      <Wifi size={15} /> Setup Wireless Mirror
                    </button>
                    <button onClick={() => setActiveTab('guide')} className="btn-secondary" style={{ padding: '10px 20px' }}>
                      <HelpCircle size={15} /> Help &amp; Instructions
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {devices.map(dev => (
                    <div
                      key={dev.serial}
                      className="glass-panel"
                      style={{
                        padding: 20,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        border: selectedSerial === dev.serial ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                        cursor: 'pointer'
                      }}
                      onClick={() => setSelectedSerial(dev.serial)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                        <div style={{
                          width: 52,
                          height: 52,
                          borderRadius: 12,
                          background: dev.isWifi ? '#eff6ff' : '#f0fdf4',
                          border: dev.isWifi ? '1px solid #bfdbfe' : '1px solid #bbf7d0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 24
                        }}>
                          {dev.isWifi ? '📶' : '📱'}
                        </div>

                        <div>
                          {/* Device Name with Rename Option */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                            {editingSerial === dev.serial ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={editInputName}
                                  onChange={e => setEditInputName(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleSaveRename(dev.serial, editInputName);
                                    if (e.key === 'Escape') setEditingSerial(null);
                                  }}
                                  autoFocus
                                  style={{ padding: '4px 8px', fontSize: 14, width: 200 }}
                                />
                                <button
                                  onClick={() => handleSaveRename(dev.serial, editInputName)}
                                  className="btn-primary"
                                  style={{ padding: '5px 8px' }}
                                  title="Save Name"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  onClick={() => setEditingSerial(null)}
                                  className="btn-secondary"
                                  style={{ padding: '5px 8px' }}
                                  title="Cancel"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-main)' }}>
                                  {getDeviceName(dev)}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingSerial(dev.serial);
                                    setEditInputName(getDeviceName(dev));
                                  }}
                                  className="btn-secondary"
                                  style={{ padding: '3px 8px', fontSize: 11 }}
                                  title="Rename this phone"
                                >
                                  <Edit2 size={11} /> Rename
                                </button>
                              </div>
                            )}

                            <span className={dev.isWifi ? 'badge badge-cyan' : 'badge badge-green'}>
                              {dev.isWifi ? 'Wi-Fi Wireless' : 'USB Cable'}
                            </span>
                            {dev.battery >= 0 && (
                              <span className="badge badge-cyan">🔋 {dev.battery}%</span>
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                            <span style={{ color: '#16a34a', fontWeight: 600 }}>● Ready to Mirror</span>
                            {dev.model && dev.model !== getDeviceName(dev) && (
                              <span>Model: {dev.model}</span>
                            )}
                            {dev.resolution && <span>Display: {dev.resolution}</span>}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 10 }}>
                        {!dev.isWifi && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openWirelessMirrorModal(dev); }}
                            className="btn-secondary"
                            title="Convert USB Cable to Wire-Free Mirror"
                          >
                            <Wifi size={14} /> Make Wireless
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedSerial(dev.serial); startMirror(false, dev.serial); }}
                          className="btn-primary"
                        >
                          <Play size={14} /> Start Mirror
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Active Mirroring Banner */}
              {mirrorStatus.isMirroring && (
                <div className="glass-panel" style={{ marginTop: 24, padding: 22, border: '1.5px solid #2563eb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#16a34a' }} className="pulse" />
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-main)' }}>Mirroring Session Active</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          Streaming: {getDeviceName(mirrorStatus.device)} · Direct mouse and keyboard control enabled
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={handleWakeScreen} className="btn-secondary" title="Turn on mobile display if locked or sleeping">
                        <Sparkles size={14} style={{ color: '#2563eb' }} /> Wake Screen
                      </button>
                      <button onClick={takeScreenshot} className="btn-secondary">
                        <Camera size={14} /> Take Screenshot
                      </button>
                      <button onClick={() => startMirror(true)} className="btn-secondary">
                        <Video size={14} /> Record Video
                      </button>
                      <button onClick={stopMirror} className="btn-danger">
                        <Square size={14} /> Stop Mirror
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: FILE TRANSFER */}
          {activeTab === 'files' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-main)' }}>Send Files to Phone</h1>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Drag and drop photos, videos, documents, or apps directly to your phone.</p>
                </div>
              </div>

              {/* Drag and Drop Box */}
              <div
                className="glass-panel"
                style={{
                  padding: 36,
                  textAlign: 'center',
                  border: '2px dashed #93c5fd',
                  background: '#f8fafc',
                  marginBottom: 24,
                  cursor: 'pointer'
                }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  handleFileUpload(e.dataTransfer.files);
                }}
                onClick={() => document.getElementById('file-upload-input')?.click()}
              >
                <input
                  id="file-upload-input"
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => handleFileUpload(e.target.files)}
                />
                <Upload size={40} style={{ color: '#2563eb', margin: '0 auto 12px' }} />
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6 }}>
                  {isUploading ? uploadStatus : 'Click or Drag Files Here to Send to Phone'}
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Files will be saved in your phone's <strong>Downloads</strong> folder
                </p>
              </div>

              {/* Phone Files List */}
              <div className="glass-panel" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Folder size={18} style={{ color: '#2563eb' }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>Files on Phone:</span>
                    <span style={{ fontSize: 12, background: '#f1f5f9', padding: '3px 8px', borderRadius: 6, color: '#334155', fontFamily: 'monospace' }}>
                      {currentRemotePath}
                    </span>
                    {currentRemotePath !== '/sdcard/Download/' && (
                      <button
                        onClick={() => loadRemoteFiles('/sdcard/Download/')}
                        className="btn-secondary"
                        style={{ padding: '3px 8px', fontSize: 11 }}
                      >
                        ⬆ Back to Downloads
                      </button>
                    )}
                  </div>
                  <button onClick={() => loadRemoteFiles(currentRemotePath)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 11 }}>
                    <RefreshCw size={12} /> Refresh
                  </button>
                </div>

                {!selectedDevice ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                    Please connect or select your phone to browse files
                  </div>
                ) : remoteFiles.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                    No files found in {currentRemotePath}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {remoteFiles.map((file, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          if (file.isDir) {
                            loadRemoteFiles(file.path.endsWith('/') ? file.path : `${file.path}/`);
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: 8,
                          cursor: file.isDir ? 'pointer' : 'default',
                          transition: 'all 0.15s'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {file.isDir ? (
                            <Folder size={16} style={{ color: '#2563eb' }} />
                          ) : (
                            <FileText size={16} style={{ color: '#64748b' }} />
                          )}
                          <span style={{ fontSize: 13, fontWeight: file.isDir ? 700 : 600, color: file.isDir ? '#1d4ed8' : 'var(--text-main)' }}>
                            {file.name}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {file.date && <span style={{ fontSize: 11, color: '#94a3b8' }}>{file.date}</span>}
                          <span className={file.isDir ? 'badge badge-cyan' : ''} style={{ fontSize: 11, color: file.isDir ? undefined : 'var(--text-muted)' }}>
                            {file.size}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: RECORDINGS & GALLERY */}
          {activeTab === 'recordings' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-main)' }}>Saved Videos &amp; Recordings</h1>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>View and download your captured phone screen recordings.</p>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => startMirror(true)} className="btn-primary" style={{ padding: '8px 16px', fontSize: 13 }}>
                    <Video size={14} /> Start New Recording
                  </button>
                </div>
              </div>

              <div className="glass-panel" style={{ padding: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <PlayCircle size={18} style={{ color: '#2563eb' }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>My Recorded MP4 Videos</span>
                  </div>
                  <button onClick={loadRecordings} className="btn-secondary" style={{ padding: '6px 10px', fontSize: 11 }}>
                    <RefreshCw size={12} /> Refresh
                  </button>
                </div>

                {recordings.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                    No recorded videos yet. Click "Start New Recording" while mirroring to save your phone screen!
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                    {recordings.map((rec, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: 8,
                          padding: 14,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Video size={18} style={{ color: '#2563eb' }} />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-main)' }}>{rec.filename}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{rec.size} · {rec.date}</div>
                          </div>
                        </div>
                        <a href={rec.url} download={rec.filename} className="btn-secondary" style={{ padding: '6px 10px', fontSize: 11 }}>
                          <Download size={13} />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: QUALITY & SETTINGS */}
          {activeTab === 'settings' && (
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-main)', marginBottom: 4 }}>Display Quality &amp; Settings</h1>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                Choose stream quality presets and screen preferences.
              </p>

              {/* Quality Presets */}
              <div className="glass-panel" style={{ padding: 22, marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', marginBottom: 12 }}>ONE-CLICK QUALITY PRESETS</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <button onClick={() => applyPreset('Ultra 1080p')} className="btn-secondary">
                    🚀 Ultra Clear (1080p · 60 FPS)
                  </button>
                  <button onClick={() => applyPreset('Balanced')} className="btn-secondary">
                    ⚖️ Standard Balanced (Recommended)
                  </button>
                  <button onClick={() => applyPreset('Wireless Low Latency')} className="btn-secondary">
                    📶 Smooth Wireless (Fast Wi-Fi Streaming)
                  </button>
                </div>
              </div>

              {/* Behavior Switches */}
              <div className="glass-panel" style={{ padding: 22 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', marginBottom: 14 }}>DISPLAY PREFERENCES</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.stayAwake}
                      onChange={e => setConfig(prev => ({ ...prev, stayAwake: e.target.checked }))}
                    />
                    Keep Phone Screen Awake (Prevents phone from locking while mirroring)
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.turnScreenOff}
                      onChange={e => setConfig(prev => ({ ...prev, turnScreenOff: e.target.checked }))}
                    />
                    Turn Off Phone Screen While Mirroring (Saves phone battery)
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.audioEnabled}
                      onChange={e => setConfig(prev => ({ ...prev, audioEnabled: e.target.checked }))}
                    />
                    Stream Phone Audio to PC Speakers
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.fullscreen}
                      onChange={e => setConfig(prev => ({ ...prev, fullscreen: e.target.checked }))}
                    />
                    Open Mirroring Window in Fullscreen Mode
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: HOW TO CONNECT (GUIDE) */}
          {activeTab === 'guide' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-main)' }}>How to Connect Your Phone</h1>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Simple instructions for connecting any phone brand with USB Cable or Wireless Mirroring.
                  </p>
                </div>
              </div>

              {/* Guide Category Tabs */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <button
                  onClick={() => setGuideCategory('usb')}
                  className={`brand-pill ${guideCategory === 'usb' ? 'active' : ''}`}
                >
                  📱 Phone Connection Setup
                </button>
                <button
                  onClick={() => setGuideCategory('wifi')}
                  className={`brand-pill ${guideCategory === 'wifi' ? 'active' : ''}`}
                >
                  📶 Wireless Mirror Setup
                </button>
                <button
                  onClick={() => setGuideCategory('shortcuts')}
                  className={`brand-pill ${guideCategory === 'shortcuts' ? 'active' : ''}`}
                >
                  ⌨️ Keyboard Shortcuts
                </button>
                <button
                  onClick={() => setGuideCategory('faq')}
                  className={`brand-pill ${guideCategory === 'faq' ? 'active' : ''}`}
                >
                  💡 Common Questions
                </button>
              </div>

              {/* Brand Setup */}
              {guideCategory === 'usb' && (
                <div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                    <button onClick={() => setSelectedBrand('samsung')} className={`brand-pill ${selectedBrand === 'samsung' ? 'active' : ''}`}>
                      Samsung Galaxy
                    </button>
                    <button onClick={() => setSelectedBrand('xiaomi')} className={`brand-pill ${selectedBrand === 'xiaomi' ? 'active' : ''}`}>
                      Xiaomi / Redmi / POCO
                    </button>
                    <button onClick={() => setSelectedBrand('pixel')} className={`brand-pill ${selectedBrand === 'pixel' ? 'active' : ''}`}>
                      Google Pixel &amp; Motorola
                    </button>
                    <button onClick={() => setSelectedBrand('oneplus')} className={`brand-pill ${selectedBrand === 'oneplus' ? 'active' : ''}`}>
                      OnePlus &amp; Realme
                    </button>
                    <button onClick={() => setSelectedBrand('vivo')} className={`brand-pill ${selectedBrand === 'vivo' ? 'active' : ''}`}>
                      Vivo &amp; iQOO
                    </button>
                  </div>

                  {brandSteps[selectedBrand]?.warning && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 10, padding: '12px 16px', color: '#b45309', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <AlertCircle size={18} />
                      <span>{brandSteps[selectedBrand].warning}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {brandSteps[selectedBrand]?.steps.map((st, idx) => (
                      <div key={idx} className="step-card">
                        <div className="step-number">{idx + 1}</div>
                        <div style={{ flex: 1 }}>
                          <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', marginBottom: 4 }}>
                            {st.title}
                          </h4>
                          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            {st.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Wireless Walkthrough */}
              {guideCategory === 'wifi' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="step-card">
                    <div className="step-number">1</div>
                    <div>
                      <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', marginBottom: 4 }}>
                        Connect Once with USB Cable
                      </h4>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        Connect your phone once using a <strong>USB Cable</strong>. Ensure both your computer and phone are connected to the same Wi-Fi router.
                      </p>
                    </div>
                  </div>

                  <div className="step-card">
                    <div className="step-number">2</div>
                    <div>
                      <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', marginBottom: 4 }}>
                        Click "Make Wireless Now"
                      </h4>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        In StreamFusion, click <strong>Wireless Mirror</strong>, then click the green button <strong>Make Wireless Now</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="step-card">
                    <div className="step-number">3</div>
                    <div>
                      <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', marginBottom: 4 }}>
                        Remove the USB Cable
                      </h4>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        When the popup appears, simply unplug the USB Cable! Your phone will now mirror wirelessly.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Shortcuts */}
              {guideCategory === 'shortcuts' && (
                <div className="glass-panel" style={{ padding: 22 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-main)', marginBottom: 14 }}>
                    Keyboard Shortcuts while Mirroring
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Toggle Fullscreen</span>
                      <div><span className="keycap">Alt</span> + <span className="keycap">F</span></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Back Button</span>
                      <div><span className="keycap">Alt</span> + <span className="keycap">B</span></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Home Button</span>
                      <div><span className="keycap">Alt</span> + <span className="keycap">H</span></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Recent Apps</span>
                      <div><span className="keycap">Alt</span> + <span className="keycap">S</span></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Lock / Power Button</span>
                      <div><span className="keycap">Alt</span> + <span className="keycap">P</span></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Turn Phone Screen Off</span>
                      <div><span className="keycap">Alt</span> + <span className="keycap">O</span></div>
                    </div>
                  </div>
                </div>
              )}

              {/* FAQ */}
              {guideCategory === 'faq' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="glass-panel" style={{ padding: 20 }}>
                    <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6 }}>
                      Phone does not show up?
                    </h4>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      Unlock your phone. Tap "Allow" on the popup that appears on your phone screen. Ensure you are using a data USB Cable.
                    </p>
                  </div>
                  <div className="glass-panel" style={{ padding: 20 }}>
                    <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6 }}>
                      How do I control the phone?
                    </h4>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      Once the mirror window opens, use your computer mouse to tap and swipe, and your computer keyboard to type directly!
                    </p>
                  </div>
                  <div className="glass-panel" style={{ padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', marginBottom: 4 }}>
                        StreamFusion Setup &amp; Tour
                      </h4>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Replay the white setup screen with driver verification &amp; animation.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowWelcome(true)}
                      className="btn-secondary"
                      style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <Sparkles size={14} color="#2563eb" />
                      <span>Replay Setup Tour</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* 3. Ultra-Clean Footer */}
      <footer style={{
        height: 36,
        background: '#ffffff',
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        fontSize: 11,
        color: '#64748b'
      }}>
        {/* Left Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: selectedDevice ? '#16a34a' : '#d97706'
          }} />
          <span>{selectedDevice ? `${getDeviceName(selectedDevice)} Ready` : 'StreamFusion Ready · Connect Phone'}</span>
        </div>

        {/* Right Milann Sharma GitHub Attribution */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => openUrlSafely('https://github.com/Milannsharma')}
            className="github-link"
            title="Open Milann Sharma GitHub Profile"
          >
            <Github size={13} />
            <span>Milann Sharma</span>
          </button>
        </div>
      </footer>

      {/* 4. Wireless Mirror Modal */}
      {wirelessModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(5px)'
        }}>
          <div className="glass-panel" style={{ width: 480, padding: 26, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Wifi size={20} style={{ color: '#2563eb' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-main)' }}>Wireless Mirror Setup</h3>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Wire-free screen projection over local Wi-Fi</div>
                </div>
              </div>
              <button
                onClick={() => setWirelessModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* STEP 1: Connect Phone with USB Cable First */}
            {wirelessStep === 'connect_usb' && !manualIpMode && (
              <div>
                <div style={{
                  background: '#f8fafc',
                  border: '1.5px dashed #cbd5e1',
                  borderRadius: 12,
                  padding: 24,
                  textAlign: 'center',
                  marginBottom: 18
                }}>
                  <Cable size={42} style={{ color: '#2563eb', margin: '0 auto 12px' }} className="pulse" />
                  <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6 }}>
                    Connect Phone Once with USB Cable
                  </h4>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 14 }}>
                    One-time setup: Pehele apne phone ko <strong>USB Cable</strong> se connect karein. Setup complete hone ke baad aap USB Cable nikaal sakte hain!
                  </p>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#d97706', background: '#fffbeb', padding: '6px 12px', borderRadius: 9999 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706' }} className="pulse" />
                    Waiting for USB Cable connection...
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    onClick={() => setManualIpMode(true)}
                    style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Connect via Wi-Fi IP directly
                  </button>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setWirelessModalOpen(false)} className="btn-secondary">Cancel</button>
                    <button onClick={fetchDevices} className="btn-primary">
                      <RefreshCw size={13} className={isScanning ? 'pulse' : ''} /> Check Again
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Phone Detected -> Ready to Switch */}
            {wirelessStep === 'ready_to_switch' && !manualIpMode && (
              <div>
                <div style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 12,
                  padding: 18,
                  marginBottom: 18
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CheckCircle size={20} style={{ color: '#16a34a' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#15803d' }}>Phone Detected via USB Cable!</div>
                      <div style={{ fontSize: 12, color: '#166534' }}>
                        Device: <strong>{getDeviceName(wirelessTargetDevice || usbConnectedDevice)}</strong>
                      </div>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: '#166534', lineHeight: 1.5 }}>
                    StreamFusion is ready to switch your phone to wireless Wi-Fi mode. Click the button below to proceed.
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button onClick={() => setWirelessModalOpen(false)} className="btn-secondary">Cancel</button>
                  <button
                    onClick={handleMakeWirelessNow}
                    className="btn-primary"
                    style={{ padding: '10px 22px', fontSize: 13, background: 'linear-gradient(135deg, #059669 0%, #16a34a 100%)' }}
                  >
                    <Radio size={15} /> Make Wireless Now
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2.5: In Progress Switching */}
            {wirelessStep === 'switching' && (
              <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                <RefreshCw size={38} style={{ color: '#2563eb', margin: '0 auto 14px' }} className="pulse" />
                <h4 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6 }}>
                  Configuring Wireless Mirror...
                </h4>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Connecting your phone over Wi-Fi. Please wait a moment...
                </p>
              </div>
            )}

            {/* STEP 3: SUCCESS POPUP -> NOW REMOVE USB CABLE */}
            {wirelessStep === 'success_unplug' && (
              <div>
                <div style={{
                  background: '#f0fdf4',
                  border: '1.5px solid #86efac',
                  borderRadius: 14,
                  padding: 24,
                  textAlign: 'center',
                  marginBottom: 20
                }}>
                  <div style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: '#dcfce7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 14px'
                  }}>
                    <CheckCircle size={32} style={{ color: '#16a34a' }} />
                  </div>

                  <h3 style={{ fontSize: 18, fontWeight: 800, color: '#15803d', marginBottom: 8 }}>
                    Now You Can Remove the USB Cable!
                  </h3>
                  <p style={{ fontSize: 13, color: '#166534', lineHeight: 1.6, maxWidth: 380, margin: '0 auto 10px' }}>
                    Aapka phone ab wirelessly connect ho chuka hai! Aap <strong>USB Cable unplug</strong> kar sakte hain aur completely wire-free screen mirroring start kar sakte hain.
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
                  <button onClick={() => setWirelessModalOpen(false)} className="btn-secondary" style={{ padding: '9px 18px' }}>
                    Done
                  </button>
                  <button
                    onClick={() => {
                      const wifiDev = devices.find(d => d.isWifi);
                      startMirror(false, wifiDev?.serial);
                    }}
                    className="btn-primary"
                    style={{ padding: '9px 24px', fontSize: 13 }}
                  >
                    <Play size={15} /> Start Wireless Mirror
                  </button>
                </div>
              </div>
            )}

            {/* Manual IP Mode */}
            {manualIpMode && (
              <div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                  Enter your phone's Wi-Fi IP address directly if your phone is already on the same local Wi-Fi:
                </p>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-main)', display: 'block', marginBottom: 6 }}>
                    Phone Wi-Fi IP:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 192.168.1.105"
                    value={manualIp}
                    onChange={e => setManualIp(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleManualIpConnect()}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    onClick={() => setManualIpMode(false)}
                    style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, cursor: 'pointer' }}
                  >
                    &larr; Back to USB Cable Setup
                  </button>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setWirelessModalOpen(false)} className="btn-secondary">Cancel</button>
                    <button onClick={handleManualIpConnect} className="btn-primary">Connect</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Floating Toast Notification */}
      {toast.visible && (
        <div style={{
          position: 'fixed',
          bottom: 48,
          right: 24,
          background: '#0f172a',
          color: '#ffffff',
          borderRadius: 8,
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2)',
          zIndex: 2000
        }}>
          <span style={{ fontSize: 16 }}>{toast.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{toast.message}</span>
        </div>
      )}

      {/* 6. First-Time White UI Installer & Setup Modal */}
      {showWelcome && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3000,
          padding: 24
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 28,
            width: '100%',
            maxWidth: 580,
            padding: '36px 36px 32px',
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.18), 0 0 0 1px #e2e8f0',
            textAlign: 'center',
            position: 'relative',
            maxHeight: '92vh',
            overflowY: 'auto'
          }}>
            {/* Close button */}
            <button
              onClick={dismissWelcome}
              style={{
                position: 'absolute',
                top: 20,
                right: 20,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '50%',
                width: 34,
                height: 34,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#64748b',
                transition: 'all 0.15s ease'
              }}
              title="Close Setup"
            >
              <X size={16} />
            </button>

            {/* Cat Playing Lottie Animation Container */}
            <div style={{
              background: '#ffffff',
              borderRadius: 20,
              padding: '10px 0 4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CatPlayingLottie size={220} />
            </div>

            {/* Version Badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 14px',
              background: '#eff6ff',
              color: '#2563eb',
              border: '1px solid #bfdbfe',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 10,
              letterSpacing: 0.3
            }}>
              <Sparkles size={13} />
              <span>StreamFusion v2.0.0 • Setup &amp; Installation</span>
            </div>

            {/* Title & Subtitle */}
            <h2 style={{
              fontSize: 26,
              fontWeight: 800,
              color: '#0f172a',
              marginBottom: 6,
              letterSpacing: -0.6
            }}>
              Welcome to StreamFusion v2.0.0
            </h2>
            <p style={{
              fontSize: 13,
              color: '#64748b',
              lineHeight: 1.55,
              maxWidth: 460,
              margin: '0 auto 20px'
            }}>
              Setting up your ultra-low latency Android screen mirroring, 1-click persistent wireless streaming, and smart stay-awake engine.
            </p>

            {/* Installation Setup Progress Box */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 16,
              padding: '16px 20px',
              textAlign: 'left',
              marginBottom: 20
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                  {setupStage}
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: setupProgress === 100 ? '#16a34a' : '#2563eb' }}>
                  {setupProgress}%
                </span>
              </div>

              {/* Progress Bar */}
              <div style={{
                height: 7,
                background: '#e2e8f0',
                borderRadius: 999,
                overflow: 'hidden',
                marginBottom: 14
              }}>
                <div style={{
                  height: '100%',
                  width: `${setupProgress}%`,
                  background: setupProgress === 100 
                    ? 'linear-gradient(90deg, #2563eb 0%, #10b981 100%)' 
                    : 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)',
                  borderRadius: 999,
                  transition: 'width 0.4s ease-out'
                }} />
              </div>

              {/* Checkpoints */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: setupProgress >= 25 ? '#334155' : '#94a3b8' }}>
                  <CheckCircle size={15} color={setupProgress >= 25 ? '#16a34a' : '#cbd5e1'} />
                  <span>Google ADB Platform-Tools v37.0.1 (Verified &amp; Active)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: setupProgress >= 60 ? '#334155' : '#94a3b8' }}>
                  <CheckCircle size={15} color={setupProgress >= 60 ? '#16a34a' : '#cbd5e1'} />
                  <span>Scrcpy v5.0.1 Zero-Latency Video &amp; Control Engine</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: setupProgress >= 88 ? '#334155' : '#94a3b8' }}>
                  <CheckCircle size={15} color={setupProgress >= 88 ? '#16a34a' : '#cbd5e1'} />
                  <span>1-Click Wireless Wi-Fi Auto-Reconnect &amp; Persistence</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: setupProgress >= 100 ? '#334155' : '#94a3b8' }}>
                  <CheckCircle size={15} color={setupProgress >= 100 ? '#16a34a' : '#cbd5e1'} />
                  <span>Auto Screen Stay-Awake &amp; Double-Click Power Wake</span>
                </div>
              </div>
            </div>

            {/* 3 Quick Highlights Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10,
              marginBottom: 24,
              textAlign: 'left'
            }}>
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '12px 10px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}>
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: '#eff6ff',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 6
                }}>
                  <Smartphone size={16} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>Zero Lag</div>
                <div style={{ fontSize: 10.5, color: '#64748b', lineHeight: 1.3 }}>60fps smooth mirror &amp; full mouse control</div>
              </div>

              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '12px 10px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}>
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: '#f0fdf4',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 6
                }}>
                  <Wifi size={16} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>Auto Wi-Fi</div>
                <div style={{ fontSize: 10.5, color: '#64748b', lineHeight: 1.3 }}>Connect once; stream wireless anytime</div>
              </div>

              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '12px 10px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}>
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: '#faf5ff',
                  color: '#9333ea',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 6
                }}>
                  <Upload size={16} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>Drag &amp; Drop</div>
                <div style={{ fontSize: 10.5, color: '#64748b', lineHeight: 1.3 }}>Push APKs &amp; files directly to phone</div>
              </div>
            </div>

            {/* Primary Action Button */}
            <button
              onClick={dismissWelcome}
              className="btn-primary"
              style={{
                width: '100%',
                padding: '14px 0',
                fontSize: 15,
                fontWeight: 700,
                borderRadius: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 6px 20px rgba(37, 99, 235, 0.35)',
                transition: 'all 0.15s ease'
              }}
            >
              <span>Launch StreamFusion v2.0.0</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
