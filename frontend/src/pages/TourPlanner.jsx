import { useState, useEffect } from 'react'
import { BASE_URL } from '../config'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from '../hooks/useTranslation'
import { useAppLanguage } from '../hooks/useAppLanguage'

function TourPlanner() {
  const navigate = useNavigate()
  const { language, setLanguage } = useAppLanguage()
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
      } catch (locError) {
        // Không lấy được GPS, dùng vị trí cũ (nếu có)
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

  const firstTourCardStyle = {
    ...plannerStyles.tourCard,
    ...plannerStyles.tourCardPrimary
  }

  return (
    <div style={plannerStyles.page}>
      <style>{`
        .tour-planner-root input,
        .tour-planner-root select {
          width: 100%;
          border: 1px solid #cad8ec;
          border-radius: 12px;
          background: #ffffff;
          color: #16314f;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .tour-planner-root input:focus,
        .tour-planner-root select:focus {
          border-color: #2f7e8f;
          box-shadow: 0 0 0 3px rgba(47, 126, 143, 0.16);
        }

        @media (max-width: 860px) {
          .tour-planner-header {
            display: grid;
            grid-template-columns: auto 1fr;
            grid-template-areas:
              'home title'
              'language language';
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
          }

          .tour-planner-home-btn {
            grid-area: home;
          }

          .tour-planner-language {
            grid-area: language;
            justify-self: stretch;
            width: 100%;
            max-width: none;
            min-width: 0;
          }

          .tour-planner-title {
            grid-area: title;
            margin-top: 0;
            font-size: clamp(18px, 4.8vw, 24px);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .tour-planner-settings-grid {
            grid-template-columns: 1fr;
          }

          .tour-planner-tour-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 420px) {
          .tour-planner-header {
            gap: 8px;
          }

          .tour-planner-home-btn {
            width: 42px !important;
            height: 42px !important;
            min-width: 42px !important;
            font-size: 18px !important;
          }

          .tour-planner-language {
            font-size: 12px !important;
            padding: 10px 11px !important;
          }

          .tour-planner-title {
            font-size: clamp(17px, 4.6vw, 20px);
          }
        }
      `}</style>

      <div className="tour-planner-root" style={plannerStyles.shell}>
        <header className="tour-planner-header" style={plannerStyles.header}>
          <button className="tour-planner-home-btn" onClick={() => navigate('/customer')} style={plannerStyles.backButton} title="NearBite Home">
            🍜
          </button>
          <h1 className="tour-planner-title" style={plannerStyles.title}>🗺️ {t('tourPlanning')}</h1>
          <select className="tour-planner-language" value={language} onChange={(e) => setLanguage(e.target.value)} style={plannerStyles.languageSelect}>
            {languages.map(lang => (
              <option key={lang.code} value={lang.code}>{lang.label}</option>
            ))}
          </select>
        </header>

        <main style={plannerStyles.content}>
          <section style={plannerStyles.formCard}>
            <div style={plannerStyles.formHeadingWrap}>
              <h2 style={plannerStyles.formHeading}>📝 {t('tourInfo')}</h2>
              <span style={plannerStyles.formBadge}>{tours.length > 0 ? `${tours.length} ${t('tour')}` : t('tourPlanning')}</span>
            </div>

            <div className="tour-planner-settings-grid" style={plannerStyles.settingsGrid}>
              <div style={plannerStyles.fieldCard}>
                <label style={plannerStyles.label}>⏱️ {t('totalTime')} ({t('minutes')})</label>
                <input
                  type="number"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(parseInt(e.target.value, 10) || 0)}
                  style={plannerStyles.input}
                  min="30"
                  max="480"
                />
                <small style={plannerStyles.hint}>{t('timeRangeHint')}</small>
              </div>

              <div style={plannerStyles.fieldCard}>
                <label style={plannerStyles.label}>💰 {t('budget')}</label>
                <input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(parseInt(e.target.value, 10) || 0)}
                  style={plannerStyles.input}
                  min="50000"
                  step="50000"
                />
                <small style={plannerStyles.hint}>{formatMoney(budget)}</small>
              </div>
            </div>

            <div style={plannerStyles.fieldBlock}>
              <label style={plannerStyles.label}>🏷️ {t('selectTags')}</label>
              <div style={plannerStyles.tagWrap}>
                {tags && tags.length > 0 ? tags.map(tag => {
                  const active = selectedTags.includes(tag.id)
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      style={{
                        ...plannerStyles.tagButton,
                        borderColor: tag.color || '#9aaec8',
                        color: active ? '#ffffff' : (tag.color || '#345076'),
                        background: active ? (tag.color || '#2f7e8f') : '#f8fbff'
                      }}
                    >
                      {tag.icon} {tag.name}
                    </button>
                  )
                }) : (
                  <div style={plannerStyles.placeholderText}>{translationLoading ? t('loading') : t('noTagsSelected')}</div>
                )}
              </div>
              <small style={plannerStyles.hint}>
                {selectedTags.length > 0 ? t('selectedTags', { count: selectedTags.length }) : t('noTagsSelected')}
              </small>
            </div>

            <button onClick={handlePlanTour} disabled={loading} style={{ ...plannerStyles.submitButton, ...(loading ? plannerStyles.submitButtonLoading : {}) }}>
              {loading ? `⏳ ${t('planning')}` : `🚀 ${t('planTourNow')}`}
            </button>
          </section>

          {error && (
            <div style={plannerStyles.errorCard}>
              ⚠️ {t('connectionError')}: {error}
            </div>
          )}

          {tours.length > 0 && (
            <section>
              <h2 style={plannerStyles.tourTitle}>✨ {t('tourSuggestions', { count: tours.length })}</h2>
              <div className="tour-planner-tour-grid" style={plannerStyles.tourGrid}>
                {tours.map((tour, idx) => (
                  <article key={idx} style={idx === 0 ? firstTourCardStyle : plannerStyles.tourCard}>
                    <div style={plannerStyles.tourCardHeader}>
                      <h3 style={plannerStyles.tourCardTitle}>
                        {idx === 0 && '👑 '}
                        {t('tour')} #{idx + 1}
                      </h3>
                      <span style={{ ...plannerStyles.strategyBadge, ...(idx === 0 ? plannerStyles.strategyBadgePrimary : {}) }}>
                        {tour.strategy === 'best_score' && t('bestScore')}
                        {tour.strategy === 'nearest' && t('nearest')}
                        {tour.strategy === 'cheapest' && t('cheapest')}
                      </span>
                    </div>

                    <div style={plannerStyles.summaryCard}>
                      <div style={plannerStyles.summaryRow}>
                        <span>🕐 {t('time')}</span>
                        <strong>{tour.total_time} {t('minutes')}</strong>
                      </div>
                      <div style={plannerStyles.summaryRow}>
                        <span>💵 {t('cost')}</span>
                        <strong style={plannerStyles.costValue}>{formatMoney(tour.total_cost)}</strong>
                      </div>
                      <div style={plannerStyles.summaryRow}>
                        <span>🍽️ {t('restaurants')}</span>
                        <strong>{t('restaurant_count', { count: tour.num_stops })}</strong>
                      </div>
                    </div>

                    <div style={plannerStyles.restaurantList}>
                      {tour.restaurants.map((restaurant, rIdx) => (
                        <div key={rIdx} style={plannerStyles.restaurantCard}>
                          <div style={plannerStyles.restaurantHeader}>
                            <span style={plannerStyles.stopBadge}>{rIdx + 1}</span>
                            <strong style={plannerStyles.restaurantName}>{restaurant.name}</strong>
                            <span style={plannerStyles.priceText}>{formatMoney(restaurant.avg_price)}</span>
                          </div>

                          {restaurant.tags && restaurant.tags.length > 0 && (
                            <div style={plannerStyles.restaurantTagWrap}>
                              {restaurant.tags.map(tag => (
                                <span key={tag.id} style={{ ...plannerStyles.restaurantTag, background: tag.color || '#4d698a' }}>
                                  {tag.icon} {tag.name}
                                </span>
                              ))}
                            </div>
                          )}

                          {restaurant.images && restaurant.images.length > 0 && (
                            <div style={plannerStyles.imageStrip}>
                              {restaurant.images.map((img, imgIdx) => (
                                <img
                                  key={imgIdx}
                                  src={img.image_url}
                                  alt={restaurant.name}
                                  style={plannerStyles.imageThumb}
                                  onError={(e) => { e.target.style.display = 'none' }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => openTourInMaps(tour)}
                      disabled={!userLocation}
                      style={{ ...plannerStyles.directionButton, ...(!userLocation ? plannerStyles.directionButtonDisabled : {}) }}
                    >
                      🗺️ {t('viewDirections')}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

const plannerStyles = {
  page: {
    minHeight: '100vh',
    background: 'radial-gradient(900px 380px at 12% -8%, rgba(53, 130, 165, 0.18), transparent 68%), radial-gradient(900px 360px at 90% 0%, rgba(21, 113, 89, 0.14), transparent 72%), linear-gradient(160deg, #eef4fb 0%, #e7eff8 100%)',
    padding: '14px'
  },
  shell: {
    maxWidth: '1240px',
    margin: '0 auto'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '12px 14px',
    borderRadius: '16px',
    border: '1px solid rgba(156, 183, 214, 0.64)',
    background: 'linear-gradient(130deg, rgba(15, 38, 66, 0.94) 0%, rgba(21, 77, 109, 0.88) 100%)',
    boxShadow: '0 20px 34px rgba(17, 31, 57, 0.2)'
  },
  backButton: {
    width: '46px',
    height: '46px',
    minWidth: '46px',
    borderRadius: '12px',
    border: '1px solid rgba(177, 211, 240, 0.55)',
    background: 'linear-gradient(135deg, #1e5e83 0%, #2a8ea1 100%)',
    color: '#f4fbff',
    fontSize: '20px',
    cursor: 'pointer',
    margin: 0,
    padding: 0,
    display: 'grid',
    placeItems: 'center'
  },
  title: {
    margin: 0,
    flex: 1,
    color: '#eaf7ff',
    fontSize: 'clamp(20px, 3vw, 28px)',
    fontWeight: 800,
    letterSpacing: '-0.02em'
  },
  languageSelect: {
    minWidth: '130px',
    maxWidth: '180px',
    margin: 0,
    padding: '11px 12px',
    borderRadius: '12px',
    border: '1px solid rgba(181, 209, 235, 0.7)',
    background: '#f8fcff',
    fontWeight: 600,
    fontSize: '13px',
    cursor: 'pointer'
  },
  content: {
    marginTop: '16px',
    display: 'grid',
    gap: '18px'
  },
  formCard: {
    background: 'linear-gradient(165deg, rgba(255,255,255,0.96) 0%, rgba(246, 251, 255, 0.93) 100%)',
    borderRadius: '18px',
    border: '1px solid rgba(189, 209, 232, 0.9)',
    boxShadow: '0 18px 34px rgba(20, 43, 77, 0.12)',
    padding: '18px'
  },
  formHeadingWrap: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '14px'
  },
  formHeading: {
    margin: 0,
    color: '#16314f',
    fontSize: '22px',
    fontWeight: 780
  },
  formBadge: {
    borderRadius: '999px',
    padding: '6px 10px',
    fontSize: '12px',
    fontWeight: 700,
    color: '#1f4f69',
    background: '#e5f2fc',
    border: '1px solid #b8d2eb'
  },
  settingsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '12px',
    marginBottom: '12px'
  },
  fieldCard: {
    borderRadius: '14px',
    padding: '12px',
    border: '1px solid #d7e4f2',
    background: '#f9fcff'
  },
  fieldBlock: {
    borderRadius: '14px',
    padding: '12px',
    border: '1px solid #d7e4f2',
    background: '#f9fcff',
    marginBottom: '14px'
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    color: '#1f3c5f',
    fontWeight: 700,
    fontSize: '14px'
  },
  input: {
    margin: 0,
    padding: '11px 12px',
    fontSize: '15px'
  },
  hint: {
    marginTop: '8px',
    display: 'inline-block',
    color: '#5f7695',
    fontSize: '12px'
  },
  tagWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px'
  },
  tagButton: {
    margin: 0,
    padding: '8px 12px',
    borderRadius: '999px',
    border: '1px solid #9aaec8',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  placeholderText: {
    fontSize: '13px',
    color: '#647b99'
  },
  submitButton: {
    width: '100%',
    margin: 0,
    padding: '14px',
    borderRadius: '12px',
    border: '1px solid rgba(118, 204, 194, 0.7)',
    background: 'linear-gradient(135deg, #1f8e83 0%, #2fbc9a 100%)',
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 14px 24px rgba(32, 109, 102, 0.25)'
  },
  submitButtonLoading: {
    background: '#9aa9b8',
    borderColor: '#9aa9b8',
    cursor: 'not-allowed',
    boxShadow: 'none'
  },
  errorCard: {
    borderRadius: '12px',
    border: '1px solid #f1aab5',
    background: '#fff3f5',
    color: '#8c1b2f',
    fontWeight: 600,
    padding: '12px 14px'
  },
  tourTitle: {
    marginTop: 0,
    marginBottom: '12px',
    fontSize: '22px',
    color: '#18324f'
  },
  tourGrid: {
    display: 'grid',
    gap: '14px',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))'
  },
  tourCard: {
    background: 'linear-gradient(165deg, rgba(255,255,255,0.97) 0%, rgba(247, 251, 255, 0.93) 100%)',
    borderRadius: '16px',
    border: '1px solid #d4e3f4',
    boxShadow: '0 14px 28px rgba(20, 43, 77, 0.12)',
    padding: '16px'
  },
  tourCardPrimary: {
    border: '1px solid #8ddcc9',
    boxShadow: '0 16px 30px rgba(23, 122, 102, 0.18), 0 0 0 1px rgba(141, 220, 201, 0.3) inset'
  },
  tourCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    marginBottom: '10px'
  },
  tourCardTitle: {
    margin: 0,
    fontSize: '18px',
    color: '#17324f'
  },
  strategyBadge: {
    borderRadius: '999px',
    padding: '5px 10px',
    fontSize: '11px',
    fontWeight: 800,
    background: '#e2ecfa',
    color: '#2a4f7a'
  },
  strategyBadgePrimary: {
    background: '#dff7ef',
    color: '#1c7a60'
  },
  summaryCard: {
    borderRadius: '12px',
    background: '#f3f8ff',
    border: '1px solid #d7e5f4',
    padding: '10px 12px',
    marginBottom: '10px'
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '13px',
    color: '#365271',
    marginBottom: '4px'
  },
  costValue: {
    color: '#197a5b'
  },
  restaurantList: {
    display: 'grid',
    gap: '8px',
    marginBottom: '12px'
  },
  restaurantCard: {
    borderRadius: '12px',
    border: '1px solid #dbe7f5',
    background: '#fbfdff',
    padding: '10px'
  },
  restaurantHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px'
  },
  stopBadge: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    fontSize: '12px',
    color: '#fff',
    fontWeight: 800,
    background: 'linear-gradient(135deg, #2f6f9d 0%, #2f9d92 100%)'
  },
  restaurantName: {
    flex: 1,
    color: '#1d3d5e',
    fontSize: '14px'
  },
  priceText: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#486180'
  },
  restaurantTagWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '5px',
    marginBottom: '8px'
  },
  restaurantTag: {
    padding: '3px 8px',
    borderRadius: '999px',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 700
  },
  imageStrip: {
    display: 'flex',
    gap: '6px',
    overflowX: 'auto',
    paddingBottom: '2px'
  },
  imageThumb: {
    width: '54px',
    height: '54px',
    minWidth: '54px',
    objectFit: 'cover',
    borderRadius: '8px',
    border: '1px solid #d6e4f4'
  },
  directionButton: {
    width: '100%',
    margin: 0,
    padding: '11px 12px',
    borderRadius: '10px',
    border: '1px solid rgba(133, 172, 214, 0.72)',
    background: 'linear-gradient(135deg, #2b67aa 0%, #3f9fd1 100%)',
    color: '#fff',
    fontWeight: 700,
    fontSize: '14px',
    cursor: 'pointer'
  },
  directionButtonDisabled: {
    background: '#9bafc4',
    borderColor: '#9bafc4',
    cursor: 'not-allowed'
  }
}

export default TourPlanner
