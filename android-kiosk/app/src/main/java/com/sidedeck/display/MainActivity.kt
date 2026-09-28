package com.sidedeck.display

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val reloadHandler = Handler(Looper.getMainLooper())
    private val dashboardUrl = "http://localhost:8080/"
    private val reloadDelayMs = 2000L

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        showOverLockScreen()
        setMaxBrightness()
        enableImmersiveMode()

        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            mediaPlaybackRequiresUserGesture = false
        }

        webView.addJavascriptInterface(HostBridge(), "SideDeckApp")

        webView.webViewClient = object : WebViewClient() {
            // A crashed renderer would otherwise leave a blank screen that
            // nobody can fix without touching the phone.
            override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
                recreate()
                return true
            }

            override fun onReceivedError(
                view: WebView?,
                errorCode: Int,
                description: String?,
                failingUrl: String?
            ) {
                scheduleReload()
            }
        }

        webView.loadUrl(dashboardUrl)
    }

    /** A phone mounted inside the PC has nobody to unlock it: show the panel
     *  over the lock screen and let the host's wake-up turn the screen on. */
    private fun showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }
    }

    /** Opened again by the PC (`am start`): make sure the screen is on. Some
     *  phones (MIUI) refuse the PC's simulated power key, so the app does it. */
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        wakeScreen()
    }

    private fun wakeScreen() {
        val power = getSystemService(POWER_SERVICE) as PowerManager
        if (power.isInteractive) return
        @Suppress("DEPRECATION")
        power.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "sidedeck:wake"
        ).acquire(3000)
    }

    private fun setMaxBrightness() {
        setBrightness(1.0f)
    }

    private fun setBrightness(value: Float) {
        val params = window.attributes
        params.screenBrightness = value
        window.attributes = params
    }

    /** Called by the panel page. While the PC is away (off, asleep, cable
     *  out) the screen is dimmed and allowed to turn off by itself; it comes
     *  back to full when data flows again. */
    inner class HostBridge {
        @JavascriptInterface
        fun setHostConnected(connected: Boolean) {
            runOnUiThread {
                if (connected) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    setBrightness(1.0f)
                    wakeScreen()
                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    setBrightness(0.05f)
                }
            }
        }
    }

    private fun scheduleReload() {
        reloadHandler.postDelayed({
            webView.loadUrl(dashboardUrl)
        }, reloadDelayMs)
    }

    private fun enableImmersiveMode() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            )
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            enableImmersiveMode()
        }
    }

    override fun onDestroy() {
        reloadHandler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }
}
