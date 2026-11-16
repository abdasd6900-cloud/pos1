package com.sahabpos.sms;

import android.app.role.RoleManager;
import android.content.Context;
import android.os.Build;
import android.telecom.Call;
import android.util.Log;

/**
 * CallScreeningService — Android's modern API for intercepting incoming calls.
 *
 * When the app holds the ROLE_CALL_SCREENING role, the system routes every
 * incoming call through onScreenCall() BEFORE the phone rings. This lets us
 * reject the call silently (no ringtone, no missed-call notification from the
 * system dialer) and send an auto-reply SMS when the store is closed.
 *
 * This replaces the old CallReceiver PHONE_STATE broadcast approach which
 * could only end an already-ringing call (unreliable, visible to the user).
 */
public class CallScreeningService extends android.telecom.CallScreeningService {

    private static final String TAG = "CallScreening";
    private static final String PREFS = "sahab_prefs";

    @Override
    public void onScreenCall(Call.Details callDetails) {
        Log.i(TAG, "onScreenCall invoked");

        android.content.SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean callRejectionEnabled = prefs.getBoolean("call_rejection_enabled", false);
        boolean autoResponderEnabled = prefs.getBoolean("auto_responder_enabled", false);

        if (!callRejectionEnabled) {
            // Allow the call to proceed normally
            respondToCall(callDetails, new CallResponse.Builder().build());
            return;
        }

        boolean storeOpen = isStoreOpen(prefs);
        if (storeOpen) {
            respondToCall(callDetails, new CallResponse.Builder().build());
            return;
        }

        // Store is closed and call rejection is enabled — reject the call silently
        Log.i(TAG, "Store closed — rejecting call");
        CallResponse response = new CallResponse.Builder()
            .setDisallowCall(true)
            .setRejectCall(true)
            .setSkipCallLog(false)
            .setSkipNotification(true)
            .build();
        respondToCall(callDetails, response);

        // Send auto-reply SMS if enabled
        if (autoResponderEnabled) {
            String incomingNumber = extractPhoneNumber(callDetails);
            if (incomingNumber != null && !incomingNumber.isEmpty()) {
                sendAutoReply(prefs, incomingNumber);
            }
        }
    }

    private String extractPhoneNumber(Call.Details details) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                android.telecom.PhoneAccountHandle handle = details.getAccountHandle();
                if (details.getHandle() != null) {
                    String handleStr = details.getHandle().getSchemeSpecificPart();
                    return normalizePhone(handleStr);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "extractPhoneNumber error: " + e.getMessage());
        }
        return null;
    }

    private void sendAutoReply(android.content.SharedPreferences prefs, String phoneNumber) {
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
            Log.i(TAG, "Call auto-reply sent to " + phoneNumber);
            prefs.edit().putLong(cooldownKey, System.currentTimeMillis()).apply();
        } catch (Exception e) {
            Log.e(TAG, "Call auto-reply error: " + e.getMessage());
        }
    }

    private String normalizePhone(String phone) {
        if (phone == null) return "";
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
}
