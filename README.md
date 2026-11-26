# Maths Quotidien

**1 notion par jour et par matière, 10 minutes.** Appli de révision façon « petite leçon + exercices »,
avec rappels espacés (J+3, J+7, J+14, J+30, J+90). Réservée aux étudiants du BUT Réseaux et Télécommunications.

➡️ **Page d'accueil et installation : voir `index.html` (GitHub Pages).**

Version 5.0.

## Les cours ne sont pas dans ce dépôt (même chiffrés)
Ce dépôt contient seulement la **coquille** de l'appli. Sans le **QR code des cours**, l'appli affiche
« Cours réservés aux étudiants du BUT R&T » et aucun cours.
Les cours sont **chiffrés** (AES-256-GCM) et rangés dans un **dépôt privé**. Le QR code contient un lien avec,
après le `#` (le navigateur ne l'envoie jamais au serveur), la **clé** de déchiffrement et un **jeton en lecture seule** pour télécharger le fichier.
Scanner le QR code télécharge les cours puis les déchiffre **sur le téléphone**. Ils restent ensuite sur l'appareil (l'appli marche hors ligne).

## Installer
1. Ouvre la page d'accueil dans **Chrome** (Android) et installe l'appli (menu ⋮ › *Installer l'application*).
2. **Scanne le QR code** des cours avec l'appareil photo, ouvre le lien : les cours se téléchargent.

## Mises à jour (obligatoires)
À **chaque lancement**, l'appli lit `version.json`. S'il y a une nouvelle version ou de nouveaux cours, un écran « Mise à jour obligatoire » demande de la télécharger avant de continuer (la progression est gardée).
Sans connexion, on ne peut pas savoir : l'appli s'ouvre avec ce qu'elle a. Si le QR code est périmé (clé changée, jeton expiré), il faut scanner le nouveau.
Bouton **Forcer la mise à jour** sur la page d'accueil : la progression n'est pas effacée.

## Vie privée
Pas de compte, pas de cookie, aucun pistage ajouté par l'appli. La progression et les cours déchiffrés
restent dans le stockage local du navigateur du téléphone (copie possible de la progression avec le code de sauvegarde, dans Profil).
Les polices sont hébergées ici. Seul appel externe : `api.github.com`, pour télécharger les cours avec le jeton. GitHub voit l'adresse IP des visites (voir la politique de GitHub).

## Chiffrement, et ses limites
Le fichier de cours est chiffré en AES-256-GCM, avec une clé de 256 bits tirée au hasard, dérivée avec PBKDF2-SHA256 (600 000 tours).
Limites : quiconque a le QR code a la clé **et** le jeton : **ne le partage pas**. En cas de fuite : nouvelle clé, nouveau jeton, nouveau QR code (l'ancien ne donne plus rien).
Le jeton est en lecture seule, limité au seul dépôt des cours, et expire (1 an maximum) : le renouveler avant la date.

## Licence
Tous droits réservés (voir `LICENSE`). Appli personnelle de l'auteur : ne pas copier ni redistribuer.

## Fichiers
- `index.html` : page d'accueil, installation, version
- `app/` : l'application (`mq.js` = accès par QR code, mises à jour obligatoires, installation)
- `sw.js`, `manifest.webmanifest` : installation et fonctionnement hors ligne
- `version.json` : version, empreinte de build, date, nouveautés
- `tools/` : de quoi reconstruire le site (sans les cours, sans la clé, sans le jeton)
