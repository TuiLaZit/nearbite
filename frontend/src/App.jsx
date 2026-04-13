import { Routes, Route, Navigate } from 'react-router-dom'
import LocationTracker from './pages/LocationTracker'
import TourPlanner from './pages/TourPlanner'
import AdminLogin from './pages/AdminLogin'
import AdminDashboard from './pages/AdminDashboard'
import TagManagement from './pages/TagManagement'
import LoginPortal from './pages/LoginPortal'
import OwnerDashboard from './pages/OwnerDashboard'
import QrDemo from './pages/QrDemo'
import EntryGate from './pages/EntryGate'
import QrExpired from './pages/QrExpired'
import QrAccessRoute from './components/QrAccessRoute'
import ProtectedRoute from './components/ProtectedRoute'
import useHeartbeat from './hooks/useHeartbeat'

function App() {
  useHeartbeat()

  return (
    <Routes>
      <Route element={<QrAccessRoute />}>
        <Route path="/" element={<LocationTracker />} />
      </Route>
      <Route element={<ProtectedRoute authPath="/owner/check" redirectTo="/login?role=owner" />}>
        <Route path="/qr" element={<QrDemo />} />
      </Route>
      <Route path="/qr-expired" element={<QrExpired />} />
      <Route path="/entry" element={<EntryGate />} />
      <Route path="/login" element={<LoginPortal />} />
      <Route path="/customer" element={<Navigate to="/" replace />} />

      {/* Legacy paths: keep old links working */}
      <Route path="/customer/login" element={<Navigate to="/login?role=customer" replace />} />
      <Route path="/owner/login" element={<Navigate to="/login?role=owner" replace />} />

      <Route element={<ProtectedRoute authPath="/customer/check" redirectTo="/login?role=customer" />}>
        <Route path="/customer/tour-planner" element={<TourPlanner />} />
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
            placeholder="Nhập PASSWORD"
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
