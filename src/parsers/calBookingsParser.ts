import type { CalendarEvent } from '../types'

interface CalBooking {
  uid: string
  title: string
  startTime: string
  endTime: string
  description?: string
  location?: string
  status: string
}

export function parseCalBookings(json: string): CalendarEvent[] {
  const bookings: CalBooking[] = JSON.parse(json)
  return bookings
    .filter(b => b.status !== 'CANCELLED' && b.status !== 'REJECTED')
    .map(b => ({
      uid: b.uid,
      title: b.title,
      start: new Date(b.startTime),
      end: new Date(b.endTime),
      description: b.description ?? undefined,
      location: b.location ?? undefined,
    }))
}
