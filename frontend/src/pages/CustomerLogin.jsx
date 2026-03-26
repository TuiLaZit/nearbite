import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BASE_URL } from '../config'
import { useTranslation } from '../hooks/useTranslation'
import { useAppLanguage } from '../hooks/useAppLanguage'
import { setAuthUserIdFromPayload } from '../utils/authUser'

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

  useEffect(() => {
    document.body.classList.add('customer-login-body')
    return () => {
      document.body.classList.remove('customer-login-body')
    }
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

      setAuthUserIdFromPayload(data)
      navigate('/customer', { replace: true })
    } catch (error) {
      alert(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        body.customer-login-body {
          margin: 0;
          min-height: 100vh;
          background:
            radial-gradient(900px 520px at 8% 12%, rgba(197, 156, 84, 0.2), transparent 60%),
            radial-gradient(820px 480px at 92% 88%, rgba(22, 77, 76, 0.16), transparent 65%),
            linear-gradient(135deg, #071217 0%, #0f172a 46%, #152238 100%);
          font-family: 'Plus Jakarta Sans', 'Segoe UI', sans-serif;
        }

        .customer-login-shell {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }

        .customer-login-grid {
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

        .customer-login-brand {
          padding: 52px 44px;
          background: linear-gradient(160deg, #0f2036 0%, #183a57 58%, #1f4b66 100%);
          border-right: 1px solid rgba(255, 255, 255, 0.18);
          color: #eef6ff;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 20px;
        }

        .customer-login-brand h2 {
          margin: 0;
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(40px, 4vw, 56px);
          letter-spacing: 0.8px;
          color: #f7fbff;
          line-height: 0.95;
        }

        .customer-login-brand p {
          margin: 0;
          color: rgba(231, 241, 255, 0.9);
          line-height: 1.65;
          font-size: 15px;
        }

        .customer-login-card {
          padding: 48px 42px;
          background: linear-gradient(170deg, #ffffff 0%, #eef4ff 100%);
        }

        .customer-login-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 18px;
        }

        .customer-back-btn {
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #cad6e3;
          background: rgba(20, 44, 70, 0.08);
          color: #183a5d;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .customer-lang-select {
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #cad6e3;
          background: #fff;
          color: #183a5d;
          font-size: 13px;
          font-weight: 600;
          min-width: 120px;
        }

        .customer-login-card h1 {
          margin: 0;
          color: #10243f;
          font-size: 28px;
          font-weight: 750;
          letter-spacing: -0.02em;
        }

        .customer-subtitle {
          margin: 10px 0 22px;
          color: #3c516b;
          font-size: 14px;
          line-height: 1.5;
        }

        .customer-login-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .customer-label {
          font-size: 13px;
          font-weight: 600;
          color: #24405d;
        }

        .customer-input {
          width: 100%;
          padding: 14px 16px;
          border: 1px solid #cad6e3;
          border-radius: 12px;
          font-size: 15px;
          background: rgba(255, 255, 255, 0.98);
          color: #12263f;
        }

        .customer-primary-btn {
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

        .customer-primary-btn:disabled,
        .customer-secondary-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .customer-otp-box {
          margin-top: 18px;
          padding: 14px;
          border: 1px solid #dbeafe;
          background: #eff6ff;
          border-radius: 10px;
        }

        .customer-otp-note {
          margin: 0 0 10px;
          color: #19324f;
          font-size: 14px;
        }

        .customer-dev-otp {
          color: #1f2f46;
          margin: 8px 0 0;
          font-size: 13px;
        }

        .customer-otp-actions {
          display: flex;
          gap: 8px;
          margin-top: 10px;
          flex-wrap: wrap;
        }

        .customer-secondary-btn {
          padding: 11px 13px;
          border-radius: 10px;
          border: 1px solid #c7d7eb;
          background: #fff;
          color: #1e3c5b;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        @media (max-width: 920px) {
          .customer-login-grid {
            grid-template-columns: 1fr;
            max-width: 580px;
          }

          .customer-login-brand {
            border-right: none;
            border-bottom: 1px solid rgba(205, 214, 228, 0.16);
            padding: 30px 24px;
          }

          .customer-login-card {
            padding: 30px 24px;
          }
        }

        @media (max-width: 640px) {
          .customer-login-shell {
            padding: 14px;
            align-items: flex-start;
          }

          .customer-login-grid {
            border-radius: 18px;
            margin-top: 8px;
          }

          .customer-login-brand {
            padding: 18px 14px;
            gap: 10px;
          }

          .customer-login-brand h2 {
            font-size: clamp(30px, 10vw, 38px);
          }

          .customer-login-brand p {
            display: none;
          }

          .customer-login-card {
            padding: 18px 14px;
          }

          .customer-login-top {
            flex-direction: column;
            align-items: stretch;
            margin-bottom: 14px;
          }

          .customer-back-btn,
          .customer-lang-select {
            width: 100%;
          }

          .customer-login-card h1 {
            font-size: 24px;
          }

          .customer-subtitle {
            margin: 8px 0 16px;
            font-size: 13px;
          }

          .customer-input {
            padding: 12px 13px;
            border-radius: 10px;
            font-size: 14px;
          }

          .customer-primary-btn {
            padding: 12px 14px;
            border-radius: 10px;
            font-size: 14px;
          }

          .customer-otp-actions {
            display: grid;
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="customer-login-shell">
        <div className="customer-login-grid">
          <aside className="customer-login-brand">
            <div>
              <h2>NearBite</h2>
            </div>
            <p>
              Đăng nhập khách hàng để nhận OTP, tiếp tục theo dõi hành trình khám phá món ăn và lưu trải nghiệm cá nhân.
            </p>
          </aside>

          <div className="customer-login-card">
            <div className="customer-login-top">
              <button className="customer-back-btn" onClick={() => navigate('/')}>← {t('back')}</button>
              <select
                className="customer-lang-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {languages.map((lang) => (
                  <option key={lang.code} value={lang.code}>{lang.label}</option>
                ))}
              </select>
            </div>

            <h1>📩 {t('customerLoginTitle')}</h1>
            <p className="customer-subtitle">Nhập email để nhận mã OTP và đăng nhập nhanh chóng.</p>

            <form className="customer-login-form" onSubmit={handleRequestOtp}>
              <label className="customer-label">{t('emailLabel')}:</label>
              <input
                className="customer-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={otpSent}
              />
              <button className="customer-primary-btn" type="submit" disabled={loading || !email || otpSent}>
                {loading ? t('sending') : t('sendOtp')}
              </button>
            </form>

            {otpSent && (
              <div className="customer-otp-box">
                <p className="customer-otp-note">{t('otpSentToEmail', { email })}</p>

                <form className="customer-login-form" onSubmit={handleVerifyOtp}>
                  <label className="customer-label">{t('otpCodeLabel')}:</label>
                  <input
                    className="customer-input"
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder={t('otpPlaceholder')}
                    maxLength={6}
                    required
                  />

                  {devOtp && (
                    <p className="customer-dev-otp">
                      {t('otpLocalLabel')}: <strong>{devOtp}</strong>
                    </p>
                  )}

                  <div className="customer-otp-actions">
                    <button className="customer-primary-btn" type="submit" disabled={loading || otp.length !== 6}>
                      {loading ? t('verifying') : t('verifyOtp')}
                    </button>
                    <button className="customer-secondary-btn" type="button" onClick={handleRequestOtp} disabled={loading}>
                      {t('resendOtp')}
                    </button>
                    <button
                      className="customer-secondary-btn"
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
        </div>
      </div>
    </>
  )
}

export default CustomerLogin
