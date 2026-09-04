import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.js';
import Login from './pages/Login.js';
import Dashboard from './pages/Dashboard.js';
import Appointments from './pages/Appointments.js';
import Contracts from './pages/Contracts.js';
import Quotes from './pages/Quotes.js';
import Leads from './pages/Leads.js';
import OrderPage from './pages/OrderPage.js';
import Accounting from './pages/Accounting.js';
import Customers from './pages/Customers.js';
import CustomerImport from './pages/CustomerImport.js';
import TechnicianPortal from './pages/TechnicianPortal.js';
import Tracking from './pages/Tracking.js';
import Settings from './pages/Settings.js';
import RatePage from './pages/RatePage.js';
import { useAuth } from './lib/auth.js';

// الفني الميداني ليس له أصلاً رابط "لوحة التحكم" في القائمة (أرقام على
// مستوى الشركة كاملة لا تعنيه)، لكن "/" كانت تعرض لوحة التحكم لأي مستخدم
// بلا استثناء لو وصل إليها مباشرة (كما يحدث فور تسجيل الدخول). الآن
// يُحوَّل الفني مباشرة لبوابته الخاصة بدلاً منها.
function Home() {
  const { user } = useAuth();
  if (user?.role === 'technician') return <Navigate to="/technician" replace />;
  return <Dashboard />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/rate/:appointmentId" element={<RatePage />} />
      <Route path="/order" element={<OrderPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/appointments" element={<Appointments />} />
        <Route path="/contracts" element={<Contracts />} />
        <Route path="/quotes" element={<Quotes />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/accounting" element={<Accounting />} />
        {/* المبيعات والفواتير + المصروفات صارتا تبويبين داخل "المحاسبة" */}
        <Route path="/expenses" element={<Navigate to="/accounting" replace />} />
        <Route path="/sales" element={<Navigate to="/accounting" replace />} />
        {/* العهد أصبحت تبويباً داخل صفحة المصروفات (الآن داخل المحاسبة) */}
        <Route path="/custody" element={<Navigate to="/accounting" replace />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/import" element={<CustomerImport />} />
        <Route path="/technician" element={<TechnicianPortal />} />
        <Route path="/tracking" element={<Tracking />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
