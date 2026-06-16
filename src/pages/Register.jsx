import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate, Link } from "react-router-dom";

export default function Register() {
  const [form, setForm] = useState({ nama: "", email: "", password: "", role: "warga" });
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    if (e) e.preventDefault();

    if (!form.nama || !form.email || !form.password) {
      setErrorMessage("Semua kolom data wajib diisi!");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      // 1. Sign up the user in Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
      });

      if (error) {
        setErrorMessage(error.message);
        setLoading(false);
        return;
      }

      if (!data?.user) {
        setErrorMessage("Gagal membuat akun auth. Silakan coba lagi.");
        setLoading(false);
        return;
      }

      // 2. Insert profile details into "profiles" table (Using 'nama' to match Modul 6 PDF page 5)
      const { error: profileError } = await supabase.from("profiles").insert([
        {
          id: data.user.id,
          name: form.nama,
          role: form.role,
        },
      ]);

      if (profileError) {
        setErrorMessage("Gagal menyimpan profil: " + profileError.message);
        setLoading(false);
        return;
      }

      alert("Registrasi Berhasil! Silakan Login.");
      navigate("/login");
    } catch (err) {
      setErrorMessage("Terjadi kesalahan sistem saat mendaftar.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo-wrapper" style={{ background: "transparent", width: "140px", height: "140px", margin: "0 auto 16px auto" }}>
            <img src="/logo.png" alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <h2 className="auth-title">Daftar Akun Baru</h2>
          <p className="auth-subtitle">Sistem Informasi Pengelolaan Sampah Kota</p>
        </div>

        {errorMessage && (
          <div className="alert-error">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleRegister}>
          <div className="form-group">
            <label className="form-label">Nama Lengkap</label>
            <input
              type="text"
              className="form-input"
              placeholder="Masukkan nama lengkap Anda"
              value={form.nama}
              onChange={(e) => setForm({ ...form, nama: e.target.value })}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Alamat Email</label>
            <input
              type="email"
              className="form-input"
              placeholder="nama@domain.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="Minimal 6 karakter"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Peran Pengguna (Role)</label>
            <select
              className="form-select"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              disabled={loading}
            >
              <option value="warga">Warga (Masyarakat)</option>
              <option value="transporter">Transporter (Pengangkut Sampah)</option>
              <option value="admin">Admin Dinas Kebersihan</option>
            </select>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Mendaftarkan Akun..." : "Buat Akun Sekarang"}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Sudah terdaftar?{" "}
            <Link to="/login">Masuk di sini</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
