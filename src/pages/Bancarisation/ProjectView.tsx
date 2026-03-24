import React, { useState, useCallback, useRef } from 'react';
import dayjs from 'dayjs';
import type { Mesure } from './types';

/* ─── Types ─── */
interface ProjectFile {
  id: string;
  name: string;
  type: 'pdf' | 'xlsx' | 'docx' | 'image' | 'other';
  size: number;
  uploadedAt: string;
  thumbnailUrl?: string;
}

interface ProjectFolder {
  id: string;
  name: string;
  files: ProjectFile[];
}

/* ─── Données mockées ─── */
const MOCK_FOLDERS: ProjectFolder[] = [
  {
    id: 'admin',
    name: 'Documents administratifs',
    files: [
      { id: 'f1', name: 'Arrêté préfectoral.pdf', type: 'pdf', size: 2450000, uploadedAt: '2024-03-15' },
      { id: 'f2', name: 'Convention tripartite.pdf', type: 'pdf', size: 1820000, uploadedAt: '2024-03-10' },
      { id: 'f3', name: 'Délibération conseil.docx', type: 'docx', size: 156000, uploadedAt: '2024-02-28' },
    ],
  },
  {
    id: 'finance',
    name: 'Suivi financier',
    files: [
      { id: 'f4', name: 'Budget prévisionnel 2024.xlsx', type: 'xlsx', size: 89000, uploadedAt: '2024-01-15' },
      { id: 'f5', name: 'Factures travaux Q1.pdf', type: 'pdf', size: 3200000, uploadedAt: '2024-04-02' },
    ],
  },
  {
    id: 'technique',
    name: 'Documents techniques',
    files: [
      { id: 'f6', name: 'Plan de gestion.pdf', type: 'pdf', size: 4500000, uploadedAt: '2024-02-20' },
      { id: 'f7', name: 'Diagnostic écologique.pdf', type: 'pdf', size: 8900000, uploadedAt: '2023-11-05' },
      { id: 'f8', name: 'Cartographie habitats.pdf', type: 'pdf', size: 12400000, uploadedAt: '2023-11-05' },
    ],
  },
  {
    id: 'photos',
    name: 'Photos terrain',
    files: [
      { id: 'f9', name: 'Vue parcelle nord.jpg', type: 'image', size: 2100000, uploadedAt: '2024-05-12', thumbnailUrl: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=200&h=150&fit=crop' },
      { id: 'f10', name: 'Zone humide.jpg', type: 'image', size: 1850000, uploadedAt: '2024-05-12', thumbnailUrl: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=200&h=150&fit=crop' },
      { id: 'f11', name: 'Haie bocagère.jpg', type: 'image', size: 2300000, uploadedAt: '2024-05-12', thumbnailUrl: 'https://images.unsplash.com/photo-1518173946687-a4c036bc3c95?w=200&h=150&fit=crop' },
    ],
  },
  {
    id: 'suivi',
    name: 'Rapports de suivi',
    files: [
      { id: 'f12', name: 'Suivi annuel 2023.pdf', type: 'pdf', size: 5600000, uploadedAt: '2024-01-30' },
      { id: 'f13', name: 'Indicateurs biodiversité.xlsx', type: 'xlsx', size: 245000, uploadedAt: '2024-02-15' },
    ],
  },
];

/* ─── Helpers ─── */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function getFileIcon(type: ProjectFile['type']): string {
  switch (type) {
    case 'pdf': return '📄';
    case 'xlsx': return '📊';
    case 'docx': return '📝';
    case 'image': return '🖼️';
    default: return '📎';
  }
}

function getFileColor(type: ProjectFile['type']): { bg: string; border: string } {
  switch (type) {
    case 'pdf': return { bg: '#fef2f2', border: '#fecaca' };
    case 'xlsx': return { bg: '#f0fdf4', border: '#bbf7d0' };
    case 'docx': return { bg: '#eff6ff', border: '#bfdbfe' };
    case 'image': return { bg: '#fefce8', border: '#fef08a' };
    default: return { bg: '#f8fafc', border: '#e2e8f0' };
  }
}

/* ─── File Preview Modal ─── */
function FilePreviewModal({ file, onClose }: { file: ProjectFile; onClose: () => void }) {
  const colors = getFileColor(file.type);
  
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }} />
      <div style={{ 
        position: 'relative', 
        background: 'white', 
        borderRadius: 16, 
        width: 720, 
        maxWidth: '95vw', 
        maxHeight: '90vh', 
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ 
          padding: '16px 20px', 
          borderBottom: '1px solid #f1f5f9', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          background: '#fafafa',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ 
              width: 40, 
              height: 40, 
              borderRadius: 10, 
              background: colors.bg, 
              border: `1px solid ${colors.border}`,
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              fontSize: 20,
            }}>
              {getFileIcon(file.type)}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a', fontFamily: "'DM Sans', sans-serif" }}>{file.name}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                {formatFileSize(file.size)} • Ajouté le {dayjs(file.uploadedAt).format('DD/MM/YYYY')}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20, padding: 4 }}>✕</button>
        </div>

        {/* Preview zone */}
        <div style={{ flex: 1, padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', minHeight: 400 }}>
          {file.type === 'image' && file.thumbnailUrl ? (
            <img 
              src={file.thumbnailUrl.replace('w=200&h=150', 'w=800&h=600')} 
              alt={file.name}
              style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
            />
          ) : (
            <div style={{ textAlign: 'center', color: '#64748b' }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>{getFileIcon(file.type)}</div>
              <div style={{ fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>Aperçu non disponible</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Téléchargez le fichier pour le consulter</div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'white' }}>
          <button 
            onClick={onClose}
            style={{ 
              padding: '9px 18px', 
              borderRadius: 8, 
              border: '1px solid #e2e8f0', 
              background: 'white', 
              fontSize: 13, 
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              color: '#475569',
            }}
          >
            Fermer
          </button>
          <button 
            style={{ 
              padding: '9px 20px', 
              borderRadius: 8, 
              border: 'none', 
              background: '#2563eb', 
              color: 'white', 
              fontSize: 13, 
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            ⬇️ Télécharger
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── File Card ─── */
function FileCard({ file, onClick }: { file: ProjectFile; onClick: () => void }) {
  const colors = getFileColor(file.type);
  
  return (
    <div
      onClick={onClick}
      style={{
        background: 'white',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = '#cbd5e1';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0';
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
      }}
    >
      {/* Thumbnail / Icon zone */}
      <div style={{ 
        height: 100, 
        background: file.type === 'image' && file.thumbnailUrl ? 'transparent' : colors.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderBottom: '1px solid #f1f5f9',
        overflow: 'hidden',
      }}>
        {file.type === 'image' && file.thumbnailUrl ? (
          <img src={file.thumbnailUrl} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 36 }}>{getFileIcon(file.type)}</span>
        )}
      </div>
      
      {/* Info */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ 
          fontSize: 12, 
          fontWeight: 500, 
          color: '#0f172a', 
          fontFamily: "'DM Sans', sans-serif",
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          marginBottom: 4,
        }}>
          {file.name}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>
          {formatFileSize(file.size)}
        </div>
      </div>
    </div>
  );
}

/* ─── Folder Section ─── */
function FolderSection({ folder, onFileClick }: { folder: ProjectFolder; onFileClick: (file: ProjectFile) => void }) {
  const [isOpen, setIsOpen] = useState(true);
  
  return (
    <div style={{ marginBottom: 24 }}>
      {/* Folder header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '8px 0',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ 
          fontSize: 12, 
          color: '#64748b',
          transition: 'transform 0.2s',
          transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
        }}>
          ▶
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#334155', fontFamily: "'DM Sans', sans-serif" }}>
          {folder.name}
        </span>
        <span style={{ 
          fontSize: 11, 
          color: '#94a3b8', 
          background: '#f1f5f9', 
          padding: '2px 8px', 
          borderRadius: 99,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {folder.files.length}
        </span>
      </button>
      
      {/* Files grid */}
      {isOpen && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', 
          gap: 12,
          marginTop: 8,
        }}>
          {folder.files.map((file) => (
            <FileCard key={file.id} file={file} onClick={() => onFileClick(file)} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Drop Zone ─── */
function DropZone({ onDrop }: { onDrop: (files: FileList) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onDrop(e.dataTransfer.files);
    }
  }, [onDrop]);

  return (
    <div
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${isDragging ? '#2563eb' : '#e2e8f0'}`,
        borderRadius: 12,
        padding: '28px 20px',
        textAlign: 'center',
        background: isDragging ? '#eff6ff' : '#fafafa',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        marginBottom: 24,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => e.target.files && onDrop(e.target.files)}
      />
      <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
      <div style={{ fontSize: 13, color: '#475569', fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
        Glissez-déposez vos fichiers ici
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
        ou <span style={{ color: '#2563eb', textDecoration: 'underline' }}>parcourir</span>
      </div>
    </div>
  );
}

/* ─── Progress Bar (copié depuis TableView) ─── */
function computeProgress(m: Mesure) {
  const start = dayjs(m.date_decision);
  const end = start.add(m.duree_mois, 'month');
  const now = dayjs();
  const total = Math.max(end.diff(start, 'day'), 1);
  const done = Math.min(Math.max(now.diff(start, 'day'), 0), total);
  return { ratio: done / total, joursRestants: Math.max(end.diff(now, 'day'), 0), endDate: end };
}

/* ─── Main Component ─── */
interface Props {
  mesure: Mesure;
  onBack: () => void;
}

const ProjectView: React.FC<Props> = ({ mesure, onBack }) => {
  const [folders] = useState<ProjectFolder[]>(MOCK_FOLDERS);
  const [previewFile, setPreviewFile] = useState<ProjectFile | null>(null);
  
  const { ratio, joursRestants, endDate } = computeProgress(mesure);
  const pct = Math.round(ratio * 100);
  const progressColor = pct >= 90 ? '#ef4444' : pct >= 60 ? '#f59e0b' : '#3b82f6';

  const handleFileDrop = useCallback((files: FileList) => {
    // Pour l'instant, juste un log - plus tard, upload vers Supabase
    console.log('Files dropped:', Array.from(files).map(f => f.name));
    alert(`${files.length} fichier(s) sélectionné(s) - L'upload sera disponible prochainement`);
  }, []);

  const totalFiles = folders.reduce((acc, f) => acc + f.files.length, 0);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'DM Sans', sans-serif", background: '#f8fafc' }}>
      
      {/* Header projet */}
      <div style={{ 
        background: 'white', 
        borderBottom: '1px solid #e2e8f0',
        padding: '16px 20px',
        flexShrink: 0,
      }}>
        {/* Bouton retour */}
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#2563eb',
            fontSize: 13,
            fontWeight: 500,
            padding: 0,
            marginBottom: 14,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          ← Retour à la liste
        </button>

        {/* Infos projet */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#64748b', marginBottom: 4 }}>
              {mesure.ref_cadastrale}
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>
              {(mesure.commune || '—').split(',')[0].replace(/[{}"]/g, '') || 'Commune inconnue'}
            </h1>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              {mesure.catalog?.toUpperCase()} • {mesure.maitre_ouvrage || 'Maître d\'ouvrage non renseigné'}
            </div>
          </div>

          {/* Stats rapides */}
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fichiers</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{totalFiles}</div>
            </div>
            <div style={{ width: 1, height: 36, background: '#e2e8f0' }} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dossiers</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{folders.length}</div>
            </div>
          </div>
        </div>

        {/* Barre de progression */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>Progression de la mesure</span>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {joursRestants > 0 ? `${joursRestants} jours restants` : 'Mesure terminée'} • Fin : {endDate.format('DD/MM/YYYY')}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 99, background: '#e2e8f0', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: progressColor, borderRadius: 99, transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{pct}% écoulé</div>
        </div>
      </div>

      {/* Contenu scrollable */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {/* Zone de drop */}
        <DropZone onDrop={handleFileDrop} />

        {/* Dossiers */}
        {folders.map((folder) => (
          <FolderSection 
            key={folder.id} 
            folder={folder} 
            onFileClick={(file) => setPreviewFile(file)}
          />
        ))}
      </div>

      {/* Modal preview */}
      {previewFile && (
        <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </div>
  );
};

export default ProjectView;