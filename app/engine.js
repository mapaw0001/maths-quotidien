/* Moteur de répétition espacée (sans écran) — testable avec node.
   Rythme : J+3, J+7, J+14, J+30, J+90 comptés depuis le jour où la notion est apprise,
   puis tous les 90 jours. Une erreur à une révision remet la notion à zéro (à réapprendre).
   Si une révision est faite en retard, la suivante reste sur le calendrier d'origine
   (ou, si ce jour est déjà passé, repart avec l'écart normal à partir d'aujourd'hui). */
(function (root) {
  "use strict";

  var GAPS = [3, 4, 7, 16, 60];     // écarts normaux entre deux passages
  var CUM = [3, 7, 14, 30, 90];     // jours depuis l'apprentissage
  var REPEAT_GAP = 90;
  var MAX_STAGE = 5;
  var STAGE_NAMES = ["J+3", "J+7", "J+14", "J+30", "J+90"];
  /* Jetons : +DAILY chaque jour de série, +WEEK_BONUS quand la série atteint un multiple de 7. */
  var DAILY = 10, WEEK_BONUS = 20, SHIELD_PRICE = 30, SHIELD_MAX = 2;
  var THEMES = ["night", "day", "auto"], ACCENTS = ["cyan", "magenta", "amber"];

  function isNum(x) { return typeof x === "number" && isFinite(x); }

  function dayIndex(d) {
    d = d || new Date();
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  }

  function fmtDay(n, opts) {
    return new Date(n * 86400000).toLocaleDateString("fr-FR", Object.assign({ timeZone: "UTC" }, opts || { weekday: "long", day: "numeric", month: "long" }));
  }

  function newState() {
    return {
      v: 2, epoch: 0, updatedAt: 0, xp: 0,
      streak: { count: 0, last: null, best: 0 },
      newDay: null, newCount: 0, newBy: {},
      settings: { newPerDay: 1, remindHour: 21, theme: "night", accent: "cyan", tour: 0 },
      tok: { earned: 0, buys: {}, shBought: 0, shUsed: 0 },
      profile: { name: "" },
      notions: {}, seen: {}
    };
  }

  function cleanNotion(n) {
    if (!n || typeof n !== "object") return null;
    var status = n.status === "relearn" ? "relearn" : (n.status === "learned" ? "learned" : null);
    if (!status || !isNum(n.stage) || !isNum(n.due) || !isNum(n.learnedOn)) return null;
    return {
      status: status,
      stage: Math.max(0, Math.min(MAX_STAGE, Math.floor(n.stage))),
      learnedOn: n.learnedOn,
      lastReview: isNum(n.lastReview) ? n.lastReview : n.learnedOn,
      due: n.due,
      lapses: isNum(n.lapses) ? n.lapses : 0,
      rev: isNum(n.rev) ? n.rev : 0
    };
  }

  /* Remet un état (venant du téléphone, du compte ou d'un code) au bon format. Ne plante jamais. */
  function normalizeState(s) {
    var d = newState();
    if (!s || typeof s !== "object") return d;
    d.epoch = isNum(s.epoch) ? s.epoch : 0;
    d.updatedAt = isNum(s.updatedAt) ? s.updatedAt : 0;
    d.xp = isNum(s.xp) && s.xp > 0 ? s.xp : 0;
    if (s.streak && typeof s.streak === "object") {
      d.streak = { count: isNum(s.streak.count) ? s.streak.count : 0, last: isNum(s.streak.last) ? s.streak.last : null, best: 0 };
      d.streak.best = Math.max(isNum(s.streak.best) ? s.streak.best : 0, d.streak.count);
    }
    d.newDay = isNum(s.newDay) ? s.newDay : null;
    d.newCount = isNum(s.newCount) ? s.newCount : 0;
    d.newBy = {};
    if (s.newBy && typeof s.newBy === "object") Object.keys(s.newBy).forEach(function (k) { if (isNum(s.newBy[k]) && s.newBy[k] > 0) d.newBy[k] = Math.floor(s.newBy[k]); });
    if (s.settings && typeof s.settings === "object") {
      var npd = s.settings.newPerDay;
      d.settings.newPerDay = (isNum(npd) && npd >= 1 && npd <= 3) ? Math.floor(npd) : 1;
      var rh = s.settings.remindHour;
      d.settings.remindHour = (isNum(rh) && rh >= 5 && rh <= 23) ? Math.floor(rh) : 21;
      d.settings.theme = THEMES.indexOf(s.settings.theme) >= 0 ? s.settings.theme : "night";
      d.settings.accent = ACCENTS.indexOf(s.settings.accent) >= 0 ? s.settings.accent : "cyan";
      d.settings.tour = s.settings.tour ? 1 : 0;
    }
    if (s.tok && typeof s.tok === "object") {
      var nn = function (x) { return isNum(x) && x > 0 ? Math.floor(x) : 0; };
      d.tok.earned = nn(s.tok.earned); d.tok.shBought = nn(s.tok.shBought); d.tok.shUsed = Math.min(nn(s.tok.shUsed), d.tok.shBought);
      if (s.tok.buys && typeof s.tok.buys === "object") Object.keys(s.tok.buys).forEach(function (k) { if (isNum(s.tok.buys[k]) && s.tok.buys[k] >= 0) d.tok.buys[k] = Math.floor(s.tok.buys[k]); });
    }
    if (s.profile && typeof s.profile === "object" && typeof s.profile.name === "string") d.profile.name = s.profile.name.slice(0, 20);
    if (s.notions && typeof s.notions === "object") {
      Object.keys(s.notions).forEach(function (id) {
        var c = cleanNotion(s.notions[id]);
        if (c) d.notions[id] = c;
      });
    }
    if (s.seen && typeof s.seen === "object") {
      Object.keys(s.seen).forEach(function (k) { if (isNum(s.seen[k]) && s.seen[k] > 0) d.seen[k] = s.seen[k]; });
    }
    return d;
  }

  /* Fusionne deux états (appareil + compte, ou deux onglets) sans rien perdre. */
  function merge(a, b) {
    a = normalizeState(a); b = normalizeState(b);
    if (a.epoch !== b.epoch) return a.epoch > b.epoch ? a : b; // une réinitialisation ou une restauration gagne
    var out = newState();
    out.epoch = a.epoch;
    out.updatedAt = Math.max(a.updatedAt, b.updatedAt);
    out.xp = Math.max(a.xp, b.xp);
    out.settings = JSON.parse(JSON.stringify((a.updatedAt >= b.updatedAt ? a : b).settings));
    out.settings.tour = (a.settings.tour || b.settings.tour) ? 1 : 0;
    var la = a.streak.last === null ? -Infinity : a.streak.last, lb = b.streak.last === null ? -Infinity : b.streak.last;
    var sw = la > lb ? a.streak : (lb > la ? b.streak : (a.streak.count >= b.streak.count ? a.streak : b.streak));
    out.streak = { count: sw.count, last: sw.last, best: Math.max(a.streak.best, b.streak.best, sw.count) };
    var newer = a.updatedAt >= b.updatedAt ? a : b;
    out.profile = { name: newer.profile.name };
    out.tok.earned = Math.max(a.tok.earned, b.tok.earned);
    out.tok.shBought = Math.max(a.tok.shBought, b.tok.shBought);
    out.tok.shUsed = Math.min(Math.max(a.tok.shUsed, b.tok.shUsed), out.tok.shBought);
    Object.keys(a.tok.buys).concat(Object.keys(b.tok.buys)).forEach(function (k) { out.tok.buys[k] = Math.max(a.tok.buys[k] || 0, b.tok.buys[k] || 0); });
    out.tok.earned = Math.max(out.tok.earned, spent(out)); // deux appareils ont dépensé : jamais de dette cachée
    var da = a.newDay === null ? -Infinity : a.newDay, db = b.newDay === null ? -Infinity : b.newDay;
    if (da === db) {
      out.newDay = a.newDay; out.newCount = Math.max(a.newCount, b.newCount);
      Object.keys(a.newBy).concat(Object.keys(b.newBy)).forEach(function (k) { out.newBy[k] = Math.max(a.newBy[k] || 0, b.newBy[k] || 0); });
    }
    else if (da > db) { out.newDay = a.newDay; out.newCount = a.newCount; out.newBy = JSON.parse(JSON.stringify(a.newBy)); }
    else { out.newDay = b.newDay; out.newCount = b.newCount; out.newBy = JSON.parse(JSON.stringify(b.newBy)); }
    var ids = {};
    Object.keys(a.notions).concat(Object.keys(b.notions)).forEach(function (id) { ids[id] = 1; });
    Object.keys(ids).forEach(function (id) {
      var x = a.notions[id], y = b.notions[id];
      out.notions[id] = !x ? y : (!y ? x : (y.rev > x.rev ? y : x));
    });
    var keys = {};
    Object.keys(a.seen).concat(Object.keys(b.seen)).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) { out.seen[k] = Math.max(a.seen[k] || 0, b.seen[k] || 0); });
    return out;
  }

  function gapFor(stage) { return stage >= MAX_STAGE ? REPEAT_GAP : GAPS[stage]; }

  /* Prochaine échéance après une révision réussie (stage = nombre de réussites). */
  function dueAfter(n, today) {
    if (n.stage >= MAX_STAGE) return today + REPEAT_GAP;
    var t = n.learnedOn + CUM[n.stage];
    return t > today ? t : today + GAPS[n.stage];
  }

  /* La notion vient d'être apprise (ou réapprise) sans faute et comprise. */
  function learn(state, id, today) {
    var prev = state.notions[id] || {};
    state.notions[id] = {
      status: "learned", stage: 0, learnedOn: today, lastReview: today,
      due: today + CUM[0], lapses: prev.lapses || 0, rev: (prev.rev || 0) + 1
    };
    return state.notions[id];
  }

  /* Résultat d'une vraie révision (notion due). */
  function review(state, id, ok, today) {
    var n = state.notions[id];
    if (!n) return null;
    if (ok) {
      n.stage = Math.min(n.stage + 1, MAX_STAGE);
      n.status = "learned";
      n.lastReview = today;
      n.due = dueAfter(n, today);
    } else {
      n.stage = 0;
      n.status = "relearn";
      n.lapses = (n.lapses || 0) + 1;
      n.lastReview = today;
      n.due = today;
    }
    n.rev = (n.rev || 0) + 1;
    return n;
  }

  function isDue(n, today) {
    return !!n && n.status === "learned" && n.due <= today;
  }

  /* Ce qu'il y a à faire aujourd'hui. cap = nombre maximum de révisions par séance. */
  function todayPlan(state, notions, today, cap, subj) {
    var order = {};
    notions.forEach(function (n, i) { order[n.id] = i; });
    var due = [], relearn = [];
    Object.keys(state.notions).forEach(function (id) {
      if (order[id] === undefined) return; // notion retirée du cours
      var n = state.notions[id];
      if (!n) return;
      if (n.status === "relearn") relearn.push(id);
      else if (isDue(n, today)) due.push(id);
    });
    due.sort(function (a, b) { return (state.notions[a].due - state.notions[b].due) || (order[a] - order[b]); });
    relearn.sort(function (a, b) { return order[a] - order[b]; });
    var c = cap || 6;
    return {
      reviews: due.slice(0, c),
      overflow: Math.max(0, due.length - c),
      relearn: relearn,
      newId: newAllowed(state, today, subj) ? nextNewId(state, notions) : null
    };
  }

  /* Une nouvelle notion par jour et par matière : « maths » (par défaut) utilise le compteur d'origine. */
  function newAllowed(state, today, subj) {
    var c = 0;
    if (state.newDay === today) c = (!subj || subj === "maths") ? state.newCount : ((state.newBy && state.newBy[subj]) || 0);
    return c < state.settings.newPerDay;
  }

  function nextNewId(state, notions) {
    for (var i = 0; i < notions.length; i++) {
      if (!state.notions[notions[i].id]) return notions[i].id;
    }
    return null;
  }

  function markNew(state, today, subj) {
    if (state.newDay !== today) { state.newDay = today; state.newCount = 0; state.newBy = {}; }
    if (!subj || subj === "maths") state.newCount += 1;
    else { state.newBy = state.newBy || {}; state.newBy[subj] = (state.newBy[subj] || 0) + 1; }
  }

  /* ---------- jetons, bouclier de série, étoiles ---------- */
  function spent(state) {
    var t = state.tok, sum = t.shBought * SHIELD_PRICE;
    Object.keys(t.buys).forEach(function (k) { sum += t.buys[k]; });
    return sum;
  }
  function tokensNow(state) { return Math.max(0, state.tok.earned - spent(state)); }
  function shieldsAvail(state) { return Math.max(0, state.tok.shBought - state.tok.shUsed); }
  function owns(state, key) { return Object.prototype.hasOwnProperty.call(state.tok.buys, key); }

  /* Achète un objet (fiche, apparence). Renvoie "ok", "deja" ou "cher". */
  function buy(state, key, price) {
    if (owns(state, key)) return "deja";
    if (tokensNow(state) < price) return "cher";
    state.tok.buys[key] = price;
    return "ok";
  }
  function buyShield(state) {
    if (shieldsAvail(state) >= SHIELD_MAX) return "plein";
    if (tokensNow(state) < SHIELD_PRICE) return "cher";
    state.tok.shBought += 1;
    return "ok";
  }

  /* Appelé à chaque activité. Premier appel du jour : série + jetons. Renvoie { tokens, bonus, shield } ou null. */
  function touchStreak(state, today) {
    var s = state.streak;
    if (s.last !== null && today <= s.last) return null; // même jour, ou horloge reculée : rien à gagner
    var shield = false;
    if (s.last === today - 1) s.count += 1;
    else if (s.last === today - 2 && shieldsAvail(state) > 0) { s.count += 1; state.tok.shUsed += 1; shield = true; }
    else s.count = 1;
    s.last = today;
    if (s.count > (s.best || 0)) s.best = s.count;
    var bonus = s.count % 7 === 0 ? WEEK_BONUS : 0, gain = DAILY + bonus;
    state.tok.earned += gain;
    return { tokens: gain, bonus: bonus, shield: shield };
  }

  function streakNow(state, today) {
    var s = state.streak;
    if (s.last !== null && s.last >= today - 1) return s.count; // inclut un dernier jour « dans le futur » (changement de fuseau, vol retour)
    if (s.last === today - 2 && shieldsAvail(state) > 0) return s.count;
    return 0;
  }

  /* Étoiles d'une notion : 0 si à réapprendre, 1 dès qu'elle est apprise, 2 après J+3, 3 après J+14. */
  function starsOf(n) {
    if (!n || n.status !== "learned") return 0;
    return n.stage >= 3 ? 3 : (n.stage >= 1 ? 2 : 1);
  }
  function totalStars(state, notions) {
    var t = 0;
    notions.forEach(function (x) { t += starsOf(state.notions[x.id]); });
    return t;
  }

  function markSeen(state, nid, exId) {
    var k = nid + "/" + exId;
    state.seen[k] = (state.seen[k] || 0) + 1;
  }

  /* Choisit n exercices : d'abord ceux qu'on a le moins vus. */
  function pickExercises(notion, state, n, rng, mustIds) {
    rng = rng || Math.random;
    var must = [];
    (mustIds || []).forEach(function (id) {
      for (var i = 0; i < notion.exercises.length; i++) {
        var e = notion.exercises[i];
        if (e.id === id && must.indexOf(e) < 0 && must.length < n) must.push(e);
      }
    });
    /* Niveaux : e.lvl = 1 (facile), 2 (normal, par défaut) ou 3 (difficile).
       Révision (1 question) : jamais de niveau 3 s'il existe autre chose.
       Série : au moins 2 faciles si possible, rangés du plus facile au plus difficile. */
    var lv = function (e) { return e.lvl || 2; };
    var pool = notion.exercises.filter(function (e) { return must.indexOf(e) < 0; });
    if (n === 1 && !must.length) { var okp = pool.filter(function (e) { return lv(e) < 3; }); if (okp.length) pool = okp; }
    var arr = pool.map(function (e) { return { e: e, k: (state.seen[notion.id + "/" + e.id] || 0) + rng() * 0.9 }; });
    arr.sort(function (a, b) { return a.k - b.k; });
    var take = Math.max(0, Math.min(n - must.length, arr.length));
    var rest = arr.slice(0, take).map(function (x) { return x.e; });
    var left = arr.slice(take).map(function (x) { return x.e; });
    if (n >= 4) {
      var easyLeft = left.filter(function (e) { return lv(e) === 1; });
      var easyIn = rest.filter(function (e) { return lv(e) === 1; }).length;
      while (easyIn < 2 && easyLeft.length) {
        var worst = -1;
        for (var q = 0; q < rest.length; q++) if (lv(rest[q]) > 1 && (worst < 0 || lv(rest[q]) >= lv(rest[worst]))) worst = q;
        if (worst < 0) break;
        rest[worst] = easyLeft.shift(); easyIn++;
      }
    }
    if (n >= 4) {
      /* pas plus de 2 exercices difficiles dans une série (les repêchés comptent) */
      var hardLeft = left.filter(function (e) { return lv(e) < 3 && rest.indexOf(e) < 0; });
      var hardIn = must.concat(rest).filter(function (e) { return lv(e) === 3; }).length;
      for (var h = rest.length - 1; h >= 0 && hardIn > 2 && hardLeft.length; h--) {
        if (lv(rest[h]) === 3) { rest[h] = hardLeft.shift(); hardIn--; }
      }
    }
    var out = must.concat(rest).map(function (e, i) { return { e: e, i: i }; });
    out.sort(function (a, b) { return lv(a.e) - lv(b.e) || a.i - b.i; });
    return out.map(function (x) { return x.e; });
  }

  /* ---------- réponses numériques ---------- */
  function normAns(s) {
    return String(s).toLowerCase().replace(/\s+/g, "").replace(/,/g, ".").replace(/[−–—]/g, "-").replace(/^[^=]*=/, "");
  }

  /* Lit un nombre : « 3 », « -2,5 », « +3 », « .01 », « 3. », « 1/8 », « x = 3 », « Δ = 1 ». Sinon null. */
  function parseNum(s) {
    var x = normAns(s).replace(/^\+/, "");
    if (/^-?(\d+\.?\d*|\.\d+)$/.test(x)) return parseFloat(x);
    var m = x.match(/^(-?\d+)\/(\d+)$/);
    if (m && +m[2] !== 0) return +m[1] / +m[2];
    return null;
  }

  function isNumericInput(s) { return parseNum(s) !== null; }

  function expectsNumber(ex) {
    return [].concat(ex.a).every(function (a) { return parseNum(a) !== null; });
  }

  function checkNum(ex, input) {
    var x = normAns(input);
    if (x === "") return false;
    var v = parseNum(input);
    return [].concat(ex.a).some(function (a) {
      var na = parseNum(a);
      if (v !== null && na !== null) return Math.abs(na - v) <= (ex.tol || 1e-9);
      return normAns(a) === x;
    });
  }

  /* ---------- code de sauvegarde ---------- */
  function encodeBackup(state) {
    var json = JSON.stringify(state);
    var b64 = (typeof btoa === "function") ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, "utf8").toString("base64");
    return "MQ1:" + b64;
  }

  function decodeBackup(code) {
    try {
      code = String(code || "").replace(/\s+/g, "");
      if (code.indexOf("MQ1:") !== 0) return null;
      var b64 = code.slice(4);
      var json = (typeof atob === "function") ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, "base64").toString("utf8");
      var s = JSON.parse(json);
      if (!s || typeof s !== "object" || !s.notions || typeof s.notions !== "object") return null;
      return normalizeState(s);
    } catch (e) { return null; }
  }

  root.Engine = {
    GAPS: GAPS, CUM: CUM, REPEAT_GAP: REPEAT_GAP, MAX_STAGE: MAX_STAGE, STAGE_NAMES: STAGE_NAMES,
    dayIndex: dayIndex, fmtDay: fmtDay, newState: newState, normalizeState: normalizeState, merge: merge,
    gapFor: gapFor, learn: learn, review: review, isDue: isDue, todayPlan: todayPlan,
    newAllowed: newAllowed, nextNewId: nextNewId, markNew: markNew,
    touchStreak: touchStreak, streakNow: streakNow, markSeen: markSeen,
    DAILY: DAILY, WEEK_BONUS: WEEK_BONUS, SHIELD_PRICE: SHIELD_PRICE, SHIELD_MAX: SHIELD_MAX, THEMES: THEMES, ACCENTS: ACCENTS,
    spent: spent, tokensNow: tokensNow, shieldsAvail: shieldsAvail, owns: owns, buy: buy, buyShield: buyShield,
    starsOf: starsOf, totalStars: totalStars,
    pickExercises: pickExercises, checkNum: checkNum, parseNum: parseNum, isNumericInput: isNumericInput,
    expectsNumber: expectsNumber, normAns: normAns,
    encodeBackup: encodeBackup, decodeBackup: decodeBackup
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.Engine;
})(typeof window !== "undefined" ? window : globalThis);
