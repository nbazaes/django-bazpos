import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'))

function findChangelog() {
  const candidates = ['./CHANGELOG.md', '../CHANGELOG.md']
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8')
  }
  return ''
}

function parseChangelog(markdown) {
  const entries = []
  const lines = markdown.split('\n')

  let current = null
  let currentSection = null
  for (const line of lines) {
    const secMatch = /^##\s+\[([^\]]+)\]\s*-\s*(.*)$/.exec(line.trim())
    if (secMatch) {
      current = { version: secMatch[1].trim(), date: secMatch[2].trim(), sections: {} }
      currentSection = null
      entries.push(current)
      continue
    }
    if (!current) continue
    const subMatch = /^###\s+(.+)$/.exec(line.trim())
    if (subMatch) {
      currentSection = subMatch[1].trim()
      current.sections[currentSection] = []
      continue
    }
    const itemMatch = /^[-*]\s+(.+)$/.exec(line.trim())
    if (itemMatch && currentSection) {
      current.sections[currentSection].push(itemMatch[1].trim())
    }
  }
  return entries
}

const changelog = parseChangelog(findChangelog())

export default defineConfig({
  plugins: [tailwindcss(), react()],
  define: {
    'import.meta.env.APP_VERSION': JSON.stringify(pkg.version),
    'import.meta.env.CHANGELOG': JSON.stringify(changelog),
  },
})
