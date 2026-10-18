import { useEffect, useState } from 'react';

// Logo intro. CSS fades it out after ~2s; we then remove it from the page.
export default function Loader() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 2300);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;
  return (
    <div className="loader" aria-hidden="true">
      <div className="loader__inner">
        <img src="/assets/logo-480.png" alt="" width="480" height="175" />
        <span className="loader__bar"></span>
      </div>
    </div>
  );
}
