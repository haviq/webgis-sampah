import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import midtransClient from 'midtrans-client'
import dotenv from 'dotenv'

dotenv.config()

function apiPlugin() {
  return {
    name: 'api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/api/charge' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', async () => {
            try {
              const parsedBody = JSON.parse(body);
              const { orderId, grossAmount, customerName, customerEmail } = parsedBody;

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
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ paymentUrl: json.data.payment_url, token: json.data.invoice_id }));
              } else {
                throw new Error(json.error || "Gagal menghubungi bayar.gg");
              }
            } catch (error) {
              console.error("Bayar.gg Error:", error);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: error.message }));
            }
          });
        } else if (req.url.startsWith('/api/webhook') && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', async () => {
            try {
              // Bayar.gg sends form-urlencoded data, NOT JSON. Wait, the docs said JSON?
              // "Format Data: JSON"
              const notificationJson = JSON.parse(body);
              
              // Extract order_id from query parameter
              const urlParams = new URLSearchParams(req.url.split('?')[1]);
              const orderId = urlParams.get('order_id');

              let transactionStatus = notificationJson.status;
              let invoiceId = notificationJson.invoice_id;

              // Since we're in vite, we dynamically import supabase client to use here
              const { createClient } = await import('@supabase/supabase-js');
              
              const supabaseUrl = process.env.VITE_SUPABASE_URL;
              const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
              
              if (!supabaseUrl || !supabaseServiceKey) {
                throw new Error("Supabase credentials missing in environment variables.");
              }

              const supabase = createClient(supabaseUrl, supabaseServiceKey);

              if (orderId && transactionStatus === 'paid') {
                  await supabase.from("pembayaran").update({ status: "sudah" }).eq("id", orderId);
              } else if (orderId && (transactionStatus === 'expired' || transactionStatus === 'failed' || transactionStatus === 'canceled')) {
                  await supabase.from("pembayaran").update({ status: "gagal" }).eq("id", orderId);
              }
              
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ status: "OK", received: true }));
            } catch (error) {
              console.error("Webhook Error:", error);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: error.message }));
            }
          });
        } else if ((req.url.startsWith('/api/charge') || req.url.startsWith('/api/webhook')) && req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.end();
        } else {
          next();
        }
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    apiPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'WebGIS Sampah',
        short_name: 'GIS Sampah',
        description: 'Sistem Informasi Geografis Pengelolaan Sampah Terpadu',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        icons: [
          {
            src: 'icon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
})
