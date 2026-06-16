import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { compressImage } from "../utils/imageCompressor";
import Swal from "sweetalert2";

export default function AccountSettings({ user, setUser }) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loadingPic, setLoadingPic] = useState(false);
  const [loadingPass, setLoadingPass] = useState(false);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setLoadingPic(true);
      const compressedBase64 = await compressImage(file);
      
      // Hapus prefix "data:image/jpeg;base64," untuk API ImgBB
      const base64Data = compressedBase64.split(",")[1];

      // Upload ke ImgBB
      const formData = new FormData();
      formData.append("key", "1c79b44d4e897550b11b3ad09ba8fd55");
      formData.append("image", base64Data);

      const imgbbRes = await fetch("https://api.imgbb.com/1/upload", {
        method: "POST",
        body: formData,
      });
      const imgbbData = await imgbbRes.json();

      if (!imgbbData.success) {
        throw new Error(imgbbData.error?.message || "Gagal mengunggah foto ke ImgBB");
      }

      const imageUrl = imgbbData.data.url;
      
      // Simpan URL ImgBB ke Supabase
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: imageUrl })
        .eq("id", user.id);

      if (error) throw error;

      setUser({ ...user, avatar_url: imageUrl });
      
      Swal.fire({
        icon: "success",
        title: "Foto Profil Diperbarui",
        text: "Foto profil Anda berhasil diubah.",
        timer: 2000,
        showConfirmButton: false
      });
    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: "error",
        title: "Gagal",
        text: "Terjadi kesalahan saat mengunggah foto.",
      });
    } finally {
      setLoadingPic(false);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword) {
      Swal.fire({ icon: "error", title: "Oops", text: "Mohon isi password lama dan password baru." });
      return;
    }
    if (newPassword.length < 6) {
      Swal.fire({ icon: "error", title: "Oops", text: "Password baru minimal 6 karakter." });
      return;
    }

    try {
      setLoadingPass(true);
      
      // Verifikasi password lama dengan re-authenticating
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: oldPassword,
      });

      if (signInError) {
        Swal.fire({ icon: "error", title: "Gagal", text: "Password lama yang Anda masukkan salah." });
        return;
      }

      // Jika benar, update ke password baru
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      
      if (updateError) throw updateError;

      Swal.fire({
        icon: "success",
        title: "Password Diperbarui",
        text: "Password Anda berhasil diubah.",
        timer: 2000,
        showConfirmButton: false
      });
      setOldPassword("");
      setNewPassword("");
    } catch (error) {
      console.error(error);
      Swal.fire({ icon: "error", title: "Gagal", text: "Gagal mengubah password." });
    } finally {
      setLoadingPass(false);
    }
  };

  return (
    <div style={{ marginTop: "30px", borderTop: "1px solid #e2e8f0", paddingTop: "24px", paddingBottom: "24px" }}>
      <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--color-text-main)" }}>
        Keamanan & Akun
      </h3>
      <div className="grid-2-col">
        {/* Foto Profil */}
        <div style={{ padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <h4 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-primary)", marginBottom: "8px" }}>Foto Profil</h4>
          <p style={{ fontSize: "13px", color: "var(--color-text-muted)", marginBottom: "12px", lineHeight: 1.6 }}>
            Upload foto untuk ditampilkan di sidebar. Disarankan menggunakan foto persegi (1:1).
          </p>
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleFileChange}
            disabled={loadingPic}
            style={{ fontSize: "13px" }}
          />
          {loadingPic && <span style={{ fontSize: "12px", marginLeft: "10px", color: "var(--color-primary)" }}>Mengkompresi & Mengunggah...</span>}
        </div>

        {/* Ganti Password */}
        <div style={{ padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <h4 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-primary)", marginBottom: "8px" }}>Ganti Password</h4>
          <p style={{ fontSize: "13px", color: "var(--color-text-muted)", marginBottom: "16px", lineHeight: 1.6 }}>
            Masukkan password lama untuk verifikasi keamanan, lalu masukkan password baru Anda (minimal 6 karakter).
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <input 
                type="password" 
                className="form-input" 
                placeholder="Password Lama" 
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                style={{ width: "100%", padding: "10px" }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <input 
                type="password" 
                className="form-input" 
                placeholder="Password Baru" 
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ width: "100%", padding: "10px" }}
              />
            </div>
            <button 
              className="btn-primary" 
              onClick={handleChangePassword}
              disabled={loadingPass || !oldPassword || !newPassword}
              style={{ padding: "10px", marginTop: "4px" }}
            >
              {loadingPass ? "Menyimpan..." : "Simpan Password"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
