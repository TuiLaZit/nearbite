import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { BASE_URL } from '../config'

function QrAccessRoute() {
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let isMounted = true

    fetch(`${BASE_URL}/qr/access-check`, {
      credentials: 'include'
    })
      .then((res) => {
        if (!isMounted) return
        setStatus(res.ok ? 'ok' : 'blocked')
      })
      .catch(() => {
        if (!isMounted) return
        setStatus('blocked')
      })

    return () => {
      isMounted = false
    }
  }, [])

  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#334155' }}>
        Đang kiểm tra quyền truy cập QR...
      </div>
    )
  }

  if (status === 'blocked') {
    return <Navigate to="/qr-expired" replace />
  }

  return <Outlet />
}

export default QrAccessRoute
