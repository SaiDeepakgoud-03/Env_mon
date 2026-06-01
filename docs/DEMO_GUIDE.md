# Demo Guide

1. Start the dashboard:

```powershell
cd dashboard
npm run dev
```

2. Open `http://127.0.0.1:5173`.
3. Login with any non-empty username and password in local mock mode.
4. Review Devices, Analytics, Alerts and OTA pages.
5. In AWS mode, subscribe in the AWS IoT MQTT test client to:

```text
env/+/telemetry
env/+/status
env/+/alerts
```

6. Flash the ESP32, connect to `EnvMon-Setup-XXXX`, submit the captive portal form and watch the device appear in the dashboard.
