// Environment configuration
// - Dev (Vite at :3000): use proxy '/api' -> backend
// - Local built app served by Flask (:5000): same-origin ''
// - Remote production (Vercel/PWA): default '/api' same-origin proxy for stable session cookies
//   You can override via VITE_BASE_URL when needed.
const rawBaseUrl = (import.meta.env.VITE_BASE_URL || '').trim().replace(/\/$/, '')
const isLocalHost = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)

export const BASE_URL = import.meta.env.DEV
	? '/api'
	: (isLocalHost ? '' : (rawBaseUrl || '/api'))
