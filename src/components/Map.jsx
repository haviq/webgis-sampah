/* eslint-disable react-refresh/only-export-components */
/* eslint-disable no-underscore-dangle */
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Fix icon default Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const truckIcon = new L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36"><path fill="#f59e0b" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><path fill="#ffffff" d="M15 8h-3v4h4v-1.5l-1-2.5zm-4 4V7H6v5H5v3h1.17c.41 1.16 1.51 2 2.83 2s2.42-.84 2.83-2h4.34c.41 1.16 1.51 2 2.83 2s2.42-.84 2.83-2H20v-4h-1v-4h-4zM9 16c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm8 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/></svg>`,
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const tpaIcon = new L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#047857" width="36" height="36"><path d="M12 2L2 22h20L12 2zm0 4l6.5 13h-13L12 6z"/><path fill="#ffffff" d="M11 10h2v5h-2zm0 6h2v2h-2z"/></svg>`,
  className: '',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

export const parseLocation = (loc) => {
  if (!loc) return null;
  // Handle Hex/WKB
  if (typeof loc === "string" && /^[0-9A-F]+$/i.test(loc)) {
    const bytes = new Uint8Array(loc.match(/.{1,2}/g).map(b => parseInt(b, 16)));
    const view = new DataView(bytes.buffer);
    const offset = loc.startsWith("0101000020") ? 9 : 5;
    return { lng: view.getFloat64(offset, true), lat: view.getFloat64(offset + 8, true) };
  }
  // Handle String POINT(...)
  if (typeof loc === "string") {
    const m = loc.match(/POINT\s*\(\s*([^\s]+)\s+([^\s]+)\s*\)/i);
    if (m) return { lat: parseFloat(m[2]), lng: parseFloat(m[1]) };
  }
  // Handle GeoJSON/Object
  if (typeof loc === "object") {
    return loc.coordinates ? { lat: loc.coordinates[1], lng: loc.coordinates[0] } : loc;
  }
  return null;
};

function MapEvents({ setLatLng, center, isLocked }) {
  const map = useMap();
  useEffect(() => { 
    if (center) map.setView(center, map.getZoom(), { animate: true }); 
  }, [center, map]);
  
  useMapEvents({ 
    click: (e) => {
      if (!isLocked && setLatLng) setLatLng(e.latlng);
    }
  });
  return null;
}

function FullscreenHandler({ isFullscreen }) {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100);
  }, [isFullscreen, map]);
  return null;
}

export default function Map({ setLatLng, selectedMarker, data = [], liveDrivers = [], routeCoords = null, returnRouteCoords = null, isLocked = false }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [localCenter, setLocalCenter] = useState(selectedMarker || (data[0] ? parseLocation(data[0].location) : null) || { lat: -7.7956, lng: 110.3695 });

  useEffect(() => {
    if (selectedMarker) {
      setLocalCenter(selectedMarker);
    }
  }, [selectedMarker]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery) return;
    setSearchLoading(true);

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      const results = await res.json();
      if (results && results.length > 0) {
        const first = results[0];
        const newLatlng = { lat: parseFloat(first.lat), lng: parseFloat(first.lon) };
        
        // Update selection state and map view
        setLocalCenter(newLatlng);
        if (!isLocked && setLatLng) setLatLng(newLatlng);
      } else {
        alert("Lokasi tidak ditemukan. Coba pencarian lain.");
      }
    } catch (err) {
      console.error("Gagal melakukan pencarian:", err);
      alert("Terjadi kesalahan koneksi saat mencari lokasi.");
    } finally {
      setSearchLoading(false);
    }
  };

  const center = localCenter;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* Search Widget above Map */}
      <form onSubmit={handleSearch} style={{ 
        display: "flex", 
        gap: "8px", 
        marginBottom: "12px",
        position: "relative",
        zIndex: 1000
      }}>
        <input
          type="text"
          className="form-input"
          style={{ padding: "8px 12px", fontSize: "13px" }}
          placeholder="Cari nama lokasi/kota di peta... (misal: Malioboro)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button 
          type="submit" 
          className="btn-primary" 
          disabled={searchLoading}
          style={{ width: "auto", padding: "8px 16px", fontSize: "13px", whiteSpace: "nowrap" }}
        >
          {searchLoading ? "Mencari..." : "Cari Spasial"}
        </button>
      </form>

      {/* Leaflet Map Content */}
      {(() => {
        const mapContent = (
          <div style={isFullscreen ? {
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, background: "#fff", display: "flex", flexDirection: "column"
          } : { border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden", position: "relative", zIndex: 1 }}>
            
            <button 
              onClick={(e) => { e.preventDefault(); setIsFullscreen(!isFullscreen); }} 
              style={{ position: "absolute", top: "10px", right: "10px", zIndex: 1000, background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "6px 12px", fontSize: "12px", fontWeight: "bold", cursor: "pointer", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}
            >
              {isFullscreen ? "🗗 Tutup Fullscreen" : "🖵 Fullscreen"}
            </button>

            <MapContainer preferCanvas={true} center={[localCenter.lat, localCenter.lng]} zoom={13} style={{ height: isFullscreen ? "100%" : "350px", width: "100%", flex: 1 }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapEvents setLatLng={setLatLng} center={localCenter} isLocked={isLocked} />
              <FullscreenHandler isFullscreen={isFullscreen} />
              
              {data.map((item, i) => {
                const pos = parseLocation(item.location);
                return pos && (
                  <Marker key={i} position={[pos.lat, pos.lng]}>
                    <Popup>
                      <div style={{ fontFamily: "var(--font-main)", fontSize: "13px" }}>
                        <b style={{ fontSize: "14px" }}>{item.nama}</b>
                        <br />
                        <span>Alamat: {item.alamat}</span>
                        <br />
                        <span style={{ 
                          fontWeight: "bold", 
                          color: item.pembayaran?.[0]?.status === "sudah" ? "#16a34a" : "#dc2626" 
                        }}>
                          Status Bayar: {item.pembayaran?.[0]?.status === "sudah" ? "Sudah Bayar" : "Belum Bayar"}
                        </span>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
              {selectedMarker && <Marker position={[selectedMarker.lat, selectedMarker.lng]} />}
              
              <Marker position={[-7.8488, 110.4398]} icon={tpaIcon}>
                <Popup>
                  <div style={{ padding: "4px", textAlign: "center" }}>
                    <strong style={{ color: "#047857", fontSize: "14px" }}>TPA Pusat Piyungan</strong>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>Titik Pembuangan Akhir</div>
                  </div>
                </Popup>
              </Marker>

              {liveDrivers.map(d => (
                <Marker key={d.id} position={{ lat: d.lat, lng: d.lng }} icon={truckIcon}>
                  <Popup>
                    <div style={{ padding: "4px", textAlign: "center" }}>
                      <strong style={{ fontSize: "14px", color: "#d97706" }}>Truk Transporter</strong><br />
                      <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{d.nama || 'Armada Aktif'}</span>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* TPA Pusat Marker (Old Duplicate, Removed) */}

              {routeCoords && routeCoords.length > 0 && (
                <Polyline positions={routeCoords} color="#3b82f6" weight={5} opacity={0.8} smoothFactor={3} />
              )}
              {returnRouteCoords && returnRouteCoords.length > 0 && (
                <Polyline positions={returnRouteCoords} color="#10b981" weight={5} opacity={0.8} smoothFactor={3} dashArray="10, 10" />
              )}
            </MapContainer>
          </div>
        );
        return isFullscreen ? createPortal(mapContent, document.body) : mapContent;
      })()}
    </div>
  );
}
