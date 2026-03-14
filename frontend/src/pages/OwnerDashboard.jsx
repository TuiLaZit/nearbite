import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BASE_URL } from '../config'

function OwnerDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [restaurant, setRestaurant] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [menuItems, setMenuItems] = useState([])
  const [images, setImages] = useState([])
  const [menuForm, setMenuForm] = useState({ name: '', price: '' })
  const [editingMenuId, setEditingMenuId] = useState(null)
  const [imageForm, setImageForm] = useState({ caption: '', is_primary: false })
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)

  const stats = useMemo(() => {
    if (!restaurant) {
      return { visitCount: 0, avgVisit: 0, avgAudio: 0, avgEat: 0, menuCount: 0, imageCount: 0 }
    }
    return {
      visitCount: restaurant.visit_count || 0,
      avgVisit: restaurant.avg_visit_duration || 0,
      avgAudio: restaurant.avg_audio_duration || 0,
      avgEat: restaurant.avg_eat_time || 0,
      menuCount: menuItems.length,
      imageCount: images.length
    }
  }, [restaurant, menuItems.length, images.length])

  const loadOwnerRestaurant = async () => {
    const authResponse = await fetch(`${BASE_URL}/owner/check`, { credentials: 'include' })
    if (!authResponse.ok) {
      navigate('/owner/login', { replace: true })
      return
    }

    const listResponse = await fetch(`${BASE_URL}/admin/restaurants/analytics?page=1&per_page=1`, {
      credentials: 'include'
    })

    if (!listResponse.ok) {
      throw new Error('Không thể tải dữ liệu quán')
    }

    const listData = await listResponse.json()
    const ownerRestaurant = listData.restaurants?.[0] || null

    if (!ownerRestaurant) {
      throw new Error('Chưa có quán nào được gán cho tài khoản này')
    }

    setRestaurant(ownerRestaurant)
    setMenuItems(ownerRestaurant.menu || [])
    setImages(ownerRestaurant.images || [])
  }

  useEffect(() => {
    loadOwnerRestaurant()
      .catch((error) => {
        alert(error.message)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  const handleLogout = () => {
    fetch(`${BASE_URL}/owner/logout`, {
      method: 'POST',
      credentials: 'include'
    }).finally(() => {
      navigate('/owner/login', { replace: true })
    })
  }

  const handleUpdateRestaurant = async (e) => {
    e.preventDefault()

    const payload = {
      name: restaurant.name,
      lat: parseFloat(restaurant.lat),
      lng: parseFloat(restaurant.lng),
      avg_eat_time: parseInt(restaurant.avg_eat_time, 10),
      poi_radius_km: parseFloat(restaurant.poi_radius_km || 0.015),
      description: restaurant.description || ''
    }

    const response = await fetch(`${BASE_URL}/admin/restaurants/${restaurant.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      alert(err.error || 'Không thể cập nhật thông tin quán')
      return
    }

    alert('Đã cập nhật thông tin quán')
    await loadOwnerRestaurant()
  }

  const handleSaveMenu = async (e) => {
    e.preventDefault()

    const payload = {
      name: menuForm.name,
      price: parseInt(menuForm.price, 10)
    }

    const method = editingMenuId ? 'PUT' : 'POST'
    const url = editingMenuId
      ? `${BASE_URL}/admin/menu/${editingMenuId}`
      : `${BASE_URL}/admin/restaurants/${restaurant.id}/menu`

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      alert(err.error || 'Không thể lưu món ăn')
      return
    }

    setMenuForm({ name: '', price: '' })
    setEditingMenuId(null)
    await loadOwnerRestaurant()
  }

  const handleEditMenu = (item) => {
    setEditingMenuId(item.id)
    setMenuForm({ name: item.name, price: item.price.toString() })
  }

  const handleDeleteMenu = async (menuId) => {
    if (!confirm('Xóa món này?')) return

    const response = await fetch(`${BASE_URL}/admin/menu/${menuId}`, {
      method: 'DELETE',
      credentials: 'include'
    })

    if (!response.ok) {
      alert('Không thể xóa món')
      return
    }

    await loadOwnerRestaurant()
  }

  const handleCreateImage = async (e) => {
    e.preventDefault()

    if (!selectedFile) {
      alert('Vui lòng chọn file ảnh')
      return
    }

    setUploadingImage(true)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const uploadResponse = await fetch(`${BASE_URL}/admin/upload-image`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      })

      const uploadData = await uploadResponse.json()
      if (!uploadResponse.ok) {
        throw new Error(uploadData.error || 'Upload ảnh thất bại')
      }

      const saveResponse = await fetch(`${BASE_URL}/admin/restaurants/${restaurant.id}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          image_url: uploadData.url,
          caption: imageForm.caption,
          is_primary: imageForm.is_primary,
          display_order: images.length
        })
      })

      const saveData = await saveResponse.json()
      if (!saveResponse.ok) {
        throw new Error(saveData.error || 'Không thể lưu ảnh')
      }

      setImageForm({ caption: '', is_primary: false })
      setSelectedFile(null)
      await loadOwnerRestaurant()
    } catch (error) {
      alert(error.message)
    } finally {
      setUploadingImage(false)
    }
  }

  const handleDeleteImage = async (imageId) => {
    if (!confirm('Xóa ảnh này?')) return

    const response = await fetch(`${BASE_URL}/admin/images/${imageId}`, {
      method: 'DELETE',
      credentials: 'include'
    })

    if (!response.ok) {
      alert('Không thể xóa ảnh')
      return
    }

    await loadOwnerRestaurant()
  }

  if (loading) {
    return <div style={styles.loading}>Đang tải dashboard chủ quán...</div>
  }

  if (!restaurant) {
    return <div style={styles.loading}>Không tìm thấy quán được gán cho tài khoản này.</div>
  }

  return (
    <div style={styles.page}>
      <aside style={styles.sidebar}>
        <h2 style={styles.sidebarTitle}>🏪 Chủ quán Dashboard</h2>
        <button style={{ ...styles.navBtn, ...(activeTab === 'overview' ? styles.navBtnActive : {}) }} onClick={() => setActiveTab('overview')}>
          📊 Tổng quan
        </button>
        <button style={{ ...styles.navBtn, ...(activeTab === 'menu' ? styles.navBtnActive : {}) }} onClick={() => setActiveTab('menu')}>
          🍽️ Quản lý Menu
        </button>
        <button style={{ ...styles.navBtn, ...(activeTab === 'images' ? styles.navBtnActive : {}) }} onClick={() => setActiveTab('images')}>
          🖼️ Quản lý Hình ảnh
        </button>
        <button style={{ ...styles.navBtn, ...(activeTab === 'orders' ? styles.navBtnActive : {}) }} onClick={() => setActiveTab('orders')}>
          🧾 Đơn hàng
        </button>

        <button style={styles.logoutBtn} onClick={handleLogout}>🚪 Đăng xuất</button>
      </aside>

      <main style={styles.main}>
        <h1 style={styles.title}>{restaurant.name}</h1>

        {activeTab === 'overview' && (
          <>
            <div style={styles.statsGrid}>
              <StatCard label="Lượt ghé" value={stats.visitCount} />
              <StatCard label="TG ghé TB (phút)" value={stats.avgVisit} />
              <StatCard label="TG nghe TB (giây)" value={stats.avgAudio} />
              <StatCard label="TG ăn trung bình" value={`${stats.avgEat} phút`} />
              <StatCard label="Số món hiện có" value={stats.menuCount} />
              <StatCard label="Số ảnh hiện có" value={stats.imageCount} />
            </div>

            <form onSubmit={handleUpdateRestaurant} style={styles.card}>
              <h3>Thông tin quán</h3>
              <div style={styles.formGrid}>
                <input value={restaurant.name} onChange={(e) => setRestaurant({ ...restaurant, name: e.target.value })} placeholder="Tên quán" required />
                <input type="number" step="any" value={restaurant.lat} onChange={(e) => setRestaurant({ ...restaurant, lat: e.target.value })} placeholder="Latitude" required />
                <input type="number" step="any" value={restaurant.lng} onChange={(e) => setRestaurant({ ...restaurant, lng: e.target.value })} placeholder="Longitude" required />
                <input type="number" value={restaurant.avg_eat_time || ''} onChange={(e) => setRestaurant({ ...restaurant, avg_eat_time: e.target.value })} placeholder="TG ăn trung bình" required />
                <input type="number" step="0.001" min="0.001" max="1" value={restaurant.poi_radius_km || 0.015} onChange={(e) => setRestaurant({ ...restaurant, poi_radius_km: e.target.value })} placeholder="POI radius" required />
              </div>
              <textarea value={restaurant.description || ''} onChange={(e) => setRestaurant({ ...restaurant, description: e.target.value })} placeholder="Mô tả quán" rows={4} style={{ width: '100%' }} />
              <button type="submit">💾 Cập nhật quán</button>
            </form>
          </>
        )}

        {activeTab === 'menu' && (
          <div style={styles.card}>
            <h3>Menu của quán</h3>
            <form onSubmit={handleSaveMenu} style={styles.inlineForm}>
              <input
                value={menuForm.name}
                onChange={(e) => setMenuForm({ ...menuForm, name: e.target.value })}
                placeholder="Tên món"
                required
              />
              <input
                type="number"
                value={menuForm.price}
                onChange={(e) => setMenuForm({ ...menuForm, price: e.target.value })}
                placeholder="Giá"
                required
              />
              <button type="submit">{editingMenuId ? 'Cập nhật món' : 'Thêm món'}</button>
              {editingMenuId && (
                <button type="button" onClick={() => { setEditingMenuId(null); setMenuForm({ name: '', price: '' }) }}>
                  Hủy
                </button>
              )}
            </form>

            <table style={styles.table}>
              <thead>
                <tr>
                  <th>Tên món</th>
                  <th>Giá</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {menuItems.map(item => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.price.toLocaleString()}đ</td>
                    <td>
                      <button onClick={() => handleEditMenu(item)}>✏️ Sửa</button>
                      <button onClick={() => handleDeleteMenu(item.id)}>🗑️ Xóa</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'images' && (
          <div style={styles.card}>
            <h3>Hình ảnh quán</h3>
            <form onSubmit={handleCreateImage} style={styles.imageForm}>
              <input type="file" accept="image/*" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} required />
              <input
                value={imageForm.caption}
                onChange={(e) => setImageForm({ ...imageForm, caption: e.target.value })}
                placeholder="Caption"
              />
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={imageForm.is_primary}
                  onChange={(e) => setImageForm({ ...imageForm, is_primary: e.target.checked })}
                />
                Đặt làm ảnh chính
              </label>
              <button type="submit" disabled={uploadingImage}>
                {uploadingImage ? 'Đang upload...' : 'Thêm ảnh'}
              </button>
            </form>

            <div style={styles.imageGrid}>
              {images.map(img => (
                <div key={img.id} style={styles.imageCard}>
                  <img src={img.image_url} alt={img.caption || 'restaurant'} style={styles.image} />
                  <div style={styles.imageMeta}>
                    <div>{img.caption || 'Không có caption'}</div>
                    {img.is_primary && <span style={styles.primaryBadge}>Ảnh chính</span>}
                  </div>
                  <button onClick={() => handleDeleteImage(img.id)}>🗑️ Xóa ảnh</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'orders' && (
          <div style={styles.card}>
            <h3>Đơn hàng</h3>
            <p>Chức năng quản lý đơn hàng, xác nhận giao và tính commission tháng sẽ làm ở bước tiếp theo.</p>
          </div>
        )}
      </main>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'grid',
    gridTemplateColumns: '280px 1fr',
    background: '#eef2f7'
  },
  sidebar: {
    background: '#1e293b',
    color: 'white',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  sidebarTitle: {
    marginBottom: '12px'
  },
  navBtn: {
    background: 'transparent',
    color: '#cbd5e1',
    border: 'none',
    textAlign: 'left',
    padding: '12px',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  navBtnActive: {
    background: '#334155',
    color: 'white'
  },
  logoutBtn: {
    marginTop: 'auto',
    background: '#ef4444',
    border: 'none',
    color: 'white',
    borderRadius: '8px',
    padding: '12px',
    cursor: 'pointer'
  },
  main: {
    padding: '24px'
  },
  title: {
    marginTop: 0,
    marginBottom: '16px'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    marginBottom: '16px'
  },
  statCard: {
    background: 'white',
    borderRadius: '10px',
    padding: '14px',
    border: '1px solid #dbe4ef'
  },
  statLabel: {
    color: '#475569',
    fontSize: '13px'
  },
  statValue: {
    fontSize: '24px',
    fontWeight: '700',
    marginTop: '4px'
  },
  card: {
    background: 'white',
    borderRadius: '12px',
    border: '1px solid #dbe4ef',
    padding: '16px'
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '10px',
    marginBottom: '10px'
  },
  inlineForm: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr auto auto',
    gap: '10px',
    marginBottom: '12px'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  imageForm: {
    display: 'grid',
    gridTemplateColumns: '1.3fr 1fr 1fr auto',
    gap: '10px',
    alignItems: 'center',
    marginBottom: '14px'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  imageGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '12px'
  },
  imageCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    overflow: 'hidden',
    background: '#f8fafc'
  },
  image: {
    width: '100%',
    height: '150px',
    objectFit: 'cover'
  },
  imageMeta: {
    padding: '10px'
  },
  primaryBadge: {
    display: 'inline-block',
    marginTop: '6px',
    fontSize: '12px',
    background: '#dbeafe',
    color: '#1e40af',
    padding: '2px 8px',
    borderRadius: '999px'
  },
  loading: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
}

export default OwnerDashboard
