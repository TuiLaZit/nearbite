import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BASE_URL } from '../config'

function AdminLogin({
  role = 'admin',
  redirectPath = '/admin',
  title = '🍜 Admin Login',
  placeholder = 'Mật khẩu'
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()

    try {
      const response = await fetch(`${BASE_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      })

      if (response.ok) {
        localStorage.setItem('activeRole', role)
        navigate(redirectPath)
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
      <button type="button" onClick={() => navigate('/owner/login')} style={{ marginBottom: '16px' }}>
        ← Quay lại đăng nhập chủ quán
      </button>
      <h1>{title}</h1>
      <form onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="Email admin"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder={placeholder}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit">Login</button>
      </form>
    </div>
  )
}

export default AdminLogin
