import { describe, it, expect } from 'vitest'
import { parseInline, parseChatMarkdown } from './chatMarkdown'

describe('parseInline', () => {
  it('splits **bold** into alternating spans', () => {
    expect(parseInline('Твой сон **7.4ч** в норме.')).toEqual([
      { text: 'Твой сон ', bold: false },
      { text: '7.4ч', bold: true },
      { text: ' в норме.', bold: false },
    ])
  })

  it('handles a bold label at the start', () => {
    expect(parseInline('**Зниження спеки:** менше впливу')).toEqual([
      { text: 'Зниження спеки:', bold: true },
      { text: ' менше впливу', bold: false },
    ])
  })

  it('returns a single plain span when there is no markup', () => {
    expect(parseInline('просто текст')).toEqual([{ text: 'просто текст', bold: false }])
  })

  it('returns empty for an empty string', () => {
    expect(parseInline('')).toEqual([])
  })
})

describe('parseChatMarkdown', () => {
  it('renders a bullet list with bold labels as a list block', () => {
    const blocks = parseChatMarkdown('Причини:\n* **Спека:** спала\n* **Підвал:** тихіше')
    expect(blocks).toEqual([
      { type: 'paragraph', spans: [{ text: 'Причини:', bold: false }] },
      {
        type: 'list',
        items: [
          [{ text: 'Спека:', bold: true }, { text: ' спала', bold: false }],
          [{ text: 'Підвал:', bold: true }, { text: ' тихіше', bold: false }],
        ],
      },
    ])
  })

  it('accepts both * and - bullets', () => {
    const blocks = parseChatMarkdown('- один\n- два')
    expect(blocks).toEqual([
      { type: 'list', items: [[{ text: 'один', bold: false }], [{ text: 'два', bold: false }]] },
    ])
  })

  it('treats blank lines as paragraph separators, not empty paragraphs', () => {
    const blocks = parseChatMarkdown('первый\n\nвторой')
    expect(blocks).toEqual([
      { type: 'paragraph', spans: [{ text: 'первый', bold: false }] },
      { type: 'paragraph', spans: [{ text: 'второй', bold: false }] },
    ])
  })

  it('renders plain text (no markdown) as one paragraph — the common case', () => {
    const blocks = parseChatMarkdown('Твой средний сон 7.4 часа.')
    expect(blocks).toEqual([
      { type: 'paragraph', spans: [{ text: 'Твой средний сон 7.4 часа.', bold: false }] },
    ])
  })

  it('returns no blocks for empty content', () => {
    expect(parseChatMarkdown('')).toEqual([])
  })
})
