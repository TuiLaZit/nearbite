import { Routes, Route, Navigate } from 'react-router-dom'
import LocationTracker from './pages/LocationTracker'
import TourPlanner from './pages/TourPlanner'
import AdminLogin from './pages/AdminLogin'
import AdminDashboard from './pages/AdminDashboard'
import TagManagement from './pages/TagManagement'
import RoleSelection from './pages/RoleSelection'
import CustomerLogin from './pages/CustomerLogin'
import OwnerLogin from './pages/OwnerLogin'
import OwnerDashboard from './pages/OwnerDashboard'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <Routes>
      <Route path="/" element={<RoleSelection />} />
      <Route path="/customer/login" element={<CustomerLogin />} />
      <Route path="/owner/login" element={<OwnerLogin />} />

      <Route element={<ProtectedRoute authPath="/customer/check" redirectTo="/customer/login" />}>
        <Route path="/customer" element={<LocationTracker />} />
        <Route path="/customer/tour-planner" element={<TourPlanner />} />
      </Route>

      <Route path="/tour-planner" element={<Navigate to="/customer/tour-planner" replace />} />

      <Route element={<ProtectedRoute authPath="/owner/check" redirectTo="/owner/login" />}>
        <Route path="/owner" element={<OwnerDashboard />} />
      </Route>

      <Route
        path="/admin/login"
        element={
          <AdminLogin
            role="admin"
            redirectPath="/admin"
            title="🍜 Admin Login"
            placeholder="Admin password"
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
