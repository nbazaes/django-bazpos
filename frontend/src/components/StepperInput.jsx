import { useRef } from "react";

function StepperButton({ onClick, active, label, children }) {
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);

  const clearTimers = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    intervalRef.current = null;
    timeoutRef.current = null;
  };

  const startRepeat = () => {
    if (!onClick) return;
    onClick();
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        onClick();
      }, 80);
    }, 250);
  };

  const handleMouseDown = (e) => {
    e.preventDefault();
    startRepeat();
  };

  const handleTouchStart = (e) => {
    e.preventDefault();
    startRepeat();
  };

  return (
    <button
      type="button"
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-sm)",
        background: "var(--bg-input)",
        color: active ? "var(--accent)" : "var(--text-secondary)",
        fontSize: "1.1rem",
        fontWeight: 700,
        lineHeight: 1,
        cursor: onClick ? "pointer" : "not-allowed",
        transition: "all var(--transition)",
        WebkitTapHighlightColor: "transparent",
        opacity: onClick ? 1 : 0.5,
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={clearTimers}
      onMouseLeave={clearTimers}
      onTouchStart={handleTouchStart}
      onTouchEnd={clearTimers}
      onClick={(e) => e.preventDefault()}
      onMouseEnter={(e) => {
        if (!onClick) return;
        e.currentTarget.style.background = "var(--bg-hover)";
        e.currentTarget.style.borderColor = active ? "var(--accent)" : "var(--border-light)";
        e.currentTarget.style.color = active ? "var(--accent-hover)" : "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--bg-input)";
        e.currentTarget.style.borderColor = "var(--border-default)";
        e.currentTarget.style.color = active ? "var(--accent)" : "var(--text-secondary)";
      }}
    >
      {children}
    </button>
  );
}

export default function StepperInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
  active = false,
  style = {},
  inputStyle = {},
  decrementLabel = "Disminuir",
  incrementLabel = "Aumentar",
}) {
  const numericValue = Number(value) || 0;

  const clamp = (val) => {
    let bounded = val;
    if (min !== undefined) bounded = Math.max(min, bounded);
    if (max !== undefined) bounded = Math.min(max, bounded);
    return bounded;
  };

  const decrement = () => {
    if (disabled) return;
    onChange(clamp(numericValue - step));
  };

  const increment = () => {
    if (disabled) return;
    onChange(clamp(numericValue + step));
  };

  const handleChange = (e) => {
    if (disabled) return;
    const raw = e.target.value;
    if (raw === "") {
      onChange(min !== undefined ? min : 0);
      return;
    }
    const parsed = Number.isInteger(step) ? parseInt(raw, 10) : parseFloat(raw);
    if (Number.isNaN(parsed)) return;
    onChange(clamp(parsed));
  };

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        ...style,
      }}
    >
      <StepperButton onClick={disabled ? null : decrement} active={active} label={decrementLabel}>
        −
      </StepperButton>
      <input
        type="number"
        inputMode={Number.isInteger(step) ? "numeric" : "decimal"}
        style={{
          width: inputStyle.width ?? 60,
          textAlign: "center",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-sm)",
          background: "var(--bg-input)",
          color: "var(--text-primary)",
          fontFamily: "var(--font-mono)",
          fontWeight: 600,
          outline: "none",
          padding: "0.25rem 0",
          MozAppearance: "textfield",
          ...inputStyle,
        }}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        disabled={disabled}
      />
      <StepperButton onClick={disabled ? null : increment} active={active} label={incrementLabel}>
        +
      </StepperButton>
    </div>
  );
}
