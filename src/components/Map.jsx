/* eslint-disable react-refresh/only-export-components */
/* eslint-disable no-underscore-dangle */
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";

// Fix icon default Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const truckIcon = new L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#f59e0b" width="32" height="32" style="filter: drop-shadow(0 4px 3px rgb(0 0 0 / 0.2));"><path d="M19 17a2 2 0 11-4 0 2 2 0 014 0zM9 17a2 2 0 11-4 0 2 2 0 014 0z"/><path d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h4m-6 0a1 1 0 001-1m-6 0H9"/></svg>`,
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
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

function MapEvents({ setLatLng, center }) {
  const map = useMap();
  useEffect(() => { 
    if (center) map.setView(center, 13); 
  }, [center, map]);
  
  useMapEvents({ 
    click: (e) => setLatLng && setLatLng(e.latlng) 
  });
  return null;
}

export default function Map({ setLatLng, selectedMarker, data = [], liveDrivers = [], routeCoords = null }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
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
        if (setLatLng) setLatLng(newLatlng);
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

      {/* Leaflet Map */}
      <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden", position: "relative", zIndex: 1 }}>
        <MapContainer center={[center.lat, center.lng]} zoom={13} style={{ height: "350px", width: "100%" }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapEvents setLatLng={setLatLng} center={center} />
          
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
          
          {liveDrivers.map(d => (
            <Marker key={d.id} position={{ lat: d.lat, lng: d.lng }} icon={truckIcon}>
              <Popup>
                <div style={{ padding: "4px", textAlign: "center" }}>
                  <strong style={{ fontSize: "14px", color: "#d97706" }}>Truk Transporter</strong><br />
                  <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{d.nama}</span>
                </div>
              </Popup>
            </Marker>
          ))}

          {routeCoords && routeCoords.length > 0 && (
            <Polyline positions={routeCoords} color="#3b82f6" weight={5} opacity={0.8} dashArray="10, 10" />
          )}
        </MapContainer>
      </div>
    </div>
  );
}
