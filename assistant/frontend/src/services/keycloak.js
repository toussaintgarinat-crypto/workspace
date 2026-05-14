import Keycloak from 'keycloak-js';

let _kc = null;
let _enabled = false;

export async function initAuth(config) {
  _enabled = !!config.auth_enabled;
  if (!_enabled) return;

  _kc = new Keycloak({
    url: config.keycloak_url,
    realm: config.keycloak_realm,
    clientId: config.keycloak_client_id,
  });

  await _kc.init({
    onLoad: 'login-required',
    checkLoginIframe: false,
    pkceMethod: 'S256',
  });
}

export function isEnabled() { return _enabled; }

export function getToken() { return _kc?.token ?? null; }

export function getUser() { return _kc?.tokenParsed ?? null; }

export async function refreshIfNeeded() {
  if (!_kc) return;
  try {
    await _kc.updateToken(30);
  } catch {
    _kc.login();
  }
}

export function logout() { _kc?.logout(); }
