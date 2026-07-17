import { describe, expect, it } from 'vitest'
import { checkReportInvariants } from './reportInvariants.ts'

const facts = { lateCurrent: 10, latePrev: 12 }

const goodReport = [
  '📋 Краткий итог',
  'Покрытие данных: метрики 14/14 дней, сон 11/14 ночей.',
  '😴 Сон',
  'Поздних засыпаний 10 против 12 в прошлом периоде.',
  'В начале периода отмечался эпизод желудочно-кишечного недомогания — причину по данным установить нельзя.',
].join('\n')

describe('checkReportInvariants', () => {
  it('passes a well-formed report', () => {
    expect(checkReportInvariants(goodReport, facts)).toEqual([])
  })

  it('flags markdown markup', () => {
    expect(checkReportInvariants(goodReport + '\n**Итог**', facts)).not.toEqual([])
    expect(checkReportInvariants(goodReport + '\n## Сон', facts)).not.toEqual([])
  })

  it('flags diagnosis-guess vocabulary', () => {
    for (const bad of ['возможно, это вирус', 'похоже на отравление', 'начало инфекции']) {
      expect(checkReportInvariants(`${goodReport}\n${bad}`, facts)).not.toEqual([])
    }
  })

  it('flags a report without a data-coverage statement', () => {
    const noCoverage = goodReport.split('\n').filter(l => !l.includes('Покрытие')).join('\n')
    expect(checkReportInvariants(noCoverage, facts)).not.toEqual([])
  })

  it('flags late-bedtime talk that drops the precomputed counts', () => {
    const wrongCounts = goodReport.replace('10 против 12', '9 против 13')
    expect(checkReportInvariants(wrongCounts, facts)).not.toEqual([])
  })

  it('does not require counts when late bedtimes are not mentioned', () => {
    const noLate = goodReport.split('\n').filter(l => !/поздн/i.test(l)).join('\n')
    expect(checkReportInvariants(noLate, facts)).toEqual([])
  })
})
