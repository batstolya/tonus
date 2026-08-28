import { describe, it, expect } from 'vitest'
import { routeText, routeCallback } from './router.ts'

describe('routeText', () => {
  it('routes /start with and without a token (startsWith semantics preserved)', () => {
    expect(routeText('/start abc123')).toEqual({ kind: 'start', token: 'abc123' })
    expect(routeText('/start')).toEqual({ kind: 'start', token: '' })
    // Historical behavior: startsWith('/start') also catches this form.
    expect(routeText('/startxyz')).toEqual({ kind: 'start', token: '' })
  })

  it('routes exact commands to their tags', () => {
    for (const [text, kind] of [
      ['/menu', 'menu'], ['/report', 'report'], ['/status', 'status'], ['/last', 'last'],
      ['/sync', 'sync'], ['/pause', 'pause'], ['/resume', 'resume'],
      ['/football', 'football'], ['/matches', 'matches'],
      ['/football_on', 'football_on'], ['/football_off', 'football_off'],
      ['/tokens', 'tokens'], ['/usage', 'usage'], ['/ideas', 'ideas'], ['/widget', 'widget'],
    ] as const) {
      expect(routeText(text)).toEqual({ kind })
    }
  })

  it('routes /срыв and its English alias to the habit list, no daily ping involved', () => {
    expect(routeText('/срыв')).toEqual({ kind: 'habits' })
    expect(routeText('/break')).toEqual({ kind: 'habits' })
  })

  it('routes /idea with and without text', () => {
    expect(routeText('/idea')).toEqual({ kind: 'idea', idea: '' })
    expect(routeText('/idea выпить воды')).toEqual({ kind: 'idea', idea: 'выпить воды' })
  })

  it('flags unknown slash commands and falls through to chat otherwise', () => {
    expect(routeText('/foobar')).toEqual({ kind: 'unknown_command' })
    expect(routeText('как мой сон?')).toEqual({ kind: 'chat' })
    expect(routeText('')).toEqual({ kind: 'chat' })
  })
})

describe('routeCallback', () => {
  it('maps plain actions to themselves', () => {
    for (const a of [
      'menu', 'report', 'status', 'supplements', 'goals', 'settings', 'exp_suggest',
      'pause', 'resume', 'disconnect', 'fb_matches', 'fb_on', 'fb_off', 'nudge_no',
    ] as const) {
      expect(routeCallback(a)).toEqual({ kind: a })
    }
  })

  it('parses payload-carrying callbacks', () => {
    expect(routeCallback('expsug:ev-1')).toEqual({ kind: 'expsug', eventId: 'ev-1' })
    expect(routeCallback('wb:2026-07-17:4')).toEqual({ kind: 'wellbeing', date: '2026-07-17', score: 4 })
    expect(routeCallback('take_sup-9')).toEqual({ kind: 'take', supplementId: 'sup-9' })
    expect(routeCallback('nudge_acc:late_coffee')).toEqual({ kind: 'nudge_acc', subtype: 'late_coffee' })
    expect(routeCallback('fw:whatever')).toEqual({ kind: 'football_response', data: 'fw:whatever' })
  })

  it('parses reminder callbacks including the snooze minutes suffix', () => {
    expect(routeCallback('rem_take_ev-1')).toEqual({ kind: 'reminder', action: 'take', eventId: 'ev-1', minutes: 60 })
    expect(routeCallback('rem_skip_ev-1')).toEqual({ kind: 'reminder', action: 'skip', eventId: 'ev-1', minutes: 60 })
    expect(routeCallback('rem_snz_ev-1_120')).toEqual({ kind: 'reminder', action: 'snz', eventId: 'ev-1', minutes: 120 })
    // Malformed minutes falls back to 60 (historical parseInt || 60).
    expect(routeCallback('rem_snz_ev-1_x')).toEqual({ kind: 'reminder', action: 'snz', eventId: 'ev-1', minutes: 60 })
  })

  it('ignores anything unrecognized', () => {
    expect(routeCallback('mystery')).toEqual({ kind: 'ignore' })
  })
})

describe('routeCallback (habits)', () => {
  it('routes the habits list button', () => {
    expect(routeCallback('habits')).toEqual({ kind: 'habits' })
  })

  it('opens the day picker for a habit', () => {
    expect(routeCallback('hb:11111111-1111-1111-1111-111111111111')).toEqual({
      kind: 'habit_menu', habitId: '11111111-1111-1111-1111-111111111111',
    })
  })

  it('routes a habit break callback to the habit handler', () => {
    expect(routeCallback('hb:11111111-1111-1111-1111-111111111111:1')).toEqual({
      kind: 'habit_break', habitId: '11111111-1111-1111-1111-111111111111', dayOffset: 1, broken: true,
    })
  })

  it('routes a clear callback', () => {
    expect(routeCallback('hbx:11111111-1111-1111-1111-111111111111:0')).toEqual({
      kind: 'habit_break', habitId: '11111111-1111-1111-1111-111111111111', dayOffset: 0, broken: false,
    })
  })

  it('rejects an offset beyond yesterday', () => {
    expect(routeCallback('hb:11111111-1111-1111-1111-111111111111:5')).toBeNull()
    expect(routeCallback('hbx:11111111-1111-1111-1111-111111111111:5')).toBeNull()
  })
})
