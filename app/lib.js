/* BIBLIOTHÈQUE DE CONTENU : petits outils pour écrire les notions (HTML, QCM, graphiques SVG).
   Les notions sont dans bloc1.js, bloc2.js, ... et s'ajoutent à window.NOTIONS dans l'ordre de chargement. */
(function () {
  var L = (window.L = {});
  window.NOTIONS = [];

  L.fr = function (n, d) { return '<span class="frac"><span>' + n + "</span><span>" + d + "</span></span>"; };
  L.rad = function (x) { return '√<span class="rad">' + x + "</span>"; };
  L.box = function (cls, h) { return '<div class="box ' + cls + '">' + h + "</div>"; };
  /* Code couleur constant : formules = bleu, exemples/étapes = orange, jaune seulement pour « À retenir ». */
  L.card = function (tag, title, html) {
    if (tag === "formula") html = html.replace(/class="box (yellow|orange)"/g, 'class="box blue"');
    else if (tag !== "keep") html = html.replace(/class="box yellow"/g, 'class="box orange"');
    return { tag: tag, title: title, html: html };
  };
  /* Niveaux de difficulté : L.lvl({id: 1|2|3}) (par défaut 2). */
  L.lvl = function (map) {
    window.NOTIONS.forEach(function (n) { n.exercises.forEach(function (e) { if (map[e.id]) e.lvl = map[e.id]; }); });
  };
  /* QCM : la 1re option est la bonne (l'appli mélange l'ordre). wrongs = [[texte, pourquoi c'est faux], ...] */
  /* Les textes des choix sont échappés par l'appli : on les écrit en texte simple.
     <sup class='s'>X</sup> devient ^(X), <b> disparaît, &gt; &lt; redeviennent > <. L'appli remet les exposants. */
  L.plain = function (s) {
    return String(s == null ? "" : s)
      .replace(/<sup[^>]*>(.*?)<\/sup>/g, "^($1)")
      .replace(/<sub[^>]*>(.*?)<\/sub>/g, "_($1)")
      .replace(/<\/?b>/g, "")
      .replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
  };
  L.qcm = function (id, q, right, wrongs, explain) {
    return { id: id, type: "qcm", q: q, options: [{ t: L.plain(right) }].concat(wrongs.map(function (w) { return { t: L.plain(w[0]), why: L.plain(w[1] || "") }; })), a: 0, explain: explain };
  };
  L.num = function (id, q, a, explain, tol) {
    var e = { id: id, type: "num", q: q, a: a, explain: explain };
    if (tol) e.tol = tol;
    return e;
  };
  L.add = function (n) { window.NOTIONS.push(n); };
  /* Électricité : même format ; `part` = titre de la partie, affiché sous le rond de la 1re notion de cette partie. */
  L.addE = function (n, part) { n.subj = "elec"; if (part) n.pk = part; window.NOTIONS.push(n); };
  /* Titres des cours, des parties et des fiches de la boutique : dans le contenu chiffré, jamais dans le code public. */
  L.meta = function (o) { window.COURSE = o; };

  /* Graphique SVG. o = { xr:[min,max], yr:[min,max], xt:[[valeur,"texte"],...], yt:[...], alt:"description",
       curves:[{f, a, b, c:"#couleur", dash:true, w:3}], segs:[{p:[[x,y],...], c, dash, w}],
       pts:[{x,y,c,open,t,dx,dy}], dots:[[x1,y1,x2,y2],...] (traits pointillés), arrows:[{x,h,c}] (flèches vers le haut),
       texts:[{x,y,t,c,a}] , grid:true } */
  var uid = 0;
  var COL = { blue: "#0b72b5", orange: "#b05a00", green: "#378300", red: "#cf2f2f", purple: "#7b3fbf", gray: "#777" };
  L.col = COL;
  L.plot = function (o) {
    var W = o.w || 320, H = o.h || 210, m = { l: 30, r: 16, t: 14, b: 24 };
    var x0 = o.xr[0], x1 = o.xr[1], y0 = o.yr[0], y1 = o.yr[1], id = "c" + (++uid);
    function X(x) { return m.l + (x - x0) / (x1 - x0) * (W - m.l - m.r); }
    function Y(y) { return H - m.b - (y - y0) / (y1 - y0) * (H - m.t - m.b); }
    function f1(v) { return Math.round(v * 10) / 10; }
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + (o.alt || "graphique") + '" style="width:100%;max-width:460px;display:block;margin:10px auto;background:#fff;border:2px solid #e5e5e5;border-radius:14px;font-family:Verdana,Arial,sans-serif">';
    s += '<defs><clipPath id="' + id + '"><rect x="' + m.l + '" y="' + m.t + '" width="' + (W - m.l - m.r) + '" height="' + (H - m.t - m.b) + '"/></clipPath></defs>';
    var ax = (y0 <= 0 && y1 >= 0) ? Y(0) : H - m.b, ay = (x0 <= 0 && x1 >= 0) ? X(0) : m.l;
    if (o.grid !== false) {
      (o.xt || []).forEach(function (t) { s += '<line x1="' + f1(X(t[0])) + '" y1="' + m.t + '" x2="' + f1(X(t[0])) + '" y2="' + (H - m.b) + '" stroke="#eee" stroke-width="1"/>'; });
      (o.yt || []).forEach(function (t) { s += '<line x1="' + m.l + '" y1="' + f1(Y(t[0])) + '" x2="' + (W - m.r) + '" y2="' + f1(Y(t[0])) + '" stroke="#eee" stroke-width="1"/>'; });
    }
    s += '<line x1="' + m.l + '" y1="' + f1(ax) + '" x2="' + (W - m.r + 6) + '" y2="' + f1(ax) + '" stroke="#555" stroke-width="1.6"/>';
    s += '<line x1="' + f1(ay) + '" y1="' + (H - m.b) + '" x2="' + f1(ay) + '" y2="' + (m.t - 6) + '" stroke="#555" stroke-width="1.6"/>';
    s += '<path d="M' + (W - m.r + 7) + " " + f1(ax) + "l-7 -4v8z M" + f1(ay) + " " + (m.t - 7) + 'l-4 7h8z" fill="#555"/>';
    (o.xt || []).forEach(function (t) {
      s += '<line x1="' + f1(X(t[0])) + '" y1="' + f1(ax - 3) + '" x2="' + f1(X(t[0])) + '" y2="' + f1(ax + 3) + '" stroke="#555"/>';
      if (t[1] !== "" && t[1] !== undefined) s += '<text x="' + f1(X(t[0])) + '" y="' + f1(Math.min(ax + 16, H - 6)) + '" font-size="12" text-anchor="middle" fill="#333">' + t[1] + "</text>";
    });
    (o.yt || []).forEach(function (t) {
      s += '<line x1="' + f1(ay - 3) + '" y1="' + f1(Y(t[0])) + '" x2="' + f1(ay + 3) + '" y2="' + f1(Y(t[0])) + '" stroke="#555"/>';
      if (t[1] !== "" && t[1] !== undefined) s += '<text x="' + f1(Math.max(ay - 6, 22)) + '" y="' + f1(Y(t[0]) + 4) + '" font-size="12" text-anchor="end" fill="#333">' + t[1] + "</text>";
    });
    s += '<g clip-path="url(#' + id + ')">';
    (o.dots || []).forEach(function (d) { s += '<line x1="' + f1(X(d[0])) + '" y1="' + f1(Y(d[1])) + '" x2="' + f1(X(d[2])) + '" y2="' + f1(Y(d[3])) + '" stroke="#888" stroke-width="1.5" stroke-dasharray="4 4"/>'; });
    (o.curves || []).forEach(function (c) {
      var a = c.a === undefined ? x0 : c.a, b = c.b === undefined ? x1 : c.b, n = c.n || 240, d = "", pen = false, prev = null, big = (y1 - y0) * 3;
      for (var i = 0; i <= n; i++) {
        var x = a + (b - a) * i / n, y = c.f(x);
        if (!isFinite(y) || Math.abs(y) > big + Math.abs(y0) + Math.abs(y1) || (prev !== null && Math.abs(y - prev) > big)) { pen = false; prev = null; continue; }
        d += (pen ? "L" : "M") + f1(X(x)) + " " + f1(Y(y)); pen = true; prev = y;
      }
      s += '<path d="' + d + '" fill="none" stroke="' + (c.c || COL.blue) + '" stroke-width="' + (c.w || 3) + '"' + (c.dash ? ' stroke-dasharray="6 5"' : "") + ' stroke-linecap="round" stroke-linejoin="round"/>';
    });
    (o.segs || []).forEach(function (g) {
      var d = g.p.map(function (p, i) { return (i ? "L" : "M") + f1(X(p[0])) + " " + f1(Y(p[1])); }).join("");
      s += '<path d="' + d + '" fill="none" stroke="' + (g.c || COL.blue) + '" stroke-width="' + (g.w || 3) + '"' + (g.dash ? ' stroke-dasharray="6 5"' : "") + ' stroke-linecap="round" stroke-linejoin="round"/>';
    });
    (o.arrows || []).forEach(function (r) {
      var c = r.c || COL.red, xx = f1(X(r.x)), yt = f1(Y(r.h));
      s += '<line x1="' + xx + '" y1="' + f1(Y(0)) + '" x2="' + xx + '" y2="' + (+yt + 6) + '" stroke="' + c + '" stroke-width="3"/><path d="M' + xx + " " + yt + 'l-5 9h10z" fill="' + c + '"/>';
    });
    s += "</g>";
    (o.pts || []).forEach(function (p) {
      s += '<circle cx="' + f1(X(p.x)) + '" cy="' + f1(Y(p.y)) + '" r="4.5" fill="' + (p.open ? "#fff" : (p.c || COL.red)) + '" stroke="' + (p.c || COL.red) + '" stroke-width="2"/>';
      if (p.t) s += '<text x="' + f1(X(p.x) + (p.dx || 8)) + '" y="' + f1(Y(p.y) + (p.dy === undefined ? -8 : p.dy)) + '" font-size="12" fill="' + (p.c || COL.red) + '" font-weight="bold">' + p.t + "</text>";
    });
    (o.texts || []).forEach(function (t) {
      s += '<text x="' + f1(X(t.x)) + '" y="' + f1(Y(t.y)) + '" font-size="' + (t.s || 12) + '" text-anchor="' + (t.a || "start") + '" fill="' + (t.c || "#333") + '" font-weight="bold">' + t.t + "</text>";
    });
    return s + "</svg>";
  };
  /* légende colorée sous un graphique : [["bleu","f(x) = x²"], ...] */
  L.leg = function (arr) {
    var cm = { blue: "🔵", orange: "🟠", green: "🟢", red: "🔴", purple: "🟣" };
    return "<p>" + arr.map(function (a) { return (cm[a[0]] || "▪️") + " " + a[1]; }).join("<br>") + "</p>";
  };
})();
