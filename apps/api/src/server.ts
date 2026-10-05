import http from 'node:http';
import { Server } from 'socket.io';
import { app } from './app.js';
import { config } from './config.js';
import { verifyToken } from './auth.js';
import { setIo } from './socket.js';
import { prisma } from './db.js';

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: config.corsOrigin } });

io.use(async (socket, next) => {
  try {
    const token = String(socket.handshake.auth.token ?? '');
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where:{id:payload.id}, select:{id:true,name:true,email:true,role:true,isActive:true} });
    if (!user?.role || !user.isActive) return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  } catch { next(new Error('unauthorized')); }
});

setIo(io);
io.on('connection', socket => { socket.emit('sync:status', { ok:true }); });

server.listen(config.port, () => console.log(`API on http://localhost:${config.port}`));

async function shutdown() {
  io.close();
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
