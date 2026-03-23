package com.dierchat.app;

import android.os.Build;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

/**
 * WebRTC / звук звонка: без этого WebView может требовать жест перед воспроизведением медиа.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onStart() {
        super.onStart();
        applyWebMediaSettings();
    }

    @Override
    public void onResume() {
        super.onResume();
        applyWebMediaSettings();
    }

    private void applyWebMediaSettings() {
        try {
            Bridge bridge = getBridge();
            if (bridge == null) return;
            WebView wv = bridge.getWebView();
            if (wv == null) return;
            WebSettings s = wv.getSettings();
            s.setMediaPlaybackRequiresUserGesture(false);
            /* Встроенный браузер (iframe): логины/виджеты на сторонних доменах */
            s.setDomStorageEnabled(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true);
            }
        } catch (Throwable ignored) {
        }
    }
}
