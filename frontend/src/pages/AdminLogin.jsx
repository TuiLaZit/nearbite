import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BASE_URL } from '../config'

function AdminLogin() {
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()

    try {
      const response = await fetch(`${BASE_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password })
      })

      if (response.ok) {
        navigate('/admin')
      } else {
        alert('Sai mật khẩu')
      }
    } catch (error) {
      console.error('Login error:', error)
      alert('Có lỗi xảy ra khi đăng nhập')
    }
  }

  return (
    <div className="container">
      <h1>🍜 Admin Login</h1>
      <form onSubmit={handleLogin}>
        <input
          type="password"
          placeholder="Admin password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit">Login</button>
      </form>
    </div>
  )
}

export default AdminLogin
