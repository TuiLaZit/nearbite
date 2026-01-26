import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { BASE_URL } from '../config'
import { useTranslation } from '../hooks/useTranslation'

const POI_THRESHOLD = 0.03 // 30m

// Fix cho Leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

// Custom icons
const userIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" fill="#4285F4" stroke="white" stroke-width="3"/>
    </svg>
  `),
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

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

const activeRestaurantIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="14" fill="#EA4335" stroke="white" stroke-width="2"/>
      <text x="16" y="21" font-size="16" text-anchor="middle" fill="white">🍜</text>
    </svg>
  `),
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
})

// Component để tự động center map khi user di chuyển
function MapUpdater({ center }) {
  const map = useMap()
  useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom())
    }
  }, [center, map])
  return null
}

function LocationTracker() {
  const navigate = useNavigate()
  const [isTracking, setIsTracking] = useState(false)
  const [language, setLanguage] = useState(() => {
    const saved = localStorage.getItem('language')
    console.log('Initial language from localStorage:', saved)
    return saved || 'vi'
  })
  const { t, loading: translationLoading } = useTranslation(language)
  const [languages, setLanguages] = useState([]) // Fetch từ API
  const [userLocation, setUserLocation] = useState(null)
  const [restaurants, setRestaurants] = useState([])
  const [selectedRestaurant, setSelectedRestaurant] = useState(null)
  const [currentNarration, setCurrentNarration] = useState(null)
  const [currentDistance, setCurrentDistance] = useState(null) // State riêng cho distance
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [audioBlocked, setAudioBlocked] = useState(false)
  const [pendingAudioUrl, setPendingAudioUrl] = useState(null)
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(() => {
    const saved = localStorage.getItem('narrationPanelCollapsed')
    return saved === 'true'
  })
  
  const audioRef = useRef(null)
  const watchTimerRef = useRef(null)
  const lastRestaurantIdRef = useRef(null)
  const lastDistanceRef = useRef(null) // Track khoảng cách để tránh update liên tục
  const languageRef = useRef(language) // Track current language
  const audioUnlockedRef = useRef(false) // Track nếu audio đã được unlock

  // Cập nhật languageRef mỗi khi language thay đổi
  useEffect(() => {
    languageRef.current = language
    localStorage.setItem('language', language)
    console.log('Language synced:', language)
  }, [language])

  // Lưu state collapse panel
  useEffect(() => {
    localStorage.setItem('narrationPanelCollapsed', isPanelCollapsed)
  }, [isPanelCollapsed])

  // Fetch danh sách ngôn ngữ từ API
  useEffect(() => {
    fetch(`${BASE_URL}/languages`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') {
          setLanguages(data.languages)
        }
      })
      .catch(err => console.error('Error fetching languages:', err))
  }, [])

  // Fetch danh sách quán khi load
  useEffect(() => {
    fetch(`${BASE_URL}/restaurants`)
      .then(res => res.json())
      .then(data => {
        setRestaurants(data.restaurants)
      })
      .catch(err => console.error('Error fetching restaurants:', err))
  }, [])

  // Hàm tính khoảng cách
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return R * c
  }

  // Hàm fetch và cập nhật thuyết minh khi di chuyển
  const fetchAndUpdateLocation = (pos, lang = null) => {
    const currentLang = lang || languageRef.current
    const userLat = pos.coords.latitude
    const userLng = pos.coords.longitude
    setUserLocation([userLat, userLng])

    console.log('Fetching location with language:', currentLang)
    console.log('BASE_URL:', BASE_URL)

    fetch(`${BASE_URL}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: userLat,
        longitude: userLng,
        language: currentLang
      })
    })
      .then(res => {
        console.log('Response status:', res.status)
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`)
        }
        return res.json()
      })
      .then(data => {
        console.log('Received data:', data)
        const newId = data.nearest_place.id
        const distance = data.distance_km

        if (newId !== lastRestaurantIdRef.current) {
          lastRestaurantIdRef.current = newId
          lastDistanceRef.current = distance // Reset distance tracking

          // Dừng audio cũ hoàn toàn
          stopAudio()

          // Kiểm tra khoảng cách
          if (distance > POI_THRESHOLD) {
            setCurrentNarration({
              restaurantId: newId,
              name: data.nearest_place.name,
              narration: data.out_of_range_message,
              audioUrl: null,
              tags: data.nearest_place.tags || [],
              images: data.nearest_place.images || []
            })
            setCurrentDistance(distance)
          } else {
            setCurrentNarration({
              restaurantId: newId,
              name: data.nearest_place.name,
              narration: data.narration,
              audioUrl: data.audio_url,
              tags: data.nearest_place.tags || [],
              images: data.nearest_place.images || []
            })
            setCurrentDistance(distance)

            // Phát audio tự động
            if (data.audio_url && !isAudioPlaying) {
              playAudio(`${BASE_URL}${data.audio_url}`)
            }
          }
        } else {
          // Cập nhật khoảng cách khi vẫn ở cùng quán
          const lastDistance = lastDistanceRef.current
          const distanceChanged = lastDistance === null || Math.abs(distance - lastDistance) > 0.005 // Chỉ update khi thay đổi > 5m
          
          if (distance > POI_THRESHOLD && currentNarration?.audioUrl) {
            // Ra khỏi POI - dừng audio hoàn toàn
            stopAudio()
            lastDistanceRef.current = distance
            setCurrentNarration(prev => ({
              ...prev,
              narration: data.out_of_range_message,
              audioUrl: null
            }))
            setCurrentDistance(distance)
          } else if (distance <= POI_THRESHOLD && !currentNarration?.audioUrl) {
            // Vào trong POI
            lastDistanceRef.current = distance
            setCurrentNarration({
              restaurantId: newId,
              name: data.nearest_place.name,
              narration: data.narration,
              audioUrl: data.audio_url,
              tags: data.nearest_place.tags || [],
              images: data.nearest_place.images || []
            })
            setCurrentDistance(distance)
            if (data.audio_url && !isAudioPlaying) {
              playAudio(`${BASE_URL}${data.audio_url}`)
            }
          } else if (distanceChanged) {
            // CHỈ cập nhật distance state, KHÔNG động vào currentNarration - audio không bị ngắt
            lastDistanceRef.current = distance
            setCurrentDistance(distance)
          }
          // Nếu distance không thay đổi đáng kể, không làm gì cả - tránh re-render
        }
      })
      .catch(err => console.error('Error fetching location:', err))
  }

  // Dừng audio hoàn toàn
  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current.src = ''
      audioRef.current.load()
      audioRef.current = null
    }
    setIsAudioPlaying(false)
    setAudioBlocked(false)
    setPendingAudioUrl(null)
  }

  // Phát audio
  const playAudio = (url) => {
    console.log('Attempting to play audio:', url)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = '' // Clear old source
      audioRef.current = null
    }
    // Thêm timestamp để tránh cache browser
    const audioUrl = url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`
    console.log('Final audio URL:', audioUrl)
    
    const audio = new Audio(audioUrl)
    audio.crossOrigin = "anonymous" // Cho phép CORS
    audioRef.current = audio
    
    // Sự kiện load thành công
    audio.onloadeddata = () => {
      console.log('Audio loaded successfully')
    }
    
    audio.onerror = (e) => {
      console.error('Audio error:', e)
      console.error('Audio error details:', audio.error)
      setIsAudioPlaying(false)
      setAudioBlocked(false)
    }
    
    audio.onended = () => {
      console.log('Audio ended')
      setIsAudioPlaying(false)
      setAudioBlocked(false)
    }
    
    setIsAudioPlaying(true)
    audio.play()
      .then(() => {
        console.log('Audio playing')
        setAudioBlocked(false)
        setPendingAudioUrl(null)
        audioUnlockedRef.current = true
      })
      .catch(err => {
        console.error('Error playing audio:', err)
        setIsAudioPlaying(false)
        // Nếu lỗi autoplay, lưu URL để chờ user tương tác
        if (err.name === 'NotAllowedError') {
          console.warn('Autoplay blocked. User interaction required.')
          setAudioBlocked(true)
          setPendingAudioUrl(url)
        }
      })
  }

  // Unlock audio khi user click
  const unlockAudio = () => {
    if (pendingAudioUrl) {
      playAudio(pendingAudioUrl)
    }
  }

  // Bắt đầu tracking
  const startTracking = () => {
    if (!navigator.geolocation) {
      alert('Trình duyệt không hỗ trợ GPS')
      return
    }

    setIsTracking(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetchAndUpdateLocation(pos)
        watchTimerRef.current = setInterval(() => {
          navigator.geolocation.getCurrentPosition(fetchAndUpdateLocation)
        }, 5000)
      },
      (error) => {
        console.error('Geolocation error:', error)
        alert('Không thể lấy vị trí GPS. Vui lòng bật GPS và cho phép truy cập.')
      }
    )
  }

  // Dừng tracking
  const stopTracking = () => {
    setIsTracking(false)
    if (watchTimerRef.current) {
      clearInterval(watchTimerRef.current)
      watchTimerRef.current = null
    }
    stopAudio()
  }

  // Toggle audio
  const handleToggleAudio = (audioUrl) => {
    if (!audioUrl) return

    if (isAudioPlaying && audioRef.current) {
      // Chỉ pause, KHÔNG xóa src
      audioRef.current.pause()
      setIsAudioPlaying(false)
    } else if (audioRef.current && audioRef.current.src && !isAudioPlaying) {
      // Nếu đã có audio từ trước, chỉ cần play lại
      audioRef.current.play()
        .then(() => {
          setIsAudioPlaying(true)
          setAudioBlocked(false)
        })
        .catch(err => {
          console.error('Error resuming audio:', err)
          if (err.name === 'NotAllowedError') {
            setAudioBlocked(true)
            setPendingAudioUrl(audioUrl)
          }
        })
    } else {
      // Tạo audio mới
      playAudio(audioUrl)
    }
  }

  // Xử lý thay đổi ngôn ngữ
  const handleLanguageChange = (e) => {
    const newLang = e.target.value
    console.log('===== CHANGING LANGUAGE =====')
    console.log('From:', language, 'To:', newLang)
    
    // Lưu vào localStorage và update state
    localStorage.setItem('language', newLang)
    setLanguage(newLang)
    languageRef.current = newLang // Update ref ngay lập tức

    // Dừng audio và reset hoàn toàn
    stopAudio()
    
    // Reset selectedRestaurant để đóng popup cũ
    setSelectedRestaurant(null)
    
    // Reset currentNarration hoàn toàn
    setCurrentNarration(null)

    // Reset và fetch lại với ngôn ngữ mới
    lastRestaurantIdRef.current = null
    if (isTracking && userLocation) {
      // Dùng setTimeout để đảm bảo audio đã dừng hẳn
      setTimeout(() => {
        fetchAndUpdateLocation({ coords: { latitude: userLocation[0], longitude: userLocation[1] } }, newLang)
      }, 200)
    }
  }

  // Xử lý click vào marker quán
  const handleRestaurantClick = (restaurant) => {
    // Reset selectedRestaurant trước
    setSelectedRestaurant(null)
    
    // Dừng audio cũ nếu đang phát
    stopAudio()

    if (userLocation) {
      const distance = calculateDistance(
        userLocation[0], userLocation[1],
        restaurant.lat, restaurant.lng
      )
      
      // Fetch với ngôn ngữ hiện tại
      fetch(`${BASE_URL}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: restaurant.lat,
          longitude: restaurant.lng,
          language: languageRef.current
        })
      })
        .then(res => res.json())
        .then(data => {
          // Set selectedRestaurant với data mới
          const newData = {
            ...restaurant,
            narration: data.narration,
            audioUrl: data.audio_url,
            distance: distance
          }
          setSelectedRestaurant(newData)
        })
        .catch(err => console.error('Error:', err))
    }
  }

  // Mở Google Maps directions
  const openDirections = (restaurant) => {
    if (userLocation) {
      const url = `https://www.google.com/maps/dir/?api=1&origin=${userLocation[0]},${userLocation[1]}&destination=${restaurant.lat},${restaurant.lng}`
      window.open(url, '_blank')
    }
  }

  // Cleanup khi component unmount
  useEffect(() => {
    return () => {
      if (watchTimerRef.current) clearInterval(watchTimerRef.current)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const mapCenter = userLocation || [10.762622, 106.660172] // Default: Saigon

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ 
        padding: '10px 20px', 
        background: '#fff', 
        borderBottom: '2px solid #ddd', 
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '15px'
      }}>
        {/* Logo & Name */}
        <div style={{ 
          fontSize: '28px', 
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: '#EA4335'
        }}>
          🍜 <span style={{ fontSize: '20px' }}>NearBite</span>
        </div>
        
        {/* Xếp Tour button */}
        <button
          onClick={() => {
            console.log('Current language:', language)
            console.log('planTour translation:', t('planTour'))
            navigate('/tour-planner')
          }}
          style={{
            padding: '10px 20px',
            background: '#ff9800',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'background 0.2s'
          }}
        >
          🗺️ {t('planTour')}
        </button>
        
        {/* Language selector */}
        <select 
          value={language} 
          onChange={handleLanguageChange}
          style={{
            padding: '10px 15px',
            borderRadius: '8px',
            border: '2px solid #ddd',
            fontSize: '13px',
            cursor: 'pointer',
            background: 'white',
            minWidth: '100px'
          }}
        >
          {languages.map(lang => (
            <option key={lang.code} value={lang.code}>{lang.label}</option>
          ))}
        </select>
      </div>

      {/* Leaflet Map */}
      <div style={{ flex: 1, position: 'relative' }}>
        <MapContainer
          center={mapCenter}
          zoom={16}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          
          <MapUpdater center={userLocation} />

          {/* Marker vị trí user */}
          {userLocation && (
            <Marker position={userLocation} icon={userIcon}>
              <Popup>
                <strong>📍 {t('yourLocation')}</strong>
              </Popup>
            </Marker>
          )}

          {/* Marker các quán */}
          {restaurants.map(restaurant => (
            <Marker
              key={restaurant.id}
              position={[restaurant.lat, restaurant.lng]}
              icon={currentNarration?.restaurantId === restaurant.id ? activeRestaurantIcon : restaurantIcon}
              eventHandlers={{
                click: () => handleRestaurantClick(restaurant)
              }}
            >
              <Popup maxWidth={350}>
                  <div style={{ padding: '5px', maxHeight: '500px', overflowY: 'auto' }}>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>{restaurant.name}</h3>
                    
                    {/* Hiển thị ảnh chính */}
                    {restaurant.images && restaurant.images.length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        {(() => {
                          const primaryImage = restaurant.images.find(img => img.is_primary) || restaurant.images[0]
                          return (
                            <img 
                              src={primaryImage.image_url} 
                              alt={primaryImage.caption || restaurant.name}
                              style={{ 
                                width: '100%', 
                                height: '150px', 
                                objectFit: 'cover', 
                                borderRadius: '8px',
                                marginBottom: '8px'
                              }}
                              onError={(e) => {
                                e.target.style.display = 'none'
                              }}
                            />
                          )
                        })()}
                        {restaurant.images.length > 1 && (
                          <div style={{ display: 'flex', gap: '5px', overflowX: 'auto' }}>
                            {restaurant.images.slice(0, 4).map((img, idx) => (
                              <img 
                                key={idx}
                                src={img.image_url} 
                                alt={img.caption || `Image ${idx+1}`}
                                style={{ 
                                  width: '60px', 
                                  height: '60px', 
                                  objectFit: 'cover', 
                                  borderRadius: '5px',
                                  cursor: 'pointer'
                                }}
                                onError={(e) => {
                                  e.target.style.display = 'none'
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Hiển thị tags */}
                    {restaurant.tags && restaurant.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '10px' }}>
                        {restaurant.tags.map(tag => (
                          <span
                            key={tag.id}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 8px',
                              backgroundColor: tag.color || '#3498db',
                              color: '#fff',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: '500'
                            }}
                          >
                            {tag.icon && <span>{tag.icon}</span>}
                            <span>{tag.name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    
                    {restaurant.description && (
                      <p style={{ margin: '5px 0', fontSize: '13px', color: '#333' }}>{restaurant.description}</p>
                    )}
                    {selectedRestaurant?.id === restaurant.id && (
                      <>
                        {selectedRestaurant.distance !== undefined && (
                          <p style={{ margin: '5px 0', fontSize: '12px', color: '#666' }}>
                            📍 Khoảng cách: {selectedRestaurant.distance.toFixed(3)} km
                          </p>
                        )}
                        {selectedRestaurant.narration && (
                          <p style={{ margin: '10px 0', fontSize: '13px', fontStyle: 'italic' }}>
                            {selectedRestaurant.narration}
                          </p>
                        )}
                        <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                          {selectedRestaurant.audioUrl && (
                            <button 
                              onClick={() => handleToggleAudio(`${BASE_URL}${selectedRestaurant.audioUrl}`)}
                              style={{
                                padding: '8px 12px',
                                background: '#4285F4',
                                color: 'white',
                                border: 'none',
                                borderRadius: '5px',
                                cursor: 'pointer',
                                fontSize: '14px'
                              }}
                            >
                              {isAudioPlaying ? '⏹ Dừng' : '🔊 Nghe'}
                            </button>
                          )}
                          <button
                            onClick={() => openDirections(selectedRestaurant)}
                            style={{
                              padding: '8px 12px',
                              background: '#34A853',
                              color: 'white',
                              border: 'none',
                              borderRadius: '5px',
                              cursor: 'pointer',
                              fontSize: '14px'
                            }}
                          >
                            🧭 Chỉ đường
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </Popup>
              </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Control Panel - Bottom */}
      <div style={{ 
        padding: '20px', 
        background: '#fff', 
        borderTop: '2px solid #ddd',
        boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
        zIndex: 1000
      }}>
        <button
          onClick={() => isTracking ? stopTracking() : startTracking()}
          style={{
            width: '100%',
            padding: '12px 20px',
            background: isTracking ? '#EA4335' : '#34A853',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            marginBottom: '15px'
          }}
        >
          {isTracking ? '⏹ Dừng theo dõi' : '▶️ Bắt đầu theo dõi'}
        </button>

        {/* Thông tin quán hiện tại */}
        {currentNarration && (
          <div style={{ 
            position: 'relative',
            background: '#f8f9fa', 
            borderRadius: '8px',
            border: '1px solid #ddd',
            overflow: 'hidden',
            transition: 'all 0.3s ease'
          }}>
            {/* Header với nút collapse */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 15px',
              background: '#e9ecef',
              borderBottom: isPanelCollapsed ? 'none' : '1px solid #ddd',
              cursor: 'pointer'
            }}
            onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
            >
              <h3 style={{ margin: 0, fontSize: '18px', flex: 1 }}>{currentNarration.name}</h3>
              <button
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: '5px',
                  transition: 'transform 0.3s ease',
                  transform: isPanelCollapsed ? 'rotate(0deg)' : 'rotate(180deg)'
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  setIsPanelCollapsed(!isPanelCollapsed)
                }}
              >
                ▲
              </button>
            </div>

            {/* Nội dung panel - collapse/expand */}
            <div style={{
              maxHeight: isPanelCollapsed ? '0' : '400px',
              overflowY: isPanelCollapsed ? 'hidden' : 'auto',
              transition: 'max-height 0.3s ease',
              padding: isPanelCollapsed ? '0 15px' : '15px'
            }}>

            
            {/* Hiển thị ảnh chính */}
            {currentNarration.images && currentNarration.images.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                {(() => {
                  const primaryImage = currentNarration.images.find(img => img.is_primary) || currentNarration.images[0]
                  return (
                    <img 
                      src={primaryImage.image_url} 
                      alt={primaryImage.caption || currentNarration.name}
                      style={{ 
                        width: '100%', 
                        maxHeight: '200px', 
                        objectFit: 'cover', 
                        borderRadius: '8px',
                        marginBottom: '8px'
                      }}
                      onError={(e) => {
                        e.target.style.display = 'none'
                      }}
                    />
                  )
                })()}
                {currentNarration.images.length > 1 && (
                  <div style={{ display: 'flex', gap: '5px', overflowX: 'auto', paddingBottom: '5px' }}>
                    {currentNarration.images.map((img, idx) => (
                      <img 
                        key={idx}
                        src={img.image_url} 
                        alt={img.caption || `Image ${idx+1}`}
                        style={{ 
                          minWidth: '80px',
                          width: '80px', 
                          height: '80px', 
                          objectFit: 'cover', 
                          borderRadius: '5px',
                          cursor: 'pointer',
                          border: '2px solid #ddd'
                        }}
                        onError={(e) => {
                          e.target.style.display = 'none'
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {/* Hiển thị tags */}
            {currentNarration.tags && currentNarration.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '10px' }}>
                {currentNarration.tags.map(tag => (
                  <span
                    key={tag.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '5px 10px',
                      backgroundColor: tag.color || '#3498db',
                      color: '#fff',
                      borderRadius: '15px',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}
                  >
                    {tag.icon && <span>{tag.icon}</span>}
                    <span>{tag.name}</span>
                  </span>
                ))}
              </div>
            )}
            
            <p style={{ margin: '8px 0', fontSize: '14px' }}>{currentNarration.narration}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', color: '#666' }}>
                📍 {currentDistance?.toFixed(3) || '0.000'} km
              </span>
              {currentNarration.audioUrl && (
                <button
                  onClick={() => handleToggleAudio(`${BASE_URL}${currentNarration.audioUrl}`)}
                  style={{
                    padding: '8px 16px',
                    background: isAudioPlaying ? '#EA4335' : '#4285F4',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  {isAudioPlaying ? '⏹ Dừng' : '🔊 Nghe thuyết minh'}
                </button>
              )}
              {audioBlocked && (
                <button
                  onClick={unlockAudio}
                  style={{
                    padding: '8px 16px',
                    background: '#FBBC04',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    animation: 'pulse 1s infinite'
                  }}
                >
                  🔊 Bật âm thanh
                </button>
              )}
            </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default LocationTracker
