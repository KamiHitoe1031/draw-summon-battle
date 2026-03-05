// バトルシステム
class BattleSystem {
  constructor() {
    this.maxTurns = 20;
    this.turnDelay = 1200; // ターン間のディレイ（ms）
    this.logs = [];
  }

  // バトル実行（非同期でアニメーション付き）
  async runBattle(creature1, creature2, callbacks) {
    this.logs = [];
    const c1 = this.createBattleState(creature1, 1);
    const c2 = this.createBattleState(creature2, 2);

    callbacks.onStart(c1, c2);

    // 特殊能力の初期化
    this.initAbilities(c1, c2);

    for (let turn = 1; turn <= this.maxTurns; turn++) {
      await this.delay(this.turnDelay);

      const turnLog = { turn, actions: [] };
      callbacks.onTurnStart(turn);

      // ターン開始時の効果（毒・再生など）
      this.applyTurnStartEffects(c1, c2, turnLog);
      callbacks.onUpdate(c1, c2);

      // 死亡チェック
      if (c1.currentHp <= 0 || c2.currentHp <= 0) {
        this.logs.push(turnLog);
        break;
      }

      // 麻痺チェック
      const c1Paralyzed = c1.paralyzed;
      const c2Paralyzed = c2.paralyzed;
      c1.paralyzed = false;
      c2.paralyzed = false;

      // 攻撃順決定（SPDが高い方が先攻）
      let first, second, firstParalyzed, secondParalyzed;
      if (c1.stats.spd >= c2.stats.spd) {
        first = c1; second = c2;
        firstParalyzed = c1Paralyzed; secondParalyzed = c2Paralyzed;
      } else {
        first = c2; second = c1;
        firstParalyzed = c2Paralyzed; secondParalyzed = c1Paralyzed;
      }

      // 先攻の攻撃
      if (!firstParalyzed) {
        await this.executeAttack(first, second, turn, turnLog, callbacks);
        callbacks.onUpdate(c1, c2);

        if (second.currentHp <= 0) {
          this.logs.push(turnLog);
          break;
        }
      } else {
        turnLog.actions.push({
          type: 'paralyzed',
          target: first.playerId,
          message: `${first.name}は麻痺で動けない！`
        });
        callbacks.onLog(turnLog.actions[turnLog.actions.length - 1]);
      }

      await this.delay(600);

      // 後攻の攻撃
      if (!secondParalyzed) {
        await this.executeAttack(second, first, turn, turnLog, callbacks);
        callbacks.onUpdate(c1, c2);

        if (first.currentHp <= 0) {
          this.logs.push(turnLog);
          break;
        }
      } else {
        turnLog.actions.push({
          type: 'paralyzed',
          target: second.playerId,
          message: `${second.name}は麻痺で動けない！`
        });
        callbacks.onLog(turnLog.actions[turnLog.actions.length - 1]);
      }

      this.logs.push(turnLog);
    }

    // 勝敗判定
    await this.delay(800);
    let winner = null;
    if (c1.currentHp <= 0 && c2.currentHp <= 0) {
      winner = 'draw';
    } else if (c1.currentHp <= 0) {
      winner = 2;
    } else if (c2.currentHp <= 0) {
      winner = 1;
    } else {
      // ターン切れ → HP割合で判定
      const ratio1 = c1.currentHp / c1.maxHp;
      const ratio2 = c2.currentHp / c2.maxHp;
      if (ratio1 > ratio2) winner = 1;
      else if (ratio2 > ratio1) winner = 2;
      else winner = 'draw';
    }

    callbacks.onEnd(winner, c1, c2);
    return winner;
  }

  createBattleState(creature, playerId) {
    return {
      playerId: playerId,
      name: creature.name,
      stats: { ...creature },
      currentHp: creature.battleHp,
      maxHp: creature.maxBattleHp,
      type: creature.type,
      ability: creature.ability,
      // 能力フラグ
      firstStrike: false,
      shellUsed: false,
      poisoned: false,
      paralyzed: false,
      illusionTurns: 0
    };
  }

  initAbilities(c1, c2) {
    // 先制攻撃
    if (c1.ability === '先制攻撃') c1.firstStrike = true;
    if (c2.ability === '先制攻撃') c2.firstStrike = true;

    // 幻影
    if (c1.ability === '幻影') c1.illusionTurns = 2;
    if (c2.ability === '幻影') c2.illusionTurns = 2;
  }

  applyTurnStartEffects(c1, c2, turnLog) {
    // 毒ダメージ
    for (const c of [c1, c2]) {
      if (c.poisoned) {
        const poisonDmg = 2;
        c.currentHp = Math.max(0, c.currentHp - poisonDmg);
        turnLog.actions.push({
          type: 'poison',
          target: c.playerId,
          damage: poisonDmg,
          message: `${c.name}は毒で${poisonDmg}ダメージ！`
        });
      }
    }

    // 再生回復
    for (const c of [c1, c2]) {
      if (c.ability === '再生') {
        const healAmount = Math.min(3, c.maxHp - c.currentHp);
        if (healAmount > 0) {
          c.currentHp += healAmount;
          turnLog.actions.push({
            type: 'heal',
            target: c.playerId,
            amount: healAmount,
            message: `${c.name}はHPを${healAmount}回復した！`
          });
        }
      }
    }
  }

  async executeAttack(attacker, defender, turn, turnLog, callbacks) {
    // 回避判定（飛行系）
    if (defender.ability === '回避' && Math.random() < 0.3) {
      turnLog.actions.push({
        type: 'miss',
        attacker: attacker.playerId,
        defender: defender.playerId,
        message: `${defender.name}は攻撃を回避した！`
      });
      callbacks.onLog(turnLog.actions[turnLog.actions.length - 1]);
      callbacks.onMiss(defender.playerId);
      return;
    }

    // 攻撃力計算
    let atkPower = attacker.stats.atk;

    // 先制攻撃（初手のみ）
    if (attacker.firstStrike && turn === 1) {
      atkPower = Math.floor(atkPower * 1.5);
      turnLog.actions.push({
        type: 'ability',
        target: attacker.playerId,
        message: `${attacker.name}の先制攻撃！`
      });
      callbacks.onLog(turnLog.actions[turnLog.actions.length - 1]);
    }

    // 群体（HP50%以下でATK×1.5）
    if (attacker.ability === '物量' && attacker.currentHp <= attacker.maxHp * 0.5) {
      atkPower = Math.floor(atkPower * 1.5);
      turnLog.actions.push({
        type: 'ability',
        target: attacker.playerId,
        message: `${attacker.name}の物量攻撃！`
      });
      callbacks.onLog(turnLog.actions[turnLog.actions.length - 1]);
    }

    // ダメージ計算
    let damage = Math.max(1, atkPower - Math.floor(defender.stats.def / 3));

    // 硬殻防御（最初の被ダメ50%カット）
    if (defender.ability === '硬殻防御' && !defender.shellUsed) {
      damage = Math.max(1, Math.floor(damage * 0.5));
      defender.shellUsed = true;
      turnLog.actions.push({
        type: 'ability',
        target: defender.playerId,
        message: `${defender.name}の硬殻防御！ダメージ半減！`
      });
      callbacks.onLog(turnLog.actions[turnLog.actions.length - 1]);
    }

    // 幻影（最初2ターン被ダメ30%カット）
    if (defender.illusionTurns > 0) {
      damage = Math.max(1, Math.floor(damage * 0.7));
      defender.illusionTurns--;
      turnLog.actions.push({
        type: 'ability',
        target: defender.playerId,
        message: `${defender.name}の幻影がダメージを軽減！`
      });
      callbacks.onLog(turnLog.actions[turnLog.actions.length - 1]);
    }

    // ダメージ適用
    defender.currentHp = Math.max(0, defender.currentHp - damage);

    turnLog.actions.push({
      type: 'attack',
      attacker: attacker.playerId,
      defender: defender.playerId,
      damage: damage,
      message: `${attacker.name}の攻撃！${defender.name}に${damage}ダメージ！`
    });
    callbacks.onLog(turnLog.actions[turnLog.actions.length - 1]);
    callbacks.onAttack(attacker.playerId, defender.playerId, damage);

    // 毒付与
    if (attacker.ability === '毒撃' && !defender.poisoned) {
      defender.poisoned = true;
      turnLog.actions.push({
        type: 'ability',
        target: defender.playerId,
        message: `${defender.name}は毒に侵された！`
      });
      callbacks.onLog(turnLog.actions[turnLog.actions.length - 1]);
    }

    // 麻痺判定（電気系）
    if (attacker.ability === '麻痺' && Math.random() < 0.2) {
      defender.paralyzed = true;
      turnLog.actions.push({
        type: 'ability',
        target: defender.playerId,
        message: `${defender.name}は麻痺した！`
      });
      callbacks.onLog(turnLog.actions[turnLog.actions.length - 1]);
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
