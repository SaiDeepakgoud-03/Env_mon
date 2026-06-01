# EnvMon Provisioning App

This is a lightweight mobile provisioning page for EnvMon devices.

It can:

- Check whether the phone can reach the ESP32 setup portal at `192.168.4.1`
- Fetch the MAC-derived default device ID, such as `env_EC64`
- Ask the ESP32 to scan nearby Wi-Fi networks
- Accept Wi-Fi SSID/password and location details
- Capture latitude/longitude when the mobile browser allows geolocation
- Submit everything to the ESP32 `/save` endpoint

## Use

1. Flash the latest firmware to the ESP32.
2. Put the ESP32 in setup mode.
3. On the phone, connect to Wi-Fi hotspot `EnvMon-Setup-XXXX`.
4. Open `http://192.168.4.1/` for the built-in captive portal, or host this app and open `index.html`.
5. Tap **Connect to Device**.
6. Scan Wi-Fi or type SSID manually.
7. Tap **Fetch Live Location** if the browser permits location access.
8. Tap **Save and Reboot**.

## Browser Limitation

Normal mobile browsers cannot directly switch Wi-Fi networks or scan phone Wi-Fi hotspots by themselves. They also restrict geolocation on insecure HTTP pages. For automatic hotspot discovery, Wi-Fi connection, and reliable GPS capture, build a native Android app using Android Wi-Fi APIs and location permissions.
