// ─── Primitives UI ───────────────────────────────────────────────────────────
import React from "react";

// ── Slider ────────────────────────────────────────────────────────────────────
interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  label: string;
  unit?: string;
}

export function Slider({ value, min, max, step = 1, onChange, format, label, unit }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  const display = format ? format(value) : value.toString();

  return (
    <div className="slider-field">
      <div className="slider-header">
        <span className="field-label">{label}</span>
        <span className="field-value mono">
          {display}
          {unit && <span className="field-unit">{unit}</span>}
        </span>
      </div>
      <div className="slider-track-wrap">
        <div className="slider-fill" style={{ width: `${pct}%` }} />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="slider-input"
        />
      </div>
      <div className="slider-bounds">
        <span>{format ? format(min) : min}{unit}</span>
        <span>{format ? format(max) : max}{unit}</span>
      </div>
    </div>
  );
}

// ── NumericInput ──────────────────────────────────────────────────────────────
interface NumericInputProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  unit?: string;
  width?: string;
}

export function NumericInput({ value, min, max, step = 1, onChange, label, unit, width = "72px" }: NumericInputProps) {
  return (
    <div className="numeric-field">
      <span className="field-label">{label}</span>
      <div className="numeric-wrap">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          style={{ width }}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!isNaN(v)) onChange(v);
          }}
          className="numeric-input mono"
        />
        {unit && <span className="field-unit">{unit}</span>}
      </div>
    </div>
  );
}

// ── RadioGroup ────────────────────────────────────────────────────────────────
interface RadioOption<T extends string> {
  value: T;
  label: string;
}

interface RadioGroupProps<T extends string> {
  value: T;
  options: RadioOption<T>[];
  onChange: (v: T) => void;
  name: string;
}

export function RadioGroup<T extends string>({ value, options, onChange, name }: RadioGroupProps<T>) {
  return (
    <div className="radio-group">
      {options.map((opt) => (
        <label key={opt.value} className={`radio-option ${value === opt.value ? "active" : ""}`}>
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

// ── SectionBlock ──────────────────────────────────────────────────────────────
interface SectionBlockProps {
  title: string;
  icon: string;
  children: React.ReactNode;
  accent?: "green" | "blue" | "orange" | "red" | "purple" | "muted";
  collapsible?: boolean;
  defaultOpen?: boolean;
}

export function SectionBlock({
  title, icon, children,
  accent = "green",
  collapsible = false,
  defaultOpen = true,
}: SectionBlockProps) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className={`section-block accent-${accent}`}>
      <div
        className={`section-header ${collapsible ? "clickable" : ""}`}
        onClick={collapsible ? () => setOpen((o) => !o) : undefined}
      >
        <span className="section-icon">{icon}</span>
        <span className="section-title">{title}</span>
        {collapsible && (
          <span className="section-chevron">{open ? "▾" : "▸"}</span>
        )}
      </div>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
export function Badge({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "green" | "red" | "orange" }) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}
