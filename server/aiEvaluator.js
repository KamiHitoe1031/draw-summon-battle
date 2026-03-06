// Gemini API連携 + ステータス計算（サーバー版）
class AIEvaluator {
  constructor() {
    this.model = process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview';
    // 手動設定されたAPIキー（環境変数が使えない場合のフォールバック）
    this.manualApiKey = '';
  }

  getApiKey() {
    return process.env.GEMINI_API_KEY || this.manualApiKey || '';
  }

  hasApiKey() {
    return this.getApiKey().length > 0;
  }

  // 手動でAPIキーを設定（環境変数が注入されない場合の回避策）
  setApiKey(key) {
    this.manualApiKey = key || '';
  }

  // Gemini APIで絵を評価
  async evaluate(imageDataUrl, theme, declaration) {
    if (!this.hasApiKey()) {
      throw new Error('GEMINI_API_KEYが設定されていません');
    }

    const base64Image = imageDataUrl.replace(/^data:image\/png;base64,/, '');

    const prompt = `お絵描きバトルゲームの厳正審査。JSONのみ出力。

お題:「${theme}」 プレイヤーの宣言:「${declaration}」

以下の4項目を厳しく評価してください。

■ quality（画力）: 絵が宣言した生物にどれだけ似ているか
  S=一目で分かる完成度 A=特徴を捉えている B=なんとなく分かる C=かろうじて D=全く似ていない

■ match（お題適合）: 宣言した生物がお題に合っているか ★厳しく判定★
  S=お題にぴったり A=十分関連がある B=やや関連がある C=こじつけレベル D=全く関係ない
  例: お題「海の生物」に「ドラゴン」→D、「カニ」→S、「カモメ」→B

■ creativity（独創性）: 発想が面白いか・意外性があるか
  S=唸るほど独創的 A=面白い発想 B=普通 C=ありきたり D=工夫なし

■ detail（書き込み）: 絵の丁寧さ・書き込み量
  S=非常に丁寧 A=よく描かれている B=普通 C=雑 D=ほぼ白紙

理由は各10文字以内。features合計1.0。typeは1つ選択。nameは8文字以内。commentは20文字以内。

{"quality":"B","quality_reason":"理由","match":"B","match_reason":"理由","creativity":"B","creativity_reason":"理由","detail":"B","detail_reason":"理由","features":{"hp_ratio":0.25,"atk_ratio":0.25,"def_ratio":0.25,"spd_ratio":0.25},"type":"猛獣系","name":"二つ名","comment":"総評"}`;

    const requestBody = {
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Image
            }
          },
          { text: prompt }
        ]
      }],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      }
    };

    const apiKey = this.getApiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${apiKey}`;

    console.log(`[AI] リクエスト送信: model=${this.model}, theme=${theme}, declaration=${declaration}`);
    console.log(`[AI] APIキー先頭: ${apiKey.substring(0, 8)}...`);

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
    } catch (fetchErr) {
      throw new Error(`通信エラー: ${fetchErr.message}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI] HTTPエラー: ${response.status}`, errorText);
      throw new Error(`Gemini API エラー (${response.status}): ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();

    const candidates = data.candidates;
    if (!candidates || candidates.length === 0) {
      const reason = data.promptFeedback?.blockReason || JSON.stringify(data).substring(0, 200);
      console.error('[AI] candidates空:', reason);
      throw new Error(`AI応答なし: ${reason}`);
    }

    const parts = candidates[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      const finishReason = candidates[0]?.finishReason || '不明';
      console.error('[AI] parts空:', finishReason);
      throw new Error(`AI応答テキストなし (finishReason: ${finishReason})`);
    }

    const text = parts[0].text || '';
    const finishReason = candidates[0]?.finishReason || '不明';
    console.log(`[AI] 生テキスト (finishReason=${finishReason}):`, text);

    // responseMimeType: 'application/json' なので text がそのままJSONのはず
    // まずそのままパースを試みる
    try {
      return JSON.parse(text);
    } catch (e) {
      console.log('[AI] 直接パース失敗、抽出を試みる');
    }

    // コードブロックやテキスト内からJSON抽出
    let jsonStr = null;
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    } else {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
    }

    // 閉じ括弧が足りない場合の修復
    if (!jsonStr && text.includes('{')) {
      jsonStr = text.trim();
      const openBraces = (jsonStr.match(/\{/g) || []).length;
      const closeBraces = (jsonStr.match(/\}/g) || []).length;
      for (let i = 0; i < openBraces - closeBraces; i++) {
        jsonStr += '}';
      }
    }

    if (!jsonStr) {
      throw new Error(`JSON抽出失敗\nfinishReason: ${finishReason}\nAI応答全文:\n${text}`);
    }

    try {
      return JSON.parse(jsonStr);
    } catch (parseErr) {
      throw new Error(`JSONパースエラー: ${parseErr.message}\nfinishReason: ${finishReason}\n抽出テキスト:\n${jsonStr}`);
    }
  }

  // フォールバック
  getDefaultEvaluation(declaration) {
    return {
      quality: 'B',
      quality_reason: '自動判定',
      match: 'B',
      match_reason: '自動判定',
      features: { hp_ratio: 0.25, atk_ratio: 0.25, def_ratio: 0.25, spd_ratio: 0.25 },
      type: '猛獣系',
      name: declaration || 'ナゾの生物',
      comment: 'AI評価を取得できなかったためデフォルト値を使用'
    };
  }

  // AI評価結果からゲーム用ステータスを計算
  calculateStats(evalResult, remainingTime) {
    const BASE_STATS = 20;

    const qualityMultiplier = {
      'S': 1.2, 'A': 1.1, 'B': 1.0, 'C': 0.8, 'D': 0.5
    };

    const matchBonus = {
      'S': 4, 'A': 2, 'B': 0, 'C': -2, 'D': -4
    };

    const creativityBonus = {
      'S': 3, 'A': 2, 'B': 0, 'C': -1, 'D': -2
    };

    const detailBonus = {
      'S': 3, 'A': 2, 'B': 0, 'C': -1, 'D': -2
    };

    let timeBonus = 0;
    if (remainingTime >= 20) timeBonus = 4;
    else if (remainingTime >= 10) timeBonus = 2;
    else if (remainingTime >= 1) timeBonus = 1;

    const qMult = qualityMultiplier[evalResult.quality] || 1.0;
    const mBonus = matchBonus[evalResult.match] || 0;
    const cBonus = creativityBonus[evalResult.creativity] || 0;
    const dBonus = detailBonus[evalResult.detail] || 0;
    const totalPoints = Math.max(6, Math.round(BASE_STATS * qMult + mBonus + cBonus + dBonus + timeBonus));

    const f = evalResult.features;
    const sum = f.hp_ratio + f.atk_ratio + f.def_ratio + f.spd_ratio;
    const normalized = {
      hp: f.hp_ratio / sum,
      atk: f.atk_ratio / sum,
      def: f.def_ratio / sum,
      spd: f.spd_ratio / sum
    };

    const cap = totalPoints * 0.5;
    let stats = {
      hp: Math.round(totalPoints * normalized.hp),
      atk: Math.round(totalPoints * normalized.atk),
      def: Math.round(totalPoints * normalized.def),
      spd: Math.round(totalPoints * normalized.spd)
    };

    let overflow = 0;
    for (const key of ['hp', 'atk', 'def', 'spd']) {
      if (stats[key] > cap) {
        overflow += stats[key] - Math.floor(cap);
        stats[key] = Math.floor(cap);
      }
    }

    if (overflow > 0) {
      const sorted = Object.entries(stats).sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < overflow; i++) {
        sorted[i % sorted.length][1]++;
      }
      stats = Object.fromEntries(sorted);
    }

    for (const key of ['hp', 'atk', 'def', 'spd']) {
      if (stats[key] < 1) stats[key] = 1;
    }

    const battleHp = stats.hp * 5;

    const typeAbilities = {
      '猛獣系': { ability: '先制攻撃', desc: '初手ATK×1.5' },
      '甲殻系': { ability: '硬殻防御', desc: '最初の被ダメ50%カット' },
      '飛行系': { ability: '回避', desc: '30%で攻撃回避' },
      '毒系':   { ability: '毒撃', desc: '攻撃時、毎ターンHP-2' },
      '群体系': { ability: '物量', desc: 'HP50%以下でATK×1.5' },
      '植物系': { ability: '再生', desc: '毎ターンHP+3回復' },
      '電気系': { ability: '麻痺', desc: '20%で相手ターンスキップ' },
      '幻惑系': { ability: '幻影', desc: '最初2ターン被ダメ30%カット' }
    };

    const type = evalResult.type || '猛獣系';
    const abilityInfo = typeAbilities[type] || typeAbilities['猛獣系'];

    return {
      hp: stats.hp,
      atk: stats.atk,
      def: stats.def,
      spd: stats.spd,
      battleHp,
      maxBattleHp: battleHp,
      totalPoints,
      type,
      ability: abilityInfo.ability,
      abilityDesc: abilityInfo.desc,
      name: evalResult.name || '???',
      quality: evalResult.quality,
      match: evalResult.match,
      creativity: evalResult.creativity || 'B',
      detail: evalResult.detail || 'B',
      qualityReason: evalResult.quality_reason || '',
      matchReason: evalResult.match_reason || '',
      creativityReason: evalResult.creativity_reason || '',
      detailReason: evalResult.detail_reason || '',
      comment: evalResult.comment || '',
      timeBonus,
      qualityMultiplier: qMult,
      matchBonus: mBonus,
      creativityBonus: cBonus,
      detailBonus: dBonus
    };
  }
}

module.exports = { AIEvaluator };
