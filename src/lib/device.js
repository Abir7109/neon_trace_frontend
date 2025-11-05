export function getOrCreateDevice() {
  const key = 'neontrace_device'
  const raw = localStorage.getItem(key)
  if (raw) {
    try { return JSON.parse(raw) } catch {}
  }
  const id = cryptoRandomId()
  const name = defaultDeviceName()
  const obj = { deviceId: id, deviceName: name }
  localStorage.setItem(key, JSON.stringify(obj))
  return obj
}

export function saveDeviceName(name) {
  const key = 'neontrace_device'
  const obj = getOrCreateDevice()
  const next = { ...obj, deviceName: (name || '').toString().slice(0, 100) }
  localStorage.setItem(key, JSON.stringify(next))
  return next
}

export async function detectAndSaveDeviceName() {
  try {
    const { Device } = await import('@capacitor/device')
    const info = await Device.getInfo()
    const name = (info.name || info.model || defaultDeviceName()).slice(0, 100)
    return saveDeviceName(name)
  } catch {
    return getOrCreateDevice()
  }
}

function defaultDeviceName() {
  const ua = navigator.userAgent || 'Unknown Device'
  const m = ua.match(/\(([^\)]+)\)/)
  const hint = m ? m[1] : ua
  return hint.slice(0, 32)
}

function cryptoRandomId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  const a = new Uint8Array(16)
  (window.crypto || window.msCrypto).getRandomValues?.(a)
  return Array.from(a).map((x) => x.toString(16).padStart(2, '0')).join('')
}
