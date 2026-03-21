import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BASE_URL } from '../config'

function TagManagement({ loginPath = '/admin/login' }) {
  const navigate = useNavigate()
  const [tags, setTags] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    icon: '',
    color: '#3498db',
    description: ''
  })

  useEffect(() => {
    // Check authentication first
    fetch(`${BASE_URL}/admin/check`, {
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
  }, [loginPath, navigate])

  const loadTags = () => {
    fetch(`${BASE_URL}/admin/tags`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => setTags(data))
      .catch(err => console.error('Error loading tags:', err))
  }

  const handleFormChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    const method = editingId ? 'PUT' : 'POST'
    const url = editingId 
      ? `${BASE_URL}/admin/tags/${editingId}` 
      : `${BASE_URL}/admin/tags`

    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(formData)
    })
      .then(res => {
        if (!res.ok) {
          return res.json().then(err => {
            throw new Error(err.error || 'Lỗi khi lưu tag')
          })
        }
        return res.json()
      })
      .then(() => {
        setShowModal(false)
        setEditingId(null)
        setFormData({
          name: '',
          icon: '',
          color: '#3498db',
          description: ''
        })
        loadTags()
      })
      .catch(err => {
        console.error('Error saving tag:', err)
        alert(err.message)
      })
  }

  const handleAdd = () => {
    setEditingId(null)
    setFormData({
      name: '',
      icon: '',
      color: '#3498db',
      description: ''
    })
    setShowModal(true)
  }

  const handleEdit = (tag) => {
    setEditingId(tag.id)
    setFormData({
      name: tag.name,
      icon: tag.icon || '',
      color: tag.color || '#3498db',
      description: tag.description || ''
    })
    setShowModal(true)
  }

  const handleDelete = (id, name) => {
    if (!confirm(`Xóa tag "${name}"? Tất cả quán đang dùng tag này sẽ bị gỡ tag.`)) return

    fetch(`${BASE_URL}/admin/tags/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
      .then(() => loadTags())
      .catch(err => console.error('Error deleting tag:', err))
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
            <h1 style={styles.title}>Tag Management Studio</h1>
            <p style={styles.titleSubtitle}>
              Thiết kế hệ taxonomy rõ ràng để tối ưu phân loại nhà hàng, món ăn và trải nghiệm tìm kiếm.
            </p>
          </div>
          <button style={styles.addButton} onClick={handleAdd}>
            ➕ Thêm tag mới
          </button>
        </div>
      </div>

      <div style={styles.tagGrid}>
        {tags.map(tag => (
          <div key={tag.id} style={styles.tagCard}>
            <div style={styles.tagHeader}>
              <span style={styles.tagIcon}>{tag.icon || '🏷️'}</span>
              <div style={styles.tagInfo}>
                <h3 style={styles.tagName}>{tag.name}</h3>
                <div style={{ ...styles.colorBox, backgroundColor: tag.color || '#3498db' }} />
              </div>
            </div>
            
            {tag.description && (
              <p style={styles.tagDescription}>{tag.description}</p>
            )}
            
            <div style={styles.tagActions}>
              <button style={styles.btnEdit} onClick={() => handleEdit(tag)}>
                ✏️ Sửa
              </button>
              <button style={styles.btnDelete} onClick={() => handleDelete(tag.id, tag.name)}>
                🗑️ Xóa
              </button>
            </div>
          </div>
        ))}
      </div>

      {tags.length === 0 && (
        <p style={styles.emptyMessage}>
          Chưa có tag nào. Hãy thêm tag mới!
        </p>
      )}

      {/* Modal */}
      {showModal && (
        <div style={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              {editingId ? '✏️ Sửa Tag' : '➕ Thêm Tag Mới'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Tên tag:</label>
                <input
                  name="name"
                  placeholder="VD: Món nước, Ăn nhẹ..."
                  value={formData.name}
                  onChange={handleFormChange}
                  style={styles.input}
                  required
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Icon (emoji):</label>
                <input
                  name="icon"
                  placeholder="VD: 🍜, 🥖, ☕"
                  value={formData.icon}
                  onChange={handleFormChange}
                  style={styles.input}
                  maxLength={10}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Màu sắc:</label>
                <input
                  name="color"
                  type="color"
                  value={formData.color}
                  onChange={handleFormChange}
                  style={styles.colorInput}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Mô tả:</label>
                <textarea
                  name="description"
                  placeholder="Mô tả về tag này..."
                  value={formData.description}
                  onChange={handleFormChange}
                  style={styles.textarea}
                  rows="3"
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
  tagGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '20px'
  },
  tagCard: {
    background: 'linear-gradient(168deg, rgba(255,255,255,0.96) 0%, rgba(245,250,255,0.92) 100%)',
    padding: '20px',
    borderRadius: '16px',
    boxShadow: '0 12px 26px rgba(20, 35, 58, 0.11)',
    border: '1px solid rgba(198, 214, 234, 0.75)'
  },
  tagHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px'
  },
  tagIcon: {
    fontSize: '32px'
  },
  tagInfo: {
    flex: 1
  },
  tagName: {
    margin: '0 0 8px 0',
    fontSize: '18px',
    fontWeight: '700',
    color: '#132745'
  },
  colorBox: {
    width: '40px',
    height: '24px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1'
  },
  tagDescription: {
    fontSize: '14px',
    color: '#4f627e',
    marginBottom: '12px',
    lineHeight: '1.5'
  },
  tagActions: {
    display: 'flex',
    gap: '8px'
  },
  btnEdit: {
    flex: 1,
    padding: '8px 12px',
    border: 'none',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #d48619 0%, #f59e0b 100%)',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  btnDelete: {
    flex: 1,
    padding: '8px 12px',
    border: 'none',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #b41c2f 0%, #d82e44 100%)',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  emptyMessage: {
    textAlign: 'center',
    color: '#64748b',
    padding: '60px 20px',
    fontSize: '16px'
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
    maxWidth: '500px',
    width: '90%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 26px 48px rgba(9, 18, 38, 0.28)',
    border: '1px solid rgba(198, 214, 234, 0.75)'
  },
  modalTitle: {
    fontSize: '24px',
    fontWeight: '760',
    color: '#132745',
    marginBottom: '24px'
  },
  formGroup: {
    marginBottom: '20px'
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
    border: '1px solid #c9d5e5',
    borderRadius: '10px',
    fontSize: '14px'
  },
  colorInput: {
    width: '100px',
    height: '40px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #c9d5e5',
    borderRadius: '10px',
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
    borderRadius: '10px',
    background: 'linear-gradient(130deg, #0d5f5f 0%, #1e5f88 100%)',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  }
}

export default TagManagement
