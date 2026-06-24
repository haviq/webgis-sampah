import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import Map from "../components/Map";
import TypingLoader from "../components/TypingLoader";
import AccountSettings from "../components/AccountSettings";
import Sidebar from "../components/Sidebar";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import ChatWidget from "../components/ChatWidget";
import gsap from "gsap";
import Swal from "sweetalert2";

export default function Admin() {
  const [user, setUser] = useState({ nama: "Admin", email: "" });
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [financeChartData, setFinanceChartData] = useState([]);
  const [activeTab, setActiveTab] = useState("ringkasan");

  const [stats, setStats] = useState({ tps: 0, Courier: 0, warga: 0, laporan: 0, menunggu: 0 });
  const [liveDrivers, setLiveDrivers] = useState({});
  const [onlineUsers, setOnlineUsers] = useState({});
  const [lastMessages, setLastMessages] = useState({});

  useEffect(() => {
    // Tracking GPS dan Notifikasi
    const channel = supabase.channel('tracking')
      .on('broadcast', { event: 'location' }, (payload) => {
        setLiveDrivers(prev => ({ ...prev, [payload.payload.id]: payload.payload }));
      })
      .on('broadcast', { event: 'notif' }, (payload) => {
        if (payload.payload.role === 'admin') {
          alert("🔔 NOTIFIKASI BARU:\n" + payload.payload.msg);
          fetchAll();
        }
      })
      .subscribe();

    // Tracking Presence (Online Status)
    const presenceChannel = supabase.channel('online_users');
    presenceChannel.on('presence', { event: 'sync' }, () => {
      const state = presenceChannel.presenceState();
      const online = {};
      for (const key in state) {
        if (state[key][0]?.user_id) {
          online[state[key][0].user_id] = true;
        }
      }
      setOnlineUsers(online);
    });
    presenceChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await presenceChannel.track({ user_id: '00000000-0000-0000-0000-000000000000' });
      }
    });

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(presenceChannel);
    }
  }, []);
  const [laporan, setLaporan] = useState([]);
  const [allWarga, setAllWarga] = useState([]);
  const [pembayaran, setPembayaran] = useState([]);
  const [pengangkutan, setPengangkutan] = useState([]);
  const [CourierList, setCourierList] = useState([]);
  const [redeemList, setRedeemList] = useState([]);
  const [katalogRedeem, setKatalogRedeem] = useState([]);
  const [ecopoinData, setEcopoinData] = useState([]); // [{nama, total_berat, poin, warga_id}]
  const [pieData, setPieData] = useState([]);
  const [transaksiCourier, setTransaksiCourier] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chatTarget, setChatTarget] = useState(null);

  // Modal State for CRUD Edit
  const [editModal, setEditModal] = useState({ open: false, type: "", data: null });
  const [buktiModal, setBuktiModal] = useState({ open: false, url: "" });

  const [appSettings, setAppSettings] = useState({
    baseFee: 30000,
    feePerKm: 2200,
    tpaLat: -7.8286,
    tpaLng: 110.3789
  });
  const [settingsSaving, setSettingsSaving] = useState(false);

  const fetchAll = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      if (!isBackground) {
        try {
          const { data: sData, error: sErr } = await supabase.storage.from("uploads").download("settings.json");
          if (!sErr && sData) {
            const text = await sData.text();
            const parsed = JSON.parse(text);
            setAppSettings({
              baseFee: parsed.baseFee !== undefined ? Number(parsed.baseFee) : 30000,
              feePerKm: parsed.feePerKm !== undefined ? Number(parsed.feePerKm) : 2200,
              tpaLat: parsed.tpaLat !== undefined ? Number(parsed.tpaLat) : -7.8286,
              tpaLng: parsed.tpaLng !== undefined ? Number(parsed.tpaLng) : 110.3789
            });
          }
        } catch (err) {
          console.warn("Failed to load settings:", err);
        }
      }

      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", authUser.id).maybeSingle();
        setUser({ id: authUser.id, nama: profile?.name || "Admin", email: authUser.email, avatar_url: profile?.avatar_url });
      }

      const [wRes, tRes, sRes, bayarRes, angkutRes, rRes, katRes, msgRes, tcRes] = await Promise.all([
        supabase.from("warga").select("id, nama, alamat, location, pembayaran(status)"),
        supabase.from("profiles").select("id, name").eq("role", "transporter"),
        supabase.from("sampah").select("id, warga_id, jenis, berat, created_at, warga(nama, alamat)"),
        supabase.from("pembayaran").select("id, warga_id, status, tanggal, bukti_url, warga(nama)").order("created_at", { ascending: false }),
        supabase.from("pengangkutan").select("id, warga_id, transporter_id, status, created_at, bukti_url, warga(nama)"),
        supabase.from("redeem_poin").select("*, warga(nama)").order("created_at", { ascending: false }),
        supabase.from("katalog_redeem").select("*").order("cost", { ascending: true }),
        supabase.from("chat_messages").select("sender_id, receiver_id, created_at"),
        supabase.from("transaksi_courier").select("*, profiles(name)").order("tanggal", { ascending: false })
      ]);

      setAllWarga(wRes.data || []);
      setLaporan(sRes.data || []);
      setPembayaran(bayarRes.data || []);
      setPengangkutan(angkutRes.data || []);
      setCourierList(tRes.data || []);
      setRedeemList(rRes.data || []);
      setKatalogRedeem(katRes.data || []);
      setTransaksiCourier(tcRes?.data || []);

      // Hitung last message per user
      const lastMsgMap = {};
      (msgRes.data || []).forEach(m => {
        const otherId = m.sender_id === '00000000-0000-0000-0000-000000000000' ? m.receiver_id : m.sender_id;
        const time = new Date(m.created_at).getTime();
        if (!lastMsgMap[otherId] || time > lastMsgMap[otherId]) {
          lastMsgMap[otherId] = time;
        }
      });
      setLastMessages(lastMsgMap);

      // Build eco poin ranking from sampah per warga
      const poinMap = {};
      const sampahData = sRes.data || [];
      const tipeMap = {};
      sampahData.forEach(s => {
        if (!poinMap[s.warga_id]) poinMap[s.warga_id] = { nama: s.warga?.nama || "Anonim", total_berat: 0, count: 0 };
        poinMap[s.warga_id].total_berat += (s.berat || 0);
        poinMap[s.warga_id].count++;
        tipeMap[s.jenis] = (tipeMap[s.jenis] || 0) + (s.berat || 0);
      });
      const poinList = Object.entries(poinMap).map(([warga_id, d]) => ({
        warga_id,
        nama: d.nama,
        total_berat: d.total_berat,
        poin: Math.round(d.total_berat * 10),
        count: d.count,
      })).sort((a, b) => b.poin - a.poin);
      setEcopoinData(poinList);
      setPieData(Object.keys(tipeMap).map(k => ({ name: k, value: tipeMap[k] })));

      // Build chart data
      const groupedByDate = {};
      sampahData.forEach(s => {
        if (!s.created_at) return;
        const rawDate = s.created_at.split('T')[0];
        if (!groupedByDate[rawDate]) {
          groupedByDate[rawDate] = { rawDate, laporan: 0, berat: 0 };
        }
        groupedByDate[rawDate].laporan += 1;
        groupedByDate[rawDate].berat += (s.berat || 0);
      });
      const cData = Object.values(groupedByDate)
        .sort((a, b) => a.rawDate.localeCompare(b.rawDate))
        .map(d => ({
          date: new Date(d.rawDate).toLocaleDateString("id-ID", { day: 'numeric', month: 'short' }),
          "Total Laporan": d.laporan,
          "Total Berat (Kg)": d.berat
        }));
      setChartData(cData);

      // Build finance chart data (Pemasukan dari pembayaran retribusi yang 'sudah' lunas)
      const groupedFinanceByDate = {};
      const pembayaranList = bayarRes.data || [];
      pembayaranList.forEach(p => {
        if (!p.tanggal || p.status !== "sudah") return;
        const rawDate = p.tanggal; // format: YYYY-MM-DD
        if (!groupedFinanceByDate[rawDate]) {
          groupedFinanceByDate[rawDate] = { rawDate, nominal: 0 };
        }
        groupedFinanceByDate[rawDate].nominal += (p.jumlah || 0);
      });
      const fData = Object.values(groupedFinanceByDate)
        .sort((a, b) => a.rawDate.localeCompare(b.rawDate))
        .map(d => ({
          date: new Date(d.rawDate).toLocaleDateString("id-ID", { day: 'numeric', month: 'short' }),
          "Pemasukan (Rp)": d.nominal
        }));
      setFinanceChartData(fData);

      setStats({
        tps: wRes.data.length,
        Courier: tRes.data?.length || 0,
        warga: wRes.data.length,
        laporan: sampahData.length,
        menunggu: bayarRes.data?.filter(b => b.status === "belum").length || 0,
      });
    } catch (err) {
      console.error(err);
    } finally {
      if (!isBackground) {
        await new Promise(res => setTimeout(res, 1500));
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => fetchAll(true), 3000);
    return () => clearInterval(interval);
  }, []);

  const verifikasiPembayaran = async (id) => {
    const { error } = await supabase.from("pembayaran").update({ status: "sudah" }).eq("id", id);
    if (error) return alert("Gagal verifikasi: " + error.message);
    await fetchAll();
  };

  const tolakPembayaran = async (id) => {
    const result = await Swal.fire({
      title: "Tolak Pembayaran?",
      text: "Data akan dihapus agar warga bisa kirim ulang.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Ya, Tolak",
      cancelButtonText: "Batal"
    });
    if (!result.isConfirmed) return;
    const { error } = await supabase.from("pembayaran").delete().eq("id", id);
    if (error) return alert("Gagal tolak: " + error.message);
    await fetchCouriers();
  };

  // GSAP Animations
  useEffect(() => {
    if (!loading) {
      gsap.from(".stat-card", { duration: 0.6, y: 30, opacity: 0, stagger: 0.1, ease: "power2.out" });
      gsap.from(".map-container-wrapper", { duration: 0.8, y: 40, opacity: 0, delay: 0.3, ease: "power2.out" });
    }
  }, [loading, activeTab]);

  const hapusData = async (table, id) => {
    const result = await Swal.fire({
      title: "Hapus Data?",
      text: "Yakin ingin menghapus data ini secara permanen?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal"
    });
    if (!result.isConfirmed) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return alert("Gagal hapus: " + error.message);
    await fetchAll();
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    const { type, data } = editModal;
    let table = "";
    let payload = {};
    if (type === "warga") {
      table = "warga";
      payload = { nama: data.nama, alamat: data.alamat };
    } else if (type === "sampah") {
      table = "sampah";
      payload = { jenis: data.jenis, berat: parseFloat(data.berat) };
    } else if (type === "pengangkutan") {
      table = "pengangkutan";
      payload = { transporter_id: data.transporter_id || null, status: data.status };
    } else if (type === "Courier") {
      table = "profiles";
      payload = { name: data.name };
    }

    const { error } = await supabase.from(table).update(payload).eq("id", data.id);
    if (error) {
      alert("Gagal update: " + error.message);
    } else {
      alert("Data berhasil diperbarui!");
      setEditModal({ open: false, type: "", data: null });
      await fetchAll();
      if (type === "warga") {
        await supabase.from("profiles").update({ name: data.nama }).eq("id", data.id);
      }
    }
  };

  const updateStatus = async (table, id, status) => {
    const { error } = await supabase.from(table).update({ status }).eq("id", id);
    if (error) return alert("Gagal update: " + error.message);
    await fetchAll();
  };

  const downloadCSV = (content, filename) => {
    const blob = new Blob(["\uFEFF" + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const triggerExport = async ({ selectedReports, format }) => {
    Swal.fire({
      title: 'Mempersiapkan data...',
      text: 'Mohon tunggu sebentar.',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      if (format === 'csv') {
        if (selectedReports.sampah) {
          let csv = "ID,Warga,Alamat,Jenis Sampah,Berat (Kg),Tanggal\n";
          laporan.forEach(r => {
            csv += `${r.id},"${r.warga?.nama || ''}","${r.warga?.alamat || ''}","${r.jenis}",${r.berat},"${new Date(r.created_at).toLocaleDateString('id-ID')}"\n`;
          });
          downloadCSV(csv, `Laporan_Sampah_${new Date().toISOString().split("T")[0]}.csv`);
        }
        if (selectedReports.retribusi) {
          let csv = "ID,Tanggal,Warga,Status,Jumlah (Rp)\n";
          pembayaran.forEach(r => {
            csv += `${r.id},"${new Date(r.tanggal).toLocaleDateString('id-ID')}","${r.warga?.nama || ''}","${r.status === 'sudah' ? 'Lunas' : 'Belum/Menunggu'}",${r.jumlah || 0}\n`;
          });
          downloadCSV(csv, `Laporan_Retribusi_${new Date().toISOString().split("T")[0]}.csv`);
        }
        if (selectedReports.pengangkutan) {
          let csv = "ID,Tanggal,Warga,Driver/Courier,Status\n";
          pengangkutan.forEach(r => {
            const driverName = CourierList.find(t => t.id === r.transporter_id)?.name || "Belum Ditugaskan";
            csv += `${r.id},"${new Date(r.created_at).toLocaleDateString('id-ID')}","${r.warga?.nama || ''}","${driverName}","${r.status}"\n`;
          });
          downloadCSV(csv, `Laporan_Pengangkutan_${new Date().toISOString().split("T")[0]}.csv`);
        }
        if (selectedReports.courier) {
          let csv = "ID,Tanggal,Courier,Keterangan,Jumlah (Rp)\n";
          transaksiCourier.forEach(r => {
            csv += `${r.id},"${new Date(r.tanggal).toLocaleDateString('id-ID')}","${r.profiles?.name || ''}","${r.keterangan || ''}",${r.jumlah || 0}\n`;
          });
          downloadCSV(csv, `Laporan_Pendapatan_Courier_${new Date().toISOString().split("T")[0]}.csv`);
        }
        Swal.fire({ icon: 'success', title: 'Export Berhasil', text: 'Semua file Excel/CSV telah terunduh.' });
      } else {
        const printDiv = document.createElement("div");
        printDiv.style.padding = "40px 30px";
        printDiv.style.fontFamily = "'Helvetica Neue', Helvetica, Arial, sans-serif";
        printDiv.style.color = "#333";
        printDiv.style.background = "#fff";
        printDiv.style.width = "800px";
        printDiv.style.position = "absolute";
        printDiv.style.left = "-9999px";
        printDiv.style.top = "-9999px";

        let html = `
          <div style="border-bottom: 3px double #10b981; padding-bottom: 15px; margin-bottom: 25px; text-align: center;">
            <h1 style="font-size: 24px; color: #047857; margin: 0; font-weight: 800;">LAPORAN EKSEKUTIF KELOLA SAMPAH & RETRIBUSI</h1>
            <p style="font-size: 13px; color: #666; margin: 5px 0 0 0; font-style: italic;">Sistem WebGIS Sirkular Ekonomi - KelolaSampah.id</p>
            <p style="font-size: 11px; color: #999; margin: 3px 0 0 0;">Tanggal Cetak: ${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          
          <div style="display: flex; gap: 15px; margin-bottom: 25px;">
            <div style="flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #f8fafc; text-align: center;">
              <div style="font-size: 11px; color: #64748b; font-weight: 600;">TOTAL PEMASUKAN</div>
              <div style="font-size: 18px; color: #10b981; font-weight: bold; margin-top: 4px;">Rp ${pembayaran.filter(p => p.status === "sudah").reduce((acc, p) => acc + (p.jumlah || 0), 0).toLocaleString("id-ID")}</div>
            </div>
            <div style="flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #f8fafc; text-align: center;">
              <div style="font-size: 11px; color: #64748b; font-weight: 600;">TOTAL PENGELUARAN COURIER</div>
              <div style="font-size: 18px; color: #ef4444; font-weight: bold; margin-top: 4px;">Rp ${transaksiCourier.reduce((acc, t) => acc + (t.jumlah || 0), 0).toLocaleString("id-ID")}</div>
            </div>
            <div style="flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #f8fafc; text-align: center;">
              <div style="font-size: 11px; color: #64748b; font-weight: 600;">SALDO BERSIH</div>
              <div style="font-size: 18px; color: #3b82f6; font-weight: bold; margin-top: 4px;">Rp ${(pembayaran.filter(p => p.status === "sudah").reduce((acc, p) => acc + (p.jumlah || 0), 0) - transaksiCourier.reduce((acc, t) => acc + (t.jumlah || 0), 0)).toLocaleString("id-ID")}</div>
            </div>
          </div>
        `;

        if (selectedReports.sampah) {
          html += `
            <div style="margin-bottom: 30px;">
              <h2 style="font-size: 15px; color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 12px; font-weight: 700; display: flex; justify-content: space-between;">
                <span>1. Laporan Penumpukan Sampah</span>
                <span style="font-size: 12px; color: #6b7280; font-weight: normal;">Total: ${laporan.length} Laporan</span>
              </h2>
              <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
                <thead>
                  <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1;">
                    <th style="padding: 8px; font-weight: 600;">Warga</th>
                    <th style="padding: 8px; font-weight: 600;">Tanggal</th>
                    <th style="padding: 8px; font-weight: 600;">Lokasi</th>
                    <th style="padding: 8px; font-weight: 600;">Jenis Sampah</th>
                    <th style="padding: 8px; font-weight: 600; text-align: right;">Berat</th>
                  </tr>
                </thead>
                <tbody>
                  ${laporan.length === 0 ? `<tr><td colspan="5" style="padding: 10px; text-align: center; color: #999;">Belum ada data</td></tr>` :
              laporan.map(l => `
                      <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 8px; font-weight: 600;">${l.warga?.nama || "Anonim"}</td>
                        <td style="padding: 8px;">${new Date(l.created_at).toLocaleDateString('id-ID')}</td>
                        <td style="padding: 8px; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${l.warga?.alamat || '-'}</td>
                        <td style="padding: 8px;"><span style="background: #ecfdf5; color: #059669; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;">${l.jenis}</span></td>
                        <td style="padding: 8px; text-align: right; font-weight: bold;">${l.berat} Kg</td>
                      </tr>
                    `).join('')
            }
                </tbody>
              </table>
            </div>
          `;
        }

        if (selectedReports.retribusi) {
          html += `
            <div style="margin-bottom: 30px;">
              <h2 style="font-size: 15px; color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 12px; font-weight: 700; display: flex; justify-content: space-between;">
                <span>2. Laporan Pembayaran Retribusi</span>
                <span style="font-size: 12px; color: #6b7280; font-weight: normal;">Total Transaksi: ${pembayaran.length}</span>
              </h2>
              <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
                <thead>
                  <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1;">
                    <th style="padding: 8px; font-weight: 600;">Tanggal</th>
                    <th style="padding: 8px; font-weight: 600;">Warga</th>
                    <th style="padding: 8px; font-weight: 600;">Status</th>
                    <th style="padding: 8px; font-weight: 600; text-align: right;">Jumlah (Rp)</th>
                  </tr>
                </thead>
                <tbody>
                  ${pembayaran.length === 0 ? `<tr><td colspan="4" style="padding: 10px; text-align: center; color: #999;">Belum ada data</td></tr>` :
              pembayaran.map(p => `
                      <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 8px;">${new Date(p.tanggal).toLocaleDateString('id-ID')}</td>
                        <td style="padding: 8px; font-weight: 600;">${p.warga?.nama || "Anonim"}</td>
                        <td style="padding: 8px;">
                          <span style="background: ${p.status === 'sudah' ? '#dcfce7' : '#fef3c7'}; color: ${p.status === 'sudah' ? '#16a34a' : '#d97706'}; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;">
                            ${p.status === 'sudah' ? 'LUNAS' : 'PENDING'}
                          </span>
                        </td>
                        <td style="padding: 8px; text-align: right; font-weight: bold; color: #10b981;">+ Rp ${(p.jumlah || 0).toLocaleString("id-ID")}</td>
                      </tr>
                    `).join('')
            }
                </tbody>
              </table>
            </div>
          `;
        }

        if (selectedReports.pengangkutan) {
          html += `
            <div style="margin-bottom: 30px;">
              <h2 style="font-size: 15px; color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 12px; font-weight: 700; display: flex; justify-content: space-between;">
                <span>3. Laporan Pengangkutan Sampah</span>
                <span style="font-size: 12px; color: #6b7280; font-weight: normal;">Total Pengangkutan: ${pengangkutan.length}</span>
              </h2>
              <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
                <thead>
                  <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1;">
                    <th style="padding: 8px; font-weight: 600;">Tanggal</th>
                    <th style="padding: 8px; font-weight: 600;">Warga</th>
                    <th style="padding: 8px; font-weight: 600;">Driver/Courier</th>
                    <th style="padding: 8px; font-weight: 600;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${pengangkutan.length === 0 ? `<tr><td colspan="4" style="padding: 10px; text-align: center; color: #999;">Belum ada data</td></tr>` :
              pengangkutan.map(p => {
                const driverName = CourierList.find(t => t.id === p.transporter_id)?.name || "Belum Ditugaskan";
                return `
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                          <td style="padding: 8px;">${new Date(p.created_at).toLocaleDateString('id-ID')}</td>
                          <td style="padding: 8px; font-weight: 600;">${p.warga?.nama || "Anonim"}</td>
                          <td style="padding: 8px;">${driverName}</td>
                          <td style="padding: 8px;">
                            <span style="background: ${p.status === 'selesai' ? '#dcfce7' : p.status === 'proses' ? '#dbeafe' : '#fef3c7'}; color: ${p.status === 'selesai' ? '#16a34a' : p.status === 'proses' ? '#2563eb' : '#d97706'}; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px; text-transform: uppercase;">
                              ${p.status}
                            </span>
                          </td>
                        </tr>
                      `;
              }).join('')
            }
                </tbody>
              </table>
            </div>
          `;
        }

        if (selectedReports.courier) {
          html += `
            <div style="margin-bottom: 30px;">
              <h2 style="font-size: 15px; color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 12px; font-weight: 700; display: flex; justify-content: space-between;">
                <span>4. Laporan Pendapatan / Transaksi Courier</span>
                <span style="font-size: 12px; color: #6b7280; font-weight: normal;">Total Transaksi: ${transaksiCourier.length}</span>
              </h2>
              <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
                <thead>
                  <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1;">
                    <th style="padding: 8px; font-weight: 600;">Tanggal</th>
                    <th style="padding: 8px; font-weight: 600;">Nama Courier</th>
                    <th style="padding: 8px; font-weight: 600;">Keterangan</th>
                    <th style="padding: 8px; font-weight: 600; text-align: right;">Jumlah Pendapatan (Rp)</th>
                  </tr>
                </thead>
                <tbody>
                  ${transaksiCourier.length === 0 ? `<tr><td colspan="4" style="padding: 10px; text-align: center; color: #999;">Belum ada data</td></tr>` :
              transaksiCourier.map(t => `
                      <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 8px;">${new Date(t.tanggal).toLocaleDateString('id-ID')}</td>
                        <td style="padding: 8px; font-weight: 600;">${t.profiles?.name || "Anonim"}</td>
                        <td style="padding: 8px;">${t.keterangan || "-"}</td>
                        <td style="padding: 8px; text-align: right; font-weight: bold; color: #ef4444;">- Rp ${(t.jumlah || 0).toLocaleString("id-ID")}</td>
                      </tr>
                    `).join('')
            }
                </tbody>
              </table>
            </div>
          `;
        }

        printDiv.innerHTML = html;
        document.body.appendChild(printDiv);

        html2canvas(printDiv, { scale: 2, backgroundColor: "#ffffff" }).then((canvas) => {
          const imgData = canvas.toDataURL("image/png");
          const pdf = new jsPDF("p", "mm", "a4");
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

          let heightLeft = pdfHeight;
          let position = 0;
          const pageHeight = pdf.internal.pageSize.getHeight();

          pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
          heightLeft -= pageHeight;

          while (heightLeft >= 0) {
            position = heightLeft - pdfHeight;
            pdf.addPage();
            pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
            heightLeft -= pageHeight;
          }

          pdf.save(`Laporan_Terpadu_WebGIS_${new Date().toISOString().split("T")[0]}.pdf`);
          document.body.removeChild(printDiv);
          Swal.close();
          Swal.fire({ icon: 'success', title: 'Export Berhasil', text: 'File Laporan PDF telah diunduh.' });
        }).catch(err => {
          console.error(err);
          Swal.fire({ icon: 'error', title: 'Export Gagal', text: err.message });
        });
      }
    } catch (e) {
      console.error(e);
      Swal.fire({ icon: 'error', title: 'Terjadi Kesalahan', text: e.message });
    }
  };

  const openExportDialog = () => {
    Swal.fire({
      title: 'Export Laporan Terpadu',
      html: `
        <div style="text-align: left; font-size: 14px;">
          <p style="margin-bottom: 12px; color: var(--color-text-muted);">Pilih jenis laporan yang ingin diexport:</p>
          <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="chk-sampah" checked style="width: 16px; height: 16px;" />
              Laporan Sampah (Warga)
            </label>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="chk-retribusi" checked style="width: 16px; height: 16px;" />
              Pembayaran Retribusi (Warga)
            </label>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="chk-pengangkutan" checked style="width: 16px; height: 16px;" />
              Pengangkutan Sampah (Log)
            </label>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="chk-courier" checked style="width: 16px; height: 16px;" />
              Pendapatan / Transaksi Courier
            </label>
          </div>
          <p style="margin-bottom: 8px; color: var(--color-text-muted);">Pilih Format Dokumen:</p>
          <div style="display: flex; gap: 16px;">
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
              <input type="radio" name="export-format" value="pdf" checked style="width: 16px; height: 16px;" />
              PDF (Laporan Resmi)
            </label>
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
              <input type="radio" name="export-format" value="csv" style="width: 16px; height: 16px;" />
              Excel / CSV (Data Tabel)
            </label>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Export Sekarang',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#10b981',
      preConfirm: () => {
        const sampah = document.getElementById('chk-sampah').checked;
        const retribusi = document.getElementById('chk-retribusi').checked;
        const pengangkutan = document.getElementById('chk-pengangkutan').checked;
        const courier = document.getElementById('chk-courier').checked;
        const format = document.querySelector('input[name="export-format"]:checked').value;

        if (!sampah && !retribusi && !pengangkutan && !courier) {
          Swal.showValidationMessage('Silakan pilih minimal satu laporan!');
          return false;
        }

        return {
          selectedReports: { sampah, retribusi, pengangkutan, courier },
          format
        };
      }
    }).then((result) => {
      if (result.isConfirmed) {
        triggerExport(result.value);
      }
    });
  };

  const statusColor = (s) => {
    if (s === "sudah") return { bg: "#dcfce7", color: "#16a34a", label: "Lunas" };
    if (s === "belum") return { bg: "#fef3c7", color: "#d97706", label: "Menunggu" };
    return { bg: "#fee2e2", color: "#dc2626", label: "Belum" };
  };

  const getLevelLabel = (poin) => {
    if (poin >= 1000) return { label: "Si paling Bersih", color: "#7c3aed" };
    if (poin >= 500) return { label: "Bersih III", color: "#d97706" };
    if (poin >= 100) return { label: "Bersih II", color: "#059669" };
    return { label: "Bersih I", color: "#6b7280" };
  };

  const menuItems = [
    {
      id: "ringkasan", label: "Ringkasan",
      icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
    },
    {
      id: "titiktps", label: "Titik TPS",
      icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
    },
    {
      id: "pembayaran", label: "Verifikasi Bayar",
      icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
    },
    {
      id: "laporankeuangan", label: "Laporan Keuangan",
      icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    },
    {
      id: "ecopoin", label: "Eco Poin",
      icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
    },
    {
      id: "Courier", label: "Courier",
      icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h4m-6 0a1 1 0 001-1m-6 0H9" /></svg>
    },
    {
      id: "datawarga", label: "Data Warga",
      icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M16 7a4 4 0 11-8 0 4 4 0 018 0zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
    },
    {
      id: "dataCourier", label: "Data Courier",
      icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
    },
    {
      id: "manajemenredeem", label: "Manajemen Redeem",
      icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    },
    {
      id: "chat", label: "Pusat Bantuan (Chat)",
      icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
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
      <Sidebar user={user} role="admin" activeTab={activeTab} setActiveTab={setActiveTab} isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} menuItems={menuItems} />
      <main className="main-content">
        <div className="dashboard-header">
          <div className="welcome-section">
            <h1>Selamat Datang, {user.nama}</h1>
            <p>Kelola data spasial, verifikasi pembayaran, dan pantau eco poin warga.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button onClick={fetchAll} className="btn-primary" style={{ width: "auto", padding: "8px 16px", fontSize: "13px", gap: "6px" }}>
              <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89" /></svg>
              Refresh
            </button>
            <span className="badge-role">ADMIN PANEL</span>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px", color: "var(--color-text-muted)" }}>Memuat data...</div>
        ) : (
          <>
            {/* ── TAB: Ringkasan ── */}
            {activeTab === "ringkasan" && (
              <>
                <div id="pdf-content">
                  <div className="dashboard-grid">
                    <div className="stat-card">
                      <div className="stat-icon-wrapper">
                        <span className="stat-title">TPS Terdaftar</span>
                        <svg className="stat-icon-svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                      </div>
                      <div className="stat-value">{stats.tps} Titik</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon-wrapper">
                        <span className="stat-title">Armada Courier</span>
                        <svg className="stat-icon-svg" style={{ color: "#3b82f6" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                      </div>
                      <div className="stat-value" style={{ color: "#3b82f6" }}>{stats.Courier} Akun</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon-wrapper">
                        <span className="stat-title">Eco Citizen Aktif</span>
                        <svg className="stat-icon-svg" style={{ color: "#f59e0b" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M16 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                      </div>
                      <div className="stat-value" style={{ color: "#f59e0b" }}>{stats.warga} Warga</div>
                    </div>
                    <div className="stat-card" style={{ cursor: "pointer", borderColor: stats.menunggu > 0 ? "#f59e0b" : "#e2e8f0" }} onClick={() => setActiveTab("pembayaran")}>
                      <div className="stat-icon-wrapper">
                        <span className="stat-title">Menunggu Verifikasi</span>
                        <svg className="stat-icon-svg" style={{ color: stats.menunggu > 0 ? "#d97706" : "#dc2626" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                      </div>
                      <div className="stat-value" style={{ color: stats.menunggu > 0 ? "#d97706" : "var(--color-text-main)" }}>
                        {stats.menunggu} {stats.menunggu > 0 ? "⏳ Perlu Verifikasi" : "Pembayaran"}
                      </div>
                    </div>
                  </div>

                  <div className="map-container-wrapper" style={{ height: "350px", display: "flex", flexDirection: "column" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px" }}>Tren Pemasukan Retribusi Warga</h3>
                    <div style={{ flex: 1, minHeight: 0 }}>
                      {financeChartData.length === 0 ? (
                        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-muted)", fontSize: "13px" }}>Belum ada data pemasukan retribusi.</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={financeChartData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                            <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} dx={-10} tickFormatter={(v) => `Rp ${v.toLocaleString("id-ID")}`} />
                            <Tooltip
                              contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)", fontSize: "12px" }}
                              itemStyle={{ fontWeight: 600 }}
                              formatter={(value) => [`Rp ${value.toLocaleString("id-ID")}`, "Pemasukan"]}
                            />
                            <Line type="monotone" dataKey="Pemasukan (Rp)" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  <div className="map-container-wrapper" style={{ height: "350px", display: "flex", flexDirection: "column" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px" }}>Tren Laporan & Volume Sampah Masuk</h3>
                    <div style={{ flex: 1, minHeight: 0 }}>
                      {chartData.length === 0 ? (
                        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-muted)", fontSize: "13px" }}>Belum ada data untuk ditampilkan.</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                            <YAxis yAxisId="left" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} dx={-10} />
                            <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} dx={10} />
                            <Tooltip
                              contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)", fontSize: "12px" }}
                              itemStyle={{ fontWeight: 600 }}
                            />
                            <Line yAxisId="left" type="monotone" dataKey="Total Berat (Kg)" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                            <Line yAxisId="right" type="monotone" dataKey="Total Laporan" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  <div className="map-container-wrapper" style={{ height: "350px", display: "flex", flexDirection: "column" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px" }}>Komposisi Jenis Sampah</h3>
                    <div style={{ flex: 1, minHeight: 0 }}>
                      {pieData.length === 0 ? (
                        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-muted)", fontSize: "13px" }}>Belum ada data komposisi.</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} outerRadius={100} fill="#8884d8" dataKey="value">
                              {pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444'][index % 5]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    {/* Leaderboard Top 5 Warga */}
                    <div className="table-container" style={{ flex: "1 1 300px" }}>
                      <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--color-text-main)", display: "flex", alignItems: "center", gap: "8px" }}>
                        🏆 Klasemen Top 5 Warga (Eco Poin)
                      </h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {[...allWarga]
                          .map(w => ({
                            ...w,
                            totalPoin: (w.sampah || []).reduce((acc, s) => acc + (parseFloat(s.berat) * 10), 0) - (w.redeem_poin?.filter(r => r.status !== 'ditolak').reduce((acc, r) => acc + r.points_cost, 0) || 0)
                          }))
                          .filter(w => w.totalPoin > 0)
                          .sort((a, b) => b.totalPoin - a.totalPoin)
                          .slice(0, 5)
                          .map((w, index) => (
                            <div key={w.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px", background: index === 0 ? "linear-gradient(to right, #fef08a, #fef9c3)" : "#f8fafc", borderRadius: "8px", border: index === 0 ? "1px solid #fde047" : "1px solid #e2e8f0" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                <div style={{ width: "28px", height: "28px", borderRadius: "14px", background: index === 0 ? "#eab308" : index === 1 ? "#94a3b8" : index === 2 ? "#b45309" : "#cbd5e1", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "13px" }}>
                                  {index + 1}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--color-text-main)" }}>{w.nama}</div>
                                  <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{getLevelLabel(w.totalPoin).label}</div>
                                </div>
                              </div>
                              <div style={{ fontWeight: 800, color: index === 0 ? "#854d0e" : "#7c3aed", fontSize: "15px" }}>
                                {w.totalPoin} Poin
                              </div>
                            </div>
                          ))}
                        {[...allWarga].filter(w => (w.sampah || []).length > 0).length === 0 && (
                          <div style={{ padding: "20px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "13px" }}>Belum ada data poin warga.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text-main)" }}>Laporan Penumpukan Sampah Masuk (Warga)</h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={openExportDialog} className="btn-primary" style={{ width: "auto", padding: "8px 16px", fontSize: "13px", gap: "8px", background: "#10b981", borderColor: "#059669" }}>
                      📥 Export Multi-Laporan (PDF/Excel)
                    </button>
                  </div>
                </div>

                <div className="map-container-wrapper">
                  <div className="table-container">
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #e2e8f0", color: "var(--color-text-muted)", textAlign: "left" }}>
                          <th style={{ padding: "10px 12px" }}>Warga</th>
                          <th style={{ padding: "10px 12px" }}>Tanggal</th>
                          <th style={{ padding: "10px 12px" }}>Lokasi</th>
                          <th style={{ padding: "10px 12px" }}>Jenis</th>
                          <th style={{ padding: "10px 12px" }}>Berat</th>
                          <th style={{ padding: "10px 12px" }}>Poin</th>
                          <th style={{ padding: "10px 12px" }}>Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {laporan.length === 0
                          ? <tr><td colSpan="7" style={{ padding: "20px", textAlign: "center", color: "var(--color-text-muted)" }}>Belum ada laporan sampah masuk.</td></tr>
                          : laporan.map(l => (
                            <tr key={l.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "12px", fontWeight: 600 }}>{l.warga?.nama || "Anonim"}</td>
                              <td style={{ padding: "12px", color: "var(--color-text-muted)" }}>{l.created_at ? new Date(l.created_at).toLocaleDateString("id-ID") : "-"}</td>
                              <td style={{ padding: "12px", color: "var(--color-text-muted)", fontSize: "12px" }}>{l.warga?.alamat || "-"}</td>
                              <td style={{ padding: "12px" }}><span style={{ padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, backgroundColor: "#ecfdf5", color: "#059669" }}>{l.jenis}</span></td>
                              <td style={{ padding: "12px", fontWeight: 700 }}>{l.berat} Kg</td>
                              <td style={{ padding: "12px", fontWeight: 700, color: "#7c3aed" }}>+{l.berat * 10} Poin</td>
                              <td style={{ padding: "12px", display: "flex", gap: "6px" }}>
                                <button onClick={() => setEditModal({ open: true, type: "sampah", data: l })} className="btn-primary" style={{ padding: "4px 10px", fontSize: "11px", width: "auto", background: "#3b82f6", borderColor: "#2563eb" }}>Edit</button>
                                <button onClick={() => hapusData("sampah", l.id)} className="btn-logout" style={{ padding: "4px 10px", fontSize: "11px" }}>Hapus</button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="map-container-wrapper">
                  <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px" }}>Peta Spasial TPS & Wilayah Pengelolaan</h3>
                  <Map data={allWarga} liveDrivers={Object.values(liveDrivers)} />
                </div>
              </>
            )}

            {/* ── TAB: Titik TPS / Peta ── */}
            {activeTab === "titiktps" && (
              <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700 }}>Peta Sebaran Titik Rumah Warga</h3>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {[
                      { label: "Semua: " + allWarga.length, bg: "#f1f5f9", color: "var(--color-text-muted)" },
                      { label: "Sudah Bayar: " + allWarga.filter(w => (w.pembayaran || []).some(p => p.status === "sudah")).length, bg: "#ecfdf5", color: "#059669" },
                      { label: "Menunggu: " + allWarga.filter(w => (w.pembayaran || []).some(p => p.status === "belum")).length, bg: "#fef3c7", color: "#d97706" },
                      { label: "Belum Bayar: " + allWarga.filter(w => !(w.pembayaran || []).some(p => ["sudah", "belum"].includes(p.status))).length, bg: "#fef2f2", color: "#dc2626" },
                    ].map((item, i) => (
                      <span key={i} style={{ padding: "4px 10px", fontSize: "12px", borderRadius: "4px", backgroundColor: item.bg, color: item.color, fontWeight: 600 }}>{item.label}</span>
                    ))}
                  </div>
                </div>
                <Map data={allWarga} liveDrivers={Object.values(liveDrivers)} />
              </div>
            )}

            {/* ── TAB: Verifikasi Pembayaran ── */}
            {activeTab === "pembayaran" && (
              <>
                {/* Banner menunggu */}
                {stats.menunggu > 0 && (
                  <div style={{ background: "linear-gradient(135deg,#d97706,#b45309)", borderRadius: "10px", padding: "16px 24px", color: "#fff", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: "18px" }}>⏳ {stats.menunggu} Pembayaran Menunggu Verifikasi</div>
                      <div style={{ fontSize: "13px", opacity: 0.85, marginTop: "4px" }}>Segera verifikasi untuk memperbarui status warga</div>
                    </div>
                    <div style={{ fontSize: "36px", fontWeight: 900, opacity: 0.5 }}>{stats.menunggu}</div>
                  </div>
                )}

                <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px" }}>Verifikasi Pembayaran Retribusi Kebersihan</h3>
                  <div className="table-container">
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #e2e8f0", color: "var(--color-text-muted)", textAlign: "left" }}>
                          <th style={{ padding: "10px 12px" }}>Nama Warga</th>
                          <th style={{ padding: "10px 12px" }}>Tanggal Bayar</th>
                          <th style={{ padding: "10px 12px" }}>Status</th>
                          <th style={{ padding: "10px 12px" }}>Bukti</th>
                          <th style={{ padding: "10px 12px" }}>Aksi Verifikasi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pembayaran.length === 0
                          ? <tr><td colSpan="4" style={{ padding: "20px", textAlign: "center", color: "var(--color-text-muted)" }}>Belum ada data pembayaran.</td></tr>
                          : pembayaran.map(b => {
                            const sc = statusColor(b.status);
                            return (
                              <tr key={b.id} style={{ borderBottom: "1px solid #f1f5f9", backgroundColor: b.status === "belum" ? "#fffbeb" : "transparent" }}>
                                <td style={{ padding: "12px", fontWeight: 600 }}>{b.warga?.nama || "Anonim"}</td>
                                <td style={{ padding: "12px", color: "var(--color-text-muted)" }}>{b.tanggal ? new Date(b.tanggal).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "-"}</td>
                                <td style={{ padding: "12px" }}>
                                  <span style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, backgroundColor: sc.bg, color: sc.color }}>{sc.label}</span>
                                </td>
                                <td style={{ padding: "12px" }}>
                                  {b.bukti_url && b.bukti_url !== "manual" ? (
                                    <button onClick={() => setBuktiModal({ open: true, url: b.bukti_url })} style={{ color: "#3b82f6", fontSize: "12px", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                                      {b.bukti_url.startsWith("http") && !b.bukti_url.includes("bayar.gg") ? "📷 Lihat Bukti Transfer" : "🔗 Lihat Link Bayar"}
                                    </button>
                                  ) : b.bukti_url === "manual" ? (
                                    <span style={{ fontSize: "12px", color: "#d97706" }}>⚠️ Manual (tanpa bukti)</span>
                                  ) : "-"}
                                </td>
                                <td style={{ padding: "12px" }}>
                                  {b.status === "belum" ? (
                                    <div style={{ display: "flex", gap: "8px" }}>
                                      <button onClick={() => verifikasiPembayaran(b.id)} className="btn-primary" style={{ padding: "5px 12px", fontSize: "12px", width: "auto", background: "#059669" }}>
                                        ✓ Verifikasi
                                      </button>
                                      <button onClick={() => tolakPembayaran(b.id)} className="btn-logout" style={{ padding: "5px 12px", fontSize: "12px" }}>
                                        ✗ Tolak
                                      </button>
                                    </div>
                                  ) : b.status === "sudah" ? (
                                    <span style={{ color: "#059669", fontWeight: 700, fontSize: "12px" }}>✓ Terverifikasi</span>
                                  ) : (
                                    <button onClick={() => verifikasiPembayaran(b.id)} className="btn-primary" style={{ padding: "5px 12px", fontSize: "12px", width: "auto" }}>
                                      Verifikasi Manual
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ── TAB: Laporan Keuangan ── */}
            {activeTab === "laporankeuangan" && (
              <div id="pdf-content">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text-main)" }}>Laporan Keuangan Global</h3>
                  <button onClick={openExportDialog} className="btn-primary" style={{ width: "auto", padding: "8px 16px", fontSize: "13px", gap: "8px", background: "#10b981", borderColor: "#059669" }}>
                    📥 Export Multi-Laporan (PDF/Excel)
                  </button>
                </div>

                <div className="dashboard-grid" style={{ marginBottom: "20px" }}>
                  <div className="stat-card">
                    <div className="stat-icon-wrapper"><span className="stat-title">Total Pemasukan</span><svg className="stat-icon-svg" style={{ color: "#10b981" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                    <div className="stat-value" style={{ color: "#10b981" }}>Rp {pembayaran.filter(p => p.status === "sudah").reduce((acc, p) => acc + (p.jumlah || 0), 0).toLocaleString("id-ID")}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon-wrapper"><span className="stat-title">Total Pengeluaran (Courier)</span><svg className="stat-icon-svg" style={{ color: "#ef4444" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg></div>
                    <div className="stat-value" style={{ color: "#ef4444" }}>Rp {transaksiCourier.reduce((acc, t) => acc + (t.jumlah || 0), 0).toLocaleString("id-ID")}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon-wrapper"><span className="stat-title">Saldo Bersih</span><svg className="stat-icon-svg" style={{ color: "#3b82f6" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                    <div className="stat-value" style={{ color: "#3b82f6" }}>Rp {(pembayaran.filter(p => p.status === "sudah").reduce((acc, p) => acc + (p.jumlah || 0), 0) - transaksiCourier.reduce((acc, t) => acc + (t.jumlah || 0), 0)).toLocaleString("id-ID")}</div>
                  </div>
                </div>

                <div className="map-container-wrapper" style={{ marginTop: 0, marginBottom: "20px" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--color-text-main)" }}>Rincian Pemasukan Retribusi (dari Warga)</h3>
                  <div className="table-container">
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #e2e8f0", color: "var(--color-text-muted)", textAlign: "left" }}>
                          <th style={{ padding: "10px 12px" }}>Tanggal</th>
                          <th style={{ padding: "10px 12px" }}>Warga</th>
                          <th style={{ padding: "10px 12px" }}>Status</th>
                          <th style={{ padding: "10px 12px" }}>Jumlah</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pembayaran.length === 0 ? (
                          <tr><td colSpan="4" style={{ padding: "20px", textAlign: "center", color: "var(--color-text-muted)" }}>Belum ada data retribusi.</td></tr>
                        ) : (
                          pembayaran.map(b => (
                            <tr key={b.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "12px", color: "var(--color-text-muted)" }}>{new Date(b.tanggal).toLocaleDateString("id-ID", { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                              <td style={{ padding: "12px", fontWeight: 600 }}>{b.warga?.nama || "Anonim"}</td>
                              <td style={{ padding: "12px" }}>
                                <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 600, background: b.status === "sudah" ? "#dcfce7" : "#fef3c7", color: b.status === "sudah" ? "#16a34a" : "#d97706" }}>
                                  {b.status === "sudah" ? "✓ Lunas" : "⏳ Menunggu"}
                                </span>
                              </td>
                              <td style={{ padding: "12px", color: "#10b981", fontWeight: 700 }}>+ Rp {(b.jumlah || 0).toLocaleString("id-ID")}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--color-text-main)" }}>Rincian Transaksi Courier (Pengeluaran)</h3>
                  <div className="table-container">
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #e2e8f0", color: "var(--color-text-muted)", textAlign: "left" }}>
                          <th style={{ padding: "10px 12px" }}>Tanggal</th>
                          <th style={{ padding: "10px 12px" }}>Courier</th>
                          <th style={{ padding: "10px 12px" }}>Keterangan</th>
                          <th style={{ padding: "10px 12px" }}>Jumlah</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transaksiCourier.length === 0 ? (
                          <tr><td colSpan="4" style={{ padding: "20px", textAlign: "center", color: "var(--color-text-muted)" }}>Belum ada pengeluaran Courier.</td></tr>
                        ) : (
                          transaksiCourier.map(t => (
                            <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "12px", color: "var(--color-text-muted)" }}>{new Date(t.tanggal).toLocaleDateString("id-ID", { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                              <td style={{ padding: "12px", fontWeight: 600 }}>{t.profiles?.name || "Anonim"}</td>
                              <td style={{ padding: "12px" }}>{t.keterangan || "-"}</td>
                              <td style={{ padding: "12px", color: "#ef4444", fontWeight: 700 }}>- Rp {(t.jumlah || 0).toLocaleString("id-ID")}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB: Eco Poin (BARU) ── */}
            {activeTab === "ecopoin" && (
              <div id="pdf-content">
                {/* Summary Cards */}
                <div className="dashboard-grid" style={{ marginBottom: "20px" }}>
                  <div className="stat-card">
                    <div className="stat-icon-wrapper"><span className="stat-title">Total Warga Aktif</span><svg className="stat-icon-svg" style={{ color: "#7c3aed" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M16 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg></div>
                    <div className="stat-value" style={{ color: "#7c3aed" }}>{ecopoinData.length} Warga</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon-wrapper"><span className="stat-title">Total Eco Poin</span><svg className="stat-icon-svg" style={{ color: "#7c3aed" }} fill="currentColor" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg></div>
                    <div className="stat-value" style={{ color: "#7c3aed" }}>{ecopoinData.reduce((sum, e) => sum + e.poin, 0).toLocaleString()} Poin</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon-wrapper"><span className="stat-title">Total Berat Sampah</span><svg className="stat-icon-svg" style={{ color: "#059669" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg></div>
                    <div className="stat-value" style={{ color: "#059669" }}>{ecopoinData.reduce((sum, e) => sum + e.total_berat, 0).toFixed(1)} Kg</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon-wrapper"><span className="stat-title">Peringkat Teratas</span><svg className="stat-icon-svg" style={{ color: "#d97706" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.475 3.475 0 013.138 3.138" /></svg></div>
                    <div className="stat-value" style={{ color: "#d97706", fontSize: "16px" }}>{ecopoinData[0]?.nama || "-"}</div>
                  </div>
                </div>

                <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px" }}>Ranking Eco Poin Warga</h3>
                  {ecopoinData.length === 0 ? (
                    <p style={{ color: "var(--color-text-muted)", fontSize: "13px" }}>Belum ada data sampah dari warga. Eco poin dihitung otomatis dari laporan sampah warga.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {ecopoinData.map((e, idx) => {
                        const lvl = getLevelLabel(e.poin);
                        const maxPoin = ecopoinData[0]?.poin || 1;
                        return (
                          <div key={e.warga_id} style={{ display: "flex", alignItems: "center", gap: "16px", padding: "14px 18px", border: "1px solid " + (idx === 0 ? "#fde68a" : idx === 1 ? "#e2e8f0" : idx === 2 ? "#fed7aa" : "#f1f5f9"), borderRadius: "10px", backgroundColor: idx === 0 ? "#fffbeb" : "#ffffff" }}>
                            {/* Rank badge */}
                            <div style={{ width: "36px", height: "36px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "14px", flexShrink: 0, background: idx === 0 ? "#fef3c7" : idx === 1 ? "#f1f5f9" : idx === 2 ? "#ffedd5" : "#f8fafc", color: idx === 0 ? "#d97706" : idx === 1 ? "#475569" : idx === 2 ? "#c2410c" : "#94a3b8" }}>
                              {idx === 0 ? "Rank 1" : idx === 1 ? "Rank 2" : idx === 2 ? "Rank 3" : `#${idx + 1}`}
                            </div>
                            {/* Info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                <div>
                                  <span style={{ fontWeight: 700, fontSize: "14px" }}>{e.nama}</span>
                                  <span style={{ marginLeft: "10px", fontSize: "11px", padding: "2px 8px", borderRadius: "20px", fontWeight: 700, backgroundColor: "#f5f3ff", color: lvl.color }}>{lvl.label}</span>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                  <div style={{ fontWeight: 800, fontSize: "16px", color: "#7c3aed" }}>{e.poin.toLocaleString()} Poin</div>
                                  <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{e.count} laporan • {e.total_berat.toFixed(1)} Kg</div>
                                </div>
                              </div>
                              {/* Progress bar */}
                              <div style={{ background: "#e2e8f0", borderRadius: "999px", height: "6px", overflow: "hidden" }}>
                                <div style={{ width: (e.poin / maxPoin * 100) + "%", height: "100%", background: "linear-gradient(90deg, #7c3aed, #a78bfa)", borderRadius: "999px" }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── TAB: Courier ── */}
            {activeTab === "Courier" && (
              <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px" }}>Manajemen Pengangkutan Sampah</h3>
                <div className="table-container">
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e2e8f0", color: "var(--color-text-muted)", textAlign: "left" }}>
                        <th style={{ padding: "10px 12px" }}>Warga</th><th style={{ padding: "10px 12px" }}>Driver</th><th style={{ padding: "10px 12px" }}>Status</th><th style={{ padding: "10px 12px" }}>Bukti</th><th style={{ padding: "10px 12px" }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pengangkutan.length === 0
                        ? <tr><td colSpan="5" style={{ padding: "20px", textAlign: "center", color: "var(--color-text-muted)" }}>Belum ada data pengangkutan.</td></tr>
                        : pengangkutan.map(a => (
                          <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "12px", fontWeight: 600 }}>{a.warga?.nama || "-"}</td>
                            <td style={{ padding: "12px" }}>{CourierList.find(t => t.id === a.transporter_id)?.name || "Belum Ditugaskan"}</td>
                            <td style={{ padding: "12px" }}>
                              <span style={{ padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", backgroundColor: a.status === "selesai" ? "#dcfce7" : a.status === "proses" ? "#dbeafe" : "#fef3c7", color: a.status === "selesai" ? "#16a34a" : a.status === "proses" ? "#2563eb" : "#d97706" }}>{a.status}</span>
                            </td>
                            <td style={{ padding: "12px" }}>
                              {a.bukti_url ? <button onClick={() => setBuktiModal({ open: true, url: a.bukti_url })} style={{ color: "#3b82f6", fontSize: "12px", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Lihat Foto</button> : "-"}
                            </td>
                            <td style={{ padding: "12px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                              <button onClick={() => setEditModal({ open: true, type: "pengangkutan", data: a })} className="btn-primary" style={{ padding: "4px 10px", fontSize: "11px", width: "auto", background: "#3b82f6", borderColor: "#2563eb" }}>Assign / Edit</button>
                              {a.status !== "selesai" && <button onClick={() => updateStatus("pengangkutan", a.id, "selesai")} className="btn-primary" style={{ padding: "4px 10px", fontSize: "11px", width: "auto", background: "#059669", borderColor: "#047857" }}>Selesai</button>}
                              <button onClick={() => hapusData("pengangkutan", a.id)} className="btn-logout" style={{ padding: "4px 10px", fontSize: "11px" }}>Hapus</button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB: Layanan Chat ── */}
            {activeTab === "chat" && (
              <div className="map-container-wrapper" style={{ marginTop: 0, display: "flex", gap: "20px", height: "600px", padding: 0, overflow: "hidden" }}>
                <div style={{ width: "300px", borderRight: "1px solid #e2e8f0", display: "flex", flexDirection: "column", background: "#f8fafc" }}>
                  <div style={{ padding: "20px", borderBottom: "1px solid #e2e8f0", background: "#fff" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>Daftar Pengguna</h3>
                    <p style={{ fontSize: "12px", color: "var(--color-text-muted)", margin: "4px 0 0 0" }}>Pilih pengguna untuk membalas chat</p>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    {[...allWarga.map(w => ({ ...w, _role: 'Warga' })), ...CourierList.map(t => ({ ...t, _role: 'Courier', nama: t.name }))]
                      .sort((a, b) => {
                        const timeA = lastMessages[a.id] || 0;
                        const timeB = lastMessages[b.id] || 0;
                        if (timeA !== timeB) return timeB - timeA;
                        return (a.nama || "").localeCompare(b.nama || "");
                      })
                      .map(u => (
                        <button
                          key={u.id}
                          onClick={() => setChatTarget(u)}
                          style={{ padding: "14px", textAlign: "left", background: chatTarget?.id === u.id ? "#ecfdf5" : "#fff", border: chatTarget?.id === u.id ? "1px solid #34d399" : "1px solid #e2e8f0", borderRadius: "10px", cursor: "pointer", transition: "all 0.2s" }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontWeight: 700, color: chatTarget?.id === u.id ? "#059669" : "#1e293b", fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
                              {onlineUsers[u.id] && <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#4ade80", flexShrink: 0 }}></span>}
                              {u.nama}
                            </span>
                            <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "10px", backgroundColor: u._role === 'Warga' ? '#e0f2fe' : '#fef3c7', color: u._role === 'Warga' ? '#0369a1' : '#b45309', fontWeight: 600 }}>{u._role}</span>
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {u._role === 'Warga' ? (u.alamat || "Alamat belum diatur") : "Mitra Pengangkut Sampah"}
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
                <div style={{ flex: 1, position: "relative", backgroundColor: "#fff" }}>
                  {chatTarget ? (
                    <ChatWidget
                      currentUser={{ id: '00000000-0000-0000-0000-000000000000', name: 'Admin' }}
                      targetUser={{ id: chatTarget.id, name: chatTarget.nama }}
                      isOpen={true}
                      onClose={() => setChatTarget(null)}
                      isEmbedded={true}
                      isTargetOnline={!!onlineUsers[chatTarget.id]}
                    />
                  ) : (
                    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--color-text-muted)" }}>
                      <svg style={{ width: "64px", height: "64px", color: "#cbd5e1", marginBottom: "16px" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                      <div style={{ fontWeight: 600, fontSize: "16px", color: "#64748b" }}>Belum ada obrolan terpilih</div>
                      <div style={{ fontSize: "13px", marginTop: "8px" }}>Pilih nama pengguna di panel sebelah kiri untuk mulai mengobrol.</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── TAB: Data Warga ── */}
            {activeTab === "datawarga" && (
              <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px" }}>Daftar Warga Terdaftar</h3>
                <div className="table-container">
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e2e8f0", color: "var(--color-text-muted)", textAlign: "left" }}>
                        <th style={{ padding: "10px 12px" }}>Nama</th><th style={{ padding: "10px 12px" }}>Alamat</th><th style={{ padding: "10px 12px" }}>Status Bayar</th><th style={{ padding: "10px 12px" }}>Eco Poin</th><th style={{ padding: "10px 12px" }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allWarga.length === 0
                        ? <tr><td colSpan="5" style={{ padding: "20px", textAlign: "center", color: "var(--color-text-muted)" }}>Belum ada warga terdaftar.</td></tr>
                        : allWarga.map(w => {
                          const sudah = (w.pembayaran || []).some(p => p.status === "sudah");
                          const menunggu = (w.pembayaran || []).some(p => p.status === "belum");
                          const eco = ecopoinData.find(e => e.warga_id === w.id);
                          return (
                            <tr key={w.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "12px", fontWeight: 600 }}>{w.nama}</td>
                              <td style={{ padding: "12px", color: "var(--color-text-muted)" }}>{w.alamat}</td>
                              <td style={{ padding: "12px" }}>
                                <span style={{ padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, backgroundColor: sudah ? "#dcfce7" : menunggu ? "#fef3c7" : "#fee2e2", color: sudah ? "#16a34a" : menunggu ? "#d97706" : "#dc2626" }}>
                                  {sudah ? "Lunas" : menunggu ? "Menunggu" : "Belum Bayar"}
                                </span>
                              </td>
                              <td style={{ padding: "12px", fontWeight: 700, color: "#7c3aed" }}>{eco ? eco.poin + " Poin" : "0 Poin"}</td>
                              <td style={{ padding: "12px", display: "flex", gap: "6px" }}>
                                <button onClick={() => setEditModal({ open: true, type: "warga", data: w })} className="btn-primary" style={{ padding: "4px 10px", fontSize: "11px", width: "auto", background: "#3b82f6", borderColor: "#2563eb" }}>Edit</button>
                                <button onClick={() => hapusData("warga", w.id)} className="btn-logout" style={{ padding: "4px 10px", fontSize: "11px" }}>Hapus</button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB: Data Courier ── */}
            {activeTab === "dataCourier" && (
              <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700 }}>Daftar Akun Courier</h3>
                  <p style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>*Penambahan akun baru dilakukan via halaman Register</p>
                </div>
                <div className="table-container">
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e2e8f0", color: "var(--color-text-muted)", textAlign: "left" }}>
                        <th style={{ padding: "10px 12px" }}>Nama Courier</th><th style={{ padding: "10px 12px" }}>ID Akun (UUID)</th><th style={{ padding: "10px 12px" }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CourierList.length === 0
                        ? <tr><td colSpan="3" style={{ padding: "20px", textAlign: "center", color: "var(--color-text-muted)" }}>Belum ada akun Courier terdaftar.</td></tr>
                        : CourierList.map(t => (
                          <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "12px", fontWeight: 600 }}>{t.name}</td>
                            <td style={{ padding: "12px", color: "var(--color-text-muted)", fontSize: "11px", fontFamily: "monospace" }}>{t.id}</td>
                            <td style={{ padding: "12px", display: "flex", gap: "6px" }}>
                              <button onClick={() => setEditModal({ open: true, type: "Courier", data: t })} className="btn-primary" style={{ padding: "4px 10px", fontSize: "11px", width: "auto", background: "#3b82f6", borderColor: "#2563eb" }}>Edit</button>
                              <button onClick={() => hapusData("profiles", t.id)} className="btn-logout" style={{ padding: "4px 10px", fontSize: "11px" }}>Hapus</button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB: Manajemen Redeem ── */}
            {activeTab === "manajemenredeem" && (
              <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px" }}>Katalog Promo Redeem</h3>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  <input id="newPromoName" placeholder="Nama Promo (Misal: Diskon Iuran 20%)" className="form-input" style={{ flex: 1, minWidth: '200px' }} />
                  <input id="newPromoCost" type="number" placeholder="Harga Poin" className="form-input" style={{ width: '120px' }} />
                  <button onClick={async () => {
                    const name = document.getElementById("newPromoName").value;
                    const cost = document.getElementById("newPromoCost").value;
                    if (!name || !cost) return alert("Isi nama dan harga poin!");
                    const { error } = await supabase.from("katalog_redeem").insert({ name, cost: parseInt(cost) });
                    if (error) return alert("Gagal menambah promo: " + error.message);
                    document.getElementById("newPromoName").value = "";
                    document.getElementById("newPromoCost").value = "";
                    fetchAll();
                  }} className="btn-primary" style={{ width: 'auto', background: '#7c3aed', borderColor: '#6d28d9' }}>Tambah Promo</button>
                </div>
                <div className="table-container" style={{ marginBottom: '32px' }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e2e8f0", color: "var(--color-text-muted)", textAlign: "left" }}>
                        <th style={{ padding: "10px 12px" }}>Nama Promo</th><th style={{ padding: "10px 12px" }}>Harga Poin</th><th style={{ padding: "10px 12px" }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {katalogRedeem.length === 0
                        ? <tr><td colSpan="3" style={{ padding: "20px", textAlign: "center", color: "var(--color-text-muted)" }}>Belum ada promo.</td></tr>
                        : katalogRedeem.map(k => (
                          <tr key={k.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "12px", fontWeight: 600 }}>{k.name}</td>
                            <td style={{ padding: "12px", color: "#7c3aed", fontWeight: 700 }}>{k.cost} Poin</td>
                            <td style={{ padding: "12px" }}>
                              <button onClick={() => hapusData("katalog_redeem", k.id)} className="btn-logout" style={{ padding: "4px 10px", fontSize: "11px" }}>Hapus</button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", borderTop: "1px solid #e2e8f0", paddingTop: "24px" }}>Persetujuan Penukaran Eco Poin</h3>
                <div className="table-container">
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e2e8f0", color: "var(--color-text-muted)", textAlign: "left" }}>
                        <th style={{ padding: "10px 12px" }}>Tanggal</th><th style={{ padding: "10px 12px" }}>Warga</th><th style={{ padding: "10px 12px" }}>Item Redeem</th><th style={{ padding: "10px 12px" }}>Poin</th><th style={{ padding: "10px 12px" }}>Status</th><th style={{ padding: "10px 12px" }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {redeemList.length === 0
                        ? <tr><td colSpan="6" style={{ padding: "20px", textAlign: "center", color: "var(--color-text-muted)" }}>Belum ada pengajuan redeem poin.</td></tr>
                        : redeemList.map(r => (
                          <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "12px", color: "var(--color-text-muted)" }}>{new Date(r.created_at).toLocaleDateString("id-ID")}</td>
                            <td style={{ padding: "12px", fontWeight: 600 }}>{r.warga?.nama || "-"}</td>
                            <td style={{ padding: "12px" }}>{r.item_name}</td>
                            <td style={{ padding: "12px", color: "#ef4444", fontWeight: 600 }}>-{r.points_cost}</td>
                            <td style={{ padding: "12px" }}>
                              <span style={{ padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", backgroundColor: r.status === "disetujui" ? "#dcfce7" : r.status === "menunggu" ? "#fef3c7" : "#fee2e2", color: r.status === "disetujui" ? "#16a34a" : r.status === "menunggu" ? "#d97706" : "#dc2626" }}>{r.status}</span>
                            </td>
                            <td style={{ padding: "12px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                              {r.status === "menunggu" && (
                                <>
                                  <button onClick={() => updateStatus("redeem_poin", r.id, "disetujui")} className="btn-primary" style={{ padding: "4px 10px", fontSize: "11px", width: "auto", background: "#059669", borderColor: "#047857" }}>Setujui</button>
                                  <button onClick={() => updateStatus("redeem_poin", r.id, "ditolak")} className="btn-primary" style={{ padding: "4px 10px", fontSize: "11px", width: "auto", background: "#ef4444", borderColor: "#dc2626" }}>Tolak</button>
                                </>
                              )}
                              {r.status !== "menunggu" && (
                                <button onClick={() => hapusData("redeem_poin", r.id)} className="btn-logout" style={{ padding: "4px 10px", fontSize: "11px" }}>Hapus</button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB: Pengaturan Aplikasi ── */}
            {activeTab === "pengaturan-aplikasi" && (
              <div className="card-animated">
                <div className="map-container-wrapper" style={{ marginTop: 0 }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--color-text-main)" }}>Pengaturan Parameter Aplikasi</h3>
                  <div style={{ padding: "20px", background: "var(--bg-card)", borderRadius: "8px", border: "1px solid var(--border-color)", display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600 }}>Biaya Retribusi Dasar (Rp)</label>
                      <input
                        type="number"
                        className="form-input"
                        value={appSettings.baseFee}
                        onChange={(e) => setAppSettings({ ...appSettings, baseFee: parseInt(e.target.value) || 0 })}
                      />
                      <small style={{ color: "var(--color-text-muted)" }}>Biaya dasar retribusi bulanan warga.</small>
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600 }}>Tarif per Kilometer (Rp/km)</label>
                      <input
                        type="number"
                        className="form-input"
                        value={appSettings.feePerKm}
                        onChange={(e) => setAppSettings({ ...appSettings, feePerKm: parseInt(e.target.value) || 0 })}
                      />
                      <small style={{ color: "var(--color-text-muted)" }}>Tarif tambahan berdasarkan jarak rumah warga ke lokasi TPA.</small>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div className="form-group">
                        <label className="form-label" style={{ fontWeight: 600 }}>Latitude TPA</label>
                        <input
                          type="number"
                          step="any"
                          className="form-input"
                          value={appSettings.tpaLat}
                          onChange={(e) => setAppSettings({ ...appSettings, tpaLat: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" style={{ fontWeight: 600 }}>Longitude TPA</label>
                        <input
                          type="number"
                          step="any"
                          className="form-input"
                          value={appSettings.tpaLng}
                          onChange={(e) => setAppSettings({ ...appSettings, tpaLng: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                    <small style={{ color: "var(--color-text-muted)", marginTop: "-8px" }}>Koordinat lokasi pusat TPA sebagai titik acuan hitung jarak.</small>

                    <button
                      onClick={async () => {
                        setSettingsSaving(true);
                        try {
                          const blob = new Blob([JSON.stringify(appSettings)], { type: "application/json" });
                          const { error } = await supabase.storage.from("uploads").upload("settings.json", blob, {
                            contentType: "application/json",
                            upsert: true
                          });
                          if (error) throw error;
                          Swal.fire({
                            icon: "success",
                            title: "Berhasil",
                            text: "Pengaturan berhasil disimpan!",
                            timer: 1500,
                            showConfirmButton: false
                          });
                        } catch (err) {
                          Swal.fire({
                            icon: "error",
                            title: "Gagal Menyimpan",
                            text: err.message
                          });
                        } finally {
                          setSettingsSaving(false);
                        }
                      }}
                      className="btn-primary"
                      style={{ marginTop: "12px", width: "auto", alignSelf: "flex-start", padding: "10px 24px" }}
                      disabled={settingsSaving}
                    >
                      {settingsSaving ? "Menyimpan..." : "Simpan Pengaturan"}
                    </button>
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
                  <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--color-text-main)" }}>Panduan & Bantuan Admin</h3>
                  <div className="grid-2-col">
                    <div style={{ padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                      <h4 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-primary)", marginBottom: "8px" }}>Cara Memverifikasi Pembayaran</h4>
                      <p style={{ fontSize: "13px", color: "var(--color-text-muted)", lineHeight: 1.6 }}>Pilih menu Verifikasi Bayar, cek bukti transfer yang dilampirkan warga, lalu klik Setujui jika valid.</p>
                    </div>
                    <div style={{ padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                      <h4 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-primary)", marginBottom: "8px" }}>Manajemen Courier</h4>
                      <p style={{ fontSize: "13px", color: "var(--color-text-muted)", lineHeight: 1.6 }}>Gunakan menu Courier untuk meng-assign laporan penjemputan dari warga ke *driver* truk yang sesuai.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* EDIT MODAL */}
        {editModal.open && (
          <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
            <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", width: "100%", maxWidth: "420px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
              <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px", textTransform: "capitalize" }}>Edit Data {editModal.type}</h3>
              <form onSubmit={saveEdit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {editModal.type === "warga" && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Nama Warga</label>
                      <input className="form-input" required value={editModal.data.nama || ""} onChange={e => setEditModal(prev => ({ ...prev, data: { ...prev.data, nama: e.target.value } }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Alamat</label>
                      <input className="form-input" required value={editModal.data.alamat || ""} onChange={e => setEditModal(prev => ({ ...prev, data: { ...prev.data, alamat: e.target.value } }))} />
                    </div>
                  </>
                )}
                {editModal.type === "sampah" && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Jenis Sampah</label>
                      <select className="form-select" value={editModal.data.jenis || ""} onChange={e => setEditModal(prev => ({ ...prev, data: { ...prev.data, jenis: e.target.value } }))}>
                        <option value="Plastik & Kertas">Plastik & Kertas</option>
                        <option value="Organik (Makanan/Daun)">Organik (Makanan/Daun)</option>
                        <option value="Kaca & Logam">Kaca & Logam</option>
                        <option value="Residu / Campuran">Residu / Campuran</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Berat (Kg)</label>
                      <input type="number" step="0.1" className="form-input" required value={editModal.data.berat || ""} onChange={e => setEditModal(prev => ({ ...prev, data: { ...prev.data, berat: e.target.value } }))} />
                    </div>
                  </>
                )}
                {editModal.type === "pengangkutan" && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Pilih Courier (Driver)</label>
                      <select className="form-select" value={editModal.data.transporter_id || ""} onChange={e => setEditModal(prev => ({ ...prev, data: { ...prev.data, transporter_id: e.target.value || null } }))}>
                        <option value="">-- Belum Ditugaskan --</option>
                        {CourierList.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Status</label>
                      <select className="form-select" value={editModal.data.status || ""} onChange={e => setEditModal(prev => ({ ...prev, data: { ...prev.data, status: e.target.value } }))}>
                        <option value="menunggu">Menunggu</option>
                        <option value="proses">Proses (Dalam Perjalanan)</option>
                        <option value="selesai">Selesai</option>
                      </select>
                    </div>
                  </>
                )}
                {editModal.type === "Courier" && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Nama Courier</label>
                      <input className="form-input" required value={editModal.data.name || ""} onChange={e => setEditModal(prev => ({ ...prev, data: { ...prev.data, name: e.target.value } }))} />
                    </div>
                  </>
                )}
                <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                  <button type="button" onClick={() => setEditModal({ open: false, type: "", data: null })} className="btn-primary" style={{ background: "#e2e8f0", color: "#475569", borderColor: "#cbd5e1", flex: 1 }}>Batal</button>
                  <button type="submit" className="btn-primary" style={{ flex: 1 }}>Simpan Data</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Modal Lihat Bukti */}
      {buktiModal.open && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }} onClick={() => setBuktiModal({ open: false, url: "" })}>
          <div style={{ position: "relative", backgroundColor: "#fff", padding: "16px", borderRadius: "12px", maxWidth: "90%", maxHeight: "90vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700" }}>Bukti Lampiran</h3>
              <button onClick={() => setBuktiModal({ open: false, url: "" })} style={{ background: "#f1f5f9", border: "none", width: "30px", height: "30px", borderRadius: "50%", cursor: "pointer", fontWeight: "bold" }}>✕</button>
            </div>
            <div style={{ flex: 1, overflow: "auto", display: "flex", justifyContent: "center", alignItems: "center" }}>
              <img src={buktiModal.url} alt="Bukti" style={{ maxWidth: "100%", maxHeight: "calc(90vh - 80px)", objectFit: "contain", borderRadius: "8px" }} />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}


