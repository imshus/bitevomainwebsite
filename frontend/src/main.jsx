import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './state/auth.jsx';
import { CartProvider } from './state/cart.jsx';
import { ToastProvider } from './state/toast.jsx';
import { reloadOnStaleFiles } from './lib/lazy.js';
// Fonts are served by this site with the rest of its files (no trip to Google first). Only the weights the
// styles use: Poppins for everything, Playfair Display italic for the <em> accents in headings.
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/poppins/800.css';
import '@fontsource/playfair-display/700-italic.css';
import './styles.css';
import './order.css';
import './location.css';
import './feed.css';
import './refer.css';
import './motion.css';

reloadOnStaleFiles();

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
