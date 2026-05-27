import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export default function InstallBanner() {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState(null);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (standalone) return;
    if (sessionStorage.getItem('pwa-dismissed')) return;

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(ios);
    if (ios) { setShow(true); return; }

    const handler = (e) => { e.preventDefault(); setPrompt(e); setShow(true); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!show) return null;

  const handleInstall = async () => {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    setShow(false);
  };

  const handleDismiss = () => {
    sessionStorage.setItem('pwa-dismissed', '1');
    setShow(false);
  };

  return (
    <div style={{
      position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      background: '#1a1a1a', border: '1px solid #3d2a6e', borderRadius: 12,
      padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
      zIndex: 9999, maxWidth: 360, width: 'calc(100vw - 32px)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    }}>
      <span style={{ fontSize: 22 }}>📱</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#e0e0e0', fontSize: 14, fontWeight: 600 }}>
          {t('install.title')}
        </div>
        <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
          {isIOS
            ? t('install.ios')
            : t('install.android')}
        </div>
      </div>
      {!isIOS && (
        <button onClick={handleInstall} style={{
          background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8,
          padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
        }}>
          {t('install.install')}
        </button>
      )}
      <button onClick={handleDismiss} style={{
        background: 'transparent', color: '#555', border: 'none',
        cursor: 'pointer', fontSize: 16, padding: '0 4px', flexShrink: 0,
      }}>
        ✕
      </button>
    </div>
  );
}
