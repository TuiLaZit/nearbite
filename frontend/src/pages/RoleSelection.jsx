import { useNavigate } from 'react-router-dom'

function RoleSelection() {
  const navigate = useNavigate()

  const enterAs = (role) => {
    if (role === 'customer') {
      navigate('/customer/login')
      return
    }

    navigate('/owner/login')
  }

  return (
    <div style={styles.page}>
      <div style={styles.gradient} />
      <div style={styles.panel}>
        <h1 style={styles.title}>NearBite Portal</h1>
        <p style={styles.subtitle}>Chọn loại tài khoản để đăng nhập</p>

        <div style={styles.grid}>
          <button style={{ ...styles.card, ...styles.customerCard }} onClick={() => enterAs('customer')}>
            <div style={styles.emoji}>🍜</div>
            <h2 style={styles.cardTitle}>Khách hàng</h2>
            <p style={styles.cardText}>Đăng nhập bằng email + OTP để khám phá và lập tour ăn uống.</p>
          </button>

          <button style={{ ...styles.card, ...styles.ownerCard }} onClick={() => enterAs('owner')}>
            <div style={styles.emoji}>🏪</div>
            <h2 style={styles.cardTitle}>Chủ quán</h2>
            <p style={styles.cardText}>Đăng nhập bằng tài khoản do admin cấp để quản lý quán.</p>
          </button>
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
    maxWidth: '1100px',
    background: 'rgba(255, 255, 255, 0.9)',
    border: '1px solid #e2e8f0',
    borderRadius: '20px',
    boxShadow: '0 20px 40px rgba(15, 23, 42, 0.12)',
    padding: '32px'
  },
  title: {
    margin: 0,
    fontSize: '40px',
    color: '#0f172a',
    textAlign: 'center'
  },
  subtitle: {
    marginTop: '12px',
    marginBottom: '28px',
    textAlign: 'center',
    fontSize: '17px',
    color: '#334155'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '16px'
  },
  card: {
    textAlign: 'left',
    borderRadius: '16px',
    border: '1px solid transparent',
    padding: '20px',
    cursor: 'pointer',
    transition: 'transform .2s ease, box-shadow .2s ease',
    minHeight: '220px'
  },
  customerCard: {
    background: 'linear-gradient(145deg, #fff7ed, #ffedd5)',
    borderColor: '#fdba74'
  },
  ownerCard: {
    background: 'linear-gradient(145deg, #ecfeff, #cffafe)',
    borderColor: '#67e8f9'
  },
  emoji: {
    fontSize: '36px',
    marginBottom: '10px'
  },
  cardTitle: {
    margin: 0,
    color: '#0f172a'
  },
  cardText: {
    marginTop: '10px',
    color: '#334155',
    lineHeight: 1.5
  }
}

export default RoleSelection
