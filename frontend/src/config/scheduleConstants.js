export const CALENDAR_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const DEFAULT_AGENT_OPTIONS = ['Iris', 'Nara', 'Aster', 'Osiris']

export const SCHEDULE_TYPE_OPTIONS = [
  { value: 'cron', label: 'Cron job' },
  { value: 'task', label: 'Task' },
  { value: 'reminder', label: 'Reminder' }
]

export const AGENT_COLOR_MAP = {
  Iris: 'calendar-blue',
  Terrence: 'calendar-gold',
  Nara: 'calendar-pink',
  Aster: 'calendar-purple',
  Osiris: 'calendar-green'
}

export const CALENDAR_STORAGE_KEY = 'mission-control/schedule'

const hoursFromNow = hours => {
  const date = new Date()
  date.setMilliseconds(0)
  date.setSeconds(0)
  date.setMinutes(0)
  date.setHours(date.getHours() + hours)
  return date.toISOString()
}

export const INITIAL_SCHEDULE = [
  {
    id: 'sched-ops-standup',
    title: 'Ops stand-up',
    agent: 'Aster',
    type: 'cron',
    datetime: hoursFromNow(4),
    recurrence: 'Weekly • Mon / Thu',
    notes: 'Primary sprint checkpoint',
    createdBy: 'Aster',
    createdAt: new Date().toISOString()
  },
  {
    id: 'sched-memory-sweep',
    title: 'Memory sweep',
    agent: 'Osiris',
    type: 'task',
    datetime: hoursFromNow(30),
    recurrence: 'Weekly • Tue 14:00',
    notes: 'Promote reflections + archive stale notes',
    createdBy: 'Iris',
    createdAt: new Date().toISOString()
  },
  {
    id: 'sched-frontend-polish',
    title: 'Frontend polish sprint',
    agent: 'Nara',
    type: 'task',
    datetime: hoursFromNow(52),
    recurrence: 'One-off',
    notes: 'Mission Control UI sweep',
    createdBy: 'Nara',
    createdAt: new Date().toISOString()
  },
  {
    id: 'sched-backend-diagnostics',
    title: 'Backend diagnostics',
    agent: 'Iris',
    type: 'cron',
    datetime: hoursFromNow(72),
    recurrence: 'Weekly • Thu 16:00',
    notes: 'Gateway health + task service audit',
    createdBy: 'Iris',
    createdAt: new Date().toISOString()
  },
  {
    id: 'sched-sprint-sync',
    title: 'Sprint sync',
    agent: 'Aster',
    type: 'reminder',
    datetime: hoursFromNow(96),
    recurrence: 'Weekly • Fri 13:00',
    notes: 'Ship list + blockers',
    createdBy: 'Aster',
    createdAt: new Date().toISOString()
  }
]

export const getScheduleColorClass = agent => AGENT_COLOR_MAP[agent] || 'calendar-blue'
