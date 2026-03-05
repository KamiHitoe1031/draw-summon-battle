// 歴代チャンピオン管理（インメモリ + JSONファイル）
const fs = require('fs');
const path = require('path');

class ChampionStore {
  constructor() {
    this.maxChampions = 30;
    this.filePath = path.join(__dirname, '..', 'data', 'champions.json');
    this.champions = this.load();
  }

  // ファイルから読み込み
  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('チャンピオンデータ読み込みエラー:', e.message);
    }
    return [];
  }

  // ファイルに保存
  save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.champions), 'utf-8');
    } catch (e) {
      console.error('チャンピオンデータ保存エラー:', e.message);
    }
  }

  // チャンピオンを追加
  add(champion) {
    this.champions.push({
      ...champion,
      date: new Date().toLocaleDateString('ja-JP')
    });

    // 件数制限
    if (this.champions.length > this.maxChampions) {
      this.champions = this.champions.slice(-this.maxChampions);
    }

    this.save();
  }

  // 全件取得（画像データ付き）
  getAll() {
    return this.champions;
  }

  // サマリーのみ取得（画像データなし・軽量）
  getSummary() {
    return this.champions.map(c => ({
      playerName: c.playerName,
      creatureName: c.creatureName,
      type: c.type,
      totalPoints: c.totalPoints,
      theme: c.theme,
      date: c.date,
      hp: c.hp,
      atk: c.atk,
      def: c.def,
      spd: c.spd
    }));
  }
}

module.exports = { ChampionStore };
