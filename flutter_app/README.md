# EnvMon Android app

One Android APK that does both things:

1. **Setup tab** — provision the ESP32's Wi-Fi over its captive-portal AP
   (no need to open the browser at `192.168.4.1`).
2. **Dashboard tab** — live device list pulled from the AWS API, tap a
   device for live charts.

Talks to the same endpoints as the React dashboard:
- `http://192.168.4.1/identity`, `/scan`, `/save` while the phone is on
  the device's setup AP.
- `https://tzh11a7qtc.execute-api.us-east-1.amazonaws.com/prod/devices`
  for the cloud data once the device is online.

---

## Easiest way to get the APK (no Flutter SDK on your laptop)

The repo includes a GitHub Actions workflow that builds a release APK on
every push under `flutter_app/`.

1. Push the project to GitHub.
2. Open the repo → **Actions** tab → "Build Android APK" → latest run.
3. Scroll to **Artifacts** → download `envmon-app-release` → unzip → install
   `app-release.apk` on your phone (Settings → Allow installs from unknown
   sources).

You can also click **Run workflow** at any time to rebuild without pushing.

---

## Build it on your laptop instead (optional)

Prereqs (one time):

```powershell
# Install Flutter SDK (Windows)
choco install flutter -y
flutter doctor          # follow whatever it complains about (Android Studio, JDK)
```

Then:

```powershell
cd C:\Users\sai55\OneDrive\Desktop\environment_monitor\flutter_app

# 1) Scaffold the platform folders if they don't exist yet
flutter create . --org com.envmon --project-name envmon_app

# 2) Pull dependencies
flutter pub get

# 3) Hot-reload on a connected phone (USB debugging enabled)
flutter run

# 4) Or build the release APK
flutter build apk --release
# -> build/app/outputs/flutter-apk/app-release.apk
```

After `flutter create .` you may need to re-apply the two Android files
in this repo:

- `android/app/src/main/AndroidManifest.xml`
- `android/app/src/main/res/xml/network_security_config.xml`

…and merge the snippets from `ios/Runner/Info.plist.snippets` into the
real `ios/Runner/Info.plist`.

---

## Folder layout

```
flutter_app/
├── pubspec.yaml
├── README.md
├── .github/workflows/build_apk.yml
├── lib/
│   ├── main.dart
│   ├── theme.dart
│   ├── api/
│   │   ├── cloud_api.dart       # AWS API Gateway client
│   │   └── device_api.dart      # ESP32 captive-portal client (192.168.4.1)
│   └── pages/
│       ├── home_page.dart       # bottom-nav shell (Dashboard / Setup)
│       ├── dashboard_page.dart  # live fleet
│       ├── device_detail_page.dart  # per-device charts (fl_chart)
│       └── setup_page.dart      # 3-step Wi-Fi + location wizard
├── android/app/src/main/AndroidManifest.xml
└── android/app/src/main/res/xml/network_security_config.xml
```

---

## What "Setup" does step by step

1. Polls `http://192.168.4.1/identity` every 3 s. As soon as the phone is
   on the EnvMon-Setup-XXXX AP, the device id auto-fills and step 1 turns
   green.
2. Calls `GET /scan` — shows the list of Wi-Fi networks the ESP32 can see.
   You tap one (or type one manually).
3. Form asks for place / landmark / district / state / country and offers
   a one-tap "Use my GPS" button (latitude + longitude get attached to the
   payload).
4. Hit **Save and reboot device** — the app POSTs JSON to `/save`, the
   device replies `{ ok: true }` and reboots about 2 seconds later.

Within ~10 seconds the new device should appear on the **Dashboard** tab
because it's now connected to your Wi-Fi and posting to the cloud.

---

## Editing the AWS endpoint

Change the single constant in `lib/api/cloud_api.dart`:

```dart
static const baseUrl =
    'https://tzh11a7qtc.execute-api.us-east-1.amazonaws.com/prod';
```

That's the only place it lives. Rebuild and ship.
