import type { ReactNode } from "react";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  id?: string;
}

export function ToggleSwitch({ checked, onChange, label, disabled = false, id }: ToggleSwitchProps) {
  return (
    <label className="eco-toggle" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="eco-toggle__track" aria-hidden />
      <span className="eco-toggle__label">{label}</span>
    </label>
  );
}
