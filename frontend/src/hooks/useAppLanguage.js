import { useCallback, useEffect, useState } from 'react'

const LANGUAGE_KEY = 'language'
const LANGUAGE_EVENT = 'app-language-change'

const getStoredLanguage = () => {
  return localStorage.getItem(LANGUAGE_KEY) || 'vi'
}

export const setAppLanguage = (language) => {
  localStorage.setItem(LANGUAGE_KEY, language)
  window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: { language } }))
}

export const useAppLanguage = () => {
  const [language, setLanguageState] = useState(getStoredLanguage)

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === LANGUAGE_KEY && event.newValue) {
        setLanguageState(event.newValue)
      }
    }

    const handleAppLanguageChange = (event) => {
      const nextLanguage = event?.detail?.language
      if (nextLanguage) {
        setLanguageState(nextLanguage)
      }
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener(LANGUAGE_EVENT, handleAppLanguageChange)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(LANGUAGE_EVENT, handleAppLanguageChange)
    }
  }, [])

  const setLanguage = useCallback((nextLanguage) => {
    if (!nextLanguage) return
    setAppLanguage(nextLanguage)
    setLanguageState(nextLanguage)
  }, [])

  return { language, setLanguage }
}
