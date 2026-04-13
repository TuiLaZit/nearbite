import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { BASE_URL } from '../config'

function ProtectedRoute({ authPath, redirectTo }) {
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let isMounted = true

    const checkAuthorization = async () => {
      const authPaths = Array.isArray(authPath) ? authPath : [authPath]

      for (const path of authPaths) {
        try {
          const res = await fetch(`${BASE_URL}${path}`, {
            credentials: 'include'
          })
          if (res.ok) {
            if (isMounted) setStatus('ok')
            return
          }
        } catch {
          // Try next auth path.
        }
      }

      if (isMounted) setStatus('unauthorized')
    }

    checkAuthorization()

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
