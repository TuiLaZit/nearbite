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

      <form onSubmit={handleAdd} style={styles.form}>
        <input
          type="email"
          placeholder="Nhập email admin mới"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={styles.input}
        />
        <button type="submit" disabled={loading} style={styles.addButton}>
          {loading ? 'Đang thêm...' : '➕ Thêm email'}
        </button>
      </form>

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
  )
}

const styles = {
  container: {
    background: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  title: {
    marginTop: 0,
    marginBottom: '8px',
    color: '#1e293b'
  },
  subtitle: {
    marginTop: 0,
    marginBottom: '16px',
    color: '#64748b'
  },
  form: {
    display: 'flex',
    gap: '10px',
    marginBottom: '16px'
  },
  input: {
    flex: 1,
    padding: '10px',
    border: '1px solid #cbd5e1',
    borderRadius: '8px'
  },
  addButton: {
    padding: '10px 16px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#2563eb',
    color: 'white',
    cursor: 'pointer'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  th: {
    textAlign: 'left',
    padding: '12px',
    borderBottom: '2px solid #e2e8f0'
  },
  td: {
    padding: '12px',
    borderBottom: '1px solid #e2e8f0'
  },
  deleteButton: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#ef4444',
    color: 'white',
    cursor: 'pointer'
  }
}

export default AdminAccountManagement
