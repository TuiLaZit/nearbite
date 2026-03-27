const LANGUAGE_COUNTRY_BY_CODE = {
  vi: 'vn',
  en: 'us',
  'en-us': 'us',
  'en-gb': 'gb',
  fr: 'fr',
  de: 'de',
  es: 'es',
  it: 'it',
  pt: 'pt',
  'pt-br': 'br',
  ru: 'ru',
  ja: 'jp',
  ko: 'kr',
  'ko-kr': 'kr',
  zh: 'cn',
  'zh-cn': 'cn',
  'zh-tw': 'tw',
  th: 'th',
  id: 'id',
  'id-id': 'id',
  ms: 'my',
  'ms-my': 'my'
}

export const resolveCountryCodeForLanguage = (langCode, countryCodeOverride = null, languageLabel = '') => {
  const normalized = String(langCode || '').trim().toLowerCase().replace('_', '-')
  const override = String(countryCodeOverride || '').trim().toLowerCase()
  const normalizedLabel = String(languageLabel || '').trim().toLowerCase()
  const [baseCode, regionCode] = normalized.split('-')

  return (
    LANGUAGE_COUNTRY_BY_CODE[normalized] ||
    LANGUAGE_COUNTRY_BY_CODE[baseCode] ||
    (normalizedLabel.includes('indonesia') ? 'id' : null) ||
    (normalizedLabel.includes('melayu') || normalizedLabel.includes('malay') ? 'my' : null) ||
    (override && /^[a-z]{2}$/.test(override) ? override : null) ||
    (regionCode && /^[a-z]{2}$/.test(regionCode) ? regionCode : null) ||
    null
  )
}

export const getLanguageFlagUrl = (langCode, countryCodeOverride = null, languageLabel = '') => {
  const countryCode = resolveCountryCodeForLanguage(langCode, countryCodeOverride, languageLabel)
  if (!countryCode) return null
  return `https://flagcdn.com/w40/${countryCode}.png`
}
