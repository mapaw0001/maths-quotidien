/* Construit le dépôt GitHub Pages (code seul) dans OUT (par défaut ./maths-pages) ET le fichier de cours chiffré dans COURSES_OUT.
   Usage : SRC=<sources> OUT=<sortie> [COURSES_OUT=<dossier du dépôt PRIVÉ des cours>] [MQ_KEY=<clé existante>] [NEW_KEY=1] node build.js
   Les cours (bloc1.js, bloc1b.js, bloc-elec1.js, bloc-elec2.js, meta.js) sont chiffrés (AES-256-GCM) : jamais écrits en clair, et le fichier chiffré
   n'est PAS dans OUT (dépôt public) : il va dans COURSES_OUT (dépôt privé, lu avec un jeton qui est dans le QR code).
   La clé (32 octets au hasard, en base64url) va dans le QR code. Elle est écrite dans KEY_FILE, HORS de OUT, et n'est jamais affichée. */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const SRC = process.env.SRC;                                         // dossier avec index.html, engine.js, lib.js, bloc*.js, meta.js
const OUT = process.env.OUT || path.resolve("maths-pages");
if (!SRC) { console.error("SRC manquant (dossier des sources de l'appli)"); process.exit(1); }
const VERSION = process.env.VERSION || "6.0";
const DATE = process.env.BUILD_DATE || "26/11/2026";
const COURSES_OUT = process.env.COURSES_OUT || path.join(path.dirname(path.resolve(OUT)), "maths-cours");
const COURSES_REPO = process.env.COURSES_REPO || "mapaw0001/maths-quotidien-cours", COURSES_PATH = process.env.COURSES_PATH || "content.enc.json", COURSES_REF = process.env.COURSES_REF || "main";
if (path.resolve(COURSES_OUT) === path.resolve(OUT) || path.resolve(COURSES_OUT).startsWith(path.resolve(OUT) + path.sep)) { console.error("COURSES_OUT ne doit pas être dans OUT (dépôt public)"); process.exit(1); }
const SITE_URL = process.env.SITE_URL || "https://mapaw0001.github.io/maths-quotidien/", APK_ID = "io.github.mapaw0001.mathsquotidien";
const APK_URL = process.env.APK_URL || "https://github.com/mapaw0001/maths-quotidien/releases/latest/download/maths-quotidien.apk";
const KEY_FILE = process.env.KEY_FILE || path.join(path.dirname(path.resolve(OUT)), ".mq-secret", "key.txt");
if (path.resolve(KEY_FILE).startsWith(path.resolve(OUT) + path.sep)) { console.error("KEY_FILE ne doit pas être dans OUT"); process.exit(1); }
let KEY = process.env.MQ_KEY;
if (!KEY && fs.existsSync(KEY_FILE) && !process.env.NEW_KEY) KEY = fs.readFileSync(KEY_FILE, "utf8").trim();   // même clé = même QR code, sauf NEW_KEY=1
if (!KEY) KEY = crypto.randomBytes(32).toString("base64url");
if (!/^[A-Za-z0-9_-]{20,80}$/.test(KEY)) { console.error("clé invalide"); process.exit(1); }
fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true }); fs.writeFileSync(KEY_FILE, KEY + "\n", { mode: 0o600 });
const NM = path.join(__dirname, "node_modules");
const rd = (f) => fs.readFileSync(f, "utf8");
const wr = (rel, data) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
const sub = (t) => t.replace(/__VERSION__/g, VERSION);

fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

/* 1. cours chiffrés : un seul paquet, dans l'ordre des balises de index.html */
const BLOCS = ["bloc1.js", "bloc1b.js", "bloc-elec1.js", "bloc-elec2.js", "meta.js"];
const plain = BLOCS.map((f) => rd(path.join(SRC, f))).join("\n;\n");
const ITER = 600000;                                                                      // clé de 256 bits au hasard + 600 000 tours : double verrou, même si l'un des deux était un jour affaibli
const sha12 = (t) => crypto.createHash("sha256").update(t).digest("hex").slice(0, 12);
const coursFile = path.join(COURSES_OUT, COURSES_PATH);
let id = null;
/* Cours inchangés + même clé : on GARDE le fichier chiffré déjà publié (même empreinte), pour que les élèves n'aient pas de mise à jour des cours pour rien. FORCE_REENCRYPT=1 pour refaire. */
if (!process.env.FORCE_REENCRYPT && fs.existsSync(coursFile)) {
  try {
    const o = JSON.parse(rd(coursFile)), raw = Buffer.from(o.data, "base64");
    const k2 = crypto.pbkdf2Sync(KEY, Buffer.from(o.salt, "base64"), o.iter, 32, "sha256");
    const d = crypto.createDecipheriv("aes-256-gcm", k2, Buffer.from(o.iv, "base64")); d.setAuthTag(raw.subarray(raw.length - 16));
    const pt = Buffer.concat([d.update(raw.subarray(0, raw.length - 16)), d.final()]).toString("utf8");
    if (pt === plain && o.id === sha12(o.data) && o.iter === ITER) { id = o.id; console.log("cours inchangés : fichier chiffré conservé (empreinte " + id + ")"); }
  } catch (e) { /* autre clé ou cours modifiés : on rechiffre */ }
}
if (!id) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(KEY, salt, ITER, 32, "sha256");
  const ci = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([ci.update(plain, "utf8"), ci.final(), ci.getAuthTag()]);
  const data = ct.toString("base64");
  id = sha12(data);
  fs.rmSync(coursFile, { force: true }); fs.mkdirSync(COURSES_OUT, { recursive: true });
  fs.writeFileSync(coursFile, JSON.stringify({ v: 1, alg: "AES-256-GCM", kdf: "PBKDF2-SHA256", iter: ITER, salt: salt.toString("base64"), iv: iv.toString("base64"), id, data }));
}

/* 2. appli */
let html = rd(path.join(SRC, "index.html"));
const tags = '<script src="engine.js"></script>\n<script src="lib.js"></script>\n' + BLOCS.map((f) => '<script src="' + f + '"></script>\n').join("");
if (!html.includes(tags)) throw new Error("balises script introuvables");
html = html.replace(tags, '<script src="mq.js"></script>\n<script src="engine.js"></script>\n<script src="lib.js"></script>\n');
html = html.replace("<title>Maths Quotidien</title>", '<title>Maths Quotidien</title>\n<meta name="theme-color" content="#070b12">\n<link rel="manifest" href="../manifest.webmanifest">\n<link rel="icon" href="../icons/icon-192.png" type="image/png">\n<link rel="apple-touch-icon" href="../icons/apple-touch-icon.png">\n<link rel="stylesheet" href="../fonts/fonts.css">');
const i0 = html.indexOf("<script>\n(function () {"), i1 = html.lastIndexOf("</script>\n</body>");
if (i0 < 0 || i1 < 0) throw new Error("script principal introuvable");
const main = html.slice(i0 + "<script>\n".length, i1);
html = html.slice(0, i0) + "<script>\nMQ.run(function () {\n" + main + "\n});\n" + html.slice(i1);
/* variante Pages : adresse de l'appli = celle du site, et plus de chargement de polices externes (elles sont hébergées) */
const reUrl = /var APP_URL = window\.MQ \? window\.MQ\.appUrl : "[^"]*";[^\n]*\n/;
if (!reUrl.test(html)) throw new Error("ligne APP_URL introuvable");
html = html.replace(reUrl, "var APP_URL = window.MQ.appUrl;\n");
const f0 = html.indexOf("  /* Polices Google"), f1 = html.indexOf("  var E = window.Engine;");
if (f0 < 0 || f1 < f0) throw new Error("chargeur de polices introuvable");
html = html.slice(0, f0) + html.slice(f1);
if (/googleapis|gstatic/.test(html)) throw new Error("appel externe restant dans app/index.html");
wr("app/index.html", html);
wr("app/engine.js", rd(path.join(SRC, "engine.js")));
wr("app/lib.js", rd(path.join(SRC, "lib.js")));
wr("app/mq.js", sub(rd(path.join(__dirname, "mq.js"))).replace(/__COURSES_REPO__/g, COURSES_REPO).replace(/__COURSES_PATH__/g, COURSES_PATH).replace(/__COURSES_REF__/g, COURSES_REF).replace(/__SITE_URL__/g, SITE_URL).replace(/__APK_URL__/g, APK_URL).replace(/__APK_ID__/g, APK_ID));

/* 3. polices hébergées */
const FONTS = [["lexend", "Lexend", [400, 500, 600, 700]], ["space-grotesk", "Space Grotesk", [600, 700]], ["jetbrains-mono", "JetBrains Mono", [500, 700]]];
const RANGE = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
let css = "/* Polices hébergées sur le site (licence SIL OFL 1.1, voir LICENSES.txt). Aucun appel à un site externe. */\n", lic = "";
const fontFiles = [];
for (const [pkg, fam, ws] of FONTS) {
  for (const w of ws) {
    const fn = `${pkg}-latin-${w}-normal.woff2`;
    fs.mkdirSync(path.join(OUT, "fonts"), { recursive: true });
    fs.copyFileSync(path.join(NM, "@fontsource", pkg, "files", fn), path.join(OUT, "fonts", fn));
    fontFiles.push("fonts/" + fn);
    css += `@font-face{font-family:'${fam}';font-style:normal;font-weight:${w};font-display:swap;src:url(${fn}) format('woff2');unicode-range:${RANGE}}\n`;
  }
  lic += `===== ${fam} =====\n` + rd(path.join(NM, "@fontsource", pkg, "LICENSE")) + "\n\n";
}
wr("fonts/fonts.css", css); wr("fonts/LICENSES.txt", lic);

/* 4. page d'accueil, icônes */
wr("index.html", sub(rd(path.join(__dirname, "landing.html"))).replace(/__APK_URL__/g, APK_URL));
wr("THIRD_PARTY.txt", "Polices : voir fonts/LICENSES.txt (SIL Open Font License 1.1)\nQR code : qrcode-generator (MIT), utilisé seulement dans tools/make_qr.js\n");
require("child_process").execFileSync("python3", [path.join(__dirname, "make_icons.py"), path.join(OUT, "icons")]);

/* 5. manifeste, version, service worker */
wr("manifest.webmanifest", JSON.stringify({
  name: "Maths Quotidien", short_name: "Maths", description: "1 notion par jour, 10 minutes, avec rappels espacés. Réservé aux étudiants du BUT R&T.", lang: "fr",
  id: (process.env.SITE_PATH || "/maths-quotidien/") + "app/", start_url: "./app/", scope: "./", display: "standalone", orientation: "portrait", background_color: "#070b12", theme_color: "#070b12",
  icons: [{ src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" }, { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }, { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }]
}, null, 2));
const NOTES = (process.env.NOTES ? JSON.parse(process.env.NOTES) : [
  "Nouveau : vraie appli Android (fichier APK) : icône, plein écran, l'appli est dans le téléphone.",
  "Scanne le QR code : il ouvre l'appli (ou la télécharge la 1re fois), puis les cours se téléchargent.",
  "Les cours ne sont pas dans l'appli ni sur le site public : ils se téléchargent avec ton QR code.",
  "À chaque lancement, l'appli cherche une mise à jour. Si elle existe, il faut la faire pour continuer (nouvelle appli à installer, tes cours et ta progression restent).",
  "Une fois téléchargés, les cours restent sur le téléphone : l'appli marche sans connexion.",
  "Ta progression est gardée à chaque mise à jour."
]);
const assets = ["./", "index.html", "app/", "app/index.html", "app/engine.js", "app/lib.js", "app/mq.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "fonts/fonts.css"].concat(fontFiles);
/* empreinte de construction : change dès qu'un fichier de l'appli change (sert au nom du cache et à détecter les mises à jour) */
const hh = crypto.createHash("sha256");
for (const a of assets.filter((x) => !x.endsWith("/"))) { hh.update(a + "\0"); hh.update(fs.readFileSync(path.join(OUT, a))); }
const BUILD = hh.digest("hex").slice(0, 10);
const mqf = path.join(OUT, "app/mq.js"); fs.writeFileSync(mqf, fs.readFileSync(mqf, "utf8").replace(/__BUILD__/g, BUILD));
wr("version.json", JSON.stringify({ version: VERSION, build: BUILD, date: DATE, min: VERSION, content: id, notes: NOTES }, null, 2));
wr("sw.js", sub(rd(path.join(__dirname, "sw.js"))).replace(/__BUILD__/g, BUILD).replace("__ASSETS__", JSON.stringify(assets)));
wr(".nojekyll", "");

/* 6. README et licence */
wr("README.md", sub(rd(path.join(__dirname, "README.md"))));
wr("LICENSE", rd(path.join(__dirname, "LICENSE")));

/* 6b. appli Android (coquille WebView) et recette de fabrication GitHub : le code de l'APK est public, les cours n'y sont jamais */
const copyTree = (from, to) => { for (const e of fs.readdirSync(from, { withFileTypes: true })) { const a = path.join(from, e.name), z = path.join(to, e.name); if (e.isDirectory()) { fs.mkdirSync(z, { recursive: true }); copyTree(a, z); } else { fs.mkdirSync(path.dirname(z), { recursive: true }); fs.copyFileSync(a, z); } } };
if (fs.existsSync(path.join(__dirname, "android-src"))) copyTree(path.join(__dirname, "android-src"), OUT);

/* 7. outils de reconstruction (sans les cours, sans la clé, sans la liste des mots interdits) */
for (const f of ["build.js", "mq.js", "sw.js", "landing.html", "make_icons.py", "make_qr.js", "README.md", "LICENSE"]) if (fs.existsSync(path.join(__dirname, f))) wr("tools/" + f, rd(path.join(__dirname, f)));
const dep = (n) => JSON.parse(rd(path.join(NM, n, "package.json"))).version;
wr("tools/package.json", JSON.stringify({ name: "maths-quotidien-tools", private: true, description: "Outils de reconstruction du site (sans les cours ni la clé)", dependencies: { "@fontsource/lexend": dep("@fontsource/lexend"), "@fontsource/space-grotesk": dep("@fontsource/space-grotesk"), "@fontsource/jetbrains-mono": dep("@fontsource/jetbrains-mono"), "qrcode-generator": dep("qrcode-generator") } }, null, 2));
wr("tools/LISEZMOI.md", "# Outils de reconstruction\n\nCe dossier sert à reconstruire le site (chiffrement des cours, service worker, page d'accueil, icônes).\n**Il ne contient ni les cours (même chiffrés), ni la clé, ni le jeton.**\n\n```\nnpm install\nSRC=<dossier avec index.html, engine.js, lib.js, bloc*.js, meta.js> VERSION=5.1 OUT=<sortie> COURSES_OUT=<dépôt privé des cours> node build.js\nKEY_FILE=<fichier clé> TOKEN_FILE=<fichier jeton> node make_qr.js\n```\n\n`build.js` écrit le site public dans OUT et le fichier de cours chiffré dans COURSES_OUT (dépôt PRIVÉ, lu par l'appli avec un jeton en lecture seule). Il garde la clé du fichier `.mq-secret/key.txt` (ou en crée une) ; `make_qr.js` fabrique le QR code (clé + jeton après le « # »).\nPour changer la clé (ancien QR code périmé) : `NEW_KEY=1`.\n");

/* 8. contrôle final : aucun mot du cours et aucune clé dans les fichiers publics */
const FB = path.join(__dirname, "forbidden-words.txt");
const words = fs.existsSync(FB) ? rd(FB).split(/\r?\n/).map((x) => x.trim().toLowerCase()).filter(Boolean) : [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(OUT), bad = [];
for (const f of files) {
  if (/\.(png|woff2|p12)$/.test(f)) continue;
  const t = rd(f), tl = t.toLowerCase();
  if (t.includes(KEY)) bad.push(path.relative(OUT, f) + " : contient la clé");
  if (/content\.enc\.json$/.test(f) || /"alg"\s*:\s*"aes-256-gcm"/.test(tl)) bad.push(path.relative(OUT, f) + " : fichier de cours chiffré dans le dépôt public");
  for (const w of words) if (tl.includes(w)) bad.push(path.relative(OUT, f) + " : mot du cours « " + w + " »");
}
if (bad.length) { console.error("ÉCHEC du contrôle des fichiers publics :\n" + bad.join("\n")); process.exit(2); }
console.log("contrôle : " + words.length + " mots du cours cherchés dans " + files.length + " fichiers publics : aucun trouvé ; clé absente ; aucun fichier de cours chiffré");
console.log("cours chiffrés écrits dans " + path.join(COURSES_OUT, COURSES_PATH) + " (à pousser dans le dépôt PRIVÉ " + COURSES_REPO + ")");
console.log("OK version", VERSION, "| build", BUILD, "| contenu", id, "| fichiers :", fs.readdirSync(OUT).join(", "));
