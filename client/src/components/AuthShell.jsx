import React from 'react';
import { IconHeart } from './Icons.jsx';

export default function AuthShell({ children, subtitle }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cream px-5 py-10">
      <IconHeart className="pointer-events-none absolute -left-8 top-16 h-40 w-40 text-rose" />
      <IconHeart className="pointer-events-none absolute -right-10 bottom-20 h-56 w-56 text-coral" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-coral to-rose shadow-soft">
            <IconHeart className="h-8 w-8 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold tracking-wide text-cocoa">
            Couple<span className="text-rose">Order</span>
          </h1>
          <p className="mt-1.5 text-sm text-latte">{subtitle || '专属于你们的点餐小屋'}</p>
        </div>
        {children}
      </div>
    </div>
  );
}