import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import Map, { parseLocation } from "../components/Map";
import Sidebar from "../components/Sidebar";
import TypingLoader from "../components/TypingLoader";
import AccountSettings from "../components/AccountSettings";
import gsap from "gsap";

export default function Transporter() {
  const [user, setUser] = useState({ nama: "Transporter", email: "" });
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState("ruteharian");
  const [isLive, setIsLive] = useState(false);
  const [watchId, setWatchId] = useState(null);
  const [trackingChannel, setTrackingChannel] = useState(null);
  const [selesaiModal, setSelesaiModal] = useState({ open: false, id: null, file: null, loading: false });
  const [myLocation, setMyLocation] = useState(null);
  const [routeCoords, setRouteCoords] = useState(null);
  const [returnRouteCoords, setReturnRouteCoords] = useState(null);

  useEffect(() => {
    const channel = supabase.channel('tracking')
      .on('broadcast', { event: 'notif' }, (payload) => {
        if (payload.payload.role === 'transporter') {
          alert("NOTIFIKASI BARU:\n" + payload.payload.msg);
        }
      });
    channel.subscribe();
    setTrackingChannel(channel);
    return () => { supabase.removeChannel(channel); }
  }, []);

  // Real data
  const [stats, setStats] = useState({ rute: 0, titik: 0, muatan: "0%", selesai: "0/0" });
  const [focusedLocation, setFocusedLocation] = useState(null);
  const [allWarga, setAllWarga] = useState([]);
  const [tugas, setTugas] = useState([]);
  const [myId, setMyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);

  const fetchAll = async (tid) => {
    setLoading(true);
    try {
      const activeId = tid || myId;

      const wRes = await supabase.from("warga").select("*, pembayaran(status)");
      const tRes = await supabase.from("pengangkutan").select("*, warga(*)").eq("transporter_id", activeId);

      const wargaData = wRes.data || [];
      
      // Filter duplikasi: Hanya ambil tugas terbaru untuk setiap warga
      const latestTugasMap = {};
      (tRes.data || []).forEach(t => {
         const existing = latestTugasMap[t.warga_id];
         if (!existing) {
            latestTugasMap[t.warga_id] = t;
         } else {
            // Prioritaskan "proses" / "Menunggu" daripada "selesai"
            if (t.status !== "selesai" && existing.status === "selesai") {
               latestTugasMap[t.warga_id] = t;
            } else if (t.status === existing.status && new Date(t.created_at || 0) > new Date(existing.created_at || 0)) {
               latestTugasMap[t.warga_id] = t;
            }
         }
      });
      const tugasData = Object.values(latestTugasMap);

      setAllWarga(wargaData);
      const sortedTugas = tugasData.sort((a, b) => {
        // "proses" / pending di atas, "selesai" di bawah
        if (a.status === "selesai" && b.status !== "selesai") return 1;
        if (a.status !== "selesai" && b.status === "selesai") return -1;
        // Sort by id / date descending (newest first) as secondary sort
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
      setTugas(sortedTugas);

      const selesai = tugasData.filter(t => t.status === "selesai").length;
      setStats({
        rute: tugasData.length,
        titik: wargaData.length,
        muatan: tugasData.length > 0 ? Math.round((selesai / tugasData.length) * 100) + "% Selesai" : "0% Selesai",
        selesai: selesai + " / " + tugasData.length + " Tugas"
      });
    } catch (err) {
      console.error(err);
    } finally {
      await new Promise(res => setTimeout(res, 1500));
      setLoading(false);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user: authUser } }) => {
      if (authUser) {
        setMyId(authUser.id);
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", authUser.id).maybeSingle();
        setUser({ id: authUser.id, nama: profile?.name || "Transporter", email: authUser.email, avatar_url: profile?.avatar_url });
        await fetchAll(authUser.id);
      }
    });
  }, []);

  // GSAP Animations
  useEffect(() => {
    if (!loading) {
      gsap.from(".stat-card", { duration: 0.6, y: 30, opacity: 0, stagger: 0.1, ease: "power2.out" });
      gsap.from(".map-container-wrapper", { duration: 0.8, y: 40, opacity: 0, delay: 0.3, ease: "power2.out" });
    }
  }, [loading, activeTab]);

  const updateTugas = async (id, status, file = null) => {
    let bukti_url = null;
    if (file) {
      const fileExt = file.name.split('.').pop();
      const fileName = `selesai-${id}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('uploads').upload(fileName, file);
      if (uploadError) return alert("Gagal upload bukti: " + uploadError.message);
      bukti_url = supabase.storage.from('uploads').getPublicUrl(fileName).data.publicUrl;
    }

    const payload = { status };
    if (bukti_url) payload.bukti_url = bukti_url;

    const { error } = await supabase.from("pengangkutan").update(payload).eq("id", id);
    if (error) return alert("Gagal update: " + error.message);
    alert("Status berhasil diperbarui!");
    setSelesaiModal({ open: false, id: null, file: null, loading: false });
    
    // Broadcast notification to Warga if selesai
    if (status === "selesai") {
      const t = tugas.find(x => x.id === id);
      if (t && trackingChannel) {
        trackingChannel.send({ type: 'broadcast', event: 'notif', payload: { role: 'warga', target_id: t.warga_id, msg: `Truk Transporter telah mengangkut sampah Anda!` } });
      }
    }
    
    await fetchAll(myId);
  };

  const ambilTugas = async (wargaId) => {
    if (loadingAction) return;
    setLoadingAction(true);
    
    // Cek apakah warga sudah punya request "Menunggu"
    const { data: existing } = await supabase.from("pengangkutan").select("id").eq("warga_id", wargaId).eq("status", "Menunggu").maybeSingle();
    
    let err = null;
    if (existing) {
      // Jika ada request menunggu, UPDATE tugas tersebut agar diambil oleh Transporter ini
      const { error } = await supabase.from("pengangkutan").update({ transporter_id: myId, status: "proses" }).eq("id", existing.id);
      err = error;
    } else {
      // Jika belum ada request tapi transporter proaktif menjemput, INSERT baru
      const { error } = await supabase.from("pengangkutan").insert({ warga_id: wargaId, transporter_id: myId, status: "proses" });
      err = error;
    }
    
    setLoadingAction(false);
    if (err) return alert("Gagal mengambil tugas: " + err.message);
    
    // Broadcast status baru
    if (trackingChannel) {
      trackingChannel.send({ type: 'broadcast', event: 'notif', payload: { role: 'admin', msg: `Tugas penjemputan warga telah diambil oleh transporter!` } });
    }
    
    alert("Tugas berhasil diambil!");
    await fetchAll(myId);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  useEffect(() => {
    const origin = myLocation ? myLocation : { lat: -7.8488, lng: 110.4398 };
    const coords = [`${origin.lng},${origin.lat}`];

    if (focusedLocation) {
      coords.push(`${focusedLocation.lng},${focusedLocation.lat}`);
    } else {
      const pending = tugas.filter(t => t.status === "proses");
      if (pending.length === 0) {
        setRouteCoords(null);
        setReturnRouteCoords(null);
        return;
      }
      pending.forEach(t => {
        const loc = parseLocation(t.warga?.location);
        if (loc) coords.push(`${loc.lng},${loc.lat}`);
      });
    }
    
    if (coords.length > 1) {
      // Jika tujuan lebih dari 1 (coords > 2), gunakan Trip API untuk optimasi TSP (Traveling Salesperson)
      // Jika hanya 1 tujuan (coords == 2), gunakan Route API biasa
      const apiType = coords.length > 2 && !focusedLocation ? "trip" : "route";
      const extraParams = apiType === "trip" ? "&source=first&roundtrip=false" : "";
      
      fetch(`https://router.project-osrm.org/${apiType}/v1/driving/${coords.join(';')}?overview=simplified&geometries=geojson${extraParams}`)
        .then(r => r.json())
        .then(data => {
           const routeData = data.trips || data.routes;
           if (data.code === "Ok" && routeData && routeData.length > 0) {
             const geojson = routeData[0].geometry;
             const latlngs = geojson.coordinates.map(c => [c[1], c[0]]);
             setRouteCoords(latlngs);

             // Calculate return route to TPA
             let lastLoc = null;
             if (apiType === "trip" && data.waypoints && data.waypoints.length > 0) {
               const lastWp = data.waypoints.reduce((prev, current) => (prev.waypoint_index > current.waypoint_index) ? prev : current);
               lastLoc = lastWp.location; // [lng, lat]
             } else if (data.waypoints && data.waypoints.length > 0) {
               lastLoc = data.waypoints[data.waypoints.length - 1].location;
             }

             if (lastLoc) {
               const tpaLngLat = `110.4398,-7.8488`;
               fetch(`https://router.project-osrm.org/route/v1/driving/${lastLoc[0]},${lastLoc[1]};${tpaLngLat}?overview=simplified&geometries=geojson`)
                 .then(r => r.json())
                 .then(retData => {
                   if (retData.code === "Ok" && retData.routes.length > 0) {
                     const retGeojson = retData.routes[0].geometry;
                     const retLatlngs = retGeojson.coordinates.map(c => [c[1], c[0]]);
                     setReturnRouteCoords(retLatlngs);
                   }
                 });
             } else {
               setReturnRouteCoords(null);
             }
           }
        }).catch(err => console.error("OSRM Error:", err));
    } else {
      setRouteCoords(null);
      setReturnRouteCoords(null);
    }
  }, [myLocation, tugas, focusedLocation]);

  const openRoute = (loc) => {
    const p = parseLocation(loc);
    if (p) {
      setFocusedLocation(p);
    } else {
      alert("Lokasi rumah warga belum tersedia.");
    }
  };

  const toggleLive = () => {
    if (isLive) {
      if (watchId) navigator.geolocation.clearWatch(watchId);
      setIsLive(false);
      setWatchId(null);
    } else {
      if (!navigator.geolocation) return alert("Geolocation tidak didukung browser ini.");
      const id = navigator.geolocation.watchPosition((pos) => {
              setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
              if (trackingChannel) {
                trackingChannel.send({
                  type: 'broadcast',
            event: 'location',
            payload: { id: myId, nama: user.nama, lat: pos.coords.latitude, lng: pos.coords.longitude }
          });
        }
      }, (err) => alert("Gagal akses lokasi: " + err.message), { enableHighAccuracy: true });
      setWatchId(id);
      setIsLive(true);
    }
  };

  const menuItems = [
    {
      id: "ruteharian", label: "Rute Harian",
      icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
    },
    {
      id: "tugasjemput", label: "Tugas Jemput",
      icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.475 3.475 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.475 3.475 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.475 3.475 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.475 3.475 0 013.138-3.138z" /></svg>
    },
    {
      id: "statustruk", label: "Status Truk",
      icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h4m-6 0a1 1 0 001-1m-6 0H9" /></svg>
    },
    {
      id: "pengaturan", label: "Pengaturan",
      icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
      subItems: [
        { id: "pengaturan-aplikasi", label: "Pengaturan Aplikasi" },
        { id: "pengaturan-keamanan", label: "Keamanan Akun" },
        { id: "pengaturan-bantuan", label: "Bantuan & FAQ" }
      ]
    }
  ];

  return (
    <div className="dashboard-layout">
      {loading && <TypingLoader />}
      <Sidebar
        user={user}
        role="transporter"
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        menuItems={menuItems}
      />
      <main className="main-content">
        {/* Header */}
        <div className="dashboard-header">
          <div className="welcome-section">
            <h1>Halo, {user.nama}</h1>
            <p>Jadwal rute dan penjemputan armada pengangkut sampah aktif Anda.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button onClick={() => fetchAll(myId)} className="btn-primary" style={{ width: "auto", padding: "8px 16px", fontSize: "13px", gap: "6px" }}>
              <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89" /></svg>
              Refresh
            </button>
            <span className="badge-role" style={{ backgroundColor: "#fffbeb", color: "#d97706", borderColor: "#fde68a" }}>TRANSPORTER</span>
          </div>
        </div>

        <>
            {/* TAB: Rute Harian */}
            {activeTab === "ruteharian" && (
              <>
                {/* Stat Cards */}
                <div className="dashboard-grid">
                  <div className="stat-card">
                    <div className="stat-icon-wrapper">
                      <span className="stat-title">Rute Ditugaskan</span>
                      <svg className="stat-icon-svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                    </div>
                    <div className="stat-value">{stats.rute} Rute</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon-wrapper">
                      <span className="stat-title">Total Titik Jemput</span>
                      <svg className="stat-icon-svg" style={{ color: "#3b82f6" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                    </div>
                    <div className="stat-value" style={{ color: "#3b82f6" }}>{stats.titik} Lokasi</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon-wrapper">
                      <span className="stat-title">Progress Tugas</span>
                      <svg className="stat-icon-svg" style={{ color: "#f59e0b" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7m0 10l8-4" /></svg>
                    </div>
                    <div className="stat-value" style={{ color: "#f59e0b" }}>{stats.muatan}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon-wrapper">
                      <span className="stat-title">Tugas Selesai</span>
                      <svg className="stat-icon-svg" style={{ color: "#059669" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div className="stat-value" style={{ color: "#059669" }}>{stats.selesai}</div>
                  </div>
                </div>

                {/* Peta Rute */}
                <div className="map-container-wrapper">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text-main)" }}>Pemantauan Armada (Live Peta)</h3>
                    {focusedLocation && (
                      <button onClick={() => setFocusedLocation(null)} className="btn-primary" style={{ padding: "6px 12px", fontSize: "12px", width: "auto", background: "#f59e0b", borderColor: "#d97706", borderRadius: "4px" }}>
                        Lihat Semua Rute
                      </button>
                    )}
                  </div>
                  <Map 
                    data={allWarga.filter(w => tugas.some(t => t.warga_id === w.id && t.status === "proses"))} 
                    liveDrivers={myLocation ? [{ ...myLocation, id: myId }] : [{ lat: -7.8488, lng: 110.4398, id: 'tpa_base' }]} 
                    routeCoords={routeCoords} 
                    returnRouteCoords={returnRouteCoords}
                    selectedMarker={focusedLocation}
                  />
                </div>

                {/* Daftar Rute Pengambilan */}
                <div className="map-container-wrapper">
                  <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--color-text-main)" }}>Daftar Rute Pengambilan Aktif</h3>
                  {tugas.length === 0 ? (
                    <div style={{ padding: "20px 0", color: "var(--color-text-muted)", fontSize: "13px" }}>
                      Belum ada tugas penjemputan aktif. Ambil tugas dari tab <strong>Tugas Jemput</strong>.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {tugas.map(t => (
                        <div key={t.id} style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px 20px", backgroundColor: "#ffffff", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--color-text-main)", marginBottom: "4px" }}>
                              {t.warga?.nama || "Warga"}
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Alamat: {t.warga?.alamat || "-"}</div>
                            <div style={{ marginTop: "6px" }}>
                              <span style={{ padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", backgroundColor: t.status === "selesai" ? "#dcfce7" : t.status === "proses" ? "#dbeafe" : "#fef3c7", color: t.status === "selesai" ? "#16a34a" : t.status === "proses" ? "#2563eb" : "#d97706" }}>
                                {t.status}
                              </span>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "8px" }}>
                            {t.status === "proses" && (
                              <button onClick={() => setSelesaiModal({ open: true, id: t.id, file: null, loading: false })} className="btn-primary" style={{ padding: "6px 14px", fontSize: "12px", width: "auto", background: "#059669", borderColor: "#047857" }}>✓ Selesai</button>
                            )}
                            {t.status !== "selesai" && (
                              <button onClick={() => openRoute(t.warga?.location)} className="btn-primary" style={{ padding: "6px 14px", fontSize: "12px", width: "auto", background: "#3b82f6", borderColor: "#2563eb" }}>
                                Mulai Navigasi
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Peta Rute */}
                <div className="map-container-wrapper">
                  <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--color-text-main)" }}>Pemantauan Peta Jemputan</h3>
                  <Map data={allWarga.filter(w => tugas.some(t => t.warga_id === w.id && t.status === "proses"))} liveDrivers={myLocation ? [{ ...myLocation, id: myId }] : []} routeCoords={routeCoords} returnRouteCoords={returnRouteCoords} />
                </div>
              </>
            )}

            {/* TAB: Tugas Jemput */}
            {activeTab === "tugasjemput" && (
              <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--color-text-main)" }}>Daftar Warga — Ambil Tugas Penjemputan</h3>
                <div className="table-container">
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e2e8f0", color: "var(--color-text-muted)", textAlign: "left" }}>
                        <th style={{ padding: "10px 12px", fontWeight: 600 }}>Nama Warga</th>
                        <th style={{ padding: "10px 12px", fontWeight: 600 }}>Alamat</th>
                        <th style={{ padding: "10px 12px", fontWeight: 600 }}>Status Iuran</th>
                        <th style={{ padding: "10px 12px", fontWeight: 600 }}>Aksi Driver</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const wargaBelumDiambil = allWarga.filter(w => {
                           const t = tugas.find(x => x.warga_id === w.id);
                           if (!t) return true; // Warga baru, belum pernah ada tugas
                           if (t.status === "proses") return false; // Sedang dijemput
                           if (t.status === "selesai") return false; // Sudah selesai, sembunyikan sampai warga klik request lagi (status 'Menunggu')
                           return true; // Status 'Menunggu' atau lainnya akan ditampilkan
                        });
                        
                        if (wargaBelumDiambil.length === 0) {
                          return <tr><td colSpan="4" style={{ padding: "20px", textAlign: "center", color: "var(--color-text-muted)" }}>Tidak ada tugas penjemputan baru yang tersedia.</td></tr>;
                        }

                        return wargaBelumDiambil.map(w => {
                          const sudah = (w.pembayaran || []).some(p => p.status === "sudah");
                          return (
                            <tr key={w.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "12px", fontWeight: 600 }}>{w.nama}</td>
                              <td style={{ padding: "12px", color: "var(--color-text-muted)" }}>{w.alamat}</td>
                              <td style={{ padding: "12px" }}>
                                <span style={{ padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, backgroundColor: sudah ? "#dcfce7" : "#fee2e2", color: sudah ? "#16a34a" : "#dc2626" }}>
                                  {sudah ? "Sudah Bayar" : "Belum Bayar"}
                                </span>
                              </td>
                              <td style={{ padding: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                <button 
                                  disabled={loadingAction}
                                  onClick={() => {
                                    if (!sudah) return alert("Warga ini belum melunasi iuran retribusi! Anda tidak dapat mengambil tugas ini.");
                                    ambilTugas(w.id);
                                  }} 
                                  className="btn-primary" 
                                  style={{ padding: "4px 10px", fontSize: "11px", width: "auto", background: sudah ? "#3b82f6" : "#9ca3af", borderColor: sudah ? "#2563eb" : "#6b7280", cursor: loadingAction ? "wait" : (sudah ? "pointer" : "not-allowed"), opacity: loadingAction ? 0.6 : 1 }}
                                  title={sudah ? "Ambil Tugas Penjemputan" : "Warga belum melunasi iuran"}
                                >
                                  {loadingAction ? "..." : "Ambil"}
                                </button>
                                <button onClick={() => openRoute(w.location)} className="btn-primary" style={{ padding: "4px 10px", fontSize: "11px", width: "auto", background: "#3b82f6", borderColor: "#2563eb" }}>Rute</button>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB: Pengaturan Aplikasi ── */}
            {activeTab === "pengaturan-aplikasi" && (
              <div className="card-animated">
                <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--color-text-main)" }}>Pengaturan Aplikasi Truk</h3>
                  <div style={{ padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <p style={{ color: "var(--color-text-muted)", fontSize: "14px", lineHeight: 1.6 }}>Preferensi notifikasi suara dan preferensi *routing* peta sedang dalam pengembangan.</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB: Pengaturan Keamanan ── */}
            {activeTab === "pengaturan-keamanan" && (
              <div className="card-animated">
                <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                  <AccountSettings user={user} setUser={setUser} />
                </div>
              </div>
            )}

            {/* ── TAB: Bantuan & FAQ ── */}
            {activeTab === "pengaturan-bantuan" && (
              <div className="card-animated">
                <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--color-text-main)" }}>Panduan & Bantuan Transporter</h3>
                  <div className="grid-2-col">
                    <div style={{ padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                      <h4 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-primary)", marginBottom: "8px" }}>Cara Mengambil Sampah</h4>
                      <p style={{ fontSize: "13px", color: "var(--color-text-muted)", lineHeight: 1.6 }}>Pilih tugas dari daftar "Tugas Menunggu", lalu klik "Ambil Tugas". Ikuti rute GPS yang muncul di Peta Navigasi.</p>
                    </div>
                    <div style={{ padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                      <h4 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-primary)", marginBottom: "8px" }}>Mengunggah Bukti Angkut</h4>
                      <p style={{ fontSize: "13px", color: "var(--color-text-muted)", lineHeight: 1.6 }}>Setelah sampai di lokasi, klik tombol "Selesaikan" dan unggah foto bak sampah sebagai bukti pekerjaan telah selesai.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Status Truk */}
            {activeTab === "statustruk" && (
              <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text-main)" }}>Daftar Tugas Hari Ini</h3>
                  <button 
                    onClick={toggleLive} 
                    className="btn-primary" 
                    style={{ width: "auto", padding: "8px 16px", fontSize: "13px", gap: "8px", background: isLive ? "#ef4444" : "#10b981", borderColor: isLive ? "#dc2626" : "#059669" }}
                  >
                    {isLive ? (
                      <>
                        <svg style={{ width: 16, height: 16, animation: "pulse 2s infinite" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                        Hentikan Live Tracking
                      </>
                    ) : (
                      <>
                        <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        Mulai Berbagi Lokasi Live
                      </>
                    )}
                  </button>
                </div>
                {tugas.length === 0 ? (
                  <p style={{ color: "var(--color-text-muted)", fontSize: "13px" }}>Belum ada tugas aktif yang Anda ambil.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {tugas.map(t => (
                      <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", border: "1px solid #e2e8f0", borderRadius: "8px", backgroundColor: "#ffffff", flexWrap: "wrap", gap: "10px" }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{t.warga?.nama}</div>
                          <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{t.warga?.alamat}</div>
                        </div>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <span style={{ padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", backgroundColor: t.status === "selesai" ? "#dcfce7" : "#dbeafe", color: t.status === "selesai" ? "#16a34a" : "#2563eb" }}>{t.status}</span>
                          {t.status === "proses" && (
                            <button onClick={() => setSelesaiModal({ open: true, id: t.id, file: null, loading: false })} className="btn-primary" style={{ padding: "4px 10px", fontSize: "11px", width: "auto", background: "#059669", borderColor: "#047857" }}>Selesai</button>
                          )}
                          {t.status !== "selesai" && (
                            <button onClick={() => openRoute(t.warga?.location)} className="btn-primary" style={{ padding: "4px 10px", fontSize: "11px", width: "auto", background: "#3b82f6", borderColor: "#2563eb" }}>Rute</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
        </>
      </main>

      {/* MODAL SELESAI */}
      {selesaiModal.open && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", width: "100%", maxWidth: "400px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px" }}>Konfirmasi Selesai</h3>
            <p style={{ fontSize: "14px", color: "var(--color-text-muted)", marginBottom: "16px" }}>Silakan upload foto bak sampah yang sudah dibersihkan sebagai bukti (Opsional).</p>
            <div className="form-group">
              <input type="file" accept="image/*" onChange={(e) => setSelesaiModal(prev => ({ ...prev, file: e.target.files[0] }))} className="form-input" style={{ padding: "8px" }} />
            </div>
            <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
              <button onClick={() => setSelesaiModal({ open: false, id: null, file: null, loading: false })} className="btn-primary" style={{ background: "#e2e8f0", color: "#475569", borderColor: "#cbd5e1", flex: 1 }}>Batal</button>
              <button 
                onClick={() => {
                  setSelesaiModal(prev => ({ ...prev, loading: true }));
                  updateTugas(selesaiModal.id, "selesai", selesaiModal.file);
                }} 
                disabled={selesaiModal.loading} 
                className="btn-primary" 
                style={{ flex: 1, background: "#059669", borderColor: "#047857" }}
              >
                {selesaiModal.loading ? "Memproses..." : "Selesaikan Tugas"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
