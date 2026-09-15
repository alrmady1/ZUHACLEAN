import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.js';
import { AuthProvider } from './lib/auth.js';
import { I18nProvider } from './lib/i18n.js';
import { initGoogleAdsTag } from './lib/googleAds.js';
import './index.css';

// تطبيق صفحة واحدة (SPA) — استدعاء واحد هنا يحقن Google tag لكل صفحات
// الموقع (بلا شيء لعمله لكل مسار على حدة). يعمل فقط في بيئة الإنتاج
// (انظر تعليق initGoogleAdsTag في googleAds.ts).
initGoogleAdsTag();

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
