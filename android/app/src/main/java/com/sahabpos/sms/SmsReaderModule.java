package com.sahabpos.sms;

import android.Manifest;
import android.content.pm.PackageManager;
import android.database.ContentObserver;
import android.database.Cursor;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.Telephony;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableNativeArray;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import androidx.core.content.ContextCompat;

public class SmsReaderModule extends ReactContextBaseJavaModule {

    private static final String TAG = "SmsReader";
    private static final String EVENT_NAME = "SmsReader_newSms";

    private ContentObserver smsObserver;
    private boolean observing = false;
    private long lastObservedDate = 0;

    public SmsReaderModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "SmsReader";
    }

    @Override
    public void onCatalystInstanceDestroy() {
        stopObservingInternal();
        super.onCatalystInstanceDestroy();
    }

    // ===== Live observation =====

    @ReactMethod
    public void startObserving(Promise promise) {
        try {
            ReactApplicationContext ctx = getReactApplicationContext();
            int perm = ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_SMS);
            if (perm != PackageManager.PERMISSION_GRANTED) {
                promise.reject("PERMISSION_DENIED", "لم يتم منح إذن قراءة الرسائل");
                return;
            }
            if (observing) {
                promise.resolve(true);
                return;
            }

            smsObserver = new ContentObserver(new Handler(Looper.getMainLooper())) {
                @Override
                public void onChange(boolean selfChange, Uri uri) {
                    queryLatestInboxMessage();
                }
            };
            ctx.getContentResolver().registerContentObserver(
                Telephony.Sms.CONTENT_URI,
                true,
                smsObserver
            );
            observing = true;

            // Seed lastObservedDate with the most recent inbox message so we don't
            // re-emit everything already in the inbox when observation starts.
            lastObservedDate = getLatestInboxDate();

            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("OBSERVER_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void stopObserving(Promise promise) {
        stopObservingInternal();
        promise.resolve(true);
    }

    private void stopObservingInternal() {
        if (smsObserver != null) {
            try {
                getReactApplicationContext().getContentResolver().unregisterContentObserver(smsObserver);
            } catch (Exception ignored) { }
            smsObserver = null;
        }
        observing = false;
    }

    private long getLatestInboxDate() {
        try {
            ReactApplicationContext ctx = getReactApplicationContext();
            Cursor cursor = ctx.getContentResolver().query(
                Telephony.Sms.CONTENT_URI,
                new String[]{Telephony.Sms.DATE},
                Telephony.Sms.TYPE + " = 1",
                null,
                Telephony.Sms.DATE + " DESC LIMIT 1"
            );
            if (cursor != null) {
                if (cursor.moveToFirst()) {
                    long date = cursor.getLong(0);
                    cursor.close();
                    return date;
                }
                cursor.close();
            }
        } catch (Exception ignored) { }
        return System.currentTimeMillis();
    }

    private void queryLatestInboxMessage() {
        try {
            ReactApplicationContext ctx = getReactApplicationContext();
            String[] projection = {
                Telephony.Sms._ID,
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.DATE,
                Telephony.Sms.TYPE
            };
            Cursor cursor = ctx.getContentResolver().query(
                Telephony.Sms.CONTENT_URI,
                projection,
                Telephony.Sms.TYPE + " = 1",
                null,
                Telephony.Sms.DATE + " DESC LIMIT 5"
            );
            if (cursor == null) return;

            int idIdx = cursor.getColumnIndex(Telephony.Sms._ID);
            int addressIdx = cursor.getColumnIndex(Telephony.Sms.ADDRESS);
            int bodyIdx = cursor.getColumnIndex(Telephony.Sms.BODY);
            int dateIdx = cursor.getColumnIndex(Telephony.Sms.DATE);
            int typeIdx = cursor.getColumnIndex(Telephony.Sms.TYPE);

            // Collect new messages (date > lastObservedDate) in chronological order
            java.util.List<WritableMap> newMsgs = new java.util.ArrayList<>();
            while (cursor.moveToNext()) {
                long date = dateIdx >= 0 ? cursor.getLong(dateIdx) : 0;
                if (date <= lastObservedDate) continue;

                String address = addressIdx >= 0 ? cursor.getString(addressIdx) : "";
                String body = bodyIdx >= 0 ? cursor.getString(bodyIdx) : "";
                String smsId = idIdx >= 0 ? String.valueOf(cursor.getLong(idIdx)) : "";
                int type = typeIdx >= 0 ? cursor.getInt(typeIdx) : 1;

                if (address == null) address = "";
                if (body == null) body = "";

                WritableMap msg = new WritableNativeMap();
                msg.putString("id", smsId);
                msg.putString("address", address);
                msg.putString("body", body);
                msg.putDouble("date", (double) date);
                msg.putString("direction", type == 2 ? "outbound" : "inbound");

                newMsgs.add(msg);
            }
            cursor.close();

            if (newMsgs.isEmpty()) return;

            // Update lastObservedDate to the latest message date
            WritableMap lastMsg = newMsgs.get(newMsgs.size() - 1);
            double lastDate = lastMsg.getDouble("date");
            lastObservedDate = (long) lastDate;

            // Emit each new message as an event to JS
            for (WritableMap msg : newMsgs) {
                ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(EVENT_NAME, msg);
            }
        } catch (Exception ignored) { }
    }

    // ===== Permission =====

    @ReactMethod
    public void hasReadPermission(Promise promise) {
        try {
            int result = ContextCompat.checkSelfPermission(getReactApplicationContext(), Manifest.permission.READ_SMS);
            promise.resolve(result == PackageManager.PERMISSION_GRANTED);
        } catch (Exception e) {
            promise.reject("PERMISSION_CHECK_ERROR", e.getMessage());
        }
    }

    // ===== Import (bulk) =====

    @ReactMethod
    public void importAllSms(Promise promise) {
        try {
            ReactApplicationContext ctx = getReactApplicationContext();

            int permResult = ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_SMS);
            if (permResult != PackageManager.PERMISSION_GRANTED) {
                promise.reject("PERMISSION_DENIED", "لم يتم منح إذن قراءة الرسائل");
                return;
            }

            Uri uri = Telephony.Sms.CONTENT_URI;
            String[] projection = {
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.DATE,
                Telephony.Sms.TYPE,
                Telephony.Sms.READ,
                Telephony.Sms._ID
            };

            Cursor cursor = ctx.getContentResolver().query(
                uri, projection, null, null,
                Telephony.Sms.DATE + " DESC LIMIT 5000"
            );

            if (cursor == null) {
                promise.reject("CURSOR_NULL", "تعذر الوصول إلى قاعدة بيانات الرسائل");
                return;
            }

            WritableArray messages = new WritableNativeArray();
            int addressIdx = cursor.getColumnIndex(Telephony.Sms.ADDRESS);
            int bodyIdx = cursor.getColumnIndex(Telephony.Sms.BODY);
            int dateIdx = cursor.getColumnIndex(Telephony.Sms.DATE);
            int typeIdx = cursor.getColumnIndex(Telephony.Sms.TYPE);
            int readIdx = cursor.getColumnIndex(Telephony.Sms.READ);
            int idIdx = cursor.getColumnIndex(Telephony.Sms._ID);

            while (cursor.moveToNext()) {
                WritableMap msg = new WritableNativeMap();
                String address = addressIdx >= 0 ? cursor.getString(addressIdx) : "";
                String body = bodyIdx >= 0 ? cursor.getString(bodyIdx) : "";
                long date = dateIdx >= 0 ? cursor.getLong(dateIdx) : 0;
                int type = typeIdx >= 0 ? cursor.getInt(typeIdx) : 1;
                int read = readIdx >= 0 ? cursor.getInt(readIdx) : 1;
                String smsId = idIdx >= 0 ? String.valueOf(cursor.getLong(idIdx)) : "";

                if (address == null) address = "";
                if (body == null) body = "";

                msg.putString("id", smsId);
                msg.putString("address", address);
                msg.putString("body", body);
                msg.putDouble("date", (double) date);
                msg.putString("direction", type == 2 ? "outbound" : "inbound");
                msg.putBoolean("read", read == 1);

                messages.pushMap(msg);
            }
            cursor.close();

            promise.resolve(messages);
        } catch (SecurityException e) {
            promise.reject("PERMISSION_DENIED", "لم يتم منح إذن قراءة الرسائل");
        } catch (Exception e) {
            promise.reject("IMPORT_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void importSmsForContact(String phoneNumber, Promise promise) {
        try {
            ReactApplicationContext ctx = getReactApplicationContext();

            int permResult = ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_SMS);
            if (permResult != PackageManager.PERMISSION_GRANTED) {
                promise.reject("PERMISSION_DENIED", "لم يتم منح إذن قراءة الرسائل");
                return;
            }

            Uri uri = Telephony.Sms.CONTENT_URI;
            String selection = Telephony.Sms.ADDRESS + " = ?";
            String[] selectionArgs = { phoneNumber };
            String[] projection = {
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.DATE,
                Telephony.Sms.TYPE,
                Telephony.Sms.READ,
                Telephony.Sms._ID
            };

            Cursor cursor = ctx.getContentResolver().query(
                uri, projection, selection, selectionArgs,
                Telephony.Sms.DATE + " DESC LIMIT 1000"
            );

            if (cursor == null) {
                promise.reject("CURSOR_NULL", "تعذر الوصول إلى قاعدة بيانات الرسائل");
                return;
            }

            WritableArray messages = new WritableNativeArray();
            int addressIdx = cursor.getColumnIndex(Telephony.Sms.ADDRESS);
            int bodyIdx = cursor.getColumnIndex(Telephony.Sms.BODY);
            int dateIdx = cursor.getColumnIndex(Telephony.Sms.DATE);
            int typeIdx = cursor.getColumnIndex(Telephony.Sms.TYPE);
            int readIdx = cursor.getColumnIndex(Telephony.Sms.READ);
            int idIdx = cursor.getColumnIndex(Telephony.Sms._ID);

            while (cursor.moveToNext()) {
                WritableMap msg = new WritableNativeMap();
                String address = addressIdx >= 0 ? cursor.getString(addressIdx) : "";
                String body = bodyIdx >= 0 ? cursor.getString(bodyIdx) : "";
                long date = dateIdx >= 0 ? cursor.getLong(dateIdx) : 0;
                int type = typeIdx >= 0 ? cursor.getInt(typeIdx) : 1;
                int read = readIdx >= 0 ? cursor.getInt(readIdx) : 1;
                String smsId = idIdx >= 0 ? String.valueOf(cursor.getLong(idIdx)) : "";

                if (address == null) address = "";
                if (body == null) body = "";

                msg.putString("id", smsId);
                msg.putString("address", address);
                msg.putString("body", body);
                msg.putDouble("date", (double) date);
                msg.putString("direction", type == 2 ? "outbound" : "inbound");
                msg.putBoolean("read", read == 1);

                messages.pushMap(msg);
            }
            cursor.close();

            promise.resolve(messages);
        } catch (SecurityException e) {
            promise.reject("PERMISSION_DENIED", "لم يتم منح إذن قراءة الرسائل");
        } catch (Exception e) {
            promise.reject("IMPORT_ERROR", e.getMessage());
        }
    }
}
