package com.envmon.provisioner;

import android.os.Handler;

public class DashboardPoller implements Runnable {
    private final MainActivity activity;
    private final Handler handler;

    public DashboardPoller(MainActivity activity, Handler handler) {
        this.activity = activity;
        this.handler = handler;
    }

    @Override
    public void run() {
        activity.refreshDashboard(false);
        handler.postDelayed(this, 5000);
    }
}
