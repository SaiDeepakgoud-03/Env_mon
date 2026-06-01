# EnvMon Android Provisioning App

Native Android app for setting up an ESP32 EnvMon device.

## What it does

- Opens Android Wi-Fi settings so the user can connect to `EnvMon-Setup-XXXX`
- Connects to the ESP32 portal at `http://192.168.4.1`
- Fetches the default MAC-based device ID, for example `env_EC64`
- Scans nearby Wi-Fi networks through the ESP32 `/scan` endpoint
- Lets the user enter Wi-Fi SSID/password
- Captures phone location using Android location permissions
- Sends Wi-Fi and location data to ESP32 `/save`

## Build in Android Studio

1. Open Android Studio.
2. Choose **Open**.
3. Select:

   `C:\Users\sai55\OneDrive\Desktop\environment_monitor\mobile_app_android`

4. Let Gradle sync.
5. Connect your Android phone with USB debugging enabled.
6. Press **Run**.

## Use

1. Put ESP32 in provisioning mode.
2. Open this app.
3. Tap **Open Wi-Fi Settings**.
4. Connect to `EnvMon-Setup-XXXX`.
5. Return to the app.
6. Tap **Connect to Device**.
7. Scan/select Wi-Fi or type SSID manually.
8. Tap **Fetch Live Location**.
9. Tap **Save and Reboot Device**.

## Android limitation

Android does not allow ordinary apps to silently join Wi-Fi networks without user approval on modern versions. This app opens Wi-Fi settings and then communicates with the ESP32 once the phone is connected.
