import { Component, Suspense, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import ScrollManager from './components/ScrollManager.jsx';
import LiveOrder from './components/LiveOrder.jsx';
import { CartBar } from './components/CartDrawer.jsx';
import InviteCatcher, { InviteRoute } from './components/InviteCatcher.jsx';
import { Loading, LoadError } from './components/Sections.jsx';
import { useCart } from './state/cart.jsx';
import Menu from './pages/Menu.jsx';
import NotFound from './pages/NotFound.jsx';
import { lazyLoad, whenIdle } from './lib/lazy.js';

// The menu (the home page) comes with the site's first download; every other page is its own file,
// fetched the first time it's needed.
const Checkout = lazyLoad(() => import('./pages/Checkout.jsx'));
const Orders = lazyLoad(() => import('./pages/Orders.jsx'));
const OrderDetail = lazyLoad(() => import('./pages/OrderDetail.jsx'));
const Account = lazyLoad(() => import('./pages/Account.jsx'));
const Wallet = lazyLoad(() => import('./pages/Wallet.jsx'));
const Refer = lazyLoad(() => import('./pages/Refer.jsx'));
const About = lazyLoad(() => import('./pages/About.jsx'));
const Support = lazyLoad(() => import('./pages/Support.jsx'));
const Privacy = lazyLoad(() => import('./pages/Privacy.jsx'));
const Terms = lazyLoad(() => import('./pages/Terms.jsx'));

const PAGES = { checkout: Checkout, orders: Orders, account: Account, wallet: Wallet, refer: Refer, about: About, support: Support, privacy: Privacy, terms: Terms };
const pageFor = pathname => {
  const [first, second] = pathname.split('/').filter(Boolean);
  return first === 'orders' && second ? OrderDetail : PAGES[first];
};

// Starts fetching a page's file as soon as a link to it is pointed at, touched or tabbed to, so it's
// usually here by the time the tap lands. Checkout is fetched anyway once the menu has settled, or as soon
// as something goes in the cart.
function usePagePreloading() {
  const hasItems = useCart().count > 0;
  useEffect(() => {
    if (hasItems && document.readyState === 'complete') Checkout.preload().catch(() => {});
  }, [hasItems]);
  useEffect(() => {
    const warm = e => {
      const link = e.target.closest?.('a[href]');
      if (link && link.origin === window.location.origin) pageFor(link.pathname)?.preload().catch(() => {});
    };
    const events = ['pointerover', 'pointerdown', 'focusin'];
    events.forEach(type => document.addEventListener(type, warm, { passive: true }));
    whenIdle(() => Checkout.preload().catch(() => {}));
    return () => events.forEach(type => document.removeEventListener(type, warm));
  }, []);
}

// If a page's file can't be fetched (connection dropped), say so instead of leaving the page blank.
// The message clears when the visitor goes to another page.
class PageBoundary extends Component {
  state = { error: null, path: null };
  static getDerivedStateFromError(error) { return { error }; }
  static getDerivedStateFromProps({ path }, state) { return path === state.path ? null : { error: null, path }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="container">
        <LoadError error={{ message: 'This page didn’t load. Check your internet connection and try again.' }} onRetry={() => window.location.reload()} />
      </div>
    );
  }
}

// The menu used to live at /menu: old links (and their tabs, e.g. /menu#drinks) still work.
function MenuRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: '/', search, hash }} replace />;
}

export default function App() {
  const { pathname } = useLocation();
  usePagePreloading();
  // The page someone lands on shows straight away; after that, each new page fades in.
  const landing = useRef(pathname);
  if (landing.current && landing.current !== pathname) landing.current = null;
  return (
    <>
      <ScrollManager />
      <InviteCatcher />
      <Header />
      <main>
        <LiveOrder />
        {/* While the next page's file is on its way, the current page stays on screen (page changes are
            transitions); the spinner only shows when the site is opened straight onto such a page. */}
        <PageBoundary path={pathname}>
          <Suspense fallback={<Loading />}>
            {/* key: each new page fades in */}
            <div className={`page${landing.current ? ' page--landing' : ''}`} key={pathname}>
              <Routes>
                <Route path="/" element={<Menu />} />
                <Route path="/menu" element={<MenuRedirect />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/orders/:id" element={<OrderDetail />} />
                <Route path="/account" element={<Account />} />
                <Route path="/wallet" element={<Wallet />} />
                <Route path="/refer" element={<Refer />} />
                <Route path="/r/:code" element={<InviteRoute />} />
                <Route path="/about" element={<About />} />
                <Route path="/support" element={<Support />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </div>
          </Suspense>
        </PageBoundary>
      </main>
      <Footer />
      <CartBar />
    </>
  );
}
