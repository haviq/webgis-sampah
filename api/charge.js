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

    const snap = new midtransClient.Snap({
      isProduction: false,
      serverKey: process.env.MIDTRANS_SERVER_KEY,
      clientKey: process.env.VITE_MIDTRANS_CLIENT_KEY
    });

    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: parseInt(grossAmount, 10)
      },
      customer_details: {
        first_name: customerName,
        email: customerEmail || 'warga@example.com'
      }
    };

    const transaction = await snap.createTransaction(parameter);
    res.status(200).json({ token: transaction.token });
  } catch (error) {
    console.error("Midtrans Error:", error);
    res.status(500).json({ error: error.message });
  }
}
