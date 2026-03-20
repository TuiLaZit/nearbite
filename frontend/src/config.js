// Environment configuration
// - Dev (Vite at :3000): use proxy '/api' -> backend
// - Local built app served by Flask (:5000): same-origin ''
// - Remote production: use VITE_BASE_URL if provided
const rawBaseUrl = (import.meta.env.VITE_BASE_URL || '').trim().replace(/\/$/, '')
const isLocalHost = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)

export const BASE_URL = import.meta.env.DEV
	? '/api'
	: (isLocalHost ? '' : rawBaseUrl)
