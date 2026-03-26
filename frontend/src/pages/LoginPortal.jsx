import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BASE_URL } from '../config'
import { useTranslation } from '../hooks/useTranslation'
import { useAppLanguage } from '../hooks/useAppLanguage'
import { setAuthUserIdFromPayload } from '../utils/authUser'

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
      <div style={styles.gradient} />
      <div style={{ ...styles.grid, ...(isMobile ? styles.gridMobile : {}) }}>
        <div style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : {}) }}>
          <div style={{ ...styles.topBar, ...(isMobile ? styles.topBarMobile : {}) }}>
            <button onClick={() => navigate('/')} style={{ ...styles.backButton, ...(isMobile ? styles.backButtonMobile : {}) }}>
              ← {t('back')}
            </button>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              style={{ ...styles.languageSelect, ...(isMobile ? styles.languageSelectMobile : {}) }}
            >
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.label}</option>
              ))}
            </select>
          </div>

          <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>NearBite Login</h1>

          <div style={styles.roleTabs}>
            <button
              type="button"
              style={{ ...styles.roleTab, ...(activeRole === 'customer' ? styles.roleTabActive : {}) }}
              onClick={() => switchRole('customer')}
            >
              🍜 {t('customerRole')}
            </button>
            <button
              type="button"
              style={{ ...styles.roleTab, ...(activeRole === 'owner' ? styles.roleTabActive : {}) }}
              onClick={() => switchRole('owner')}
            >
              🏪 {t('ownerRole')}
            </button>
          </div>

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
              <h2 style={styles.sectionTitle}>🏪 Dang nhap chu quan</h2>
              <form onSubmit={handleOwnerLogin}>
                <label style={styles.label}>Tai khoan:</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Vi du: bc4"
                  required
                  style={styles.input}
                />

                <label style={{ ...styles.label, marginTop: '12px' }}>Mat khau:</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={styles.input}
                />

                <button type="submit" disabled={loading} style={styles.submitButton}>
                  {loading ? 'Dang dang nhap...' : 'Dang nhap'}
                </button>
              </form>

              <div style={{ marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => navigate('/admin/login')}
                  style={{ ...styles.adminButton, ...(isMobile ? styles.adminButtonMobile : {}) }}
                >
                  🛡️ Toi la admin
                </button>
              </div>
            </div>
          )}
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
    background: '#0a0f1d'
  },
  gradient: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(1000px 600px at 10% 10%, rgba(197, 156, 84, 0.15), transparent 50%), radial-gradient(900px 500px at 90% 90%, rgba(22, 77, 76, 0.15), transparent 50%), linear-gradient(135deg, #050a11 0%, #0a0f1d 50%, #0a111a 100%)'
  },
  grid: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: '520px',
    display: 'block',
    borderRadius: '24px',
    overflow: 'hidden',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
    background: '#ffffff'
  },
  gridMobile: {
    maxWidth: '100%',
    borderRadius: '20px',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
  },
  panel: {
    padding: '40px 40px',
    background: '#ffffff'
  },
  panelMobile: {
    padding: '30px 24px'
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '24px'
  },
  topBarMobile: {
    marginBottom: '20px'
  },
  backButton: {
    border: 'none',
    borderRadius: '12px',
    padding: '10px 16px',
    cursor: 'pointer',
    background: '#f1f5f9',
    fontWeight: '600',
    color: '#475569',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s',
    gap: '6px'
  },
  backButtonMobile: {
    padding: '10px 14px'
  },
  languageSelect: {
    padding: '10px 16px',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    fontSize: '14px',
    cursor: 'pointer',
    background: 'white',
    minWidth: '110px',
    color: '#334155',
    fontWeight: '500',
    outline: 'none',
    transition: 'border-color 0.2s'
  },
  languageSelectMobile: {
    padding: '10px 14px'
  },
  title: {
    marginTop: 0,
    marginBottom: '8px',
    fontSize: '32px',
    color: '#0f172a',
    fontWeight: '800',
    letterSpacing: '-1px',
    textAlign: 'center'
  },
  titleMobile: {
    fontSize: '28px'
  },
  roleTabs: {
    display: 'flex',
    gap: '12px',
    marginBottom: '32px',
    marginTop: '24px',
    background: '#f1f5f9',
    padding: '6px',
    borderRadius: '14px'
  },
  roleTab: {
    flex: 1,
    border: 'none',
    borderRadius: '10px',
    background: 'transparent',
    padding: '12px',
    fontWeight: '600',
    fontSize: '15px',
    cursor: 'pointer',
    color: '#64748b',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px'
  },
  roleTabActive: {
    background: '#ffffff',
    color: '#0f172a',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.05)'
  },
  sectionTitle: {
    display: 'none' // Hide old section titles
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontWeight: '600',
    color: '#334155',
    fontSize: '14px'
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    borderRadius: '12px',
    border: '1px solid #cbd5e1',
    marginBottom: '20px',
    color: '#0f172a',
    background: '#ffffff',
    fontSize: '15px',
    transition: 'border-color 0.2s',
    outline: 'none',
    boxSizing: 'border-box'
  },
  submitButton: {
    width: '100%',
    border: 'none',
    borderRadius: '12px',
    padding: '14px',
    background: '#0ea5e9', // Professional blue
    color: '#ffffff',
    fontWeight: '600',
    fontSize: '16px',
    cursor: 'pointer',
    transition: 'background 0.2s',
    marginTop: '8px'
  },
  otpBox: {
    marginTop: '24px',
    padding: '24px',
    border: '1px solid #e2e8f0',
    background: '#f8fafc',
    borderRadius: '16px'
  },
  inlineActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '16px',
    flexDirection: 'column'
  },
  inlineActionsMobile: {
  },
  secondaryButton: {
    border: '1px solid #cbd5e1',
    borderRadius: '12px',
    padding: '12px',
    background: 'transparent',
    cursor: 'pointer',
    color: '#475569',
    fontWeight: '600',
    fontSize: '15px',
    transition: 'all 0.2s',
    width: '100%'
  },
  adminButton: {
    background: 'transparent',
    color: '#64748b',
    border: 'none',
    borderRadius: '12px',
    padding: '12px',
    marginTop: '16px',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '14px',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    textDecoration: 'underline'
  },
  adminButtonMobile: {
  }
}

export default LoginPortal
