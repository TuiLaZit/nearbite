import { useEffect, useRef } from 'react'
import { BASE_URL } from '../config'

const DEVICE_KEY = 'heartbeatDeviceId'
const USER_KEY = 'authUserId'
const LOCATION_KEY = 'heartbeatLastLocation'
const HEARTBEAT_INTERVAL_MS = 30_000

function generateDeviceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function getOrCreateDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_KEY)
    if (existing) {
      return existing
    }
    const created = generateDeviceId()
    localStorage.setItem(DEVICE_KEY, created)
    return created
  } catch {
    return generateDeviceId()
  }
}

function getCurrentUserId() {
  // Optional: frontend can store Supabase/Auth user id at this key after login.
  try {
    const value = localStorage.getItem(USER_KEY)
    return value && value.trim() ? value.trim() : null
  } catch {
    return null
  }
}

function getCurrentLocation() {
  try {
    const raw = localStorage.getItem(LOCATION_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    const lat = Number(parsed?.lat)
    const lng = Number(parsed?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null
    }

    return { lat, lng }
  } catch {
    return null
  }
}

async function sendHeartbeat(deviceId) {
  const payload = { device_id: deviceId }
  const userId = getCurrentUserId()
  const location = getCurrentLocation()

  if (userId) {
    payload.user_id = userId
  }

  if (location) {
    payload.latitude = location.lat
    payload.longitude = location.lng
  }

  try {
    await fetch(`${BASE_URL}/heartbeat`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  } catch {
    // Heartbeat is best-effort; silently ignore transient network errors.
  }
}

export default function useHeartbeat() {
  const timerRef = useRef(null)

  useEffect(() => {
    const deviceId = getOrCreateDeviceId()

    const beat = () => sendHeartbeat(deviceId)

    beat()
    timerRef.current = window.setInterval(beat, HEARTBEAT_INTERVAL_MS)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        beat()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
      }
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])
}
