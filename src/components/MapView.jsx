import React, { useEffect, useRef } from 'react'
import L from 'leaflet'

// Custom neon divIcons (avoids broken image URLs)
const makePin = (color = '#00ffd0') => L.divIcon({
  className: 'neon-pin-wrap',
  html: `<div class="neon-pin" style="--pin:${color}"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

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
    aMarker.setLatLng(origin).addTo(map)
    bMarker.setLatLng(dest).addTo(map)
    L.featureGroup([aMarker, bMarker]).addTo(map)
    map.fitBounds(L.latLngBounds([origin, dest]).pad(0.3))
  }, [origin, dest])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !route) return
    const { glow, halo } = layerRef.current

    // Animate drawing
    const pts = route.coords
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
