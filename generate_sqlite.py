# generate_sqlite.py
import sqlite3, json, geopandas as gpd, pandas as pd
from shapely.ops import transform
import pyproj

# Mesures depuis ton GeoJSON existant
gdf = gpd.read_file("public/mock/mesures.geojson")
gdf = gdf.to_crs("EPSG:4326")

conn = sqlite3.connect("public/data/mesures.sqlite")

# Table mesures
df = pd.DataFrame({
    "id": gdf["id"],
    "catalog": gdf["catalog"],
    "ref_cadastrale": gdf["ref_cadastrale"],
    "commune": gdf["commune"],
    "l_dep": gdf["l_dep"],
    "code_insee": gdf["code_insee"],
    "date_decision": gdf["date_decision"],
    "duree_mois": gdf["duree_mois"],
    "maitre_ouvrage": gdf["maitre_ouvrage"],
    "type_procedure": gdf["type_procedure"],
    "classe": gdf["classe"],
    "projet": gdf["projet"],
    "statut": gdf.get("statut", "active"),
    # Géométrie simplifiée en GeoJSON texte
    "geom_geojson": gdf.geometry.simplify(0.0001).apply(
        lambda g: json.dumps(g.__geo_interface__) if g else None
    ),
})
df.to_sql("mesures", conn, if_exists="replace", index=False)

# Table departements (GeoJSON avec colonnes code, nom)
dept_gdf = gpd.read_file("departements_4326.geojson")
dept_gdf["geom_geojson"] = dept_gdf.geometry.simplify(0.005).apply(
    lambda g: json.dumps(g.__geo_interface__) if g else None
)
# Fichier a "code" et "nom" -> on expose en "insee" pour cohérence avec le reste
dept_df = dept_gdf[["code", "nom", "geom_geojson"]].rename(columns={"code": "insee"})
dept_df.to_sql("departements", conn, if_exists="replace", index=False)

conn.execute("CREATE INDEX IF NOT EXISTS idx_dep ON mesures(l_dep)")
conn.execute("CREATE INDEX IF NOT EXISTS idx_catalog ON mesures(catalog)")
conn.commit()
conn.close()
print("OK")