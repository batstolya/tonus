import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { LazyMotion, domMax, MotionConfig, AnimatePresence, m } from 'motion/react'
import { useT } from '../../lib/i18n'
import type { DeviceType } from '../../store/appStore'
import { DeviceSelectScreen } from './DeviceSelectScreen'
import { StepExplain } from './guide/StepExplain'
import { StepInstallHAE } from './guide/StepInstallHAE'
import { StepAutomation } from './guide/StepAutomation'
import { StepWebhook } from './guide/StepWebhook'
import { StepSchedule } from './guide/StepSchedule'
import {
  stepsFor, loadGuideProgress, saveGuideProgress, clearGuideProgress,
} from './guideState'

export interface ConnectGuideProps {
  user: User | null
  demo: boolean
  deviceType: DeviceType | null
  onSelectDevice: (d: DeviceType) => void
  onDismiss: () => void // «Пропустить» / выход в ручной импорт CSV
  onDone: () => void    // успех проверки связи → в приложение
}

export function ConnectGuide({ user, demo, deviceType, onSelectDevice, onDismiss, onDone }: ConnectGuideProps) {
  const { t } = useT()
  const [{ step, phone }, setProgress] = useState(loadGuideProgress)

  useEffect(() => { saveGuideProgress({ step, phone }) }, [step, phone])

  const steps = stepsFor(deviceType, phone)
  const idx = Math.min(step, steps.length - 1)
  const stepId = steps[idx]
  // В апдейтере считаем от p.step (не от idx из замыкания рендера),
  // чтобы сдвоенный клик до ре-рендера не потерял шаг.
  const clampStep = (s: number) => Math.min(s, steps.length - 1)
  const next = () => setProgress(p => ({ ...p, step: clampStep(p.step) + 1 }))
  const back = () => setProgress(p => ({ ...p, step: Math.max(0, clampStep(p.step) - 1) }))
  // Любой выход из гайда стирает прогресс: возврат всегда с первого шага.
  const exitToUpload = () => { clearGuideProgress(); onDismiss() }

  // onDone используется шагом verify (задача 5).
  void onDone

  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">
        <div className="connect-guide">
          <header className="guide-header">
            <div className="guide-dots" aria-hidden="true">
              {steps.map((s, i) => <span key={s} className={`guide-dot${i <= idx ? ' active' : ''}`} />)}
            </div>
            <button className="guide-skip" onClick={exitToUpload}>{t('Пропустить')}</button>
          </header>

          <AnimatePresence mode="wait">
            <m.div
              key={stepId}
              className="guide-step"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              {stepId === 'device' ? (
                <DeviceSelectScreen onSelect={d => { onSelectDevice(d); next() }} />
              ) : stepId === 'explain' ? (
                <StepExplain />
              ) : stepId === 'install' ? (
                <StepInstallHAE />
              ) : stepId === 'automation' ? (
                <StepAutomation />
              ) : stepId === 'webhook' ? (
                <StepWebhook user={user} demo={demo} />
              ) : stepId === 'schedule' ? (
                <StepSchedule />
              ) : null}
            </m.div>
          </AnimatePresence>

          {stepId !== 'device' && (
            <footer className="guide-nav">
              <button className="btn-secondary" onClick={back}>{t('Назад')}</button>
              {idx < steps.length - 1 && (
                <button className="btn-secondary guide-next" onClick={next}>{t('Далее')}</button>
              )}
            </footer>
          )}
        </div>
      </MotionConfig>
    </LazyMotion>
  )
}
