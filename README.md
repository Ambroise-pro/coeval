# Co-évaluation Bac EPS — Musculation CA5

Application web (hors connexion) pour co-évaluer l'épreuve de musculation du bac
à plusieurs évaluateurs, selon la grille FCE Musculation CA5.

1. **Évaluer** — chaque évaluateur note sur son appareil, sans voir l'autre :
   thème, répartition AFL2/AFL3 (4-4, 6-2, 2-6), rôle AFL3, puis degré et note de chaque critère.
2. **Échanger** — QR codes (8 candidats par QR, dans n'importe quel ordre), fichier JSON ou code à coller.
   Le QR transmet aussi la liste des candidats.
3. **Croiser** — totaux par évaluateur, écarts, désaccords (degré différent, ou écart ≥ 0,5 pt),
   note retenue (moyenne au ¼ de point, modifiable), validation, export CSV, impression.

La liste des élèves s'importe en CSV (export Pronote accepté tel quel : nom en colonne A,
classe si une colonne « Classe » existe).

Les données restent dans le navigateur de chaque appareil (localStorage) : exporter le CSV final pour les conserver.

## Fichiers

- `index.html`, `coeval.js`, `coeval.css` — l'application
- `sw.js`, `manifest.webmanifest` — installation et fonctionnement hors connexion
- `qrcode.js` — génération des QR ([qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator), MIT)
- `jsQR.js` — lecture des QR ([jsQR](https://github.com/cozmo/jsQR), Apache-2.0)

Site statique : aucun build, à publier tel quel (Vercel, GitHub Pages…). La caméra exige HTTPS.
