import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import ScrollManager from './components/ScrollManager.jsx';
import LiveOrder from './components/LiveOrder.jsx';
import { CartBar } from './components/CartDrawer.jsx';
import InviteCatcher, { InviteRoute } from './components/InviteCatcher.jsx';
import Menu from './pages/Menu.jsx';
import Checkout from './pages/Checkout.jsx';
import Orders from './pages/Orders.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import Account from './pages/Account.jsx';
import Wallet from './pages/Wallet.jsx';
import Refer from './pages/Refer.jsx';
import About from './pages/About.jsx';
import Support from './pages/Support.jsx';
import Privacy from './pages/Privacy.jsx';
import Terms from './pages/Terms.jsx';
import NotFound from './pages/NotFound.jsx';

// The menu used to live at /menu: old links (and their tabs, e.g. /menu#drinks) still work.
function MenuRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: '/', search, hash }} replace />;
}

export default function App() {
  const { pathname } = useLocation();
  return (
    <>
      <ScrollManager />
      <InviteCatcher />
      <Header />
      <main>
        <LiveOrder />
        {/* key: each new page fades in */}
        <div className="page" key={pathname}>
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
      </main>
      <Footer />
      <CartBar />
    </>
  );
}
