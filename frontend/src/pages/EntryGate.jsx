import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BASE_URL } from '../config'

function EntryGate() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('checking')
  const [message, setMessage] = useState('Đang xác thực QR...')

  useEffect(() => {
    const token = (searchParams.get('token') || '').trim()

    if (!token) {
      setStatus('error')
      setMessage('QR đã hết hạn hoặc không hợp lệ.')
      return undefined
    }

    let isMounted = true

    fetch(`${BASE_URL}/qr/entry?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))

        if (!isMounted) return

        if (response.ok) {
          setStatus('success')
          setMessage('QR còn hiệu lực.')
          return
        }

        setStatus('error')
        setMessage(data.message || 'QR đã hết hạn.')
      })
      .catch(() => {
        if (!isMounted) return
        setStatus('error')
        setMessage('Không thể kiểm tra QR lúc này.')
      })

    return () => {
      isMounted = false
    }
  }, [searchParams])

  const noticeStyle = status === 'success'
    ? {
        border: '1px solid #bbf7d0',
        background: '#f0fdf4',
        color: '#166534'
      }
    : status === 'error'
      ? {
          border: '1px solid #fecaca',
          background: '#fef2f2',
          color: '#b91c1c'
        }
      : {
          border: '1px solid #c7d2fe',
          background: '#eef2ff',
          color: '#3730a3'
        }

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
        <div style={{ ...noticeStyle, borderRadius: '10px', padding: '10px 12px', fontWeight: 700 }}>
          {message}
        </div>
      </div>
    </div>
  )
}

export default EntryGate
