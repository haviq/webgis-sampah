import { createClient } from "@supabase/supabase-js";

// Mengambil kredensial dari environment variable (.env) atau fallback ke string manual
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_URL !== 'YOUR_SUPABASE_URL'
  ? import.meta.env.VITE_SUPABASE_URL 
  : "URL_KAMU"; // Ganti dengan URL Supabase Anda jika tidak menggunakan .env

const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY && import.meta.env.VITE_SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY'
  ? import.meta.env.VITE_SUPABASE_ANON_KEY 
  : "API_KEY_KAMU"; // Ganti dengan Anon Key Supabase Anda jika tidak menggunakan .env

export const supabase = createClient(supabaseUrl, supabaseKey);
