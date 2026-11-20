package com.sahabpos.sms;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableArray;

import android.content.Context;
import android.util.Log;

/**
 * BusinessHoursModule — bridges React Native business hours config to
 * Android SharedPreferences so that SmsReceiver and CallReceiver can
 * read the config without needing the JS runtime to be active.
 *
 * Also handles toggling Do Not Disturb mode via NotificationManager.
 */
public class BusinessHoursModule extends ReactContextBaseJavaModule {

    private static final String TAG = "BusinessHours";
    private static final String PREFS = "sahab_prefs";

    public BusinessHoursModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "BusinessHoursNative";
    }

    /**
     * Syncs the entire business hours config to SharedPreferences.
     * Called from JS whenever the config changes.
     */
    @ReactMethod
    public void setSupabaseCredentials(String url, String accessToken, String userId) {
        try {
            android.content.SharedPreferences prefs =
                getReactApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String existingAnonKey = prefs.getString("supabase_anon_key", "");
            // If the new token looks like a JWT (contains a dot), store it as the
            // access token and keep the previous anon key (set by setAnonKey) intact.
            // Otherwise treat it as the anon key (backward-compatible first call).
            android.content.SharedPreferences.Editor editor = prefs.edit();
            editor.putString("supabase_url", url);
            if (accessToken != null && accessToken.contains(".")) {
                editor.putString("supabase_access_token", accessToken);
                if (existingAnonKey.isEmpty() || !existingAnonKey.contains(".")) {
                    editor.putString("supabase_anon_key", accessToken);
                }
            } else {
                editor.putString("supabase_anon_key", accessToken);
            }
            editor.putString("supabase_user_id", userId);
            editor.apply();
        } catch (Exception e) {
            Log.e(TAG, "setSupabaseCredentials error: " + e.getMessage());
        }
    }

    @ReactMethod
    public void setAnonKey(String anonKey) {
        try {
            getReactApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString("supabase_anon_key", anonKey)
                .apply();
        } catch (Exception e) {
            Log.e(TAG, "setAnonKey error: " + e.getMessage());
        }
    }

    @ReactMethod
    public void setSmsGatewayEnabled(boolean enabled) {
        try {
            getReactApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean("sms_gateway_enabled", enabled)
                .apply();
            Log.i(TAG, "sms_gateway_enabled set to " + enabled);

            if (enabled) {
                try {
                    android.content.Intent svcIntent = new android.content.Intent(getReactApplicationContext(), SmsGatewayService.class);
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                        getReactApplicationContext().startForegroundService(svcIntent);
                    } else {
                        getReactApplicationContext().startService(svcIntent);
                    }
                    Log.i(TAG, "SmsGatewayService started");
                } catch (Exception se) {
                    Log.e(TAG, "Failed to start SmsGatewayService: " + se.getMessage());
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "setSmsGatewayEnabled error: " + e.getMessage());
        }
    }

    @ReactMethod
    public void syncConfig(ReadableMap config) {
        try {
            android.content.SharedPreferences prefs = getReactApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            android.content.SharedPreferences.Editor editor = prefs.edit();

            editor.putBoolean("bh_auto_mode", config.getBoolean("autoMode"));
            editor.putBoolean("auto_responder_enabled", config.getBoolean("enableAutoReply"));
            editor.putBoolean("call_rejection_enabled", config.getBoolean("enableCallRejection"));
            editor.putBoolean("dnd_enabled", config.getBoolean("enableDnd"));
            editor.putBoolean("sms_monitoring_enabled", config.getBoolean("enableSmsMonitoring"));
            editor.putBoolean("whatsapp_monitoring_enabled", config.getBoolean("enableWhatsappMonitoring"));
            editor.putString("bh_open_message", config.getString("openMessage"));
            editor.putString("bh_closed_message", config.getString("closedMessage"));
            editor.putString("bh_greeting_message", config.getString("greetingMessage"));
            editor.putInt("reply_cooldown_minutes", config.getInt("autoReplyCooldownMinutes"));

            // Sync days
            ReadableMap days = config.getMap("days");
            if (days != null) {
                for (int i = 0; i < 7; i++) {
                    String dayKey = "bh_day_" + i;
                    ReadableMap day = days.getMap(String.valueOf(i));
                    if (day != null) {
                        editor.putBoolean(dayKey + "_enabled", day.getBoolean("enabled"));
                        editor.putString(dayKey + "_open", day.getString("openTime"));
                        editor.putString(dayKey + "_close", day.getString("closeTime"));
                    }
                }
            }

            // Sync keyword replies as JSON
            ReadableArray replies = config.getArray("keywordReplies");
            if (replies != null) {
                StringBuilder json = new StringBuilder("[");
                for (int i = 0; i < replies.size(); i++) {
                    ReadableMap r = replies.getMap(i);
                    if (r == null) continue;
                    if (json.length() > 1) json.append(",");
                    json.append("{");
                    json.append("\"active\":").append(r.getBoolean("active")).append(",");
                    json.append("\"reply\":\"").append(escapeJson(r.getString("reply"))).append("\",");
                    json.append("\"keywords\":[");
                    ReadableArray keywords = r.getArray("keywords");
                    if (keywords != null) {
                        for (int j = 0; j < keywords.size(); j++) {
                            if (j > 0) json.append(",");
                            json.append("\"").append(escapeJson(keywords.getString(j))).append("\"");
                        }
                    }
                    json.append("]}");
                }
                json.append("]");
                editor.putString("keyword_replies_json", json.toString());
            }

            // Sync telecom sales (simNumber + companyName + customer info for offline subscription check)
            ReadableArray sales = config.getArray("telecomSales");
            if (sales != null) {
                StringBuilder salesJson = new StringBuilder("[");
                for (int i = 0; i < sales.size(); i++) {
                    ReadableMap s = sales.getMap(i);
                    if (s == null) continue;
                    if (salesJson.length() > 1) salesJson.append(",");
                    salesJson.append("{");
                    salesJson.append("\"simNumber\":\"").append(escapeJson(s.getString("simNumber"))).append("\",");
                    salesJson.append("\"companyName\":\"").append(escapeJson(s.getString("companyName"))).append("\",");
                    salesJson.append("\"customerName\":\"").append(escapeJson(s.hasKey("customerName") ? s.getString("customerName") : "")).append("\",");
                    salesJson.append("\"customerPhone\":\"").append(escapeJson(s.hasKey("customerPhone") ? s.getString("customerPhone") : "")).append("\",");
                    salesJson.append("\"createdAt\":").append(s.hasKey("createdAt") ? (long) s.getDouble("createdAt") : 0).append(",");
                    salesJson.append("\"chargeDuration\":\"").append(escapeJson(s.hasKey("chargeDuration") ? s.getString("chargeDuration") : "month")).append("\"");
                    salesJson.append("}");
                }
                salesJson.append("]");
                editor.putString("telecom_sales_json", salesJson.toString());
            }

            // Sync telecom companies for offline lookup
            ReadableArray companies = config.getArray("telecomCompanies");
            if (companies != null) {
                StringBuilder companiesJson = new StringBuilder("[");
                for (int i = 0; i < companies.size(); i++) {
                    ReadableMap c = companies.getMap(i);
                    if (c == null) continue;
                    if (companiesJson.length() > 1) companiesJson.append(",");
                    companiesJson.append("{");
                    companiesJson.append("\"id\":\"").append(escapeJson(c.getString("id"))).append("\",");
                    companiesJson.append("\"name\":\"").append(escapeJson(c.getString("name"))).append("\"");
                    companiesJson.append("}");
                }
                companiesJson.append("]");
                editor.putString("telecom_companies_json", companiesJson.toString());
            }

            // Sync bundles for offline eSIM bundle display
            ReadableArray bundles = config.getArray("bundles");
            if (bundles != null) {
                StringBuilder bundlesJson = new StringBuilder("[");
                for (int i = 0; i < bundles.size(); i++) {
                    ReadableMap b = bundles.getMap(i);
                    if (b == null) continue;
                    if (bundlesJson.length() > 1) bundlesJson.append(",");
                    bundlesJson.append("{");
                    bundlesJson.append("\"id\":\"").append(escapeJson(b.getString("id"))).append("\",");
                    bundlesJson.append("\"companyId\":\"").append(escapeJson(b.getString("companyId"))).append("\",");
                    bundlesJson.append("\"companyName\":\"").append(escapeJson(b.getString("companyName"))).append("\",");
                    bundlesJson.append("\"name\":\"").append(escapeJson(b.getString("name"))).append("\",");
                    bundlesJson.append("\"price\":").append(b.getDouble("price")).append(",");
                    bundlesJson.append("\"durationDays\":").append(b.getInt("durationDays")).append(",");
                    bundlesJson.append("\"active\":").append(b.getBoolean("active"));
                    bundlesJson.append("}");
                }
                bundlesJson.append("]");
                editor.putString("bundles_json", bundlesJson.toString());
            }

            editor.apply();
            Log.i(TAG, "Business hours config synced to native");
        } catch (Exception e) {
            Log.e(TAG, "syncConfig error: " + e.getMessage());
        }
    }

    /**
     * Toggles Do Not Disturb mode on the device.
     * Requires ACCESS_NOTIFICATION_POLICY permission.
     */
    @ReactMethod
    public void setDoNotDisturb(boolean enabled, com.facebook.react.bridge.Callback callback) {
        try {
            android.app.NotificationManager nm = (android.app.NotificationManager)
                getReactApplicationContext().getSystemService(Context.NOTIFICATION_SERVICE);

            if (enabled) {
                // Check if we have permission to change DND
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                    if (!nm.isNotificationPolicyAccessGranted()) {
                        callback.invoke("NO_DND_PERMISSION");
                        return;
                    }
                    nm.setInterruptionFilter(android.app.NotificationManager.INTERRUPTION_FILTER_NONE);
                    Log.i(TAG, "DND enabled");
                }
            } else {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                    if (nm.isNotificationPolicyAccessGranted()) {
                        nm.setInterruptionFilter(android.app.NotificationManager.INTERRUPTION_FILTER_ALL);
                        Log.i(TAG, "DND disabled");
                    }
                }
            }
            callback.invoke("ok");
        } catch (Exception e) {
            Log.e(TAG, "setDoNotDisturb error: " + e.getMessage());
            callback.invoke("ERROR:" + e.getMessage());
        }
    }

    private String escapeJson(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder(s.length() + 16);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '\\': sb.append("\\\\"); break;
                case '"': sb.append("\\\""); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        return sb.toString();
    }
}
