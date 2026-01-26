// Environment configuration
// Trong development (localhost), sử dụng proxy '/api'
// Trong production, sử dụng absolute URL từ biến môi trường
export const BASE_URL = import.meta.env.DEV 
  ? '/api' 
  : import.meta.env.VITE_BASE_URL;
