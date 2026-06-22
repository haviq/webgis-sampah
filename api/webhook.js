import { createClient } from '@supabase/supabase-js';
import midtransClient from 'midtrans-client';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  try {
    const apiClient = new midtransClient.Snap({
      isProduction: false,
      serverKey: process.env.MIDTRANS_SERVER_KEY,
      clientKey: process.env.VITE_MIDTRANS_CLIENT_KEY
    });

    const notificationJson = req.body;
    // Midtrans SDK notification handling
    const statusResponse = await apiClient.transaction.notification(notificationJson);
    
    let orderId = statusResponse.order_id;
    let transactionStatus = statusResponse.transaction_status;
    let fraudStatus = statusResponse.fraud_status;

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase credentials missing in environment variables.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (transactionStatus === 'capture' || transactionStatus === 'settlement') {
        if (fraudStatus === 'accept' || !fraudStatus) {
            // Update supabase status to 'sudah'
            await supabase.from("pembayaran").update({ status: "sudah" }).eq("id", orderId);
        }
    } else if (transactionStatus === 'cancel' || transactionStatus === 'deny' || transactionStatus === 'expire') {
        // You could update status to 'gagal' or 'batal' if needed
        await supabase.from("pembayaran").update({ status: "gagal" }).eq("id", orderId);
    }
    
    res.status(200).json({ status: "OK" });
  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).json({ error: error.message });
  }
}
