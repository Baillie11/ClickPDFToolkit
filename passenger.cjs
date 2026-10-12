// Managed-hosting entry point. Passenger/LiteSpeed loads startup files via require().
const { createApp } = require('./server');
const app = createApp();
const server = app.listen(process.env.PORT || 3000, '127.0.0.1');
server.requestTimeout = 60 * 1000;
server.headersTimeout = 15 * 1000;
