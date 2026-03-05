// Gemini API連携 + ステータス計算（サーバー版）
class AIEvaluator {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    this.model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  }

  hasApiKey() {
    return this.apiKey.length > 0;
  }

  // Gemini APIで絵を評価
  async evaluate(imageDataUrl, theme, declaration) {
    if (!this.hasApiKey()) {
      throw new Error('GEMINI_API_KEYが設定されていません');
    }

    const base64Image = imageDataUrl.replace(/^data:image\/png;base64,/, '');

    const prompt = `お絵描きバトルゲーム審査。JSONのみ出力。理由は10文字以内で短く。

お題:「${theme}」 宣言:「${declaration}」

quality: 絵が宣言と似ているか (S/A/B/C/D)
match: 宣言がお題に合うか (S/A/B/C/D)
features: 絵の見た目から hp_ratio,atk_ratio,def_ratio,spd_ratio (合計1.0)
type: 猛獣系/甲殻系/飛行系/毒系/群体系/植物系/電気系/幻惑系 から1つ
name: 二つ名(8文字以内)
comment: 短い総評(20文字以内)

{"quality":"B","quality_reason":"短い理由","match":"B","match_reason":"短い理由","features":{"hp_ratio":0.25,"atk_ratio":0.25,"def_ratio":0.25,"spd_ratio":0.25},"type":"猛獣系","name":"名前","comment":"短い総評"}`;

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
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
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

    const candidates = data.candidates;
    if (!candidates || candidates.length === 0) {
      console.error('AI応答:', JSON.stringify(data));
      throw new Error('AIから応答がありませんでした（candidates空）');
    }

    const parts = candidates[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      console.error('AI応答:', JSON.stringify(candidates[0]));
      throw new Error('AIの応答にテキストが含まれていません');
    }

    const text = parts[0].text || '';
    console.log('AI生テキスト:', text);

    // JSONを抽出
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

    if (!jsonStr) {
      console.error('JSON抽出失敗。生テキスト:', text);
      return this.getDefaultEvaluation(declaration);
    }

    try {
      return JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error('JSONパースエラー:', parseErr, 'テキスト:', jsonStr);
      return this.getDefaultEvaluation(declaration);
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

    let timeBonus = 0;
    if (remainingTime >= 20) timeBonus = 4;
    else if (remainingTime >= 10) timeBonus = 2;
    else if (remainingTime >= 1) timeBonus = 1;

    const qMult = qualityMultiplier[evalResult.quality] || 1.0;
    const mBonus = matchBonus[evalResult.match] || 0;
    const totalPoints = Math.max(6, Math.round(BASE_STATS * qMult + mBonus + timeBonus));

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
      qualityReason: evalResult.quality_reason || '',
      matchReason: evalResult.match_reason || '',
      comment: evalResult.comment || '',
      timeBonus,
      qualityMultiplier: qMult,
      matchBonus: mBonus
    };
  }
}

module.exports = { AIEvaluator };
