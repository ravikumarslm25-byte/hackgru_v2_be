import { createApp } from './src/app.js';
import { connectDB } from './src/config/db.js';
import { checkStorage } from './src/config/s3.js';
import { checkMail } from './src/config/mailer.js';
import { env } from './src/config/env.js';

const start = async () => {
  try {
    await connectDB();
  // Never throws — a storage problem must not stop the site serving pages.
  await checkStorage();
  // Never throws — a mail problem must not stop the site.
  await checkMail();
    const app = createApp();
    const server = app.listen(env.port, () => {
      console.log(`✓ HackGRU API running on http://localhost:${env.port} [${env.nodeEnv}]`);
      console.log(`  Routes are mounted under /api  →  http://localhost:${env.port}/api/health`);
      console.log(`  Client must have API_PORT = ${env.port} in client/src/config/constants.js`);
    });

    // A port conflict is an operational issue, not a code fault. Print a fix
    // instead of an unhandled 'error' event stack trace (the EADDRINUSE crash).
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(
          `✗ Port ${env.port} is already in use — another copy of the server is running.\n` +
          `  Find it:   sudo lsof -i :${env.port}\n` +
          `  With pm2:  pm2 restart hackgru   (don't also run npm start / npm run dev)\n` +
          `  Or free it: sudo kill $(sudo lsof -t -i:${env.port})`
        );
      } else {
        console.error('✗ Server error:', err.message);
      }
      process.exit(1);
    });
  } catch (err) {
    console.error('✗ Failed to start server:', err.message);
    process.exit(1);
  }
};

start();
