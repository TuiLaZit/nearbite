import { useEffect, useMemo, useRef, useState } from 'react'
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
  const [allTags, setAllTags] = useState([])
  const [selectedTagIds, setSelectedTagIds] = useState([])
  const [savingTags, setSavingTags] = useState(false)
  const [isTopBarHidden, setIsTopBarHidden] = useState(false)
  const lastScrollYRef = useRef(0)
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 1200 : window.innerWidth))
  const isMobile = viewportWidth <= 768

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
    setSelectedTagIds((ownerRestaurant.tags || []).map((tag) => tag.id))
  }

  const loadAllTags = async () => {
    const response = await fetch(`${BASE_URL}/admin/tags`, {
      credentials: 'include'
    })

    if (!response.ok) {
      throw new Error('Không thể tải danh sách tags')
    }

    const data = await response.json()
    setAllTags(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    Promise.all([loadOwnerRestaurant(), loadAllTags()])
      .catch((error) => {
        alert(error.message)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    let ticking = false

    const handleScroll = () => {
      const currentScrollY = window.scrollY || window.pageYOffset

      if (ticking) return
      ticking = true

      window.requestAnimationFrame(() => {
        const diff = currentScrollY - lastScrollYRef.current

        if (currentScrollY <= 8) {
          setIsTopBarHidden(false)
        } else if (diff > 6) {
          setIsTopBarHidden(true)
        } else if (diff < -6) {
          setIsTopBarHidden(false)
        }

        lastScrollYRef.current = currentScrollY
        ticking = false
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
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

  const toggleTag = (tagId) => {
    setSelectedTagIds((prev) => {
      if (prev.includes(tagId)) {
        return prev.filter((id) => id !== tagId)
      }
      return [...prev, tagId]
    })
  }

  const handleSaveTags = async () => {
    if (!restaurant) return

    const originalTagIds = (restaurant.tags || []).map((tag) => tag.id)
    const toAdd = selectedTagIds.filter((id) => !originalTagIds.includes(id))
    const toRemove = originalTagIds.filter((id) => !selectedTagIds.includes(id))

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
          requestWithValidation(`${BASE_URL}/admin/restaurants/${restaurant.id}/tags/${tagId}`, 'POST')
        ),
        ...toRemove.map((tagId) =>
          requestWithValidation(`${BASE_URL}/admin/restaurants/${restaurant.id}/tags/${tagId}`, 'DELETE')
        )
      ])

      alert('Đã cập nhật tags cho quán')
      await loadOwnerRestaurant()
    } catch (error) {
      alert(error.message || 'Không thể lưu tags')
    } finally {
      setSavingTags(false)
    }
  }

  if (loading) {
    return <div style={styles.loading}>Đang tải dashboard chủ quán...</div>
  }

  if (!restaurant) {
    return <div style={styles.loading}>Không tìm thấy quán được gán cho tài khoản này.</div>
  }

  return (
    <div style={styles.page}>
      <style>{`
        .owner-dashboard-content {
          font-family: 'Plus Jakarta Sans', 'Segoe UI', sans-serif;
          color: #132745;
        }

        .owner-dashboard-content h3 {
          margin-top: 0;
          margin-bottom: 14px;
          font-size: 24px;
          font-weight: 750;
          color: #10243f;
          letter-spacing: -0.01em;
        }

        .owner-dashboard-content input,
        .owner-dashboard-content textarea {
          width: 100%;
          border: 1px solid #cad9ec;
          border-radius: 12px;
          padding: 11px 13px;
          font-size: 15px;
          color: #153251;
          background: rgba(255, 255, 255, 0.96);
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
          box-sizing: border-box;
        }

        .owner-dashboard-content input:focus,
        .owner-dashboard-content textarea:focus {
          outline: none;
          border-color: #4a91eb;
          box-shadow: 0 0 0 4px rgba(74, 145, 235, 0.16);
        }

        .owner-dashboard-content button {
          border-radius: 12px;
          border: 1px solid rgba(123, 161, 201, 0.45);
          background: linear-gradient(140deg, #0f5d5c 0%, #164d66 100%);
          color: #f5fbff;
          font-weight: 700;
          font-size: 14px;
          height: 42px;
          padding: 0 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 10px 18px rgba(12, 48, 76, 0.2);
        }

        .owner-dashboard-content button:hover {
          transform: translateY(-1px);
          filter: brightness(1.06);
          box-shadow: 0 12px 22px rgba(12, 48, 76, 0.26);
        }

        .owner-dashboard-content button:disabled {
          opacity: 0.75;
          cursor: not-allowed;
          transform: none;
          filter: grayscale(0.1);
        }

        .owner-dashboard-content table thead th {
          text-align: left;
          padding: 10px 12px;
          border-bottom: 2px solid #d5e5f8;
          color: #3a5372;
          font-weight: 700;
          font-size: 13px;
          background: linear-gradient(180deg, #fbfdff 0%, #eef5ff 100%);
        }

        .owner-dashboard-content table tbody td {
          padding: 11px 12px;
          border-bottom: 1px solid #e8f0fb;
          color: #223653;
          background: rgba(255, 255, 255, 0.88);
        }

        .owner-dashboard-content table tbody tr:hover td {
          background: rgba(234, 244, 255, 0.78);
        }

        .owner-menu-card-list {
          display: none;
        }

        .owner-menu-table-wrap {
          display: block;
        }

        .owner-topbar-nav-btn {
          margin: 0;
          border: 1px solid rgba(146, 178, 214, 0.42);
          background: linear-gradient(145deg, rgba(17, 42, 73, 0.82) 0%, rgba(21, 64, 96, 0.74) 100%);
          color: #e6f2ff;
          border-radius: 999px;
          height: 40px;
          padding: 0 16px;
          transition: all 0.22s ease;
          white-space: nowrap;
          font-weight: 650;
          letter-spacing: 0.1px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
        }

        .owner-topbar-nav-btn:hover {
          border: 1px solid rgba(181, 214, 248, 0.86);
          background: linear-gradient(128deg, rgba(54, 111, 190, 0.9), rgba(41, 139, 160, 0.8));
          color: #ffffff;
          transform: translateY(-1px);
          box-shadow: 0 10px 20px rgba(7, 23, 48, 0.28), 0 0 16px rgba(117, 188, 245, 0.28);
        }

        .owner-topbar-nav-btn.active {
          border: 1px solid rgba(205, 232, 255, 0.98);
          background: linear-gradient(130deg, rgba(84, 162, 252, 0.98), rgba(78, 211, 230, 0.92));
          color: #ffffff;
          box-shadow: 0 12px 22px rgba(8, 24, 50, 0.34), 0 0 24px rgba(130, 207, 255, 0.45);
        }

        .owner-topbar-logout-btn {
          margin: 0;
          border-radius: 12px;
          border: 1px solid rgba(132, 160, 195, 0.42);
          background: linear-gradient(135deg, rgba(18, 59, 117, 0.84) 0%, rgba(18, 98, 122, 0.84) 100%);
          color: #f0f6ff;
          height: 40px;
          padding: 0 16px;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .owner-topbar-logout-btn:hover {
          transform: translateY(-1px);
          border-color: rgba(248, 165, 165, 0.9);
          background: linear-gradient(135deg, #c62828 0%, #e53935 100%);
          color: #fff5f5;
          box-shadow: 0 10px 20px rgba(138, 23, 23, 0.35);
        }

        @media (max-width: 768px) {
          .owner-topbar-nav-btn {
            height: 38px;
            padding: 0 8px;
            font-size: 12.5px;
            border-radius: 10px;
            width: auto;
            text-align: center;
            white-space: normal;
            line-height: 1.15;
          }

          .owner-topbar-logout-btn {
            height: 36px;
            padding: 0 12px;
            font-size: 13px;
            border-radius: 10px;
          }

          .owner-dashboard-content {
            padding: 14px !important;
          }

          .owner-dashboard-title {
            font-size: 28px !important;
            margin-bottom: 14px !important;
          }

          .owner-dashboard-topbar > div:first-child {
            font-size: 16px;
          }

          .owner-stats-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .owner-form-grid,
          .owner-inline-form,
          .owner-image-form {
            grid-template-columns: 1fr !important;
          }

          .owner-menu-table-wrap {
            display: none;
          }

          .owner-menu-card-list {
            display: grid;
            grid-template-columns: 1fr;
            gap: 10px;
          }
        }

        @media (max-width: 520px) {
          .owner-stats-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <header className="owner-dashboard-topbar" style={{ ...styles.topBar, ...(isMobile ? styles.topBarMobile : {}), ...(isTopBarHidden ? styles.topBarHidden : {}) }}>
        {isMobile ? (
          <>
            <div style={styles.topBarHeadMobile}>
              <div style={{ ...styles.topBarBrand, ...styles.topBarBrandMobile }}>
                <div style={styles.brandDot} />
                <div>
                  <div style={styles.topBarTitle}>Owner Command</div>
                  <div style={{ ...styles.topBarSub, ...styles.topBarSubMobile }}>Restaurant Operations</div>
                </div>
              </div>

              <button className="owner-topbar-logout-btn" style={{ ...styles.topBarLogout, ...styles.topBarLogoutCompactMobile }} onClick={handleLogout}>
                Đăng xuất
              </button>
            </div>

            <nav className="owner-topbar-nav" style={{ ...styles.topBarNav, ...styles.topBarNavMobile }}>
              <button className={`owner-topbar-nav-btn ${activeTab === 'overview' ? 'active' : ''}`} style={{ ...styles.topBarButton, ...styles.topBarButtonMobile }} onClick={() => setActiveTab('overview')}>
                📊 Tổng quan
              </button>
              <button className={`owner-topbar-nav-btn ${activeTab === 'menu' ? 'active' : ''}`} style={{ ...styles.topBarButton, ...styles.topBarButtonMobile }} onClick={() => setActiveTab('menu')}>
                🍽️ Quản lý Menu
              </button>
              <button className={`owner-topbar-nav-btn ${activeTab === 'images' ? 'active' : ''}`} style={{ ...styles.topBarButton, ...styles.topBarButtonMobile }} onClick={() => setActiveTab('images')}>
                🖼️ Quản lý Hình ảnh
              </button>
              <button className={`owner-topbar-nav-btn ${activeTab === 'tags' ? 'active' : ''}`} style={{ ...styles.topBarButton, ...styles.topBarButtonMobile }} onClick={() => setActiveTab('tags')}>
                🏷️ Quản lý Tags
              </button>
            </nav>
          </>
        ) : (
          <>
            <div style={styles.topBarBrand}>
              <div style={styles.brandDot} />
              <div>
                <div style={styles.topBarTitle}>Owner Command</div>
                <div style={styles.topBarSub}>Restaurant Operations</div>
              </div>
            </div>

            <nav className="owner-topbar-nav" style={styles.topBarNav}>
              <button className={`owner-topbar-nav-btn ${activeTab === 'overview' ? 'active' : ''}`} style={styles.topBarButton} onClick={() => setActiveTab('overview')}>
                📊 Tổng quan
              </button>
              <button className={`owner-topbar-nav-btn ${activeTab === 'menu' ? 'active' : ''}`} style={styles.topBarButton} onClick={() => setActiveTab('menu')}>
                🍽️ Quản lý Menu
              </button>
              <button className={`owner-topbar-nav-btn ${activeTab === 'images' ? 'active' : ''}`} style={styles.topBarButton} onClick={() => setActiveTab('images')}>
                🖼️ Quản lý Hình ảnh
              </button>
              <button className={`owner-topbar-nav-btn ${activeTab === 'tags' ? 'active' : ''}`} style={styles.topBarButton} onClick={() => setActiveTab('tags')}>
                🏷️ Quản lý Tags
              </button>
            </nav>

            <button className="owner-topbar-logout-btn" style={styles.topBarLogout} onClick={handleLogout}>Đăng xuất</button>
          </>
        )}
      </header>

      <main className="owner-dashboard-content" style={styles.main}>
        <h1 className="owner-dashboard-title" style={styles.title}>{restaurant.name}</h1>

        {activeTab === 'overview' && (
          <>
            <div className="owner-stats-grid" style={styles.statsGrid}>
              <StatCard label="Lượt ghé" value={stats.visitCount} />
              <StatCard label="TG ghé TB (phút)" value={stats.avgVisit} />
              <StatCard label="TG nghe TB (giây)" value={stats.avgAudio} />
              <StatCard label="TG ăn trung bình" value={`${stats.avgEat} phút`} />
              <StatCard label="Số món hiện có" value={stats.menuCount} />
              <StatCard label="Số ảnh hiện có" value={stats.imageCount} />
            </div>

            <form onSubmit={handleUpdateRestaurant} style={styles.card}>
              <h3>Thông tin quán</h3>
              <div className="owner-form-grid" style={styles.formGrid}>
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
            <form className="owner-inline-form" onSubmit={handleSaveMenu} style={styles.inlineForm}>
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

            <div className="owner-menu-table-wrap" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '0 -10px', padding: '0 10px' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th>Tên món</th>
                    <th>Giá</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {menuItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.price.toLocaleString()}đ</td>
                      <td>
                        <div style={styles.compactActionGroup}>
                          <button type="button" style={styles.compactActionButton} title="Sửa" aria-label="Sửa" onClick={() => handleEditMenu(item)}>✏️</button>
                          <button type="button" style={styles.compactActionButtonDanger} title="Xóa" aria-label="Xóa" onClick={() => handleDeleteMenu(item.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="owner-menu-card-list">
              {menuItems.map((item) => (
                <div key={item.id} style={styles.menuCard}>
                  <div style={styles.menuCardHeaderRow}>
                    <div style={styles.menuCardName}>{item.name}</div>
                    <div style={styles.menuCardPrice}>{item.price.toLocaleString()}đ</div>
                  </div>
                  <div style={styles.menuCardActions}>
                    <button type="button" style={styles.compactActionButton} title="Sửa" aria-label="Sửa" onClick={() => handleEditMenu(item)}>✏️</button>
                    <button type="button" style={styles.compactActionButtonDanger} title="Xóa" aria-label="Xóa" onClick={() => handleDeleteMenu(item.id)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
            </div>
          )}

          {activeTab === 'images' && (
          <div style={styles.card}>
            <h3>Hình ảnh quán</h3>
            <form className="owner-image-form" onSubmit={handleCreateImage} style={styles.imageForm}>
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
              {images.map((img) => (
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

        {activeTab === 'tags' && (
          <div style={styles.card}>
            <h3>Gán tags cho quán</h3>
            <p style={styles.tagHint}>Chủ quán có thể tự chọn tags phù hợp; admin vẫn có thể chỉnh lại nếu cần.</p>

            <div style={styles.tagGrid}>
              {allTags.map((tag) => {
                const selected = selectedTagIds.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    style={{
                      ...styles.tagChip,
                      ...(selected ? styles.tagChipActive : {}),
                      borderColor: tag.color || '#64748b',
                      backgroundColor: selected ? (tag.color || '#2563eb') : '#fff'
                    }}
                  >
                    {tag.icon || '🏷️'} {tag.name}
                  </button>
                )
              })}
            </div>

            <div style={{ marginTop: '14px' }}>
              <button type="button" onClick={handleSaveTags} disabled={savingTags}>
                {savingTags ? 'Đang lưu...' : '💾 Lưu tags'}
              </button>
            </div>
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
    display: 'flex',
    flexDirection: 'column',
    background: '#eef2f7'
  },
  topBar: {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    background: 'linear-gradient(130deg, #0e203f 0%, #17385a 56%, #1c4b66 100%)',
    borderBottom: '1px solid rgba(169, 200, 230, 0.26)',
    boxShadow: '0 14px 30px rgba(5, 17, 35, 0.28)',
    padding: '14px 18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
    transition: 'transform 0.26s ease, box-shadow 0.26s ease',
    willChange: 'transform'
  },
  topBarHidden: {
    transform: 'translateY(calc(-100% - 8px))',
    boxShadow: 'none'
  },
  topBarMobile: {
    height: 'auto',
    padding: '14px 16px 14px',
    alignItems: 'stretch',
    gap: '12px',
    flexDirection: 'column',
    borderBottomLeftRadius: '24px',
    borderBottomRightRadius: '24px',
    boxShadow: '0 8px 24px rgba(12, 23, 43, 0.4)'
  },
  topBarHeadMobile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px'
  },
  topBarBrand: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: '250px'
  },
  topBarBrandMobile: {
    minWidth: 0,
    gap: '10px',
    flex: 1
  },
  brandDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #79d8ff 0%, #77f2ce 100%)',
    boxShadow: '0 0 16px rgba(121, 216, 255, 0.8)'
  },
  topBarTitle: {
    color: '#eff7ff',
    fontWeight: '700',
    fontSize: '20px',
    letterSpacing: '0.2px'
  },
  topBarSub: {
    color: 'rgba(208, 223, 243, 0.85)',
    fontSize: '12px',
    letterSpacing: '0.4px',
    textTransform: 'uppercase',
    marginTop: '2px'
  },
  topBarSubMobile: {
    fontSize: '10px',
    letterSpacing: '0.25px'
  },
  topBarNav: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap'
  },
  topBarNavMobile: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    justifyContent: 'center',
    width: '100%',
    paddingBottom: '2px'
  },
  topBarButton: {
    cursor: 'pointer'
  },
  topBarButtonMobile: {
    width: 'auto',
    minWidth: '80px'
  },
  topBarLogout: {
    border: '1px solid rgba(132, 160, 195, 0.42)',
    background: 'linear-gradient(135deg, rgba(18, 59, 117, 0.84) 0%, rgba(18, 98, 122, 0.84) 100%)',
    color: '#f0f6ff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '700'
  },
  topBarLogoutCompactMobile: {
    width: 'auto',
    minWidth: '102px',
    fontSize: '13px',
    padding: '0 12px'
  },
  main: {
    padding: '24px',
    background: 'radial-gradient(860px 340px at 10% -12%, rgba(62, 118, 201, 0.16), transparent 70%), radial-gradient(760px 280px at 90% 0%, rgba(50, 146, 162, 0.12), transparent 72%), linear-gradient(160deg, #ebf2fb 0%, #e4edf8 100%)'
  },
  title: {
    marginTop: 0,
    marginBottom: '18px',
    fontSize: '36px',
    fontWeight: '750',
    color: '#11203a',
    letterSpacing: '-0.02em'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '14px',
    marginBottom: '18px'
  },
  statCard: {
    background: 'linear-gradient(165deg, rgba(255,255,255,0.96) 0%, rgba(246, 250, 255, 0.94) 100%)',
    borderRadius: '14px',
    padding: '14px 16px',
    border: '1px solid rgba(188, 208, 233, 0.92)',
    boxShadow: '0 12px 24px rgba(22, 35, 61, 0.1), inset 0 0 0 1px rgba(207, 222, 241, 0.38)'
  },
  statLabel: {
    color: '#4a6281',
    fontSize: '13px',
    fontWeight: '600'
  },
  statValue: {
    fontSize: '40px',
    lineHeight: 1,
    fontWeight: '800',
    color: '#132745',
    marginTop: '4px'
  },
  card: {
    background: 'linear-gradient(165deg, rgba(255,255,255,0.96) 0%, rgba(246, 250, 255, 0.93) 100%)',
    borderRadius: '16px',
    border: '1px solid rgba(188, 208, 233, 0.82)',
    boxShadow: '0 18px 32px rgba(22, 35, 61, 0.12), inset 0 0 0 1px rgba(207, 222, 241, 0.4)',
    padding: '20px'
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '12px',
    marginBottom: '12px'
  },
  inlineForm: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    marginBottom: '14px'
  },
  table: {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: 0,
    borderRadius: '12px',
    overflow: 'hidden',
    border: '1px solid #c6daf4',
    boxShadow: '0 8px 20px rgba(20, 50, 92, 0.1)',
    fontSize: '14px'
  },
  compactActionGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  compactActionButton: {
    width: '34px',
    minWidth: '34px',
    height: '34px',
    padding: 0,
    borderRadius: '10px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    lineHeight: 1
  },
  compactActionButtonDanger: {
    width: '34px',
    minWidth: '34px',
    height: '34px',
    padding: 0,
    borderRadius: '10px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    lineHeight: 1,
    background: 'linear-gradient(135deg, #bb2e2e 0%, #df3f3f 100%)',
    borderColor: 'rgba(255, 185, 185, 0.65)',
    boxShadow: '0 10px 18px rgba(138, 23, 23, 0.3)'
  },
  menuCard: {
    borderRadius: '12px',
    border: '1px solid #c9dcf2',
    background: 'linear-gradient(180deg, #fafdff 0%, #eef6ff 100%)',
    padding: '12px',
    boxShadow: '0 10px 18px rgba(18, 41, 76, 0.12)'
  },
  menuCardHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px'
  },
  menuCardName: {
    fontWeight: '700',
    color: '#163454',
    fontSize: '15px'
  },
  menuCardPrice: {
    color: '#1f3f62',
    fontWeight: '700',
    fontSize: '14px'
  },
  menuCardActions: {
    marginTop: '10px',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px'
  },
  imageForm: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
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
    border: '1px solid #d2e1f3',
    borderRadius: '12px',
    overflow: 'hidden',
    background: 'linear-gradient(180deg, #fafdff 0%, #f2f7ff 100%)',
    boxShadow: '0 8px 18px rgba(22, 42, 74, 0.12)'
  },
  image: {
    width: '100%',
    height: '150px',
    objectFit: 'cover'
  },
  imageMeta: {
    padding: '10px 12px',
    color: '#1f3b5b'
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
  tagHint: {
    color: '#4f627e',
    fontSize: '14px',
    marginTop: 0
  },
  tagGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px'
  },
  tagChip: {
    padding: '8px 12px',
    border: '1px solid #c4d7ed',
    borderRadius: '999px',
    background: '#fff',
    color: '#1d3857',
    cursor: 'pointer',
    fontWeight: '700',
    boxShadow: '0 6px 12px rgba(22, 42, 74, 0.08)'
  },
  tagChipActive: {
    color: '#fff'
  },
  loading: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
}

export default OwnerDashboard


