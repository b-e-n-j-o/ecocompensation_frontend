/**
 * Primitives UI du panneau de filtre — styles inline uniquement (pas de CSS global FilterPanel).
 */
import React, { useState } from "react";

export const filterTheme = {
  bgCard: "#232830",
  bgInput: "#1a1d24",
  border: "#2a2f3d",
  text: "#e5e7eb",
  muted: "#9ca3af",
  accentBlue: "#3b82f6",
  accentGreen: "#10b981",
  accentOrange: "#f59e0b",
  accentRed: "#ef4444",
  accentPurple: "#8b5cf6",
  danger: "#fca5a5",
} as const;

const accentBorder: Record<NonNullable<SectionCardProps["accent"]>, string> = {
  green: filterTheme.accentGreen,
  blue: filterTheme.accentBlue,
  orange: filterTheme.accentOrange,
  red: filterTheme.accentRed,
  purple: filterTheme.accentPurple,
  muted: "#6b7280",
};

export type SectionAccent = keyof typeof accentBorder;

interface SectionCardProps {
  title: string;
  icon: string;
  accent?: SectionAccent;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function SectionCard({
  title,
  icon,
  accent = "green",
  collapsible = false,
  defaultOpen = false,
  children,
}: SectionCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const borderLeft = `2px solid ${accentBorder[accent]}`;

  return (
    <div
      style={{
        background: filterTheme.bgCard,
        border: `1px solid ${filterTheme.border}`,
        borderLeft,
        borderRadius: 6,
        marginBottom: 8,
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: collapsible ? "pointer" : "default",
          borderBottom: open ? `1px solid ${filterTheme.border}` : "none",
        }}
        onClick={collapsible ? () => setOpen((o) => !o) : undefined}
      >
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span
          style={{
            flex: 1,
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            color: filterTheme.muted,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {title}
        </span>
        {collapsible && (
          <span style={{ fontSize: 10, color: "#6b7280" }}>{open ? "▾" : "▸"}</span>
        )}
      </div>
      {open && (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          {children}
        </div>
      )}
    </div>
  );
}

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  unit?: string;
}

export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  unit,
}: SliderFieldProps) {
  const pct = ((value - min) / (max - min)) * 100;
  const display = format ? format(value) : String(value);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, color: "#d1d5db" }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "monospace" }}>
          {display}
          {unit && <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 4 }}>{unit}</span>}
        </span>
      </div>
      <div style={{ position: "relative", height: 20, display: "flex", alignItems: "center" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            height: 3,
            width: `${pct}%`,
            background: filterTheme.accentBlue,
            borderRadius: 2,
            pointerEvents: "none",
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            width: "100%",
            height: 3,
            WebkitAppearance: "none",
            appearance: "none",
            background: filterTheme.border,
            borderRadius: 2,
            cursor: "pointer",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#6b7280", fontFamily: "monospace" }}>
        <span>
          {format ? format(min) : min}
          {unit}
        </span>
        <span>
          {format ? format(max) : max}
          {unit}
        </span>
      </div>
    </div>
  );
}

interface NumericFieldProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: string;
  width?: string;
}

export function NumericField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  unit,
  width = "72px",
}: NumericFieldProps) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 12, color: "#d1d5db" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          style={{
            width,
            padding: "6px 8px",
            background: filterTheme.bgInput,
            border: `1px solid ${filterTheme.border}`,
            borderRadius: 4,
            color: "#fff",
            fontFamily: "monospace",
            fontSize: 13,
            textAlign: "right",
          }}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) onChange(v);
          }}
        />
        {unit && <span style={{ fontSize: 11, color: "#6b7280" }}>{unit}</span>}
      </div>
    </div>
  );
}

interface RadioOption<T extends string> {
  value: T;
  label: string;
}

interface RadioRowProps<T extends string> {
  name: string;
  value: T;
  options: RadioOption<T>[];
  onChange: (v: T) => void;
}

export function RadioRow<T extends string>({ name, value, options, onChange }: RadioRowProps<T>) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {options.map((opt) => (
        <label
          key={opt.value}
          style={{
            flex: 1,
            padding: "6px 10px",
            background: value === opt.value ? "rgba(59, 130, 246, 0.1)" : filterTheme.bgInput,
            border: `1px solid ${value === opt.value ? filterTheme.accentBlue : filterTheme.border}`,
            borderRadius: 4,
            textAlign: "center",
            fontSize: 11,
            cursor: "pointer",
            color: value === opt.value ? filterTheme.accentBlue : "#d1d5db",
          }}
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            style={{ display: "none" }}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: 11, lineHeight: 1.45, color: filterTheme.muted }}>
      {children}
    </p>
  );
}
