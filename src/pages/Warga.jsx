import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import AccountSettings from "../components/AccountSettings";
import Map from "../components/Map";
import Sidebar from "../components/Sidebar";
import TypingLoader from "../components/TypingLoader";
import ChatWidget from "../components/ChatWidget";
import gsap from "gsap";
import Swal from "sweetalert2";

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  var R = 6371; 
  var dLat = (lat2-lat1) * (Math.PI/180);  
  var dLon = (lon2-lon1) * (Math.PI/180); 
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

export default function Warga() {
  const [user, setUser] = useState({ nama: "Warga", email: "" });
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");

  const [pembayaranHistory, setPembayaranHistory] = useState([]);
  const [pengangkutanHistory, setPengangkutanHistory] = useState([]);
  const [redeemHistory, setRedeemHistory] = useState([]);
  const [katalogRedeem, setKatalogRedeem] = useState([]);
  const [liveDrivers, setLiveDrivers] = useState({});
  const [trackingChannel, setTrackingChannel] = useState(null);
  const [reports, setReports] = useState([]);
  const [isLocationLocked, setIsLocationLocked] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    let currentUser = null;
    supabase.auth.getUser().then(({ data }) => { currentUser = data.user; });

    const channel = supabase.channel('tracking')
      .on('broadcast', { event: 'location' }, (payload) => {
        setLiveDrivers(prev => ({ ...prev, [payload.payload.id]: payload.payload }));
      })
      .on('broadcast', { event: 'notif' }, (payload) => {
        if (payload.payload.role === 'warga' && currentUser && payload.payload.target_id === currentUser.id) {
          alert("🔔 NOTIFIKASI BARU:\n" + payload.payload.msg);
          refreshHistory(currentUser.id);
        }
      });
    channel.subscribe();
    setTrackingChannel(channel);
    return () => { supabase.removeChannel(channel); }
  }, []);

  const [wargaData, setWargaData] = useState(null);
  const [latlng, setLatLng] = useState(null);
  const [osrmDistance, setOsrmDistance] = useState(null);
  const [form, setForm] = useState({ nama: "", alamat: "", jenis: "Plastik & Kertas", berat: "" });
  const [history, setHistory] = useState({ sampah: [], bayar: [], angkut: [] });
  const [stats, setStats] = useState({ laporan: 0, angkut: 0, poin: 0, lunas: 0 });
  const [loading, setLoading] = useState(true);
  const [payLoading, setPayLoading] = useState(false);
  const [buktiFile, setBuktiFile] = useState(null);

  const refreshHistory = async (id) => {
    const [s, b, a, r, kat] = await Promise.all([
      supabase.from("sampah").select("*").eq("warga_id", id).order("created_at", { ascending: false }),
      supabase.from("pembayaran").select("*").eq("warga_id", id).order("created_at", { ascending: false }),
      supabase.from("pengangkutan").select("*").eq("warga_id", id).order("created_at", { ascending: false }),
      supabase.from("redeem_poin").select("*").eq("warga_id", id).order("created_at", { ascending: false }),
      supabase.from("katalog_redeem").select("*").order("cost", { ascending: true })
    ]);
    const sampahList = s.data || [];
    const bayarList = b.data || [];
    const angkutList = a.data || [];
    setPembayaranHistory(bayarList);
    setPengangkutanHistory(angkutList);
    setRedeemHistory(r.data || []);
    setKatalogRedeem(kat.data || []);
    setHistory({ sampah: sampahList, bayar: bayarList, angkut: angkutList });

    const totalBerat = sampahList.reduce((sum, s) => sum + (s.berat || 0), 0);
    setStats({
      laporan: sampahList.length,
      angkut: angkutList.filter(a => a.status !== "selesai").length,
      poin: Math.round(totalBerat * 10),
      lunas: bayarList.filter(b => b.status === "sudah").length,
    });
  };

  // Fetch OSRM Driving Distance to TPA
  useEffect(() => {
    if (latlng) {
      // TPA Piyungan Coordinates: -7.8286, 110.3789
      // OSRM format: lng,lat;lng,lat
      fetch(`https://router.project-osrm.org/route/v1/driving/${latlng.lng},${latlng.lat};110.3789,-7.8286?overview=false`)
        .then(res => res.json())
        .then(data => {
          if (data.routes && data.routes.length > 0) {
            setOsrmDistance(data.routes[0].distance / 1000); // distance is in meters, convert to km
          }
        })
        .catch(err => console.error("OSRM Error:", err));
    }
  }, [latlng]);

  const currentPoin = stats.poin - redeemHistory.filter(r => r.status !== 'ditolak').reduce((acc, r) => acc + r.points_cost, 0);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const { data: profile } = await supabase.from("profiles").select("*").eq("id", authUser.id).maybeSingle();
          const nama = profile?.name || "";
          setUser({ id: authUser.id, nama, email: authUser.email, avatar_url: profile?.avatar_url });

          const { data: wd } = await supabase.from("warga").select("*").eq("id", authUser.id).order("id", { ascending: false }).limit(1).maybeSingle();
          if (wd) {
            setWargaData(wd);
            setForm(f => ({ ...f, nama: wd.nama, alamat: wd.alamat }));
            setIsLocationLocked(true);
            try {
              if (wd.location && typeof wd.location === "string") {
                const m = wd.location.match(/POINT\s*\(\s*([^\s]+)\s+([^\s]+)\s*\)/i);
                if (m) setLatLng({ lat: parseFloat(m[2]), lng: parseFloat(m[1]) });
              }
            } catch (e) {
              console.error("Error parsing location:", e);
            }
            await refreshHistory(wd.id);
          } else {
            setForm(f => ({ ...f, nama }));
            setActiveTab("pengaturan-aplikasi");
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        await new Promise(res => setTimeout(res, 1500));
        setLoading(false);
      }
    };
    init();
  }, []);

  // GSAP Animations
  useEffect(() => {
    if (!loading) {
      gsap.from(".stat-card", { duration: 0.6, y: 30, opacity: 0, stagger: 0.1, ease: "power2.out" });
      gsap.from(".map-container-wrapper", { duration: 0.8, y: 40, opacity: 0, delay: 0.3, ease: "power2.out" });
    }
  }, [loading, activeTab]);

  const saveProfile = async () => {
    if (!latlng) return alert("Pilih lokasi Anda pada peta terlebih dahulu!");
    if (!form.nama || !form.alamat) return alert("Isi nama dan alamat lengkap!");
    const { data: { user: authUser } } = await supabase.auth.getUser();

    const payload = { id: authUser.id, nama: form.nama, alamat: form.alamat, location: `POINT(${latlng.lng} ${latlng.lat})` };
    const { data, error } = wargaData
      ? await supabase.from("warga").update(payload).eq("id", wargaData.id).select().single()
      : await supabase.from("warga").insert(payload).select().single();
    if (error) return alert("Gagal menyimpan: " + error.message);
    if (data) {
      setWargaData(data);
      await supabase.from("profiles").update({ name: form.nama }).eq("id", authUser.id);
      setUser(u => ({ ...u, nama: form.nama }));
      alert("Profil & lokasi spasial berhasil disimpan!");
      await refreshHistory(data.id);
    }
  };

  const addData = async (table, payload) => {
    if (!wargaData) return alert("Simpan profil & lokasi rumah Anda terlebih dahulu!");
    const { error } = await supabase.from(table).insert({ warga_id: wargaData.id, ...payload });
    setLoading(false);
    if (error) return alert("Gagal memproses: " + error.message);
    alert("✅ Permintaan berhasil dikirim!");

    if (trackingChannel) {
      trackingChannel.send({ type: 'broadcast', event: 'notif', payload: { role: 'admin', msg: `Laporan/Request baru dari warga!` } });
      trackingChannel.send({ type: 'broadcast', event: 'notif', payload: { role: 'transporter', msg: `Laporan/Request baru dari warga!` } });
    }

    setForm({ ...form, jenis: "Plastik & Kertas", berat: "" });
    await refreshHistory(wargaData.id);
  };

  const submitLaporanDanRequest = async () => {
    if (loading) return;
    if (!wargaData) return alert("Simpan profil & lokasi rumah Anda terlebih dahulu!");
    
    // Check if there is already an active request
    const hasActiveRequest = history.angkut.some(a => a.status === "Menunggu" || a.status === "proses");
    if (hasActiveRequest) {
      return alert("Anda sudah memiliki permintaan penjemputan yang sedang aktif! Harap tunggu sampai truk selesai menjemput.");
    }

    const statusBulanIniStatus = statusBayarBulanIni();
    if (statusBulanIniStatus?.status !== "sudah") {
      return alert("Anda harus melunasi retribusi kebersihan bulan ini (dan diverifikasi Admin) sebelum dapat request penjemputan sampah.");
    }
    setLoading(true);
    
    // Jika mengisi berat, masukkan ke data poin sampah
    if (form.berat) {
      const beratFloat = parseFloat(form.berat);
      const { error: errSampah } = await supabase.from("sampah").insert({ warga_id: wargaData.id, jenis: form.jenis, berat: beratFloat });
      if (errSampah) { setLoading(false); return alert("Gagal memproses poin sampah: " + errSampah.message); }
    }
    
    // Insert pengangkutan (wajib)
    const { error: errAngkut } = await supabase.from("pengangkutan").insert({ warga_id: wargaData.id, status: "Menunggu" });
    if (errAngkut) { setLoading(false); return alert("Gagal request penjemputan: " + errAngkut.message); }

    setLoading(false);
    alert("✅ Truk penjemputan berhasil dipanggil!" + (form.berat ? " Laporan sampah & poin berhasil ditambahkan." : ""));

    if (trackingChannel) {
      trackingChannel.send({ type: 'broadcast', event: 'notif', payload: { role: 'admin', msg: `Request penjemputan sampah baru dari warga!` } });
      trackingChannel.send({ type: 'broadcast', event: 'notif', payload: { role: 'transporter', msg: `Tugas jemput baru dari warga tersedia!` } });
    }

    setForm({ ...form, jenis: "Plastik & Kertas", berat: "" });
    await refreshHistory(wargaData.id);
  };

  const getBulanIni = () => new Date().toISOString().slice(0, 7);
  
  const getSisaKuota = () => {
    const bulan = getBulanIni();
    const count = history.angkut.filter(a => a.created_at && a.created_at.startsWith(bulan)).length;
    return Math.max(0, 4 - count);
  };

  const statusBayarBulanIni = () => {
    const bulan = getBulanIni();
    const records = history.bayar.filter(b => b.tanggal && b.tanggal.startsWith(bulan));
    if (records.length === 0) return null;
    const lunas = records.find(b => b.status === "sudah");
    if (lunas) return lunas;
    return records[0];
  };

  const bayarRetribusi = async () => {
    if (!wargaData) return alert("Simpan profil terlebih dahulu!");
    const bulan = getBulanIni();
    const existing = history.bayar.find(b => b.tanggal && b.tanggal.startsWith(bulan));
    if (existing) return alert("Anda sudah mengirim pembayaran bulan ini. Tunggu verifikasi Admin.");

    setPayLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error("Silakan login ulang.");

      let bukti_url = null;
      if (buktiFile) {
        const fileExt = buktiFile.name.split('.').pop();
        const fileName = `bayar-${authUser.id}-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('uploads').upload(fileName, buktiFile);
        if (uploadError) throw new Error("Gagal upload foto bukti: " + uploadError.message);
        bukti_url = supabase.storage.from('uploads').getPublicUrl(fileName).data.publicUrl;
      }

      const { error } = await supabase.from("pembayaran").insert({
        warga_id: wargaData.id,
        status: "belum",
        tanggal: new Date().toISOString().split("T")[0],
        bukti_url: bukti_url
      });
      if (error) throw error;

      alert("✅ Bukti pembayaran berhasil dikirim! Menunggu verifikasi Admin.");
      await refreshHistory(wargaData.id);
    } catch (err) {
      alert("Gagal kirim pembayaran: " + err.message);
    } finally {
      setPayLoading(false);
    }
  };

  const statusBulanIni = statusBayarBulanIni();

  // Kalkulasi Biaya Berdasarkan Jarak
  let jarakKeTpa = osrmDistance || 0;
  let totalBiaya = 30000;
  
  if (latlng && !osrmDistance) {
    // Fallback ke garis lurus jika OSRM loading/gagal
    jarakKeTpa = getDistanceFromLatLonInKm(latlng.lat, latlng.lng, -7.8286, 110.3789); 
  }
  
  if (jarakKeTpa > 0) {
    const baseFee = 30000;
    const feePerKm = 2200;
    totalBiaya = baseFee + Math.round(jarakKeTpa * feePerKm);
  }

  const handleUnlockLocation = async () => {
    const { value: password } = await Swal.fire({
      title: 'Kunci Koordinat',
      text: "Masukkan password Anda untuk mengizinkan perubahan lokasi.",
      input: 'password',
      inputPlaceholder: 'Password akun Anda',
      showCancelButton: true,
      confirmButtonText: 'Buka Kunci',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#3b82f6',
      inputValidator: (value) => {
        if (!value) {
          return 'Password tidak boleh kosong!'
        }
      }
    });

    if (password) {
      // Verifikasi password
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: password,
      });

      if (error) {
        Swal.fire({ icon: 'error', title: 'Gagal', text: 'Password salah.' });
      } else {
        setIsLocationLocked(false);
        Swal.fire({ 
          icon: 'success', 
          title: 'Terbuka', 
          text: 'Silakan klik pada peta untuk mengubah koordinat baru.', 
          timer: 2000, 
          showConfirmButton: false 
        });
      }
    }
  };

  const menuItems = [
    {
      id: "dashboard", label: "Dashboard",
      icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
    },
    {
      id: "laporan", label: "Laporkan Sampah",
      icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
    },
    {
      id: "pembayaran", label: "Pembayaran",
      icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
    },
    {
      id: "jadwal", label: "Jadwal Angkut",
      icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
    },
    {
      id: "ecopoin", label: "Tukar Poin",
      icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
    },
    {
      id: "pengaturan", label: "Pengaturan",
      icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
      subItems: [
        { id: "pengaturan-aplikasi", label: "Profil & Lokasi" },
        { id: "pengaturan-keamanan", label: "Keamanan & Akun" },
        { id: "pengaturan-bantuan", label: "Bantuan & FAQ" }
      ]
    }
  ];

  const statusColor = (s) => {
    if (s === "sudah") return { bg: "#dcfce7", color: "#16a34a", label: "✓ Lunas" };
    if (s === "belum") return { bg: "#fef3c7", color: "#d97706", label: "⏳ Menunggu Verifikasi" };
    return { bg: "#fee2e2", color: "#dc2626", label: "✗ Belum Bayar" };
  };

  return (
    <div className="dashboard-layout">
      {loading && <TypingLoader />}
      <Sidebar
        user={user}
        role="warga"
        activeTab={activeTab}
        setActiveTab={(tab) => {
          if (!wargaData && !tab.startsWith("pengaturan")) return alert("Silakan lengkapi profil dan lokasi rumah Anda terlebih dahulu!");
          setActiveTab(tab);
        }}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        menuItems={menuItems}
      />
      <main className="main-content">
        <div className="dashboard-header">
          <div className="welcome-section">
            <h1>Selamat Datang, {user.nama || "Warga"}!</h1>
            <p>Kelola laporan sampah, pembayaran retribusi, dan eco poin Anda.</p>
          </div>
          <span className="badge-role">ECO CITIZEN</span>
        </div>

        <>
          {activeTab === "dashboard" && (
              <>
                <div className="dashboard-grid">
                  <div className="stat-card">
                    <div className="stat-icon-wrapper">
                      <span className="stat-title">Laporan Sampah</span>
                      <svg className="stat-icon-svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <div className="stat-value">{stats.laporan} Laporan</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon-wrapper">
                      <span className="stat-title">Antrean Angkut</span>
                      <svg className="stat-icon-svg" style={{ color: "#f59e0b" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    </div>
                    <div className="stat-value" style={{ color: "#f59e0b" }}>{stats.angkut} Menunggu</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon-wrapper">
                      <span className="stat-title">Eco Poin</span>
                      <svg className="stat-icon-svg" style={{ color: "#8b5cf6" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                    </div>
                    <div className="stat-value" style={{ color: "#8b5cf6" }}>{stats.poin} Poin</div>
                  </div>
                  <div className="stat-card" style={{ cursor: "pointer" }} onClick={() => setActiveTab("pembayaran")}>
                    <div className="stat-icon-wrapper">
                      <span className="stat-title">Status Iuran Bulan Ini</span>
                      <svg className="stat-icon-svg" style={{ color: statusBulanIni?.status === "sudah" ? "#059669" : "#dc2626" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                    </div>
                    <div className="stat-value" style={{ color: statusBulanIni?.status === "sudah" ? "#059669" : statusBulanIni?.status === "belum" ? "#d97706" : "#dc2626", fontSize: "16px" }}>
                      {statusBulanIni ? statusColor(statusBulanIni.status).label : "✗ Belum Bayar"}
                    </div>
                  </div>
                </div>

                <div className="grid-2-col" style={{ marginTop: "24px" }}>
                  {/* Riwayat Aktivitas Terakhir */}
                  <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--color-text-main)" }}>Riwayat Aktivitas Terakhir</h3>
                    {(() => {
                      const combinedRiwayat = [
                        ...history.sampah.map(s => ({ ...s, type: "sampah" })),
                        ...history.angkut.filter(a => a.status === "selesai").map(a => ({ ...a, type: "angkut" }))
                      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

                      if (combinedRiwayat.length === 0) {
                        return <p style={{ color: "var(--color-text-muted)", fontSize: "13px" }}>Belum ada riwayat aktivitas.</p>;
                      }

                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {combinedRiwayat.slice(0, 5).map(item => (
                            <div key={item.type + item.id} style={{ display: "flex", justifyContent: "space-between", padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", backgroundColor: "#fff" }}>
                              <span style={{ fontWeight: 600 }}>
                                {item.type === "sampah" ? `🚮 ${item.jenis}` : "🚚 Truk Selesai Mengangkut"}
                              </span>
                              <div style={{ display: "flex", gap: "12px" }}>
                                {item.type === "sampah" ? (
                                  <>
                                    <span style={{ fontWeight: 700, color: "var(--color-primary)" }}>{item.berat} Kg</span>
                                    <span style={{ fontWeight: 700, color: "#8b5cf6" }}>+{item.berat * 10} Poin</span>
                                  </>
                                ) : (
                                  <span style={{ fontWeight: 700, color: "#10b981" }}>✓ Selesai</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Peta Lokasi Anda & Truk Terdekat */}
                  <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--color-text-main)" }}>Pantauan Peta: Lokasi Anda & Truk Aktif</h3>
                    <div> {/* Interaksi Peta Diaktifkan */}
                      <Map setLatLng={() => {}} selectedMarker={latlng} data={wargaData ? [{ ...wargaData, pembayaran: [{ status: statusBulanIni?.status || "belum" }] }] : []} liveDrivers={Object.values(liveDrivers)} />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── TAB: Pengaturan Aplikasi (Profil & Peta) ── */}
            {activeTab === "pengaturan-aplikasi" && (
              <div className="card-animated">
                <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--color-text-main)" }}>
                    {!wargaData ? "👋 Selamat Datang! Silakan Lengkapi Profil Anda" : "Profil & Lokasi Penjemputan"}
                  </h3>
                  <div className="grid-form-map">
                    <div>
                      <div className="form-group">
                        <label className="form-label">Nama Lengkap</label>
                        <input className="form-input" placeholder="Masukkan nama" value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Alamat Rumah</label>
                        <input className="form-input" placeholder="Masukkan alamat" value={form.alamat} onChange={e => setForm({ ...form, alamat: e.target.value })} />
                      </div>
                      <div style={{ padding: "10px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "13px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          {latlng
                            ? <span style={{ color: "var(--color-primary)", fontWeight: 600 }}>📍 Koordinat: Lat {latlng.lat.toFixed(6)}, Lng {latlng.lng.toFixed(6)}</span>
                            : <span style={{ color: "#dc2626" }}>⚠️ Klik peta di samping untuk menandai lokasi rumah Anda</span>}
                        </div>
                        {wargaData && (
                          <button 
                            onClick={isLocationLocked ? handleUnlockLocation : () => setIsLocationLocked(true)} 
                            className="btn-primary"
                            style={{ 
                              background: isLocationLocked ? "#e2e8f0" : "#dcfce7", 
                              color: isLocationLocked ? "#475569" : "#16a34a", 
                              padding: "4px 8px", 
                              borderRadius: "4px", 
                              fontSize: "11px", 
                              fontWeight: 700, 
                              border: isLocationLocked ? "1px solid #cbd5e1" : "1px solid #86efac", 
                              width: "auto",
                              transition: "all 0.2s ease" 
                            }}
                          >
                            {isLocationLocked ? "🔒 Terkunci" : "🔓 Terbuka"}
                          </button>
                        )}
                      </div>
                      <button onClick={async () => {
                        await saveProfile();
                        if (latlng && form.nama && form.alamat) {
                          setIsLocationLocked(true);
                          setActiveTab("dashboard");
                        }
                      }} className="btn-primary">
                        {!wargaData ? "Simpan Profil & Mulai" : "Simpan Perubahan"}
                      </button>
                    </div>
                    <div>
                      <label className="form-label">Peta Interaktif — Cari & Klik untuk Plot Koordinat</label>
                      <Map setLatLng={setLatLng} selectedMarker={latlng} data={wargaData ? [{ ...wargaData, pembayaran: [{ status: statusBulanIni?.status || "belum" }] }] : []} liveDrivers={Object.values(liveDrivers)} isLocked={isLocationLocked} />
                    </div>
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
                  <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--color-text-main)" }}>
                    Bantuan Penggunaan & Tanya Jawab (FAQ)
                  </h3>
                  <div className="grid-2-col">
                    <div style={{ padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                      <h4 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-primary)", marginBottom: "8px" }}>Cara Memesan Truk Sampah</h4>
                      <p style={{ fontSize: "13px", color: "var(--color-text-muted)", lineHeight: 1.6 }}>
                        Buka tab <strong>Laporkan Sampah</strong>, masukkan perkiraan berat sampah, lalu klik tombol biru "Panggil Truk & Lapor Sampah". Truk terdekat akan melihat laporan Anda di petanya.
                      </p>
                    </div>
                    <div style={{ padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                      <h4 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-primary)", marginBottom: "8px" }}>Mengubah Koordinat Lokasi</h4>
                      <p style={{ fontSize: "13px", color: "var(--color-text-muted)", lineHeight: 1.6 }}>
                        Di bagian atas halaman ini, cukup geser peta dan klik pada titik rumah Anda yang baru. Koordinat akan diperbarui, lalu klik "Simpan Perubahan".
                      </p>
                    </div>
                    <div style={{ padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                      <h4 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-primary)", marginBottom: "8px" }}>Sistem Retribusi & Jarak</h4>
                      <p style={{ fontSize: "13px", color: "var(--color-text-muted)", lineHeight: 1.6 }}>
                        Tagihan bulanan Anda dihitung berdasarkan Jarak Mengemudi Asli dari rumah Anda ke TPA Pusat. Kami menggunakan teknologi OSRM sehingga jaraknya sangat akurat mengikuti jalan raya.
                      </p>
                    </div>
                    <div style={{ padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                      <h4 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-primary)", marginBottom: "8px" }}>Tentang Poin Daur Ulang</h4>
                      <p style={{ fontSize: "13px", color: "var(--color-text-muted)", lineHeight: 1.6 }}>
                        Poin didapat saat membuang sampah, dan bisa dikonversikan menjadi uang. Total poin Anda dan ekuivalen uangnya bisa dilihat di header Dashboard.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "laporan" && (
              <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--color-text-main)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Form Pelaporan Sampah & Request Angkut</span>
                  <span style={{ fontSize: "12px", fontWeight: "bold", padding: "4px 8px", borderRadius: "6px", backgroundColor: getSisaKuota() > 0 ? "#dbeafe" : "#fee2e2", color: getSisaKuota() > 0 ? "#1e3a8a" : "#991b1b" }}>
                    Sisa Kuota Jemput Bulan Ini: {getSisaKuota()}/4
                  </span>
                </h3>
                <div className="grid-2-col">
                  <div>
                    <div className="form-group">
                      <label className="form-label">Jenis Sampah</label>
                      <select className="form-select" value={form.jenis} onChange={e => setForm({ ...form, jenis: e.target.value })}>
                        <option value="Plastik & Kertas">Plastik & Kertas</option>
                        <option value="Organik (Makanan/Daun)">Organik (Makanan/Daun)</option>
                        <option value="Kaca & Logam">Kaca & Logam</option>
                        <option value="Residu / Campuran">Residu / Campuran</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Estimasi Berat (Kg) <span style={{fontSize: '11px', color: '#9ca3af', fontWeight: 'normal'}}>- Opsional</span></label>
                      <input className="form-input" type="number" step="0.1" placeholder="Kosongkan jika hanya ingin memanggil truk" value={form.berat} onChange={e => setForm({ ...form, berat: e.target.value })} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {(() => {
                        const sisaKuota = getSisaKuota();
                        const hasActiveRequest = history.angkut.some(a => a.status === "Menunggu" || a.status === "proses");
                        const isDisabled = loading || statusBulanIni?.status !== "sudah" || hasActiveRequest || sisaKuota === 0;
                        
                        return (
                          <button 
                            disabled={isDisabled}
                            onClick={submitLaporanDanRequest} 
                            className="btn-primary" 
                            style={{ 
                              background: hasActiveRequest ? "#6b7280" : (statusBulanIni?.status === "sudah" ? "#059669" : "#9ca3af"), 
                              borderColor: hasActiveRequest ? "#4b5563" : (statusBulanIni?.status === "sudah" ? "#047857" : "#6b7280"), 
                              cursor: isDisabled ? "not-allowed" : "pointer", 
                              padding: "14px", 
                              opacity: loading ? 0.7 : 1 
                            }}
                          >
                            <div style={{ fontSize: "15px", fontWeight: "700" }}>
                              {loading ? "Memproses..." : hasActiveRequest ? "Truk Penjemputan Sedang Dijadwalkan" : sisaKuota === 0 ? "Kuota Habis Bulan Ini" : (form.berat ? `Panggil Truk & Klaim Poin (+${Math.round(parseFloat(form.berat) * 10)})` : "Panggil Truk Saja (Tanpa Poin)")}
                            </div>
                            {!hasActiveRequest && statusBulanIni?.status !== "sudah" && <div style={{ fontSize: "11px", marginTop: "4px" }}>(Anda Belum Lunas Iuran Bulan Ini)</div>}
                            {statusBulanIni?.status === "sudah" && !hasActiveRequest && sisaKuota > 0 && <div style={{ fontSize: "11px", marginTop: "4px" }}>(Sisa Kuota: {sisaKuota}x)</div>}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                  <div>
                    <h4 style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-text-main)", marginBottom: "12px" }}>💡 Petunjuk Pelaporan</h4>
                    <div style={{ padding: "16px", backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", fontSize: "13px", color: "#166534" }}>
                      <p style={{ marginBottom: "8px" }}><strong>1. Jenis Sampah:</strong> Pastikan Anda memilah sampah sesuai kategori. Plastik dan Organik memiliki nilai jual yang lebih tinggi jika dipisah.</p>
                      <p style={{ marginBottom: "8px" }}><strong>2. Estimasi Berat:</strong> Pengisian berat bersifat opsional. Jika Anda mengisi berat, Admin akan memverifikasinya saat penjemputan untuk pemberian <strong>Eco Poin</strong>.</p>
                      <p style={{ marginBottom: "8px" }}><strong>3. Syarat Penjemputan:</strong> Truk hanya akan menjemput jika Anda sudah melunasi Iuran Retribusi bulan ini.</p>
                      <p><strong>4. Panggil Truk Saja:</strong> Jika Anda hanya ingin truk datang mengambil residu tanpa menabung poin, kosongkan kolom berat.</p>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: "32px", paddingTop: "24px", borderTop: "1px solid #e2e8f0" }}>
                  <h4 style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-text-main)", marginBottom: "12px" }}>Riwayat Penjemputan</h4>
                  <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                            <th style={{ padding: "8px" }}>Tanggal</th>
                            <th style={{ padding: "8px" }}>Truk</th>
                            <th style={{ padding: "8px" }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.angkut.length === 0 && <tr><td colSpan="3" style={{ padding: "12px", textAlign: "center", color: "#9ca3af" }}>Belum ada riwayat</td></tr>}
                          {history.angkut.slice(0).reverse().map(a => (
                            <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "8px" }}>{new Date(a.created_at).toLocaleDateString("id-ID", { day: 'numeric', month: 'short' })}</td>
                              <td style={{ padding: "8px" }}>{a.transporter?.profiles?.name || "-"}</td>
                              <td style={{ padding: "8px" }}>
                                <span style={{
                                  padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: "bold",
                                  backgroundColor: a.status === "selesai" ? "#dcfce7" : a.status === "proses" ? "#fef3c7" : "#e0e7ff",
                                  color: a.status === "selesai" ? "#166534" : a.status === "proses" ? "#92400e" : "#3730a3"
                                }}>
                                  {a.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                </div>
              </div>
            )}

            {/* ── TAB: Pembayaran ── */}
            {activeTab === "pembayaran" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {/* Banner Status Bayar Bulan Ini */}
                <div style={{
                  background: statusBulanIni?.status === "sudah"
                    ? "linear-gradient(135deg,#059669,#047857)"
                    : statusBulanIni?.status === "belum"
                      ? "linear-gradient(135deg,#d97706,#b45309)"
                      : "linear-gradient(135deg,#dc2626,#b91c1c)",
                  borderRadius: "10px",
                  padding: "24px 28px",
                  color: "#fff",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "16px"
                }}>
                  <div>
                    <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Status Retribusi Kebersihan
                    </div>
                    <div style={{ fontSize: "22px", fontWeight: 800 }}>
                      {statusBulanIni ? statusColor(statusBulanIni.status).label : "✗ Belum Bayar Bulan Ini"}
                    </div>
                    <div style={{ fontSize: "12px", opacity: 0.75, marginTop: "6px" }}>
                      {new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
                      {statusBulanIni?.status === "belum" && " — Menunggu konfirmasi Admin"}
                      {statusBulanIni?.status === "sudah" && " — Telah diverifikasi Admin ✓"}
                    </div>
                  </div>
                  {statusBulanIni?.status === "belum" && (
                    <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: "8px", padding: "10px 16px", fontSize: "13px", fontWeight: 600 }}>
                      ⏳ Menunggu Admin
                    </div>
                  )}
                </div>

                {/* Form Bayar (jika belum bayar bulan ini) */}
                {!statusBulanIni && (
                  <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px", color: "var(--color-text-main)" }}>
                      Pembayaran Retribusi Kebersihan Bulanan
                    </h3>
                    <div className="grid-2-col" style={{ marginBottom: "20px" }}>
                      {[
                        { label: "Periode Tagihan", value: new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" }) },
                        { label: "Biaya Dasar", value: "Rp 30.000" },
                        { label: `Ongkos Jarak ke TPA (${jarakKeTpa.toFixed(1)} km)`, value: `Rp ${(Math.round(jarakKeTpa * 2200)).toLocaleString("id-ID")}` },
                        { label: "Total Retribusi", value: `Rp ${totalBiaya.toLocaleString("id-ID")}` },
                      ].map((item, i) => (
                        <div key={i} style={{ padding: "14px 16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>{item.label}</div>
                          <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-main)" }}>{item.value}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "center", backgroundColor: "#f8fafc", padding: "20px", borderRadius: "12px", border: "1px dashed #cbd5e1" }}>
                      <p style={{ margin: 0, color: "var(--color-text-main)", textAlign: "center", fontSize: "14px" }}>Silakan transfer sebesar <strong style={{ fontSize: "16px", color: "var(--color-primary)" }}>Rp {totalBiaya.toLocaleString("id-ID")}</strong> ke Rekening BCA <strong>1234567890</strong> a/n Pengelola Sampah.</p>
                      <div className="form-group" style={{ width: "100%", maxWidth: "300px" }}>
                        <label className="form-label" style={{ textAlign: "center" }}>Upload Bukti Transfer (Opsional)</label>
                        <input type="file" accept="image/*" onChange={(e) => setBuktiFile(e.target.files[0])} className="form-input" style={{ padding: "8px" }} />
                      </div>
                      <button onClick={bayarRetribusi} disabled={payLoading} className="btn-primary" style={{ maxWidth: "300px" }}>
                        {payLoading ? "Memproses..." : "Saya Sudah Transfer"}
                      </button>
                    </div>
                  </div>
                )}

                <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--color-text-main)" }}>
                    Riwayat Pembayaran Retribusi
                  </h3>
                  {history.bayar.length === 0
                    ? <p style={{ color: "var(--color-text-muted)", fontSize: "13px" }}>Belum ada riwayat pembayaran.</p>
                    : <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {history.bayar.map(b => {
                        const sc = statusColor(b.status);
                        return (
                          <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", border: "1px solid #e2e8f0", borderRadius: "8px", backgroundColor: "#fff" }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--color-text-main)" }}>
                                Retribusi {b.tanggal ? new Date(b.tanggal).toLocaleDateString("id-ID", { month: "long", year: "numeric" }) : "-"}
                              </div>
                              <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                                {b.tanggal ? new Date(b.tanggal).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "-"}
                              </div>
                            </div>
                            <span style={{ padding: "5px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, backgroundColor: sc.bg, color: sc.color }}>
                              {sc.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  }
                </div>
              </div>
            )}

            {/* ── TAB: Jadwal Angkut ── */}
            {activeTab === "jadwal" && (
              <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--color-text-main)" }}>Status Antrean Penjemputan Sampah</h3>
                {history.angkut.length === 0
                  ? <p style={{ color: "var(--color-text-muted)", fontSize: "13px" }}>Belum ada pengajuan. Buat request dari menu Laporkan Sampah.</p>
                  : <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {history.angkut.map(a => (
                      <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", border: "1px solid #e2e8f0", borderRadius: "8px", backgroundColor: "#fff" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "14px" }}>Request Penjemputan Sampah</div>
                          <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                            {a.created_at ? new Date(a.created_at).toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "-"}
                          </div>
                        </div>
                        <span style={{ padding: "4px 12px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", backgroundColor: a.status === "selesai" ? "#dcfce7" : a.status === "proses" ? "#dbeafe" : "#fef3c7", color: a.status === "selesai" ? "#16a34a" : a.status === "proses" ? "#2563eb" : "#d97706" }}>
                          {a.status}
                        </span>
                      </div>
                    ))}
                  </div>
                }
              </div>
            )}

            {/* ── TAB: Eco Poin ── */}
            {activeTab === "ecopoin" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {/* Kartu Saldo Poin */}
                <div style={{ background: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)", borderRadius: "12px", padding: "28px", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "12px", opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Total Eco Poin Anda</div>
                    <div style={{ fontSize: "42px", fontWeight: 800, lineHeight: 1 }}>{stats.poin}</div>
                    <div style={{ fontSize: "13px", opacity: 0.7, marginTop: "8px" }}>Poin dari {history.sampah.length} laporan • 1 Kg = 10 Poin</div>
                  </div>
                  <svg style={{ width: 64, height: 64, opacity: 0.25 }} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                </div>

                {/* Progress Level */}
                {(() => {
                  const levels = [
                    { name: "Bersih I", min: 0, max: 100, color: "#6b7280" },
                    { name: "Bersih II", min: 100, max: 500, color: "#059669" },
                    { name: "Bersih III", min: 500, max: 1000, color: "#d97706" },
                    { name: "Si paling Bersih", min: 1000, max: 9999, color: "#7c3aed" },
                  ];
                  const lvl = levels.findLast(l => stats.poin >= l.min) || levels[0];
                  const next = levels[levels.indexOf(lvl) + 1];
                  const progress = next ? Math.min(((stats.poin - lvl.min) / (next.min - lvl.min)) * 100, 100) : 100;
                  return (
                    <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                        <div>
                          <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text-main)" }}>Level Eco Citizen</div>
                          <div style={{ fontSize: "22px", fontWeight: 800, color: lvl.color, marginTop: "2px" }}>{lvl.name}</div>
                        </div>
                        {next && <div style={{ textAlign: "right", fontSize: "12px", color: "var(--color-text-muted)" }}>
                          <div>Level berikut: {next.name}</div>
                          <div style={{ fontWeight: 600 }}>{next.min - stats.poin} poin lagi</div>
                        </div>}
                      </div>
                      <div style={{ background: "#e2e8f0", borderRadius: "999px", height: "12px", overflow: "hidden" }}>
                        <div style={{ width: progress + "%", height: "100%", background: `linear-gradient(90deg, ${lvl.color}, ${next?.color || lvl.color})`, borderRadius: "999px", transition: "width 0.5s ease" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--color-text-muted)", marginTop: "6px" }}>
                        <span>{stats.poin} Poin</span>
                        {next && <span>Target: {next.min} Poin</span>}
                      </div>
                    </div>
                  );
                })()}

                {/* Katalog Tukar Poin */}
                <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text-main)" }}>Katalog Tukar Poin (Redeem)</h3>
                    <div style={{ background: "#7c3aed", color: "#fff", padding: "8px 16px", borderRadius: "8px", fontWeight: 700, fontSize: "14px" }}>
                      Sisa Poin Anda: {currentPoin} Poin
                    </div>
                  </div>
                  <div className="grid-2-col" style={{ marginBottom: "24px" }}>
                    {katalogRedeem.length === 0 ? (
                      <p style={{ color: "var(--color-text-muted)" }}>Belum ada katalog promo yang tersedia.</p>
                    ) : (
                      katalogRedeem.map(item => (
                        <div key={item.id} style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px", background: "#f8fafc" }}>
                          <h4 style={{ margin: 0, fontSize: "15px", color: "var(--color-text-main)" }}>{item.name}</h4>
                          <div style={{ color: "#7c3aed", fontWeight: 700, fontSize: "14px" }}>{item.cost} Poin</div>
                          <button
                            onClick={async () => {
                              if (currentPoin < item.cost) return alert("Poin Anda tidak cukup!");
                              const result = await Swal.fire({
                                title: "Konfirmasi Tukar Poin",
                                text: "Tukar poin dengan " + item.name + "?",
                                icon: "question",
                                showCancelButton: true,
                                confirmButtonColor: "#10b981",
                                cancelButtonColor: "#6b7280",
                                confirmButtonText: "Ya, Tukar",
                                cancelButtonText: "Batal"
                              });
                              if (!result.isConfirmed) return;
                              const { error } = await supabase.from("redeem_poin").insert({ warga_id: wargaData.id, item_name: item.name, points_cost: item.cost });
                              if (error) return alert("Gagal tukar poin: " + error.message);
                              alert("✅ Permintaan tukar poin berhasil dikirim! Menunggu persetujuan Admin.");
                              if (trackingChannel) {
                                trackingChannel.send({ type: 'broadcast', event: 'notif', payload: { role: 'admin', msg: `Permintaan Redeem Poin baru dari ${wargaData.nama}!` } });
                              }
                              refreshHistory(wargaData.id);
                            }}
                            className="btn-primary" style={{ padding: "8px", fontSize: "12px" }}
                          >
                            Tukar Sekarang
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--color-text-main)" }}>Riwayat Tukar Poin</h3>
                  <div className="table-container">
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #e2e8f0", color: "var(--color-text-muted)", textAlign: "left" }}>
                          <th style={{ padding: "10px 12px" }}>Tanggal</th><th style={{ padding: "10px 12px" }}>Item</th><th style={{ padding: "10px 12px" }}>Poin</th><th style={{ padding: "10px 12px" }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {redeemHistory.length === 0
                          ? <tr><td colSpan="4" style={{ padding: "20px", textAlign: "center", color: "var(--color-text-muted)" }}>Belum ada riwayat penukaran.</td></tr>
                          : redeemHistory.map(r => (
                            <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "12px", color: "var(--color-text-muted)" }}>{new Date(r.created_at).toLocaleDateString("id-ID")}</td>
                              <td style={{ padding: "12px", fontWeight: 600 }}>{r.item_name}</td>
                              <td style={{ padding: "12px", color: "#ef4444", fontWeight: 600 }}>-{r.points_cost}</td>
                              <td style={{ padding: "12px" }}>
                                <span style={{ padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", backgroundColor: r.status === "disetujui" ? "#dcfce7" : r.status === "menunggu" ? "#fef3c7" : "#fee2e2", color: r.status === "disetujui" ? "#16a34a" : r.status === "menunggu" ? "#d97706" : "#dc2626" }}>{r.status}</span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Detail Kontribusi */}
                <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                  <h4 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-main)", marginBottom: "14px" }}>Detail Kontribusi Sampah</h4>
                  {history.sampah.length === 0
                    ? <p style={{ color: "var(--color-text-muted)", fontSize: "13px" }}>Belum ada data. Laporkan sampah dari menu Laporkan Sampah!</p>
                    : <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {history.sampah.map((s, idx) => (
                        <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", border: "1px solid #e2e8f0", borderRadius: "8px", backgroundColor: "#fff" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, color: "var(--color-text-muted)" }}>#{idx + 1}</div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: "13px" }}>{s.jenis}</div>
                              <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{s.created_at ? new Date(s.created_at).toLocaleDateString("id-ID") : ""}</div>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                            <span style={{ fontWeight: 700, color: "var(--color-primary)" }}>{s.berat} Kg</span>
                            <span style={{ fontWeight: 800, color: "#7c3aed", fontSize: "13px", background: "#f5f3ff", padding: "2px 10px", borderRadius: "20px" }}>+{s.berat * 10} Poin</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  }
                </div>
              </div>
            )}
        </>
      </main>

      {wargaData && (
        <>
          <button onClick={() => setChatOpen(!chatOpen)} style={{ position: "fixed", bottom: "20px", right: "20px", width: "56px", height: "56px", borderRadius: "28px", backgroundColor: "#10b981", color: "#fff", border: "none", boxShadow: "0 4px 12px rgba(16, 185, 129, 0.4)", cursor: "pointer", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg style={{ width: "24px", height: "24px" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
          </button>
          <ChatWidget
            currentUser={{ id: wargaData.id, name: form.nama }}
            targetUser={{ id: '00000000-0000-0000-0000-000000000000', name: 'Admin' }}
            isOpen={chatOpen}
            onClose={() => setChatOpen(false)}
          />
        </>
      )}
    </div>
  );
}
