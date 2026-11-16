const path = require('path');
const { createApp } = require('./app');

const PORT = process.env.PORT || 3000;

async function main() {
  const { app, close } = await createApp({
    sqlFile: process.env.SQLITE_FILE || path.join(__dirname, '..', 'data.db'),
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017',
    mongoDb: process.env.MONGO_DB || 'polyglot',
    logQueries: true,
  });

  const server = app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });

  // Close both databases when I press Ctrl+C
  process.on('SIGINT', async () => {
    server.close();
    await close();
    console.log('Closed SQLite and MongoDB connections');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Could not start. Is MongoDB running? Try: docker compose up -d');
  console.error(err.message);
  process.exit(1);
});
