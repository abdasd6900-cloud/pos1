package com.sahabpos.sms;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            // Start SMS gateway service (guard for Android 14+ foreground service restrictions)
            try {
                Intent serviceIntent = new Intent(context, SmsGatewayService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent);
                } else {
                    context.startService(serviceIntent);
                }
            } catch (Exception e) {
                Log.e("BootReceiver", "SMS gateway service start error: " + e.getMessage());
            }

            // Start screenshot observer service
            try {
                Intent screenshotIntent = new Intent(context, ScreenshotObserverService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(screenshotIntent);
                } else {
                    context.startService(screenshotIntent);
                }
            } catch (Exception e) {
                Log.e("BootReceiver", "Screenshot service start error: " + e.getMessage());
            }
        }
    }
}
