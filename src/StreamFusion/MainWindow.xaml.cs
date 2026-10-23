using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Win32;
using StreamFusion.Models;
using StreamFusion.Services;

namespace StreamFusion
{
    public partial class MainWindow : Window
    {
        private readonly AdbService _adbService = new();
        private readonly ScrcpyService _scrcpyService = new();
        private readonly SettingsService _settingsService = new();
        private readonly DispatcherTimer _devicePollTimer = new();
        private readonly DispatcherTimer _toastTimer = new();

        private List<DeviceInfo> _connectedDevices = new();
        private DeviceInfo? _selectedDevice;
        private string _currentRemoteDir = "/sdcard/Download/";
        private bool _isRecordingActive;
        private string? _activeRecordingFile;

        public MainWindow()
        {
            InitializeComponent();

            // Setup Services & Events
            _scrcpyService.MirrorStarted += Scrcpy_MirrorStarted;
            _scrcpyService.MirrorStopped += Scrcpy_MirrorStopped;
            _scrcpyService.OutputReceived += Scrcpy_OutputReceived;

            // Setup Device Polling Timer (every 3 seconds)
            _devicePollTimer.Interval = TimeSpan.FromSeconds(3);
            _devicePollTimer.Tick += async (s, e) => await RefreshDevicesAsync(silent: true);
            _devicePollTimer.Start();

            // Setup Toast Timer
            _toastTimer.Interval = TimeSpan.FromSeconds(3.5);
            _toastTimer.Tick += (s, e) =>
            {
                ToastBanner.Visibility = Visibility.Collapsed;
                _toastTimer.Stop();
            };

            // Initialize UI with settings & guides
            Loaded += MainWindow_Loaded;
        }

        private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
        {
            try
            {
                var iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Assets", "app.ico");
                if (File.Exists(iconPath))
                    Icon = new System.Windows.Media.Imaging.BitmapImage(new Uri(iconPath));

                var logoPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Assets", "StreamFusion.png");
                if (File.Exists(logoPath))
                    ImgAppLogo.Source = new System.Windows.Media.Imaging.BitmapImage(new Uri(logoPath));
            }
            catch { }

            LoadSettingsIntoUI();
            LoadGuideArticles();
            TxtRecordFolder.Text = PathResolver.GetDefaultRecordingDirectory();
            RefreshRecordingsGallery();

            // Run device check in background so window renders immediately!
            _ = Dispatcher.InvokeAsync(async () => await RefreshDevicesAsync(silent: true), DispatcherPriority.Background);
        }

        // ==========================================
        // WINDOW TITLE BAR & CONTROLS
        // ==========================================
        private void TitleBar_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
            {
                if (e.ClickCount == 2)
                {
                    BtnMaximize_Click(sender, e);
                }
                else
                {
                    DragMove();
                }
            }
        }

        private void BtnMinimize_Click(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;

        private void BtnMaximize_Click(object sender, RoutedEventArgs e) =>
            WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;

        private void BtnClose_Click(object sender, RoutedEventArgs e)
        {
            _scrcpyService.StopMirror();
            _devicePollTimer.Stop();
            Application.Current.Shutdown();
        }

        // ==========================================
        // SIDEBAR NAVIGATION
        // ==========================================
        private void Nav_Checked(object sender, RoutedEventArgs e)
        {
            if (sender is not RadioButton rb || rb.Tag is not string tag) return;

            // Hide all panels
            PanelDevices.Visibility = Visibility.Collapsed;
            PanelControls.Visibility = Visibility.Collapsed;
            PanelFiles.Visibility = Visibility.Collapsed;
            PanelAudio.Visibility = Visibility.Collapsed;
            PanelSettings.Visibility = Visibility.Collapsed;
            PanelGuide.Visibility = Visibility.Collapsed;

            // Show selected panel
            switch (tag)
            {
                case "Devices":
                    PanelDevices.Visibility = Visibility.Visible;
                    break;
                case "Controls":
                    PanelControls.Visibility = Visibility.Visible;
                    break;
                case "Files":
                    PanelFiles.Visibility = Visibility.Visible;
                    if (_selectedDevice != null && ListRemoteFiles.Items.Count == 0)
                        _ = LoadRemoteDirectoryAsync(_currentRemoteDir);
                    break;
                case "Audio":
                    PanelAudio.Visibility = Visibility.Visible;
                    RefreshRecordingsGallery();
                    break;
                case "Settings":
                    PanelSettings.Visibility = Visibility.Visible;
                    break;
                case "Guide":
                    PanelGuide.Visibility = Visibility.Visible;
                    if (ListGuideArticles.SelectedIndex < 0 && ListGuideArticles.Items.Count > 0)
                        ListGuideArticles.SelectedIndex = 0;
                    break;
            }
        }

        // ==========================================
        // DEVICE MANAGEMENT & MIRRORING
        // ==========================================
        private async Task RefreshDevicesAsync(bool silent = false)
        {
            try
            {
                var devices = await _adbService.GetConnectedDevicesAsync();
                _connectedDevices = devices;
                ListDevices.ItemsSource = _connectedDevices;

                if (_connectedDevices.Count == 0)
                {
                    CardNoDevices.Visibility = Visibility.Visible;
                    TxtActiveDeviceTitle.Text = "No Devices Connected";
                    DotDeviceStatus.Fill = (SolidColorBrush)FindResource("BrushYellow");
                    TxtSidebarDeviceName.Text = "No device connected";
                    TxtSidebarDeviceDetails.Text = "Plug in USB or connect via Wi-Fi";
                    BtnQuickMirror.IsEnabled = false;
                    _selectedDevice = null;
                }
                else
                {
                    CardNoDevices.Visibility = Visibility.Collapsed;

                    // Select first or keep selected
                    if (_selectedDevice == null || !_connectedDevices.Any(d => d.Serial == _selectedDevice.Serial))
                    {
                        _selectedDevice = _connectedDevices.First();
                    }
                    else
                    {
                        _selectedDevice = _connectedDevices.First(d => d.Serial == _selectedDevice.Serial);
                    }

                    TxtActiveDeviceTitle.Text = $"{_selectedDevice.DisplayName} ({(_selectedDevice.IsWifi ? "Wi-Fi" : "USB")})";
                    DotDeviceStatus.Fill = (SolidColorBrush)FindResource("BrushGreen");
                    TxtSidebarDeviceName.Text = _selectedDevice.DisplayName;
                    TxtSidebarDeviceDetails.Text = $"{_selectedDevice.ConnectionTypeBadge} · Battery: {_selectedDevice.BatteryDisplay}";
                    BtnQuickMirror.IsEnabled = true;

                    if (!silent)
                    {
                        ShowToast($"Found {_connectedDevices.Count} connected device(s).", "📱");
                    }
                }
            }
            catch (Exception ex)
            {
                if (!silent) ShowToast($"Error refreshing devices: {ex.Message}", "⚠️");
            }
        }

        private async void BtnRefreshDevices_Click(object sender, RoutedEventArgs e)
        {
            await RefreshDevicesAsync();
        }

        private async void BtnQuickMirror_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedDevice == null) return;
            await StartMirrorOnDeviceAsync(_selectedDevice);
        }

        private async void BtnDeviceMirror_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is DeviceInfo dev)
            {
                _selectedDevice = dev;
                await StartMirrorOnDeviceAsync(dev);
            }
        }

        private async Task StartMirrorOnDeviceAsync(DeviceInfo dev, string? recordFile = null)
        {
            if (_scrcpyService.IsMirroring)
            {
                ShowToast("Mirror session is already running. Stop it before starting a new one.", "⚠️");
                return;
            }

            var config = BuildCurrentConfig();
            ShowToast($"Starting mirror for {dev.DisplayName}...", "▶");

            var res = await _scrcpyService.StartMirrorAsync(dev, config, recordFile);
            if (!res.Success)
            {
                ShowToast(res.Message, "❌");
            }
        }

        private void BtnStopMirror_Click(object sender, RoutedEventArgs e)
        {
            _scrcpyService.StopMirror();
            ShowToast("Mirroring stopped.", "⏹");
        }

        private void Scrcpy_MirrorStarted(object? sender, EventArgs e)
        {
            Dispatcher.Invoke(() =>
            {
                BadgeMirrorStatus.Visibility = Visibility.Visible;
                CardActiveMirroring.Visibility = Visibility.Visible;
                TxtActiveMirrorInfo.Text = $"Streaming active: {_scrcpyService.ActiveModel ?? "Device"}";
                BtnQuickMirror.Content = "⏹ Stop Mirror";
            });
        }

        private void Scrcpy_MirrorStopped(object? sender, EventArgs e)
        {
            Dispatcher.Invoke(() =>
            {
                BadgeMirrorStatus.Visibility = Visibility.Collapsed;
                CardActiveMirroring.Visibility = Visibility.Collapsed;
                BtnQuickMirror.Content = "▶ Start Mirror";
                _isRecordingActive = false;
                BtnQuickRecord.Content = "⏺️ Record Session";
                BtnRecordStudio.Content = "⏺️ Start Mirror & Record";

                if (!string.IsNullOrEmpty(_activeRecordingFile) && File.Exists(_activeRecordingFile))
                {
                    ShowToast($"Recording saved successfully!", "🎬");
                    RefreshRecordingsGallery();
                    _activeRecordingFile = null;
                }
            });
        }

        private void Scrcpy_OutputReceived(object? sender, string output)
        {
            // Log to terminal output if interesting
            Dispatcher.Invoke(() =>
            {
                if (output.Contains("WARN") || output.Contains("ERROR") || output.Contains("INFO"))
                {
                    TxtTerminalOutput.AppendText($"[scrcpy] {output}\n");
                    TxtTerminalOutput.ScrollToEnd();
                }
            });
        }

        // ==========================================
        // WI-FI SWITCH & CONNECT
        // ==========================================
        private async void BtnDeviceSwitchWifi_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is DeviceInfo dev)
            {
                if (dev.IsWifi)
                {
                    ShowToast("This device is already connected via Wi-Fi!", "ℹ️");
                    return;
                }

                ShowToast($"Detecting IP and switching {dev.DisplayName} to Wi-Fi...", "⚡");
                var res = await _adbService.SwitchToWifiAsync(dev.Serial);
                if (res.Success)
                {
                    ShowToast(res.Message, "✅", 6000);
                    await RefreshDevicesAsync();
                }
                else
                {
                    ShowToast(res.Message, "⚠️", 6000);
                }
            }
        }

        private void BtnOpenWifiModal_Click(object sender, RoutedEventArgs e)
        {
            ModalWifiConnect.Visibility = Visibility.Visible;
            if (_selectedDevice != null && !string.IsNullOrEmpty(_selectedDevice.IpAddress))
            {
                TxtWifiIpInput.Text = _selectedDevice.IpAddress;
            }
        }

        private void BtnCancelWifiModal_Click(object sender, RoutedEventArgs e)
        {
            ModalWifiConnect.Visibility = Visibility.Collapsed;
        }

        private async void BtnSubmitWifiConnect_Click(object sender, RoutedEventArgs e)
        {
            var ip = TxtWifiIpInput.Text.Trim();
            int.TryParse(TxtWifiPortInput.Text.Trim(), out int port);
            if (port <= 0) port = 5555;

            if (string.IsNullOrWhiteSpace(ip))
            {
                ShowToast("Please enter a valid IP address.", "⚠️");
                return;
            }

            ModalWifiConnect.Visibility = Visibility.Collapsed;
            ShowToast($"Connecting to {ip}:{port} over Wi-Fi...", "📶");

            var res = await _adbService.ConnectWifiAsync(ip, port);
            if (res.Success)
            {
                ShowToast($"Connected successfully to {ip}:{port}!", "✅");
                await RefreshDevicesAsync();
            }
            else
            {
                ShowToast($"Wi-Fi connection failed: {res.Message}", "❌", 5000);
            }
        }

        // ==========================================
        // REMOTE CONTROLS & TERMINAL
        // ==========================================
        private async void BtnKeyHome_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedDevice == null) return;
            await _adbService.NavHomeAsync(_selectedDevice.Serial);
        }

        private async void BtnKeyBack_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedDevice == null) return;
            await _adbService.NavBackAsync(_selectedDevice.Serial);
        }

        private async void BtnKeyRecents_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedDevice == null) return;
            await _adbService.NavRecentsAsync(_selectedDevice.Serial);
        }

        private async void BtnVolumeUp_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedDevice == null) return;
            await _adbService.VolumeUpAsync(_selectedDevice.Serial);
        }

        private async void BtnVolumeDown_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedDevice == null) return;
            await _adbService.VolumeDownAsync(_selectedDevice.Serial);
        }

        private async void BtnPowerToggle_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedDevice == null) return;
            await _adbService.ToggleScreenPowerAsync(_selectedDevice.Serial);
        }

        private async void BtnExpandNotifs_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedDevice == null) return;
            await _adbService.ExpandNotificationsAsync(_selectedDevice.Serial);
        }

        private async void BtnTakeScreenshot_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedDevice == null)
            {
                ShowToast("No device selected for screenshot.", "⚠️");
                return;
            }

            ShowToast("Capturing mobile screenshot...", "📷");
            var res = await _adbService.TakeScreenshotAsync(_selectedDevice.Serial);
            if (res.Success)
            {
                ShowToast($"Screenshot saved: {Path.GetFileName(res.FilePath)}", "✅");
                // Open file preview
                try
                {
                    Process.Start(new ProcessStartInfo(res.FilePath) { UseShellExecute = true });
                }
                catch { }
            }
            else
            {
                ShowToast($"Screenshot failed: {res.Error}", "❌");
            }
        }

        private async void BtnSendTextToPhone_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedDevice == null) return;
            var text = TxtSendPhoneInput.Text;
            if (string.IsNullOrEmpty(text)) return;

            await _adbService.SendTextAsync(_selectedDevice.Serial, text);
            ShowToast("Text sent to phone input.", "✉️");
            TxtSendPhoneInput.Clear();
        }

        private async void BtnOpenUrlOnPhone_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedDevice == null) return;
            var url = TxtSendUrlInput.Text.Trim();
            if (string.IsNullOrEmpty(url)) return;

            await _adbService.OpenUrlAsync(_selectedDevice.Serial, url);
            ShowToast($"Opening {url} on phone browser...", "🌐");
        }

        private async void BtnRunShellCommand_Click(object sender, RoutedEventArgs e)
        {
            await RunShellCommandAsync();
        }

        private async void TxtTerminalInput_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                await RunShellCommandAsync();
            }
        }

        private async Task RunShellCommandAsync()
        {
            if (_selectedDevice == null)
            {
                TxtTerminalOutput.AppendText("Error: No device connected.\n");
                return;
            }

            var cmd = TxtTerminalInput.Text.Trim();
            if (string.IsNullOrEmpty(cmd)) return;

            TxtTerminalInput.Clear();
            TxtTerminalOutput.AppendText($"$ {cmd}\n");

            var output = await _adbService.ExecuteShellCommandAsync(_selectedDevice.Serial, cmd);
            TxtTerminalOutput.AppendText($"{output}\n\n");
            TxtTerminalOutput.ScrollToEnd();
        }

        // ==========================================
        // FILE TRANSFER & DRAG AND DROP
        // ==========================================
        private void Window_DragOver(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
                e.Effects = DragDropEffects.Copy;
            else
                e.Effects = DragDropEffects.None;
            e.Handled = true;
        }

        private void DropZone_DragOver(object sender, DragEventArgs e) => Window_DragOver(sender, e);

        private async void Window_Drop(object sender, DragEventArgs e)
        {
            if (!e.Data.GetDataPresent(DataFormats.FileDrop)) return;
            var files = (string[])e.Data.GetData(DataFormats.FileDrop);
            if (files != null && files.Length > 0)
            {
                await HandleIncomingFilesAsync(files);
            }
        }

        private void DropZone_Drop(object sender, DragEventArgs e) => Window_Drop(sender, e);

        private async Task HandleIncomingFilesAsync(string[] filePaths)
        {
            if (_selectedDevice == null)
            {
                ShowToast("Please connect a device first before transferring files.", "⚠️");
                return;
            }

            foreach (var file in filePaths)
            {
                var filename = Path.GetFileName(file);
                var ext = Path.GetExtension(file).ToLowerInvariant();

                if (ext == ".apk")
                {
                    TxtFileTransferProgress.Text = $"Installing APK {filename} on phone...";
                    ShowToast($"Installing {filename}...", "📦");

                    var res = await _adbService.InstallApkAsync(_selectedDevice.Serial, file);
                    TxtFileTransferProgress.Text = res.Message;
                    ShowToast(res.Message, res.Success ? "✅" : "❌");
                }
                else
                {
                    TxtFileTransferProgress.Text = $"Pushing {filename} to /sdcard/Download/...";
                    ShowToast($"Uploading {filename} to phone...", "📤");

                    var res = await _adbService.PushFileAsync(_selectedDevice.Serial, file, "/sdcard/Download/");
                    TxtFileTransferProgress.Text = res.Message;
                    ShowToast($"Uploaded {filename} to /sdcard/Download/!", "✅");
                }
            }

            // Refresh remote directory if visible
            if (PanelFiles.Visibility == Visibility.Visible)
            {
                await LoadRemoteDirectoryAsync(_currentRemoteDir);
            }
        }

        private async Task LoadRemoteDirectoryAsync(string remotePath)
        {
            if (_selectedDevice == null) return;

            _currentRemoteDir = remotePath;
            TxtCurrentRemotePath.Text = remotePath;
            TxtFileBrowserStatus.Text = "Loading files from device...";

            var items = await _adbService.ListDirectoryAsync(_selectedDevice.Serial, remotePath);
            ListRemoteFiles.ItemsSource = items;
            TxtFileBrowserStatus.Text = $"{items.Count} items found in {remotePath}";
        }

        private async void BtnRefreshFiles_Click(object sender, RoutedEventArgs e)
        {
            await LoadRemoteDirectoryAsync(_currentRemoteDir);
        }

        private async void BtnFolderUp_Click(object sender, RoutedEventArgs e)
        {
            if (_currentRemoteDir == "/" || _currentRemoteDir == "/sdcard/") return;
            var trimmed = _currentRemoteDir.TrimEnd('/');
            var lastSlash = trimmed.LastIndexOf('/');
            var parent = lastSlash >= 0 ? trimmed.Substring(0, lastSlash + 1) : "/sdcard/";
            await LoadRemoteDirectoryAsync(parent);
        }

        private async void BtnFolderDownload_Click(object sender, RoutedEventArgs e) => await LoadRemoteDirectoryAsync("/sdcard/Download/");
        private async void BtnFolderDCIM_Click(object sender, RoutedEventArgs e) => await LoadRemoteDirectoryAsync("/sdcard/DCIM/");
        private async void BtnFolderPictures_Click(object sender, RoutedEventArgs e) => await LoadRemoteDirectoryAsync("/sdcard/Pictures/");
        private async void BtnFolderDocuments_Click(object sender, RoutedEventArgs e) => await LoadRemoteDirectoryAsync("/sdcard/Documents/");
        private async void BtnFolderRoot_Click(object sender, RoutedEventArgs e) => await LoadRemoteDirectoryAsync("/sdcard/");

        private async void ListRemoteFiles_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            if (ListRemoteFiles.SelectedItem is DeviceFileItem item)
            {
                if (item.IsDirectory)
                {
                    await LoadRemoteDirectoryAsync(item.Path);
                }
                else
                {
                    // Prompt download
                    await DownloadFileAsync(item);
                }
            }
        }

        private async void BtnDownloadSelectedFile_Click(object sender, RoutedEventArgs e)
        {
            if (ListRemoteFiles.SelectedItem is DeviceFileItem item && !item.IsDirectory)
            {
                await DownloadFileAsync(item);
            }
            else
            {
                ShowToast("Please select a file to download.", "ℹ️");
            }
        }

        private async Task DownloadFileAsync(DeviceFileItem item)
        {
            if (_selectedDevice == null) return;

            var downloads = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
            ShowToast($"Downloading {item.Name} to PC Downloads folder...", "⬇");

            var res = await _adbService.PullFileAsync(_selectedDevice.Serial, item.Path, downloads);
            if (res.Success)
            {
                ShowToast($"Downloaded {item.Name} successfully!", "✅");
                try
                {
                    Process.Start(new ProcessStartInfo(downloads) { UseShellExecute = true });
                }
                catch { }
            }
            else
            {
                ShowToast($"Download failed: {res.Message}", "❌");
            }
        }

        private async void BtnUploadFileFromExplorer_Click(object sender, RoutedEventArgs e)
        {
            var ofd = new OpenFileDialog
            {
                Title = "Select Files to Upload to Phone",
                Multiselect = true
            };

            if (ofd.ShowDialog() == true)
            {
                await HandleIncomingFilesAsync(ofd.FileNames);
            }
        }

        // ==========================================
        // AUDIO & RECORDING STUDIO
        // ==========================================
        private async void BtnToggleRecording_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedDevice == null)
            {
                ShowToast("Please select a device to record.", "⚠️");
                return;
            }

            if (_isRecordingActive || _scrcpyService.IsMirroring)
            {
                _scrcpyService.StopMirror();
                _isRecordingActive = false;
                BtnQuickRecord.Content = "⏺️ Record Session";
                BtnRecordStudio.Content = "⏺️ Start Mirror & Record";
                ShowToast("Recording stopped and saved.", "⏹");
                return;
            }

            // Start recording session
            var folder = TxtRecordFolder.Text;
            if (!Directory.Exists(folder))
                Directory.CreateDirectory(folder);

            var ext = (CmbRecordFormat.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "mp4";
            var filename = $"StreamFusion_{DateTime.Now:yyyyMMdd_HHmmss}.{ext}";
            var fullPath = Path.Combine(folder, filename);
            _activeRecordingFile = fullPath;
            _isRecordingActive = true;

            BtnQuickRecord.Content = "⏹ Stop Recording";
            BtnRecordStudio.Content = "⏹ Stop Recording";
            ShowToast($"Recording started to {filename}...", "⏺️");

            await StartMirrorOnDeviceAsync(_selectedDevice, fullPath);
        }

        private void BtnBrowseRecordFolder_Click(object sender, RoutedEventArgs e)
        {
            var dlg = new OpenFolderDialog
            {
                Title = "Select Recordings Output Folder"
            };
            if (dlg.ShowDialog() == true)
            {
                TxtRecordFolder.Text = dlg.FolderName;
            }
        }

        private void BtnOpenRecordingsFolder_Click(object sender, RoutedEventArgs e)
        {
            var folder = TxtRecordFolder.Text;
            if (!Directory.Exists(folder))
                Directory.CreateDirectory(folder);
            Process.Start(new ProcessStartInfo(folder) { UseShellExecute = true });
        }

        private void RefreshRecordingsGallery()
        {
            var folder = TxtRecordFolder.Text;
            if (!Directory.Exists(folder)) return;

            var files = Directory.GetFiles(folder, "*.*")
                .Where(f => f.EndsWith(".mp4") || f.EndsWith(".mkv") || f.EndsWith(".webm"))
                .Select(f =>
                {
                    var fi = new FileInfo(f);
                    return new RecordingItem
                    {
                        FileName = fi.Name,
                        FullPath = fi.FullName,
                        FileSize = $"{fi.Length / (1024.0 * 1024.0):F1} MB",
                        DateCreated = fi.CreationTime
                    };
                })
                .OrderByDescending(r => r.DateCreated)
                .ToList();

            ListRecordings.ItemsSource = files;
        }

        private void BtnPlayRecording_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is RecordingItem item)
            {
                try
                {
                    Process.Start(new ProcessStartInfo(item.FullPath) { UseShellExecute = true });
                }
                catch (Exception ex)
                {
                    ShowToast($"Could not play video: {ex.Message}", "❌");
                }
            }
        }

        private void BtnDeleteRecording_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is RecordingItem item)
            {
                if (MessageBox.Show($"Delete recording '{item.FileName}'?", "Confirm Delete", MessageBoxButton.YesNo, MessageBoxImage.Question) == MessageBoxResult.Yes)
                {
                    try
                    {
                        File.Delete(item.FullPath);
                        RefreshRecordingsGallery();
                        ShowToast("Recording deleted.", "🗑️");
                    }
                    catch (Exception ex)
                    {
                        ShowToast($"Error deleting: {ex.Message}", "❌");
                    }
                }
            }
        }

        // ==========================================
        // SETTINGS & PERFORMANCE PROFILES
        // ==========================================
        private void LoadSettingsIntoUI()
        {
            var cfg = _settingsService.Current.Config;

            // Video settings
            SliderBitrate.Value = cfg.BitrateMbps;
            TxtBitrateLabel.Text = $"Video Bitrate: {cfg.BitrateMbps} Mbps";

            SelectComboItemByTag(CmbResolution, cfg.MaxSize.ToString());
            SelectComboItemByTag(CmbFps, cfg.MaxFps.ToString());
            SelectComboItemByTag(CmbVideoCodec, cfg.VideoCodec);

            // Window flags
            ChkAlwaysOnTop.IsChecked = cfg.AlwaysOnTop;
            ChkBorderless.IsChecked = cfg.Borderless;
            ChkFullscreen.IsChecked = cfg.Fullscreen;
            ChkTurnScreenOff.IsChecked = cfg.TurnScreenOff;
            ChkStayAwake.IsChecked = cfg.StayAwake;
            ChkShowTouches.IsChecked = cfg.ShowTouches;

            // Audio settings
            ChkAudioEnabled.IsChecked = cfg.AudioEnabled;
            ChkAudioOnly.IsChecked = cfg.AudioOnly;
            SelectComboItemByTag(CmbAudioCodec, cfg.AudioCodec);
            SelectComboItemByTag(CmbAudioSource, cfg.AudioSource);
            SelectComboItemByTag(CmbAudioBitrate, cfg.AudioBitrateKbps.ToString());

            // Recording format
            SelectComboItemByTag(CmbRecordFormat, cfg.RecordFormat);

            TxtStatusProfile.Text = $"Profile: {cfg.ProfileName}";
        }

        private void BtnPreset_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is string preset)
            {
                _settingsService.ApplyPreset(preset);
                LoadSettingsIntoUI();
                ShowToast($"Applied '{preset}' performance profile!", "⚡");
            }
        }

        private void SliderBitrate_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
        {
            if (TxtBitrateLabel != null)
                TxtBitrateLabel.Text = $"Video Bitrate: {(int)e.NewValue} Mbps";
        }

        private void CmbResolution_SelectionChanged(object sender, SelectionChangedEventArgs e) { }

        private void BtnSaveSettings_Click(object sender, RoutedEventArgs e)
        {
            var cfg = _settingsService.Current.Config;
            cfg.BitrateMbps = (int)SliderBitrate.Value;

            if (CmbResolution.SelectedItem is ComboBoxItem resItem && int.TryParse(resItem.Tag?.ToString(), out int maxSz))
                cfg.MaxSize = maxSz;

            if (CmbFps.SelectedItem is ComboBoxItem fpsItem && int.TryParse(fpsItem.Tag?.ToString(), out int fps))
                cfg.MaxFps = fps;

            if (CmbVideoCodec.SelectedItem is ComboBoxItem codecItem)
                cfg.VideoCodec = codecItem.Tag?.ToString() ?? "h264";

            cfg.AlwaysOnTop = ChkAlwaysOnTop.IsChecked ?? false;
            cfg.Borderless = ChkBorderless.IsChecked ?? false;
            cfg.Fullscreen = ChkFullscreen.IsChecked ?? false;
            cfg.TurnScreenOff = ChkTurnScreenOff.IsChecked ?? false;
            cfg.StayAwake = ChkStayAwake.IsChecked ?? true;
            cfg.ShowTouches = ChkShowTouches.IsChecked ?? false;

            cfg.AudioEnabled = ChkAudioEnabled.IsChecked ?? true;
            cfg.AudioOnly = ChkAudioOnly.IsChecked ?? false;

            if (CmbAudioCodec.SelectedItem is ComboBoxItem acItem)
                cfg.AudioCodec = acItem.Tag?.ToString() ?? "opus";

            if (CmbAudioSource.SelectedItem is ComboBoxItem asItem)
                cfg.AudioSource = asItem.Tag?.ToString() ?? "output";

            if (CmbRecordFormat.SelectedItem is ComboBoxItem rfItem)
                cfg.RecordFormat = rfItem.Tag?.ToString() ?? "mp4";

            _settingsService.Save();
            ShowToast("Settings saved successfully!", "💾");
        }

        private MirrorConfig BuildCurrentConfig()
        {
            var cfg = new MirrorConfig
            {
                BitrateMbps = (int)SliderBitrate.Value,
                AlwaysOnTop = ChkAlwaysOnTop.IsChecked ?? false,
                Borderless = ChkBorderless.IsChecked ?? false,
                Fullscreen = ChkFullscreen.IsChecked ?? false,
                TurnScreenOff = ChkTurnScreenOff.IsChecked ?? false,
                StayAwake = ChkStayAwake.IsChecked ?? true,
                ShowTouches = ChkShowTouches.IsChecked ?? false,
                AudioEnabled = ChkAudioEnabled.IsChecked ?? true,
                AudioOnly = ChkAudioOnly.IsChecked ?? false
            };

            if (CmbResolution.SelectedItem is ComboBoxItem resItem && int.TryParse(resItem.Tag?.ToString(), out int maxSz))
                cfg.MaxSize = maxSz;

            if (CmbFps.SelectedItem is ComboBoxItem fpsItem && int.TryParse(fpsItem.Tag?.ToString(), out int fps))
                cfg.MaxFps = fps;

            if (CmbVideoCodec.SelectedItem is ComboBoxItem codecItem)
                cfg.VideoCodec = codecItem.Tag?.ToString() ?? "h264";

            if (CmbAudioCodec.SelectedItem is ComboBoxItem acItem)
                cfg.AudioCodec = acItem.Tag?.ToString() ?? "opus";

            if (CmbAudioSource.SelectedItem is ComboBoxItem asItem)
                cfg.AudioSource = asItem.Tag?.ToString() ?? "output";

            if (CmbRecordFormat.SelectedItem is ComboBoxItem rfItem)
                cfg.RecordFormat = rfItem.Tag?.ToString() ?? "mp4";

            return cfg;
        }

        private static void SelectComboItemByTag(ComboBox cmb, string tag)
        {
            foreach (var item in cmb.Items)
            {
                if (item is ComboBoxItem cbi && cbi.Tag?.ToString() == tag)
                {
                    cmb.SelectedItem = cbi;
                    return;
                }
            }
        }

        // ==========================================
        // IN-APP GUIDE
        // ==========================================
        private void LoadGuideArticles()
        {
            var articles = GuideContentProvider.GetArticles();
            ListGuideArticles.ItemsSource = articles;
            if (articles.Count > 0)
            {
                ListGuideArticles.SelectedIndex = 0;
            }
        }

        private void ListGuideArticles_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (ListGuideArticles.SelectedItem is GuideArticle article)
            {
                TxtGuideContent.Text = article.Content;
            }
        }

        private void BtnOpenGuide_Click(object sender, RoutedEventArgs e)
        {
            NavGuide.IsChecked = true;
        }

        // ==========================================
        // STATUS BAR & UTILITIES
        // ==========================================
        private async void BtnRestartAdb_Click(object sender, RoutedEventArgs e)
        {
            ShowToast("Restarting ADB server...", "🔄");
            await _adbService.RestartServerAsync();
            ShowToast("ADB server restarted successfully.", "✅");
            await RefreshDevicesAsync();
        }

        private void ShowToast(string message, string icon = "ℹ️", int durationMs = 3500)
        {
            TxtToastIcon.Text = icon;
            TxtToastMessage.Text = message;
            ToastBanner.Visibility = Visibility.Visible;

            _toastTimer.Interval = TimeSpan.FromMilliseconds(durationMs);
            _toastTimer.Stop();
            _toastTimer.Start();
        }
    }
}