const app = require('./app');
const { initializeOnStartup } = require('./services/localPreservation');

const preservationStartup = initializeOnStartup();
app.locals.preservation = preservationStartup.display;

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`TAIG NOPE Portal listening on port ${PORT}`);
  console.log(`Local preservation: ${preservationStartup.display.message}`);
});

module.exports = server;
