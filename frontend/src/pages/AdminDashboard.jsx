import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import { BASE_URL } from '../config'
import RestaurantManagement from './RestaurantManagement'
import TagManagement from './TagManagement'
import AdminAccountManagement from './AdminAccountManagement'
import { clearAuthUserId } from '../utils/authUser'

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

function HeatCircleLayer({ heatmapData }) {
  const normalizedPoints = (Array.isArray(heatmapData) ? heatmapData : [])
    .map((point, idx) => ({
      id: `${idx}-${point?.lat}-${point?.lng}`,
      lat: Number(point?.lat),
      lng: Number(point?.lng),
      intensity: Number(point?.intensity) || 0
    }))
    .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng))

  if (normalizedPoints.length === 0) {
    return null
  }

  const maxIntensity = Math.max(...normalizedPoints.map(point => point.intensity), 1)

  return (
    <>
      {normalizedPoints.map((point) => {
        const ratio = Math.max(0.08, Math.min(1, point.intensity / maxIntensity))
        const radius = 3 + (ratio * 8)
        const fillOpacity = 0.24 + (ratio * 0.42)
        const strokeOpacity = 0.32 + (ratio * 0.34)

        return (
          <Circle
            key={point.id}
            center={[point.lat, point.lng]}
            radius={radius}
            pathOptions={{
              color: `rgba(234, 67, 53, ${strokeOpacity.toFixed(3)})`,
              weight: 1,
              fillColor: `rgba(251, 188, 4, ${fillOpacity.toFixed(3)})`,
              fillOpacity,
            }}
          />
        )
      })}
    </>
  )
}

function MapAutoResize() {
  const map = useMap()
  const rafRef = useRef(null)

  useEffect(() => {
    const invalidate = () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
      }

      rafRef.current = window.requestAnimationFrame(() => {
        map.invalidateSize({ pan: false, animate: false })
      })
    }

    const timer = window.setTimeout(invalidate, 120)
    const intervalId = window.setInterval(invalidate, 1500)
    const observer = new ResizeObserver(() => {
      invalidate()
    })

    const container = map.getContainer()
    if (container) {
      observer.observe(container)
      if (container.parentElement) {
        observer.observe(container.parentElement)
      }
    }

    return () => {
      window.clearTimeout(timer)
      window.clearInterval(intervalId)
      observer.disconnect()
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
      }
    }
  }, [map])

  return null
}

const parseCoordinate = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const buildTileProxyUrl = (provider) => `${BASE_URL}/map-tiles/${provider}/{z}/{x}/{y}.png`
const MAP_HEIGHT_PX = 520

const TILE_SOURCES = [
  {
    name: 'CARTO Voyager',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    url: buildTileProxyUrl('carto-voyager')
  },
  {
    name: 'OpenStreetMap',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    url: buildTileProxyUrl('osm')
  },
  {
    name: 'OpenTopoMap',
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    url: buildTileProxyUrl('opentopo')
  }
]

const DASHBOARD_POLL_INTERVAL_MS = 4000

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
  const [onlineStats, setOnlineStats] = useState({
    window_seconds: 30,
    online_devices: 0,
    online_users: 0
  })
  const [tileProviderIndex, setTileProviderIndex] = useState(0)
  const [tileLoaded, setTileLoaded] = useState(false)
  const tileErrorCountRef = useRef(0)
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280))

  const isMobile = viewportWidth <= 768
  const isTablet = viewportWidth <= 1024
  const mapHeight = isMobile ? 340 : isTablet ? 420 : MAP_HEIGHT_PX

  const restaurantsWithCoords = restaurants
    .map(restaurant => ({
      ...restaurant,
      lat: parseCoordinate(restaurant.lat),
      lng: parseCoordinate(restaurant.lng)
    }))
    .filter(restaurant => restaurant.lat !== null && restaurant.lng !== null)

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

  const loadOnlineStats = () => {
    fetch(`${BASE_URL}/admin/online-users`, {
      credentials: 'include'
    })
      .then(res => {
        if (!res.ok) {
          throw new Error('Failed to load online users')
        }
        return res.json()
      })
      .then(data => {
        setOnlineStats({
          window_seconds: data.window_seconds || 30,
          online_devices: data.online_devices || 0,
          online_users: data.online_users || 0
        })
      })
      .catch(err => {
        console.error('Error loading online users:', err)
      })
  }

  const loadHeatmapData = () => {
    loadOnlineStats()

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

  const loadHeatmapOnly = () => {
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
      })
  }

  useEffect(() => {
    if (isOwner || activeTab !== 'dashboard') {
      return undefined
    }

    // Refresh immediately on tab entry, then keep polling.
    loadOnlineStats()
    loadHeatmapOnly()

    const intervalId = window.setInterval(() => {
      loadOnlineStats()
      loadHeatmapOnly()
    }, DASHBOARD_POLL_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [activeTab, isOwner])

  useEffect(() => {
    if (activeTab !== 'dashboard') return
    setTileProviderIndex(0)
    setTileLoaded(false)
    tileErrorCountRef.current = 0
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== 'dashboard' || tileLoaded) return undefined

    if (tileProviderIndex >= TILE_SOURCES.length - 1) return undefined

    const timer = window.setTimeout(() => {
      if (!tileLoaded) {
        setTileProviderIndex((prev) => Math.min(prev + 1, TILE_SOURCES.length - 1))
        tileErrorCountRef.current = 0
      }
    }, 4500)

    return () => {
      window.clearTimeout(timer)
    }
  }, [activeTab, tileLoaded, tileProviderIndex])

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const handleLogout = () => {
    fetch(`${BASE_URL}${authBase}/logout`, {
      method: 'POST',
      credentials: 'include'
    }).then(() => {
      localStorage.removeItem('activeRole')
      clearAuthUserId()
      navigate(loginPath)
    })
  }

  const topNavButtons = (
    <>
      {!isOwner && (
        <button
          className={`topbar-nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          style={{ ...styles.topNavButton, ...(isMobile ? styles.topNavButtonMobile : {}) }}
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
        style={{ ...styles.topNavButton, ...(isMobile ? styles.topNavButtonMobile : {}) }}
        onClick={() => setActiveTab('restaurants')}
      >
        Quản lý quán
      </button>
      {!isOwner && (
        <button
          className={`topbar-nav-btn ${activeTab === 'hidden' ? 'active' : ''}`}
          style={{ ...styles.topNavButton, ...(isMobile ? styles.topNavButtonMobile : {}) }}
          onClick={() => setActiveTab('hidden')}
        >
          Quán đã ẩn
        </button>
      )}
      {!isOwner && (
        <button
          className={`topbar-nav-btn ${activeTab === 'tags' ? 'active' : ''}`}
          style={{ ...styles.topNavButton, ...(isMobile ? styles.topNavButtonMobile : {}) }}
          onClick={() => setActiveTab('tags')}
        >
          Quản lý tags
        </button>
      )}
      {!isOwner && (
        <button
          className={`topbar-nav-btn ${activeTab === 'adminAccounts' ? 'active' : ''}`}
          style={{ ...styles.topNavButton, ...(isMobile ? styles.topNavButtonMobile : {}) }}
          onClick={() => setActiveTab('adminAccounts')}
        >
          Tài khoản admin
        </button>
      )}
    </>
  )

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

        @media (max-width: 768px) {
          .topbar-nav-btn {
            height: 38px;
            padding: 0 8px;
            font-size: 12.5px;
            white-space: normal;
            text-align: center;
            line-height: 1.15;
            border-radius: 10px;
          }

          .topbar-logout-btn {
            height: 36px;
            padding: 0 12px;
          }
        }
      `}</style>
      <div style={styles.container}>
        <header style={{ ...styles.topbar, ...(isMobile ? styles.topbarMobile : {}) }}>
          {isMobile ? (
            <>
              <div style={styles.topbarHeadMobile}>
                <div style={{ ...styles.topbarBrand, ...styles.topbarBrandMobile }}>
                  <div style={styles.brandDot} />
                  <div>
                    <div style={styles.topbarTitle}>{isOwner ? 'Owner Command' : 'Admin Command Center'}</div>
                    <div style={{ ...styles.topbarSub, ...styles.topbarSubMobile }}>{isOwner ? 'Restaurant Operations' : 'NearBite Control Suite'}</div>
                  </div>
                </div>

                <button className="topbar-logout-btn" style={{ ...styles.topbarLogout, ...styles.topbarLogoutCompactMobile }} onClick={handleLogout}>
                  Đăng xuất
                </button>
              </div>

              <nav style={{ ...styles.topNav, ...styles.topNavMobile }}>
                {topNavButtons}
              </nav>
            </>
          ) : (
            <>
              <div style={styles.topbarBrand}>
                <div style={styles.brandDot} />
                <div>
                  <div style={styles.topbarTitle}>{isOwner ? 'Owner Command' : 'Admin Command Center'}</div>
                  <div style={styles.topbarSub}>{isOwner ? 'Restaurant Operations' : 'NearBite Control Suite'}</div>
                </div>
              </div>

              <nav style={styles.topNav}>
                {topNavButtons}
              </nav>

              <button className="topbar-logout-btn" style={styles.topbarLogout} onClick={handleLogout}>
                Đăng xuất
              </button>
            </>
          )}
        </header>

        {/* Main content */}
        <div style={styles.mainContent}>
          <div style={styles.contentFrame}>
            {!isOwner && activeTab === 'dashboard' && (
              <div style={styles.dashboardContent}>
                <div style={styles.dashboardLayout}>
                  <div style={styles.mapContainer}>
                    <div style={{ ...styles.mapHeaderRow, ...(isMobile ? styles.mapHeaderRowMobile : {}) }}>
                      <h3 style={{ ...styles.mapTitle, ...(isMobile ? styles.mapTitleMobile : {}) }}>📍 Bản đồ Quán ăn & Heatmap User</h3>
                      <div style={{ ...styles.mapSourceBadge, ...(isMobile ? styles.mapSourceBadgeMobile : {}) }}>
                        {tileLoaded ? 'Tile OK' : 'Dang tai tile...'} | {TILE_SOURCES[tileProviderIndex].name}
                      </div>
                    </div>
                    {restaurants.length === 0 && (
                      <div style={styles.noDataMessage}>
                        ℹ️ Chưa có quán ăn nào trong hệ thống.
                      </div>
                    )}
                    <div style={{ ...styles.heatmapContainer, height: `${mapHeight}px`, minHeight: `${mapHeight}px` }}>
                      <div style={styles.mapSurfaceLayer}>
                        <MapContainer
                          center={[10.760426862777551, 106.68198430250096]}
                          zoom={15}
                          style={{ height: `${mapHeight}px`, width: '100%' }}
                          zoomControl={true}
                          key={`admin-dashboard-map-${activeTab}-${tileProviderIndex}`}
                        >
                          <MapAutoResize />
                          <TileLayer
                            attribution={TILE_SOURCES[tileProviderIndex].attribution}
                            url={TILE_SOURCES[tileProviderIndex].url}
                            eventHandlers={{
                              tileload: () => {
                                setTileLoaded(true)
                              },
                              tileerror: () => {
                                tileErrorCountRef.current += 1

                                if (tileErrorCountRef.current >= 8) {
                                  setTileLoaded(false)
                                  setTileProviderIndex((prev) => {
                                    if (prev >= TILE_SOURCES.length - 1) return prev
                                    return prev + 1
                                  })
                                  tileErrorCountRef.current = 0
                                }
                              }
                            }}
                          />

                          {/* Heatmap layer (plugin-free fallback for reliability) */}
                          <HeatCircleLayer heatmapData={heatmapData} />

                          {/* Marker các quán */}
                          {restaurantsWithCoords.map(restaurant => (
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

                  <div style={styles.topTablesContainer}>
                    <div style={styles.onlineCard}>
                      <h3 style={styles.onlineTitle}>🟢 Online realtime ({onlineStats.window_seconds}s)</h3>
                      <div style={styles.onlineStatsGrid}>
                        <div style={styles.onlineStatItem}>
                          <div style={styles.onlineStatValue}>{onlineStats.online_devices}</div>
                          <div style={styles.onlineStatLabel}>online_devices</div>
                        </div>
                        <div style={styles.onlineStatItem}>
                          <div style={styles.onlineStatValue}>{onlineStats.online_users}</div>
                          <div style={styles.onlineStatLabel}>online_users</div>
                        </div>
                      </div>
                    </div>

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
                                <td style={styles.topTableTd}><strong>{Number(r.avg_visit_duration || 0).toFixed(1)}</strong></td>
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
                                <td style={styles.topTableTd}><strong>{Number(r.avg_audio_duration || 0).toFixed(1)}</strong></td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
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
  topbarMobile: {
    height: 'auto',
    padding: '10px 10px 8px',
    alignItems: 'stretch',
    gap: '8px',
    flexDirection: 'column'
  },
  topbarHeadMobile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px'
  },
  topbarBrand: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: '250px'
  },
  topbarBrandMobile: {
    minWidth: 0,
    gap: '10px',
    flex: 1
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
  topbarSubMobile: {
    fontSize: '10px',
    letterSpacing: '0.25px'
  },
  topNav: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    justifyContent: 'center'
  },
  topNavMobile: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    rowGap: '7px',
    columnGap: '7px',
    width: '100%',
    paddingBottom: '2px'
  },
  topNavButton: {
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '650'
  },
  topNavButtonMobile: {
    width: '100%'
  },
  topbarLogout: {
    border: '1px solid rgba(132, 160, 195, 0.42)',
    background: 'rgba(20, 55, 99, 0.88)',
    color: '#f0f6ff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '700'
  },
  topbarLogoutMobile: {
    width: '100%'
  },
  topbarLogoutCompactMobile: {
    width: 'auto',
    minWidth: '102px',
    fontSize: '13px',
    padding: '0 12px'
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
    flexDirection: 'column',
    gap: '20px',
    minHeight: 'calc(100vh - 220px)'
  },
  topTablesContainer: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '16px',
    alignItems: 'stretch'
  },
  onlineCard: {
    gridColumn: '1 / -1',
    background: 'linear-gradient(165deg, rgba(8, 43, 65, 0.94) 0%, rgba(12, 66, 95, 0.9) 100%)',
    borderRadius: '16px',
    padding: '18px 20px',
    border: '1px solid rgba(122, 202, 236, 0.42)',
    boxShadow: '0 16px 30px rgba(4, 24, 44, 0.28)'
  },
  onlineTitle: {
    margin: '0',
    fontSize: '15px',
    fontWeight: '700',
    color: '#ebfbff'
  },
  onlineStatsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '12px',
    marginTop: '10px'
  },
  onlineStatItem: {
    borderRadius: '12px',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(171, 226, 251, 0.36)'
  },
  onlineStatValue: {
    fontSize: '32px',
    lineHeight: 1,
    fontWeight: '800',
    color: '#ecfdff'
  },
  onlineStatLabel: {
    marginTop: '6px',
    fontSize: '12px',
    letterSpacing: '0.4px',
    color: 'rgba(219, 246, 255, 0.86)',
    textTransform: 'uppercase'
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
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '560px',
    background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 252, 255, 0.96) 100%)',
    borderRadius: '16px',
    border: '1px solid rgba(188, 208, 233, 0.82)',
    padding: '14px'
  },
  mapHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px'
  },
  mapHeaderRowMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '8px'
  },
  mapSourceBadge: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#2d4668',
    background: 'rgba(214, 230, 249, 0.78)',
    border: '1px solid rgba(173, 198, 227, 0.8)',
    borderRadius: '999px',
    padding: '6px 10px'
  },
  mapSourceBadgeMobile: {
    maxWidth: '100%',
    borderRadius: '10px',
    wordBreak: 'break-word'
  },
  mapTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#132745',
    marginBottom: '0',
    marginTop: '0'
  },
  mapTitleMobile: {
    fontSize: '16px',
    lineHeight: 1.3
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
    position: 'relative',
    minHeight: `${MAP_HEIGHT_PX}px`,
    height: `${MAP_HEIGHT_PX}px`,
    flex: 1,
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 16px 34px rgba(20, 33, 58, 0.18)',
    border: '1px solid rgba(182, 198, 221, 0.8)',
    background: '#dfe8f3'
  },
  mapSurfaceLayer: {
    position: 'absolute',
    inset: 0,
    zIndex: 1,
    overflow: 'hidden'
  }
}

export default AdminDashboard
