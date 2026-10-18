// Small messages that slide up from the bottom of the screen ("Order cancelled", errors, …).
// `toast(message, tone, { action: { label, run } })` adds a button, e.g. Undo.
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Check, Alert } from '../components/Icons.jsx';

const ToastContext = createContext(() => {});
const SHOW_MS = 3800;
const LEAVE_MS = 260;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback(id => {
    setToasts(t => t.map(x => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), LEAVE_MS);
  }, []);

  const toast = useCallback((message, tone = 'ok', { action } = {}) => {
    const id = nextId.current++;
    setToasts(t => [...t.slice(-2), { id, message, tone, action }]);
    setTimeout(() => dismiss(id), action ? SHOW_MS + 1500 : SHOW_MS);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast--${t.tone}${t.leaving ? ' is-leaving' : ''}`}>
            {t.tone !== 'info' && <span className="toast__icon">{t.tone === 'error' ? <Alert /> : <Check />}</span>}
            <span className="toast__msg">{t.message}</span>
            {t.action && (
              <button type="button" className="toast__action" onClick={() => { t.action.run(); dismiss(t.id); }}>{t.action.label}</button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
