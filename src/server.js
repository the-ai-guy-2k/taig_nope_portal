const app = require('./app');
const { initializeOnStartup } = require('./services/localPreservation');

const preservationStartup = initializeOnStartup();
app.locals.preservation = preservationStartup.display;

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`TAIG NOPE Portal listening on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Local preservation: ${preservationStartup.display.message}`);
  console.log('Dashboard: http://localhost:' + PORT + '/dashboard');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error(`ERROR: Port ${PORT} is already in use.`);
    console.error('A stale server process may be serving the old ACI-001 landing page.');
    console.error('Stop the existing process, then run npm start again.');
    console.error('');
    console.error('Windows: netstat -ano | findstr :' + PORT);
    console.error('Then:   taskkill /PID <pid> /F');
    console.error('');
    process.exit(1);
  }

  throw err;
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
