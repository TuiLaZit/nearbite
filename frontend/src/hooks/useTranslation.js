import { useState, useEffect, useRef, useCallback } from 'react'
import { BASE_URL } from '../config'
import { TRANSLATION_KEYS } from '../translationKeys'

const CACHE_KEY = 'translation_cache'
const CACHE_EXPIRY = 30 * 24 * 60 * 60 * 1000 // 30 days
const CACHE_VERSION = `v4-${Object.keys(TRANSLATION_KEYS).length}`

const hasAllTranslationKeys = (translations) => {
  if (!translations || typeof translations !== 'object') return false
  return Object.keys(TRANSLATION_KEYS).every((key) => Object.prototype.hasOwnProperty.call(translations, key))
}

// Lấy cache từ localStorage
const getCache = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return {}
    
    const data = JSON.parse(cached)
    const now = Date.now()
    
    // Xóa cache hết hạn
    Object.keys(data).forEach(lang => {
      const isExpired = data[lang].timestamp + CACHE_EXPIRY < now
      const isVersionMismatch = data[lang].version !== CACHE_VERSION
      if (isExpired || isVersionMismatch) {
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
      timestamp: Date.now(),
      version: CACHE_VERSION
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch (e) {
    console.error('Failed to cache translations:', e)
  }
}

export const useTranslation = (language) => {
  const [translations, setTranslations] = useState(TRANSLATION_KEYS) // Default to Vietnamese
  const [loading, setLoading] = useState(false) // Không block UI
  const pendingKeysRef = useRef(new Set())
  const flushTimerRef = useRef(null)
  const translationsRef = useRef(TRANSLATION_KEYS)

  useEffect(() => {
    translationsRef.current = translations
  }, [translations])

  const flushPendingTranslations = useCallback(async () => {
    if (language === 'vi') return

    const keys = Array.from(pendingKeysRef.current)
    pendingKeysRef.current.clear()
    if (!keys.length) return

    const texts = []
    const textToKeys = {}

    keys.forEach((key) => {
      const viText = TRANSLATION_KEYS[key]
      if (!viText) return

      const currentValue = translationsRef.current[key]
      if (currentValue && currentValue !== viText) return

      if (!textToKeys[viText]) {
        textToKeys[viText] = []
        texts.push(viText)
      }
      textToKeys[viText].push(key)
    })

    if (!texts.length) return

    try {
      setLoading(true)
      const response = await fetch(`${BASE_URL}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts,
          target_lang: language
        })
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.status !== 'success') {
        return
      }

      const translatedUpdates = {}
      Object.entries(textToKeys).forEach(([viText, mappedKeys]) => {
        const translatedText = (data.translations || {})[viText] || viText
        mappedKeys.forEach((key) => {
          translatedUpdates[key] = translatedText
        })
      })

      if (!Object.keys(translatedUpdates).length) return

      setTranslations((prev) => {
        const next = { ...prev, ...translatedUpdates }
        setCache(language, next)
        return next
      })
    } catch (error) {
      // Keep Vietnamese fallback when request fails.
    } finally {
      setLoading(false)
    }
  }, [language])

  const queueKeyForTranslation = useCallback((key) => {
    if (!key || language === 'vi') return

    pendingKeysRef.current.add(key)
    if (flushTimerRef.current) return

    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null
      flushPendingTranslations()
    }, 30)
  }, [language, flushPendingTranslations])

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
      if (cache[language] && hasAllTranslationKeys(cache[language].translations)) {
        setTranslations(cache[language].translations)
        setLoading(false)
        return
      }

      // Nếu cache có một phần thì hiển thị ngay để UX mượt.
      if (cache[language]?.translations) {
        setTranslations((prev) => ({ ...prev, ...cache[language].translations }))
      }
      setLoading(false)
    }

    loadTranslations()

    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
    }
  }, [language])

  // Helper function để get translation
  const t = (key, replacements = {}) => {
    const fallbackText = TRANSLATION_KEYS[key] || key
    let text = translations[key] || fallbackText

    if (language !== 'vi' && text === fallbackText) {
      queueKeyForTranslation(key)
    }
    
    // Replace placeholders {variable}
    Object.keys(replacements).forEach(placeholder => {
      text = text.replace(`{${placeholder}}`, replacements[placeholder])
    })
    
    return text
  }

  return { t, loading, translations }
}
