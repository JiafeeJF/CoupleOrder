import React from 'react';

// 通用转圈加载动画
export function Spinner({ size = 'md', className = '' }) {
  const cls =
    size === 'lg' ? 'h-10 w-10 border-4' :
    size === 'sm' ? 'h-4 w-4 border-2' :
    'h-8 w-8 border-4';
  return (
    <div
      className={`${cls} animate-spin rounded-full border-peach border-t-coral ${className}`}
      aria-label="加载中"
      role="status"
    />
  );
}

// 列表区域加载状态：居中转圈 + 可选文案
export function ListLoading({ text = '加载中...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Spinner size="lg" />
      <p className="mt-3 text-xs text-latte">{text}</p>
    </div>
  );
}