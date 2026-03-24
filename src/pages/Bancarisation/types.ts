export type Mesure = {
  id: string;
  catalog: 'geomce' | 'portfolio';
  code_insee: string;
  section: string;
  numero: string;
  ref_cadastrale: string;
  commune: string;
  l_dep: string;
  date_decision: string;
  duree_mois: number;
  maitre_ouvrage?: string;
  type_procedure?: string;
  theme?: string;
  statut?: 'active' | 'terminee' | 'suspendue';
  bbox?: [number, number, number, number];
  classe?: string;
  projet?: string;
};

export type Departement = {
  insee: string;
  nom: string;
  geom_geojson: string;
};