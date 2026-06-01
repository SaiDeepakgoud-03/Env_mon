package com.envmon.provisioner;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.view.View;

import org.json.JSONArray;
import org.json.JSONObject;

public class DeviceMapView extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private JSONArray devices = new JSONArray();

    public DeviceMapView(Context context) {
        super(context);
        setMinimumHeight(360);
    }

    public void setDevices(JSONArray devices) {
        this.devices = devices == null ? new JSONArray() : devices;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        int width = getWidth();
        int height = getHeight();
        int pad = 28;

        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.rgb(5, 18, 38));
        canvas.drawRoundRect(0, 0, width, height, 20, 20, paint);

        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1);
        paint.setColor(Color.rgb(31, 69, 102));
        for (int x = pad; x < width; x += 56) canvas.drawLine(x, pad, x, height - pad, paint);
        for (int y = pad; y < height; y += 56) canvas.drawLine(pad, y, width - pad, y, paint);

        Bounds bounds = bounds();
        for (int i = 0; i < devices.length(); i++) {
            JSONObject device = devices.optJSONObject(i);
            if (device == null) continue;
            JSONObject loc = device.optJSONObject("location");
            double lat = loc == null ? 0 : loc.optDouble("lat", loc.optDouble("latitude", 0));
            double lng = loc == null ? 0 : loc.optDouble("lng", loc.optDouble("longitude", 0));
            float x = project(lng, bounds.minLng, bounds.maxLng, pad, width - pad);
            float y = project(lat, bounds.maxLat, bounds.minLat, pad, height - pad);
            int color = markerColor(device);

            paint.setStyle(Paint.Style.FILL);
            paint.setColor(Color.argb(70, Color.red(color), Color.green(color), Color.blue(color)));
            canvas.drawCircle(x, y, 22, paint);
            paint.setColor(color);
            canvas.drawCircle(x, y, 12, paint);

            paint.setTextSize(20);
            paint.setColor(Color.rgb(220, 235, 255));
            canvas.drawText(device.optString("display_name", device.optString("device_id", "Device")), x + 16, y - 14, paint);
        }
    }

    private int markerColor(JSONObject d) {
        if (d.optInt("last_fire") == 1) return Color.rgb(239, 68, 68);
        double t = d.optDouble("last_temperature", 0);
        double h = d.optDouble("last_humidity", 0);
        double aq = d.optDouble("last_air_quality", 0);
        if (!d.optBoolean("online") || t >= 40 || h <= 25 || h >= 80 || aq >= 100) return Color.rgb(245, 158, 11);
        return Color.rgb(34, 197, 94);
    }

    private float project(double value, double min, double max, int outMin, int outMax) {
        if (Math.abs(max - min) < 0.000001) return (outMin + outMax) / 2f;
        return (float) (outMin + ((value - min) / (max - min)) * (outMax - outMin));
    }

    private Bounds bounds() {
        Bounds b = new Bounds();
        for (int i = 0; i < devices.length(); i++) {
            JSONObject device = devices.optJSONObject(i);
            JSONObject loc = device == null ? null : device.optJSONObject("location");
            if (loc == null) continue;
            double lat = loc.optDouble("lat", loc.optDouble("latitude", 0));
            double lng = loc.optDouble("lng", loc.optDouble("longitude", 0));
            if (lat == 0 && lng == 0) continue;
            b.minLat = Math.min(b.minLat, lat);
            b.maxLat = Math.max(b.maxLat, lat);
            b.minLng = Math.min(b.minLng, lng);
            b.maxLng = Math.max(b.maxLng, lng);
        }
        if (b.minLat == Double.MAX_VALUE) {
            b.minLat = 17.25;
            b.maxLat = 17.45;
            b.minLng = 78.45;
            b.maxLng = 78.65;
        }
        b.minLat -= 0.01;
        b.maxLat += 0.01;
        b.minLng -= 0.01;
        b.maxLng += 0.01;
        return b;
    }

    private static class Bounds {
        double minLat = Double.MAX_VALUE;
        double maxLat = -Double.MAX_VALUE;
        double minLng = Double.MAX_VALUE;
        double maxLng = -Double.MAX_VALUE;
    }
}
