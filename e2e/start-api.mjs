// Starts a throwaway Voyance API for the tests: fresh SQLite file, seeded with the fixed keys from the environment.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const tmp = join(here, '.tmp')
const port = process.env.E2E_API_PORT ?? '8001'

const venv = process.platform === 'win32' ? join(root, '.venv', 'Scripts', 'python.exe') : join(root, '.venv', 'bin', 'python')
const python = process.env.PYTHON ?? (existsSync(venv) ? venv : process.platform === 'win32' ? 'python' : 'python3')

rmSync(tmp, { recursive: true, force: true })
mkdirSync(tmp, { recursive: true })
const env = { ...process.env, VOYANCE_DATABASE_URL: `sqlite:///${join(tmp, 'e2e.db').replaceAll('\\', '/')}` }

const seed = spawnSync(python, ['scripts/seed_demo.py'], { cwd: root, env, encoding: 'utf8' })
if (seed.status !== 0) {
  console.error(seed.stderr || seed.error)
  process.exit(1)
}

const api = spawn(python, ['-m', 'uvicorn', 'voyance.api.app:create_app', '--factory', '--port', port], {
  cwd: root,
  env,
  stdio: 'inherit',
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => api.kill(signal))
api.on('exit', (code) => process.exit(code ?? 0))
