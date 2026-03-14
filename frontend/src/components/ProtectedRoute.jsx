import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { BASE_URL } from '../config'

function ProtectedRoute({ authPath, redirectTo }) {
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let isMounted = true

    fetch(`${BASE_URL}${authPath}`, {
      credentials: 'include'
    })
      .then(res => {
        if (!isMounted) return
        setStatus(res.ok ? 'ok' : 'unauthorized')
      })
      .catch(() => {
        if (!isMounted) return
        setStatus('unauthorized')
      })

    return () => {
      isMounted = false
    }
  }, [authPath])

  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div>Đang kiểm tra đăng nhập...</div>
      </div>
    )
  }

  if (status === 'unauthorized') {
    return <Navigate to={redirectTo} replace />
  }

  return <Outlet />
}

export default ProtectedRoute
