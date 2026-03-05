// dotenvはローカル開発用（.envファイルがある場合のみ読み込み）
// Railway等のPaaSでは環境変数が直接注入されるため不要
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  console.log('[ENV] .envファイルから環境変数を読み込みました');
} else {
  console.log('[ENV] .envファイルなし（PaaS環境変数を使用）');
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { RoomManager } = require('./roomManager');
const { GameFlow } = require('./gameFlow');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 5e6 // 5MB（画像データ用）
});

// 静的ファイル配信
app.use(express.static(path.join(__dirname, '..', 'public')));

// APIキー状態チェック用エンドポイント（値は返さない）
app.get('/api/health', (req, res) => {
  // GEMINI関連の環境変数名だけ抽出（値は出さない）
  const geminiVars = Object.keys(process.env)
    .filter(k => k.toUpperCase().includes('GEMINI') || k.toUpperCase().includes('API'))
    .map(k => ({
      name: k,
      length: process.env[k] ? process.env[k].length : 0,
      preview: process.env[k] ? process.env[k].substring(0, 4) + '...' : '(empty)'
    }));

  res.json({
    apiKeySet: !!process.env.GEMINI_API_KEY,
    apiKeyLength: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0,
    model: process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview',
    envVarCount: Object.keys(process.env).length,
    geminiRelatedVars: geminiVars,
    nodeEnv: process.env.NODE_ENV || '(not set)',
    railway: !!process.env.RAILWAY_ENVIRONMENT_NAME,
    railwayEnv: process.env.RAILWAY_ENVIRONMENT_NAME || '(not set)'
  });
});

const PORT = process.env.PORT || 3000;
const roomManager = new RoomManager();
const gameFlow = new GameFlow(io, roomManager);

// 起動時の環境変数診断
console.log('[ENV] 環境変数一覧:');
console.log(`  GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? `設定済み (${process.env.GEMINI_API_KEY.substring(0, 6)}...)` : '未設定'}`);
console.log(`  GEMINI_MODEL: ${process.env.GEMINI_MODEL || '未設定（デフォルト使用）'}`);
console.log(`  PORT: ${process.env.PORT || '未設定（3000使用）'}`);
console.log(`  NODE_ENV: ${process.env.NODE_ENV || '未設定'}`);

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
  console.log(`Gemini モデル: ${process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview'}`);
});
