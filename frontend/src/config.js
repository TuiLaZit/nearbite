// Environment configuration
// Trong development (localhost), sử dụng proxy '/api'
// Trong production, sử dụng absolute URL từ biến môi trường
export const BASE_URL = import.meta.env.DEV 
  ? '/api' 
  : import.meta.env.VITE_BASE_URL;

export const LANGUAGES = [
  { code: "vi", label: "Tiếng Việt" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "it", label: "Italiano" },
  { code: "ru", label: "Русский" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "zh", label: "中文 (简体)" },
  { code: "th", label: "ไทย" },
  { code: "id", label: "Bahasa Indonesia" }
];
