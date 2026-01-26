import { useState, useEffect } from 'react'
import { BASE_URL } from '../config'
import { TRANSLATION_KEYS, getAllTranslatableTexts } from '../translationKeys'

const CACHE_KEY = 'translation_cache'
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000 // 7 days

// Lấy cache từ localStorage
const getCache = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return {}
    
    const data = JSON.parse(cached)
    const now = Date.now()
    
    // Xóa cache hết hạn
    Object.keys(data).forEach(lang => {
      if (data[lang].timestamp + CACHE_EXPIRY < now) {
        delete data[lang]
      }
    })
    
    return data
  } catch (e) {
    return {}
  }
}

// Lưu cache vào localStorage
const setCache = (lang, translations) => {
  try {
    const cache = getCache()
    cache[lang] = {
      translations,
      timestamp: Date.now()
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch (e) {
    console.error('Failed to cache translations:', e)
  }
}

export const useTranslation = (language) => {
  const [translations, setTranslations] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadTranslations = async () => {
      // Nếu là tiếng Việt, dùng keys gốc
      if (language === 'vi') {
        setTranslations(TRANSLATION_KEYS)
        setLoading(false)
        return
      }

      // Check cache trước
      const cache = getCache()
      if (cache[language]) {
        setTranslations(cache[language].translations)
        setLoading(false)
        return
      }

      // Nếu không có cache, gọi API
      try {
        setLoading(true)
        const textsToTranslate = getAllTranslatableTexts()
        
        const response = await fetch(`${BASE_URL}/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            texts: textsToTranslate,
            target_lang: language
          })
        })

        const data = await response.json()
        
        if (data.status === 'success') {
          // Map lại từ array translations về object với keys
          const translatedObj = {}
          Object.keys(TRANSLATION_KEYS).forEach(key => {
            const viText = TRANSLATION_KEYS[key]
            translatedObj[key] = data.translations[viText] || viText
          })
          
          setTranslations(translatedObj)
          setCache(language, translatedObj)
        } else {
          // Fallback to Vietnamese
          setTranslations(TRANSLATION_KEYS)
        }
      } catch (error) {
        console.error('Translation error:', error)
        setTranslations(TRANSLATION_KEYS) // Fallback
      } finally {
        setLoading(false)
      }
    }

    loadTranslations()
  }, [language])

  // Helper function để get translation
  const t = (key, replacements = {}) => {
    let text = translations[key] || TRANSLATION_KEYS[key] || key
    
    // Replace placeholders {variable}
    Object.keys(replacements).forEach(placeholder => {
      text = text.replace(`{${placeholder}}`, replacements[placeholder])
    })
    
    return text
  }

  return { t, loading, translations }
}
