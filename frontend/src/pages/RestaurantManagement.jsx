import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { BASE_URL } from '../config'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png'
})

const DEFAULT_LOCATION = [10.7769, 106.7009]
const GEOCODE_RESULTS_LIMIT = 3
const GEOCODE_DEBOUNCE_MS = 350

function MapViewSync({ center }) {
  const map = useMap()

  useEffect(() => {
    if (Array.isArray(center) && center.length === 2) {
      map.setView(center, Math.max(map.getZoom(), 15), { animate: true })
    }
  }, [center, map])

  return null
}

function MapClickHandler({ onSelect }) {
  useMapEvents({
    click: (event) => {
      onSelect(event.latlng.lat, event.latlng.lng)
    }
  })

  return null
}

function MapSizeFix({ active }) {
  const map = useMap()

  useEffect(() => {
    if (!active) return

    const timer = window.setTimeout(() => {
      map.invalidateSize()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [active, map])

  return null
}

function RestaurantManagement({
  isHidden = false,
  loginPath = '/admin/login',
  authCheckPath = '/admin/check',
  isOwnerView = false
}) {
  const navigate = useNavigate()
  const [restaurants, setRestaurants] = useState([])
  const [tags, setTags] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTags, setSelectedTags] = useState([])
  const [sortBy, setSortBy] = useState('name')
  const [showModal, setShowModal] = useState(false)
  const [showTagModal, setShowTagModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [tagEditingRestaurant, setTagEditingRestaurant] = useState(null)
  const [editingTagIds, setEditingTagIds] = useState([])
  const [savingTags, setSavingTags] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [addressQuery, setAddressQuery] = useState('')
  const [geocodeResults, setGeocodeResults] = useState([])
  const [geocoding, setGeocoding] = useState(false)
  const [geocodeError, setGeocodeError] = useState('')
  const [pagination, setPagination] = useState({
    page: 1,
    perPage: 50,
    total: 0,
    totalPages: 0
  })
  const [formData, setFormData] = useState({
    name: '',
    lat: '',
    lng: '',
    avg_eat_time: '',
    poi_radius_km: '0.015',
    description: ''
  })
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 1200 : window.innerWidth))
  const mapPosition = [
    Number.parseFloat(formData.lat) || DEFAULT_LOCATION[0],
    Number.parseFloat(formData.lng) || DEFAULT_LOCATION[1]
  ]

  useEffect(() => {
    // Check authentication first
    fetch(`${BASE_URL}${authCheckPath}`, {
      credentials: 'include'
    })
      .then(res => {
        if (!res.ok) {
          navigate(loginPath, { replace: true })
          return null
        }
        return res.json()
      })
      .then(data => {
        if (data) {
          setIsAuthenticated(true)
          loadTags()
        }
      })
      .catch(err => {
        console.error('Auth check failed:', err)
        navigate(loginPath, { replace: true })
      })
  }, [authCheckPath, loginPath, navigate])

  // Load restaurants when authenticated or filters change
  useEffect(() => {
    if (isAuthenticated) {
      loadRestaurants()
    }
  }, [isAuthenticated, pagination.page, searchTerm, selectedTags, sortBy])

  useEffect(() => {
    // Reset về trang 1 khi thay đổi filter
    if (isAuthenticated) {
      setPagination(prev => ({ ...prev, page: 1 }))
    }
  }, [searchTerm, selectedTags, sortBy, isAuthenticated])

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const loadTags = () => {
    fetch(`${BASE_URL}/admin/tags`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => setTags(data))
      .catch(err => console.error('Error loading tags:', err))
  }

  const loadRestaurants = () => {
    if (!isAuthenticated) return
    
    setLoading(true)
    
    // Load hidden restaurants or active restaurants
    if (isHidden) {
      fetch(`${BASE_URL}/admin/restaurants/hidden`, {
        credentials: 'include'
      })
        .then(res => {
          if (!res.ok) throw new Error('Failed to load hidden restaurants')
          return res.json()
        })
        .then(data => {
          setRestaurants(data || [])
          setLoading(false)
        })
        .catch(err => {
          console.error('Error loading hidden restaurants:', err)
          setRestaurants([])
          setLoading(false)
        })
    } else {
      const params = new URLSearchParams()
      if (searchTerm) params.append('search', searchTerm)
      if (sortBy) params.append('sort', sortBy)
      params.append('page', pagination.page)
      params.append('per_page', pagination.perPage)
      selectedTags.forEach(tagId => params.append('tags', tagId))

      fetch(`${BASE_URL}/admin/restaurants/analytics?${params.toString()}`, {
        credentials: 'include'
      })
        .then(res => {
          if (!res.ok) throw new Error('Failed to load restaurants')
          return res.json()
        })
        .then(data => {
          setRestaurants(data.restaurants || [])
          setPagination(prev => ({
            ...prev,
            total: data.total,
            totalPages: data.total_pages
          }))
          setLoading(false)
        })
        .catch(err => {
          console.error('Error loading restaurants:', err)
          setRestaurants([])
          setLoading(false)
        })
    }
  }

  const handleFormChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  useEffect(() => {
    if (!showModal) {
      return undefined
    }

    const trimmedQuery = addressQuery.trim()

    if (trimmedQuery.length < 3) {
      setGeocodeResults([])
      setGeocodeError('')
      setGeocoding(false)
      return undefined
    }

    setGeocoding(true)
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${BASE_URL}/admin/geocode?q=${encodeURIComponent(trimmedQuery)}`, {
          credentials: 'include'
        })

        if (!response.ok) {
          throw new Error('Không thể tìm địa chỉ')
        }

        const data = await response.json()
        const results = Array.isArray(data.results) ? data.results : []
        setGeocodeResults(results.slice(0, GEOCODE_RESULTS_LIMIT))
        setGeocodeError(results.length === 0 ? 'Không tìm thấy kết quả phù hợp' : '')
      } catch (error) {
        console.error('Error geocoding address suggestions:', error)
        setGeocodeResults([])
        setGeocodeError(error.message || 'Không thể tìm địa chỉ')
      } finally {
        setGeocoding(false)
      }
    }, GEOCODE_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [addressQuery, showModal])

  const updateLocation = (lat, lng) => {
    const nextLat = Number(lat)
    const nextLng = Number(lng)

    if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
      return
    }

    setFormData((prev) => ({
      ...prev,
      lat: nextLat.toFixed(6),
      lng: nextLng.toFixed(6)
    }))
  }

  const handleGeocodeAddress = async () => {
    if (geocodeResults.length > 0) {
      handlePickGeocodeResult(geocodeResults[0])
    }
  }

  const handlePickGeocodeResult = (result) => {
    if (!result) return

    setAddressQuery(result.display_name || addressQuery)
    updateLocation(result.lat, result.lng)
    setGeocodeResults([])
    setGeocodeError('')
  }

  const handleMarkerDragEnd = (event) => {
    const marker = event.target
    const { lat, lng } = marker.getLatLng()
    updateLocation(lat, lng)
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    const data = {
      name: formData.name,
      lat: parseFloat(formData.lat),
      lng: parseFloat(formData.lng),
      avg_eat_time: parseInt(formData.avg_eat_time),
      poi_radius_km: parseFloat(formData.poi_radius_km),
      description: formData.description
    }

    const method = editingId ? 'PUT' : 'POST'
    const url = editingId
      ? `${BASE_URL}/admin/restaurants/${editingId}`
      : `${BASE_URL}/admin/restaurants`

    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    })
      .then(() => {
        setShowModal(false)
        setEditingId(null)
        setFormData({
          name: '',
          lat: '',
          lng: '',
          avg_eat_time: '',
          poi_radius_km: '0.015',
          description: ''
        })
        setAddressQuery('')
        setGeocodeResults([])
        setGeocodeError('')
        loadRestaurants()
      })
      .catch(err => console.error('Error saving restaurant:', err))
  }

  const handleAdd = () => {
    setEditingId(null)
    setFormData({
      name: '',
      lat: '',
      lng: '',
      avg_eat_time: '',
      poi_radius_km: '0.015',
      description: ''
    })
    setAddressQuery('')
    setGeocodeResults([])
    setGeocodeError('')
    setShowModal(true)
  }

  const handleEdit = (restaurant) => {
    setEditingId(restaurant.id)
    setFormData({
      name: restaurant.name,
      lat: restaurant.lat.toString(),
      lng: restaurant.lng.toString(),
      avg_eat_time: restaurant.avg_eat_time.toString(),
      poi_radius_km: (restaurant.poi_radius_km || 0.015).toString(),
      description: restaurant.description || ''
    })
    setAddressQuery('')
    setGeocodeResults([])
    setGeocodeError('')
    setShowModal(true)
  }

  const handleDelete = (id, name) => {
    if (isHidden) {
      // Permanent delete from hidden list - require name confirmation
      const confirmName = prompt(`⚠️ XÓA VĨNH VIỄN quán "${name}"?\n\nHành động này KHÔNG THỂ HOÀN TÁC!\nTất cả menu, hình ảnh, tags sẽ bị xóa.\n\nVui lòng nhập chính xác tên quán để xác nhận:`)
      
      if (!confirmName) {
        return // User cancelled
      }
      
      if (confirmName.trim() !== name.trim()) {
        alert('❌ Tên quán không khớp! Vui lòng nhập chính xác tên quán.')
        return
      }

      fetch(`${BASE_URL}/admin/restaurants/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ permanent: true })
      })
        .then(res => res.json())
        .then(data => {
          if (data.status === 'permanently_deleted') {
            alert('✅ Đã xóa vĩnh viễn!')
            loadRestaurants()
          }
        })
        .catch(err => console.error('Error permanently deleting restaurant:', err))
    } else {
      // Soft delete - move to hidden
      if (!confirm(`Ẩn quán "${name}"?\n\nQuán sẽ được chuyển vào mục "Quán đã ẩn" và có thể khôi phục sau.`)) {
        return
      }

      fetch(`${BASE_URL}/admin/restaurants/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ permanent: false })
      })
        .then(res => res.json())
        .then(data => {
          if (data.status === 'hidden') {
            alert('✅ Đã ẩn quán!')
            loadRestaurants()
          }
        })
        .catch(err => console.error('Error hiding restaurant:', err))
    }
  }

  const handleRestore = (id, name) => {
    if (!confirm(`Khôi phục quán "${name}"?\n\nQuán sẽ được hiển thị trở lại trong danh sách quán đang hoạt động.`)) {
      return
    }

    fetch(`${BASE_URL}/admin/restaurants/${id}/restore`, {
      method: 'PUT',
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        if (data.status === 'restored') {
          alert('✅ Đã khôi phục!')
          loadRestaurants()
        }
      })
      .catch(err => console.error('Error restoring restaurant:', err))
  }

  const handleCreateOrResetAccount = async (restaurant) => {
    const actionText = restaurant.has_account ? 'đặt lại mật khẩu' : 'tạo tài khoản'

    if (!confirm(`Bạn có chắc muốn ${actionText} cho quán "${restaurant.name}"?`)) {
      return
    }

    try {
      const response = await fetch(`${BASE_URL}/admin/restaurants/${restaurant.id}/account`, {
        method: 'POST',
        credentials: 'include'
      })

      if (!response.ok) {
        let backendMessage = `HTTP ${response.status}`
        try {
          const errorBody = await response.json()
          backendMessage = errorBody.error || backendMessage
        } catch {
          // Ignore JSON parse errors and fallback to status code.
        }
        throw new Error(backendMessage)
      }

      const data = await response.json()
      const message = [
        data.status === 'reset' ? '✅ Đã cấp lại mật khẩu thành công' : '✅ Đã tạo tài khoản thành công',
        `Quán: ${restaurant.name}`,
        `Username: ${data.username}`,
        `Password mới: ${data.password}`
      ].join('\n')

      alert(message)
      loadRestaurants()
    } catch (error) {
      console.error('Account action failed:', error)
      alert(`Có lỗi khi tạo/cấp lại tài khoản quán: ${error.message}`)
    }
  }

  const toggleTagFilter = (tagId) => {
    if (selectedTags.includes(tagId)) {
      setSelectedTags(selectedTags.filter(id => id !== tagId))
    } else {
      setSelectedTags([...selectedTags, tagId])
    }
  }

  const openTagEditor = (restaurant) => {
    setTagEditingRestaurant(restaurant)
    setEditingTagIds((restaurant.tags || []).map((tag) => tag.id))
    setShowTagModal(true)
  }

  const closeTagEditor = () => {
    setShowTagModal(false)
    setTagEditingRestaurant(null)
    setEditingTagIds([])
  }

  const toggleRestaurantTag = (tagId) => {
    setEditingTagIds((prev) => {
      if (prev.includes(tagId)) {
        return prev.filter((id) => id !== tagId)
      }
      return [...prev, tagId]
    })
  }

  const saveRestaurantTags = async () => {
    if (!tagEditingRestaurant) return

    const originalTagIds = (tagEditingRestaurant.tags || []).map((tag) => tag.id)
    const toAdd = editingTagIds.filter((id) => !originalTagIds.includes(id))
    const toRemove = originalTagIds.filter((id) => !editingTagIds.includes(id))

    setSavingTags(true)
    try {
      const requestWithValidation = async (url, method) => {
        const response = await fetch(url, {
          method,
          credentials: 'include'
        })
        if (!response.ok) {
          throw new Error(`Request failed: ${method} ${url}`)
        }
      }

      await Promise.all([
        ...toAdd.map((tagId) =>
          requestWithValidation(`${BASE_URL}/admin/restaurants/${tagEditingRestaurant.id}/tags/${tagId}`, 'POST')
        ),
        ...toRemove.map((tagId) =>
          requestWithValidation(`${BASE_URL}/admin/restaurants/${tagEditingRestaurant.id}/tags/${tagId}`, 'DELETE')
        )
      ])

      alert('✅ Đã cập nhật tags cho quán')
      closeTagEditor()
      loadRestaurants()
    } catch (err) {
      console.error('Error saving restaurant tags:', err)
      alert('❌ Không thể cập nhật tags cho quán')
    } finally {
      setSavingTags(false)
    }
  }

  // Show loading state while checking auth
  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center', color: '#64748b' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔄</div>
          <div>Đang kiểm tra đăng nhập...</div>
        </div>
      </div>
    )
  }

  const isMobile = viewportWidth <= 768

  const renderRestaurantActions = (restaurant, compact = false) => (
    <div style={{ ...styles.actionButtons, ...(compact ? styles.actionButtonsMobile : {}) }}>
      {isHidden ? (
        <>
          <button
            style={{ ...styles.btnRestore, ...(compact ? styles.compactActionButton : {}) }}
            onClick={() => handleRestore(restaurant.id, restaurant.name)}
            title="Khôi phục quán"
          >
            {compact ? '♻️' : '♻️ Khôi phục'}
          </button>
          <button
            style={{ ...styles.btnDeletePermanent, ...(compact ? styles.compactActionButton : {}) }}
            onClick={() => handleDelete(restaurant.id, restaurant.name)}
            title="XÓA VĨNH VIỄN - Không thể hoàn tác!"
          >
            {compact ? '⚠️' : '⚠️ Xóa vĩnh viễn'}
          </button>
        </>
      ) : (
        <>
          <button
            style={{ ...styles.btnEdit, ...(compact ? styles.compactActionButton : {}) }}
            onClick={() => handleEdit(restaurant)}
            title="Sửa quán"
          >
            ✏️
          </button>
          <button
            style={{ ...styles.btnTagAssign, ...(compact ? styles.compactActionButton : {}) }}
            onClick={() => openTagEditor(restaurant)}
            title="Gán tags cho quán"
          >
            {compact ? '🏷️' : '🏷️ Gán tags'}
          </button>
          {!isOwnerView && (
            <button
              style={{ ...(restaurant.has_account ? styles.btnResetPassword : styles.btnCreateAccount), ...(compact ? styles.compactActionButton : {}) }}
              onClick={() => handleCreateOrResetAccount(restaurant)}
              title={restaurant.has_account ? 'Quên mật khẩu - tạo mật khẩu mới' : 'Tạo tài khoản cho quán'}
            >
              {restaurant.has_account ? (compact ? '🔐' : '🔐 Quên mật khẩu') : (compact ? '👤' : '👤 Tạo tài khoản')}
            </button>
          )}
          {!isOwnerView && (
            <button
              style={{ ...styles.btnDelete, ...(compact ? styles.compactActionButton : {}) }}
              onClick={() => handleDelete(restaurant.id, restaurant.name)}
              title="Ẩn quán"
            >
              {compact ? '👻' : '👻 Ẩn'}
            </button>
          )}
        </>
      )}
    </div>
  )

  return (
    <div style={styles.container}>
      <div style={styles.heroPanel}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>
              {isHidden ? 'Archive Restaurants' : 'Restaurant Management'}
            </h1>
            <p style={styles.titleSubtitle}>
              {isHidden
                ? 'Quản lý danh sách quán đã ẩn và khôi phục theo nhu cầu vận hành.'
                : 'Điều phối danh mục quán, tài khoản vận hành và bộ chỉ số hiệu suất theo thời gian thực.'}
            </p>
          </div>
          {!isHidden && (
            <button style={styles.addButton} onClick={handleAdd}>
              ➕ Thêm quán mới
            </button>
          )}
        </div>
      </div>

      {/* Filters - only show for active restaurants */}
      {!isHidden && (
        <div style={styles.filtersCard}>
          <div style={styles.filterSection}>
            <label style={styles.filterLabel}>🔍 Tìm kiếm:</label>
            <input
              type="text"
              placeholder="Nhập tên quán..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={styles.searchInput}
            />
          </div>

        <div style={styles.filterSection}>
          <label style={styles.filterLabel}>🏷️ Lọc theo Tags:</label>
          <div style={styles.tagFilters}>
            {tags.map(tag => (
              <button
                key={tag.id}
                onClick={() => toggleTagFilter(tag.id)}
                style={{
                  ...styles.tagButton,
                  ...(selectedTags.includes(tag.id) ? styles.tagButtonActive : {}),
                  backgroundColor: selectedTags.includes(tag.id) ? tag.color : '#e2e8f0'
                }}
              >
                {tag.icon} {tag.name}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.filterSection}>
          <label style={styles.filterLabel}>📊 Sắp xếp theo:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={styles.sortSelect}
          >
            <option value="name">Tên quán</option>
            <option value="visit_count">Lượt ghé qua</option>
            <option value="avg_visit_duration">Thời gian ghé trung bình</option>
            <option value="avg_audio_duration">Thời gian nghe trung bình</option>
          </select>
        </div>
      </div>
      )}

      {/* Info message for hidden restaurants */}
      {isHidden && (
        <div style={styles.infoBox}>
          <p style={{ margin: 0, marginBottom: '8px' }}>
            <strong>ℹ️ Lưu ý:</strong>
          </p>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            <li>Các quán ở đây đã bị ẩn và không hiển thị cho user</li>
            <li>Có thể <strong>khôi phục</strong> quán bất kỳ lúc nào</li>
            <li><strong style={{ color: '#ef4444' }}>XÓA VĨNH VIỄN</strong> sẽ xóa toàn bộ dữ liệu liên quan (không thể hoàn tác)</li>
          </ul>
        </div>
      )}

      {/* Table */}
      <div style={styles.tableContainer}>
        {loading ? (
          <div style={styles.loadingContainer}>
            <div style={styles.loadingSpinner}></div>
            <p>Đang tải dữ liệu...</p>
          </div>
        ) : (
          <>
            {isMobile ? (
              <div style={styles.mobileCardList}>
                {restaurants.map(r => (
                  <div key={r.id} style={styles.mobileCard}>
                    <div style={styles.mobileCardHeader}>
                      <div style={styles.restaurantName}>{r.name}</div>
                      {!isHidden && <div style={styles.mobileStatBadge}>👁️ {r.visit_count || 0}</div>}
                    </div>

                    <div style={styles.restaurantTags}>
                      {r.tags?.map(tag => (
                        <span
                          key={tag.id}
                          style={{ ...styles.tagBadge, backgroundColor: tag.color }}
                        >
                          {tag.icon} {tag.name}
                        </span>
                      ))}
                    </div>

                    {!isHidden && (
                      <div style={styles.mobileStatsRow}>
                        <span>TG ghé: <strong>{r.avg_visit_duration || 0}</strong></span>
                        <span>TG nghe: <strong>{r.avg_audio_duration || 0}</strong></span>
                        <span>TG ăn: <strong>{r.avg_eat_time}</strong></span>
                      </div>
                    )}

                    {!isHidden && !isOwnerView && (
                      <div style={styles.mobileAccountRow}>
                        <div>
                          <strong>TK:</strong> {r.owner_username || 'Chưa có tài khoản'}
                        </div>
                        {r.has_account && (
                          <div>
                            <strong>PW:</strong> {r.owner_password_plain || 'Chưa có'}
                          </div>
                        )}
                      </div>
                    )}

                    {renderRestaurantActions(r, true)}
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.tableScrollWrap}>
                <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Tên quán</th>
                  {!isHidden && !isOwnerView && <th style={styles.th}>Tài khoản quán</th>}
                  {!isHidden && !isOwnerView && <th style={styles.th}>Password</th>}
                  {!isHidden && <th style={styles.th}>Lượt ghé</th>}
                  {!isHidden && <th style={styles.th}>TG ghé TB (phút)</th>}
                  {!isHidden && <th style={styles.th}>TG nghe TB (giây)</th>}
                  {!isHidden && <th style={styles.th}>TG ăn (phút)</th>}
                  <th style={styles.th}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {restaurants.map(r => (
                  <tr key={r.id} style={styles.tr}>
                    <td style={styles.td}>
                      <div style={styles.restaurantName}>{r.name}</div>
                      <div style={styles.restaurantTags}>
                        {r.tags?.map(tag => (
                          <span
                            key={tag.id}
                            style={{ ...styles.tagBadge, backgroundColor: tag.color }}
                          >
                            {tag.icon} {tag.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    {!isHidden && !isOwnerView && (
                      <td style={styles.td}>
                        {r.has_account ? (
                          <div>
                            <div style={styles.accountUsername}>{r.owner_username}</div>
                            <div style={styles.accountHint}>Đã có tài khoản</div>
                          </div>
                        ) : (
                          <span style={styles.noAccountText}>Chưa có tài khoản</span>
                        )}
                      </td>
                    )}
                    {!isHidden && !isOwnerView && (
                      <td style={styles.td}>
                        {r.has_account ? (
                          <span style={styles.passwordText}>{r.owner_password_plain || 'Chưa có'}</span>
                        ) : (
                          <span style={styles.noAccountText}>-</span>
                        )}
                      </td>
                    )}
                    {!isHidden && <td style={styles.td}>{r.visit_count || 0}</td>}
                    {!isHidden && <td style={styles.td}>{r.avg_visit_duration || 0}</td>}
                    {!isHidden && <td style={styles.td}>{r.avg_audio_duration || 0}</td>}
                    {!isHidden && <td style={styles.td}>{r.avg_eat_time}</td>}
                    <td style={styles.td}>{renderRestaurantActions(r, false)}</td>
                  </tr>
                ))}
              </tbody>
                </table>
              </div>
            )}

              {/* Pagination Controls */}
            {!isHidden && pagination.totalPages > 1 && (
              <div style={styles.paginationContainer}>
                <button
                  style={{
                    ...styles.paginationButton,
                    ...(pagination.page === 1 ? styles.paginationButtonDisabled : {})
                  }}
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                  disabled={pagination.page === 1}
                >
                  ← Trước
                </button>
                
                <span style={styles.paginationInfo}>
                  Trang {pagination.page} / {pagination.totalPages} 
                  <span style={{ marginLeft: '10px', color: '#64748b' }}>
                    (Tổng {pagination.total} quán)
                  </span>
                </span>
                
                <button
                  style={{
                    ...styles.paginationButton,
                    ...(pagination.page === pagination.totalPages ? styles.paginationButtonDisabled : {})
                  }}
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                  disabled={pagination.page === pagination.totalPages}
                >
                  Sau →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h2 style={styles.modalTitle}>
              {editingId ? '✏️ Sửa quán' : '➕ Thêm quán mới'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Tên quán:</label>
                <input
                  name="name"
                  value={formData.name}
                  onChange={handleFormChange}
                  style={styles.input}
                  required
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Địa chỉ:</label>
                <div style={styles.addressSearchRow}>
                  <div style={styles.addressInputWrap}>
                    <input
                      value={addressQuery}
                      onChange={(e) => setAddressQuery(e.target.value)}
                      onFocus={() => {
                        if (addressQuery.trim().length >= 3 && geocodeResults.length === 0) {
                          handleGeocodeAddress()
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          if (geocodeResults.length > 0) {
                            handlePickGeocodeResult(geocodeResults[0])
                          } else {
                            handleGeocodeAddress()
                          }
                        }
                      }}
                      placeholder="Nhập tên đường, quận, địa điểm..."
                      style={{ ...styles.input, ...styles.addressInput }}
                      autoComplete="off"
                    />
                    {showModal && geocoding && <div style={styles.searchingHint}>Đang gợi ý vị trí...</div>}
                    {geocodeResults.length > 0 && (
                      <div style={styles.suggestionDropdown}>
                        {geocodeResults.map((result, index) => (
                          <button
                            key={`${result.lat}-${result.lng}-${index}`}
                            type="button"
                            style={styles.suggestionItem}
                            onClick={() => handlePickGeocodeResult(result)}
                          >
                            <div style={styles.suggestionTitle}>Gợi ý {index + 1}</div>
                            <div style={styles.suggestionText}>{result.display_name}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {geocodeError && <div style={styles.geocodeError}>{geocodeError}</div>}
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Chọn vị trí trên bản đồ:</label>
                <div style={styles.mapWrap}>
                  <MapContainer
                    center={mapPosition}
                    zoom={16}
                    scrollWheelZoom={true}
                    style={styles.mapContainer}
                    className="restaurant-location-map"
                  >
                    <MapSizeFix active={showModal} />
                    <MapViewSync center={mapPosition} />
                    <MapClickHandler onSelect={updateLocation} />
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                      url='https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
                    />
                    <Marker
                      position={mapPosition}
                      draggable={true}
                      eventHandlers={{ dragend: handleMarkerDragEnd }}
                    />
                  </MapContainer>
                </div>
                <div style={styles.mapHint}>
                  Kéo thả pin hoặc click trực tiếp lên bản đồ để cập nhật latitude và longitude.
                </div>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Tọa độ đã chọn:</label>
                <div style={styles.coordinateSummary}>
                  <div>
                    <div style={styles.coordinateLabel}>Latitude</div>
                    <div style={styles.coordinateValue}>{formData.lat || 'Chưa chọn'}</div>
                  </div>
                  <div>
                    <div style={styles.coordinateLabel}>Longitude</div>
                    <div style={styles.coordinateValue}>{formData.lng || 'Chưa chọn'}</div>
                  </div>
                </div>
              </div>
              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>TG ăn (phút):</label>
                  <input
                    name="avg_eat_time"
                    type="number"
                    value={formData.avg_eat_time}
                    onChange={handleFormChange}
                    style={styles.input}
                    required
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Bán kính POI (km):</label>
                  <input
                    name="poi_radius_km"
                    type="number"
                    step="0.001"
                    min="0.001"
                    max="1"
                    value={formData.poi_radius_km}
                    onChange={handleFormChange}
                    style={styles.input}
                    required
                  />
                </div>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Mô tả:</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleFormChange}
                  style={styles.textarea}
                  rows="4"
                />
              </div>
              <div style={styles.modalActions}>
                <button type="button" style={styles.btnCancel} onClick={() => setShowModal(false)}>
                  ❌ Hủy
                </button>
                <button type="submit" style={styles.btnSave}>
                  💾 {editingId ? 'Cập nhật' : 'Thêm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTagModal && tagEditingRestaurant && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h2 style={styles.modalTitle}>🏷️ Gán tags cho quán</h2>
            <p style={styles.tagModalSubtitle}><strong>{tagEditingRestaurant.name}</strong></p>

            <div style={styles.tagPickerWrap}>
              {tags.length === 0 && <div>Chưa có tag nào. Vui lòng tạo tag trước.</div>}
              {tags.map((tag) => {
                const isSelected = editingTagIds.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleRestaurantTag(tag.id)}
                    style={{
                      ...styles.tagPickerChip,
                      ...(isSelected ? styles.tagPickerChipActive : {}),
                      borderColor: tag.color || '#64748b',
                      backgroundColor: isSelected ? (tag.color || '#2563eb') : '#fff'
                    }}
                  >
                    {tag.icon || '🏷️'} {tag.name}
                  </button>
                )
              })}
            </div>

            <div style={styles.modalActions}>
              <button type="button" style={styles.btnCancel} onClick={closeTagEditor} disabled={savingTags}>
                ❌ Hủy
              </button>
              <button type="button" style={styles.btnSave} onClick={saveRestaurantTags} disabled={savingTags}>
                {savingTags ? 'Đang lưu...' : '💾 Lưu tags'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  container: {
    padding: '32px',
    maxWidth: '1400px',
    margin: '0 auto',
    animation: 'fadeInUp 0.45s ease'
  },
  heroPanel: {
    borderRadius: '18px',
    padding: '18px 20px',
    marginBottom: '20px',
    border: '1px solid rgba(168, 193, 226, 0.55)',
    background:
      'linear-gradient(144deg, rgba(241, 248, 255, 0.9) 0%, rgba(225, 236, 251, 0.76) 65%, rgba(227, 248, 255, 0.7) 100%)',
    boxShadow: '0 12px 26px rgba(22, 42, 73, 0.11)'
  },
  header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '16px',
      flexWrap: 'wrap'
  },
  title: {
    fontSize: '32px',
    fontWeight: '760',
    color: '#10213c',
    margin: 0
  },
  titleSubtitle: {
    margin: '8px 0 0',
    color: '#486380',
    fontSize: '14px',
    maxWidth: '760px',
    lineHeight: '1.45'
  },
  addButton: {
      whiteSpace: 'nowrap',
      padding: '12px 24px',
    background: 'linear-gradient(130deg, #0d5f5f 0%, #1e5f88 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'transform 0.2s ease, filter 0.2s ease',
    boxShadow: '0 14px 24px rgba(20, 78, 98, 0.28)'
  },
  filtersCard: {
    background: 'linear-gradient(165deg, rgba(255,255,255,0.97) 0%, rgba(245, 250, 255, 0.92) 100%)',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '24px',
    boxShadow: '0 14px 30px rgba(20, 35, 58, 0.1)',
    border: '1px solid rgba(198, 214, 234, 0.75)'
  },
  filterSection: {
    marginBottom: '20px'
  },
  filterLabel: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '700',
    color: '#2e3f59',
    marginBottom: '8px'
  },
  searchInput: {
    width: '100%',
    padding: '11px 13px',
    border: '1px solid #c9d5e5',
    borderRadius: '10px',
    fontSize: '14px',
    backgroundColor: 'rgba(255, 255, 255, 0.9)'
  },
  tagFilters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px'
  },
  tagButton: {
    padding: '7px 12px',
    border: 'none',
    borderRadius: '9px',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    color: '#1e2f49',
    fontWeight: '500'
  },
  tagButtonActive: {
    color: 'white',
    fontWeight: '600',
    transform: 'scale(1.05)'
  },
  sortSelect: {
    padding: '10px 12px',
    border: '1px solid #c9d5e5',
    borderRadius: '10px',
    fontSize: '14px',
    backgroundColor: 'rgba(255,255,255,0.9)',
    cursor: 'pointer'
  },
  tableContainer: {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248, 251, 255, 0.96) 100%)',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 18px 38px rgba(20, 35, 58, 0.16), 0 0 0 1px rgba(211, 225, 244, 0.5) inset',
    border: '1px solid rgba(188, 208, 233, 0.95)',
    padding: '12px 10px 14px'
  },
  table: {
    width: 'calc(100% - 14px)',
    margin: '0 auto',
    borderCollapse: 'separate',
    borderSpacing: 0,
    borderRadius: '14px',
    overflow: 'hidden',
    border: '1px solid #c5d9f3',
    boxShadow: '0 10px 22px rgba(20, 50, 92, 0.12)'
  },
  tableScrollWrap: {
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    margin: '0 -10px',
    padding: '0 10px'
  },
  tableScrollWrapMobile: {
    margin: '0 -6px',
    padding: '0 6px'
  },
  mobileCardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  mobileCard: {
    border: '1px solid #d6e3f5',
    borderRadius: '12px',
    padding: '12px',
    background: 'linear-gradient(180deg, #ffffff 0%, #f6faff 100%)'
  },
  mobileCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    marginBottom: '8px'
  },
  mobileStatBadge: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#1d4ed8',
    background: '#e8f0ff',
    borderRadius: '999px',
    padding: '4px 8px',
    whiteSpace: 'nowrap'
  },
  mobileStatsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px 14px',
    marginTop: '8px',
    fontSize: '13px',
    color: '#334155'
  },
  mobileAccountRow: {
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px dashed #d7e3f4',
    fontSize: '13px',
    color: '#334155',
    display: 'grid',
    gap: '4px'
  },
  th: {
    padding: '16px',
    textAlign: 'left',
    borderBottom: '2px solid #cfe0f4',
    background: 'linear-gradient(180deg, #fafdff 0%, #eaf3ff 100%)',
    fontWeight: '700',
    color: '#34496a',
    fontSize: '13px',
    letterSpacing: '0.2px'
  },
  tr: {
    borderBottom: '1px solid #e8eef8',
    transition: 'background-color 0.2s'
  },
  td: {
    padding: '16px',
    fontSize: '14px',
    color: '#20324e',
    backgroundColor: 'rgba(255, 255, 255, 0.86)'
  },
  tdMobile: {
    padding: '12px 10px',
    fontSize: '13px',
    whiteSpace: 'nowrap'
  },
  restaurantName: {
    fontWeight: '600',
    marginBottom: '4px'
  },
  restaurantTags: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap'
  },
  tagBadge: {
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    color: 'white',
    fontWeight: '500'
  },
  accountUsername: {
    fontWeight: '700',
    color: '#1d4ed8',
    marginBottom: '4px'
  },
  accountHint: {
    fontSize: '12px',
    color: '#64748b'
  },
  noAccountText: {
    color: '#94a3b8'
  },
  passwordText: {
    fontFamily: 'Consolas, monospace',
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: '0.4px'
  },
  actionButtons: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap'
  },
  actionButtonsMobile: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(42px, 1fr))',
    width: '100%',
    gap: '8px'
  },
  compactActionButton: {
    height: '42px',
    width: '100%',
    minWidth: '42px',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    lineHeight: 1
  },
  btnEdit: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #d48619 0%, #f59e0b 100%)',
    color: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600'
  },
  btnTagAssign: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
    color: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600'
  },
  btnCreateAccount: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
    color: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600'
  },
  btnResetPassword: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #24517c 0%, #1f6fa4 100%)',
    color: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600'
  },
  btnDelete: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #cb5a1a 0%, #f97316 100%)',
    color: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600'
  },
  btnRestore: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#10b981',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600'
  },
  btnDeletePermanent: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#dc2626',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600'
  },
  infoBox: {
    background: 'linear-gradient(140deg, #fff7db 0%, #ffefbe 100%)',
    border: '1px solid #f2c562',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '20px',
    color: '#7a4617',
    fontSize: '14px'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    color: '#64748b'
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #e2e8f0',
    borderTop: '4px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px'
  },
  paginationContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    padding: '20px',
    borderTop: '1px solid #dce6f3',
    background: 'linear-gradient(180deg, #f8fbff 0%, #eef4fc 100%)'
  },
  paginationButton: {
    padding: '8px 16px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    backgroundColor: 'white',
    color: '#1e293b',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  paginationButtonDisabled: {
    backgroundColor: '#f1f5f9',
    color: '#94a3b8',
    cursor: 'not-allowed',
    opacity: 0.6
  },
  paginationInfo: {
    fontSize: '14px',
    color: '#1e293b',
    fontWeight: '500'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,18,34,0.56)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalContent: {
    background: 'linear-gradient(160deg, #ffffff 0%, #f4f8ff 100%)',
    borderRadius: '16px',
    padding: '32px',
    maxWidth: '600px',
    width: '90%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 26px 48px rgba(9, 18, 38, 0.28)',
    border: '1px solid rgba(198, 214, 234, 0.75)'
  },
  tagModalSubtitle: {
    margin: '0 0 12px',
    color: '#334155'
  },
  tagPickerWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '16px'
  },
  tagPickerChip: {
    padding: '8px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: '999px',
    background: '#fff',
    color: '#1e293b',
    cursor: 'pointer',
    fontWeight: '600'
  },
  tagPickerChipActive: {
    color: '#fff'
  },
  modalTitle: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: '24px'
  },
  formGroup: {
    marginBottom: '20px',
    flex: 1
  },
  addressSearchRow: {
    display: 'flex',
    gap: '10px',
    alignItems: 'stretch',
    flexWrap: 'wrap'
  },
  addressInputWrap: {
    position: 'relative',
    flex: '1 1 320px'
  },
  addressInput: {
    margin: 0
  },
  geocodeError: {
    marginTop: '8px',
    color: '#b42318',
    fontSize: '13px'
  },
  searchingHint: {
    marginTop: '8px',
    fontSize: '12px',
    color: '#64748b'
  },
  suggestionDropdown: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: 0,
    right: 0,
    zIndex: 1200,
    display: 'grid',
    gap: '6px',
    maxHeight: '280px',
    overflowY: 'auto',
    padding: '10px',
    border: '1px solid #cfdcf0',
    borderRadius: '14px',
    background: 'rgba(255,255,255,0.98)',
    boxShadow: '0 18px 34px rgba(15, 23, 42, 0.12)'
  },
  suggestionItem: {
    textAlign: 'left',
    border: '1px solid #d7e2f0',
    background: '#f8fbff',
    color: '#1b2a41',
    borderRadius: '12px',
    padding: '10px 12px'
  },
  suggestionTitle: {
    fontSize: '11px',
    fontWeight: '800',
    color: '#155f6e',
    marginBottom: '3px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  },
  suggestionText: {
    fontSize: '13px',
    lineHeight: '1.4',
    color: '#334155'
  },
  formRow: {
    display: 'flex',
    gap: '16px'
  },
  coordinateSummary: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '12px',
    padding: '14px',
    border: '1px solid #d7e2f0',
    borderRadius: '10px',
    backgroundColor: '#f8fbff'
  },
  coordinateLabel: {
    fontSize: '12px',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#64748b',
    marginBottom: '4px'
  },
  coordinateValue: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#0f172a'
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#475569',
    marginBottom: '8px'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '14px'
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '14px',
    resize: 'vertical'
  },
  mapWrap: {
    border: '1px solid rgba(143, 167, 202, 0.5)',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 20px rgba(16, 36, 64, 0.08)',
    minHeight: '320px',
    width: '100%'
  },
  mapContainer: {
    height: '320px',
    width: '100%',
    minHeight: '320px'
  },
  mapHint: {
    marginTop: '8px',
    fontSize: '12px',
    color: '#61738c'
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '24px'
  },
  btnCancel: {
    padding: '10px 20px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    backgroundColor: 'white',
    color: '#475569',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  btnSave: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#3b82f6',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  }
}

export default RestaurantManagement






