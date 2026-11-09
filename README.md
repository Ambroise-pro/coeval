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
