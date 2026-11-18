import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconClose } from './Icons.jsx';

// 通用弹窗：移动端底部弹出、桌面居中
export default function Modal({ open, title, onClose, children }) {
  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30 md:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 60 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white md:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-peach px-5 py-4">
              <h3 className="text-base font-bold text-cocoa">{title}</h3>
              <button onClick={onClose} className="btn-ghost p-1">
                <IconClose />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}