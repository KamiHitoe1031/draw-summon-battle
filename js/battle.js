// バトルシステム
class BattleSystem {
  constructor() {
    this.maxTurns = 20;
    this.turnDelay = 1200;
    this.logs = [];
    this.debugLog = []; // デバッグログ
  }

  debug(msg, data = null) {
    const entry = { time: new Date().toISOString(), msg, data };
    this.debugLog.push(entry);
    console.log(`[BATTLE] ${msg}`, data || '');
  }

  // バトル実行
  async runBattle(creature1, creature2, callbacks) {
    this.logs = [];
    this.debugLog = [];

    this.debug('バトル開始', {
      p1: { name: creature1.name, hp: creature1.battleHp, atk: creature1.atk, def: creature1.def, spd: creature1.spd, type: creature1.type, ability: creature1.ability },
      p2: { name: creature2.name, hp: creature2.battleHp, atk: creature2.atk, def: creature2.def, spd: creature2.spd, type: creature2.type, ability: creature2.ability }
    });

    const c1 = this.createBattleState(creature1, 1);
    const c2 = this.createBattleState(creature2, 2);

    callbacks.onStart(c1, c2);
    this.initAbilities(c1, c2);

    for (let turn = 1; turn <= this.maxTurns; turn++) {
      await this.delay(this.turnDelay);

      const turnLog = { turn, actions: [] };
      callbacks.onTurnStart(turn);
      this.debug(`--- Turn ${turn} ---`);

      // ターン開始時の効果
      this.applyTurnStartEffects(c1, c2, turnLog, callbacks);
      callbacks.onUpdate(c1, c2);

      if (c1.currentHp <= 0 || c2.currentHp <= 0) {
        this.logs.push(turnLog);
        break;
      }

      // 麻痺チェック
      const c1Paralyzed = c1.paralyzed;
      const c2Paralyzed = c2.paralyzed;
      c1.paralyzed = false;
      c2.paralyzed = false;

      // 攻撃順決定
      let first, second, firstParalyzed, secondParalyzed;
      if (c1.stats.spd >= c2.stats.spd) {
        first = c1; second = c2;
        firstParalyzed = c1Paralyzed; secondParalyzed = c2Paralyzed;
      } else {
        first = c2; second = c1;
        firstParalyzed = c2Paralyzed; secondParalyzed = c1Paralyzed;
      }

      // 先攻
      if (!firstParalyzed) {
        await this.executeAttack(first, second, turn, turnLog, callbacks);
        callbacks.onUpdate(c1, c2);
        if (second.currentHp <= 0) {
          this.logs.push(turnLog);
          break;
        }
      } else {
        const action = { type: 'paralyzed', target: first.playerId, message: `${first.name}は麻痺で動けない！` };
        turnLog.actions.push(action);
        callbacks.onLog(action);
        this.debug('麻痺で行動不能', { player: first.playerId });
      }

      await this.delay(600);

      // 後攻
      if (!secondParalyzed) {
        await this.executeAttack(second, first, turn, turnLog, callbacks);
        callbacks.onUpdate(c1, c2);
        if (first.currentHp <= 0) {
          this.logs.push(turnLog);
          break;
        }
      } else {
        const action = { type: 'paralyzed', target: second.playerId, message: `${second.name}は麻痺で動けない！` };
        turnLog.actions.push(action);
        callbacks.onLog(action);
        this.debug('麻痺で行動不能', { player: second.playerId });
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
      const ratio1 = c1.currentHp / c1.maxHp;
      const ratio2 = c2.currentHp / c2.maxHp;
      if (ratio1 > ratio2) winner = 1;
      else if (ratio2 > ratio1) winner = 2;
      else winner = 'draw';
    }

    this.debug('バトル終了', {
      winner,
      p1_hp: `${c1.currentHp}/${c1.maxHp}`,
      p2_hp: `${c2.currentHp}/${c2.maxHp}`
    });

    callbacks.onEnd(winner, c1, c2);
    return winner;
  }

  createBattleState(creature, playerId) {
    return {
      playerId,
      name: creature.name,
      stats: { ...creature },
      currentHp: creature.battleHp,
      maxHp: creature.maxBattleHp,
      type: creature.type,
      ability: creature.ability,
      firstStrike: false,
      shellUsed: false,
      poisoned: false,
      paralyzed: false,
      illusionTurns: 0
    };
  }

  initAbilities(c1, c2) {
    if (c1.ability === '先制攻撃') c1.firstStrike = true;
    if (c2.ability === '先制攻撃') c2.firstStrike = true;
    if (c1.ability === '幻影') c1.illusionTurns = 2;
    if (c2.ability === '幻影') c2.illusionTurns = 2;
  }

  applyTurnStartEffects(c1, c2, turnLog, callbacks) {
    for (const c of [c1, c2]) {
      // 毒ダメージ
      if (c.poisoned) {
        const poisonDmg = 2;
        c.currentHp = Math.max(0, c.currentHp - poisonDmg);
        const action = { type: 'poison', target: c.playerId, damage: poisonDmg, message: `${c.name}は毒で${poisonDmg}ダメージ！` };
        turnLog.actions.push(action);
        callbacks.onLog(action);
        this.debug('毒ダメージ', { player: c.playerId, damage: poisonDmg, remainHp: c.currentHp });
      }

      // 再生回復
      if (c.ability === '再生') {
        const healAmount = Math.min(3, c.maxHp - c.currentHp);
        if (healAmount > 0) {
          c.currentHp += healAmount;
          const action = { type: 'heal', target: c.playerId, amount: healAmount, message: `${c.name}はHPを${healAmount}回復した！` };
          turnLog.actions.push(action);
          callbacks.onLog(action);
          this.debug('再生回復', { player: c.playerId, heal: healAmount, remainHp: c.currentHp });
        }
      }
    }
  }

  // ダメージ計算式
  // base = ATK * 3（ATKをダメージベースに変換）
  // 軽減率 = DEF / (DEF + 15)（DEFが高くても100%軽減にはならない）
  // damage = base * (1 - 軽減率) = base * 15 / (DEF + 15)
  // 最低保証ダメージ = 1
  calcDamage(atk, def) {
    const base = atk * 3;
    const reduction = def / (def + 15);
    const damage = Math.round(base * (1 - reduction));
    return Math.max(1, damage);
  }

  async executeAttack(attacker, defender, turn, turnLog, callbacks) {
    // 回避判定（飛行系）
    if (defender.ability === '回避' && Math.random() < 0.3) {
      const action = { type: 'miss', attacker: attacker.playerId, defender: defender.playerId, message: `${defender.name}は攻撃を回避した！` };
      turnLog.actions.push(action);
      callbacks.onLog(action);
      callbacks.onMiss(defender.playerId);
      this.debug('回避成功', { defender: defender.playerId });
      return;
    }

    // 攻撃力計算
    let atkPower = attacker.stats.atk;
    let atkMods = [];

    // 先制攻撃（初手のみ）
    if (attacker.firstStrike && turn === 1) {
      atkPower = Math.floor(atkPower * 1.5);
      atkMods.push('先制×1.5');
      const action = { type: 'ability', target: attacker.playerId, message: `${attacker.name}の先制攻撃！` };
      turnLog.actions.push(action);
      callbacks.onLog(action);
    }

    // 群体（HP50%以下でATK×1.5）
    if (attacker.ability === '物量' && attacker.currentHp <= attacker.maxHp * 0.5) {
      atkPower = Math.floor(atkPower * 1.5);
      atkMods.push('物量×1.5');
      const action = { type: 'ability', target: attacker.playerId, message: `${attacker.name}の物量攻撃！` };
      turnLog.actions.push(action);
      callbacks.onLog(action);
    }

    // ダメージ計算（新方式: 割合軽減）
    let damage = this.calcDamage(atkPower, defender.stats.def);

    this.debug('ダメージ計算', {
      attacker: `P${attacker.playerId} ${attacker.name}`,
      defender: `P${defender.playerId} ${defender.name}`,
      baseATK: attacker.stats.atk,
      effectiveATK: atkPower,
      atkMods: atkMods.length ? atkMods : 'なし',
      defenderDEF: defender.stats.def,
      formula: `base=${atkPower * 3}, 軽減率=${(defender.stats.def / (defender.stats.def + 15) * 100).toFixed(1)}%, damage=${damage}`
    });

    // 硬殻防御（最初の被ダメ50%カット）
    if (defender.ability === '硬殻防御' && !defender.shellUsed) {
      const before = damage;
      damage = Math.max(1, Math.floor(damage * 0.5));
      defender.shellUsed = true;
      const action = { type: 'ability', target: defender.playerId, message: `${defender.name}の硬殻防御！ダメージ半減！` };
      turnLog.actions.push(action);
      callbacks.onLog(action);
      this.debug('硬殻防御', { before, after: damage });
    }

    // 幻影（最初2ターン被ダメ30%カット）
    if (defender.illusionTurns > 0) {
      const before = damage;
      damage = Math.max(1, Math.floor(damage * 0.7));
      defender.illusionTurns--;
      const action = { type: 'ability', target: defender.playerId, message: `${defender.name}の幻影がダメージを軽減！` };
      turnLog.actions.push(action);
      callbacks.onLog(action);
      this.debug('幻影軽減', { before, after: damage, remainTurns: defender.illusionTurns });
    }

    // ダメージ適用
    defender.currentHp = Math.max(0, defender.currentHp - damage);

    const action = {
      type: 'attack',
      attacker: attacker.playerId,
      defender: defender.playerId,
      damage,
      message: `${attacker.name}の攻撃！${defender.name}に${damage}ダメージ！`
    };
    turnLog.actions.push(action);
    callbacks.onLog(action);
    callbacks.onAttack(attacker.playerId, defender.playerId, damage);

    this.debug('ダメージ適用', { defender: defender.playerId, damage, remainHp: defender.currentHp });

    // 毒付与
    if (attacker.ability === '毒撃' && !defender.poisoned) {
      defender.poisoned = true;
      const poisonAction = { type: 'ability', target: defender.playerId, message: `${defender.name}は毒に侵された！` };
      turnLog.actions.push(poisonAction);
      callbacks.onLog(poisonAction);
    }

    // 麻痺判定（電気系）
    if (attacker.ability === '麻痺' && Math.random() < 0.2) {
      defender.paralyzed = true;
      const paraAction = { type: 'ability', target: defender.playerId, message: `${defender.name}は麻痺した！` };
      turnLog.actions.push(paraAction);
      callbacks.onLog(paraAction);
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // デバッグログをテキストで取得
  getDebugLogText() {
    return this.debugLog.map(e => {
      const dataStr = e.data ? ' ' + JSON.stringify(e.data) : '';
      return `${e.msg}${dataStr}`;
    }).join('\n');
  }
}
