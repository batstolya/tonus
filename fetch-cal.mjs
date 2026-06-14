const token = process.env.CAL_TOKEN

async function fetchAll() {
  const all = []
  let offset = 0
  const limit = 100

  while (true) {
    const input = encodeURIComponent(JSON.stringify({
      '0': {
        json: {
          limit,
          offset,
          filters: {
            status: 'past',
            eventTypeIds: null,
            teamIds: null,
            userIds: null,
            attendeeName: null,
            attendeeEmail: null,
            bookingUid: null,
            afterStartDate: null,
            beforeEndDate: null,
          },
        },
        meta: {
          values: {
            'filters.eventTypeIds': ['undefined'],
            'filters.teamIds': ['undefined'],
            'filters.userIds': ['undefined'],
            'filters.attendeeName': ['undefined'],
            'filters.attendeeEmail': ['undefined'],
            'filters.bookingUid': ['undefined'],
            'filters.afterStartDate': ['undefined'],
            'filters.beforeEndDate': ['undefined'],
          },
        },
      },
    }))

    const r = await fetch(
      'https://cal.beskarstaff.com/api/trpc/bookings/get?batch=1&input=' + input,
      { headers: { cookie: '__Secure-next-auth.session-token=' + token } }
    )
    const d = await r.json()
    const bookings = d[0].result.data.json.bookings
    all.push(...bookings)
    process.stderr.write(`Fetched ${all.length} bookings...\n`)
    if (bookings.length < limit) break
    offset += limit
  }

  process.stdout.write(JSON.stringify(all))
}

fetchAll().catch(e => { process.stderr.write(e.message + '\n'); process.exit(1) })
