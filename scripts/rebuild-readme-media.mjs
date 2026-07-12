import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
let preview = null
let previewStartError = null

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit', ...options })
    child.once('error', reject)
    child.once('exit', code => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`))
    })
  })
}

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local preview port')
  const { port } = address
  await new Promise(resolve => server.close(resolve))
  return port
}

async function waitForPreview(base, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    if (previewStartError) throw previewStartError
    try {
      const response = await fetch(base)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(`Preview did not start at ${base}: ${lastError?.message ?? 'timeout'}`)
}

async function stopPreview() {
  if (!preview || preview.exitCode !== null) return
  const stopped = new Promise(resolve => preview.once('exit', resolve))
  preview.kill('SIGTERM')
  const timedOut = new Promise(resolve => setTimeout(resolve, 5_000, 'timeout'))
  if (await Promise.race([stopped, timedOut]) === 'timeout' && preview.exitCode === null) {
    preview.kill('SIGKILL')
    await stopped
  }
}

async function main() {
  await run(npm, ['run', 'build'])
  const port = await freePort()
  const base = `http://localhost:${port}`
  preview = spawn(process.execPath, [vite, 'preview', '--port', String(port), '--strictPort'], {
    cwd: ROOT,
    stdio: 'inherit',
  })
  preview.once('error', error => { previewStartError = error })
  await waitForPreview(base)
  await run(process.execPath, ['scripts/record-readme-media.mjs'], {
    env: { ...process.env, README_MEDIA_PORT: String(port) },
  })
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    stopPreview().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143))
  })
}

try {
  await main()
} finally {
  await stopPreview()
}
