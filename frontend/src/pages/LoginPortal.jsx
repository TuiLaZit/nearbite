import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BASE_URL } from '../config'
import { useTranslation } from '../hooks/useTranslation'
import { useAppLanguage } from '../hooks/useAppLanguage'

function LoginPortal() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedRole = searchParams.get('role')
  const initialRole = requestedRole === 'owner' ? 'owner' : 'customer'

  const [activeRole, setActiveRole] = useState(initialRole)
  const [loading, setLoading] = useState(false)

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

      localStorage.setItem('activeRole', 'owner')
      navigate('/owner', { replace: true })
    } catch (error) {
      alert(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.gradient} />
      <div style={styles.panel}>
        <div style={styles.topBar}>
          <button onClick={() => navigate('/')} style={styles.backButton}>
            ← {t('back')}
          </button>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={styles.languageSelect}
          >
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>{lang.label}</option>
            ))}
          </select>
        </div>

        <h1 style={styles.title}>NearBite Login</h1>

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
                <p style={{ marginBottom: '8px' }}>
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
                    <p style={{ color: '#000', marginTop: '8px' }}>
                      {t('otpLocalLabel')}: <strong>{devOtp}</strong>
                    </p>
                  )}
                  <div style={styles.inlineActions}>
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
            <div style={styles.ownerHint}>
              Trang nay chi danh cho chu quan. Tai khoan la username quan (vi du: bc4), khong phai email.
            </div>
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
                style={styles.adminButton}
              >
                🛡️ Toi la admin
              </button>
            </div>
          </div>
        )}
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
    background: '#f8fafc'
  },
  gradient: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(circle at 20% 10%, #fde68a, transparent 35%), radial-gradient(circle at 80% 90%, #bfdbfe, transparent 35%), linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)'
  },
  panel: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: '600px',
    background: 'rgba(255, 255, 255, 0.95)',
    border: '1px solid #e2e8f0',
    borderRadius: '20px',
    boxShadow: '0 20px 40px rgba(15, 23, 42, 0.12)',
    padding: '28px',
    color: '#000'
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px'
  },
  backButton: {
    border: 'none',
    borderRadius: '8px',
    padding: '8px 12px',
    cursor: 'pointer',
    background: '#e2e8f0',
    fontWeight: '600',
    color: '#000'
  },
  languageSelect: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '2px solid #ddd',
    fontSize: '13px',
    cursor: 'pointer',
    background: 'white',
    minWidth: '110px',
    color: '#000'
  },
  title: {
    marginTop: '8px',
    marginBottom: '18px',
    textAlign: 'center',
    fontSize: '34px',
    color: '#000'
  },
  roleTabs: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    marginBottom: '18px'
  },
  roleTab: {
    border: '1px solid #cbd5e1',
    borderRadius: '10px',
    background: '#f8fafc',
    padding: '10px 12px',
    fontWeight: '600',
    cursor: 'pointer',
    color: '#000'
  },
  roleTabActive: {
    borderColor: '#2563eb',
    background: '#dbeafe'
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: '14px',
    color: '#000'
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontWeight: '600',
    color: '#000'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    marginBottom: '10px',
    color: '#000'
  },
  submitButton: {
    width: '100%',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 14px',
    background: '#2563eb',
    color: '#000',
    fontWeight: '700',
    cursor: 'pointer'
  },
  otpBox: {
    marginTop: '18px',
    padding: '14px',
    border: '1px solid #dbeafe',
    background: '#eff6ff',
    borderRadius: '8px'
  },
  inlineActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '10px',
    flexWrap: 'wrap'
  },
  secondaryButton: {
    border: '1px solid #94a3b8',
    borderRadius: '8px',
    padding: '8px 10px',
    background: 'white',
    cursor: 'pointer',
    color: '#000'
  },
  ownerHint: {
    background: '#fff7ed',
    border: '1px solid #fed7aa',
    borderRadius: '8px',
    padding: '10px 12px',
    marginBottom: '14px',
    color: '#000'
  },
  adminButton: {
    background: '#1e293b',
    color: '#fff',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    padding: '10px 14px',
    cursor: 'pointer'
  }
}

export default LoginPortal
