import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { BASE_URL } from '../config'
import { useTranslation } from '../hooks/useTranslation'
import { useAppLanguage } from '../hooks/useAppLanguage'

const HEARTBEAT_LOCATION_KEY = 'heartbeatLastLocation'

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

const POI_DEBOUNCE_MS = 2000
const BATTERY_SAVER_KEY = 'nearbiteBatterySaverEnabled'
const DEVICE_PROFILE_OVERRIDE_KEY = 'nearbiteDeviceProfileOverride'
const PWA_AUDIO_INDEX_KEY = 'nearbitePwaAudioIndexV1'
const PWA_CACHED_RESTAURANTS_KEY = 'nearbitePwaCachedRestaurantsV1'
const PWA_CACHED_RESTAURANT_DETAIL_KEY = 'nearbitePwaCachedRestaurantDetailV1'

const GPS_INTERVAL_BY_MODE_MS = {
  normal: 3000,
  normalBattery: 6000,
  weak: 10000,
  weakBattery: 15000
}

const MODE_LABEL_BY_KEY = {
  normal: 'Binh thuong',
  normalBattery: 'Tiet kiem pin',
  weak: 'May yeu',
  weakBattery: 'May yeu + tiet kiem pin'
}

const isRunningAsPwa = () => {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator?.standalone === true
}

const readJsonObject = (key) => {
  try {
    if (typeof localStorage === 'undefined') return {}
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

const writeJsonObject = (key, value) => {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore storage write failures in private mode/quota exceeded.
  }
}

const readCachedRestaurantIds = () => Object.keys(readJsonObject(PWA_AUDIO_INDEX_KEY))

const readCachedRestaurants = () => {
  const map = readJsonObject(PWA_CACHED_RESTAURANTS_KEY)
  return Object.values(map).filter(Boolean)
}

const readCachedRestaurantDetail = (restaurantId) => {
  if (!restaurantId) return null
  const map = readJsonObject(PWA_CACHED_RESTAURANT_DETAIL_KEY)
  return map[String(restaurantId)] || null
}

const isLikelyWeakDevice = () => {
  if (typeof navigator === 'undefined') return false

  const forcedProfile = localStorage.getItem(DEVICE_PROFILE_OVERRIDE_KEY)
  if (forcedProfile === 'weak') return true
  if (forcedProfile === 'normal') return false

  const memory = typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : null
  const cores = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
  const effectiveType = connection?.effectiveType || ''
  const saveData = Boolean(connection?.saveData)
  const userAgent = typeof navigator.userAgent === 'string' ? navigator.userAgent : ''
  const isAppleMobile = /iPhone|iPad|iPod/i.test(userAgent)

  const isVeryLowMemory = memory !== null && memory <= 2
  const isVeryLowCpu = cores !== null && cores <= 2
  const isLowMemory = memory !== null && memory <= 3
  const isLowCpu = cores !== null && cores <= 4
  const isSlowNetwork = /(^2g$|^slow-2g$)/i.test(effectiveType)
  const isConstrainedNetwork = /^3g$/i.test(effectiveType)

  // iOS often reports limited hardware hints; avoid false positives for modern iPhones/iPads.
  if (isAppleMobile && !saveData && !isSlowNetwork && cores !== null && cores >= 4) {
    return false
  }

  // Score-based heuristic to avoid over-detecting weak devices.
  // A single mild signal (e.g. 3g or 4 CPU cores) is not enough to classify as weak.
  let weakScore = 0
  if (saveData) weakScore += 2
  if (isVeryLowMemory) weakScore += 2
  else if (isLowMemory) weakScore += 1
  if (isVeryLowCpu) weakScore += 2
  else if (isLowCpu) weakScore += 1
  if (isSlowNetwork) weakScore += 2
  else if (isConstrainedNetwork) weakScore += 1

  return isVeryLowMemory || isVeryLowCpu || weakScore >= 3
}

const getPerformanceModeKey = (weakDevice, batterySaverEnabled) => {
  if (!weakDevice && !batterySaverEnabled) return 'normal'
  if (!weakDevice && batterySaverEnabled) return 'normalBattery'
  if (weakDevice && !batterySaverEnabled) return 'weak'
  return 'weakBattery'
}

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
  const [customerAuthStatus, setCustomerAuthStatus] = useState('checking')
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
  const [isPwaRuntime, setIsPwaRuntime] = useState(() => isRunningAsPwa())
  const [isOfflineMode, setIsOfflineMode] = useState(() => {
    if (typeof navigator === 'undefined') return false
    return isRunningAsPwa() && !navigator.onLine
  })
  const [cachedRestaurantIds, setCachedRestaurantIds] = useState(() => readCachedRestaurantIds())
  const [isWeakDevice, setIsWeakDevice] = useState(() => isLikelyWeakDevice())
  const [isBatterySaverEnabled, setIsBatterySaverEnabled] = useState(() => {
    return localStorage.getItem(BATTERY_SAVER_KEY) === 'true'
  })
  
  const audioRef = useRef(null)
  const watchTimerRef = useRef(null)
  const lastRestaurantIdRef = useRef(null)
  const lastDistanceRef = useRef(null) // Track khoảng cách để tránh update liên tục
  const languageRef = useRef(language) // Track current language
  const audioUnlockedRef = useRef(false) // Track nếu audio đã được unlock
  const poiEntryTimeRef = useRef(null) // Track thời điểm bước vào POI
  const poiDebounceTimerRef = useRef(null) // Timer cho debouncer 2s
  const playedRestaurantsRef = useRef(new Map()) // Track quán đã phát: {restaurantId: timestamp}
  const visitStartTimeRef = useRef(null) // Track thời điểm bắt đầu visit (đứng gần quán > 10s)
  const audioStartTimeRef = useRef(null) // Track thời điểm bắt đầu nghe audio
  const isChangingLanguageRef = useRef(false) // Flag để skip cooldown khi đổi ngôn ngữ
  const isCleaningUpAudioRef = useRef(false) // Flag để skip error khi cleanup audio
  const locationRequestControllerRef = useRef(null)
  const locationRequestSeqRef = useRef(0)
  const selectedRestaurantRequestControllerRef = useRef(null)
  const selectedRestaurantRequestSeqRef = useRef(0)

  const performanceModeKey = getPerformanceModeKey(isWeakDevice, isBatterySaverEnabled)
  const gpsIntervalMs = GPS_INTERVAL_BY_MODE_MS[performanceModeKey]
  const canAutoPlayAudio = performanceModeKey === 'normal'
  const showWeakDeviceNote = isWeakDevice
  const weakDeviceNote = isBatterySaverEnabled
    ? 'Thiết bị đang chạy chế độ tối ưu cho cấu hình yếu và giảm tải.'
    : 'Thiết bị đang chạy chế độ tối ưu cho cấu hình yếu.'
  const cachedRestaurantIdSet = new Set(cachedRestaurantIds.map(String))
  const visibleRestaurants = (isPwaRuntime && isOfflineMode)
    ? restaurants.filter((restaurant) => cachedRestaurantIdSet.has(String(restaurant.id)))
    : restaurants

  const rememberCachedRestaurant = (restaurant) => {
    if (!restaurant?.id) return
    const cacheMap = readJsonObject(PWA_CACHED_RESTAURANTS_KEY)
    cacheMap[String(restaurant.id)] = restaurant
    writeJsonObject(PWA_CACHED_RESTAURANTS_KEY, cacheMap)
  }

  const cacheNarrationForOffline = async ({ restaurant, audioUrl, narration }) => {
    if (!isPwaRuntime || !restaurant?.id || !audioUrl) return

    const resolvedAudioUrl = resolveAudioUrl(audioUrl)
    if (!resolvedAudioUrl) return

    const index = readJsonObject(PWA_AUDIO_INDEX_KEY)
    index[String(restaurant.id)] = {
      audioUrl: resolvedAudioUrl,
      updatedAt: Date.now()
    }
    writeJsonObject(PWA_AUDIO_INDEX_KEY, index)
    rememberCachedRestaurant(restaurant)

    const detailMap = readJsonObject(PWA_CACHED_RESTAURANT_DETAIL_KEY)
    detailMap[String(restaurant.id)] = {
      ...restaurant,
      narration: narration || restaurant.narration || '',
      audioUrl: resolvedAudioUrl,
      updatedAt: Date.now()
    }
    writeJsonObject(PWA_CACHED_RESTAURANT_DETAIL_KEY, detailMap)

    setCachedRestaurantIds(Object.keys(index))

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        // Trigger SW/audio cache warm-up; opaque response is still cacheable.
        await fetch(resolvedAudioUrl, { mode: 'no-cors' })
      } catch {
        // Ignore warm-up failures; playback can still use network when online.
      }
    }
  }

  // Cập nhật languageRef mỗi khi language thay đổi
  useEffect(() => {
    languageRef.current = language
  }, [language])

  // Lưu state collapse panel
  useEffect(() => {
    localStorage.setItem('narrationPanelCollapsed', isPanelCollapsed)
  }, [isPanelCollapsed])

  // Re-check profile once mounted; useful when browser exposes hardware/network hints late.
  useEffect(() => {
    setIsWeakDevice(isLikelyWeakDevice())
  }, [])

  // Track PWA runtime + connectivity for offline-only behavior.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return

    const syncRuntime = () => {
      const pwa = isRunningAsPwa()
      setIsPwaRuntime(pwa)
      setIsOfflineMode(pwa && !navigator.onLine)
    }

    const handleOnline = () => setIsOfflineMode(isRunningAsPwa() && !navigator.onLine)
    const handleOffline = () => setIsOfflineMode(isRunningAsPwa() && !navigator.onLine)

    syncRuntime()
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('focus', syncRuntime)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('focus', syncRuntime)
    }
  }, [])

  // When running as PWA and offline, load restaurants from local cache only.
  useEffect(() => {
    if (isPwaRuntime && isOfflineMode) {
      setRestaurants(readCachedRestaurants())
    }
  }, [isPwaRuntime, isOfflineMode])

  // Persist user-controlled battery saver mode.
  useEffect(() => {
    localStorage.setItem(BATTERY_SAVER_KEY, String(isBatterySaverEnabled))
  }, [isBatterySaverEnabled])

  // Fetch danh sách ngôn ngữ từ API
  useEffect(() => {
    fetch(`${BASE_URL}/languages`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
        return res.json()
      })
      .then(data => {
        if (data.status === 'success' && Array.isArray(data.languages)) {
          setLanguages(data.languages)
        }
      })
      .catch(err => console.error('Error fetching languages:', err))
  }, [])

  // Kiểm tra đăng nhập customer để bật/tắt tính năng nâng cao
  useEffect(() => {
    let isMounted = true

    fetch(`${BASE_URL}/customer/check`, {
      credentials: 'include'
    })
      .then((res) => {
        if (!isMounted) return
        setCustomerAuthStatus(res.ok ? 'authenticated' : 'guest')
      })
      .catch(() => {
        if (!isMounted) return
        setCustomerAuthStatus('guest')
      })

    return () => {
      isMounted = false
    }
  }, [])

  // Fetch danh sách quán theo ngôn ngữ hiện tại
  useEffect(() => {
    if (isPwaRuntime && isOfflineMode) {
      setRestaurants(readCachedRestaurants())
      return
    }

    fetch(`${BASE_URL}/restaurants?lang=${encodeURIComponent(language)}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
        return res.json()
      })
      .then(data => {
        const list = Array.isArray(data.restaurants) ? data.restaurants : []
        setRestaurants(list)

        if (isPwaRuntime) {
          const cachedIds = new Set(readCachedRestaurantIds())
          if (cachedIds.size) {
            const cacheMap = readJsonObject(PWA_CACHED_RESTAURANTS_KEY)
            for (const restaurant of list) {
              if (cachedIds.has(String(restaurant.id))) {
                cacheMap[String(restaurant.id)] = restaurant
              }
            }
            writeJsonObject(PWA_CACHED_RESTAURANTS_KEY, cacheMap)
          }
        }
      })
      .catch(err => {
        console.error('Error fetching restaurants:', err)
        if (isPwaRuntime) {
          setRestaurants(readCachedRestaurants())
        }
      })
  }, [language, isPwaRuntime, isOfflineMode])

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

  const resolveAudioUrl = (audioPath) => {
    if (!audioPath) return null
    const raw = String(audioPath).trim()
    if (!raw) return null

    if (/^https?:\/\//i.test(raw)) return raw
    if (/^\/\//.test(raw)) return `https:${raw}`

    const embeddedMatches = raw.match(/https?:\/\/[^\s"'}]+/gi)
    if (embeddedMatches?.length) {
      // If malformed concatenation contains multiple absolute URLs,
      // prefer the last one (usually the actual Supabase audio URL).
      return embeddedMatches[embeddedMatches.length - 1]
    }

    if (raw.startsWith('/')) return `${BASE_URL}${raw}`

    if (/^[a-zA-Z0-9_-]+\.mp3$/i.test(raw)) {
      return `${BASE_URL}/static/tts/${raw}`
    }

    if (/\.supabase\.co\//i.test(raw)) {
      return `https://${raw.replace(/^https?:\/\//i, '')}`
    }

    return null
  }

  // Hàm fetch và cập nhật thuyết minh khi di chuyển
  const fetchAndUpdateLocation = (pos, lang = null) => {
    const currentLang = lang || languageRef.current
    const requestSeq = ++locationRequestSeqRef.current
    if (locationRequestControllerRef.current) {
      locationRequestControllerRef.current.abort()
    }
    const controller = new AbortController()
    locationRequestControllerRef.current = controller

    const userLat = pos.coords.latitude
    const userLng = pos.coords.longitude

    try {
      localStorage.setItem(HEARTBEAT_LOCATION_KEY, JSON.stringify({
        lat: userLat,
        lng: userLng,
        at: Date.now()
      }))
    } catch {
      // Ignore storage failure; realtime tracking can continue without heartbeat location cache.
    }
    
    // Cập nhật vị trí user luôn, không bị block bởi audio
    setUserLocation([userLat, userLng])

    // NẾU ĐANG PHÁT AUDIO, TẠM DỪNG GPS UPDATE (không fetch location mới)
    if (isAudioPlaying) {

      if (locationRequestSeqRef.current === requestSeq) {
        locationRequestControllerRef.current = null
      }
      return Promise.resolve()
    }

    return fetch(`${BASE_URL}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
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
        if (requestSeq !== locationRequestSeqRef.current || languageRef.current !== currentLang) {
          return
        }

        if (!data || !data.nearest_place || typeof data.distance_km !== 'number') {
          console.warn('Invalid /location response payload:', data)
          return
        }

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

            cacheNarrationForOffline({
              restaurant: data.nearest_place,
              audioUrl: data.audio_url,
              narration: data.narration
            })

            // Kiểm tra cooldown 5 phút
            const lastPlayedTime = playedRestaurantsRef.current.get(newId)
            const now = Date.now()
            const cooldownPeriod = 5 * 60 * 1000 // 5 phút
            const inCooldown = lastPlayedTime && (now - lastPlayedTime < cooldownPeriod)

            if (inCooldown) {

              // Không tự động phát, chỉ hiện nút bấm
              return
            }

            // DEBOUNCER: Đợi 2 giây trước khi phát audio (chỉ bật ở mức hiệu năng bình thường)
            if (data.audio_url && canAutoPlayAudio) {

              poiEntryTimeRef.current = now
              poiDebounceTimerRef.current = setTimeout(() => {
                // Kiểm tra xem user vẫn còn trong POI không
                if (poiEntryTimeRef.current === now && !isAudioPlaying) {

                  playAudio(resolveAudioUrl(data.audio_url))
                  // Lưu timestamp đã phát (nếu không đang đổi ngôn ngữ)
                  if (!isChangingLanguageRef.current) {
                    playedRestaurantsRef.current.set(newId, Date.now())
                  }
                }
              }, POI_DEBOUNCE_MS) // 2 giây
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

            cacheNarrationForOffline({
              restaurant: data.nearest_place,
              audioUrl: data.audio_url,
              narration: data.narration
            })

            // Kiểm tra cooldown 5 phút
            const lastPlayedTime = playedRestaurantsRef.current.get(newId)
            const now = Date.now()
            const cooldownPeriod = 5 * 60 * 1000 // 5 phút
            const inCooldown = lastPlayedTime && (now - lastPlayedTime < cooldownPeriod)

            if (inCooldown) {

              return
            }

            // DEBOUNCER: Đợi 2 giây trước khi phát audio (chỉ bật ở mức hiệu năng bình thường)
            if (data.audio_url && !isAudioPlaying && canAutoPlayAudio) {

              poiEntryTimeRef.current = now
              poiDebounceTimerRef.current = setTimeout(() => {
                if (poiEntryTimeRef.current === now && !isAudioPlaying) {

                  playAudio(resolveAudioUrl(data.audio_url))
                  // Lưu timestamp (nếu không đang đổi ngôn ngữ)
                  if (!isChangingLanguageRef.current) {
                    playedRestaurantsRef.current.set(newId, Date.now())
                  }
                }
              }, POI_DEBOUNCE_MS) // 2 giây
            }
          } else if (distanceChanged) {
            // CHỈ cập nhật distance state, KHÔNG động vào currentNarration - audio không bị ngắt
            lastDistanceRef.current = distance
            setCurrentDistance(distance)
          }
          // Nếu distance không thay đổi đáng kể, không làm gì cả - tránh re-render
        }
      })
      .catch(err => {
        if (err?.name === 'AbortError') {
          return
        }
        console.error('Error fetching location:', err)
      })
      .finally(() => {
        if (locationRequestSeqRef.current === requestSeq) {
          locationRequestControllerRef.current = null
        }
      })
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

    
    // Keep stable URL so SW/Cache can serve audio when offline.
    const audioUrl = url
    
    const audio = new Audio(audioUrl)
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
      },
      (error) => {
        console.error('Geolocation error:', error)
        alert(t('gpsPermissionError'))
      }
    )
  }

  useEffect(() => {
    if (!isTracking) return

    if (watchTimerRef.current) {
      clearInterval(watchTimerRef.current)
    }

    watchTimerRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(fetchAndUpdateLocation)
    }, gpsIntervalMs)

    return () => {
      if (watchTimerRef.current) {
        clearInterval(watchTimerRef.current)
        watchTimerRef.current = null
      }
    }
  }, [isTracking, gpsIntervalMs])

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

    const playableUrl = resolveAudioUrl(audioUrl)

    if (!playableUrl) {

      return
    }

    // Kiểm tra xem audio có đang phát không dựa vào audioRef
    if (audioRef.current && !audioRef.current.paused) {

      // DỪNG HOÀN TOÀN - Xóa audio để phát lại từ đầu
      stopAudio()
    } else {

      // Tạo audio mới và phát từ đầu
      playAudio(playableUrl)
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

    if (locationRequestControllerRef.current) {
      locationRequestControllerRef.current.abort()
      locationRequestControllerRef.current = null
    }
    if (selectedRestaurantRequestControllerRef.current) {
      selectedRestaurantRequestControllerRef.current.abort()
      selectedRestaurantRequestControllerRef.current = null
    }
    locationRequestSeqRef.current += 1
    selectedRestaurantRequestSeqRef.current += 1
    
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
    setCurrentDistance(null)

    // Reset menu modal/translation cũ để không hiển thị sai ngôn ngữ trước đó.
    setTranslatedPoiMenu({})
    setIsTranslatingPoiMenu(false)
    setIsPoiMenuModalOpen(false)

    // Reset và fetch lại với ngôn ngữ mới
    lastRestaurantIdRef.current = null
    
    if (isTracking && userLocation) {
      // Fetch lại ngay sau khi đổi ngôn ngữ để POI cập nhật tức thì.
      fetchAndUpdateLocation({ coords: { latitude: userLocation[0], longitude: userLocation[1] } }, newLang)
        .finally(() => {
          isChangingLanguageRef.current = false // Reset flag
        })
    } else {
      isChangingLanguageRef.current = false // Reset flag
    }
  }

  // Xử lý click vào marker quán
  const handleRestaurantClick = (restaurant) => {
    // Dừng audio cũ nếu đang phát
    stopAudio()

    if (isPwaRuntime && isOfflineMode) {
      const cachedDetail = readCachedRestaurantDetail(restaurant.id)
      const audioIndex = readJsonObject(PWA_AUDIO_INDEX_KEY)
      const fallbackAudioUrl = audioIndex[String(restaurant.id)]?.audioUrl || null
      const distance = userLocation
        ? calculateDistance(userLocation[0], userLocation[1], restaurant.lat, restaurant.lng)
        : undefined

      if (cachedDetail) {
        setSelectedRestaurant({
          ...restaurant,
          ...cachedDetail,
          distance,
          loading: false,
          error: false
        })
      } else if (fallbackAudioUrl) {
        setSelectedRestaurant({
          ...restaurant,
          narration: restaurant.narration || '',
          audioUrl: fallbackAudioUrl,
          distance,
          loading: false,
          error: false
        })
      } else {
        setSelectedRestaurant({
          ...restaurant,
          distance,
          loading: false,
          error: true
        })
      }
      return
    }

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

      const requestLang = languageRef.current
      const requestSeq = ++selectedRestaurantRequestSeqRef.current
      if (selectedRestaurantRequestControllerRef.current) {
        selectedRestaurantRequestControllerRef.current.abort()
      }
      const controller = new AbortController()
      selectedRestaurantRequestControllerRef.current = controller

      fetch(`${BASE_URL}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          latitude: restaurant.lat,
          longitude: restaurant.lng,
          language: requestLang,
          allow_network_translation: true
        })
      })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
          return res.json()
        })
        .then(data => {
          if (requestSeq !== selectedRestaurantRequestSeqRef.current || languageRef.current !== requestLang) {
            return
          }
          if (!data || typeof data !== 'object') {
            throw new Error('Invalid response payload')
          }

          const selectedPlace = data.nearest_place || {}
          const newData = {
            ...restaurant,
            ...selectedPlace,
            narration: data.narration,
            audioUrl: data.audio_url,
            distance: distance,
            loading: false
          }
          setSelectedRestaurant(newData)

          cacheNarrationForOffline({
            restaurant: { ...restaurant, ...selectedPlace },
            audioUrl: data.audio_url,
            narration: data.narration
          })
        })
        .catch(err => {
          if (err?.name === 'AbortError') {
            return
          }
          console.error('Error:', err)
          if (requestSeq !== selectedRestaurantRequestSeqRef.current || languageRef.current !== requestLang) {
            return
          }
          setSelectedRestaurant({
            ...restaurant,
            distance: distance,
            loading: false,
            error: true
          })
        })
        .finally(() => {
          if (selectedRestaurantRequestSeqRef.current === requestSeq) {
            selectedRestaurantRequestControllerRef.current = null
          }
        })
    } else {
      // Nếu không có userLocation, vẫn hiển thị thông tin cơ bản
      const requestLang = languageRef.current
      const requestSeq = ++selectedRestaurantRequestSeqRef.current
      if (selectedRestaurantRequestControllerRef.current) {
        selectedRestaurantRequestControllerRef.current.abort()
      }
      const controller = new AbortController()
      selectedRestaurantRequestControllerRef.current = controller

      fetch(`${BASE_URL}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          latitude: restaurant.lat,
          longitude: restaurant.lng,
          language: requestLang,
          allow_network_translation: true
        })
      })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
          return res.json()
        })
        .then(data => {
          if (requestSeq !== selectedRestaurantRequestSeqRef.current || languageRef.current !== requestLang) {
            return
          }
          if (!data || typeof data !== 'object') {
            throw new Error('Invalid response payload')
          }

          const selectedPlace = data.nearest_place || {}
          setSelectedRestaurant({
            ...restaurant,
            ...selectedPlace,
            narration: data.narration,
            audioUrl: data.audio_url,
            loading: false
          })

          cacheNarrationForOffline({
            restaurant: { ...restaurant, ...selectedPlace },
            audioUrl: data.audio_url,
            narration: data.narration
          })
        })
        .catch(err => {
          if (err?.name === 'AbortError') {
            return
          }
          console.error('Error:', err)
          if (requestSeq !== selectedRestaurantRequestSeqRef.current || languageRef.current !== requestLang) {
            return
          }
          setSelectedRestaurant({
            ...restaurant,
            loading: false,
            error: true
          })
        })
        .finally(() => {
          if (selectedRestaurantRequestSeqRef.current === requestSeq) {
            selectedRestaurantRequestControllerRef.current = null
          }
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

  const handleCustomerLogout = async () => {
    try {
      await fetch(`${BASE_URL}/customer/logout`, {
        method: 'POST',
        credentials: 'include'
      })
    } finally {
      if (watchTimerRef.current) {
        clearInterval(watchTimerRef.current)
        watchTimerRef.current = null
      }
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }

      setIsTracking(false)
      setIsAudioPlaying(false)
      setCurrentNarration(null)
      setSelectedRestaurant(null)
      setCurrentDistance(null)
      setCustomerAuthStatus('guest')
      navigate('/login?role=customer', { replace: true })
    }
  }

  // Cleanup khi component unmount
  useEffect(() => {
    return () => {
      if (watchTimerRef.current) clearInterval(watchTimerRef.current)
      if (poiDebounceTimerRef.current) clearTimeout(poiDebounceTimerRef.current)
      if (locationRequestControllerRef.current) locationRequestControllerRef.current.abort()
      if (selectedRestaurantRequestControllerRef.current) selectedRestaurantRequestControllerRef.current.abort()
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const mapCenter = userLocation || [10.760426862777551, 106.68198430250096] // Default: SGU area
  const isCustomerAuthenticated = customerAuthStatus === 'authenticated'

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
        
        {isCustomerAuthenticated && (
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
        )}

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

        {isCustomerAuthenticated ? (
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
        ) : (
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: '10px 16px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            🔐 {t('login')}
          </button>
        )}
      </div>

      {/* Leaflet Map */}
      <div style={{ flex: 1, position: 'relative' }}>
        {showWeakDeviceNote && (
          <div
            style={{
              position: 'absolute',
              top: '8px',
              left: '8px',
              zIndex: 1200,
              padding: '4px 8px',
              borderRadius: '999px',
              fontSize: '11px',
              color: '#475569',
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid #dbe4ef',
              boxShadow: '0 1px 5px rgba(15, 23, 42, 0.12)'
            }}
            title={`Profile: ${MODE_LABEL_BY_KEY[performanceModeKey]} | GPS ${gpsIntervalMs / 1000}s`}
          >
            ⚠ {weakDeviceNote}
          </div>
        )}

        {isPwaRuntime && isOfflineMode && (
          <div
            style={{
              position: 'absolute',
              top: showWeakDeviceNote ? '42px' : '8px',
              left: '8px',
              zIndex: 1200,
              padding: '4px 8px',
              borderRadius: '999px',
              fontSize: '11px',
              color: '#1f2937',
              background: 'rgba(254, 243, 199, 0.95)',
              border: '1px solid #f59e0b',
              boxShadow: '0 1px 5px rgba(15, 23, 42, 0.12)'
            }}
            title='Offline mode: chi hien thi quan da cache'
          >
            Offline mode
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsBatterySaverEnabled(prev => !prev)}
          title={`Che do pin: ${isBatterySaverEnabled ? 'bat' : 'tat'} | Profile: ${MODE_LABEL_BY_KEY[performanceModeKey]}`}
          style={{
            position: 'absolute',
            right: '14px',
            bottom: '14px',
            zIndex: 1200,
            width: '48px',
            height: '48px',
            borderRadius: '999px',
            border: '1px solid #dbe4ef',
            background: isBatterySaverEnabled ? '#14532d' : '#ffffff',
            color: isBatterySaverEnabled ? '#dcfce7' : '#0f172a',
            boxShadow: '0 6px 16px rgba(15, 23, 42, 0.2)',
            display: 'grid',
            placeItems: 'center',
            fontSize: '20px',
            padding: 0,
            margin: 0,
            lineHeight: 1
          }}
        >
          {isBatterySaverEnabled ? '🔋' : '🪫'}
        </button>

        <MapContainer
          key={`map-${language}`}
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
          {visibleRestaurants.map(restaurant => {
            const popupRestaurant = selectedRestaurant?.id === restaurant.id ? selectedRestaurant : restaurant
            return (
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
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>{popupRestaurant.name}</h3>
                    
                    {/* Hiển thị ảnh chính */}
                    {popupRestaurant.images && popupRestaurant.images.length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        {(() => {
                          const primaryImage = popupRestaurant.images.find(img => img.is_primary) || popupRestaurant.images[0]
                          return (
                            <img 
                              src={primaryImage.image_url} 
                              alt={primaryImage.caption || popupRestaurant.name}
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
                        {popupRestaurant.images.length > 1 && (
                          <div style={{ display: 'flex', gap: '5px', overflowX: 'auto' }}>
                            {popupRestaurant.images.slice(0, 4).map((img, idx) => (
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
                    {popupRestaurant.tags && popupRestaurant.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '10px' }}>
                        {popupRestaurant.tags.map(tag => (
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
                    
                    {popupRestaurant.description && (
                      <p style={{ margin: '5px 0', fontSize: '13px', color: '#333' }}>{popupRestaurant.description}</p>
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
                                  onClick={() => handleToggleAudio(selectedRestaurant.audioUrl)}
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
                                  {isAudioPlaying ? '🔇' : '🔊'}
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
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </Popup>
              </Marker>
            )})}
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
                    onClick={() => handleToggleAudio(currentNarration.audioUrl)}
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
                    {isAudioPlaying ? '🔇' : '🔊'}
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
