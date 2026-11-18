import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setAuthToken } from './api.js';
import { connectSocket, disconnectSocket } from './socket.js';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [partner, setPartner] = useState(null);
  const [pairCode, setPairCode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [socketReady, setSocketReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [meData, pairData] = await Promise.all([api.me(), api.pairMe()]);
      setUser(meData.user);
      setPairCode(pairData.pairCode);
      setPartner(pairData.partner);
    } catch {
      setUser(null);
      setPartner(null);
      setPairCode(null);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // 建立 Socket 连接，并暴露连接状态。
  // 子组件的 effect 会先于本 effect 执行，因此不能只依赖 getSocket()，
  // 必须通过 socketReady 让子组件在连接就绪后重新挂载监听器。
  useEffect(() => {
    if (!user) {
      disconnectSocket();
      setSocketReady(false);
      return;
    }
    const s = connectSocket();
    if (s.connected) setSocketReady(true);
    const onConnect = () => setSocketReady(true);
    const onDisconnect = () => setSocketReady(false);
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, [user]);

  const login = useCallback(async (email, password, captcha) => {
    const data = await api.login({ email, password, ...captcha });
    setAuthToken(data.token);
    setUser(data.user);
    setPairCode(data.pairCode);
    // 恢复配对状态：已配对用户登录后直接进入主页，无需重新配对。
    // 必须在 navigate('/app') 之前完成，否则 PairRequired 会误跳配对页。
    try {
      const pairData = await api.pairMe();
      setPairCode(pairData.pairCode);
      setPartner(pairData.partner);
    } catch {
      setPartner(null);
    }
    return data;
  }, []);

  const register = useCallback(async (name, email, password, emailCode, captcha) => {
    const data = await api.register({ name, email, password, emailCode, ...captcha });
    setAuthToken(data.token);
    setUser(data.user);
    setPairCode(data.pairCode);
    return data;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setAuthToken('');
    setUser(null);
    setPartner(null);
    setPairCode(null);
  }, []);

  const bindPair = useCallback(async (code) => {
    const data = await api.bind(code);
    setPartner(data.partner);
    return data;
  }, []);

  const value = { user, partner, pairCode, loading, socketReady, login, register, logout, bindPair, refresh, setPartner };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}