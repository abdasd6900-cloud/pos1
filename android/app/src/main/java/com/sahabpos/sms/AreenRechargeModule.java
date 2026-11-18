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

public class AreenRechargeModule extends ReactContextBaseJavaModule {

    private static final String TAG = "AreenRechargeModule";
    private static final String AREEN_URL = "https://agents.areen.net/AreenWeb.dll";

    private final ReactApplicationContext reactContext;
    private WebView webView;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final AtomicReference<String> pendingResult = new AtomicReference<>(null);

    public AreenRechargeModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @NonNull
    @Override
    public String getName() {
        return "AreenRecharge";
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

            webView.addJavascriptInterface(new AreenJsBridge(), "AreenBridge");
            webView.setWebViewClient(new AreenWebViewClient());
            webView.setWebChromeClient(new WebChromeClient());
        });
    }

    private class AreenWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return false;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            Log.d(TAG, "Page loaded: " + url);
        }
    }

    private class AreenJsBridge {
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

    // ---- Phase 1: Login (triggers SMS verification code) ----

    /**
     * Phase 1: Load portal, enter username + password, click submit.
     * This triggers an SMS verification code to be sent to the registered phone.
     * The caller must then obtain the code from SMS and call executeRechargeWithCode().
     */
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

        final String url = (portalUrl != null && !portalUrl.isEmpty()) ? portalUrl : AREEN_URL;

        mainHandler.post(() -> {
            pendingResult.set(null);
            webView.loadUrl(url);

            mainHandler.postDelayed(() -> {
                String loginJs = buildLoginJs(username, password);
                webView.evaluateJavascript(loginJs, null);

                mainHandler.postDelayed(() -> {
                    String collectJs = buildLoginResultJs();
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
                }, loginDelay > 0 ? loginDelay : 6000);
            }, pageLoadDelay > 0 ? pageLoadDelay : 4000);
        });
    }

    // ---- Phase 2: Submit SMS code + recharge ----

    /**
     * Phase 2: Enter SMS verification code, then perform the full recharge sequence:
     * 1. Enter verification code and submit
     * 2. Enter subscription number in search field
     * 3. Click search
     * 4. Find route number (المسار) in subscription details
     * 5. Enter route number in recharge amount field
     * 6. Click charge (اشحن)
     */
    @ReactMethod
    public void executeRechargeWithCode(
            final String verificationCode,
            final String subscriptionNumber,
            final int rechargeDelay,
            final Promise promise
    ) {
        ensureWebView();

        mainHandler.post(() -> {
            pendingResult.set(null);

            // Step 1: Enter verification code
            String codeJs = buildCodeSubmitJs(verificationCode);
            webView.evaluateJavascript(codeJs, null);

            // Step 2: After code submitted, proceed with recharge
            mainHandler.postDelayed(() -> {
                String rechargeJs = buildRechargeJs(subscriptionNumber);
                webView.evaluateJavascript(rechargeJs, null);

                // Step 3: Collect result
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
                }, rechargeDelay > 0 ? rechargeDelay : 10000);
            }, 5000);
        });
    }

    @ReactMethod
    public void checkSession(final Promise promise) {
        ensureWebView();
        mainHandler.post(() -> {
            webView.loadUrl(AREEN_URL);
            mainHandler.postDelayed(() -> {
                String checkJs = "(function(){" +
                    "var hasLoginBtn = !!document.querySelector('input[type=\"password\"], input[name*=\"pass\"], input[name*=\"user\"]');" +
                    "var loggedIn = !hasLoginBtn;" +
                    "AreenBridge.onResult(JSON.stringify({loggedIn: loggedIn}));" +
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
            "  AreenBridge.onLog('Starting Areen login');" +
            "  function setNativeValue(el, value) {" +
            "    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;" +
            "    setter.call(el, value);" +
            "    el.dispatchEvent(new Event('input', {bubbles: true}));" +
            "    el.dispatchEvent(new Event('change', {bubbles: true}));" +
            "  }" +
            "  var inputs = document.querySelectorAll('input');" +
            "  AreenBridge.onLog('Found ' + inputs.length + ' inputs');" +
            "  var userFilled = false, passFilled = false;" +
            "  for (var i = 0; i < inputs.length; i++) {" +
            "    var inp = inputs[i];" +
            "    var type = (inp.type || '').toLowerCase();" +
            "    var name = (inp.name || '').toLowerCase();" +
            "    var placeholder = (inp.placeholder || '').toLowerCase();" +
            "    if (type === 'password' || name.indexOf('pass') >= 0) {" +
            "      setNativeValue(inp, '" + escapeJs(password) + "'); passFilled = true;" +
            "    } else if (type === 'text' || type === 'email' || name.indexOf('user') >= 0 || name.indexOf('name') >= 0 || name.indexOf('login') >= 0 || placeholder.indexOf('user') >= 0) {" +
            "      setNativeValue(inp, '" + escapeJs(username) + "'); userFilled = true;" +
            "    }" +
            "  }" +
            "  AreenBridge.onLog('Filled: user=' + userFilled + ' pass=' + passFilled);" +
            "  setTimeout(function() {" +
            "    var submitBtn = (function(){var el=document.querySelector('button[type=\"submit\"], input[type=\"submit\"]');if(el)return el;var bs=document.querySelectorAll('button, a');var ts=['' + '\\u062d' + '\\u062e' + '\\u0648' + '\\u0644','Login','login'];for(var i=0;i<bs.length;i++){var t=(bs[i].textContent||'').trim();for(var j=0;j<ts.length;j++){if(t.indexOf(ts[j])>=0)return bs[i];}}return null;})();" +
            "    if (submitBtn) { submitBtn.click(); AreenBridge.onLog('Clicked submit'); }" +
            "    else {" +
            "      var form = document.querySelector('form');" +
            "      if (form) { form.submit(); AreenBridge.onLog('Submitted form'); }" +
            "      else { AreenBridge.onLog('No submit found'); }" +
            "    }" +
            "  }, 1000);" +
            "} catch(e) { AreenBridge.onLog('Login error: ' + e.message); }" +
            "})()";
    }

    private String buildLoginResultJs() {
        return "(function(){" +
            "  var bodyText = document.body ? document.body.innerText : '';" +
            "  var hasCodeField = false;" +
            "  var inputs = document.querySelectorAll('input');" +
            "  for (var i = 0; i < inputs.length; i++) {" +
            "    var ph = (inputs[i].placeholder || '').toLowerCase();" +
            "    var nm = (inputs[i].name || '').toLowerCase();" +
            "    if (ph.indexOf('code') >= 0 || ph.indexOf('verification') >= 0 || nm.indexOf('code') >= 0 || nm.indexOf('otp') >= 0 ||" +
            "        ph.indexOf('" + unicodeStr("رمز") + "') >= 0 || ph.indexOf('" + unicodeStr("كود") + "') >= 0 || ph.indexOf('" + unicodeStr("تحقق") + "') >= 0) {" +
            "      hasCodeField = true; break;" +
            "    }" +
            "  }" +
            "  var smsPrompt = bodyText.indexOf('" + unicodeStr("رمز") + "') >= 0 || bodyText.indexOf('" + unicodeStr("كود") + "') >= 0 ||" +
            "    bodyText.indexOf('" + unicodeStr("تحقق") + "') >= 0 || bodyText.toLowerCase().indexOf('verification') >= 0 ||" +
            "    bodyText.toLowerCase().indexOf('code') >= 0;" +
            "  var success = hasCodeField || smsPrompt;" +
            "  AreenBridge.onResult(JSON.stringify({success: success, step: 'login_done', message: success ? 'SMS code sent' : 'No code prompt detected', url: window.location.href}));" +
            "  return JSON.stringify({success: success, step: 'login_done', message: success ? 'SMS code sent' : 'No code prompt detected', url: window.location.href});" +
            "})()";
    }

    private String buildCodeSubmitJs(String verificationCode) {
        return "(function(){" +
            "try {" +
            "  AreenBridge.onLog('Entering Areen SMS verification code');" +
            "  function setNativeValue(el, value) {" +
            "    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;" +
            "    setter.call(el, value);" +
            "    el.dispatchEvent(new Event('input', {bubbles: true}));" +
            "    el.dispatchEvent(new Event('change', {bubbles: true}));" +
            "  }" +
            "  var codeInput = null;" +
            "  var inputs = document.querySelectorAll('input');" +
            "  for (var i = 0; i < inputs.length; i++) {" +
            "    var inp = inputs[i];" +
            "    var type = (inp.type || '').toLowerCase();" +
            "    var ph = (inp.placeholder || '').toLowerCase();" +
            "    var nm = (inp.name || '').toLowerCase();" +
            "    if (type === 'text' || type === 'tel' || type === 'number' || type === 'password') {" +
            "      if (ph.indexOf('code') >= 0 || ph.indexOf('verification') >= 0 || ph.indexOf('otp') >= 0 ||" +
            "          nm.indexOf('code') >= 0 || nm.indexOf('otp') >= 0 || nm.indexOf('verif') >= 0 ||" +
            "          ph.indexOf('" + unicodeStr("رمز") + "') >= 0 || ph.indexOf('" + unicodeStr("كود") + "') >= 0 || ph.indexOf('" + unicodeStr("تحقق") + "') >= 0) {" +
            "        codeInput = inp; break;" +
            "      }" +
            "    }" +
            "  }" +
            "  if (!codeInput) {" +
            "    for (var i = 0; i < inputs.length; i++) {" +
            "      var t = (inputs[i].type || '').toLowerCase();" +
            "      if (t === 'text' || t === 'tel' || t === 'number') {" +
            "        var ph2 = (inputs[i].placeholder || '').toLowerCase();" +
            "        var nm2 = (inputs[i].name || '').toLowerCase();" +
            "        if (ph2.indexOf('user') < 0 && ph2.indexOf('pass') < 0 && nm2.indexOf('user') < 0 && nm2.indexOf('pass') < 0) {" +
            "          codeInput = inputs[i]; break;" +
            "        }" +
            "      }" +
            "    }" +
            "  }" +
            "  if (codeInput) {" +
            "    setNativeValue(codeInput, '" + escapeJs(verificationCode) + "');" +
            "    AreenBridge.onLog('Filled verification code');" +
            "    setTimeout(function() {" +
            "      var submitBtn = null;" +
            "      var btns = document.querySelectorAll('button, a, [role=\"button\"], input[type=\"submit\"], input[type=\"button\"]');" +
            "      for (var j = 0; j < btns.length; j++) {" +
            "        var txt = (btns[j].textContent || btns[j].value || '').trim();" +
            "        if (txt.indexOf('" + unicodeStr("تأكيد") + "') >= 0 || txt.indexOf('" + unicodeStr("تحقق") + "') >= 0 ||" +
            "            txt.indexOf('" + unicodeStr("دخول") + "') >= 0 || txt.indexOf('" + unicodeStr("موافق") + "') >= 0 ||" +
            "            txt.toLowerCase().indexOf('verify') >= 0 || txt.toLowerCase().indexOf('confirm') >= 0 ||" +
            "            txt.toLowerCase().indexOf('submit') >= 0 || txt.toLowerCase().indexOf('ok') >= 0) {" +
            "          submitBtn = btns[j]; break;" +
            "        }" +
            "      }" +
            "      if (submitBtn) { submitBtn.click(); AreenBridge.onLog('Clicked verify button'); }" +
            "      else {" +
            "        var form = document.querySelector('form');" +
            "        if (form) { form.submit(); AreenBridge.onLog('Submitted form for code'); }" +
            "        else { codeInput.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true}));" +
            "          codeInput.dispatchEvent(new KeyboardEvent('keypress', {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true}));" +
            "          codeInput.dispatchEvent(new KeyboardEvent('keyup', {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true}));" +
            "          AreenBridge.onLog('Triggered Enter for code'); }" +
            "      }" +
            "    }, 1000);" +
            "  } else {" +
            "    AreenBridge.onLog('No code input found');" +
            "    AreenBridge.onResult(JSON.stringify({success: false, error: 'no_code_input'}));" +
            "  }" +
            "} catch(e) { AreenBridge.onLog('Code submit error: ' + e.message); }" +
            "})()";
    }

    private String buildRechargeJs(String subscriptionNumber) {
        return "(function(){" +
            "try {" +
            "  AreenBridge.onLog('Starting Areen recharge for " + escapeJs(subscriptionNumber) + "');" +
            "  function setNativeValue(el, value) {" +
            "    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;" +
            "    setter.call(el, value);" +
            "    el.dispatchEvent(new Event('input', {bubbles: true}));" +
            "    el.dispatchEvent(new Event('change', {bubbles: true}));" +
            "  }" +
            "  var searchInput = null;" +
            "  var inputs = document.querySelectorAll('input');" +
            "  for (var i = 0; i < inputs.length; i++) {" +
            "    var inp = inputs[i];" +
            "    var type = (inp.type || '').toLowerCase();" +
            "    var ph = (inp.placeholder || '');" +
            "    var name = (inp.name || '').toLowerCase();" +
            "    if (type === 'search' || type === 'text' || type === 'tel' || type === 'number' ||" +
            "        ph.indexOf('" + unicodeStr("رقم الاشتراك") + "') >= 0 || ph.indexOf('search') >= 0 ||" +
            "        ph.indexOf('" + unicodeStr("بحث") + "') >= 0 || ph.indexOf('number') >= 0 ||" +
            "        ph.indexOf('subscription') >= 0 || name.indexOf('sub') >= 0 || name.indexOf('search') >= 0 || name.indexOf('number') >= 0) {" +
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
            "    setNativeValue(searchInput, '" + escapeJs(subscriptionNumber) + "');" +
            "    AreenBridge.onLog('Filled subscription number');" +
            "    setTimeout(function() {" +
            "      var searchBtn = null;" +
            "      var btns = document.querySelectorAll('button, a, [role=\"button\"], input[type=\"submit\"], input[type=\"button\"]');" +
            "      for (var j = 0; j < btns.length; j++) {" +
            "        var txt = (btns[j].textContent || btns[j].value || '').trim();" +
            "        if (txt.indexOf('" + unicodeStr("بحث") + "') >= 0 || txt.toLowerCase().indexOf('search') >= 0) {" +
            "          searchBtn = btns[j]; break;" +
            "        }" +
            "      }" +
            "      searchInput.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true}));" +
            "      searchInput.dispatchEvent(new KeyboardEvent('keypress', {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true}));" +
            "      searchInput.dispatchEvent(new KeyboardEvent('keyup', {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true}));" +
            "      if (searchBtn) { searchBtn.click(); AreenBridge.onLog('Clicked search button'); }" +
            "      else { AreenBridge.onLog('Triggered Enter for search'); }" +
            "      setTimeout(function() {" +
            "        var bodyText = document.body ? document.body.innerText : '';" +
            "        AreenBridge.onLog('Page text length: ' + bodyText.length);" +
            "        var routeNumber = null;" +
            "        var allElements = document.querySelectorAll('td, th, span, label, div, dt, dd');" +
            "        for (var k = 0; k < allElements.length; k++) {" +
            "          var elText = (allElements[k].textContent || '').trim();" +
            "          if (elText.indexOf('" + unicodeStr("المسار") + "') >= 0) {" +
            "            var sibling = allElements[k].nextElementSibling;" +
            "            if (sibling) {" +
            "              var sibText = (sibling.textContent || '').trim();" +
            "              var match = sibText.match(/\\d{1,3}/);" +
            "              if (match) { routeNumber = match[0]; break; }" +
            "            }" +
            "            var parent = allElements[k].parentElement;" +
            "            if (parent) {" +
            "              var parentNext = parent.nextElementSibling;" +
            "              if (parentNext) {" +
            "                var pnText = (parentNext.textContent || '').trim();" +
            "                var match2 = pnText.match(/\\d{1,3}/);" +
            "                if (match2) { routeNumber = match2[0]; break; }" +
            "              }" +
            "            }" +
            "          }" +
            "        }" +
            "        if (!routeNumber) {" +
            "          var routePattern = /" + unicodeStrRegex("المسار") + "[\\s:\\\\/]*?(\\d{1,3})/;" +
            "          var routeMatch = bodyText.match(routePattern);" +
            "          if (routeMatch) routeNumber = routeMatch[1];" +
            "        }" +
            "        if (!routeNumber) {" +
            "          var twoDigitMatch = bodyText.match(/\\b(\\d{2})\\b/g);" +
            "          if (twoDigitMatch) {" +
            "            for (var m = 0; m < twoDigitMatch.length; m++) {" +
            "              if (twoDigitMatch[m] === '44') { routeNumber = '44'; break; }" +
            "            }" +
            "            if (!routeNumber) routeNumber = twoDigitMatch[0];" +
            "          }" +
            "        }" +
            "        AreenBridge.onLog('Route number found: ' + routeNumber);" +
            "        if (!routeNumber) {" +
            "          AreenBridge.onResult(JSON.stringify({success: false, error: 'no_route_number'}));" +
            "          return;" +
            "        }" +
            "        var amountInput = null;" +
            "        var allInputs = document.querySelectorAll('input');" +
            "        for (var n = 0; n < allInputs.length; n++) {" +
            "          var inp2 = allInputs[n];" +
            "          var type2 = (inp2.type || '').toLowerCase();" +
            "          var ph2 = (inp2.placeholder || '');" +
            "          var name2 = (inp2.name || '').toLowerCase();" +
            "          if (type2 === 'number' || type2 === 'tel' ||" +
            "              ph2.indexOf('" + unicodeStr("مبلغ الشحن") + "') >= 0 || ph2.indexOf('amount') >= 0 ||" +
            "              ph2.indexOf('recharge') >= 0 || ph2.indexOf('charge') >= 0 ||" +
            "              name2.indexOf('amount') >= 0 || name2.indexOf('charge') >= 0 || name2.indexOf('recharge') >= 0) {" +
            "            amountInput = inp2; break;" +
            "          }" +
            "        }" +
            "        if (!amountInput) {" +
            "          for (var n = allInputs.length - 1; n >= 0; n--) {" +
            "            var t2 = (allInputs[n].type || '').toLowerCase();" +
            "            if ((t2 === 'text' || t2 === 'number' || t2 === 'tel') && allInputs[n] !== searchInput) {" +
            "              amountInput = allInputs[n]; break;" +
            "            }" +
            "          }" +
            "        }" +
            "        if (amountInput) {" +
            "          setNativeValue(amountInput, routeNumber);" +
            "          AreenBridge.onLog('Filled recharge amount with route number: ' + routeNumber);" +
            "          setTimeout(function() {" +
            "            var chargeBtn = null;" +
            "            var allBtns = document.querySelectorAll('button, a, [role=\"button\"], input[type=\"submit\"], input[type=\"button\"]');" +
            "            for (var p = 0; p < allBtns.length; p++) {" +
            "              var btnText = (allBtns[p].textContent || allBtns[p].value || '').trim();" +
            "              if (btnText.indexOf('" + unicodeStr("اشحن") + "') >= 0 || btnText.indexOf('" + unicodeStr("شحن") + "') >= 0 ||" +
            "                  btnText.toLowerCase().indexOf('charge') >= 0 || btnText.toLowerCase().indexOf('recharge') >= 0) {" +
            "                chargeBtn = allBtns[p]; break;" +
            "              }" +
            "            }" +
            "            if (chargeBtn) {" +
            "              chargeBtn.click();" +
            "              AreenBridge.onLog('Clicked charge button');" +
            "              setTimeout(function() {" +
            "                var confirmBtn = null;" +
            "                var confirmBtns = document.querySelectorAll('button, [role=\"button\"]');" +
            "                for (var q = 0; q < confirmBtns.length; q++) {" +
            "                  var ct = (confirmBtns[q].textContent || '').trim();" +
            "                  if (ct.indexOf('" + unicodeStr("تأكيد") + "') >= 0 || ct.indexOf('" + unicodeStr("موافق") + "') >= 0 ||" +
            "                      ct.indexOf('" + unicodeStr("نعم") + "') >= 0 || ct.toLowerCase().indexOf('confirm') >= 0 ||" +
            "                      ct.toLowerCase().indexOf('ok') >= 0 || ct.toLowerCase().indexOf('yes') >= 0) {" +
            "                    confirmBtn = confirmBtns[q]; break;" +
            "                  }" +
            "                }" +
            "                if (confirmBtn) {" +
            "                  confirmBtn.click();" +
            "                  AreenBridge.onLog('Clicked confirm button');" +
            "                } else {" +
            "                  AreenBridge.onLog('No confirm button needed');" +
            "                }" +
            "                AreenBridge.onResult(JSON.stringify({success: true, step: 'completed', routeNumber: routeNumber}));" +
            "              }, 2000);" +
            "            } else {" +
            "              AreenBridge.onLog('No charge button found');" +
            "              AreenBridge.onResult(JSON.stringify({success: false, error: 'no_charge_button', routeNumber: routeNumber}));" +
            "            }" +
            "          }, 1500);" +
            "        } else {" +
            "          AreenBridge.onLog('No amount input found');" +
            "          AreenBridge.onResult(JSON.stringify({success: false, error: 'no_amount_input', routeNumber: routeNumber}));" +
            "        }" +
            "      }, 4000);" +
            "    }, 500);" +
            "  } else {" +
            "    AreenBridge.onLog('No search input found');" +
            "    AreenBridge.onResult(JSON.stringify({success: false, error: 'no_search_input'}));" +
            "  }" +
            "} catch(e) {" +
            "  AreenBridge.onLog('Recharge error: ' + e.message);" +
            "  AreenBridge.onResult(JSON.stringify({success: false, error: e.message}));" +
            "}" +
            "})()";
    }

    private String buildCollectResultJs() {
        return "(function(){" +
            "  var bodyText = document.body ? document.body.innerText : '';" +
            "  var success = bodyText.indexOf('" + unicodeStr("تم") + " " + unicodeStr("شحن") + "') >= 0 ||" +
            "    bodyText.indexOf('" + unicodeStr("نجاح") + "') >= 0 ||" +
            "    bodyText.indexOf('" + unicodeStr("تمت") + "') >= 0 ||" +
            "    bodyText.toLowerCase().indexOf('success') >= 0;" +
            "  var error = bodyText.indexOf('" + unicodeStr("خطأ") + "') >= 0 ||" +
            "    bodyText.indexOf('" + unicodeStr("فشل") + "') >= 0 ||" +
            "    bodyText.toLowerCase().indexOf('error') >= 0;" +
            "  AreenBridge.onResult(JSON.stringify({success: success, error: error ? bodyText.substring(0, 500) : null, url: window.location.href}));" +
            "  return JSON.stringify({success: success, error: error ? bodyText.substring(0, 500) : null, url: window.location.href});" +
            "})()";
    }

    private String unicodeStr(String arabic) {
        StringBuilder sb = new StringBuilder();
        for (char c : arabic.toCharArray()) {
            sb.append("\\u").append(String.format("%04x", (int) c));
        }
        return sb.toString();
    }

    private String unicodeStrRegex(String arabic) {
        StringBuilder sb = new StringBuilder();
        for (char c : arabic.toCharArray()) {
            sb.append("\\u").append(String.format("%04x", (int) c));
        }
        return sb.toString();
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
