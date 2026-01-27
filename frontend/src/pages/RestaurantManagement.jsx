import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BASE_URL } from '../config'

function RestaurantManagement() {
  const navigate = useNavigate()
  const [restaurants, setRestaurants] = useState([])
  const [tags, setTags] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTags, setSelectedTags] = useState([])
  const [sortBy, setSortBy] = useState('name')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    lat: '',
    lng: '',
    avg_eat_time: '',
    poi_radius_km: '0.015',
    description: ''
  })

  useEffect(() => {
    loadTags()
    loadRestaurants()
  }, [])

  useEffect(() => {
    loadRestaurants()
  }, [searchTerm, selectedTags, sortBy])

  const loadTags = () => {
    fetch(`${BASE_URL}/admin/tags`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => setTags(data))
      .catch(err => console.error('Error loading tags:', err))
  }

  const loadRestaurants = () => {
    const params = new URLSearchParams()
    if (searchTerm) params.append('search', searchTerm)
    if (sortBy) params.append('sort', sortBy)
    selectedTags.forEach(tagId => params.append('tags', tagId))

    fetch(`${BASE_URL}/admin/restaurants/analytics?${params.toString()}`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => setRestaurants(data))
      .catch(err => console.error('Error loading restaurants:', err))
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
    const confirmName = prompt(`Gõ chính xác tên quán để xoá:\n${name}`)
    if (confirmName !== name) {
      alert('Tên không khớp!')
      return
    }

    fetch(`${BASE_URL}/admin/restaurants/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ confirm_name: confirmName })
    })
      .then(() => loadRestaurants())
      .catch(err => console.error('Error deleting restaurant:', err))
  }

  const handleOpenDetails = (id) => {
    navigate(`/admin/restaurant/${id}`)
  }

  const toggleTagFilter = (tagId) => {
    if (selectedTags.includes(tagId)) {
      setSelectedTags(selectedTags.filter(id => id !== tagId))
    } else {
      setSelectedTags([...selectedTags, tagId])
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>🍽️ Quản lý Quán Ăn</h1>
        <button style={styles.addButton} onClick={handleAdd}>
          ➕ Thêm quán mới
        </button>
      </div>

      {/* Filters */}
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

      {/* Table */}
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Tên quán</th>
              <th style={styles.th}>Lượt ghé</th>
              <th style={styles.th}>TG ghé TB (phút)</th>
              <th style={styles.th}>TG nghe TB (giây)</th>
              <th style={styles.th}>TG ăn (phút)</th>
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
                <td style={styles.td}>{r.visit_count || 0}</td>
                <td style={styles.td}>{r.avg_visit_duration || 0}</td>
                <td style={styles.td}>{r.avg_audio_duration || 0}</td>
                <td style={styles.td}>{r.avg_eat_time}</td>
                <td style={styles.td}>
                  <div style={styles.actionButtons}>
                    <button style={styles.btnEdit} onClick={() => handleEdit(r)}>✏️</button>
                    <button style={styles.btnDetails} onClick={() => handleOpenDetails(r.id)}>📋</button>
                    <button style={styles.btnDelete} onClick={() => handleDelete(r.id, r.name)}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
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
    margin: '0 auto'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px'
  },
  title: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#1e293b',
    margin: 0
  },
  addButton: {
    padding: '12px 24px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  filtersCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  filterSection: {
    marginBottom: '20px'
  },
  filterLabel: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#475569',
    marginBottom: '8px'
  },
  searchInput: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '14px'
  },
  tagFilters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px'
  },
  tagButton: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    color: '#1e293b',
    fontWeight: '500'
  },
  tagButtonActive: {
    color: 'white',
    fontWeight: '600',
    transform: 'scale(1.05)'
  },
  sortSelect: {
    padding: '10px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '14px',
    backgroundColor: 'white',
    cursor: 'pointer'
  },
  tableContainer: {
    backgroundColor: 'white',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  th: {
    padding: '16px',
    textAlign: 'left',
    borderBottom: '2px solid #e2e8f0',
    backgroundColor: '#f8fafc',
    fontWeight: '600',
    color: '#475569',
    fontSize: '14px'
  },
  tr: {
    borderBottom: '1px solid #e2e8f0',
    transition: 'background-color 0.2s'
  },
  td: {
    padding: '16px',
    fontSize: '14px',
    color: '#1e293b'
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
  actionButtons: {
    display: 'flex',
    gap: '8px'
  },
  btnEdit: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#f59e0b',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px'
  },
  btnDetails: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#3b82f6',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px'
  },
  btnDelete: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#ef4444',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '32px',
    maxWidth: '600px',
    width: '90%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
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
