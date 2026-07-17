import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.APP_VERSION': JSON.stringify(pkg.version),
  },
})
