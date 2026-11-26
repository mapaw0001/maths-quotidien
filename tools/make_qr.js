/* Fabrique le QR code des cours (lien + clé k + jeton de lecture t après le « # »).
   Usage : KEY_FILE=<fichier clé> TOKEN_FILE=<fichier jeton> [SITE=<adresse du site>] [OUTDIR=<dossier>] node make_qr.js
   Le QR code contient la clé ET le jeton : à garder PRIVÉ, jamais dans le dépôt. Sorties : cours-qr.png, cours-qr.svg (dans OUTDIR, par défaut à côté du fichier clé). */
const fs = require("fs"), path = require("path"), zlib = require("zlib"), cp = require("child_process");
const qrcode = require(path.join(__dirname, "node_modules", "qrcode-generator"));
const KEY_FILE = process.env.KEY_FILE || path.join(path.dirname(path.resolve(process.env.OUT || "maths-pages")), ".mq-secret", "key.txt");
const SITE = (process.env.SITE || "https://mapaw0001.github.io/maths-quotidien/").replace(/\/?$/, "/");
const OUTDIR = process.env.OUTDIR || path.join(path.dirname(KEY_FILE), "qr");
const TOKEN_FILE = process.env.TOKEN_FILE || path.join(path.dirname(KEY_FILE), "token.txt");
const KEY = fs.readFileSync(KEY_FILE, "utf8").trim(), TOKEN = fs.readFileSync(TOKEN_FILE, "utf8").trim();
if (!/^[A-Za-z0-9_-]{20,80}$/.test(KEY)) { console.error("clé invalide"); process.exit(1); }
if (!/^[A-Za-z0-9_]{30,200}$/.test(TOKEN)) { console.error("jeton invalide"); process.exit(1); }
const url = SITE + "app/#k=" + KEY + "&t=" + TOKEN;
const qr = qrcode(0, "M"); qr.addData(url); qr.make();
const n = qr.getModuleCount(), quiet = 4, scale = Math.max(8, Math.floor(1000 / (n + 2 * quiet))), size = (n + 2 * quiet) * scale;
fs.mkdirSync(OUTDIR, { recursive: true });
/* PNG en niveaux de gris, sans dépendance */
const rows = []; for (let y = 0; y < size; y++) { const r = Buffer.alloc(1 + size, 255); r[0] = 0; const my = Math.floor(y / scale) - quiet; if (my >= 0 && my < n) for (let x = 0; x < size; x++) { const mx = Math.floor(x / scale) - quiet; if (mx >= 0 && mx < n && qr.isDark(my, mx)) r[1 + x] = 0; } rows.push(r); }
const crcT = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[i] = c >>> 0; }
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 0;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(Buffer.concat(rows), { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
const pngFile = path.join(OUTDIR, "cours-qr.png"); fs.writeFileSync(pngFile, png, { mode: 0o600 });
let path_d = ""; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) path_d += "M" + (x + quiet) + " " + (y + quiet) + "h1v1h-1z";
fs.writeFileSync(path.join(OUTDIR, "cours-qr.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * quiet} ${n + 2 * quiet}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path_d}" fill="#000"/></svg>\n`, { mode: 0o600 });
/* contrôle : on relit l'image comme le ferait un téléphone */
let check = "non vérifié (OpenCV absent)";
try {
  const out = cp.execFileSync("python3", ["-I", "-c", "import sys,cv2\nim=cv2.imread(sys.argv[1])\nt,_,_=cv2.QRCodeDetector().detectAndDecode(im)\nprint(t)", pngFile], { encoding: "utf8" }).trim();
  check = out === url ? "relu à l'identique" : "ÉCHEC : le QR relu est différent"; if (out !== url) { console.error(check); process.exit(3); }
} catch (e) { if (!/No module named|ENOENT/.test(String(e.stderr || e.message))) { console.error("contrôle impossible :", e.message); } }
console.log("QR code :", pngFile, "|", n + "x" + n + " modules, niveau M, " + size + " px |", check);
