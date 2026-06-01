package com.envmon.provisioner;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String API_DASHBOARD = "https://tzh11a7qtc.execute-api.us-east-1.amazonaws.com/prod/app/dashboard";
    private static final String MAPPLS_TOKEN = "etyqngrkfwgfwnjcinyigbkefxgiitvxbjzl";
    private static final String ALERT_CHANNEL = "envmon_alerts";
    private static final int REQ_NOTIFICATIONS = 11;

    private final Handler dashboardHandler = new Handler(Looper.getMainLooper());
    private DashboardPoller dashboardPoller;
    private LinearLayout menu;
    private LinearLayout content;
    private TextView topStatus;
    private JSONObject dashboardData;
    private String currentScreen = "Dashboard";
    private JSONObject selectedDevice;
    private JSONObject selectedAlert;
    private String activeNotificationKey = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        dashboardPoller = new DashboardPoller(this, dashboardHandler);
        createNotificationChannel();
        buildShell();
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        }
        dashboardPoller.run();
    }

    @Override
    protected void onDestroy() {
        dashboardHandler.removeCallbacks(dashboardPoller);
        super.onDestroy();
    }

    private void buildShell() {
        LinearLayout shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.HORIZONTAL);
        shell.setBackgroundColor(rgb("#031020"));

        menu = new LinearLayout(this);
        menu.setOrientation(LinearLayout.VERTICAL);
        menu.setPadding(14, 22, 14, 22);
        menu.setBackgroundColor(rgb("#06162A"));
        shell.addView(menu, new LinearLayout.LayoutParams(dp(142), -1));

        ScrollView scroll = new ScrollView(this);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(18, 22, 18, 30);
        scroll.addView(content);
        shell.addView(scroll, new LinearLayout.LayoutParams(0, -1, 1));
        setContentView(shell);
        renderMenu();
        renderContent();
    }

    private void renderMenu() {
        menu.removeAllViews();
        TextView brand = text("Enviro\nMonitor", 20, true, "#22D3EE");
        brand.setPadding(2, 0, 0, 18);
        menu.addView(brand);
        menuItem("Dashboard", "Dashboard");
        menuItem("Devices", "Devices");
        menuItem("Alerts", "Alerts");
        menuItem("Live\nMonitoring", "Live Monitoring");
        menuItem("Map View", "Map View");
        menuItem("Analytics", "Analytics");
        menuItem("Reports", "Reports");
        menuItem("Settings", "Settings");
        menuItem("Profile", "Profile");
        TextView foot = text("AWS IoT\nLive Cloud", 11, false, "#8FB3D9");
        foot.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(0, 18, 0, 0);
        menu.addView(foot, params);
    }

    private void menuItem(String label, String screen) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setGravity(Gravity.CENTER_VERTICAL);
        button.setTextSize(13);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setTextColor(rgb(currentScreen.equals(screen) ? "#FFFFFF" : "#BBD5F4"));
        button.setBackgroundColor(rgb(currentScreen.equals(screen) ? "#4338CA" : "#06162A"));
        button.setOnClickListener(v -> {
            currentScreen = screen;
            selectedDevice = null;
            selectedAlert = null;
            renderMenu();
            renderContent();
        });
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(46));
        params.setMargins(0, 4, 0, 4);
        menu.addView(button, params);
    }

    void refreshDashboard(boolean manual) {
        if (manual && topStatus != null) topStatus.setText("Refreshing cloud data...");
        new Thread(() -> {
            try {
                JSONObject data = new JSONObject(httpGetUrl(API_DASHBOARD));
                JSONArray alerts = data.optJSONArray("recent_alerts");
                ActiveAlert active = firstActiveAlert(alerts);
                runOnUiThread(() -> {
                    dashboardData = data;
                    if (topStatus != null) {
                        topStatus.setText("Live - updates every 5 seconds");
                        topStatus.setTextColor(rgb("#22C55E"));
                    }
                    if (active.active) showAlertNotification(active); else activeNotificationKey = "";
                    renderContent();
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    if (topStatus != null) {
                        topStatus.setText("Cloud not reachable: " + e.getMessage());
                        topStatus.setTextColor(rgb("#F87171"));
                    }
                });
            }
        }).start();
    }

    private void renderContent() {
        if (content == null) return;
        content.removeAllViews();
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        header.addView(text(currentScreen, 26, true, "#F8FAFC"));
        topStatus = text(dashboardData == null ? "Connecting to cloud dashboard..." : "Live - updates every 5 seconds", 13, true, dashboardData == null ? "#60A5FA" : "#22C55E");
        header.addView(topStatus);
        content.addView(header);

        if ("Dashboard".equals(currentScreen)) renderDashboard();
        else if ("Devices".equals(currentScreen)) renderDevices();
        else if ("Alerts".equals(currentScreen)) renderAlerts();
        else if ("Live Monitoring".equals(currentScreen)) renderLiveMonitoring();
        else if ("Map View".equals(currentScreen)) renderMapView();
        else if ("Analytics".equals(currentScreen)) renderAnalytics();
        else if ("Reports".equals(currentScreen)) renderReports();
        else if ("Settings".equals(currentScreen)) renderSettings();
        else renderProfile();
    }

    private void renderDashboard() {
        JSONObject summary = summary();
        JSONObject avg = summary.optJSONObject("averages");
        LinearLayout grid = row();
        grid.addView(metric("Total Devices", String.valueOf(summary.optInt("total")), "#1D4ED8"), weight());
        grid.addView(metric("Online Devices", String.valueOf(summary.optInt("online")), "#15803D"), weight());
        content.addView(grid);
        LinearLayout grid2 = row();
        grid2.addView(metric("Active Alerts", String.valueOf(summary.optInt("alerts")), "#B45309"), weight());
        grid2.addView(metric("Fire Status", hasFire() ? "Alert" : "Safe", hasFire() ? "#B91C1C" : "#047857"), weight());
        content.addView(grid2);
        LinearLayout grid3 = row();
        grid3.addView(metric("Avg Temp", one(avg, "temperature") + " C", "#0E7490"), weight());
        grid3.addView(metric("Avg Humidity", one(avg, "humidity") + "%", "#2563EB"), weight());
        content.addView(grid3);
        content.addView(metric("Average AQI", one(avg, "air_quality"), "#7C3AED"));
        content.addView(card("Quick Charts", quickChart()));
        content.addView(graphView(), panelParams());
        content.addView(refreshButton());
    }

    private void renderDevices() {
        if (selectedDevice != null) {
            renderDeviceDetails(selectedDevice);
            return;
        }
        JSONArray devices = devices();
        if (devices.length() == 0) content.addView(card("Devices", "No devices registered."));
        for (int i = 0; i < devices.length(); i++) {
            JSONObject d = devices.optJSONObject(i);
            if (d == null) continue;
            TextView item = card(
                    d.optString("display_name", d.optString("device_id", "Device")),
                    "ID: " + d.optString("device_id") + "\n"
                            + "Location: " + formatLocation(d.optJSONObject("location")) + "\n"
                            + "Last seen: " + ago(d.optLong("last_seen")) + "\n"
                            + "Status: " + (d.optBoolean("online") ? "Online" : "Offline")
            );
            item.setOnClickListener(v -> {
                selectedDevice = d;
                renderContent();
            });
            content.addView(item);
        }
    }

    private void renderDeviceDetails(JSONObject d) {
        content.addView(backButton("Back to Devices", () -> { selectedDevice = null; renderContent(); }));
        content.addView(card(d.optString("display_name", d.optString("device_id", "Device")),
                "Location: " + formatLocation(d.optJSONObject("location")) + "\n"
                        + "Status: " + (d.optBoolean("online") ? "Online" : "Offline")));
        content.addView(card("Sensor Readings",
                "Temperature: " + one(d, "last_temperature") + " C\n"
                        + "Humidity: " + one(d, "last_humidity") + "%\n"
                        + "Air Quality Index: " + d.optInt("last_air_quality") + "\n"
                        + "Fire Status: " + (d.optInt("last_fire") == 1 ? "Detected" : "Safe")));
        content.addView(card("Live Data", "Refreshes from AWS IoT every few seconds.\nLast seen: " + ago(d.optLong("last_seen"))));
        content.addView(card("Historical Data", "Recent readings are available in the web dashboard charts."));
        content.addView(card("Charts", sensorBars(d)));
        TrendGraphView graph = new TrendGraphView(this);
        graph.setData(new double[]{d.optDouble("last_temperature")}, new double[]{d.optDouble("last_humidity")}, new double[]{d.optDouble("last_air_quality")});
        content.addView(graph, panelParams());
        content.addView(card("Device Information",
                "Thing: " + d.optString("thing_name", "-") + "\n"
                        + "Firmware: " + d.optString("firmware_version", "-") + "\n"
                        + "Certificate: " + d.optString("certificate_status", "-")));
    }

    private void renderAlerts() {
        if (selectedAlert != null) {
            content.addView(backButton("Back to Alerts", () -> { selectedAlert = null; renderContent(); }));
            content.addView(card("Alert Details",
                    "Device Name: " + selectedAlert.optString("display_name") + "\n"
                            + "Location: " + formatLocation(selectedAlert.optJSONObject("location")) + "\n"
                            + "Time: " + ago(selectedAlert.optLong("last_seen")) + "\n"
                            + "Severity: " + selectedAlert.optString("severity", "warning") + "\n"
                            + "Resolution Status: Active"));
            return;
        }
        JSONArray alerts = alerts();
        if (alerts.length() == 0) content.addView(card("Alerts", "All clear."));
        for (int i = 0; i < alerts.length(); i++) {
            JSONObject a = alerts.optJSONObject(i);
            if (a == null) continue;
            TextView item = card(a.optString("title", "Alert"),
                    a.optString("display_name", a.optString("device_id")) + "\n"
                            + formatLocation(a.optJSONObject("location")) + "\n"
                            + "Severity: " + a.optString("severity", "warning"));
            item.setOnClickListener(v -> {
                selectedAlert = a;
                renderContent();
            });
            content.addView(item);
        }
    }

    private void renderLiveMonitoring() {
        JSONObject latest = latest();
        content.addView(card("Real-time Cards", "Updated from AWS IoT every few seconds"));
        content.addView(metric("Temperature", one(latest, "last_temperature") + " C", "#0E7490"));
        content.addView(metric("Humidity", one(latest, "last_humidity") + "%", "#2563EB"));
        content.addView(metric("AQI", String.valueOf(latest.optInt("last_air_quality")), "#7C3AED"));
        content.addView(metric("Fire Status", latest.optInt("last_fire") == 1 ? "Detected" : "Safe", latest.optInt("last_fire") == 1 ? "#B91C1C" : "#047857"));
        content.addView(graphView(), panelParams());
    }

    private void renderMapView() {
        content.addView(card("Device Map View", "Green = Normal   Yellow = Warning   Red = Alert"));
        WebView map = new WebView(this);
        WebSettings settings = map.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        map.setWebViewClient(new WebViewClient());
        map.loadDataWithBaseURL("https://sdk.mappls.com/", mapHtml(), "text/html", "UTF-8", null);
        content.addView(map, mapParams());
        content.addView(card("Markers", mapList()));
    }

    private void renderAnalytics() {
        content.addView(graphView(), panelParams());
        content.addView(card("Temperature Trends", trend("last_temperature")));
        content.addView(card("Humidity Trends", trend("last_humidity")));
        content.addView(card("AQI Trends", trend("last_air_quality")));
        content.addView(card("Fire Events", hasFire() ? "Active fire event detected." : "No active fire event."));
        content.addView(card("Device Health", "Online: " + summary().optInt("online") + "\nOffline: " + summary().optInt("offline")));
    }

    private void renderReports() {
        content.addView(card("Reports", "Fleet Summary\nDevice Health\nAlert History\nSensor Trends\n\nReports use the same cloud data shown in the dashboard."));
    }

    private void renderSettings() {
        content.addView(card("Settings", "Alert thresholds:\nTemperature >= 40 C\nHumidity <= 25% or >= 80%\nAQI >= 100\n\nRefresh interval: 5 seconds"));
    }

    private void renderProfile() {
        content.addView(card("Profile", "Admin\nEnvironment Monitor\nAWS IoT Core\nRegion: us-east-1"));
    }

    private JSONObject summary() {
        return dashboardData == null ? new JSONObject() : dashboardData.optJSONObject("summary") == null ? new JSONObject() : dashboardData.optJSONObject("summary");
    }

    private JSONArray devices() {
        return dashboardData == null || dashboardData.optJSONArray("devices") == null ? new JSONArray() : dashboardData.optJSONArray("devices");
    }

    private JSONArray alerts() {
        return dashboardData == null || dashboardData.optJSONArray("recent_alerts") == null ? new JSONArray() : dashboardData.optJSONArray("recent_alerts");
    }

    private JSONObject latest() {
        return dashboardData == null || dashboardData.optJSONObject("latest") == null ? new JSONObject() : dashboardData.optJSONObject("latest");
    }

    private boolean hasFire() {
        JSONArray devices = devices();
        for (int i = 0; i < devices.length(); i++) {
            JSONObject d = devices.optJSONObject(i);
            if (d != null && d.optInt("last_fire") == 1) return true;
        }
        return false;
    }

    private String quickChart() {
        return "Temperature  " + bars(avg("last_temperature"), 50) + "\n"
                + "Humidity     " + bars(avg("last_humidity"), 100) + "\n"
                + "AQI          " + bars(avg("last_air_quality"), 200);
    }

    private String sensorBars(JSONObject d) {
        return "Temperature  " + bars(d.optDouble("last_temperature"), 50) + "\n"
                + "Humidity     " + bars(d.optDouble("last_humidity"), 100) + "\n"
                + "AQI          " + bars(d.optDouble("last_air_quality"), 200);
    }

    private String mapList() {
        JSONArray devices = devices();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < devices.length(); i++) {
            JSONObject d = devices.optJSONObject(i);
            if (d == null) continue;
            String marker = d.optInt("last_fire") == 1 ? "RED" : deviceWarning(d) ? "YELLOW" : "GREEN";
            sb.append(marker).append(" - ").append(d.optString("display_name", d.optString("device_id"))).append("\n")
                    .append(formatLocation(d.optJSONObject("location"))).append("\n\n");
        }
        return sb.length() == 0 ? "No device markers yet." : sb.toString().trim();
    }

    private String mapHtml() {
        JSONArray devices = devices();
        StringBuilder markers = new StringBuilder();
        double centerLat = 17.3850;
        double centerLng = 78.4867;
        int valid = 0;
        for (int i = 0; i < devices.length(); i++) {
            JSONObject d = devices.optJSONObject(i);
            JSONObject loc = d == null ? null : d.optJSONObject("location");
            if (loc == null) continue;
            double lat = loc.optDouble("lat", loc.optDouble("latitude", 0));
            double lng = loc.optDouble("lng", loc.optDouble("longitude", 0));
            if (lat == 0 && lng == 0) continue;
            centerLat = ((centerLat * valid) + lat) / (valid + 1);
            centerLng = ((centerLng * valid) + lng) / (valid + 1);
            valid++;
            String color = d.optInt("last_fire") == 1 ? "#ef4444" : deviceWarning(d) ? "#f59e0b" : "#22c55e";
            String title = js(d.optString("display_name", d.optString("device_id", "Device")));
            String info = js(formatLocation(loc));
            markers.append("addMarker(")
                    .append(lat).append(",")
                    .append(lng).append(",'")
                    .append(color).append("','")
                    .append(title).append("','")
                    .append(info).append("');\n");
        }
        return "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
                + "<link rel='stylesheet' href='https://sdk.mappls.com/map/sdk/web?v=3.0&access_token=" + MAPPLS_TOKEN + "&layer=vector'>"
                + "<style>html,body,#map{height:100%;margin:0;background:#06162a}.err{color:#fff;font:16px sans-serif;padding:18px}.pin{width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 18px rgba(0,0,0,.45)}</style>"
                + "</head><body><div id='map'></div>"
                + "<script src='https://sdk.mappls.com/map/sdk/web?v=3.0&access_token=" + MAPPLS_TOKEN + "&layer=vector'></script>"
                + "<script>"
                + "function ready(){return window.mappls&&mappls.Map;}"
                + "function addMarker(lat,lng,color,title,info){var el=document.createElement('div');el.className='pin';el.style.background=color;new mappls.Marker({map:map,position:{lat:lat,lng:lng},icon:el,title:title,popupHtml:'<b>'+title+'</b><br>'+info});}"
                + "var map;"
                + "setTimeout(function(){try{if(!ready()){document.body.innerHTML='<div class=err>Mappls map could not load. Check Web Maps access for this key.</div>';return;}map=new mappls.Map('map',{center:[" + centerLat + "," + centerLng + "],zoom:10,geolocation:false});map.on('load',function(){"
                + markers
                + "});}catch(e){document.body.innerHTML='<div class=err>'+e.message+'</div>';}} ,900);"
                + "</script></body></html>";
    }

    private String js(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ");
    }

    private String trend(String key) {
        JSONArray devices = devices();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < devices.length(); i++) {
            JSONObject d = devices.optJSONObject(i);
            if (d != null) sb.append(d.optString("display_name", d.optString("device_id"))).append("  ").append(bars(d.optDouble(key), key.equals("last_air_quality") ? 200 : 100)).append("\n");
        }
        return sb.length() == 0 ? "No trend data yet." : sb.toString();
    }

    private boolean deviceWarning(JSONObject d) {
        double temp = d.optDouble("last_temperature");
        double hum = d.optDouble("last_humidity");
        double aq = d.optDouble("last_air_quality");
        return !d.optBoolean("online") || temp >= 40 || hum <= 25 || hum >= 80 || aq >= 100;
    }

    private TrendGraphView graphView() {
        TrendGraphView graph = new TrendGraphView(this);
        graph.setData(series("last_temperature"), series("last_humidity"), series("last_air_quality"));
        return graph;
    }

    private double[] series(String key) {
        JSONArray devices = devices();
        double[] values = new double[Math.max(1, devices.length())];
        if (devices.length() == 0) {
            values[0] = 0;
            return values;
        }
        for (int i = 0; i < devices.length(); i++) {
            JSONObject d = devices.optJSONObject(i);
            values[i] = d == null ? 0 : d.optDouble(key, 0);
        }
        return values;
    }

    private double avg(String key) {
        JSONArray devices = devices();
        double total = 0;
        int count = 0;
        for (int i = 0; i < devices.length(); i++) {
            JSONObject d = devices.optJSONObject(i);
            if (d == null) continue;
            total += d.optDouble(key);
            count++;
        }
        return count == 0 ? 0 : total / count;
    }

    private String bars(double value, double max) {
        int filled = Math.max(0, Math.min(10, (int) Math.round((value / max) * 10)));
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 10; i++) sb.append(i < filled ? "#" : "-");
        return sb.append(" ").append(String.format(Locale.US, "%.1f", value)).toString();
    }

    private LinearLayout row() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER);
        return row;
    }

    private LinearLayout.LayoutParams weight() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, -2, 1);
        params.setMargins(0, 0, dp(8), 0);
        return params;
    }

    private TextView metric(String label, String value, String color) {
        TextView tv = text(label + "\n" + value, 16, true, "#FFFFFF");
        tv.setBackgroundColor(rgb(color));
        tv.setPadding(18, 16, 18, 16);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(0, 10, 0, 10);
        tv.setLayoutParams(params);
        return tv;
    }

    private TextView card(String title, String body) {
        TextView tv = text(title + "\n" + body, 15, false, "#DCEBFF");
        tv.setBackgroundColor(rgb("#0B172A"));
        tv.setPadding(18, 16, 18, 16);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(0, 10, 0, 10);
        tv.setLayoutParams(params);
        return tv;
    }

    private LinearLayout.LayoutParams panelParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(320));
        params.setMargins(0, 10, 0, 10);
        return params;
    }

    private LinearLayout.LayoutParams mapParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(420));
        params.setMargins(0, 10, 0, 10);
        return params;
    }

    private View refreshButton() {
        Button button = new Button(this);
        button.setText("Refresh Now");
        button.setAllCaps(false);
        button.setTextColor(rgb("#FFFFFF"));
        button.setBackgroundColor(rgb("#0D9488"));
        button.setOnClickListener(v -> refreshDashboard(true));
        return button;
    }

    private TextView backButton(String label, Runnable action) {
        TextView button = text(label, 14, true, "#93C5FD");
        button.setOnClickListener(v -> action.run());
        return button;
    }

    private String formatLocation(JSONObject location) {
        if (location == null) return "Location not set";
        StringBuilder sb = new StringBuilder();
        appendPart(sb, location.optString("place", ""));
        appendPart(sb, location.optString("landmark", ""));
        appendPart(sb, location.optString("district", ""));
        appendPart(sb, location.optString("state", ""));
        appendPart(sb, location.optString("country", ""));
        return sb.length() == 0 ? "Location not set" : sb.toString();
    }

    private void appendPart(StringBuilder sb, String value) {
        if (value == null || value.trim().isEmpty()) return;
        if (sb.length() > 0) sb.append(", ");
        sb.append(value.trim());
    }

    private String one(JSONObject obj, String key) {
        if (obj == null) return "0.0";
        return String.format(Locale.US, "%.1f", obj.optDouble(key, 0));
    }

    private String ago(long timestamp) {
        if (timestamp <= 0) return "-";
        long seconds = Math.max(0, (System.currentTimeMillis() - timestamp) / 1000);
        if (seconds < 60) return seconds + "s ago";
        long minutes = seconds / 60;
        if (minutes < 60) return minutes + "m ago";
        long hours = minutes / 60;
        return hours + "h ago";
    }

    private ActiveAlert firstActiveAlert(JSONArray alerts) {
        if (alerts == null || alerts.length() == 0) return new ActiveAlert(false, "", "", "", "");
        JSONObject alert = alerts.optJSONObject(0);
        if (alert == null) return new ActiveAlert(false, "", "", "", "");
        String key = alert.optString("device_id") + ":" + alert.optString("type") + ":" + alert.optString("value");
        return new ActiveAlert(true, key, alert.optString("title", "Alert"), alert.optString("display_name", alert.optString("device_id")), formatLocation(alert.optJSONObject("location")));
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(ALERT_CHANNEL, "EnvMon Alerts", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Fire, temperature, humidity, AQI and offline alerts");
            ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(channel);
        }
    }

    private void showAlertNotification(ActiveAlert alert) {
        if (alert.key.equals(activeNotificationKey)) return;
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        activeNotificationKey = alert.key;
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, intent, Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        android.app.Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new android.app.Notification.Builder(this, ALERT_CHANNEL)
                : new android.app.Notification.Builder(this);
        builder.setSmallIcon(android.R.drawable.stat_notify_error)
                .setContentTitle(alert.title)
                .setContentText(alert.deviceId + " - " + alert.location)
                .setStyle(new android.app.Notification.BigTextStyle().bigText(alert.title + "\n" + alert.deviceId + "\n" + alert.location))
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setPriority(android.app.Notification.PRIORITY_HIGH);
        ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).notify(1001, builder.build());
    }

    private TextView text(String value, int sp, boolean bold, String color) {
        TextView tv = new TextView(this);
        tv.setText(value);
        tv.setTextSize(sp);
        tv.setTextColor(rgb(color));
        tv.setPadding(0, 7, 0, 7);
        if (bold) tv.setTypeface(Typeface.DEFAULT_BOLD);
        return tv;
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private int rgb(String hex) {
        return Color.parseColor(hex);
    }

    private String httpGetUrl(String url) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(5000);
        conn.setReadTimeout(8000);
        conn.setRequestMethod("GET");
        BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = br.readLine()) != null) sb.append(line);
        br.close();
        return sb.toString();
    }

    private static class ActiveAlert {
        final boolean active;
        final String key;
        final String title;
        final String deviceId;
        final String location;

        ActiveAlert(boolean active, String key, String title, String deviceId, String location) {
            this.active = active;
            this.key = key;
            this.title = title;
            this.deviceId = deviceId;
            this.location = location;
        }
    }
}
