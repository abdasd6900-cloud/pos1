package com.sahabpos.sms;

import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.net.Uri;
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

            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                promise.resolve(false);
                return;
            }

            Intent messagesIntent = new Intent(Intent.ACTION_VIEW);
            messagesIntent.setData(Uri.parse("sahabpos://messages"));
            messagesIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

            android.content.pm.ShortcutInfo shortcut = new android.content.pm.ShortcutInfo.Builder(context, "sms_app_shortcut")
                    .setShortLabel("الرسائل")
                    .setLongLabel("رسائل سحاب")
                    .setIcon(Icon.createWithResource(context, android.R.drawable.ic_dialog_email))
                    .setIntent(messagesIntent)
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
}
