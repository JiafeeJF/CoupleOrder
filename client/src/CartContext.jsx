import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';

const CartContext = createContext(null);

export function useCart() {
  return useContext(CartContext);
}

const STORAGE_KEY = 'co_cart';

function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// 全局购物车状态：跨页面共享，并持久化到 localStorage
export function CartProvider({ children }) {
  const [cart, setCart] = useState(loadCart);
  const [open, setOpen] = useState(false); // 底部购物车面板是否展开
  const [mode, setMode] = useState('detail'); // 'detail' 明细 | 'checkout' 结算

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  const addToCart = useCallback((item) => {
    setCart((c) => {
      const exist = c.find((x) => x.id === item.id);
      if (exist) return c.map((x) => (x.id === item.id ? { ...x, quantity: x.quantity + 1 } : x));
      return [...c, { id: item.id, name: item.name, price: item.price, image: item.image || '', quantity: 1 }];
    });
  }, []);

  const decrease = useCallback((itemId) => {
    setCart((c) => {
      const exist = c.find((x) => x.id === itemId);
      if (!exist) return c;
      if (exist.quantity <= 1) return c.filter((x) => x.id !== itemId);
      return c.map((x) => (x.id === itemId ? { ...x, quantity: x.quantity - 1 } : x));
    });
  }, []);

  const removeItem = useCallback((itemId) => setCart((c) => c.filter((x) => x.id !== itemId)), []);
  const clearCart = useCallback(() => setCart([]), []);

  const openCart = useCallback((m = 'detail') => {
    setMode(m);
    setOpen(true);
  }, []);
  const closeCart = useCallback(() => setOpen(false), []);
  const toggleCart = useCallback(() => setOpen((o) => !o), []);

  const count = useMemo(() => cart.reduce((s, x) => s + x.quantity, 0), [cart]);
  const total = useMemo(() => cart.reduce((s, x) => s + x.price * x.quantity, 0), [cart]);

  const value = {
    cart,
    count,
    total,
    addToCart,
    decrease,
    removeItem,
    clearCart,
    open,
    mode,
    openCart,
    closeCart,
    toggleCart,
    setCart,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}