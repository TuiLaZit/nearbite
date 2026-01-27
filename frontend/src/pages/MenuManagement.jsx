import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { BASE_URL } from '../config'

function MenuManagement() {
  const { restaurantId } = useParams()
  const navigate = useNavigate()
  const [menuItems, setMenuItems] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingItemId, setEditingItemId] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    price: ''
  })

  useEffect(() => {
    // Check authentication first
    fetch(`${BASE_URL}/admin/check`, {
      credentials: 'include'
    })
      .then(res => {
        if (!res.ok) {
          navigate('/admin/login', { replace: true })
          return null
        }
        return res.json()
      })
      .then(data => {
        if (data) {
          setIsAuthenticated(true)
          loadMenu()
        }
      })
      .catch(err => {
        console.error('Auth check failed:', err)
        navigate('/admin/login', { replace: true })
      })
  }, [restaurantId])

  const loadMenu = () => {
    fetch(`${BASE_URL}/admin/restaurants/${restaurantId}/menu`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => setMenuItems(data))
      .catch(err => console.error('Error loading menu:', err))
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
      price: parseInt(formData.price)
    }

    const method = editingItemId ? 'PUT' : 'POST'
    const url = editingItemId
      ? `${BASE_URL}/admin/menu/${editingItemId}`
      : `${BASE_URL}/admin/restaurants/${restaurantId}/menu`

    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    })
      .then(() => {
        setShowModal(false)
        setEditingItemId(null)
        setFormData({ name: '', price: '' })
        loadMenu()
      })
      .catch(err => console.error('Error saving menu item:', err))
  }

  const handleAdd = () => {
    setEditingItemId(null)
    setFormData({ name: '', price: '' })
    setShowModal(true)
  }

  const handleEdit = (item) => {
    setEditingItemId(item.id)
    setFormData({
      name: item.name,
      price: item.price.toString()
    })
    setShowModal(true)
  }

  const handleDelete = (id) => {
    if (!confirm('Xoá món này?')) return

    fetch(`${BASE_URL}/admin/menu/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
      .then(() => loadMenu())
      .catch(err => console.error('Error deleting menu item:', err))
  }

  const handleGoBack = () => {
    navigate('/admin')
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
      <div style={styles.header}>
        <button style={styles.backButton} onClick={handleGoBack}>
          ⬅️ Quay lại
        </button>
        <h1 style={styles.title}>🍽️ Quản lý Menu</h1>
        <button style={styles.addButton} onClick={handleAdd}>
          ➕ Thêm món
        </button>
      </div>

      <div style={styles.menuGrid}>
        {menuItems.map(item => (
          <div key={item.id} style={styles.menuCard}>
            <div style={styles.menuInfo}>
              <h3 style={styles.menuName}>{item.name}</h3>
              <p style={styles.menuPrice}>{item.price.toLocaleString()}đ</p>
            </div>
            <div style={styles.menuActions}>
              <button style={styles.btnEdit} onClick={() => handleEdit(item)}>✏️</button>
              <button style={styles.btnDelete} onClick={() => handleDelete(item.id)}>🗑️</button>
            </div>
          </div>
        ))}
      </div>

      {menuItems.length === 0 && (
        <p style={styles.emptyMessage}>
          Chưa có món nào. Hãy thêm món mới!
        </p>
      )}

      {/* Modal */}
      {showModal && (
        <div style={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              {editingItemId ? '✏️ Sửa món' : '➕ Thêm món mới'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Tên món:</label>
                <input
                  name="name"
                  placeholder="VD: Phở bò, Bún chả..."
                  value={formData.name}
                  onChange={handleFormChange}
                  style={styles.input}
                  required
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Giá (VNĐ):</label>
                <input
                  name="price"
                  type="number"
                  placeholder="VD: 35000"
                  value={formData.price}
                  onChange={handleFormChange}
                  style={styles.input}
                  required
                />
              </div>
              <div style={styles.modalActions}>
                <button type="button" style={styles.btnCancel} onClick={() => setShowModal(false)}>
                  ❌ Hủy
                </button>
                <button type="submit" style={styles.btnSave}>
                  💾 {editingItemId ? 'Cập nhật' : 'Thêm'}
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
    maxWidth: '1200px',
    margin: '0 auto',
    minHeight: '100vh',
    backgroundColor: '#f8fafc'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '32px',
    gap: '16px'
  },
  backButton: {
    padding: '10px 16px',
    backgroundColor: '#64748b',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  title: {
    flex: 1,
    fontSize: '32px',
    fontWeight: '700',
    color: '#1e293b',
    margin: 0,
    textAlign: 'center'
  },
  addButton: {
    padding: '12px 24px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  menuGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '20px'
  },
  menuCard: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    border: '2px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  menuInfo: {
    flex: 1
  },
  menuName: {
    margin: '0 0 8px 0',
    fontSize: '18px',
    fontWeight: '600',
    color: '#1e293b'
  },
  menuPrice: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '700',
    color: '#10b981'
  },
  menuActions: {
    display: 'flex',
    gap: '8px'
  },
  btnEdit: {
    padding: '8px 12px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#f59e0b',
    color: 'white',
    fontSize: '16px',
    cursor: 'pointer'
  },
  btnDelete: {
    padding: '8px 12px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#ef4444',
    color: 'white',
    fontSize: '16px',
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
    backgroundColor: '#10b981',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  }
}

export default MenuManagement
