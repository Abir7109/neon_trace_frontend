import React, { useEffect, useMemo, useRef, useState } from 'react'
import MapView from './components/MapView'
import { geocode } from './lib/geocode'
import { SFX } from './lib/sfx'

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

  const sfx = useMemo(() => new SFX({ enabled: !mute }), [mute])

  useEffect(() => {
    document.body.classList.toggle('hacker', hackerMode)
  }, [hackerMode])

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

  return (
    <div className="app">
      <header className="header">
        <div className="logo" aria-label="logo">NEON TRACE ▓▓</div>
        <nav>
          <a href="#">Home</a>
          <a href="#">About</a>
          <a href="#">API</a>
          <a href="#">Admin</a>
        </nav>
      </header>
      <main className="main">
        <section className="left">
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

          <div className="panel console">
            <div className="console-log">
              {logs.map((l, i) => (
                <div key={i} className="log-line">$ {l}</div>
              ))}
            </div>
            <ConsoleInput onEnter={onConsoleEnter} />
          </div>
          <div className="footer">
            <a href="https://github.com/" target="_blank">GitHub</a>
            <span>Using OpenStreetMap + ORS</span>
          </div>
        </section>
        <section className="right">
          <MapView origin={origin} dest={dest} route={route} onMapClicks={({ a, b }) => { const A={lat:+a.lat,lng:+a.lng}; const B={lat:+b.lat,lng:+b.lng}; setOrigin(A); setDest(B); traceRoute(A, B) }} />
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
