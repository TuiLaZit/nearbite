import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BASE_URL } from '../config'

function AdminDashboard() {
  const navigate = useNavigate()
  const [activeRestaurants, setActiveRestaurants] = useState([])
  const [hiddenRestaurants, setHiddenRestaurants] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    lat: '',
    lng: '',
    avg_eat_time: '',
    description: ''
  })

  // Check authentication
  useEffect(() => {
    fetch(`${BASE_URL}/admin/check`, {
      credentials: 'include'
    })
      .then(res => {
        if (!res.ok) {
          navigate('/admin/login')
          throw new Error('Not authenticated')
        }
        return res.json()
      })
      .catch(err => {
        if (err.message !== 'Not authenticated') {
          console.error('Check failed:', err)
        }
      })

    loadActive()
    loadHidden()
  }, [navigate])

  // Load active restaurants
  const loadActive = () => {
    fetch(`${BASE_URL}/admin/restaurants`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => setActiveRestaurants(data))
      .catch(err => console.error('Error loading active restaurants:', err))
  }

  // Load hidden restaurants
  const loadHidden = () => {
    fetch(`${BASE_URL}/admin/restaurants/hidden`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => setHiddenRestaurants(data))
      .catch(err => console.error('Error loading hidden restaurants:', err))
  }

  // Handle logout
  const handleLogout = () => {
    fetch(`${BASE_URL}/admin/logout`, {
      method: 'POST',
      credentials: 'include'
    }).then(() => {
      navigate('/admin/login')
    })
  }

  // Handle form change
  const handleFormChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  // Add or update restaurant
  const handleSubmit = (e) => {
    e.preventDefault()

    const data = {
      name: formData.name,
      lat: parseFloat(formData.lat),
      lng: parseFloat(formData.lng),
      avg_eat_time: parseInt(formData.avg_eat_time),
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
        setEditingId(null)
        setFormData({
          name: '',
          lat: '',
          lng: '',
          avg_eat_time: '',
          description: ''
        })
        loadActive()
      })
      .catch(err => console.error('Error saving restaurant:', err))
  }

  // Edit restaurant
  const handleEdit = (restaurant) => {
    setFormData({
      name: restaurant.name,
      lat: restaurant.lat.toString(),
      lng: restaurant.lng.toString(),
      avg_eat_time: restaurant.avg_eat_time.toString(),
      description: restaurant.description
    })
    setEditingId(restaurant.id)
  }

  // Hide restaurant
  const handleHide = (id) => {
    fetch(`${BASE_URL}/admin/restaurants/${id}/hide`, {
      method: 'PUT',
      credentials: 'include'
    })
      .then(() => {
        loadActive()
        loadHidden()
      })
      .catch(err => console.error('Error hiding restaurant:', err))
  }

  // Restore restaurant
  const handleRestore = (id) => {
    fetch(`${BASE_URL}/admin/restaurants/${id}/restore`, {
      method: 'PUT',
      credentials: 'include'
    })
      .then(() => {
        loadActive()
        loadHidden()
      })
      .catch(err => console.error('Error restoring restaurant:', err))
  }

  // Delete forever
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
      .then(() => loadHidden())
      .catch(err => console.error('Error deleting restaurant:', err))
  }

  // Open menu page
  const handleOpenMenu = (id) => {
    navigate(`/admin/menu/${id}`)
  }

  return (
    <div className="container">
      <h1>🍜 Admin - Quản lý quán</h1>
      <button onClick={handleLogout}>Logout</button>

      <h2>Thêm quán mới</h2>
      <form onSubmit={handleSubmit}>
        <input
          name="name"
          placeholder="Tên quán"
          value={formData.name}
          onChange={handleFormChange}
          required
        />
        <input
          name="lat"
          placeholder="Latitude"
          value={formData.lat}
          onChange={handleFormChange}
          type="number"
          step="any"
          required
        />
        <input
          name="lng"
          placeholder="Longitude"
          value={formData.lng}
          onChange={handleFormChange}
          type="number"
          step="any"
          required
        />
        <input
          name="avg_eat_time"
          placeholder="Thời gian ăn (phút)"
          value={formData.avg_eat_time}
          onChange={handleFormChange}
          type="number"
          required
        />
        <textarea
          name="description"
          placeholder="Mô tả"
          value={formData.description}
          onChange={handleFormChange}
        />
        <button type="submit">
          {editingId ? '💾 Cập nhật' : '➕ Thêm quán'}
        </button>
      </form>

      <hr />

      <h2>Quán đang hoạt động</h2>
      <table>
        <thead>
          <tr>
            <th>Tên quán</th>
            <th>Thời gian ăn</th>
            <th>Hành động</th>
          </tr>
        </thead>
        <tbody>
          {activeRestaurants.map(r => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{r.avg_eat_time} phút</td>
              <td>
                <button onClick={() => handleEdit(r)}>✏️ Sửa</button>
                <button onClick={() => handleHide(r.id)}>🙈 Ẩn</button>
                <button onClick={() => handleOpenMenu(r.id)}>🍽 Menu</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr />

      <h2>Quán đã ẩn</h2>
      <table>
        <thead>
          <tr>
            <th>Tên quán</th>
            <th>Hành động</th>
          </tr>
        </thead>
        <tbody>
          {hiddenRestaurants.map(r => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>
                <button onClick={() => handleRestore(r.id)}>↩️ Khôi phục</button>
                <button onClick={() => handleDelete(r.id, r.name)}>🔥 Xoá vĩnh viễn</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default AdminDashboard
