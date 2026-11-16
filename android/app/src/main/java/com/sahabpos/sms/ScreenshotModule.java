package com.sahabpos.sms;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

/**
 * ScreenshotModule — React Native bridge module that lets the JS app
 * start/stop the ScreenshotObserverService and configure credentials.
 */
public class ScreenshotModule extends ReactContextBaseJavaModule {

    private static final String TAG = "ScreenshotModule";
    private final Context context;

    public ScreenshotModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.context = reactContext.getApplicationContext();
    }

    @Override
    public String getName() {
        return "ScreenshotNative";
    }

    @ReactMethod
    public void startService() {
        try {
            SharedPreferences prefs = context.getSharedPreferences("sahab_prefs", Context.MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();
            editor.putBoolean("screenshot_detection_enabled", true);
            editor.apply();

            Intent intent = new Intent(context, ScreenshotObserverService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception e) {
            Log.e(TAG, "startService error: " + e.getMessage());
        }
    }

    @ReactMethod
    public void stopService() {
        try {
            SharedPreferences prefs = context.getSharedPreferences("sahab_prefs", Context.MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();
            editor.putBoolean("screenshot_detection_enabled", false);
            editor.apply();

            Intent intent = new Intent(context, ScreenshotObserverService.class);
            context.stopService(intent);
        } catch (Exception e) {
            Log.e(TAG, "stopService error: " + e.getMessage());
        }
    }

    @ReactMethod
    public void isServiceRunning(Promise promise) {
        try {
            SharedPreferences prefs = context.getSharedPreferences("sahab_prefs", Context.MODE_PRIVATE);
            boolean enabled = prefs.getBoolean("screenshot_detection_enabled", false);
            promise.resolve(enabled);
        } catch (Exception e) {
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void setSupabaseCredentials(String url, String anonKey) {
        try {
            SharedPreferences prefs = context.getSharedPreferences("sahab_prefs", Context.MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();
            editor.putString("supabase_url", url);
            editor.putString("supabase_anon_key", anonKey);
            editor.apply();
        } catch (Exception e) {
            Log.e(TAG, "setSupabaseCredentials error: " + e.getMessage());
        }
    }
}
