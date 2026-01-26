import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { BASE_URL, LANGUAGES } from '../config'

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
  const [isTracking, setIsTracking] = useState(false)
  const [language, setLanguage] = useState(localStorage.getItem('language') || 'vi')
  const [userLocation, setUserLocation] = useState(null)
  const [restaurants, setRestaurants] = useState([])
  const [selectedRestaurant, setSelectedRestaurant] = useState(null)
  const [currentNarration, setCurrentNarration] = useState(null)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  
  const audioRef = useRef(null)
  const watchTimerRef = useRef(null)
  const lastRestaurantIdRef = useRef(null)

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
    const currentLang = lang || language
    const userLat = pos.coords.latitude
    const userLng = pos.coords.longitude
    setUserLocation([userLat, userLng])

    fetch(`${BASE_URL}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: userLat,
        longitude: userLng,
        language: currentLang
      })
    })
      .then(res => res.json())
      .then(data => {
        const newId = data.nearest_place.id
        const distance = data.distance_km

        if (newId !== lastRestaurantIdRef.current) {
          lastRestaurantIdRef.current = newId

          // Dừng audio cũ
          if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current = null
            setIsAudioPlaying(false)
          }

          // Kiểm tra khoảng cách
          if (distance > POI_THRESHOLD) {
            setCurrentNarration({
              restaurantId: newId,
              name: data.nearest_place.name,
              narration: data.out_of_range_message,
              distance: distance,
              audioUrl: null
            })
          } else {
            setCurrentNarration({
              restaurantId: newId,
              name: data.nearest_place.name,
              narration: data.narration,
              distance: distance,
              audioUrl: data.audio_url
            })

            // Phát audio tự động
            if (data.audio_url) {
              playAudio(`${BASE_URL}${data.audio_url}`)
            }
          }
        } else {
          // Cập nhật khoảng cách
          if (distance > POI_THRESHOLD && currentNarration?.audioUrl) {
            // Ra khỏi POI
            if (audioRef.current) {
              audioRef.current.pause()
              audioRef.current = null
              setIsAudioPlaying(false)
            }
            setCurrentNarration(prev => ({
              ...prev,
              narration: data.out_of_range_message,
              distance: distance,
              audioUrl: null
            }))
          } else if (distance <= POI_THRESHOLD && !currentNarration?.audioUrl) {
            // Vào trong POI
            setCurrentNarration({
              restaurantId: newId,
              name: data.nearest_place.name,
              narration: data.narration,
              distance: distance,
              audioUrl: data.audio_url
            })
            if (data.audio_url) {
              playAudio(`${BASE_URL}${data.audio_url}`)
            }
          } else {
            setCurrentNarration(prev => ({ ...prev, distance: distance }))
          }
        }
      })
      .catch(err => console.error('Error fetching location:', err))
  }

  // Phát audio
  const playAudio = (url) => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = '' // Clear old source
      audioRef.current = null
    }
    // Thêm timestamp để tránh cache browser
    const audioUrl = url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`
    const audio = new Audio(audioUrl)
    audioRef.current = audio
    setIsAudioPlaying(true)
    audio.play().catch(err => {
      console.error('Error playing audio:', err)
      setIsAudioPlaying(false)
    })
    audio.onended = () => setIsAudioPlaying(false)
    audio.onerror = () => setIsAudioPlaying(false)
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
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
      setIsAudioPlaying(false)
    }
  }

  // Toggle audio
  const handleToggleAudio = (audioUrl) => {
    if (!audioUrl) return

    if (isAudioPlaying && audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
      setIsAudioPlaying(false)
    } else {
      playAudio(audioUrl)
    }
  }

  // Xử lý thay đổi ngôn ngữ
  const handleLanguageChange = (e) => {
    const newLang = e.target.value
    setLanguage(newLang)
    localStorage.setItem('language', newLang)

    // Dừng audio và reset hoàn toàn
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = '' // Clear audio source
      audioRef.current = null
      setIsAudioPlaying(false)
    }
    
    // Reset selectedRestaurant để đóng popup cũ
    setSelectedRestaurant(null)
    
    // Reset currentNarration hoàn toàn
    setCurrentNarration(null)

    // Reset và fetch lại với ngôn ngữ mới
    lastRestaurantIdRef.current = null
    if (isTracking && userLocation) {
      fetchAndUpdateLocation({ coords: { latitude: userLocation[0], longitude: userLocation[1] } }, newLang)
    }
  }

  // Xử lý click vào marker quán
  const handleRestaurantClick = (restaurant) => {
    // Reset selectedRestaurant trước
    setSelectedRestaurant(null)
    
    // Dừng audio cũ nếu đang phát
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
      setIsAudioPlaying(false)
    }

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
          language: language
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

  // Auto start
  useEffect(() => {
    const timer = setTimeout(startTracking, 500)
    return () => {
      clearTimeout(timer)
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
        padding: '15px', 
        background: '#fff', 
        borderBottom: '2px solid #ddd', 
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h1 style={{ margin: 0, fontSize: '24px' }}>🍜 Food Street PoC</h1>
        <select 
          value={language} 
          onChange={handleLanguageChange}
          style={{
            padding: '10px 15px',
            borderRadius: '8px',
            border: '2px solid #ddd',
            fontSize: '14px',
            cursor: 'pointer',
            background: 'white'
          }}
        >
          {LANGUAGES.map(lang => (
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
                <strong>📍 Vị trí của bạn</strong>
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
                <Popup maxWidth={300}>
                  <div style={{ padding: '5px' }}>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>{restaurant.name}</h3>
                    {restaurant.description && (
                      <p style={{ margin: '5px 0', fontSize: '13px' }}>{restaurant.description}</p>
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
            padding: '15px', 
            background: '#f8f9fa', 
            borderRadius: '8px',
            border: '1px solid #ddd'
          }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>{currentNarration.name}</h3>
            <p style={{ margin: '8px 0', fontSize: '14px' }}>{currentNarration.narration}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
              <span style={{ fontSize: '13px', color: '#666' }}>
                📍 {currentNarration.distance.toFixed(3)} km
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
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default LocationTracker
