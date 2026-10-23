using System;
using System.IO;
using System.Windows;

namespace StreamFusion
{
    public partial class App : Application
    {
        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);

            AppDomain.CurrentDomain.UnhandledException += (s, args) =>
            {
                LogCrash("AppDomain.UnhandledException", args.ExceptionObject as Exception);
            };

            DispatcherUnhandledException += (s, args) =>
            {
                LogCrash("DispatcherUnhandledException", args.Exception);
                MessageBox.Show($"StreamFusion Error:\n{args.Exception?.Message}\n\nStack:\n{args.Exception?.StackTrace}", "StreamFusion Startup Error", MessageBoxButton.OK, MessageBoxImage.Error);
                args.Handled = true;
            };
        }

        private static void LogCrash(string source, Exception? ex)
        {
            try
            {
                var logFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "StreamFusion_crash.log");
                File.WriteAllText(logFile, $"[{DateTime.Now}] Crash in {source}:\n{ex?.ToString()}");
            }
            catch { }
        }
    }
}
