// Ответы ИИ в демо-режиме. Без Supabase-сессии edge-функции возвращают 401, и
// каждый ИИ-экран показывал бы ошибку. Здесь — фикстурные ответы той же формы,
// что у настоящих функций.
//
// Заглушки честно говорят, что они заглушки: демо-гость не должен принять их за
// живой разбор своих данных. Строки русские — это ключи словаря (см. i18n.tsx),
// экраны переводят их при показе.
import { demoId, demoInsert } from './demoDb'
import { translateStandalone as tr } from './translate'

export const DEMO_CHAT_REPLY =
  'Это демо-режим: отвечает заглушка, а не ИИ. В приложении здесь был бы ответ на твой вопрос — ' +
  'модель видит 30 дней твоих метрик, заметки, цели и эксперименты и отвечает по ним. ' +
  'Например, на вопрос про сон: «Глубокий сон за две недели вырос на 12%, и заметнее всего в дни без кофе после 16:00».'

export function demoChatReply(_message: string, sessionId: string | null): Promise<{ reply: string; sessionId: string }> {
  return new Promise(resolve => {
    setTimeout(() => resolve({
      reply: tr(DEMO_CHAT_REPLY),
      sessionId: sessionId ?? demoId('demo-chat'),
    }), 600)
  })
}

const DEEP_RESEARCH =
  'Демо-разбор (заглушка, не настоящий ИИ). За период видно три вещи. ' +
  'Первое: сон стабильно короче в дни с кофе после 16:00 — в среднем на 40 минут. ' +
  'Второе: HRV наутро выше после активных дней с 8000+ шагов. ' +
  'Третье: в дни магнитных бурь восстановление проседает, но эффект слабый. ' +
  'В приложении такой разбор пишет ИИ по твоим данным.'

const HEALTH_ANALYSIS =
  'Демо-анализ (заглушка, не настоящий ИИ). Общая картина спокойная: восстановление в норме, ' +
  'пульс покоя стабилен, сна в среднем 7 часов. Слабое место — вечерний кофе и поздний отбой в будни. ' +
  'Из анализов: ферритин подтянулся с 24 до 41, витамин D вышел в норму.'

// Sections of the demo analysis. Separate strings because the card shows them
// under their own headings, and because each is a dictionary key.
const ANALYSIS_GOOD = 'Восстановление держится в норме, пульс покоя стабилен.'
const ANALYSIS_IMPROVE = 'Кофе после 16:00 и поздний отбой в будни укорачивают сон.'
const ANALYSIS_FOCUS = 'Ложиться до 23:00 хотя бы пять дней в неделю.'

const RECOMMENDATIONS = [
  {
    metric: 'hrv',
    text: 'Ложись до 23:00 хотя бы пять дней в неделю',
    rationale: 'В твоих данных ранний отбой предшествует более высокому HRV наутро.',
    suggested_target: 45,
    suggested_target_label: '45 мс',
  },
  {
    metric: 'resting_heart_rate',
    text: 'Сдвинь последний кофе на два часа раньше',
    rationale: 'В дни с кофе после 16:00 пульс покоя ночью выше на 3 удара.',
    suggested_target: 54,
    suggested_target_label: '54 уд/мин',
  },
]

const SUGGESTED_EXPERIMENTS = [
  {
    hypothesis: 'Отказ от экрана за час до сна ускорит засыпание',
    change_rule: 'Телефон в другой комнате после 22:30',
    target_metric: 'sleepHours',
    rationale: 'В демо-данных поздний отбой связан с недосыпом.',
  },
  {
    hypothesis: '8000+ шагов в день поднимут HRV',
    change_rule: 'Прогулка в обед минимум 30 минут',
    target_metric: 'hrv',
    rationale: 'Активные дни в демо-данных предшествуют более высокому HRV.',
  },
]

// Фикстурный ответ edge-функции по её имени. null — функции в демо нет,
// вызывающий код получит обычную ошибку.
export function demoFunctionResponse(name: string, body?: unknown): unknown | null {
  switch (name) {
    case 'deep-research':
      return { reply: tr(DEEP_RESEARCH) }
    case 'analyze-health': {
      // The real function returns a whole AiAnalysis row and the dashboard
      // renders it directly. This used to answer with three loose text fields,
      // so the card showed "Invalid Date" and expanding it blanked the app on
      // `good.length`. The periods come from the caller, which already
      // computed them.
      const text = tr(HEALTH_ANALYSIS)
      const period = (body ?? {}) as { periodStart?: string; periodEnd?: string }
      const today = new Date().toISOString().slice(0, 10)
      return {
        id: demoId('demo-analysis'),
        period_start: period.periodStart ?? today,
        period_end: period.periodEnd ?? today,
        created_at: new Date().toISOString(),
        summary: text,
        good: [tr(ANALYSIS_GOOD)],
        improve: [tr(ANALYSIS_IMPROVE)],
        focus: [tr(ANALYSIS_FOCUS)],
        model: 'demo',
        tokens_used: null,
      }
    }
    case 'generate-recommendations': {
      // Настоящая функция пишет рекомендации в БД, экран потом их перечитывает —
      // повторяем это: кладём свежие карточки в демо-стор.
      for (const r of RECOMMENDATIONS) {
        demoInsert('recommendations', {
          id: demoId('demo-rec'), user_id: 'demo-user', status: 'new',
          created_at: new Date().toISOString(), ...r,
        })
      }
      return { count: RECOMMENDATIONS.length }
    }
    case 'suggest-experiments':
      return { suggestions: SUGGESTED_EXPERIMENTS }
    case 'classify-meal': {
      // Форма ответа classify-meal: макросы для введённого текста.
      const note = (body as { note?: string } | undefined)?.note ?? ''
      return { calories: 520, protein_g: 28, carbs_g: 54, fat_g: 20, note }
    }
    case 'coach-weekly':
      return { reply: tr(DEEP_RESEARCH) }
    case 'fetch-environment':
      return { ok: true }
    default:
      return null
  }
}
