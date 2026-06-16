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
    return <div style={{ height: "100vh", backgroundColor: "#f8fafc" }} />;
  }

  if (role === "guest") return <Login />;
  if (role === "admin") return <Admin />;
  if (role === "transporter") return <Transporter />;
  return <Warga />;
}

export default App;
