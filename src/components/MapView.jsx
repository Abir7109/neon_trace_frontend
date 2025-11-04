import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import marker2x from 'leaflet/dist/images/marker-icon-2x.png'
import marker from 'leaflet/dist/images/marker-icon.png'
import shadow from 'leaflet/dist/images/marker-shadow.png'

L.Icon.Default.mergeOptions({ iconRetinaUrl: marker2x, iconUrl: marker, shadowUrl: shadow })

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

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map)

    const glow = L.polyline([], { color: '#008170', weight: 4, opacity: 0.95 }).addTo(map)
    const halo = L.polyline([], { color: '#00ffd0', weight: 10, opacity: 0.15 }).addTo(map)
    const aMarker = L.marker([0, 0])
    const bMarker = L.marker([0, 0])
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
    const timer = setInterval(() => {
      i += Math.max(1, Math.floor(pts.length / 200))
      const slice = pts.slice(0, Math.min(i, pts.length))
      glow.setLatLngs(slice)
      halo.setLatLngs(slice)
      if (i >= pts.length) clearInterval(timer)
    }, 16)

    return () => clearInterval(timer)
  }, [route])

  return <div id="map" className="map" />
}
