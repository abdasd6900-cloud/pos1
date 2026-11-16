package com.sahabpos.sms;

import android.telephony.SmsManager;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableNativeArray;
import com.facebook.react.bridge.WritableNativeMap;

import java.util.List;

public class SmsSenderModule extends ReactContextBaseJavaModule {

    private static final String TAG = "SmsSender";

    public SmsSenderModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "SmsSender";
    }

    // ===== Dual SIM: get available subscriptions =====

    @ReactMethod
    public void getSimInfo(final Promise promise) {
        try {
            WritableArray result = new WritableNativeArray();
            SubscriptionManager sm = (SubscriptionManager) getReactApplicationContext()
                    .getSystemService(android.content.Context.TELEPHONY_SUBSCRIPTION_SERVICE);
            if (sm == null) {
                promise.resolve(result);
                return;
            }
            @SuppressWarnings("MissingPermission")
            List<SubscriptionInfo> subs = sm.getActiveSubscriptionInfoList();
            if (subs == null) {
                promise.resolve(result);
                return;
            }
            for (SubscriptionInfo info : subs) {
                WritableNativeMap map = new WritableNativeMap();
                map.putInt("subscriptionId", info.getSubscriptionId());
                map.putInt("simSlotIndex", info.getSimSlotIndex());
                map.putString("carrierName", info.getCarrierName() != null ? info.getCarrierName().toString() : "");
                map.putString("displayName", info.getDisplayName() != null ? info.getDisplayName().toString() : "");
                map.putString("iccId", info.getIccId() != null ? info.getIccId() : "");
                map.putInt("iconTint", info.getIconTint());
                result.pushMap(map);
            }
            promise.resolve(result);
        } catch (Exception e) {
            android.util.Log.e(TAG, "getSimInfo error: " + e.getMessage());
            promise.resolve(new WritableNativeArray());
        }
    }

    // ===== Send with optional subscription ID and delivery report =====

    @ReactMethod
    public void sendSms(String phone, String message, final Callback callback) {
        sendSmsWithSim(phone, message, -1, callback);
    }

    @ReactMethod
    public void sendSmsPromise(String phone, String message, final Promise promise) {
        sendSmsWithSimPromise(phone, message, -1, promise);
    }

    @ReactMethod
    public void sendSmsWithSim(String phone, String message, int subscriptionId, final Callback callback) {
        try {
            SmsManager smsManager = getSmsManager(subscriptionId);
            android.content.Context ctx = getReactApplicationContext();

            if (message.length() > 70) {
                java.util.ArrayList<String> parts = smsManager.divideMessage(message);
                // Delivery intent
                android.app.PendingIntent deliveredPI = createDeliveryIntent(ctx, phone);
                java.util.ArrayList<android.app.PendingIntent> deliveryIntents = new java.util.ArrayList<>();
                for (int i = 0; i < parts.size(); i++) {
                    deliveryIntents.add(deliveredPI);
                }
                smsManager.sendMultipartTextMessage(phone, null, parts, null, deliveryIntents);
            } else {
                android.app.PendingIntent deliveredPI = createDeliveryIntent(ctx, phone);
                smsManager.sendTextMessage(phone, null, message, null, deliveredPI);
            }
            writeSentMessage(phone, message);
            callback.invoke(true);
        } catch (SecurityException e) {
            callback.invoke("PERMISSION_DENIED");
        } catch (Exception e) {
            callback.invoke("ERROR:" + e.getMessage());
        }
    }

    @ReactMethod
    public void sendSmsWithSimPromise(String phone, String message, int subscriptionId, final Promise promise) {
        try {
            SmsManager smsManager = getSmsManager(subscriptionId);
            android.content.Context ctx = getReactApplicationContext();

            if (message.length() > 70) {
                java.util.ArrayList<String> parts = smsManager.divideMessage(message);
                android.app.PendingIntent deliveredPI = createDeliveryIntent(ctx, phone);
                java.util.ArrayList<android.app.PendingIntent> deliveryIntents = new java.util.ArrayList<>();
                for (int i = 0; i < parts.size(); i++) {
                    deliveryIntents.add(deliveredPI);
                }
                smsManager.sendMultipartTextMessage(phone, null, parts, null, deliveryIntents);
            } else {
                android.app.PendingIntent deliveredPI = createDeliveryIntent(ctx, phone);
                smsManager.sendTextMessage(phone, null, message, null, deliveredPI);
            }
            writeSentMessage(phone, message);
            promise.resolve(true);
        } catch (SecurityException e) {
            promise.reject("PERMISSION_DENIED", "لم يتم منح إذن إرسال الرسائل");
        } catch (Exception e) {
            promise.reject("SMS_ERROR", e.getMessage());
        }
    }

    private SmsManager getSmsManager(int subscriptionId) {
        if (subscriptionId >= 0) {
            try {
                return SmsManager.getSmsManagerForSubscriptionId(subscriptionId);
            } catch (Exception e) {
                android.util.Log.w(TAG, "Failed to get SmsManager for subId=" + subscriptionId + ", using default");
            }
        }
        return SmsManager.getDefault();
    }

    private android.app.PendingIntent createDeliveryIntent(android.content.Context ctx, String phone) {
        android.content.Intent intent = new android.content.Intent("com.sahabpos.sms.SMS_DELIVERED");
        intent.putExtra("phone", phone);
        intent.putExtra("timestamp", System.currentTimeMillis());
        return android.app.PendingIntent.getBroadcast(
                ctx, (int) System.currentTimeMillis(), intent,
                android.app.PendingIntent.FLAG_IMMUTABLE | android.app.PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void writeSentMessage(String phone, String message) {
        try {
            android.content.Context ctx = getReactApplicationContext();
            String myPackage = ctx.getPackageName();
            String defaultPackage = android.provider.Telephony.Sms.getDefaultSmsPackage(ctx);
            if (!myPackage.equals(defaultPackage)) return;
            android.content.ContentValues values = new android.content.ContentValues();
            values.put("address", phone);
            values.put("body", message);
            values.put("date", System.currentTimeMillis());
            values.put("type", 2);
            values.put("read", 1);
            ctx.getContentResolver().insert(android.net.Uri.parse("content://sms/sent"), values);
        } catch (Exception e) {
            android.util.Log.e(TAG, "writeSentMessage error: " + e.getMessage());
        }
    }
}
