import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BASE_URL } from '../config'

function OwnerLogin() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch(`${BASE_URL}/owner/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Đăng nhập thất bại')
      }

      localStorage.setItem('activeRole', 'owner')
      navigate('/owner', { replace: true })
    } catch (error) {
      alert(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container" style={{ maxWidth: '460px', paddingTop: '48px' }}>
      <button onClick={() => navigate('/')} style={{ marginBottom: '16px' }}>
        ← Quay lại
      </button>
      <h1>🏪 Đăng nhập chủ quán</h1>
      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', color: '#9a3412' }}>
        Trang này chỉ dành cho chủ quán.
        Tài khoản là <strong>username quán</strong> (ví dụ: bc4), không phải email.
      </div>
      <form onSubmit={handleLogin}>
        <label style={{ display: 'block', marginBottom: '8px' }}>Tài khoản:</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Ví dụ: bc4"
          required
        />

        <label style={{ display: 'block', marginTop: '12px', marginBottom: '8px' }}>Mật khẩu:</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>

      <div style={{ marginTop: '12px' }}>
        <button
          type="button"
          onClick={() => navigate('/admin/login')}
          style={{
            background: '#1e293b',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '10px 14px',
            cursor: 'pointer'
          }}
        >
          🛡️ Tôi là admin
        </button>
      </div>
    </div>
  )
}

export default OwnerLogin
