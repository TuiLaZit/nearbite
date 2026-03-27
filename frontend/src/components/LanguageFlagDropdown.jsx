import { useEffect, useMemo, useRef, useState } from 'react'
import { getLanguageFlagUrl } from '../utils/languageFlags'

function LanguageFlagDropdown({
  value,
  onChange,
  languages,
  className = '',
  containerStyle,
  triggerStyle,
  menuStyle
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  const selectedLanguage = useMemo(() => {
    return languages.find((lang) => lang.code === value) || null
  }, [languages, value])

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!dropdownRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  const selectedFlagUrl = getLanguageFlagUrl(
    selectedLanguage?.code,
    selectedLanguage?.country_code,
    selectedLanguage?.label
  )

  return (
    <div ref={dropdownRef} className={`nb-language-dropdown ${className}`.trim()} style={containerStyle}>
      <style>{`
        .nb-language-dropdown {
          position: relative;
          min-width: 130px;
        }

        .nb-language-trigger {
          all: unset;
          box-sizing: border-box;
          width: 100%;
          min-height: 40px;
          border-radius: 10px;
          border: 1px solid #cad6e3;
          background: #ffffff;
          color: #183a5d;
          padding: 0 10px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
        }

        .nb-language-trigger:hover {
          border-color: #9ec0df;
          background: #f4f9ff;
          transform: none;
        }

        .nb-language-trigger:focus-visible {
          border-color: #5a92cc;
          box-shadow: 0 0 0 2px rgba(90, 146, 204, 0.22);
        }

        .nb-language-current {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 13px;
          font-weight: 600;
        }

        .nb-language-caret {
          min-width: 14px;
          text-align: center;
          color: #2f4f71;
          font-size: 12px;
          line-height: 1;
          flex-shrink: 0;
        }

        .nb-language-menu {
          position: absolute;
          right: 0;
          top: calc(100% + 6px);
          width: 220px;
          max-height: 280px;
          overflow: auto;
          padding: 6px;
          border-radius: 12px;
          background: #ffffff;
          border: 1px solid rgba(167, 196, 228, 0.58);
          box-shadow: 0 12px 28px rgba(6, 18, 36, 0.22);
          z-index: 1200;
        }

        .nb-language-item {
          all: unset;
          box-sizing: border-box;
          width: 100%;
          border-radius: 8px;
          padding: 8px 10px;
          display: inline-flex;
          align-items: center;
          justify-content: flex-start;
          gap: 8px;
          color: #15324f;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }

        .nb-language-item:hover {
          background: #eef5ff;
          transform: none;
        }

        .nb-language-item:focus-visible {
          background: #e9f3ff;
          outline: 1px solid rgba(84, 146, 204, 0.8);
        }

        .nb-language-item.active {
          background: #e4f2ff;
          color: #0d3e67;
        }

        .nb-language-flag-icon {
          width: 20px;
          height: 14px;
          border-radius: 2px;
          border: 1px solid rgba(0, 0, 0, 0.18);
          object-fit: cover;
          flex-shrink: 0;
          background: #ffffff;
        }

        .nb-language-fallback-flag {
          width: 20px;
          height: 14px;
          border-radius: 2px;
          border: 1px solid rgba(0, 0, 0, 0.18);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #e5edf8;
          color: #4a6280;
          font-size: 9px;
          font-weight: 700;
          flex-shrink: 0;
        }
      `}</style>

      <button
        type="button"
        className="nb-language-trigger"
        style={triggerStyle}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="nb-language-current">
          {selectedFlagUrl ? (
            <img className="nb-language-flag-icon" src={selectedFlagUrl} alt="" loading="lazy" />
          ) : (
            <span className="nb-language-fallback-flag">--</span>
          )}
          <span>{selectedLanguage?.label || String(value || '').toUpperCase()}</span>
        </span>
        <span className="nb-language-caret">{isOpen ? '▴' : '▾'}</span>
      </button>

      {isOpen && (
        <div className="nb-language-menu" style={menuStyle} role="listbox" aria-label="Language selection">
          {languages.map((lang) => {
            const flagUrl = getLanguageFlagUrl(lang.code, lang.country_code, lang.label)
            const isActive = lang.code === value

            return (
              <button
                key={lang.code}
                type="button"
                className={`nb-language-item${isActive ? ' active' : ''}`}
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  setIsOpen(false)
                  onChange(lang.code)
                }}
              >
                {flagUrl ? (
                  <img className="nb-language-flag-icon" src={flagUrl} alt="" loading="lazy" />
                ) : (
                  <span className="nb-language-fallback-flag">--</span>
                )}
                <span>{lang.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default LanguageFlagDropdown
