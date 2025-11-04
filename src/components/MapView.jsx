import React, { useEffect, useRef } from 'react'
import L from 'leaflet'

// Custom neon divIcons (avoids broken image URLs)
const makePin = (color = '#00ffd0') => L.divIcon({
  className: 'neon-pin-wrap',
  html: `<div class="neon-pin" style="--pin:${color}"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

function toLL(p) {
  if (!p) return null
  if (typeof p.lat === 'number' && typeof p.lng === 'number' && isFinite(p.lat) && isFinite(p.lng)) return L.latLng(p.lat, p.lng)
  if (Array.isArray(p) && p.length >= 2) {
    const a = Number(p[0]); const b = Number(p[1])
    // Try [lat,lng] first; if invalid, swap
    if (isFinite(a) && isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180) return L.latLng(a, b)
    if (isFinite(a) && isFinite(b)) return L.latLng(b, a)
  }
  return null
}

export default function MapView({ origin, dest, route, onMapClicks }) {
  const mapRef = useRef(null)
  const layerRef = useRef({})
  const clickState = useRef({ step: 0, a: null })

  useEffect(() => {
    const map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
      minZoom: 2,
    }).setView([40.7128, -74.006], 6)
    mapRef.current = map

    // Dark basemap
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    }).addTo(map)

    // High z-index pane for route
    map.createPane('routes')
    map.getPane('routes').style.zIndex = 650

    const glow = L.polyline([], { color: '#00ffd0', weight: 5, opacity: 0.95, pane: 'routes', className: 'neon-route' }).addTo(map)
    const halo = L.polyline([], { color: '#00ffd0', weight: 12, opacity: 0.18, pane: 'routes', className: 'neon-route-halo' }).addTo(map)

    const aMarker = L.marker([0, 0], { icon: makePin('#00ffd0') })
    const bMarker = L.marker([0, 0], { icon: makePin('#008170') })
    layerRef.current = { glow, halo, aMarker, bMarker }

    map.on('click', (e) => {
      if (clickState.current.step === 0) {
        clickState.current = { step: 1, a: e.latlng }
        aMarker.setLatLng(e.latlng).addTo(map)
      } else {
        bMarker.setLatLng(e.latlng).addTo(map)
        clickState.current = { step: 0, a: null }
        onMapClicks?.({ a: aMarker.getLatLng(), b: bMarker.getLatLng() })
      }
    })

    return () => map.remove()
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !origin || !dest) return
    const { aMarker, bMarker } = layerRef.current
    const o = toLL(origin); const d = toLL(dest)
    if (!o || !d) return
    aMarker.setLatLng(o).addTo(map)
    bMarker.setLatLng(d).addTo(map)
    L.featureGroup([aMarker, bMarker]).addTo(map)
    map.fitBounds(L.latLngBounds([o, d]).pad(0.3))
  }, [origin, dest])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !route) return
    const { glow, halo } = layerRef.current

    // Guard against bad data
    const raw = Array.isArray(route.coords) ? route.coords : []
    const pts = raw.map(toLL).filter(Boolean)
    if (pts.length < 2) return

    // Fit to route
    try { map.fitBounds(L.latLngBounds(pts).pad(0.2)) } catch {}

    // Animate drawing
    let i = 0
    glow.setLatLngs([])
    halo.setLatLngs([])
    const step = Math.max(1, Math.floor(pts.length / 250))
    const timer = setInterval(() => {
      i += step
      const slice = pts.slice(0, Math.min(i, pts.length))
      glow.setLatLngs(slice).bringToFront()
      halo.setLatLngs(slice).bringToFront()
      if (i >= pts.length) clearInterval(timer)
    }, 16)

    return () => clearInterval(timer)
  }, [route])

  return <div id="map" className="map" />
}
