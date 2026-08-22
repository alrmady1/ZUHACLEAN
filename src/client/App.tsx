import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.js';
import Login from './pages/Login.js';
import Dashboard from './pages/Dashboard.js';
import Appointments from './pages/Appointments.js';
import Contracts from './pages/Contracts.js';
import Expenses from './pages/Expenses.js';
import Custody from './pages/Custody.js';
import Sales from './pages/Sales.js';
import Customers from './pages/Customers.js';
import TechnicianPortal from './pages/TechnicianPortal.js';
import Settings from './pages/Settings.js';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/appointments" element={<Appointments />} />
        <Route path="/contracts" element={<Contracts />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/custody" element={<Custody />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/technician" element={<TechnicianPortal />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
