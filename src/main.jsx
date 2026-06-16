import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import "./index.css";
import "leaflet/dist/leaflet.css";
import Swal from "sweetalert2";

// Override window.alert globally to use SweetAlert2
window.alert = (message) => {
  let icon = "info";
  if (message.includes("✅") || message.includes("Berhasil") || message.includes("berhasil") || message.includes("Lunas")) icon = "success";
  else if (message.includes("⚠️") || message.includes("Gagal") || message.includes("Pilih") || message.includes("harus") || message.includes("belum")) icon = "warning";
  else if (message.includes("❌") || message.includes("Error")) icon = "error";

  Swal.fire({
    title: icon === "success" ? "Berhasil!" : icon === "warning" ? "Perhatian" : "Informasi",
    text: message.replace(/[✅⚠️❌🔔]/g, "").trim(),
    icon: icon,
    confirmButtonColor: "#10b981",
    customClass: {
      popup: "swal-custom-popup"
    }
  });
};

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
