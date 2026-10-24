// Who is signed in. The sign-in screen itself is in screens/SignInScreen.js; any screen can send people
// there with navigation.navigate('SignIn').
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => api.me().then(setCustomer, () => setCustomer(null)), []);

  useEffect(() => {
    refresh().finally(() => setReady(true));
    setUnauthorizedHandler(() => setCustomer(null));
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setCustomer(null);
  }, []);

  const value = useMemo(() => ({ customer, ready, setCustomer, refresh, logout }), [customer, ready, refresh, logout]);
  return createElement(AuthContext.Provider, { value }, children);
}

export const useAuth = () => useContext(AuthContext);
