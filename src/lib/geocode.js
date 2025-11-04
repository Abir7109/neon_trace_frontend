export async function geocode(q) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', q)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '1')
  const resp = await fetch(url.toString(), { headers: { 'Accept-Language': 'en', 'User-Agent': 'neon-trace-demo' } })
  if (!resp.ok) return null
  const arr = await resp.json()
  if (!arr || !arr.length) return null
  const { lat, lon } = arr[0]
  return { lat: parseFloat(lat), lng: parseFloat(lon) }
}
