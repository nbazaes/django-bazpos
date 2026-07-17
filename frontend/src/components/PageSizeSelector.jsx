export default function PageSizeSelector({ value, onChange, options = [25, 50, 100] }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-secondary">Mostrar:</span>
      <select
        className="form-control form-control-sm"
        style={{ width: "auto", minWidth: "4.5rem" }}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}
