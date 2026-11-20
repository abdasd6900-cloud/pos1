package com.sahabpos.sms;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.RemoteInput;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Parcelable;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * WhatsAppNotificationListener — captures incoming WhatsApp text messages via
 * Android's NotificationListenerService. When a WhatsApp notification arrives,
 * it extracts the sender's phone number (from the conversation title) and the
 * message text, then pushes both to Supabase as:
 *
 *  1. A "pendingOperations" row — if the message contains a SIM card number
 *     (so the app can process it like an SMS-based recharge request).
 *  2. A "customerReplies" row — so the debt-escalation system can match it
 *     to an active reminder conversation.
 *
 * Limitations:
 *  - Only captures TEXT messages. Voice messages and images show as
 *    "رسالة صوتية" / "صورة" in the notification — these are detected and
 *    pushed as customerReplies so the staff can follow up manually.
 *  - Replies use only the RemoteInput action exposed by the active notification;
 *    notifications without an inline-reply action are not sent automatically.
 *  - The user must grant "Notification access" permission in Android Settings
 *    → Notification access → سحاب POS.
 */
public class WhatsAppNotificationListener extends NotificationListenerService {

    private static final String TAG = "WhatsAppListener";
    private static final String PREFS = "sahab_prefs";
    private static final String CHANNEL_ID = "whatsapp_capture_channel";
    private static final int NOTIFICATION_ID = 1003;

    // Palestinian mobile prefixes
    private static final String[] SIM_PREFIXES = {"050", "052", "053", "054", "055", "056", "058", "059"};
    private static final Pattern PHONE_PATTERN = Pattern.compile("0\\d{9,10}");

    // WhatsApp package names
    private static final String WHATSAPP_PKG = "com.whatsapp";
    private static final String WHATSAPP_BUSINESS_PKG = "com.whatsapp.w4b";

    // Palestinian bank / wallet app package names
    // Bank of Palestine (BOP) — Con Cordis mobile app
    private static final String BOP_PKG = "finance.bop.concordis";
    // Bank of Palestine (older package)
    private static final String BOP_PKG_ALT = "com.bop.boptelebank";
    // PalPay (PalPay Mobile Wallet)
    private static final String PALPAY_PKG = "com.paltel.palpay";
    private static final String PALPAY_PKG_ALT = "com.palpay";
    // Bank of Jerusalem
    private static final String BOJ_PKG = "com.boj.mobilebanking";
    // Arab Bank Palestine
    private static final String ARAB_BANK_PKG = "com.arabbank.mobile";
    // Housing Bank
    private static final String HOUSING_PKG = "com.housingbank.mobile";

    private static final String[] BANK_PKGS = {
        BOP_PKG, BOP_PKG_ALT, PALPAY_PKG, PALPAY_PKG_ALT,
        BOJ_PKG, ARAB_BANK_PKG, HOUSING_PKG
    };

    // Voice / image indicators in notification text
    private static final String[] VOICE_INDICATORS = {
        "رسالة صوتية", "رساله صوتيه", "رسالة صوتيه", "رساله صوتية",
        "voice message", "voice note", "audio message", "Audio"
    };
    private static final String[] IMAGE_INDICATORS = {
        "صورة", "صوره", "photo", "image", "Image", "Photo"
    };
    private static final long REPLY_WINDOW_MS = 10 * 60 * 1000L;
    private static volatile WhatsAppNotificationListener activeInstance;
    private final Map<String, StatusBarNotification> latestNotifications = new ConcurrentHashMap<>();

    @Override
    public void onCreate() {
        super.onCreate();
        activeInstance = this;
    }

    @Override
    public void onDestroy() {
        if (activeInstance == this) activeInstance = null;
        latestNotifications.clear();
        super.onDestroy();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;

        String pkg = sbn.getPackageName();
        boolean isWhatsApp = WHATSAPP_PKG.equals(pkg) || WHATSAPP_BUSINESS_PKG.equals(pkg);
        boolean isBankApp = false;
        for (String bankPkg : BANK_PKGS) {
            if (bankPkg.equals(pkg)) { isBankApp = true; break; }
        }

        android.content.SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        // WhatsApp requires whatsapp_monitoring_enabled; bank notifications require transfer_detection_enabled
        boolean monitoringEnabled;
        if (isWhatsApp) {
            monitoringEnabled = prefs.getBoolean("whatsapp_monitoring_enabled", false);
        } else {
            monitoringEnabled = prefs.getBoolean("transfer_detection_enabled", false);
        }
        if (!monitoringEnabled) return;

        Notification notification = sbn.getNotification();
        if (notification == null) return;

        // Group summaries only contain counts such as "9 رسائل من 5 دردشات".
        // They are not customer messages and must not enter the event queue.
        if ((notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;

        Bundle extras = notification.extras;
        if (extras == null) return;

        NotificationContent content = extractNotificationContent(notification, extras);
        String title = content.title;
        String text = content.text;
        boolean isBankNotification = isBankApp || isLikelyBankNotification(title, text);

        if (!isWhatsApp && !isBankNotification) return;
        if (title.isEmpty() && text.isEmpty()) return;
        if (isWhatsAppSummary(text)) return;

        Log.i(TAG, "WhatsApp notification received: " + title);

        // WhatsApp may expose a contact name in the title and the real phone
        // number in android.people or the MessagingStyle sender metadata.
        String senderPhone = extractPhoneFromTitle(title);
        if (senderPhone.equals(title)) {
            String peoplePhone = extractPhoneFromPeople(extras);
            if (!peoplePhone.isEmpty()) senderPhone = peoplePhone;
        }
        String senderName = content.senderName.isEmpty() ? title : content.senderName;
        rememberNotification(title, senderPhone, sbn);

        // Check for voice / image messages
        boolean isVoice = isVoiceMessage(text);
        boolean isImage = isImageMessage(text);

        String supabaseUrl = prefs.getString("supabase_url", "");
        String supabaseAnonKey = prefs.getString("supabase_anon_key", "");
        String supabaseAccessToken = prefs.getString("supabase_access_token", "");
        String supabaseUserId = prefs.getString("supabase_user_id", "");

        if (supabaseUrl == null || supabaseUrl.isEmpty()) {
            Log.w(TAG, "Supabase URL not configured, skipping");
            return;
        }

        // For bank/wallet app notifications: push as customerReply with channel "bank_notification"
        // so the app context runs parseTransferSms on the message text.
        if (isBankNotification) {
            // Preserve the title and body because either one may contain the bank name or transfer details.
            String bankSenderName = title.isEmpty() ? pkg : title;
            String bankText = title.isEmpty() ? text : title + ": " + text;
            boolean delivered = pushCustomerReply("", bankSenderName, bankText, "bank_notification", supabaseUrl, supabaseAnonKey, supabaseAccessToken, supabaseUserId);
            if (!delivered) saveOfflineCustomerReply(prefs, bankSenderName, bankText);
            Log.i(TAG, "Bank/wallet notification captured from " + pkg + ": " + text.substring(0, Math.min(text.length(), 80)));
            return;
        }

        // Always push as customer reply (for debt escalation matching)
        pushCustomerReply(senderPhone, senderName, text, "whatsapp", supabaseUrl, supabaseAnonKey, supabaseAccessToken, supabaseUserId);

        // For voice / image: push a customer reply but no pending operation
        // (we cannot extract a SIM number from a voice clip or photo notification)
        if (isVoice || isImage) {
            Log.i(TAG, "Voice/image message — pushed as customer reply only");
            return;
        }

        // Try to extract a SIM number from the message text
        String simNumber = extractSimNumber(text);
        if (simNumber != null) {
            pushPendingOperation(senderPhone, simNumber, text, "whatsapp", supabaseUrl, supabaseAnonKey);
            Log.i(TAG, "Pending operation pushed for sim " + simNumber);
        }
    }

    public static boolean replyToNotification(String recipient, String message) {
        WhatsAppNotificationListener service = activeInstance;
        if (service == null || message == null || message.trim().isEmpty()) return false;
        return service.sendInlineReply(recipient, message);
    }

    private void rememberNotification(String title, String senderPhone, StatusBarNotification sbn) {
        latestNotifications.put(title, sbn);
        if (senderPhone != null && !senderPhone.isEmpty()) {
            latestNotifications.put(senderPhone, sbn);
        }
        if (latestNotifications.size() > 50) {
            long now = System.currentTimeMillis();
            latestNotifications.entrySet().removeIf(e -> {
                StatusBarNotification n = e.getValue();
                return n != null && n.getPostTime() + REPLY_WINDOW_MS < now;
            });
        }
    }

    private boolean sendInlineReply(String recipient, String message) {
        StatusBarNotification sbn = latestNotifications.get(recipient);
        if (sbn == null) {
            for (StatusBarNotification candidate : latestNotifications.values()) {
                if (candidate.getPostTime() + REPLY_WINDOW_MS < System.currentTimeMillis()) continue;
                String title = candidate.getNotification().extras != null
                    ? candidate.getNotification().extras.getString(Notification.EXTRA_TITLE, "")
                    : "";
                if (recipient.equals(title) || recipient.equals(extractPhoneFromTitle(title))) {
                    sbn = candidate;
                    break;
                }
            }
        }
        if (sbn == null || sbn.getPostTime() + REPLY_WINDOW_MS < System.currentTimeMillis()) return false;

        Notification notification = sbn.getNotification();
        Notification.Action[] actions = notification.actions;
        if (actions == null) return false;

        for (Notification.Action action : actions) {
            RemoteInput[] inputs = action.getRemoteInputs();
            PendingIntent pendingIntent = action.actionIntent;
            if (inputs == null || inputs.length == 0 || pendingIntent == null) continue;
            try {
                Intent fillInIntent = new Intent();
                Bundle results = new Bundle();
                for (RemoteInput input : inputs) {
                    results.putCharSequence(input.getResultKey(), message);
                }
                RemoteInput.addResultsToIntent(inputs, fillInIntent, results);
                pendingIntent.send(this, 0, fillInIntent);
                Log.i(TAG, "WhatsApp inline reply sent");
                return true;
            } catch (PendingIntent.CanceledException e) {
                Log.w(TAG, "WhatsApp reply action is no longer valid");
            } catch (Exception e) {
                Log.e(TAG, "WhatsApp inline reply error: " + e.getMessage());
            }
        }
        return false;
    }

    private static final class NotificationContent {
        final String title;
        final String text;
        final String senderName;

        NotificationContent(String title, String text, String senderName) {
            this.title = title;
            this.text = text;
            this.senderName = senderName;
        }
    }

    private NotificationContent extractNotificationContent(Notification notification, Bundle extras) {
        String title = extras.getString(Notification.EXTRA_TITLE, "");
        CharSequence textSeq = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        if (textSeq == null) textSeq = extras.getCharSequence(Notification.EXTRA_TEXT);
        String text = textSeq != null ? textSeq.toString() : "";
        String senderName = "";

        Parcelable[] messages = extras.getParcelableArray(Notification.EXTRA_MESSAGES);
        if (messages != null && messages.length > 0) {
            Bundle latest = null;
            for (Parcelable item : messages) {
                if (item instanceof Bundle) latest = (Bundle) item;
            }
            if (latest != null) {
                CharSequence messageText = latest.getCharSequence("text");
                if (messageText != null) text = messageText.toString();
                CharSequence messageSender = latest.getCharSequence("sender");
                if (messageSender != null) senderName = messageSender.toString();
            }
        }

        return new NotificationContent(title == null ? "" : title.trim(), text.trim(), senderName.trim());
    }

    private boolean isWhatsAppSummary(String text) {
        if (text == null || text.trim().isEmpty()) return true;
        String lower = text.toLowerCase(Locale.ROOT).trim();
        return lower.matches("\\d+\\s+.*(رسائل|دردشات|chats|messages).*")
            || lower.matches(".*\\d+.*(رسائل من|chats from|messages from).*\\d+.*");
    }

    private String extractPhoneFromPeople(Bundle extras) {
        String[] people = extras.getStringArray(Notification.EXTRA_PEOPLE);
        if (people != null) {
            for (String person : people) {
                String phone = extractPhoneFromTitle(person);
                if (!phone.equals(person) && phone.length() >= 9) return phone;
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            Parcelable[] peopleList = extras.getParcelableArray("android.people.list");
            if (peopleList != null) {
                for (Parcelable item : peopleList) {
                    if (item instanceof android.app.Person) {
                        String uri = ((android.app.Person) item).getUri();
                        String phone = extractPhoneFromTitle(uri);
                        if (!phone.equals(uri) && phone.length() >= 9) return phone;
                    }
                }
            }
        }
        return "";
    }

    private String extractPhoneFromTitle(String title) {
        if (title == null || title.isEmpty()) return "";
        // WhatsApp notification titles can be:
        //  - A phone number like "+970 50 123 4567" or "0501234567"
        //  - A contact name (no phone)
        //  - A group name like "Family Group"
        // Try to extract a phone number
        Matcher matcher = PHONE_PATTERN.matcher(title);
        if (matcher.find()) {
            return normalizePhone(matcher.group());
        }
        // Try international format +970...
        String digits = title.replaceAll("[^0-9]", "");
        if (digits.length() >= 10) {
            return normalizePhone(digits);
        }
        // No phone found — return the title as-is (it's a name)
        return title;
    }

    private String normalizePhone(String phone) {
        if (phone == null) return "";
        String p = phone.replaceAll("[^0-9]", "");
        if (p.startsWith("970")) return "0" + p.substring(3);
        if (p.startsWith("972")) return "0" + p.substring(3);
        if (p.startsWith("9725")) return "0" + p.substring(4);
        if (p.length() > 10 && p.startsWith("0")) return p.substring(0, 10);
        return p;
    }

    private String extractSimNumber(String message) {
        if (message == null) return null;
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

    private boolean isVoiceMessage(String text) {
        if (text == null) return false;
        String lower = text.toLowerCase().trim();
        for (String indicator : VOICE_INDICATORS) {
            if (lower.contains(indicator.toLowerCase())) return true;
        }
        return false;
    }

    private boolean isImageMessage(String text) {
        if (text == null) return false;
        String lower = text.toLowerCase().trim();
        for (String indicator : IMAGE_INDICATORS) {
            if (lower.contains(indicator.toLowerCase())) return true;
        }
        return false;
    }

    private boolean pushCustomerReply(String senderPhone, String senderName, String message,
                                      String channel, String supabaseUrl, String supabaseAnonKey,
                                      String supabaseAccessToken, String supabaseUserId) {
        try {
            URL url = new URL(supabaseUrl + "/rest/v1/sms_inbox_events");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("apikey", supabaseAnonKey);
            conn.setRequestProperty("Authorization", "Bearer " + (supabaseAccessToken.isEmpty() ? supabaseAnonKey : supabaseAccessToken));
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "return=minimal");

            JSONObject payload = new JSONObject();
            payload.put("event_type", "customerReply");
            payload.put("sender_phone", senderPhone);
            payload.put("sender_name", senderName);
            payload.put("message", message);
            payload.put("channel", channel);
            payload.put("source", channel);
            if (!supabaseUserId.isEmpty()) payload.put("user_id", supabaseUserId);

            conn.setDoOutput(true);
            OutputStream os = conn.getOutputStream();
            os.write(payload.toString().getBytes(StandardCharsets.UTF_8));
            os.close();

            int responseCode = conn.getResponseCode();
            conn.disconnect();
            if (responseCode >= 200 && responseCode < 300) {
                Log.i(TAG, "Customer reply pushed to event queue");
                return true;
            }
            Log.e(TAG, "Customer reply rejected with HTTP " + responseCode);
        } catch (Exception e) {
            Log.e(TAG, "pushCustomerReply error: " + e.getMessage());
        }
        return false;
    }

    private void saveOfflineCustomerReply(android.content.SharedPreferences prefs,
                                          String senderName, String message) {
        try {
            org.json.JSONArray queue = new org.json.JSONArray(prefs.getString("offline_customer_replies", "[]"));
            queue.put(new JSONObject()
                .put("senderPhone", "")
                .put("senderName", senderName)
                .put("message", message)
                .put("timestamp", System.currentTimeMillis()));
            prefs.edit().putString("offline_customer_replies", queue.toString()).apply();
            Log.i(TAG, "Offline bank notification saved");
        } catch (Exception e) {
            Log.e(TAG, "saveOfflineCustomerReply error: " + e.getMessage());
        }
    }

    private boolean isLikelyBankNotification(String title, String text) {
        String content = ((title == null ? "" : title) + " " + (text == null ? "" : text)).toLowerCase(Locale.ROOT);
        boolean hasTransfer = content.contains("تحويل") || content.contains("حوالة") || content.contains("حواله") || content.contains("transfer");
        boolean hasAmount = content.matches(".*(?:ils|usd|jod|شيكل|₪|مبلغ|بمبلغ).*\\d[\\d.,]*.*");
        boolean hasBank = content.contains("بنك") || content.contains("palpay") || content.contains("بال بي") || content.contains("محفظة") || content.contains("pal pay");
        return hasTransfer && hasAmount && hasBank;
    }

    private void pushPendingOperation(String senderPhone, String simNumber, String message,
                                       String source, String supabaseUrl, String supabaseAnonKey) {
        try {
            URL url = new URL(supabaseUrl + "/rest/v1/sms_inbox_events");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("apikey", supabaseAnonKey);
            conn.setRequestProperty("Authorization", "Bearer " + supabaseAnonKey);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "return=minimal");

            JSONObject payload = new JSONObject();
            payload.put("event_type", "pendingOperation");
            payload.put("sender_phone", senderPhone);
            payload.put("message", message);
            payload.put("sim_number", simNumber != null ? simNumber : "");
            payload.put("source", source);

            conn.setDoOutput(true);
            OutputStream os = conn.getOutputStream();
            os.write(payload.toString().getBytes(StandardCharsets.UTF_8));
            os.close();

            Log.i(TAG, "WhatsApp pending operation pushed to event queue");
            conn.disconnect();
        } catch (Exception e) {
            Log.e(TAG, "pushPendingOperation error: " + e.getMessage());
        }
    }
}
