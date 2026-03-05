// ルーム管理
class RoomManager {
  constructor() {
    this.rooms = new Map();
    // 30分ごとに古いルームを掃除
    setInterval(() => this.cleanup(), 30 * 60 * 1000);
  }

  // 6桁のルームコードを生成
  generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい文字を除外
    let code;
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }

  // ルーム作成
  createRoom(socketId, playerName) {
    const code = this.generateCode();
    const room = {
      code,
      state: 'waiting',
      host: socketId,
      players: [{
        socketId,
        name: playerName,
        imageData: null,
        declaration: '',
        remainingTime: 0,
        submitted: false,
        evalResult: null,
        stats: null,
        wantsRematch: false
      }],
      theme: null,
      createdAt: Date.now()
    };
    this.rooms.set(code, room);
    return room;
  }

  // ルーム参加
  joinRoom(code, socketId, playerName) {
    const room = this.rooms.get(code);
    if (!room) return { error: 'ルームが見つかりません' };
    if (room.players.length >= 2) return { error: 'ルームが満員です' };
    if (room.state !== 'waiting') return { error: 'ゲームが進行中です' };

    room.players.push({
      socketId,
      name: playerName,
      imageData: null,
      declaration: '',
      remainingTime: 0,
      submitted: false,
      evalResult: null,
      stats: null,
      wantsRematch: false
    });
    room.state = 'ready';
    return { room };
  }

  // プレイヤーの切断処理
  handleDisconnect(socketId, io) {
    for (const [code, room] of this.rooms) {
      const idx = room.players.findIndex(p => p.socketId === socketId);
      if (idx === -1) continue;

      const disconnectedName = room.players[idx].name;
      room.players.splice(idx, 1);

      if (room.players.length === 0) {
        this.rooms.delete(code);
      } else {
        room.state = 'waiting';
        room.host = room.players[0].socketId;
        io.to(room.players[0].socketId).emit('opponent-disconnected', {
          name: disconnectedName
        });
      }
      break;
    }
  }

  // ソケットIDからルームを検索
  getRoomBySocket(socketId) {
    for (const [, room] of this.rooms) {
      if (room.players.some(p => p.socketId === socketId)) {
        return room;
      }
    }
    return null;
  }

  // プレイヤーインデックスを取得（0 or 1）
  getPlayerIndex(room, socketId) {
    return room.players.findIndex(p => p.socketId === socketId);
  }

  // ルームをリセット（リマッチ用）
  resetRoom(room) {
    room.state = 'ready';
    room.theme = null;
    for (const p of room.players) {
      p.imageData = null;
      p.declaration = '';
      p.remainingTime = 0;
      p.submitted = false;
      p.evalResult = null;
      p.stats = null;
      p.wantsRematch = false;
    }
  }

  // 古いルームを掃除（30分以上待機中のルーム）
  cleanup() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000;
    for (const [code, room] of this.rooms) {
      if (now - room.createdAt > maxAge && room.players.length === 0) {
        this.rooms.delete(code);
      }
    }
  }
}

module.exports = { RoomManager };
