const API = import.meta.env.VITE_API_URL || '/api';

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (e) {
    console.warn('SW registration failed:', e);
    return null;
  }
}

export function isPushSupported() {
  return 'PushManager' in window && 'serviceWorker' in navigator && 'Notification' in window;
}

async function getVapidPublicKey() {
  try {
    const r = await fetch(`${API}/push/vapid-public-key`);
    if (!r.ok) return null;
    return (await r.json()).public_key;
  } catch {
    return null;
  }
}

function urlB64ToUint8(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function sendSubToServer(sub) {
  const j = sub.toJSON();
  await fetch(`${API}/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      p256dh: j.keys?.p256dh || '',
      auth: j.keys?.auth || '',
    }),
  });
}

export async function subscribeToPush() {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    await sendSubToServer(existing);
    return true;
  }
  const publicKey = await getVapidPublicKey();
  if (!publicKey) return false;
  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8(publicKey),
    });
    await sendSubToServer(sub);
    return true;
  } catch (e) {
    console.warn('Push subscription failed:', e);
    return false;
  }
}

export async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  try {
    await fetch(`${API}/push/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
  } catch (e) {
    console.warn('Unsubscribe failed:', e);
  }
}

export async function requestPushPermission() {
  if (!isPushSupported()) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm === 'granted') await subscribeToPush();
  return perm;
}
