package com.sahabpos.sms;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Receives SMS delivery confirmations from SmsManager.
 * Sends a JS event via AsyncStorage so the RN layer can update send status.
 */
public class SmsDeliveryReceiver extends BroadcastReceiver {

    private static final String TAG = "SmsDelivery";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!"com.sahabpos.sms.SMS_DELIVERED".equals(intent.getAction())) return;

        String phone = intent.getStringExtra("phone");
        long timestamp = intent.getLongExtra("timestamp", System.currentTimeMillis());

        int resultCode = getResultCode();
        boolean delivered = (resultCode == android.app.Activity.RESULT_OK);

        Log.i(TAG, "Delivery report for " + phone + ": " + (delivered ? "DELIVERED" : "FAILED") + " (code=" + resultCode + ")");

        // Store delivery status in SharedPreferences so RN can poll/read it
        try {
            android.content.SharedPreferences prefs = context.getSharedPreferences("sms_delivery_status", Context.MODE_PRIVATE);
            String key = "delivery_" + phone + "_" + timestamp;
            prefs.edit()
                .putString(key, delivered ? "delivered" : "failed")
                .putLong(key + "_time", System.currentTimeMillis())
                .apply();
        } catch (Exception e) {
            Log.e(TAG, "Error saving delivery status: " + e.getMessage());
        }
    }
}
