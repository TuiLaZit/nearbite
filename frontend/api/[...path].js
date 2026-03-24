export default async function handler(req, res) {
  const backendBaseUrl = (process.env.BACKEND_BASE_URL || '').trim().replace(/\/$/, '')
  if (!backendBaseUrl) {
    return res.status(500).json({
      error: 'Missing BACKEND_BASE_URL env var on Vercel'
    })
  }

  const method = (req.method || 'GET').toUpperCase()
  const rawPath = req.query?.path
  const pathSegments = Array.isArray(rawPath)
    ? rawPath
    : (rawPath ? [rawPath] : [])

  const query = new URLSearchParams()
  Object.entries(req.query || {}).forEach(([key, value]) => {
    if (key === 'path') {
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, String(item)))
      return
    }
    if (value !== undefined) {
      query.append(key, String(value))
    }
  })

  const targetPath = pathSegments.map((segment) => encodeURIComponent(String(segment))).join('/')
  const queryString = query.toString()
  const targetUrl = `${backendBaseUrl}/${targetPath}${queryString ? `?${queryString}` : ''}`

  const upstreamHeaders = { ...req.headers }
  delete upstreamHeaders.host
  delete upstreamHeaders.connection
  delete upstreamHeaders['content-length']

  const init = {
    method,
    headers: upstreamHeaders
  }

  if (!['GET', 'HEAD'].includes(method)) {
    if (req.body !== undefined && req.body !== null) {
      init.body = typeof req.body === 'string' || Buffer.isBuffer(req.body)
        ? req.body
        : JSON.stringify(req.body)
      if (!upstreamHeaders['content-type']) {
        init.headers['content-type'] = 'application/json'
      }
    }
  }

  try {
    const upstreamResponse = await fetch(targetUrl, init)

    res.status(upstreamResponse.status)

    // Forward Set-Cookie in a runtime-compatible way.
    // - Node 20+/Undici may expose headers.getSetCookie()
    // - Node 18 may only expose headers.get('set-cookie')
    const setCookieValues = []
    if (typeof upstreamResponse.headers.getSetCookie === 'function') {
      const cookies = upstreamResponse.headers.getSetCookie()
      if (Array.isArray(cookies)) {
        setCookieValues.push(...cookies)
      }
    } else {
      const singleCookieHeader = upstreamResponse.headers.get('set-cookie')
      if (singleCookieHeader) {
        setCookieValues.push(singleCookieHeader)
      }
    }

    if (setCookieValues.length > 0) {
      res.setHeader('set-cookie', setCookieValues)
    }

    upstreamResponse.headers.forEach((value, key) => {
      const lowered = key.toLowerCase()
      if (lowered === 'set-cookie' || lowered === 'content-encoding' || lowered === 'transfer-encoding') {
        return
      }
      res.setHeader(key, value)
    })

    const buffer = Buffer.from(await upstreamResponse.arrayBuffer())
    return res.send(buffer)
  } catch (error) {
    return res.status(502).json({
      error: 'API proxy failed',
      detail: String(error?.message || error)
    })
  }
}
