package com.sahabpos.sms;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * WapPushReceiver — handles WAP_PUSH_DELIVER intents for MMS messages.
 * Required by Android for an app to be eligible as the default SMS handler.
 * It forwards the MMS notification to the app for processing.
 */
public class WapPushReceiver extends BroadcastReceiver {

    private static final String TAG = "WapPushReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!"android.provider.Telephony.WAP_PUSH_DELIVER".equals(action)) {
            return;
        }

        String mimeType = intent.getType();
        Log.i(TAG, "WAP_PUSH_DELIVER received, type: " + mimeType);

        // Forward the MMS notification to Supabase via the same mechanism as SMS
        android.content.SharedPreferences prefs = context.getSharedPreferences("sahab_prefs", Context.MODE_PRIVATE);
        String supabaseUrl = prefs.getString("supabase_url", "");
        String supabaseAnonKey = prefs.getString("supabase_anon_key", "");

        if (supabaseUrl == null || supabaseUrl.isEmpty()) return;

        try {
            byte[] pushData = intent.getByteArrayExtra("data");
            if (pushData != null) {
                String pushHex = bytesToHex(pushData);
                Log.i(TAG, "MMS push data length: " + pushData.length);

                // Push to data_sync as a customerReply for the web app to see
                java.net.URL url = new java.net.URL(supabaseUrl + "/rest/v1/data_sync");
                java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("apikey", supabaseAnonKey);
                conn.setRequestProperty("Authorization", "Bearer " + supabaseAnonKey);
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Prefer", "return=minimal");

                org.json.JSONObject payload = new org.json.JSONObject();
                payload.put("collection", "customerReplies");
                payload.put("data", new org.json.JSONObject()
                    .put("senderPhone", "MMS")
                    .put("message", "رسالة وسائط متعددة (MMS) واردة")
                    .put("channel", "mms")
                    .put("timestamp", System.currentTimeMillis()));
                payload.put("updated_at", new java.text.SimpleDateFormat(
                    "yyyy-MM-dd'T'HH:mm:ss.SSSXXX", java.util.Locale.US)
                    .format(new java.util.Date()));

                conn.setDoOutput(true);
                java.io.OutputStream os = conn.getOutputStream();
                os.write(payload.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
                os.close();
                conn.getResponseCode();
                conn.disconnect();
            }
        } catch (Exception e) {
            Log.e(TAG, "WAP push handling error: " + e.getMessage());
        }
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
