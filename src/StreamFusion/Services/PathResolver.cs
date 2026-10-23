using System;
using System.IO;

namespace StreamFusion.Services
{
    public static class PathResolver
    {
        private static string? _scrcpyBinPath;
        private static string? _adbPath;
        private static string? _scrcpyPath;

        public static string GetScrcpyBinDirectory()
        {
            if (_scrcpyBinPath != null && Directory.Exists(_scrcpyBinPath))
                return _scrcpyBinPath;

            var baseDir = AppDomain.CurrentDomain.BaseDirectory;

            // Search potential locations
            string[] candidateDirs = new[]
            {
                Path.Combine(baseDir, "scrcpy-bin"),
                Path.Combine(baseDir, "..", "..", "..", "..", "scrcpy-bin"),
                Path.Combine(baseDir, "..", "..", "..", "scrcpy-bin"),
                Path.Combine(baseDir, "..", "scrcpy-bin"),
                @"Z:\StreamFusion\scrcpy-bin",
                @"Z:\StreamFusion\scrcpy-win64-v5.0.1\scrcpy-win64-v5.0.1"
            };

            foreach (var dir in candidateDirs)
            {
                var full = Path.GetFullPath(dir);
                if (Directory.Exists(full) && File.Exists(Path.Combine(full, "scrcpy.exe")) && File.Exists(Path.Combine(full, "adb.exe")))
                {
                    _scrcpyBinPath = full;
                    _scrcpyPath = Path.Combine(full, "scrcpy.exe");
                    _adbPath = Path.Combine(full, "adb.exe");
                    return _scrcpyBinPath;
                }
            }

            // Fallback to base directory
            _scrcpyBinPath = baseDir;
            _scrcpyPath = Path.Combine(baseDir, "scrcpy.exe");
            _adbPath = Path.Combine(baseDir, "adb.exe");
            return _scrcpyBinPath;
        }

        public static string GetAdbPath()
        {
            if (_adbPath == null || !File.Exists(_adbPath))
                GetScrcpyBinDirectory();
            return _adbPath ?? "adb.exe";
        }

        public static string GetScrcpyPath()
        {
            if (_scrcpyPath == null || !File.Exists(_scrcpyPath))
                GetScrcpyBinDirectory();
            return _scrcpyPath ?? "scrcpy.exe";
        }

        public static string GetDefaultRecordingDirectory()
        {
            var videos = Environment.GetFolderPath(Environment.SpecialFolder.MyVideos);
            if (string.IsNullOrEmpty(videos))
                videos = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Videos");
            var target = Path.Combine(videos, "StreamFusion");
            if (!Directory.Exists(target))
            {
                try { Directory.CreateDirectory(target); } catch { }
            }
            return target;
        }

        public static string GetDefaultScreenshotsDirectory()
        {
            var pictures = Environment.GetFolderPath(Environment.SpecialFolder.MyPictures);
            if (string.IsNullOrEmpty(pictures))
                pictures = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Pictures");
            var target = Path.Combine(pictures, "StreamFusion");
            if (!Directory.Exists(target))
            {
                try { Directory.CreateDirectory(target); } catch { }
            }
            return target;
        }
    }
}
