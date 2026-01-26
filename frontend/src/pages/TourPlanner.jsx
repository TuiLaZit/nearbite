import { useState, useEffect } from 'react'
import { BASE_URL } from '../config'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from '../hooks/useTranslation'

function TourPlanner() {
  const navigate = useNavigate()
  const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'vi')
  const { t, loading: translationLoading } = useTranslation(language)
  const [languages, setLanguages] = useState([]) // Fetch từ API
  const [tags, setTags] = useState([])
  const [selectedTags, setSelectedTags] = useState([])
  const [timeLimit, setTimeLimit] = useState(120) // phút
  const [budget, setBudget] = useState(500000) // VND
  const [userLocation, setUserLocation] = useState(null)
  const [tours, setTours] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Sync language with localStorage
  useEffect(() => {
    localStorage.setItem('language', language)
  }, [language])

  // Fetch danh sách ngôn ngữ
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

  // Fetch tags khi load hoặc đổi ngôn ngữ
  useEffect(() => {
    fetch(`${BASE_URL}/tags?lang=${language}`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success' && data.tags) {
          setTags(data.tags)
        } else {
          setTags([]) // Fallback nếu lỗi
        }
      })
      .catch(err => {
        console.error('Error fetching tags:', err)
        setTags([]) // Fallback nếu lỗi
      })
  }, [language]) // Re-fetch khi đổi ngôn ngữ

  // Lấy vị trí user
  const getUserLocation = () => {
    return new Promise((resolve, reject) => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const location = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude
            }
            setUserLocation(location)
            resolve(location)
          },
          (error) => {
            console.error('Error getting location:', error)
            reject(error)
          }
        )
      } else {
        reject(new Error('Geolocation not supported'))
      }
    })
  }

  // Toggle tag selection
  const toggleTag = (tagId) => {
    if (selectedTags.includes(tagId)) {
      setSelectedTags(selectedTags.filter(id => id !== tagId))
    } else {
      setSelectedTags([...selectedTags, tagId])
    }
  }

  // Xếp tour
  const handlePlanTour = async () => {
    setLoading(true)
    setError(null)
    setTours([])

    try {
      // Lấy vị trí GPS ngay lúc này
      let currentLocation = userLocation
      try {
        currentLocation = await getUserLocation()
        console.log('✅ Đã lấy vị trí GPS:', currentLocation)
      } catch (locError) {
        console.warn('⚠️ Không lấy được GPS, dùng vị trí cũ (nếu có)')
      }

      const response = await fetch(`${BASE_URL}/plan-tour`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          time_limit: timeLimit,
          budget: budget,
          tags: selectedTags,
          user_lat: currentLocation?.lat,
          user_lng: currentLocation?.lng
        })
      })

      const data = await response.json()
      
      if (data.status === 'success') {
        setTours(data.tours)
      } else {
        setError(data.message || 'Không thể tạo tour')
      }
    } catch (err) {
      console.error('Error planning tour:', err)
      setError('Lỗi kết nối server')
    } finally {
      setLoading(false)
    }
  }

  // Format tiền VND
  const formatMoney = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount)
  }

  // Mở Google Maps với nhiều điểm
  const openTourInMaps = (tour) => {
    if (!userLocation) return
    
    const waypoints = tour.restaurants.map(r => `${r.lat},${r.lng}`).join('|')
    const url = `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${tour.restaurants[tour.restaurants.length - 1].lat},${tour.restaurants[tour.restaurants.length - 1].lng}&waypoints=${waypoints}`
    window.open(url, '_blank')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      {/* Header */}
      <div style={{
        background: '#fff',
        borderBottom: '2px solid #ddd',
        padding: '15px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '20px'
      }}>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '8px 16px',
            background: '#fff',
            border: '2px solid #ddd',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          🍜
        </button>
        <h1 style={{ margin: 0, fontSize: '24px', flex: 1 }}>🗺️ {t('tourPlanning')}</h1>
        
        {/* Language selector */}
        <select 
          value={language} 
          onChange={(e) => setLanguage(e.target.value)}
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

      <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Form nhập liệu */}
        <div style={{
          background: '#fff',
          padding: '20px',
          borderRadius: '12px',
          marginBottom: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ marginTop: 0 }}>📝 {t('tourInfo')}</h2>

          {/* Thời gian */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              ⏱️ {t('totalTime')} ({t('minutes')}):
            </label>
            <input
              type="number"
              value={timeLimit}
              onChange={(e) => setTimeLimit(parseInt(e.target.value))}
              style={{
                width: '100%',
                padding: '10px',
                border: '2px solid #ddd',
                borderRadius: '8px',
                fontSize: '16px'
              }}
              min="30"
              max="480"
            />
            <small style={{ color: '#666' }}>Từ 30 phút đến 8 giờ</small>
          </div>

          {/* Ngân sách */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              💰 {t('budget')}:
            </label>
            <input
              type="number"
              value={budget}
              onChange={(e) => setBudget(parseInt(e.target.value))}
              style={{
                width: '100%',
                padding: '10px',
                border: '2px solid #ddd',
                borderRadius: '8px',
                fontSize: '16px'
              }}
              min="50000"
              step="50000"
            />
            <small style={{ color: '#666' }}>{formatMoney(budget)}</small>
          </div>

          {/* Tags */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              🏷️ {t('selectTags')}:
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {tags && tags.length > 0 ? tags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  style={{
                    padding: '8px 16px',
                    border: `2px solid ${tag.color || '#ddd'}`,
                    background: selectedTags.includes(tag.id) ? (tag.color || '#007bff') : '#fff',
                    color: selectedTags.includes(tag.id) ? '#fff' : (tag.color || '#333'),
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: selectedTags.includes(tag.id) ? 'bold' : 'normal',
                    transition: 'all 0.2s'
                  }}
                >
                  {tag.icon} {tag.name}
                </button>
              )) : (
                <div style={{ color: '#666', fontStyle: 'italic' }}>{t('loading')}</div>
              )}
            </div>
            <small style={{ color: '#666' }}>
              {selectedTags.length > 0 ? t('selectedTags', {count: selectedTags.length}) : t('noTagsSelected')}
            </small>
          </div>

          {/* Nút xếp tour */}
          <button
            onClick={handlePlanTour}
            disabled={loading}
            style={{
              width: '100%',
              padding: '15px',
              background: loading ? '#ccc' : '#28a745',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '18px',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s'
            }}
          >
            {loading ? `⏳ ${t('planning')}` : `🚀 ${t('planTourNow')}`}
          </button>
        </div>

        {/* Hiển thị lỗi */}
        {error && (
          <div style={{
            background: '#f8d7da',
            color: '#721c24',
            padding: '15px',
            borderRadius: '8px',
            marginBottom: '20px',
            border: '1px solid #f5c6cb'
          }}>
            ⚠️ {t('connectionError')}: {error}
          </div>
        )}

        {/* Hiển thị tours */}
        {tours.length > 0 && (
          <div>
            <h2>✨ {t('tourSuggestions', {count: tours.length})}</h2>
            <div style={{ display: 'grid', gap: '20px', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))' }}>
              {tours.map((tour, idx) => (
                <div
                  key={idx}
                  style={{
                    background: '#fff',
                    padding: '20px',
                    borderRadius: '12px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    border: idx === 0 ? '3px solid #28a745' : '1px solid #ddd'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h3 style={{ margin: 0 }}>
                      {idx === 0 && '👑 '}
                      {t('tour')} #{idx + 1}
                    </h3>
                    <span style={{
                      background: idx === 0 ? '#28a745' : '#007bff',
                      color: '#fff',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}>
                      {tour.strategy === 'best_score' && t('bestScore')}
                      {tour.strategy === 'nearest' && t('nearest')}
                      {tour.strategy === 'cheapest' && t('cheapest')}
                    </span>
                  </div>

                  <div style={{ marginBottom: '15px', padding: '10px', background: '#f8f9fa', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span>🕐 {t('time')}:</span>
                      <strong>{tour.total_time} {t('minutes')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span>💵 {t('cost')}:</span>
                      <strong style={{ color: '#28a745' }}>{formatMoney(tour.total_cost)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>🍽️ {t('restaurants')}:</span>
                      <strong>{t('restaurant_count', {count: tour.num_stops})}</strong>
                    </div>
                  </div>

                  {/* Danh sách quán */}
                  <div style={{ marginBottom: '15px' }}>
                    {tour.restaurants.map((restaurant, rIdx) => (
                      <div
                        key={rIdx}
                        style={{
                          padding: '12px',
                          background: '#f8f9fa',
                          borderRadius: '8px',
                          marginBottom: '10px',
                          border: '1px solid #e9ecef'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                          <span style={{
                            background: '#007bff',
                            color: '#fff',
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: 'bold'
                          }}>
                            {rIdx + 1}
                          </span>
                          <strong style={{ flex: 1 }}>{restaurant.name}</strong>
                          <span style={{ fontSize: '12px', color: '#666' }}>
                            {formatMoney(restaurant.avg_price)}
                          </span>
                        </div>

                        {/* Tags */}
                        {restaurant.tags && restaurant.tags.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
                            {restaurant.tags.map(tag => (
                              <span
                                key={tag.id}
                                style={{
                                  padding: '2px 8px',
                                  background: tag.color || '#ddd',
                                  color: '#fff',
                                  borderRadius: '10px',
                                  fontSize: '11px'
                                }}
                              >
                                {tag.icon} {tag.name}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Ảnh preview */}
                        {restaurant.images && restaurant.images.length > 0 && (
                          <div style={{ display: 'flex', gap: '5px' }}>
                            {restaurant.images.map((img, imgIdx) => (
                              <img
                                key={imgIdx}
                                src={img.image_url}
                                alt={restaurant.name}
                                style={{
                                  width: '50px',
                                  height: '50px',
                                  objectFit: 'cover',
                                  borderRadius: '5px'
                                }}
                                onError={(e) => e.target.style.display = 'none'}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Nút chỉ đường */}
                  <button
                    onClick={() => openTourInMaps(tour)}
                    disabled={!userLocation}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: userLocation ? '#007bff' : '#ccc',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: userLocation ? 'pointer' : 'not-allowed'
                    }}
                  >
                    🗺️ {t('viewDirections')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TourPlanner
