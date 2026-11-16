package com.sahabpos.sms;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
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

import java.util.concurrent.atomic.AtomicReference;

/**
 * Native module that automates recharge operations on the Layan Telecom portal
 * (layan-t.net) using a hidden WebView with JavaScript injection.
 *
 * Unlike Sky which uses TOTP, Layan sends a verification code via WhatsApp.
 * The flow is split into two phases:
 *   Phase 1: login (username + password) → triggers WhatsApp code
 *   Phase 2: submit the WhatsApp code → complete recharge
 *
 * The React side calls executeLogin() first, then executeRechargeWithCode()
 * after the user (or the WhatsApp notification listener) provides the code.
 */
public class LayanRechargeModule extends ReactContextBaseJavaModule {

    private static final String TAG = "LayanRechargeModule";
    private static final String LAYAN_URL = "https://www.layan-t.net/index.html";

    private final ReactApplicationContext reactContext;
    private WebView webView;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final AtomicReference<String> pendingResult = new AtomicReference<>(null);

    public LayanRechargeModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @NonNull
    @Override
    public String getName() {
        return "LayanRecharge";
    }

    private void ensureWebView() {
        mainHandler.post(() -> {
            if (webView != null) return;
            Context ctx = reactContext.getCurrentActivity();
            if (ctx == null) ctx = reactContext.getApplicationContext();
            webView = new WebView(ctx);
            webView.setVisibility(android.view.View.GONE);

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

            webView.addJavascriptInterface(new LayanJsBridge(), "LayanBridge");
            webView.setWebViewClient(new LayanWebViewClient());
            webView.setWebChromeClient(new WebChromeClient());
        });
    }

    private class LayanWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return false;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            Log.d(TAG, "Page loaded: " + url);
        }
    }

    private class LayanJsBridge {
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

    // ---- Phase 1: Login (username + password → triggers WhatsApp code) ----

    @ReactMethod
    public void executeLogin(
            final String username,
            final String password,
            final String portalUrl,
            final int pageLoadDelay,
            final int loginDelay,
            final Promise promise
    ) {
        ensureWebView();

        final String url = (portalUrl != null && !portalUrl.isEmpty()) ? portalUrl : LAYAN_URL;

        mainHandler.post(() -> {
            pendingResult.set(null);

            webView.loadUrl(url);

            mainHandler.postDelayed(() -> {
                String loginJs = buildLoginJs(username, password);
                webView.evaluateJavascript(loginJs, null);

                mainHandler.postDelayed(() -> {
                    String collectJs = buildCollectLoginResultJs();
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
                }, loginDelay > 0 ? loginDelay : 8000);
            }, pageLoadDelay > 0 ? pageLoadDelay : 4000);
        });
    }

    // ---- Phase 2: Submit WhatsApp code + execute recharge ----

    @ReactMethod
    public void executeRechargeWithCode(
            final String verificationCode,
            final String phoneNumber,
            final String packageType,
            final String durationKey,
            final int rechargeDelay,
            final Promise promise
    ) {
        ensureWebView();

        mainHandler.post(() -> {
            pendingResult.set(null);

            // Step 1: Enter the verification code and validate
            String codeJs = buildCodeValidationJs(verificationCode);
            webView.evaluateJavascript(codeJs, null);

            mainHandler.postDelayed(() -> {
                // Step 2: Search for the phone number
                String searchJs = buildSearchJs(phoneNumber);
                webView.evaluateJavascript(searchJs, null);

                mainHandler.postDelayed(() -> {
                    // Step 3: Click "تمديد الرقم" (extend number) and select package type + duration
                    String rechargeJs = buildRechargeJs(packageType, durationKey);
                    webView.evaluateJavascript(rechargeJs, null);

                    mainHandler.postDelayed(() -> {
                        // Step 4: Click "التالي" (next) then "موافق" (ok)
                        String confirmJs = buildConfirmJs();
                        webView.evaluateJavascript(confirmJs, null);

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
                        }, rechargeDelay > 0 ? rechargeDelay : 5000);
                    }, 3000);
                }, 4000);
            }, 4000);
        });
    }

    @ReactMethod
    public void checkSession(final Promise promise) {
        ensureWebView();
        mainHandler.post(() -> {
            webView.loadUrl(LAYAN_URL);
            mainHandler.postDelayed(() -> {
                String checkJs = "(function(){" +
                    "var hasLoginBtn = !!document.querySelector('a[href*=\"login\"], a[href*=\"Login\"], button[type=\"submit\"]');" +
                    "var hasSearch = !!document.querySelector('input[type=\"search\"], input[placeholder*=\"\\u0628\\u062d\\u062b\"]');" +
                    "var loggedIn = hasSearch && !hasLoginBtn;" +
                    "LayanBridge.onResult(JSON.stringify({loggedIn: loggedIn}));" +
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

    private String buildLoginJs(String username, String password) {
        return "(function(){" +
            "try {" +
            "  LayanBridge.onLog('Starting Layan login sequence');" +
            "  // Step 1: Select Arabic language if language selector exists" +
            "  var langBtn = document.querySelector('a[href*=\"lang=ar\"], button:contains(\"\\u0639\\u0631\\u0628\\u064a\"), [data-lang=\"ar\"]');" +
            "  if (langBtn) { langBtn.click(); LayanBridge.onLog('Selected Arabic'); }" +
            "  // Step 2: Click login/sign-in button" +
            "  var loginLink = document.querySelector('a[href*=\"login\"], a[href*=\"Login\"], button:contains(\"\\u062f\\u062e\\u0648\\u0644\"), a:contains(\"\\u062f\\u062e\\u0648\\u0644\"), a:contains(\"Login\"), a:contains(\"login\"));" +
            "  if (loginLink) { loginLink.click(); LayanBridge.onLog('Clicked login link'); }" +
            "  else { LayanBridge.onLog('No login link found, might already on login page'); }" +
            "  // Step 3: Wait and fill credentials" +
            "  setTimeout(function() {" +
            "    var inputs = document.querySelectorAll('input');" +
            "    LayanBridge.onLog('Found ' + inputs.length + ' inputs');" +
            "    var userFilled = false, passFilled = false;" +
            "    for (var i = 0; i < inputs.length; i++) {" +
            "      var inp = inputs[i];" +
            "      var type = (inp.type || '').toLowerCase();" +
            "      var name = (inp.name || '').toLowerCase();" +
            "      var placeholder = (inp.placeholder || '').toLowerCase();" +
            "      if (type === 'email' || name.indexOf('email') >= 0 || name.indexOf('user') >= 0 || name.indexOf('name') >= 0 || placeholder.indexOf('user') >= 0 || placeholder.indexOf('email') >= 0 || placeholder.indexOf('\\u0627\\u0633\\u0645') >= 0) {" +
            "        setNativeValue(inp, '" + escapeJs(username) + "'); userFilled = true;" +
            "      } else if (type === 'password' || name.indexOf('pass') >= 0 || placeholder.indexOf('\\u0643\\u0644\\u0645\\u0629') >= 0 || placeholder.indexOf('password') >= 0) {" +
            "        setNativeValue(inp, '" + escapeJs(password) + "'); passFilled = true;" +
            "      }" +
            "    }" +
            "    LayanBridge.onLog('Filled: user=' + userFilled + ' pass=' + passFilled);" +
            "    // Step 4: Click the sign-in / register / submit button" +
            "    setTimeout(function() {" +
            "      var submitBtn = document.querySelector('button[type=\"submit\"], input[type=\"submit\"], button:contains(\"\\u062a\\u0633\\u062c\\u064a\\u0644\"), button:contains(\"\\u062f\\u062e\\u0648\\u0644\"), button:contains(\"Login\"), button:contains(\"login\"), button:contains(\"Sign in\"), button:contains(\"\\u062a\\u0623\\u0643\\u064a\\u062f\"');" +
            "      if (submitBtn) { submitBtn.click(); LayanBridge.onLog('Clicked submit button'); }" +
            "      else {" +
            "        var form = document.querySelector('form');" +
            "        if (form) { form.submit(); LayanBridge.onLog('Submitted form directly'); }" +
            "        else { LayanBridge.onLog('No submit button or form found'); }" +
            "      }" +
            "      // Step 5: Wait for WhatsApp confirmation dialog, click Continue" +
            "      setTimeout(function() {" +
            "        var continueBtn = document.querySelector('button:contains(\"Continue\"), button:contains(\"\\u0645\\u062a\\u0627\\u0628\\u0639\\u0629\"), button:contains(\"\\u062a\\u0623\\u0643\\u064a\\u062f\"), button:contains(\"OK\"), button:contains(\"\\u0645\\u0648\\u0627\\u0641\\u0642\"), a:contains(\"Continue\"), [role=\"button\"]');" +
            "        if (continueBtn) { continueBtn.click(); LayanBridge.onLog('Clicked continue/confirm for WhatsApp'); }" +
            "        else { LayanBridge.onLog('No continue button found (may not be needed)'); }" +
            "        LayanBridge.onResult(JSON.stringify({success: true, step: 'login_submitted', message: 'WhatsApp code sent'}));" +
            "      }, 2000);" +
            "    }, 1500);" +
            "  }, 2000);" +
            "  function setNativeValue(el, value) {" +
            "    var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;" +
            "    nativeInputValueSetter.call(el, value);" +
            "    el.dispatchEvent(new Event('input', {bubbles: true}));" +
            "    el.dispatchEvent(new Event('change', {bubbles: true}));" +
            "  }" +
            "} catch(e) { LayanBridge.onLog('Login error: ' + e.message); LayanBridge.onResult(JSON.stringify({success: false, error: e.message})); }" +
            "})()";
    }

    private String buildCollectLoginResultJs() {
        return "(function(){" +
            "  var bodyText = document.body ? document.body.innerText : '';" +
            "  var codeSent = bodyText.indexOf('\\u0643\\u0648\\u062f') >= 0 || bodyText.indexOf('code') >= 0 || bodyText.indexOf('verification') >= 0 || bodyText.indexOf('\\u062a\\u062d\\u0642\\u0642') >= 0;" +
            "  LayanBridge.onResult(JSON.stringify({success: codeSent, step: 'awaiting_code', message: codeSent ? 'Code sent via WhatsApp' : 'Unknown state', url: window.location.href}));" +
            "  return JSON.stringify({success: codeSent, step: 'awaiting_code'});" +
            "})()";
    }

    private String buildCodeValidationJs(String verificationCode) {
        return "(function(){" +
            "try {" +
            "  LayanBridge.onLog('Entering verification code');" +
            "  var inputs = document.querySelectorAll('input');" +
            "  var codeFilled = false;" +
            "  for (var i = 0; i < inputs.length; i++) {" +
            "    var inp = inputs[i];" +
            "    var type = (inp.type || '').toLowerCase();" +
            "    var name = (inp.name || '').toLowerCase();" +
            "    var placeholder = (inp.placeholder || '').toLowerCase();" +
            "    if (name.indexOf('code') >= 0 || name.indexOf('otp') >= 0 || name.indexOf('token') >= 0 || name.indexOf('verification') >= 0 || placeholder.indexOf('\\u0643\\u0648\\u062f') >= 0 || placeholder.indexOf('code') >= 0 || placeholder.indexOf('verification') >= 0 || type === 'tel' || type === 'number') {" +
            "      setNativeValue(inp, '" + escapeJs(verificationCode) + "'); codeFilled = true; break;" +
            "    }" +
            "  }" +
            "  if (!codeFilled && inputs.length > 0) {" +
            "    setNativeValue(inputs[0], '" + escapeJs(verificationCode) + "'); codeFilled = true;" +
            "  }" +
            "  LayanBridge.onLog('Code filled: ' + codeFilled);" +
            "  // Click code validation button" +
            "  setTimeout(function() {" +
            "    var validateBtn = document.querySelector('button:contains(\"code validati\"), button:contains(\"Code Validati\"), button:contains(\"\\u062a\\u062d\\u0642\\u0642\"), button:contains(\"\\u062a\\u0623\\u0643\\u064a\\u062f\"), button[type=\"submit\"], button:contains(\"OK\"), button:contains(\"\\u0645\\u0648\\u0627\\u0641\\u0642\"));" +
            "    if (validateBtn) { validateBtn.click(); LayanBridge.onLog('Clicked code validation button'); }" +
            "    else { LayanBridge.onLog('No validation button found'); }" +
            "  }, 1000);" +
            "  function setNativeValue(el, value) {" +
            "    var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;" +
            "    nativeInputValueSetter.call(el, value);" +
            "    el.dispatchEvent(new Event('input', {bubbles: true}));" +
            "    el.dispatchEvent(new Event('change', {bubbles: true}));" +
            "  }" +
            "} catch(e) { LayanBridge.onLog('Code validation error: ' + e.message); }" +
            "})()";
    }

    private String buildSearchJs(String phoneNumber) {
        return "(function(){" +
            "try {" +
            "  LayanBridge.onLog('Searching for phone: " + escapeJs(phoneNumber) + "');" +
            "  var searchInput = null;" +
            "  var inputs = document.querySelectorAll('input');" +
            "  for (var i = 0; i < inputs.length; i++) {" +
            "    var inp = inputs[i];" +
            "    var type = (inp.type || '').toLowerCase();" +
            "    var placeholder = inp.placeholder || '';" +
            "    if (type === 'search' || placeholder.indexOf('\\u0628\\u062d\\u062b') >= 0 || placeholder.indexOf('search') >= 0 || placeholder.indexOf('\\u0631\\u0642\\u0645') >= 0 || placeholder.indexOf('number') >= 0 || placeholder.indexOf('phone') >= 0) {" +
            "      searchInput = inp; break;" +
            "    }" +
            "  }" +
            "  if (!searchInput) {" +
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
            "    LayanBridge.onLog('Filled search with phone number');" +
            "    setTimeout(function() {" +
            "      searchInput.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true}));" +
            "      searchInput.dispatchEvent(new KeyboardEvent('keypress', {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true}));" +
            "      searchInput.dispatchEvent(new KeyboardEvent('keyup', {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true}));" +
            "      var searchBtn = document.querySelector('button[type=\"submit\"], button:contains(\"\\u0628\\u062d\\u062b\"), button:contains(\"Search\"), [role=\"search\"] button');" +
            "      if (searchBtn) searchBtn.click();" +
            "      LayanBridge.onLog('Triggered search');" +
            "      // Wait for dropdown results, click the first matching item" +
            "      setTimeout(function() {" +
            "        var dropdownItems = document.querySelectorAll('.dropdown-item, .autocomplete-item, [role=\"option\"], li[class*=\"result\"], ul li a');" +
            "        if (dropdownItems.length > 0) {" +
            "          dropdownItems[0].click();" +
            "          LayanBridge.onLog('Selected first dropdown item');" +
            "        } else {" +
            "          LayanBridge.onLog('No dropdown items found, continuing');" +
            "        }" +
            "      }, 1500);" +
            "    }, 500);" +
            "  } else {" +
            "    LayanBridge.onLog('No search input found');" +
            "    LayanBridge.onResult(JSON.stringify({success: false, error: 'no_search_input'}));" +
            "  }" +
            "} catch(e) { LayanBridge.onLog('Search error: ' + e.message); }" +
            "})()";
    }

    private String buildRechargeJs(String packageType, String durationKey) {
        // packageType: "normal" = حزمة عادية, "offer" = حزمة بعرض
        return "(function(){" +
            "try {" +
            "  LayanBridge.onLog('Starting recharge, packageType=" + escapeJs(packageType) + "');" +
            "  // Click \\u062a\\u0645\\u062f\\u064a\\u062f \\u0627\\u0644\\u0631\\u0642\\u0645 (extend number)" +
            "  var extendBtn = null;" +
            "  var btns = document.querySelectorAll('button, a, [role=\"button\"]');" +
            "  for (var j = 0; j < btns.length; j++) {" +
            "    var txt = (btns[j].textContent || '').trim();" +
            "    if (txt.indexOf('\\u062a\\u0645\\u062f\\u064a\\u062f') >= 0 || txt.toLowerCase().indexOf('extend') >= 0 || txt.toLowerCase().indexOf('renew') >= 0 || txt.toLowerCase().indexOf('recharge') >= 0) {" +
            "      extendBtn = btns[j]; break;" +
            "    }" +
            "  }" +
            "  if (extendBtn) {" +
            "    extendBtn.click();" +
            "    LayanBridge.onLog('Clicked extend/renew button');" +
            "  } else {" +
            "    LayanBridge.onLog('No extend button found');" +
            "  }" +
            "  // Wait then select package type" +
            "  setTimeout(function() {" +
            "    if ('" + escapeJs(packageType) + "' === 'offer') {" +
            "      // Click \\u062a\\u0645\\u062f\\u064a\\u062f \\u0644\\u062d\\u0632\\u0645\\u0629 \\u0628\\u0639\\u0631\\u0636 (offer package)" +
            "      var offerBtn = null;" +
            "      var allBtns = document.querySelectorAll('button, a, [role=\"button\"], label, input[type=\"radio\"]');" +
            "      for (var k = 0; k < allBtns.length; k++) {" +
            "        var t = (allBtns[k].textContent || allBtns[k].value || '').trim();" +
            "        if (t.indexOf('\\u0639\\u0631\\u0636') >= 0 || t.toLowerCase().indexOf('offer') >= 0) {" +
            "          allBtns[k].click();" +
            "          offerBtn = allBtns[k]; break;" +
            "        }" +
            "      }" +
            "      LayanBridge.onLog('Selected offer package: ' + (offerBtn != null));" +
            "    } else {" +
            "      // Click \\u062a\\u0645\\u062f\\u064a\\u062f \\u0644\\u062d\\u0632\\u0645\\u0629 \\u0639\\u0627\\u062f\\u064a\\u0629 (normal package)" +
            "      var normalBtn = null;" +
            "      var allBtns2 = document.querySelectorAll('button, a, [role=\"button\"], label, input[type=\"radio\"]');" +
            "      for (var k = 0; k < allBtns2.length; k++) {" +
            "        var t = (allBtns2[k].textContent || allBtns2[k].value || '').trim();" +
            "        if (t.indexOf('\\u0639\\u0627\\u062f\\u064a') >= 0 || t.toLowerCase().indexOf('normal') >= 0 || t.toLowerCase().indexOf('standard') >= 0 || t.toLowerCase().indexOf('regular') >= 0) {" +
            "          allBtns2[k].click();" +
            "          normalBtn = allBtns2[k]; break;" +
            "        }" +
            "      }" +
            "      LayanBridge.onLog('Selected normal package: ' + (normalBtn != null));" +
            "    }" +
            "    // Select duration from dropdown" +
            "    setTimeout(function() {" +
            "      var selects = document.querySelectorAll('select');" +
            "      if (selects.length > 0) {" +
            "        var sel = selects[selects.length - 1];" +
            "        var found = false;" +
            "        for (var m = 0; m < sel.options.length; m++) {" +
            "          var optText = (sel.options[m].text || '').trim();" +
            "          var optVal = (sel.options[m].value || '').trim();" +
            "          if (optText.indexOf('" + escapeJs(durationKey) + "') >= 0 || optVal.indexOf('" + escapeJs(durationKey) + "') >= 0) {" +
            "            sel.selectedIndex = m;" +
            "            sel.dispatchEvent(new Event('change', {bubbles: true}));" +
            "            found = true;" +
            "            LayanBridge.onLog('Selected duration: ' + optText);" +
            "            break;" +
            "          }" +
            "        }" +
            "        if (!found && sel.options.length > 1) {" +
            "          sel.selectedIndex = 1;" +
            "          sel.dispatchEvent(new Event('change', {bubbles: true}));" +
            "          LayanBridge.onLog('Duration not found, selected first non-empty option');" +
            "        }" +
            "      }" +
            "      LayanBridge.onLog('Recharge steps done');" +
            "    }, 1500);" +
            "  }, 1500);" +
            "} catch(e) { LayanBridge.onLog('Recharge error: ' + e.message); }" +
            "})()";
    }

    private String buildConfirmJs() {
        return "(function(){" +
            "try {" +
            "  // Click \\u0627\\u0644\\u062a\\u0627\\u0644\\u064a (Next)" +
            "  var nextBtn = null;" +
            "  var btns = document.querySelectorAll('button, a, [role=\"button\"]');" +
            "  for (var i = 0; i < btns.length; i++) {" +
            "    var txt = (btns[i].textContent || '').trim();" +
            "    if (txt.indexOf('\\u0627\\u0644\\u062a\\u0627\\u0644\\u064a') >= 0 || txt.indexOf('\\u062a\\u0627\\u0644\\u064a') >= 0 || txt.toLowerCase().indexOf('next') >= 0) {" +
            "      nextBtn = btns[i]; break;" +
            "    }" +
            "  }" +
            "  if (nextBtn) {" +
            "    nextBtn.click();" +
            "    LayanBridge.onLog('Clicked Next button');" +
            "  } else {" +
            "    LayanBridge.onLog('No Next button found');" +
            "  }" +
            "  // Click \\u0645\\u0648\\u0627\\u0641\\u0642 (OK/Confirm)" +
            "  setTimeout(function() {" +
            "    var okBtn = null;" +
            "    var allBtns = document.querySelectorAll('button, a, [role=\"button\"]');" +
            "    for (var j = 0; j < allBtns.length; j++) {" +
            "      var t = (allBtns[j].textContent || '').trim();" +
            "      if (t.indexOf('\\u0645\\u0648\\u0627\\u0641\\u0642') >= 0 || t.indexOf('\\u062a\\u0623\\u0643\\u064a\\u062f') >= 0 || t.toLowerCase().indexOf('ok') >= 0 || t.toLowerCase().indexOf('confirm') >= 0) {" +
            "        if (allBtns[j] !== nextBtn) { okBtn = allBtns[j]; break; }" +
            "      }" +
            "    }" +
            "    if (okBtn) {" +
            "      okBtn.click();" +
            "      LayanBridge.onLog('Clicked OK/Confirm button');" +
            "    } else {" +
            "      LayanBridge.onLog('No OK button found');" +
            "    }" +
            "    LayanBridge.onResult(JSON.stringify({success: okBtn != null, step: 'completed'}));" +
            "  }, 1500);" +
            "} catch(e) { LayanBridge.onLog('Confirm error: ' + e.message); LayanBridge.onResult(JSON.stringify({success: false, error: e.message})); }" +
            "})()";
    }

    private String buildCollectResultJs() {
        return "(function(){" +
            "  var bodyText = document.body ? document.body.innerText : '';" +
            "  var success = bodyText.indexOf('\\u062a\\u0645') >= 0 && (bodyText.indexOf('\\u062a\\u0645\\u062f\\u064a\\u062f') >= 0 || bodyText.indexOf('\\u0634\\u062d\\u0646') >= 0) || bodyText.indexOf('\\u0646\\u062c\\u0627\\u062d') >= 0 || bodyText.toLowerCase().indexOf('success') >= 0;" +
            "  var error = bodyText.indexOf('\\u062e\\u0637\\u0623') >= 0 || bodyText.indexOf('\\u0641\\u0634\\u0644') >= 0 || bodyText.toLowerCase().indexOf('error') >= 0;" +
            "  LayanBridge.onResult(JSON.stringify({success: success, error: error ? bodyText.substring(0, 500) : null, url: window.location.href}));" +
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

    private WritableMap parseSimpleJson(String json) {
        WritableNativeMap map = new WritableNativeMap();
        if (json == null || json.isEmpty()) {
            map.putBoolean("success", false);
            map.putString("error", "empty_result");
            return map;
        }
        if (json.startsWith("\"") && json.endsWith("\"")) {
            json = json.substring(1, json.length() - 1);
            json = json.replace("\\\"", "\"").replace("\\\\", "\\");
        }
        String inner = json.trim();
        if (inner.startsWith("{")) inner = inner.substring(1);
        if (inner.endsWith("}")) inner = inner.substring(0, inner.length() - 1);

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
