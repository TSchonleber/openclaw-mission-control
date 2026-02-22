export const OWNER_SEQUENCE = ['Iris', 'Terrence', 'Nara', 'Aster', 'Osiris']
export const STATUS_SEQUENCE = ['backlog', 'in-progress', 'review', 'done']

export const DEFAULT_OWNERS = OWNER_SEQUENCE

export const TASK_COLUMNS = [
  { key: 'backlog', label: 'Backlog', emptyCopy: 'No backlog tasks queued.' },
  { key: 'in-progress', label: 'In progress', emptyCopy: 'No active builds right now.' },
  { key: 'review', label: 'Review', emptyCopy: 'Nothing waiting for review.' },
  { key: 'done', label: 'Done', emptyCopy: 'No recent completions.' }
]

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
