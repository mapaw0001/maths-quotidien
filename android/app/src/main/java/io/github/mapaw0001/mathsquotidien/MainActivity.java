package io.github.mapaw0001.mathsquotidien;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Maths Quotidien : la « boîte » de l'appli.
 * Les fichiers de l'appli sont DANS l'APK (dossier assets/site). Ils sont servis à la page web par
 * shouldInterceptRequest, sous une adresse https fictive (appassets.androidplatform.net) : la page est dans un
 * « contexte sécurisé » (le déchiffrement WebCrypto marche) et rien d'autre n'est lu sur le téléphone.
 * Les cours ne sont PAS dans l'APK : la page les télécharge avec le QR code (clé + jeton), puis les garde sur le téléphone.
 */
public class MainActivity extends Activity {

    static final String HOST = "appassets.androidplatform.net";
    static final String ASSET_PREFIX = "/assets/site/";
    static final String START = "https://" + HOST + ASSET_PREFIX + "app/index.html";
    /** Adresse FIXE de la nouvelle version (jamais lue depuis internet : pas de redirection possible par un fichier distant). */
    static final String APK_URL = "https://github.com/mapaw0001/maths-quotidien/releases/latest/download/maths-quotidien.apk";

    static final Pattern KEY = Pattern.compile("[A-Za-z0-9_-]{20,80}");
    static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9_]{30,200}");

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#070B12"));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setUserAgentString(s.getUserAgentString() + " MQApp/1");

        web.addJavascriptInterface(new Bridge(), "AndroidMQ");
        web.setWebViewClient(new Client());
        web.loadUrl(urlFor(getIntent()));
        setIntent(new Intent());
    }

    /** Lien du QR code ouvert depuis le navigateur : mathsq://open?k=…&t=… → on le donne à la page (après le « # »). */
    private String urlFor(Intent it) {
        Uri d = it == null ? null : it.getData();
        if (d != null && "mathsq".equals(d.getScheme())) {
            String k = d.getQueryParameter("k");
            String t = d.getQueryParameter("t");
            if (k != null && t != null && KEY.matcher(k).matches() && TOKEN.matcher(t).matches()) {
                return START + "#k=" + k + "&t=" + t;
            }
        }
        return START;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        Uri d = intent == null ? null : intent.getData();
        if (d != null && web != null) {
            web.loadUrl(urlFor(intent));
        }
        setIntent(new Intent());
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.removeJavascriptInterface("AndroidMQ");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /** Ouvre un lien https dans le navigateur du téléphone (jamais dans la page de l'appli). */
    private void openExternal(Uri u) {
        if (u == null || !"https".equals(u.getScheme())) return;
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, u);
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            // pas de navigateur : rien à faire
        }
    }

    private static String mime(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        if (n.endsWith(".html")) return "text/html";
        if (n.endsWith(".js")) return "text/javascript";
        if (n.endsWith(".css")) return "text/css";
        if (n.endsWith(".json")) return "application/json";
        if (n.endsWith(".webmanifest")) return "application/manifest+json";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".woff2")) return "font/woff2";
        if (n.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    private static boolean isText(String mime) {
        return mime.startsWith("text/") || mime.endsWith("json") || mime.endsWith("svg+xml");
    }

    private WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
    }

    /** Sert un fichier de l'APK (assets/site/…) à la page. Refuse tout ce qui sort de ce dossier. */
    private WebResourceResponse serve(Uri u) {
        String p = u.getPath();
        if (p == null || !p.startsWith(ASSET_PREFIX) || p.contains("..") || p.contains("\\")) return notFound();
        if (p.endsWith("/")) p = p + "index.html";
        String rel = p.substring("/assets/".length());   // « site/app/index.html »
        try {
            InputStream in = getAssets().open(rel);
            String m = mime(rel);
            Map<String, String> h = new HashMap<String, String>();
            h.put("Cache-Control", "no-cache");
            return new WebResourceResponse(m, isText(m) ? "utf-8" : null, 200, "OK", h, in);
        } catch (IOException e) {
            return notFound();
        }
    }

    private class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (!HOST.equals(u.getHost())) return null;          // api.github.com, github.io : réseau normal
            if (!"GET".equalsIgnoreCase(request.getMethod())) return notFound();
            return serve(u);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (HOST.equals(u.getHost()) && "https".equals(u.getScheme())) return false;   // pages de l'appli
            openExternal(u);                                                                   // tout le reste : navigateur
            return true;
        }
    }

    /** Seul pont vers la page : lancer le téléchargement de la nouvelle appli (adresse fixée ci-dessus). */
    private class Bridge {
        @JavascriptInterface
        public void downloadApp() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    openExternal(Uri.parse(APK_URL));
                }
            });
        }
    }
}
