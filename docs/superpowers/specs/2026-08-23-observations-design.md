# Observations: a running log of what the user notices

## Problem

Health concerns track a named problem over time: every entry belongs to a
concern and carries a severity. What is missing is the plain note — "hair loss
looks worse today" — written now and then, about nothing in particular, with no
concern to file it under. The day note is a different thing again: one per day,
about the day as a whole.

These notes have to reach the doctor report; that is the point of writing them.

## Data

New table `observations`:

- `date date not null default current_date` and `at_time time` — the same pair
  concern_logs uses, so `compareLogsAsc` / `compareLogsDesc` order them without
  a second implementation. An entry without a time stays at the bottom of its
  day in both directions.
- `tag text not null default 'other'`, one of `sleep | skin | gut | wellbeing |
  other`.
- `note text not null` — an observation with no text is nothing.
- RLS `auth.uid() = user_id`, as everywhere else.

`delete_user_data` deletes from the table and `exportData` includes it;
otherwise this data would survive an account deletion and go missing from an
export.

## Screen

A third sub-tab next to "Проблеми" and "Волосся". The form is one row: the note,
today's date and the current time prefilled, and the tag as chips. Below it the
entries run newest first, grouped by day, each with a delete button.

## Doctor report

A new `## Наблюдения` section, after "Проблемы и жалобы":

- one summary line counting entries per tag, so the reader sees the shape at a
  glance;
- then every entry in order, `date time [tag]: note`.

The tag names are translated; the date and time print as stored.

## Tests

- node: the report builder groups the summary by tag, orders entries oldest
  first, keeps an untimed entry at the end of its day, and returns nothing for
  an empty period.
- jsdom: adding an observation puts it at the top of the list; deleting removes
  it.

## Out of scope

The AI chat's health context. Observations are free text with no scale behind
them, and the chat's context is already large; feeding it unstructured notes is
a separate decision.
