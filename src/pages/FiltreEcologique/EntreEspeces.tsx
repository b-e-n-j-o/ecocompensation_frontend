type Op = "and" | "or";

export function EntreEspeces({
  value,
  disabled,
  onChange,
}: {
  value: Op;
  disabled?: boolean;
  onChange: (next: Op) => void;
}) {
  return (
    <div className="eco-entre" role="group" aria-label="Lien entre les deux espèces">
      <button
        type="button"
        className={value === "and" ? "is-on" : ""}
        disabled={disabled}
        onClick={() => onChange("and")}
      >
        ET
      </button>
      <button
        type="button"
        className={value === "or" ? "is-on" : ""}
        disabled={disabled}
        onClick={() => onChange("or")}
      >
        OU
      </button>
    </div>
  );
}
