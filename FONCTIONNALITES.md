# Fonctionnalités frontend — Écocompensation

Documentation des fonctionnalités de l’interface utilisateur de l’application de filtrage et classement parcellaire (KERELIA Écocompensation).

---

## 1. Vue d’ensemble

L’application est organisée en **deux zones** :

- **Panneau gauche** : paramètres du filtre (panneau fixe).
- **Zone principale** : résultats (entonnoir, tableau ou carte selon l’onglet).

L’utilisateur configure le filtre, lance le calcul, puis consulte les parcelles classées en tableau ou sur la carte, et peut exporter les résultats (CSV ou SHP).

---

## 2. Panneau des paramètres du filtre

### 2.1 En-tête

- **Titre** : « Paramètres du filtre ».
- **Bouton Réinitialiser** (↺) : remet tous les paramètres aux valeurs par défaut.

### 2.2 Exclusions automatiques

- Bloc **non repliable** listant les exclusions appliquées automatiquement :
  - GEOMCE
  - Patrimoine naturel  

*(Affichage informatif ; les exclusions sont gérées côté backend.)*

### 2.3 Zone de végétation (ZDV)

- **Natures ZDV** : cases à cocher pour sélectionner les natures (Bois, Forêt ouverte, Haie, etc.).
- **« Ignorer ce filtre »** : si coché, aucune nature n’est imposée (équivalent à « pas de filtre ZDV »).

### 2.4 Hydrologie

- **Cours d’eau** : mode (Ignorer / Intersecte / Proximité) + rayon en m si « Proximité ».
- **Plans d’eau** : même logique (mode + rayon si Proximité).

### 2.5 Géométrie

- **Miller minimum** : curseur (seuil de forme, ex. 0,1–0,9).
- **Surface minimale** : valeur numérique en ha (ex. 0,5–100 ha).

### 2.6 Distance & cible

- **Rayon départ** : curseur en km (rayon initial de recherche).
- **Rayon min** : valeur numérique en km.
- **Cible max** : nombre max de parcelles à conserver (ex. 5–200).

### 2.7 Poids du scoring

- **Seuils** (configurables) :
  - Miller seuil
  - Surface seuil (ha)
  - Hydro seuil (m)
- **Poids par critère** (boutons − / +, 0–10 pts) :
  - Distance (&lt; 2 km, 2–5 km, 5–10 km)
  - Surface (≥ seuil ha)
  - Miller (≥ seuil)
  - Hydro (&lt; seuil m)
- **Score max théorique** : badge affichant la somme des points max.

### 2.8 Lancer le filtre

- **Bouton « Lancer le filtre »** : envoie les options au backend et déclenche le calcul.
- Pendant le traitement : bouton en état « Filtrage en cours… » avec indicateur de chargement, désactivé.

---

## 3. Zone des résultats

Affichée **uniquement après un filtre réussi**. Contient :

### 3.1 Entonnoir de filtre (FunnelDisplay)

- Affiche les **étapes du pipeline** (nombre de parcelles à chaque étape).
- Indique le **rayon final** (km) et le **nombre total** de parcelles retenues.

### 3.2 En-tête des résultats

- **Titre** : « Résultats (X parcelles) ».
- **Boutons d’export** :
  - **CSV** : télécharge le tableau des parcelles (sans géométrie).
  - **SHP** : télécharge le Shapefile (zip) des parcelles avec géométrie.

### 3.3 Onglets Classement / Carte

- **Classement** (onglet par défaut) : tableau des parcelles classées.
- **Carte** : carte MapLibre avec les parcelles dessinées (remplissage vert, contour vert).

Un seul onglet est actif à la fois ; le contenu affiché correspond à l’onglet sélectionné.

### 3.4 Tableau de classement (RankingTable)

- Colonnes : **Rang**, **IDU** (avec code INSEE), **Score**, **Distance**, **Surface**, **Miller**, **Hydro**.
- **Clic sur une ligne** : ouvre/ferme le détail du score (critères et points).
- **Ligne mise en avant** : lorsqu’on arrive depuis la carte (double-clic sur une parcelle), la ligne correspondante est surlignée et le détail du score ouvert ; la vue défile jusqu’à cette ligne.

### 3.5 Carte (ParcellesMap)

- Carte **MapLibre** (fond Carto dark matter).
- Parcelles en **polygones verts** (remplissage semi-transparent, contour vert).
- **Zoom** automatique sur l’emprise des parcelles au chargement.
- **Curseur** : pointeur au survol des parcelles.
- **Double-clic sur une parcelle** : bascule sur l’onglet **Classement**, défile jusqu’à la ligne de cette parcelle (identifiée par son **IDU**) et ouvre le détail du score.

---

## 4. Exports

| Action   | Bouton | Contenu |
|----------|--------|--------|
| **CSV**  | 📊 CSV | Fichier CSV (séparateur `;`, UTF-8 avec BOM) : rang, idu, code_insee, section, numero, surface_ha, miller, distance_km, dist_hydro_m, score, score_details (texte). |
| **SHP**  | 📥 SHP | Fichier ZIP contenant le Shapefile des parcelles (géométrie + attributs : rang, score, idu, surface, miller, distance, hydro, etc.). |

Les deux boutons sont désactivés tant qu’il n’y a pas de résultats ; pendant le téléchargement, le libellé du bouton concerné indique l’attente (⏳).

---

## 5. Liaison carte ↔ tableau

- Les parcelles de la **carte** et du **tableau** partagent le même identifiant **IDU**.
- **Depuis la carte** : double-clic sur une parcelle → passage à l’onglet Classement, scroll jusqu’à la ligne de cette parcelle, mise en surbrillance et ouverture du détail du score.
- Aucune action spécifique « depuis le tableau vers la carte » n’est implémentée (la carte affiche toutes les parcelles du résultat).

---

## 6. État initial (avant filtre)

- Seul le **panneau de paramètres** et un **message** dans la zone principale sont affichés : « Configurez et lancez le filtre ».
- Aucun résultat, aucun onglet, aucun export tant qu’un filtre n’a pas été exécuté avec succès.

---

## 7. Appels API utilisés (frontend)

| Méthode | Endpoint | Usage |
|--------|----------|--------|
| POST   | `/api/projects/{id}/filter`   | Lancer le filtre avec les options du panneau. |
| GET    | `/api/projects/{id}/geojson` | Récupérer les parcelles en GeoJSON pour la carte (après un filtre réussi). |
| GET    | `/api/projects/{id}/export/csv` | Télécharger le CSV des parcelles. |
| GET    | `/api/projects/{id}/export/shp` | Télécharger le ZIP Shapefile. |

L’URL de base de l’API est configurée via `VITE_API_URL` (défaut : `http://localhost:8000`).

---

## 8. Récapitulatif des actions utilisateur

| Action | Effet |
|--------|--------|
| Modifier les paramètres du filtre | Mise à jour de l’état local du panneau. |
| Cliquer sur Réinitialiser | Tous les paramètres repassent aux valeurs par défaut. |
| Cliquer sur « Lancer le filtre » | Envoi des options au backend, affichage des résultats (entonnoir, tableau, carte) et activation des exports. |
| Choisir l’onglet Classement | Affichage du tableau des parcelles. |
| Choisir l’onglet Carte | Affichage de la carte des parcelles. |
| Cliquer sur une ligne du tableau | Ouvre ou ferme le détail du score pour cette parcelle. |
| Double-cliquer sur une parcelle sur la carte | Passe à l’onglet Classement, scroll et surligne la ligne de cette parcelle, ouvre le détail du score. |
| Cliquer sur CSV | Télécharge le fichier CSV des parcelles. |
| Cliquer sur SHP | Télécharge le fichier ZIP contenant le Shapefile. |
