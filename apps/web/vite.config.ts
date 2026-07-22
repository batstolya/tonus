import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const releaseSha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? ''
const deploymentEnvironment = process.env.VERCEL_ENV === 'production' || process.env.GITHUB_REF === 'refs/heads/main'
  ? 'production'
  : 'preview'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __TONUS_RELEASE_SHA__: JSON.stringify(releaseSha),
    __TONUS_ENVIRONMENT__: JSON.stringify(deploymentEnvironment),
  },
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
})
