Les **personnes morales** (couche **Parcelles prospects**, `parcelles_prospects` : SIREN, dénomination, etc.) ne sont **pas** en GeoJSON ni en PMTiles. Elles sont déjà en **tuiles vectorielles MVT**, servies depuis un **fichier MBTiles** précalculé.

**Il n’y a pas de PMTiles** dans cette page.

## Comment MapLibre les affiche

Le frontend ne distingue pas vraiment MVT « live » et MBTiles : les deux deviennent une source `vector` MapLibre, URL :

`/api/data-interne/layers/{key}/tiles/{z}/{x}/{y}.mvt`

```516:528:KERFONCIER/frontend/src/pages/DonneesInternes/DonneesInternesPage.tsx
  if (isMvtLayer(layer)) {
    if (!map.getSource(sid)) {
      const minZ = layer.min_zoom ?? 0;
      const maxZ = layer.max_zoom ?? (layer.delivery === "mbtiles" ? 14 : 16);
      map.addSource(sid, {
        type: "vector",
        tiles: [internalLayerTileUrl(layer.key)],
        ...
```

`isMvtLayer` = `delivery === "mvt"` **ou** `"mbtiles"`.

Quand on active une couche tuilée, **on ne télécharge pas tout le GeoJSON** : seulement les tuiles de la vue. Pour les MBTiles avec clustering (GEOMCE), on charge en plus les **centroïdes** (halos aux petits zooms).

## Les 3 modes du catalogue

| Couche | Delivery | Ce que ça veut dire | Zoom géométrie |
|---|---|---|---|
| Parcelles syndicats, Foncier privé, Îlots | **geojson** (défaut) | Tout le fichier en mémoire via `/geojson` | dès l’activation |
| **Parcelles prospects (personnes morales)** | **mbtiles** | Fichier `parcelles_prospects_so.mbtiles` (Sud-Ouest), lu côté API, renvoyé en MVT | **z ≥ 12**, tuiles jusqu’à **z14** puis sur-zoom MapLibre |
| GEOMCE surf / lin / pct | **mbtiles** | Idem, France métro + **halos** (centroïdes) sous z12 | z ≥ 12, tuiles jusqu’à z16 |
| Végétation CESBIO, Zones humides | **mvt** | Tuiles **calculées à la volée** (PostGIS `ST_AsMVT`) | z ≥ 14 |

Côté API : si `delivery === "mbtiles"`, lecture du `.mbtiles` ; si la tuile manque, repli sur le MVT live SQL.

## Conséquence pour alléger la page

Les **personnes morales sont déjà tuilées**. Ce qui pèse encore :

1. **GeoJSON des petites couches** (syndicats, privé, îlots) — tout chargé d’un coup.
2. **Centroïdes GEOMCE** si ces couches sont allumées (fichier de points, pas des tuiles).
3. **Trop de couches tuilées visibles** en même temps (requêtes tuile + rendu).
4. **Pas de PMTiles** : aujourd’hui c’est HTTP tuile par tuile via l’API, pas un seul fichier HTTP Range.

La légende affiche `tuiles · z ≥ 12` pour les MBTiles, `vue · z ≥ 12` pour le MVT live, et un **nombre d’entités** seulement pour le GeoJSON.