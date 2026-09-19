package com.yeen.client;

import android.app.UiModeManager;
import android.content.Context;
import android.content.res.Configuration;
import android.os.Bundle;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;

public class MainActivity extends BridgeActivity {
    private static final String ANDROID_BACK_SCRIPT =
        "(() => { try { const handler = window.__yeenHandleAndroidBack; "
        + "return typeof handler === 'function' ? handler() === true : false; "
        + "} catch (_) { return false; } })()";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        if (isTelevision()) {
            config = new CapConfig.Builder(this)
                .setAndroidScheme("https")
                .setAllowMixedContent(true)
                .setAppendedUserAgentString("YeenTV/1.0 Android TV")
                .create();
        }
        super.onCreate(savedInstanceState);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                dispatchBackToWebApp();
            }
        });
    }

    private boolean isTelevision() {
        UiModeManager uiModeManager =
            (UiModeManager) getSystemService(Context.UI_MODE_SERVICE);
        return uiModeManager != null
            && uiModeManager.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION;
    }

    private void dispatchBackToWebApp() {
        if (bridge == null || bridge.getWebView() == null) {
            finishAfterTransition();
            return;
        }

        bridge.getWebView().evaluateJavascript(ANDROID_BACK_SCRIPT, result -> {
            if (!"true".equals(result)) {
                finishAfterTransition();
            }
        });
    }
}
