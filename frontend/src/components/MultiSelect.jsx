import { useEffect, useRef, useState } from "react";

export default function MultiSelect({
  label,
  options = [],
  selected = [],
  onChange,
  searchable = true,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (value) => {
    onChange(
      selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]
    );
  };

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const selectedLabels = options
    .filter((o) => selected.includes(o.value))
    .map((o) => o.label);

  let summary = "Todos";
  if (selectedLabels.length === 1) summary = selectedLabels[0];
  else if (selectedLabels.length === 2) summary = selectedLabels.join(", ");
  else if (selectedLabels.length > 2) summary = `${selectedLabels.length} seleccionados`;

  return (
    <div className="multiselect" ref={ref}>
      <span className="multiselect-label">{label}</span>
      <button
        type="button"
        className={`btn btn-sm ${selected.length ? "btn-primary" : "btn-outline"}`}
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
        }}
      >
        {summary} <span className="multiselect-caret">▾</span>
      </button>
      {open && (
        <div className="multiselect-panel">
          {searchable && options.length > 6 && (
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Buscar..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          )}
          <div className="multiselect-options">
            {filtered.map((o) => (
              <label key={String(o.value)} className="multiselect-option">
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={() => toggle(o.value)}
                />
                <span>{o.label}</span>
              </label>
            ))}
            {filtered.length === 0 && (
              <div className="multiselect-empty">Sin opciones</div>
            )}
          </div>
          {selected.length > 0 && (
            <button
              type="button"
              className="btn btn-sm btn-outline btn-block mt-2"
              onClick={() => onChange([])}
            >
              Limpiar selección
            </button>
          )}
        </div>
      )}
    </div>
  );
}
