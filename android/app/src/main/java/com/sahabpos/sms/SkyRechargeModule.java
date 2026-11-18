package com.sahabpos.sms;

import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Native module that automates recharge operations on the Sky 5G sales portal
 * using a hidden WebView with JavaScript injection. The JS sequence is driven
 * from the React side via {@link #executeRechargeSequence}.
 */
public class SkyRechargeModule extends ReactContextBaseJavaModule {

    private static final String TAG = "SkyRechargeModule";
    private static final String SKY_URL = "https://sales-ps.sky5g.ps/";

    private final ReactApplicationContext reactContext;
    private WebView webView;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final AtomicReference<String> pendingResult = new AtomicReference<>(null);

    public SkyRechargeModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @NonNull
    @Override
    public String getName() {
        return "SkyRecharge";
    }

    /**
     * Ensures the WebView is created on the UI thread with cookies and JS enabled.
     */
    private void ensureWebView() {
        mainHandler.post(() -> {
            if (webView != null) return;
            Context ctx = reactContext.getCurrentActivity();
            if (ctx == null) ctx = reactContext.getApplicationContext();
            webView = new WebView(ctx);
            webView.setVisibility(View.GONE); // hidden — not shown to user

            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setJavaScriptCanOpenWindowsAutomatically(true);
            settings.setSupportZoom(false);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
            settings.setUserAgentString(
                "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
            );

            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            cookieManager.setAcceptThirdPartyCookies(webView, true);

            webView.addJavascriptInterface(new SkyJsBridge(), "SkyBridge");
            webView.setWebViewClient(new SkyWebViewClient());
            webView.setWebChromeClient(new WebChromeClient());
        });
    }

    private class SkyWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return false;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            Log.d(TAG, "Page loaded: " + url);
        }
    }

    /**
     * JavaScript interface — allows injected JS to send results back to native code.
     */
    private class SkyJsBridge {
        @JavascriptInterface
        public void onResult(String resultJson) {
            Log.d(TAG, "JS result: " + resultJson);
            pendingResult.set(resultJson);
        }

        @JavascriptInterface
        public void onLog(String message) {
            Log.d(TAG, "JS log: " + message);
        }
    }

    /**
     * Main entry point: logs into Sky portal and performs a recharge.
     * Called from React Native with credentials and target number/duration.
     *
     * @param username   Sky portal username
     * @param password    Sky portal password
     * @param totpCode    Current TOTP code from the user's authenticator
     * @param phoneNumber Customer phone number to recharge
     * @param durationKey Duration key matching the dropdown option on the site
     * @param promise     React promise to resolve/reject
     */
    @ReactMethod
    public void executeRechargeSequence(
            final String username,
            final String password,
            final String totpCode,
            final String phoneNumber,
            final String durationKey,
            final String portalUrl,
            final int pageLoadDelay,
            final int loginDelay,
            final int rechargeDelay,
            final Promise promise
    ) {
        ensureWebView();

        final String url = (portalUrl != null && !portalUrl.isEmpty()) ? portalUrl : SKY_URL;

        mainHandler.post(() -> {
            pendingResult.set(null);

            // Step 1: Load the login page
            webView.loadUrl(url);

            // Wait for page to load, then inject login sequence
            mainHandler.postDelayed(() -> {
                String loginJs = buildLoginJs(username, password, totpCode);
                webView.evaluateJavascript(loginJs, null);

                // Wait for login to complete, then proceed to recharge
                mainHandler.postDelayed(() -> {
                    String rechargeJs = buildRechargeJs(phoneNumber, durationKey);
                    webView.evaluateJavascript(rechargeJs, null);

                    // Wait for recharge to complete, then collect result
                    mainHandler.postDelayed(() -> {
                        String collectJs = buildCollectResultJs();
                        webView.evaluateJavascript(collectJs, value -> {
                            String result = pendingResult.get();
                            if (result == null) {
                                result = value != null ? value : "{\"success\":false,\"error\":\"no_result\"}";
                            }
                            try {
                                WritableMap map = parseSimpleJson(result);
                                promise.resolve(map);
                            } catch (Exception e) {
                                WritableMap fallback = Arguments.createMap();
                                fallback.putBoolean("success", false);
                                fallback.putString("error", "parse_error: " + e.getMessage());
                                fallback.putString("rawResult", result);
                                promise.resolve(fallback);
                            }
                        });
                    }, rechargeDelay > 0 ? rechargeDelay : 8000);
                }, loginDelay > 0 ? loginDelay : 6000);
            }, pageLoadDelay > 0 ? pageLoadDelay : 4000);
        });
    }

    /**
     * Checks if the WebView session is still logged in by loading the portal
     * and checking for a login redirect.
     */
    @ReactMethod
    public void checkSession(final Promise promise) {
        ensureWebView();
        mainHandler.post(() -> {
            webView.loadUrl(SKY_URL);
            mainHandler.postDelayed(() -> {
                String checkJs = "(function(){" +
                    "var hasLoginBtn = !!document.querySelector('a[href*=\"login\"], button[type=\"submit\"]');" +
                    "var hasSearch = !!document.querySelector('input[type=\"search\"], input[placeholder*=\"' + '\\u0628' + '\"]');" +
                    "var loggedIn = hasSearch && !hasLoginBtn;" +
                    "SkyBridge.onResult(JSON.stringify({loggedIn: loggedIn}));" +
                    "return JSON.stringify({loggedIn: loggedIn});" +
                    "})()";
                webView.evaluateJavascript(checkJs, value -> {
                    String result = pendingResult.get();
                    if (result == null) result = value != null ? value : "{\"loggedIn\":false}";
                    try {
                        WritableMap map = parseSimpleJson(result);
                        promise.resolve(map);
                    } catch (Exception e) {
                        WritableMap fallback = Arguments.createMap();
                        fallback.putBoolean("loggedIn", false);
                        promise.resolve(fallback);
                    }
                });
            }, 4000);
        });
    }

    /**
     * Logs out and clears cookies/session.
     */
    @ReactMethod
    public void logout(final Promise promise) {
        mainHandler.post(() -> {
            if (webView != null) {
                CookieManager.getInstance().removeAllCookies(value -> {
                    webView.loadUrl("about:blank");
                    promise.resolve(true);
                });
            } else {
                CookieManager.getInstance().removeAllCookies(value -> promise.resolve(true));
            }
        });
    }

    /**
     * Clears the WebView and cookies entirely.
     */
    @ReactMethod
    public void clearSession() {
        mainHandler.post(() -> {
            if (webView != null) {
                webView.clearCache(true);
                webView.clearHistory();
                CookieManager.getInstance().removeAllCookies(null);
                webView.loadUrl("about:blank");
            }
        });
    }

    // ---- JavaScript builders ----

    private String buildLoginJs(String username, String password, String totpCode) {
        return "(function(){" +
            "try {" +
            "  SkyBridge.onLog('Starting login sequence');" +
            "  // Step 1: Click login button" +
            "  var loginLink = (function(){ var s='a[href*=\"login\"], a[href*=\"Login\"]'; var el=document.querySelector(s); if(el) return el; var btns=document.querySelectorAll('a, button'); var texts=['" + "\\u062f" + "\\u062e" + "\\u0648" + "\\u0644','Login','login']; for(var i=0;i<btns.length;i++){ var t=(btns[i].textContent||'').trim(); for(var j=0;j<texts.length;j++){ if(t.indexOf(texts[j])>=0) return btns[i]; } } return null; })();" +
            "  if (loginLink) { loginLink.click(); SkyBridge.onLog('Clicked login link'); }" +
            "  else { SkyBridge.onLog('No login link found, might already on login page'); }" +
            "  // Step 2: Wait and fill credentials + TOTP" +
            "  setTimeout(function() {" +
            "    var inputs = document.querySelectorAll('input');" +
            "    SkyBridge.onLog('Found ' + inputs.length + ' inputs');" +
            "    // Try to fill username and password fields" +
            "    var userFilled = false, passFilled = false, otpFilled = false;" +
            "    for (var i = 0; i < inputs.length; i++) {" +
            "      var inp = inputs[i];" +
            "      var type = (inp.type || '').toLowerCase();" +
            "      var name = (inp.name || '').toLowerCase();" +
            "      var placeholder = (inp.placeholder || '').toLowerCase();" +
            "      if (type === 'email' || name.indexOf('email') >= 0 || name.indexOf('user') >= 0 || name.indexOf('name') >= 0 || placeholder.indexOf('user') >= 0 || placeholder.indexOf('email') >= 0) {" +
            "        setNativeValue(inp, '" + escapeJs(username) + "'); userFilled = true;" +
            "      } else if (type === 'password' || name.indexOf('pass') >= 0) {" +
            "        setNativeValue(inp, '" + escapeJs(password) + "'); passFilled = true;" +
            "      } else if (name.indexOf('otp') >= 0 || name.indexOf('code') >= 0 || name.indexOf('token') >= 0 || name.indexOf('totp') >= 0 || placeholder.indexOf('code') >= 0 || placeholder.indexOf('otp') >= 0 || type === 'tel') {" +
            "        setNativeValue(inp, '" + escapeJs(totpCode) + "'); otpFilled = true;" +
            "      }" +
            "    }" +
            "    SkyBridge.onLog('Filled: user=' + userFilled + ' pass=' + passFilled + ' otp=' + otpFilled);" +
            "    // Step 3: Submit the form" +
            "    setTimeout(function() {" +
            "      var submitBtn = (function(){ var s='button[type=\"submit\"], input[type=\"submit\"]'; var el=document.querySelector(s); if(el) return el; var btns=document.querySelectorAll('button'); var texts=['" + "\\u062f" + "\\u062e" + "\\u0648" + "\\u0644','Login','login','" + "\\u062a" + "\\u0623" + "\\u0643" + "\\u064a" + "\\u062f']; for(var i=0;i<btns.length;i++){ var t=(btns[i].textContent||'').trim(); for(var j=0;j<texts.length;j++){ if(t.indexOf(texts[j])>=0) return btns[i]; } } return null; })();" +
            "      if (submitBtn) { submitBtn.click(); SkyBridge.onLog('Clicked submit button'); }" +
            "      else {" +
            "        // Try submitting the form directly" +
            "        var form = document.querySelector('form');" +
            "        if (form) { form.submit(); SkyBridge.onLog('Submitted form directly'); }" +
            "        else { SkyBridge.onLog('No submit button or form found'); }" +
            "      }" +
            "    }, 1000);" +
            "  }, 2000);" +
            "  function setNativeValue(el, value) {" +
            "    var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;" +
            "    nativeInputValueSetter.call(el, value);" +
            "    el.dispatchEvent(new Event('input', {bubbles: true}));" +
            "    el.dispatchEvent(new Event('change', {bubbles: true}));" +
            "  }" +
            "} catch(e) { SkyBridge.onLog('Login error: ' + e.message); }" +
            "})()";
    }

    private String buildRechargeJs(String phoneNumber, String durationKey) {
        return "(function(){" +
            "try {" +
            "  SkyBridge.onLog('Starting recharge sequence for " + escapeJs(phoneNumber) + "');" +
            "  // Step 1: Find the search box and enter the phone number" +
            "  var searchInput = null;" +
            "  var inputs = document.querySelectorAll('input');" +
            "  for (var i = 0; i < inputs.length; i++) {" +
            "    var inp = inputs[i];" +
            "    var type = (inp.type || '').toLowerCase();" +
            "    var placeholder = inp.placeholder || '';" +
            "    if (type === 'search' || placeholder.indexOf('' + '\\u0628' + '\\u062d' + '\\u062b') >= 0 || placeholder.indexOf('search') >= 0 || placeholder.indexOf('' + '\\u0631' + '\\u0642' + '\\u0645') >= 0 || placeholder.indexOf('number') >= 0 || placeholder.indexOf('phone') >= 0) {" +
            "      searchInput = inp; break;" +
            "    }" +
            "  }" +
            "  if (!searchInput) {" +
            "    // Fallback: take the first text/tel input on the page" +
            "    for (var i = 0; i < inputs.length; i++) {" +
            "      var t = (inputs[i].type || '').toLowerCase();" +
            "      if (t === 'text' || t === 'tel' || t === 'number') { searchInput = inputs[i]; break; }" +
            "    }" +
            "  }" +
            "  if (searchInput) {" +
            "    var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;" +
            "    nativeSetter.call(searchInput, '" + escapeJs(phoneNumber) + "');" +
            "    searchInput.dispatchEvent(new Event('input', {bubbles: true}));" +
            "    searchInput.dispatchEvent(new Event('change', {bubbles: true}));" +
            "    SkyBridge.onLog('Filled search with phone number');" +
            "    // Trigger search (Enter key or search button)" +
            "    setTimeout(function() {" +
            "      searchInput.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true}));" +
            "      searchInput.dispatchEvent(new KeyboardEvent('keypress', {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true}));" +
            "      searchInput.dispatchEvent(new KeyboardEvent('keyup', {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true}));" +
            "      // Also try clicking a search button" +
            "      var searchBtn = (function(){ var s='button[type=\"submit\"], [role=\"search\"] button'; var el=document.querySelector(s); if(el) return el; var btns=document.querySelectorAll('button'); var texts=['" + "\\u0628" + "\\u062d" + "\\u062b','Search']; for(var i=0;i<btns.length;i++){ var t=(btns[i].textContent||'').trim(); for(var j=0;j<texts.length;j++){ if(t.indexOf(texts[j])>=0) return btns[i]; } } return null; })();" +
            "      if (searchBtn) searchBtn.click();" +
            "      SkyBridge.onLog('Triggered search');" +
            "      // Step 2: Wait for results, then click recharge button" +
            "      setTimeout(function() {" +
            "        // Look for a recharge/charge button near the result" +
            "        var rechargeBtn = null;" +
            "        var btns = document.querySelectorAll('button, a, [role=\"button\"]');" +
            "        for (var j = 0; j < btns.length; j++) {" +
            "          var txt = (btns[j].textContent || '').trim();" +
            "          if (txt.indexOf('' + '\\u0634' + '\\u062d' + '\\u0646') >= 0 || txt.toLowerCase().indexOf('recharge') >= 0 || txt.toLowerCase().indexOf('charge') >= 0) {" +
            "            rechargeBtn = btns[j]; break;" +
            "          }" +
            "        }" +
            "        if (rechargeBtn) {" +
            "          rechargeBtn.click();" +
            "          SkyBridge.onLog('Clicked recharge button');" +
            "          // Step 3: Select duration from dropdown" +
            "          setTimeout(function() {" +
            "            var selects = document.querySelectorAll('select');" +
            "            if (selects.length > 0) {" +
            "              var sel = selects[selects.length - 1];" +
            "              // Try to find option matching durationKey" +
            "              var found = false;" +
            "              for (var k = 0; k < sel.options.length; k++) {" +
            "                var optText = (sel.options[k].text || '').trim();" +
            "                var optVal = (sel.options[k].value || '').trim();" +
            "                if (optText.indexOf('" + escapeJs(durationKey) + "') >= 0 || optVal.indexOf('" + escapeJs(durationKey) + "') >= 0) {" +
            "                  sel.selectedIndex = k;" +
            "                  sel.dispatchEvent(new Event('change', {bubbles: true}));" +
            "                  found = true;" +
            "                  SkyBridge.onLog('Selected duration: ' + optText);" +
            "                  break;" +
            "                }" +
            "              }" +
            "              if (!found && sel.options.length > 1) {" +
            "                sel.selectedIndex = 1;" +
            "                sel.dispatchEvent(new Event('change', {bubbles: true}));" +
            "                SkyBridge.onLog('Duration not found, selected first non-empty option');" +
            "              }" +
            "            }" +
            "            // Step 4: Click first confirm button" +
            "            setTimeout(function() {" +
            "              var confirmBtn = null;" +
            "              var allBtns = document.querySelectorAll('button, [role=\"button\"]');" +
            "              for (var m = 0; m < allBtns.length; m++) {" +
            "                var t = (allBtns[m].textContent || '').trim();" +
            "                if (t.indexOf('' + '\\u062a' + '\\u0623' + '\\u0643' + '\\u064a' + '\\u062f') >= 0 || t.toLowerCase().indexOf('confirm') >= 0 || t.toLowerCase().indexOf('ok') >= 0) {" +
            "                  confirmBtn = allBtns[m]; break;" +
            "                }" +
            "              }" +
            "              if (confirmBtn) {" +
            "                confirmBtn.click();" +
            "                SkyBridge.onLog('Clicked first confirm');" +
            "                // Step 5: Click second confirm button" +
            "                setTimeout(function() {" +
            "                  var confirmBtn2 = null;" +
            "                  var allBtns2 = document.querySelectorAll('button, [role=\"button\"]');" +
            "                  for (var n = 0; n < allBtns2.length; n++) {" +
            "                    var t2 = (allBtns2[n].textContent || '').trim();" +
            "                    if (t2.indexOf('' + '\\u062a' + '\\u0623' + '\\u0643' + '\\u064a' + '\\u062f') >= 0 || t2.toLowerCase().indexOf('confirm') >= 0) {" +
            "                      // Skip if it's the same button we already clicked" +
            "                      if (allBtns2[n] !== confirmBtn) { confirmBtn2 = allBtns2[n]; break; }" +
            "                    }" +
            "                  }" +
            "                  if (confirmBtn2) {" +
            "                    confirmBtn2.click();" +
            "                    SkyBridge.onLog('Clicked second confirm');" +
            "                  } else {" +
            "                    SkyBridge.onLog('No second confirm button found');" +
            "                  }" +
            "                  SkyBridge.onResult(JSON.stringify({success: true, step: 'completed'}));" +
            "                }, 1500);" +
            "              } else {" +
            "                SkyBridge.onLog('No confirm button found');" +
            "                SkyBridge.onResult(JSON.stringify({success: false, error: 'no_confirm_button'}));" +
            "              }" +
            "            }, 1500);" +
            "          }, 1500);" +
            "        } else {" +
            "          SkyBridge.onLog('No recharge button found');" +
            "          SkyBridge.onResult(JSON.stringify({success: false, error: 'no_recharge_button'}));" +
            "        }" +
            "      }, 3000);" +
            "    }, 500);" +
            "  } else {" +
            "    SkyBridge.onLog('No search input found');" +
            "    SkyBridge.onResult(JSON.stringify({success: false, error: 'no_search_input'}));" +
            "  }" +
            "} catch(e) {" +
            "  SkyBridge.onLog('Recharge error: ' + e.message);" +
            "  SkyBridge.onResult(JSON.stringify({success: false, error: e.message}));" +
            "}" +
            "})()";
    }

    private String buildCollectResultJs() {
        return "(function(){" +
            "  var bodyText = document.body ? document.body.innerText : '';" +
            "  var success = bodyText.indexOf('' + '\\u062a' + '\\u0645' + ' ' + '\\u0634' + '\\u062d' + '\\u0646') >= 0 || bodyText.indexOf('' + '\\u0646' + '\\u062c' + '\\u0627' + '\\u062d') >= 0 || bodyText.toLowerCase().indexOf('success') >= 0;" +
            "  var error = bodyText.indexOf('' + '\\u062e' + '\\u0637' + '\\u0623') >= 0 || bodyText.indexOf('' + '\\u0641' + '\\u0634' + '\\u0644') >= 0 || bodyText.toLowerCase().indexOf('error') >= 0;" +
            "  SkyBridge.onResult(JSON.stringify({success: success, error: error ? bodyText.substring(0, 500) : null, url: window.location.href}));" +
            "  return JSON.stringify({success: success, error: error ? bodyText.substring(0, 500) : null, url: window.location.href});" +
            "})()";
    }

    private String escapeJs(String input) {
        if (input == null) return "";
        return input
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r");
    }

    /**
     * Minimal JSON parser for simple flat objects returned from JS.
     */
    private WritableMap parseSimpleJson(String json) {
        WritableNativeMap map = new WritableNativeMap();
        if (json == null || json.isEmpty()) {
            map.putBoolean("success", false);
            map.putString("error", "empty_result");
            return map;
        }
        // Strip surrounding quotes if the value is a JSON string returned by evaluateJavascript
        if (json.startsWith("\"") && json.endsWith("\"")) {
            json = json.substring(1, json.length() - 1);
            json = json.replace("\\\"", "\"").replace("\\\\", "\\");
        }
        // Remove leading/trailing braces
        String inner = json.trim();
        if (inner.startsWith("{")) inner = inner.substring(1);
        if (inner.endsWith("}")) inner = inner.substring(0, inner.length() - 1);

        // Simple split-based parsing (handles flat key-value pairs)
        String[] pairs = splitJsonPairs(inner);
        for (String pair : pairs) {
            int colonIdx = pair.indexOf(':');
            if (colonIdx < 0) continue;
            String key = pair.substring(0, colonIdx).trim();
            String value = pair.substring(colonIdx + 1).trim();
            if (key.startsWith("\"")) key = key.substring(1);
            if (key.endsWith("\"")) key = key.substring(0, key.length() - 1);
            if (value.startsWith("\"") && value.endsWith("\"")) {
                map.putString(key, value.substring(1, value.length() - 1));
            } else if (value.equals("true")) {
                map.putBoolean(key, true);
            } else if (value.equals("false")) {
                map.putBoolean(key, false);
            } else if (value.equals("null")) {
                map.putNull(key);
            } else {
                try {
                    map.putDouble(key, Double.parseDouble(value));
                } catch (NumberFormatException e) {
                    map.putString(key, value);
                }
            }
        }
        return map;
    }

    private String[] splitJsonPairs(String s) {
        java.util.List<String> result = new java.util.ArrayList<>();
        int depth = 0;
        boolean inString = false;
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' && (i == 0 || s.charAt(i - 1) != '\\')) inString = !inString;
            if (!inString) {
                if (c == '{' || c == '[') depth++;
                if (c == '}' || c == ']') depth--;
                if (c == ',' && depth == 0) {
                    result.add(sb.toString().trim());
                    sb = new StringBuilder();
                    continue;
                }
            }
            sb.append(c);
        }
        if (sb.length() > 0) result.add(sb.toString().trim());
        return result.toArray(new String[0]);
    }
}
