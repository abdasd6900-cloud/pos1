package com.sahabpos.sms;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class WhatsAppReplyModule extends ReactContextBaseJavaModule {

    public WhatsAppReplyModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "WhatsAppReply";
    }

    @ReactMethod
    public void replyToWhatsApp(String recipient, String message, Promise promise) {
        try {
            boolean sent = WhatsAppNotificationListener.replyToNotification(recipient, message);
            promise.resolve(sent);
        } catch (Exception e) {
            promise.reject("WHATSAPP_REPLY_ERROR", e.getMessage());
        }
    }
}
