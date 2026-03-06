// Socket.IO通信レイヤー
class SocketClient {
  constructor() {
    this.socket = io();
    this.connected = false;

    this.socket.on('connect', () => {
      this.connected = true;
      console.log('[Socket] 接続完了');
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      console.log('[Socket] 切断');
    });
  }

  // イベントリスナー登録
  on(event, callback) {
    this.socket.on(event, callback);
  }

  // ルーム作成
  createRoom(playerName) {
    this.socket.emit('create-room', { playerName });
  }

  // ルーム参加
  joinRoom(code, playerName) {
    this.socket.emit('join-room', { code, playerName });
  }

  // ゲーム開始（ホストのみ）
  startGame() {
    this.socket.emit('start-game');
  }

  // 絵の提出
  submitDrawing(imageData, declaration, remainingTime) {
    this.socket.emit('submit-drawing', { imageData, declaration, remainingTime });
  }

  // バトル開始（ホストのみ）
  requestBattle() {
    this.socket.emit('request-battle');
  }

  // AI再評価（ホストのみ）
  reEvaluate() {
    this.socket.emit('re-evaluate');
  }

  // リマッチ希望
  requestRematch() {
    this.socket.emit('request-rematch');
  }

  // リマッチキャンセル
  cancelRematch() {
    this.socket.emit('cancel-rematch');
  }

  // ルーム離脱
  leaveRoom() {
    this.socket.emit('leave-room');
  }

  // モデル情報取得
  getModel() {
    this.socket.emit('get-model');
  }

  // モデル変更
  setModel(model) {
    this.socket.emit('set-model', { model });
  }

  // APIキー状態チェック
  checkApiKey() {
    this.socket.emit('check-api-key');
  }

  // APIキー手動設定
  setApiKey(apiKey) {
    this.socket.emit('set-api-key', { apiKey });
  }
}
