import midtransClient from 'midtrans-client';

export default async function handler(req, res) {
  // CORS setup for local testing if needed
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { orderId, grossAmount, customerName, customerEmail } = req.body;

    const data = JSON.stringify({
      amount: parseInt(grossAmount, 10),
      description: "Pembayaran Retribusi WebGIS Sampah",
      payment_url: "https://www.bayar.gg/pay",
      callback_url: `https://webgis.haviq.dev/api/webhook?order_id=${orderId}`
    });

    const response = await fetch('https://www.bayar.gg/api/create-payment.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BAYARGG_API_KEY
      },
      body: data
    });
    
    const json = await response.json();

    if (json.success) {
      res.status(200).json({ paymentUrl: json.data.payment_url, token: json.data.invoice_id });
    } else {
      throw new Error(json.error || "Gagal menghubungi bayar.gg");
    }
  } catch (error) {
    console.error("Bayar.gg Error:", error);
    res.status(500).json({ error: error.message });
  }
}
