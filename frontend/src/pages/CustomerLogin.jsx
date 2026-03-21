import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BASE_URL } from '../config'
import { useTranslation } from '../hooks/useTranslation'
import { useAppLanguage } from '../hooks/useAppLanguage'

function CustomerLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [devOtp, setDevOtp] = useState('')
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

      navigate('/customer', { replace: true })
    } catch (error) {
      alert(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container" style={{ maxWidth: '460px', paddingTop: '48px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            border: '2px solid #ddd',
            fontSize: '13px',
            cursor: 'pointer',
            background: 'white',
            minWidth: '110px'
          }}
        >
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code}>{lang.label}</option>
          ))}
        </select>
      </div>

      <button onClick={() => navigate('/')} style={{ marginBottom: '16px' }}>
        ← {t('back')}
      </button>
      <h1>📩 {t('customerLoginTitle')}</h1>

      <form onSubmit={handleRequestOtp}>
        <label style={{ display: 'block', marginBottom: '8px' }}>{t('emailLabel')}:</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          disabled={otpSent}
        />
        <button type="submit" disabled={loading || !email || otpSent}>
          {loading ? t('sending') : t('sendOtp')}
        </button>
      </form>

      {otpSent && (
        <div style={{ marginTop: '18px', padding: '14px', border: '1px solid #dbeafe', background: '#eff6ff', borderRadius: '8px' }}>
          <p style={{ marginBottom: '8px' }}>
            {t('otpSentToEmail', { email })}
          </p>

          <form onSubmit={handleVerifyOtp}>
            <label style={{ display: 'block', marginBottom: '8px' }}>{t('otpCodeLabel')}:</label>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder={t('otpPlaceholder')}
              maxLength={6}
              required
            />
            {devOtp && (
              <p style={{ color: '#1d4ed8', marginTop: '8px' }}>
                {t('otpLocalLabel')}: <strong>{devOtp}</strong>
              </p>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button type="submit" disabled={loading || otp.length !== 6}>
                {loading ? t('verifying') : t('verifyOtp')}
              </button>
              <button type="button" onClick={handleRequestOtp} disabled={loading}>
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
              >
                {t('changeEmail')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default CustomerLogin
