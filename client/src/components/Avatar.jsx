import React from 'react';

// 圆形头像：有头像显示图片，无头像显示首字母
export default function Avatar({ user, size = 'md', className = '' }) {
  const sizeCls =
    size === 'lg' ? 'h-16 w-16 text-2xl' :
    size === 'sm' ? 'h-8 w-8 text-xs' :
    'h-12 w-12 text-lg';

  if (user?.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.name || '头像'}
        className={`${sizeCls} shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <div
      className={`${sizeCls} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-coral to-rose font-bold text-white shadow-sm ${className}`}
    >
      {user?.name?.charAt(0) || '?'}
    </div>
  );
}