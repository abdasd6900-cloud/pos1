package com.sahabpos.sms;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

public class ShortcutModule extends ReactContextBaseJavaModule {

    private static final String TAG = "ShortcutModule";

    public ShortcutModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return "SmsShortcut";
    }

    @ReactMethod
    public void createSmsShortcut(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            Intent smsIntent = new Intent(Intent.ACTION_MAIN);
            smsIntent.addCategory(Intent.CATEGORY_APP_MESSAGING);

            ResolveInfo defaultSmsApp = findDefaultSmsApp(context);
            if (defaultSmsApp != null) {
                String packageName = defaultSmsApp.activityInfo.packageName;
                String className = defaultSmsApp.activityInfo.name;
                smsIntent.setClassName(packageName, className);
            }

            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                promise.resolve(false);
                return;
            }

            android.content.pm.ShortcutInfo shortcut = new android.content.pm.ShortcutInfo.Builder(context, "sms_app_shortcut")
                    .setShortLabel("الرسائل")
                    .setLongLabel("برنامج الرسائل")
                    .setIcon(Icon.createWithResource(context, android.R.drawable.ic_dialog_email))
                    .setIntent(smsIntent)
                    .build();

            android.content.pm.ShortcutManager shortcutManager = context.getSystemService(android.content.pm.ShortcutManager.class);
            if (shortcutManager == null || !shortcutManager.isRequestPinShortcutSupported()) {
                promise.resolve(false);
                return;
            }

            promise.resolve(shortcutManager.requestPinShortcut(shortcut, null));
        } catch (Exception e) {
            Log.e(TAG, "createSmsShortcut error: " + e.getMessage());
            promise.reject("SHORTCUT_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void hasSmsShortcut(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            android.content.pm.ShortcutManager shortcutManager = context.getSystemService(android.content.pm.ShortcutManager.class);
            if (shortcutManager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N_MR1) {
                java.util.List<android.content.pm.ShortcutInfo> shortcuts = shortcutManager.getDynamicShortcuts();
                boolean found = false;
                for (android.content.pm.ShortcutInfo s : shortcuts) {
                    if ("sms_app_shortcut".equals(s.getId())) {
                        found = true;
                        break;
                    }
                }
                promise.resolve(found);
            } else {
                promise.resolve(false);
            }
        } catch (Exception e) {
            promise.resolve(false);
        }
    }

    private ResolveInfo findDefaultSmsApp(Context context) {
        Intent intent = new Intent(Intent.ACTION_MAIN);
        intent.addCategory(Intent.CATEGORY_APP_MESSAGING);
        PackageManager pm = context.getPackageManager();
        java.util.List<ResolveInfo> apps = pm.queryIntentActivities(intent, 0);
        if (apps != null && !apps.isEmpty()) {
            return apps.get(0);
        }
        return null;
    }
}
