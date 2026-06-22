const https = require('https');

const data = JSON.stringify({ status: "paid" });

const options = {
  hostname: 'webgis.haviq.dev',
  path: '/api/webhook?order_id=TEST',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
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
