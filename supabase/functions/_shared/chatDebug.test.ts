import { describe, it, expect } from 'vitest'
import { parseDebugReply, formatToolTrace } from './chatDebug.ts'

describe('parseDebugReply', () => {
  it('парсит чистый JSON', () => {
    expect(parseDebugReply('{"answer":"Сон 7ч","reason":"по контексту"}'))
      .toEqual({ answer: 'Сон 7ч', reason: 'по контексту' })
  })
  it('снимает ```json ограждение', () => {
    const raw = '```json\n{"answer":"ок","reason":"r"}\n```'
    expect(parseDebugReply(raw)).toEqual({ answer: 'ок', reason: 'r' })
  })
  it('на мусоре — фолбэк: сырой текст как answer, пустой reason', () => {
    expect(parseDebugReply('просто текст без json'))
      .toEqual({ answer: 'просто текст без json', reason: '' })
  })
  it('на JSON без answer — фолбэк', () => {
    expect(parseDebugReply('{"reason":"есть, а answer нет"}'))
      .toEqual({ answer: '{"reason":"есть, а answer нет"}', reason: '' })
  })
})

describe('formatToolTrace', () => {
  it('диапазонные инструменты → name(start..end)', () => {
    expect(formatToolTrace([{ name: 'get_sleep_range', args: { start_date: '2026-06-01', end_date: '2026-06-30' } }]))
      .toEqual(['get_sleep_range(2026-06-01..2026-06-30)'])
  })
  it('get_lab_history → name(marker)', () => {
    expect(formatToolTrace([{ name: 'get_lab_history', args: { marker: 'Ферритин' } }]))
      .toEqual(['get_lab_history(Ферритин)'])
  })
  it('get_correlations → name(outcome|all)', () => {
    expect(formatToolTrace([
      { name: 'get_correlations', args: { outcome: 'hrv' } },
      { name: 'get_correlations', args: {} },
    ])).toEqual(['get_correlations(hrv)', 'get_correlations(all)'])
  })
  it('пустой список → пустой массив', () => {
    expect(formatToolTrace([])).toEqual([])
  })
})
