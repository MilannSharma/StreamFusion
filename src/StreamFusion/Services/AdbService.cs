using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using StreamFusion.Models;

namespace StreamFusion.Services
{
    public class AdbService
    {
        public async Task<string> RunAdbCommandAsync(string arguments, int timeoutMs = 6000)
        {
            var adbExe = PathResolver.GetAdbPath();
            var binDir = PathResolver.GetScrcpyBinDirectory();

            var startInfo = new ProcessStartInfo
            {
                FileName = adbExe,
                Arguments = arguments,
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
                using var process = new Process { StartInfo = startInfo };
                process.Start();

                var outTask = process.StandardOutput.ReadToEndAsync();
                var errTask = process.StandardError.ReadToEndAsync();

                var delayTask = Task.Delay(timeoutMs);
                var finishedTask = await Task.WhenAny(Task.WhenAll(outTask, errTask), delayTask);

                if (finishedTask == delayTask)
                {
                    try { process.Kill(true); } catch { }
                    return "Error: Command timed out.";
                }

                var stdout = await outTask;
                var stderr = await errTask;

                return string.IsNullOrWhiteSpace(stdout) ? stderr.Trim() : stdout.Trim();
            }
            catch (Exception ex)
            {
                return $"Error: {ex.Message}";
            }
        }

        public async Task<List<DeviceInfo>> GetConnectedDevicesAsync()
        {
            var rawOutput = await RunAdbCommandAsync("devices -l", 4000);
            var list = new List<DeviceInfo>();

            if (string.IsNullOrWhiteSpace(rawOutput) || rawOutput.StartsWith("Error"))
                return list;

            var lines = rawOutput.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            var deviceLines = lines.Skip(1).Where(l => !string.IsNullOrWhiteSpace(l) && !l.StartsWith("*"));

            foreach (var line in deviceLines)
            {
                var match = Regex.Match(line.Trim(), @"^(\S+)\s+(\w+)(.*)$");
                if (!match.Success) continue;

                var serial = match.Groups[1].Value.Trim();
                var state = match.Groups[2].Value.Trim();
                var details = match.Groups[3].Value;

                var isWifi = serial.Contains(":") || serial.Contains(".5555");

                var modelMatch = Regex.Match(details, @"model:(\S+)");
                var productMatch = Regex.Match(details, @"product:(\S+)");
                var deviceMatch = Regex.Match(details, @"device:(\S+)");

                var model = modelMatch.Success ? modelMatch.Groups[1].Value.Replace("_", " ") : "";
                var product = productMatch.Success ? productMatch.Groups[1].Value : "";
                var deviceName = deviceMatch.Success ? deviceMatch.Groups[1].Value : "";

                var device = new DeviceInfo
                {
                    Serial = serial,
                    State = state,
                    Model = string.IsNullOrEmpty(model) ? (isWifi ? $"WiFi ({serial})" : serial) : model,
                    Product = product,
                    DeviceName = deviceName,
                    IsWifi = isWifi
                };

                list.Add(device);
            }

            // Enrich device details quickly
            for (int i = 0; i < list.Count; i++)
            {
                if (list[i].State.Equals("device", StringComparison.OrdinalIgnoreCase))
                {
                    await EnrichDeviceFastAsync(list[i]);
                }
            }

            return list;
        }

        private async Task EnrichDeviceFastAsync(DeviceInfo device)
        {
            try
            {
                var s = device.Serial;

                // Model name
                if (string.IsNullOrEmpty(device.Model) || device.Model == device.Serial || device.Model.StartsWith("WiFi ("))
                {
                    var mod = await RunAdbCommandAsync($"-s {s} shell getprop ro.product.model", 1500);
                    if (!string.IsNullOrWhiteSpace(mod) && !mod.StartsWith("Error"))
                    {
                        device.Model = mod.Trim().Replace("_", " ");
                    }
                }

                // Android version
                var version = await RunAdbCommandAsync($"-s {s} shell getprop ro.build.version.release", 1500);
                if (!string.IsNullOrWhiteSpace(version) && !version.StartsWith("Error"))
                {
                    device.AndroidVersion = $"Android {version.Trim()}";
                }

                // IP Address
                if (device.IsWifi)
                {
                    device.IpAddress = device.Serial.Split(':')[0];
                }
            }
            catch { }
        }

        public async Task<string> GetDeviceIpAsync(string serial)
        {
            var route = await RunAdbCommandAsync($"-s {serial} shell ip route", 2000);
            var m = Regex.Match(route, @"src\s+(\d+\.\d+\.\d+\.\d+)");
            if (m.Success)
                return m.Groups[1].Value;

            var wlan = await RunAdbCommandAsync($"-s {serial} shell ip -f inet addr show wlan0", 2000);
            var m2 = Regex.Match(wlan, @"inet\s+(\d+\.\d+\.\d+\.\d+)");
            if (m2.Success)
                return m2.Groups[1].Value;

            return string.Empty;
        }

        public async Task<(bool Success, string Message, string? WifiSerial)> SwitchToWifiAsync(string usbSerial)
        {
            var ip = await GetDeviceIpAsync(usbSerial);
            if (string.IsNullOrWhiteSpace(ip))
            {
                return (false, "Could not automatically detect mobile Wi-Fi IP. Ensure phone is connected to the same Wi-Fi.", null);
            }

            var tcpRes = await RunAdbCommandAsync($"-s {usbSerial} tcpip 5555", 5000);
            if (tcpRes.Contains("error", StringComparison.OrdinalIgnoreCase))
            {
                return (false, $"Failed to enable TCP/IP mode: {tcpRes}", null);
            }

            await Task.Delay(1000);

            var connRes = await RunAdbCommandAsync($"connect {ip}:5555", 6000);
            if (connRes.Contains("connected", StringComparison.OrdinalIgnoreCase) && !connRes.Contains("unable"))
            {
                return (true, $"Connected to {ip}:5555 over Wi-Fi! You can now unplug the USB cable.", $"{ip}:5555");
            }

            return (false, $"Connection attempt to {ip}:5555 failed: {connRes}", null);
        }

        public async Task<(bool Success, string Message)> ConnectWifiAsync(string ip, int port = 5555)
        {
            if (string.IsNullOrWhiteSpace(ip))
                return (false, "IP address cannot be empty.");

            var target = ip.Contains(":") ? ip.Trim() : $"{ip.Trim()}:{port}";
            var res = await RunAdbCommandAsync($"connect {target}", 8000);

            if (res.Contains("connected to", StringComparison.OrdinalIgnoreCase) && !res.Contains("unable") && !res.Contains("failed"))
            {
                return (true, $"Connected to {target}");
            }

            return (false, res);
        }

        public async Task<bool> DisconnectWifiAsync(string serial)
        {
            var res = await RunAdbCommandAsync($"disconnect {serial}", 4000);
            return res.Contains("disconnected", StringComparison.OrdinalIgnoreCase);
        }

        public async Task<List<DeviceFileItem>> ListDirectoryAsync(string serial, string remotePath)
        {
            var cleanPath = string.IsNullOrWhiteSpace(remotePath) ? "/sdcard/" : remotePath;
            if (!cleanPath.EndsWith("/")) cleanPath += "/";

            var raw = await RunAdbCommandAsync($"-s {serial} shell ls -la \"{cleanPath}\"", 5000);
            var list = new List<DeviceFileItem>();

            if (string.IsNullOrWhiteSpace(raw)) return list;

            var lines = raw.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var line in lines)
            {
                var trimmed = line.Trim();
                if (trimmed.StartsWith("total") || trimmed.StartsWith("Error")) continue;

                var parts = trimmed.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 6) continue;

                var perms = parts[0];
                var isDir = perms.StartsWith("d") || perms.StartsWith("l");

                string name;
                long size = 0;
                string date = "";

                if (parts.Length >= 8)
                {
                    long.TryParse(parts[4], out size);
                    date = $"{parts[5]} {parts[6]}";
                    name = string.Join(" ", parts.Skip(7));
                }
                else
                {
                    name = parts[^1];
                }

                if (name == "." || name == "..") continue;

                if (name.Contains(" -> "))
                    name = name.Split(" -> ")[0];

                list.Add(new DeviceFileItem
                {
                    Name = name,
                    Path = cleanPath + name,
                    IsDirectory = isDir,
                    SizeBytes = size,
                    SizeDisplay = isDir ? "<DIR>" : FormatBytes(size),
                    ModifiedTime = date,
                    Permissions = perms
                });
            }

            return list.OrderByDescending(f => f.IsDirectory).ThenBy(f => f.Name).ToList();
        }

        public async Task<(bool Success, string Message)> PushFileAsync(string serial, string localFile, string remoteDir)
        {
            if (!File.Exists(localFile) && !Directory.Exists(localFile))
                return (false, "Local file not found.");

            var res = await RunAdbCommandAsync($"-s {serial} push \"{localFile}\" \"{remoteDir}\"", 120000);
            if (res.Contains("error", StringComparison.OrdinalIgnoreCase) || res.Contains("failed", StringComparison.OrdinalIgnoreCase))
            {
                return (false, res);
            }
            return (true, "Transfer complete!");
        }

        public async Task<(bool Success, string Message)> PullFileAsync(string serial, string remotePath, string localDir)
        {
            if (!Directory.Exists(localDir))
                Directory.CreateDirectory(localDir);

            var res = await RunAdbCommandAsync($"-s {serial} pull \"{remotePath}\" \"{localDir}\"", 120000);
            if (res.Contains("error", StringComparison.OrdinalIgnoreCase) || res.Contains("failed", StringComparison.OrdinalIgnoreCase))
            {
                return (false, res);
            }
            return (true, "File downloaded to PC successfully!");
        }

        public async Task<(bool Success, string Message)> InstallApkAsync(string serial, string apkPath)
        {
            if (!File.Exists(apkPath))
                return (false, "APK file not found.");

            var res = await RunAdbCommandAsync($"-s {serial} install -r \"{apkPath}\"", 90000);
            if (res.Contains("Success", StringComparison.OrdinalIgnoreCase))
            {
                return (true, "APK installed successfully!");
            }
            return (false, $"Install failed: {res}");
        }

        public async Task<(bool Success, string FilePath, string Error)> TakeScreenshotAsync(string serial, string? outputDir = null)
        {
            var dir = string.IsNullOrWhiteSpace(outputDir) ? PathResolver.GetDefaultScreenshotsDirectory() : outputDir;
            if (!Directory.Exists(dir))
                Directory.CreateDirectory(dir);

            var filename = $"Screenshot_{DateTime.Now:yyyyMMdd_HHmmss}.png";
            var fullPath = Path.Combine(dir, filename);

            var adbExe = PathResolver.GetAdbPath();
            var binDir = PathResolver.GetScrcpyBinDirectory();

            var psi = new ProcessStartInfo
            {
                FileName = adbExe,
                Arguments = $"-s {serial} exec-out screencap -p",
                WorkingDirectory = binDir,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            try
            {
                using var proc = new Process { StartInfo = psi };
                proc.Start();

                using (var fs = new FileStream(fullPath, FileMode.Create, FileAccess.Write, FileShare.None))
                {
                    await proc.StandardOutput.BaseStream.CopyToAsync(fs);
                }

                await Task.Run(() => proc.WaitForExit(8000));

                if (File.Exists(fullPath) && new FileInfo(fullPath).Length > 1000)
                {
                    return (true, fullPath, string.Empty);
                }

                return (false, string.Empty, "Screenshot file is empty.");
            }
            catch (Exception ex)
            {
                return (false, string.Empty, ex.Message);
            }
        }

        public Task SendKeyEventAsync(string serial, int keyCode) =>
            RunAdbCommandAsync($"-s {serial} shell input keyevent {keyCode}", 2000);

        public Task SendTextAsync(string serial, string text)
        {
            var escaped = text.Replace(" ", "%s").Replace("&", "\\&").Replace("<", "\\<").Replace(">", "\\>");
            return RunAdbCommandAsync($"-s {serial} shell input text \"{escaped}\"", 2000);
        }

        public Task OpenUrlAsync(string serial, string url)
        {
            if (!url.StartsWith("http://") && !url.StartsWith("https://"))
                url = "https://" + url;
            return RunAdbCommandAsync($"-s {serial} shell am start -a android.intent.action.VIEW -d \"{url}\"", 3000);
        }

        public Task ToggleScreenPowerAsync(string serial) => SendKeyEventAsync(serial, 26);
        public Task NavHomeAsync(string serial) => SendKeyEventAsync(serial, 3);
        public Task NavBackAsync(string serial) => SendKeyEventAsync(serial, 4);
        public Task NavRecentsAsync(string serial) => SendKeyEventAsync(serial, 187);
        public Task VolumeUpAsync(string serial) => SendKeyEventAsync(serial, 24);
        public Task VolumeDownAsync(string serial) => SendKeyEventAsync(serial, 25);
        public Task VolumeMuteAsync(string serial) => SendKeyEventAsync(serial, 164);

        public Task ExpandNotificationsAsync(string serial) =>
            RunAdbCommandAsync($"-s {serial} shell cmd statusbar expand-notifications", 2000);

        public Task CollapseNotificationsAsync(string serial) =>
            RunAdbCommandAsync($"-s {serial} shell cmd statusbar collapse", 2000);

        public Task<string> ExecuteShellCommandAsync(string serial, string command) =>
            RunAdbCommandAsync($"-s {serial} shell {command}", 8000);

        public async Task RestartServerAsync()
        {
            await RunAdbCommandAsync("kill-server", 3000);
            await RunAdbCommandAsync("start-server", 5000);
        }

        private static string FormatBytes(long bytes)
        {
            if (bytes < 1024) return $"{bytes} B";
            if (bytes < 1024 * 1024) return $"{bytes / 1024.0:F1} KB";
            if (bytes < 1024 * 1024 * 1024) return $"{bytes / (1024.0 * 1024):F1} MB";
            return $"{bytes / (1024.0 * 1024 * 1024):F2} GB";
        }
    }
}
