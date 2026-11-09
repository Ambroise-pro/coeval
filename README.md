# Co-évaluation Bac EPS — Musculation CA5

Application web (hors connexion) pour co-évaluer l'épreuve de musculation du bac
à plusieurs évaluateurs, selon la grille FCE Musculation CA5.

Au démarrage, chacun choisit son rôle ; les deux parcours sont distincts.

**Professeur de la classe** — onglets *Préparer · Évaluer · Croiser*
1. **Préparer** (avant l'épreuve) : liste de la classe (CSV Pronote), puis pour chaque élève thème, répartition
   AFL2/AFL3, rôle et critères AFL2/AFL3. « Transmettre au co-évaluateur » affiche les QR (ou fichier, code) :
   la classe et ces données, **jamais l'AFL1**.
2. **Évaluer** (jour de l'épreuve) : l'AFL1 seulement (curseur par critère, cases de degré avec les critères au-dessus).
   « Terminer » vérifie la fiche, la verrouille et garde la version initiale.
3. **Croiser** : recevoir l'évaluation du co-évaluateur (QR, fichier, code), puis tableau de bord, validation groupée
   des accords, harmonisation enchaînée (degré puis note, ou « Retenir » la note d'un évaluateur en un toucher),
   récapitulatif élève par élève, procès-verbal, exports, sauvegarde.

**Co-évaluateur** — onglets *Recevoir · Évaluer · Envoyer*
1. **Recevoir** la préparation du professeur : l'épreuve et les fiches (répartition, AFL2/AFL3) sont créées.
2. **Évaluer** l'AFL1 (l'AFL2/AFL3 du professeur n'apparaît pas).
3. **Envoyer** son évaluation au professeur (QR, fichier avec remarques, code), et sauvegarder.

Le rôle se change dans « Candidats ». Une fiche plus ancienne n'écrase jamais une fiche plus récente.

La liste des élèves s'importe en CSV (export Pronote accepté tel quel : nom en colonne A,
classe si une colonne « Classe » existe).

## Essayer avec une classe d'exemple

Sur l'écran d'accueil (ou dans « Candidats »), **« Essayer avec une classe d'exemple (28 élèves) »** crée une épreuve
marquée EXEMPLE : élèves et collègue fictifs, préparation AFL2/AFL3 faite, fiches AFL1 à tous les stades,
accords, écarts de points, désaccords de degré (dont un majeur), choix différents, deux notes déjà validées.
Elle se supprime comme une autre épreuve. La même liste existe au format Pronote :
`exemples/classe-TG2-exemple.csv`, pour tester l'import.

## Données

Tout reste dans le navigateur de chaque appareil (localStorage), rien n'est envoyé à un service extérieur.
**« Sauvegarder l'épreuve »** (onglet Échanger) produit un fichier complet : candidats, fiches et leur
version initiale, évaluations reçues, décisions, notes validées, historique.
« Restaurer une sauvegarde » vérifie le fichier, affiche un aperçu, puis fusionne ou remplace.

Sans serveur, une note validée sur un appareil ne se reporte pas seule sur les autres :
l'appareil du jury qui harmonise fait foi, et sa sauvegarde, restaurée en fusion sur un autre appareil,
y transmet les décisions. L'historique est déclaratif (nom saisi, pas d'authentification).

Les données de la version 1 sont migrées automatiquement au premier lancement ; une copie
de sécurité est gardée sous la clé `df-coeval-v1-avant-v2`.

## Fichiers

- `index.html`, `coeval.js`, `coeval.css` — l'application
- `coeval-core.js` — grille, calculs, croisement, échanges, sauvegardes, migration (sans interface, testé)
- `coeval-demo.js` — classe d'exemple de 28 élèves fictifs ; `exemples/` — la même liste en CSV
- `sw.js`, `manifest.webmanifest` — installation et fonctionnement hors connexion
- `qrcode.js` — génération des QR ([qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator), MIT)
- `jsQR.js` — lecture des QR ([jsQR](https://github.com/cozmo/jsQR), Apache-2.0)
- `tests/` — tests du noyau : `node --test tests/*.test.js` (Node 18+, aucune dépendance)

Site statique : aucun build, à publier tel quel (Vercel, GitHub Pages…). La caméra exige HTTPS
(fourni d'office par Vercel). Sur Vercel : projet de type « Other », sans commande de build, répertoire racine du dépôt ;
`.vercelignore` exclut les tests de la publication.

## Organisation et confort de saisie

L’onglet **Vue d’ensemble** présente les préparations, les évaluations terminées,
les fiches reçues et les élèves encore attendus. Il propose la prochaine action.
La recherche par nom ou classe et le filtre de groupe sont accessibles dans la
liste des élèves. Dans **Candidats → Modifier**, on peut corriger un nom, renseigner
la classe, le groupe, l’ordre de passage et la situation administrative.

Les situations **Absent**, **Dispensé** et **Passage reporté** sont des annotations
locales : elles ne créent pas de zéro, ne suppriment pas les notes et excluent
l’élève du suivi des passages attendus et des validations groupées. Revenir à
**À évaluer** permet de reprendre la saisie. Groupe, situation et retour écrit
sont inclus dans les sauvegardes complètes, mais pas dans les échanges QR de notes.
Pour les homonymes, utiliser des suffixes identiques sur les deux appareils.
Un nom corrigé garde ses anciens noms pour reconnaître les échanges ultérieurs.

Le **mode Passage** garde l’identité de l’élève visible. Les descriptions de chaque
degré restent toujours affichées avec le curseur de notation en dessous, y compris
en mode Passage. Il n’y a plus de mode de saisie par cases de points.
**Annuler la dernière saisie** restaure la dernière note ou le dernier choix de
la fiche tant qu’aucune autre modification de cette fiche n’est intervenue.

## Enregistrement, sauvegarde et récupération

- **Enregistré sur cet appareil** décrit l’enregistrement local automatique.
  Un échec produit une alerte persistante invitant à exporter immédiatement.
- Une **copie de secours** est un fichier séparé. Un partage annulé n’est jamais
  annoncé comme réussi. Pour un téléchargement, vérifier le fichier puis cliquer
  sur **J’ai vérifié le fichier** ; l’application ne peut pas vérifier elle-même
  sa conservation. **Télécharger directement** évite le partage natif si nécessaire.
- Une suppression place l’élève et ses notes, ou l’épreuve entière, dans la
  **corbeille**. La restauration refuse d’écraser un homonyme ou des notes reçues
  depuis la suppression. La corbeille des élèves fait partie de la sauvegarde de
  l’épreuve ; celle des épreuves reste locale à cet appareil.
- **Archiver** retire une épreuve de la liste active. **Archives et corbeille**
  permet de la rouvrir. Remplacer une épreuve par une sauvegarde conserve l’état
  précédent dans la corbeille.

## Réception et retour aux élèves

Les listes CSV et les échanges de notes (QR, fichier ou code) présentent un
**aperçu avant confirmation**. Annuler ne modifie aucune donnée. La réception
recalcule les changements au moment de confirmer. Pour un lot de QR, confirmer
chaque partie puis choisir **Scanner le QR suivant**.

Après réception, le professeur peut produire un **accusé de réception** : le
co-évaluateur scanne son QR ou colle son code dans **Envoyer**. Ce reçu vérifie
l’épreuve, le destinataire et le contenu des notes reçues. Il ne garantit pas
l’identité de l’auteur et ne confirme pas la réception des remarques : celles-ci
voyagent uniquement par fichier. Modifier les notes rend le reçu précédent obsolète.

Dans **Croiser → Bilan, exports, impression**, rédiger les retours aux élèves puis
imprimer les fiches de retour. Elles contiennent les notes validées et les commentaires
expressément destinés à l’élève, sans l’historique ni les remarques privées du jury.
L’impression du navigateur permet également d’enregistrer un PDF.

**Avant l’épreuve** vérifie la présence des fichiers hors connexion et permet de
tester la caméra (arrêtée à la fermeture du dialogue). Un essai réel en mode avion
et sur les appareils utilisés reste recommandé avant l’épreuve.

## Développement et tests

`coeval-workflow.js` contient les fonctions testables d’organisation, d’aperçu,
de corbeille et d’accusé de réception. Aucun service ni build n’est nécessaire.

```sh
node --test tests/*.test.js
python3 -m http.server 8000 --bind 127.0.0.1
```

Les deux scénarios navigateur utilisent Playwright et Chromium, installés
séparément des dépendances de l’application. Depuis un autre terminal :

```sh
npm install --prefix /tmp/coeval-browser --cache /tmp/coeval-npm-cache playwright@1.65.0
NODE_PATH=/tmp/coeval-browser/node_modules node tests/browser-smoke.cjs
NODE_PATH=/tmp/coeval-browser/node_modules node tests/browser-exchange.cjs
```

Chromium est recherché dans `/usr/bin/chromium` ; définir `CHROMIUM_PATH` si besoin.
Les profils de test sont isolés. Les scénarios vérifient notamment le rechargement
hors connexion, les échanges entre deux profils, les sauvegardes annulées, les
échecs de stockage, la corbeille et les fiches imprimées. La caméra du scénario
est simulée ; cela ne remplace pas un essai physique.
