const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
const DEFAULT_HEADERS = { 'Content-Type': 'application/json' }

const buildUrl = path => `${API_BASE}/mission/schedule${path || ''}`

export const listSchedule = async () => {
  const response = await fetch(buildUrl(''))
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Schedule fetch failed (${response.status})`)
  }
  return response.json()
}

export const createScheduleItem = async payload => {
  const response = await fetch(buildUrl(''), {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(payload)
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Schedule create failed (${response.status})`)
  }
  return response.json()
}

export const updateScheduleItem = async (id, payload) => {
  const response = await fetch(buildUrl(`/${id}`), {
    method: 'PATCH',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(payload)
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Schedule update failed (${response.status})`)
  }
  return response.json()
}

export const deleteScheduleItem = async id => {
  const response = await fetch(buildUrl(`/${id}`), { method: 'DELETE' })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Schedule delete failed (${response.status})`)
  }
  return true
}
