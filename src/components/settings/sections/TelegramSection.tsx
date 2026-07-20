import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { useT } from '../../../lib/i18n'
import { getActiveTelegramLink, createTelegramLinkToken, pauseTelegramLink } from '../../../lib/api/settings'
import { loadDailyNoteSettings, saveDailyNoteSettings } from '../../../lib/dailyNote'
import { loadReportSettings, saveReportSettings, type ReportSettings } from '../../../lib/reportSettings'
import { ArchiveBtn } from './ArchiveBtn'

// Telegram + вечерний вопрос + настройки отчётов. Объединены в один компонент:
// секция «Отчёты» показывается только при подключённом Telegram (tgLinked),
// поэтому состояние связи живёт здесь, а не расщепляется между секциями.
interface Props {
  user: User
  archivedTelegram: boolean
  archivedReports: boolean
  onArchive: (id: string) => void
}

export function TelegramSection({ user, archivedTelegram, archivedReports, onArchive }: Props) {
  const { t } = useT()
  const [tgLinked, setTgLinked] = useState(false)
  const [tgUsername, setTgUsername] = useState<string | null>(null)
  const [tgLinking, setTgLinking] = useState(false)
  const [tgMsg, setTgMsg] = useState<string | null>(null)
  const [noteEnabled, setNoteEnabled] = useState(false)
  const [noteTime, setNoteTime] = useState('21:00')
  const [rep, setRep] = useState<ReportSettings | null>(null)

  useEffect(() => {
    getActiveTelegramLink(user.id).then(link => {
      if (link) { setTgLinked(true); setTgUsername(link.telegram_username) }
    })
    loadDailyNoteSettings(user.id).then(s => { setNoteEnabled(s.enabled); setNoteTime(s.time) }).catch(() => {})
    loadReportSettings(user.id).then(setRep).catch(() => {})
  }, [user.id])

  function patchRep(patch: Partial<ReportSettings>) {
    setRep(r => r ? { ...r, ...patch } : r)
    saveReportSettings(user.id, patch)
  }

  function handleNoteToggle(enabled: boolean) {
    setNoteEnabled(enabled)
    saveDailyNoteSettings(user.id, { enabled, time: noteTime })
  }
  function handleNoteTime(time: string) {
    setNoteTime(time)
    saveDailyNoteSettings(user.id, { enabled: noteEnabled, time })
  }

  async function handleTgConnect() {
    setTgLinking(true)
    setTgMsg(null)
    try {
      const token = await createTelegramLinkToken(user.id)
      const botName = import.meta.env.VITE_TELEGRAM_BOT_NAME ?? 'tonus_health_bot'
      const url = `https://t.me/${botName}?start=${token}`
      window.open(url, '_blank')
      setTgMsg('Открыли Telegram. После нажатия Start аккаунт привяжется автоматически.')
      // Poll for 60s
      const interval = setInterval(async () => {
        const link = await getActiveTelegramLink(user.id)
        if (link) { setTgLinked(true); setTgUsername(link.telegram_username); setTgMsg(null); clearInterval(interval) }
      }, 3000)
      setTimeout(() => clearInterval(interval), 60000)
    } catch (e) {
      setTgMsg(`Ошибка: ${(e as Error).message}`)
    }
    setTgLinking(false)
  }

  async function handleTgDisconnect() {
    await pauseTelegramLink(user.id)
    setTgLinked(false)
    setTgUsername(null)
    setTgMsg('Telegram отключён.')
  }

  return (
    <>
      <section className={`settings-section${archivedTelegram ? ' is-archived' : ''}`}>
        <ArchiveBtn id="telegram" onArchive={onArchive} />
        <h3 className="settings-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Telegram
        </h3>
        <div className="settings-cal-row">
          <div>
            {tgLinked
              ? <div className="settings-label">✓ {t('Подключён')}{tgUsername ? ` (@${tgUsername})` : ''}</div>
              : <div className="settings-label">{t('Получать двухнедельные отчёты в Telegram')}</div>
            }
            <div className="settings-muted" style={{ fontSize: 13, marginTop: 4 }}>
              {tgLinked ? t('Команды: /report /last /status /pause') : t('Нажми — откроется бот, нажми Start')}
            </div>
          </div>
          {tgLinked ? (
            <button className="btn-secondary" onClick={handleTgDisconnect} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
              {t('Отключить')}
            </button>
          ) : (
            <button className="btn-primary" onClick={handleTgConnect} disabled={tgLinking} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
              {tgLinking ? t('Открываем…') : t('Подключить Telegram')}
            </button>
          )}
        </div>
        {tgMsg && <div style={{ marginTop: 8, fontSize: 13, color: tgMsg.startsWith('Ошибка') ? 'var(--red)' : 'var(--text-muted)' }}>{tgMsg}</div>}

        {tgLinked && (
          <div className="settings-cal-row" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div>
              <label className="settings-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={noteEnabled} onChange={e => handleNoteToggle(e.target.checked)} style={{ width: 16, height: 16 }} />
                🌙 {t('Вечерний вопрос «как прошёл день»')}
              </label>
              <div className="settings-muted" style={{ fontSize: 13, marginTop: 4 }}>
                {t('Бот спросит вечером, ответ сохранится в заметку дня и учтётся в ИИ-отчётах')}
              </div>
            </div>
            {noteEnabled && (
              <input
                type="time"
                value={noteTime}
                onChange={e => handleNoteTime(e.target.value)}
                className="settings-input"
                style={{ width: 110, flexShrink: 0 }}
              />
            )}
          </div>
        )}
      </section>

      {tgLinked && rep && (
        <section className={`settings-section${archivedReports ? ' is-archived' : ''}`}>
          <ArchiveBtn id="reports" onArchive={onArchive} />
          <h3 className="settings-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="8"/><rect x="12" y="6" width="3" height="12"/><rect x="17" y="13" width="3" height="5"/></svg>
            {t('Отчёты в Telegram')}
          </h3>

          <div className="rep-setting">
            <span className="settings-label">{t('Как часто присылать')}</span>
            <div className="rep-seg">
              {[7, 14, 21].map(d => (
                <button
                  key={d}
                  className={`rep-seg-btn${rep.frequency_days === d ? ' on' : ''}`}
                  onClick={() => patchRep({ frequency_days: d })}
                >{d === 7 ? t('Неделя') : `${d / 7} ${t('нед')}`}</button>
              ))}
            </div>
          </div>

          <div className="rep-setting">
            <span className="settings-label">{t('Подробность')}</span>
            <div className="rep-seg">
              {([['short', 'Кратко'], ['medium', 'Средне'], ['full', 'Подробно']] as const).map(([v, label]) => (
                <button
                  key={v}
                  className={`rep-seg-btn${rep.detail_level === v ? ' on' : ''}`}
                  onClick={() => patchRep({ detail_level: v })}
                >{t(label)}</button>
              ))}
            </div>
          </div>

          <label className="rep-toggle-row">
            <input type="checkbox" checked={rep.send_sensitive} onChange={e => patchRep({ send_sensitive: e.target.checked })} />
            <span>
              <span className="settings-label">{t('Присылать чувствительное')}</span>
              <span className="settings-muted" style={{ display: 'block', fontSize: 13 }}>{t('Анализы и препараты в отчётах. Выкл — только сводка самочувствия. Telegram не E2E-шифрован.')}</span>
            </span>
          </label>

          <label className="rep-toggle-row">
            <input type="checkbox" checked={rep.morning_summary} onChange={e => patchRep({ morning_summary: e.target.checked })} />
            <span>
              <span className="settings-label">{t('Утренняя сводка')}</span>
              <span className="settings-muted" style={{ display: 'block', fontSize: 13 }}>{t('Короткое «как ты сегодня» утром')}</span>
            </span>
            {rep.morning_summary && (
              <input type="time" value={rep.morning_time} onChange={e => patchRep({ morning_time: e.target.value })} className="settings-input" style={{ width: 100, marginLeft: 'auto' }} />
            )}
          </label>

          <label className="rep-toggle-row">
            <input type="checkbox" checked={!rep.paused} onChange={e => patchRep({ paused: !e.target.checked })} />
            <span className="settings-label">{t('Автоматические отчёты включены')}</span>
          </label>
        </section>
      )}
    </>
  )
}
