using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using StreamFusion.Models;

namespace StreamFusion.Services
{
    public class AppSettings
    {
        public MirrorConfig Config { get; set; } = new();
        public List<string> RecentWifiIps { get; set; } = new();
        public string LastConnectedSerial { get; set; } = string.Empty;
        public bool AutoRefreshDevices { get; set; } = true;
        public int RefreshIntervalSeconds { get; set; } = 3;
    }

    public class SettingsService
    {
        private static readonly string SettingsFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "StreamFusion");
        private static readonly string SettingsFile = Path.Combine(SettingsFolder, "config.json");

        public AppSettings Current { get; private set; } = new();

        public SettingsService()
        {
            Load();
        }

        public void Load()
        {
            try
            {
                if (File.Exists(SettingsFile))
                {
                    var json = File.ReadAllText(SettingsFile);
                    var loaded = JsonSerializer.Deserialize<AppSettings>(json);
                    if (loaded != null)
                    {
                        Current = loaded;
                        return;
                    }
                }
            }
            catch { }

            Current = new AppSettings();
        }

        public void Save()
        {
            try
            {
                if (!Directory.Exists(SettingsFolder))
                    Directory.CreateDirectory(SettingsFolder);

                var json = JsonSerializer.Serialize(Current, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(SettingsFile, json);
            }
            catch { }
        }

        public void ApplyPreset(string presetName)
        {
            var cfg = Current.Config;
            cfg.ProfileName = presetName;

            switch (presetName)
            {
                case "Gaming (120 FPS)":
                    cfg.ResolutionPreset = "1080p";
                    cfg.MaxSize = 1080;
                    cfg.BitrateMbps = 16;
                    cfg.MaxFps = 120;
                    cfg.VideoCodec = "h264";
                    cfg.AudioEnabled = true;
                    cfg.AudioCodec = "raw";
                    cfg.AudioBufferMs = 20;
                    cfg.StayAwake = true;
                    break;

                case "Ultra Quality":
                    cfg.ResolutionPreset = "Native";
                    cfg.MaxSize = 0; // 0 = native / no cap
                    cfg.BitrateMbps = 24;
                    cfg.MaxFps = 60;
                    cfg.VideoCodec = "h265";
                    cfg.AudioEnabled = true;
                    cfg.AudioCodec = "aac";
                    cfg.AudioBitrateKbps = 256;
                    cfg.AudioBufferMs = 80;
                    break;

                case "Ultra Low Latency":
                    cfg.ResolutionPreset = "720p";
                    cfg.MaxSize = 720;
                    cfg.BitrateMbps = 4;
                    cfg.MaxFps = 60;
                    cfg.VideoCodec = "h264";
                    cfg.AudioEnabled = true;
                    cfg.AudioCodec = "opus";
                    cfg.AudioBufferMs = 15;
                    break;

                case "Wireless Smooth":
                    cfg.ResolutionPreset = "720p";
                    cfg.MaxSize = 720;
                    cfg.BitrateMbps = 4;
                    cfg.MaxFps = 30;
                    cfg.VideoCodec = "h264";
                    cfg.AudioEnabled = true;
                    cfg.AudioCodec = "opus";
                    cfg.AudioBufferMs = 100;
                    break;

                case "Balanced":
                default:
                    cfg.ResolutionPreset = "1080p";
                    cfg.MaxSize = 1080;
                    cfg.BitrateMbps = 8;
                    cfg.MaxFps = 60;
                    cfg.VideoCodec = "h264";
                    cfg.AudioEnabled = true;
                    cfg.AudioCodec = "opus";
                    cfg.AudioBitrateKbps = 128;
                    cfg.AudioBufferMs = 50;
                    cfg.StayAwake = true;
                    break;
            }

            Save();
        }
    }
}
