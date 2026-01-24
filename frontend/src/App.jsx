import { Routes, Route, Navigate } from 'react-router-dom'
import LocationTracker from './pages/LocationTracker'
import AdminLogin from './pages/AdminLogin'
import AdminDashboard from './pages/AdminDashboard'
import MenuManagement from './pages/MenuManagement'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LocationTracker />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/admin/menu/:restaurantId" element={<MenuManagement />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
