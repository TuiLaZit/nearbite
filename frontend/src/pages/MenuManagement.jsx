import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { BASE_URL } from '../config'

function MenuManagement() {
  const { restaurantId } = useParams()
  const navigate = useNavigate()
  const [menuItems, setMenuItems] = useState([])
  const [editingItemId, setEditingItemId] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    price: ''
  })

  useEffect(() => {
    loadMenu()
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
        setEditingItemId(null)
        setFormData({ name: '', price: '' })
        loadMenu()
      })
      .catch(err => console.error('Error saving menu item:', err))
  }

  const handleEdit = (item) => {
    setEditingItemId(item.id)
    setFormData({
      name: item.name,
      price: item.price.toString()
    })
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

  return (
    <div className="container">
      <button onClick={handleGoBack}>⬅️ Quay lại trang Admin</button>
      <h1>🍽 Quản lý menu</h1>

      <h3>Thêm / sửa món</h3>
      <form onSubmit={handleSubmit}>
        <input
          name="name"
          placeholder="Tên món"
          value={formData.name}
          onChange={handleFormChange}
          required
        />
        <input
          name="price"
          placeholder="Giá"
          value={formData.price}
          onChange={handleFormChange}
          type="number"
          required
        />
        <button type="submit">💾 Lưu</button>
      </form>

      <hr />

      <h3>Danh sách món</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {menuItems.map(item => (
          <li key={item.id} style={{ margin: '10px 0', padding: '10px', border: '1px solid #ddd' }}>
            {item.name} - {item.price}đ
            <button onClick={() => handleEdit(item)} style={{ marginLeft: '10px' }}>✏️</button>
            <button onClick={() => handleDelete(item.id)} style={{ marginLeft: '5px' }}>🗑</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default MenuManagement
