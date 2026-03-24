import React, { useState, useCallback, useMemo } from 'react';
import { createStudyFromParcelle, type StudyFromParcelleResponse } from '../../api';
import MapView from './MapView';

const FONT_LINK = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');`;

/* ─── Types ─── */
interface ParcelleRef {
  insee: string;
  section: string;
  numero: string;
}

type ResultTab = 'synthese' | 'hydrologie' | 'reglementaire' | 'vegetation' | 'occupation';

interface LayerConfig {
  id: string;
  label: string;
  color: string;
  visible: boolean;
  data?: GeoJSON.FeatureCollection;
}

/* ─── Mock des résultats (pour la V1) ─── */
const MOCK_LAYERS: Record<ResultTab, LayerConfig[]> = {
  synthese: [],
  hydrologie: [
    { id: 'cours_eau', label: "Cours d'eau", color: '#3b82f6', visible: true },
    { id: 'zones_inondables', label: 'Zones inondables (PPRI)', color: '#60a5fa', visible: true },
    { id: 'zones_humides', label: 'Zones humides', color: '#06b6d4', visible: false },
    { id: 'bassins_versants', label: 'Bassins versants', color: '#0ea5e9', visible: false },
  ],
  reglementaire: [
    { id: 'znieff1', label: 'ZNIEFF Type 1', color: '#22c55e', visible: true },
    { id: 'znieff2', label: 'ZNIEFF Type 2', color: '#86efac', visible: false },
    { id: 'natura2000', label: 'Natura 2000', color: '#16a34a', visible: true },
    { id: 'monuments', label: 'Périmètres monuments', color: '#f59e0b', visible: false },
    { id: 'plu', label: 'Zonage PLU', color: '#a855f7', visible: true },
  ],
  vegetation: [
    { id: 'haies', label: 'Haies bocagères', color: '#15803d', visible: true },
    { id: 'forets', label: 'Forêts', color: '#166534', visible: true },
    { id: 'prairies', label: 'Prairies permanentes', color: '#84cc16', visible: false },
    { id: 'vergers', label: 'Vergers', color: '#65a30d', visible: false },
  ],
  occupation: [
    { id: 'artificialise', label: 'Surfaces artificialisées', color: '#ef4444', visible: true },
    { id: 'agricole', label: 'Terres agricoles', color: '#eab308', visible: true },
    { id: 'naturel', label: 'Espaces naturels', color: '#22c55e', visible: true },
  ],
};

const MOCK_SYNTHESIS = {
  surface_ha: 2.45,
  perimetre_m: 847,
  score_ecologique: 72,
  enjeux: [
    { niveau: 'fort', label: 'Proximité zone humide (45m)', color: '#ef4444' },
    { niveau: 'moyen', label: 'ZNIEFF Type 2 partielle', color: '#f59e0b' },
    { niveau: 'faible', label: 'Corridor écologique potentiel', color: '#22c55e' },
  ],
  zonage_plu: 'A (Agricole)',
  commune: 'Latresne',
};

/* ─── Composant Tabs ─── */
const TABS: { id: ResultTab; label: string; icon: string }[] = [
  { id: 'synthese', label: 'Synthèse', icon: '📊' },
  { id: 'hydrologie', label: 'Hydrologie', icon: '💧' },
  { id: 'reglementaire', label: 'Réglementaire', icon: '📜' },
  { id: 'vegetation', label: 'Végétation', icon: '🌳' },
  { id: 'occupation', label: 'Occupation', icon: '🗺️' },
];

/* ─── Sélecteur de parcelle ─── */
function ParcelleSelector({
  value,
  onChange,
  onSubmit,
  isLoading,
  bufferM,
  onBufferChange,
}: {
  value: ParcelleRef;
  onChange: (v: ParcelleRef) => void;
  onSubmit: () => void;
  isLoading: boolean;
  bufferM: number;
  onBufferChange: (v: number) => void;
}) {
  return (
    <div style={{
      background: 'white',
      borderRadius: 10,
      border: '1px solid #e2e8f0',
      padding: 16,
      marginBottom: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
        Référence cadastrale
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
        Saisissez la parcelle cible pour lancer l'analyse écologique
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px', gap: 10, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 11, color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Code INSEE
          </label>
          <input
            value={value.insee}
            onChange={(e) => onChange({ ...value, insee: e.target.value })}
            placeholder="33234"
            style={{
              width: '100%',
              marginTop: 4,
              padding: '8px 10px',
              fontSize: 13,
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              fontFamily: "'IBM Plex Mono', monospace",
              outline: 'none',
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Section
          </label>
          <input
            value={value.section}
            onChange={(e) => onChange({ ...value, section: e.target.value.toUpperCase() })}
            placeholder="AL"
            maxLength={2}
            style={{
              width: '100%',
              marginTop: 4,
              padding: '8px 10px',
              fontSize: 13,
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              fontFamily: "'IBM Plex Mono', monospace",
              outline: 'none',
              textTransform: 'uppercase',
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Numéro
          </label>
          <input
            value={value.numero}
            onChange={(e) => onChange({ ...value, numero: e.target.value })}
            placeholder="0417"
            style={{
              width: '100%',
              marginTop: 4,
              padding: '8px 10px',
              fontSize: 13,
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              fontFamily: "'IBM Plex Mono', monospace",
              outline: 'none',
            }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Buffer d'analyse (mètres)
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
          <input
            type="range"
            min={10}
            max={500}
            step={10}
            value={bufferM}
            onChange={(e) => onBufferChange(Number(e.target.value))}
            style={{ flex: 1, accentColor: '#2563eb' }}
          />
          <span style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 12,
            color: '#0f172a',
            background: '#f1f5f9',
            padding: '4px 10px',
            borderRadius: 6,
            minWidth: 50,
            textAlign: 'center',
          }}>
            {bufferM}m
          </span>
        </div>
      </div>

      <button
        onClick={onSubmit}
        disabled={isLoading || !value.insee.trim() || !value.section.trim() || !value.numero.trim()}
        style={{
          width: '100%',
          padding: '10px 16px',
          borderRadius: 8,
          border: 'none',
          background: isLoading ? '#94a3b8' : '#2563eb',
          color: 'white',
          fontSize: 13,
          fontWeight: 600,
          cursor: isLoading ? 'wait' : 'pointer',
          fontFamily: "'DM Sans', sans-serif",
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          transition: 'background 0.15s',
        }}
      >
        {isLoading ? (
          <>
            <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
            Analyse en cours…
          </>
        ) : (
          <>Lancer la pré-analyse écologique</>
        )}
      </button>
    </div>
  );
}

/* ─── Layer Toggle ─── */
function LayerToggle({
  layer,
  onToggle,
}: {
  layer: LayerConfig;
  onToggle: (id: string) => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 8,
        background: layer.visible ? '#f8fafc' : 'transparent',
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
    >
      <input
        type="checkbox"
        checked={layer.visible}
        onChange={() => onToggle(layer.id)}
        style={{ accentColor: layer.color, width: 16, height: 16 }}
      />
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 3,
          background: layer.color,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 13, color: '#334155', flex: 1 }}>{layer.label}</span>
    </label>
  );
}

/* ─── Panneau Synthèse ─── */
function SynthesisPanel({ hasResults }: { hasResults: boolean }) {
  if (!hasResults) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔬</div>
        <div style={{ fontSize: 13 }}>Lancez une analyse pour voir la synthèse</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      {/* Métriques principales */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Surface', value: `${MOCK_SYNTHESIS.surface_ha} ha`, icon: '📐' },
          { label: 'Périmètre', value: `${MOCK_SYNTHESIS.perimetre_m} m`, icon: '📏' },
          { label: 'Score éco.', value: `${MOCK_SYNTHESIS.score_ecologique}/100`, icon: '🌿' },
        ].map((m) => (
          <div
            key={m.label}
            style={{
              background: '#f8fafc',
              borderRadius: 10,
              padding: '12px 14px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 20, marginBottom: 4 }}>{m.icon}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{m.value}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Infos parcelle */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Informations parcelle
        </div>
        <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>Commune</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#0f172a' }}>{MOCK_SYNTHESIS.commune}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>Zonage PLU</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#0f172a' }}>{MOCK_SYNTHESIS.zonage_plu}</span>
          </div>
        </div>
      </div>

      {/* Enjeux identifiés */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Enjeux identifiés
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MOCK_SYNTHESIS.enjeux.map((e, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 8,
                background: 'white',
                border: '1px solid #e2e8f0',
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: e.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 12, color: '#334155', flex: 1 }}>{e.label}</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  color: e.color,
                  background: `${e.color}15`,
                  padding: '3px 8px',
                  borderRadius: 99,
                }}
              >
                {e.niveau}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Panneau Couches ─── */
function LayersPanel({
  layers,
  onToggle,
  hasResults,
}: {
  layers: LayerConfig[];
  onToggle: (id: string) => void;
  hasResults: boolean;
}) {
  if (!hasResults) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
        <div style={{ fontSize: 13 }}>Lancez une analyse pour afficher les couches</div>
      </div>
    );
  }

  const visibleCount = layers.filter((l) => l.visible).length;

  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
        {visibleCount} couche{visibleCount > 1 ? 's' : ''} visible{visibleCount > 1 ? 's' : ''} sur {layers.length}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {layers.map((layer) => (
          <LayerToggle key={layer.id} layer={layer} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}

/* ─── Page principale ─── */
export default function AnalyseEcologiquePage() {
  const [parcelle, setParcelle] = useState<ParcelleRef>({ insee: '33234', section: 'AL', numero: '0417' });
  const [bufferM, setBufferM] = useState(50);
  const [isLoading, setIsLoading] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [studyResult, setStudyResult] = useState<StudyFromParcelleResponse | null>(null);

  const [activeTab, setActiveTab] = useState<ResultTab>('synthese');
  const [layers, setLayers] = useState(MOCK_LAYERS);

  const handleSubmit = useCallback(async () => {
    if (!parcelle.insee.trim() || !parcelle.section.trim() || !parcelle.numero.trim()) {
      return;
    }

    setIsLoading(true);
    try {
      const res = await createStudyFromParcelle({
        insee: parcelle.insee.trim(),
        section: parcelle.section.trim(),
        numeros: [parcelle.numero.trim()],
        buffer_m: Math.max(1, Math.round(bufferM)),
        // Pour l'instant, on exécute en mode "dry-run" :
        // aucune écriture en base Supabase, uniquement logs + fichiers locaux.
        dry_run: true,
      });
      setStudyResult(res);
      setHasResults(true);
      setActiveTab('synthese');
    } catch (err) {
      console.error('Erreur Identité écologique:', err);
      alert('Erreur lors du lancement de l\'analyse (voir console).');
    } finally {
      setIsLoading(false);
    }
  }, [parcelle, bufferM]);

  const handleToggleLayer = useCallback((tabId: ResultTab, layerId: string) => {
    setLayers((prev) => ({
      ...prev,
      [tabId]: prev[tabId].map((l) =>
        l.id === layerId ? { ...l, visible: !l.visible } : l
      ),
    }));
  }, []);

  const currentLayers = layers[activeTab] || [];

  // Référence cadastrale formatée
  const refCadastrale = useMemo(() => {
    if (!parcelle.insee || !parcelle.section || !parcelle.numero) return null;
    return `${parcelle.insee} ${parcelle.section} ${parcelle.numero}`;
  }, [parcelle]);

  return (
    <>
      <style>{FONT_LINK}</style>
      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:6px;height:6px}
        ::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:99px}
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'DM Sans', sans-serif",
        background: '#f8fafc',
      }}>
        {/* Header */}
        <div style={{
          height: 44,
          borderBottom: '1px solid #e2e8f0',
          background: 'white',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 12,
          flexShrink: 0,
        }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>
            Pré-analyse écologique
          </div>
          <div style={{ height: 16, width: 1, background: '#e2e8f0' }} />
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#2563eb',
            background: '#eff6ff',
            padding: '3px 10px',
            borderRadius: 99,
          }}>
            Identité écologique
          </span>

          {hasResults && refCadastrale && (
            <>
              <div style={{ height: 16, width: 1, background: '#e2e8f0' }} />
              <span style={{ fontSize: 12, color: '#64748b' }}>Parcelle :</span>
              <span style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 12,
                color: '#020617',
                fontWeight: 700,
              }}>
                {refCadastrale}
              </span>
            </>
          )}

          {studyResult && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 11,
                color: '#16a34a',
                background: '#f0fdf4',
                padding: '4px 10px',
                borderRadius: 6,
                fontWeight: 500,
              }}>
                ✓ Analyse terminée
              </span>
              <button
                style={{
                  padding: '5px 12px',
                  borderRadius: 7,
                  border: '1px solid #e2e8f0',
                  background: 'white',
                  fontSize: 12,
                  cursor: 'pointer',
                  color: '#475569',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                📄 Exporter rapport
              </button>
            </div>
          )}
        </div>

        {/* Corps */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '42% 58%', overflow: 'hidden' }}>
          {/* Panneau gauche */}
          <div style={{
            borderRight: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Sélecteur parcelle */}
            <div style={{ padding: 16, flexShrink: 0 }}>
              <ParcelleSelector
                value={parcelle}
                onChange={setParcelle}
                onSubmit={handleSubmit}
                isLoading={isLoading}
                bufferM={bufferM}
                onBufferChange={setBufferM}
              />
            </div>

            {/* Onglets résultats */}
            <div style={{
              display: 'flex',
              borderBottom: '1px solid #e2e8f0',
              background: 'white',
              padding: '0 12px',
              flexShrink: 0,
              overflowX: 'auto',
            }}>
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '10px 14px',
                    fontSize: 12,
                    fontWeight: activeTab === tab.id ? 600 : 400,
                    color: activeTab === tab.id ? '#2563eb' : '#64748b',
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === tab.id ? '2px solid #2563eb' : '2px solid transparent',
                    cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s',
                  }}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Contenu de l'onglet */}
            <div style={{ flex: 1, overflow: 'auto', background: 'white' }}>
              {activeTab === 'synthese' ? (
                <SynthesisPanel hasResults={hasResults} />
              ) : (
                <LayersPanel
                  layers={currentLayers}
                  onToggle={(id) => handleToggleLayer(activeTab, id)}
                  hasResults={hasResults}
                />
              )}
            </div>
          </div>

          {/* Carte */}
          <div style={{ position: 'relative', overflow: 'hidden' }}>
            <MapView
              parcelleRef={hasResults ? parcelle : null}
              bufferM={bufferM}
              visibleLayers={hasResults ? layers : null}
              activeTab={activeTab}
              onParcelleSelect={(ref) => {
                setParcelle(ref);
                setHasResults(false);
                setStudyResult(null);
              }}
            />

            {/* Légende flottante si résultats */}
            {hasResults && currentLayers.length > 0 && (
              <div style={{
                position: 'absolute',
                bottom: 20,
                left: 20,
                background: 'white',
                borderRadius: 10,
                padding: '12px 14px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                maxWidth: 200,
                zIndex: 10,
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Légende
                </div>
                {currentLayers.filter(l => l.visible).map((l) => (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 14, height: 4, borderRadius: 2, background: l.color }} />
                    <span style={{ fontSize: 11, color: '#475569' }}>{l.label}</span>
                  </div>
                ))}
                {currentLayers.filter(l => l.visible).length === 0 && (
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Aucune couche visible</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}