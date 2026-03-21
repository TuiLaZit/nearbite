import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { BASE_URL } from '../config'
import RestaurantManagement from './RestaurantManagement'
import TagManagement from './TagManagement'
import AdminAccountManagement from './AdminAccountManagement'

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

function AdminDashboard({ role = 'admin' }) {
  const isOwner = role === 'owner'
  const authBase = isOwner ? '/owner' : '/admin'
  const loginPath = isOwner ? '/owner/login' : '/admin/login'
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState(isOwner ? 'restaurants' : 'dashboard') // dashboard, restaurants, hidden, tags
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
    fetch(`${BASE_URL}${authBase}/check`, {
      credentials: 'include'
    })
      .then(res => {
        if (!isMounted) return null
        if (!res.ok) {
          navigate(loginPath, { replace: true })
          return null
        }
        return res.json()
      })
      .then(data => {
        if (!isMounted || !data) return
        if (isOwner) {
          // Owner chỉ cần quản lý quán, không cần analytics
          return
        }
        loadHeatmapData()
      })
      .catch(err => {
        if (!isMounted) return
        console.error('Auth check failed:', err)
        navigate(loginPath, { replace: true })
      })
    
    return () => { isMounted = false }
  }, [authBase, isOwner, loginPath, navigate])

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
    fetch(`${BASE_URL}${authBase}/logout`, {
      method: 'POST',
      credentials: 'include'
    }).then(() => {
      localStorage.removeItem('activeRole')
      navigate(loginPath)
    })
  }

  return (
    <>
      <style>{`
        .topbar-nav-btn {
          margin: 0;
          border: 1px solid rgba(120, 148, 181, 0.34);
          background: rgba(14, 33, 61, 0.5);
          color: #d9e7f8;
          border-radius: 12px;
          height: 40px;
          padding: 0 14px;
          transition: all 0.22s ease;
        }

        .topbar-nav-btn:hover {
          border: 1px solid rgba(158, 193, 234, 0.68);
          background: linear-gradient(128deg, rgba(42, 88, 156, 0.85), rgba(34, 119, 136, 0.72));
          color: #f5fbff;
          transform: translateY(-1px);
          box-shadow: 0 10px 18px rgba(6, 18, 40, 0.24);
        }

        .topbar-nav-btn.active {
          border: 1px solid rgba(196, 227, 255, 0.94);
          background: linear-gradient(128deg, rgba(74, 145, 235, 0.94), rgba(72, 200, 220, 0.86));
          color: #ffffff;
          box-shadow: 0 12px 22px rgba(8, 24, 50, 0.3), 0 0 20px rgba(130, 207, 255, 0.35);
        }

        .topbar-logout-btn {
          margin: 0;
          border-radius: 12px;
          border: 1px solid rgba(132, 160, 195, 0.42);
          background: linear-gradient(135deg, rgba(18, 59, 117, 0.84) 0%, rgba(18, 98, 122, 0.84) 100%);
          color: #f0f6ff;
          height: 40px;
          padding: 0 16px;
          transition: all 0.2s ease;
        }

        .topbar-logout-btn:hover {
          transform: translateY(-1px);
          border: 1px solid rgba(255, 171, 171, 0.72);
          background: linear-gradient(135deg, #a61b2d 0%, #d62f46 100%) !important;
          box-shadow: 0 12px 22px rgba(85, 9, 24, 0.42), inset 0 0 0 1px rgba(255, 211, 211, 0.26);
        }
      `}</style>
      <div style={styles.container}>
        <header style={styles.topbar}>
          <div style={styles.topbarBrand}>
            <div style={styles.brandDot} />
            <div>
              <div style={styles.topbarTitle}>{isOwner ? 'Owner Command' : 'Admin Command Center'}</div>
              <div style={styles.topbarSub}>{isOwner ? 'Restaurant Operations' : 'NearBite Control Suite'}</div>
            </div>
          </div>

          <nav style={styles.topNav}>
            {!isOwner && (
              <button
                className={`topbar-nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
                style={styles.topNavButton}
                onClick={() => {
                  setActiveTab('dashboard')
                  loadHeatmapData()
                }}
              >
                Dashboard
              </button>
            )}
            <button
              className={`topbar-nav-btn ${activeTab === 'restaurants' ? 'active' : ''}`}
              style={styles.topNavButton}
              onClick={() => setActiveTab('restaurants')}
            >
              Quản lý quán
            </button>
            {!isOwner && (
              <button
                className={`topbar-nav-btn ${activeTab === 'hidden' ? 'active' : ''}`}
                style={styles.topNavButton}
                onClick={() => setActiveTab('hidden')}
              >
                Quán đã ẩn
              </button>
            )}
            {!isOwner && (
              <button
                className={`topbar-nav-btn ${activeTab === 'tags' ? 'active' : ''}`}
                style={styles.topNavButton}
                onClick={() => setActiveTab('tags')}
              >
                Quản lý tags
              </button>
            )}
            {!isOwner && (
              <button
                className={`topbar-nav-btn ${activeTab === 'adminAccounts' ? 'active' : ''}`}
                style={styles.topNavButton}
                onClick={() => setActiveTab('adminAccounts')}
              >
                Tài khoản admin
              </button>
            )}
          </nav>

          <button className="topbar-logout-btn" style={styles.topbarLogout} onClick={handleLogout}>
            Đăng xuất
          </button>
        </header>

        {/* Main content */}
        <div style={styles.mainContent}>
          <div style={styles.contentFrame}>
            {!isOwner && activeTab === 'dashboard' && (
              <div style={styles.dashboardContent}>
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

            {activeTab === 'restaurants' && (
              <RestaurantManagement
                isHidden={false}
                loginPath={loginPath}
                authCheckPath={`${authBase}/check`}
                isOwnerView={isOwner}
              />
            )}
            {!isOwner && activeTab === 'hidden' && (
              <RestaurantManagement
                isHidden={true}
                loginPath={loginPath}
                authCheckPath={`${authBase}/check`}
              />
            )}
            {!isOwner && activeTab === 'tags' && <TagManagement loginPath={loginPath} />}
            {!isOwner && activeTab === 'adminAccounts' && <AdminAccountManagement />}
          </div>
        </div>
      </div>
    </>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
    fontFamily: 'Plus Jakarta Sans, Segoe UI, sans-serif',
    background: 'radial-gradient(1100px 420px at 10% -12%, rgba(62, 118, 201, 0.2), transparent 70%), radial-gradient(900px 360px at 90% 2%, rgba(50, 146, 162, 0.18), transparent 72%), linear-gradient(160deg, #ebf2fb 0%, #e4edf8 100%)'
  },
  topbar: {
    height: '82px',
    padding: '0 18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '18px',
    borderBottom: '1px solid rgba(136, 160, 195, 0.45)',
    background: 'linear-gradient(145deg, #0b1b33 0%, #102847 52%, #113850 100%)',
    boxShadow: '0 14px 28px rgba(12, 23, 43, 0.28)'
  },
  topbarBrand: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: '250px'
  },
  brandDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #79d8ff 0%, #77f2ce 100%)',
    boxShadow: '0 0 16px rgba(121, 216, 255, 0.8)'
  },
  topbarTitle: {
    color: '#f2f7ff',
    fontSize: '18px',
    fontWeight: '750',
    lineHeight: 1.2
  },
  topbarSub: {
    color: 'rgba(208, 223, 243, 0.85)',
    fontSize: '12px',
    letterSpacing: '0.4px',
    textTransform: 'uppercase',
    marginTop: '2px'
  },
  topNav: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    justifyContent: 'center'
  },
  topNavButton: {
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '650'
  },
  topbarLogout: {
    border: '1px solid rgba(132, 160, 195, 0.42)',
    background: 'rgba(20, 55, 99, 0.88)',
    color: '#f0f6ff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '700'
  },
  mainContent: {
    flex: 1,
    overflowY: 'auto',
    background:
      'radial-gradient(800px 340px at 15% -10%, rgba(214, 167, 86, 0.15), transparent 70%), radial-gradient(900px 380px at 88% 8%, rgba(39, 104, 114, 0.12), transparent 72%), linear-gradient(160deg, #f2f6fb 0%, #ecf2fa 100%)'
  },
  contentFrame: {
    margin: '14px 18px 18px',
    borderRadius: '20px',
    minHeight: 'calc(100vh - 114px)',
    border: '1px solid rgba(133, 158, 193, 0.55)',
    background:
      'linear-gradient(158deg, rgba(255, 255, 255, 0.72) 0%, rgba(247, 251, 255, 0.66) 100%)',
    boxShadow: '0 20px 40px rgba(26, 40, 67, 0.12), inset 0 0 0 1px rgba(255, 255, 255, 0.58)',
    backdropFilter: 'blur(8px)',
    overflow: 'hidden'
  },
  dashboardContent: {
    padding: '26px 34px 34px',
    width: '100%',
    height: '100%'
  },
  pageTitle: {
    fontSize: '34px',
    fontWeight: '750',
    color: '#11203a',
    marginBottom: '6px',
    letterSpacing: '-0.02em'
  },
  pageDescription: {
    fontSize: '15px',
    color: '#4f627e',
    marginBottom: '24px',
    fontWeight: '500'
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
    background: 'linear-gradient(165deg, rgba(255,255,255,0.95) 0%, rgba(246, 250, 255, 0.92) 100%)',
    borderRadius: '16px',
    padding: '20px',
    boxShadow: '0 16px 32px rgba(22, 35, 61, 0.13), 0 0 0 1px rgba(207, 222, 241, 0.5) inset',
    border: '1px solid rgba(188, 208, 233, 0.92)',
    backdropFilter: 'blur(8px)'
  },
  topTableTitle: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#132745',
    marginBottom: '16px',
    marginTop: '0'
  },
  topTable: {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: 0,
    borderRadius: '12px',
    overflow: 'hidden',
    border: '1px solid #c6daf4',
    boxShadow: '0 8px 20px rgba(20, 50, 92, 0.1)',
    fontSize: '14px'
  },
  topTableTh: {
    textAlign: 'left',
    padding: '8px',
    borderBottom: '2px solid #cfe0f4',
    color: '#3f5678',
    fontWeight: '600',
    fontSize: '13px',
    background: 'linear-gradient(180deg, #fafdff 0%, #eaf3ff 100%)'
  },
  topTableTd: {
    padding: '10px 8px',
    borderBottom: '1px solid #eaf1fa',
    color: '#223653',
    backgroundColor: 'rgba(255, 255, 255, 0.86)'
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
    fontWeight: '700',
    color: '#132745',
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
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 16px 34px rgba(20, 33, 58, 0.18)',
    border: '1px solid rgba(182, 198, 221, 0.8)'
  }
}

export default AdminDashboard
