#!/usr/bin/env python
# audit_departements_geojson.py

import sys
import geopandas as gpd

PATH = "/Volumes/T7/Travaux_Freelance/KERELIA/CUAs/COMPENSATION_PARCELLE/COMPENSATION_ECO/frontend/departements_4326.geojson"

def main(path: str) -> None:
    print(f"=== Chargement du fichier ===")
    print(f"Fichier : {path}\n")

    gdf = gpd.read_file(path)

    print("=== Info générale ===")
    print(f"Nombre de lignes : {len(gdf)}")
    print(f"CRS : {gdf.crs}")
    print(f"Type de géométrie (premières lignes) : {gdf.geometry.geom_type.value_counts().to_dict()}")
    print()

    print("=== Colonnes et types ===")
    print(gdf.dtypes)
    print()

    print("=== Aperçu des 5 premières lignes (attributs non géométriques) ===")
    # On masque la colonne geometry pour voir plus clairement les attributs
    print(gdf.drop(columns=["geometry"], errors="ignore").head())
    print()

    print("=== Valeurs uniques / exemples pour quelques champs clés potentiels ===")
    candidats_codes = [c for c in gdf.columns if "insee" in c.lower() or "code" in c.lower()]
    candidats_noms = [c for c in gdf.columns if "nom" in c.lower() or "name" in c.lower()]

    if candidats_codes:
        print(f"Colonnes candidates pour le code département : {candidats_codes}")
        for col in candidats_codes:
            print(f"\n- Colonne '{col}' :")
            print("  Types et quelques valeurs :")
            print("  dtype   :", gdf[col].dtype)
            print("  exemples:", gdf[col].dropna().unique()[:10])
    else:
        print("Aucune colonne candidate évidente pour le code département (contenant 'insee' ou 'code').")

    print()

    if candidats_noms:
        print(f"Colonnes candidates pour le nom de département : {candidats_noms}")
        for col in candidats_noms:
            print(f"\n- Colonne '{col}' :")
            print("  dtype   :", gdf[col].dtype)
            print("  exemples:", gdf[col].dropna().unique()[:10])
    else:
        print("Aucune colonne candidate évidente pour le nom de département (contenant 'nom' ou 'name').")

    print("\n=== Vérification de la présence de 'insee' et 'nom' ===")
    for col in ["insee", "nom"]:
        print(f"Colonne '{col}' présente ? {col in gdf.columns}")

    print("\n=== Statistiques basiques par colonne (hors géométrie) ===")
    print(gdf.drop(columns=["geometry"], errors="ignore").describe(include="all"))

if __name__ == "__main__":
    path = PATH
    if len(sys.argv) > 1:
        path = sys.argv[1]
    main(path)