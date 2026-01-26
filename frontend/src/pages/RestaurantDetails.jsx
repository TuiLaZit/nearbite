import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { BASE_URL } from '../config'

function RestaurantDetails() {
  const { restaurantId } = useParams()
  const navigate = useNavigate()
  const [restaurant, setRestaurant] = useState(null)
  const [activeTab, setActiveTab] = useState('menu') // menu, tags, images
  
  // Menu state
  const [menuItems, setMenuItems] = useState([])
  const [editingMenuId, setEditingMenuId] = useState(null)
  const [menuFormData, setMenuFormData] = useState({ name: '', price: '' })
  
  // Tags state
  const [allTags, setAllTags] = useState([])
  const [restaurantTags, setRestaurantTags] = useState([])
  
  // Images state
  const [images, setImages] = useState([])
  const [editingImageId, setEditingImageId] = useState(null)
  const [imageFormData, setImageFormData] = useState({
    image_url: '',
    caption: '',
    display_order: 0,
    is_primary: false
  })
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    loadRestaurantDetails()
    loadAllTags()
  }, [restaurantId])

  const loadRestaurantDetails = () => {
    fetch(`${BASE_URL}/admin/restaurants/${restaurantId}/details`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        setRestaurant(data)
        setMenuItems(data.menu || [])
        setRestaurantTags(data.tags || [])
        setImages(data.images || [])
      })
      .catch(err => console.error('Error loading restaurant details:', err))
  }

  const loadAllTags = () => {
    fetch(`${BASE_URL}/admin/tags`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => setAllTags(data))
      .catch(err => console.error('Error loading tags:', err))
  }

  // ===== MENU FUNCTIONS =====
  
  const handleMenuFormChange = (e) => {
    setMenuFormData({
      ...menuFormData,
      [e.target.name]: e.target.value
    })
  }

  const handleMenuSubmit = (e) => {
    e.preventDefault()

    const data = {
      name: menuFormData.name,
      price: parseInt(menuFormData.price)
    }

    const method = editingMenuId ? 'PUT' : 'POST'
    const url = editingMenuId
      ? `${BASE_URL}/admin/menu/${editingMenuId}`
      : `${BASE_URL}/admin/restaurants/${restaurantId}/menu`

    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    })
      .then(() => {
        setEditingMenuId(null)
        setMenuFormData({ name: '', price: '' })
        loadRestaurantDetails()
      })
      .catch(err => console.error('Error saving menu item:', err))
  }

  const handleEditMenu = (item) => {
    setEditingMenuId(item.id)
    setMenuFormData({
      name: item.name,
      price: item.price.toString()
    })
  }

  const handleDeleteMenu = (id) => {
    if (!confirm('Xoá món này?')) return

    fetch(`${BASE_URL}/admin/menu/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
      .then(() => loadRestaurantDetails())
      .catch(err => console.error('Error deleting menu item:', err))
  }

  // ===== TAG FUNCTIONS =====
  
  const handleAddTag = (tagId) => {
    fetch(`${BASE_URL}/admin/restaurants/${restaurantId}/tags/${tagId}`, {
      method: 'POST',
      credentials: 'include'
    })
      .then(() => loadRestaurantDetails())
      .catch(err => console.error('Error adding tag:', err))
  }

  const handleRemoveTag = (tagId) => {
    fetch(`${BASE_URL}/admin/restaurants/${restaurantId}/tags/${tagId}`, {
      method: 'DELETE',
      credentials: 'include'
    })
      .then(() => loadRestaurantDetails())
      .catch(err => console.error('Error removing tag:', err))
  }

  const isTagSelected = (tagId) => {
    return restaurantTags.some(tag => tag.id === tagId)
  }

  // ===== IMAGE FUNCTIONS =====
  
  const handleImageFormChange = (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setImageFormData({
      ...imageFormData,
      [e.target.name]: value
    })
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      setSelectedFile(file)
      // Create preview URL
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreviewUrl(reader.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleImageSubmit = async (e) => {
    e.preventDefault()
    
    setUploading(true)
    
    try {
      let imageUrl = imageFormData.image_url

      // If new file is selected, upload it first
      if (selectedFile && !editingImageId) {
        const formData = new FormData()
        formData.append('file', selectedFile)

        const uploadRes = await fetch(`${BASE_URL}/admin/upload-image`, {
          method: 'POST',
          credentials: 'include',
          body: formData
        })

        if (!uploadRes.ok) {
          const error = await uploadRes.json()
          throw new Error(error.error || 'Upload failed')
        }

        const uploadData = await uploadRes.json()
        imageUrl = uploadData.url
      }

      // Now save the image record
      const data = {
        image_url: imageUrl,
        caption: imageFormData.caption,
        display_order: editingImageId ? parseInt(imageFormData.display_order) : images.length, // Auto: số ảnh hiện tại
        is_primary: imageFormData.is_primary
      }

      const method = editingImageId ? 'PUT' : 'POST'
      const url = editingImageId
        ? `${BASE_URL}/admin/images/${editingImageId}`
        : `${BASE_URL}/admin/restaurants/${restaurantId}/images`

      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      })

      // Reset form
      setEditingImageId(null)
      setImageFormData({ image_url: '', caption: '', display_order: 0, is_primary: false })
      setSelectedFile(null)
      setPreviewUrl(null)
      loadRestaurantDetails()
    } catch (err) {
      console.error('Error saving image:', err)
      alert(err.message || 'Lỗi khi lưu hình ảnh')
    } finally {
      setUploading(false)
    }
  }

  const handleEditImage = (image) => {
    setEditingImageId(image.id)
    setImageFormData({
      image_url: image.image_url,
      caption: image.caption || '',
      display_order: image.display_order.toString(),
      is_primary: image.is_primary
    })
    setSelectedFile(null)
    setPreviewUrl(null)
  }

  const handleCancelEditImage = () => {
    setEditingImageId(null)
    setImageFormData({ image_url: '', caption: '', display_order: 0, is_primary: false })
    setSelectedFile(null)
    setPreviewUrl(null)
  }

  const handleDeleteImage = (id) => {
    if (!confirm('Xóa hình ảnh này?')) return

    fetch(`${BASE_URL}/admin/images/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
      .then(() => loadRestaurantDetails())
      .catch(err => console.error('Error deleting image:', err))
  }

  const handleGoBack = () => {
    navigate('/admin')
  }

  if (!restaurant) {
    return <div className="container">Đang tải...</div>
  }

  return (
    <div className="container">
      <button onClick={handleGoBack}>⬅️ Quay lại trang Admin</button>
      <h1>📍 Chi tiết quán: {restaurant.name}</h1>
      
      {/* Tab Navigation */}
      <div style={{ 
        display: 'flex', 
        gap: '10px', 
        borderBottom: '2px solid #ddd', 
        marginBottom: '20px' 
      }}>
        <button
          onClick={() => setActiveTab('menu')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderBottom: activeTab === 'menu' ? '3px solid #007bff' : 'none',
            backgroundColor: activeTab === 'menu' ? '#f8f9fa' : 'transparent',
            cursor: 'pointer',
            fontWeight: activeTab === 'menu' ? 'bold' : 'normal'
          }}
        >
          🍽️ Menu
        </button>
        <button
          onClick={() => setActiveTab('tags')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderBottom: activeTab === 'tags' ? '3px solid #007bff' : 'none',
            backgroundColor: activeTab === 'tags' ? '#f8f9fa' : 'transparent',
            cursor: 'pointer',
            fontWeight: activeTab === 'tags' ? 'bold' : 'normal'
          }}
        >
          🏷️ Tags
        </button>
        <button
          onClick={() => setActiveTab('images')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderBottom: activeTab === 'images' ? '3px solid #007bff' : 'none',
            backgroundColor: activeTab === 'images' ? '#f8f9fa' : 'transparent',
            cursor: 'pointer',
            fontWeight: activeTab === 'images' ? 'bold' : 'normal'
          }}
        >
          📸 Hình ảnh
        </button>
      </div>

      {/* MENU TAB */}
      {activeTab === 'menu' && (
        <div>
          <h3>Thêm / sửa món</h3>
          <form onSubmit={handleMenuSubmit}>
            <input
              name="name"
              placeholder="Tên món"
              value={menuFormData.name}
              onChange={handleMenuFormChange}
              required
            />
            <input
              name="price"
              placeholder="Giá"
              value={menuFormData.price}
              onChange={handleMenuFormChange}
              type="number"
              required
            />
            <button type="submit">
              {editingMenuId ? '💾 Cập nhật' : '➕ Thêm món'}
            </button>
            {editingMenuId && (
              <button type="button" onClick={() => {
                setEditingMenuId(null)
                setMenuFormData({ name: '', price: '' })
              }}>
                ❌ Hủy
              </button>
            )}
          </form>

          <hr />

          <h3>Danh sách món ({menuItems.length})</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {menuItems.map(item => (
              <li key={item.id} style={{ 
                margin: '10px 0', 
                padding: '15px', 
                border: '1px solid #ddd',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <strong>{item.name}</strong>
                  <span style={{ marginLeft: '15px', color: '#e74c3c' }}>
                    {item.price.toLocaleString()}đ
                  </span>
                </div>
                <div>
                  <button onClick={() => handleEditMenu(item)} style={{ marginLeft: '10px' }}>
                    ✏️ Sửa
                  </button>
                  <button onClick={() => handleDeleteMenu(item.id)} style={{ marginLeft: '5px' }}>
                    🗑️ Xóa
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {menuItems.length === 0 && (
            <p style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
              Chưa có món nào. Hãy thêm món mới!
            </p>
          )}
        </div>
      )}

      {/* TAGS TAB */}
      {activeTab === 'tags' && (
        <div>
          <h3>Tags hiện tại của quán</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '30px' }}>
            {restaurantTags.map(tag => (
              <div
                key={tag.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  backgroundColor: tag.color || '#3498db',
                  color: '#fff',
                  borderRadius: '20px',
                  fontSize: '14px'
                }}
              >
                <span>{tag.icon}</span>
                <span>{tag.name}</span>
                <button
                  onClick={() => handleRemoveTag(tag.id)}
                  style={{
                    background: 'rgba(255,255,255,0.3)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    cursor: 'pointer',
                    padding: 0,
                    color: '#fff'
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            {restaurantTags.length === 0 && (
              <p style={{ color: '#666' }}>Quán chưa có tag nào</p>
            )}
          </div>

          <h3>Thêm tags</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
            {allTags.map(tag => {
              const selected = isTagSelected(tag.id)
              return (
                <button
                  key={tag.id}
                  onClick={() => selected ? handleRemoveTag(tag.id) : handleAddTag(tag.id)}
                  style={{
                    padding: '12px',
                    border: selected ? `2px solid ${tag.color}` : '2px solid #ddd',
                    backgroundColor: selected ? tag.color : '#fff',
                    color: selected ? '#fff' : '#333',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontWeight: selected ? 'bold' : 'normal'
                  }}
                >
                  <span>{tag.icon}</span>
                  <span>{tag.name}</span>
                  {selected && <span>✓</span>}
                </button>
              )
            })}
          </div>
          {allTags.length === 0 && (
            <p style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
              Chưa có tag nào trong hệ thống. Hãy tạo tags trước!
            </p>
          )}
        </div>
      )}

      {/* IMAGES TAB */}
      {activeTab === 'images' && (
        <div>
          <h3>{editingImageId ? '✏️ Sửa hình ảnh' : '➕ Thêm hình ảnh mới'}</h3>
          <form onSubmit={handleImageSubmit}>
            {!editingImageId && (
              <div style={{ marginBottom: '15px' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px',
                  fontWeight: 'bold'
                }}>
                  Chọn file hình ảnh *
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  required={!editingImageId}
                  style={{
                    padding: '10px',
                    border: '2px dashed #ccc',
                    borderRadius: '8px',
                    width: '100%',
                    cursor: 'pointer'
                  }}
                />
                {previewUrl && (
                  <div style={{ marginTop: '10px' }}>
                    <img 
                      src={previewUrl} 
                      alt="Preview" 
                      style={{ 
                        maxWidth: '100%', 
                        maxHeight: '300px',
                        borderRadius: '8px',
                        border: '2px solid #ddd'
                      }} 
                    />
                  </div>
                )}
              </div>
            )}
            
            {editingImageId && (
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '8px' }}>
                  URL hình ảnh hiện tại
                </label>
                <input
                  name="image_url"
                  value={imageFormData.image_url}
                  onChange={handleImageFormChange}
                  disabled
                  style={{ backgroundColor: '#f0f0f0' }}
                />
              </div>
            )}
            
            <input
              name="caption"
              placeholder="Mô tả hình (tùy chọn)"
              value={imageFormData.caption}
              onChange={handleImageFormChange}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}>
              <input
                name="is_primary"
                type="checkbox"
                checked={imageFormData.is_primary}
                onChange={handleImageFormChange}
              />
              <span>⭐ Đặt làm ảnh chính</span>
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" disabled={uploading} style={{ flex: 1 }}>
                {uploading ? '⏳ Đang xử lý...' : (editingImageId ? '💾 Cập nhật' : '➕ Thêm hình')}
              </button>
              {editingImageId && (
                <button type="button" onClick={handleCancelEditImage} style={{ backgroundColor: '#6c757d' }}>
                  ❌ Hủy
                </button>
              )}
            </div>
          </form>

          <hr />

          <h3>Danh sách hình ảnh ({images.length})</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' }}>
            {images.map(image => (
              <div
                key={image.id}
                style={{
                  border: '2px solid #ddd',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  position: 'relative'
                }}
              >
                {image.is_primary && (
                  <div style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    backgroundColor: '#e74c3c',
                    color: '#fff',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}>
                    ⭐ Ảnh chính
                  </div>
                )}
                <img
                  src={image.image_url}
                  alt={image.caption || 'Restaurant image'}
                  style={{
                    width: '100%',
                    height: '200px',
                    objectFit: 'cover'
                  }}
                  onError={(e) => {
                    e.target.src = 'https://via.placeholder.com/250x200?text=Image+Not+Found'
                  }}
                />
                <div style={{ padding: '10px' }}>
                  {image.caption && (
                    <p style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#666' }}>
                      {image.caption}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleEditImage(image)} style={{ flex: 1, fontSize: '14px' }}>
                      ✏️ Sửa
                    </button>
                    <button onClick={() => handleDeleteImage(image.id)} style={{ flex: 1, fontSize: '14px' }}>
                      🗑️ Xóa
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {images.length === 0 && (
            <p style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
              Chưa có hình ảnh nào. Hãy thêm hình ảnh!
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default RestaurantDetails
