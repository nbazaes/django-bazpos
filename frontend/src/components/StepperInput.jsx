import { useCallback, useEffect, useRef, useState } from "react";

function StepperButton({ onClick, active, label, children }) {
  const onClickRef = useRef(null);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  const release = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    intervalRef.current = null;
    timeoutRef.current = null;
    setPressed(false);
  }, []);

  useEffect(() => release, [release]);

  useEffect(() => {
    if (!pressed) return;
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, [pressed, release]);

  const startRepeat = () => {
    if (!onClickRef.current) return;
    if (intervalRef.current || timeoutRef.current) return;
    onClickRef.current();
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        if (!onClickRef.current) {
          release();
          return;
        }
        onClickRef.current();
      }, 80);
    }, 250);
    setPressed(true);
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // some browsers throw if the pointer is already released
    }
    startRepeat();
  };

  const handleKeyDown = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onClickRef.current?.();
  };

  return (
    <button
      type="button"
      className={`stepper-btn${active ? " stepper-active" : ""}`}
      disabled={!onClick}
      aria-label={label}
      onPointerDown={handlePointerDown}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onKeyDown={handleKeyDown}
      onClick={(e) => e.preventDefault()}
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
      <StepperButton onClick={disabled || (min !== undefined && numericValue <= min) ? null : decrement} active={active} label={decrementLabel}>
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
      <StepperButton onClick={disabled || (max !== undefined && numericValue >= max) ? null : increment} active={active} label={incrementLabel}>
        +
      </StepperButton>
    </div>
  );
}
