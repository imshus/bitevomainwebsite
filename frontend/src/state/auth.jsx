// Who is signed in, plus the sign-in sheet any page can open with `requireLogin()`.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from '../api.js';
import LoginModal from '../components/LoginModal.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [ready, setReady] = useState(false);
  const [login, setLogin] = useState(null); // { reason, resolve } while the sign-in sheet is open

  useEffect(() => {
    api.me().then(setCustomer, () => setCustomer(null)).finally(() => setReady(true));
    setUnauthorizedHandler(() => setCustomer(null));
  }, []);

  // Resolves with the customer once they're signed in (and have a name), or null if they close the sheet.
  const requireLogin = useCallback(
    reason => (customer?.name ? Promise.resolve(customer) : new Promise(resolve => setLogin({ reason, resolve }))),
    [customer],
  );

  const finish = useCallback(signedIn => {
    if (signedIn) setCustomer(signedIn);
    setLogin(current => {
      current?.resolve(signedIn || null);
      return null;
    });
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setCustomer(null);
  }, []);

  const value = useMemo(() => ({ customer, ready, setCustomer, requireLogin, logout }), [customer, ready, requireLogin, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      {login && <LoginModal reason={login.reason} existing={customer} onDone={finish} />}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
