import React, { createContext, useContext, useRef, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const recentToasts = useRef(new Map());

  const toast = useCallback((message, type = 'info') => {
    const dedupeKey = `${type}:${message}`;
    const now = Date.now();
    const lastShown = recentToasts.current.get(dedupeKey) || 0;
    if (now - lastShown < 1200) return;
    recentToasts.current.set(dedupeKey, now);
    const id = now + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3500);
  }, []);

  const bgMap = {
    info: 'from-coral to-rose text-white',
    success: 'from-green-400 to-emerald-500 text-white',
    error: 'from-tangerine to-rose text-white',
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+1rem)] z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto animate-[slideDown_0.3s_ease-out] rounded-2xl bg-gradient-to-r ${bgMap[t.type] || bgMap.info} px-5 py-3 text-sm font-medium shadow-lg backdrop-blur-sm`}
          >
            {t.message}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-16px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}