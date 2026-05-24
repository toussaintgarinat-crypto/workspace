// Cloudflare DNS API — crée un enregistrement A pour le déploiement client

export async function createCloudflareRecord(subdomain: string, ip: string): Promise<void> {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  const zoneId   = process.env.CLOUDFLARE_ZONE_ID

  if (!apiToken || !zoneId) {
    throw new Error('CLOUDFLARE_API_TOKEN et CLOUDFLARE_ZONE_ID doivent être configurés pour le mode Cloudflare auto.')
  }

  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'A',
      name: subdomain,
      content: ip,
      ttl: 1,
      proxied: false,
    }),
  })

  const data = await res.json() as { success: boolean; errors: any[] }
  if (!data.success) {
    throw new Error(`Cloudflare DNS error: ${JSON.stringify(data.errors)}`)
  }
}
