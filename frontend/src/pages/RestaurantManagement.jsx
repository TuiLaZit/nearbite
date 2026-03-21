import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BASE_URL } from '../config'

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
  const [editingId, setEditingId] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(false)
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
                    <td style={styles.td}>
                      <div style={styles.actionButtons}>
                        {isHidden ? (
                          <>
                            <button 
                              style={styles.btnRestore} 
                              onClick={() => handleRestore(r.id, r.name)}
                              title="Khôi phục quán"
                            >
                              ♻️ Khôi phục
                            </button>
                            <button 
                              style={styles.btnDeletePermanent} 
                              onClick={() => handleDelete(r.id, r.name)}
                              title="XÓA VĨNH VIỄN - Không thể hoàn tác!"
                            >
                              ⚠️ Xóa vĩnh viễn
                            </button>
                          </>
                        ) : (
                          <>
                            <button style={styles.btnEdit} onClick={() => handleEdit(r)}>✏️</button>
                            {!isOwnerView && (
                              <button
                                style={r.has_account ? styles.btnResetPassword : styles.btnCreateAccount}
                                onClick={() => handleCreateOrResetAccount(r)}
                                title={r.has_account ? 'Quên mật khẩu - tạo mật khẩu mới' : 'Tạo tài khoản cho quán'}
                              >
                                {r.has_account ? '🔐 Quên mật khẩu' : '👤 Tạo tài khoản'}
                              </button>
                            )}
                            {!isOwnerView && (
                              <button 
                                style={styles.btnDelete} 
                                onClick={() => handleDelete(r.id, r.name)}
                                title="Ẩn quán"
                              >
                                👻 Ẩn
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

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
              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Latitude:</label>
                  <input
                    name="lat"
                    type="number"
                    step="any"
                    value={formData.lat}
                    onChange={handleFormChange}
                    style={styles.input}
                    required
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Longitude:</label>
                  <input
                    name="lng"
                    type="number"
                    step="any"
                    value={formData.lng}
                    onChange={handleFormChange}
                    style={styles.input}
                    required
                  />
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
    gap: '16px'
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
  formRow: {
    display: 'flex',
    gap: '16px'
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
