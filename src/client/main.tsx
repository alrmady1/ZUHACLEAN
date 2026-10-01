import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.js';
import { AuthProvider } from './lib/auth.js';
import { I18nProvider } from './lib/i18n.js';
import './index.css';

// Google tag (gtag.js) ليس هنا عمداً — يُحقَن فقط من صفحة "اطلب الخدمة"
// العامة (OrderPage.tsx)، لا لكل صفحات الموقع، حتى لا يُحتسَب استخدام
// الموظفين للوحة الداخلية ضمن زيارات/تحويلات الحساب الإعلاني. انظر
// initGoogleAdsTag في googleAds.ts.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
