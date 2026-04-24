import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   Number(process.env.SMTP_PORT)  || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
})

export async function sendVentureDeletionCode(opts: {
  to:          string
  ventureName: string
  code:        string
  expiresIn:   string
}) {
  await transporter.sendMail({
    from:    process.env.SMTP_FROM || `"Forge" <${process.env.SMTP_USER}>`,
    to:      opts.to,
    subject: `[Forge] Confirmation de suppression — ${opts.ventureName}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#6366f1">⚡ Forge</h2>
        <p>Vous avez demandé la suppression de la venture <strong>${opts.ventureName}</strong>.</p>
        <p>Voici votre code de confirmation :</p>
        <div style="font-size:36px;font-weight:700;letter-spacing:12px;text-align:center;padding:24px;background:#0f0f17;border-radius:12px;color:#818cf8;margin:24px 0">
          ${opts.code}
        </div>
        <p style="color:#888;font-size:13px">Ce code expire dans ${opts.expiresIn}.<br>
        Si vous n'avez pas demandé cette suppression, ignorez cet email.</p>
        <hr style="border:none;border-top:1px solid #222;margin:24px 0">
        <p style="color:#555;font-size:12px">Cette action est <strong>irréversible</strong> — tous les pôles, sessions et données associés seront supprimés.</p>
      </div>
    `,
  })
}
