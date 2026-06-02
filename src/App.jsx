import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import Admin from "./pages/Admin";
import Transporter from "./pages/Transporter";
import Warga from "./pages/Warga";
import Login from "./pages/Login";

function App() {
  const [role, setRole] = useState(null);

  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();

        if (!userData.user) {
          setRole("guest");
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userData.user.id)
          .single();

        if (error || !data) {
          console.warn("Profil pengguna tidak ditemukan, default ke warga:", error);
          setRole("warga");
        } else {
          setRole(data.role);
        }
      } catch (err) {
        console.error("Gagal mendapatkan sesi user:", err);
        setRole("guest");
      }
    };

    getUser();

    // Listen to auth state changes (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setRole("guest");
      } else if (event === "SIGNED_IN") {
        getUser();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (role === null) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        backgroundColor: "#f8fafc",
        color: "#0f172a",
        fontFamily: "'Inter', sans-serif"
      }}>
        <svg style={{ width: '48px', height: '48px', color: '#059669', marginBottom: '16px', animation: 'spin 1s linear infinite' }} fill="none" viewBox="0 0 24 24">
          <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Memverifikasi Sesi Pengguna...</h2>
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (role === "guest") return <Login />;
  if (role === "admin") return <Admin />;
  if (role === "transporter") return <Transporter />;
  return <Warga />;
}

export default App;
