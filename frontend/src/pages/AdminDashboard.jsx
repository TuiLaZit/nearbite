import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { BASE_URL } from '../config'
import RestaurantManagement from './RestaurantManagement'
import TagManagement from './TagManagement'

// Fix cho Leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

// Custom icon cho restaurant
const restaurantIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="14" fill="#FBBC04" stroke="white" stroke-width="2"/>
      <text x="16" y="21" font-size="16" text-anchor="middle" fill="white">🍜</text>
    </svg>
  `),
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
})

// Component để thêm heatmap layer vào map
function HeatmapLayer({ heatmapData }) {
  const map = useMap()
  const heatLayerRef = useRef(null)

  useEffect(() => {
    if (!map || !window.L || !window.L.heatLayer) return

    // Remove existing heatmap layer
    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current)
    }

    // Add new heatmap layer if data exists
    if (heatmapData && heatmapData.length > 0) {
      const heatPoints = heatmapData.map(point => [
        point.lat,
        point.lng,
        point.intensity
      ])

      const heat = window.L.heatLayer(heatPoints, {
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
      }).addTo(map)

      heatLayerRef.current = heat
    }

    return () => {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current)
      }
    }
  }, [map, heatmapData])

  return null
}

function AdminDashboard() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('dashboard') // dashboard, restaurants, hidden, tags
  const [heatmapData, setHeatmapData] = useState([])
  const [restaurants, setRestaurants] = useState([])
  const [topRestaurants, setTopRestaurants] = useState({
    byVisits: [],
    byDuration: [],
    byAudio: []
  })

  useEffect(() => {
    let isMounted = true
    
    // Check authentication
    fetch(`${BASE_URL}/admin/check`, {
      credentials: 'include'
    })
      .then(res => {
        if (!isMounted) return null
        if (!res.ok) {
          navigate('/admin/login', { replace: true })
          return null
        }
        return res.json()
      })
      .then(data => {
        if (!isMounted || !data) return
        // Load heatmap data only if authenticated
        loadHeatmapData()
      })
      .catch(err => {
        if (!isMounted) return
        console.error('Auth check failed:', err)
        navigate('/admin/login', { replace: true })
      })
    
    return () => { isMounted = false }
  }, [navigate])

  // Load heatmap và restaurants khi load component

  const loadHeatmapData = () => {
    // Load heatmap data
    fetch(`${BASE_URL}/admin/heatmap`, {
      credentials: 'include'
    })
      .then(res => {
        if (!res.ok) {
          throw new Error('Failed to load heatmap')
        }
        return res.json()
      })
      .then(data => {
        setHeatmapData(data || [])
      })
      .catch(err => {
        console.error('Error loading heatmap:', err)
        setHeatmapData([])
      })

    // Load restaurants
    fetch(`${BASE_URL}/restaurants`)
      .then(res => res.json())
      .then(data => {
        setRestaurants(data.restaurants || [])
      })
      .catch(err => {
        console.error('Error loading restaurants:', err)
        setRestaurants([])
      })

    // Load top restaurants analytics
    fetch(`${BASE_URL}/admin/restaurants/top?metric=visits&limit=5`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        setTopRestaurants(prev => ({ ...prev, byVisits: data || [] }))
      })
      .catch(err => console.error('Error loading top visits:', err))

    fetch(`${BASE_URL}/admin/restaurants/top?metric=duration&limit=5`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        setTopRestaurants(prev => ({ ...prev, byDuration: data || [] }))
      })
      .catch(err => console.error('Error loading top duration:', err))

    fetch(`${BASE_URL}/admin/restaurants/top?metric=audio&limit=5`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        setTopRestaurants(prev => ({ ...prev, byAudio: data || [] }))
      })
      .catch(err => console.error('Error loading top audio:', err))
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
            onClick={() => {
              setActiveTab('dashboard')
              loadHeatmapData() // Refresh data when clicking dashboard
            }}
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
              ...(activeTab === 'hidden' ? styles.navButtonActive : {})
            }}
            onClick={() => setActiveTab('hidden')}
          >
            👻 Quán đã ẩn
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
            <h1 style={styles.pageTitle}>� Dashboard Analytics</h1>
            <p style={styles.pageDescription}>
              Thống kê tổng quan và bản đồ quán ăn
            </p>
            
            <div style={styles.dashboardLayout}>
              {/* Left side - Top tables */}
              <div style={styles.topTablesContainer}>
                {/* Top 5 by visits */}
                <div style={styles.topTableCard}>
                  <h3 style={styles.topTableTitle}>🔥 Top 5 Quán được ghé nhiều nhất</h3>
                  <table style={styles.topTable}>
                    <thead>
                      <tr>
                        <th style={styles.topTableTh}>#</th>
                        <th style={styles.topTableTh}>Quán</th>
                        <th style={styles.topTableTh}>Lượt ghé</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topRestaurants.byVisits.length === 0 ? (
                        <tr>
                          <td colSpan="3" style={styles.topTableEmpty}>Chưa có dữ liệu</td>
                        </tr>
                      ) : (
                        topRestaurants.byVisits.map((r, idx) => (
                          <tr key={r.id} style={styles.topTableTr}>
                            <td style={styles.topTableTd}>{idx + 1}</td>
                            <td style={styles.topTableTd}>{r.name}</td>
                            <td style={styles.topTableTd}><strong>{r.visit_count || 0}</strong></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Top 5 by duration */}
                <div style={styles.topTableCard}>
                  <h3 style={styles.topTableTitle}>⏱️ Top 5 Quán được ghé lâu nhất</h3>
                  <table style={styles.topTable}>
                    <thead>
                      <tr>
                        <th style={styles.topTableTh}>#</th>
                        <th style={styles.topTableTh}>Quán</th>
                        <th style={styles.topTableTh}>TG TB (phút)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topRestaurants.byDuration.length === 0 ? (
                        <tr>
                          <td colSpan="3" style={styles.topTableEmpty}>Chưa có dữ liệu</td>
                        </tr>
                      ) : (
                        topRestaurants.byDuration.map((r, idx) => (
                          <tr key={r.id} style={styles.topTableTr}>
                            <td style={styles.topTableTd}>{idx + 1}</td>
                            <td style={styles.topTableTd}>{r.name}</td>
                            <td style={styles.topTableTd}><strong>{r.avg_visit_duration ? r.avg_visit_duration.toFixed(1) : '0.0'}</strong></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Top 5 by audio */}
                <div style={styles.topTableCard}>
                  <h3 style={styles.topTableTitle}>🎧 Top 5 Quán có audio được nghe nhiều nhất</h3>
                  <table style={styles.topTable}>
                    <thead>
                      <tr>
                        <th style={styles.topTableTh}>#</th>
                        <th style={styles.topTableTh}>Quán</th>
                        <th style={styles.topTableTh}>TG TB (giây)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topRestaurants.byAudio.length === 0 ? (
                        <tr>
                          <td colSpan="3" style={styles.topTableEmpty}>Chưa có dữ liệu</td>
                        </tr>
                      ) : (
                        topRestaurants.byAudio.map((r, idx) => (
                          <tr key={r.id} style={styles.topTableTr}>
                            <td style={styles.topTableTd}>{idx + 1}</td>
                            <td style={styles.topTableTd}>{r.name}</td>
                            <td style={styles.topTableTd}><strong>{r.avg_audio_duration ? r.avg_audio_duration.toFixed(1) : '0.0'}</strong></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right side - Map */}
              <div style={styles.mapContainer}>
                <h3 style={styles.mapTitle}>📍 Bản đồ Quán ăn & Heatmap User</h3>
                {restaurants.length === 0 && (
                  <div style={styles.noDataMessage}>
                    ℹ️ Chưa có quán ăn nào trong hệ thống.
                  </div>
                )}
                <div style={styles.heatmapContainer}>
                  <MapContainer
                    center={[10.760426862777551, 106.68198430250096]}
                    zoom={15}
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={true}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                      url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    />
                    
                    {/* Heatmap layer */}
                    <HeatmapLayer heatmapData={heatmapData} />

                    {/* Marker các quán */}
                    {restaurants.map(restaurant => (
                      <Marker
                        key={restaurant.id}
                        position={[restaurant.lat, restaurant.lng]}
                        icon={restaurantIcon}
                      >
                        <Popup maxWidth={300}>
                          <div style={{ padding: '5px' }}>
                            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>{restaurant.name}</h3>
                            {restaurant.address && (
                              <p style={{ margin: '5px 0', fontSize: '13px', color: '#666' }}>
                                📍 {restaurant.address}
                              </p>
                            )}
                            {restaurant.description && (
                              <p style={{ margin: '5px 0', fontSize: '13px', color: '#333' }}>
                                {restaurant.description}
                              </p>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'restaurants' && <RestaurantManagement isHidden={false} />}
        {activeTab === 'hidden' && <RestaurantManagement isHidden={true} />}
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
    width: '100%',
    height: '100%'
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
  dashboardLayout: {
    display: 'flex',
    gap: '24px',
    height: 'calc(100vh - 200px)'
  },
  topTablesContainer: {
    width: '400px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    overflowY: 'auto'
  },
  topTableCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    border: '1px solid #e2e8f0'
  },
  topTableTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: '16px',
    marginTop: '0'
  },
  topTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px'
  },
  topTableTh: {
    textAlign: 'left',
    padding: '8px',
    borderBottom: '2px solid #e2e8f0',
    color: '#64748b',
    fontWeight: '600',
    fontSize: '13px'
  },
  topTableTd: {
    padding: '10px 8px',
    borderBottom: '1px solid #f1f5f9',
    color: '#334155'
  },
  topTableTr: {
    transition: 'background-color 0.2s'
  },
  topTableEmpty: {
    padding: '20px',
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: '13px'
  },
  mapContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column'
  },
  mapTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: '12px',
    marginTop: '0'
  },
  noDataMessage: {
    padding: '12px',
    backgroundColor: '#f1f5f9',
    borderRadius: '8px',
    marginBottom: '12px',
    color: '#475569',
    textAlign: 'center',
    fontSize: '13px'
  },
  heatmapContainer: {
    flex: 1,
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    border: '1px solid #e2e8f0'
  }
}

export default AdminDashboard
