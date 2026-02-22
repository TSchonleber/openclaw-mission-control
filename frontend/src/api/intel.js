const API_BASE = import.meta.env.VITE_INTEL_BASE_URL || import.meta.env.VITE_API_BASE_URL || ''

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
  const response = await fetch(buildUrl(`/intel/ops-feed${query}`))
  return handleResponse(response)
}

export const fetchMemoryStream = async ({ limit = 20, type } = {}) => {
  const params = new URLSearchParams()
  if (limit) params.set('limit', limit)
  if (type) params.set('type', type)
  const query = params.toString() ? `?${params.toString()}` : ''
  const response = await fetch(buildUrl(`/intel/memory${query}`), {
    headers: {
      Accept: 'application/json'
    }
  })
  return handleResponse(response)
}
