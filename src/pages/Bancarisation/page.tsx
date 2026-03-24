import { useEffect, useState, useCallback, useMemo } from 'react';
import dayjs from 'dayjs';
import MapView from './MapView';
import TableView from './TableView';
import ProjectView from './ProjectView';
import { useSQLite } from '../../hooks/useSQLite';
import type { Mesure, Departement } from './types';

const FONT_LINK = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');`;
const PAGE_SIZE = 50;

/* ─── Helpers ─── */
function parseDep(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/\d+/);
  return m ? m[0] : null;
}

function buildDeptsFC(depts: Departement[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: depts
      .filter((d) => d.geom_geojson)
      .map((d) => ({
        type: 'Feature',
        properties: { insee: d.insee, nom: d.nom },
        geometry: JSON.parse(d.geom_geojson),
      })),
  };
}

function buildMesuresFC(rows: { id: string; geom_geojson: string }[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: rows
      .filter((r) => r.geom_geojson)
      .map((r) => ({
        type: 'Feature',
        properties: { id: r.id },
        geometry: JSON.parse(r.geom_geojson),
      })),
  };
}

/* ─── Detail Drawer (pour la vue table) ─── */
function DetailDrawer({ 
  mesure, 
  onClose, 
  onOpenProject 
}: { 
  mesure: Mesure | null; 
  onClose: () => void;
  onOpenProject: (mesure: Mesure) => void;
}) {
  if (!mesure) return <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 0 }} />;

  const start = dayjs(mesure.date_decision);
  const end = start.add(mesure.duree_mois, 'month');
  const now = dayjs();
  const ratio = Math.min(Math.max(now.diff(start, 'day') / Math.max(end.diff(start, 'day'), 1), 0), 1);
  const joursRestants = Math.max(end.diff(now, 'day'), 0);

  return (
    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 300, background: 'white', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', zIndex: 10, boxShadow: '-4px 0 20px rgba(0,0,0,0.08)' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#64748b', marginBottom: 4 }}>{mesure.ref_cadastrale}</div>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#0f172a' }}>
            {(mesure.commune || '—').split(',')[0].replace(/[{}"]/g, '') || 'Commune inconnue'}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18, padding: 0 }}>✕</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16, fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ height: 8, borderRadius: 99, background: '#f1f5f9', overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ height: '100%', width: `${Math.round(ratio * 100)}%`, background: ratio >= 0.9 ? '#ef4444' : ratio >= 0.6 ? '#f59e0b' : '#3b82f6', borderRadius: 99 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
          <span>{Math.round(ratio * 100)}% écoulé</span>
          <span>Fin : {end.format('DD/MM/YYYY')}</span>
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>{joursRestants} j restants</div>
        {([
          ['Catalogue',        mesure.catalog?.toUpperCase()],
          ['Décision',         dayjs(mesure.date_decision).format('DD/MM/YYYY')],
          ['Durée',            `${mesure.duree_mois} mois`],
          ["Maître d'ouvrage", mesure.maitre_ouvrage || '—'],
          ['Procédure',        mesure.type_procedure || '—'],
          ['Classe',           mesure.classe || '—'],
          ['Projet',           mesure.projet || '—'],
        ] as [string, string][]).map(([label, value]) => (
          <div key={label} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.4 }}>{value}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9' }}>
        <button 
          onClick={() => onOpenProject(mesure)}
          style={{ 
            width: '100%', 
            padding: '10px 0', 
            borderRadius: 8, 
            border: 'none', 
            background: '#2563eb', 
            color: 'white', 
            fontWeight: 600, 
            fontSize: 13, 
            cursor: 'pointer', 
            fontFamily: "'DM Sans', sans-serif",
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          📁 Consulter le dossier
        </button>
      </div>
    </div>
  );
}

/* ─── Types pour le mode de vue ─── */
type ViewMode = 'table' | 'project';

/* ─── Page principale ─── */
export default function BancarisationPage() {
  const { ready, error, query, run, exportDb } = useSQLite('/data/mesures.sqlite');

  // Mode de vue : table ou projet
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [projectMesure, setProjectMesure] = useState<Mesure | null>(null);

  const [rows, setRows]               = useState<Mesure[]>([]);
  const [totalCount, setTotalCount]   = useState(0);
  const [page, setPage]               = useState(0);
  const [searchQ, setSearchQ]         = useState('');
  const [searchCatalog, setSearchCatalog] = useState('all');

  const [deptsFC, setDeptsFC]         = useState<GeoJSON.FeatureCollection | null>(null);
  const [mesuresFC, setMesuresFC]     = useState<GeoJSON.FeatureCollection | null>(null);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);

  const [activeId, setActiveId]       = useState<string | null>(null);
  const [detailMesure, setDetailMesure] = useState<Mesure | null>(null);

  /* ── Charger départements (une seule fois) ── */
  useEffect(() => {
    if (!ready) return;
    const depts = query<Departement>('SELECT insee, nom, geom_geojson FROM departements');
    setDeptsFC(buildDeptsFC(depts));
  }, [ready, query]);

  /* ── Requête mesures (tableau) ── */
  const loadRows = useCallback(() => {
    if (!ready) return;

    const conditions: string[] = [];
    const params: any[] = [];

    if (searchCatalog !== 'all') { conditions.push('catalog = ?'); params.push(searchCatalog); }
    if (selectedDept)            { conditions.push('l_dep LIKE ?'); params.push(`%{${selectedDept}}%`); }
    if (searchQ.trim()) {
      conditions.push('(ref_cadastrale LIKE ? OR commune LIKE ? OR maitre_ouvrage LIKE ? OR projet LIKE ?)');
      const like = `%${searchQ.trim()}%`;
      params.push(like, like, like, like);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = query<{ c: number }>(`SELECT COUNT(*) as c FROM mesures ${where}`, params);
    setTotalCount(countRow[0]?.c ?? 0);

    const data = query<Mesure>(
      `SELECT id, catalog, ref_cadastrale, commune, l_dep, code_insee,
              date_decision, duree_mois, statut, maitre_ouvrage,
              type_procedure, classe, projet
       FROM mesures ${where}
       ORDER BY commune
       LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, page * PAGE_SIZE]
    );
    setRows(data);
  }, [ready, searchQ, searchCatalog, selectedDept, page, query]);

  useEffect(() => { loadRows(); }, [loadRows]);

  /* ── Charger géométries mesures ── */
  useEffect(() => {
    if (!ready) return;

    // En mode projet, on charge uniquement la géométrie de la mesure sélectionnée
    if (viewMode === 'project' && projectMesure) {
      const geoms = query<{ id: string; geom_geojson: string }>(
        'SELECT id, geom_geojson FROM mesures WHERE id = ? AND geom_geojson IS NOT NULL',
        [projectMesure.id]
      );
      setMesuresFC(buildMesuresFC(geoms));
      return;
    }

    // En mode table, on charge les mesures du département sélectionné
    if (!selectedDept) { setMesuresFC(null); return; }
    const geoms = query<{ id: string; geom_geojson: string }>(
      'SELECT id, geom_geojson FROM mesures WHERE l_dep LIKE ? AND geom_geojson IS NOT NULL',
      [`%{${selectedDept}}%`]
    );
    setMesuresFC(buildMesuresFC(geoms));
  }, [ready, selectedDept, viewMode, projectMesure, query]);

  /* ── CRUD ── */
  const handleAdd = useCallback((m: Partial<Mesure>) => {
    const id = crypto.randomUUID();
    run(
      `INSERT INTO mesures (id, catalog, ref_cadastrale, commune, l_dep, code_insee, date_decision, duree_mois, statut, maitre_ouvrage, type_procedure, classe, projet)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, m.catalog ?? 'geomce', m.ref_cadastrale ?? '', m.commune ?? '', m.l_dep ?? '', m.code_insee ?? '',
       m.date_decision ?? '', m.duree_mois ?? 120, m.statut ?? 'active',
       m.maitre_ouvrage ?? null, m.type_procedure ?? null, m.classe ?? null, m.projet ?? null]
    );
    loadRows();
  }, [run, loadRows]);

  const handleEdit = useCallback((m: Partial<Mesure>) => {
    if (!m.id) return;
    run(
      `UPDATE mesures SET catalog=?, ref_cadastrale=?, commune=?, l_dep=?, date_decision=?,
       duree_mois=?, statut=?, maitre_ouvrage=?, type_procedure=?, classe=?, projet=?
       WHERE id=?`,
      [m.catalog, m.ref_cadastrale, m.commune, m.l_dep, m.date_decision,
       m.duree_mois, m.statut, m.maitre_ouvrage ?? null, m.type_procedure ?? null,
       m.classe ?? null, m.projet ?? null, m.id]
    );
    if (detailMesure?.id === m.id) setDetailMesure({ ...detailMesure, ...m } as Mesure);
    loadRows();
  }, [run, loadRows, detailMesure]);

  const handleDelete = useCallback((id: string) => {
    run('DELETE FROM mesures WHERE id=?', [id]);
    if (activeId === id) { setActiveId(null); setDetailMesure(null); }
    loadRows();
  }, [run, loadRows, activeId]);

  /* ── Sauvegarde DB ── */
  const handleSave = useCallback(() => {
    const data = exportDb();
    if (!data) return;
    const blob = new Blob([new Uint8Array(data)], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mesures.sqlite';
    a.click();
    URL.revokeObjectURL(a.href);
  }, [exportDb]);

  /* ── Sélection département ── */
  const handleSelectDept = useCallback((insee: string) => {
    setSelectedDept(insee);
    setActiveId(null);
    setDetailMesure(null);
    setPage(0);
  }, []);

  const handleBackToFrance = useCallback(() => {
    setSelectedDept(null);
    setMesuresFC(null);
    setActiveId(null);
    setDetailMesure(null);
    setPage(0);
  }, []);

  /* ── Sélection feature depuis la carte ── */
  const handleSelectFeature = useCallback((id: string) => {
    setActiveId(id);

    // 1) Essayer de retrouver la mesure dans les lignes déjà chargées
    let m = rows.find((r) => r.id === id) ?? null;

    // 2) Si absente (par ex. autre page / autre filtre), on va la chercher en base
    if (!m) {
      const res = query<Mesure>(
        `SELECT id, catalog, ref_cadastrale, commune, l_dep, code_insee,
                date_decision, duree_mois, statut, maitre_ouvrage,
                type_procedure, classe, projet
         FROM mesures
         WHERE id = ?
         LIMIT 1`,
        [id],
      );
      m = res[0] ?? null;
    }

    // 3) Afficher le panneau détail + aligner le département si besoin
    if (m) {
      setDetailMesure(m);
      const dep = parseDep(m.l_dep);
      if (dep && dep !== selectedDept) setSelectedDept(dep);
    }
  }, [rows, query, selectedDept]);

  const handleOpenDetail = useCallback((m: Mesure) => {
    setActiveId(m.id);
    setDetailMesure(m);
    // Si la mesure est dans un autre dept, charger ce dept
    const dep = parseDep(m.l_dep);
    if (dep && dep !== selectedDept) setSelectedDept(dep);
  }, [selectedDept]);

  /* ── Ouvrir la vue projet ── */
  const handleOpenProject = useCallback((mesure: Mesure) => {
    setProjectMesure(mesure);
    setViewMode('project');
    setActiveId(mesure.id);
    // Sélectionner le département de la mesure pour la carte
    const dep = parseDep(mesure.l_dep);
    if (dep) setSelectedDept(dep);
  }, []);

  /* ── Retour à la vue table ── */
  const handleBackToTable = useCallback(() => {
    setViewMode('table');
    setProjectMesure(null);
  }, []);

  /* ── Nom du département sélectionné ── */
  const deptNom = useMemo(() => {
    if (!selectedDept || !deptsFC) return null;
    const feat = deptsFC.features.find((f) => (f.properties as any)?.insee === selectedDept);
    return (feat?.properties as any)?.nom ?? selectedDept;
  }, [selectedDept, deptsFC]);

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ef4444', fontFamily: 'sans-serif', fontSize: 13 }}>
      Erreur chargement base : {error}
    </div>
  );

  return (
    <>
      <style>{FONT_LINK}</style>
      <style>{`*{box-sizing:border-box}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:99px}`}</style>

      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'DM Sans', sans-serif", background: '#f8fafc' }}>

        {/* Header - différent selon le mode */}
        <div style={{ height: 44, borderBottom: '1px solid #e2e8f0', background: 'white', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, flexShrink: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>
            {viewMode === 'project' ? 'Dossier projet' : 'Mesures de compensation'}
          </div>
          <div style={{ height: 16, width: 1, background: '#e2e8f0' }} />

          {viewMode === 'project' && projectMesure ? (
            <>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                {projectMesure.ref_cadastrale}
              </span>
              <span style={{ fontSize: 12, color: '#0f172a', fontWeight: 500 }}>
                {(projectMesure.commune || '—').split(',')[0].replace(/[{}"]/g, '')}
              </span>
            </>
          ) : selectedDept ? (
            <>
              <button onClick={handleBackToFrance} style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>← Tous</button>
              <span style={{ fontSize: 12, color: '#0f172a', fontWeight: 500 }}>Dép. {selectedDept} — {deptNom}</span>
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Cliquer sur un département</div>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {viewMode === 'table' && activeId && (
              <button onClick={() => { setActiveId(null); setDetailMesure(null); }} style={{ fontSize: 12, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>✕ Désélectionner</button>
            )}
            <button
              onClick={handleSave}
              title="Télécharger la base modifiée"
              style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', fontSize: 12, cursor: 'pointer', color: '#475569', fontFamily: "'DM Sans', sans-serif" }}
            >💾 Sauvegarder DB</button>
          </div>
        </div>

        {/* Loading SQLite */}
        {!ready ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
            Chargement de la base…
          </div>
        ) : (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '48% 52%', overflow: 'hidden' }}>

            {/* Panneau gauche : Table ou Projet */}
            <div style={{ borderRight: '1px solid #e2e8f0', overflow: 'hidden', background: 'white' }}>
              {viewMode === 'project' && projectMesure ? (
                <ProjectView 
                  mesure={projectMesure} 
                  onBack={handleBackToTable}
                />
              ) : (
                <TableView
                  rows={rows}
                  totalCount={totalCount}
                  activeId={activeId}
                  setActiveId={setActiveId}
                  onOpenDetail={handleOpenDetail}
                  onAdd={handleAdd}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onPageChange={setPage}
                  onSearch={(q, cat) => { setSearchQ(q); setSearchCatalog(cat); }}
                  page={page}
                />
              )}
            </div>

            {/* Carte + Drawer (seulement en mode table) */}
            <div style={{ position: 'relative', overflow: 'hidden' }}>
              <MapView
                deptsFC={deptsFC}
                mesuresFC={mesuresFC}
                selectedDept={selectedDept}
                activeId={activeId}
                onSelectDept={handleSelectDept}
                onSelectFeature={handleSelectFeature}
                onBackToFrance={handleBackToFrance}
              />
              {/* Le drawer n'apparaît qu'en mode table */}
              {viewMode === 'table' && (
                <DetailDrawer 
                  mesure={detailMesure} 
                  onClose={() => setDetailMesure(null)}
                  onOpenProject={handleOpenProject}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}