import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BASE_URL } from '../config'
import { setAuthUserIdFromPayload } from '../utils/authUser'

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

  const buildSessionPersistenceError = () => {
    const isStandalone = typeof window !== 'undefined' && (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator?.standalone === true
    )

    if (isStandalone) {
      return 'Đăng nhập thành công nhưng session cookie bị chặn trong PWA (frontend/backend khác domain). Hãy bật SESSION_COOKIE_PARTITIONED=true ở backend hoặc dùng cùng domain API qua /api proxy.'
    }

    return 'Đăng nhập thành công nhưng không giữ được phiên đăng nhập. Kiểm tra cấu hình cookie/CORS của backend.'
  }

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
        const payload = await response.json().catch(() => ({}))
        setAuthUserIdFromPayload(payload)

        const checkResponse = await fetch(`${BASE_URL}/admin/check`, {
          credentials: 'include'
        })
        if (!checkResponse.ok) {
          setError(buildSessionPersistenceError())
          return
        }

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
          border: 1px solid rgba(223, 232, 244, 0.22);
          box-shadow: 0 34px 70px rgba(2, 7, 20, 0.5);
          background: #f6f9ff;
          backdrop-filter: blur(18px);
        }

        .admin-login-brand {
          padding: 54px 48px;
          background:
            linear-gradient(160deg, #0f2036 0%, #183a57 58%, #1f4b66 100%);
          border-right: 1px solid rgba(255, 255, 255, 0.18);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 20px;
          color: #eef6ff;
        }

        .admin-login-brand h2 {
          margin: 0;
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(42px, 4vw, 58px);
          letter-spacing: 0.8px;
          color: #f7fbff;
          line-height: 0.95;
        }

        .admin-login-brand p {
          margin: 0;
          color: rgba(231, 241, 255, 0.9);
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
          border: 1px solid rgba(180, 211, 241, 0.28);
          background: rgba(11, 31, 50, 0.34);
        }

        .admin-login-metric span {
          display: block;
          font-size: 22px;
          font-weight: 700;
          color: #f4fbff;
        }

        .admin-login-metric small {
          color: rgba(225, 238, 255, 0.82);
          font-size: 12px;
        }

        .login-card {
          padding: 54px 46px;
          background:
            linear-gradient(170deg, #ffffff 0%, #eef4ff 100%);
          position: relative;
          color: #10243f;
        }

        .header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }

        .header-text {
          margin: 0 0 26px;
          color: #3c516b;
          font-size: 14px;
          line-height: 1.5;
        }

        .shield-icon {
          width: 32px;
          height: 32px;
          color: #133c61;
        }

        h1 {
          margin: 0;
          color: #10243f;
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
          color: #24405d;
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
          background-color: rgba(255, 255, 255, 0.98);
          color: #12263f;
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
          padding: 10px 14px 10px 10px;
          background: linear-gradient(180deg, #ffffff 0%, #f0f6ff 100%);
          color: #183a5d;
          border: 1px solid rgba(172, 194, 220, 0.9);
          border-radius: 12px;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.1px;
          box-shadow: 0 6px 14px rgba(22, 52, 84, 0.1);
          display: inline-flex;
          align-items: center;
          gap: 10px;
          width: fit-content;
          transition: all 0.22s ease;
        }

        .back-button-icon {
          width: 26px;
          height: 26px;
          border-radius: 999px;
          background: linear-gradient(135deg, #d8e8fb 0%, #c1d8f6 100%);
          border: 1px solid rgba(140, 170, 205, 0.9);
          color: #123a63;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          flex: 0 0 auto;
        }

        .back-button-text {
          display: inline-block;
          text-align: left;
        }

        .back-button:hover {
          background: linear-gradient(180deg, #ffffff 0%, #e8f2ff 100%);
          border-color: rgba(118, 157, 201, 0.95);
          transform: translateY(-1px);
          box-shadow: 0 10px 18px rgba(22, 52, 84, 0.16);
          filter: brightness(1.01);
        }

        .back-button:hover .back-button-icon {
          transform: translateX(-1px);
        }

        .back-button:active {
          transform: translateY(0);
          box-shadow: 0 6px 10px rgba(22, 52, 84, 0.14);
        }

        button {
          margin-top: 8px;
          padding: 14px 16px;
          background: linear-gradient(140deg, #0f5d5c 0%, #164d66 100%);
          color: #f5fbff;
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

          .back-button {
            width: 100%;
            justify-content: center;
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
              <span className="back-button-icon">←</span>
              <span className="back-button-text">Quay lại đăng nhập khách/chủ quán</span>
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
