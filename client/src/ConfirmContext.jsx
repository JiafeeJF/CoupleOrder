import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ConfirmContext = createContext(null);

// 弹出式确认：await confirm({ title, message, confirmText, cancelText, danger })
// 返回 true / false
export function useConfirm() {
  return useContext(ConfirmContext);
}

function WarningIcon() {
  return (
    <svg className="h-5 w-5 text-tangerine" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { title, message, confirmText, cancelText, danger, resolve }

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const close = (result) => {
    state?.resolve?.(result);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {state && (
          <div
            className="fixed inset-0 z-[80] flex items-end justify-center bg-black/30 p-4 md:items-center"
            onClick={() => close(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-soft"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center gap-2.5">
                {state.danger && <WarningIcon />}
                <h3 className="text-base font-bold text-cocoa">{state.title || '确认操作'}</h3>
              </div>
              <p className="mb-5 whitespace-pre-line text-sm leading-relaxed text-latte">{state.message}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => close(false)}
                  className="btn-secondary flex-1 !py-2.5 text-sm"
                >
                  {state.cancelText || '取消'}
                </button>
                <button
                  onClick={() => close(true)}
                  className={`flex-1 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-all hover:brightness-105 active:scale-[0.97] ${
                    state.danger ? 'bg-gradient-to-r from-tangerine to-rose' : 'bg-gradient-to-r from-coral to-rose'
                  }`}
                >
                  {state.confirmText || '确定'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}