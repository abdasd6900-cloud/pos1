package com.sahabpos.sms;

import android.app.Activity;
import android.app.role.RoleManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * CallScreeningModule — exposes Android's ROLE_CALL_SCREENING API to React Native.
 *
 * Methods:
 * - isCallScreeningRoleHeld(): returns true if this app is the system call screener
 * - requestCallScreeningRole(): opens system dialog to request the role
 * - isCallScreeningSupported(): returns true if the device supports call screening (API 29+)
 */
public class CallScreeningModule extends ReactContextBaseJavaModule implements ActivityEventListener {

    private static final String TAG = "CallScreeningModule";
    private static final int REQUEST_CALL_SCREENING = 7771;

    private Promise pendingPromise;

    public CallScreeningModule(ReactApplicationContext reactContext) {
        super(reactContext);
        reactContext.addActivityEventListener(this);
    }

    @Override
    public String getName() {
        return "CallScreeningNative";
    }

    @ReactMethod
    public void isCallScreeningSupported(Promise promise) {
        promise.resolve(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q);
    }

    @ReactMethod
    public void isCallScreeningRoleHeld(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                promise.resolve(false);
                return;
            }
            RoleManager rm = (RoleManager) getReactApplicationContext()
                .getSystemService(Context.ROLE_SERVICE);
            boolean held = rm.isRoleHeld(RoleManager.ROLE_CALL_SCREENING);

            // Persist the screening-active flag so CallReceiver can skip when screening is active
            android.content.SharedPreferences prefs = getReactApplicationContext()
                .getSharedPreferences("sahab_prefs", Context.MODE_PRIVATE);
            prefs.edit().putBoolean("call_screening_active", held).apply();

            promise.resolve(held);
        } catch (Exception e) {
            Log.e(TAG, "isCallScreeningRoleHeld error: " + e.getMessage());
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void requestCallScreeningRole(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                promise.resolve(false);
                return;
            }
            RoleManager rm = (RoleManager) getReactApplicationContext()
                .getSystemService(Context.ROLE_SERVICE);

            if (rm.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) {
                promise.resolve(true);
                return;
            }

            if (!rm.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING)) {
                promise.resolve(false);
                return;
            }

            Intent intent = rm.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING);
            pendingPromise = promise;

            android.app.Activity currentActivity = getCurrentActivity();
            if (currentActivity != null) {
                currentActivity.startActivityForResult(intent, REQUEST_CALL_SCREENING);
            } else {
                promise.resolve(false);
            }
        } catch (Exception e) {
            Log.e(TAG, "requestCallScreeningRole error: " + e.getMessage());
            promise.resolve(false);
        }
    }

    @Override
    public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
        if (requestCode != REQUEST_CALL_SCREENING) return;

        boolean granted = resultCode == Activity.RESULT_OK;
        Log.i(TAG, "Call screening role request result: " + granted);

        // Persist the screening-active flag
        android.content.SharedPreferences prefs = getReactApplicationContext()
            .getSharedPreferences("sahab_prefs", Context.MODE_PRIVATE);
        prefs.edit().putBoolean("call_screening_active", granted).apply();

        if (pendingPromise != null) {
            pendingPromise.resolve(granted);
            pendingPromise = null;
        }
    }

    @Override
    public void onNewIntent(Intent intent) {
        // no-op
    }
}
