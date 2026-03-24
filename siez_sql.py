#!/usr/bin/env python3
# audit_sqlite_size.py

import os
import sqlite3
import sys
from textwrap import shorten

DEFAULT_PATH = "/Volumes/T7/Travaux_Freelance/KERELIA/CUAs/COMPENSATION_PARCELLE/COMPENSATION_ECO/frontend/public/data/mesures.sqlite"


def human_size(n: int) -> str:
  for unit in ("o", "Ko", "Mo", "Go", "To"):
    if n < 1024:
      return f"{n:.1f} {unit}"
    n /= 1024
  return f"{n:.1f} To"


def main(path: str) -> None:
  print(f"=== Fichier ===")
  print(f"Chemin : {path}")
  if not os.path.exists(path):
    print("⚠️  Fichier introuvable")
    return

  file_size = os.path.getsize(path)
  print(f"Taille fichier : {file_size} octets ({human_size(file_size)})\n")

  conn = sqlite3.connect(path)
  conn.row_factory = sqlite3.Row
  cur = conn.cursor()

  print("=== PRAGMA page_size / page_count ===")
  page_size = cur.execute("PRAGMA page_size").fetchone()[0]
  page_count = cur.execute("PRAGMA page_count").fetchone()[0]
  db_size = page_size * page_count
  print(f"page_size   : {page_size} octets")
  print(f"page_count  : {page_count}")
  print(f"Taille DB   : {db_size} octets ({human_size(db_size)})\n")

  print("=== Tables et nombre de lignes ===")
  tables = cur.execute("""
    SELECT name
    FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  """).fetchall()

  table_names = [r["name"] for r in tables]
  if not table_names:
    print("Aucune table utilisateur trouvée.")
  else:
    for name in table_names:
      try:
        n = cur.execute(f"SELECT COUNT(*) FROM \"{name}\"").fetchone()[0]
      except Exception as e:
        print(f"- {name:<20}  ERREUR: {e}")
        continue
      print(f"- {name:<20}  {n:>10} lignes")
  print()

  # Estimation taille par table (si extension dbstat dispo)
  print("=== Estimation taille par table (dbstat) ===")
  try:
    # dbstat est une vue virtuelle depuis SQLite 3.8.8 si compilée
    cur.execute("SELECT 1 FROM dbstat LIMIT 1")
  except Exception:
    print("dbstat non disponible dans cette build de SQLite → pas de détail par table.")
  else:
    stats = cur.execute("""
      SELECT name,
             SUM(pgsize) AS bytes
      FROM dbstat
      GROUP BY name
      ORDER BY bytes DESC
    """).fetchall()

    total = sum(r["bytes"] for r in stats)
    for r in stats:
      name = r["name"]
      if name.startswith("sqlite_"):
        continue
      size = r["bytes"]
      pct = (size / total * 100) if total else 0
      print(f"- {name:<20} {human_size(size):>10}  ({pct:5.1f}%)")

  conn.close()


if __name__ == "__main__":
  db_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH
  main(db_path)