package com.sahabpos.sms;

import android.Manifest;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.ContactsContract;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableNativeArray;
import com.facebook.react.bridge.WritableNativeMap;

public class ContactsModule extends ReactContextBaseJavaModule {

    private static final String TAG = "ContactsModule";

    public ContactsModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "ContactsNative";
    }

    @ReactMethod
    public void hasPermission(Callback callback) {
        try {
            int granted = ContextCompat.checkSelfPermission(
                getReactApplicationContext(),
                Manifest.permission.READ_CONTACTS
            );
            callback.invoke(granted == PackageManager.PERMISSION_GRANTED);
        } catch (Exception e) {
            callback.invoke(false);
        }
    }

    @ReactMethod
    public void getContacts(final Callback callback) {
        try {
            int granted = ContextCompat.checkSelfPermission(
                getReactApplicationContext(),
                Manifest.permission.READ_CONTACTS
            );
            if (granted != PackageManager.PERMISSION_GRANTED) {
                callback.invoke("PERMISSION_DENIED", null);
                return;
            }

            WritableArray contacts = new WritableNativeArray();
            Cursor cursor = getReactApplicationContext().getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[]{
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                    ContactsContract.CommonDataKinds.Phone.NUMBER
                },
                null,
                null,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
            );

            if (cursor != null) {
                java.util.HashSet<String> seen = new java.util.HashSet<>();
                while (cursor.moveToNext()) {
                    String name = cursor.getString(0);
                    String phone = cursor.getString(1);
                    if (name == null || phone == null) continue;
                    String key = name + "|" + phone;
                    if (seen.contains(key)) continue;
                    seen.add(key);
                    WritableNativeMap contact = new WritableNativeMap();
                    contact.putString("name", name);
                    contact.putString("phone", phone);
                    contacts.pushMap(contact);
                }
                cursor.close();
            }

            callback.invoke(null, contacts);
        } catch (Exception e) {
            Log.e(TAG, "getContacts error", e);
            callback.invoke("ERROR:" + e.getMessage(), null);
        }
    }
}
