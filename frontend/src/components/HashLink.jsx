import { Link, useLocation } from 'react-router-dom';

// Link to a section like "#app" or "/#app". On the same page it just scrolls there.
export default function HashLink({ to, children, ...rest }) {
  const { pathname } = useLocation();
  const [path, hash = ''] = to.split('#');
  const target = path || pathname;

  const onClick = e => {
    if (target === pathname && hash) {
      const el = document.getElementById(hash);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <Link to={{ pathname: target, hash: hash ? `#${hash}` : '' }} onClick={onClick} {...rest}>
      {children}
    </Link>
  );
}
