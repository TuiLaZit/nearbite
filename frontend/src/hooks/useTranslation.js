import { useState, useEffect, useRef, useCallback } from 'react'
import { BASE_URL } from '../config'
import { TRANSLATION_KEYS } from '../translationKeys'

const CACHE_KEY = 'translation_cache'
const CACHE_EXPIRY = 30 * 24 * 60 * 60 * 1000 // 30 days
const CACHE_VERSION = `v5-${Object.keys(TRANSLATION_KEYS).length}`
const TRANSLATE_TIMEOUT_MS = 6000

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
  const activeLanguageRef = useRef(language)
  const requestControllerRef = useRef(null)
  const requestSeqRef = useRef(0)
  const CRITICAL_KEYS = [
    'startTracking',
    'stopTracking',
    'currentLocation',
    'listenButton',
    'listenNarrationButton',
    'directionButton',
    'viewMenu',
    'login',
    'logout'
  ]

  useEffect(() => {
    translationsRef.current = translations
  }, [translations])

  useEffect(() => {
    activeLanguageRef.current = language
  }, [language])

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

    let timeoutId = null
    const langAtRequest = language
    const requestSeq = ++requestSeqRef.current
    try {
      setLoading(true)

      if (requestControllerRef.current) {
        requestControllerRef.current.abort()
      }

      const controller = new AbortController()
      requestControllerRef.current = controller
      timeoutId = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS)
      const response = await fetch(`${BASE_URL}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          texts,
          target_lang: langAtRequest
        })
      })
      clearTimeout(timeoutId)
      timeoutId = null

      // Ignore stale response from older request/language.
      if (requestSeq !== requestSeqRef.current || activeLanguageRef.current !== langAtRequest) {
        return
      }

      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.status !== 'success') {
        return
      }

      const translatedUpdates = {}
      Object.entries(textToKeys).forEach(([viText, mappedKeys]) => {
        const translatedText = (data.translations || {})[viText] || viText
        if (translatedText === viText) {
          return
        }
        mappedKeys.forEach((key) => {
          translatedUpdates[key] = translatedText
        })
      })

      if (!Object.keys(translatedUpdates).length) return

      setTranslations((prev) => {
        if (activeLanguageRef.current !== langAtRequest) {
          return prev
        }
        const next = { ...prev, ...translatedUpdates }
        setCache(langAtRequest, next)
        return next
      })
    } catch (error) {
      // Keep Vietnamese fallback when request fails.
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      if (requestSeq === requestSeqRef.current) {
        requestControllerRef.current = null
      }
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
        if (requestControllerRef.current) {
          requestControllerRef.current.abort()
          requestControllerRef.current = null
        }
        setTranslations(TRANSLATION_KEYS)
        setLoading(false)
        return
      }

      if (requestControllerRef.current) {
        requestControllerRef.current.abort()
        requestControllerRef.current = null
      }

      // Check cache trước
      const cache = getCache()
      if (cache[language] && hasAllTranslationKeys(cache[language].translations)) {
        setTranslations(cache[language].translations)
        setLoading(false)
        return
      }

      // Reset về tiếng Việt trước để tránh giữ text từ ngôn ngữ trước đó.
      const baseTranslations = { ...TRANSLATION_KEYS }

      // Nếu cache có một phần thì hiển thị ngay để UX mượt.
      if (cache[language]?.translations) {
        setTranslations({ ...baseTranslations, ...cache[language].translations })
      } else {
        setTranslations(baseTranslations)
      }

      // Preload các key hiển thị thường xuyên để tránh nhấp nháy tiếng Việt.
      CRITICAL_KEYS.forEach((key) => pendingKeysRef.current.add(key))
      flushPendingTranslations()

      setLoading(false)
    }

    loadTranslations()

    return () => {
      if (requestControllerRef.current) {
        requestControllerRef.current.abort()
        requestControllerRef.current = null
      }
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
