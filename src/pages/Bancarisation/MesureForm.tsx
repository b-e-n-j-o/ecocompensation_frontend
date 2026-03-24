import React, { useState, useEffect } from 'react';
import type { Mesure } from './types';

const FIELD_STYLE: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  border: '1px solid #e2e8f0', borderRadius: 8,
  padding: '8px 10px', fontSize: 13,
  fontFamily: "'DM Sans', sans-serif",
  outline: 'none', background: '#f8fafc',
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#94a3b8',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  marginBottom: 4, display: 'block',
};

interface Props {
  initial?: Partial<Mesure>;
  onSave: (m: Partial<Mesure>) => void;
  onCancel: () => void;
  isEdit?: boolean;
}

const EMPTY: Partial<Mesure> = {
  catalog: 'geomce',
  ref_cadastrale: '',
  commune: '',
  l_dep: '',
  date_decision: new Date().toISOString().slice(0, 10),
  duree_mois: 120,
  statut: 'active',
  maitre_ouvrage: '',
  type_procedure: '',
  classe: '',
  projet: '',
};

export const MesureForm: React.FC<Props> = ({ initial, onSave, onCancel, isEdit }) => {
  const [form, setForm] = useState<Partial<Mesure>>({ ...EMPTY, ...initial });

  useEffect(() => {
    setForm({ ...EMPTY, ...initial });
  }, [initial]);

  const set = (k: keyof Mesure, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ref_cadastrale?.trim()) return;
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0' }}>
      {/* Ligne 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={LABEL_STYLE}>Réf. cadastrale *</label>
          <input style={FIELD_STYLE} value={form.ref_cadastrale ?? ''} onChange={(e) => set('ref_cadastrale', e.target.value)} required placeholder="{34}_AA_0001" />
        </div>
        <div>
          <label style={LABEL_STYLE}>Catalogue</label>
          <select style={FIELD_STYLE} value={form.catalog ?? 'geomce'} onChange={(e) => set('catalog', e.target.value)}>
            <option value="geomce">GEOMCE</option>
            <option value="portfolio">Portefeuille</option>
          </select>
        </div>
      </div>

      {/* Ligne 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={LABEL_STYLE}>Commune</label>
          <input style={FIELD_STYLE} value={form.commune ?? ''} onChange={(e) => set('commune', e.target.value)} placeholder="Nom de la commune" />
        </div>
        <div>
          <label style={LABEL_STYLE}>Département (l_dep)</label>
          <input style={FIELD_STYLE} value={form.l_dep ?? ''} onChange={(e) => set('l_dep', e.target.value)} placeholder="{34}" />
        </div>
      </div>

      {/* Ligne 3 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div>
          <label style={LABEL_STYLE}>Date décision</label>
          <input type="date" style={FIELD_STYLE} value={form.date_decision ?? ''} onChange={(e) => set('date_decision', e.target.value)} />
        </div>
        <div>
          <label style={LABEL_STYLE}>Durée (mois)</label>
          <input type="number" style={FIELD_STYLE} value={form.duree_mois ?? 120} min={1} onChange={(e) => set('duree_mois', Number(e.target.value))} />
        </div>
        <div>
          <label style={LABEL_STYLE}>Statut</label>
          <select style={FIELD_STYLE} value={form.statut ?? 'active'} onChange={(e) => set('statut', e.target.value)}>
            <option value="active">Active</option>
            <option value="terminee">Terminée</option>
            <option value="suspendue">Suspendue</option>
          </select>
        </div>
      </div>

      {/* Ligne 4 */}
      <div>
        <label style={LABEL_STYLE}>Maître d'ouvrage</label>
        <input style={FIELD_STYLE} value={form.maitre_ouvrage ?? ''} onChange={(e) => set('maitre_ouvrage', e.target.value)} />
      </div>

      {/* Ligne 5 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={LABEL_STYLE}>Type de procédure</label>
          <input style={FIELD_STYLE} value={form.type_procedure ?? ''} onChange={(e) => set('type_procedure', e.target.value)} />
        </div>
        <div>
          <label style={LABEL_STYLE}>Classe</label>
          <input style={FIELD_STYLE} value={form.classe ?? ''} onChange={(e) => set('classe', e.target.value)} />
        </div>
      </div>

      {/* Ligne 6 */}
      <div>
        <label style={LABEL_STYLE}>Projet</label>
        <input style={FIELD_STYLE} value={form.projet ?? ''} onChange={(e) => set('projet', e.target.value)} />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
        <button type="button" onClick={onCancel} style={{
          padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0',
          background: 'white', fontSize: 13, cursor: 'pointer', color: '#64748b',
          fontFamily: "'DM Sans', sans-serif",
        }}>Annuler</button>
        <button type="submit" style={{
          padding: '8px 20px', borderRadius: 8, border: 'none',
          background: '#2563eb', color: 'white', fontSize: 13,
          fontWeight: 600, cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif",
        }}>{isEdit ? 'Enregistrer' : 'Ajouter'}</button>
      </div>
    </form>
  );
};