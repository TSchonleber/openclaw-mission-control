const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
const NGROK_HEADER = API_BASE.includes('ngrok-free') ? { 'ngrok-skip-browser-warning': 'true' } : {}

const buildUrl = path => `${API_BASE}${path}`

const handleResponse = async response => {
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Task request failed (${response.status})`)
  }
  return response.json()
}

const jsonRequest = (path, options = {}) => {
  const { method = 'GET', body } = options
  return fetch(buildUrl(path), {
    method,
    headers: { 'Content-Type': 'application/json', ...NGROK_HEADER },
    body: body ? JSON.stringify(body) : undefined
  }).then(handleResponse)
}

export const listTasks = params => {
  const searchParams = new URLSearchParams()
  if (params?.owner) searchParams.set('owner', params.owner)
  if (params?.status) searchParams.set('status', params.status)
  if (params?.search) searchParams.set('search', params.search)
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ''
  return jsonRequest(`/mission/tasks${query}`)
}

export const createTask = payload => jsonRequest('/mission/tasks', { method: 'POST', body: payload })

export const updateTask = (id, payload) => jsonRequest(`/mission/tasks/${id}`, { method: 'PATCH', body: payload })

export const advanceTask = id => jsonRequest(`/mission/tasks/${id}/advance`, { method: 'POST' })

export const rewindTask = id => jsonRequest(`/mission/tasks/${id}/rewind`, { method: 'POST' })

export const reassignTask = (id, owner) => jsonRequest(`/mission/tasks/${id}/reassign`, { method: 'POST', body: { owner } })

export const completeTask = id => jsonRequest(`/mission/tasks/${id}/complete`, { method: 'POST' })

export const deleteTask = id => jsonRequest(`/mission/tasks/${id}`, { method: 'DELETE' })
