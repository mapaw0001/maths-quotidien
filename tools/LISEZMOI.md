# Outils de reconstruction

Ce dossier sert à reconstruire le site (chiffrement des cours, service worker, page d'accueil, icônes).
**Il ne contient ni les cours (même chiffrés), ni la clé, ni le jeton.**

```
npm install
SRC=<dossier avec index.html, engine.js, lib.js, bloc*.js, meta.js> VERSION=5.0 OUT=<sortie> COURSES_OUT=<dépôt privé des cours> node build.js
KEY_FILE=<fichier clé> TOKEN_FILE=<fichier jeton> node make_qr.js
```

`build.js` écrit le site public dans OUT et le fichier de cours chiffré dans COURSES_OUT (dépôt PRIVÉ, lu par l'appli avec un jeton en lecture seule). Il garde la clé du fichier `.mq-secret/key.txt` (ou en crée une) ; `make_qr.js` fabrique le QR code (clé + jeton après le « # »).
Pour changer la clé (ancien QR code périmé) : `NEW_KEY=1`.
