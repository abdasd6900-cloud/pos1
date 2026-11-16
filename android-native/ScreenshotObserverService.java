package com.sahabpos.sms;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.ContentObserver;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.DataOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * ScreenshotObserverService — foreground service that monitors MediaStore for
 * new screenshots. When a screenshot is detected, it reads the image as base64,
 * sends it to the Supabase ai-ocr edge function for classification, then shows
 * a notification:
 *
 *  - SIM card detected → notification tap opens the app and routes to the sale
 *    screen with phone + sim fields pre-filled.
 *  - Transfer receipt detected → notification tap opens the app and routes to
 *    the supplier payment screen with amount pre-filled.
 *
 * The service runs independently of the React Native UI, so it continues
 * working even when the app is closed. Credentials are read from
 * SharedPreferences (written by the RN app).
 */
public class ScreenshotObserverService extends Service {

    private static final String TAG = "ScreenshotObserver";
    private static final String CHANNEL_ID = "screenshot_channel";
    private static final String CHANNEL_ID_RESULT = "screenshot_result_channel";
    private static final int NOTIFICATION_ID = 1002;
    private static final long OBSERVER_THROTTLE_MS = 1500;

    private Handler handler;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private ContentObserver screenshotObserver;
    private String supabaseUrl;
    private String supabaseAnonKey;
    private long lastProcessedTime = 0;
    private String lastProcessedPath = "";

    @Override
    public void onCreate() {
        super.onCreate();
        handler = new Handler(Looper.getMainLooper());
        createNotificationChannels();

        Notification notification = buildForegroundNotification("مراقب لقطات الشاشة يعمل");
        startForeground(NOTIFICATION_ID, notification);

        android.content.SharedPreferences prefs = getSharedPreferences("sahab_prefs", MODE_PRIVATE);
        supabaseUrl = prefs.getString("supabase_url", "");
        supabaseAnonKey = prefs.getString("supabase_anon_key", "");
        boolean screenshotEnabled = prefs.getBoolean("screenshot_detection_enabled", true);

        if (!screenshotEnabled) {
            Log.i(TAG, "Screenshot detection disabled in prefs, stopping service");
            stopSelf();
            return;
        }

        registerScreenshotObserver();
        Log.i(TAG, "Service created. Monitoring MediaStore for screenshots.");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        android.content.SharedPreferences prefs = getSharedPreferences("sahab_prefs", MODE_PRIVATE);
        supabaseUrl = prefs.getString("supabase_url", supabaseUrl);
        supabaseAnonKey = prefs.getString("supabase_anon_key", supabaseAnonKey);
        running.set(true);
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        running.set(false);
        if (screenshotObserver != null) {
            try {
                getContentResolver().unregisterContentObserver(screenshotObserver);
            } catch (Exception e) {
                Log.e(TAG, " unregister error: " + e.getMessage());
            }
        }
        super.onDestroy();
    }

    private void registerScreenshotObserver() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            Uri externalImages = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            screenshotObserver = new ContentObserver(handler) {
                @Override
                public void onChange(boolean selfChange, Uri uri) {
                    if (!running.get()) return;
                    if (uri == null) return;
                    // Throttle — avoid duplicate fires
                    long now = System.currentTimeMillis();
                    if (now - lastProcessedTime < OBSERVER_THROTTLE_MS) return;
                    lastProcessedTime = now;
                    handler.post(() -> checkNewScreenshot(uri));
                }
            };
            getContentResolver().registerContentObserver(externalImages, true, screenshotObserver);
        } else {
            // Pre-API 29: use a polling fallback
            startLegacyPolling();
        }
    }

    private void startLegacyPolling() {
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (!running.get()) return;
                checkLatestScreenshotLegacy();
                handler.postDelayed(this, 3000);
            }
        }, 3000);
    }

    private void checkNewScreenshot(Uri uri) {
        try {
            String[] projection = { MediaStore.Images.Media._ID,
                    MediaStore.Images.Media.DISPLAY_NAME, MediaStore.Images.Media.MIME_TYPE,
                    MediaStore.Images.Media.DATE_ADDED };
            String selection = MediaStore.Images.Media.DATE_ADDED + " >= ? AND ("
                    + MediaStore.Images.Media.DISPLAY_NAME + " LIKE ? OR "
                    + MediaStore.Images.Media.DISPLAY_NAME + " LIKE ? OR "
                    + MediaStore.Images.Media.DISPLAY_NAME + " LIKE ? OR "
                    + MediaStore.Images.Media.DISPLAY_NAME + " LIKE ? )";
            String[] selectionArgs = {
                    String.valueOf((System.currentTimeMillis() / 1000) - 30),
                    "%Screenshot%", "%screenshot%", "%لقطة%", "%capture%"
            };
            Cursor cursor = getContentResolver().query(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    projection, selection, selectionArgs,
                    MediaStore.Images.Media.DATE_ADDED + " DESC");
            if (cursor == null) return;
            if (cursor.moveToFirst()) {
                long imageId = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID));
                String displayName = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME));
                String mimeType = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE));
                long dateAdded = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED));
                cursor.close();

                String imageKey = String.valueOf(imageId);
                if (!isScreenshot(displayName, null) || imageKey.equals(lastProcessedPath)) return;
                if ((System.currentTimeMillis() / 1000) - dateAdded > 30) return;
                lastProcessedPath = imageKey;

                Uri imageUri = Uri.withAppendedPath(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, imageKey);
                Log.i(TAG, "New screenshot detected: " + displayName);
                String base64Image = readImageAsBase64(imageUri, mimeType);
                if (base64Image == null) return;
                new Thread(() -> processOcr(base64Image, displayName)).start();
            } else {
                cursor.close();
            }
        } catch (Exception e) {
            Log.e(TAG, "checkNewScreenshot error: " + e.getMessage());
        }
    }

    private void checkLatestScreenshotLegacy() {
        try {
            String[] projection = { MediaStore.Images.Media._ID, MediaStore.Images.Media.DATA,
                    MediaStore.Images.Media.DISPLAY_NAME, MediaStore.Images.Media.MIME_TYPE,
                    MediaStore.Images.Media.DATE_ADDED };
            String selection = MediaStore.Images.Media.DISPLAY_NAME + " LIKE '%Screenshot%'";
            Cursor cursor = getContentResolver().query(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    projection, selection, null,
                    MediaStore.Images.Media.DATE_ADDED + " DESC LIMIT 1");
            if (cursor == null) return;
            if (cursor.moveToFirst()) {
                String displayName = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME));
                String dataPath = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATA));
                long dateAdded = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED));
                int id = cursor.getInt(cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID));
                cursor.close();

                if (dataPath != null && dataPath.equals(lastProcessedPath)) return;
                long now = System.currentTimeMillis() / 1000;
                if (now - dateAdded > 5) return;

                lastProcessedPath = dataPath;
                Uri uri = Uri.withAppendedPath(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, String.valueOf(id));
                String mimeType = "image/png";
                String base64Image = readImageAsBase64(uri, mimeType);
                if (base64Image == null) return;

                new Thread(() -> processOcr(base64Image, displayName)).start();
            } else {
                cursor.close();
            }
        } catch (Exception e) {
            Log.e(TAG, "checkLatestScreenshotLegacy error: " + e.getMessage());
        }
    }

    private boolean isScreenshot(String displayName, String dataPath) {
        if (displayName == null && dataPath == null) return false;
        String combined = (displayName != null ? displayName : "") + " " + (dataPath != null ? dataPath : "");
        String lower = combined.toLowerCase();
        return lower.contains("screenshot") || lower.contains("لقطة") || lower.contains("capture")
                || lower.contains("screen_capture") || lower.contains("screenshots");
    }

    private String readImageAsBase64(Uri uri, String mimeType) {
        try {
            InputStream inputStream = getContentResolver().openInputStream(uri);
            if (inputStream == null) return null;
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int bytesRead;
            long totalRead = 0;
            final long MAX_IMAGE_BYTES = 4 * 1024 * 1024;
            while ((bytesRead = inputStream.read(buffer)) != -1) {
                totalRead += bytesRead;
                if (totalRead > MAX_IMAGE_BYTES) {
                    inputStream.close();
                    Log.e(TAG, "Image too large, skipping (" + totalRead + " bytes)");
                    return null;
                }
                baos.write(buffer, 0, bytesRead);
            }
            inputStream.close();
            byte[] imageBytes = baos.toByteArray();
            String base64 = android.util.Base64.encodeToString(imageBytes, android.util.Base64.NO_WRAP);
            String mime = (mimeType != null) ? mimeType : "image/png";
            return "data:" + mime + ";base64," + base64;
        } catch (Exception e) {
            Log.e(TAG, "readImageAsBase64 error: " + e.getMessage());
            return null;
        }
    }

    private void processOcr(String base64Image, String displayName) {
        try {
            if (supabaseUrl == null || supabaseUrl.isEmpty() || supabaseAnonKey == null || supabaseAnonKey.isEmpty()) {
                android.content.SharedPreferences prefs = getSharedPreferences("sahab_prefs", MODE_PRIVATE);
                supabaseUrl = prefs.getString("supabase_url", "");
                supabaseAnonKey = prefs.getString("supabase_anon_key", "");
            }
            if (supabaseUrl == null || supabaseUrl.isEmpty() || supabaseAnonKey == null || supabaseAnonKey.isEmpty()) {
                Log.e(TAG, "Supabase credentials not configured");
                return;
            }

            URL url = new URL(supabaseUrl + "/functions/v1/ai-ocr");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("apikey", supabaseAnonKey);
            conn.setRequestProperty("Authorization", "Bearer " + supabaseAnonKey);

            JSONObject body = new JSONObject();
            body.put("image", base64Image);

            conn.setDoOutput(true);
            DataOutputStream os = new DataOutputStream(conn.getOutputStream());
            os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            os.flush();
            os.close();

            int responseCode = conn.getResponseCode();
            if (responseCode != 200) {
                Log.e(TAG, "OCR request failed: " + responseCode);
                BufferedReader errReader = new BufferedReader(new InputStreamReader(conn.getErrorStream(), StandardCharsets.UTF_8));
                StringBuilder errSb = new StringBuilder();
                String errLine;
                while ((errLine = errReader.readLine()) != null) errSb.append(errLine);
                errReader.close();
                Log.e(TAG, "Error body: " + errSb.toString());
                conn.disconnect();
                return;
            }

            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            reader.close();
            conn.disconnect();

            JSONObject result = new JSONObject(sb.toString());
            String type = result.optString("type", "unknown");

            if ("sim_card".equals(type)) {
                String phone = result.optString("phone", "");
                String sim = result.optString("sim", "");
                if (phone.isEmpty() && sim.isEmpty()) {
                    Log.i(TAG, "SIM card detected but no fields extracted");
                    return;
                }
                showSimCardNotification(phone, sim, displayName);
            } else if ("transfer_receipt".equals(type)) {
                String senderName = result.optString("senderName", "");
                String recipientName = result.optString("recipientName", "");
                double amount = result.optDouble("amount", 0);
                String currency = result.optString("currency", "");
                String reference = result.optString("reference", "");
                if (amount <= 0 && senderName.isEmpty() && recipientName.isEmpty()) {
                    Log.i(TAG, "Transfer receipt detected but no fields extracted");
                    return;
                }
                showTransferNotification(senderName, recipientName, amount, currency, reference, displayName);
            } else if ("whatsapp_voice".equals(type)) {
                showVoiceMessageNotification(displayName);
            } else if ("whatsapp_image_sim".equals(type)) {
                showImageSimNotification(displayName);
            } else {
                Log.i(TAG, "Image type: unknown — no action");
            }
        } catch (Exception e) {
            Log.e(TAG, "processOcr error: " + e.getMessage());
        }
    }

    private void showSimCardNotification(String phone, String sim, String displayName) {
        // Build deep link: sahabpos://screenshot/sim?phone=XXX&sim=YYY
        String deepLink = "sahabpos://screenshot/sim?phone=" + Uri.encode(phone) + "&sim=" + Uri.encode(sim);

        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(deepLink));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String contentText = "رقم الهاتف: " + phone;
        if (!sim.isEmpty()) contentText += "\nرقم الشريحة: " + sim;

        Notification notification = buildResultNotification(
                "تم رصد شريحة إلكترونية",
                contentText,
                "اضغط لفتح شاشة البيع بالأرقام المستخرجة",
                pendingIntent,
                2001);

        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(2001, notification);

        Log.i(TAG, "SIM card notification shown");
    }

    private void showTransferNotification(String senderName, String recipientName, double amount,
            String currency, String reference, String displayName) {
        // Build deep link: sahabpos://screenshot/transfer?amount=XXX&sender=YYY&recipient=ZZZ
        StringBuilder linkBuilder = new StringBuilder("sahabpos://screenshot/transfer?");
        linkBuilder.append("amount=").append(amount);
        if (!senderName.isEmpty()) linkBuilder.append("&sender=").append(Uri.encode(senderName));
        if (!recipientName.isEmpty()) linkBuilder.append("&recipient=").append(Uri.encode(recipientName));
        if (!currency.isEmpty()) linkBuilder.append("&currency=").append(Uri.encode(currency));
        if (!reference.isEmpty()) linkBuilder.append("&reference=").append(Uri.encode(reference));

        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(linkBuilder.toString()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(this, 1, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        StringBuilder contentBuilder = new StringBuilder();
        if (amount > 0) contentBuilder.append("المبلغ: ").append(formatAmount(amount)).append(" ").append(currency);
        if (!senderName.isEmpty()) contentBuilder.append("\nالمرسل: ").append(senderName);
        if (!recipientName.isEmpty()) contentBuilder.append("\nالمستقبل: ").append(recipientName);

        Notification notification = buildResultNotification(
                "تم رصد وصل مالي / تحويل",
                contentBuilder.toString(),
                "اضغط لتسجيل دفعة للمورد",
                pendingIntent,
                2002);

        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(2002, notification);

        Log.i(TAG, "Transfer notification shown");
    }

    private void showVoiceMessageNotification(String displayName) {
        String message = "رسالة صوتية من زبون عبر واتساب";
        String subText = "اطلب من الزبون كتابة ما يريد نصاً";

        Notification notification = buildResultNotification(
                "رسالة صوتية من واتساب",
                message,
                subText,
                null,
                2003);

        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(2003, notification);

        Log.i(TAG, "Voice message notification shown");
    }

    private void showImageSimNotification(String displayName) {
        String message = "صورة من زبون عبر واتساب قد تحتوي رقم شريحة";
        String subText = "اطلب من الزبون كتابة رقم الشريحة نصاً";

        Notification notification = buildResultNotification(
                "صورة من واتساب - رقم شريحة",
                message,
                subText,
                null,
                2004);

        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(2004, notification);

        Log.i(TAG, "Image SIM notification shown");
    }

    private String formatAmount(double amount) {
        if (amount == (long) amount) return String.valueOf((long) amount);
        return String.valueOf(amount);
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager == null) return;

            NotificationChannel fgChannel = new NotificationChannel(
                    CHANNEL_ID, "مراقب لقطات الشاشة", NotificationManager.IMPORTANCE_LOW);
            fgChannel.setDescription("خدمة مراقبة لقطات الشاشة في الخلفية");
            manager.createNotificationChannel(fgChannel);

            NotificationChannel resultChannel = new NotificationChannel(
                    CHANNEL_ID_RESULT, "تنبيهات رصد الشاشة", NotificationManager.IMPORTANCE_HIGH);
            resultChannel.setDescription("إشعارات عند رصد شريحة أو وصل مالي في لقطة الشاشة");
            resultChannel.enableVibration(true);
            resultChannel.enableLights(true);
            manager.createNotificationChannel(resultChannel);
        }
    }

    private Notification buildForegroundNotification(String text) {
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }
        return builder
                .setContentTitle("سحاب POS")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setOngoing(true)
                .build();
    }

    private Notification buildResultNotification(String title, String text, String subText,
            PendingIntent contentIntent, int id) {
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID_RESULT);
        } else {
            builder = new Notification.Builder(this);
        }
        Notification.BigTextStyle bigStyle = new Notification.BigTextStyle()
                .bigText(text)
                .setSummaryText(subText);
        return builder
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(bigStyle)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(contentIntent)
                .setAutoCancel(true)
                .setPriority(Notification.PRIORITY_HIGH)
                .build();
    }
}
