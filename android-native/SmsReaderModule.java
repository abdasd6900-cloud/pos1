package com.sahabpos.sms;

import android.Manifest;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Telephony;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableNativeArray;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.bridge.WritableMap;

import androidx.core.content.ContextCompat;

public class SmsReaderModule extends ReactContextBaseJavaModule {

    private static final String TAG = "SmsReader";

    public SmsReaderModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "SmsReader";
    }

    @ReactMethod
    public void hasReadPermission(Promise promise) {
        try {
            int result = ContextCompat.checkSelfPermission(getReactApplicationContext(), Manifest.permission.READ_SMS);
            promise.resolve(result == PackageManager.PERMISSION_GRANTED);
        } catch (Exception e) {
            promise.reject("PERMISSION_CHECK_ERROR", e.getMessage());
        }
    }

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
                // type: 1=inbox, 2=sent, 3=draft, 4=outbox, 5=failed, 6=queued
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
