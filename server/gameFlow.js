// ゲームフロー制御（状態遷移 + イベント配信）
const { AIEvaluator } = require('./aiEvaluator');
const { BattleEngine } = require('./battleEngine');
const { ChampionStore } = require('./championStore');

class GameFlow {
  constructor(io, roomManager) {
    this.io = io;
    this.roomManager = roomManager;
    this.ai = new AIEvaluator();
    this.battle = new BattleEngine();
    this.champions = new ChampionStore();
    this.timers = new Map();

    this.themes = [
      { name: '海の生物', attribute: '水属性ボーナス' },
      { name: '空の生物', attribute: '風属性ボーナス' },
      { name: '森の生物', attribute: '地属性ボーナス' },
      { name: '火山の生物', attribute: '火属性ボーナス' },
      { name: '氷の世界の生物', attribute: '氷属性ボーナス' },
      { name: '砂漠の生物', attribute: '砂属性ボーナス' },
      { name: '深海の生物', attribute: '闇属性ボーナス' },
      { name: '古代の生物', attribute: '古属性ボーナス' },
      { name: '毒を持つ生物', attribute: '毒属性ボーナス' },
      { name: '夜行性の生物', attribute: '闇属性ボーナス' },
    ];
  }

  // 新しい接続を処理
  handleConnection(socket) {
    socket.on('create-room', (data) => this.onCreateRoom(socket, data));
    socket.on('join-room', (data) => this.onJoinRoom(socket, data));
    socket.on('start-game', () => this.onStartGame(socket));
    socket.on('submit-drawing', (data) => this.onSubmitDrawing(socket, data));
    socket.on('request-battle', () => this.onRequestBattle(socket));
    socket.on('re-evaluate', () => this.onReEvaluate(socket));
    socket.on('request-rematch', () => this.onRequestRematch(socket));
    socket.on('cancel-rematch', () => this.onCancelRematch(socket));
    socket.on('leave-room', () => this.onLeaveRoom(socket));
  }

  // 切断処理
  handleDisconnect(socketId) {
    const room = this.roomManager.getRoomBySocket(socketId);
    if (room) {
      // タイマー停止
      this.stopTimer(room.code);
    }
    this.roomManager.handleDisconnect(socketId, this.io);
  }

  // ルーム作成
  onCreateRoom(socket, { playerName }) {
    // 既存のルームにいたら離脱
    this.leaveCurrentRoom(socket);

    const name = (playerName || '').trim() || 'プレイヤー';
    const room = this.roomManager.createRoom(socket.id, name);
    socket.join(room.code);

    console.log(`[ROOM] 作成: ${room.code} by ${name}`);
    socket.emit('room-created', { code: room.code, playerName: name });
  }

  // ルーム参加
  onJoinRoom(socket, { code, playerName }) {
    this.leaveCurrentRoom(socket);

    const name = (playerName || '').trim() || 'プレイヤー';
    const upperCode = (code || '').toUpperCase().trim();

    const result = this.roomManager.joinRoom(upperCode, socket.id, name);
    if (result.error) {
      socket.emit('join-error', { error: result.error });
      return;
    }

    socket.join(upperCode);
    const room = result.room;
    const host = room.players[0];

    console.log(`[ROOM] 参加: ${upperCode} by ${name}`);

    // ホストに通知
    this.io.to(host.socketId).emit('opponent-joined', {
      name: name
    });

    // 参加者に成功を通知
    socket.emit('join-success', {
      code: upperCode,
      opponent: host.name
    });
  }

  // ゲーム開始（ホストのみ）
  onStartGame(socket) {
    const room = this.roomManager.getRoomBySocket(socket.id);
    if (!room || room.host !== socket.id) return;
    if (room.players.length < 2) return;
    if (room.state !== 'ready') return;

    // お題をランダム選出
    room.theme = this.themes[Math.floor(Math.random() * this.themes.length)];
    room.state = 'theme';

    console.log(`[GAME] 開始: ${room.code} お題: ${room.theme.name}`);

    // 両者にお題を通知
    this.io.to(room.code).emit('game-start', {
      theme: room.theme,
      players: room.players.map(p => p.name)
    });

    // 3秒後にお絵描きフェーズ開始
    setTimeout(() => {
      if (room.state !== 'theme') return;
      room.state = 'drawing';
      this.io.to(room.code).emit('drawing-start');
      this.startTimer(room);
    }, 3000);
  }

  // タイマー開始
  startTimer(room) {
    let timeLeft = 40;

    const interval = setInterval(() => {
      timeLeft--;
      this.io.to(room.code).emit('timer-sync', { timeLeft });

      if (timeLeft <= 0) {
        clearInterval(interval);
        this.timers.delete(room.code);
        this.io.to(room.code).emit('timer-end');
      }
    }, 1000);

    this.timers.set(room.code, interval);
  }

  // タイマー停止
  stopTimer(code) {
    const interval = this.timers.get(code);
    if (interval) {
      clearInterval(interval);
      this.timers.delete(code);
    }
  }

  // 絵の提出
  onSubmitDrawing(socket, { imageData, declaration, remainingTime }) {
    const room = this.roomManager.getRoomBySocket(socket.id);
    if (!room) return;

    const playerIdx = this.roomManager.getPlayerIndex(room, socket.id);
    const player = room.players[playerIdx];

    if (player.submitted) return; // 二重提出防止

    player.imageData = imageData;
    player.declaration = declaration;
    player.remainingTime = remainingTime;
    player.submitted = true;

    console.log(`[DRAW] 提出: ${player.name} 宣言:${declaration} 残り:${remainingTime}秒`);

    // 相手に提出済みを通知
    const opponentIdx = 1 - playerIdx;
    if (room.players[opponentIdx]) {
      this.io.to(room.players[opponentIdx].socketId).emit('opponent-submitted');
    }

    // 自分に提出確認
    socket.emit('submit-accepted');

    // 両方提出したらAI評価開始
    if (room.players.every(p => p.submitted)) {
      this.stopTimer(room.code);
      this.startEvaluation(room);
    }
  }

  // AI評価
  async startEvaluation(room) {
    room.state = 'evaluating';

    // チャンピオンデータを送信（スライドショー用）
    this.io.to(room.code).emit('eval-start', {
      champions: this.champions.getAll()
    });

    try {
      for (let i = 0; i < 2; i++) {
        const player = room.players[i];
        this.io.to(room.code).emit('eval-progress', {
          message: `${player.name}の絵を解析中...`
        });

        console.log(`[EVAL] P${i + 1}開始: 宣言=${player.declaration} 残り=${player.remainingTime}秒`);

        const evalResult = await this.ai.evaluate(
          player.imageData,
          room.theme.name,
          player.declaration
        );
        player.evalResult = evalResult;
        player.stats = this.ai.calculateStats(evalResult, player.remainingTime);

        console.log(`[EVAL] P${i + 1}完了: ${JSON.stringify(player.stats)}`);
      }

      // 結果を両者に送信
      room.state = 'reveal';
      this.io.to(room.code).emit('eval-complete', {
        players: room.players.map((p, i) => ({
          index: i,
          name: p.name,
          imageData: p.imageData,
          declaration: p.declaration,
          stats: p.stats
        }))
      });

    } catch (error) {
      console.error('[EVAL] エラー:', error);
      this.io.to(room.code).emit('eval-error', { error: error.message });
    }
  }

  // AI再評価（同じ絵で再度評価、テスト用）
  async onReEvaluate(socket) {
    const room = this.roomManager.getRoomBySocket(socket.id);
    if (!room || room.host !== socket.id) return;
    if (room.state !== 'reveal') return;

    console.log(`[EVAL] 再評価開始: ${room.code}`);
    room.state = 'evaluating';
    this.io.to(room.code).emit('eval-start', {
      champions: this.champions.getAll()
    });

    try {
      for (let i = 0; i < 2; i++) {
        const player = room.players[i];
        this.io.to(room.code).emit('eval-progress', {
          message: `${player.name}の絵を再解析中...`
        });

        const evalResult = await this.ai.evaluate(
          player.imageData,
          room.theme.name,
          player.declaration
        );
        player.evalResult = evalResult;
        player.stats = this.ai.calculateStats(evalResult, player.remainingTime);

        console.log(`[RE-EVAL] P${i + 1}完了: ${JSON.stringify(player.stats)}`);
      }

      room.state = 'reveal';
      this.io.to(room.code).emit('eval-complete', {
        players: room.players.map((p, i) => ({
          index: i,
          name: p.name,
          imageData: p.imageData,
          declaration: p.declaration,
          stats: p.stats
        }))
      });
    } catch (error) {
      console.error('[RE-EVAL] エラー:', error);
      room.state = 'reveal';
      this.io.to(room.code).emit('eval-error', { error: error.message });
    }
  }

  // バトル開始（ホストのみ）
  async onRequestBattle(socket) {
    const room = this.roomManager.getRoomBySocket(socket.id);
    if (!room || room.host !== socket.id) return;
    if (room.state !== 'reveal') return;

    room.state = 'battle';
    this.io.to(room.code).emit('battle-start');

    const stats1 = room.players[0].stats;
    const stats2 = room.players[1].stats;

    const roomCode = room.code;

    const callbacks = {
      onStart: (c1, c2) => {
        this.io.to(roomCode).emit('battle-init', {
          c1: { currentHp: c1.currentHp, maxHp: c1.maxHp },
          c2: { currentHp: c2.currentHp, maxHp: c2.maxHp }
        });
      },
      onTurnStart: (turn) => {
        this.io.to(roomCode).emit('battle-turn', { turn });
      },
      onUpdate: (c1, c2) => {
        this.io.to(roomCode).emit('battle-update', {
          c1: { currentHp: c1.currentHp, maxHp: c1.maxHp },
          c2: { currentHp: c2.currentHp, maxHp: c2.maxHp }
        });
      },
      onAttack: (attackerId, defenderId, damage) => {
        this.io.to(roomCode).emit('battle-attack', { attackerId, defenderId, damage });
      },
      onMiss: (defenderId) => {
        this.io.to(roomCode).emit('battle-miss', { defenderId });
      },
      onLog: (action) => {
        this.io.to(roomCode).emit('battle-log', { action });
      },
      onEnd: (winner, c1, c2) => {
        // 勝者をチャンピオンに記録
        let winnerIdx = null;
        if (winner === 1) winnerIdx = 0;
        else if (winner === 2) winnerIdx = 1;

        if (winnerIdx !== null) {
          const p = room.players[winnerIdx];
          this.champions.add({
            playerName: p.name,
            creatureName: p.stats.name,
            type: p.stats.type,
            totalPoints: p.stats.totalPoints,
            theme: room.theme.name,
            imageData: p.imageData,
            hp: p.stats.hp,
            atk: p.stats.atk,
            def: p.stats.def,
            spd: p.stats.spd
          });
        }

        this.io.to(roomCode).emit('battle-end', {
          winner,
          c1: { currentHp: c1.currentHp, maxHp: c1.maxHp },
          c2: { currentHp: c2.currentHp, maxHp: c2.maxHp },
          debugLog: this.battle.getDebugLogText()
        });

        room.state = 'result';
      }
    };

    await this.battle.runBattle(stats1, stats2, callbacks);
  }

  // リマッチ希望
  onRequestRematch(socket) {
    const room = this.roomManager.getRoomBySocket(socket.id);
    if (!room || room.state !== 'result') return;

    const playerIdx = this.roomManager.getPlayerIndex(room, socket.id);
    room.players[playerIdx].wantsRematch = true;

    const opponentIdx = 1 - playerIdx;
    const opponent = room.players[opponentIdx];

    // 相手に通知
    this.io.to(opponent.socketId).emit('rematch-requested', {
      from: room.players[playerIdx].name
    });

    // 自分に確認
    socket.emit('rematch-waiting');

    // 両方がリマッチ希望なら再開
    if (room.players.every(p => p.wantsRematch)) {
      this.roomManager.resetRoom(room);
      console.log(`[ROOM] リマッチ: ${room.code}`);
      this.io.to(room.code).emit('rematch-accepted');
    }
  }

  // リマッチキャンセル
  onCancelRematch(socket) {
    const room = this.roomManager.getRoomBySocket(socket.id);
    if (!room) return;

    const playerIdx = this.roomManager.getPlayerIndex(room, socket.id);
    room.players[playerIdx].wantsRematch = false;
  }

  // ルーム離脱
  onLeaveRoom(socket) {
    this.leaveCurrentRoom(socket);
  }

  // 現在のルームから離脱
  leaveCurrentRoom(socket) {
    const room = this.roomManager.getRoomBySocket(socket.id);
    if (!room) return;

    this.stopTimer(room.code);
    socket.leave(room.code);
    this.roomManager.handleDisconnect(socket.id, this.io);
  }
}

module.exports = { GameFlow };
