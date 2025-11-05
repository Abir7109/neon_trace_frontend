import React, { useEffect, useMemo, useRef, useState } from 'react'
import MapView from './components/MapView'
import { geocode } from './lib/geocode'
import { SFX } from './lib/sfx'
import { getOrCreateDevice, saveDeviceName, detectAndSaveDeviceName } from './lib/device'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001'

export default function App() {
  const [originText, setOriginText] = useState('New York, NY')
  const [destText, setDestText] = useState('Boston, MA')
  const [origin, setOrigin] = useState(null) // { lat, lng }
  const [dest, setDest] = useState(null)
  const [route, setRoute] = useState(null)
  const [logs, setLogs] = useState([])
  const [busy, setBusy] = useState(false)
  const [mute, setMute] = useState(false)
  const [profile, setProfile] = useState('driving-car')
  const [hackerMode, setHackerMode] = useState(true)
  const [consoleInput, setConsoleInput] = useState('')
  const [me, setMe] = useState(null) // { deviceId, deviceName, ip, lastLocation }
  const [self, setSelf] = useState(null) // live location {lat,lng}
  const [useSelfAsOrigin, setUseSelfAsOrigin] = useState(true)
  const [locError, setLocError] = useState(null) // 1=denied, 2=unavailable/timeout
  const [locErrMsg, setLocErrMsg] = useState('')
  const [page, setPage] = useState('home') // home|about|api
  const watchRef = useRef(null)

  const sfx = useMemo(() => new SFX({ enabled: !mute }), [mute])

  useEffect(() => {
    document.body.classList.toggle('hacker', hackerMode)
  }, [hackerMode])

  // Load device profile and prior saved info, detect device name via Capacitor if available,
  // and prompt for location permission to start live tracking.
  useEffect(() => {
    const dev = getOrCreateDevice()
    ;(async () => {
      try {
        // Enhance device name if plugin available
        const updated = await detectAndSaveDeviceName()
        setMe(updated)
        const r = await fetch(`${API_BASE}/api/me?deviceId=${encodeURIComponent(updated.deviceId)}`)
        const data = r.ok ? await r.json() : { me: null }
        if (data.me) setMe({ ...updated, ...data.me })
        if (data.me?.lastLocation) setSelf(data.me.lastLocation)
      } catch {}
      // Auto-ask for location and start watch
      requestAndWatchLocation()
    })()
  }, [])

  // When live location updates, optionally mirror into origin and input
  useEffect(() => {
    if (self && useSelfAsOrigin) {
      setOrigin(self)
      setOriginText(`${Number(self.lat).toFixed(5)},${Number(self.lng).toFixed(5)}`)
    }
  }, [self, useSelfAsOrigin])

  async function resolveCoord(text) {
    // coord literal: lat,lng
    const m = text.trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }
    const res = await geocode(text)
    if (!res) throw new Error('Location not found: ' + text)
    return res
  }

  async function traceRoute(aOverride = null, bOverride = null) {
    try {
      setBusy(true)
      setLogs([])
      setRoute(null)
      sfx.type()
      // Guard: if aOverride is a click event or DOM node, ignore overrides
      const looksLikeEvent = (x) => !!(x && (x.nativeEvent || typeof x.preventDefault === 'function' || (x.target && (x.target.tagName || x.target.nodeType))))
      if (looksLikeEvent(aOverride)) { aOverride = null; bOverride = null }

      const normalize = (p) => (p && typeof p.lat === 'number' && typeof p.lng === 'number') ? { lat: +p.lat, lng: +p.lng } : null
      const [aRaw, bRaw] = await Promise.all([
        aOverride ?? resolveCoord(originText),
        bOverride ?? resolveCoord(destText),
      ])
      const a = normalize(aRaw)
      const b = normalize(bRaw)
      if (!a || !b) throw new Error('invalid coordinates')
      setOrigin(a)
      setDest(b)
      const t0 = performance.now()
      let payload
      try {
        payload = JSON.stringify({ origin: a, destination: b, profile })
      } catch {
        throw new Error('payload_build_failed')
      }
      const resp = await fetch(`${API_BASE}/api/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      })
      if (!resp.ok) {
        let detail = ''
        try { const err = await resp.json(); detail = JSON.stringify(err) } catch {}
        setLogs((prev) => [...prev, `server_error status=${resp.status} ${detail}`])
        throw new Error('Routing failed')
      }
      const data = await resp.json()
      setRoute({ coords: data.route.coordinates, distance: data.route.distance, duration: data.route.duration })
      // Simulate streaming logs
      const stepLogs = data.analysis.steps
      for (let i = 0; i < stepLogs.length; i++) {
        setLogs((prev) => [...prev, stepLogs[i]])
        await new Promise((r) => setTimeout(r, 180))
      }
      const dt = Math.max(0, Math.round(performance.now() - t0))
      setLogs((prev) => [
        ...prev,
        `paths_analyzed=${data.analysis.pathsAnalyzed}`,
        `algorithm=${data.analysis.algorithm}`,
        `time_ms=${dt}`,
      ])
      sfx.route()
    } catch (e) {
      setLogs((prev) => [...prev, 'error=' + e.message])
    } finally {
      setBusy(false)
    }
  }

  function onConsoleEnter(cmd) {
    const text = cmd.trim()
    if (!text) return
    if (/^sudo\s+hac?k/i.test(text)) {
      document.body.classList.add('hack-sequence')
      sfx.hack()
      setTimeout(() => document.body.classList.remove('hack-sequence'), 2000)
      setLogs((prev) => [...prev, 'ELEVATING PRIVILEGES… [denied]', '…just kidding 😅'])
      return
    }
    const m = text.match(/trace\s+--from\s+\"([^\"]+)\"\s+--to\s+\"([^\"]+)\"(?:\s+--profile\s+(\S+))?/i)
    if (m) {
      setOrigin(null); setDest(null)
      setOriginText(m[1])
      setDestText(m[2])
      if (m[3]) setProfile(m[3])
      traceRoute()
    } else {
      setLogs((prev) => [...prev, 'unknown_command'])
    }
  }

  async function requestAndWatchLocation() {
    try {
      const dev = me || getOrCreateDevice()
      // Try Capacitor Geolocation first
      try {
        const { Geolocation } = await import('@capacitor/geolocation')
        await Geolocation.requestPermissions()

        // First: get a single fix with generous timeout
        try {
          const first = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 30000 })
          if (first?.coords) {
            const coords = { lat: first.coords.latitude, lng: first.coords.longitude }
            setSelf(coords)
            try {
              const resp = await fetch(`${API_BASE}/api/me`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: dev.deviceId, deviceName: dev.deviceName, location: coords }) })
              const data = await resp.json().catch(()=>null)
              if (resp.ok && data?.me) setMe(data.me)
            } catch {}
          }
        } catch (e) {
          // Retry with lower accuracy and longer timeout
          try {
            const coarse = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 60000 })
            if (coarse?.coords) setSelf({ lat: coarse.coords.latitude, lng: coarse.coords.longitude })
          } catch (e2) {
            setLocErrMsg(e2.message||'timeout'); setLocError(3)
          }
        }

        // Start watch after first fix attempt
        if (watchRef.current) Geolocation.clearWatch({ id: watchRef.current })
        watchRef.current = await Geolocation.watchPosition({ enableHighAccuracy: true }, async (pos, err) => {
          if (err) { setLocErrMsg(err.message||''); setLocError(err.code||1); setLogs((p)=>[...p, `geo_error=${err.code||'err'}`]); return }
          if (!pos) return
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setSelf(coords)
          try {
            const resp = await fetch(`${API_BASE}/api/me`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: dev.deviceId, deviceName: dev.deviceName, location: coords }) })
            const data = await resp.json().catch(()=>null)
            if (resp.ok && data?.me) setMe(data.me)
          } catch {}
        })
        setLogs((p)=>[...p,'geolocation=watching'])
        return
      } catch {}

      // Fallback to browser geolocation
      if (!('geolocation' in navigator)) { setLogs((p)=>[...p,'error=geolocation_unavailable']); return }

      // First fix with 30s, then watch
      const firstFix = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 })
      }).catch(async (e) => {
        // Retry coarse with longer timeout
        setLocErrMsg(e.message||'');
        try {
          return await new Promise((resolve2, reject2) => navigator.geolocation.getCurrentPosition(resolve2, reject2, { enableHighAccuracy: false, maximumAge: 15000, timeout: 60000 }))
        } catch (e2) {
          setLocErrMsg(e2.message||''); setLocError(3); return null
        }
      })
      if (firstFix?.coords) {
        const coords = { lat: firstFix.coords.latitude, lng: firstFix.coords.longitude }
        setSelf(coords)
        try {
          const resp = await fetch(`${API_BASE}/api/me`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: dev.deviceId, deviceName: dev.deviceName, location: coords }) })
          const data = await resp.json().catch(()=>null)
          if (resp.ok && data?.me) setMe(data.me)
        } catch {}
      }

      if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current)
      watchRef.current = navigator.geolocation.watchPosition(async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setSelf(coords)
        try {
          const resp = await fetch(`${API_BASE}/api/me`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: dev.deviceId, deviceName: dev.deviceName, location: coords }) })
          const data = await resp.json().catch(()=>null)
          if (resp.ok && data?.me) setMe(data.me)
        } catch {}
      }, (err) => {
        setLocErrMsg(err.message||''); setLocError(err.code)
        setLogs((p)=>[...p, `geo_error=${err.code}`])
      }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 })
      setLogs((p)=>[...p,'geolocation=watching'])
    } catch (e) {
      setLogs((p)=>[...p,'error='+e.message])
    }
  }

  // Manual trigger from UI remains available
  function shareLocation() { requestAndWatchLocation() }

  function updateDeviceName(name) {
    const next = saveDeviceName(name)
    setMe((m) => ({ ...(m||{}), ...next }))
  }

  async function openAppSettings() {
    try {
      const { App } = await import('@capacitor/app')
      await App.openUrl({ url: 'app-settings:' })
    } catch {
      window.alert('Please enable Location for Neon Trace in system settings.')
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="logo" aria-label="logo">NEON TRACE ▓▓</div>
        <nav>
          <a href="#" onClick={(e)=>{e.preventDefault(); setPage('home')}}>Home</a>
          <a href="#" onClick={(e)=>{e.preventDefault(); setPage('about')}}>About</a>
          <a href="#" onClick={(e)=>{e.preventDefault(); setPage('api')}}>API</a>
        </nav>
      </header>
      <main className="main">
        <section className="left">
          <div className="panel">
            <label>Device</label>
            <div className="row">
              <input className="terminal" value={(me?.deviceName)||''} onChange={(e)=>updateDeviceName(e.target.value)} placeholder="device name" />
            </div>
            <div className="row small">
              <div style={{opacity:.8}}>id: {(me?.deviceId)||'…'}</div>
            </div>
            <div className="row">
              <button className="btn" onClick={shareLocation}>Share Live Location</button>
              {me?.ip && <span style={{fontSize:12,opacity:.7}}>ip {me.ip}</span>}
            </div>
            <div className="row small">
              <label><input type="checkbox" checked={useSelfAsOrigin} onChange={(e)=>setUseSelfAsOrigin(e.target.checked)} /> use my location as origin</label>
              <button className="btn" onClick={()=>{ setUseSelfAsOrigin(false); setOrigin(null); setOriginText('') }}>Clear origin</button>
            </div>
          </div>

          {page === 'home' && (
          <div className="panel">
            <label>Origin</label>
            <input className="terminal" value={originText} onChange={(e) => setOriginText(e.target.value)} placeholder="lat,lng or place" />
            <label>Destination</label>
            <input className="terminal" value={destText} onChange={(e) => setDestText(e.target.value)} placeholder="lat,lng or place" />
            <div className="row">
              <select value={profile} onChange={(e) => setProfile(e.target.value)}>
                <option value="driving-car">driving-car</option>
                <option value="foot-walking">foot-walking</option>
                <option value="cycling-regular">cycling-regular</option>
              </select>
              <button className="btn" onClick={() => traceRoute()} disabled={busy}>{busy ? 'Tracing…' : 'Trace Route'}</button>
            </div>
            <div className="row small">
              <label><input type="checkbox" checked={hackerMode} onChange={(e) => setHackerMode(e.target.checked)} /> hacker mode</label>
              <label><input type="checkbox" checked={mute} onChange={(e) => setMute(e.target.checked)} /> mute</label>
            </div>
          </div>
          )}

          {page === 'about' && (
          <div className="panel">
            <h3>About</h3>
            <p style={{opacity:.85}}>
              Built in the shadows. No names, no faces. Just paths, pulses, and neon.
              Credits: Abir. Data: OpenStreetMap, routing by ORS.
            </p>
          </div>
          )}

          {page === 'api' && (
          <div className="panel">
            <h3>API</h3>
            <p className="small">POST /api/route {`{ origin:{lat,lng}, destination:{lat,lng}, profile }`}</p>
            <p className="small">GET /api/logs — recent analyses</p>
            <p className="small">GET/POST /api/me — device profile</p>
          </div>
          )}

          <div className="panel console">
            <div className="console-log">
              {logs.map((l, i) => (
                <div key={i} className="log-line">$ {l}</div>
              ))}
            </div>
            <ConsoleInput onEnter={onConsoleEnter} />
          </div>
          <div className="footer">
            <span>© Abir • anonymous build • OSM + ORS</span>
            <a href="https://github.com/Abir7109" target="_blank">GitHub</a>
          </div>
        </section>
        <section className="right">
          <MapView origin={origin} dest={dest} route={route} self={self} onMapClicks={({ a, b }) => { const A={lat:+a.lat,lng:+a.lng}; const B={lat:+b.lat,lng:+b.lng}; setOrigin(A); setDest(B); traceRoute(A, B) }} />
          {locError && (
            <div className="overlay">
              <div className="overlay-card">
                <div className="overlay-title">Location {locError===1? 'permission':'services'} needed</div>
                <p className="small">Enable location and grant permission to show your live position. {locErrMsg && `(detail: ${locErrMsg})`}</p>
                <div className="row">
                  <button className="btn" onClick={openAppSettings}>Open settings</button>
                  <button className="btn" onClick={()=>{ setLocError(null); requestAndWatchLocation() }}>Retry</button>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function ConsoleInput({ onEnter }) {
  const [v, setV] = useState('')
  const ref = useRef()
  return (
    <div className="console-input">
      <span className="prompt">trace$</span>
      <input
        ref={ref}
        className="terminal"
        value={v}
        placeholder='try: trace --from "NYC" --to "Boston"'
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onEnter(v)
            setV('')
          }
        }}
      />
      <span className="caret" />
    </div>
  )
}
