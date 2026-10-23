# Co-évaluation Bac EPS — Musculation CA5

Application web (hors connexion) pour co-évaluer l'épreuve de musculation du bac
à plusieurs évaluateurs, selon la grille FCE Musculation CA5.

0. **Préparer** (avant l'épreuve) — le professeur note la répartition AFL2/AFL3, le thème, le rôle
   et les critères AFL2/AFL3, puis transmet au co-évaluateur (onglet Échanger, « Préparer le co-évaluateur » :
   QR, fichier ou code) la liste des candidats et ces données, **jamais ses notes AFL1**.
   Sur un téléphone vierge, le co-évaluateur choisit « Je suis co-évaluateur : recevoir la préparation » :
   l'épreuve est créée, ses fiches sont pré-remplies et verrouillées (« Modifier ces données » reste possible),
   il ne lui reste qu'à évaluer l'AFL1.
1. **Évaluer** — chaque évaluateur note sur son appareil, sans voir l'autre :
   thème, répartition AFL2/AFL3 (4-4, 6-2, 2-6), rôle AFL3, puis degré et note de chaque critère.
   « Terminer mon évaluation » vérifie la fiche, affiche un récapitulatif, la verrouille et garde
   une copie de l'évaluation initiale. Une fiche rouverte est tracée dans l'historique.
2. **Échanger** — QR codes (8 candidats par QR, dans n'importe quel ordre, lots manquants signalés),
   QR d'un seul candidat, fichier JSON (avec les remarques) ou code à coller.
   Une fiche plus ancienne n'écrase jamais une fiche plus récente.
3. **Croiser** — tableau de bord (compteurs, filtres, tri par priorité, « Candidats à harmoniser »),
   puis harmonisation critère par critère :
   - ✓ accord · ≈ écart de points (même degré, ≥ 0,5 pt) · ≠ désaccord de degré · ‼ désaccord majeur (≥ 2 degrés) · … incomplet ;
   - en cas de désaccord de degré, aucune note automatique : le jury choisit **d'abord le degré**
     (descripteurs de chacun côte à côte), **puis la note** dans la plage de ce degré ;
     la moyenne n'est proposée que si elle appartient au degré retenu ;
   - thème, répartition et rôle différents : à trancher avant validation ;
   - validation explicite (note figée), modifiable avec confirmation ; tout est historisé.
   Bilan du jury (concordance, export anonymisé), exports CSV (synthèse, détail par critère,
   historique), fiches imprimables par candidat.

La liste des élèves s'importe en CSV (export Pronote accepté tel quel : nom en colonne A,
classe si une colonne « Classe » existe).

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
- `sw.js`, `manifest.webmanifest` — installation et fonctionnement hors connexion
- `qrcode.js` — génération des QR ([qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator), MIT)
- `jsQR.js` — lecture des QR ([jsQR](https://github.com/cozmo/jsQR), Apache-2.0)
- `tests/` — tests du noyau : `node --test tests/*.test.js` (Node 18+, aucune dépendance)

Site statique : aucun build, à publier tel quel (Vercel, GitHub Pages…). La caméra exige HTTPS
(fourni d'office par Vercel). Sur Vercel : projet de type « Other », sans commande de build, répertoire racine du dépôt ;
`.vercelignore` exclut les tests de la publication.
