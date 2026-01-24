import { useState, useEffect, useRef } from 'react'
import { BASE_URL, LANGUAGES } from '../config'

function LocationTracker() {
  const [isTracking, setIsTracking] = useState(false)
  const [language, setLanguage] = useState(localStorage.getItem('language') || 'vi')
  const [result, setResult] = useState(null)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  
  const audioRef = useRef(null)
  const watchTimerRef = useRef(null)
  const lastRestaurantIdRef = useRef(null)

  // Hàm gọi backend để lấy thông tin location
  const fetchAndUpdateLocation = () => {
    navigator.geolocation.getCurrentPosition((pos) => {
      fetch(`${BASE_URL}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          language: language
        })
      })
        .then(res => res.json())
        .then(data => {
          const newId = data.nearest_place.id

          if (newId !== lastRestaurantIdRef.current) {
            lastRestaurantIdRef.current = newId

            // Dừng audio cũ
            if (audioRef.current) {
              audioRef.current.pause()
              audioRef.current = null
            }

            // Cập nhật kết quả
            setResult({
              name: data.nearest_place.name,
              narration: data.narration,
              distance: data.distance_km,
              audioUrl: data.audio_url
            })

            // Phát audio mới
            if (data.audio_url) {
              const audio = new Audio(`${BASE_URL}${data.audio_url}`)
              audioRef.current = audio
              audio.play()
              setIsAudioPlaying(true)

              audio.onended = () => {
                setIsAudioPlaying(false)
              }
            }
          }
        })
        .catch(err => {
          console.error('Error fetching location:', err)
        })
    }, (error) => {
      console.error('Geolocation error:', error)
      alert('Không thể lấy vị trí GPS. Vui lòng bật GPS và cho phép truy cập.')
    })
  }

  // Bắt đầu tracking
  const startTracking = () => {
    if (!navigator.geolocation) {
      alert('Trình duyệt không hỗ trợ GPS')
      return
    }

    setIsTracking(true)
    fetchAndUpdateLocation()
    watchTimerRef.current = setInterval(fetchAndUpdateLocation, 5000)
  }

  // Dừng tracking
  const stopTracking = () => {
    setIsTracking(false)
    if (watchTimerRef.current) {
      clearInterval(watchTimerRef.current)
      watchTimerRef.current = null
    }
    lastRestaurantIdRef.current = null

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
  }

  // Toggle tracking
  const handleToggleTracking = () => {
    if (isTracking) {
      stopTracking()
    } else {
      startTracking()
    }
  }

  // Toggle audio play/pause
  const handleToggleAudio = () => {
    if (!audioRef.current) return

    if (audioRef.current.paused) {
      audioRef.current.play()
      setIsAudioPlaying(true)
    } else {
      audioRef.current.pause()
      setIsAudioPlaying(false)
    }
  }

  // Xử lý thay đổi ngôn ngữ
  const handleLanguageChange = (e) => {
    const newLang = e.target.value
    setLanguage(newLang)
    localStorage.setItem('language', newLang)

    // Dừng tracking và reset
    if (isTracking) {
      stopTracking()
    }
    setResult(null)
    lastRestaurantIdRef.current = null
  }

  // Auto start khi load trang
  useEffect(() => {
    const timer = setTimeout(() => {
      startTracking()
    }, 500)

    return () => {
      clearTimeout(timer)
      if (watchTimerRef.current) {
        clearInterval(watchTimerRef.current)
      }
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [])

  return (
    <div className="container">
      <h1>🍜 Food Street PoC</h1>

      <button onClick={handleToggleTracking} type="button">
        {isTracking ? '⏹ Đang theo dõi... (bấm để dừng)' : '▶️ Bắt đầu theo dõi'}
      </button>

      <select value={language} onChange={handleLanguageChange}>
        {LANGUAGES.map(lang => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>

      {result && (
        <div>
          <h2>{result.name}</h2>
          <p>{result.narration}</p>
          {result.audioUrl && (
            <button onClick={handleToggleAudio} type="button">
              {isAudioPlaying ? '⏸' : '🔊'}
            </button>
          )}
          <br />
          <small>Khoảng cách: {result.distance} km</small>
        </div>
      )}
    </div>
  )
}

export default LocationTracker
