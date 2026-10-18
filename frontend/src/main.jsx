import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './state/auth.jsx';
import { CartProvider } from './state/cart.jsx';
import { ToastProvider } from './state/toast.jsx';
import './styles.css';
import './order.css';
import './location.css';
import './feed.css';
import './refer.css';
import './motion.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
