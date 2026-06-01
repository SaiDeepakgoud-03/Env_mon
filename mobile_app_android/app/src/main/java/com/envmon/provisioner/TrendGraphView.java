package com.envmon.provisioner;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.view.View;

public class TrendGraphView extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private double[] temperature = new double[0];
    private double[] humidity = new double[0];
    private double[] airQuality = new double[0];

    public TrendGraphView(Context context) {
        super(context);
        setMinimumHeight(320);
    }

    public void setData(double[] temperature, double[] humidity, double[] airQuality) {
        this.temperature = temperature;
        this.humidity = humidity;
        this.airQuality = airQuality;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        int width = getWidth();
        int height = getHeight();
        int left = 48;
        int top = 28;
        int right = width - 24;
        int bottom = height - 42;

        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.rgb(5, 18, 38));
        canvas.drawRoundRect(0, 0, width, height, 20, 20, paint);

        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1);
        paint.setColor(Color.rgb(31, 54, 86));
        for (int i = 0; i <= 4; i++) {
            float y = top + ((bottom - top) * i / 4f);
            canvas.drawLine(left, y, right, y, paint);
        }
        for (int i = 0; i <= 5; i++) {
            float x = left + ((right - left) * i / 5f);
            canvas.drawLine(x, top, x, bottom, paint);
        }

        drawLine(canvas, temperature, left, top, right, bottom, 60, Color.rgb(248, 113, 113));
        drawLine(canvas, humidity, left, top, right, bottom, 100, Color.rgb(96, 165, 250));
        drawLine(canvas, airQuality, left, top, right, bottom, 200, Color.rgb(34, 197, 94));

        paint.setStyle(Paint.Style.FILL);
        paint.setTextSize(24);
        paint.setColor(Color.rgb(248, 113, 113));
        canvas.drawText("Temp", left, height - 14, paint);
        paint.setColor(Color.rgb(96, 165, 250));
        canvas.drawText("Humidity", left + 90, height - 14, paint);
        paint.setColor(Color.rgb(34, 197, 94));
        canvas.drawText("AQI", left + 230, height - 14, paint);
    }

    private void drawLine(Canvas canvas, double[] values, int left, int top, int right, int bottom, double max, int color) {
        if (values == null || values.length == 0) return;
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(5);
        paint.setColor(color);
        float lastX = 0;
        float lastY = 0;
        for (int i = 0; i < values.length; i++) {
            float x = values.length == 1 ? left : left + ((right - left) * i / (float) (values.length - 1));
            double clamped = Math.max(0, Math.min(max, values[i]));
            float y = bottom - (float) ((clamped / max) * (bottom - top));
            if (i > 0) canvas.drawLine(lastX, lastY, x, y, paint);
            paint.setStyle(Paint.Style.FILL);
            canvas.drawCircle(x, y, 5, paint);
            paint.setStyle(Paint.Style.STROKE);
            lastX = x;
            lastY = y;
        }
    }
}
