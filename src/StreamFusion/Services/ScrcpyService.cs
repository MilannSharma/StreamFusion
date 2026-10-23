using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using StreamFusion.Models;

namespace StreamFusion.Services
{
    public class ScrcpyService
    {
        private Process? _currentProcess;
        private string? _activeSerial;
        private string? _activeModel;

        public bool IsMirroring => _currentProcess != null && !_currentProcess.HasExited;
        public string? ActiveSerial => _activeSerial;
        public string? ActiveModel => _activeModel;

        public event EventHandler<string>? OutputReceived;
        public event EventHandler? MirrorStarted;
        public event EventHandler? MirrorStopped;

        public Task<(bool Success, string Message)> StartMirrorAsync(
            DeviceInfo device,
            MirrorConfig config,
            string? recordFilePath = null)
        {
            if (IsMirroring)
            {
                return Task.FromResult((false, "A mirroring session is already active. Please stop it first."));
            }

            var scrcpyExe = PathResolver.GetScrcpyPath();
            var binDir = PathResolver.GetScrcpyBinDirectory();

            if (!File.Exists(scrcpyExe))
            {
                return Task.FromResult((false, $"scrcpy.exe not found at: {scrcpyExe}"));
            }

            var args = new List<string>
            {
                $"-s \"{device.Serial}\"",
                $"--window-title=\"StreamFusion - {device.DisplayName}\""
            };

            // Resolution
            if (config.MaxSize > 0)
            {
                args.Add($"--max-size={config.MaxSize}");
            }

            // Video Bitrate
            if (config.BitrateMbps > 0)
            {
                args.Add($"--video-bit-rate={config.BitrateMbps}M");
            }

            // Max FPS
            if (config.MaxFps > 0)
            {
                args.Add($"--max-fps={config.MaxFps}");
            }

            // Video Codec
            if (!string.IsNullOrEmpty(config.VideoCodec))
            {
                args.Add($"--video-codec={config.VideoCodec}");
            }

            // Orientation
            if (config.LockOrientation >= 0 && config.LockOrientation <= 3)
            {
                args.Add($"--lock-video-orientation={config.LockOrientation}");
            }

            // Display / Window Flags
            if (config.AlwaysOnTop) args.Add("--always-on-top");
            if (config.Borderless) args.Add("--window-borderless");
            if (config.Fullscreen) args.Add("--fullscreen");
            if (config.TurnScreenOff) args.Add("--turn-screen-off");
            if (config.StayAwake) args.Add("--stay-awake");
            if (config.ShowTouches) args.Add("--show-touches");
            if (config.PowerOffOnClose) args.Add("--power-off-on-close");

            // Audio Flags
            if (!config.AudioEnabled)
            {
                args.Add("--no-audio");
            }
            else
            {
                if (!string.IsNullOrEmpty(config.AudioCodec))
                    args.Add($"--audio-codec={config.AudioCodec}");
                if (config.AudioBitrateKbps > 0)
                    args.Add($"--audio-bit-rate={config.AudioBitrateKbps}K");
                if (!string.IsNullOrEmpty(config.AudioSource))
                    args.Add($"--audio-source={config.AudioSource}");
                if (config.AudioBufferMs > 0)
                    args.Add($"--audio-buffer={config.AudioBufferMs}");
                if (config.AudioOnly)
                    args.Add("--no-video");
            }

            // Recording Flag
            if (!string.IsNullOrWhiteSpace(recordFilePath))
            {
                args.Add($"--record=\"{recordFilePath}\"");
                if (!string.IsNullOrEmpty(config.RecordFormat))
                {
                    args.Add($"--record-format={config.RecordFormat}");
                }
            }

            var argString = string.Join(" ", args);

            var startInfo = new ProcessStartInfo
            {
                FileName = scrcpyExe,
                Arguments = argString,
                WorkingDirectory = binDir,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };

            try
            {
                _currentProcess = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
                _activeSerial = device.Serial;
                _activeModel = device.DisplayName;

                _currentProcess.OutputDataReceived += (s, e) =>
                {
                    if (e.Data != null) OutputReceived?.Invoke(this, e.Data);
                };
                _currentProcess.ErrorDataReceived += (s, e) =>
                {
                    if (e.Data != null) OutputReceived?.Invoke(this, e.Data);
                };
                _currentProcess.Exited += (s, e) =>
                {
                    _currentProcess = null;
                    _activeSerial = null;
                    _activeModel = null;
                    MirrorStopped?.Invoke(this, EventArgs.Empty);
                };

                _currentProcess.Start();
                _currentProcess.BeginOutputReadLine();
                _currentProcess.BeginErrorReadLine();

                MirrorStarted?.Invoke(this, EventArgs.Empty);
                return Task.FromResult((true, "Mirroring started successfully."));
            }
            catch (Exception ex)
            {
                _currentProcess = null;
                _activeSerial = null;
                _activeModel = null;
                return Task.FromResult((false, $"Failed to launch scrcpy: {ex.Message}"));
            }
        }

        public void StopMirror()
        {
            if (_currentProcess != null && !_currentProcess.HasExited)
            {
                try
                {
                    _currentProcess.Kill(true);
                }
                catch { }
            }

            _currentProcess = null;
            _activeSerial = null;
            _activeModel = null;
            MirrorStopped?.Invoke(this, EventArgs.Empty);
        }
    }
}
