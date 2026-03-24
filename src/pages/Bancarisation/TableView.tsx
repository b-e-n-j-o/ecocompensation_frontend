import React, { useMemo, useRef, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import type { Mesure } from './types';
import { MesureForm } from './MesureForm';

type SortKey = 'commune' | 'date_decision' | 'duree_mois' | 'ref_cadastrale';

const PAGE_SIZE = 50;

function computeProgress(m: Mesure) {
  const start = dayjs(m.date_decision);
  const end = start.add(m.duree_mois, 'month');
  const now = dayjs();
  const total = Math.max(end.diff(start, 'day'), 1);
  const done = Math.min(Math.max(now.diff(start, 'day'), 0), total);
  return { ratio: done / total, joursRestants: Math.max(end.diff(now, 'day'), 0) };
}

function StatutBadge({ statut }: { statut?: string }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    active:    { bg: '#dcfce7', color: '#15803d', label: 'Active' },
    terminee:  { bg: '#fee2e2', color: '#b91c1c', label: 'Terminée' },
    suspendue: { bg: '#fef9c3', color: '#a16207', label: 'Suspendue' },
  };
  const s = cfg[statut ?? 'active'] ?? cfg['active'];
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function ProgressBar({ ratio, joursRestants }: { ratio: number; joursRestants: number }) {
  const pct = Math.round(ratio * 100);
  const color = pct >= 90 ? '#ef4444' : pct >= 60 ? '#f59e0b' : '#3b82f6';
  return (
    <div style={{ minWidth: 110 }}>
      <div style={{ height: 5, borderRadius: 99, background: '#e2e8f0', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99 }} />
      </div>
      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>
        {joursRestants > 0 ? `${joursRestants} j restants` : 'Terminée'}
      </div>
    </div>
  );
}

/* ── Modal générique ── */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'relative', background: 'white', borderRadius: 12, padding: '24px 28px', width: 640, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', fontFamily: "'DM Sans', sans-serif" }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Confirm delete ── */
function ConfirmDelete({ mesure, onConfirm, onCancel }: { mesure: Mesure; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal title="Supprimer la mesure" onClose={onCancel}>
      <p style={{ fontSize: 13, color: '#475569', marginBottom: 20, fontFamily: "'DM Sans', sans-serif" }}>
        Supprimer définitivement <strong>{mesure.ref_cadastrale}</strong> ?<br />
        Cette action sera appliquée à la base locale.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Annuler</button>
        <button onClick={onConfirm} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#ef4444', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Supprimer</button>
      </div>
    </Modal>
  );
}

/* ── Props ── */
interface Props {
  rows: Mesure[];
  totalCount: number;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  onOpenDetail: (m: Mesure) => void;
  onAdd: (m: Partial<Mesure>) => void;
  onEdit: (m: Partial<Mesure>) => void;
  onDelete: (id: string) => void;
  onPageChange: (page: number) => void;
  onSearch: (q: string, catalog: string) => void;
  page: number;
}

const TableView: React.FC<Props> = ({
  rows, totalCount, activeId, setActiveId, onOpenDetail,
  onAdd, onEdit, onDelete, onPageChange, onSearch, page,
}) => {
  const [q, setQ] = useState('');
  const [catalog, setCatalog] = useState<'all' | 'geomce' | 'portfolio'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('commune');
  const [sortAsc, setSortAsc] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editMesure, setEditMesure] = useState<Mesure | null>(null);
  const [deleteMesure, setDeleteMesure] = useState<Mesure | null>(null);
  const activeRowRef = useRef<HTMLTableRowElement | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce recherche → remonte au parent (SQL côté Bancarisation)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      onSearch(q, catalog);
      onPageChange(0);
    }, 250);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [q, catalog, onSearch, onPageChange]);

  useEffect(() => {
    if (activeId && activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeId]);

  // Tri local sur la page courante
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const A: any = a[sortKey], B: any = b[sortKey];
      if (sortKey === 'date_decision') return (dayjs(A).valueOf() - dayjs(B).valueOf()) * (sortAsc ? 1 : -1);
      return String(A ?? '').localeCompare(String(B ?? ''), 'fr') * (sortAsc ? 1 : -1);
    });
  }, [rows, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(true); }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span style={{ marginLeft: 4, color: sortKey === k ? '#2563eb' : '#cbd5e1', fontSize: 10 }}>
      {sortKey === k ? (sortAsc ? '▲' : '▼') : '⇅'}
    </span>
  );

  const colHeaders: { label: string; key: SortKey }[] = [
    { label: 'Commune', key: 'commune' },
    { label: 'Réf. cadastrale', key: 'ref_cadastrale' },
    { label: 'Décision', key: 'date_decision' },
    { label: 'Durée', key: 'duree_mois' },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'DM Sans', sans-serif" }}>

      {/* Toolbar */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', background: '#fff', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }}>🔍</span>
          <input
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px 7px 32px', fontSize: 13, outline: 'none', background: '#f8fafc', fontFamily: "'DM Sans', sans-serif" }}
            placeholder="Rechercher…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 13, background: '#f8fafc', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
          value={catalog}
          onChange={(e) => setCatalog(e.target.value as any)}
        >
          <option value="all">Tous</option>
          <option value="geomce">GEOMCE</option>
          <option value="portfolio">Portefeuille</option>
        </select>
        <div style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>{totalCount} mesure{totalCount > 1 ? 's' : ''}</div>
        <button
          onClick={() => setAddOpen(true)}
          style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#2563eb', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'DM Sans', sans-serif" }}
        >+ Ajouter</button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #f1f5f9', position: 'sticky', top: 0, zIndex: 2 }}>
              {colHeaders.map(({ label, key }) => (
                <th key={key} onClick={() => toggleSort(key)} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#475569', cursor: 'pointer', userSelect: 'none', fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  {label}<SortIcon k={key} />
                </th>
              ))}
              <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Progression</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Statut</th>
              <th style={{ padding: '10px 14px', width: 64 }} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => {
              const { ratio, joursRestants } = computeProgress(m);
              const isActive = m.id === activeId;
              return (
                <tr
                  key={m.id}
                  ref={isActive ? activeRowRef : null}
                  onClick={() => { setActiveId(m.id); onOpenDetail(m); }}
                  style={{ borderBottom: '1px solid #f8fafc', background: isActive ? '#eff6ff' : 'white', cursor: 'pointer', transition: 'background .1s' }}
                  onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isActive ? '#eff6ff' : 'white'; }}
                >
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontWeight: 500, color: '#0f172a' }}>
                      {(m.commune || '—').split(',')[0].replace(/[{}"]/g, '') || 'Commune inconnue'}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{m.catalog?.toUpperCase()}</div>
                  </td>
                  <td style={{ padding: '10px 14px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: '#475569' }}>{m.ref_cadastrale}</td>
                  <td style={{ padding: '10px 14px', color: '#64748b', whiteSpace: 'nowrap' }}>{dayjs(m.date_decision).format('DD/MM/YYYY')}</td>
                  <td style={{ padding: '10px 14px', color: '#64748b', whiteSpace: 'nowrap' }}>{m.duree_mois} mois</td>
                  <td style={{ padding: '10px 14px' }}><ProgressBar ratio={ratio} joursRestants={joursRestants} /></td>
                  <td style={{ padding: '10px 14px' }}><StatutBadge statut={m.statut} /></td>
                  <td style={{ padding: '6px 10px' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        title="Modifier"
                        onClick={() => setEditMesure(m)}
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 12, color: '#2563eb' }}
                      >✏️</button>
                      <button
                        title="Supprimer"
                        onClick={() => setDeleteMesure(m)}
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #fee2e2', background: '#fff5f5', cursor: 'pointer', fontSize: 12, color: '#ef4444' }}
                      >🗑️</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Aucune mesure trouvée</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #f1f5f9', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>
          Page {page + 1} / {totalPages} — {Math.min((page + 1) * PAGE_SIZE, totalCount)} sur {totalCount}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => onPageChange(Math.max(0, page - 1))}
            disabled={page === 0}
            style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #e2e8f0', background: page === 0 ? '#f8fafc' : 'white', cursor: page === 0 ? 'default' : 'pointer', fontSize: 13, color: page === 0 ? '#cbd5e1' : '#2563eb' }}
          >←</button>
          <button
            onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            style={{
              padding: '5px 12px',
              borderRadius: 7,
              border: '1px solid #e2e8f0',
              background: page >= totalPages - 1 ? '#f8fafc' : 'white',
              cursor: page >= totalPages - 1 ? 'default' : 'pointer',
              fontSize: 13,
              color: page >= totalPages - 1 ? '#cbd5e1' : '#2563eb',
            }}
          >
            →</button>
        </div>
      </div>

      {/* Modal Ajout */}
      {addOpen && (
        <Modal title="Nouvelle mesure" onClose={() => setAddOpen(false)}>
          <MesureForm
            onSave={(m) => { onAdd(m); setAddOpen(false); }}
            onCancel={() => setAddOpen(false)}
          />
        </Modal>
      )}

      {/* Modal Édition */}
      {editMesure && (
        <Modal title="Modifier la mesure" onClose={() => setEditMesure(null)}>
          <MesureForm
            initial={editMesure ?? undefined}
            isEdit
            onSave={(m) => { onEdit({ ...editMesure, ...m }); setEditMesure(null); }}
            onCancel={() => setEditMesure(null)}
          />
        </Modal>
      )}

      {/* Confirm suppression */}
      {deleteMesure && (
        <ConfirmDelete
          mesure={deleteMesure}
          onConfirm={() => { onDelete(deleteMesure!.id); setDeleteMesure(null); }}
          onCancel={() => setDeleteMesure(null)}
        />
      )}
    </div>
  );
};

export default TableView;