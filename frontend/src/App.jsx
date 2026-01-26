import { Routes, Route, Navigate } from 'react-router-dom'
import LocationTracker from './pages/LocationTracker'
import TourPlanner from './pages/TourPlanner'
import AdminLogin from './pages/AdminLogin'
import AdminDashboard from './pages/AdminDashboard'
import RestaurantDetails from './pages/RestaurantDetails'
import TagManagement from './pages/TagManagement'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LocationTracker />} />
      <Route path="/tour-planner" element={<TourPlanner />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/admin/restaurant/:restaurantId" element={<RestaurantDetails />} />
      <Route path="/admin/tags" element={<TagManagement />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
