// ゲーム全体の管理
class Game {
  constructor() {
    this.canvas = null;
    this.ai = new AIEvaluator();
    this.battle = new BattleSystem();

    // ゲーム状態
    this.currentPlayer = 1;
    this.currentTheme = null;
    this.players = {
      1: { imageData: null, declaration: '', remainingTime: 0, evalResult: null, stats: null },
      2: { imageData: null, declaration: '', remainingTime: 0, evalResult: null, stats: null }
    };

    // タイマー
    this.timerInterval = null;
    this.timeLeft = 40;
    this.drawTime = 40;

    // お題リスト
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

    this.init();
  }

  init() {
    this.setupEventListeners();

    // APIキーが保存済みなら表示
    if (this.ai.hasApiKey()) {
      const keyInput = document.getElementById('input-api-key');
      keyInput.value = '••••••••••••••••';
      keyInput.dataset.hasKey = 'true';
    }

    // 保存済みモデルをセレクトに反映
    const savedModel = localStorage.getItem('gemini_model');
    if (savedModel) {
      const selectEl = document.getElementById('select-model');
      if (selectEl.querySelector(`option[value="${savedModel}"]`)) {
        selectEl.value = savedModel;
      }
    }
  }

  setupEventListeners() {
    // タイトル画面
    document.getElementById('btn-start').addEventListener('click', () => this.startGame());
    document.getElementById('btn-settings').addEventListener('click', () => this.showScreen('settings'));

    // 設定画面
    document.getElementById('btn-save-key').addEventListener('click', () => this.saveApiKey());
    document.getElementById('btn-back-title').addEventListener('click', () => this.showScreen('title'));
    document.getElementById('input-api-key').addEventListener('focus', (e) => {
      if (e.target.dataset.hasKey === 'true') {
        e.target.value = '';
        e.target.dataset.hasKey = 'false';
      }
    });

    // お題画面
    document.getElementById('btn-start-draw').addEventListener('click', () => this.startDrawing());

    // お絵描き画面
    this.setupDrawingTools();
    document.getElementById('btn-submit-draw').addEventListener('click', () => this.submitDrawing());

    // 交代画面
    document.getElementById('btn-swap-ready').addEventListener('click', () => this.onSwapReady());

    // ステータス発表画面
    document.getElementById('btn-start-battle').addEventListener('click', () => this.startBattle());

    // 結果画面
    document.getElementById('btn-rematch').addEventListener('click', () => this.startGame());
    document.getElementById('btn-to-title').addEventListener('click', () => this.showScreen('title'));
    document.getElementById('btn-debug-log').addEventListener('click', () => this.toggleDebugLog());
  }

  setupDrawingTools() {
    // ツール切り替え
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (this.canvas) this.canvas.setTool(btn.dataset.tool);
      });
    });

    // 色選択
    document.getElementById('color-palette').addEventListener('click', (e) => {
      const btn = e.target.closest('.color-btn');
      if (!btn) return;
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (this.canvas) this.canvas.setColor(btn.dataset.color);
      // ペンに切り替え
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('[data-tool="pen"]').classList.add('active');
    });

    // ブラシサイズ
    const brushSlider = document.getElementById('brush-size');
    const brushPreview = document.getElementById('brush-preview');
    brushSlider.addEventListener('input', () => {
      const size = parseInt(brushSlider.value);
      if (this.canvas) this.canvas.setBrushSize(size);
      brushPreview.style.width = size + 'px';
      brushPreview.style.height = size + 'px';
    });

    // 元に戻す
    document.getElementById('btn-undo').addEventListener('click', () => {
      if (this.canvas) this.canvas.undo();
    });

    // 全消し
    document.getElementById('btn-clear').addEventListener('click', () => {
      if (this.canvas) this.canvas.clearWithSave();
    });
  }

  // 画面切り替え
  showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${name}`).classList.add('active');
  }

  // ゲーム開始
  startGame() {
    if (!this.ai.hasApiKey()) {
      this.showScreen('settings');
      return;
    }

    // 状態リセット
    this.currentPlayer = 1;
    this.players = {
      1: { imageData: null, declaration: '', remainingTime: 0, evalResult: null, stats: null },
      2: { imageData: null, declaration: '', remainingTime: 0, evalResult: null, stats: null }
    };

    // お題をランダム選出
    this.currentTheme = this.themes[Math.floor(Math.random() * this.themes.length)];

    // お題表示
    document.getElementById('theme-name').textContent = this.currentTheme.name;
    document.getElementById('theme-attribute').textContent = this.currentTheme.attribute;
    this.showScreen('theme');
  }

  // 描画開始
  startDrawing() {
    // キャンバス初期化
    if (!this.canvas) {
      this.canvas = new DrawingCanvas('draw-canvas');
    } else {
      this.canvas.reset();
    }

    // UI更新
    document.getElementById('player-indicator').textContent = `プレイヤー${this.currentPlayer}のターン`;
    document.getElementById('theme-badge').textContent = this.currentTheme.name;
    document.getElementById('input-declare').value = '';

    // ツールリセット
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-tool="pen"]').classList.add('active');
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-color="#000000"]').classList.add('active');
    document.getElementById('brush-size').value = 5;
    document.getElementById('brush-preview').style.width = '5px';
    document.getElementById('brush-preview').style.height = '5px';

    this.showScreen('draw');

    // タイマー開始
    this.timeLeft = this.drawTime;
    this.updateTimerDisplay();
    this.startTimer();
  }

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.drawingLocked = false;
    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      this.updateTimerDisplay();
      if (this.timeLeft <= 0) {
        this.onTimerEnd();
      }
    }, 1000);
  }

  // タイマー終了 → 描画をロックして宣言入力フェーズへ
  onTimerEnd() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.drawingLocked = true;

    // キャンバスを操作不能にする
    const canvasEl = document.getElementById('draw-canvas');
    canvasEl.style.pointerEvents = 'none';
    canvasEl.style.opacity = '0.7';

    // 残り時間を記録
    this.players[this.currentPlayer].remainingTime = 0;
    this.players[this.currentPlayer].imageData = this.canvas.getImageData();

    // ヘッダーを「宣言フェーズ」に更新
    document.getElementById('timer').textContent = '—';
    document.getElementById('timer').classList.remove('danger');
    document.getElementById('player-indicator').textContent = `プレイヤー${this.currentPlayer}：名前をつけて提出！`;

    // 宣言入力にフォーカス
    document.getElementById('input-declare').focus();
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

  // 絵の提出（宣言必須）
  submitDrawing() {
    const declaration = document.getElementById('input-declare').value.trim();
    if (!declaration) {
      // 宣言が空なら提出させない
      document.getElementById('input-declare').focus();
      document.getElementById('input-declare').style.borderColor = '#e74c3c';
      setTimeout(() => {
        document.getElementById('input-declare').style.borderColor = '';
      }, 1000);
      return;
    }

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    const player = this.players[this.currentPlayer];
    // タイマー中に提出した場合はここで画像を保存
    if (!player.imageData) {
      player.imageData = this.canvas.getImageData();
    }
    player.declaration = declaration;
    // タイマー中に提出した場合の残り時間
    if (!this.drawingLocked) {
      player.remainingTime = this.timeLeft;
    }

    // キャンバスのロック解除
    const canvasEl = document.getElementById('draw-canvas');
    canvasEl.style.pointerEvents = '';
    canvasEl.style.opacity = '';
    this.drawingLocked = false;

    if (this.currentPlayer === 1) {
      // プレイヤー2に交代
      this.currentPlayer = 2;
      this.showScreen('swap');
    } else {
      // 両方完了 → AI評価開始
      this.startEvaluation();
    }
  }

  // プレイヤー交代
  onSwapReady() {
    this.startDrawing();
  }

  // AI評価
  async startEvaluation() {
    this.showScreen('evaluating');
    const statusEl = document.getElementById('eval-status');

    try {
      // プレイヤー1の評価
      statusEl.textContent = 'プレイヤー1の絵を解析中...';
      console.log('[EVAL] P1開始:', { theme: this.currentTheme.name, declaration: this.players[1].declaration, remainingTime: this.players[1].remainingTime });
      const eval1 = await this.ai.evaluate(
        this.players[1].imageData,
        this.currentTheme.name,
        this.players[1].declaration
      );
      console.log('[EVAL] P1 AI応答:', JSON.stringify(eval1, null, 2));
      this.players[1].evalResult = eval1;
      this.players[1].stats = this.ai.calculateStats(eval1, this.players[1].remainingTime);
      console.log('[EVAL] P1 ステータス:', JSON.stringify(this.players[1].stats, null, 2));

      // プレイヤー2の評価
      statusEl.textContent = 'プレイヤー2の絵を解析中...';
      console.log('[EVAL] P2開始:', { theme: this.currentTheme.name, declaration: this.players[2].declaration, remainingTime: this.players[2].remainingTime });
      const eval2 = await this.ai.evaluate(
        this.players[2].imageData,
        this.currentTheme.name,
        this.players[2].declaration
      );
      console.log('[EVAL] P2 AI応答:', JSON.stringify(eval2, null, 2));
      this.players[2].evalResult = eval2;
      this.players[2].stats = this.ai.calculateStats(eval2, this.players[2].remainingTime);
      console.log('[EVAL] P2 ステータス:', JSON.stringify(this.players[2].stats, null, 2));

      // ステータス発表画面へ
      this.showRevealScreen();

    } catch (error) {
      statusEl.innerHTML = `エラー: ${error.message}<br><br>
        <button class="btn btn-primary" onclick="window.game.startEvaluation()">リトライ</button>
        <button class="btn btn-secondary" onclick="window.game.showScreen('title')" style="margin-left:8px">タイトルへ</button>`;
      console.error('AI評価エラー:', error);
    }
  }

  // ステータス発表画面を構築
  showRevealScreen() {
    for (const pId of [1, 2]) {
      const stats = this.players[pId].stats;

      // 絵をコピー
      const srcImg = new Image();
      srcImg.onload = () => {
        const revealCanvas = document.getElementById(`reveal-canvas-${pId}`);
        const rCtx = revealCanvas.getContext('2d');
        rCtx.clearRect(0, 0, revealCanvas.width, revealCanvas.height);
        rCtx.drawImage(srcImg, 0, 0, revealCanvas.width, revealCanvas.height);
      };
      srcImg.src = this.players[pId].imageData;

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

    this.showScreen('reveal');
  }

  // バトル開始
  async startBattle() {
    this.showScreen('battle');

    const stats1 = this.players[1].stats;
    const stats2 = this.players[2].stats;

    // バトル画面の初期設定
    for (const pId of [1, 2]) {
      const stats = this.players[pId].stats;

      // 絵をコピー
      const srcImg = new Image();
      srcImg.onload = () => {
        const battleCanvas = document.getElementById(`battle-canvas-${pId}`);
        const bCtx = battleCanvas.getContext('2d');
        bCtx.clearRect(0, 0, battleCanvas.width, battleCanvas.height);
        bCtx.drawImage(srcImg, 0, 0, battleCanvas.width, battleCanvas.height);
      };
      srcImg.src = this.players[pId].imageData;

      document.getElementById(`battle-name-${pId}`).textContent = stats.name;
      document.getElementById(`battle-stats-${pId}`).textContent =
        `ATK:${stats.atk} DEF:${stats.def} SPD:${stats.spd} [${stats.type}]`;
    }

    document.getElementById('battle-log').innerHTML = '';

    // バトル実行
    const callbacks = {
      onStart: (c1, c2) => {
        this.updateHpBar(1, c1.currentHp, c1.maxHp);
        this.updateHpBar(2, c2.currentHp, c2.maxHp);
      },
      onTurnStart: (turn) => {
        document.getElementById('turn-counter').textContent = `Turn ${turn}`;
      },
      onUpdate: (c1, c2) => {
        this.updateHpBar(1, c1.currentHp, c1.maxHp);
        this.updateHpBar(2, c2.currentHp, c2.maxHp);
      },
      onAttack: (attackerId, defenderId, damage) => {
        const attackCanvas = document.getElementById(`battle-canvas-${attackerId}`);
        const defenseCanvas = document.getElementById(`battle-canvas-${defenderId}`);
        attackCanvas.classList.add('attack');
        setTimeout(() => {
          attackCanvas.classList.remove('attack');
          defenseCanvas.classList.add('shake');
          this.showDamagePopup(defenderId, damage);
          setTimeout(() => defenseCanvas.classList.remove('shake'), 300);
        }, 400);
      },
      onMiss: (defenderId) => {
        const effectEl = document.getElementById('battle-effect');
        effectEl.textContent = 'MISS!';
        effectEl.style.color = '#95a5a6';
        setTimeout(() => { effectEl.textContent = ''; }, 800);
      },
      onLog: (action) => {
        this.addBattleLog(action);
      },
      onEnd: (winner, c1, c2) => {
        this.showResult(winner);
      }
    };

    await this.battle.runBattle(stats1, stats2, callbacks);
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

  // 結果表示
  showResult(winner) {
    const titleEl = document.getElementById('result-title');

    if (winner === 'draw') {
      titleEl.textContent = '引き分け！';
      titleEl.className = 'result-title draw';
    } else {
      titleEl.textContent = `プレイヤー${winner}の勝利！`;
      titleEl.className = `result-title p${winner}-win`;
    }

    // 結果画面の絵をコピー
    for (const pId of [1, 2]) {
      const srcImg = new Image();
      srcImg.onload = () => {
        const resultCanvas = document.getElementById(`result-canvas-${pId}`);
        const rCtx = resultCanvas.getContext('2d');
        rCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
        rCtx.drawImage(srcImg, 0, 0, resultCanvas.width, resultCanvas.height);
      };
      srcImg.src = this.players[pId].imageData;
      document.getElementById(`result-name-${pId}`).textContent = this.players[pId].stats.name;

      // 勝者にクラス付与
      const creatureEl = document.getElementById(`result-canvas-${pId}`).parentElement;
      creatureEl.classList.remove('winner');
      if (winner === pId) creatureEl.classList.add('winner');
    }

    // デバッグログを準備
    document.getElementById('debug-log-area').style.display = 'none';
    this.prepareDebugLog();

    setTimeout(() => this.showScreen('result'), 1000);
  }

  toggleDebugLog() {
    const area = document.getElementById('debug-log-area');
    area.style.display = area.style.display === 'none' ? 'block' : 'none';
  }

  prepareDebugLog() {
    const lines = [];
    lines.push('===== AI評価ログ =====');
    for (const pId of [1, 2]) {
      const p = this.players[pId];
      lines.push(`\n--- プレイヤー${pId} ---`);
      lines.push(`宣言: ${p.declaration}`);
      lines.push(`残り時間: ${p.remainingTime}秒`);
      lines.push(`AI生応答: ${JSON.stringify(p.evalResult, null, 2)}`);
      if (p.stats) {
        lines.push(`計算結果: HP=${p.stats.hp} ATK=${p.stats.atk} DEF=${p.stats.def} SPD=${p.stats.spd}`);
        lines.push(`合計=${p.stats.totalPoints}pt (基礎20×${p.stats.qualityMultiplier} +マッチ${p.stats.matchBonus} +時間${p.stats.timeBonus})`);
        lines.push(`バトルHP=${p.stats.battleHp} タイプ=${p.stats.type} 能力=${p.stats.ability}`);
      }
    }
    lines.push('\n===== バトルログ =====');
    lines.push(this.battle.getDebugLogText());

    lines.push('\n===== ダメージ計算式 =====');
    lines.push('base = ATK × 3');
    lines.push('軽減率 = DEF / (DEF + 15)');
    lines.push('damage = base × (1 - 軽減率)');
    lines.push('       = ATK × 3 × 15 / (DEF + 15)');
    lines.push('最低保証 = 1');
    lines.push('');
    lines.push('例: ATK=5 vs DEF=9 → 5×3×15/(9+15) = 225/24 = 9ダメージ');
    lines.push('例: ATK=3 vs DEF=12 → 3×3×15/(12+15) = 135/27 = 5ダメージ');
    lines.push('例: ATK=10 vs DEF=5 → 10×3×15/(5+15) = 450/20 = 23ダメージ');

    document.getElementById('debug-log-content').textContent = lines.join('\n');
  }

  // APIキー保存
  async saveApiKey() {
    const input = document.getElementById('input-api-key');
    const status = document.getElementById('api-status');
    const key = input.value.trim();

    if (!key || key === '••••••••••••••••') {
      status.textContent = 'APIキーを入力してください';
      status.className = 'api-status error';
      return;
    }

    status.textContent = '検証中...';
    status.className = 'api-status';

    const model = document.getElementById('select-model').value;

    try {
      const result = await this.ai.testApiKey(key, model);
      if (result.valid) {
        this.ai.setApiKey(key, model);
        status.textContent = `保存しました！（モデル: ${model}）`;
        status.className = 'api-status success';
        input.value = '••••••••••••••••';
        input.dataset.hasKey = 'true';
      } else {
        status.textContent = 'エラー: ' + (result.error || '接続できません');
        status.className = 'api-status error';
      }
    } catch (e) {
      status.textContent = 'エラー: ' + e.message;
      status.className = 'api-status error';
    }
  }
}

// ゲーム起動
window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});
