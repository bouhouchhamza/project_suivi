import type { Server } from 'socket.io';
export let io: Server | null = null;
export const setIo = (server: Server) => { io = server; };
