import { Routes, Route, Navigate } from 'react-router-dom'
import LocationTracker from './pages/LocationTracker'
import TourPlanner from './pages/TourPlanner'
import AdminLogin from './pages/AdminLogin'
import AdminDashboard from './pages/AdminDashboard'
import TagManagement from './pages/TagManagement'
import LoginPortal from './pages/LoginPortal'
import OwnerDashboard from './pages/OwnerDashboard'
import CustomerOrders from './pages/CustomerOrders'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LocationTracker />} />
      <Route path="/login" element={<LoginPortal />} />
      <Route path="/customer" element={<Navigate to="/" replace />} />

      {/* Legacy paths: keep old links working */}
      <Route path="/customer/login" element={<Navigate to="/login?role=customer" replace />} />
      <Route path="/owner/login" element={<Navigate to="/login?role=owner" replace />} />

      <Route element={<ProtectedRoute authPath="/customer/check" redirectTo="/login?role=customer" />}>
        <Route path="/customer/tour-planner" element={<TourPlanner />} />
        <Route path="/customer/orders" element={<CustomerOrders />} />
        <Route path="/customer/orders/:restaurantId" element={<CustomerOrders />} />
      </Route>

      <Route path="/tour-planner" element={<Navigate to="/customer/tour-planner" replace />} />

      <Route element={<ProtectedRoute authPath="/owner/check" redirectTo="/login?role=owner" />}>
        <Route path="/owner" element={<OwnerDashboard />} />
      </Route>

      <Route
        path="/admin/login"
        element={
          <AdminLogin
            role="admin"
            redirectPath="/admin"
            title="🛡️ Đăng nhập Admin"
            placeholder="Nhập ADMIN_PASSWORD"
          />
        }
      />
      <Route path="/admin" element={<AdminDashboard role="admin" />} />
      <Route path="/admin/tags" element={<TagManagement loginPath="/admin/login" />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
