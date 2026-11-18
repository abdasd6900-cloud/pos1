package com.sahabpos.sms;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Receives SMS delivery confirmations from SmsManager.
 * Updates the sms_outbox table in Supabase with the delivery status
 * so the web UI can show real-time delivery reports.
 */
public class SmsDeliveryReceiver extends BroadcastReceiver {

    private static final String TAG = "SmsDelivery";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;

        if ("com.sahabpos.sms.SMS_DELIVERED".equals(action)) {
            handleDelivery(context, intent);
            return;
        }

        if ("com.sahabpos.sms.SMS_SENT".equals(action)) {
            handleSent(context, intent);
            return;
        }
    }

    private void handleDelivery(Context context, Intent intent) {
        String phone = intent.getStringExtra("phone");
        String rowId = intent.getStringExtra("row_id");
        long timestamp = intent.getLongExtra("timestamp", System.currentTimeMillis());

        int resultCode = getResultCode();
        boolean delivered = (resultCode == android.app.Activity.RESULT_OK);

        Log.i(TAG, "Delivery report for " + phone + " (row=" + rowId + "): " + (delivered ? "DELIVERED" : "FAILED") + " (code=" + resultCode + ")");

        // Update Supabase sms_outbox with delivery status
        if (rowId != null && !rowId.isEmpty()) {
            updateDeliveryStatus(context, rowId, delivered);
        }

        // Also store in SharedPreferences as backup
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

    private void handleSent(Context context, Intent intent) {
        String rowId = intent.getStringExtra("row_id");
        int resultCode = getResultCode();
        boolean sent = (resultCode == android.app.Activity.RESULT_OK);

        Log.i(TAG, "Sent report (row=" + rowId + "): " + (sent ? "SENT_OK" : "SENT_FAILED") + " (code=" + resultCode + ")");

        if (rowId != null && !rowId.isEmpty() && !sent) {
            // If the sent intent reports failure, update delivery_status to failed
            updateDeliveryStatus(context, rowId, false);
        }
    }

    private void updateDeliveryStatus(Context context, String rowId, boolean delivered) {
        try {
            android.content.SharedPreferences prefs = context.getSharedPreferences("sahab_prefs", Context.MODE_PRIVATE);
            String supabaseUrl = prefs.getString("supabase_url", "");
            String supabaseAnonKey = prefs.getString("supabase_anon_key", "");

            if (supabaseUrl == null || supabaseUrl.isEmpty() || !supabaseUrl.startsWith("https://")) {
                Log.w(TAG, "Supabase not configured, skipping delivery update");
                return;
            }

            URL url = new URL(supabaseUrl + "/rest/v1/sms_outbox?id=eq." + rowId);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("PATCH");
            conn.setRequestProperty("apikey", supabaseAnonKey);
            conn.setRequestProperty("Authorization", "Bearer " + supabaseAnonKey);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "return=minimal");

            JSONObject body = new JSONObject();
            body.put("delivery_status", delivered ? "delivered" : "failed");
            if (delivered) {
                body.put("delivered_at", new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", java.util.Locale.US).format(new java.util.Date()));
            }

            conn.setDoOutput(true);
            OutputStream os = conn.getOutputStream();
            os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            os.close();

            int code = conn.getResponseCode();
            conn.disconnect();

            Log.i(TAG, "Delivery status updated in Supabase: " + code + " (delivered=" + delivered + ")");
        } catch (Exception e) {
            Log.e(TAG, "Error updating delivery status in Supabase: " + e.getMessage());
        }
    }
}
