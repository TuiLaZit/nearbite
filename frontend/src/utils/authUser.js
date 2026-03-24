const AUTH_USER_KEY = 'authUserId'

export function setAuthUserId(value) {
  try {
    const normalized = typeof value === 'string' ? value.trim() : ''
    if (normalized) {
      localStorage.setItem(AUTH_USER_KEY, normalized)
      return
    }
    localStorage.removeItem(AUTH_USER_KEY)
  } catch {
    // Ignore storage failures.
  }
}

export function setAuthUserIdFromPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    setAuthUserId('')
    return
  }

  // Accept common API field names to keep integration flexible.
  const userId = payload.user_id || payload.userId || payload.id || ''
  setAuthUserId(userId)
}

export function clearAuthUserId() {
  setAuthUserId('')
}
