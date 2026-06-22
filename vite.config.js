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
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ token: transaction.token }));
            } catch (error) {
              console.error("Midtrans Error:", error);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: error.message }));
            }
          });
        } else if (req.url === '/api/webhook' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', async () => {
            try {
              const notificationJson = JSON.parse(body);
              const apiClient = new midtransClient.Snap({
                isProduction: false,
                serverKey: process.env.MIDTRANS_SERVER_KEY,
                clientKey: process.env.VITE_MIDTRANS_CLIENT_KEY
              });

              const statusResponse = await apiClient.transaction.notification(notificationJson);
              
              let orderId = statusResponse.order_id;
              let transactionStatus = statusResponse.transaction_status;
              let fraudStatus = statusResponse.fraud_status;

              // Since we're in vite, we dynamically import supabase client to use here
              const { createClient } = await import('@supabase/supabase-js');
              
              const supabaseUrl = process.env.VITE_SUPABASE_URL;
              const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
              
              if (!supabaseUrl || !supabaseServiceKey) {
                throw new Error("Supabase credentials missing in environment variables.");
              }

              const supabase = createClient(supabaseUrl, supabaseServiceKey);

              if (transactionStatus === 'capture' || transactionStatus === 'settlement') {
                  if (fraudStatus === 'accept' || !fraudStatus) {
                      await supabase.from("pembayaran").update({ status: "sudah" }).eq("id", orderId);
                  }
              } else if (transactionStatus === 'cancel' || transactionStatus === 'deny' || transactionStatus === 'expire') {
                  await supabase.from("pembayaran").update({ status: "gagal" }).eq("id", orderId);
              }
              
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ status: "OK" }));
            } catch (error) {
              console.error("Webhook Error:", error);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: error.message }));
            }
          });
        } else if ((req.url === '/api/charge' || req.url === '/api/webhook') && req.method === 'OPTIONS') {
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
