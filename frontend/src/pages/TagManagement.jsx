import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BASE_URL } from '../config'

function TagManagement() {
  const navigate = useNavigate()
  const [tags, setTags] = useState([])
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

  const handleEdit = (tag) => {
    setEditingId(tag.id)
    setFormData({
      name: tag.name,
      icon: tag.icon || '',
      color: tag.color || '#3498db',
      description: tag.description || ''
    })
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

  const handleCancel = () => {
    setEditingId(null)
    setFormData({
      name: '',
      icon: '',
      color: '#3498db',
      description: ''
    })
  }

  const handleGoBack = () => {
    navigate('/admin')
  }

  return (
    <div className="container">
      <button onClick={handleGoBack}>⬅️ Quay lại trang Admin</button>
      <h1>🏷️ Quản lý Tags</h1>

      <div style={{ marginBottom: '30px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
        <h3>{editingId ? '✏️ Sửa Tag' : '➕ Thêm Tag Mới'}</h3>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div>
              <label>Tên tag *</label>
              <input
                name="name"
                placeholder="VD: Món nước, Ăn nhẹ..."
                value={formData.name}
                onChange={handleFormChange}
                required
              />
            </div>
            
            <div>
              <label>Icon (emoji)</label>
              <input
                name="icon"
                placeholder="VD: 🍜, 🥖, ☕"
                value={formData.icon}
                onChange={handleFormChange}
                maxLength={10}
              />
            </div>
            
            <div>
              <label>Màu sắc</label>
              <input
                name="color"
                type="color"
                value={formData.color}
                onChange={handleFormChange}
              />
            </div>
            
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Mô tả</label>
              <textarea
                name="description"
                placeholder="Mô tả về tag này..."
                value={formData.description}
                onChange={handleFormChange}
                rows={2}
              />
            </div>
          </div>
          
          <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
            <button type="submit" style={{ flex: 1 }}>
              {editingId ? '💾 Cập nhật' : '➕ Thêm Tag'}
            </button>
            {editingId && (
              <button type="button" onClick={handleCancel} style={{ backgroundColor: '#6c757d' }}>
                ❌ Hủy
              </button>
            )}
          </div>
        </form>
      </div>

      <h2>📋 Danh sách Tags</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
        {tags.map(tag => (
          <div 
            key={tag.id} 
            style={{
              padding: '15px',
              border: '2px solid #ddd',
              borderRadius: '8px',
              backgroundColor: '#fff'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <span style={{ fontSize: '24px' }}>{tag.icon || '🏷️'}</span>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 5px 0' }}>{tag.name}</h3>
                <div 
                  style={{
                    width: '30px',
                    height: '20px',
                    backgroundColor: tag.color || '#3498db',
                    borderRadius: '4px',
                    border: '1px solid #ccc'
                  }}
                />
              </div>
            </div>
            
            {tag.description && (
              <p style={{ fontSize: '14px', color: '#666', margin: '10px 0' }}>
                {tag.description}
              </p>
            )}
            
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button 
                onClick={() => handleEdit(tag)}
                style={{ flex: 1, fontSize: '14px' }}
              >
                ✏️ Sửa
              </button>
              <button 
                onClick={() => handleDelete(tag.id, tag.name)}
                style={{ flex: 1, fontSize: '14px', backgroundColor: '#dc3545' }}
              >
                🗑️ Xóa
              </button>
            </div>
          </div>
        ))}
      </div>

      {tags.length === 0 && (
        <p style={{ textAlign: 'center', color: '#666', padding: '40px' }}>
          Chưa có tag nào. Hãy thêm tag mới!
        </p>
      )}
    </div>
  )
}

export default TagManagement
