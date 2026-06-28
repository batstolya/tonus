// Распознаёт явную просьбу пользователя «сохранить как идею/заметку» в свободном
// тексте (в т.ч. в транскрипте голосового). Чистая функция → тестируется vitest.
//
// Намеренно высокоточная: срабатывает только на глагол сохранения + слово
// «идея/заметка/запомни», чтобы НЕ перехватывать логи еды («запиши грушу») и
// вопросы («что такое идея X»). Остальное остаётся обычному роутеру.

export interface SaveIntent {
  kind: 'idea' | 'note'
  content: string
}

// Убираем ведущие филлеры и пунктуацию: «А, ну запиши…» → «запиши…»
function stripFiller(s: string): string {
  return s.replace(/^(?:а|ну|слушай|эй|бот|ок|окей|давай|пожалуйста)[\s,.]+/i, '').trim()
}

export function detectSaveIntent(input: string): SaveIntent | null {
  const text = stripFiller((input ?? '').trim())
  if (!text) return null

  // ИДЕЯ: «добавь/запиши/сохрани/закинь (это) (в) идею …»
  // NB: \b/\w в JS не работают с кириллицей — используем явные классы и разделители.
  const ideaVerb = /^(?:добав(?:ь|ить|и)|запиш(?:и|ите|ы)|сохран(?:и|ить)|закин(?:ь|и))\s+(?:это\s+)?(?:в\s+)?иде[июяы][\s:,.\-—]*(.*)$/i
  const im = text.match(ideaVerb)
  if (im) return { kind: 'idea', content: im[1].trim() }
  // «идея: …» / «идея …»
  const im2 = text.match(/^иде[яи][\s:,.\-—]+(.+)$/i)
  if (im2) return { kind: 'idea', content: im2[1].trim() }

  // ЗАМЕТКА: «запиши/сохрани/добавь (это) (себе) (в) заметку … (что) …»
  const noteVerb = /^(?:запиш(?:и|ите|ы)|сохран(?:и|ить)|добав(?:ь|ить|и))\s+(?:это\s+)?(?:себе\s+)?(?:в\s+)?(?:заметк[а-яё]*|note)[\s:,.\-—]*(?:что\s+)?(.*)$/i
  const nm = text.match(noteVerb)
  if (nm) return { kind: 'note', content: nm[1].trim() }
  // «запомни (что) …»
  const rm = text.match(/^запомн(?:и|ить)[\s:,.\-—]*(?:что\s+)?(.*)$/i)
  if (rm) return { kind: 'note', content: rm[1].trim() }

  return null
}
