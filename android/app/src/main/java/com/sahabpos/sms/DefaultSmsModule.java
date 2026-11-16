package com.sahabpos.sms;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Telephony;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;

/**
 * DefaultSmsModule — exposes Android's default-SMS-app API to React Native.
 *
 * Methods:
 * - isDefaultSmsApp(): returns true if this app is the default SMS handler
 * - requestDefaultSmsApp(): opens the system dialog to set this app as default
 * - getDefaultSmsPackageName(): returns the package name of the current default
 * - deleteSms(uri): deletes an SMS by its content URI from the system inbox
 * - readInboxSms(limit): reads recent SMS from the system inbox
 * - markSmsRead(uri): marks an SMS as read in the system inbox
 */
public class DefaultSmsModule extends ReactContextBaseJavaModule {

    private static final String TAG = "DefaultSmsModule";

    public DefaultSmsModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "DefaultSmsModule";
    }

    @ReactMethod
    public void isDefaultSmsApp(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            String myPackage = context.getPackageName();
            String defaultPackage = Telephony.Sms.getDefaultSmsPackage(context);
            boolean isDefault = myPackage.equals(defaultPackage);
            promise.resolve(isDefault);
        } catch (Exception e) {
            Log.e(TAG, "isDefaultSmsApp error: " + e.getMessage());
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void hasSmsPermissions(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            int receiveStatus = ContextCompat.checkSelfPermission(context, "android.permission.RECEIVE_SMS");
            int readStatus = ContextCompat.checkSelfPermission(context, "android.permission.READ_SMS");
            int sendStatus = ContextCompat.checkSelfPermission(context, "android.permission.SEND_SMS");
            boolean granted = receiveStatus == PackageManager.PERMISSION_GRANTED
                && readStatus == PackageManager.PERMISSION_GRANTED
                && sendStatus == PackageManager.PERMISSION_GRANTED;
            promise.resolve(granted);
        } catch (Exception e) {
            Log.e(TAG, "hasSmsPermissions error: " + e.getMessage());
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void requestSmsPermissions(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            Activity activity = getCurrentActivity();
            if (activity == null) {
                promise.resolve(false);
                return;
            }

            String myPackage = context.getPackageName();
            String defaultPackage = Telephony.Sms.getDefaultSmsPackage(context);
            if (!myPackage.equals(defaultPackage)) {
                promise.resolve(false);
                return;
            }

            String[] permissions = {
                "android.permission.RECEIVE_SMS",
                "android.permission.READ_SMS",
                "android.permission.SEND_SMS",
            };

            boolean allGranted = true;
            for (String perm : permissions) {
                if (ContextCompat.checkSelfPermission(context, perm) != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }

            if (allGranted) {
                promise.resolve(true);
                return;
            }

            ActivityCompat.requestPermissions(activity, permissions, 12345);
            promise.resolve(false);
        } catch (Exception e) {
            Log.e(TAG, "requestSmsPermissions error: " + e.getMessage());
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void requestDefaultSmsApp(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            String myPackage = context.getPackageName();
            String defaultPackage = Telephony.Sms.getDefaultSmsPackage(context);

            if (myPackage.equals(defaultPackage)) {
                promise.resolve(true);
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                Intent intent = new Intent(Telephony.Sms.Intents.ACTION_CHANGE_DEFAULT);
                intent.putExtra(Telephony.Sms.Intents.EXTRA_PACKAGE_NAME, myPackage);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                promise.resolve(false); // user must confirm in system dialog
            } else {
                promise.resolve(false);
            }
        } catch (Exception e) {
            Log.e(TAG, "requestDefaultSmsApp error: " + e.getMessage());
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void getDefaultSmsPackageName(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            String defaultPackage = Telephony.Sms.getDefaultSmsPackage(context);
            promise.resolve(defaultPackage != null ? defaultPackage : "");
        } catch (Exception e) {
            promise.resolve("");
        }
    }

    @ReactMethod
    public void deleteSms(String uriString, Promise promise) {
        try {
            Context context = getReactApplicationContext();
            Uri uri = Uri.parse(uriString);
            int deleted = context.getContentResolver().delete(uri, null, null);
            promise.resolve(deleted > 0);
        } catch (SecurityException e) {
            Log.e(TAG, "deleteSms permission denied: " + e.getMessage());
            promise.resolve(false);
        } catch (Exception e) {
            Log.e(TAG, "deleteSms error: " + e.getMessage());
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void markSmsRead(String uriString, Promise promise) {
        try {
            Context context = getReactApplicationContext();
            Uri uri = Uri.parse(uriString);
            android.content.ContentValues values = new android.content.ContentValues();
            values.put("read", 1);
            int updated = context.getContentResolver().update(uri, values, "read=0", null);
            promise.resolve(updated > 0);
        } catch (Exception e) {
            Log.e(TAG, "markSmsRead error: " + e.getMessage());
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void readInboxSms(int limit, Promise promise) {
        try {
            Context context = getReactApplicationContext();
            String[] projection = {"_id", "address", "body", "date", "type", "read"};
            String sortOrder = "date DESC LIMIT " + Math.max(1, Math.min(limit, 500));

            android.database.Cursor cursor = context.getContentResolver().query(
                Uri.parse("content://sms/"),
                projection,
                null,
                null,
                sortOrder
            );

            com.facebook.react.bridge.WritableArray results =
                com.facebook.react.bridge.Arguments.createArray();

            if (cursor != null) {
                while (cursor.moveToNext()) {
                    com.facebook.react.bridge.WritableMap msg =
                        com.facebook.react.bridge.Arguments.createMap();
                    msg.putString("id", cursor.getString(0));
                    msg.putString("address", cursor.getString(1));
                    msg.putString("body", cursor.getString(2));
                    msg.putDouble("date", cursor.getLong(3));
                    msg.putInt("type", cursor.getInt(4));
                    msg.putInt("read", cursor.getInt(5));
                    msg.putString("uri", "content://sms/" + cursor.getString(0));
                    results.pushMap(msg);
                }
                cursor.close();
            }

            promise.resolve(results);
        } catch (SecurityException e) {
            Log.e(TAG, "readInboxSms permission denied: " + e.getMessage());
            promise.resolve(com.facebook.react.bridge.Arguments.createArray());
        } catch (Exception e) {
            Log.e(TAG, "readInboxSms error: " + e.getMessage());
            promise.resolve(com.facebook.react.bridge.Arguments.createArray());
        }
    }

    @ReactMethod
    public void deleteThread(String threadId, Promise promise) {
        try {
            Context context = getReactApplicationContext();
            Uri uri = Uri.parse("content://sms/conversations/" + threadId);
            int deleted = context.getContentResolver().delete(uri, null, null);
            promise.resolve(deleted > 0);
        } catch (Exception e) {
            Log.e(TAG, "deleteThread error: " + e.getMessage());
            promise.resolve(false);
        }
    }
}
