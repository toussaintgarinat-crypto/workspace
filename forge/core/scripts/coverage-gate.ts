#!/usr/bin/env bun
// Coverage gate (S102) — Bun 1.3 ne supporte pas encore --cov-fail-under
// On lance `bun test --coverage`, on parse la dernière ligne "All files | ... | <lines%>",
// puis on exit(1) si elle est sous le seuil.

import { spawn } from 'bun'

const THRESHOLD = Number(process.env.COVERAGE_THRESHOLD ?? '30')

const proc = spawn(['bun', 'test', '--coverage'], {
  stdout: 'pipe',
  stderr: 'pipe',
})

const [stdout, stderr] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
])
const exitCode = await proc.exited

// Bun affiche son rapport coverage sur stderr (ANSI inclus)
const combined = stdout + '\n' + stderr
process.stdout.write(combined)

if (exitCode !== 0) {
  console.error(`[coverage-gate] bun test échoué (code ${exitCode})`)
  process.exit(exitCode)
}

// Cherche la ligne "All files                  |  XX.XX |  YY.YY |"
const allFilesLine = combined.split('\n').find(l => /All files/.test(l))
if (!allFilesLine) {
  console.error('[coverage-gate] Impossible de trouver la ligne "All files" — coverage activé ?')
  process.exit(1)
}

// Match : "All files | <funcs> | <lines> | ..."
const m = allFilesLine.match(/All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/)
if (!m) {
  console.error(`[coverage-gate] Ligne mal formée : ${allFilesLine}`)
  process.exit(1)
}

const linesPct = Number(m[2])
console.log(`[coverage-gate] Lines coverage = ${linesPct}% (seuil = ${THRESHOLD}%)`)

if (linesPct < THRESHOLD) {
  console.error(`[coverage-gate] ❌ Couverture sous le seuil (${linesPct}% < ${THRESHOLD}%)`)
  process.exit(1)
}
console.log(`[coverage-gate] ✅ Couverture OK (${linesPct}% ≥ ${THRESHOLD}%)`)
