import { useEffect, useMemo, useRef, useState } from "react";

export type ResultsPickItem = {
  id: string;
  title: string;
  badge?: string;
  badgeClass?: string;
  meta: string;
  searchText: string;
};

type Props = {
  label: string;
  placeholder?: string;
  items: ResultsPickItem[];
  value: string | null;
  disabled?: boolean;
  emptyLabel?: string;
  onChange: (id: string) => void;
};

export function ResultsPickList({
  label,
  placeholder = "Rechercher…",
  items,
  value,
  disabled = false,
  emptyLabel = "Aucun élément",
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = items.find((it) => it.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.searchText.toLowerCase().includes(q));
  }, [items, search]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setSearch("");
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  return (
    <div className="results-pick" ref={wrapRef}>
      <span className="results-toolbar__label">{label}</span>
      <button
        type="button"
        className="results-pick__trigger"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
      >
        {selected ? (
          <span className="results-pick__value">
            <span className="results-pick__value-title">{selected.title}</span>
            {selected.badge && (
              <span className={selected.badgeClass ?? "study-badge"}>{selected.badge}</span>
            )}
            <span className="results-pick__value-meta">{selected.meta}</span>
          </span>
        ) : (
          <span className="results-pick__placeholder">{emptyLabel}</span>
        )}
        <span className="results-pick__caret" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && !disabled && (
        <div className="results-pick__panel">
          <input
            ref={inputRef}
            type="text"
            className="results-pick__search"
            placeholder={placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={placeholder}
          />
          <div className="results-pick__list" role="listbox">
            {filtered.length === 0 ? (
              <div className="results-pick__empty">Aucun pool correspondant</div>
            ) : (
              filtered.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  role="option"
                  aria-selected={it.id === value}
                  className={`results-pick__option${it.id === value ? " is-selected" : ""}`}
                  onClick={() => {
                    onChange(it.id);
                    setOpen(false);
                  }}
                >
                  <span className="results-pick__option-title">{it.title}</span>
                  <span className="results-pick__option-row">
                    {it.badge && (
                      <span className={it.badgeClass ?? "study-badge"}>{it.badge}</span>
                    )}
                    <span className="results-pick__option-meta">{it.meta}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
