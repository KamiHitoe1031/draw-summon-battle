require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { RoomManager } = require('./roomManager');
const { GameFlow } = require('./gameFlow');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 5e6 // 5MB（画像データ用）
});

// 静的ファイル配信
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
const roomManager = new RoomManager();
const gameFlow = new GameFlow(io, roomManager);

// APIキー未設定チェック
if (!process.env.GEMINI_API_KEY) {
  console.warn('警告: GEMINI_API_KEY が設定されていません。.env ファイルを確認してください。');
}

// Socket.IO接続処理
io.on('connection', (socket) => {
  console.log(`[CONN] 接続: ${socket.id}`);

  gameFlow.handleConnection(socket);

  socket.on('disconnect', () => {
    console.log(`[CONN] 切断: ${socket.id}`);
    gameFlow.handleDisconnect(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`サーバー起動: http://localhost:${PORT}`);
  console.log(`Gemini モデル: ${process.env.GEMINI_MODEL || 'gemini-2.5-flash'}`);
});
