import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BASE_URL } from '../config'
import { useTranslation } from '../hooks/useTranslation'
import { useAppLanguage } from '../hooks/useAppLanguage'
import { setAuthUserIdFromPayload } from '../utils/authUser'
import LanguageFlagDropdown from '../components/LanguageFlagDropdown'

function LoginPortal() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedRole = searchParams.get('role')
  const initialRole = requestedRole === 'owner' ? 'owner' : 'customer'

  const [activeRole, setActiveRole] = useState(initialRole)
  const [loading, setLoading] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 1200 : window.innerWidth))

  // Customer login state
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [devOtp, setDevOtp] = useState('')

  // Owner login state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const { language, setLanguage } = useAppLanguage()
  const [languages, setLanguages] = useState([])
  const { t } = useTranslation(language)

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
    fetch(`${BASE_URL}/languages`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 'success') {
          setLanguages(Array.isArray(data.languages) ? data.languages : [])
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setActiveRole(initialRole)
  }, [initialRole])

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const switchRole = (role) => {
    setActiveRole(role)
    setSearchParams(role === 'owner' ? { role: 'owner' } : { role: 'customer' })
  }

  const handleRequestOtp = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch(`${BASE_URL}/customer/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email })
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || t('cannotSendOtp'))
      }

      setOtpSent(true)
      setDevOtp(data.debug_otp || '')
    } catch (error) {
      alert(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch(`${BASE_URL}/customer/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, otp })
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || t('invalidOtp'))
      }

      setAuthUserIdFromPayload(data)
      const checkResponse = await fetch(`${BASE_URL}/customer/check`, {
        credentials: 'include'
      })
      if (!checkResponse.ok) {
        throw new Error(buildSessionPersistenceError())
      }

      navigate('/', { replace: true })
    } catch (error) {
      alert(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleOwnerLogin = async (e) => {
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
        throw new Error(data.error || 'Dang nhap that bai')
      }

      setAuthUserIdFromPayload(data)
      const checkResponse = await fetch(`${BASE_URL}/owner/check`, {
        credentials: 'include'
      })
      if (!checkResponse.ok) {
        throw new Error(buildSessionPersistenceError())
      }

      localStorage.setItem('activeRole', 'owner')
      navigate('/owner', { replace: true })
    } catch (error) {
      alert(error.message)
    } finally {
      setLoading(false)
    }
  }

  const isMobile = viewportWidth <= 920

  return (
    <div style={styles.page}>
      <style>{`
        .login-portal-role-tab {
          transition: all 0.2s ease;
        }

        .login-portal-role-tab:hover {
          color: #0b4d89;
          border-color: #2f8de0;
          background: linear-gradient(180deg, #f0f8ff 0%, #dfefff 100%);
          box-shadow: 0 10px 18px rgba(47, 141, 224, 0.25);
          transform: translateY(-1px);
        }

        .login-portal-role-tab:active {
          transform: translateY(0);
          box-shadow: 0 5px 10px rgba(47, 141, 224, 0.18);
        }
      `}</style>
      <div style={styles.gradient} />
      <div style={{ ...styles.grid, ...(isMobile ? styles.gridMobile : {}) }}>
        <div style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : {}) }}>
          <div style={{ ...styles.topBar, ...(isMobile ? styles.topBarMobile : {}) }}>
            <button onClick={() => navigate('/')} style={{ ...styles.backButton, ...(isMobile ? styles.backButtonMobile : {}) }}>
              ← {t('back')}
            </button>
            <LanguageFlagDropdown
              value={language}
              onChange={setLanguage}
              languages={languages}
              containerStyle={{ minWidth: isMobile ? '100%' : '110px', width: isMobile ? '100%' : 'auto' }}
              triggerStyle={{ ...styles.languageSelect, ...(isMobile ? styles.languageSelectMobile : {}) }}
            />
          </div>

          <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>NearBite Login</h1>

          <div style={styles.roleTabs}>
            <button
              type="button"
              className="login-portal-role-tab"
              style={{ ...styles.roleTab, ...(activeRole === 'customer' ? styles.roleTabActive : {}) }}
              onClick={() => switchRole('customer')}
            >
              🍜 {t('customerRole')}
            </button>
            <button
              type="button"
              className="login-portal-role-tab"
              style={{ ...styles.roleTab, ...(activeRole === 'owner' ? styles.roleTabActive : {}) }}
              onClick={() => switchRole('owner')}
            >
              🏪 {t('ownerRole')}
            </button>
          </div>

          <div style={styles.contentFrame}>
            {activeRole === 'customer' ? (
              <div>
              <h2 style={styles.sectionTitle}>📩 {t('customerLoginTitle')}</h2>
              <form onSubmit={handleRequestOtp}>
                <label style={styles.label}>{t('emailLabel')}:</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  disabled={otpSent}
                  style={styles.input}
                />
                <button type="submit" disabled={loading || !email || otpSent} style={styles.submitButton}>
                  {loading ? t('sending') : t('sendOtp')}
                </button>
              </form>

              {otpSent && (
                <div style={styles.otpBox}>
                  <p style={{ marginBottom: '8px', color: '#1f3551' }}>
                    {t('otpSentToEmail', { email })}
                  </p>

                  <form onSubmit={handleVerifyOtp}>
                    <label style={styles.label}>{t('otpCodeLabel')}:</label>
                    <input
                      type="text"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder={t('otpPlaceholder')}
                      maxLength={6}
                      required
                      style={styles.input}
                    />
                    {devOtp && (
                      <p style={{ color: '#1f3551', marginTop: '8px' }}>
                        {t('otpLocalLabel')}: <strong>{devOtp}</strong>
                      </p>
                    )}
                    <div style={{ ...styles.inlineActions, ...(isMobile ? styles.inlineActionsMobile : {}) }}>
                      <button type="submit" disabled={loading || otp.length !== 6} style={styles.secondaryButton}>
                        {loading ? t('verifying') : t('verifyOtp')}
                      </button>
                      <button type="button" onClick={handleRequestOtp} disabled={loading} style={styles.secondaryButton}>
                        {t('resendOtp')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOtpSent(false)
                          setOtp('')
                          setDevOtp('')
                        }}
                        disabled={loading}
                        style={styles.secondaryButton}
                      >
                        {t('changeEmail')}
                      </button>
                    </div>
                  </form>
                </div>
              )}
              </div>
            ) : (
              <div>
              <h2 style={styles.sectionTitle}>🏪 Đăng nhập chủ quán</h2>
              <form onSubmit={handleOwnerLogin}>
                <label style={styles.label}>Tài khoản:</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ví dụ: bc4"
                  required
                  style={styles.input}
                />

                <label style={{ ...styles.label, marginTop: '12px' }}>Mật khẩu:</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={styles.input}
                />

                <button type="submit" disabled={loading} style={styles.submitButton}>
                  {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
                </button>
              </form>

              <div style={{ marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => navigate('/admin/login')}
                  style={{ ...styles.adminButton, ...(isMobile ? styles.adminButtonMobile : {}) }}
                >
                  🛡️ Tôi là Admin
                </button>
              </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    position: 'relative',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    overflow: 'hidden',
    background: '#d9ecff'
  },
  gradient: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(900px 520px at 8% 12%, rgba(120, 196, 255, 0.35), transparent 60%), radial-gradient(820px 480px at 92% 88%, rgba(143, 231, 210, 0.28), transparent 65%), linear-gradient(135deg, #eff7ff 0%, #dff0ff 48%, #f4fbff 100%)'
  },
  grid: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: '620px',
    display: 'block',
    borderRadius: '24px',
    overflow: 'hidden',
    border: '1px solid rgba(182, 207, 232, 0.8)',
    boxShadow: '0 26px 52px rgba(37, 85, 127, 0.22)',
    backdropFilter: 'blur(16px)',
    background: '#f8fbff'
  },
  gridMobile: {
    maxWidth: '580px',
    borderRadius: '18px'
  },
  panel: {
    padding: '48px 42px',
    background: 'linear-gradient(170deg, #ffffff 0%, #f1f8ff 100%)'
  },
  panelMobile: {
    padding: '22px 18px'
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '18px'
  },
  topBarMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    marginBottom: '14px'
  },
  backButton: {
    border: '1px solid rgba(172, 194, 220, 0.9)',
    borderRadius: '12px',
    padding: '10px 14px',
    cursor: 'pointer',
    background: 'linear-gradient(180deg, #ffffff 0%, #f0f6ff 100%)',
    fontWeight: '700',
    color: '#183a5d',
    fontSize: '13px',
    letterSpacing: '0.1px',
    boxShadow: '0 6px 14px rgba(22, 52, 84, 0.1)'
  },
  backButtonMobile: {
    width: '100%'
  },
  languageSelect: {
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid #cad6e3',
    fontSize: '13px',
    cursor: 'pointer',
    background: 'white',
    minWidth: '110px',
    color: '#183a5d',
    fontWeight: '600'
  },
  languageSelectMobile: {
    width: '100%'
  },
  title: {
    marginTop: 0,
    marginBottom: '18px',
    fontSize: '30px',
    color: '#163454',
    fontWeight: '750',
    letterSpacing: '-0.02em',
    textAlign: 'left'
  },
  titleMobile: {
    fontSize: '24px'
  },
  roleTabs: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '18px',
    marginBottom: '18px'
  },
  roleTab: {
    border: '2px solid #8fb7dc',
    borderRadius: '10px',
    background: '#f6fbff',
    padding: '8px 4px',
    fontWeight: '600',
    cursor: 'pointer',
    color: '#34597c',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px'
  },
  roleTabActive: {
    color: '#0f4b84',
    borderColor: '#1f7acb',
    background: 'linear-gradient(180deg, #edf6ff 0%, #dcebff 100%)',
    boxShadow: '0 8px 16px rgba(31, 122, 203, 0.22)'
  },
  contentFrame: {
    border: '1px solid #d7e8f8',
    background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(240, 248, 255, 0.98) 100%)',
    borderRadius: '14px',
    padding: '18px 16px',
    boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.6)'
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: '14px',
    color: '#10243f'
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontWeight: '600',
    color: '#24405d',
    fontSize: '13px'
  },
  input: {
    width: '100%',
    padding: '12px 13px',
    borderRadius: '10px',
    border: '1px solid #cad6e3',
    marginBottom: '10px',
    color: '#12263f',
    background: 'rgba(255, 255, 255, 0.98)',
    fontSize: '15px',
    boxSizing: 'border-box'
  },
  submitButton: {
    width: '100%',
    border: 'none',
    borderRadius: '12px',
    padding: '14px 16px',
    background: 'linear-gradient(140deg, #0f5d5c 0%, #164d66 100%)',
    color: '#f5fbff',
    fontWeight: '700',
    fontSize: '15px',
    cursor: 'pointer',
    letterSpacing: '0.2px',
    boxShadow: '0 14px 22px rgba(15, 73, 88, 0.32)',
    marginTop: '8px'
  },
  otpBox: {
    marginTop: '18px',
    padding: '14px',
    border: '1px solid #cae4ff',
    background: '#edf6ff',
    borderRadius: '8px'
  },
  inlineActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '10px',
    flexWrap: 'wrap'
  },
  inlineActionsMobile: {
    display: 'grid',
    gridTemplateColumns: '1fr'
  },
  secondaryButton: {
    border: '1px solid #c7d7eb',
    borderRadius: '10px',
    padding: '10px 12px',
    background: 'white',
    cursor: 'pointer',
    color: '#1e3c5b',
    fontWeight: '700'
  },
  adminButton: {
    background: '#174c7e',
    color: '#fff',
    border: '1px solid #bcd6ee',
    borderRadius: '10px',
    padding: '10px 14px',
    cursor: 'pointer',
    fontWeight: '700'
  },
  adminButtonMobile: {
    width: '100%'
  }
}

export default LoginPortal
