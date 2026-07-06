import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { LazyMotion, domMax, MotionConfig, AnimatePresence, m } from 'motion/react'
import { useT } from '../../lib/i18n'
import type { DeviceType } from '../../store/appStore'
import { DeviceSelectScreen } from './DeviceSelectScreen'
import { StepExplain } from './guide/StepExplain'
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
  const next = () => setProgress(p => ({ ...p, step: idx + 1 }))
  const back = () => setProgress(p => ({ ...p, step: Math.max(0, idx - 1) }))
  const exitToUpload = () => { clearGuideProgress(); onDismiss() }

  // user/demo/onDone/exitToUpload используются шагами задач 4-6.
  void user; void demo; void onDone; void exitToUpload

  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">
        <div className="connect-guide">
          <header className="guide-header">
            <div className="guide-dots" aria-hidden="true">
              {steps.map((s, i) => <span key={s} className={`guide-dot${i <= idx ? ' active' : ''}`} />)}
            </div>
            <button className="guide-skip" onClick={onDismiss}>{t('Пропустить')}</button>
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
