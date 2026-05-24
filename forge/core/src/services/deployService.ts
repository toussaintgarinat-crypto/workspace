import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink, mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { encrypt, decrypt } from '../config/crypto'
import { createCloudflareRecord } from './cloudflareService'

const execAsync = promisify(exec)

export { encrypt as encryptKey, decrypt as decryptKey }

export type DeployOpts = {
  instanceId:    string
  serverIp:      string
  sshKeyEncrypted: string
  sshUser:       string
  domain:        string
  domainMode:    'cloudflare' | 'manual'
  adminEmail:    string
  adminPassword: string
  missionData: {
    titre:       string
    description: string
    findings:    Array<{ categorie: string; severite: string; description: string; source: string }>
    recos:       Array<{ priorite: string; action: string; statut: string }>
    rapport?:    string
  }
}

export type ProgressFn = (msg: string, step: number, total: number) => Promise<void>

const TOTAL_STEPS = 6

export async function runDeploy(opts: DeployOpts, onProgress: ProgressFn): Promise<void> {
  const { instanceId, serverIp, sshKeyEncrypted, sshUser, domain, domainMode, adminEmail, adminPassword, missionData } = opts
  const deployId    = randomUUID()
  const tmpDir      = join(tmpdir(), `forge-deploy-${deployId}`)
  const keyPath     = join(tmpdir(), `forge-ssh-${deployId}`)
  const adminUserId = randomUUID()

  const sshKey = await decrypt(sshKeyEncrypted)

  try {
    // ── 1. Génération des fichiers ───────────────────────────
    await onProgress('Génération des fichiers de configuration…', 1, TOTAL_STEPS)
    await mkdir(tmpDir, { recursive: true })
    await writeFile(keyPath, sshKey, { mode: 0o600 })

    const adminHash = await bcrypt.hash(adminPassword, 10)
    const envVars   = generateEnvVars(domain, adminEmail, adminHash)

    await Promise.all([
      writeFile(join(tmpDir, 'docker-compose.yml'), generateDockerCompose(domain, domainMode, envVars)),
      writeFile(join(tmpDir, '.env'), generateDotEnv(envVars)),
      writeFile(join(tmpDir, 'forge-realm.json'), generateRealmJson(domain, adminUserId, adminEmail, adminPassword)),
      writeFile(join(tmpDir, 'seed.sql'), generateSeedSql(adminUserId, adminEmail, missionData)),
    ])

    // ── 2. Connexion SSH ─────────────────────────────────────
    await onProgress('Connexion au serveur…', 2, TOTAL_STEPS)
    const ssh = (cmd: string) =>
      execAsync(`ssh -i "${keyPath}" -o StrictHostKeyChecking=no -o ConnectTimeout=15 ${sshUser}@${serverIp} '${cmd.replace(/'/g, "'\\''")}'`, { timeout: 120_000 })
    await ssh('echo connected')

    // ── 3. Upload des fichiers ───────────────────────────────
    await onProgress('Upload des fichiers vers le serveur…', 3, TOTAL_STEPS)
    await ssh('mkdir -p /opt/forge-client')
    await execAsync(
      `rsync -az -e "ssh -i '${keyPath}' -o StrictHostKeyChecking=no" "${tmpDir}/" ${sshUser}@${serverIp}:/opt/forge-client/`,
      { timeout: 120_000 },
    )

    // ── 4. Démarrage des conteneurs ──────────────────────────
    await onProgress('Démarrage des conteneurs Docker…', 4, TOTAL_STEPS)
    await ssh('cd /opt/forge-client && docker compose pull --quiet 2>/dev/null || true')
    await ssh('cd /opt/forge-client && docker compose up -d --remove-orphans')

    // ── 5. Seed base de données ──────────────────────────────
    await onProgress('Injection des données d\'audit…', 5, TOTAL_STEPS)
    // Attendre que postgres soit prêt (max 60s)
    await ssh('for i in $(seq 1 12); do docker compose -f /opt/forge-client/docker-compose.yml exec -T postgres pg_isready -U forge && break || sleep 5; done')
    await ssh('cd /opt/forge-client && docker compose exec -T postgres psql -U forge forge < /opt/forge-client/seed.sql')

    // ── 5b. DNS Cloudflare si mode auto ─────────────────────
    if (domainMode === 'cloudflare' && domain) {
      await createCloudflareRecord(domain, serverIp)
    }

    await onProgress('Déploiement terminé.', 6, TOTAL_STEPS)
  } finally {
    await Promise.all([
      unlink(keyPath).catch(() => {}),
      rm(tmpDir, { recursive: true, force: true }).catch(() => {}),
    ])
  }
}

// ── Génération .env ──────────────────────────────────────────

function generateEnvVars(domain: string, adminEmail: string, adminHash: string): Record<string, string> {
  const rand = (n = 32) => require('crypto').randomBytes(n).toString('base64').slice(0, n).replace(/[+/=]/g, 'x')
  return {
    NODE_ENV:                 'production',
    FORGE_IMAGE:              process.env.FORGE_IMAGE || 'ghcr.io/toussaintgarinat-crypto/forge-core:latest',
    DOMAIN:                   domain || 'localhost',
    FRONTEND_URL:             domain ? `https://${domain}` : 'http://localhost:3001',
    KEYCLOAK_URL:             domain ? `https://${domain}/auth` : 'http://keycloak:8080',
    KEYCLOAK_REALM:           'forge',
    KEYCLOAK_CLIENT_ID:       'forge-app',
    KEYCLOAK_AUDIENCE:        'forge-app',
    JWT_SECRET:               rand(48),
    ENCRYPTION_KEY:           rand(32),
    POSTGRES_USER:            'forge',
    POSTGRES_PASSWORD:        rand(24),
    POSTGRES_DB:              'forge',
    DATABASE_URL:             '', // calculé après
    KC_DB_PASSWORD:           rand(24),
    KEYCLOAK_ADMIN:           'admin',
    KEYCLOAK_ADMIN_PASSWORD:  rand(24),
    ADMIN_EMAIL:              adminEmail,
    LETSENCRYPT_EMAIL:        adminEmail,
  }
}

function generateDotEnv(env: Record<string, string>): string {
  const e = { ...env }
  e.DATABASE_URL = `postgresql://${e.POSTGRES_USER}:${e.POSTGRES_PASSWORD}@postgres:5432/${e.POSTGRES_DB}`
  return Object.entries(e)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n'
}

// ── Génération docker-compose.yml ─────────────────────────────

function generateDockerCompose(domain: string, domainMode: string, env: Record<string, string>): string {
  const withTraefik = domainMode === 'cloudflare' && domain

  const traefikService = withTraefik ? `
  traefik:
    image: traefik:v3.0
    command:
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --entrypoints.web.address=:80
      - --entrypoints.web.http.redirections.entrypoint.to=websecure
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.le.acme.httpchallenge=true
      - --certificatesresolvers.le.acme.httpchallenge.entrypoint=web
      - --certificatesresolvers.le.acme.email=\${LETSENCRYPT_EMAIL}
      - --certificatesresolvers.le.acme.storage=/letsencrypt/acme.json
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - letsencrypt:/letsencrypt
    restart: unless-stopped` : ''

  const forgeLabels = withTraefik ? `
    labels:
      - traefik.enable=true
      - traefik.http.routers.forge.rule=Host(\`\${DOMAIN}\`)
      - traefik.http.routers.forge.entrypoints=websecure
      - traefik.http.routers.forge.tls.certresolver=le
      - traefik.http.services.forge.loadbalancer.server.port=3001` : `
    ports:
      - "3001:3001"`

  const kcLabels = withTraefik ? `
    labels:
      - traefik.enable=true
      - traefik.http.routers.keycloak.rule=Host(\`\${DOMAIN}\`) && PathPrefix(\`/auth\`)
      - traefik.http.routers.keycloak.entrypoints=websecure
      - traefik.http.routers.keycloak.tls.certresolver=le
      - traefik.http.services.keycloak.loadbalancer.server.port=8080` : `
    ports:
      - "8080:8080"`

  const letsencryptVol = withTraefik ? '\n  letsencrypt:' : ''

  return `version: '3.9'

services:

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: \${POSTGRES_USER}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_DB: \${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER}"]
      interval: 5s
      timeout: 3s
      retries: 20
      start_period: 10s
    restart: unless-stopped

  keycloak-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: \${KC_DB_PASSWORD}
      POSTGRES_DB: keycloak
    volumes:
      - kc_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U keycloak"]
      interval: 5s
      timeout: 3s
      retries: 10
    restart: unless-stopped

  keycloak:
    image: quay.io/keycloak/keycloak:25.0
    command: start --import-realm
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://keycloak-db:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: \${KC_DB_PASSWORD}
      KC_HOSTNAME_STRICT: "false"
      KC_HTTP_ENABLED: "true"
      KC_HTTP_RELATIVE_PATH: /auth
      KEYCLOAK_ADMIN: \${KEYCLOAK_ADMIN}
      KEYCLOAK_ADMIN_PASSWORD: \${KEYCLOAK_ADMIN_PASSWORD}
    volumes:
      - ./forge-realm.json:/opt/keycloak/data/import/forge-realm.json:ro
    depends_on:
      keycloak-db:
        condition: service_healthy${kcLabels}
    restart: unless-stopped

  forge:
    image: \${FORGE_IMAGE}
    environment:
      NODE_ENV: \${NODE_ENV}
      DATABASE_URL: postgresql://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@postgres:5432/\${POSTGRES_DB}
      KEYCLOAK_URL: \${KEYCLOAK_URL}
      KEYCLOAK_REALM: \${KEYCLOAK_REALM}
      KEYCLOAK_CLIENT_ID: \${KEYCLOAK_CLIENT_ID}
      KEYCLOAK_AUDIENCE: \${KEYCLOAK_AUDIENCE}
      JWT_SECRET: \${JWT_SECRET}
      ENCRYPTION_KEY: \${ENCRYPTION_KEY}
      FRONTEND_URL: \${FRONTEND_URL}
    depends_on:
      postgres:
        condition: service_healthy${forgeLabels}
    restart: unless-stopped
${traefikService}

volumes:
  postgres_data:
  kc_data:${letsencryptVol}
`
}

// ── Génération forge-realm.json ───────────────────────────────

function generateRealmJson(domain: string, adminUserId: string, adminEmail: string, adminPassword: string): string {
  const baseUrl = domain ? `https://${domain}` : 'http://localhost:3001'
  return JSON.stringify({
    realm: 'forge',
    displayName: 'Forge Client',
    enabled: true,
    sslRequired: domain ? 'external' : 'none',
    registrationAllowed: false,
    loginWithEmailAllowed: true,
    duplicateEmailsAllowed: false,
    resetPasswordAllowed: true,
    bruteForceProtected: true,
    accessTokenLifespan: 300,
    ssoSessionMaxLifespan: 36000,
    clients: [
      {
        clientId: 'forge-app',
        name: 'Forge Application',
        enabled: true,
        publicClient: true,
        standardFlowEnabled: true,
        directAccessGrantsEnabled: false,
        redirectUris: [`${baseUrl}/*`],
        webOrigins: [baseUrl],
        attributes: {
          'pkce.code.challenge.method': 'S256',
          'post.logout.redirect.uris': `${baseUrl}/*`,
        },
        protocolMappers: [
          {
            name: 'audience',
            protocol: 'openid-connect',
            protocolMapper: 'oidc-audience-mapper',
            consentRequired: false,
            config: {
              'included.client.audience': 'forge-app',
              'id.token.claim': 'false',
              'access.token.claim': 'true',
            },
          },
        ],
      },
    ],
    roles: {
      realm: [
        { name: 'admin', description: 'Forge administrator' },
        { name: 'member', description: 'Forge member' },
      ],
    },
    defaultRoles: ['member'],
    users: [
      {
        id: adminUserId,
        username: adminEmail,
        email: adminEmail,
        enabled: true,
        emailVerified: true,
        credentials: [{ type: 'password', value: adminPassword, temporary: false }],
        realmRoles: ['admin', 'member'],
      },
    ],
  }, null, 2)
}

// ── Génération seed.sql ───────────────────────────────────────

function generateSeedSql(
  adminUserId: string,
  adminEmail: string,
  mission: DeployOpts['missionData'],
): string {
  const esc     = (s: string) => s.replace(/'/g, "''")
  const mId     = randomUUID()
  const ventureId = randomUUID()
  const poleId  = randomUUID()
  const now     = new Date().toISOString()

  const findingRows = mission.findings.map(f =>
    `('${randomUUID()}','${mId}','${adminUserId}','${esc(f.categorie)}','${f.severite}','${esc(f.description)}','${esc(f.source)}','${now}')`
  ).join(',\n  ')

  const recoRows = mission.recos.map(r =>
    `('${randomUUID()}','${mId}','${adminUserId}','${r.priorite}','${esc(r.action)}','${r.statut}','${now}')`
  ).join(',\n  ')

  const rapportContenu = mission.rapport ? esc(mission.rapport) : ''

  return `-- Forge Client Seed — généré automatiquement
BEGIN;

-- Utilisateur admin
INSERT INTO users (id, email, nom, avatar_emoji, keycloak_sub, created_at)
VALUES ('${adminUserId}','${esc(adminEmail)}','Admin','👤','${adminUserId}','${now}')
ON CONFLICT (email) DO NOTHING;

-- Venture + pôle Finance
INSERT INTO organizations (id, name, slug, created_at)
VALUES ('${ventureId}','${esc(mission.titre)}','audit-client','${now}')
ON CONFLICT DO NOTHING;

INSERT INTO poles (id, nom, description, emoji, couleur, type, owner_id, created_at)
VALUES ('${poleId}','Audit','Mission d\'audit importée','🔍','#6366f1','finance','${adminUserId}','${now}');

-- Mission d'audit
INSERT INTO audit_missions (id, pole_id, user_id, titre, description, statut, created_at, updated_at)
VALUES ('${mId}','${poleId}','${adminUserId}','${esc(mission.titre)}','${esc(mission.description)}','termine','${now}','${now}');

-- Findings
${mission.findings.length > 0 ? `INSERT INTO audit_findings (id, mission_id, user_id, categorie, severite, description, source, created_at)
VALUES
  ${findingRows};` : '-- (aucun finding)'}

-- Recommandations
${mission.recos.length > 0 ? `INSERT INTO audit_recommendations (id, mission_id, user_id, priorite, action, statut, created_at)
VALUES
  ${recoRows};` : '-- (aucune recommandation)'}

${rapportContenu ? `-- Rapport
INSERT INTO rapports (id, user_id, mission_id, titre, contenu, type, periode, created_at)
VALUES ('${randomUUID()}','${adminUserId}','${mId}','Rapport d\\'audit — ${esc(mission.titre)}','${rapportContenu}','audit','${now}','${now}');` : ''}

COMMIT;
`
}
