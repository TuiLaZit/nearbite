import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BASE_URL } from '../config'

function QrDemo() {
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [token, setToken] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [previousToken, setPreviousToken] = useState('')
  const [error, setError] = useState('')

  const entryUrl = useMemo(() => {
    if (!token || typeof window === 'undefined') return ''
    return `${window.location.origin}/entry?token=${encodeURIComponent(token)}`
  }, [token])

  const qrImageUrl = useMemo(() => {
    if (!entryUrl) return ''
    return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(entryUrl)}`
  }, [entryUrl])

  const fetchCurrentQr = async () => {
    setError('')
    try {
      const response = await fetch(`${BASE_URL}/qr/current`)
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.token) {
        throw new Error(data.message || data.error || data.detail || 'Khong the tai QR hien tai')
      }
      setToken((prev) => {
        if (prev && prev !== data.token) {
          setPreviousToken(prev)
        }
        return data.token
      })
      setExpiresAt(data.expires_at || '')
    } catch (err) {
      setError(String(err?.message || err || 'Khong the tai QR hien tai'))
    } finally {
      setLoading(false)
    }
  }

  const handleForceExpire = async () => {
    setResetting(true)
    setError('')
    try {
      const response = await fetch(`${BASE_URL}/qr/force-expire`, { method: 'POST' })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.message || data.error || data.detail || 'Khong the reset QR')
      }
      await fetchCurrentQr()
    } catch (err) {
      setError(String(err?.message || err || 'Khong the reset QR'))
    } finally {
      setResetting(false)
    }
  }

  useEffect(() => {
    fetchCurrentQr()
    const timer = setInterval(fetchCurrentQr, 30000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      padding: '24px 16px 34px',
      background: 'radial-gradient(900px 360px at 8% -8%, rgba(22, 163, 74, 0.16), transparent 60%), radial-gradient(880px 350px at 92% 0%, rgba(14, 165, 233, 0.14), transparent 62%), linear-gradient(165deg, #edf7ff 0%, #f5fbff 100%)',
      color: '#16324f'
    }}>
      <div style={{ maxWidth: '940px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: '34px', letterSpacing: '-0.02em' }}>QR Demo</h1>
          <Link to="/" style={{ color: '#0f4d85', fontWeight: 700, textDecoration: 'none' }}>Ve trang chinh</Link>
        </div>

        <p style={{ marginTop: '8px', marginBottom: '16px', color: '#35526f' }}>
          QR nay chi dung cho 1 token hien tai. Het han sau 2 gio hoac reset bang nut demo.
        </p>

        {error && (
          <div style={{
            padding: '10px 12px',
            borderRadius: '10px',
            border: '1px solid #f8b4b4',
            background: '#fff1f2',
            color: '#9f1239',
            marginBottom: '14px'
          }}>
            {error}
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 330px) 1fr',
          gap: '16px',
          alignItems: 'stretch'
        }}>
          <div style={{
            border: '1px solid #cfe4f6',
            borderRadius: '16px',
            padding: '16px',
            background: '#ffffff',
            boxShadow: '0 10px 24px rgba(15, 40, 65, 0.12)'
          }}>
            {loading ? (
              <div style={{ minHeight: '280px', display: 'grid', placeItems: 'center', color: '#64748b' }}>Dang tao QR...</div>
            ) : qrImageUrl ? (
              <img src={qrImageUrl} alt="NearBite dynamic QR" width={280} height={280} style={{ width: '100%', height: 'auto', borderRadius: '10px', border: '1px solid #e2e8f0' }} />
            ) : (
              <div style={{ minHeight: '280px', display: 'grid', placeItems: 'center', color: '#64748b' }}>Khong co du lieu QR</div>
            )}
          </div>

          <div style={{
            border: '1px solid #cfe4f6',
            borderRadius: '16px',
            padding: '16px',
            background: '#ffffff',
            boxShadow: '0 10px 24px rgba(15, 40, 65, 0.12)'
          }}>
            <div style={{ marginBottom: '12px' }}>
              <strong>Link trong QR:</strong>
              <div style={{ marginTop: '6px', padding: '10px', borderRadius: '10px', background: '#f8fbff', border: '1px solid #deebf8', wordBreak: 'break-all' }}>
                {entryUrl || '...'}
              </div>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <strong>Token hien tai:</strong>
              <div style={{ marginTop: '6px', fontFamily: 'monospace', fontSize: '13px', color: '#1e3a5f', wordBreak: 'break-all' }}>
                {token || '...'}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <strong>Het han luc:</strong>
              <div style={{ marginTop: '6px', color: '#334155' }}>
                {expiresAt ? new Date(expiresAt).toLocaleString() : '...'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
              <button
                type="button"
                onClick={handleForceExpire}
                disabled={resetting}
                style={{
                  margin: 0,
                  border: '1px solid #fecaca',
                  background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  cursor: resetting ? 'not-allowed' : 'pointer',
                  opacity: resetting ? 0.75 : 1,
                  fontWeight: 700
                }}
              >
                {resetting ? 'Dang reset...' : 'Reset QR (Demo)'}
              </button>

              <button
                type="button"
                onClick={fetchCurrentQr}
                style={{
                  margin: 0,
                  border: '1px solid #bfdbfe',
                  background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  cursor: 'pointer',
                  fontWeight: 700
                }}
              >
                Lam moi
              </button>
            </div>

            {previousToken && previousToken !== token && (
              <div style={{
                padding: '10px',
                borderRadius: '10px',
                border: '1px solid #fed7aa',
                background: '#fff7ed',
                color: '#9a3412'
              }}>
                Token cu (de test reject):
                <div style={{ marginTop: '4px', fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all' }}>
                  {previousToken}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default QrDemo
