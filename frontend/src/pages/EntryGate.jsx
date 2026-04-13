import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BASE_URL } from '../config'

function EntryGate() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('checking')
  const [message, setMessage] = useState('Dang xac thuc QR...')

  useEffect(() => {
    const token = (searchParams.get('token') || '').trim()

    if (!token) {
      setStatus('error')
      setMessage('Thieu token trong QR')
      const timer = setTimeout(() => {
        navigate('/qr-expired', { replace: true })
      }, 1000)
      return () => clearTimeout(timer)
    }

    let isMounted = true

    fetch(`${BASE_URL}/qr/entry?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))

        if (!isMounted) return

        if (response.ok) {
          setStatus('success')
          setMessage('Access granted. Dang chuyen vao he thong...')
          setTimeout(() => {
            navigate('/app', { replace: true })
          }, 700)
          return
        }

        setStatus('error')
        setMessage(data.message || 'QR expired hoặc không hợp lệ')
        setTimeout(() => {
          navigate('/qr-expired', { replace: true })
        }, 900)
      })
      .catch(() => {
        if (!isMounted) return
        setStatus('error')
        setMessage('Khong the ket noi he thong de kiem tra QR')
        setTimeout(() => {
          navigate('/qr-expired', { replace: true })
        }, 1000)
      })

    return () => {
      isMounted = false
    }
  }, [navigate, searchParams])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: '18px',
      background: 'linear-gradient(145deg, #e8f2ff 0%, #f0f9ff 100%)'
    }}>
      <div style={{
        width: 'min(520px, 100%)',
        borderRadius: '14px',
        border: `1px solid ${status === 'error' ? '#fecaca' : '#bfdbfe'}`,
        background: '#ffffff',
        boxShadow: '0 16px 28px rgba(15, 40, 65, 0.14)',
        padding: '22px'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: '8px', color: '#0f375d' }}>NearBite QR Entry</h2>
        <p style={{ margin: 0, color: status === 'error' ? '#9f1239' : '#334155' }}>{message}</p>
      </div>
    </div>
  )
}

export default EntryGate
