import { useState, useRef, useEffect } from 'react'
import { useTranslation, type Locale } from '@/lib/use-translation'

const locales: { value: Locale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '简体中文' },
]

function LanguageIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleLocaleChange = (newLocale: Locale) => {
    setLocale(newLocale)
    setIsOpen(false)
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-quaternary)] hover:text-[var(--text-primary)]"
        title={t('language.title')}
        aria-label={t('language.title')}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <LanguageIcon />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full z-50 mt-1 min-w-[140px] overflow-hidden rounded-[10px] border border-[var(--border-secondary)] bg-[var(--bg-editor)] shadow-[0_4px_20px_rgba(0,0,0,0.08),0_1px_4px_rgba(0,0,0,0.04)]"
          role="listbox"
          aria-label={t('language.title')}
        >
          {locales.map((loc) => {
            const isSelected = locale === loc.value
            return (
              <button
                key={loc.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => handleLocaleChange(loc.value)}
                className={`flex items-center justify-between w-full px-3 py-2 text-sm text-left transition-colors ${
                  isSelected
                    ? 'bg-[var(--bg-quaternary)] text-[var(--accent)]'
                    : 'text-[var(--text-primary)] hover:bg-[var(--bg-quaternary)]'
                }`}
              >
                <span>{loc.label}</span>
                {isSelected && (
                  <span className="ml-2 text-[var(--accent)]">
                    <CheckIcon />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
