import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BASE_URL } from '../config'

function AdminLogin({
  role = 'admin',
  redirectPath = '/admin',
  title = 'Đăng nhập Admin',
  placeholder = 'Mật khẩu'
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    document.body.classList.add('admin-login-body')
    return () => {
      document.body.classList.remove('admin-login-body')
    }
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

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
        const contentType = response.headers.get('content-type') || ''
        const payload = contentType.includes('application/json')
          ? await response.json().catch(() => ({}))
          : {}

        if (payload.error) {
          setError(payload.error)
        } else if (response.status >= 500) {
          setError('Server đang lỗi nội bộ. Vui lòng kiểm tra backend logs.')
        } else if (response.status === 404) {
          setError('Không tìm thấy endpoint admin login. Kiểm tra cấu hình VITE_BASE_URL trên frontend deploy.')
        } else {
          setError(`Đăng nhập thất bại (HTTP ${response.status}).`)
        }
      }
    } catch (error) {
      console.error('Login error:', error)
      setError('Không thể kết nối server. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        body.admin-login-body {
          margin: 0;
          min-height: 100vh;
          background:
            radial-gradient(900px 520px at 8% 12%, rgba(197, 156, 84, 0.2), transparent 60%),
            radial-gradient(820px 480px at 92% 88%, rgba(22, 77, 76, 0.16), transparent 65%),
            linear-gradient(135deg, #071217 0%, #0f172a 46%, #152238 100%);
          color: #000;
          font-family: 'Plus Jakarta Sans', 'Segoe UI', sans-serif;
        }

        .admin-login-shell {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }

        .admin-login-shell::before,
        .admin-login-shell::after {
          content: "";
          position: absolute;
          width: 360px;
          height: 360px;
          border-radius: 50%;
          filter: blur(90px);
          z-index: -1;
          opacity: 0.45;
        }

        .admin-login-shell::before {
          top: -120px;
          left: -80px;
          background: rgba(230, 172, 83, 0.52);
        }

        .admin-login-shell::after {
          right: -120px;
          bottom: -160px;
          background: rgba(67, 132, 128, 0.48);
        }

        .admin-login-grid {
          width: min(1080px, 100%);
          display: grid;
          grid-template-columns: 1.1fr 1fr;
          border-radius: 26px;
          overflow: hidden;
          border: 1px solid rgba(223, 232, 244, 0.18);
          box-shadow: 0 34px 70px rgba(2, 7, 20, 0.45);
          background: rgba(255, 255, 255, 0.94);
          backdrop-filter: blur(18px);
        }

        .admin-login-brand {
          padding: 54px 48px;
          background:
            linear-gradient(160deg, rgba(247, 250, 255, 0.98) 0%, rgba(236, 242, 249, 0.94) 100%);
          border-right: 1px solid rgba(205, 214, 228, 0.16);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 20px;
          color: #000;
        }

        .admin-login-brand h2 {
          margin: 0;
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(42px, 4vw, 58px);
          letter-spacing: 0.8px;
          color: #000;
          line-height: 0.95;
        }

        .admin-login-brand p {
          margin: 0;
          color: #000;
          line-height: 1.65;
          font-size: 15px;
        }

        .admin-login-metrics {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .admin-login-metric {
          padding: 14px;
          border-radius: 14px;
          border: 1px solid rgba(227, 236, 246, 0.16);
          background: rgba(255, 255, 255, 0.95);
        }

        .admin-login-metric span {
          display: block;
          font-size: 22px;
          font-weight: 700;
          color: #000;
        }

        .admin-login-metric small {
          color: #000;
          font-size: 12px;
        }

        .login-card {
          padding: 54px 46px;
          background:
            linear-gradient(170deg, rgba(246, 250, 255, 0.98) 0%, rgba(236, 242, 249, 0.94) 100%);
          position: relative;
        }

        .header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }

        .header-text {
          margin: 0 0 26px;
          color: #000;
          font-size: 14px;
          line-height: 1.5;
        }

        .shield-icon {
          width: 32px;
          height: 32px;
          color: #000;
        }

        h1 {
          margin: 0;
          color: #000;
          font-size: 30px;
          font-weight: 750;
          letter-spacing: -0.02em;
        }

        form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .field-label {
          font-size: 13px;
          color: #000;
          text-align: left;
          font-weight: 600;
          margin: 2px 0;
        }

        input {
          width: 100%;
          padding: 14px 16px;
          border: 1px solid #cad6e3;
          border-radius: 12px;
          font-size: 15px;
          background-color: rgba(255, 255, 255, 0.86);
          color: #000;
          transition: all 0.22s ease;
        }

        input::placeholder {
          color: #4b5563;
        }

        input:focus {
          outline: none;
          border-color: #0f5d5c;
          box-shadow: 0 0 0 5px rgba(22, 93, 92, 0.14);
        }

        .error-message {
          margin-top: 4px;
          text-align: left;
          font-size: 13px;
          color: #bd1f34;
          background: rgba(189, 31, 52, 0.08);
          border: 1px solid rgba(189, 31, 52, 0.24);
          border-radius: 10px;
          padding: 10px 12px;
        }

        .back-button {
          margin-top: 0;
          margin-bottom: 14px;
          padding: 10px 14px;
          background: rgba(18, 32, 54, 0.08);
          color: #000;
          border: 1px solid #cad6e3;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          box-shadow: none;
        }

        .back-button:hover {
          background: rgba(18, 32, 54, 0.12);
          transform: none;
          filter: none;
        }

        button {
          margin-top: 8px;
          padding: 14px 16px;
          background: linear-gradient(140deg, #0f5d5c 0%, #164d66 100%);
          color: #000;
          border: none;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.2px;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
          box-shadow: 0 14px 22px rgba(15, 73, 88, 0.32);
        }

        button:hover {
          filter: brightness(1.06);
          transform: translateY(-1px);
        }

        button:disabled {
          cursor: not-allowed;
          opacity: 0.78;
          transform: none;
          filter: grayscale(0.1);
        }

        @media (max-width: 920px) {
          .admin-login-grid {
            grid-template-columns: 1fr;
            max-width: 580px;
          }

          .admin-login-brand {
            border-right: none;
            border-bottom: 1px solid rgba(205, 214, 228, 0.16);
            padding: 34px 26px;
          }

          .login-card {
            padding: 34px 26px;
          }
        }
      `}</style>
      <div className="admin-login-shell">
        <div className="admin-login-grid">
          <aside className="admin-login-brand">
            <div>
              <h2>NearBite</h2>
              <p>Control Suite</p>
            </div>
            <p>
              Quản trị vận hành hệ thống, theo dõi chỉ số tăng trưởng, và quản lý dữ liệu nhà hàng trong một giao diện hiện đại.
            </p>
            <div className="admin-login-metrics">
              <div className="admin-login-metric">
                <span>24/7</span>
                <small>Realtime Monitoring</small>
              </div>
              <div className="admin-login-metric">
                <span>Secured</span>
                <small>Session Protection</small>
              </div>
            </div>
          </aside>

          <div className="login-card">
            <button type="button" className="back-button" onClick={() => navigate('/login')}>
              ← Quay lại đăng nhập khách/chủ quán
            </button>

            <div className="header">
              <svg className="shield-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
              </svg>
              <h1>{title}</h1>
            </div>
            <p className="header-text">Đăng nhập để truy cập không gian quản trị và điều phối toàn bộ dữ liệu NearBite.</p>

            <form onSubmit={handleLogin}>
              <label className="field-label">Email quản trị</label>
              <input
                type="email"
                placeholder="abc@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <label className="field-label">Mật khẩu</label>
              <input
                type="password"
                placeholder={placeholder}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              {error && <div className="error-message">{error}</div>}

              <button type="submit" disabled={loading}>
                {loading ? 'Đang xác thực...' : 'Đăng nhập quản trị'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}

export default AdminLogin
