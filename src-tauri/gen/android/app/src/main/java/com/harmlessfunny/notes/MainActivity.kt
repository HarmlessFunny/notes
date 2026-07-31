package com.harmlessfunny.notes

import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        // Android 15+ 强制 edge-to-edge，theme 的颜色属性被忽略；
        // 用系统栏 insets 给 WebView 加 padding，内容自动避开状态栏/导航栏（≤14 时 insets 为 0，无副作用）
        ViewCompat.setOnApplyWindowInsetsListener(webView) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
    }
}
