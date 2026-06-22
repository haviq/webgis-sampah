const https = require('https');

const data = JSON.stringify({
  amount: 1000,
  description: "Test",
  payment_url: "https://www.bayar.gg/pay",
  callback_url: "https://webgis.haviq.dev/api/webhook?order_id=MY-ORDER-123"
});

const options = {
  hostname: 'www.bayar.gg',
  path: '/api/create-payment.php',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'API-9018d8b971f1d40210a3b4bf76f11f05d065820bb951d50f',
    'Content-Length': data.length
  }
};

const req = https.request(options, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log('Response:', body));
});

req.on('error', error => console.error(error));
req.write(data);
req.end();
