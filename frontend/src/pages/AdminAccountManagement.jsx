import { useEffect, useState } from 'react'
import { BASE_URL } from '../config'

function AdminAccountManagement() {
  const [accounts, setAccounts] = useState([])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  const loadAccounts = async () => {
    const response = await fetch(`${BASE_URL}/admin/accounts`, {
      credentials: 'include'
    })

    if (!response.ok) {
      throw new Error('Không thể tải danh sách tài khoản admin')
    }

    const data = await response.json()
    setAccounts(data)
  }

  useEffect(() => {
    loadAccounts().catch((error) => {
      alert(error.message)
    })
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch(`${BASE_URL}/admin/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email })
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Không thể thêm tài khoản')
      }

      setEmail('')
      await loadAccounts()
    } catch (error) {
      alert(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (accountId, accountEmail) => {
    if (!confirm(`Xóa quyền admin của ${accountEmail}?`)) {
      return
    }

    const response = await fetch(`${BASE_URL}/admin/accounts/${accountId}`, {
      method: 'DELETE',
      credentials: 'include'
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      alert(data.error || 'Không thể xóa tài khoản')
      return
    }

    await loadAccounts()
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>👤 Tài khoản đăng nhập Admin</h2>
      <p style={styles.subtitle}>Danh sách email được phép đăng nhập vào trang admin bằng ADMIN_PASSWORD.</p>

      <div style={styles.addSection}>
        <div style={styles.addGlowTop} />
        <div style={styles.addGlowBottom} />
        <div style={styles.addHeaderRow}>
          <div>
            <h3 style={styles.addTitle}>Create Admin Access</h3>
            <p style={styles.addSubtitle}>Thêm email quản trị mới để cấp quyền truy cập vào bảng điều khiển.</p>
          </div>
          <div style={styles.addBadge}>Secure</div>
        </div>

        <form onSubmit={handleAdd} style={styles.form}>
          <input
            type="email"
            placeholder="nhap-email-admin@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.input}
          />
          <button type="submit" disabled={loading} style={styles.addButton}>
            {loading ? 'Đang thêm...' : '➕ Add Admin'}
          </button>
        </form>
      </div>

      <div style={styles.tableSection}>
        <h3 style={styles.sectionTitle}>📋 Danh sách tài khoản hiện tại</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Ngày tạo</th>
              <th style={styles.th}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map(account => (
              <tr key={account.id}>
                <td style={styles.td}>{account.email}</td>
                <td style={styles.td}>{new Date(account.created_at).toLocaleString()}</td>
                <td style={styles.td}>
                  <button
                    onClick={() => handleDelete(account.id, account.email)}
                    style={styles.deleteButton}
                  >
                    🗑️ Gỡ quyền
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const styles = {
  container: {
    background: 'linear-gradient(170deg, rgba(255,255,255,0.98) 0%, rgba(246, 250, 255, 0.94) 100%)',
    borderRadius: '16px',
    padding: '26px',
    boxShadow: '0 14px 30px rgba(20, 35, 58, 0.12)',
    border: '1px solid rgba(198, 214, 234, 0.75)',
    animation: 'fadeInUp 0.45s ease'
  },
  title: {
    marginTop: 0,
    marginBottom: '8px',
    color: '#132745',
    fontSize: '30px',
    fontWeight: '760'
  },
  subtitle: {
    marginTop: 0,
    marginBottom: '20px',
    color: '#4f627e',
    fontSize: '14px'
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: '12px',
    color: '#2a4060',
    fontSize: '16px',
    fontWeight: '700'
  },
  addSection: {
    position: 'relative',
    background: 'linear-gradient(145deg, rgba(245, 251, 255, 0.96) 0%, rgba(233, 243, 255, 0.9) 100%)',
    border: '1px solid rgba(178, 203, 232, 0.78)',
    borderRadius: '16px',
    padding: '18px',
    marginBottom: '16px',
    boxShadow: '0 14px 28px rgba(24, 47, 84, 0.12), inset 0 0 0 1px rgba(255, 255, 255, 0.56)',
    overflow: 'hidden'
  },
  addGlowTop: {
    position: 'absolute',
    top: '-90px',
    right: '-70px',
    width: '210px',
    height: '210px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(143, 197, 248, 0.3) 0%, rgba(143, 197, 248, 0) 70%)',
    pointerEvents: 'none'
  },
  addGlowBottom: {
    position: 'absolute',
    bottom: '-120px',
    left: '-70px',
    width: '240px',
    height: '240px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(111, 169, 240, 0.26) 0%, rgba(111, 169, 240, 0) 72%)',
    pointerEvents: 'none'
  },
  addHeaderRow: {
    position: 'relative',
    zIndex: 2,
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    marginBottom: '14px',
    alignItems: 'flex-start'
  },
  addTitle: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '760',
    color: '#17345a',
    letterSpacing: '0.2px'
  },
  addSubtitle: {
    margin: '6px 0 0',
    color: '#4b6486',
    fontSize: '13px',
    maxWidth: '540px',
    lineHeight: '1.45'
  },
  addBadge: {
    padding: '6px 10px',
    borderRadius: '999px',
    border: '1px solid rgba(125, 168, 220, 0.62)',
    background: 'rgba(191, 220, 252, 0.52)',
    color: '#1d4f83',
    fontSize: '12px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  tableSection: {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(247, 251, 255, 0.92) 100%)',
    border: '1px solid #cfe0f4',
    borderRadius: '14px',
    padding: '16px',
    boxShadow: '0 10px 22px rgba(20, 50, 92, 0.1)'
  },
  form: {
    position: 'relative',
    zIndex: 2,
    display: 'flex',
    gap: '10px',
    marginBottom: 0
  },
  input: {
    flex: 1,
    padding: '12px 14px',
    border: '1px solid rgba(182, 209, 240, 0.86)',
    borderRadius: '11px',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    color: '#10243f',
    fontWeight: '600'
  },
  addButton: {
    padding: '11px 18px',
    border: 'none',
    borderRadius: '11px',
    background: 'linear-gradient(130deg, #2d7ed4 0%, #1f9db7 100%)',
    color: 'white',
    cursor: 'pointer',
    fontWeight: '700',
    boxShadow: '0 12px 22px rgba(31, 100, 177, 0.3)'
  },
  table: {
    width: 'calc(100% - 12px)',
    margin: '0 auto',
    borderCollapse: 'separate',
    borderSpacing: 0,
    borderRadius: '14px',
    overflow: 'hidden',
    border: '1px solid #c5d9f3',
    boxShadow: '0 10px 22px rgba(20, 50, 92, 0.12)'
  },
  th: {
    textAlign: 'left',
    padding: '12px',
    borderBottom: '2px solid #cfe0f4',
    color: '#34496a',
    fontSize: '13px',
    background: 'linear-gradient(180deg, #fafdff 0%, #eaf3ff 100%)',
    letterSpacing: '0.2px'
  },
  td: {
    padding: '12px',
    borderBottom: '1px solid #e8eef8',
    color: '#20324e',
    backgroundColor: 'rgba(255, 255, 255, 0.86)'
  },
  deleteButton: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #b41c2f 0%, #d82e44 100%)',
    color: 'white',
    cursor: 'pointer',
    fontWeight: '600'
  }
}

export default AdminAccountManagement
