package com.sahabpos.sms;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.telephony.TelephonyManager;
import android.util.Log;

/**
 * CallReceiver — intercepts incoming phone calls when the store is closed.
 *
 * When the store is closed and call rejection is enabled:
 * 1. Rejects the incoming call
 * 2. Sends an auto-reply SMS with the "outside business hours" message
 * 3. Respects the cooldown period (one reply per caller per cooldown window)
 *
 * Uses SharedPreferences to read business hours config written by the RN app.
 */
public class CallReceiver extends BroadcastReceiver {

    private static final String TAG = "CallReceiver";
    private static final String PREFS = "sahab_prefs";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        if (!"android.intent.action.PHONE_STATE".equals(intent.getAction())) return;

        String state = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
        if (!TelephonyManager.EXTRA_STATE_RINGING.equals(state)) return;

        String incomingNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER);
        if (incomingNumber == null || incomingNumber.isEmpty()) return;

        Log.i(TAG, "Incoming call received");

        android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean callRejectionEnabled = prefs.getBoolean("call_rejection_enabled", false);
        boolean autoResponderEnabled = prefs.getBoolean("auto_responder_enabled", false);

        boolean storeOpen = isStoreOpen(prefs);

        if (!callRejectionEnabled) return;
        if (storeOpen) return;

        // Reject the call
        rejectCall(context);

        // Send auto-reply SMS if enabled
        if (autoResponderEnabled) {
            sendAutoReply(context, prefs, incomingNumber);
        }
    }

    private boolean isStoreOpen(android.content.SharedPreferences prefs) {
        boolean autoMode = prefs.getBoolean("bh_auto_mode", false);
        if (!autoMode) {
            return prefs.getBoolean("bh_force_open", false);
        }

        java.util.Calendar cal = java.util.Calendar.getInstance();
        int dayOfWeek = cal.get(java.util.Calendar.DAY_OF_WEEK) - 1;
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

    private void rejectCall(Context context) {
        try {
            // Use endCall via reflection (requires ANSWER_PHONE_CALLS permission on Android 8+)
            Class<?> telephonyClass = Class.forName("android.telephony.TelephonyManager");
            Object telephony = context.getSystemService(Context.TELEPHONY_SERVICE);
            java.lang.reflect.Method endCall = telephonyClass.getDeclaredMethod("endCall");
            endCall.invoke(telephony);
            Log.i(TAG, "Call rejected");
        } catch (Exception e) {
            Log.e(TAG, "Reject call error: " + e.getMessage());
        }
    }

    private void sendAutoReply(Context context, android.content.SharedPreferences prefs, String phoneNumber) {
        // Check cooldown
        String cooldownKey = "reply_cooldown_" + phoneNumber;
        long lastReply = prefs.getLong(cooldownKey, 0);
        int cooldownMinutes = prefs.getInt("reply_cooldown_minutes", 60);
        long cooldownMs = cooldownMinutes * 60L * 1000L;

        if (System.currentTimeMillis() - lastReply < cooldownMs) {
            Log.i(TAG, "Within cooldown, skipping reply");
            return;
        }

        String replyText = prefs.getString("bh_closed_message", "نعتذر، نحن خارج وقت العمل حالياً.");
        if (replyText == null || replyText.isEmpty()) return;

        try {
            android.telephony.SmsManager smsManager = android.telephony.SmsManager.getDefault();
            if (replyText.length() > 70) {
                smsManager.sendMultipartTextMessage(phoneNumber, null, smsManager.divideMessage(replyText), null, null);
            } else {
                smsManager.sendTextMessage(phoneNumber, null, replyText, null, null);
            }
            Log.i(TAG, "Call auto-reply sent");
            prefs.edit().putLong(cooldownKey, System.currentTimeMillis()).apply();
        } catch (Exception e) {
            Log.e(TAG, "Call auto-reply error: " + e.getMessage());
        }
    }
}
