// オンライン対戦ゲーム管理
class Game {
  constructor() {
    this.socket = new SocketClient();
    this.canvas = null;

    // 自分の情報
    this.playerName = '';
    this.isHost = false;
    this.roomCode = '';

    // ゲーム状態
    this.currentTheme = null;
    this.players = []; // サーバーから受信したプレイヤーデータ
    this.opponentName = '';
    this.timeLeft = 40;
    this.drawingLocked = false;
    this.submitted = false;
    this.opponentSubmitted = false;

    // 歴代チャンピオン
    this.hallOfFame = [];
    this.hofIndex = 0;
    this.hofSlideInterval = null;

    // デバッグログ
    this.debugLogText = '';

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupSocketEvents();
  }

  // --- UI イベントリスナー ---
  setupEventListeners() {
    // ロビー
    document.getElementById('btn-create-room').addEventListener('click', () => this.createRoom());
    document.getElementById('btn-join-room').addEventListener('click', () => this.joinRoom());
    document.getElementById('input-room-code').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.joinRoom();
    });

    // 待機画面
    document.getElementById('btn-copy-code').addEventListener('click', () => this.copyRoomCode());
    document.getElementById('btn-leave-waiting').addEventListener('click', () => this.leaveRoom());

    // レディ画面
    document.getElementById('btn-start-game').addEventListener('click', () => this.socket.startGame());

    // お絵描き
    this.setupDrawingTools();
    document.getElementById('btn-submit-draw').addEventListener('click', () => this.submitDrawing());

    // 設定画面
    document.getElementById('btn-settings').addEventListener('click', () => this.openSettings());
    document.getElementById('btn-save-settings').addEventListener('click', () => this.saveSettings());
    document.getElementById('btn-back-lobby').addEventListener('click', () => this.showScreen('lobby'));

    // ステータス発表
    document.getElementById('btn-start-battle').addEventListener('click', () => this.socket.requestBattle());
    document.getElementById('btn-re-evaluate').addEventListener('click', () => this.reEvaluate());
    document.getElementById('btn-toggle-reveal-debug').addEventListener('click', () => this.toggleRevealDebug());
    document.getElementById('btn-copy-reveal-debug').addEventListener('click', () => this.copyRevealDebug());

    // 結果
    document.getElementById('btn-rematch').addEventListener('click', () => this.requestRematch());
    document.getElementById('btn-to-lobby').addEventListener('click', () => this.backToLobby());
    document.getElementById('btn-debug-log').addEventListener('click', () => this.toggleDebugLog());
    document.getElementById('btn-copy-debug').addEventListener('click', () => this.copyDebugLog());
  }

  setupDrawingTools() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (this.canvas) this.canvas.setTool(btn.dataset.tool);
      });
    });

    document.getElementById('color-palette').addEventListener('click', (e) => {
      const btn = e.target.closest('.color-btn');
      if (!btn) return;
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (this.canvas) this.canvas.setColor(btn.dataset.color);
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('[data-tool="pen"]').classList.add('active');
    });

    const brushSlider = document.getElementById('brush-size');
    const brushPreview = document.getElementById('brush-preview');
    brushSlider.addEventListener('input', () => {
      const size = parseInt(brushSlider.value);
      if (this.canvas) this.canvas.setBrushSize(size);
      brushPreview.style.width = size + 'px';
      brushPreview.style.height = size + 'px';
    });

    document.getElementById('btn-undo').addEventListener('click', () => {
      if (this.canvas) this.canvas.undo();
    });

    document.getElementById('btn-clear').addEventListener('click', () => {
      if (this.canvas) this.canvas.clearWithSave();
    });
  }

  // --- Socket.IO イベント ---
  setupSocketEvents() {
    // ルーム関連
    this.socket.on('room-created', (data) => this.onRoomCreated(data));
    this.socket.on('join-success', (data) => this.onJoinSuccess(data));
    this.socket.on('join-error', (data) => this.onJoinError(data));
    this.socket.on('opponent-joined', (data) => this.onOpponentJoined(data));
    this.socket.on('opponent-disconnected', (data) => this.onOpponentDisconnected(data));

    // ゲームフロー
    this.socket.on('game-start', (data) => this.onGameStart(data));
    this.socket.on('drawing-start', () => this.onDrawingStart());
    this.socket.on('timer-sync', (data) => this.onTimerSync(data));
    this.socket.on('timer-end', () => this.onTimerEnd());
    this.socket.on('opponent-submitted', () => this.onOpponentSubmitted());
    this.socket.on('submit-accepted', () => this.onSubmitAccepted());

    // AI評価
    this.socket.on('eval-start', (data) => this.onEvalStart(data));
    this.socket.on('eval-progress', (data) => this.onEvalProgress(data));
    this.socket.on('eval-complete', (data) => this.onEvalComplete(data));
    this.socket.on('eval-error', (data) => this.onEvalError(data));

    // バトル
    this.socket.on('battle-start', () => this.onBattleStart());
    this.socket.on('battle-init', (data) => this.onBattleInit(data));
    this.socket.on('battle-turn', (data) => this.onBattleTurn(data));
    this.socket.on('battle-update', (data) => this.onBattleUpdate(data));
    this.socket.on('battle-attack', (data) => this.onBattleAttack(data));
    this.socket.on('battle-miss', (data) => this.onBattleMiss(data));
    this.socket.on('battle-log', (data) => this.onBattleLog(data));
    this.socket.on('battle-end', (data) => this.onBattleEnd(data));

    // リマッチ
    this.socket.on('rematch-requested', (data) => this.onRematchRequested(data));
    this.socket.on('rematch-waiting', () => this.onRematchWaiting());
    this.socket.on('rematch-accepted', () => this.onRematchAccepted());

    // 設定
    this.socket.on('model-info', (data) => this.onModelInfo(data));
    this.socket.on('model-updated', (data) => this.onModelUpdated(data));
    this.socket.on('model-error', (data) => this.onModelError(data));

    // APIキー状態・ゲーム開始エラー
    this.socket.on('api-key-status', (data) => this.onApiKeyStatus(data));
    this.socket.on('game-start-error', (data) => this.onGameStartError(data));
  }

  // --- 画面切り替え ---
  showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${name}`).classList.add('active');
  }

  // --- ロビー操作 ---
  createRoom() {
    this.playerName = document.getElementById('input-player-name').value.trim() || 'プレイヤー';
    this.isHost = true;
    this.socket.createRoom(this.playerName);
  }

  joinRoom() {
    this.playerName = document.getElementById('input-player-name').value.trim() || 'プレイヤー';
    const code = document.getElementById('input-room-code').value.trim();
    if (!code) {
      document.getElementById('input-room-code').style.borderColor = '#e74c3c';
      setTimeout(() => { document.getElementById('input-room-code').style.borderColor = ''; }, 1000);
      return;
    }
    this.isHost = false;
    this.socket.joinRoom(code, this.playerName);
  }

  copyRoomCode() {
    navigator.clipboard.writeText(this.roomCode).then(() => {
      const btn = document.getElementById('btn-copy-code');
      btn.textContent = 'コピー済み！';
      setTimeout(() => { btn.textContent = 'コピー'; }, 2000);
    });
  }

  leaveRoom() {
    this.socket.leaveRoom();
    this.showScreen('lobby');
  }

  // --- 設定 ---
  openSettings() {
    this.socket.getModel();
    this.showScreen('settings');
  }

  saveSettings() {
    const model = document.getElementById('select-model').value;
    this.socket.setModel(model);
  }

  onModelInfo({ model }) {
    const select = document.getElementById('select-model');
    if (select.querySelector(`option[value="${model}"]`)) {
      select.value = model;
    }
    document.getElementById('current-model-info').textContent = `現在のモデル: ${model}`;
  }

  onModelUpdated({ model }) {
    document.getElementById('current-model-info').textContent = `保存しました: ${model}`;
    document.getElementById('current-model-info').style.color = '#2ecc71';
    setTimeout(() => {
      document.getElementById('current-model-info').style.color = '';
    }, 2000);
  }

  onModelError({ error }) {
    document.getElementById('current-model-info').textContent = error;
    document.getElementById('current-model-info').style.color = '#e74c3c';
  }

  backToLobby() {
    this.socket.leaveRoom();
    this.showScreen('lobby');
  }

  // --- APIキー状態 ---
  onApiKeyStatus({ available }) {
    const warningEl = document.getElementById('api-key-warning');
    if (!available) {
      warningEl.style.display = 'block';
      warningEl.textContent = 'GEMINI_API_KEYがサーバーに設定されていません。Railwayの環境変数を確認してください。ゲームを開始してもAI評価が失敗します。';
    } else {
      warningEl.style.display = 'none';
    }
  }

  onGameStartError({ error }) {
    alert(error);
  }

  // --- ルームイベントハンドラ ---
  onRoomCreated({ code }) {
    this.roomCode = code;
    document.getElementById('room-code-value').textContent = code;
    // 部屋作成時にAPIキーが設定されているか確認
    this.socket.checkApiKey();
    this.showScreen('waiting');
  }

  onJoinSuccess({ code, opponent }) {
    this.roomCode = code;
    this.opponentName = opponent;
    // 参加時にもAPIキーチェック
    this.socket.checkApiKey();
    this.showReady(opponent, this.playerName);
  }

  onJoinError({ error }) {
    alert(error);
  }

  onOpponentJoined({ name }) {
    this.opponentName = name;
    this.showReady(this.playerName, name);
  }

  onOpponentDisconnected({ name }) {
    alert(`${name}が切断しました`);
    if (this.isHost) {
      document.getElementById('room-code-value').textContent = this.roomCode;
      this.showScreen('waiting');
    } else {
      this.showScreen('lobby');
    }
  }

  showReady(p1Name, p2Name) {
    document.getElementById('ready-p1-name').textContent = p1Name;
    document.getElementById('ready-p2-name').textContent = p2Name;

    const startBtn = document.getElementById('btn-start-game');
    const waitMsg = document.getElementById('ready-wait-msg');

    if (this.isHost) {
      startBtn.style.display = '';
      waitMsg.style.display = 'none';
    } else {
      startBtn.style.display = 'none';
      waitMsg.style.display = '';
    }

    this.showScreen('ready');
  }

  // --- ゲームフローハンドラ ---
  onGameStart({ theme, players }) {
    this.currentTheme = theme;
    this.submitted = false;
    this.opponentSubmitted = false;

    document.getElementById('theme-name').textContent = theme.name;
    document.getElementById('theme-attribute').textContent = theme.attribute;
    this.showScreen('theme');
  }

  onDrawingStart() {
    // キャンバス初期化
    if (!this.canvas) {
      this.canvas = new DrawingCanvas('draw-canvas');
    } else {
      this.canvas.reset();
    }

    // UI更新
    document.getElementById('player-indicator').textContent = this.playerName;
    document.getElementById('theme-badge').textContent = this.currentTheme.name;
    document.getElementById('input-declare').value = '';
    document.getElementById('opponent-status').textContent = '';
    this.submitted = false;
    this.opponentSubmitted = false;
    this.drawingLocked = false;
    this.timeLeft = 40;

    // キャンバスのロック解除
    const canvasEl = document.getElementById('draw-canvas');
    canvasEl.style.pointerEvents = '';
    canvasEl.style.opacity = '';

    // ツールリセット
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-tool="pen"]').classList.add('active');
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-color="#000000"]').classList.add('active');
    document.getElementById('brush-size').value = 5;
    document.getElementById('brush-preview').style.width = '5px';
    document.getElementById('brush-preview').style.height = '5px';

    // 提出ボタン有効化
    document.getElementById('btn-submit-draw').disabled = false;
    document.getElementById('btn-submit-draw').textContent = '提出！';

    this.showScreen('draw');
  }

  onTimerSync({ timeLeft }) {
    this.timeLeft = timeLeft;
    this.updateTimerDisplay();
  }

  onTimerEnd() {
    this.drawingLocked = true;

    // キャンバスを操作不能にする
    const canvasEl = document.getElementById('draw-canvas');
    canvasEl.style.pointerEvents = 'none';
    canvasEl.style.opacity = '0.7';

    // ヘッダー更新
    document.getElementById('timer').textContent = '—';
    document.getElementById('timer').classList.remove('danger');
    document.getElementById('player-indicator').textContent = `${this.playerName}：名前をつけて提出！`;

    document.getElementById('input-declare').focus();
  }

  onOpponentSubmitted() {
    this.opponentSubmitted = true;
    document.getElementById('opponent-status').textContent = '相手: 提出済み';
    document.getElementById('opponent-status').classList.add('submitted');
  }

  onSubmitAccepted() {
    // 相手がまだ提出していない場合は待機画面を表示
    if (!this.opponentSubmitted) {
      this.showScreen('submitted');
    }
    // 両方提出済みならeval-startイベントで画面遷移
  }

  updateTimerDisplay() {
    const timerEl = document.getElementById('timer');
    timerEl.textContent = this.timeLeft;
    if (this.timeLeft <= 10) {
      timerEl.classList.add('danger');
    } else {
      timerEl.classList.remove('danger');
    }
  }

  // 絵の提出
  submitDrawing() {
    if (this.submitted) return;

    const declaration = document.getElementById('input-declare').value.trim();
    if (!declaration) {
      document.getElementById('input-declare').focus();
      document.getElementById('input-declare').style.borderColor = '#e74c3c';
      setTimeout(() => { document.getElementById('input-declare').style.borderColor = ''; }, 1000);
      return;
    }

    const imageData = this.canvas.getImageData();
    const remainingTime = this.drawingLocked ? 0 : this.timeLeft;

    this.submitted = true;
    document.getElementById('btn-submit-draw').disabled = true;
    document.getElementById('btn-submit-draw').textContent = '提出済み';

    this.socket.submitDrawing(imageData, declaration, remainingTime);
  }

  // --- AI評価ハンドラ ---
  onEvalStart({ champions }) {
    this.hallOfFame = champions || [];
    this.showScreen('evaluating');
    this.startHallOfFameSlide();
  }

  onEvalProgress({ message }) {
    document.getElementById('eval-status').textContent = message;
  }

  onEvalComplete({ players }) {
    this.players = players;
    this.stopHallOfFameSlide();
    // 再評価ボタンリセット
    const reEvalBtn = document.getElementById('btn-re-evaluate');
    reEvalBtn.disabled = false;
    reEvalBtn.textContent = 'AI再評価';
    this.showRevealScreen(players);
  }

  onEvalError({ error }) {
    document.getElementById('eval-status').innerHTML =
      `エラー: ${error}<br><br><button class="btn btn-secondary" onclick="window.game.backToLobby()">ロビーへ</button>`;
  }

  // ステータス発表画面を構築
  showRevealScreen(players) {
    for (let i = 0; i < 2; i++) {
      const pId = i + 1; // 表示用ID（1, 2）
      const p = players[i];
      const stats = p.stats;

      // プレイヤーネーム
      document.getElementById(`creature-player-${pId}`).textContent = p.name;

      // 絵をコピー
      const srcImg = new Image();
      srcImg.onload = () => {
        const revealCanvas = document.getElementById(`reveal-canvas-${pId}`);
        const rCtx = revealCanvas.getContext('2d');
        rCtx.clearRect(0, 0, revealCanvas.width, revealCanvas.height);
        rCtx.drawImage(srcImg, 0, 0, revealCanvas.width, revealCanvas.height);
      };
      srcImg.src = p.imageData;

      // 名前・タイプ
      document.getElementById(`creature-name-${pId}`).textContent = stats.name;
      document.getElementById(`creature-type-${pId}`).textContent =
        `${stats.type} ─ ${stats.ability}（${stats.abilityDesc}）`;

      // 評価グレード
      const gradesEl = document.getElementById(`eval-grades-${pId}`);
      gradesEl.innerHTML = `
        <span class="grade-badge grade-${stats.quality}" title="${stats.qualityReason}">画質 ${stats.quality}</span>
        <span class="grade-badge grade-${stats.match}" title="${stats.matchReason}">適合 ${stats.match}</span>
        <span class="grade-badge grade-B" title="時間ボーナス +${stats.timeBonus}">時間 +${stats.timeBonus}</span>
      `;

      // ステータスバー
      const maxStat = Math.max(stats.hp, stats.atk, stats.def, stats.spd, 10);
      const statsEl = document.getElementById(`creature-stats-${pId}`);
      statsEl.innerHTML = ['hp', 'atk', 'def', 'spd'].map(key => {
        const label = { hp: 'HP', atk: 'ATK', def: 'DEF', spd: 'SPD' }[key];
        const pct = (stats[key] / maxStat) * 100;
        return `
          <div class="stat-row">
            <span class="stat-label">${label}</span>
            <div class="stat-bar-bg"><div class="stat-bar ${key}" style="width:${pct}%"></div></div>
            <span class="stat-value">${stats[key]}</span>
          </div>
        `;
      }).join('');

      // 合計
      document.getElementById(`creature-total-${pId}`).textContent =
        `合計 ${stats.totalPoints}pt（基礎20 ×${stats.qualityMultiplier} ${stats.matchBonus >= 0 ? '+' : ''}${stats.matchBonus} +時間${stats.timeBonus}）`;

      // コメント
      document.getElementById(`creature-comment-${pId}`).textContent = stats.comment;
    }

    // ホストのみバトル開始・再評価ボタン表示
    const battleBtn = document.getElementById('btn-start-battle');
    const reEvalBtn = document.getElementById('btn-re-evaluate');
    const waitMsg = document.getElementById('reveal-wait-msg');
    if (this.isHost) {
      battleBtn.style.display = '';
      reEvalBtn.style.display = '';
      waitMsg.style.display = 'none';
    } else {
      battleBtn.style.display = 'none';
      reEvalBtn.style.display = 'none';
      waitMsg.style.display = '';
    }

    // デバッグログ構築
    this.buildRevealDebugLog(players);
    document.getElementById('reveal-debug-area').style.display = 'none';

    this.showScreen('reveal');
  }

  // AI再評価
  reEvaluate() {
    document.getElementById('btn-re-evaluate').disabled = true;
    document.getElementById('btn-re-evaluate').textContent = '再評価中...';
    this.socket.reEvaluate();
  }

  // reveal画面のデバッグログ構築
  buildRevealDebugLog(players) {
    const lines = [];
    lines.push('===== AI評価ログ =====');
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const s = p.stats;
      lines.push(`\n--- ${p.name} ---`);
      lines.push(`宣言: ${p.declaration}`);
      lines.push(`画質: ${s.quality} (${s.qualityReason})`);
      lines.push(`適合: ${s.match} (${s.matchReason})`);
      lines.push(`タイプ: ${s.type} / 能力: ${s.ability}（${s.abilityDesc}）`);
      lines.push(`HP=${s.hp} ATK=${s.atk} DEF=${s.def} SPD=${s.spd}`);
      lines.push(`合計=${s.totalPoints}pt (基礎20 ×${s.qualityMultiplier} +マッチ${s.matchBonus} +時間${s.timeBonus})`);
      lines.push(`バトルHP=${s.battleHp} 二つ名=${s.name}`);
      lines.push(`コメント: ${s.comment}`);
    }
    document.getElementById('reveal-debug-content').textContent = lines.join('\n');
  }

  // reveal画面デバッグログ表示切替
  toggleRevealDebug() {
    const area = document.getElementById('reveal-debug-area');
    area.style.display = area.style.display === 'none' ? 'block' : 'none';
  }

  // reveal画面デバッグログコピー
  copyRevealDebug() {
    const text = document.getElementById('reveal-debug-content').textContent;
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('btn-copy-reveal-debug');
      btn.textContent = 'コピー済み！';
      setTimeout(() => { btn.textContent = 'コピー'; }, 2000);
    });
  }

  // --- バトルハンドラ ---
  onBattleStart() {
    this.showScreen('battle');
    document.getElementById('battle-log').innerHTML = '';

    if (this.players.length >= 2) {
      for (let i = 0; i < 2; i++) {
        const pId = i + 1;
        const p = this.players[i];
        const stats = p.stats;

        // 絵をコピー
        const srcImg = new Image();
        srcImg.onload = () => {
          const battleCanvas = document.getElementById(`battle-canvas-${pId}`);
          const bCtx = battleCanvas.getContext('2d');
          bCtx.clearRect(0, 0, battleCanvas.width, battleCanvas.height);
          bCtx.drawImage(srcImg, 0, 0, battleCanvas.width, battleCanvas.height);
        };
        srcImg.src = p.imageData;

        document.getElementById(`battle-name-${pId}`).textContent = stats.name;
        document.getElementById(`battle-stats-${pId}`).textContent =
          `ATK:${stats.atk} DEF:${stats.def} SPD:${stats.spd} [${stats.type}]`;
      }
    }
  }

  onBattleInit({ c1, c2 }) {
    this.updateHpBar(1, c1.currentHp, c1.maxHp);
    this.updateHpBar(2, c2.currentHp, c2.maxHp);
  }

  onBattleTurn({ turn }) {
    document.getElementById('turn-counter').textContent = `Turn ${turn}`;
  }

  onBattleUpdate({ c1, c2 }) {
    this.updateHpBar(1, c1.currentHp, c1.maxHp);
    this.updateHpBar(2, c2.currentHp, c2.maxHp);
  }

  onBattleAttack({ attackerId, defenderId, damage }) {
    const attackCanvas = document.getElementById(`battle-canvas-${attackerId}`);
    const defenseCanvas = document.getElementById(`battle-canvas-${defenderId}`);
    attackCanvas.classList.add('attack');
    setTimeout(() => {
      attackCanvas.classList.remove('attack');
      defenseCanvas.classList.add('shake');
      this.showDamagePopup(defenderId, damage);
      setTimeout(() => defenseCanvas.classList.remove('shake'), 300);
    }, 400);
  }

  onBattleMiss({ defenderId }) {
    const effectEl = document.getElementById('battle-effect');
    effectEl.textContent = 'MISS!';
    effectEl.style.color = '#95a5a6';
    setTimeout(() => { effectEl.textContent = ''; }, 800);
  }

  onBattleLog({ action }) {
    this.addBattleLog(action);
  }

  onBattleEnd({ winner, c1, c2, debugLog }) {
    this.debugLogText = debugLog || '';
    this.showResult(winner);
  }

  updateHpBar(playerId, currentHp, maxHp) {
    const pct = Math.max(0, (currentHp / maxHp) * 100);
    const bar = document.getElementById(`hp-bar-${playerId}`);
    bar.style.width = pct + '%';
    if (pct < 30) bar.classList.add('low');
    else bar.classList.remove('low');
    document.getElementById(`hp-text-${playerId}`).textContent = `${Math.max(0, currentHp)} / ${maxHp}`;
  }

  showDamagePopup(playerId, damage) {
    const canvas = document.getElementById(`battle-canvas-${playerId}`);
    const popup = document.createElement('div');
    popup.className = 'damage-popup';
    popup.textContent = `-${damage}`;
    popup.style.left = canvas.offsetLeft + canvas.offsetWidth / 2 - 20 + 'px';
    popup.style.top = canvas.offsetTop + 'px';
    canvas.parentElement.appendChild(popup);
    setTimeout(() => popup.remove(), 800);
  }

  addBattleLog(action) {
    const log = document.getElementById('battle-log');
    const div = document.createElement('div');

    let className = '';
    if (action.type === 'attack') className = 'log-damage';
    else if (action.type === 'heal' || action.type === 'poison') className = action.type === 'heal' ? 'log-heal' : 'log-damage';
    else if (action.type === 'ability') className = 'log-ability';
    else if (action.type === 'miss' || action.type === 'paralyzed') className = 'log-miss';

    div.innerHTML = `<span class="${className}">${action.message}</span>`;
    log.appendChild(div);
    log.parentElement.scrollTop = log.parentElement.scrollHeight;
  }

  // --- 結果表示 ---
  showResult(winner) {
    const titleEl = document.getElementById('result-title');

    // 勝者名を取得
    let winnerName = '';
    if (winner === 1 && this.players[0]) winnerName = this.players[0].name;
    else if (winner === 2 && this.players[1]) winnerName = this.players[1].name;

    if (winner === 'draw') {
      titleEl.textContent = '引き分け！';
      titleEl.className = 'result-title draw';
    } else {
      titleEl.textContent = `${winnerName}の勝利！`;
      titleEl.className = `result-title p${winner}-win`;
    }

    // 結果画面の絵をコピー
    for (let i = 0; i < 2; i++) {
      const pId = i + 1;
      if (!this.players[i]) continue;

      const srcImg = new Image();
      srcImg.onload = () => {
        const resultCanvas = document.getElementById(`result-canvas-${pId}`);
        const rCtx = resultCanvas.getContext('2d');
        rCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
        rCtx.drawImage(srcImg, 0, 0, resultCanvas.width, resultCanvas.height);
      };
      srcImg.src = this.players[i].imageData;
      document.getElementById(`result-name-${pId}`).textContent = this.players[i].stats.name;

      const creatureEl = document.getElementById(`result-canvas-${pId}`).parentElement;
      creatureEl.classList.remove('winner');
      if (winner === pId) creatureEl.classList.add('winner');
    }

    // リマッチ状態リセット
    document.getElementById('rematch-status').style.display = 'none';
    document.getElementById('btn-rematch').disabled = false;
    document.getElementById('btn-rematch').textContent = 'もう1戦！';

    // デバッグログ
    document.getElementById('debug-log-area').style.display = 'none';
    this.prepareDebugLog();

    setTimeout(() => this.showScreen('result'), 1000);
  }

  // --- リマッチ ---
  requestRematch() {
    this.socket.requestRematch();
    document.getElementById('btn-rematch').disabled = true;
    document.getElementById('btn-rematch').textContent = 'リマッチ待機中...';
  }

  onRematchRequested({ from }) {
    const statusEl = document.getElementById('rematch-status');
    statusEl.textContent = `${from}がリマッチを希望しています！`;
    statusEl.style.display = 'block';
  }

  onRematchWaiting() {
    const statusEl = document.getElementById('rematch-status');
    statusEl.textContent = '相手のリマッチ応答を待っています...';
    statusEl.style.display = 'block';
  }

  onRematchAccepted() {
    // レディ画面に戻る
    this.showReady(
      this.isHost ? this.playerName : this.opponentName,
      this.isHost ? this.opponentName : this.playerName
    );
  }

  // --- スライドショー ---
  startHallOfFameSlide() {
    const hofEl = document.getElementById('hall-of-fame');
    if (!this.hallOfFame || this.hallOfFame.length === 0) {
      hofEl.style.display = 'none';
      return;
    }

    hofEl.style.display = 'block';
    this.hofIndex = 0;
    this.showHofSlide();

    this.hofSlideInterval = setInterval(() => {
      this.hofIndex = (this.hofIndex + 1) % this.hallOfFame.length;
      this.showHofSlide();
    }, 3000);
  }

  showHofSlide() {
    const champ = this.hallOfFame[this.hofIndex];
    if (!champ) return;

    const canvas = document.getElementById('hof-canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = champ.imageData;

    document.getElementById('hof-name').textContent = champ.creatureName;
    document.getElementById('hof-detail').textContent =
      `${champ.playerName} | ${champ.theme} | ${champ.type} | 合計${champ.totalPoints}pt`;

    const slide = document.querySelector('.hof-slide');
    slide.style.animation = 'none';
    slide.offsetHeight;
    slide.style.animation = '';
  }

  stopHallOfFameSlide() {
    if (this.hofSlideInterval) {
      clearInterval(this.hofSlideInterval);
      this.hofSlideInterval = null;
    }
  }

  // --- デバッグログ ---
  toggleDebugLog() {
    const area = document.getElementById('debug-log-area');
    area.style.display = area.style.display === 'none' ? 'block' : 'none';
  }

  prepareDebugLog() {
    const lines = [];
    lines.push('===== AI評価ログ =====');
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      lines.push(`\n--- ${p.name} ---`);
      lines.push(`宣言: ${p.declaration}`);
      if (p.stats) {
        lines.push(`計算結果: HP=${p.stats.hp} ATK=${p.stats.atk} DEF=${p.stats.def} SPD=${p.stats.spd}`);
        lines.push(`合計=${p.stats.totalPoints}pt (基礎20×${p.stats.qualityMultiplier} +マッチ${p.stats.matchBonus} +時間${p.stats.timeBonus})`);
        lines.push(`バトルHP=${p.stats.battleHp} タイプ=${p.stats.type} 能力=${p.stats.ability}`);
      }
    }

    if (this.debugLogText) {
      lines.push('\n===== バトルログ =====');
      lines.push(this.debugLogText);
    }

    lines.push('\n===== ダメージ計算式 =====');
    lines.push('base = ATK × 3');
    lines.push('軽減率 = DEF / (DEF + 15)');
    lines.push('damage = base × (1 - 軽減率)');
    lines.push('       = ATK × 3 × 15 / (DEF + 15)');
    lines.push('最低保証 = 1');

    document.getElementById('debug-log-content').textContent = lines.join('\n');
  }

  // 結果画面デバッグログコピー
  copyDebugLog() {
    const text = document.getElementById('debug-log-content').textContent;
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('btn-copy-debug');
      btn.textContent = 'コピー済み！';
      setTimeout(() => { btn.textContent = 'コピー'; }, 2000);
    });
  }
}

// ゲーム起動
window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});
