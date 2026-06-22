import { createClient } from '@supabase/supabase-js';
import midtransClient from 'midtrans-client';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase credentials missing in environment variables.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let notificationJson = req.body;
    if (typeof notificationJson === 'string') {
      try { notificationJson = JSON.parse(notificationJson); } catch (e) { }
    }

    const orderId = req.query.order_id;
    let transactionStatus = notificationJson?.status;

    console.log("Webhook received! OrderId:", orderId, "Status:", transactionStatus, "Payload:", JSON.stringify(notificationJson));

    if (!orderId) {
      return res.status(400).json({ error: "order_id is missing from query string", body: notificationJson });
    }

    if (transactionStatus === 'paid') {
      const { data, error } = await supabase.from("pembayaran").update({ status: "sudah" }).eq("id", orderId).select();
      console.log("Supabase Update Result:", data, error);
    } else if (transactionStatus === 'expired' || transactionStatus === 'failed' || transactionStatus === 'canceled') {
      await supabase.from("pembayaran").update({ status: "gagal" }).eq("id", orderId);
    }

    res.status(200).json({ status: "OK", received: true });
  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).json({ error: error.message });
  }
}
