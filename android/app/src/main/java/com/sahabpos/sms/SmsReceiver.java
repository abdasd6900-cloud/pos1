package com.sahabpos.sms;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.telephony.SmsMessage;
import android.util.Log;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * SmsReceiver — intercepts incoming SMS messages, extracts phone numbers
 * that look like SIM card numbers (Palestinian prefixes), and pushes them
 * to Supabase as pending operations for the app to process.
 *
 * Also handles auto-reply when the store is closed, by reading the business
 * hours config from SharedPreferences.
 */
public class SmsReceiver extends BroadcastReceiver {

    private static final String TAG = "SmsReceiver";
    private static final String PREFS = "sahab_prefs";

    // Palestinian mobile prefixes
    private static final String[] SIM_PREFIXES = {"050", "052", "053", "054", "055", "056", "058", "059"};
    private static final Pattern PHONE_PATTERN = Pattern.compile("0\\d{9,10}");
    private static final String[] COMPANIES_REQUIRING_DURATION = {"ويكم", "الوها"};
    private static final String SPECIFY_DURATION_MSG = "يرجى تحديد مدة الشحن المطلوبة (شهر، شهرين، إلخ) حتى نتمكن من تنفيذ طلبك.";
    private static final String RECHARGE_ACCEPTED_MSG = "تم استلام طلبك وسيتم إبلاغك حين تنفيذه، شكراً لصبركم.";
    private static final String IMAGE_SIM_NUMBER_MSG = "استلمنا صورتك، لكننا لا نستطيع قراءة الأرقام من الصور تلقائياً. يرجى كتابة رقم الشريحة كنص حتى نتمكن من تنفيذ طلبك.";
    private static final String VOICE_MESSAGE_MSG = "أنا مساعدة آلية ولا أستطيع الاستماع للرسائل الصوتية. يرجى كتابة ما تريد نصاً حتى أتمكن من مساعدتك.";

    private Context appContext;

    // Dedup: track recently processed messages to avoid double-processing
    // when both SMS_RECEIVED and SMS_DELIVER fire for the same message.
    private static final long DEDUP_WINDOW_MS = 10 * 1000; // 10 seconds
    private static String lastProcessedKey = "";
    private static long lastProcessedTime = 0;

    private boolean isDuplicateMessage(String senderPhone, String message) {
        String key = senderPhone + ":" + message.hashCode();
        long now = System.currentTimeMillis();
        if (key.equals(lastProcessedKey) && (now - lastProcessedTime) < DEDUP_WINDOW_MS) {
            return true;
        }
        lastProcessedKey = key;
        lastProcessedTime = now;
        return false;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || (!intent.getAction().equals("android.provider.Telephony.SMS_RECEIVED")
            && !intent.getAction().equals("android.provider.Telephony.SMS_DELIVER")
            && !intent.getAction().equals("android.provider.Telephony.MMS_RECEIVED"))) {
            return;
        }

        Bundle bundle = intent.getExtras();
        if (bundle == null) return;

        Object[] pdus = (Object[]) bundle.get("pdus");
        if (pdus == null) return;

        StringBuilder fullMessage = new StringBuilder();
        String senderPhone = "";

        for (Object pdu : pdus) {
            String format = bundle.getString("format");
            SmsMessage msg = format != null
                ? SmsMessage.createFromPdu((byte[]) pdu, format)
                : SmsMessage.createFromPdu((byte[]) pdu);
            if (msg != null) {
                senderPhone = msg.getOriginatingAddress();
                fullMessage.append(msg.getMessageBody());
            }
        }

        if (senderPhone == null || fullMessage.length() == 0) return;

        // Dedup: skip if we just processed this exact message
        if (isDuplicateMessage(senderPhone, fullMessage.toString())) {
            Log.i(TAG, "Duplicate SMS event, skipping");
            return;
        }

        appContext = context.getApplicationContext();

        String message = fullMessage.toString();
        Log.i(TAG, "SMS received from " + normalizePhone(senderPhone));

        // Read config from SharedPreferences
        android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean monitoringEnabled = prefs.getBoolean("sms_monitoring_enabled", false);
        boolean autoResponderEnabled = prefs.getBoolean("auto_responder_enabled", false);
        String supabaseUrl = prefs.getString("supabase_url", "");
        String supabaseAnonKey = prefs.getString("supabase_anon_key", "");
        String supabaseAccessToken = prefs.getString("supabase_access_token", "");
        // Use the access token for Authorization (needed for RLS), fall back to anon key
        String authToken = (supabaseAccessToken != null && !supabaseAccessToken.isEmpty()) ? supabaseAccessToken : supabaseAnonKey;

        // If this app is the default SMS handler, the app UI already shows the
        // conversation — no need for a system notification with inline reply.
        // Only show the notification when another app is the default SMS handler.
        boolean isDefaultSms = isDefaultSmsApp(context);
        if (!isDefaultSms) {
            showIncomingSmsNotification(context, senderPhone, message);
        }

        // Always write the incoming message to the system SMS content provider
        // so it appears in the app's inbox view regardless of which app is default.
        writeInboxMessage(context, senderPhone, message);

        // Always push the incoming message to Supabase so it appears in the app's
        // conversation view, regardless of message type (image, voice, eSIM, etc).
        // Previously, early-return paths skipped pushCustomerReply, causing messages
        // to vanish from the app.
        boolean internetAvailable = hasInternetConnection(context);
        boolean canPush = internetAvailable && supabaseUrl != null && !supabaseUrl.isEmpty();
        if (canPush) {
            pushCustomerReply(senderPhone, message, supabaseUrl, supabaseAnonKey, authToken);
        } else {
            saveOfflineCustomerReply(prefs, senderPhone, message);
        }

        // Detect MMS (image) messages — ask customer to type the sim number as text
        if (autoResponderEnabled && isImageMessage(message)) {
            sendReplyAndLog(senderPhone, IMAGE_SIM_NUMBER_MSG, supabaseUrl, supabaseAnonKey, authToken);
            return;
        }

        // Detect voice messages — ask customer to type their request as text
        if (autoResponderEnabled && isVoiceMessage(message)) {
            sendReplyAndLog(senderPhone, VOICE_MESSAGE_MSG, supabaseUrl, supabaseAnonKey, authToken);
            return;
        }

        // Check if store is open
        boolean storeOpen = isStoreOpen(prefs);
        String simNumber = extractSimNumber(message);
        boolean isRecharge = isRechargeRequest(message);
        boolean isEsimReq = isEsimRequest(message);
        if (internetAvailable && supabaseUrl != null && !supabaseUrl.isEmpty()) {
            flushOfflinePendingOperations(prefs, supabaseUrl, supabaseAnonKey, authToken);
            flushOfflineCustomerReplies(prefs, supabaseUrl, supabaseAnonKey, authToken);
        }

        // eSIM request handling — ask for phone model, check compatibility, ask company/duration
        if (monitoringEnabled && isEsimReq && autoResponderEnabled) {
            handleEsimRequest(prefs, senderPhone, message, supabaseUrl, supabaseAnonKey, authToken, internetAvailable);
            return;
        }
        // Check for active eSIM conversation follow-up
        if (monitoringEnabled && autoResponderEnabled && hasEsimConversation(prefs, senderPhone)) {
            handleEsimFollowup(prefs, senderPhone, message, supabaseUrl, supabaseAnonKey, authToken, internetAvailable);
            return;
        }

        // Check for recharge-active follow-up: customer was told they have days remaining
        // and now replies with "جدد" or similar — accept the renewal
        if (monitoringEnabled && autoResponderEnabled && hasRechargeActiveConversation(prefs, senderPhone)) {
            String lower = message.toLowerCase().trim();
            if (lower.contains("جدد") || lower.contains("ماشي") || lower.contains("نعم") || lower.contains("اوكي") || lower.contains("تمام")) {
                String simNum = prefs.getString("recharge_active_" + senderPhone, "");
                if (simNum == null || simNum.isEmpty()) simNum = extractSimNumber(message);
                saveOfflinePendingOperation(prefs, senderPhone, simNum != null ? simNum : "", message);
                if (internetAvailable && supabaseUrl != null && !supabaseUrl.isEmpty()) {
                    if (autoResponderEnabled) sendReplyAndLog(senderPhone, RECHARGE_ACCEPTED_MSG, supabaseUrl, supabaseAnonKey, authToken);
                    pushPendingOperation(context, senderPhone, simNum != null ? simNum : "", message, "sms", supabaseUrl, supabaseAnonKey, authToken);
                } else {
                    String maintenanceMessage = "نعتذر، سيتأخر شحن الرقم نظراً لأعمال الصيانة. تم وضع طلبك ضمن قوائم الانتظار وسيتم تنفيذه عند عودة الخدمة.";
                    if (autoResponderEnabled) sendReplyAndLog(senderPhone, maintenanceMessage, supabaseUrl, supabaseAnonKey, authToken);
                }
                clearRechargeActiveConversation(prefs, senderPhone);
                return;
            }
        }

        // Duration logic for recharge requests with a sim number
        if (monitoringEnabled && simNumber != null && isRecharge) {
            // Step 1: Check subscription status against local sales data
            int daysRemaining = checkSubscriptionBySim(prefs, simNumber);
            if (daysRemaining < 0) {
                // Also try matching by sender phone
                daysRemaining = checkSubscriptionByPhone(prefs, senderPhone);
            }
            String customerName = findCustomerNameBySim(prefs, simNumber);

            // Step 2: If subscription is active with > 3 days remaining, send reminder
            if (daysRemaining > 3) {
                String reminderMsg = "عزيزي " + (customerName != null && !customerName.isEmpty() ? customerName : "زبوننا العزيز")
                    + "، لديك حالياً " + daysRemaining + " يوم متبقية في اشتراكك الحالي. إذا كنت ترغب في التجديد رغم ذلك، يرجى إرسال \"جدد\" أو \"ماشي جدد\" وسنقوم بتنفيذ طلبك.";
                if (autoResponderEnabled) sendReplyAndLog(senderPhone, reminderMsg, supabaseUrl, supabaseAnonKey, authToken);
                // Store recharge-active state so follow-up "جدد" can be detected
                prefs.edit()
                    .putString("recharge_active_" + senderPhone, simNumber)
                    .putLong("recharge_active_time_" + senderPhone, System.currentTimeMillis())
                    .apply();
                return;
            }

            // Step 3: Check duration requirement
            String duration = detectChargeDuration(message);
            String companyName = lookupCompanyNameBySim(prefs, simNumber);
            if (duration == null && (companyName == null || requiresDuration(companyName))) {
                if (autoResponderEnabled) sendReplyAndLog(senderPhone, SPECIFY_DURATION_MSG, supabaseUrl, supabaseAnonKey, authToken);
                saveOfflinePendingOperation(prefs, senderPhone, simNumber, message);
                return;
            }

            // Step 4: Queue the operation locally (always, regardless of internet)
            saveOfflinePendingOperation(prefs, senderPhone, simNumber, message);

            // Step 5: Send appropriate reply based on store hours and internet status
            if (!storeOpen) {
                // Store is closed — send off-hours message
                String offHoursMsg = prefs.getString("bh_closed_message", "عذراً، الشركة مغلقة حالياً ولا يمكن تنفيذ طلبك. سيتم تنفيذه مع بدء دوام الغد إن شاء الله.");
                if (autoResponderEnabled) sendReplyAndLog(senderPhone, offHoursMsg, supabaseUrl, supabaseAnonKey, authToken);
            } else if (internetAvailable && supabaseUrl != null && !supabaseUrl.isEmpty()) {
                // Store open + internet available — accept and push to Supabase
                if (autoResponderEnabled) sendReplyAndLog(senderPhone, RECHARGE_ACCEPTED_MSG, supabaseUrl, supabaseAnonKey, authToken);
                pushPendingOperation(context, senderPhone, simNumber, message, "sms", supabaseUrl, supabaseAnonKey, authToken);
            } else {
                // Store open but no internet — send maintenance message AFTER queuing
                String maintenanceMessage = "نعتذر، سيتأخر شحن الرقم نظراً لأعمال الصيانة. تم وضع طلبك ضمن قوائم الانتظار وسيتم تنفيذه عند عودة الخدمة.";
                if (autoResponderEnabled) sendReplyAndLog(senderPhone, maintenanceMessage, supabaseUrl, supabaseAnonKey, authToken);
            }
            return;
        }

        // Non-recharge SMS with a sim number: check subscription, then handle
        if (monitoringEnabled && simNumber != null && (!storeOpen || !internetAvailable)) {
            // Check subscription before sending maintenance message
            int daysRemaining = checkSubscriptionBySim(prefs, simNumber);
            if (daysRemaining < 0) {
                daysRemaining = checkSubscriptionByPhone(prefs, senderPhone);
            }

            if (daysRemaining > 0) {
                // Subscription active — send appropriate reply via handleAutoReply
                if (autoResponderEnabled && supabaseUrl != null && !supabaseUrl.isEmpty()) {
                    handleAutoReply(context, prefs, senderPhone, message, storeOpen, supabaseUrl, supabaseAnonKey, authToken);
                } else if (autoResponderEnabled) {
                    handleAutoReply(context, prefs, senderPhone, message, storeOpen, "", "", authToken);
                }
            } else {
                // No active subscription or unknown — queue and send maintenance only if no internet
                saveOfflinePendingOperation(prefs, senderPhone, simNumber, message);
                if (!internetAvailable) {
                    String maintenanceMessage = "نعتذر، سيتأخر شحن الرقم نظراً لأعمال الصيانة. تم وضع طلبك ضمن قوائم الانتظار وسيتم تنفيذه عند عودة الخدمة.";
                    if (autoResponderEnabled) sendReplyAndLog(senderPhone, maintenanceMessage, supabaseUrl, supabaseAnonKey, authToken);
                } else if (!storeOpen) {
                    String offHoursMsg = prefs.getString("bh_closed_message", "عذراً، الشركة مغلقة حالياً ولا يمكن تنفيذ طلبك. سيتم تنفيذه مع بدء دوام الغد إن شاء الله.");
                    if (autoResponderEnabled) sendReplyAndLog(senderPhone, offHoursMsg, supabaseUrl, supabaseAnonKey, authToken);
                }
            }
        } else if (autoResponderEnabled && supabaseUrl != null && !supabaseUrl.isEmpty()) {
            handleAutoReply(context, prefs, senderPhone, message, storeOpen, supabaseUrl, supabaseAnonKey, authToken);
        } else if (autoResponderEnabled) {
            // No Supabase configured — still handle auto-reply offline
            handleAutoReply(context, prefs, senderPhone, message, storeOpen, "", "", authToken);
        }

        // Recharge requests are also kept in the pending-operation queue.
        if (monitoringEnabled && simNumber != null && internetAvailable && supabaseUrl != null && !supabaseUrl.isEmpty()) {
            pushPendingOperation(context, senderPhone, simNumber, message, "sms", supabaseUrl, supabaseAnonKey, authToken);
        }
    }

    private static final String SMS_NOTIF_CHANNEL = "sms_incoming_channel";
    private static final int SMS_NOTIF_ID_BASE = 2000;

    private boolean isDefaultSmsApp(Context context) {
        try {
            String myPackage = context.getPackageName();
            String defaultPackage = android.provider.Telephony.Sms.getDefaultSmsPackage(context);
            return myPackage.equals(defaultPackage);
        } catch (Exception e) {
            return false;
        }
    }

    private void writeInboxMessage(Context context, String senderPhone, String message) {
        try {
            android.content.ContentValues values = new android.content.ContentValues();
            values.put("address", senderPhone);
            values.put("body", message);
            values.put("date", System.currentTimeMillis());
            values.put("type", 1); // 1 = inbox
            values.put("read", 0); // unread
            context.getContentResolver().insert(android.net.Uri.parse("content://sms/inbox"), values);
            Log.i(TAG, "Inbox message written to SMS provider");
        } catch (Exception e) {
            Log.e(TAG, "writeInboxMessage error: " + e.getMessage());
        }
    }

    private void showIncomingSmsNotification(Context context, String senderPhone, String message) {
        try {
            // Create notification channel (Android 8+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(
                    SMS_NOTIF_CHANNEL,
                    "الرسائل الواردة",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("إشعارات الرسائل النصية الواردة");
                NotificationManager nm = context.getSystemService(NotificationManager.class);
                if (nm != null) nm.createNotificationChannel(channel);
            }

            // Resolve sender name from contacts if available
            String displayName = resolveContactName(context, senderPhone);
            if (displayName == null || displayName.isEmpty()) {
                displayName = normalizePhone(senderPhone);
            }

            // Build inline reply action (RemoteInput)
            String replyLabel = "اكتب ردك...";
            android.app.RemoteInput remoteInput = new android.app.RemoteInput.Builder("reply_text")
                .setLabel(replyLabel)
                .build();

            Intent replyIntent = new Intent(context, SmsReplyReceiver.class);
            replyIntent.setAction("com.sahabpos.sms.REPLY_SMS");
            replyIntent.putExtra("sender_phone", senderPhone);
            replyIntent.putExtra("notif_id", SMS_NOTIF_ID_BASE + (senderPhone.hashCode() & 0xFFFF));
            android.app.PendingIntent replyPendingIntent = android.app.PendingIntent.getBroadcast(
                context,
                senderPhone.hashCode(),
                replyIntent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_MUTABLE
            );

            android.app.Notification.Action replyAction = new android.app.Notification.Action.Builder(
                android.R.drawable.ic_dialog_info,
                "رد", replyPendingIntent
            )
                .addRemoteInput(remoteInput)
                .setAllowGeneratedReplies(false)
                .build();

            // Mark-as-read action
            Intent markReadIntent = new Intent(context, SmsReplyReceiver.class);
            markReadIntent.setAction("com.sahabpos.sms.MARK_READ");
            markReadIntent.putExtra("notif_id", SMS_NOTIF_ID_BASE + (senderPhone.hashCode() & 0xFFFF));
            android.app.PendingIntent markReadPendingIntent = android.app.PendingIntent.getBroadcast(
                context,
                senderPhone.hashCode() + 1,
                markReadIntent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_MUTABLE
            );

            Notification.Builder builder;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                builder = new Notification.Builder(context, SMS_NOTIF_CHANNEL);
            } else {
                builder = new Notification.Builder(context);
            }

            int notifId = SMS_NOTIF_ID_BASE + (senderPhone.hashCode() & 0xFFFF);

            builder
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(displayName)
                .setContentText(message)
                .setStyle(new Notification.BigTextStyle().bigText(message))
                .setPriority(Notification.PRIORITY_HIGH)
                .setAutoCancel(true)
                .addAction(replyAction)
                .addAction(android.R.drawable.ic_menu_view, "قراءة", markReadPendingIntent);

            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(notifId, builder.build());
            }
        } catch (Exception e) {
            Log.e(TAG, "showIncomingSmsNotification error: " + e.getMessage());
        }
    }

    private String resolveContactName(Context context, String phoneNumber) {
        try {
            android.content.ContentResolver cr = context.getContentResolver();
            android.net.Uri uri = android.provider.ContactsContract.PhoneLookup.CONTENT_FILTER_URI;
            uri = android.net.Uri.withAppendedPath(uri, android.net.Uri.encode(phoneNumber));
            android.database.Cursor cursor = cr.query(
                uri,
                new String[]{android.provider.ContactsContract.PhoneLookup.DISPLAY_NAME},
                null, null, null
            );
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                cursor.close();
                return name;
            }
            if (cursor != null) cursor.close();
        } catch (SecurityException e) {
            // READ_CONTACTS not granted — fall through to phone number
        } catch (Exception e) {
            Log.e(TAG, "resolveContactName error: " + e.getMessage());
        }
        return null;
    }

    /**
     * Pushes an incoming SMS as a "customerReplies" sync row so the app can
     * match it to an active debt-escalation state and process the reply
     * (extract date, ask for date, or count toward freeze threshold).
     */
    private void pushCustomerReply(String senderPhone, String message,
                                    String supabaseUrl, String supabaseAnonKey,
                                    String authToken) {
        try {
            URL url = new URL(supabaseUrl + "/rest/v1/sms_inbox_events");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("apikey", supabaseAnonKey);
            conn.setRequestProperty("Authorization", "Bearer " + authToken);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "return=minimal");

            JSONObject payload = new JSONObject();
            String userId = appContext != null
                ? appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("supabase_user_id", "")
                : "";
            payload.put("event_type", "customerReply");
            payload.put("user_id", userId);
            payload.put("sender_phone", normalizePhone(senderPhone));
            payload.put("sender_name", "");
            payload.put("message", message);
            payload.put("channel", "sms");
            payload.put("source", "sms");

            conn.setDoOutput(true);
            OutputStream os = conn.getOutputStream();
            os.write(payload.toString().getBytes(StandardCharsets.UTF_8));
            os.close();

            Log.i(TAG, "Customer reply pushed to event queue");
            conn.disconnect();
        } catch (Exception e) {
            Log.e(TAG, "pushCustomerReply error: " + e.getMessage());
        }
    }

    private String normalizePhone(String phone) {
        if (phone == null) return "";
        // Remove +970 / +972 prefix and leading +
        String p = phone.replaceAll("[^0-9]", "");
        if (p.startsWith("970")) return "0" + p.substring(3);
        if (p.startsWith("972")) return "0" + p.substring(3);
        if (p.startsWith("9725")) return "0" + p.substring(4);
        return p;
    }

    private boolean isStoreOpen(android.content.SharedPreferences prefs) {
        boolean autoMode = prefs.getBoolean("bh_auto_mode", false);
        if (!autoMode) {
            return prefs.getBoolean("bh_force_open", false);
        }

        // Check current day/time
        java.util.Calendar cal = java.util.Calendar.getInstance();
        int dayOfWeek = cal.get(java.util.Calendar.DAY_OF_WEEK) - 1; // 0=Sunday
        String dayKey = "bh_day_" + dayOfWeek;
        boolean dayEnabled = prefs.getBoolean(dayKey + "_enabled", false);
        if (!dayEnabled) return false;

        String openTime = prefs.getString(dayKey + "_open", "09:00");
        String closeTime = prefs.getString(dayKey + "_close", "18:00");

        int currentMinutes = cal.get(java.util.Calendar.HOUR_OF_DAY) * 60 + cal.get(java.util.Calendar.MINUTE);
        int openMinutes = parseTime(openTime);
        int closeMinutes = parseTime(closeTime);

        if (closeMinutes <= openMinutes) {
            return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
        }
        return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
    }

    private int parseTime(String time) {
        try {
            String[] parts = time.split(":");
            return Integer.parseInt(parts[0]) * 60 + Integer.parseInt(parts[1]);
        } catch (Exception e) {
            return 0;
        }
    }

    private String extractSimNumber(String message) {
        Matcher matcher = PHONE_PATTERN.matcher(message);
        String lastMatch = null;
        while (matcher.find()) {
            String num = matcher.group();
            for (String prefix : SIM_PREFIXES) {
                if (num.startsWith(prefix)) {
                    lastMatch = num;
                    break;
                }
            }
        }
        return lastMatch;
    }

    private boolean isRechargeRequest(String message) {
        String lower = message.toLowerCase();
        String[] keywords = {"شحن", "تجديد", "باقة", "اشحن", "جدد", "recharge", "renew"};
        for (String kw : keywords) {
            if (lower.contains(kw)) return true;
        }
        return false;
    }

    private String detectChargeDuration(String message) {
        String lower = message.toLowerCase();
        if (containsAny(lower, "3 ايام", "3 أيام", "ثلاث ايام", "ثلاث أيام")) return "3_days";
        if (containsAny(lower, "اسبوع", "أسبوع", "7 ايام", "7 أيام")) return "week";
        if (containsAny(lower, "اسبوعين", "أسبوعين", "14 يوم", "14 ايام")) return "2_weeks";
        if (containsAny(lower, "3 اسابيع", "3 أسابيع", "21 يوم", "21 ايام")) return "3_weeks";
        if (containsAny(lower, "شهر", "30 يوم", "30 ايام")) return "month";
        if (containsAny(lower, "شهرين", "60 يوم", "60 ايام")) return "2_months";
        if (containsAny(lower, "3 شهور", "ثلاث شهور", "90 يوم", "90 ايام")) return "3_months";
        if (containsAny(lower, "عرض", "عروض")) return "offer";
        return null;
    }

    private boolean containsAny(String text, String... terms) {
        for (String t : terms) {
            if (text.contains(t.toLowerCase())) return true;
        }
        return false;
    }

    private boolean requiresDuration(String companyName) {
        for (String c : COMPANIES_REQUIRING_DURATION) {
            if (companyName.contains(c)) return true;
        }
        return false;
    }

    private String lookupCompanyNameBySim(android.content.SharedPreferences prefs, String simNumber) {
        String companiesJson = prefs.getString("telecom_companies_json", "[]");
        String salesJson = prefs.getString("telecom_sales_json", "[]");
        try {
            String normalizedSim = simNumber.replaceAll("[^0-9]", "");
            org.json.JSONArray sales = new org.json.JSONArray(salesJson);
            for (int i = 0; i < sales.length(); i++) {
                JSONObject sale = sales.getJSONObject(i);
                String saleSim = sale.optString("simNumber", "").replaceAll("[^0-9]", "");
                if (saleSim.equals(normalizedSim)) {
                    return sale.optString("companyName", "");
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "lookupCompanyNameBySim error: " + e.getMessage());
        }
        return null;
    }

    // ============ Offline Subscription Check ============

    private static final java.util.HashMap<String, Integer> CHARGE_DURATION_DAYS = new java.util.HashMap<String, Integer>() {{
        put("3_days", 3);
        put("week", 7);
        put("2_weeks", 14);
        put("3_weeks", 21);
        put("month", 30);
        put("2_months", 60);
        put("3_months", 90);
        put("offer", 30);
    }};

    private static final long DAY_MS = 86400000L;

    /**
     * Checks subscription status by matching the sim number (from the SMS text)
     * against telecom_sales_json stored locally in SharedPreferences.
     * Returns: daysRemaining > 0 means subscription is still active.
     */
    private int checkSubscriptionBySim(android.content.SharedPreferences prefs, String simNumber) {
        if (simNumber == null || simNumber.isEmpty()) return -1;
        String salesJson = prefs.getString("telecom_sales_json", "[]");
        try {
            String normalizedSim = simNumber.replaceAll("[^0-9]", "");
            org.json.JSONArray sales = new org.json.JSONArray(salesJson);
            // Find the most recent sale for this sim number
            long latestCreatedAt = 0;
            String latestDuration = "month";
            String latestCustomerName = "";
            boolean found = false;
            for (int i = 0; i < sales.length(); i++) {
                JSONObject sale = sales.getJSONObject(i);
                String saleSim = sale.optString("simNumber", "").replaceAll("[^0-9]", "");
                if (saleSim.equals(normalizedSim)) {
                    long createdAt = sale.optLong("createdAt", 0);
                    if (createdAt >= latestCreatedAt) {
                        latestCreatedAt = createdAt;
                        latestDuration = sale.optString("chargeDuration", "month");
                        latestCustomerName = sale.optString("customerName", "");
                        found = true;
                    }
                }
            }
            if (!found) return -1;
            int durationDays = CHARGE_DURATION_DAYS.containsKey(latestDuration)
                ? CHARGE_DURATION_DAYS.get(latestDuration) : 30;
            long elapsed = (System.currentTimeMillis() - latestCreatedAt) / DAY_MS;
            int daysRemaining = durationDays - (int) elapsed;
            return daysRemaining;
        } catch (Exception e) {
            Log.e(TAG, "checkSubscriptionBySim error: " + e.getMessage());
            return -1;
        }
    }

    /**
     * Finds customer name by sim number from telecom_sales_json.
     */
    private String findCustomerNameBySim(android.content.SharedPreferences prefs, String simNumber) {
        if (simNumber == null || simNumber.isEmpty()) return "";
        String salesJson = prefs.getString("telecom_sales_json", "[]");
        try {
            String normalizedSim = simNumber.replaceAll("[^0-9]", "");
            org.json.JSONArray sales = new org.json.JSONArray(salesJson);
            long latestCreatedAt = 0;
            String latestName = "";
            for (int i = 0; i < sales.length(); i++) {
                JSONObject sale = sales.getJSONObject(i);
                String saleSim = sale.optString("simNumber", "").replaceAll("[^0-9]", "");
                if (saleSim.equals(normalizedSim)) {
                    long createdAt = sale.optLong("createdAt", 0);
                    if (createdAt >= latestCreatedAt) {
                        latestCreatedAt = createdAt;
                        latestName = sale.optString("customerName", "");
                    }
                }
            }
            return latestName;
        } catch (Exception e) {
            return "";
        }
    }

    /**
     * Checks subscription by sender phone (matches customerPhone in sales).
     */
    private int checkSubscriptionByPhone(android.content.SharedPreferences prefs, String senderPhone) {
        if (senderPhone == null || senderPhone.isEmpty()) return -1;
        String salesJson = prefs.getString("telecom_sales_json", "[]");
        try {
            String normalizedPhone = normalizePhone(senderPhone);
            org.json.JSONArray sales = new org.json.JSONArray(salesJson);
            long latestCreatedAt = 0;
            String latestDuration = "month";
            boolean found = false;
            for (int i = 0; i < sales.length(); i++) {
                JSONObject sale = sales.getJSONObject(i);
                String salePhone = normalizePhone(sale.optString("customerPhone", ""));
                if (salePhone.equals(normalizedPhone) && !salePhone.isEmpty()) {
                    long createdAt = sale.optLong("createdAt", 0);
                    if (createdAt >= latestCreatedAt) {
                        latestCreatedAt = createdAt;
                        latestDuration = sale.optString("chargeDuration", "month");
                        found = true;
                    }
                }
            }
            if (!found) return -1;
            int durationDays = CHARGE_DURATION_DAYS.containsKey(latestDuration)
                ? CHARGE_DURATION_DAYS.get(latestDuration) : 30;
            long elapsed = (System.currentTimeMillis() - latestCreatedAt) / DAY_MS;
            int daysRemaining = durationDays - (int) elapsed;
            return daysRemaining;
        } catch (Exception e) {
            Log.e(TAG, "checkSubscriptionByPhone error: " + e.getMessage());
            return -1;
        }
    }

    private boolean hasInternetConnection(Context context) {
        ConnectivityManager manager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) return false;
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            android.net.Network network = manager.getActiveNetwork();
            android.net.NetworkCapabilities capabilities = network == null ? null : manager.getNetworkCapabilities(network);
            // Only check NET_CAPABILITY_INTERNET — VALIDATED is unreliable on Palestinian
            // mobile networks and causes false negatives even when internet is available.
            return capabilities != null
                && capabilities.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET);
        }
        NetworkInfo network = manager.getActiveNetworkInfo();
        return network != null && network.isConnected();
    }

    private void sendReply(String senderPhone, String replyText) {
        // Send via SMS only — customer contacted us via SMS so we reply via SMS
        try {
            android.telephony.SmsManager smsManager = android.telephony.SmsManager.getDefault();
            if (replyText.length() > 70) {
                smsManager.sendMultipartTextMessage(senderPhone, null, smsManager.divideMessage(replyText), null, null);
            } else {
                smsManager.sendTextMessage(senderPhone, null, replyText, null, null);
            }
            Log.i(TAG, "SMS reply sent to " + senderPhone);

            // If we are the default SMS app, also write to the sent store
            if (appContext != null) {
                String myPackage = appContext.getPackageName();
                String defaultPackage = android.provider.Telephony.Sms.getDefaultSmsPackage(appContext);
                if (myPackage.equals(defaultPackage)) {
                    android.content.ContentValues values = new android.content.ContentValues();
                    values.put("address", senderPhone);
                    values.put("body", replyText);
                    values.put("date", System.currentTimeMillis());
                    values.put("type", 2); // 2 = sent
                    values.put("read", 1);
                    appContext.getContentResolver().insert(android.net.Uri.parse("content://sms/sent"), values);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "SMS reply error: " + e.getMessage());
        }
    }

    /**
     * Sends an auto-reply via SMS and also pushes it to Supabase as a
     * manual_reply event so it appears in the app's conversation view.
     * This ensures outbound auto-replies are visible in the app and not lost.
     */
    private void sendReplyAndLog(String senderPhone, String replyText,
                                  String supabaseUrl, String supabaseAnonKey,
                                  String authToken) {
        sendReply(senderPhone, replyText);
        if (supabaseUrl != null && !supabaseUrl.isEmpty() && supabaseAnonKey != null && !supabaseAnonKey.isEmpty()) {
            pushOutboundReply(senderPhone, replyText, supabaseUrl, supabaseAnonKey, authToken);
        }
    }

    /**
     * Pushes an outbound auto-reply as a manual_reply event to sms_inbox_events
     * so the JS app can pick it up and display it in the conversation view.
     */
    private void pushOutboundReply(String senderPhone, String replyText,
                                    String supabaseUrl, String supabaseAnonKey,
                                    String authToken) {
        try {
            URL url = new URL(supabaseUrl + "/rest/v1/sms_inbox_events");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("apikey", supabaseAnonKey);
            conn.setRequestProperty("Authorization", "Bearer " + authToken);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "return=minimal");

            String userId = appContext != null
                ? appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("supabase_user_id", "")
                : "";
            JSONObject payload = new JSONObject();
            payload.put("event_type", "manual_reply");
            payload.put("user_id", userId);
            payload.put("sender_phone", normalizePhone(senderPhone));
            payload.put("sender_name", "");
            payload.put("message", replyText);
            payload.put("channel", "sms");
            payload.put("source", "native_auto_reply");

            conn.setDoOutput(true);
            OutputStream os = conn.getOutputStream();
            os.write(payload.toString().getBytes(StandardCharsets.UTF_8));
            os.close();

            Log.i(TAG, "Outbound auto-reply logged to event queue");
            conn.disconnect();
        } catch (Exception e) {
            Log.e(TAG, "pushOutboundReply error: " + e.getMessage());
        }
    }

    private void sendWhatsAppReply(String senderPhone, String replyText) {
        if (appContext == null) return;
        try {
            String cleanPhone = senderPhone.replaceAll("[^0-9]", "");
            String encoded = java.net.URLEncoder.encode(replyText, "UTF-8");
            String whatsappUrl = "https://wa.me/" + cleanPhone + "?text=" + encoded;
            Intent whatsappIntent = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(whatsappUrl));
            whatsappIntent.setPackage("com.whatsapp");
            whatsappIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            appContext.startActivity(whatsappIntent);
            Log.i(TAG, "WhatsApp reply sent to " + senderPhone);
        } catch (Exception e) {
            Log.e(TAG, "sendWhatsAppReply error: " + e.getMessage());
        }
    }

    private void sendReplyToSupplier(String senderPhone, String replyText) {
        // Suppliers and agents are always contacted via WhatsApp only
        sendWhatsAppReply(senderPhone, replyText);
    }

    private boolean isImageMessage(String message) {
        if (message == null) return false;
        String lower = message.toLowerCase().trim();
        // MMS notifications from carriers contain image indicators
        if (lower.contains("mms")) return true;
        if (lower.contains("image")) return true;
        if (lower.contains("صورة")) return true;
        if (lower.contains("صوره")) return true;
        if (lower.contains("صور")) return true;
        // Carrier MMS notification patterns
        if (lower.contains("you have a new mms")) return true;
        if (lower.contains("mms message")) return true;
        if (lower.contains("multimedia message")) return true;
        if (lower.contains("http://mms")) return true;
        if (lower.contains("https://mms")) return true;
        if (lower.matches(".*\\bimage/jpeg\\b.*")) return true;
        if (lower.matches(".*\\bimage/png\\b.*")) return true;
        if (lower.contains("/mms/")) return true;
        return false;
    }

    private boolean isVoiceMessage(String message) {
        if (message == null) return false;
        String lower = message.toLowerCase().trim();
        // Voice message indicators
        if (lower.contains("voice message")) return true;
        if (lower.contains("audio message")) return true;
        if (lower.contains("رسالة صوتية")) return true;
        if (lower.contains("رساله صوتيه")) return true;
        if (lower.contains("رسالة صوتيه")) return true;
        if (lower.contains("رساله صوتية")) return true;
        if (lower.contains("ملف صوتي")) return true;
        if (lower.contains("ملف صوتى")) return true;
        if (lower.contains("voice note")) return true;
        if (lower.contains("audio clip")) return true;
        if (lower.contains("/voice/")) return true;
        if (lower.contains("/audio/")) return true;
        return false;
    }

    private void saveOfflinePendingOperation(android.content.SharedPreferences prefs,
                                             String senderPhone, String simNumber, String message) {
        try {
            org.json.JSONArray queue = new org.json.JSONArray(prefs.getString("offline_pending_operations", "[]"));
            queue.put(new JSONObject()
                .put("senderPhone", senderPhone)
                .put("simNumber", simNumber)
                .put("originalMessage", message)
                .put("source", "sms")
                .put("timestamp", System.currentTimeMillis()));
            prefs.edit().putString("offline_pending_operations", queue.toString()).apply();
            Log.i(TAG, "Offline pending operation saved");
        } catch (Exception e) {
            Log.e(TAG, "saveOfflinePendingOperation error: " + e.getMessage());
        }
    }

    private void saveOfflineCustomerReply(android.content.SharedPreferences prefs,
                                           String senderPhone, String message) {
        try {
            org.json.JSONArray queue = new org.json.JSONArray(prefs.getString("offline_customer_replies", "[]"));
            queue.put(new JSONObject()
                .put("senderPhone", normalizePhone(senderPhone))
                .put("message", message)
                .put("timestamp", System.currentTimeMillis()));
            prefs.edit().putString("offline_customer_replies", queue.toString()).apply();
            Log.i(TAG, "Offline customer reply saved");
        } catch (Exception e) {
            Log.e(TAG, "saveOfflineCustomerReply error: " + e.getMessage());
        }
    }

    private void flushOfflineCustomerReplies(android.content.SharedPreferences prefs,
                                              String supabaseUrl, String supabaseAnonKey,
                                              String authToken) {
        try {
            org.json.JSONArray queue = new org.json.JSONArray(prefs.getString("offline_customer_replies", "[]"));
            if (queue.length() == 0) return;
            for (int i = 0; i < queue.length(); i++) {
                JSONObject item = queue.getJSONObject(i);
                pushCustomerReply(item.optString("senderPhone"), item.optString("message"),
                    supabaseUrl, supabaseAnonKey, authToken);
            }
            prefs.edit().remove("offline_customer_replies").apply();
            Log.i(TAG, "Offline customer replies synced: " + queue.length());
        } catch (Exception e) {
            Log.e(TAG, "flushOfflineCustomerReplies error: " + e.getMessage());
        }
    }

    private void flushOfflinePendingOperations(android.content.SharedPreferences prefs,
                                               String supabaseUrl, String supabaseAnonKey,
                                               String authToken) {
        try {
            org.json.JSONArray queue = new org.json.JSONArray(prefs.getString("offline_pending_operations", "[]"));
            if (queue.length() == 0) return;
            for (int i = 0; i < queue.length(); i++) {
                JSONObject item = queue.getJSONObject(i);
                pushPendingOperation(null, item.optString("senderPhone"), item.optString("simNumber"),
                    item.optString("originalMessage"), item.optString("source", "sms"), supabaseUrl, supabaseAnonKey, authToken);
            }
            prefs.edit().remove("offline_pending_operations").apply();
            Log.i(TAG, "Offline pending operations synced: " + queue.length());
        } catch (Exception e) {
            Log.e(TAG, "flushOfflinePendingOperations error: " + e.getMessage());
        }
    }

    private void handleAutoReply(Context context, android.content.SharedPreferences prefs,
                                  String senderPhone, String message, boolean storeOpen,
                                  String supabaseUrl, String supabaseAnonKey,
                                  String authToken) {
        // Check cooldown — only reply once per cooldown period per sender
        String cooldownKey = "reply_cooldown_" + senderPhone;
        long lastReply = prefs.getLong(cooldownKey, 0);
        int cooldownMinutes = prefs.getInt("reply_cooldown_minutes", 60);
        long cooldownMs = cooldownMinutes * 60L * 1000L;

        if (System.currentTimeMillis() - lastReply < cooldownMs) {
            Log.i(TAG, "Within cooldown, skipping reply");
            return;
        }

        // Check keyword replies first
        String keywordReply = matchKeyword(prefs, message);
        String replyText;

        if (keywordReply != null) {
            replyText = keywordReply;
        } else {
            // Check if this sender is a known customer (has a sim in telecom sales)
            boolean isKnownCustomer = isKnownCustomer(prefs, senderPhone);
            if (!isKnownCustomer) {
                // First-time / unknown customer — send greeting message
                String greeting = prefs.getString("bh_greeting_message", "");
                if (greeting != null && !greeting.isEmpty()) {
                    replyText = greeting;
                } else if (storeOpen) {
                    replyText = prefs.getString("bh_open_message", "تم استلام طلبك وسيتم تنفيذه في أقرب وقت ممكن.");
                } else {
                    replyText = prefs.getString("bh_closed_message", "نعتذر، نحن خارج وقت العمل حالياً.");
                }
            } else if (storeOpen) {
                replyText = prefs.getString("bh_open_message", "تم استلام طلبك وسيتم تنفيذه في أقرب وقت ممكن.");
            } else {
                replyText = prefs.getString("bh_closed_message", "نعتذر، نحن خارج وقت العمل حالياً.");
            }
        }

        if (replyText == null || replyText.isEmpty()) return;

        sendReplyAndLog(senderPhone, replyText, supabaseUrl, supabaseAnonKey, authToken);
        prefs.edit().putLong(cooldownKey, System.currentTimeMillis()).apply();
    }

    private boolean isKnownCustomer(android.content.SharedPreferences prefs, String senderPhone) {
        String salesJson = prefs.getString("telecom_sales_json", "[]");
        try {
            org.json.JSONArray arr = new org.json.JSONArray(salesJson);
            String normalized = senderPhone.replaceAll("[^0-9]", "");
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                String sim = obj.optString("simNumber", "").replaceAll("[^0-9]", "");
                if (sim.length() >= 4 && normalized.endsWith(sim)) return true;
            }
        } catch (Exception e) {
            Log.e(TAG, "isKnownCustomer error: " + e.getMessage());
        }
        return false;
    }

    private String matchKeyword(android.content.SharedPreferences prefs, String message) {
        String keywordsJson = prefs.getString("keyword_replies_json", "[]");
        try {
            org.json.JSONArray arr = new org.json.JSONArray(keywordsJson);
            String lower = message.toLowerCase();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                boolean active = obj.optBoolean("active", true);
                if (!active) continue;
                org.json.JSONArray keywords = obj.getJSONArray("keywords");
                for (int j = 0; j < keywords.length(); j++) {
                    String kw = keywords.getString(j).toLowerCase().trim();
                    if (lower.contains(kw)) {
                        return obj.getString("reply");
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Keyword match error: " + e.getMessage());
        }
        return null;
    }

    private void pushPendingOperation(Context context, String senderPhone, String simNumber,
                                       String message, String source,
                                       String supabaseUrl, String supabaseAnonKey,
                                       String authToken) {
        try {
            URL url = new URL(supabaseUrl + "/rest/v1/sms_inbox_events");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("apikey", supabaseAnonKey);
            conn.setRequestProperty("Authorization", "Bearer " + authToken);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "return=minimal");

            Context prefsContext = context != null ? context : appContext;
            String userId = prefsContext != null
                ? prefsContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("supabase_user_id", "")
                : "";
            JSONObject payload = new JSONObject();
            payload.put("event_type", "pendingOperation");
            payload.put("user_id", userId);
            payload.put("sender_phone", normalizePhone(senderPhone));
            payload.put("message", message);
            payload.put("sim_number", simNumber != null ? simNumber : "");
            payload.put("source", source);

            conn.setDoOutput(true);
            OutputStream os = conn.getOutputStream();
            os.write(payload.toString().getBytes(StandardCharsets.UTF_8));
            os.close();

            Log.i(TAG, "Pending operation pushed to event queue");
            conn.disconnect();
        } catch (Exception e) {
            Log.e(TAG, "pushPendingOperation error: " + e.getMessage());
        }
    }

    // ============ eSIM handling ============

    private static final String ESIM_KEYWORDS[] = {
        "شريحة الكترونية", "شريحه الكترونيه", "شريحة الكترونيه", "شريحه الكترونية",
        "شريحة رقمية", "شريحه رقميه", "esim", "e-sim", "e sim",
        "شريحة افتراضية", "شريحه افتراضيه", "الكترونية", "الكترونيه",
        "رقمية", "رقميه"
    };

    private static final String ESIM_ADVICE_KEYWORDS[] = {
        "نصيحة", "نصيحه", "نصحني", "نصحنى", "ماذا تنصح", "وش تنصح",
        "ايه الاحسن", "ايه الافضل", "ايش احسن", "ايش الافضل",
        "احسن شركة", "افضل شركة", "اي شركة تنصح", "وش تنصحني",
        "مش عارف", "مش عارفة", "ما عرف", "ما عرفت", "ساعدني", "ساعدنى",
        "محتار", "محتارة", "استشارة", "استشاره", "بدي استشارة",
        "ايش اختار", "recommend", "advice", "suggest"
    };

    private static final String ESIM_ASK_PHONE_MSG = "مرحباً بك! للتحقق من إمكانية استخدام الشريحة الإلكترونية (eSIM)، يرجى إخبارنا بنوع جوالك (الموديل).";
    private static final String ESIM_NOT_SUPPORTED_MSG = "للأسف، جوالك لا يدعم الشريحة الإلكترونية (eSIM). أنت بحاجة إلى شريحة بلاستيك عادية. هل ترغب في طلب شريحة بلاستيك؟";
    private static final String ESIM_ASK_COMPANY_MSG = "ممتاز! جوالك يدعم الشريحة الإلكترونية. يرجى تحديد الشركة التي تريد الشريحة منها: سيلكوم، الوها، ويكم، بيلفون، رامي ليفي، هوت موبايل، 019، أو غيرها.";
    private static final String ESIM_TRANSFER_STAFF_MSG = "تم تحويل المحادثة للموظف وسيتم الرد عليك خلال لحظات.";
    private static final String ESIM_ASK_DURATION_MSG = "يرجى تحديد مدة الشحن المطلوبة (شهر، شهرين، 3 شهور، أسبوع، إلخ).";
    private static final String ESIM_COMPANY_LIST_MSG = "الشركات المتوفرة: سيلكوم، الوها، ويكم، بيلفون، رامي ليفي، هوت موبايل، 019. يرجى اختيار الشركة المناسبة لك.";

    // eSIM compatible device patterns
    private static final String ESIM_DEVICE_PATTERNS[] = {
        "iphone", "ايفون", "أيفون", "ipad", "ايباد",
        "galaxy s2", "galaxy s3", "galaxy s4", "galaxy s5", "galaxy s6", "galaxy s7",
        "galaxy s8", "galaxy s9", "galaxy note 20", "galaxy z flip", "galaxy z fold",
        "جالاكسي", "جالكسي", "سامسونج", "samsung",
        "pixel", "بيكسل", "بكسل",
        "xiaomi 1", "شاومي 1", "redmi note 1", "ريدمي",
        "huawei p40", "هواوي p40", "mate 40",
        "motorola", "موتورولا", "razr", "edge 4", "edge 5", "moto g",
        "oneplus", "وان بلس", "oppo", "اوبو", "find x", "reno 1",
        "honor", "هونر", "magic",
        "xperia", "سوني",
        "nokia g60", "nokia x30", "نوكيا",
        "vivo x", "فيفو", "iqoo",
        "fairphone", "nothing phone", "realme 14", "zenfone", "aquos"
    };

    private boolean isEsimRequest(String message) {
        String lower = message.toLowerCase();
        for (String kw : ESIM_KEYWORDS) {
            if (lower.contains(kw)) return true;
        }
        return false;
    }

    private boolean isAdviceRequest(String message) {
        String lower = message.toLowerCase();
        for (String kw : ESIM_ADVICE_KEYWORDS) {
            if (lower.contains(kw)) return true;
        }
        return false;
    }

    private boolean isEsimDeviceSupported(String phoneModel) {
        if (phoneModel == null || phoneModel.isEmpty()) return false;
        String lower = phoneModel.toLowerCase();
        // Check if it's a known unsupported model
        String[] unsupported = {"a05", "a15", "a25", "redmi 9", "redmi 10", "redmi 12c", "oppo a17", "oppo a57", "huawei y9", "huawei y7", "nokia c21", "realme c25", "realme c33"};
        for (String u : unsupported) {
            if (lower.contains(u)) return false;
        }
        // Check if it matches a known supported pattern
        for (String pattern : ESIM_DEVICE_PATTERNS) {
            if (lower.contains(pattern)) return true;
        }
        return false;
    }

    private String extractPhoneModel(String message) {
        // Try to extract the phone model from the message
        // Remove common request words and keep the device name
        String cleaned = message.trim();
        String[] removeWords = {"بدي", "اريد", "ابغى", "شريحة", "شريحه", "الكترونية", "الكترونيه",
            "رقمية", "رقميه", "esim", "e-sim", "من فضلك", "لو سمحت", "يا", "السلام عليكم"};
        for (String w : removeWords) {
            cleaned = cleaned.replaceAll("(?i)" + java.util.regex.Pattern.quote(w), "").trim();
        }
        // If the message is short enough, treat it as a phone model
        if (cleaned.length() >= 3 && cleaned.length() <= 60) {
            return cleaned;
        }
        return null;
    }

    private boolean hasEsimConversation(android.content.SharedPreferences prefs, String senderPhone) {
        String step = prefs.getString("esim_step_" + senderPhone, "");
        long startedAt = prefs.getLong("esim_started_" + senderPhone, 0);
        if (step.isEmpty()) return false;
        // 30 minute timeout
        if (System.currentTimeMillis() - startedAt > 30 * 60 * 1000) {
            prefs.edit().remove("esim_step_" + senderPhone).apply();
            return false;
        }
        return true;
    }

    // ============ Recharge Active Conversation (native) ============

    private boolean hasRechargeActiveConversation(android.content.SharedPreferences prefs, String senderPhone) {
        String sim = prefs.getString("recharge_active_" + senderPhone, "");
        if (sim == null || sim.isEmpty()) return false;
        long startedAt = prefs.getLong("recharge_active_time_" + senderPhone, 0);
        // 30 minute timeout
        if (System.currentTimeMillis() - startedAt > 30 * 60 * 1000) {
            clearRechargeActiveConversation(prefs, senderPhone);
            return false;
        }
        return true;
    }

    private void clearRechargeActiveConversation(android.content.SharedPreferences prefs, String senderPhone) {
        prefs.edit()
            .remove("recharge_active_" + senderPhone)
            .remove("recharge_active_time_" + senderPhone)
            .apply();
    }

    private void handleEsimRequest(android.content.SharedPreferences prefs, String senderPhone,
                                    String message, String supabaseUrl, String supabaseAnonKey,
                                    String authToken, boolean internetAvailable) {
        // Try to extract phone model from the initial message
        String phoneModel = extractPhoneModel(message);
        if (phoneModel != null && isEsimDeviceSupported(phoneModel)) {
            // Device supported — ask for company
            prefs.edit()
                .putString("esim_step_" + senderPhone, "ask_company")
                .putString("esim_phone_model_" + senderPhone, phoneModel)
                .putLong("esim_started_" + senderPhone, System.currentTimeMillis())
                .apply();
            sendReplyAndLog(senderPhone, ESIM_ASK_COMPANY_MSG, supabaseUrl, supabaseAnonKey, authToken);
            return;
        }
        // If model extracted but not supported
        if (phoneModel != null && !isEsimDeviceSupported(phoneModel)) {
            // Check more carefully — if it contains a known brand but not a supported model
            String lower = phoneModel.toLowerCase();
            boolean hasKnownBrand = false;
            for (String pattern : ESIM_DEVICE_PATTERNS) {
                if (lower.contains(pattern)) { hasKnownBrand = true; break; }
            }
            if (hasKnownBrand) {
                sendReplyAndLog(senderPhone, ESIM_NOT_SUPPORTED_MSG, supabaseUrl, supabaseAnonKey, authToken);
                return;
            }
        }
        // No model detected — ask for it
        prefs.edit()
            .putString("esim_step_" + senderPhone, "ask_phone_model")
            .putLong("esim_started_" + senderPhone, System.currentTimeMillis())
            .apply();
        sendReplyAndLog(senderPhone, ESIM_ASK_PHONE_MSG, supabaseUrl, supabaseAnonKey, authToken);
    }

    private void handleEsimFollowup(android.content.SharedPreferences prefs, String senderPhone,
                                     String message, String supabaseUrl, String supabaseAnonKey,
                                     String authToken, boolean internetAvailable) {
        String step = prefs.getString("esim_step_" + senderPhone, "");

        if ("ask_phone_model".equals(step)) {
            String phoneModel = extractPhoneModel(message);
            if (phoneModel == null) {
                sendReplyAndLog(senderPhone, ESIM_ASK_PHONE_MSG, supabaseUrl, supabaseAnonKey, authToken);
                return;
            }
            if (isEsimDeviceSupported(phoneModel)) {
                prefs.edit()
                    .putString("esim_step_" + senderPhone, "ask_company")
                    .putString("esim_phone_model_" + senderPhone, phoneModel)
                    .apply();
                sendReplyAndLog(senderPhone, ESIM_ASK_COMPANY_MSG, supabaseUrl, supabaseAnonKey, authToken);
            } else {
                prefs.edit().remove("esim_step_" + senderPhone).apply();
                sendReplyAndLog(senderPhone, ESIM_NOT_SUPPORTED_MSG, supabaseUrl, supabaseAnonKey, authToken);
            }
            return;
        }

        if ("ask_company".equals(step)) {
            if (isAdviceRequest(message)) {
                prefs.edit().putString("esim_step_" + senderPhone, "transfer_to_staff").apply();
                sendReplyAndLog(senderPhone, ESIM_TRANSFER_STAFF_MSG, supabaseUrl, supabaseAnonKey, authToken);
                saveOfflinePendingOperation(prefs, senderPhone, "", message);
                return;
            }
            String companyName = matchCompanyNameFromMessage(message, prefs);
            if (companyName != null) {
                // Build bundle list for this company
                String bundleListMsg = buildBundleListForCompany(prefs, companyName);
                prefs.edit()
                    .putString("esim_step_" + senderPhone, "ask_bundle")
                    .putString("esim_company_" + senderPhone, companyName)
                    .apply();
                if (bundleListMsg != null) {
                    sendReplyAndLog(senderPhone, bundleListMsg, supabaseUrl, supabaseAnonKey, authToken);
                } else {
                    // No bundles — fall back to asking duration
                    sendReplyAndLog(senderPhone, ESIM_ASK_DURATION_MSG, supabaseUrl, supabaseAnonKey, authToken);
                }
            } else {
                sendReplyAndLog(senderPhone, ESIM_COMPANY_LIST_MSG, supabaseUrl, supabaseAnonKey, authToken);
            }
            return;
        }

        if ("ask_bundle".equals(step)) {
            String companyName = prefs.getString("esim_company_" + senderPhone, "");
            // Try to parse a number selection
            String trimmed = message.trim();
            try {
                int num = Integer.parseInt(trimmed);
                String bundleListMsg = buildBundleListForCompany(prefs, companyName);
                if (bundleListMsg != null) {
                    // Count bundles and check if number is valid
                    org.json.JSONArray bundles = getBundlesForCompany(prefs, companyName);
                    if (bundles != null && num >= 1 && num <= bundles.length()) {
                        JSONObject selected = bundles.getJSONObject(num - 1);
                        String bundleName = selected.optString("name", "");
                        int durationDays = selected.optInt("durationDays", 30);
                        String durationLabel = durationDaysToLabel(durationDays);
                        prefs.edit().remove("esim_step_" + senderPhone).apply();
                        sendReplyAndLog(senderPhone, RECHARGE_ACCEPTED_MSG, supabaseUrl, supabaseAnonKey, authToken);
                        if (supabaseUrl != null && !supabaseUrl.isEmpty() && internetAvailable) {
                            pushPendingOperation(null, senderPhone, "", message + " [eSIM:" + companyName + ":" + bundleName + ":" + durationLabel + "]", "sms", supabaseUrl, supabaseAnonKey, authToken);
                        } else {
                            saveOfflinePendingOperation(prefs, senderPhone, "", message + " [eSIM:" + companyName + ":" + bundleName + ":" + durationLabel + "]");
                        }
                        return;
                    }
                    // Invalid number — re-send list
                    sendReplyAndLog(senderPhone, bundleListMsg, supabaseUrl, supabaseAnonKey, authToken);
                    return;
                }
            } catch (NumberFormatException | org.json.JSONException e) {
                // Not a number or invalid bundle index — try bundle name match
            }
            // Try matching by bundle name
            String bundleListMsg = buildBundleListForCompany(prefs, companyName);
            org.json.JSONArray bundles = getBundlesForCompany(prefs, companyName);
            if (bundles != null) {
                String lower = message.toLowerCase();
                for (int i = 0; i < bundles.length(); i++) {
                    try {
                        JSONObject b = bundles.getJSONObject(i);
                        String bName = b.optString("name", "");
                        if (!bName.isEmpty() && lower.contains(bName.toLowerCase())) {
                            int durationDays = b.optInt("durationDays", 30);
                            String durationLabel = durationDaysToLabel(durationDays);
                            prefs.edit().remove("esim_step_" + senderPhone).apply();
                            sendReplyAndLog(senderPhone, RECHARGE_ACCEPTED_MSG, supabaseUrl, supabaseAnonKey, authToken);
                            if (supabaseUrl != null && !supabaseUrl.isEmpty() && internetAvailable) {
                                pushPendingOperation(null, senderPhone, "", message + " [eSIM:" + companyName + ":" + bName + ":" + durationLabel + "]", "sms", supabaseUrl, supabaseAnonKey, authToken);
                            } else {
                                saveOfflinePendingOperation(prefs, senderPhone, "", message + " [eSIM:" + companyName + ":" + bName + ":" + durationLabel + "]");
                            }
                            return;
                        }
                    } catch (Exception e) { /* skip */ }
                }
            }
            // No bundles — fall back to duration detection
            String duration = detectChargeDuration(message);
            if (duration != null) {
                prefs.edit().remove("esim_step_" + senderPhone).apply();
                sendReplyAndLog(senderPhone, RECHARGE_ACCEPTED_MSG, supabaseUrl, supabaseAnonKey, authToken);
                if (supabaseUrl != null && !supabaseUrl.isEmpty() && internetAvailable) {
                    pushPendingOperation(null, senderPhone, "", message + " [eSIM:" + companyName + ":" + duration + "]", "sms", supabaseUrl, supabaseAnonKey, authToken);
                } else {
                    saveOfflinePendingOperation(prefs, senderPhone, "", message + " [eSIM:" + companyName + ":" + duration + "]");
                }
            } else if (bundleListMsg != null) {
                sendReplyAndLog(senderPhone, bundleListMsg, supabaseUrl, supabaseAnonKey, authToken);
            } else {
                sendReplyAndLog(senderPhone, ESIM_ASK_DURATION_MSG, supabaseUrl, supabaseAnonKey, authToken);
            }
            return;
        }

        if ("transfer_to_staff".equals(step)) {
            prefs.edit().remove("esim_step_" + senderPhone).apply();
            // Let the message go through normal flow
        }
    }

    private String matchCompanyNameFromMessage(String message, android.content.SharedPreferences prefs) {
        String lower = message.toLowerCase();
        String[] companies = {"سيلكوم", "الوها", "ويكم", "بيلفون", "رامي ليفي", "هوت موبايل", "019"};
        String[] aliases = {"سيلكوم", "الوها", "ويكم", "بيلفون", "رامي ليفي", "هوت موبايل", "019"};
        for (int i = 0; i < aliases.length; i++) {
            if (lower.contains(aliases[i])) return companies[i];
        }
        // Also check from stored companies
        String companiesJson = prefs.getString("telecom_companies_json", "[]");
        try {
            org.json.JSONArray arr = new org.json.JSONArray(companiesJson);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                String name = obj.optString("name", "");
                if (!name.isEmpty() && lower.contains(name.toLowerCase())) return name;
            }
        } catch (Exception e) {
            Log.e(TAG, "matchCompanyName error: " + e.getMessage());
        }
        return null;
    }

    private String durationDaysToLabel(int days) {
        if (days <= 3) return "3 أيام";
        if (days <= 7) return "أسبوع";
        if (days <= 14) return "أسبوعين";
        if (days <= 21) return "3 أسابيع";
        if (days <= 30) return "شهر";
        if (days <= 60) return "شهرين";
        if (days <= 90) return "3 شهور";
        if (days <= 180) return "6 شهور";
        if (days <= 365) return "سنة";
        return days + " يوم";
    }

    private org.json.JSONArray getBundlesForCompany(android.content.SharedPreferences prefs, String companyName) {
        if (companyName == null || companyName.isEmpty()) return null;
        String bundlesJson = prefs.getString("bundles_json", "[]");
        try {
            org.json.JSONArray all = new org.json.JSONArray(bundlesJson);
            org.json.JSONArray filtered = new org.json.JSONArray();
            for (int i = 0; i < all.length(); i++) {
                JSONObject b = all.getJSONObject(i);
                if (!b.optBoolean("active", true)) continue;
                String bCompany = b.optString("companyName", "");
                if (bCompany.equals(companyName)) {
                    filtered.put(b);
                }
            }
            // Sort by price ascending
            org.json.JSONArray sorted = new org.json.JSONArray();
            java.util.List<JSONObject> list = new java.util.ArrayList<>();
            for (int i = 0; i < filtered.length(); i++) list.add(filtered.getJSONObject(i));
            java.util.Collections.sort(list, (a, b) -> {
                try { return Double.compare(a.optDouble("price", 0), b.optDouble("price", 0)); }
                catch (Exception e) { return 0; }
            });
            for (JSONObject obj : list) sorted.put(obj);
            return sorted.length() > 0 ? sorted : null;
        } catch (Exception e) {
            Log.e(TAG, "getBundlesForCompany error: " + e.getMessage());
            return null;
        }
    }

    private String buildBundleListForCompany(android.content.SharedPreferences prefs, String companyName) {
        org.json.JSONArray bundles = getBundlesForCompany(prefs, companyName);
        if (bundles == null) return null;
        StringBuilder sb = new StringBuilder();
        sb.append("باقات ").append(companyName).append(" المتوفرة:\n");
        for (int i = 0; i < bundles.length(); i++) {
            try {
                JSONObject b = bundles.getJSONObject(i);
                String name = b.optString("name", "");
                int durationDays = b.optInt("durationDays", 30);
                double price = b.optDouble("price", 0);
                String durationLabel = durationDaysToLabel(durationDays);
                String prefix = durationDays > 30 ? "عرض خاص: " : "";
                sb.append(i + 1).append(". ").append(prefix).append(name)
                  .append(" - ").append(durationLabel).append(" - ")
                  .append((int)price).append(" شيكل");
                if (i < bundles.length() - 1) sb.append("\n");
            } catch (Exception e) { /* skip */ }
        }
        sb.append("\nيرجى الرد برقم الباقة التي تريدها");
        return sb.toString();
    }
}
