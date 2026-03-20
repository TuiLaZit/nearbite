// Environment configuration
// Trong development (localhost), sử dụng proxy '/api'
// Trong production, sử dụng absolute URL từ biến môi trường
const rawBaseUrl = (import.meta.env.VITE_BASE_URL || '').trim().replace(/\/$/, '')
const normalizedProdBaseUrl = rawBaseUrl.startsWith('http://')
  ? `https://${rawBaseUrl.slice('http://'.length)}`
  : rawBaseUrl

export const BASE_URL = import.meta.env.DEV
  ? '/api'
  : normalizedProdBaseUrl
