using System;
using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace StreamFusion.Models
{
    public class DeviceInfo : INotifyPropertyChanged
    {
        private string _serial = string.Empty;
        private string _model = string.Empty;
        private string _product = string.Empty;
        private string _deviceName = string.Empty;
        private string _state = "device";
        private bool _isWifi;
        private string _ipAddress = string.Empty;
        private int _batteryPercent = -1;
        private string _resolution = string.Empty;
        private string _androidVersion = string.Empty;
        private bool _isMirroring;

        public string Serial
        {
            get => _serial;
            set { _serial = value; OnPropertyChanged(); OnPropertyChanged(nameof(DisplayName)); }
        }

        public string Model
        {
            get => _model;
            set { _model = value; OnPropertyChanged(); OnPropertyChanged(nameof(DisplayName)); }
        }

        public string Product
        {
            get => _product;
            set { _product = value; OnPropertyChanged(); }
        }

        public string DeviceName
        {
            get => _deviceName;
            set { _deviceName = value; OnPropertyChanged(); }
        }

        public string State
        {
            get => _state;
            set { _state = value; OnPropertyChanged(); }
        }

        public bool IsWifi
        {
            get => _isWifi;
            set { _isWifi = value; OnPropertyChanged(); OnPropertyChanged(nameof(ConnectionTypeBadge)); }
        }

        public string IpAddress
        {
            get => _ipAddress;
            set { _ipAddress = value; OnPropertyChanged(); }
        }

        public int BatteryPercent
        {
            get => _batteryPercent;
            set { _batteryPercent = value; OnPropertyChanged(); OnPropertyChanged(nameof(BatteryDisplay)); }
        }

        public string Resolution
        {
            get => _resolution;
            set { _resolution = value; OnPropertyChanged(); }
        }

        public string AndroidVersion
        {
            get => _androidVersion;
            set { _androidVersion = value; OnPropertyChanged(); }
        }

        public bool IsMirroring
        {
            get => _isMirroring;
            set { _isMirroring = value; OnPropertyChanged(); }
        }

        public string DisplayName => string.IsNullOrWhiteSpace(Model) ? Serial : Model;
        public string ConnectionTypeBadge => IsWifi ? "WiFi Wireless" : "USB Cable";
        public string BatteryDisplay => BatteryPercent >= 0 ? $"{BatteryPercent}%" : "Unknown";

        public event PropertyChangedEventHandler? PropertyChanged;
        protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }

    public class MirrorConfig
    {
        public string ProfileName { get; set; } = "Balanced";
        public string ResolutionPreset { get; set; } = "1080p";
        public int MaxSize { get; set; } = 1080;
        public int BitrateMbps { get; set; } = 8;
        public int MaxFps { get; set; } = 60;
        public string VideoCodec { get; set; } = "h264";

        public bool AudioEnabled { get; set; } = true;
        public string AudioCodec { get; set; } = "opus";
        public int AudioBitrateKbps { get; set; } = 128;
        public string AudioSource { get; set; } = "output";
        public int AudioBufferMs { get; set; } = 50;
        public bool AudioOnly { get; set; } = false;

        public bool AlwaysOnTop { get; set; } = false;
        public bool Borderless { get; set; } = false;
        public bool Fullscreen { get; set; } = false;
        public bool TurnScreenOff { get; set; } = false;
        public bool StayAwake { get; set; } = true;
        public bool ShowTouches { get; set; } = false;
        public int LockOrientation { get; set; } = -1; // -1 = unlocked, 0, 1, 2, 3
        public bool PowerOffOnClose { get; set; } = false;

        public string RecordFormat { get; set; } = "mp4";
        public string CustomRecordDirectory { get; set; } = string.Empty;
    }

    public class DeviceFileItem
    {
        public string Name { get; set; } = string.Empty;
        public string Path { get; set; } = string.Empty;
        public bool IsDirectory { get; set; }
        public long SizeBytes { get; set; }
        public string SizeDisplay { get; set; } = string.Empty;
        public string ModifiedTime { get; set; } = string.Empty;
        public string Permissions { get; set; } = string.Empty;
        public string IconKind => IsDirectory ? "📁" : GetFileIcon(Name);

        private static string GetFileIcon(string filename)
        {
            var ext = System.IO.Path.GetExtension(filename).ToLowerInvariant();
            return ext switch
            {
                ".mp4" or ".mkv" or ".mov" or ".avi" or ".webm" => "🎬",
                ".jpg" or ".jpeg" or ".png" or ".webp" or ".gif" or ".bmp" => "🖼️",
                ".mp3" or ".flac" or ".wav" or ".m4a" or ".aac" or ".ogg" => "🎵",
                ".apk" => "📦",
                ".zip" or ".rar" or ".7z" or ".tar" or ".gz" => "🗜️",
                ".pdf" => "📕",
                ".txt" or ".log" or ".json" or ".xml" or ".csv" => "📄",
                ".doc" or ".docx" => "📘",
                ".xls" or ".xlsx" => "📗",
                _ => "📄"
            };
        }
    }

    public class RecordingItem
    {
        public string FileName { get; set; } = string.Empty;
        public string FullPath { get; set; } = string.Empty;
        public string FileSize { get; set; } = string.Empty;
        public DateTime DateCreated { get; set; }
        public string DateDisplay => DateCreated.ToString("yyyy-MM-dd HH:mm:ss");
    }
}
