import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { ToastProvider } from './ToastContext.jsx';
import { AuthProvider } from './auth.jsx';
import { CartProvider } from './CartContext.jsx';
import { FlyProvider } from './FlyContext.jsx';
import { ConfirmProvider } from './ConfirmContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <CartProvider>
            <FlyProvider>
              <ConfirmProvider>
                <App />
              </ConfirmProvider>
            </FlyProvider>
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
