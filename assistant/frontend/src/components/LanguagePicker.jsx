import { useTranslation } from 'react-i18next'

const LANGS = [
  { code: 'fr', label: 'FR' },
  { code: 'en', label: 'EN' },
  { code: 'zh', label: '中' },
  { code: 'es', label: 'ES' },
  { code: 'ar', label: 'ع' },
  { code: 'pt', label: 'PT' },
  { code: 'ja', label: '日' },
]

export default function LanguagePicker() {
  const { i18n } = useTranslation()
  return (
    <select
      value={i18n.language}
      onChange={e => i18n.changeLanguage(e.target.value)}
      style={{
        background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '6px',
        color: '#888', fontSize: '11px', padding: '3px 6px', cursor: 'pointer',
      }}
    >
      {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
    </select>
  )
}
