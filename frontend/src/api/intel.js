const API_BASE = import.meta.env.VITE_INTEL_BASE_URL || import.meta.env.VITE_API_BASE_URL || ''
const NGROK_HEADER = API_BASE.includes('ngrok-free') ? { 'ngrok-skip-browser-warning': 'true' } : {}

const buildUrl = path => `${API_BASE}${path}`

const handleResponse = async response => {
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Intel request failed (${response.status})`)
  }
  return response.json()
}

export const fetchOpsFeed = async ({ limit = 50, status } = {}) => {
  const params = new URLSearchParams()
  if (limit) params.set('limit', limit)
  if (status) params.set('status', status)
  const query = params.toString() ? `?${params.toString()}` : ''
  const response = await fetch(buildUrl(`/intel/ops-feed${query}`), { headers: NGROK_HEADER })
  return handleResponse(response)
}

export const fetchMemoryStream = async ({ limit = 20, type } = {}) => {
  const params = new URLSearchParams()
  if (limit) params.set('limit', limit)
  if (type) params.set('type', type)
  const query = params.toString() ? `?${params.toString()}` : ''
  const response = await fetch(buildUrl(`/intel/memory${query}`), {
    headers: {
      Accept: 'application/json',
      ...NGROK_HEADER
    }
  })
  return handleResponse(response)
}

export const fetchMemoryIndex = async ({ q, agent, limit = 200 } = {}) => {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (agent) params.set('agent', agent)
  if (limit) params.set('limit', limit)
  const query = params.toString() ? `?${params.toString()}` : ''
  const response = await fetch(buildUrl(`/intel/memory${query}`), { headers: { Accept: 'application/json', ...NGROK_HEADER } })
  return handleResponse(response)
}
