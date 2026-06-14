import ICAL from 'ical.js'
import type { CalendarEvent } from '../types'

export function parseICS(text: string): CalendarEvent[] {
  const jcal = ICAL.parse(text)
  const comp = new ICAL.Component(jcal)
  const vevents = comp.getAllSubcomponents('vevent')

  return vevents.map((vevent): CalendarEvent => {
    const ev = new ICAL.Event(vevent)
    return {
      uid: ev.uid,
      title: ev.summary ?? '(без названия)',
      start: ev.startDate.toJSDate(),
      end: ev.endDate.toJSDate(),
      description: String(vevent.getFirstPropertyValue('description') ?? '') || undefined,
      location: String(vevent.getFirstPropertyValue('location') ?? '') || undefined,
    }
  })
}
