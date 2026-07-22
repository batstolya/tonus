import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useT } from '../../lib/i18n'
import { ensureToken, regenerateToken, setMode, webhookUrl, loadComparison, type IngestToken, type CompareRow } from '../../lib/autosync'

export function AutoSyncSettings({ user }: { user: User }) {
  const { t } = useT()
  const [tok, setTok] = useState<IngestToken | null>(null)
  const [open, setOpen] = useState(false)
  const [cmp, setCmp] = useState<CompareRow[] | null>(null)
  const [loadingCmp, setLoadingCmp] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => { if (open && !tok) ensureToken(user.id).then(setTok) }, [open, tok, user.id])

  const url = tok ? webhookUrl(tok.token) : ''

  async function toggleMode() {
    if (!tok) return
    const next = tok.mode === 'shadow' ? 'live' : 'shadow'
    if (next === 'live' && !confirm(t('Включить запись в основные таблицы? Делай это только после сверки данных.'))) return
    await setMode(user.id, next)
    setTok({ ...tok, mode: next })
  }
  async function regen() {
    if (!confirm(t('Сгенерировать новый токен? Старый перестанет работать.'))) return
    setTok(await regenerateToken(user.id))
  }
  async function runCompare() {
    setLoadingCmp(true)
    setCmp(await loadComparison(user.id))
    setLoadingCmp(false)
  }
  function copy() { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  const mismatches = cmp?.filter(r => !r.match).length ?? 0

  return (
    <section className="settings-section">
      <h3 className="settings-section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
        {t('Авто-синхронизация (Apple Health)')}
      </h3>

      {!open ? (
        <button className="btn-secondary" onClick={() => setOpen(true)}>{t('Настроить')}</button>
      ) : !tok ? (
        <div className="settings-muted">{t('Загрузка…')}</div>
      ) : (
        <div>
          <p className="settings-muted" style={{ fontSize: 13, marginBottom: 10 }}>
            {t('Установи на iPhone приложение Health Auto Export, создай автоматизацию с типом REST API (POST, JSON) и вставь этот адрес. Данные пойдут в тестовый слой — основные данные не затронутся, пока режим «Тест».')}
          </p>

          <div className="autosync-url">
            <code>{url}</code>
            <button className="btn-secondary" onClick={copy}>{copied ? t('Скопировано') : t('Копировать')}</button>
          </div>

          <div className="autosync-row">
            <span>{t('Режим')}: <b style={{ color: tok.mode === 'live' ? 'var(--green)' : 'var(--yellow)' }}>{tok.mode === 'live' ? t('Боевой') : t('Тест (shadow)')}</b></span>
            <button className="btn-secondary" onClick={toggleMode}>
              {tok.mode === 'shadow' ? t('Включить боевой') : t('Вернуть в тест')}
            </button>
          </div>

          <div className="autosync-row">
            <span className="settings-muted" style={{ fontSize: 13 }}>
              {tok.last_ingest_at ? `${t('Последний приём')}: ${new Date(tok.last_ingest_at).toLocaleString()}` : t('Данные ещё не приходили')}
            </span>
            <button className="btn-secondary" onClick={regen}>{t('Новый токен')}</button>
          </div>
          {tok.last_status && <div className="settings-muted" style={{ fontSize: 13, marginBottom: 10 }}>{tok.last_status}</div>}

          <div className="autosync-compare">
            <button className="btn-secondary" onClick={runCompare} disabled={loadingCmp}>
              {loadingCmp ? '…' : t('Сверить с основными данными')}
            </button>
            {cmp && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  {cmp.length === 0 ? t('Нет данных для сверки') : (
                    <span>{t('Строк')}: {cmp.length}, {t('расхождений')}: <b style={{ color: mismatches ? 'var(--red)' : 'var(--green)' }}>{mismatches}</b></span>
                  )}
                </div>
                {cmp.length > 0 && (
                  <div className="autosync-table">
                    <div className="autosync-th"><span>{t('Дата')}</span><span>{t('Метрика')}</span><span>{t('Основное')}</span><span>Staging</span></div>
                    {cmp.slice(0, 60).map((r, i) => (
                      <div key={i} className={`autosync-tr${r.match ? '' : ' mismatch'}`}>
                        <span>{r.date.slice(5)}</span><span>{r.metric}</span>
                        <span>{r.prod?.toFixed(1) ?? '—'}</span><span>{r.staging?.toFixed(1) ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
