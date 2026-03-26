import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BASE_URL } from '../config'
import { setAuthUserIdFromPayload } from '../utils/authUser'

function OwnerLogin() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    document.body.classList.add('owner-login-body')
    return () => {
      document.body.classList.remove('owner-login-body')
    }
  }, [])

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

      setAuthUserIdFromPayload(data)
      localStorage.setItem('activeRole', 'owner')
      navigate('/owner', { replace: true })
    } catch (error) {
      alert(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        body.owner-login-body {
          margin: 0;
          min-height: 100vh;
          background:
            radial-gradient(900px 520px at 8% 12%, rgba(197, 156, 84, 0.2), transparent 60%),
            radial-gradient(820px 480px at 92% 88%, rgba(22, 77, 76, 0.16), transparent 65%),
            linear-gradient(135deg, #071217 0%, #0f172a 46%, #152238 100%);
          font-family: 'Plus Jakarta Sans', 'Segoe UI', sans-serif;
        }

        .owner-login-shell {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }

        .owner-login-grid {
          width: min(1080px, 100%);
          display: grid;
          grid-template-columns: 1.05fr 1fr;
          border-radius: 24px;
          overflow: hidden;
          border: 1px solid rgba(223, 232, 244, 0.22);
          box-shadow: 0 34px 70px rgba(2, 7, 20, 0.5);
          background: #f6f9ff;
          backdrop-filter: blur(18px);
        }

        .owner-login-brand {
          padding: 52px 44px;
          background: linear-gradient(160deg, #0f2036 0%, #183a57 58%, #1f4b66 100%);
          border-right: 1px solid rgba(255, 255, 255, 0.18);
          color: #eef6ff;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 20px;
        }

        .owner-login-brand h2 {
          margin: 0;
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(40px, 4vw, 56px);
          letter-spacing: 0.8px;
          color: #f7fbff;
          line-height: 0.95;
        }

        .owner-login-brand p {
          margin: 0;
          color: rgba(231, 241, 255, 0.9);
          line-height: 1.65;
          font-size: 15px;
        }

        .owner-login-card {
          padding: 48px 42px;
          background: linear-gradient(170deg, #ffffff 0%, #eef4ff 100%);
        }

        .owner-login-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 18px;
        }

        .owner-back-btn,
        .owner-admin-btn {
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #cad6e3;
          background: rgba(20, 44, 70, 0.08);
          color: #183a5d;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .owner-admin-btn {
          background: #1e293b;
          color: #fff;
          border-color: #1e293b;
        }

        .owner-login-card h1 {
          margin: 0;
          color: #10243f;
          font-size: 28px;
          font-weight: 750;
          letter-spacing: -0.02em;
        }

        .owner-note {
          margin: 12px 0 16px;
          padding: 12px;
          background: #fff7ed;
          border: 1px solid #fed7aa;
          border-radius: 10px;
          color: #7c2d12;
          font-size: 13px;
          line-height: 1.5;
        }

        .owner-login-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .owner-label {
          font-size: 13px;
          font-weight: 600;
          color: #24405d;
        }

        .owner-input {
          width: 100%;
          padding: 14px 16px;
          border: 1px solid #cad6e3;
          border-radius: 12px;
          font-size: 15px;
          background: rgba(255, 255, 255, 0.98);
          color: #12263f;
        }

        .owner-primary-btn {
          margin-top: 6px;
          padding: 14px 16px;
          border: none;
          border-radius: 12px;
          background: linear-gradient(140deg, #0f5d5c 0%, #164d66 100%);
          color: #f5fbff;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 14px 22px rgba(15, 73, 88, 0.32);
        }

        .owner-primary-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        @media (max-width: 920px) {
          .owner-login-grid {
            grid-template-columns: 1fr;
            max-width: 580px;
          }

          .owner-login-brand {
            border-right: none;
            border-bottom: 1px solid rgba(205, 214, 228, 0.16);
            padding: 30px 24px;
          }

          .owner-login-card {
            padding: 30px 24px;
          }
        }

        @media (max-width: 640px) {
          .owner-login-shell {
            padding: 14px;
            align-items: flex-start;
          }

          .owner-login-grid {
            border-radius: 18px;
            margin-top: 8px;
          }

          .owner-login-brand {
            padding: 18px 14px;
            gap: 10px;
          }

          .owner-login-brand h2 {
            font-size: clamp(30px, 10vw, 38px);
          }

          .owner-login-brand p {
            display: none;
          }

          .owner-login-card {
            padding: 18px 14px;
          }

          .owner-login-top {
            flex-direction: column;
            align-items: stretch;
          }

          .owner-back-btn,
          .owner-admin-btn {
            width: 100%;
          }

          .owner-login-card h1 {
            font-size: 24px;
          }

          .owner-input {
            padding: 12px 13px;
            border-radius: 10px;
            font-size: 14px;
          }

          .owner-primary-btn {
            padding: 12px 14px;
            border-radius: 10px;
            font-size: 14px;
          }
        }
      `}</style>

      <div className="owner-login-shell">
        <div className="owner-login-grid">
          <aside className="owner-login-brand">
            <div>
              <h2>NearBite</h2>
            </div>
            <p>
              Không gian dành cho chủ quán để quản lý danh mục món, hình ảnh và hoạt động kinh doanh của cửa hàng.
            </p>
          </aside>

          <div className="owner-login-card">
            <div className="owner-login-top">
              <button className="owner-back-btn" onClick={() => navigate('/')}>← Quay lại</button>
              <button className="owner-admin-btn" type="button" onClick={() => navigate('/admin/login')}>
                🛡️ Tôi là admin
              </button>
            </div>

            <h1>🏪 Đăng nhập chủ quán</h1>
            <div className="owner-note">
              Trang này chỉ dành cho chủ quán. Tài khoản là <strong>username quán</strong> (ví dụ: bc4), không phải email.
            </div>

            <form className="owner-login-form" onSubmit={handleLogin}>
              <label className="owner-label">Tài khoản:</label>
              <input
                className="owner-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ví dụ: bc4"
                required
              />

              <label className="owner-label">Mật khẩu:</label>
              <input
                className="owner-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <button className="owner-primary-btn" type="submit" disabled={loading}>
                {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}

export default OwnerLogin
