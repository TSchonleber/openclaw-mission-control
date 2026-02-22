export const OWNER_SEQUENCE = ['Iris', 'Terrence', 'Nara', 'Aster', 'Osiris']
export const STATUS_SEQUENCE = ['backlog', 'in-progress', 'review', 'done']

export const DEFAULT_OWNERS = OWNER_SEQUENCE

export const TASK_COLUMNS = [
  { key: 'backlog', label: 'Backlog', emptyCopy: 'No backlog tasks queued.' },
  { key: 'in-progress', label: 'In progress', emptyCopy: 'No active builds right now.' },
  { key: 'review', label: 'Review', emptyCopy: 'Nothing waiting for review.' },
  { key: 'done', label: 'Done', emptyCopy: 'No recent completions.' }
]

export const SLA_DEFAULT_MINUTES = {
  backlog: 1440,
  'in-progress': 720,
  review: 240
}

const OWNER_CLASS_MAP = {
  Iris: 'owner-iris',
  Terrence: 'owner-terrence',
  Nara: 'owner-nara',
  Aster: 'owner-aster',
  Osiris: 'owner-osiris'
}

const STATUS_LABELS = {
  backlog: 'Backlog',
  'in-progress': 'In progress',
  review: 'Review',
  done: 'Done'
}

export const getOwnerClass = owner => OWNER_CLASS_MAP[owner] || 'owner-iris'
export const getStatusLabel = status => STATUS_LABELS[status] || 'Queued'
export const getDefaultSlaMinutes = status => SLA_DEFAULT_MINUTES[status] || null

export const getSlaMeta = task => {
  const explicitSla = typeof task.slaMinutes === 'number' ? task.slaMinutes : null
  const slaMinutes = explicitSla ?? getDefaultSlaMinutes(task.status)
  if (!slaMinutes || task.status === 'done') {
    return {
      slaMinutes: null,
      elapsedMinutes: null,
      remainingMinutes: null,
      slaStatus: 'ok'
    }
  }

  if (typeof task.elapsedMinutes === 'number' && task.slaStatus) {
    const remainingMinutes = Math.max(0, slaMinutes - task.elapsedMinutes)
    return {
      slaMinutes,
      elapsedMinutes: task.elapsedMinutes,
      remainingMinutes,
      slaStatus: task.slaStatus
    }
  }

  const createdAt = task.createdAt ? new Date(task.createdAt) : null
  if (!createdAt || Number.isNaN(createdAt.getTime())) {
    return {
      slaMinutes,
      elapsedMinutes: null,
      remainingMinutes: slaMinutes,
      slaStatus: 'ok'
    }
  }
  const elapsedMinutes = (Date.now() - createdAt.getTime()) / 60000
  const warnThreshold = slaMinutes / 2
  let slaStatus = 'ok'
  if (elapsedMinutes >= slaMinutes) slaStatus = 'breach'
  else if (elapsedMinutes >= warnThreshold) slaStatus = 'warn'
  const remainingMinutes = Math.max(0, slaMinutes - elapsedMinutes)
  return {
    slaMinutes,
    elapsedMinutes,
    remainingMinutes,
    slaStatus
  }
}
