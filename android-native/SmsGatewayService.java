package com.sahabpos.sms;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Telephony;
import android.telephony.SmsManager;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * SmsGatewayService — foreground service that polls the Supabase sms_outbox
 * and sends pending messages via the device SIM.
 *
 * On boot, BootReceiver starts this service. It creates a persistent
 * notification (required for foreground services on Android 8+) so the
 * system keeps it alive.
 *
 * This service is written in plain Java and does not depend on React Native
 * runtime, so it continues working even when the app UI is closed. It reads
 * Supabase credentials from the app's SharedPreferences (written by the RN
 * settings screen) or falls back to BuildConfig values injected at compile time.
 */
public class SmsGatewayService extends Service {

    private static final String TAG = "SmsGatewayService";
    private static final String CHANNEL_ID = "sms_gateway_channel";
    private static final int NOTIFICATION_ID = 1001;
    private static final long POLL_INTERVAL_MS = 10000;
    private static final int MAX_ATTEMPTS = 3;

    private Handler handler;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private String supabaseUrl;
    private String supabaseAnonKey;
    private boolean gatewayEnabled = false;

    @Override
    public void onCreate() {
        super.onCreate();
        handler = new Handler(Looper.getMainLooper());
        createNotificationChannel();

        Notification notification = buildNotification("بوابة SMS تعمل");
        startForeground(NOTIFICATION_ID, notification);

        // Read config from SharedPreferences (written by RN app settings)
        android.content.SharedPreferences prefs = getSharedPreferences("sahab_prefs", MODE_PRIVATE);
        supabaseUrl = prefs.getString("supabase_url", "");
        supabaseAnonKey = prefs.getString("supabase_anon_key", "");
        gatewayEnabled = prefs.getBoolean("sms_gateway_enabled", false);

        Log.i(TAG, "Service created. Gateway enabled: " + gatewayEnabled);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!running.get()) {
            running.set(true);
            startPolling();
        }
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        running.set(false);
        super.onDestroy();
    }

    private void startPolling() {
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (!running.get()) return;
                android.content.SharedPreferences prefs = getSharedPreferences("sahab_prefs", MODE_PRIVATE);
                gatewayEnabled = prefs.getBoolean("sms_gateway_enabled", false);
                supabaseUrl = prefs.getString("supabase_url", "");
                supabaseAnonKey = prefs.getString("supabase_anon_key", "");
                if (gatewayEnabled && supabaseUrl != null && !supabaseUrl.isEmpty() && supabaseUrl.startsWith("https://")) {
                    new Thread(() -> {
                        sendHeartbeat();
                        processOutbox();
                    }).start();
                }
                handler.postDelayed(this, POLL_INTERVAL_MS);
            }
        }, POLL_INTERVAL_MS);
    }

    private void processOutbox() {
        try {
            // Fetch pending messages that haven't been claimed by another poller
            URL url = new URL(supabaseUrl + "/rest/v1/sms_outbox?select=id,event_id,phone,message,attempts&status=eq.pending&claimed_at=is.null&order=created_at.asc&limit=5");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("apikey", supabaseAnonKey);
            conn.setRequestProperty("Authorization", "Bearer " + supabaseAnonKey);
            conn.setRequestProperty("Content-Type", "application/json");

            if (conn.getResponseCode() != 200) {
                Log.e(TAG, "Fetch failed: " + conn.getResponseCode());
                conn.disconnect();
                return;
            }

            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            reader.close();
            conn.disconnect();

            JSONArray rows = new JSONArray(sb.toString());
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.getJSONObject(i);
                String id = row.getString("id");
                String phone = row.getString("phone");
                String message = row.getString("message");
                int attempts = row.optInt("attempts", 0);

                // Atomically claim the row — only proceeds if still pending and unclaimed
                if (!claimOutboxRow(id)) {
                    Log.i(TAG, "Row already claimed by another poller, skipping");
                    continue;
                }

                boolean sent = sendSmsNative(phone, message, row.optString("event_id", ""), id);

                if (sent) {
                    updateOutboxRow(id, "sent", null, true);
                    updateNotification("تم إرسال: " + phone);
                } else {
                    int nextAttempts = attempts + 1;
                    if (nextAttempts >= MAX_ATTEMPTS) {
                        updateOutboxRow(id, "failed", "فشل بعد " + nextAttempts + " محاولات", false);
                    } else {
                        updateOutboxRowAttempts(id, nextAttempts, "فشل الإرسال");
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "processOutbox error: " + e.getMessage());
        }
    }

    private boolean sendSmsNative(String phone, String message, String eventId, String rowId) {
        try {
            SmsManager smsManager = SmsManager.getDefault();

            // Create delivery intent that carries the event_id and row_id
            Intent deliveryIntent = new Intent("com.sahabpos.sms.SMS_DELIVERED");
            deliveryIntent.putExtra("phone", phone);
            deliveryIntent.putExtra("event_id", eventId);
            deliveryIntent.putExtra("row_id", rowId);
            deliveryIntent.putExtra("timestamp", System.currentTimeMillis());
            android.app.PendingIntent deliveredPI = android.app.PendingIntent.getBroadcast(
                this, 0, deliveryIntent, android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE);

            Intent sentIntent = new Intent("com.sahabpos.sms.SMS_SENT");
            sentIntent.putExtra("event_id", eventId);
            sentIntent.putExtra("row_id", rowId);
            android.app.PendingIntent sentPI = android.app.PendingIntent.getBroadcast(
                this, 0, sentIntent, android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE);

            if (message.length() > 70) {
                java.util.ArrayList<String> parts = smsManager.divideMessage(message);
                java.util.ArrayList<android.app.PendingIntent> sentIntents = new java.util.ArrayList<>();
                java.util.ArrayList<android.app.PendingIntent> deliveredIntents = new java.util.ArrayList<>();
                for (int i = 0; i < parts.size(); i++) {
                    sentIntents.add(i == parts.size() - 1 ? sentPI : null);
                    deliveredIntents.add(i == parts.size() - 1 ? deliveredPI : null);
                }
                smsManager.sendMultipartTextMessage(phone, null, parts, sentIntents, deliveredIntents);
            } else {
                smsManager.sendTextMessage(phone, null, message, sentPI, deliveredPI);
            }
            Log.i(TAG, "SMS sent successfully with delivery tracking for event: " + eventId);

            // If we are the default SMS app, write to the sent store
            String myPackage = getPackageName();
            String defaultPackage = Telephony.Sms.getDefaultSmsPackage(this);
            if (myPackage.equals(defaultPackage)) {
                android.content.ContentValues values = new android.content.ContentValues();
                values.put("address", phone);
                values.put("body", message);
                values.put("date", System.currentTimeMillis());
                values.put("type", 2); // 2 = sent
                values.put("read", 1);
                getContentResolver().insert(android.net.Uri.parse("content://sms/sent"), values);
            }
            return true;
        } catch (SecurityException e) {
            Log.e(TAG, "SMS permission denied: " + e.getMessage());
            return false;
        } catch (Exception e) {
            Log.e(TAG, "SMS send error: " + e.getMessage());
            return false;
        }
    }

    private void sendHeartbeat() {
        try {
            URL url = new URL(supabaseUrl + "/rest/v1/device_heartbeats");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("apikey", supabaseAnonKey);
            conn.setRequestProperty("Authorization", "Bearer " + supabaseAnonKey);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "return=minimal, resolution=merge-duplicates");

            JSONObject body = new JSONObject();
            body.put("device_id", "android-phone");
            body.put("device_type", "android");
            body.put("last_seen", new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", java.util.Locale.US).format(new java.util.Date()));

            conn.setDoOutput(true);
            OutputStream os = conn.getOutputStream();
            os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            os.close();

            conn.getResponseCode();
            conn.disconnect();
        } catch (Exception e) {
            Log.e(TAG, "Heartbeat error: " + e.getMessage());
        }
    }

    private boolean claimOutboxRow(String id) {
        try {
            // PATCH with status=eq.pending filter — only succeeds if still pending
            // Using claimed_at=is.null in the filter ensures we don't double-claim
            URL url = new URL(supabaseUrl + "/rest/v1/sms_outbox?id=eq." + id + "&status=eq.pending&claimed_at=is.null");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("PATCH");
            conn.setRequestProperty("apikey", supabaseAnonKey);
            conn.setRequestProperty("Authorization", "Bearer " + supabaseAnonKey);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "return=representation");

            JSONObject body = new JSONObject();
            body.put("claimed_at", new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", java.util.Locale.US).format(new java.util.Date()));

            conn.setDoOutput(true);
            OutputStream os = conn.getOutputStream();
            os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            os.close();

            int code = conn.getResponseCode();
            // Read response body to check if any row was actually updated
            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            reader.close();
            conn.disconnect();

            // If the response contains an array with at least one element, the claim succeeded
            String response = sb.toString();
            return code == 200 && response != null && response.length() > 2 && !response.equals("[]");
        } catch (Exception e) {
            Log.e(TAG, "claimOutboxRow error: " + e.getMessage());
            return false;
        }
    }

    private void updateOutboxRow(String id, String status, String error, boolean setSentAt) {
        try {
            URL url = new URL(supabaseUrl + "/rest/v1/sms_outbox?id=eq." + id);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("PATCH");
            conn.setRequestProperty("apikey", supabaseAnonKey);
            conn.setRequestProperty("Authorization", "Bearer " + supabaseAnonKey);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "return=minimal");

            JSONObject body = new JSONObject();
            body.put("status", status);
            body.put("last_error", error);
            if (setSentAt) {
                body.put("sent_at", new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", java.util.Locale.US).format(new java.util.Date()));
            }

            conn.setDoOutput(true);
            OutputStream os = conn.getOutputStream();
            os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            os.close();

            conn.getResponseCode();
            conn.disconnect();
        } catch (Exception e) {
            Log.e(TAG, "updateOutboxRow error: " + e.getMessage());
        }
    }

    private void updateOutboxRowAttempts(String id, int attempts, String error) {
        try {
            URL url = new URL(supabaseUrl + "/rest/v1/sms_outbox?id=eq." + id);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("PATCH");
            conn.setRequestProperty("apikey", supabaseAnonKey);
            conn.setRequestProperty("Authorization", "Bearer " + supabaseAnonKey);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "return=minimal");

            JSONObject body = new JSONObject();
            body.put("attempts", attempts);
            body.put("last_error", error);

            conn.setDoOutput(true);
            OutputStream os = conn.getOutputStream();
            os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            os.close();

            conn.getResponseCode();
            conn.disconnect();
        } catch (Exception e) {
            Log.e(TAG, "updateOutboxRowAttempts error: " + e.getMessage());
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "بوابة الرسائل",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("خدمة إرسال رسائل المعاملات");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(String text) {
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }
        return builder
            .setContentTitle("بوابة SMS سحاب")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .build();
    }

    private void updateNotification(String text) {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildNotification(text));
        }
    }
}
