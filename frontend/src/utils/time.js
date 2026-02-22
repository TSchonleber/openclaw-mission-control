const RELATIVE_DIVISIONS = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' }
]

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export const formatRelativeTime = value => {
  if (!value) return null
  const timestamp = typeof value === 'number' ? value : Date.parse(value)
  if (Number.isNaN(timestamp)) return null
  let durationSeconds = (timestamp - Date.now()) / 1000
  for (const division of RELATIVE_DIVISIONS) {
    if (Math.abs(durationSeconds) < division.amount) {
      const rounded = Math.round(durationSeconds)
      if (division.unit === 'second' && Math.abs(rounded) <= 5) {
        return 'just now'
      }
      return rtf.format(rounded, division.unit)
    }
    durationSeconds /= division.amount
  }
  return null
}

export const formatUpdatedLabel = value => {
  if (!value) return 'New'
  const relative = formatRelativeTime(value)
  if (relative) {
    return `Updated ${relative}`
  }
  const parsed = typeof value === 'number' ? new Date(value) : new Date(value)
  if (!Number.isNaN(parsed.getTime())) {
    return `Updated ${parsed.toLocaleString([], { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })}`
  }
  if (typeof value === 'string') return value
  return 'Updated'
}
