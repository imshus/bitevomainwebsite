// A dialog over the page. `variant="drawer"` slides in from the right (used by the cart).
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Close } from './Icons.jsx';

export default function Modal({ onClose, label, children, className = '', variant = 'dialog' }) {
  const panel = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Runs once per opening: Escape closes, the page behind stops scrolling, focus returns afterwards.
  useEffect(() => {
    const before = document.activeElement;
    const onKey = e => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    if (!panel.current.contains(document.activeElement)) panel.current.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
      before?.focus?.();
    };
  }, []);

  return createPortal(
    <div className={`overlay overlay--${variant}`} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} className={`sheet sheet--${variant} ${className}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <button type="button" className="sheet__close" onClick={onClose} aria-label="Close"><Close /></button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
