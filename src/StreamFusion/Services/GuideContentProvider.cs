using System.Collections.Generic;

namespace StreamFusion.Services
{
    public class GuideArticle
    {
        public string Id { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public string Icon { get; set; } = "📖";
        public string Summary { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
    }

    public static class GuideContentProvider
    {
        public static List<GuideArticle> GetArticles()
        {
            return new List<GuideArticle>
            {
                new GuideArticle
                {
                    Id = "usb-debugging",
                    Title = "1. Enable USB Debugging (All Brands)",
                    Category = "Getting Started",
                    Icon = "📱",
                    Summary = "Step-by-step instructions to unlock Developer Options and turn on USB Debugging on Samsung, Xiaomi, Pixel, OnePlus, Vivo, etc.",
                    Content = @"# 📱 How to Enable USB Debugging on Any Android Phone

To mirror your phone with StreamFusion, USB Debugging must be enabled once on your phone.

---

### Step 1: Unlock Developer Options
1. Open your phone's **Settings**.
2. Scroll to the bottom and tap **About phone** (or *About device* / *System*).
3. Find **Build number**:
   - **Samsung**: *Settings → About phone → Software information → Build number*
   - **Xiaomi / Redmi / POCO**: *Settings → About phone → MIUI version / OS version*
   - **OnePlus / Oppo / Realme**: *Settings → About device → Version → Build number*
   - **Google Pixel / Motorola**: *Settings → About phone → Build number*
4. Tap **Build number 7 times rapidly**.
5. You will see a notification: *'You are now a developer!'*

---

### Step 2: Turn on USB Debugging
1. Go back to main **Settings**.
2. Tap **Developer options** (usually under *System* or *Additional settings*).
3. Toggle on **USB debugging**.
4. Tap **OK** on the confirmation dialog.

> 💡 **Special Note for Xiaomi / Redmi / POCO users:**
> In Developer options, you must also enable:
> 1. **USB debugging (Security settings)** — requires Mi Account login.
> 2. **Install via USB**.
> Without this, touch clicks from your PC won't respond on Xiaomi devices!

---

### Step 3: Authorize PC on First Connection
1. Connect your phone to your PC via a USB cable.
2. Look at your phone's screen. A popup will appear:
   **'Allow USB debugging from this computer?'**
3. Check the box **'Always allow from this computer'** and tap **Allow**.
4. In StreamFusion, click **Refresh Devices** — your phone will appear immediately!"
                },

                new GuideArticle
                {
                    Id = "wifi-mirroring",
                    Title = "2. Wireless (Wi-Fi) Mirroring Guide",
                    Category = "Wireless Setup",
                    Icon = "📶",
                    Summary = "Cut the cord! How to switch to Wi-Fi mirroring with 1 click and connect without any cables.",
                    Content = @"# 📶 How Wireless (Wi-Fi) Mirroring Works in StreamFusion

StreamFusion allows you to stream your phone's screen and sound completely wire-free over your home or office Wi-Fi network.

---

### Method A: One-Click Switch from USB (Easiest & Recommended)
1. First, connect your phone using a USB cable.
2. Wait for it to appear in StreamFusion's device list.
3. Click the **'⚡ Switch to Wi-Fi'** button on the device card.
4. StreamFusion will automatically:
   - Detect your mobile phone's local IP address (e.g. `192.168.1.105`).
   - Enable ADB TCP/IP wireless mode on port `5555`.
   - Connect to your device wirelessly over the network.
5. Once you see the green success notification, you can **unplug the USB cable**!
6. Click **'Start Mirror'** on the Wi-Fi device card to mirror wire-free!

---

### Method B: Manual Wi-Fi Connection
If you already ran TCP/IP mode earlier or have wireless debugging enabled:
1. Ensure your laptop and phone are connected to the **same Wi-Fi network**.
2. Find your phone's IP address:
   - Go to *Settings → Wi-Fi → Tap your connected Wi-Fi → IP address* (e.g., `192.168.1.105`).
3. In StreamFusion, click the **'📶 Connect via Wi-Fi'** button at the top.
4. Type your phone's IP address and port `5555`.
5. Click **Connect**!

---

### 🚀 Tips for the Best Wireless Performance
- **Use 5GHz Wi-Fi**: 5GHz Wi-Fi provides 3x lower latency and eliminates frame drops compared to 2.4GHz.
- **Select the 'Wireless Smooth' Preset**: Under Settings, pick *Wireless Smooth* (720p @ 30 FPS, 4 Mbps) for stutter-free wireless streaming."
                },

                new GuideArticle
                {
                    Id = "audio-guide",
                    Title = "3. Audio Streaming & Latency Setup",
                    Category = "Audio & Video",
                    Icon = "🎙️",
                    Summary = "Understand how phone audio forwarding works, Android version requirements, and codec choices.",
                    Content = @"# 🎙️ Mobile Audio Forwarding Guide

StreamFusion includes built-in audio forwarding directly into Windows speakers or headphones.

---

### Requirements:
- **Android 11 or newer**: Android natively supports internal audio capture for apps and games without root.
- **Android 10 and below**: Google restricted audio capture on older Android versions. For Android 10 or older, video mirroring works seamlessly, but audio requires Bluetooth pairing to your PC or an aux cable.

---

### Choosing the Best Audio Codec
In the **Audio & Recording** tab, you can customize the audio engine:

| Codec | Latency | Quality | Best For |
|---|---|---|---|
| **Opus** | ~15–30 ms | High | Gaming & Real-time (Default) |
| **AAC** | ~40–60 ms | Crystal Clear | Music, Movies & YouTube |
| **FLAC** | ~50 ms | Lossless | Audio Production |
| **RAW** | <10 ms | Uncompressed | Ultra-low Latency Competitive Games |

---

### Audio Source Modes
- **Device Output**: Captures all games, video players, and media sound.
- **Playback**: Captures application audio while ignoring microphone input.
- **Microphone**: Forwards your phone's microphone to your PC (useful for calling or streaming).

---

### Audio-Only Mode
Want to listen to a podcast, Spotify, or audio notes from your phone while working on your PC without showing the phone screen?
Toggle on **'Audio-Only Mode'** in the Audio tab!"
                },

                new GuideArticle
                {
                    Id = "file-transfer",
                    Title = "4. Drag & Drop File Transfer & APK Install",
                    Category = "Features",
                    Icon = "📁",
                    Summary = "Effortlessly transfer photos, videos, documents, and install APKs with real-time drag-and-drop.",
                    Content = @"# 📁 Drag & Drop File Transfer & Mobile File Manager

StreamFusion makes transferring files between PC and Android faster than Bluetooth or Cloud drives.

---

### 1. Drag & Drop Uploading to Phone
- Open the **File Transfer** tab in StreamFusion.
- Drag any file or multiple files from your Windows desktop or File Explorer.
- Drop them directly onto the **glowing Drop Zone**.
- The files will be transferred at full USB 3.0 / Wi-Fi speed into `/sdcard/Download/`!
- A progress bar shows you exact transfer speed and bytes remaining.

---

### 2. Drag & Drop APK App Installation
- Have an Android APK file on your PC?
- Simply drag the `.apk` file into the Drop Zone.
- StreamFusion detects it is an application and automatically runs `adb install -r`.
- You will see a success notification and the app will appear immediately in your phone's app drawer!

---

### 3. Remote File Browser (Phone → PC Download)
- The built-in file manager allows you to browse your phone's internal storage:
  - 📥 **Downloads** (`/sdcard/Download`)
  - 📷 **DCIM** (Camera photos and videos)
  - 🖼️ **Pictures** (Screenshots, WhatsApp media)
  - 🎵 **Music**
  - 📄 **Documents**
- To download any file or photo to your PC:
  - Click on the file in the table.
  - Click **'Download to PC'**.
  - Choose your save folder, and it will be downloaded immediately!"
                },

                new GuideArticle
                {
                    Id = "shortcuts",
                    Title = "5. Keyboard & Mouse Shortcuts",
                    Category = "Reference",
                    Icon = "⌨️",
                    Summary = "Complete cheat-sheet of Scrcpy keyboard shortcuts to control your phone like a pro.",
                    Content = @"# ⌨️ Scrcpy Mirroring Shortcuts Cheat-Sheet

While the mirror window is focused, you can use these shortcuts (`MOD` key is usually **Left Alt** or **Left Super/Windows key**):

| Shortcut | Action |
|---|---|
| `MOD + F` | Toggle Fullscreen mode |
| `MOD + Left` / `MOD + Right` | Rotate display |
| `MOD + G` | Resize window to 1:1 pixel ratio |
| `MOD + W` | Resize window to remove black borders |
| `MOD + H` | Press Phone Home button |
| `MOD + B` | Press Phone Back button (or right click mouse) |
| `MOD + S` | Open App Switcher / Recent Apps |
| `MOD + M` | Open Phone Menu |
| `MOD + P` | Press Power button (screen lock/unlock) |
| `MOD + O` | Turn phone screen OFF (mirror remains active!) |
| `MOD + Shift + O` | Turn phone screen ON |
| `MOD + Down` | Pull down Notification shade |
| `MOD + Up` | Collapse Notification shade |
| `MOD + C` | Copy phone clipboard to PC |
| `MOD + V` | Paste PC clipboard to phone |
| `MOD + K` | Open keyboard virtual shortcuts |
| `Right Click` | Back button (or turns on screen if off) |
| `Middle Click` | Home button |
| `Ctrl + Click & Drag` | Pinch-to-zoom simulation |

---

### Dragging into the Mirror Window directly:
- Drag an `.apk` file into the mirror window: auto installs the app!
- Drag any non-APK file into the mirror window: auto copies to `/sdcard/Download/`!"
                },

                new GuideArticle
                {
                    Id = "troubleshooting",
                    Title = "6. Troubleshooting & Common Fixes",
                    Category = "Help & Support",
                    Icon = "🔧",
                    Summary = "Instant solutions for 'Device Unauthorized', stuttering, black screens, and connection problems.",
                    Content = @"# 🔧 Troubleshooting Guide

### 1. Device shows 'Unauthorized'
- **Cause**: Your phone hasn't accepted the RSA debugging key prompt yet.
- **Fix**:
  1. Unlock your phone screen.
  2. Look for the popup: *'Allow USB debugging?'*.
  3. Check *'Always allow'* and tap *Allow*.
  4. If the popup didn't appear, unplug the USB cable, plug it back in, or go to *Developer Options → Revoke USB debugging authorizations*, then reconnect.

---

### 2. Device Not Detected by StreamFusion
- **Fixes**:
  - Make sure your USB cable is a **data transfer cable**, not a charge-only cable.
  - When you plug the cable in, select **'File Transfer' (MTP)** on your phone instead of 'Charging only'.
  - Verify USB Debugging is toggled ON in Developer Options.
  - Click **'Restart ADB Server'** in StreamFusion's Devices tab.

---

### 3. Screen Lag or Stutter on Wi-Fi
- **Fixes**:
  - Make sure your PC and phone are connected to a **5GHz Wi-Fi band**, not 2.4GHz.
  - Under **Settings & Presets**, select the **'Wireless Smooth'** or **'Ultra Low Latency'** profile (720p, 30–60 FPS, 4 Mbps).
  - Reduce video bitrate to `4M` or `6M`.

---

### 4. Audio is Not Playing
- Remember that native audio forwarding requires **Android 11 or newer**.
- If your phone is running Android 10 or earlier, video mirroring will work smoothly, but you should pair your phone to your PC via Bluetooth for sound.

---

### 5. Xiaomi / Redmi / POCO Touch Clicks don't work
- Xiaomi requires enabling **USB debugging (Security settings)** inside Developer options. This requires a Mi account login. Once enabled, touch clicks will work immediately!"
                }
            };
        }
    }
}
