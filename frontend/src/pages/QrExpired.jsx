import { Link } from 'react-router-dom'

function QrExpired() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: '18px',
      background: 'linear-gradient(145deg, #f8fafc 0%, #eff6ff 100%)'
    }}>
      <div style={{
        width: 'min(560px, 100%)',
        borderRadius: '14px',
        border: '1px solid #fecaca',
        background: '#ffffff',
        boxShadow: '0 16px 28px rgba(15, 40, 65, 0.12)',
        padding: '24px'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: '10px', color: '#9f1239' }}>QR đã hết hạn</h2>
        <p style={{ margin: 0, color: '#7f1d1d' }}>
          QR bạn đã quét không còn hiệu lực. Vui lòng quét lại mã QR mới để tiếp tục.
        </p>
        <div style={{ marginTop: '14px' }}>
          <Link to="/qr" style={{ color: '#1d4ed8', fontWeight: 700, textDecoration: 'none' }}>
            Mở trang QR
          </Link>
        </div>
      </div>
    </div>
  )
}

export default QrExpired
