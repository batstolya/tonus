// In-memory «БД» демо-режима: таблицы сидятся фикстурами из demoSeed при первом
// обращении, записи (добавил кофе, отметил БАД, создал цель) идут сюда же —
// поэтому экраны в демо остаются интерактивными без Supabase.
//
// Стор живёт только в памяти модуля: перезагрузка страницы возвращает эталонное
// состояние. Это осознанный выбор (см. docs/superpowers/specs/2026-07-14-demo-data-coverage-design.md):
// демо-гость всегда видит одну и ту же картину, и нам проще проверять экраны.
import { makeDemoSeed, type DemoSeed } from './demoSeed'
import { translateStandalone } from './translate'

type TableName = keyof DemoSeed
type Row = { id: string }

let db: DemoSeed | null = null

function tables(): DemoSeed {
  if (!db) db = makeDemoSeed()
  return db
}

// Фикстуры хранятся по-русски, потому что русский текст — это ключ словаря.
// Переводим их на выходе, чтобы uk/en-гость не читал русские названия БАДов и
// маркеров: экранам не нужно оборачивать данные в t(), а строки, которых нет в
// словаре (id, даты, дозы, текст самого юзера), возвращаются как есть.
function localize<T>(row: T): T {
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) }
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'string') out[k] = translateStandalone(v)
  }
  return out as T
}

// Копия строк: экраны свободно сортируют/мутируют результат, стор не страдает.
export function demoList<K extends TableName>(table: K): DemoSeed[K] {
  return tables()[table].map(localize) as DemoSeed[K]
}

// Возвращаем локализованную копию: экран кладёт её прямо в стейт, и свежая
// запись выглядит так же, как пришедшая из demoList (единицы, названия).
export function demoInsert<K extends TableName>(table: K, row: DemoSeed[K][number]): DemoSeed[K][number] {
  const rows = tables()[table] as Row[]
  rows.unshift(row as Row)
  return localize(row)
}

export function demoUpdate<K extends TableName>(
  table: K,
  id: string,
  patch: Partial<DemoSeed[K][number]>,
): void {
  const rows = tables()[table] as Row[]
  const i = rows.findIndex(r => r.id === id)
  if (i >= 0) rows[i] = { ...rows[i], ...patch }
}

export function demoRemove<K extends TableName>(table: K, id: string): void {
  const rows = tables()[table] as Row[]
  const i = rows.findIndex(r => r.id === id)
  if (i >= 0) rows.splice(i, 1)
}

// id для строк, созданных юзером в демо.
export function demoId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}`
}

// Сбросить стор к фикстурам (нужен тестам; в браузере это делает перезагрузка).
export function demoReset(): void {
  db = null
}
