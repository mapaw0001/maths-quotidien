/* Maths Quotidien — accès aux cours par QR code, installation et mises à jour (version 6.0).
   Les cours sont chiffrés (AES-256-GCM) et rangés dans un dépôt PRIVÉ. Le QR code contient, après le « # » du lien (que le navigateur ne
   envoie jamais au serveur), la clé de déchiffrement (k) et un jeton de lecture seule (t) pour télécharger ce fichier.
   Le dépôt public ne contient donc ni les cours (même chiffrés), ni la clé, ni le jeton. */
(function () {
  "use strict";
  var BASE = location.href.replace(/[#?].*$/, "").replace(/[^/]*$/, "");       // dossier de la page (…/app/)
  var ROOT = BASE.replace(/app\/$/, "");                                         // racine du site
  /* Mode « vraie appli Android » (APK) : l'appli est dans le téléphone, la page est lue depuis l'APK. Les nouveautés se cherchent sur le site public (SITE). */
  var APK = false; try { APK = /MQApp\//.test(navigator.userAgent) && !!window.AndroidMQ; } catch (e) {}
  var SITE = "https://mapaw0001.github.io/maths-quotidien/", APK_URL = "https://github.com/mapaw0001/maths-quotidien/releases/latest/download/maths-quotidien.apk", APK_PKG = "io.github.mapaw0001.mathsquotidien";
  var VROOT = APK ? SITE : ROOT;                                                  // où lire version.json
  var MQ = (window.MQ = { appUrl: APK ? "" : ROOT, apk: APK, version: "6.0", build: "78c5ac882a", _deferred: null, _start: null, onchange: null });
  function changed() { try { if (MQ.onchange) MQ.onchange(); } catch (e) {} }
  var PREFIX = "maths-quotidien-";
  var K = { txt: "mq-content", hash: "mq-content-hash", pw: "mq-pw", tok: "mq-tok", chk: "mq-lastcheck", inst: "mq-inst" };
  var REPO = "mapaw0001/maths-quotidien-cours", FPATH = "content.enc.json", REF = "main";
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }

  /* ---------- installation ---------- */
  MQ.standalone = function () { return APK || (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true; };
  MQ.canInstall = function () { return !!MQ._deferred; };
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); MQ._deferred = e; changed(); });
  window.addEventListener("appinstalled", function () { MQ._deferred = null; changed(); });
  MQ.downloadApp = function () { try { window.AndroidMQ.downloadApp(); } catch (e) {} };          // ouvre le téléchargement de la nouvelle appli (adresse fixée dans l'APK)
  MQ.install = function () {
    var d = MQ._deferred; if (!d) return Promise.resolve(false);
    MQ._deferred = null; d.prompt();
    return d.userChoice.then(function (c) { return c.outcome === "accepted"; }, function () { return false; });
  };

  /* ---------- chiffrement ---------- */
  function b64(s) { var b = atob(s), u = new Uint8Array(b.length), i; for (i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function decrypt(key, enc) {
    var te = new TextEncoder();
    return crypto.subtle.importKey("raw", te.encode(key), "PBKDF2", false, ["deriveKey"]).then(function (k) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(enc.salt), iterations: enc.iter, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    }).then(function (ck) { return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(enc.iv) }, ck, b64(enc.data)); })
      .then(function (buf) { return new TextDecoder().decode(buf); });
  }
  function fetchJson(path) {
    return fetch(path + (path.indexOf("?") < 0 ? "?" : "&") + "t=" + Date.now(), { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); });
  }
  function runContent(txt) { var s = document.createElement("script"); s.text = txt; document.head.appendChild(s); }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------- le lien du QR code : clé (k) et jeton de lecture (t) après le « # », ou collés à la main ---------- */
  var LEFT = "(?:^|[#,&?\\s\\/])";
  var KRE = new RegExp(LEFT + "k=([A-Za-z0-9_-]{20,80})"), TRE = new RegExp(LEFT + "t=([A-Za-z0-9_]{30,200})");
  function parseLink(s) {
    s = String(s == null ? "" : s).replace(/^\s+|\s+$/g, "");
    var k = KRE.exec(s), t = TRE.exec(s);
    return { key: k ? k[1] : null, tok: t ? t[1] : null };
  }
  /* lit la clé et le jeton dans l'adresse puis les efface de la barre d'adresse (on garde les autres réglages éventuels du « # ») */
  function takeFromHash() {
    var h = location.hash || ""; if (!KRE.test(h) && !TRE.test(h)) return null;
    var p = parseLink(h);
    var rest = h.replace(/^#/, "").split(/[,&]/).filter(function (x) { return x && x.indexOf("k=") !== 0 && x.indexOf("t=") !== 0; }).join(",");
    try { history.replaceState(null, "", location.pathname + location.search + (rest ? "#" + rest : "")); } catch (e) {}
    return p;
  }
  /* téléchargement du fichier chiffré dans le dépôt privé (API GitHub, jeton en lecture seule) */
  function ghFetch(tok) {
    return fetch("https://api.github.com/repos/" + REPO + "/contents/" + FPATH + "?ref=" + encodeURIComponent(REF), { cache: "no-store", headers: { "Accept": "application/vnd.github.raw+json", "Authorization": "Bearer " + tok } }).then(function (r) {
      if (r.status === 401 || r.status === 404 || (r.status === 403 && r.headers.get("x-ratelimit-remaining") !== "0")) { var e = new Error("auth " + r.status); e.auth = true; throw e; }   // jeton refusé, expiré ou retiré
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    });
  }
  function download(key, tok) {
    return ghFetch(tok).then(function (enc) { return decrypt(key, enc).then(function (txt) { return { txt: txt, enc: enc }; }); });
  }
  function accept(key, tok, r) { set(K.txt, r.txt); set(K.hash, r.enc.id); set(K.pw, key); set(K.tok, tok); }
  function failMsg(e) {
    if (e && e.name === "OperationError") return "Ce QR code n'est pas valide ou n'est plus à jour. Demande le nouveau QR code.";
    if (e && e.auth) return "Ce QR code n'ouvre plus les cours (accès refusé ou expiré). Demande le nouveau QR code.";
    return "Impossible de télécharger les cours (connexion ?). Réessaie.";
  }
  function info(msg) {
    var d = document.createElement("div"); d.setAttribute("role", "status");
    d.style.cssText = "position:fixed;left:12px;right:12px;top:calc(12px + env(safe-area-inset-top));z-index:40;background:var(--surf2);border:1px solid var(--acc);border-radius:14px;padding:10px 14px;color:var(--text);font:500 15px/1.3 Lexend,system-ui,sans-serif;max-width:496px;margin:0 auto;text-align:center";
    d.textContent = msg; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 7000);
  }

  /* ---------- écran « cours réservés » ---------- */
  var PILL = "flex:none;width:30px;height:30px;border-radius:50%;background:var(--acc-soft);border:1px solid var(--acc);color:var(--acc);font:700 16px/28px 'JetBrains Mono',monospace;text-align:center;font-style:normal";
  function step(n, h) { return '<div style="display:flex;gap:12px;align-items:flex-start;margin:0 0 12px"><i style="' + PILL + '">' + n + '</i><p style="margin:2px 0 0;font-size:17px;line-height:1.45;color:var(--text2)">' + h + "</p></div>"; }
  var SHELL = '<div class="screen"><div class="main" style="display:flex;flex-direction:column;justify-content:center;gap:14px;max-width:460px;width:100%;margin:0 auto;min-height:100vh;min-height:100dvh">';
  var ICON = '<div style="width:72px;height:72px;border-radius:22px;background:var(--acc-soft);border:1px solid var(--acc);color:var(--acc);display:flex;align-items:center;justify-content:center"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3m4 0v4h-4m-3 0v-3"/></svg></div>';
  var ICON_UP = ICON.replace('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3m4 0v4h-4m-3 0v-3"/>', '<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/>');
  function showBusy() {
    /* Un seul QR code : si l'appli n'est pas encore gardée sur le téléphone (1re fois), on l'installe, puis on télécharge les cours ; sinon, seulement les cours. */
    var first = false; try { first = !APK && !!("serviceWorker" in navigator) && !navigator.serviceWorker.controller; } catch (e) {}
    var row = function (ok, txt) { return '<p role="status" style="font-size:19px;line-height:1.3;margin:0;display:flex;gap:10px;align-items:flex-start"><span aria-hidden="true">' + (ok ? "✅" : "⏳") + '</span><span>' + txt + '</span></p>'; };
    document.getElementById("app").innerHTML = SHELL + ICON + '<h1 style="font-size:28px;line-height:1.1;margin:4px 0 0">' + (first ? "Installation en cours…" : "Mise à jour des cours…") + '</h1>' +
      (first ? row(false, "Installation de l'<b>application</b> sur ce téléphone (pour qu'elle marche sans connexion)…") : "") +
      row(false, "Téléchargement des <b>cours</b> (maths + électricité)…") +
      '<p class="note" style="font-size:17px;color:var(--text2);margin:0">Ça prend quelques secondes. Les cours sont <b style="color:var(--text)">chiffrés</b> : ils sont déchiffrés sur ton téléphone.</p></div></div>';
  }

  /* ---------- « Dernière étape : installe l'appli » (juste après le scan, une seule fois) ---------- */
  function isAndroid() { try { return /Android/i.test(navigator.userAgent); } catch (e) { return false; } }
  function isIOS() { try { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); } catch (e) { return false; } }
  function afterScan(txt) {
    if (APK || MQ.standalone() || isIOS() || get(K.inst)) { launch(txt); return; }        // déjà une appli, iPhone (stockage séparé), ou déjà proposé : on continue
    set(K.inst, "1"); showInstall(function () { launch(txt); });
  }
  function showInstall(next) {
    var installed = false, gone = false, prev = MQ.onchange;
    function leave() { if (gone) return; gone = true; MQ.onchange = prev; next(); }
    function draw() {
      if (gone) return;
      var can = MQ.canInstall(), body, later;
      if (installed) {
        body = '<p role="status" style="font-size:19px;line-height:1.35;margin:0;display:flex;gap:10px;align-items:flex-start"><span aria-hidden="true">✅</span><span><b>Appli installée !</b> Ouvre l\'icône <b>« Maths »</b> sur ton écran d\'accueil : tes cours sont déjà dedans.</span></p>';
        later = '<button class="btn sec" id="mqlater" type="button">Continuer ici</button>';
      } else {
        body = can ? '<button class="btn" id="mqinst" type="button">Installer l\'application</button>'
          : step(1, "Ouvre le menu <b>⋮</b> du navigateur (Samsung Internet : <b>≡</b>).") + step(2, "Appuie sur <b>« Installer l\'application »</b> (Samsung Internet : <b>« Ajouter la page à »</b> puis <b>« Écran d\'accueil »</b>).");
        later = '<button class="btn ghost" id="mqlater" type="button">Plus tard, continuer dans le navigateur</button>';
      }
      document.getElementById("app").innerHTML = SHELL + ICON +
        '<h1 style="font-size:28px;line-height:1.1;margin:4px 0 0">' + (installed ? "C\'est installé" : "Dernière étape : installe l\'appli") + "</h1>" +
        (installed ? "" : '<p class="note" style="font-size:18px;color:var(--text2);margin:0">Pour l\'avoir comme une <b style="color:var(--text)">vraie appli</b> : icône sur l\'écran d\'accueil, plein écran, sans la barre du navigateur. Tes cours sont <b style="color:var(--text)">déjà téléchargés</b>.</p>') +
        body + later + "</div></div>";
      var i = document.getElementById("mqinst");
      if (i) i.addEventListener("click", function () { MQ.install().then(function (ok) { if (ok) installed = true; draw(); }); });
      document.getElementById("mqlater").addEventListener("click", leave);
    }
    window.addEventListener("appinstalled", function () { installed = true; draw(); });
    MQ.onchange = function () { try { if (prev) prev(); } catch (e) {} draw(); };
    draw();
  }

  /* ---------- Navigateur Android : le QR code ouvre l'appli Maths (et l'installe la 1re fois) ---------- */
  function webChosen() { try { return sessionStorage.getItem("mq-web") === "1"; } catch (e) { return false; } }
  function readPending() { try { var p = parseLink(sessionStorage.getItem("mq-pend") || ""); return p.key && p.tok ? p : null; } catch (e) { return null; } }
  function intentUrl(L, fallback) {
    return "intent://open?k=" + encodeURIComponent(L.key) + "&t=" + encodeURIComponent(L.tok) + "#Intent;scheme=mathsq;package=" + APK_PKG + ";" +
      (fallback ? "S.browser_fallback_url=" + encodeURIComponent(APK_URL) + ";" : "") + "end";
  }
  MQ._intentUrl = intentUrl;
  function showAppChoice(L) {
    try { sessionStorage.setItem("mq-pend", "k=" + L.key + "&t=" + L.tok); } catch (e) {}
    document.getElementById("app").innerHTML = SHELL + ICON_UP + '<h1 style="font-size:28px;line-height:1.1;margin:4px 0 0">Ouvre l\'appli Maths</h1>' +
      '<p class="note" style="font-size:18px;color:var(--text2);margin:0">Tes cours s\'ouvrent dans l\'<b style="color:var(--text)">appli Maths Quotidien</b> : une vraie appli, avec son icône, en plein écran, et qui marche sans connexion.</p>' +
      '<div style="margin-top:4px">' + step(1, "Appuie sur <b style=\"color:var(--text)\">« Ouvrir l\'appli »</b>.") +
      step(2, "<b style=\"color:var(--text)\">Première fois ?</b> L\'appli se télécharge. Ouvre le fichier, appuie sur <b style=\"color:var(--text)\">Installer</b>. Android peut demander d\'<b style=\"color:var(--text)\">autoriser</b> ce navigateur : accepte.") +
      step(3, "<b style=\"color:var(--text)\">Reviens ici</b> et appuie encore sur <b style=\"color:var(--text)\">« Ouvrir l\'appli »</b> : les cours se chargent.") + "</div>" +
      '<a class="btn" id="mqopen" href="' + esc(intentUrl(L, true)) + '" style="text-align:center;text-decoration:none">Ouvrir l\'appli</a>' +
      '<a class="btn sec" id="mqdl" href="' + esc(APK_URL) + '" rel="noopener" style="text-align:center;text-decoration:none">Télécharger l\'appli seulement</a>' +
      '<button class="btn ghost" id="mqweb" type="button">Continuer dans le navigateur (sans installer)</button></div></div>';
    document.getElementById("mqweb").addEventListener("click", function () {
      try { sessionStorage.setItem("mq-web", "1"); sessionStorage.removeItem("mq-pend"); } catch (e) {}
      location.hash = "k=" + L.key + "&t=" + L.tok;                     // le chargeur lit le lien et recharge la page
    });
  }

  function showGate(msg, opt) {
    opt = opt || {};
    var bar = document.getElementById("mqbar"); if (bar) bar.remove();                 // le bandeau de mise à jour ne doit pas cacher l'écran de scan
    var app = document.getElementById("app");
    app.innerHTML = SHELL + ICON +
      '<h1 style="font-size:30px;line-height:1.1;margin:4px 0 0">Cours réservés</h1>' +
      '<p class="note" style="font-size:18px;color:var(--text2);margin:0">Ces cours sont réservés aux étudiants du <b style="color:var(--text)">BUT Réseaux et Télécommunications</b>.</p>' +
      '<div style="margin-top:6px">' + step(1, "Récupère le <b style=\"color:var(--text)\">QR code</b> des cours.") + step(2, "<b style=\"color:var(--text)\">Scanne-le</b> avec l'appareil photo du téléphone.") + step(3, "Ouvre le lien : les cours se <b style=\"color:var(--text)\">téléchargent</b> tout seuls.") + "</div>" +
      '<div id="mqerr" role="alert" style="min-height:24px;color:var(--bad);font-weight:600">' + (msg ? esc(msg) : "") + "</div>" +
      '<details id="mqman" style="border:1px solid var(--line);border-radius:14px;padding:4px 14px"' + (msg ? " open" : "") + '><summary style="min-height:48px;display:flex;align-items:center;cursor:pointer;font-size:17px;color:var(--text)">J\'ai un lien ou un code écrit</summary>' +
      '<form id="mqf" autocomplete="off" style="padding:4px 0 12px"><input class="name" id="mqkey" type="text" autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="Lien ou code des cours" placeholder="Colle le lien ou le code ici" style="margin-bottom:10px"><button class="btn" id="mqgo" type="submit">Télécharger les cours</button></form></details>' +
      '<p class="note">Le téléchargement se fait <b style="color:var(--text)">une seule fois</b>. Ensuite, l\'appli marche sans connexion.</p>' +
      (opt.back ? '<button class="btn sec" id="mqback" type="button">← Retour à l\'appli</button>' : "") + (opt.skip ? '<button class="btn ghost" id="mqskip" type="button">Continuer avec les cours actuels</button>' : "") + "</div></div>";
    var f = document.getElementById("mqf"), inp = document.getElementById("mqkey"), err = document.getElementById("mqerr"), go = document.getElementById("mqgo");
    if (opt.back) document.getElementById("mqback").addEventListener("click", function () { location.reload(); });
    if (opt.skip) document.getElementById("mqskip").addEventListener("click", function () { var c = get(K.txt); if (c) { runContent(c); startApp(); } else location.reload(); });
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var L = parseLink(inp.value);
      if (!L.key || !L.tok) { err.textContent = !inp.value.replace(/\s/g, "") ? "Colle le lien ou le code." : (L.key || L.tok) ? "Il manque une partie du lien. Colle le lien complet du QR code." : "Ce lien ou ce code n'est pas reconnu."; return; }
      go.disabled = true; go.textContent = "Téléchargement…"; err.textContent = "";
      download(L.key, L.tok).then(function (r) { accept(L.key, L.tok, r); if (opt.back) location.reload(); else afterScan(r.txt); }, function (e) {
        go.disabled = false; go.textContent = "Télécharger les cours"; err.textContent = failMsg(e);
      });
    });
  }

  /* Si le lien du QR code est ouvert dans une page déjà ouverte (seul le « # » change, la page ne se recharge pas), on la recharge pour lire la clé. */
  window.addEventListener("hashchange", function () { var h = location.hash || ""; if (KRE.test(h) || TRE.test(h)) location.reload(); });

  /* ---------- démarrage ---------- */
  var started = false;
  function startApp() {
    if (started) return; started = true;
    try { MQ._start(); } catch (e) { var a = document.getElementById("app"); a.innerHTML = '<div class="main"><h1>Oups</h1><p class="note">L\'appli n\'a pas pu démarrer. Recharge la page.</p></div>'; throw e; }
    registerSW();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    setTimeout(function () { MQ.checkUpdate(false); }, 4000);
  }
  /* À chaque lancement : on cherche une mise à jour (version de l'appli ou nouveaux cours). S'il y en a une, il faut la faire pour continuer.
     Sans connexion (ou si le site ne répond pas en 4 s), on ne peut pas savoir : l'appli s'ouvre avec ce qu'elle a. */
  function preflight() {
    return new Promise(function (resolve) {
      var done = false, t = setTimeout(function () { if (!done) { done = true; resolve(null); } }, 4000);
      fetchJson(VROOT + "version.json").then(function (v) {
        if (done) return; done = true; clearTimeout(t);
        var c = cmp(v.version, MQ.version), needApp = APK ? cmp(v.min || v.version, MQ.version) > 0 : (c > 0 || (c === 0 && !!v.build && v.build !== MQ.build)), needContent = !!(v.content && v.content !== get(K.hash));
        resolve(needApp || needContent ? { v: v, needApp: needApp, needContent: needContent } : null);
      }, function () { if (!done) { done = true; clearTimeout(t); resolve(null); } });
    });
  }
  function launch(txt) { preflight().then(function (need) { if (need) showUpdate(need); else { runContent(txt); startApp(); } }); }
  function showUpdate(need) {
    if (APK && need.needApp) { showApkUpdate(need); return; }
    var v = need.v, notes = (v.notes || []).slice(0, 4).map(function (n) { return "<li style=\"margin:3px 0\">" + esc(n) + "</li>"; }).join("");
    document.getElementById("app").innerHTML = SHELL + ICON_UP +
      '<h1 style="font-size:30px;line-height:1.1;margin:4px 0 0">Mise à jour obligatoire</h1>' +
      '<p class="note" style="font-size:18px;color:var(--text2);margin:0">Une <b style="color:var(--text)">nouvelle version</b>' + (v.version ? " (v" + esc(v.version) + ")" : "") + " est disponible. Il faut la télécharger pour continuer. <b style=\"color:var(--text)\">Ta progression est gardée.</b></p>" +
      (need.needContent ? '<p class="note" style="margin:0">Cours à télécharger : <b style="color:var(--text)">maths et électricité</b>.</p>' : "") +
      (notes ? '<ul class="note" style="margin:0;padding-left:20px;color:var(--text2)">' + notes + "</ul>" : "") +
      '<div id="mqerr" role="alert" style="min-height:24px;color:var(--bad);font-weight:600"></div>' +
      '<button class="btn" id="mqgo" type="button">Télécharger la mise à jour</button></div></div>';
    document.getElementById("mqgo").addEventListener("click", function () { doUpdate(need); });
  }
  /* Dans l'APK, la nouvelle version de l'appli = une nouvelle APK à télécharger puis installer (la progression reste, même signature). Les cours se mettent à jour tout seuls au lancement suivant. */
  function showApkUpdate(need) {
    var v = need.v, notes = (v.notes || []).slice(0, 4).map(function (n) { return "<li style=\"margin:3px 0\">" + esc(n) + "</li>"; }).join("");
    document.getElementById("app").innerHTML = SHELL + ICON_UP +
      '<h1 style="font-size:30px;line-height:1.1;margin:4px 0 0">Mise à jour obligatoire</h1>' +
      '<p class="note" style="font-size:18px;color:var(--text2);margin:0">Une <b style="color:var(--text)">nouvelle version</b> de l\'appli' + (v.version ? " (v" + esc(v.version) + ")" : "") + " est disponible. Il faut l\'installer pour continuer. <b style=\"color:var(--text)\">Ta progression est gardée.</b></p>" +
      (notes ? '<ul class="note" style="margin:0;padding-left:20px;color:var(--text2)">' + notes + "</ul>" : "") +
      '<div style="margin-top:4px">' + step(1, "Appuie sur <b style=\"color:var(--text)\">« Télécharger la mise à jour »</b>.") + step(2, "Ouvre le fichier téléchargé, puis appuie sur <b style=\"color:var(--text)\">Mettre à jour</b>.") + step(3, "Ouvre l\'appli : tout est comme avant.") + "</div>" +
      '<button class="btn" id="mqgo" type="button">Télécharger la mise à jour</button></div></div>';
    document.getElementById("mqgo").addEventListener("click", function () { MQ.downloadApp(); });
  }
  function doUpdate(need) {
    var go = document.getElementById("mqgo"), err = document.getElementById("mqerr");
    go.disabled = true; go.textContent = "Téléchargement…"; err.textContent = "";
    function fail(e) {
      if (e && (e.relock || e.auth)) { showGate(e.auth ? "Ce QR code n'ouvre plus les cours (accès refusé ou expiré). Scanne le nouveau QR code." : "Les cours ont été renouvelés. Scanne le nouveau QR code pour les recevoir. Ta progression est gardée.", { skip: !!get(K.txt) }); return; }
      go.disabled = false; go.textContent = "Réessayer"; err.textContent = (e && e.message === "offline") ? "Pas de connexion. Réessaie quand tu as du réseau." : "La mise à jour n'a pas pu se faire (connexion ?). Réessaie.";
    }
    (need.needContent ? refreshContent(need.v) : Promise.resolve(false)).then(function () {
      if (need.needApp) return MQ.forceUpdate().then(function (ok) { if (ok === false) throw new Error("offline"); });   // recharge la page quand c'est prêt
      runContent(get(K.txt)); startApp();
    }).then(null, fail);
  }
  MQ.run = function (fn) {
    MQ._start = fn;
    var got = takeFromHash(), cached = get(K.txt);
    /* Navigateur Android (pas l'appli) : le QR code ouvre l'appli Maths, ou la télécharge si elle n'est pas encore installée */
    if (!APK && isAndroid() && !MQ.standalone() && !webChosen()) {
      var pend = got && got.key && got.tok ? got : (!got ? readPending() : null);
      if (pend) { showAppChoice(pend); return; }
    }
    registerSW();                                               // (navigateur) l'appli web s'installe dès l'ouverture du lien (en même temps que les cours)
    if (got && got.key && got.tok) {                              // QR code scanné : on télécharge puis on déchiffre
      showBusy();
      download(got.key, got.tok).then(function (r) { accept(got.key, got.tok, r); afterScan(r.txt); }, function (e) {
        if (cached) { launch(cached); info(failMsg(e)); } else showGate(failMsg(e));
      });
      return;
    }
    if (got) { var m = "Ce lien est incomplet : il manque une partie. Demande le nouveau QR code."; if (cached) { launch(cached); info(m); } else showGate(m); return; }
    if (cached) launch(cached); else showGate();
  };

  /* ---------- service worker ---------- */
  function registerSW() { try { if (!APK && "serviceWorker" in navigator) navigator.serviceWorker.register(ROOT + "sw.js", { scope: ROOT }).catch(function () {}); } catch (e) {} }

  /* ---------- mises à jour ---------- */
  function cmp(a, b) { var x = String(a).split(".").map(Number), y = String(b).split(".").map(Number), i; for (i = 0; i < 3; i++) { var d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; }
  function refreshContent(v) {
    var pw = get(K.pw), tok = get(K.tok); if (!pw) return Promise.resolve(false);
    if (!tok) { var e0 = new Error("relock"); e0.relock = true; return Promise.reject(e0); }                // ancienne installation sans jeton : il faut le nouveau QR code
    if (v && v.content && v.content === get(K.hash)) return Promise.resolve(false);
    return ghFetch(tok).then(function (enc) {
      if (enc.id === get(K.hash)) return false;
      return decrypt(pw, enc).then(function (txt) { set(K.txt, txt); set(K.hash, enc.id); return true; }, function (e) {
        if (e && e.name === "OperationError") { var er = new Error("relock"); er.relock = true; throw er; }   // les cours ont une nouvelle clé : il faut le nouveau QR code
        throw e;
      });
    });
  }
  /* Nouvelle clé : on garde les cours déjà téléchargés (ils restent utilisables) et on propose de scanner le nouveau QR code ou de coller le lien. La progression n'est jamais touchée. */
  MQ.relock = function () { showGate("", { back: true }); };
  function banner(v, relock) {
    var old = document.getElementById("mqbar"); if (old) { if (!relock || old.getAttribute("data-k") === "relock") return; old.remove(); }
    var d = document.createElement("div"); d.id = "mqbar"; d.setAttribute("role", "status"); d.setAttribute("data-k", relock ? "relock" : "up");
    d.style.cssText = "position:fixed;left:12px;right:12px;bottom:calc(92px + env(safe-area-inset-bottom));z-index:25;background:var(--surf2);border:1px solid var(--acc);border-radius:14px;padding:10px 12px;display:flex;align-items:center;gap:10px;color:var(--text);font:500 15px/1.3 Lexend,system-ui,sans-serif;max-width:496px;margin:0 auto";
    d.innerHTML = relock
      ? '<span style="flex:1">Les cours ont été renouvelés. Scanne le nouveau QR code pour les recevoir. Ta progression est gardée.</span><button class="btn sm" id="mqup" style="min-height:44px">Nouveau QR code</button><button class="btn sm ghost" id="mqno" aria-label="Plus tard" style="min-height:44px;padding:0 12px">✕</button>'
      : '<span style="flex:1">Nouvelle version' + (v ? " (v" + esc(v) + ")" : "") + ' disponible. Ta progression est gardée.</span><button class="btn sm" id="mqup" style="min-height:44px">Mettre à jour</button><button class="btn sm ghost" id="mqno" aria-label="Plus tard" style="min-height:44px;padding:0 12px">✕</button>';
    document.body.appendChild(d);
    document.getElementById("mqup").onclick = function () { if (relock) MQ.relock(); else MQ.forceUpdate().then(function (ok) { if (ok === false) { var s = d.querySelector("span"); if (s) s.textContent = "Pas de connexion : mise à jour impossible pour l'instant."; } }); };
    document.getElementById("mqno").onclick = function () { d.remove(); };
  }
  MQ.checkUpdate = function (manual) {
    return fetchJson(VROOT + "version.json").then(function (v) {
      set(K.chk, String(Date.now()));
      try { if ("serviceWorker" in navigator) navigator.serviceWorker.getRegistration(ROOT).then(function (r) { if (r) r.update().catch(function () {}); }, function () {}); } catch (e) {}   // le service worker prépare la nouvelle version tout seul
      var c = cmp(v.version, MQ.version);
      var res = { app: APK ? c > 0 : (c > 0 || (c === 0 && !!v.build && v.build !== MQ.build)), content: false, relock: false, version: v.version, notes: v.notes || [] };
      return refreshContent(v).then(function (changed) { res.content = !!changed; }, function (e) { if (e && (e.relock || e.auth)) res.relock = true; }).then(function () {
        if (!manual) { if (res.relock) banner(v.version, true); else if (res.app || res.content) banner(v.version, false); }
        return res;
      });
    }).catch(function () { return null; });
  };
  /* Mise à jour. Sur GitHub Pages les fichiers restent 10 min dans le cache HTTP du navigateur : recharger la page ne suffit pas.
     Méthode fiable : on laisse le NOUVEAU service worker télécharger les fichiers (il contourne le cache HTTP), puis on recharge.
     forceUpdate()      : met à jour (service worker), ne supprime rien tant que ça marche.
     forceUpdate(true)  : « forcer » : vide NOTRE cache et NOTRE service worker, puis recharge ; au démarrage suivant, un 2e rechargement
                          unique a lieu si la page affichée est encore l'ancienne.
     Dans les deux cas : sans réseau, on refuse et on ne supprime rien (l'appli doit rester utilisable hors ligne). */
  function waitActivated(reg) {
    var w = reg.installing || reg.waiting; if (!w) return Promise.resolve(false);
    return new Promise(function (res) {
      var t = setTimeout(function () { res(false); }, 25000);
      function chk() { if (w.state === "activated") { clearTimeout(t); res(true); } else if (w.state === "redundant") { clearTimeout(t); res(false); } }
      w.addEventListener("statechange", chk); chk();
    });
  }
  function repair() {
    var p = [];
    try { sessionStorage.setItem("mq-repair", "1"); } catch (e) {}
    if ("serviceWorker" in navigator) p.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.filter(function (r) { return r.scope === ROOT; }).map(function (r) { return r.unregister(); })); }));
    if (window.caches) p.push(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf(PREFIX) === 0; }).map(function (k) { return caches.delete(k); })); }));
    return Promise.all(p).catch(function () {});
  }
  function apkUpdate() {
    return fetchJson(VROOT + "version.json").then(function (v) { return v; }, function () { return null; }).then(function (v) {
      if (!v) return false;
      var c = cmp(v.version, MQ.version);
      if (c > 0) { MQ.downloadApp(); return true; }
      return refreshContent(v).catch(function () {}).then(function () { location.reload(); return true; });
    });
  }
  MQ.forceUpdate = function (hard) {
    if (APK) return apkUpdate();
    return fetch(ROOT + "version.json?t=" + Date.now(), { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); }).then(function (v) { return v; }, function () { return null; }).then(function (v) {
      if (!v) return false;
      return refreshContent().catch(function () {}).then(function () {
        if (hard) return false;
        var getReg = ("serviceWorker" in navigator) ? navigator.serviceWorker.getRegistration(ROOT).catch(function () { return null; }) : Promise.resolve(null);
        return getReg.then(function (reg) { if (!reg) return false; return reg.update().catch(function () {}).then(function () { return waitActivated(reg); }).then(function () { return window.caches && v.build ? caches.has(PREFIX + v.build) : false; }); });
      }).then(function (fresh) {
        if (fresh) { location.reload(); return true; }
        return repair().then(function () { location.reload(); return true; });
      });
    });
  };
  /* après un « forcer » : si la page affichée est encore l'ancienne, un seul rechargement une fois les fichiers à jour prêts */
  (function afterRepair() {
    if (APK) return;
    var f = null; try { f = sessionStorage.getItem("mq-repair"); sessionStorage.removeItem("mq-repair"); } catch (e) {}
    if (!f || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then(function () { return fetchJson(ROOT + "version.json"); }).then(function (v) {
      if (v && v.build && v.build !== MQ.build) return caches.has(PREFIX + v.build).then(function (has) { if (has) location.reload(); });
    }).catch(function () {});
  })();
  document.addEventListener("visibilitychange", function () {
    if (document.hidden || !started) return;
    var last = parseInt(get(K.chk), 10) || 0; if (Date.now() - last > 6 * 3600 * 1000) MQ.checkUpdate(false);
  });
})();
