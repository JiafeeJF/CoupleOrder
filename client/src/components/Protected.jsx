import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export function FullScreenLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-peach border-t-coral" />
        <p className="mt-4 text-sm text-latte">加载中...</p>
      </div>
    </div>
  );
}

export function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export function PairRequired({ children }) {
  const { partner, loading } = useAuth();
  if (loading) return <FullScreenLoading />;
  if (!partner) return <Navigate to="/pairing" replace />;
  return children;
}

export function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoading />;
  if (user) return <Navigate to="/app" replace />;
  return children;
}