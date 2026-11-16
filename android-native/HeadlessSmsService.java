package com.sahabpos.sms;

import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.telephony.SmsManager;
import android.util.Log;

/**
 * HeadlessSmsService — required by Android for an app to be eligible as the
 * default SMS handler. Handles the "quick response" action when the user
 * declines a call with a text reply from the phone app.
 *
 * Must be a Service — NOT a BroadcastReceiver — for Android to accept the
 * app as a default SMS candidate.
 */
public class HeadlessSmsService extends Service {

    private static final String TAG = "HeadlessSms";

    @Override
    public android.os.IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        handleRespondViaMessage(intent);
        stopSelf(startId);
        return START_NOT_STICKY;
    }

    private void handleRespondViaMessage(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!"android.intent.action.RESPOND_VIA_MESSAGE".equals(action)) return;

        Log.i(TAG, "Quick response received");

        String recipient = intent.getStringExtra("android.intent.extra.PHONE_NUMBER");
        if (recipient == null || recipient.isEmpty()) {
            recipient = intent.getStringExtra("address");
        }
        if (recipient == null || recipient.isEmpty()) return;

        String message = intent.getStringExtra("android.intent.extra.MESSAGE_TEXT");
        if (message == null || message.isEmpty()) {
            message = "لا أستطيع الرد الآن";
        }

        try {
            SmsManager smsManager = SmsManager.getDefault();
            if (message.length() > 70) {
                smsManager.sendMultipartTextMessage(recipient, null, smsManager.divideMessage(message), null, null);
            } else {
                smsManager.sendTextMessage(recipient, null, message, null, null);
            }
            Log.i(TAG, "Quick response sent to " + recipient);
        } catch (Exception e) {
            Log.e(TAG, "Quick response error: " + e.getMessage());
        }
    }
}
