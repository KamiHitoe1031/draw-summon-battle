// Gemini API連携 + ステータス計算
class AIEvaluator {
  constructor() {
    this.apiKey = localStorage.getItem('gemini_api_key') || '';
    this.model = localStorage.getItem('gemini_model') || 'gemini-3.0-flash';
  }

  setApiKey(key, model) {
    this.apiKey = key;
    localStorage.setItem('gemini_api_key', key);
    if (model) {
      this.model = model;
      localStorage.setItem('gemini_model', model);
    }
  }

  getApiKey() {
    return this.apiKey;
  }

  hasApiKey() {
    return this.apiKey.length > 0;
  }

  // Gemini APIで絵を評価
  async evaluate(imageDataUrl, theme, declaration) {
    const base64Image = imageDataUrl.replace(/^data:image\/png;base64,/, '');

    const prompt = `あなたはお絵描きバトルゲームの審査員です。
プレイヤーが描いた絵を3段階で評価してください。

お題: 「${theme}」
プレイヤーの宣言: 「${declaration}」

## 評価基準

1. クオリティ評価 (quality): 宣言された「${declaration}」に絵がどれくらい似ているか
   - S: 一目で分かる、特徴がしっかり描かれている
   - A: よく分かる、主要な特徴がある
   - B: まあ分かる、それっぽい
   - C: 苦しい、かなり想像力が必要
   - D: 全く分からない

2. マッチ度評価 (match): 「${declaration}」がお題「${theme}」にどれくらい合っているか
   - S: ド直球、お題の代表的な存在
   - A: よく合っている
   - B: ギリギリ関連がある
   - C: 関連が薄い
   - D: 完全に無関係

3. 特徴評価 (features): 絵の視覚的特徴を0.0〜1.0で評価
   - hp_ratio: 大きさ・ボリューム感・存在感
   - atk_ratio: トゲ・牙・爪・鋭利な部位・攻撃的な特徴
   - def_ratio: 殻・鎧・厚い皮膚・盾のような防御的特徴
   - spd_ratio: 流線型・細身・ヒレ・翼・軽そうな体型
   ※ 4つの合計が1.0になるように正規化すること

4. タイプ判定 (type): 以下から最も近いものを1つ選択
   猛獣系, 甲殻系, 飛行系, 毒系, 群体系, 植物系, 電気系, 幻惑系

5. 生物名 (name): この生物に合う二つ名（宣言をベースに特徴を加味、8文字以内）

6. 評価コメント (comment): なぜこの評価になったか1〜2文で説明

以下のJSON形式で回答してください。JSON以外は出力しないでください。
{
  "quality": "S",
  "quality_reason": "理由",
  "match": "S",
  "match_reason": "理由",
  "features": { "hp_ratio": 0.25, "atk_ratio": 0.25, "def_ratio": 0.25, "spd_ratio": 0.25 },
  "type": "猛獣系",
  "name": "名前",
  "comment": "コメント"
}`;

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
        temperature: 0.7,
        maxOutputTokens: 1024,
      }
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text;

    // JSONを抽出（コードブロックで囲まれている場合にも対応）
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AIの応答からJSONを抽出できませんでした');
    }

    return JSON.parse(jsonMatch[0]);
  }

  // AI評価結果からゲーム用ステータスを計算
  calculateStats(evalResult, remainingTime) {
    const BASE_STATS = 20;

    // クオリティ倍率
    const qualityMultiplier = {
      'S': 1.2, 'A': 1.1, 'B': 1.0, 'C': 0.8, 'D': 0.5
    };

    // マッチ度ボーナス
    const matchBonus = {
      'S': 4, 'A': 2, 'B': 0, 'C': -2, 'D': -4
    };

    // 時間ボーナス
    let timeBonus = 0;
    if (remainingTime >= 20) timeBonus = 4;
    else if (remainingTime >= 10) timeBonus = 2;
    else if (remainingTime >= 1) timeBonus = 1;

    // 合計ステータスポイント
    const qMult = qualityMultiplier[evalResult.quality] || 1.0;
    const mBonus = matchBonus[evalResult.match] || 0;
    const totalPoints = Math.max(6, Math.round(BASE_STATS * qMult + mBonus + timeBonus));

    // 特徴比率でステータス分配
    const f = evalResult.features;
    const sum = f.hp_ratio + f.atk_ratio + f.def_ratio + f.spd_ratio;
    const normalized = {
      hp: f.hp_ratio / sum,
      atk: f.atk_ratio / sum,
      def: f.def_ratio / sum,
      spd: f.spd_ratio / sum
    };

    // ステータス分配（キャップ50%）
    const cap = totalPoints * 0.5;
    let stats = {
      hp: Math.round(totalPoints * normalized.hp),
      atk: Math.round(totalPoints * normalized.atk),
      def: Math.round(totalPoints * normalized.def),
      spd: Math.round(totalPoints * normalized.spd)
    };

    // キャップ適用
    let overflow = 0;
    for (const key of ['hp', 'atk', 'def', 'spd']) {
      if (stats[key] > cap) {
        overflow += stats[key] - Math.floor(cap);
        stats[key] = Math.floor(cap);
      }
    }

    // オーバーフロー分を最も低いステータスに分配
    if (overflow > 0) {
      const sorted = Object.entries(stats).sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < overflow; i++) {
        sorted[i % sorted.length][1]++;
      }
      stats = Object.fromEntries(sorted);
    }

    // 最低値保証（各ステータス最低1）
    for (const key of ['hp', 'atk', 'def', 'spd']) {
      if (stats[key] < 1) stats[key] = 1;
    }

    // HPをバトル用にスケーリング（表示と内部で分離）
    const battleHp = stats.hp * 5; // HP1pt = 5HPとして扱う

    // タイプと特殊能力
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
      battleHp: battleHp,
      maxBattleHp: battleHp,
      totalPoints: totalPoints,
      type: type,
      ability: abilityInfo.ability,
      abilityDesc: abilityInfo.desc,
      name: evalResult.name || '???',
      quality: evalResult.quality,
      match: evalResult.match,
      qualityReason: evalResult.quality_reason || '',
      matchReason: evalResult.match_reason || '',
      comment: evalResult.comment || '',
      timeBonus: timeBonus,
      qualityMultiplier: qMult,
      matchBonus: mBonus
    };
  }

  // APIキー検証（選択モデルでテストリクエスト）
  async testApiKey(key, model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'テスト。OKとだけ返して。' }] }]
        })
      });
      if (response.ok) {
        return { valid: true };
      }
      const errData = await response.json().catch(() => ({}));
      const errMsg = errData?.error?.message || `HTTP ${response.status}`;
      return { valid: false, error: errMsg };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }
}
