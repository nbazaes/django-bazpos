import { createContext, useContext, useState, useCallback } from "react";

const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside ToastProvider");
  return ctx.show;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const show = useCallback((title, type = "accent") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, title, type, leaving: false }]);
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))
      );
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 220);
    }, 3000);
  }, []);

  const icons = {
    accent: "✦",
    success: "✓",
    danger: "✕",
  };

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}${t.leaving ? " leaving" : ""}`}>
            <span className="toast-icon">{icons[t.type] || icons.accent}</span>
            <div className="toast-body">
              <div className="toast-title">{t.title}</div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
