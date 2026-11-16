package com.sahabpos.sms;

import android.content.BroadcastReceiver;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.app.RemoteInput;
import android.telephony.SmsManager;
import android.util.Log;

/**
 * SmsReplyReceiver — handles the inline reply action from the incoming SMS
 * notification. When the user types a reply in the notification's RemoteInput
 * field and presses send, this receiver extracts the text and sends it as an
 * SMS to the original sender.
 *
 * Also handles the "mark as read" action which simply dismisses the notification.
 */
public class SmsReplyReceiver extends BroadcastReceiver {

    private static final String TAG = "SmsReplyReceiver";
    private static final String ACTION_REPLY = "com.sahabpos.sms.REPLY_SMS";
    private static final String ACTION_MARK_READ = "com.sahabpos.sms.MARK_READ";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;

        int notifId = intent.getIntExtra("notif_id", -1);

        if (ACTION_MARK_READ.equals(action)) {
            // Just cancel the notification
            if (notifId != -1) {
                NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) nm.cancel(notifId);
            }
            return;
        }

        if (!ACTION_REPLY.equals(action)) return;

        String senderPhone = intent.getStringExtra("sender_phone");
        if (senderPhone == null || senderPhone.isEmpty()) return;

        // Extract reply text from RemoteInput
        Bundle remoteInput = RemoteInput.getResultsFromIntent(intent);
        if (remoteInput == null) return;

        String replyText = remoteInput.getCharSequence("reply_text", "").toString().trim();
        if (replyText.isEmpty()) {
            Log.i(TAG, "Empty reply, ignoring");
            return;
        }

        // Send the reply via SMS
        try {
            SmsManager smsManager = SmsManager.getDefault();
            if (replyText.length() > 70) {
                smsManager.sendMultipartTextMessage(senderPhone, null, smsManager.divideMessage(replyText), null, null);
            } else {
                smsManager.sendTextMessage(senderPhone, null, replyText, null, null);
            }
            Log.i(TAG, "Inline reply sent to " + senderPhone + ": " + replyText);

            // If we are the default SMS app, also write to the sent store so the
            // conversation shows the outgoing message in our own inbox view.
            String myPackage = context.getPackageName();
            String defaultPackage = android.provider.Telephony.Sms.getDefaultSmsPackage(context);
            if (myPackage.equals(defaultPackage)) {
                android.content.ContentValues values = new android.content.ContentValues();
                values.put("address", senderPhone);
                values.put("body", replyText);
                values.put("date", System.currentTimeMillis());
                values.put("type", 2); // 2 = sent
                values.put("read", 1);
                context.getContentResolver().insert(android.net.Uri.parse("content://sms/sent"), values);
            }
        } catch (SecurityException e) {
            Log.e(TAG, "SMS permission denied for inline reply: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Inline reply error: " + e.getMessage());
        }

        // Cancel the notification after replying
        if (notifId != -1) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(notifId);
        }
    }
}
