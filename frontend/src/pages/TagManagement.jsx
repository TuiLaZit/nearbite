import { useState, useEffect } from 'react'
import { BASE_URL } from '../config'

function TagManagement() {
  const [tags, setTags] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    icon: '',
    color: '#3498db',
    description: ''
  })

  useEffect(() => {
    loadTags()
  }, [])

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

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>🏷️ Quản lý Tags</h1>
        <button style={styles.addButton} onClick={handleAdd}>
          ➕ Thêm tag mới
        </button>
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
    backgroundColor: '#9b59b6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  tagGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '20px'
  },
  tagCard: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    border: '2px solid #e2e8f0'
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
    fontWeight: '600',
    color: '#1e293b'
  },
  colorBox: {
    width: '40px',
    height: '24px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1'
  },
  tagDescription: {
    fontSize: '14px',
    color: '#64748b',
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
    borderRadius: '6px',
    backgroundColor: '#f59e0b',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  btnDelete: {
    flex: 1,
    padding: '8px 12px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#ef4444',
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
    maxWidth: '500px',
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
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
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
    backgroundColor: '#9b59b6',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  }
}

export default TagManagement
