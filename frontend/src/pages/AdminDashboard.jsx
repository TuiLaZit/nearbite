import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BASE_URL } from '../config'
import RestaurantManagement from './RestaurantManagement'
import TagManagement from './TagManagement'

function AdminDashboard() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('dashboard') // dashboard, restaurants, tags
  const [heatmapData, setHeatmapData] = useState([])
  const [map, setMap] = useState(null)
  const [heatmapLayer, setHeatmapLayer] = useState(null)

  useEffect(() => {
    // Check authentication
    fetch(`${BASE_URL}/admin/check`, {
      credentials: 'include'
    })
      .then(res => {
        if (!res.ok) {
          navigate('/admin/login')
          throw new Error('Not authenticated')
        }
        return res.json()
      })
      .catch(err => {
        if (err.message !== 'Not authenticated') {
          console.error('Check failed:', err)
        }
      })

    // Load heatmap data
    loadHeatmapData()
  }, [navigate])

  useEffect(() => {
    if (activeTab === 'dashboard' && heatmapData.length > 0) {
      initializeMap()
    }
  }, [activeTab, heatmapData])

  useEffect(() => {
    if (activeTab === 'dashboard' && heatmapData.length > 0) {
      initializeMap()
    }
  }, [activeTab, heatmapData])

  const loadHeatmapData = () => {
    fetch(`${BASE_URL}/admin/heatmap`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => setHeatmapData(data))
      .catch(err => console.error('Error loading heatmap:', err))
  }

  const initializeMap = () => {
    // Cleanup existing map
    if (map) {
      map.remove()
    }

    // Initialize Leaflet map
    const L = window.L
    if (!L) {
      console.error('Leaflet not loaded')
      return
    }

    // Create map centered on Vietnam (adjust as needed)
    const newMap = L.map('heatmap-container').setView([16.047079, 108.206230], 13)

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(newMap)

    // Add heatmap layer if plugin is available
    if (L.heatLayer && heatmapData.length > 0) {
      const heatPoints = heatmapData.map(point => [
        point.lat,
        point.lng,
        point.intensity
      ])

      const heat = L.heatLayer(heatPoints, {
        radius: 25,
        blur: 15,
        maxZoom: 17,
        max: Math.max(...heatmapData.map(p => p.intensity)),
        gradient: {
          0.0: 'blue',
          0.5: 'lime',
          0.7: 'yellow',
          1.0: 'red'
        }
      }).addTo(newMap)

      setHeatmapLayer(heat)
    }

    setMap(newMap)
  }

  const handleLogout = () => {
    fetch(`${BASE_URL}/admin/logout`, {
      method: 'POST',
      credentials: 'include'
    }).then(() => {
      navigate('/admin/login')
    })
  }

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <h2 style={styles.sidebarTitle}>🎛️ Admin Panel</h2>
        </div>

        <nav style={styles.nav}>
          <button
            style={{
              ...styles.navButton,
              ...(activeTab === 'dashboard' ? styles.navButtonActive : {})
            }}
            onClick={() => setActiveTab('dashboard')}
          >
            📊 Dashboard
          </button>
          <button
            style={{
              ...styles.navButton,
              ...(activeTab === 'restaurants' ? styles.navButtonActive : {})
            }}
            onClick={() => setActiveTab('restaurants')}
          >
            🍽️ Quản lý Quán
          </button>
          <button
            style={{
              ...styles.navButton,
              ...(activeTab === 'tags' ? styles.navButtonActive : {})
            }}
            onClick={() => setActiveTab('tags')}
          >
            🏷️ Quản lý Tags
          </button>
        </nav>

        <div style={styles.sidebarFooter}>
          <button style={styles.logoutButton} onClick={handleLogout}>
            🚪 Đăng xuất
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={styles.mainContent}>
        {activeTab === 'dashboard' && (
          <div style={styles.dashboardContent}>
            <h1 style={styles.pageTitle}>📍 Heatmap - Điểm nóng User</h1>
            <p style={styles.pageDescription}>
              Bản đồ nhiệt hiển thị các khu vực mà người dùng hay ghé thăm (dừng lại hơn 1 phút)
            </p>
            <div id="heatmap-container" style={styles.heatmapContainer}></div>
          </div>
        )}

        {activeTab === 'restaurants' && <RestaurantManagement />}
        {activeTab === 'tags' && <TagManagement />}
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  sidebar: {
    width: '280px',
    backgroundColor: '#1e293b',
    color: 'white',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '2px 0 10px rgba(0,0,0,0.1)'
  },
  sidebarHeader: {
    padding: '24px 20px',
    borderBottom: '1px solid #334155'
  },
  sidebarTitle: {
    margin: 0,
    fontSize: '24px',
    fontWeight: '600'
  },
  nav: {
    flex: 1,
    padding: '20px 0',
    overflowY: 'auto'
  },
  navButton: {
    width: '100%',
    padding: '14px 20px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#cbd5e1',
    fontSize: '16px',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.2s',
    borderLeft: '4px solid transparent'
  },
  navButtonActive: {
    backgroundColor: '#334155',
    color: 'white',
    borderLeftColor: '#3b82f6',
    fontWeight: '600'
  },
  sidebarFooter: {
    padding: '20px',
    borderTop: '1px solid #334155'
  },
  logoutButton: {
    width: '100%',
    padding: '12px',
    border: 'none',
    backgroundColor: '#ef4444',
    color: 'white',
    fontSize: '16px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  mainContent: {
    flex: 1,
    overflowY: 'auto',
    backgroundColor: '#f8fafc'
  },
  dashboardContent: {
    padding: '32px',
    maxWidth: '1400px',
    margin: '0 auto'
  },
  pageTitle: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: '8px'
  },
  pageDescription: {
    fontSize: '16px',
    color: '#64748b',
    marginBottom: '24px'
  },
  heatmapContainer: {
    width: '100%',
    height: 'calc(100vh - 220px)',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    border: '1px solid #e2e8f0'
  }
}

export default AdminDashboard
