// Observations: a running log of what the user notices, filed under a tag
// rather than a concern. Spec: 2026-08-23-observations-design.md
//
// The date + at_time pair matches concern_logs, so both kinds of entry order
// through compareLogsAsc/Desc and an entry without a time behaves the same way
// in both places.

import { supabase } from './supabase'
import { isDemoActive } from './demo'
import { demoList, demoInsert, demoRemove, demoId } from './demoDb'
import { compareLogsDesc } from './concerns'

export const OBSERVATION_TAGS = ['sleep', 'skin', 'gut', 'wellbeing', 'other'] as const
export type ObservationTag = typeof OBSERVATION_TAGS[number]

/** Russian source strings; the UI and the report translate them through t(). */
export const OBSERVATION_TAG_LABEL: Record<ObservationTag, string> = {
  sleep: 'Сон',
  skin: 'Кожа',
  gut: 'ЖКТ',
  wellbeing: 'Самочувствие',
  other: 'Другое',
}

export function isObservationTag(value: string): value is ObservationTag {
  return (OBSERVATION_TAGS as readonly string[]).includes(value)
}

export interface Observation {
  id: string
  user_id: string
  date: string
  /** Local wall-clock time, `HH:MM[:SS]`; null when unknown. */
  at_time: string | null
  tag: ObservationTag
  note: string
  created_at: string
}

export type NewObservation = Pick<Observation, 'date' | 'at_time' | 'tag' | 'note'>

export async function loadObservations(userId: string, limit = 200): Promise<Observation[]> {
  if (isDemoActive()) {
    return (demoList('observations') as Observation[]).slice().sort(compareLogsDesc).slice(0, limit)
  }
  const { data, error } = await supabase
    .from('observations')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('at_time', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as Observation[]
}

export async function addObservation(userId: string, obs: NewObservation): Promise<Observation | null> {
  if (isDemoActive()) {
    return demoInsert('observations', {
      id: demoId('demo-obs'), user_id: userId, created_at: new Date().toISOString(), ...obs,
    }) as Observation
  }
  const { data } = await supabase
    .from('observations')
    .insert({ user_id: userId, ...obs })
    .select()
    .single()
  return data as Observation | null
}

export async function deleteObservation(id: string): Promise<void> {
  if (isDemoActive()) return demoRemove('observations', id)
  await supabase.from('observations').delete().eq('id', id)
}
