import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { BASE_URL } from '../config'
import { useTranslation } from '../hooks/useTranslation'
import { useAppLanguage } from '../hooks/useAppLanguage'

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
  const { language, setLanguage } = useAppLanguage()
  const { t, loading: translationLoading } = useTranslation(language)
  const [languages, setLanguages] = useState([]) // Fetch từ API
  const [userLocation, setUserLocation] = useState(null)
  const [restaurants, setRestaurants] = useState([])
  const [selectedRestaurant, setSelectedRestaurant] = useState(null)
  const [currentNarration, setCurrentNarration] = useState(null)
  const [currentDistance, setCurrentDistance] = useState(null) // State riêng cho distance
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [isPoiMenuModalOpen, setIsPoiMenuModalOpen] = useState(false)
  const [translatedPoiMenu, setTranslatedPoiMenu] = useState({})
  const [isTranslatingPoiMenu, setIsTranslatingPoiMenu] = useState(false)
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
  const poiEntryTimeRef = useRef(null) // Track thời điểm bước vào POI
  const poiDebounceTimerRef = useRef(null) // Timer cho debouncer 3s
  const playedRestaurantsRef = useRef(new Map()) // Track quán đã phát: {restaurantId: timestamp}
  const visitStartTimeRef = useRef(null) // Track thời điểm bắt đầu visit (đứng gần quán > 10s)
  const audioStartTimeRef = useRef(null) // Track thời điểm bắt đầu nghe audio
  const isChangingLanguageRef = useRef(false) // Flag để skip cooldown khi đổi ngôn ngữ
  const isCleaningUpAudioRef = useRef(false) // Flag để skip error khi cleanup audio

  // Cập nhật languageRef mỗi khi language thay đổi
  useEffect(() => {
    languageRef.current = language
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

  // Track location visit khi user ở gần quán
  const trackLocationVisit = (lat, lng, durationSeconds, restaurantId = null) => {

    fetch(`${BASE_URL}/track-location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat,
        lng,
        duration_seconds: durationSeconds,
        restaurant_id: restaurantId
      })
    })
      .then(res => {
        if (!res.ok) {
          // Nếu endpoint chưa có (404), warning thay vì error
          if (res.status === 404) {
            console.warn('⚠️ Location tracking endpoint not available yet (404) - backend chưa deploy code mới')
            return null
          }
          throw new Error(`HTTP error! status: ${res.status}`)
        }
        return res.json()
      })
      .then(data => {
        if (data) {

        }
      })
      .catch(err => {
        if (!err.message.includes('404')) {
          console.error('❌ Error tracking location:', err)
          console.error('Details:', { lat, lng, durationSeconds, restaurantId })
        }
      })
  }

  // Track audio playback duration
  const trackAudioDuration = (restaurantId, durationSeconds) => {

    fetch(`${BASE_URL}/track-audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurant_id: restaurantId,
        duration_seconds: durationSeconds
      })
    })
      .then(res => {
        if (!res.ok) {
          // Nếu endpoint chưa có (404), warning thay vì error
          if (res.status === 404) {
            console.warn('⚠️ Audio tracking endpoint not available yet (404) - backend chưa deploy code mới')
            return null // Return null để skip .then() tiếp theo
          }
          throw new Error(`HTTP error! status: ${res.status}`)
        }
        return res.json()
      })
      .then(data => {
        if (data) { // Chỉ log khi có data (không phải 404)

        }
      })
      .catch(err => {
        // Chỉ log error khi KHÔNG phải 404 (404 đã handle ở trên)
        if (!err.message.includes('404')) {
          console.error('❌ Error tracking audio:', err)
          console.error('Details:', { restaurantId, durationSeconds })
        }
      })
  }

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
    
    // Cập nhật vị trí user luôn, không bị block bởi audio
    setUserLocation([userLat, userLng])

    // NẾU ĐANG PHÁT AUDIO, TẠM DỪNG GPS UPDATE (không fetch location mới)
    if (isAudioPlaying) {

      return
    }

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
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`)
        }
        return res.json()
      })
      .then(data => {
        const newId = data.nearest_place.id
        const distance = data.distance_km

        if (newId !== lastRestaurantIdRef.current) {
          lastRestaurantIdRef.current = newId
          lastDistanceRef.current = distance // Reset distance tracking

          // Hủy debounce timer cũ
          if (poiDebounceTimerRef.current) {
            clearTimeout(poiDebounceTimerRef.current)
            poiDebounceTimerRef.current = null
          }

          // Dừng audio cũ hoàn toàn
          stopAudio()

          // Lấy bán kính POI từ API (mặc định 0.015 = 15m)
          const poiRadius = data.poi_radius_km || 0.015


          // Kiểm tra khoảng cách
          if (distance > poiRadius) {
            setCurrentNarration({
              restaurantId: newId,
              name: data.nearest_place.name,
              narration: data.out_of_range_message,
              audioUrl: null,
              tags: data.nearest_place.tags || [],
              images: data.nearest_place.images || [],
              menu: data.nearest_place.menu || []
            })
            setCurrentDistance(distance)
            poiEntryTimeRef.current = null
            
            // Reset visit tracking khi ra khỏi POI
            if (visitStartTimeRef.current) {
              const visitDuration = Math.floor((Date.now() - visitStartTimeRef.current) / 1000)
              if (visitDuration >= 10) {
                // Track location visit (chỉ khi đã ở >= 10s)
                trackLocationVisit(userLat, userLng, visitDuration, newId)
              }
              visitStartTimeRef.current = null
            }
          } else {
            // VÀO POI - BẮT ĐẦU TRACKING VISIT
            // Bắt đầu tracking ngay khi vào POI (trong poi_radius)
            if (!visitStartTimeRef.current) {
              visitStartTimeRef.current = Date.now()

            }
            
            setCurrentNarration({
              restaurantId: newId,
              name: data.nearest_place.name,
              narration: data.narration,
              audioUrl: data.audio_url,
              tags: data.nearest_place.tags || [],
              images: data.nearest_place.images || [],
              menu: data.nearest_place.menu || []
            })
            setCurrentDistance(distance)

            // Kiểm tra cooldown 5 phút
            const lastPlayedTime = playedRestaurantsRef.current.get(newId)
            const now = Date.now()
            const cooldownPeriod = 5 * 60 * 1000 // 5 phút
            const inCooldown = lastPlayedTime && (now - lastPlayedTime < cooldownPeriod)

            if (inCooldown) {

              // Không tự động phát, chỉ hiện nút bấm
              return
            }

            // DEBOUNCER: Đợi 2 giây trước khi phát audio
            if (data.audio_url) {

              poiEntryTimeRef.current = now
              poiDebounceTimerRef.current = setTimeout(() => {
                // Kiểm tra xem user vẫn còn trong POI không
                if (poiEntryTimeRef.current === now && !isAudioPlaying) {

                  playAudio(`${BASE_URL}${data.audio_url}`)
                  // Lưu timestamp đã phát (nếu không đang đổi ngôn ngữ)
                  if (!isChangingLanguageRef.current) {
                    playedRestaurantsRef.current.set(newId, Date.now())
                  }
                }
              }, 2000) // 2 giây
            }
          }
        } else {
          // Cập nhật khoảng cách khi vẫn ở cùng quán
          const lastDistance = lastDistanceRef.current
          const distanceChanged = lastDistance === null || Math.abs(distance - lastDistance) > 0.005 // Chỉ update khi thay đổi > 5m
          
          // Lấy bán kính POI từ API (mặc định 0.015 = 15m)
          const poiRadius = data.poi_radius_km || 0.015
          
          if (distance > poiRadius && currentNarration?.audioUrl) {
            // Ra khỏi POI - dừng audio hoàn toàn và hủy debouncer
            if (poiDebounceTimerRef.current) {
              clearTimeout(poiDebounceTimerRef.current)
              poiDebounceTimerRef.current = null
            }
            stopAudio()
            lastDistanceRef.current = distance
            poiEntryTimeRef.current = null
            setCurrentNarration(prev => ({
              ...prev,
              narration: data.out_of_range_message,
              audioUrl: null
            }))
            setCurrentDistance(distance)
            
            // Track location visit khi ra khỏi POI
            if (visitStartTimeRef.current) {
              const visitDuration = Math.floor((Date.now() - visitStartTimeRef.current) / 1000)
              if (visitDuration >= 10) {
                trackLocationVisit(userLat, userLng, visitDuration, newId)
              }
              visitStartTimeRef.current = null
            }
          } else if (distance <= poiRadius && !currentNarration?.audioUrl) {
            // Vào trong POI
            lastDistanceRef.current = distance
            
            // Bắt đầu tracking visit ngay khi vào POI
            if (!visitStartTimeRef.current) {
              visitStartTimeRef.current = Date.now()

            }
            
            setCurrentNarration({
              restaurantId: newId,
              name: data.nearest_place.name,
              narration: data.narration,
              audioUrl: data.audio_url,
              tags: data.nearest_place.tags || [],
              images: data.nearest_place.images || [],
              menu: data.nearest_place.menu || []
            })
            setCurrentDistance(distance)

            // Kiểm tra cooldown 5 phút
            const lastPlayedTime = playedRestaurantsRef.current.get(newId)
            const now = Date.now()
            const cooldownPeriod = 5 * 60 * 1000 // 5 phút
            const inCooldown = lastPlayedTime && (now - lastPlayedTime < cooldownPeriod)

            if (inCooldown) {

              return
            }

            // DEBOUNCER: Đợi 2 giây trước khi phát audio
            if (data.audio_url && !isAudioPlaying) {

              poiEntryTimeRef.current = now
              poiDebounceTimerRef.current = setTimeout(() => {
                if (poiEntryTimeRef.current === now && !isAudioPlaying) {

                  playAudio(`${BASE_URL}${data.audio_url}`)
                  // Lưu timestamp (nếu không đang đổi ngôn ngữ)
                  if (!isChangingLanguageRef.current) {
                    playedRestaurantsRef.current.set(newId, Date.now())
                  }
                }
              }, 2000) // 2 giây
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
      // Track audio duration trước khi dừng
      if (audioStartTimeRef.current && currentNarration?.restaurantId) {
        const audioDuration = Math.floor((Date.now() - audioStartTimeRef.current) / 1000)

        if (audioDuration >= 1) { // Chỉ track nếu nghe >= 1s
          trackAudioDuration(currentNarration.restaurantId, audioDuration)
        } else {

        }
      } else {

      }
      
      // Set flag trước khi cleanup để skip error event
      isCleaningUpAudioRef.current = true
      
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current.src = ''
      audioRef.current.load()
      audioRef.current = null
      
      // Reset flag sau khi cleanup xong
      setTimeout(() => {
        isCleaningUpAudioRef.current = false
      }, 100)
    }
    setIsAudioPlaying(false)
    audioStartTimeRef.current = null
    
    // Hủy debounce timer nếu có
    if (poiDebounceTimerRef.current) {
      clearTimeout(poiDebounceTimerRef.current)
      poiDebounceTimerRef.current = null
    }
    
    // Khi dừng audio, trigger GPS update ngay để cập nhật lại vị trí

    if (isTracking && userLocation) {
      navigator.geolocation.getCurrentPosition(fetchAndUpdateLocation)
    }
  }

  // Phát audio
  const playAudio = (url) => {

    
    if (audioRef.current) {
      // Set flag trước khi cleanup
      isCleaningUpAudioRef.current = true
      audioRef.current.pause()
      audioRef.current.src = '' // Clear old source
      audioRef.current = null
      // Reset flag
      setTimeout(() => {
        isCleaningUpAudioRef.current = false
      }, 100)
    }
    
    // Set isAudioPlaying NGAY LẬP TỨC trước khi tạo audio
    setIsAudioPlaying(true)
    
    // ⚠️ SET audioStartTimeRef NGAY LẬP TỨC (trước khi play) để tránh race condition
    audioStartTimeRef.current = Date.now()

    
    // Thêm timestamp để tránh cache browser
    const audioUrl = url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`
    
    const audio = new Audio(audioUrl)
    audio.crossOrigin = "anonymous" // Cho phép CORS
    audioRef.current = audio
    
    // Sự kiện load thành công
    audio.onloadeddata = () => {

    }
    
    audio.onerror = (e) => {
      // Ignore error nếu đang cleanup audio
      if (isCleaningUpAudioRef.current) {

        return
      }
      
      console.error('Audio error:', e)
      console.error('Audio error details:', audio.error)

      setIsAudioPlaying(false)
      audioStartTimeRef.current = null
    }
    
    audio.onended = () => {

      // Track audio duration khi nghe xong
      if (audioStartTimeRef.current && currentNarration?.restaurantId) {
        const audioDuration = Math.floor((Date.now() - audioStartTimeRef.current) / 1000)

        if (audioDuration >= 1) { // Chỉ track nếu nghe >= 1s
          trackAudioDuration(currentNarration.restaurantId, audioDuration)
        } else {

        }
      } else {

      }
      
      setIsAudioPlaying(false)
      audioStartTimeRef.current = null
      
      // Khi audio kết thúc, trigger GPS update ngay để cập nhật lại vị trí

      if (isTracking && userLocation) {
        navigator.geolocation.getCurrentPosition(fetchAndUpdateLocation)
      }
    }
    
    audio.play()
      .then(() => {

        // audioStartTimeRef đã được set ở trên rồi, không cần set lại ở đây
      })
      .catch(err => {
        console.error('Error playing audio:', err)

        setIsAudioPlaying(false)
        audioStartTimeRef.current = null // Reset nếu play fail
      })
  }

  // Bắt đầu tracking
  const startTracking = () => {
    if (!navigator.geolocation) {
      alert(t('gpsNotSupported'))
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
        alert(t('gpsPermissionError'))
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
    
    // Track location visit nếu đang trong quá trình visit
    if (visitStartTimeRef.current && currentNarration?.restaurantId && userLocation) {
      const visitDuration = Math.floor((Date.now() - visitStartTimeRef.current) / 1000)
      if (visitDuration >= 10) {
        trackLocationVisit(userLocation[0], userLocation[1], visitDuration, currentNarration.restaurantId)
      }
      visitStartTimeRef.current = null
    }
    
    stopAudio()
  }

  // Toggle audio
  const handleToggleAudio = (audioUrl) => {

    
    if (!audioUrl) {

      return
    }

    // Kiểm tra xem audio có đang phát không dựa vào audioRef
    if (audioRef.current && !audioRef.current.paused) {

      // DỪNG HOÀN TOÀN - Xóa audio để phát lại từ đầu
      stopAudio()
    } else {

      // Tạo audio mới và phát từ đầu
      playAudio(audioUrl)
      // Lưu timestamp khi user tự bấm (nếu không đang đổi ngôn ngữ)
      if (currentNarration?.restaurantId && !isChangingLanguageRef.current) {
        playedRestaurantsRef.current.set(currentNarration.restaurantId, Date.now())
      }
    }
  }

  // Xử lý thay đổi ngôn ngữ
  const handleLanguageChange = (e) => {
    const newLang = e.target.value


    
    // Set flag đang đổi ngôn ngữ để skip cooldown tracking
    isChangingLanguageRef.current = true
    
    // Update ngôn ngữ global và state trang hiện tại
    setLanguage(newLang)
    languageRef.current = newLang // Update ref ngay lập tức

    // Reset cooldown map TRƯỚC khi dừng audio
    playedRestaurantsRef.current.clear()

    
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
        isChangingLanguageRef.current = false // Reset flag
        fetchAndUpdateLocation({ coords: { latitude: userLocation[0], longitude: userLocation[1] } }, newLang)
      }, 200)
    } else {
      isChangingLanguageRef.current = false // Reset flag
    }
  }

  // Xử lý click vào marker quán
  const handleRestaurantClick = (restaurant) => {
    // Dừng audio cũ nếu đang phát
    stopAudio()

    // Set loading state ngay lập tức để popup hiển thị "Đang tải..."
    setSelectedRestaurant({
      ...restaurant,
      loading: true
    })

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
            distance: distance,
            loading: false
          }
          setSelectedRestaurant(newData)
        })
        .catch(err => {
          console.error('Error:', err)
          // Vẫn hiển thị thông tin cơ bản nếu fetch thất bại
          setSelectedRestaurant({
            ...restaurant,
            distance: distance,
            loading: false,
            error: true
          })
        })
    } else {
      // Nếu không có userLocation, vẫn hiển thị thông tin cơ bản
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
          setSelectedRestaurant({
            ...restaurant,
            narration: data.narration,
            audioUrl: data.audio_url,
            loading: false
          })
        })
        .catch(err => {
          console.error('Error:', err)
          setSelectedRestaurant({
            ...restaurant,
            loading: false,
            error: true
          })
        })
    }
  }

  const openPoiMenuModal = async () => {
    if (!currentNarration?.menu?.length) {
      setIsPoiMenuModalOpen(true)
      setTranslatedPoiMenu({})
      return
    }

    if (language === 'vi') {
      setTranslatedPoiMenu({})
      setIsPoiMenuModalOpen(true)
      return
    }

    setIsTranslatingPoiMenu(true)
    setIsPoiMenuModalOpen(true)

    try {
      const texts = [currentNarration.name, ...currentNarration.menu.map(item => item.name)].filter(Boolean)

      const response = await fetch(`${BASE_URL}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts, target_lang: language })
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.status !== 'success') {
        return
      }

      setTranslatedPoiMenu(data.translations || {})
    } catch {
      // Ignore translation failures and keep original menu text.
    } finally {
      setIsTranslatingPoiMenu(false)
    }
  }

  // Mở Google Maps directions
  const openDirections = (restaurant) => {
    if (userLocation) {
      // Có vị trí user, mở với origin
      const url = `https://www.google.com/maps/dir/?api=1&origin=${userLocation[0]},${userLocation[1]}&destination=${restaurant.lat},${restaurant.lng}`
      window.open(url, '_blank')
    } else {
      // Không có vị trí user, mở trực tiếp đến quán (Google Maps sẽ tự lấy vị trí hiện tại)
      const url = `https://www.google.com/maps/search/?api=1&query=${restaurant.lat},${restaurant.lng}`
      window.open(url, '_blank')
    }
  }

  const handleCustomerLogout = () => {
    fetch(`${BASE_URL}/customer/logout`, {
      method: 'POST',
      credentials: 'include'
    }).finally(() => {
      navigate('/customer/login', { replace: true })
    })
  }

  // Cleanup khi component unmount
  useEffect(() => {
    return () => {
      if (watchTimerRef.current) clearInterval(watchTimerRef.current)
      if (poiDebounceTimerRef.current) clearTimeout(poiDebounceTimerRef.current)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const mapCenter = userLocation || [10.760426862777551, 106.68198430250096] // Default: SGU area

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
          onClick={() => navigate('/customer/tour-planner')}
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

        <button
          onClick={handleCustomerLogout}
          style={{
            padding: '10px 16px',
            background: '#ef4444',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          🚪 {t('logout')}
        </button>
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
                <strong>📍 {t('currentLocation')}</strong>
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
                        {selectedRestaurant.loading ? (
                          <div style={{ margin: '10px 0', textAlign: 'center', padding: '15px' }}>
                            <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
                            <p style={{ fontSize: '13px', color: '#666' }}>{t('loadingRestaurantInfo')}</p>
                          </div>
                        ) : selectedRestaurant.error ? (
                          <div style={{ margin: '10px 0', padding: '10px', background: '#ffebee', borderRadius: '5px' }}>
                            <p style={{ fontSize: '13px', color: '#c62828', margin: 0 }}>
                              ⚠️ {t('loadRestaurantInfoFailed')}
                            </p>
                          </div>
                        ) : (
                          <>
                            {selectedRestaurant.distance !== undefined && (
                              <p style={{ margin: '5px 0', fontSize: '12px', color: '#666' }}>
                                📍 {t('yourDistance')}: {selectedRestaurant.distance.toFixed(3)} {t('km')}
                              </p>
                            )}
                            {selectedRestaurant.narration && (
                              <p style={{ margin: '10px 0', fontSize: '13px', fontStyle: 'italic' }}>
                                {selectedRestaurant.narration}
                              </p>
                            )}
                            <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
                                    fontSize: '14px',
                                    flex: '1',
                                    minWidth: '100px'
                                  }}
                                >
                                  {isAudioPlaying ? `⏹ ${t('stopButton')}` : `🔊 ${t('listenButton')}`}
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
                                  fontSize: '14px',
                                  flex: '1',
                                  minWidth: '100px'
                                }}
                              >
                                🧭 {t('directionButton')}
                              </button>
                              <button
                                onClick={() => navigate(`/customer/orders/${selectedRestaurant.id}`)}
                                style={{
                                  padding: '8px 12px',
                                  background: '#2563eb',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '5px',
                                  cursor: 'pointer',
                                  fontSize: '14px',
                                  flex: '1',
                                  minWidth: '100px'
                                }}
                              >
                                🧾 {t('orderFood')}
                              </button>
                            </div>
                          </>
                        )}
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
          {isTracking ? `⏹ ${t('stopTracking')}` : `▶️ ${t('startTracking')}`}
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
                📍 {t('yourDistance')}: {currentDistance?.toFixed(3) || '0.000'} {t('km')}
              </span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {currentNarration.menu && currentNarration.menu.length > 0 && (
                  <button
                    onClick={openPoiMenuModal}
                    style={{
                      padding: '8px 14px',
                      background: '#f59e0b',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    🍽️ {t('viewMenu')}
                  </button>
                )}
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
                    {isAudioPlaying ? `⏹ ${t('stopButton')}` : `🔊 ${t('listenNarrationButton')}`}
                  </button>
                )}
              </div>
            </div>
            </div>
          </div>
        )}
      </div>

      {isPoiMenuModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2100,
            padding: '16px'
          }}
          onClick={() => setIsPoiMenuModalOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '520px',
              maxHeight: '80vh',
              overflowY: 'auto',
              background: '#fff',
              borderRadius: '12px',
              border: '1px solid #dbe4ef',
              padding: '16px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>
                🍜 {(translatedPoiMenu[currentNarration?.name] || currentNarration?.name)} - {t('menuAndPrice')}
              </h3>
              <button
                type="button"
                onClick={() => setIsPoiMenuModalOpen(false)}
                style={{
                  border: 'none',
                  background: '#e2e8f0',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  cursor: 'pointer'
                }}
              >
                {t('close')}
              </button>
            </div>

            {isTranslatingPoiMenu && <div style={{ marginBottom: '10px', color: '#64748b' }}>{t('loading')}</div>}

            {(!currentNarration?.menu || currentNarration.menu.length === 0) && (
              <p style={{ margin: 0 }}>{t('noMenuInPoi')}</p>
            )}

            <div style={{ display: 'grid', gap: '8px' }}>
              {(currentNarration?.menu || []).map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px'
                  }}
                >
                  <span>{translatedPoiMenu[item.name] || item.name}</span>
                  <strong>{Number(item.price || 0).toLocaleString('vi-VN')}đ</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LocationTracker
