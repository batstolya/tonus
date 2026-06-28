import { describe, it, expect } from 'vitest'
import { detectSaveIntent } from './saveIntent.ts'

describe('detectSaveIntent', () => {
  it('detects idea intents with content', () => {
    expect(detectSaveIntent('добавь в идею пить больше воды')).toEqual({ kind: 'idea', content: 'пить больше воды' })
    expect(detectSaveIntent('запиши идею: меньше кофе после обеда')).toEqual({ kind: 'idea', content: 'меньше кофе после обеда' })
    expect(detectSaveIntent('А добавь в идею.')).toEqual({ kind: 'idea', content: '' })
  })

  it('detects note intents with content', () => {
    expect(detectSaveIntent('запиши в заметки, что мне нужно поправить напоминание'))
      .toEqual({ kind: 'note', content: 'мне нужно поправить напоминание' })
    expect(detectSaveIntent('запомни что я плохо сплю в жару')).toEqual({ kind: 'note', content: 'я плохо сплю в жару' })
    expect(detectSaveIntent('сохрани заметку: купить магний')).toEqual({ kind: 'note', content: 'купить магний' })
  })

  it('does NOT hijack food logs or questions', () => {
    expect(detectSaveIntent('запиши грушу')).toBeNull()
    expect(detectSaveIntent('съел макдак')).toBeNull()
    expect(detectSaveIntent('что такое идея фастинга?')).toBeNull()
    expect(detectSaveIntent('почему я так устаю днём?')).toBeNull()
    expect(detectSaveIntent('')).toBeNull()
  })
})
