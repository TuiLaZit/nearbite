import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BASE_URL } from '../config'

function CustomerLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [devOtp, setDevOtp] = useState('')

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
        throw new Error(data.error || 'Không gửi được OTP')
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
        throw new Error(data.error || 'OTP không hợp lệ')
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
      <button onClick={() => navigate('/')} style={{ marginBottom: '16px' }}>
        ← Quay lại
      </button>
      <h1>📩 Đăng nhập khách hàng</h1>

      <form onSubmit={handleRequestOtp}>
        <label style={{ display: 'block', marginBottom: '8px' }}>Email:</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          disabled={otpSent}
        />
        <button type="submit" disabled={loading || !email || otpSent}>
          {loading ? 'Đang gửi...' : 'Gửi OTP'}
        </button>
      </form>

      {otpSent && (
        <div style={{ marginTop: '18px', padding: '14px', border: '1px solid #dbeafe', background: '#eff6ff', borderRadius: '8px' }}>
          <p style={{ marginBottom: '8px' }}>
            OTP đã được gửi tới <strong>{email}</strong>. Vui lòng nhập mã để đăng nhập.
          </p>

          <form onSubmit={handleVerifyOtp}>
            <label style={{ display: 'block', marginBottom: '8px' }}>Mã OTP:</label>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="Nhập 6 số OTP"
              maxLength={6}
              required
            />
            {devOtp && (
              <p style={{ color: '#1d4ed8', marginTop: '8px' }}>
                OTP local: <strong>{devOtp}</strong>
              </p>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button type="submit" disabled={loading || otp.length !== 6}>
                {loading ? 'Đang xác nhận...' : 'Xác nhận OTP'}
              </button>
              <button type="button" onClick={handleRequestOtp} disabled={loading}>
                Gửi lại OTP
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
                Đổi email
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default CustomerLogin
