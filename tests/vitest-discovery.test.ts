import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

// Каждый тест-файл обязан попадать хотя бы в один vitest-проект. Проверка
// появилась после того, как переезд в воркспейсы (фаза 1) молча осиротил 28
// тестов edge-функций: apps/web ищет тесты только внутри apps/web,
// packages/shared — внутри своего src, корневой `repo` — только в tests/, и
// supabase/functions/** не совпал ни с одним include. Ничего не покраснело —
// файлы просто перестали запускаться.
//
// Владельцы по префиксу пути; сам факт наличия проекта проверяется ниже.
const OWNERS: { prefix: string; owner: string }[] = [
  { prefix: 'apps/web/', owner: 'apps/web/vitest.config.ts' },
  { prefix: 'apps/mobile/', owner: 'apps/mobile (тестов пока нет — логика живёт в packages/shared)' },
  { prefix: 'packages/shared/src/', owner: 'packages/shared/vitest.config.ts' },
  { prefix: 'tests/', owner: 'vitest.config.ts → project "repo"' },
  { prefix: 'scripts/', owner: 'vitest.config.ts → project "repo"' },
  { prefix: 'supabase/functions/', owner: 'vitest.config.ts → project "functions"' },
]

function trackedTestFiles(): string[] {
  return execSync("git ls-files '*.test.ts' '*.test.tsx'", { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter(f => !f.startsWith('.claude/'))
}

describe('Vitest discovery', () => {
  it('keeps Node-native script tests (node:test) out of Vitest', () => {
    // scripts/*.test.mjs — это node:test, они запускаются через `npm run
    // test:scripts`; vitest должен исключать весь каталог scripts.
    const config = fs.readFileSync('apps/web/vitest.config.ts', 'utf8')
    expect(config).toContain("'scripts/**'")
  })

  it('has a vitest project covering every tracked test file', () => {
    const orphans = trackedTestFiles().filter(file => !OWNERS.some(o => file.startsWith(o.prefix)))
    expect(
      orphans,
      `Эти тесты не попадают ни в один vitest-проект и не будут запускаться:\n` +
      `${orphans.join('\n')}\n` +
      `Заведи проект в vitest.config.ts (или добавь префикс в OWNERS, если он уже накрыт).`,
    ).toEqual([])
  })

  it('runs the edge-function tests from the root config', () => {
    // Именно этот проект и потерялся — без него 28 файлов лежали мёртвым грузом.
    const config = fs.readFileSync('vitest.config.ts', 'utf8')
    expect(config).toContain("supabase/functions/**/*.test.ts")
  })

  it('runs the TypeScript script tests from the root repo project', () => {
    const config = fs.readFileSync('vitest.config.ts', 'utf8')
    expect(config).toContain("scripts/**/*.test.ts")
  })
})
