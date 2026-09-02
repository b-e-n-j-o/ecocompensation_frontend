# Consignes UI — page résultats (tableau + carto)

Référence visuelle : **Données internes** + wizard de création d’étude (épuré).
Langue : français. Vert Kerelia `#289f01` / `#85e372`. Vocabulaire front : **pool**, pas « run ».

Cibles : `EtudeResultats.tsx`, `EtudeResultatsTable.tsx`, `EtudeResultatsMap.tsx`, `ResultsToolbar.tsx`, `RankingTable.tsx`, `App.tsx` / `App.css`, `results-page.css`.

## Priorité : la lecture tableau / carte

Le couple **classement + carto** est le produit. Tout le reste (contexte de pool, navigation d’étude) est secondaire et ne doit pas manger la hauteur ni la largeur.

## Fait — barre haute compacte

- Une **ligne compacte** : nom du projet, type d’étude (petit badge), date / nb parcelles, point de statut.
- **Nouvelle étude**, sélecteur de pool, ID du pool → panneau **« Informations du pool »** (replié par défaut). S’ouvre tout seul si 0 parcelle (entonnoir).
- Une seule liste de **tous les pools de tous les projets** (nom projet, type Faune/ZH, date, nb parcelles) — `ResultsPickList`, pas de `<select>` natif.
- ID du pool : copiable, en `code` petit.
- Statuts : un point / une ligne discrète, pas un bandeau.
- Pas de titre long du type « Compensation faunistique — classement (24) ».
- Filtre Type retiré. Onglet Entonnoir retiré (l’entonnoir est dans le panneau d’infos, compact).

## Fait — hiérarchie d’écran

1. **Onglets métier** (Parcelles / Unités foncières) + sous-vues Classement / Carte.
2. **Tableau | carte** côte à côte (split ~60/40), hauteur max. Bouton **Masquer la carte** pour le tableau pleine largeur.
3. Actions tableau (dureté, ajout de foncier, sélection, PDF, tri, export) + curseurs Distance / Surface → panneau **Outils** (fermé par défaut). Pastilles si un filtre est actif (`≤ 8,2 km`, `≥ 0,5 ha`).
   - **Dureté foncière** : au clic, tout le pool ou choisir des parcelles.
   - **Ajouter du foncier** : au clic, un champ IDU compact.
   - **Export** : au clic, CSV ou Shapefile. Rapport PDF reste un bouton à part.
4. Légende carte légère (pastilles), pas de gros blocs.

## Fait — rail de navigation repliable

- Sidebar far-left (`AppRail`) : Ecocompensation / Étude / Données internes.
- Bouton **Replier** en bas du rail → icônes seules (~3,4 rem) pour gagner de la largeur sur toutes les pages.
- Labels via `title` au survol une fois replié. État mémorisé (`localStorage` `kerelia-rail-collapsed`).

## Fait — survol tableau → highlight carte

- Survol d’une ligne du classement (ou indésirables) : la parcelle correspondante s’allume **instantanément** sur la carte (fill ambre + contour), **sans** déplacer la caméra.
- Le clic continue de centrer (`fitBounds`).
- Unités foncières : survol d’une UF (toutes les combinaisons) ou d’un sous-ensemble.
- Props : `hoverIdu` / `hoverSubsetId` / `hoverUfId` distincts de `focusIdu` / `focusSubsetId`.

## Langage visuel

- Vert Kerelia, pastilles **rondes** pour cocher/décocher. Pas de cases natives bleues.
- Peu de texte d’aide. Un libellé court > un paragraphe.
- Labels de couches : nom lisible + table SQL en petit si besoin (dev).
- Densité type Données internes : lignes 0.35–0.4 rem, pas de cartes empilées dans le header.

## À ne pas faire

- Ne pas dupliquer Type / Projet / Pool en haut **et** dans les infos du pool.
- Ne pas agrandir le header pour « tout rendre accessible ». Accessible = un clic, pas toujours visible.
- Ne pas casser le split tableau/carte ni les onglets Parcelles / UF.
- Ne pas lier le survol tableau à un `fitBounds` (la caméra bougerait en continu).
- Ne pas parler de « run » dans l’UI.

## Fichiers

- Shell / rail : `frontend/src/App.tsx`, `frontend/src/App.css`
- Toolbar : `frontend/src/components/ResultPanel/ResultsToolbar.tsx`, `ResultsPickList.tsx`
- Page : `frontend/src/pages/Etude/EtudeResultats.tsx`, `EtudeResultatsTable.tsx`, `EtudeResultatsMap.tsx`
- Tableau : `RankingTable.tsx`, `IndesirablesTable.tsx`, `UnitesFoncieresTable.tsx`
- Carte : `ParcellesMap.tsx`, `SousEnsemblesMap.tsx`
- Styles : `frontend/src/components/ResultPanel/results-page.css`
