(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.GLOBAL = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AttackManager = undefined;

var _underscore = require('underscore');

var _ = _interopRequireWildcard(_underscore);

var _globals = require('./globals');

var _log = require('./log');

var _log2 = _interopRequireDefault(_log);

var _model = require('./model');

var _vectorutils = require('./vectorutils');

var vu = _interopRequireWildcard(_vectorutils);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var AttackManager = exports.AttackManager = _model.Model.extend({
  initialize: function initialize() {
    this.attacks = [];
  },

  tick: function tick(livingBodies) {
    if (livingBodies[0] === undefined || livingBodies[1] === undefined) {
      _log2.default.error('Attackmanager tick no enemies');
    }

    for (var i = this.attacks.length; i--;) {
      this.attacks[i].tick(livingBodies[this.attacks[i].targetTeam]);
    }

    var atk;
    var newAttacks;
    for (var i = this.attacks.length; i--;) {
      atk = this.attacks[i];
      newAttacks = atk.getNewAttacks();
      if (newAttacks.length > 0) {
        this.attacks.push.apply(this.attacks, newAttacks);
      }
      if (atk.done) {
        this.attacks.splice(i, 1);
      }
    }
  },

  nextRoom: function nextRoom(room) {
    this.room = room;
    this.attacks = [];
  },

  addAttack: function addAttack(skill, attacker, target) {
    _.each(skill.spec.specs, function (spec, i, specs) {
      if (spec.type === 'melee') {
        this.attacks.push(new MeleeAttack(spec, attacker, target, this.room));
      } else if (spec.type === 'proj') {
        this.attacks.push.apply(this.attacks, newProjsFromBody(spec, attacker, target, this.room));
      } else if (spec.type === 'cone') {
        this.attacks.push(newConeFromBody(spec, attacker, target, this.room));
        // new cone from body
      } else if (spec.type === 'circle') {
        this.attacks.push(newCircleFromBody(spec, attacker, target, this.room));
        // new circle from body
      } else if (spec.type === 'minion') {
        // zone.
      }
    }, this);
  },

  getAttacks: function getAttacks() {
    return this.attacks;
  }
});

var Attack = _model.Model.extend({
  getNewAttacks: function getNewAttacks() {
    var temp = this.newAttacks;
    this.newAttacks = [];
    return temp;
  },

  handle: function handle(eventType, enemy) {
    var arr = eventToArr(this, eventType);
    if (arr === undefined || arr.length < 1) {
      return;
    }
    _.each(arr, function (spec) {
      if (spec.type === 'proj') {
        this.newAttacks.push.apply(this.newAttacks, newChildProjs(spec, this, enemy, this.room));
        _log2.default.info('Added new child projs to new attacks, len: %d', this.newAttacks.length);
      } else if (spec.type === 'cone') {
        this.newAttacks.push(newChildCone(spec, this, enemy, this.room));
      } else if (spec.type === 'circle') {
        this.newAttacks.push(newChildCircle(spec, this, enemy, this.room));
      } else if (spec.type === 'minion') {
        // zone.
      }
    }, this);
  },

  hit: function hit(enemy) {
    this.hitHeight = enemy.fireHeight();

    if (enemy.rollHit(this)) {
      var result = enemy.takeDamage(this);
      this.attacker.handleHit(enemy, this, result);
      this.handle('hit', enemy);
      if (!enemy.isAlive()) {
        this.handle('kill', enemy);
      }
    }
  },

  remove: function remove() {
    this.handle('remove');
    this.done = true;
  }
});

function eventToArr(atk, eventType) {
  return atk['on' + eventType[0].toUpperCase() + eventType.slice(1)];
}

function newProjsFromBody(spec, attacker, target, room) {
  var vector = target.pos.sub(attacker.pos);
  var fireTime = _globals.gl.time + spec.speed / 2;
  var angles = getProjAngles(spec.projCount, spec.angle);
  return _.map(angles, function (angle) {
    return new ProjAttack(spec, attacker, target.spec.team, attacker.pos, vector.rotate(angle), fireTime, room);
  });
}

function newChildProjs(spec, atk, enemy, room) {
  var angles = getProjAngles(spec.projCount, spec.angle);

  return _.map(angles, function (angle) {
    return new ProjAttack(spec, atk.attacker, atk.targetTeam, atk.pos, atk.vector.rotate(angle), _globals.gl.time, enemy, room);
  });
}

function getProjAngles(projCount, angle) {
  var angles = [];

  if (projCount === 1) {
    angles.push(0);
  } else {
    var s, e;
    if (projCount % 2 === 0) {
      e = angle * (0.5 + (projCount - 2) / 2);
      s = -e;
    } else {
      e = angle * (projCount - 1) / 2;
      s = -e;
    }
    for (var a = s; a <= e; a += angle) {
      angles.push(a);
    }
  }
  return angles;
}

var ProjAttack = Attack.extend({
  initialize: function initialize(spec, attacker, targetTeam, start, vector, fireTime, immuneTarget, room) {
    this.newAttacks = [];
    _.extend(this, spec);

    this.attacker = attacker;
    this.targetTeam = targetTeam;
    this.start = start.clone();
    this.pos = start.clone();
    this.fireTime = fireTime;
    this.room = room;

    if (immuneTarget) {
      this.immuneTargetId = immuneTarget.id;
    }

    this.vector = vector.unitVector().mult(this.projSpeed);
    this.z = attacker.spec.height / 2;
    if (!this.color) {
      this.color = '#fff';
    }
    if (!this.projRadius) {
      this.projRadius = Math.pow(2, 16);
    }

    _log2.default.debug('projectile created, pos: %s, vector: %s', this.pos, this.vector);
  },

  tick: function tick(enemies) {
    if (_globals.gl.time <= this.fireTime) {
      return;
    }
    var elapsedTime = _globals.gl.time - this.fireTime;
    var nextPos = this.start.add(this.vector.mult(elapsedTime));

    var e;
    for (var i = enemies.length; i--;) {
      e = enemies[i];
      if (e.id !== this.immuneTargetId && e.isAlive() && vu.hit(this.pos, nextPos, e.pos, e.spec.width, this.projRadius)) {
        this.hit(e);
        this.remove();
        break;
      }
    }
    this.pos = nextPos;

    if (this.pos.sub(this.start).len2() > this.projRange * this.projRange) {
      this.remove();
    }
  }
});

function newConeFromBody(spec, attacker, target, room) {
  var vector = target.pos.sub(attacker.pos);
  var fireTime = _globals.gl.time + spec.speed / 2;
  return new ConeAttack(spec, attacker, target.spec.team, attacker.pos, vector, fireTime, room);
}

function newChildCone(spec, atk, enemy, room) {
  return new ConeAttack(spec, atk.attacker, atk.targetTeam, enemy.pos, atk.vector, _globals.gl.time, room);
}

var ConeAttack = Attack.extend({
  initialize: function initialize(spec, attacker, targetTeam, start, vector, fireTime, immuneTarget, room) {
    this.newAttacks = [];
    _.extend(this, spec);

    this.attacker = attacker;
    this.targetTeam = targetTeam;
    this.start = start.clone();
    this.pos = start.clone();
    this.startTime = _globals.gl.time;
    this.fireTime = fireTime;
    this.room = room;

    this.immuneTargetIds = {};
    if (immuneTarget !== undefined) {
      this.immuneTargetIds[immuneTarget.id] = true;
    }

    this.vector = vector.unitVector().mult(this.aoeSpeed);
    this.z = 0;
    if (!this.color) {
      this.color = '#fff';
    }
  },

  tick: function tick(enemies) {
    if (_globals.gl.time <= this.fireTime) {
      return;
    }
    var elapsedTime = _globals.gl.time - this.fireTime;
    var diff = this.vector.mult(elapsedTime);
    var nextPos = this.start.add(diff);
    _log2.default.debug('cone moving from %s to %s', this.pos, nextPos);
    this.pos = nextPos;

    for (var i = 0; i < enemies.length; i++) {
      if (this.immuneTargetIds[enemies[i].id] || !enemies[i].isAlive()) {
        _log2.default.debug('Intentionally avoiding immune target');
        continue;
      }
      if (vu.coneHit(this.start, diff, this.angle, enemies[i].pos, enemies[i].spec.width)) {
        this.hit(enemies[i]);
        this.immuneTargetIds[enemies[i].id] = true;
        break;
      }
    }

    if (this.pos.sub(this.start).len2() > this.aoeRadius * this.aoeRadius) {
      this.remove();
    }
  }
});

function newCircleFromBody(spec, attacker, target, room) {
  var vector = target.pos.sub(attacker.pos);
  var fireTime = _globals.gl.time + spec.speed / 2;
  return new CircleAttack(spec, attacker, target.spec.team, attacker.pos, vector, fireTime, room);
}

function newChildCircle(spec, atk, enemy, room) {
  return new CircleAttack(spec, atk.attacker, atk.targetTeam, enemy.pos, atk.vector, _globals.gl.time, room);
}

var CircleAttack = Attack.extend({
  initialize: function initialize(spec, attacker, targetTeam, start, vector, fireTime, immuneTarget, room) {
    this.newAttacks = [];
    _.extend(this, spec);

    this.attacker = attacker;
    this.targetTeam = targetTeam;
    this.start = start.clone();
    this.pos = start.clone();
    this.startTime = _globals.gl.time;
    this.fireTime = fireTime;
    this.room = room;

    this.immuneTargetIds = {};
    if (immuneTarget !== undefined) {
      this.immuneTargetIds[immuneTarget.id] = true;
    }

    this.vector = vector.unitVector().mult(this.aoeSpeed);
    this.z = 0;
    if (!this.color) {
      this.color = '#fff';
    }
  },

  tick: function tick(enemies) {
    if (_globals.gl.time <= this.fireTime) {
      return;
    }
    var elapsedTime = _globals.gl.time - this.fireTime;
    var diff = this.vector.mult(elapsedTime);
    var nextPos = this.start.add(diff);
    _log2.default.debug('circle moving from %s to %s', this.pos, nextPos);
    this.pos = nextPos;

    var radius = this.pos.sub(this.start).len();

    for (var i = 0; i < enemies.length; i++) {
      if (this.immuneTargetIds[enemies[i].id] || !enemies[i].isAlive()) {
        _log2.default.debug('Intentionally avoiding immune target');
        continue;
      }
      if (enemies[i].pos.sub(this.start).len() < radius + enemies[i].spec.width) {
        // if (vu.circleHit(this.start, diff, this.angle, enemies[i].pos,
        // enemies[i].spec.width)) {
        this.hit(enemies[i]);
        this.immuneTargetIds[enemies[i].id] = true;
        break;
      }
    }

    if (this.pos.sub(this.start).len2() > this.aoeRadius * this.aoeRadius) {
      this.remove();
    }
  }
});

var MeleeAttack = Attack.extend({
  initialize: function initialize(spec, attacker, target, room) {
    this.newAttacks = [];
    _.extend(this, spec);
    this.attacker = attacker;
    this.target = target;
    this.targetTeam = target.spec.team;

    this.vector = this.target.pos.sub(this.attacker.pos);

    this.start = attacker.pos.clone();
    this.pos = attacker.pos.clone();
    this.startTime = _globals.gl.time;
    this.endTime = _globals.gl.time + spec.speed / 2;
    this.totalTime = spec.speed / 2;
    this.room = room;

    this.z = attacker.spec.height / 2;
    this.color = spec.color ? spec.color : '#fff';
  },

  tick: function tick() {
    var pct = (_globals.gl.time - this.startTime) / this.totalTime;
    if (pct < 1) {
      this.pos = this.start.pctCloser(this.target.pos, pct);
    } else {
      this.pos = this.target.pos;
      this.hit(this.target);
      this.remove();
    }
  }
});


},{"./globals":9,"./log":19,"./model":21,"./vectorutils":26,"underscore":33}],2:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MonsterBody = exports.HeroBody = undefined;

var _underscore = require('underscore');

var _ = _interopRequireWildcard(_underscore);

var _damage = require('./damage');

var _entity = require('./entity');

var _globals = require('./globals');

var _log = require('./log');

var _log2 = _interopRequireDefault(_log);

var _model = require('./model');

var _prob = require('./prob');

var _utils = require('./utils');

var _vectorutils = require('./vectorutils');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var TEAM_HERO = 0;
var TEAM_MONSTER = 1;

var EntityBody = _model.Model.extend({
  initialize: function initialize(spec, zone) {
    this.spec = spec;
    this.zone = zone;
    this.createSkillchain();
    this.revive();
    this.pos = new _vectorutils.Point(0, 0);
    this.nextAction = 0;
    this.moveStart = -1;
  },

  createSkillchain: function createSkillchain() {
    this.skills = _.map(_.compact(this.spec.skillchain.skills), function (skill) {
      return { spec: skill, coolAt: _globals.gl.time + skill.cooldownTime };
    });
  },

  revive: function revive() {
    this.takeAction(0);
    this.hp = this.spec.maxHp;
    this.mana = this.spec.maxMana;
    this.lastHpFullTime = _globals.gl.time;
    this.hpRegened = 0;
    this.lastManaFullTime = _globals.gl.time;
    this.manaRegened = 0;
    _.each(_.compact(this.skills), function (skill) {
      skill.coolAt = _globals.gl.time + skill.spec.cooldownTime;
    });
  },

  initPos: function initPos(room) {
    if (this.isHero()) {
      this.pos = room.ent.clone();
      _globals.gl.DirtyQueue.mark('hero:move');
    } else if (this.isMonster()) {
      this.pos = new _vectorutils.Point((0, _prob.rand)(0, room.size.x), (0, _prob.rand)(0, room.size.y));
    }
  },

  isHero: function isHero() {
    return this.spec.team === TEAM_HERO;
  },

  isMonster: function isMonster() {
    return this.spec.team === TEAM_MONSTER;
  },

  teamString: function teamString() {
    if (this.isHero()) {
      return 'Hero';
    } else {
      return 'Monster';
    }
  },

  isAlive: function isAlive() {
    return this.hp > 0;
  },

  modifyHp: function modifyHp(added) {
    this.hp += added;
    if (this.hp >= this.spec.maxHp) {
      this.hp = this.spec.maxHp;
      this.lastHpFullTime = _globals.gl.time;
      this.hpRegened = 0;
    }
  },

  modifyMana: function modifyMana(added) {
    this.mana += added;
    if (this.mana >= this.spec.maxMana) {
      this.mana = this.spec.maxMana;
      this.lastManaFullTime = _globals.gl.time;
      this.manaRegened = 0;
    }
    if (this.mana < 0) {
      this.mana = 0;
      this.lastManaFullTime = _globals.gl.time;
      this.manaRegened = 0;
    }
  },

  regen: function regen() {
    if (_globals.gl.time > this.lastHpFullTime) {
      var total = this.spec.hpRegen * (_globals.gl.time - this.lastHpFullTime) / 1000;
      var toAdd = total - this.hpRegened;
      this.hpRegened = total;
      this.modifyHp(toAdd);
    }
    if (_globals.gl.time > this.lastManaFullTime) {
      var total = this.spec.manaRegen * (_globals.gl.time - this.lastManaFullTime) / 1000;
      var toAdd = total - this.manaRegened;
      this.manaRegened = total;
      this.modifyMana(toAdd);
    }
  },

  tryDoStuff: function tryDoStuff(room, enemies) {
    this.regen();

    if (this.isHero() && enemies.length) {
      this.setSkillRangeMana(enemies);
    }
    if (!this.isAlive() || this.busy()) {
      return;
    }

    if (enemies.length === 0) {
      if (this.isHero()) {
        this.tryMove(enemies, distances, room);
      }
      _.each(_.compact(this.skills), function (skill) {
        skill.oom = skill.spec.manaCost > this.mana;
        skill.oor = true;
      }, this);
      return;
    }

    var distances = (0, _vectorutils.getDistances)(this.pos, _.pluck(enemies, 'pos'));

    this.tryAttack(enemies, distances, room);
    this.tryMove(enemies, distances, room);
  },

  tryAttack: function tryAttack(enemies, distances, room) {
    var minIndex = distances.minIndex();
    var minDist = distances[minIndex];
    var skills = _.compact(this.skills);
    var skill;

    this.setSkillRangeMana(enemies);

    for (var i = 0; i < skills.length; i++) {
      // use first skill that:
      skill = skills[i];
      if (skill.coolAt <= _globals.gl.time && !skill.oom && !skill.oor) {
        this.attackTarget(enemies[minIndex], skill, room);
        return;
      }
    }
  },

  setSkillRangeMana: function setSkillRangeMana(enemies) {
    var mana = this.mana;
    var pos = this.pos;
    var minDist2 = pos.dist2(enemies[0].pos);
    var t;
    for (var i = enemies.length; i--;) {
      t = pos.dist2(enemies[i].pos);
      if (t < minDist2) {
        minDist2 = t;
      }
    }
    _.each(_.compact(this.skills), function (skill) {
      var r = skill.spec.range;
      skill.oom = skill.spec.manaCost > mana;
      skill.oor = r * r < minDist2;
    });
  },

  takeAction: function takeAction(duration) {
    this.moveStart = -1;
    this.nextAction = _globals.gl.time + duration;
    this.lastDuration = duration;
  },

  tryMove: function tryMove(enemies, distances, room) {
    if (this.busy()) {
      return;
    }
    if (this.moveStart === -1) {
      this.moveStart = _globals.gl.time;
    }

    var dist = this.spec.moveSpeed * _globals.gl.lastTimeIncr;
    var newPos;

    if (enemies.length === 0) {
      newPos = this.pos.closer(room.exit, dist, 0);
    } else {
      var target = enemies[distances.minIndex()];
      var range = _.map(_.compact(this.skills), function (skill) {
        return skill.spec.range * .9;
      }).min();
      if (!range) {
        range = 1;
      }
      if (isNaN(this.pos.x)) {
        console.log(this.pos);
      }
      newPos = this.pos.closer(target.pos, dist, range);

      var moveVect = newPos.sub(this.pos);
      var moveAngle = this.spec.moveAngle ? this.spec.moveAngle : 0;

      newPos = this.pos.add(moveVect.rotate(moveAngle)).inBounds(room.size);
    }

    if (this.pos.x === newPos.x && this.pos.y === newPos.y) {
      // didn't actually move, make legs not move
      this.moveStart = -1;
    } else {
      this.pos = newPos;
      if (this.isHero()) {
        _globals.gl.DirtyQueue.mark('hero:move');
      }
    }
  },

  attackTarget: function attackTarget(target, skill, room) {
    skill.coolAt = _globals.gl.time + skill.spec.speed + skill.spec.cooldownTime;
    this.takeAction(skill.spec.speed);
    this.mana -= skill.spec.manaCost;
    _globals.gl.addAttack(skill, this, target);
  },

  handleHit: function handleHit(target, atk, dmgResult) {
    this.handleLeech(atk, dmgResult);
    if (!target.isAlive()) {
      this.onKill(target);
      target.onDeath();
    }
  },

  handleLeech: function handleLeech(atk, dmgResult) {
    var hp = atk.hpOnHit + dmgResult.hpLeeched;
    var mana = atk.manaOnHit + dmgResult.manaLeeched;
    if (hp) {
      this.modifyHp(hp);
    }
    if (mana) {
      this.modifyMana(mana);
    }
  },

  rollHit: function rollHit(attack) {
    var hitChance = 3 * attack.accuracy / (attack.accuracy + this.spec.dodge) * (0.5 + attack.attacker.spec.level / (attack.attacker.spec.level + this.spec.level) / 2);

    if (hitChance > 0.99) {
      hitChance = 0.99;
    } else if (hitChance < 0.01) {
      hitChance = 0.01;
    }
    _log2.default.info('%s has %d%% chance to be hit by %s', this.spec.name, hitChance * 100, attack.attacker.spec.name);

    // log.error('%s has %d%% chance to be hit by %s', this.spec.name,
    // hitChance * 100, attack.attacker.spec.name);

    if (Math.random() < hitChance) {
      return true;
    }
    if (this.spec.team === 0 && _globals.gl.settings.enableHeroDmgMsgs || this.spec.team === 1 && _globals.gl.settings.enableMonDmgMsgs) {
      _globals.gl.MessageEvents.trigger('message', newZoneMessage('未命中!', 'dodge', this.pos, 'rgba(230, 230, 10, 0.2)', 1000));
    }

    return false;
  },

  takeDamage: function takeDamage(attack, isThorns) {
    var dealt = new _damage.DamageDealt(attack, this.spec);

    if (isNaN(dealt.total)) {
      console.log(dealt.total, attack.name);
      throw 'In body.takeDamage by ' + this.spec.name + ', ' + attack.attacker.spec.name + ' totalDmg has NaN value.  Monster missing card level in itemref?';
    }

    var allowedPct = dealt.total / attack.totalDmg;
    if (this.hp <= 0) {
      allowedPct = 0;
    }

    var result = {
      hpLeeched: allowedPct * attack.hpLeech,
      manaLeeched: allowedPct * attack.manaLeech,
      totalDmg: dealt.total
    };

    if (this.spec.team === TEAM_HERO) {
      _log2.default.debug('Team Hero taking %.2f damage', -dealt.total);
      if (dealt.total > this.hp && this.hp > 0) {
        _log2.default.reportDeath('hero killed by ' + attack.attacker.spec.name + ' at ' + _globals.gl.sessionId + ' ' + _globals.gl.time);
        this.spec.lastDeath = attack.attacker.spec.name;
        _globals.gl.GameEvents.trigger('hero:death');
        if (_globals.gl.settings.pauseOnDeath && this.hp > 0) {
          _globals.gl.pause();
        }
      }
    }

    this.modifyHp(-dealt.total);

    _log2.default.debug('Team %s taking damage, hit for %s, now has %.2f hp', this.teamString(), dealt.total, this.hp);
    // TODO: Add rolling for dodge in here so we can sometimes return 0;

    if (this.spec.team === 0 && _globals.gl.settings.enableHeroDmgMsgs || this.spec.team === 1 && _globals.gl.settings.enableMonDmgMsgs) {
      makeDamageMessages(attack, dealt, this.pos);
    }

    if (!isThorns) {
      var thornsAttack = {
        'physDmg': this.spec.physThorns,
        'fireDmg': this.spec.fireThorns,
        'coldDmg': this.spec.coldThorns,
        'lightDmg': this.spec.lightThorns,
        'poisDmg': this.spec.poisThorns,
        'attacker': this,
        'pos': attack.attacker.pos,
        'start': attack.attacker.pos,
        'hitHeight': attack.hitHeight,
        'vector': attack.vector.rotate(180)
      };
      attack.attacker.takeDamage(thornsAttack, true);
      if (attack.attacker.hp <= 0) {
        this.onKill(attack.attacker);
      }
    }

    return result;
  },

  busy: function busy() {
    return this.nextAction >= _globals.gl.time;
  },

  onKill: function onKill() {},
  onDeath: function onDeath() {},

  fireHeight: function fireHeight() {
    return this.spec.height / 2;
  }
});

var HeroBody = exports.HeroBody = EntityBody.extend({
  initialize: function initialize(spec, zone) {
    this.potionCoolAt = _globals.gl.time;
    this.listenTo(spec.skillchain, 'skillComputeAttrs', this.updateSkillchain);
    this.listenTo(spec, 'computeAttrs', this.updateSkillchain);
    this.listenTo(spec.equipped, 'change', this.resetCooldowns);
    EntityBody.prototype.initialize.call(this, spec, zone);
  },

  resetCooldowns: function resetCooldowns() {
    _.each(_.compact(this.skills), function (skill) {
      skill.coolAt = _globals.gl.time + skill.spec.cooldownTime;
    });
  },

  updateSkillchain: function updateSkillchain() {
    _log2.default.info('HeroBody: updateSkillchain');
    var s = this.spec.skillchain;

    this.lastHpFullTime = _globals.gl.time;
    this.hpRegened = 0;
    this.lastManaFullTime = _globals.gl.time;
    this.manaRegened = 0;

    var lookup = {};
    for (var i = 0; i < this.skills.length; i++) {
      lookup[this.skills[i].spec.name] = this.skills[i];
    }

    var skills = _.filter(s.skills, function (skill) {
      return skill && !skill.disabled;
    });

    this.skills = _.map(skills, function (skill) {
      if (skill.name in lookup) {
        return { spec: skill, coolAt: lookup[skill.name].coolAt };
      } else {
        return { spec: skill, coolAt: _globals.gl.time + skill.cooldownTime };
      }
    });
    _globals.gl.DirtyQueue.mark('bodySkillchainUpdated');
  },

  onKill: function onKill(target) {
    var xpGained = target.spec.xpOnKill(this.spec.level);
    var levels = this.spec.applyXp(xpGained);
    if (levels > 0) {
      this.revive();
    }
    if (target.spec.deathSpawns !== undefined && target.spec.deathSpawns.length > 0) {
      for (var i = 0; i < target.spec.deathSpawns.length; i++) {
        if (this.zone.rooms[this.zone.heroPos].monsters.length > 10000) {
          continue;
        }
        var newMon = new MonsterBody(target.spec.deathSpawns[i], target.spec.level, this.zone);
        newMon.pos = this.zone.getNearbyPos(target.pos, 1000);
        ;
        this.zone.rooms[this.zone.heroPos].monsters.push(newMon);
      }
    }
    var allDrops = target.spec.getDrops();
    if (allDrops.any) {
      var invMessages = this.spec.inv.addDrops(allDrops.gearDrops);
      var cardMessages = this.spec.cardInv.addDrops(allDrops.cardDrops);
      var matMessages = this.spec.matInv.addDrops(allDrops.matDrops);
      var messages = invMessages.concat(cardMessages.concat(matMessages));
      if (_globals.gl.settings.enableMatMsgs) {
        _.each(messages, function (message, index) {
          var color = message.slice(0, 3) == 'New' || message.slice(0, 7) == 'Leveled' ? 'rgba(255, 140, 0, 0.8)' : 'rgba(255, 100, 0, 0.6)';
          _globals.gl.MessageEvents.trigger('message',
          // TODO: Fix the offset here
          newZoneMessage(message, '掉落', target.pos, color, 1000, target.spec.height / 2 + index * 300));
        }, this);
      }
    }
    _globals.gl.DirtyQueue.mark('monsters:death');
  },

  onDeath: function onDeath() {
    if (this.spec.level >= 100) {
      this.spec.xp = Math.max(0, this.spec.xp - this.spec.getNextLevelXp() / 200);
      _globals.gl.DirtyQueue.mark('hero:xp');
    }
    _log2.default.debug('your hero died');
  },

  modifyHp: function modifyHp(added) {
    EntityBody.prototype.modifyHp.call(this, added);
    _globals.gl.DirtyQueue.mark('hero:hp');
  },

  modifyMana: function modifyMana(added) {
    EntityBody.prototype.modifyMana.call(this, added);
    _globals.gl.DirtyQueue.mark('hero:mana');
  },

  revive: function revive() {
    this.potionCoolAt = _globals.gl.time;
    EntityBody.prototype.revive.call(this);
    _globals.gl.DirtyQueue.mark('revive');
  },

  tryUsePotion: function tryUsePotion() {
    if (Math.abs(this.spec.maxHp - this.hp) < 0.00001 || this.hp <= 0.00001) {
      return;
    }
    if (this.potionCoolAt <= _globals.gl.time) {
      _log2.default.reportPotion();
      this.potionCoolAt = _globals.gl.time + 10000; // 10 second cooldown
      var addAmount = 10 + this.spec.level * 20 * Math.pow(1.002, this.spec.level);
      this.modifyHp(addAmount);
      _globals.gl.MessageEvents.trigger('message', newZoneMessage('药水起作用了!', 'potion', this.pos, 'rgba(230, 230, 230, 0.7)', 1000));
    } else {
      _globals.gl.MessageEvents.trigger('message', newZoneMessage('药水还在冷却!', 'potion', this.pos, 'rgba(230, 230, 230, 0.4)', 500));
    }
  }
});

_globals.gl.monsterSpecs = {};

var MonsterBody = exports.MonsterBody = EntityBody.extend({
  initialize: function initialize(name, level, zone) {
    var uid = name + '_' + level;
    var spec;
    if (uid in _globals.gl.monsterSpecs) {
      spec = _globals.gl.monsterSpecs[uid];
    } else {
      spec = new _entity.MonsterSpec(name, level);
      _globals.gl.monsterSpecs[uid] = spec;
    }
    EntityBody.prototype.initialize.call(this, spec, zone);
  }
});

function newZoneMessage(text, type, pos, color, lifespan, verticalOffset) {
  return {
    text: text,
    type: type,
    pos: pos,
    color: color,
    lifespan: lifespan,
    verticalOffset: verticalOffset,
    time: _globals.gl.time,
    expires: _globals.gl.time + lifespan
  };
}

function newDamageMessage(attack, pos, text, type) {
  var dmg = new _damage.Damage(attack.start, pos, attack.vector, attack.hitHeight, type);
  return {
    type: 'dmg',
    text: text,
    dmg: dmg,
    color: dmg.color,
    expires: _globals.gl.time + 2000
  };
}

function makeDamageMessages(attack, dealt, pos) {
  _.each(['phys', 'light', 'cold', 'fire', 'pois'], function (type) {
    if (dealt[type] > 0) {
      _globals.gl.MessageEvents.trigger('message', newDamageMessage(attack, pos, (0, _utils.prettifyNum)(Math.ceil(dealt[type])), type));
    }
  });
}


},{"./damage":4,"./entity":6,"./globals":9,"./log":19,"./model":21,"./prob":22,"./utils":25,"./vectorutils":26,"underscore":33}],3:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
// Constants you may want to tweak

var LOG_LEVEL = exports.LOG_LEVEL = 'UI';


},{}],4:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Damage = Damage;
exports.DamageDealt = DamageDealt;

var _underscore = require('underscore');

var _ = _interopRequireWildcard(_underscore);

var _globals = require('./globals');

var _vectorutils = require('./vectorutils');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var colorLookup = {
  phys: 'rgba(230, 0, 0, 0.8)',
  cold: 'rgba(0, 255, 255, 0.8)',
  fire: 'rgba(255, 165, 0, 0.8)',
  light: 'rgba(193, 17, 214, 0.8)',
  pois: 'rgba(85, 255, 139, 0.8)'
};

function Damage(start, end, vector, height, type) {
  this.end = end;
  if (end.equal(start)) {
    this.vect = vector.unitVector();
  } else {
    this.vect = end.sub(start).unitVector();
  }
  this.vect = this.vect.rotate((Math.random() - 0.5) * 60);
  this.startTime = _globals.gl.time;
  this.height = height;
  this.type = type;
  this.color = colorLookup[type];

  this.getY = Damage.prototype[this.type + 'Y'].bind(this);

  this.k = -3 * this.height * (0.75 + Math.random() / 2);
  this.p = 0.75 * this.height * (0.75 + Math.random() / 2);
}

Damage.prototype.physY = function () {
  var elapsed = (_globals.gl.time - this.startTime) / 1000;
  return -3 * this.height * Math.pow(elapsed - 0.2, 2) + 0.75 * this.height;
};

Damage.prototype.fireY = function () {
  var elapsed = (_globals.gl.time - this.startTime) / 1000;
  return 1.5 * this.height * Math.pow(elapsed - 0.75, 3) + this.height;
};

Damage.prototype.lightY = function () {
  var elapsed = (_globals.gl.time - this.startTime) / 1000;
  return this.height * elapsed + this.height / 4 * Math.sin(elapsed * Math.PI * 4) + this.height / 2;
};

Damage.prototype.coldY = function () {
  var elapsed = (_globals.gl.time - this.startTime) / 1000;
  return -1.5 * this.height * Math.pow(elapsed - 0.5, 2) + this.height * 1.2;
};

Damage.prototype.poisY = function () {
  var elapsed = (_globals.gl.time - this.startTime) / 1000;
  return -2 * this.height * Math.pow(elapsed, 2) + this.height * 0.65;
};

Damage.prototype.getBase = function () {
  var elapsed = _globals.gl.time - this.startTime;
  var base = this.end.add(this.vect.mult(4 * elapsed));
  return base;
};

function DamageDealt(attack, spec) {
  var physDmg = attack.physDmg;
  this.phys = physDmg * physDmg / (physDmg + spec.armor);
  this.light = attack.lightDmg * attack.lightDmg / (attack.lightDmg + spec.lightResist);
  this.cold = attack.coldDmg * attack.coldDmg / (attack.coldDmg + spec.coldResist);
  this.fire = attack.fireDmg * attack.fireDmg / (attack.fireDmg + spec.fireResist);
  this.pois = attack.poisDmg * attack.poisDmg / (attack.poisDmg + spec.poisResist);
  this.total = this.phys + this.light + this.cold + this.fire + this.pois;
}


},{"./globals":9,"./vectorutils":26,"underscore":33}],5:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.dropFactory = dropFactory;

var _underscore = require('underscore');

var _ = _interopRequireWildcard(_underscore);

var _inventory = require('./inventory');

var inventory = _interopRequireWildcard(_inventory);

var _itemref = require('./itemref/itemref');

var _model = require('./model');

var _utils = require('./utils');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

/*
  dropFactory returns an object that implements the Drop interface
  constructor(): takes the monster itemRef data for that drop and saves it
  properly make(): returns the created object, called iff it needs to be made
  message(): returns the message that should be displayed
 */

function dropFactory(type, refData) {
  // type is card, item, or skill
  if (type === 'card') {
    return new CardDrop(refData);
  }
  if (type === 'item') {
    return new ItemDrop(refData);
  }
  if (type === 'skill') {
    return new SkillDrop(refData);
  }
  if (type === 'material') {
    return new MatDrop(refData);
  }
  throw 'shoot, drop factory called with invalid type argument: ' + type;
}

function MatDrop(refData) {
  this.name = refData[0];
  this.nameStr = _itemref.ref.materials[this.name]['printed'];
  this.quantity = refData[1];
}

MatDrop.prototype.message = function () {
  return '+' + (0, _utils.prettifyNum)(this.quantity) + ' ' + this.nameStr;
};

function CardDrop(refData) {
  // ['card name', cardlvl]
  this.name = refData[0];
  this.level = refData[1];
}

CardDrop.prototype.make = function () {
  var card = new inventory.CardModel(this.name);
  card.isNew = true;
  return card;
};

CardDrop.prototype.message = function () {
  return 'New Card: ' + (0, _utils.firstCap)(this.name);
};

function ItemDrop(refData) {
  this.itemType = refData[0];
  this.name = refData[1];
}

ItemDrop.prototype.make = function () {
  var item;
  if (this.itemType === 'weapon') {
    item = new inventory.WeaponModel(this.name);
  }
  if (this.itemType === 'armor') {
    item = new inventory.ArmorModel(this.name);
  }
  item.isNew = true;
  return item;
};

ItemDrop.prototype.message = function () {
  return 'New Item: ' + (0, _utils.firstCap)(this.name);
};

function SkillDrop(refData) {
  // 'skillname'
  this.name = refData;
}

SkillDrop.prototype.make = function () {
  var skill = new inventory.SkillModel(this.name);
  skill.isNew = true;
  return skill;
};

SkillDrop.prototype.message = function () {
  return 'New Skill: ' + (0, _utils.firstCap)(this.name);
};


},{"./inventory":10,"./itemref/itemref":12,"./model":21,"./utils":25,"underscore":33}],6:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MonsterSpec = exports.attackSpecDmgKeys = exports.attackSpecKeys = exports.actualDmgKeys = exports.dmgKeys = exports.thornKeys = exports.eleResistKeys = exports.defKeys = undefined;
exports.newHeroSpec = newHeroSpec;

var _underscore = require('underscore');

var _ = _interopRequireWildcard(_underscore);

var _drops = require('./drops');

var dropLib = _interopRequireWildcard(_drops);

var _globals = require('./globals');

var _inventory = require('./inventory');

var inventory = _interopRequireWildcard(_inventory);

var _itemref = require('./itemref/itemref');

var itemref = _interopRequireWildcard(_itemref);

var _log = require('./log');

var _log2 = _interopRequireDefault(_log);

var _model = require('./model');

var _prob = require('./prob');

var prob = _interopRequireWildcard(_prob);

var _utils = require('./utils');

var utils = _interopRequireWildcard(_utils);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var TEAM_HERO = 0;
var TEAM_MONSTER = 1;

var defKeys = exports.defKeys = ['strength', 'wisdom', 'dexterity', 'vitality', 'maxHp', 'maxMana', 'armor', 'dodge', 'hpRegen', 'manaRegen', 'moveSpeed'];
var eleResistKeys = exports.eleResistKeys = ['eleResistAll', 'fireResist', 'coldResist', 'lightResist', 'poisResist'];
var thornKeys = exports.thornKeys = ['physThorns', 'fireThorns', 'coldThorns', 'lightThorns', 'poisThorns'];
var visKeys = ['height', 'width', 'lineWidth', 'opacity'];
var dmgKeys = exports.dmgKeys = ['projCount', 'meleeDmg', 'rangeDmg', 'spellDmg', 'speed', 'cooldownTime', 'physDmg', 'lightDmg', 'coldDmg', 'fireDmg', 'poisDmg', 'hpOnHit', 'hpLeech', 'manaOnHit', 'manaLeech', 'speed', 'accuracy', 'range', 'projRange', 'projRadius', 'aoeRadius', 'manaCost', 'angle', 'projSpeed', 'aoeSpeed'];

var allKeys = defKeys.concat(eleResistKeys).concat(thornKeys).concat(visKeys).concat(dmgKeys);

var actualDmgKeys = exports.actualDmgKeys = ['physDmg', 'lightDmg', 'coldDmg', 'fireDmg', 'poisDmg'];

var attackSpecKeys = exports.attackSpecKeys = [//'meleeDmg', 'rangeDmg', 'spellDmg', 
'projCount', 'speed', 'physDmg', 'lightDmg', 'coldDmg', 'fireDmg', 'poisDmg', 'hpOnHit', 'hpLeech', 'manaOnHit', 'manaLeech',
// 'cooldownTime', 'manaCost',
'range', 'projRange', 'projRadius', 'aoeRadius', 'accuracy', 'angle', 'projSpeed', 'aoeSpeed'];
var attackSpecDmgKeys = exports.attackSpecDmgKeys = ['physDmg', 'lightDmg', 'coldDmg', 'fireDmg', 'poisDmg', 'hpLeech', 'manaLeech'];

var EntitySpec = _model.Model.extend({
  initialize: function initialize() {
    this.level = 1;
    this.xp = 0;
  },

  computeAttrs: function computeAttrs() {
    if (this.team === TEAM_HERO) {
      this.weaponType = this.equipped.weapon === undefined ? 'melee' : this.equipped.weapon.weaponType;
    }

    var all = utils.newBaseStatsDict(allKeys);
    utils.addAllMods(all, this.getMods());

    if (this.team === TEAM_MONSTER) {
      all.armor.more *= 1 + this.level * 0.02;
      all.eleResistAll.more *= 1 + 0.02 * this.level;
      all.maxHp.more *= Math.pow(1.01, this.level);
      if (this.level > 400) {
        all.armor.more *= 1 + (this.level - 400) * 0.02;
        all.eleResistAll.more *= 1 + 0.02 * (this.level - 400);
        all.maxHp.more *= Math.pow(1.005, this.level - 400);
      }
    } else if (this.team === TEAM_HERO) {
      _.each(this.prestige, function (val, stat) {
        all[stat].more *= 1 + parseInt(val) * 0.01;
      }, this);
      // console.log('applying prestige');
    }

    utils.computeStats(this, all, defKeys);

    // Now that def stats have been computed
    // all.eleResistAll.more *= Math.pow(0.998, this.wisdom);
    all.meleeDmg.more *= 1 + this.strength * 0.001;
    all.rangeDmg.more *= 1 + this.dexterity * 0.001;
    all.spellDmg.more *= 1 + this.wisdom * 0.001;

    utils.computeStats(this, all, eleResistKeys);
    utils.computeStats(this, all, thornKeys);
    utils.computeStats(this, all, visKeys);

    this.baseDmg = all;
    this.computeSkillAttrs();

    _globals.gl.DirtyQueue.mark('computeAttrs');
  },

  computeSkillAttrs: function computeSkillAttrs() {
    _log2.default.info('entity computeSkillAttrs, weaponType: %s', this.weaponType);
    this.skillchain.computeAttrs(this.baseDmg, this.weaponType);
  },

  getMods: function getMods() {
    var mods = ['strength added 9', 'strength added 1 perLevel', 'dexterity added 9', 'dexterity added 1 perLevel', 'wisdom added 9', 'wisdom added 1 perLevel', 'vitality added 9', 'vitality added 1 perLevel', 'vitality gainedas 100 maxHp', 'vitality gainedas 25 maxMana', 'vitality gainedas 100 eleResistAll', 'wisdom gainedas 100 maxMana', 'wisdom gainedas 200 eleResistAll', 'strength gainedas 200 armor', 'dexterity gainedas 300 dodge', 'dexterity gainedas 200 accuracy', 'moveSpeed added 3', 'height added 1000', 'width added 300', 'lineWidth added 30',

    // TODO - add str/dex/wis attacktype bonuses here once impemented
    //'strength gainedas 1 meleeDmg',
    //'dexterity gainedas 1 rangeDmg',
    //'wisdom gainedas 1 spellDmg',

    'meleeDmg added 1', 'rangeDmg added 1', 'spellDmg added 1', 'eleResistAll gainedas 100 lightResist', 'eleResistAll gainedas 100 coldResist', 'eleResistAll gainedas 100 fireResist', 'eleResistAll gainedas 100 poisResist', 'maxHp added 20 perLevel', 'maxMana added 5 perLevel', 'maxHp more 2 perLevel', 'maxMana gainedas 2 manaRegen', 'projCount added 1', 'angle added 15', 'range gainedas 125 projRange',
    //'rate added 10',
    'projSpeed added 10', 'aoeSpeed added 3', 'projRadius added 50', 'aoeRadius added 3000', 'opacity added 1'];
    return _.map(mods, function (mod) {
      return utils.applyPerLevel(mod, this.level);
    }, this);
  },

  getNextLevelXp: function getNextLevelXp() {
    return Math.floor(100 * Math.pow(1.3, this.level - 1));
  },

  getLastLevelXp: function getLastLevelXp() {
    return Math.floor(100 * Math.pow(1.3, this.level - 2));
  }
});

var HeroSpec = EntitySpec.extend({
  initialize: function initialize(name, skillchain, inv, equipped, cardInv, matInv) {
    this.name = name;
    this.skillchain = skillchain;
    this.inv = inv;
    this.cardInv = cardInv;
    this.matInv = matInv;
    this.equipped = equipped;
    this.versionCreated = _globals.gl.VERSION_NUMBER;
    this.lastDeath = 'Hardcore';
    this.moveAngle = 0;
    this.prestigeTotal = localStorage.getItem('prestigeTotal');
    localStorage.setItem('prestigeTotal', 'valid');

    EntitySpec.prototype.initialize.call(this);
    this.team = TEAM_HERO;

    _log2.default.info('HeroSpec initialize');
    this.computeAttrs();

    this.listenTo(this.skillchain, 'change', this.computeSkillAttrs);
    this.listenTo(this.equipped, 'change', this.computeAttrs);
  },

  toJSON: function toJSON() {
    return {
      name: this.name,
      level: this.level,
      xp: this.xp,
      versionCreated: this.versionCreated,
      lastDeath: this.lastDeath,
      moveAngle: this.moveAngle,
      prestigeTotal: this.prestigeTotal,
      prestige: this.prestige
    };
  },

  fromJSON: function fromJSON(data) {
    _.extend(this, data);
  },

  getMods: function getMods() {
    var mods = EntitySpec.prototype.getMods.call(this);
    return mods.concat(this.equipped.getMods());
  },

  applyXp: function applyXp(xp) {
    if (localStorage.getItem('prestigeTotal') !== 'valid') {
      _log2.default.error('invalid prestige ' + localStorage.getItem('prestigeTotal'));
    }
    // TODO needs to do this to the skillchain as well
    _globals.gl.DirtyQueue.mark('hero:xp');
    var levels = 0;
    levels += this.equipped.applyXp(xp);
    levels += this.skillchain.applyXp(xp);
    this.xp += xp;
    while (this.xp >= this.getNextLevelXp()) {
      this.xp -= this.getNextLevelXp();
      this.level += 1;
      _globals.gl.DirtyQueue.mark('hero:levelup');
      _log2.default.levelUp(this.level);
      levels++;
    }
    if (levels > 0) {
      this.computeAttrs();
    }
    return levels;
  }
});

var MonsterSpec = exports.MonsterSpec = EntitySpec.extend({
  // TODO: fn signature needs to be (name, level)
  initialize: function initialize(name, level) {
    // All you need is a name
    EntitySpec.prototype.initialize.call(this);
    this.team = TEAM_MONSTER;
    this.name = name;
    this.level = level;

    _.extend(this, itemref.expand('monster', this.name));

    this.weaponType = 'melee';

    this.mods = _.map(this.items, function (item) {
      var expanded = itemref.expand(item[0], item[1]);
      if (item[0] === 'weapon') {
        this.weaponType = expanded.weaponType;
      }
      return expanded.mods;
    }, this);
    this.mods = _.flatten(this.mods);
    try {
      this.mods = this.mods.concat(utils.expandSourceCards(this.sourceCards, Math.floor(this.level / 10)));
    } catch (e) {
      _log2.default.error('cannot find reference for some card held by %s', this.name);
    }

    this.droppableCards = _.filter(this.sourceCards, function (card) {
      return card[0].slice(0, 5) !== 'proto';
    }, this);

    this.skillchain = new inventory.Skillchain();
    _.each(this.skills, function (skill, i) {
      var skill = new inventory.MonsterSkillModel(skill);
      skill.level = this.level;
      this.skillchain.equip(skill, i, true);
    }, this);

    this.computeAttrs();
  },

  getMods: function getMods() {
    return this.mods.concat(EntitySpec.prototype.getMods.call(this));
  },

  getDrops: function getDrops() {
    var cardDrops = [];
    var gearDrops = [];
    var matDrops = [];
    var any = false;
    if (Math.random() < 1) {
      // 0.03 * 10) {
      if (this.droppableCards.length) {
        var card = this.droppableCards[prob.pyRand(0, this.droppableCards.length)];
        // Changed so monsters over level 100 drop level reduced cards to slow
        // card qp gain
        var clvl = this.level > 100 ? Math.floor(Math.sqrt(this.level)) : Math.floor(this.level / 10);

        card = [card[0], card[1] + clvl];
        cardDrops.push(dropLib.dropFactory('card', card));
        any = true;
      }
    }
    if (Math.random() < 1) {
      // 0.001 * 50) {
      if (this.materials && this.materials.length >= 1) {
        var matDrop = this.getMatDrop();
        matDrops.push(dropLib.dropFactory('material', [matDrop.name, matDrop.amt]));
        any = true;
      }
    }
    if (Math.random() < 0.1) {
      // 0.001 * 50) {
      if (this.items.length) {
        gearDrops.push(dropLib.dropFactory('item', this.items[prob.pyRand(0, this.items.length)]));
        any = true;
      }
    }
    if (Math.random() < 0.5) {
      // 0.001 * 50) {
      if (this.skills.length) {
        gearDrops.push(dropLib.dropFactory('skill', this.skills[prob.pyRand(0, this.skills.length)]));
        any = true;
      }
    }
    return {
      cardDrops: cardDrops,
      gearDrops: gearDrops,
      matDrops: matDrops,
      any: any
    };
  },

  getMatDrop: function getMatDrop() {
    this.rarity = this.rarity === undefined ? 'normal' : this.rarity;
    var rates = itemref.ref.matDropRates[this.rarity];
    var roll = Math.random();
    var sum = 0;
    var category, catMats, amt;
    for (var i = 0; i < rates.length; i++) {
      sum += rates[i];
      if (roll <= sum) {
        category = Math.abs(i - 4);
        break;
      }
    }
    if (category === 4) {
      catMats = ['energy', 'skull', 'heart', 'finger', 'toe', 'handle'];
    } else {
      catMats = _.filter(this.materials, function (matName) {
        return itemref.ref.materials[matName].category === category;
      }, this);
    }

    var chosenMat = catMats[prob.pyRand(0, catMats.length)];

    if (chosenMat === undefined) {
      _log2.default.error('getMatDrop error choosing drops, ended with undefined drop');
    }

    var base = itemref.ref.matCategoryBase[category];
    // monster base slightly less than card levelup cost, to diverge at higher
    // levels.

    base = (base * 2 + 1) / 3;

    amt = Math.ceil(Math.pow(base, Math.max(1, (this.level - 2) / 20)));

    // console.log(chosenMat, amt);
    return { 'name': chosenMat, 'amt': amt };
  },

  // TODO: memoize this
  xpOnKill: function xpOnKill(playerLevel) {
    var mlevel = playerLevel >= this.level ? this.level : playerLevel + (this.level - playerLevel) / 20;
    return Math.ceil(20 * Math.pow(1.18, mlevel - 1));
  },

  xpPenalty: function xpPenalty(pl, ml) {
    if (pl > ml) {
      return 1;
    }
    var sb = 3 + Math.floor(pl / 16);
    var diff = ml - pl;
    if (diff <= sb) {
      return 1;
    }
    var ed = diff - sb;
    return Math.pow((pl + 5) / (pl + 5 + Math.pow(ed, 2.5)), 1.5);
  }
});

function newHeroSpec(inv, cardInv, matInv) {
  var heroName = 'some newbie';
  var equipped = new inventory.EquippedGearModel();
  var skillchain = new inventory.Skillchain();

  var hero = new HeroSpec(heroName, skillchain, inv, equipped, cardInv, matInv);

  return hero;
}

/* exports.extend({
 *   newHeroSpec : newHeroSpec,
 *   MonsterSpec : MonsterSpec,
 *   defKeys : defKeys,
 *   eleResistKeys : eleResistKeys,
 *   dmgKeys : dmgKeys,
 *   thornKeys : thornKeys,
 *   actualDmgKeys : actualDmgKeys,
 *   attackSpecKeys : attackSpecKeys,
 *   attackSpecDmgKeys : attackSpecDmgKeys
 * });*/


},{"./drops":5,"./globals":9,"./inventory":10,"./itemref/itemref":12,"./log":19,"./model":21,"./prob":22,"./utils":25,"underscore":33}],7:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DirtyQueueClass = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _backbone = require('backbone');

var Backbone = _interopRequireWildcard(_backbone);

var _underscore = require('underscore');

var _ = _interopRequireWildcard(_underscore);

var _globals = require('./globals');

var _log = require('./log');

var _log2 = _interopRequireDefault(_log);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var DirtyQueueClass = exports.DirtyQueueClass = function () {
  function DirtyQueueClass() {
    _classCallCheck(this, DirtyQueueClass);

    this.obj = {};
    this.eventMap = {};
  }

  _createClass(DirtyQueueClass, [{
    key: 'mark',
    value: function mark(name) {
      if (this.obj[name]) {
        return;
      }
      this.obj[name] = true;
      var split = name.split(':');
      if (split.length > 1) {
        for (var i = 1; i < split.length; i++) {
          this.obj[split.slice(0, split.length - i).join(':')] = true;
        }
      }
    }

    // Make all event strings map to a single event string. Useful for making
    // multiple different
    //   event strings call a function once instead of once per event string

  }, {
    key: 'mapMark',
    value: function mapMark(from, to) {
      if (typeof from === 'string') {
        from = [from];
      }
      var map = this.eventMap;
      _.each(from, function (f) {
        if (map[f] === undefined) {
          map[f] = [];
        }
        map[f].push(to);
      });
    }
  }, {
    key: 'triggerAll',
    value: function triggerAll(eventObject) {
      _log2.default.debug('Triggering All Events');

      _.each(this.eventMap, function (events, key) {
        if (this.obj[key]) {
          for (var i = 0; i < events.length; i++) {
            this.obj[events[i]] = true;
          }
        }
      }, this);

      _.each(this.obj, function (value, key, list) {
        if (value) {
          eventObject.trigger(key);
          this.obj[key] = false;
        }
      }, this);
    }
  }]);

  return DirtyQueueClass;
}();


},{"./globals":9,"./log":19,"backbone":30,"underscore":33}],8:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FooterView = undefined;

var _backbone = require('backbone');

var Backbone = _interopRequireWildcard(_backbone);

var _jquery = require('jquery');

var _jquery2 = _interopRequireDefault(_jquery);

var _underscore = require('underscore');

var _ = _interopRequireWildcard(_underscore);

var _globals = require('./globals');

var _log = require('./log');

var _log2 = _interopRequireDefault(_log);

var _utils = require('./utils');

var utils = _interopRequireWildcard(_utils);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var FOOTER_HEIGHT = 114;
var HFBW = 161; // hero footer bar width

var StatBar = Backbone.View.extend({
  tagName: 'div',
  className: 'barHolder',
  template: _.template((0, _jquery2.default)('#stat-bar-template').html(), utils),

  height: 20,
  width: HFBW,
  fontSize: 14,
  fontColor: 'rgba(170, 170, 160, 1)',
  bgColor: '#f00',

  initialize: function initialize(options) {
    this.$el.html(this.template);
    this.$bar = this.$('.bar');
    this.$text = this.$('.text');

    this.$el.css({ width: this.width, height: this.height });
    this.$bar.css({ 'background-color': this.bgColor, 'width': 0 });
    this.$text.css({
      color: this.fontColor,
      'font-size': this.fontSize,
      'line-height': this.height + 'px'
    });

    this.lastWidth = 0;
  },

  _render: function _render(cur, max) {
    if (cur < 0) {
      cur = 0;
    }
    this.$text.html(this.getText(cur, max));
    this.setWidth(cur, max);
    return this;
  },

  setWidth: function setWidth(cur, max) {
    var nw = Math.floor(this.width * cur / max);
    if (nw !== this.lastWidth) {
      this.lastWidth = nw;
      this.$bar.css('width', nw);
    }
  },

  getText: function getText(cur, max) {
    return utils.prettifyNum(cur) + '/' + utils.prettifyNum(max);
  }
});

var HpBar = StatBar.extend({
  bgColor: '#B22222',
  render: function render() {
    return this._render(this.model.hp, this.model.spec.maxHp);
  }
});

var ManaBar = StatBar.extend({
  bgColor: '#0000AB',
  render: function render() {
    return this._render(this.model.mana, this.model.spec.maxMana);
  }
});

var XpBar = StatBar.extend({
  bgColor: '#B8860B',
  width: 453,
  render: function render() {
    return this._render(this.model.spec.xp, this.model.spec.getNextLevelXp());
  }
});

var ZoneBar = StatBar.extend({
  fontSize: 14,
  bgColor: '#B8660B',
  render: function render() {
    return this._render(this.model.heroPos, this.model.rooms.length);
  },
  getText: function getText() {
    return this.model.nameStr + ' (' + this.model.level + ')';
  }
});

var NameLevelView = Backbone.View.extend({
  tagName: 'div',
  className: 'name-level',
  render: function render() {
    this.$el.html('<div class="name"><div>' + this.model.name + '</div></div><div class="level">' + this.model.level + '</div>');
    this.$('.name').css('width', HFBW - 5 - this.$('.level').width());
    return this;
  }
});

var VitalsView = Backbone.View.extend({
  tagName: 'div',
  className: 'vitals',

  initialize: function initialize(options, hero, zone) {
    this.hero = hero;
    this.zone = zone;
    this.nameLevel = new NameLevelView({ model: this.hero.spec });
    this.hpBar = new HpBar({ model: this.hero });
    this.manaBar = new ManaBar({ model: this.hero });
    this.zoneBar = new ZoneBar({ model: this.zone });

    this.listenTo(_globals.gl.DirtyListener, 'rename', this.nameLevel.render.bind(this.nameLevel));
    this.listenTo(_globals.gl.DirtyListener, 'hero:hp', this.hpBar.render.bind(this.hpBar));
    this.listenTo(_globals.gl.DirtyListener, 'hero:mana', this.manaBar.render.bind(this.manaBar));
    this.listenTo(_globals.gl.DirtyListener, 'zone:new', this.zoneBar.render.bind(this.zoneBar));
    this.listenTo(_globals.gl.DirtyListener, 'zone:nextRoom', this.zoneBar.render.bind(this.zoneBar));

    _globals.gl.DirtyQueue.mapMark(['hero:levelup', 'revive', 'computeAttrs'], 'heroFooterRender');
    this.listenTo(_globals.gl.DirtyListener, 'heroFooterRender', this.render);

    this.renderedOnce = false;
  },

  render: function render() {
    if (!this.renderedOnce) {
      this.renderedOnce = true;
      this.$el.append(this.nameLevel.render().el);
      this.$el.append(this.hpBar.render().el);
      this.$el.append(this.manaBar.render().el);
      this.$el.append(this.zoneBar.render().el);
    } else {
      this.nameLevel.render();
      this.hpBar.render();
      this.manaBar.render();
      this.zoneBar.render();
    }
    return this;
  }
});

var SkillView = Backbone.View.extend({
  tagName: 'div',
  className: 'skill',
  template: _.template((0, _jquery2.default)('#skill-footer-template').html(), utils),

  events: { 'mouseenter': 'onMouseenter', 'mouseleave': 'onMouseleave' },

  onMouseenter: function onMouseenter() {
    _globals.gl.UIEvents.trigger('itemSlotMouseenter', { model: this.model.spec });
  },

  onMouseleave: function onMouseleave() {
    _globals.gl.UIEvents.trigger('itemSlotMouseleave');
  },

  initialize: function initialize(options, hero) {
    this.hero = hero;
    this.listenTo(_globals.gl.DirtyListener, 'tick', this.adjust);
  },

  adjust: function adjust() {
    var SIZE = 73;
    var cdHeight = 0;
    var useWidth = 0;

    if (this.model.coolAt > _globals.gl.time) {
      var durPct = (this.hero.nextAction - _globals.gl.time) / this.hero.lastDuration;

      // cooling down but doesn't have cooldown, must be last used
      if (this.model.spec.cooldownTime === 0) {
        useWidth = durPct; // grep in use wipe while being in use
        cdHeight = 0; // red no cooldown wipe
      } else {
        cdHeight = (this.model.coolAt - _globals.gl.time) / this.model.spec.cooldownTime;
        if (cdHeight > 1) {
          // if in use and has cooldown, cap cooldown wipe
          // height, grey in use wipe
          useWidth = durPct;
          cdHeight = 1;
        } else {
          useWidth = 0; // if just cooling down, no in use wipe
        }
      }
      useWidth *= SIZE;
      cdHeight *= SIZE;
    }

    if (this.model.oom) {
      this.$el.addClass('oom');
    } else {
      this.$el.removeClass('oom');
    }
    if (this.model.oor) {
      this.$el.addClass('oor');
    } else {
      this.$el.removeClass('oor');
    }

    this.$cd.css('height', cdHeight);
    this.$use.css('width', useWidth);
  },

  render: function render() {
    this.$el.html(this.template(Object.assign({}, this, utils)));
    this.$cd = this.$('.cooldown');
    this.$use = this.$('.use-bar');
    this.adjust();
    return this;
  }
});

var SkillchainView = Backbone.View.extend({
  tagName: 'div',
  className: 'skillchain',

  initialize: function initialize(options, hero) {
    this.hero = hero;
    this.views = [];
    this.listenTo(_globals.gl.DirtyListener, 'bodySkillchainUpdated', this.render);
  },

  render: function render() {
    this.$el.empty();

    _.invoke(this.views, 'remove');

    this.views = _.map(this.hero.skills, function (model) {
      return new SkillView({ model: model }, this.hero);
    }, this);
    var frag = document.createDocumentFragment();
    _.each(this.views, function (view) {
      frag.appendChild(view.render().el);
    });
    this.$el.append(frag);

    return this;
  }
});

var PotionView = Backbone.View.extend({
  tagName: 'div',
  className: 'potion-holder',
  template: _.template((0, _jquery2.default)('#potion-template').html(), utils),

  events: { 'mousedown': 'use' },

  initialize: function initialize(options, hero) {
    this.hero = hero;
    this.listenTo(_globals.gl.DirtyListener, 'tick', this.adjust);
  },

  use: function use() {
    this.hero.tryUsePotion();
  },

  adjust: function adjust() {
    var SIZE = 73;
    var pct = (this.hero.potionCoolAt - _globals.gl.time) / 10000;
    this.$cd.css('height', pct * SIZE);
  },

  render: function render() {
    this.$el.html(this.template);
    this.$cd = this.$('.cooldown');
    return this;
  }
});

var CenterView = Backbone.View.extend({
  tagName: 'div',
  className: 'footer-center',

  initialize: function initialize(options, game) {
    this.renderedOnce = false;

    this.skillchainView = new SkillchainView({}, game.zone.hero);
    this.potionView = new PotionView({}, game.zone.hero);
    this.xpBar = new XpBar({ model: game.zone.hero });

    this.listenTo(_globals.gl.DirtyListener, 'hero:xp', this.xpBar.render.bind(this.xpBar));

    this.listenTo(_globals.gl.DirtyListener, 'throttledResize', this.resize);
    this.resize();
  },

  render: function render() {
    if (!this.renderedOnce) {
      this.$el.append(this.xpBar.render().el);
      this.$el.append(this.skillchainView.render().el);
      this.$el.append(this.potionView.render().el);
      this.renderedOnce = true;
    } else {
      this.xpBar.render();
      this.skillchainView.render();
      this.potionView.render();
    }
    return this;
  },

  resize: function resize() {
    this.$el.css('left', Math.floor(window.innerWidth / 2 - 456 / 2));
  }
});

var DropAreaView = Backbone.View.extend({
  tagName: 'div',
  className: 'drop-area',
  template: _.template((0, _jquery2.default)('#item-drop-area-template').html(), utils),

  initialize: function initialize(options, game, itdh, ctdh, craftTab) {
    this.equipped = game.hero.equipped;
    this.skillchain = game.hero.skillchain;
    this.craftTab = craftTab;

    this.listenTo(itdh, 'dragstart', this.onItemDragStart);
    this.listenTo(ctdh, 'dragstart', this.onCardDragStart);
    this.listenTo(itdh, 'drop', this.onItemDrop);
    this.listenTo(ctdh, 'drop', this.onCardDrop);
  },

  onItemDragStart: function onItemDragStart() {
    this.$el.css('display', 'block');
    this.$('.craft-drop').css('display', 'none');
  },

  onCardDragStart: function onCardDragStart() {
    this.$el.css('display', 'block');
    this.$('.craft-drop').css('display', 'block');
  },

  onItemDrop: function onItemDrop(pos, model) {
    // log.warning('on item drop');
    this.checkRecycleDrop(pos, model);
    this.$el.css('display', 'none');
  },

  onCardDrop: function onCardDrop(pos, model) {
    var off = this.$('.craft-drop').offset();
    if (pos.x > off.left && pos.y > off.top && pos.x < off.left + 73 && pos.y < off.top + 73) {
      _globals.gl.UIEvents.trigger('footer:buttons:craft');
      this.craftTab.forceFocus(model);
    } else {
      this.checkRecycleDrop(pos, model);
    }
    this.$el.css('display', 'none');
  },

  checkRecycleDrop: function checkRecycleDrop(pos, model) {
    var off = this.$('.recycle-drop').offset();
    if (pos.x > off.left && pos.y > off.top && pos.x < off.left + 73 && pos.y < off.top + 73) {
      model.inRecycle = true;
      _globals.gl.DirtyQueue.mark('recycleChange');
      this.craftTab.forceDeselect(model);
    }
  },

  render: function render() {
    this.$el.html(this.template);
    return this;
  }
});

var SpeedView = Backbone.View.extend({
  tagName: 'div',
  className: 'speed-control',
  template: _.template((0, _jquery2.default)('#speed-control-template').html(), utils),

  events: {
    'mousedown .up': 'onUp',
    'mousedown .down': 'onDown',
    'mousedown .play-pause': 'onPP'
  },

  initialize: function initialize(options, game, itdh, ctdh) {
    this.game = game;
    this.listenTo(_globals.gl.DirtyListener, 'tick', this.render);
    this.renderedOnce = false;

    this.listenTo(itdh, 'dragstart', this.onDragStart);
    this.listenTo(ctdh, 'dragstart', this.onDragStart);
    this.listenTo(itdh, 'drop', this.onDragDrop);
    this.listenTo(ctdh, 'drop', this.onDragDrop);
  },

  onDragStart: function onDragStart() {
    this.$el.css('display', 'none');
  },
  onDragDrop: function onDragDrop() {
    this.$el.css('display', 'block');
  },

  onUp: function onUp() {
    this.game.adjustSpeed('up');
  },
  onDown: function onDown() {
    this.game.adjustSpeed('down');
  },
  onPP: function onPP() {
    this.game.adjustSpeed('play-pause');
  },

  render: function render() {
    if (!this.renderedOnce) {
      this.$el.html(this.template);
      this.$timer = this.$('.timer');
      this.$pp = this.$('.play-pause');
      this.$speed = this.$('.speed');
      this.renderedOnce = true;
    }
    var sec = Math.floor((this.game.curTime - this.game.gameTime) / 1000);
    var s = sec % 60;
    sec -= s;
    var ms = sec % 3600;
    var hs = sec - ms;
    this.$timer.html(sprintf('%02d:%02d:%02d', hs / 3600, ms / 60, s));
    this.$speed.html(this.game.gameSpeed + 'x');

    if (this.game.gameSpeed === 0) {
      this.$pp.addClass('paused');
    } else {
      this.$pp.removeClass('paused');
    }

    if (this.game.gameSpeed <= 2 || this.game.settings.disableShake) {
      this.$el.removeClass('shake shake-little shake-constant');
    } else if (this.game.gameSpeed === 10) {
      if (!this.$el.hasClass('shake')) {
        this.$el.addClass('shake shake-constant');
      }
      if (!this.$el.hasClass('shake-little')) {
        this.$el.addClass('shake-little');
      }
    } else if (this.game.gameSpeed >= 50) {
      if (!this.$el.hasClass('shake')) {
        this.$el.addClass('shake shake-constant');
      }
      if (this.$el.hasClass('shake-little')) {
        this.$el.removeClass('shake-little');
      }
    }
    return this;
  }
});

var FooterView = exports.FooterView = Backbone.View.extend({
  tagName: 'div',
  className: 'footer',

  events: { 'mouseenter': 'onMouseenter' },

  onMouseenter: function onMouseenter() {
    _globals.gl.UIEvents.trigger('itemSlotMouseleave');
  },

  initialize: function initialize(options, game, itemTabDH, cardTabDH, craftTab) {
    this.resize();
    this.listenTo(_globals.gl.DirtyListener, 'throttledResize', this.resize);

    this.heroBodyView = new VitalsView({}, game.zone.hero, game.zone);
    this.centerView = new CenterView({}, game);
    this.speedView = new SpeedView({}, game, itemTabDH, cardTabDH);
    this.dropAreaView = new DropAreaView({}, game, itemTabDH, cardTabDH, craftTab);
  },

  resize: function resize() {
    this.$el.css({ width: window.innerWidth, top: window.innerHeight - FOOTER_HEIGHT });
  },

  render: function render() {
    var frag = document.createDocumentFragment();
    frag.appendChild(this.heroBodyView.render().el);
    frag.appendChild(this.centerView.render().el);
    frag.appendChild(this.speedView.render().el);
    frag.appendChild(this.dropAreaView.render().el);
    this.$el.html(frag);
    return this;
  }
});


},{"./globals":9,"./log":19,"./utils":25,"backbone":30,"jquery":32,"underscore":33}],9:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.gl = undefined;

var _backbone = require('backbone');

var Backbone = _interopRequireWildcard(_backbone);

var _underscore = require('underscore');

var _ = _interopRequireWildcard(_underscore);

var _events = require('./events');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var gl = exports.gl = {};

gl.DirtyQueue = new _events.DirtyQueueClass();

gl.DirtyListener = _.extend({}, Backbone.Events);

gl.GameEvents = _.extend({}, Backbone.Events);
gl.ItemEvents = _.extend({}, Backbone.Events);
gl.EquipEvents = _.extend({}, Backbone.Events);
gl.UIEvents = _.extend({}, Backbone.Events);
gl.MessageEvents = _.extend({}, Backbone.Events);


},{"./events":7,"backbone":30,"underscore":33}],10:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NewStateManager = exports.RecycleManager = exports.CardCollection = exports.CardModel = exports.MaterialManager = exports.ItemCollection = exports.EquippedGearModel = exports.Skillchain = exports.MonsterSkillModel = exports.SkillModel = exports.WeaponModel = exports.ArmorModel = exports.GearModel = undefined;

var _jquery = require('jquery');

var _jquery2 = _interopRequireDefault(_jquery);

var _underscore = require('underscore');

var _ = _interopRequireWildcard(_underscore);

var _attacks = require('./attacks');

var attacks = _interopRequireWildcard(_attacks);

var _drops = require('./drops');

var _entity = require('./entity');

var entity = _interopRequireWildcard(_entity);

var _globals = require('./globals');

var _itemref = require('./itemref/itemref');

var itemref = _interopRequireWildcard(_itemref);

var _log = require('./log');

var _log2 = _interopRequireDefault(_log);

var _model = require('./model');

var _prob = require('./prob');

var prob = _interopRequireWildcard(_prob);

var _utils = require('./utils');

var utils = _interopRequireWildcard(_utils);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var GearModel = exports.GearModel = _model.Model.extend({
  initialize: function initialize() {
    this.xp = 0;
    this.level = 1;
    this.baseMods = [];
    this.cards = [undefined, undefined, undefined, undefined, undefined];
    this.equipped = false;
    this.isNew = false;
    this.hasNewCards = false;
    this.inRecycle = false;
    this.isRecycled = false;
  },

  toJSON: function toJSON() {
    return {
      xp: this.xp,
      level: this.level,
      cardNames: _.pluck(_.compact(this.cards), 'name'),
      isNew: this.isNew,
      itemType: this.itemType,
      name: this.name,
      inRecycle: this.inRecycle,
      isRecycled: this.isRecycled
    };
  },

  fromJSON: function fromJSON(data, cardInv) {
    _.extend(this, data);
    this.loadCards(this.cardNames, cardInv);
  },

  loadCards: function loadCards(cardNames, cardInv) {
    _.each(cardNames, function (name, i) {
      this.equipCard(_.findWhere(cardInv.getModels(), { name: name }), i);
    }, this);
  },

  applyXp: function applyXp(xp) {
    var levels = 0;
    this.xp += xp;
    while (this.canLevel()) {
      this.xp -= this.getNextLevelXp();
      this.level++;
      levels++;
    }
    return levels;
  },

  canLevel: function canLevel() {
    return this.xp >= this.getNextLevelXp();
  },

  getNextLevelXp: function getNextLevelXp() {
    return Math.floor(100 * Math.pow(1.3, this.level - 1));
  },

  pctLeveled: function pctLeveled() {
    return this.xp / this.getNextLevelXp();
  },

  getMods: function getMods() {
    var cards = _.compact(this.cards);
    var mods = _.flatten(_.map(cards, function (card) {
      return card.getMods();
    }));
    return mods.concat(utils.applyPerLevels(this.baseMods, this.level));
  },

  equipCard: function equipCard(card, slot) {
    if (slot >= this.cards.length || card && card.itemType !== 'card') {
      return false;
    }

    if (card === undefined) {
      if (this.cards[slot]) {
        this.actuallyUnequipCard(slot);
      }
      _globals.gl.EquipEvents.trigger('change');
      return false;
    }

    if (card.equipped) {
      // card already equipped
      var curSlot = this.getCardSlot(card);
      if (slot === curSlot) {
        return false;
      }
      if (this.cards[slot]) {
        this.actuallyEquipCard(this.cards[slot], curSlot);
      } else {
        this.actuallyUnequipCard(curSlot);
      }
      this.actuallyEquipCard(card, slot);
    } else {
      if (this.cards[slot]) {
        this.actuallyUnequipCard(slot);
      }
      this.actuallyEquipCard(card, slot);
    }

    // this trigger is exclusively for communication between gear and
    // equipped gear model so egm doesn't have to listenTo and stopListening
    // on every single gear change
    _globals.gl.EquipEvents.trigger('change');
    return true;
  },

  actuallyEquipCard: function actuallyEquipCard(card, slot) {
    card.equipped = true;
    card.gearModel = this;
    this.cards[slot] = card;
  },

  actuallyUnequipCard: function actuallyUnequipCard(slot) {
    this.cards[slot].equipped = false;
    this.cards[slot].gearModel = this;
    this.cards[slot] = undefined;
  },

  swapCards: function swapCards(other) {
    if (other === undefined) {
      return;
    }
    var card;
    for (var i = 0; i < this.cards.length; i++) {
      if (other.cards[i]) {
        card = other.cards[i];
        other.actuallyUnequipCard(i);
        this.actuallyEquipCard(card, i);
      }
    }
  },

  getCardSlot: function getCardSlot(card) {
    if (!card) {
      return undefined;
    }
    for (var i = this.cards.length; i--;) {
      if (this.cards[i] && this.cards[i].name === card.name) {
        return i;
      }
    }
    return undefined;
  },

  unequipCards: function unequipCards() {
    for (var i = 0; i < this.cards.length; i++) {
      if (this.cards[i]) {
        this.cards[i].equipped = false;
        this.cards[i] = undefined;
      }
    }
  },

  recycle: function recycle() {
    _log2.default.warning('Recycling gear %s', this.name);
    this.isRecycled = true;
    return this.slot;
  }
});

function getSortKey(model) {
  var num = 0;
  if (model.itemType === 'weapon') {
    return 'a' + { melee: 'a', range: 'b', spell: 'c' }[model.weaponType] + model.name;
  } else if (model.itemType === 'armor') {
    return 'b' + { head: 'a', chest: 'c', legs: 'd', hands: 'b' }[model.slot] + model.name;
  } else if (model.itemType === 'skill') {
    return 'c' + model.name.toLowerCase();
  }
}

// itemType -> slot
// weapon  type -> weaponType
// skill class -> skillType

var ArmorModel = exports.ArmorModel = GearModel.extend({
  initialize: function initialize(name) {
    GearModel.prototype.initialize.call(this);
    _.extend(this, itemref.expand('armor', name));

    this.name = name;
    this.itemType = 'armor';
    this.baseMods = this.mods;
    this.key = getSortKey(this);
  }
});

var WeaponModel = exports.WeaponModel = GearModel.extend({
  initialize: function initialize(name) {
    GearModel.prototype.initialize.call(this);
    _.extend(this, itemref.expand('weapon', name));

    this.name = name;
    this.itemType = 'weapon';
    this.slot = 'weapon';
    this.baseMods = this.mods;
    this.key = getSortKey(this);
  }
});

var SkillModel = exports.SkillModel = GearModel.extend({
  initialize: function initialize(name) {
    GearModel.prototype.initialize.call(this);
    _.extend(this, itemref.expand('skill', name));

    this.name = name;
    this.itemType = 'skill';
    this.slot = 'skill';
    this.key = getSortKey(this);
  },

  computeAttrs: function computeAttrs(baseDmgStats, weaponType) {
    if (this.skillType !== 'spell' && this.skillType !== weaponType) {
      this.disabled = true;
      return;
    }
    this.disabled = false;

    var dmgKeys = entity.dmgKeys;
    var attackSpecDmgKeys = entity.attackSpecDmgKeys;

    var all = utils.cloneStats(baseDmgStats, dmgKeys);

    // COMMENTED OUT! - remove added baseDmg amounts from spells (they can
    // only be modified by cards on skill or by more increases)
    /*if (this.skillType === 'spell') {
        _.each(actualDmgKeys, function(dmgType) {
            all[dmgType].added = 0;
        });
    }*/

    utils.addAllMods(all, this.getMods());

    var metaType = this.skillType + 'Dmg';
    utils.computeStats(this, all, ['projCount']); // Hack fix for deadly focus convert order
    utils.computeStats(this, all, [metaType]);
    var extraDmgMod = this[metaType];

    if (this.monster) {
      // Set in MonsterSkillSpec
      extraDmgMod *= 0.5;
    }

    utils.computeStats(this, all, dmgKeys);

    _.each(attackSpecDmgKeys, function (key) {
      this[key] *= extraDmgMod;
    }, this);

    this.speed = Math.max(10, this.speed);

    this.calcAttacks();
  },

  calcAttack: function calcAttack(spec) {
    var keys = entity.attackSpecKeys;
    var dmgKeys = entity.attackSpecDmgKeys;

    // Ensure spec has necessary keys from skill
    _.each(keys, function (key) {
      spec[key] = this[key];
    }, this);

    // ensure angle and projCount, log errors
    if (spec.angle === undefined) {
      _log2.default.error('In calcAttack, Skill angle is undefined');
      spec.angle = 30;
    }
    if (spec.projCount === undefined) {
      _log2.default.error('In calcAttack, Skill projCount is undefined');
      spec.projCount = 1;
    }

    // apply qualifiers, lots of special case code
    if (spec.quals && spec.quals.length) {
      _.each(spec.quals, function (qual) {
        var split = qual.split(' ');
        if (split[0] === 'dmg') {
          if (split[1] === 'more') {
            var dmgMod = 1 + parseFloat(split[2]) / 100;
            _.each(dmgKeys, function (key) {
              spec[key] *= dmgMod;
            });
          } else {
            _log2.default.error('Trying to apply an invalid damage qualifier %s', qual);
          }
        } else if (split[0].indexOf('Dmg') > -1) {
          _log2.default.error('Trying to apply an invalid damage qualifier %s', qual);
        } else if (split[0] === 'projCount') {
          spec.projCount += parseFloat(split[2]);
        } else if (split[0] === 'angle') {
          spec.angle += parseFloat(split[2]);
        }
      }, this);
    }

    // Total damage summed here for convenience.  Used in takeDamage to
    // quickly figure out
    //   how much damage was mitigated to adjsut the hpLeech and manaLeech
    spec.totalDmg = spec.physDmg + spec.lightDmg + spec.coldDmg + spec.fireDmg + spec.poisDmg;

    // Ensure projCount and angle have sane values
    spec.projCount = Math.floor(spec.projCount);
    spec.angle = Math.floor(Math.abs(spec.angle));
    if (spec.projCount < 1) {
      spec.projCount = 1;
    }
    if (spec.projCount > 1 && spec.angle === 0) {
      spec.angle = 5;
    }

    var arrs = ['onHit', 'onKill', 'onRemove'];
    _.each(arrs, function (arr) {
      if (spec[arr] && spec[arr].length) {
        _.each(spec[arr], this.calcAttack, this);
      }
    }, this);
  },

  calcAttacks: function calcAttacks() {
    this.specs = _jquery2.default.extend({}, this.specs);
    _.each(this.specs, this.calcAttack, this);
  },

  getTotalDmg: function getTotalDmg() {
    return (this.physDmg + this.fireDmg + this.coldDmg + this.lightDmg + this.poisDmg).toFixed(2);
  },

  getDps: function getDps() {
    var totalDur = this.speed + this.cooldownTime;
    var dps = this.getTotalDmg() / totalDur * 1000;
    return dps.toFixed(2);
  }
});

var MonsterSkillModel = exports.MonsterSkillModel = SkillModel.extend({ monster: true });

var Skillchain = exports.Skillchain = _model.Model.extend({
  initialize: function initialize() {
    this.skills = [undefined, undefined, undefined, undefined, undefined];
  },

  toJSON: function toJSON() {
    return _.pluck(_.compact(this.skills), 'name');
  },

  fromJSON: function fromJSON(data, inv) {
    _.each(data, function (skillName, slot) {
      this.equip(_.findWhere(inv.getModels(), { name: skillName }), slot, false);
    }, this);
  },

  equip: function equip(skill, slot, isMonster) {
    _log2.default.info('skillchain equip');

    var change = false;

    if (skill === undefined) {
      change = this.unequip(slot);
    } else if (skill.itemType === 'skill') {
      if (skill.equipped) {
        // if skill we are trying to equip is already
        // equipped
        var curSlot = this.getSkillSlot(skill); // get the slot it's equipped in
        if (curSlot !== slot) {
          // if it was dropped in a different slot
          if (this.skills[slot]) {
            // if something is already in that slot
            this.skills[curSlot] = this.skills[slot];
            this.skills[slot] = skill;
          } else {
            // slot dropping into is currently empty
            this.skills[slot] = this.skills[curSlot];
            this.skills[curSlot] = undefined;
          }
          change = true;
        }
      } else {
        skill.swapCards(this.skills[slot]);
        this.unequip(slot);
        skill.equipped = true;
        this.skills[slot] = skill;
        change = true;
        if (!isMonster) {
          _log2.default.warning('Skillchain equipped %s into slot %d', skill.name, slot);
        }
      }
    }
    if (change) {
      this.trigger('change');
    }
    return change;
  },

  unequip: function unequip(slot) {
    var skill = this.skills[slot];
    if (skill !== undefined) {
      skill.equipped = false;
      skill.disabled = false;
      skill.unequipCards(); // TODO save equipped cards
      _log2.default.warning('Skillchain unequipping %s from slot %d', skill.name, slot);
      this.skills[slot] = undefined;
      return true;
    }
    return false;
  },

  getSkillSlot: function getSkillSlot(skill) {
    if (!skill) {
      return undefined;
    }
    for (var i = this.skills.length; i--;) {
      if (this.skills[i] && this.skills[i].name === skill.name) {
        return i;
      }
    }
    return undefined;
  },

  ranges: function ranges() {
    if (this.skills.length === 0) {
      this.furthest = undefined;
      this.shortest = undefined;
      return;
    }

    var i, l;
    var ranges = _.pluck(_.compact(this.skills), 'range');

    this.shortest = ranges.min();
    this.furthest = ranges.max();
  },

  computeAttrs: function computeAttrs(dmgStats, weaponType) {
    this.lastDmgStats = dmgStats;
    _.each(_.compact(this.skills), function (skill) {
      skill.computeAttrs(dmgStats, weaponType);
    });

    this.trigger('skillComputeAttrs');
    _globals.gl.DirtyQueue.mark('skillComputeAttrs');
  },

  applyXp: function applyXp(xp) {
    var levels = 0;
    _.each(_.compact(this.skills), function (skill) {
      levels += skill.applyXp(xp);
    });
    return levels;
  }
});

var EquippedGearModel = exports.EquippedGearModel = _model.Model.extend({

  slots: ['weapon', 'head', 'hands', 'chest', 'legs'],

  // weapon slots: weapon
  // armor slots: head, chest, hands, legs

  initialize: function initialize() {
    // this line and event object is used exclusively for equipment card
    // changes to propogate through here and up to the hero so the egm doesn't
    // have to listen and stop listening every equip
    this.listenTo(_globals.gl.EquipEvents, 'change', this.propChange);
  },

  toJSON: function toJSON() {
    var slot;
    var obj = {};
    for (var i = 0; i < this.slots.length; i++) {
      slot = this.slots[i];
      if (this[slot]) {
        obj[slot] = this[slot].name;
      }
    }
    return obj;
  },

  fromJSON: function fromJSON(data, inv) {
    _.each(data, function (itemName, slot) {
      this.equip(_.findWhere(inv.getModels(), { name: itemName }), slot);
    }, this);
  },

  propChange: function propChange() {
    this.trigger('change');
  },

  equip: function equip(item, slot) {
    _log2.default.info('equipped gear model equip');

    var change = false;

    if (item === undefined) {
      change = this.unequip(slot);
    } else if (this[slot] && this[slot].name === item.name) {
      change = false;
    } else if (item.slot === slot) {
      item.swapCards(this[slot]);
      this.unequip(slot);
      this[slot] = item;
      item.equipped = true;
      change = true;
    }

    if (change) {
      this.trigger('change');
    }
    return change;
  },

  unequip: function unequip(slot) {
    var item = this[slot];
    if (item !== undefined) {
      item.equipped = false;
      item.unequipCards(); // TODO save equipped cards
      this[slot] = undefined;
      return true;
    }
    return false;
  },

  getMods: function getMods() {
    var items = _.compact(_.map(this.slots, function (slot) {
      return this[slot];
    }, this));
    return _.flatten(_.map(items, function (item) {
      return item.getMods();
    }));
  },

  toDict: function toDict() {
    return _.object(this.slots, _.map(this.slots, function (slot) {
      return this[slot];
    }, this));
  },

  applyXp: function applyXp(xp) {
    var levels = 0;
    _.each(this.slots, function (slot) {
      if (this[slot] !== undefined) {
        levels += this[slot].applyXp(xp);
      }
    }, this);
    return levels;
  }
});

// Mixed into ItemCollection and CardCollection
// CardModel and GearModel both have inRecycle and isRecycled variables
// ItemCollection and CardCollection both have "newEventStr" attribute
var RecycleCollectionMixin = _model.Model.extend({
  getModels: function getModels() {
    return _.filter(this.models, function (model) {
      return !model.inRecycle && !model.isRecycled;
    }, this);
  },

  addDrops: function addDrops(drops) {
    var messages = [];
    _.each(drops, function (drop) {
      var existingModel = _.findWhere(this.models, { name: drop.name });
      if (existingModel) {
        if (existingModel.isRecycled) {
          _log2.default.warning('%s "%s" dropped again.', this.newEventStr, drop.name);
          existingModel.isRecycled = false;
          _globals.gl.DirtyQueue.mark(this.newEventStr);
        }
        return;
      }
      this.models.push(drop.make());
      this.hasNew = true;
      this.sort();
      _globals.gl.DirtyQueue.mark(this.newEventStr);
      messages.push(drop.message());
      _log2.default.warning('%s: %s', this.newEventStr, drop.name);
    }, this);
    return messages;
  }
});

var ItemCollection = exports.ItemCollection = RecycleCollectionMixin.extend({
  newEventStr: 'item:new',

  initialize: function initialize() {
    this.models = [];
    this.sort();
    this.hasNew = false;
  },

  noobGear: function noobGear() {
    this.models = [new WeaponModel('cardboard sword'), new WeaponModel('wooden bow'), new WeaponModel('simple wand'), new SkillModel('basic melee'), new SkillModel('basic range'), new SkillModel('basic spell'), new ArmorModel('balsa helmet'), new ArmorModel('latex gloves'), new ArmorModel('t-shirt'), new ArmorModel('jeans')];
    this.sort();
    _.each(this.models, function (m) {
      m.isNew = true;
    });
  },

  toJSON: function toJSON() {
    return _.map(this.models, function (model) {
      return model.toJSON();
    });
  },

  fromJSON: function fromJSON(data, cardInv) {
    this.models = _.map(data, function (model) {
      var item;
      if (model.itemType === 'skill') {
        item = new SkillModel(model.name);
      } else if (model.itemType === 'weapon') {
        item = new WeaponModel(model.name);
      } else if (model.itemType === 'armor') {
        item = new ArmorModel(model.name);
      }
      item.fromJSON(model, cardInv);
      return item;
    }, this);
    this.sort();
  },

  byId: function byId(id) {
    return _.findWhere(this.models, { id: id });
  },

  sort: function sort() {
    this.models.sort(function (a, b) {
      if (a.key < b.key) {
        return -1;
      }
      if (a.key > b.key) {
        return 1;
      }
      return 0;
    });
  }
});

var MaterialManager = exports.MaterialManager = _model.Model.extend({
  initialize: function initialize(cardInv) {
    var materials = itemref.ref.materials;
    _.each(materials, function (obj, mat) {
      this[mat] = 0;
    }, this);
    this.cardInv = cardInv;
  },

  toJSON: function toJSON() {
    var result = {};
    _.each(_.keys(itemref.ref.materials), function (mat) {
      result[mat] = this[mat];
    }, this);
    return result;
  },

  fromJSON: function fromJSON(data) {
    _.extend(this, data);
  },

  addDrops: function addDrops(drops) {
    var messages = [];
    var matKeys = _.keys(itemref.ref.materials);
    if (drops.length > 0) {
      _.each(drops, function (drop) {
        if (matKeys.indexOf(drop.name) === -1) {
          _log2.default.error('weird drop: %s %d', drop.name, drop.quantity);
        }
        this[drop.name] += drop.quantity;
        messages.push(drop.message());
      }, this);
      if (_globals.gl.settings.autoCraft) {
        this.tryLevelEquippedCards();
      }
      _globals.gl.DirtyQueue.mark('material:new');
    }
    return messages;
  },

  canLevelCard: function canLevelCard(card) {
    // returns whether card can level at least once
    if (card === undefined) {
      console.log('attempting to level undefined card');
    }
    var cost = card.getLevelCost();
    var canLevel = true;

    _.each(cost, function (amt, mat) {
      if (this[mat] < amt) {
        canLevel = false;
      }
    }, this);
    return canLevel;
  },

  tryLevelCard: function tryLevelCard(card, levels) {
    // tries to level up a card 'levels' number of times.
    // returns whether it successfully leveled up that many times
    if (levels === undefined) {
      levels = 1;
    }

    for (var i = 0; i < levels; i++) {
      var cost = card.getLevelCost();
      var canLevel = this.canLevelCard(card);
      if (canLevel) {
        _.each(cost, function (amt, mat) {
          this[mat] -= amt;
        }, this);
        card.levelUp();
      } else {
        return false;
      }
    }
    return true;
  },

  tryLevelEquippedCards: function tryLevelEquippedCards() {
    var anyLeveled = false;
    _.each(this.cardInv.models.reverse(), function (card) {
      if (card.equipped) {
        anyLeveled = anyLeveled || this.tryLevelCard(card, 50);
      }
    }, this);
    this.cardInv.models.reverse();
    if (anyLeveled) {
      _globals.gl.DirtyQueue.mark('card:new');
    }
  }

});

var CardModel = exports.CardModel = _model.Model.extend({
  initialize: function initialize(name) {
    _.extend(this, itemref.expand('card', name));
    this.itemType = 'card';
    this.name = name;
    this.equipped = false;
    this.qp = 0;
    this.level = 1;
    this.isNew = false;
    this.inRecycle = false;
    this.isRecycled = false;
  },

  toJSON: function toJSON() {
    return {
      name: this.name,
      qp: this.qp,
      level: this.level,
      isNew: this.isNew,
      inRecycle: this.inRecycle,
      isRecycled: this.isRecycled
    };
  },

  fromJSON: function fromJSON(data) {
    _.extend(this, data);
  },

  getMods: function getMods() {
    return utils.applyPerLevels(this.mods, this.level);
  },

  getLevelCost: function getLevelCost() {
    var cost = {};
    _.each(this.materials, function (mat) {
      var matref = itemref.ref.materials[mat];
      if (cost[mat] === undefined) {
        cost[mat] = 0;
      }
      if (matref === undefined) {
        _log2.default.error('cannot find reference to mat named %s', mat);
      }
      var category = itemref.ref.materials[mat].category;
      var base = itemref.ref.matCategoryBase[category];
      cost[mat] += Math.max(1, Math.ceil(Math.pow(base, this.level)));
      if (category === 1) {
        cost[mat] = Math.ceil(cost[mat] * Math.sqrt(this.level));
      }
    }, this);
    return cost;
  },

  levelUp: function levelUp() {
    this.level++;
    _globals.gl.DirtyQueue.mark('card:level');
    this.trigger('change');
  },

  /*applyQp: function(qp) {
      var levels = 0;
      this.qp += qp;
      while (this.canLevel()) {
          this.qp -= this.getNextLevelQp();
          this.level++;
          levels++;
      }
      if (levels && this.equipped) {
          this.trigger('change');
      }
      return levels;
  },*/

  canLevel: function canLevel() {
    return _globals.gl.canLevelCard(this);
  },

  /*getNextLevelQp: function() {
      return Math.pow(3, this.level);
  },*/

  pctLeveled: function pctLeveled() {
    return 0;
  },

  recycle: function recycle() {
    _log2.default.warning('Recycling card %s', this.name);
    this.isRecycled = true;
    return this.slot;
  }
});

var CardCollection = exports.CardCollection = RecycleCollectionMixin.extend({
  newEventStr: 'card:new',

  initialize: function initialize() {
    this.models = [];
    this.hasNew = false;
  },

  noobGear: function noobGear() {
    this.models = [new CardModel('sharpened'), new CardModel('stinging')];
    this.sort();
    _.each(this.models, function (m) {
      m.isNew = true;
    });
  },

  toJSON: function toJSON() {
    return _.map(this.models, function (model) {
      return model.toJSON();
    });
  },

  fromJSON: function fromJSON(data) {
    this.models = _.map(data, function (cardData) {
      var c = new CardModel(cardData.name);
      c.fromJSON(cardData);
      return c;
    });
    this.sort();
  },

  sort: function sort(sortStyle) {
    this.models.sort(function (a, b) {
      var ascore = a.level;
      var bscore = b.level;
      if (sortStyle === 'craft') {
        ascore += a.canLevel() ? 1000 : 0;
        bscore += b.canLevel() ? 1000 : 0;
      }
      // console.log(a.name, a.level, a.canLevel(), ascore, b.name, bscore);
      if (ascore > bscore) {
        return -1;
      }
      if (ascore < bscore) {
        return 1;
      }
      if (a.name > b.name) {
        return 1;
      }
      if (a.name < b.name) {
        return -1;
      }
      return 0;
    });
  }
});

var RecycleManager = exports.RecycleManager = _model.Model.extend({
  initialize: function initialize(inv, cardInv) {
    this.inv = inv;
    this.cardInv = cardInv;
  },

  ff: function ff(item) {
    return item.inRecycle && !item.isRecycled;
  },

  getModels: function getModels() {
    return _.filter(this.inv.models, this.ff).concat(_.filter(this.cardInv.models, this.ff));
  },

  getRecycleValue: function getRecycleValue(slot) {
    var slotTranslate = {
      'skill': 'energy',
      'weapon': 'handle',
      'head': 'skull',
      'chest': 'heart',
      'hands': 'finger',
      'legs': 'toe'
    };
    var zLvl = this.zone.hero.spec.level / 2.35;
    var name = slotTranslate[slot];
    var amt = Math.ceil(Math.pow(2.5, zLvl));
    return (0, _drops.dropFactory)('material', [name, amt]);
  },

  getAllValueStr: function getAllValueStr() {
    var valids = this.getModels();
    if (valids.length == 0) {
      return 'nothing.';
    }
    var mats = {};
    _.each(valids, function (valid) {
      var drop = this.getRecycleValue(valid.slot);
      if (mats[drop.nameStr] === undefined) {
        mats[drop.nameStr] = drop.quantity;
      } else {
        mats[drop.nameStr] += drop.quantity;
      }
    }, this);
    var finStr = '';
    var commasRemaining = _.keys(mats).length - 1;
    _.each(mats, function (amt, mat) {
      finStr += utils.prettifyNum(amt) + ' ' + mat;
      if (commasRemaining > 0) {
        finStr += ', ';
        commasRemaining -= 1;
      } else {
        finStr += '.';
      }
    }, this);
    return finStr;
  }
});

// Responds to events, updates state on items
var NewStateManager = exports.NewStateManager = _model.Model.extend({
  initialize: function initialize(inv, cardInv) {
    this.inv = inv;
    this.cardInv = cardInv;
    this.newCardSlots = {
      weapon: false,
      head: false,
      hands: false,
      chest: false,
      legs: false,
      skill: false
    };

    this.listenTo(_globals.gl.DirtyListener, 'item:new', this.update);
    this.listenTo(_globals.gl.DirtyListener, 'card:new', this.update);
    this.listenTo(_globals.gl.DirtyListener, 'removeNew', this.update);
    _globals.gl.DirtyQueue.mark('item:new');
  },

  update: function update() {
    _globals.gl.DirtyQueue.mark('newChange'); // Note: Async
    this.inv.hasNew = false;
    var items = this.inv.getModels();
    for (var i = items.length; i--;) {
      if (items[i].isNew) {
        this.inv.hasNew = true;
        break;
      }
    }
    this.cardInv.hasNew = false;
    var cards = this.cardInv.getModels();
    for (var i = cards.length; i--;) {
      if (cards[i].isNew) {
        this.cardInv.hasNew = true;
        break;
      }
    }
    _.each(this.newCardSlots, function (value, key) {
      this.newCardSlots[key] = false;
    }, this);
    var m;
    for (var i = cards.length; i--;) {
      m = cards[i];
      this.newCardSlots[m.slot] = this.newCardSlots[m.slot] || m.isNew;
    }
    _.each(this.inv.models, function (m) {
      m.hasNewCards = this.newCardSlots[m.slot];
    }, this);
  }
});


},{"./attacks":1,"./drops":5,"./entity":6,"./globals":9,"./itemref/itemref":12,"./log":19,"./model":21,"./prob":22,"./utils":25,"jquery":32,"underscore":33}],11:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
var PHYS_COLOR = exports.PHYS_COLOR = 'rgba(119, 119, 119, 1)';
var FIRE_COLOR = exports.FIRE_COLOR = 'rgba(255, 130, 0, 0.6)';
var COLD_COLOR = exports.COLD_COLOR = 'rgba(0, 255, 255, 0.6)';
var LIGHT_COLOR = exports.LIGHT_COLOR = 'rgba(173, 7, 194, 0.6)';
var POIS_COLOR = exports.POIS_COLOR = 'rgba(85, 255, 139, 0.6)';
var cfire = exports.cfire = 'rgba(255, 130, 0, 1)';
var ccold = exports.ccold = 'rgba(0, 255, 255, 1)';
var clight = exports.clight = 'rgba(173, 7, 194, 1)';
var cpois = exports.cpois = 'rgba(85, 255, 139, 1)';
var cbone = exports.cbone = 'rgba(221,221,221,1)';
var celf = exports.celf = 'rgba(0, 136, 51, 1)'; //'#083';
var cblack = exports.cblack = 'rgba(0,0,0, 1)';
var cplant = exports.cplant = 'rgba(85, 153, 0, 1)';
var cgoblin = exports.cgoblin = 'rgba(68, 102, 0, 1)';
var cstone = exports.cstone = 'rgba(85, 85, 136, 1)';
var cdarkgrey = exports.cdarkgrey = 'rgba(51, 51, 51, 1)';
var cgold = exports.cgold = 'rgba(204, 170, 51, 1)';
var cbrown = exports.cbrown = 'rgba(102, 68, 34, 1)';
var cdarkred = exports.cdarkred = 'rgba(51, 0, 0, 1)';
var cdarkgreen = exports.cdarkgreen = 'rgba(0, 51, 0, 1)';
var cdarkblue = exports.cdarkblue = 'rgba(0, 0, 51, 1)';
var cimp = exports.cimp = 'rgba(136, 85, 136, 1)';
var cgnome = exports.cgnome = 'rgba(153, 102, 170, 1)';
var cmeat = exports.cmeat = 'rgba(255, 102, 136, 1)';
var cwhite = exports.cwhite = 'rgba(255, 255, 255, 1)';
var cpureblue = exports.cpureblue = 'rgba(0, 0, 255, 1)';
var cblood = exports.cblood = 'rgba(153, 0, 0, 1)';


},{}],12:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ref = undefined;
exports.expand = expand;

var _jquery = require('jquery');

var _jquery2 = _interopRequireDefault(_jquery);

var _itemref_armor = require('./itemref_armor');

var _itemref_card = require('./itemref_card');

var _itemref_monster = require('./itemref_monster');

var _itemref_skill = require('./itemref_skill');

var _itemref_weapon = require('./itemref_weapon');

var _itemref_zone = require('./itemref_zone');

var _log = require('../log');

var _log2 = _interopRequireDefault(_log);

var _prob = require('../prob');

var prob = _interopRequireWildcard(_prob);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var ref = exports.ref = {
  'weapon': _itemref_weapon.weapon,
  'armor': _itemref_armor.armor,
  'skill': _itemref_skill.skill,
  'card': _itemref_card.card,
  'monster': _itemref_monster.monster,
  'zoneOrder': {
    'order': ['spooky dungeon', 'dark forest', 'aggro crag', 'icy tunnel', 'hostile marsh', 'clockwork ruins', 'beginners field', 'gothic castle', 'decaying temple', 'lich tower', 'wicked dream', 'imperial barracks']
  },
  'zone': _itemref_zone.zone,
  'test': {
    'hngg': { 'a': 10 },
    'fwah': { 'b': 10 },
    'buh': { 'a': 12 },
    'hi': { 'prototype': ['hngg', 'fwah'], 'b': 12 },
    'foo': { 'prototype': ['hngg', 'buh'], 'a': 15 },
    'harf': { 'prototype': ['hi', 'foo'], 'c': 10 }
  },
  // it goes: [hngg, fwah, hi, hngg, buh, foo, harf]: c: 10, b: 12, a: 15
  'materials': {
    'skull': { 'printed': 'Skulls', 'category': 4 },
    'heart': { 'printed': 'Hearts', 'category': 4 },
    'finger': { 'printed': 'Fingers', 'category': 4 },
    'toe': { 'printed': 'Toes', 'category': 4 },
    'handle': { 'printed': 'Handles', 'category': 4 },
    'energy': { 'printed': 'Energy', 'category': 4 },
    'metal': { 'printed': 'Metal', 'category': 3 },
    'ember': { 'printed': 'Embers', 'category': 3 },
    'ice': { 'printed': 'Ice', 'category': 3 },
    'spark': { 'printed': 'Sparks', 'category': 3 },
    'spore': { 'printed': 'Spores', 'category': 3 },
    'feather': { 'printed': 'Feathers', 'category': 3 },
    'muscle': { 'printed': 'Muscles', 'category': 3 },
    'eye': { 'printed': 'Eyes', 'category': 3 },
    'brain': { 'printed': 'Brains', 'category': 3 },
    'blood': { 'printed': 'Blood', 'category': 3 },
    'wing': { 'printed': 'Wings', 'category': 3 },
    'mirror': { 'printed': 'Mirrors', 'category': 3 },
    'shield': { 'printed': 'Shields', 'category': 2 },
    'blade': { 'printed': 'Blades', 'category': 2 },
    'spike': { 'printed': 'Spikes', 'category': 2 },
    'needle': { 'printed': 'Needles', 'category': 2 },
    'razor': { 'printed': 'Razors', 'category': 2 },
    'potion': { 'printed': 'Potions', 'category': 2 },
    'converter': { 'printed': 'Converters', 'category': 2 },
    'spine': { 'printed': 'Spines', 'category': 1 },
    'elf ear': { 'printed': 'Elf Ears', 'category': 1 },
    'crag shard': { 'printed': 'Crag Shards', 'category': 1 },
    'wight snow': { 'printed': 'Wight Snow', 'category': 1 },
    'imp head': { 'printed': 'Imp Heads', 'category': 1 },
    'gnome': { 'printed': 'Gnomes', 'category': 1 },
    'gargoyle': { 'printed': 'Gargoyles', 'category': 1 },
    'business card': { 'printed': 'Business Cards', 'category': 1 },
    'lichen': { 'printed': 'Lichen', 'category': 1 },
    'slime': { 'printed': 'Slime', 'category': 1 },
    'nightmare': { 'printed': 'Nightmares', 'category': 1 },
    'sigil': { 'printed': 'Sigils', 'category': 1 }
  },
  'matCategoryBase': ['1 indexed for simplicity', 1, 2.3, 2.7, 3.9],
  'matDropRates': {
    'normal': [0.7, 0.2, 0.1, 0],
    'rare': [0.2, 0.4, 0.35, 0.05],
    'boss': [0, 0, 0, 1],
    'slime': [0, 0, 0, 1]
  },
  'statnames': {
    'strength': 'Strength',
    'dexterity': 'Dexterity',
    'wisdom': 'Wisdom',
    'vitality': 'Vitality',
    'maxHp': 'Maximum Health',
    'maxMana': 'Maximum Mana',
    'armor': 'Armor',
    'dodge': 'Dodge',
    'accuracy': 'Accuracy',
    'eleResistAll': 'Elemental Resistance',
    'hpRegen': 'Health Regenerated per Second',
    'manaRegen': 'Mana Regenerated per Second',
    'moveSpeed': 'Movement Speed',
    'fireResist': 'Fire Resistance',
    'coldResist': 'Cold Resistance',
    'lightResist': 'Lightning Resistance',
    'poisResist': 'Poison Resistance',
    'physThorns': 'Physical Thorns',
    'fireThorns': 'Fire Thorns',
    'coldThorns': 'Cold Thorns',
    'lightThorns': 'Lightning Thorns',
    'poisThorns': 'Poison Thorns',
    'meleeDmg': 'Melee Damage',
    'rangeDmg': 'Ranged Damage',
    'spellDmg': 'Spell Damage',
    'physDmg': 'Physical Damage',
    'fireDmg': 'Fire Damage',
    'coldDmg': 'Cold Damage',
    'lightDmg': 'Lightning Damage',
    'poisDmg': 'Poison Damage',
    'hpOnHit': 'Health Gained on Hit',
    'manaOnHit': 'Mana Gained on Hit',
    'cooldownTime': 'Cooldown Length',
    'range': 'Skill Range',
    'speed': 'Skill Duration',
    'manaCost': 'Mana Cost',
    'hpLeech': 'Leeched Health',
    'manaLeech': 'Leeched Mana',
    'lineWidth': 'Line Width',
    'opacity': 'Opacity',
    'height': 'Character Height',
    'width': 'Character Width',
    'aoeRadius': 'AOE Radius',
    'aoeSpeed': 'AOE Speed',
    'angle': 'Angle',
    'projRange': 'Projectile Range',
    'projRadius': 'Projectile Radius',
    'projSpeed': 'Projectile Speed',
    'projCount': 'Additional Projectiles'
  }
};

/*
  fudge: a = 1
  fwah: a = 3
  sherbet: a = 2

  asdf: [fudge(2), sherbet(3)]

  fdsa: [fwah(5)]

  buh: [asdf(1), fdsa(4)]

  [asdf, fudge, sherbet, fdsa, fwah]
*/

function recExtend(name, r, names) {
  if ('prototype' in r[name] && r[name]['prototype'].length > 0) {
    for (var i = 0; i < r[name]['prototype'].length; i++) {
      names = recExtend(r[name]['prototype'][i], r, names);
    }
  }
  names[names.length] = name;
  // log.debug("recExtend, name %s, names now %s", name,
  // JSON.stringify(names));
  return names;
}

function expand(type, name) {
  if (!(type in ref) || !(name in ref[type])) {
    _log2.default.error('Could not find reference for a %s named %s', type, name);
    throw 'fudge';
    return;
  }

  var names = recExtend(name, ref[type], []);
  var item = Object.assign({}, ref[type][name]);
  for (var i = 0; i < names.length; i++) {
    item = Object.assign({}, item, ref[type][names[i]]);
  }
  if ('itemType' in item) {
    throw sprintf('Found a "itemType" key in item %s. No item is allowed to have "itemType" as it it set in expand', JSON.stringify(item));
  }
  item['itemType'] = type;
  if ('name' in item) {
    throw sprintf('Found a "name" key in item %s. No item is allowed to have "name" as it it set in expand', JSON.stringify(item));
  }
  item['name'] = name;

  _log2.default.debug('itemref.expand(%s, %s), Final item: %s', type, name, JSON.stringify(item));

  return item;
}

/*
   "hot sword": {
   "slot": "weapon",
   "levels": 10,
   "modType": "added",
   "stat": "fireDmg",
   "perLevel": 2
   },
   "surprisingly hot sword": {
   "slot": "weapon",
   "levels": 10,
   "modType": "more",
   "stat": "fireDmg",
   "perLevel": 1
   },
   {base: [], perLevel: 'fireDmg more 1'}

   added
   converted increased % of other
   converted decreased % of max
   more

   hatred 50% phys as cold
   phys to light 50% physical converted to light
   cold to fire 50%  cold converted to fire

   100 phys (after added and more), 0 of else

   phys to light:
   100 (-50) phys
   50 light


   hatred:
   phys is 50
   cold 25

   cold to fire:
   25 - 12.5 cold
   12.5 fire

   50 phys
   50 light
   12.5 cold
   12.5 fire
   0 pois

   "hot sword": {
   "slot": "weapon",
   "levels": 10,
   "mods": [
   'fireDmg added 2 perLevel',
   'fireDmg more 1 perLevel'
   ]
   },

   itemref has this format:
   mods: [
   ['fireDmg more 100', 'dmg'],
   ['physDmg converted 50 fireDmg', 'dmg'],
   ['fireDmg more 1 perLevel', 'dmg']
   ]

   [
   ['physDmg more 100', 'dmg'],
   ['physDmg added 5 perLevel', 'dmg']
   ]

   compileCards converts to this:

   primary verb amt special(perLevel / element inc ase of converted and
   gainedas)



   hatred:

   {base: ['physDmg gainedas coldDmg 50'], perLevel: 'physDmg gainedas 2
   coldDmg'}

 */


},{"../log":19,"../prob":22,"./itemref_armor":13,"./itemref_card":14,"./itemref_monster":15,"./itemref_skill":16,"./itemref_weapon":17,"./itemref_zone":18,"jquery":32}],13:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
var armor = exports.armor = {
  ////////////////////
  ///// HEAD /////////
  ////////////////////
  'balsa helmet': {
    'mods': ['armor added 5', 'armor more 1 perLevel'],
    'slot': 'head'
  },
  'collander': {
    'mods': ['armor added 7', 'armor more 1.2 perLevel'],
    'slot': 'head'
  },
  'conquistador helm': {
    'mods': ['armor added 9', 'armor more 1.4 perLevel'],
    'slot': 'head'
  },
  'crusader helm': {
    'mods': ['armor more 1.6 perLevel'],
    'slot': 'head'
  },
  'gladiator helm': {
    'mods': ['armor added 22', 'armor more 1.3 perLevel'],
    'slot': 'head'
  },
  'apollo helmet': {
    'mods': ['armor added 30', 'armor more 1.5 perLevel'],
    'slot': 'head'
  },
  'plague doctor': {
    'mods': ['poisResist more 10', 'poisDmg gainedas 0.5 hpLeech', 'poisResist more 2 perLevel', 'poisDmg more 0.5 perLevel'],
    'slot': 'head'
  },
  'visor': {
    'mods': ['armor added 9', 'armor more 1.2 perLevel', 'rangeDmg more 0.8 perLevel'],
    'slot': 'head'
  },
  'mage hat': {
    'mods': ['manaRegen added 10', 'eleResistAll more 2 perLevel'],
    'slot': 'head'
  },
  'lichgaze': {
    'mods': ['maxMana more 1 perLevel', 'wisdom added 1 perLevel', 'eleResistAll more 1 perLevel'],
    'slot': 'head'
  },
  'dodgers cap': {
    'mods': ['dodge added 30', 'dodge more 1 perLevel'],
    'slot': 'head'
  },
  'kabuto': {
    'mods': ['armor more 0.5 perLevel', 'eleResistAll more 1 perLevel'],
    'slot': 'head'
  },
  'gooey gibus': {
    'mods': ['vitality more 0.5 perLevel', 'eleResistAll more 1 perLevel'],
    'slot': 'head'
  },
  'champion helm': {
    'mods': ['armor more 0.8 perLevel', 'eleResistAll more 0.8 perLevel', 'strength more 0.3 perLevel', 'dexterity more 0.3 perLevel'],
    'slot': 'head'
  },
  'zealot hood': {
    'mods': ['eleResistAll more -40', 'cooldownTime more -40', 'spellDmg more 1.5 perLevel'],
    'slot': 'head'
  },
  'halo': {
    'mods': ['aoeSpeed more 0.8 perLevel', 'aoeRadius more 0.8 perLevel', 'dodge more 0.8 perLevel'],
    'slot': 'head'
  },
  ////////////////////
  ///// CHEST ////////
  ////////////////////
  't-shirt': {
    'mods': ['armor added 5', 'armor more 1 perLevel'],
    'slot': 'chest'
  },
  'leather armor': {
    'mods': ['armor added 8', 'armor more 1.2 perLevel'],
    'slot': 'chest'
  },
  'goblin leather': {
    'mods': ['armor added 5', 'armor more 1.3 perLevel', 'fireResist more 2 perLevel'],
    'slot': 'chest'
  },
  'leatherscale armor': {
    'mods': ['dodge more 1 perLevel', 'armor more 1 perLevel', 'eleResistAll more 1 perLevel'],
    'slot': 'chest'
  },
  'leatherplate armor': {
    'mods': ['armor added 20', 'armor more 1.5 perLevel', 'eleResistAll more 0.6 perLevel'],
    'slot': 'chest'
  },
  'hammered chestplate': {
    'mods': ['armor more 50', 'armor more 1 perLevel'],
    'slot': 'chest'
  },
  'iron chestplate': {
    'mods': ['armor added 40', 'armor more 1.5 perLevel'],
    'slot': 'chest'
  },
  'dragonscale': {
    'mods': ['fireDmg gainedas 0.5 hpLeech', 'fireDmg more 1 perLevel', 'eleResistAll more 1 perLevel', 'dodge more 0.5 perLevel'],
    'slot': 'chest'
  },
  'muscle plate': {
    'mods': ['armor added 100', 'armor more 1.6 perLevel'],
    'slot': 'chest'
  },
  'chainmail': {
    'mods': ['armor more 1 perLevel', 'dexterity more 1 perLevel'],
    'slot': 'chest'
  },
  'elegant plate': {
    'mods': ['armor added 200', 'dodge more -50', 'armor more 1.9 perLevel', 'eleResistAll more 2 perLevel'],
    'slot': 'chest'
  },
  'paladin armor': {
    'mods': ['moveSpeed more -50', 'maxHp gainedas 2.2 hpRegen', 'armor more 2.2 perLevel', 'eleResistAll more 2.2 perLevel'],
    'slot': 'chest'
  },
  'raider armor': {
    'mods': ['physDmg more 2 perLevel', 'armor more -20'],
    'slot': 'chest'
  },
  'shadow armor': {
    'mods': ['dodge added 50', 'dodge more 1.5 perLevel', 'eleResistAll more 0.5 perLevel'],
    'slot': 'chest'
  },
  'scout leather': {
    'mods': ['dodge added 20', 'dodge more 1 perLevel', 'eleResistAll more 1 perLevel'],
    'slot': 'chest'
  },
  'studded leather': {
    'mods': ['dodge more 1.4 perLevel', 'armor more 0.5 perLevel', 'eleResistAll more 1 perLevel'],
    'slot': 'chest'
  },
  'velvet tunic': {
    'mods': ['manaRegen added 5', 'eleResistAll more 0.5 perLevel', 'eleResistAll added 5 perLevel'],
    'slot': 'chest'
  },
  'war robe': {
    'mods': ['manaRegen added 10', 'armor more 1.2 perLevel', 'eleResistAll more 2 perLevel'],
    'slot': 'chest'
  },
  'winged leather': {
    'mods': ['armor added 100', 'armor more 1.2 perLevel', 'eleResistAll more 1 perLevel'],
    'slot': 'chest'
  },
  'cultist robe': {
    'mods': ['spellDmg more 30', 'dodge more 0.5 perLevel', 'eleResistAll more 1 perLevel'],
    'slot': 'chest'
  },
  'embroidered silks': {
    'mods': ['manaRegen added 20', 'spellDmg more 1 perLevel', 'eleResistAll more 1 perLevel', 'eleResistAll added 1 perLevel'],
    'slot': 'chest'
  },
  'champion mail': {
    'mods': ['armor more 1.2 perLevel', 'eleResistAll more 1.2 perLevel', 'strength more 0.5 perLevel', 'dexterity more 0.5 perLevel'],
    'slot': 'chest'
  },
  'batsuit': {
    'mods': ['speed more -20', 'physDmg more 1 perLevel'],
    'slot': 'chest'
  },
  'gooey gaberdine': {
    'mods': ['vitality more 1 perLevel', 'eleResistAll more 1 perLevel'],
    'slot': 'chest'
  },
  ////////////////////
  ///// LEGS /////////
  ////////////////////
  'jeans': {
    'mods': ['armor added 5', 'armor more 1 perLevel'],
    'slot': 'legs'
  },
  'leather boots': {
    'mods': ['armor added 10', 'armor more 1.2 perLevel'],
    'slot': 'legs'
  },
  'elf boots': {
    'mods': ['dodge added 5', 'dodge more 1 perLevel'],
    'slot': 'legs'
  },
  'mage boots': {
    'mods': ['manaRegen added 5', 'manaRegen more 2 perLevel', 'eleResistAll more 1 perLevel'],
    'slot': 'legs'
  },
  'arcane boots': {
    'mods': ['spellDmg more 20', 'manaRegen more 2 perLevel', 'eleResistAll more 1 perLevel'],
    'slot': 'legs'
  },
  'buckaneer boots': {
    'mods': ['armor added 25', 'armor more 1 perLevel', 'eleResistAll more 0.6 perLevel'],
    'slot': 'legs'
  },
  'foot plate': {
    'mods': ['armor added 40', 'armor more 1.5 perLevel', 'dodge more -30', 'eleResistAll more 1 perLevel'],
    'slot': 'legs'
  },
  'ninja tabi': {
    'mods': ['dodge added 100', 'dodge more 1.5 perLevel'],
    'slot': 'legs'
  },
  'suess boots': {
    'mods': ['armor added 500', 'armor added 20 perLevel'],
    'slot': 'legs'
  },
  'rear claws': {
    'mods': ['cooldownTime more -30', 'strength added 3 perLevel', 'lightResist more 3 perLevel'],
    'slot': 'legs'
  },
  'shiny greaves': {
    'mods': ['vitality more 0.3 perLevel', 'eleResistAll more 0.8 perLevel', 'armor more 0.8 perLevel'],
    'slot': 'legs'
  },
  'cavalry boots': {
    'mods': ['strength more 0.8 perLevel', 'armor more 0.8 perLevel'],
    'slot': 'legs'
  },
  'magesteel greaves': {
    'mods': ['cooldownTime more -30', 'armor more 0.8 perLevel', 'eleResistAll more 0.8 perLevel'],
    'slot': 'legs'
  },
  'champion boots': {
    'mods': ['armor more 0.8 perLevel', 'eleResistAll more 0.8 perLevel', 'strength more 0.3 perLevel', 'dexterity more 0.3 perLevel'],
    'slot': 'legs'
  },
  'winged sandals': {
    'mods': ['dexterity more 1 perLevel', 'moveSpeed more 1 perLevel'],
    'slot': 'legs'
  },
  ////////////////////
  ///// GLOVES ///////
  ////////////////////
  'latex gloves': {
    'mods': ['armor added 5', 'armor more 1 perLevel'],
    'slot': 'hands'
  },
  'gardening gloves': {
    'mods': ['armor added 7', 'armor more 1.2 perLevel'],
    'slot': 'hands'
  },
  'leather gloves': {
    'mods': ['dodge added 10', 'dodge more 1.2 perLevel'],
    'slot': 'hands'
  },
  'silk feather gloves': {
    'mods': ['speed more -25', 'dexterity more 1 perLevel', 'eleResistAll more 1 perLevel'],
    'slot': 'hands'
  },
  'velvet gloves': {
    'mods': ['manaRegen added 2', 'manaRegen more 2 perLevel', 'spellDmg more 0.5 perLevel', 'eleResistAll more 1 perLevel'],
    'slot': 'hands'
  },
  'front claws': {
    'mods': ['speed more -30', 'dexterity added 3 perLevel', 'lightDmg more 1 perLevel'],
    'slot': 'hands'
  },
  'handmail': {
    'mods': ['armor added 15', 'armor more 1.3 perLevel'],
    'slot': 'hands'
  },
  'fancy gauntlets': {
    'mods': ['armor added 25', 'armor more 1.5 perLevel'],
    'slot': 'hands'
  },
  'polished gauntlets': {
    'mods': ['armor added 30', 'dodge more -30', 'armor more 1.8 perLevel'],
    'slot': 'hands'
  },
  'goldenscale gauntlets': {
    'mods': ['dodge added 50', 'dodge more 1.1 perLevel', 'eleResistAll more 0.6 perLevel'],
    'slot': 'hands'
  },
  'mage gloves': {
    'mods': ['manaRegen added 5', 'wisdom added 1 perLevel', 'eleResistAll more 1 perLevel'],
    'slot': 'hands'
  },
  'gooey gauntlets': {
    'mods': ['vitality more 0.5 perLevel', 'eleResistAll more 1 perLevel'],
    'slot': 'hands'
  },
  'magesteel gauntlets': {
    'mods': ['spellDmg more 30', 'armor more 0.8 perLevel', 'eleResistAll more 0.8 perLevel'],
    'slot': 'hands'
  },
  'champion gloves': {
    'mods': ['armor more 0.8 perLevel', 'eleResistAll more 0.8 perLevel', 'strength more 0.3 perLevel', 'dexterity more 0.3 perLevel'],
    'slot': 'hands'
  }
};


},{}],14:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
var card = exports.card = {
  'proto-skeleton': {
    'mods': ['fireResist more 20']
  },
  'proto-grunt': {
    'mods': ['maxHp more -50', 'physDmg more -30']
  },
  'proto-boss': {
    'mods': ['lineWidth added 30', 'width more 100', 'height more 100', 'physDmg more 100', 'maxHp more 500']
  },
  'proto-bat': {
    'mods': ['height more -80']
  },
  'proto-rofl': {
    'mods': ['height more -50', 'width more 300']
  },
  'proto-buddha': {
    'mods': ['maxHp more 1 perLevel', 'accuracy more 1000 perLevel', 'lineWidth added 300', 'height more -30', 'width more 50']
  },
  'proto-acheron': {
    'mods': ['range more 70', 'cooldownTime added 10']
  },
  'proto-colossus': {
    'mods': ['cooldownTime more -99', 'accuracy more 1000000', 'accuracy added 1000000']
  },
  'proto-tallman': {
    'mods': ['height more 200', 'width more -50']
  },
  'sharpened': {
    'mods': ['physDmg added 3 perLevel'],
    'slot': 'weapon',
    'materials': ['handle', 'metal', 'blade']
  },
  'faster detonation': {
    'mods': ['aoeRadius more 50', 'speed more -2 perLevel'],
    'slot': 'skill',
    'materials': ['gargoyle', 'lichen', 'business card', 'energy']
  },
  'flash': {
    'mods': ['moveSpeed gainedas 3 aoeSpeed', 'lightDmg more 3 perLevel', 'lightResist more 3 perLevel'],
    'slot': 'weapon',
    'materials': ['handle', 'spark', 'spark', 'nightmare', 'nightmare'],
    'credit': 'WirelessKFC'
  },
  'mobility': {
    'mods': ['speed converted 80 cooldownTime', 'cooldownTime added 100', 'cooldownTime more 50', 'cooldownTime more -1 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'wing', 'converter', 'gnome'],
    'flavor': 'Less Skill Duration means More Moving'
  },
  'hot sword': {
    'mods': ['fireDmg added 5 perLevel'],
    'slot': 'weapon',
    'materials': ['handle', 'ember', 'metal', 'blade']
  },
  'cold sword': {
    'mods': ['coldDmg added 5 perLevel'],
    'slot': 'weapon',
    'materials': ['handle', 'ice', 'metal', 'blade']
  },
  'breadhat': {
    'mods': ['armor added 10 perLevel', 'armor more 1 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'metal', 'shield']
  },
  'six pack': {
    'mods': ['lineWidth added 30', 'armor added 10 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'metal', 'shield']
  },
  'steel toed': {
    'mods': ['armor added 10 perLevel', 'armor more 0.5 perLevel', 'moveSpeed more -30'],
    'slot': 'legs',
    'materials': ['toe', 'metal', 'shield']
  },
  'quenching blade': {
    'mods': ['fireResist more 7 perLevel'],
    'slot': 'weapon',
    'materials': ['handle', 'ember', 'shield']
  },
  'enchant weapon': {
    'mods': ['eleResistAll more 3 perLevel'],
    'slot': 'weapon',
    'materials': ['handle', 'brain', 'shield']
  },
  'possessed weapon': {
    'mods': ['physDmg gainedas 0.5 hpLeech', 'wisdom more -50', 'physDmg more 0.5 perLevel'],
    'slot': 'weapon',
    'materials': ['handle', 'metal', 'needle', 'razor']
  },
  'multi-fingered': {
    'mods': ['accuracy more 20', 'physDmg more 20', 'accuracy more 1 perLevel', 'physDmg more 1 perLevel'],
    'slot': 'hands',
    'materials': ['finger', 'metal', 'eye', 'spike']
  },
  'derping out': {
    'mods': ['wisdom more -75', 'armor more 2 perLevel', 'dodge more 2 perLevel', 'eleResistAll more 2 perLevel'],
    'slot': 'weapon',
    'materials': ['skull', 'shield', 'eye', 'muscle']
  },
  'cool shoes': {
    'mods': ['fireResist more 7 perLevel'],
    'slot': 'legs',
    'materials': ['toe', 'ember', 'shield']
  },
  'compression shorts': {
    'mods': ['moveSpeed more 30', 'moveSpeed more 1 perLevel'],
    'slot': 'legs',
    'materials': ['toe', 'wing', 'spike']
  },
  'asbestos lining': {
    'mods': ['fireResist more 7 perLevel'],
    'slot': 'hands',
    'materials': ['finger', 'ember', 'shield']
  },
  'sopping underclothes': {
    'mods': ['fireResist more 50', 'coldResist more -50', 'fireResist more 3 perLevel'],
    'slot': 'legs',
    'materials': ['toe', 'ember', 'shield', 'razor']
  },
  'brain juice': {
    'mods': ['manaRegen added 2 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'brain', 'potion']
  },
  'heart juice': {
    'mods': ['hpRegen added 2 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'blood', 'potion']
  },
  'head of vigor': {
    'mods': ['vitality added 20 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'blood', 'blade']
  },
  'nimble': {
    'mods': ['dexterity added 5 perLevel', 'dexterity added 20'],
    'slot': 'chest',
    'materials': ['heart', 'eye', 'blade']
  },
  'bloodsucker': {
    'mods': ['physDmg gainedas 0.3 hpLeech', 'physDmg added 5 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'blood', 'needle', 'spine'],
    'rarity': 'rare'
  },
  'strong back': {
    'mods': ['strength added 10 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'muscle', 'blade']
  },
  'holy shield': {
    'mods': ['armor converted 20 eleResistAll', 'armor more 4 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'metal', 'spike', 'converter']
  },
  'sacred shield': {
    'mods': ['armor gainedas 20 physThorns', 'physThorns more 2 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'mirror', 'shield', 'converter']
  },
  'ascended': {
    'mods': ['strength more 0.7 perLevel', 'dexterity more 0.7 perLevel', 'wisdom more 0.7 perLevel', 'vitality more 0.7 perLevel'],
    'slot': 'chest',
    'materials': ['sigil', 'muscle', 'brain', 'eye']
  },
  'aura': {
    'mods': ['maxHp gainedas 0.5 hpRegen', 'spellDmg more 2 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'blood', 'brain', 'spike']
  },
  'thwomping': {
    'mods': ['physDmg more 5 perLevel', 'physDmg more 25', 'moveSpeed more -50'],
    'slot': 'legs',
    'materials': ['toe', 'metal', 'feather', 'razor']
  },
  'dancing walk': {
    'mods': ['dodge more 30', 'dodge more 1 perLevel', 'moveSpeed more -50'],
    'slot': 'legs',
    'materials': ['toe', 'feather', 'razor']
  },
  'dexterous hands': {
    'mods': ['dexterity added 5 perLevel'],
    'slot': 'hands',
    'materials': ['finger', 'feather', 'blade']
  },
  'dummy': {
    'mods': ['moveSpeed added -300'],
    'slot': 'head'
  },
  'fear': {
    'mods': ['moveSpeed added -400'],
    'slot': 'legs'
  },
  'more projectiles': {
    'mods': ['projCount added 2', 'angle more 20', 'speed more -0.5 perLevel', 'manaCost added 2'],
    'slot': 'skill',
    'materials': ['energy', 'eye', 'feather', 'imp head']
  },
  'stinging': {
    'mods': ['physDmg added 3 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'metal', 'blade']
  },
  'ignited': {
    'mods': ['physDmg converted 20 fireDmg', 'fireDmg more 3 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'ember', 'spike', 'converter']
  },
  'frosted': {
    'mods': ['physDmg converted 20 coldDmg', 'coldDmg more 3 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'ice', 'spike', 'converter']
  },
  'charged': {
    'mods': ['physDmg converted 20 lightDmg', 'lightDmg more 3 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'spark', 'spike', 'converter']
  },
  'putrefied': {
    'mods': ['physDmg converted 20 poisDmg', 'poisDmg more 3 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'spore', 'spike', 'converter']
  },
  'heart of granite': {
    'mods': ['armor added 5 perLevel', 'armor more 3 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'metal', 'blade', 'spike']
  },
  'small stature': {
    'mods': ['height more -30', 'width more -30', 'moveSpeed more 1 perLevel', 'dodge added 50', 'dodge more 3 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'feather', 'spike', 'imp head']
  },
  'keen wit': {
    'mods': ['wisdom added 10 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'brain', 'blade']
  },
  'textbook': {
    'mods': ['wisdom added 10 perLevel'],
    'slot': 'hands',
    'materials': ['finger', 'brain', 'blade']
  },
  'electrified': {
    'mods': ['lightDmg more 4 perLevel'],
    'slot': 'weapon',
    'materials': ['handle', 'spark', 'spike']
  },
  'festering': {
    'mods': ['poisDmg more 4 perLevel'],
    'slot': 'weapon',
    'materials': ['handle', 'spore', 'spike']
  },
  'blazing': {
    'mods': ['fireDmg more 4 perLevel'],
    'slot': 'weapon',
    'materials': ['handle', 'ember', 'spike']
  },
  'iced': {
    'mods': ['coldDmg more 4 perLevel'],
    'slot': 'weapon',
    'materials': ['handle', 'ice', 'spike']
  },
  'flying': {
    'mods': ['armor more -20', 'dodge added 95', 'dodge added 5 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'feather', 'razor']
  },
  'clawed': {
    'mods': ['physDmg added 3 perLevel', 'physDmg more 10'],
    'slot': 'hands',
    'materials': ['finger', 'metal', 'blade', 'spike']
  },
  'riveted': {
    'mods': ['lineWidth added 30', 'armor more 5 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'metal', 'shield']
  },
  'clockwork': {
    'mods': ['physDmg more 5 perLevel', 'speed more -15'],
    'slot': 'chest',
    'materials': ['heart', 'metal', 'spike', 'gnome']
  },
  'mecha heart': {
    'mods': ['lineWidth added 30', 'vitality added 5 perLevel', 'hpRegen added 5 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'blood', 'blade', 'potion']
  },
  'steam powered': {
    'mods': ['manaRegen added 10 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'brain', 'potion', 'gnome'],
    'flavor': 'all hail gaben'
  },
  'goblin toe': {
    'mods': ['armor added 10 perLevel', 'physDmg more 2 perLevel', 'physDmg more 25'],
    'slot': 'legs',
    'materials': ['toe', 'metal', 'spike', 'crag shard']
  },
  'berserking': {
    'mods': ['physDmg more 20', 'physDmg more 1 perLevel', 'speed more -0.3 perLevel', 'maxHp more -50'],
    'slot': 'head',
    'materials': ['skull', 'metal', 'blood', 'razor']
  },
  'simple minded': {
    'mods': ['spellDmg more -30', 'strength more 2 perLevel', 'meleeDmg more 2 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'muscle', 'spike', 'razor']
  },
  'explosive bolts': {
    'mods': ['rangeDmg more 0.5 perLevel', 'physDmg converted 25 fireDmg'],
    'slot': 'skill',
    'types': ['range'],
    'materials': ['energy', 'eye', 'ember', 'converter']
  },
  'shambling': {
    'mods': ['moveSpeed more -20', 'physDmg more 10', 'physDmg more 3 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'metal', 'razor']
  },
  'unwashed hands': {
    'mods': ['physDmg converted 25 poisDmg', 'poisDmg more 3 perLevel'],
    'slot': 'hands',
    'materials': ['finger', 'spore', 'converter']
  },
  'icy hands': {
    'mods': ['coldDmg more 3 perLevel'],
    'slot': 'hands',
    'materials': ['finger', 'ice', 'spike']
  },
  'charged hands': {
    'mods': ['lightDmg more 3 perLevel'],
    'slot': 'hands',
    'materials': ['finger', 'spark', 'spike']
  },
  'hot hands': {
    'mods': ['fireDmg more 3 perLevel'],
    'slot': 'hands',
    'materials': ['finger', 'ember', 'spike']
  },
  'indigenous toxins': {
    'mods': ['poisDmg more 10', 'poisDmg added 3 perLevel', 'poisDmg more 1 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'spore', 'spike', 'blade']
  },
  'swamp armor': {
    'mods': ['poisResist more 5 perLevel', 'poisResist more 10'],
    'slot': 'chest',
    'materials': ['heart', 'spore', 'shield']
  },
  'big': {
    'mods': ['height more 30', 'width more 30', 'vitality added 10 perLevel', 'maxHp more 2 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'blood', 'muscle', 'spike']
  },
  'colossus': {
    'mods': ['height more 200', 'width more 200', 'strength more -100', 'dexterity more -100', 'wisdom more -100', 'vitality more -50', 'cooldownTime added 999999', 'armor more 3 perLevel', 'armor gainedas 100 physThorns', 'fireResist gainedas 100 fireThorns', 'coldResist gainedas 100 coldThorns', 'lightResist gainedas 100 lightThorns', 'poisResist gainedas 100 poisThorns'],
    'slot': 'chest',
    'materials': ['heart', 'blood', 'razor', 'nightmare']
  },
  'proto-bigger': {
    'mods': ['height more 50', 'width more 50', 'lineWidth more 50']
  },
  'buff': {
    'mods': ['width more 30', 'lineWidth added 30', 'strength added 5 perLevel', 'meleeDmg more 3 perLevel', 'rangeDmg more 3 perLevel', 'vitality added 3 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'muscle', 'eye', 'spike']
  },
  'vampyric touch': {
    'mods': ['physDmg gainedas 0.3 hpLeech', 'physDmg more 2 perLevel'],
    'slot': 'hands',
    'materials': ['finger', 'metal', 'needle', 'gargoyle']
  },
  'vampyric embrace': {
    'mods': ['physDmg gainedas 0.3 hpLeech', 'physDmg more 3 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'blood', 'needle', 'gargoyle']
  },
  'soulsucker': {
    'mods': ['physDmg gainedas 0.5 manaLeech', 'physDmg more 2 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'metal', 'brain', 'needle']
  },
  'alabaster': {
    'mods': ['armor more 10 perLevel', 'armor added 100'],
    'slot': 'chest',
    'materials': ['heart', 'metal', 'shield', 'gargoyle']
  },
  'vest pockets': {
    'mods': ['speed more -15', 'speed more -0.5 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'wing', 'blade']
  },
  'precise': {
    'mods': ['speed more 20', 'physDmg more 10', 'physDmg more 3 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'metal', 'razor']
  },
  'fleece lining': {
    'mods': ['coldResist more 20', 'coldResist more 5 perLevel'],
    'slot': 'hands',
    'materials': ['finger', 'ice', 'shield']
  },
  'fur hat': {
    'mods': ['coldResist more 20', 'coldResist more 5 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'ice', 'shield']
  },
  'chinchilla lining': {
    'mods': ['coldResist more 20', 'coldResist more 5 perLevel'],
    'slot': 'legs',
    'materials': ['toe', 'ice', 'shield']
  },
  'yeti fur': {
    'mods': ['coldResist more 20', 'coldResist more 7 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'ice', 'shield']
  },
  'ice plating': {
    'mods': ['armor more 3 perLevel', 'fireResist more 3 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'ember', 'metal', 'shield']
  },
  'blue ice': {
    'mods': ['coldDmg gainedas 30 poisDmg', 'coldDmg more 3 perLevel'],
    'slot': 'skill',
    'rarity': 'rare',
    'flavor': 'I am not in danger, I am the danger.',
    'materials': ['energy', 'spore', 'converter', 'wight snow']
  },
  'refridgerator': {
    'mods': ['lightDmg converted 100 coldDmg', 'lightDmg more -30', 'lightDmg more 3 perLevel'],
    'slot': 'chest',
    'rarity': 'rare',
    'materials': ['heart', 'spark', 'converter', 'gnome']
  },
  'cycled attack': {
    'mods': ['speed gainedas 250 cooldownTime', 'speed more -0.3 perLevel'],
    'slot': 'hands',
    'rarity': 'rare',
    'flavor': 'Variety is the spice of life.',
    'materials': ['finger', 'wing', 'razor', 'wight snow']
  },
  'chilly powder': {
    'mods': ['coldDmg gainedas 30 fireDmg', 'coldDmg more 5 perLevel'],
    'slot': 'skill',
    'rarity': 'rare',
    'flavor': 'Chilly P is my signature!',
    'materials': ['energy', 'ember', 'converter', 'wight snow']
  },
  'chemistry': {
    'mods': ['fireDmg converted 100 poisDmg', 'fireDmg more 3 perLevel', 'fireResist more -50'],
    'slot': 'hands',
    'rarity': 'rare',
    'flavor': 'Science, bitch',
    'materials': ['finger', 'spore', 'converter', 'crag shard']
  },
  'shadow walker': {
    'mods': ['opacity more -20', 'dodge added 20 perLevel'],
    'slot': 'legs',
    'materials': ['toe', 'feather', 'shield']
  },
  'somnambulate': {
    'mods': ['dodge more 3 perLevel'],
    'slot': 'legs',
    'materials': ['toe', 'feather', 'shield']
  },
  'full plating': {
    'mods': ['armor added 30 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'metal', 'shield']
  },
  'hateful blade': {
    'mods': ['physDmg gainedas -0.6 hpLeech', 'physDmg more 20', 'physDmg more 5 perLevel'],
    'slot': 'weapon',
    'materials': ['handle', 'metal', 'razor', 'lichen']
  },
  'ethereal': {
    'mods': ['dodge more 4 perLevel', 'dodge added 100', 'opacity more -60'],
    'slot': 'hands',
    'materials': ['finger', 'feather', 'shield', 'business card']
  },
  'invisibility': {
    'mods': ['dodge more 3 perLevel', 'dodge added 100', 'opacity more -100'],
    'slot': 'chest',
    'materials': ['heart', 'feather', 'shield', 'nightmare']
  },
  'liquefied body': {
    'mods': ['height more -100', 'moveSpeed more -30', 'dodge more 100', 'dodge more 2 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'feather', 'shield', 'slime']
  },
  'spiked': {
    'mods': ['physThorns added 10 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'metal', 'razor', 'slime']
  },
  'pyromania': {
    'mods': ['fireDmg more 8', 'fireDmg more 5 perLevel', 'fireDmg gainedas 0.5 hpLeech', 'fireResist more -50'],
    'slot': 'head',
    'rarity': 'rare',
    'materials': ['skull', 'ember', 'needle', 'spine']
  },
  'life on hit': {
    'mods': ['hpOnHit added 1 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'blood', 'potion']
  },
  'gratifying blow': {
    'mods': ['hpOnHit added 3 perLevel', 'manaCost more 100'],
    'slot': 'skill',
    'rarity': 'rare',
    'materials': ['energy', 'blood', 'potion', 'razor']
  },
  'mana on hit': {
    'mods': ['manaOnHit added 2 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'brain', 'potion']
  },
  'mana drinker': {
    'mods': ['manaOnHit added 5 perLevel'],
    'slot': 'skill',
    'rarity': 'rare',
    'materials': ['energy', 'blood', 'potion', 'gnome']
  },
  'potion guzzler': {
    'mods': ['hpRegen more 2 perLevel'],
    'slot': 'head',
    'materials': ['slime', 'slime', 'blood']
  },
  'earth commune': {
    'mods': ['hpRegen more 2 perLevel'],
    'slot': 'legs',
    'materials': ['slime', 'slime', 'blood']
  },
  'blessed': {
    'mods': ['hpRegen more 2 perLevel'],
    'slot': 'weapon',
    'materials': ['handle', 'blood', 'potion']
  },
  'hydra blood': {
    'mods': ['maxHp more -30', 'maxHp gainedas 1 hpRegen', 'poisDmg more 3 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'blood', 'spore', 'imp head']
  },
  'faster attacks': {
    'mods': ['speed more -25', 'speed more -0.3 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'wing', 'blade']
  },
  'more physical damage': {
    'mods': ['physDmg more 20', 'physDmg more 1 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'metal', 'blade']
  },
  'longer cooldown': {
    'mods': ['cooldownTime added 100', 'cooldownTime more 3 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'wing', 'razor']
  },
  'shorter cooldown': {
    'mods': ['cooldownTime more -1 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'wing', 'spike']
  },
  'faster propogation': {
    'mods': ['aoeSpeed more 2 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'energy', 'energy', 'spike']
  },
  'telescoping handle': {
    'mods': ['range more 1 perLevel', 'range more 50'],
    'slot': 'weapon',
    'materials': ['handle', 'eye', 'spike']
  },
  'shorter range': {
    'mods': ['range more -5 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'eye', 'razor']
  },
  'ab shocker belt': {
    'mods': ['vitality added 20 perLevel', 'strength more 1 perLevel', 'lightResist more -20'],
    'slot': 'chest',
    'materials': ['heart', 'blood', 'muscle', 'razor']
  },
  'bloodfingers': {
    'mods': ['vitality added 10 perLevel'],
    'slot': 'hands',
    'materials': ['finger', 'blood', 'blade']
  },
  'stimpack': {
    'mods': ['hpRegen more 2 perLevel'],
    'slot': 'hands',
    'materials': ['finger', 'blood', 'spike', 'nightmare']
  },
  'tinfoil hat': {
    'mods': ['lightDmg gainedas 0.5 hpLeech', 'manaRegen more 5 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'blood', 'spike', 'nightmare']
  },
  'manafingers': {
    'mods': ['maxMana added 10 perLevel', 'spellDmg more 0.5 perLevel'],
    'slot': 'hands',
    'materials': ['finger', 'brain', 'blade']
  },
  'bloodbath': {
    'mods': ['maxHp more 3 perLevel', 'vitality added 2 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'blood', 'spike']
  },
  'side arm': {
    'mods': ['cooldownTime added 250', 'speed more -50', 'speed more -0.3 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'wing', 'spike', 'razor']
  },
  'practiced': {
    'mods': ['physDmg more 15', 'speed more -20', 'speed more -0.1 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'metal', 'wing', 'spike']
  },
  'honed': {
    'mods': ['physDmg more 1 perLevel', 'speed more -0.2 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'metal', 'spike']
  },
  'fatal blow': {
    'mods': ['meleeDmg more 1 perLevel', 'meleeDmg more 100', 'cooldownTime added 1000'],
    'slot': 'skill',
    'materials': ['energy', 'muscle', 'razor', 'gargoyle']
  },
  'finishing move': {
    'mods': ['meleeDmg more 200', 'cooldownTime added 500', 'speed more 50', 'speed more -1 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'muscle', 'razor']
  },
  'long reach': {
    'mods': ['range more 40', 'range more 0.5 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'eye', 'spike']
  },
  'frugal': {
    'mods': ['manaCost added -1 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'brain', 'shield']
  },
  'stingy': {
    'mods': ['manaCost added -3 perLevel', 'speed more 50'],
    'slot': 'skill',
    'materials': ['energy', 'brain', 'razor']
  },
  'short sighted': {
    'mods': ['manaCost more -5 perLevel', 'range more -60'],
    'slot': 'skill',
    'materials': ['energy', 'brain', 'razor']
  },
  'divine assistance': {
    'mods': ['manaCost more -100', 'cooldownTime added 1000', 'speed more -2 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'wing', 'razor']
  },
  'micronaps': {
    'mods': ['cooldownTime more -20', 'cooldownTime more -0.5 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'wing', 'blade']
  },
  'healing charm': {
    'mods': ['manaRegen added -5 perLevel', 'hpRegen added 10 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'blood', 'potion', 'razor']
  },
  'blood pact': {
    'mods': ['manaRegen added 10 perLevel', 'hpRegen added -5 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'brain', 'potion', 'razor']
  },
  'vengeful': {
    'mods': ['maxHp gainedas -2 hpRegen', 'meleeDmg more 30', 'meleeDmg more 1 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'muscle', 'potion', 'razor']
  },
  'painful phylactery': {
    'mods': ['maxHp gainedas -6 hpRegen', 'maxHp gainedas 2 hpOnHit', 'hpRegen more -2 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'blood', 'razor', 'lichen'],
    'flavor': 'Lich, Please!'
  },
  'deadly focus': {
    'mods': ['projCount converted 100 spellDmg', 'spellDmg more -30', 'spellDmg more 1 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'brain', 'converter', 'razor']
  },
  'undeath': {
    'mods': ['speed more 50', 'hpOnHit added 50', 'spellDmg more 1 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'brain', 'potion', 'razor']
  },
  'soul channeling': {
    'mods': ['maxHp more -50', 'spellDmg more 30', 'spellDmg more 1 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'brain', 'potion', 'razor']
  },
  'arcane thirst': {
    'mods': ['maxHp more -25', 'maxMana gainedas 5 hpOnHit', 'maxMana more 1 perLevel'],
    'slot': 'hands',
    'materials': ['finger', 'brain', 'potion', 'razor']
  },
  'jet pack': {
    'mods': ['moveSpeed more 50', 'moveSpeed more 4 perLevel', 'dodge more -50', 'armor more -50'],
    'slot': 'chest',
    'flavor': 'Burning out his fuse up here alone',
    'materials': ['heart', 'wing', 'razor']
  },
  'cold blooded': {
    'mods': ['coldDmg more 30', 'fireDmg more -30', 'coldResist more 20', 'fireResist more -20', 'coldResist more 2 perLevel', 'coldDmg more 3 perLevel'],
    'slot': 'chest',
    'flavor': 'Ice-water in his veins...',
    'materials': ['heart', 'ice', 'spike', 'razor']
  },
  'hot blooded': {
    'mods': ['coldDmg more -30', 'fireDmg more 30', 'coldResist more -20', 'fireResist more 20', 'fireResist more 2 perLevel', 'fireDmg more 3 perLevel'],
    'slot': 'chest',
    'flavor': 'Magma in his veins...',
    'materials': ['heart', 'ember', 'spike', 'razor']
  },
  'semi automatic': {
    'mods': ['cooldownTime more -20', 'cooldownTime more -1 perLevel'],
    'slot': 'weapon',
    'flavor': 'NOW I HAVE A MACHINE GUN HO-HO-HO',
    'materials': ['handle', 'wing', 'spike']
  },
  'careful aim': {
    'mods': ['physDmg more 50', 'cooldownTime added 3000', 'physDmg more 2 perLevel', 'accuracy more 100', 'manaCost more 100'],
    'slot': 'skill',
    'flavor': 'Ready... Aim... FIRE!',
    'materials': ['energy', 'metal', 'razor']
  },
  'conductive suit': {
    'mods': ['lightDmg more 20', 'lightResist more 5 perLevel', 'lightDmg more 2 perLevel'],
    'slot': 'chest',
    'flavor': 'Fortunately the path of least resistance is no longer through your heart.',
    'materials': ['heart', 'spark', 'spike', 'shield']
  },
  'mageheart': {
    'mods': ['spellDmg more 30', 'spellDmg more 3 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'brain', 'spike']
  },
  'antibiotics': {
    'mods': ['poisResist more 20', 'poisResist more 5 perLevel'],
    'slot': 'hands',
    'materials': ['finger', 'spore', 'shield']
  },
  'forest spirit': {
    'mods': ['maxHp gainedas 0.5 hpRegen', 'maxHp more 1 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'blood', 'potion', 'spike']
  },
  'armor plating': {
    'mods': ['armor added 10 perLevel', 'armor more 2 perLevel'],
    'slot': 'hands',
    'materials': ['finger', 'metal', 'shield']
  },
  'mind expansion': {
    'mods': ['wisdom more 1 perLevel', 'wisdom gainedas 100 maxMana'],
    'slot': 'head',
    'materials': ['skull', 'brain', 'brain', 'spike']

  },
  'concentration': {
    'mods': ['angle more -50', 'speed more 35', 'wisdom added 30', 'wisdom added 3 perLevel'],
    'slot': 'hands',
    'materials': ['finger', 'brain', 'blade', 'gnome']
  },
  'unwavering': {
    'mods': ['dexterity converted 100 accuracy', 'accuracy more 1000', 'accuracy more 5 perLevel'],
    'slot': 'legs',
    'materials': ['toe', 'eye', 'razor', 'elf ear']
  },
  'clarity': {
    'mods': ['wisdom converted 30 accuracy', 'wisdom more 1 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'brain', 'converter', 'gnome']
  },
  'deathwish': {
    'mods': ['eleResistAll more -90', 'eleResistAll more -2 perLevel', 'spellDmg more 10 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'brain', 'razor', 'lichen']
  },
  'capacitor': {
    'mods': ['cooldownTime gainedas 100 lightDmg', 'lightDmg more 1 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'wing', 'converter', 'spark']
  },
  'ice breath': {
    'mods': ['wisdom converted 30 coldDmg', 'wisdom more 1 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'brain', 'converter', 'ice']
  },
  'well grounded': {
    'mods': ['wisdom gainedas 30 lightDmg', 'wisdom more 1 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'brain', 'converter', 'spark']
  },
  'roller skates': {
    'mods': ['moveSpeed more 2 perLevel'],
    'slot': 'legs',
    'materials': ['toe', 'wing', 'spike']
  },
  'prismatic toe ring': {
    'mods': ['eleResistAll added 100', 'eleResistAll added 5 perLevel'],
    'slot': 'legs',
    'materials': ['toe', 'brain', 'shield']
  },
  'hobbit foot': {
    'mods': ['maxHp more 10', 'maxHp more 1 perLevel'],
    'slot': 'legs',
    'materials': ['toe', 'blood', 'spike']
  },
  'clown shoes': {
    'mods': ['vitality added 10 perLevel', 'maxHp more 1 perLevel', 'moveSpeed more -30'],
    'slot': 'legs',
    'materials': ['toe', 'blood', 'razor']
  },
  'happy feet': {
    'mods': ['vitality added 10 perLevel', 'maxHp more 20'],
    'slot': 'legs',
    'materials': ['toe', 'blood', 'spike', 'blade']
  },
  'ice spikes': {
    'mods': ['coldResist more 10', 'coldResist more 5 perLevel', 'coldDmg added 3 perLevel'],
    'slot': 'legs',
    'materials': ['toe', 'spike', 'ice', 'shield']
  },
  'extreme odor': {
    'mods': ['poisDmg more 30', 'poisDmg more 3 perLevel'],
    'slot': 'legs',
    'materials': ['toe', 'spore', 'spike']
  },
  'firewalker': {
    'mods': ['fireDmg more 30', 'fireDmg more 3 perLevel'],
    'slot': 'legs',
    'materials': ['toe', 'ember', 'spike']
  },
  'static socks': {
    'mods': ['lightDmg more 30', 'lightDmg more 3 perLevel'],
    'slot': 'legs',
    'materials': ['toe', 'spark', 'spike']
  },
  'knee pads': {
    'mods': ['armor more 10', 'armor more 0.5 perLevel'],
    'slot': 'legs',
    'materials': ['toe', 'metal', 'shield']
  },
  'hazmat boots': {
    'mods': ['eleResistAll more 5 perLevel'],
    'slot': 'legs',
    'materials': ['toe', 'brain', 'shield']
  },
  'rubber boots': {
    'mods': ['lightResist more 10', 'lightResist more 5 perLevel'],
    'slot': 'legs',
    'materials': ['toe', 'spark', 'shield']
  },
  'good circulation': {
    'mods': ['maxHp more 20', 'vitality added 5 perLevel'],
    'slot': 'legs',
    'materials': ['toe', 'blood', 'spike', 'blade']
  },
  'reduced radius': {
    'mods': ['aoeRadius more -50', 'speed more -10', 'speed more -0.1 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'brain', 'wing', 'razor']
  },
  'increased radius': {
    'mods': ['aoeRadius more 50', 'aoeRadius more 1 perLevel', 'manaCost more 100'],
    'slot': 'skill',
    'materials': ['energy', 'brain', 'wing', 'razor']
  },
  'potion holster': {
    'mods': ['vitality more 2 perLevel', 'vitality more 20'],
    'slot': 'hands',
    'materials': ['finger', 'blood', 'blade']
  },
  'liquefied brain': {
    'mods': ['maxMana more -100', 'wisdom gainedas 60 vitality', 'vitality more 2 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'slime', 'slime', 'slime', 'slime', 'slime']
  },
  'flame ritual': {
    'mods': ['fireDmg gainedas 0.75 hpLeech', 'fireDmg more 1 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'ember', 'needle']
  },
  'frost ritual': {
    'mods': ['coldDmg gainedas 0.75 hpLeech', 'coldDmg more 1 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'ice', 'needle']
  },
  'shock ritual': {
    'mods': ['lightDmg gainedas 0.75 hpLeech', 'lightDmg more 1 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'spark', 'needle']
  },
  'plague ritual': {
    'mods': ['poisDmg gainedas 0.75 hpLeech', 'poisDmg more 1 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'spore', 'needle']
  },
  'pyropotency': {
    'mods': ['fireDmg more 25', 'fireDmg more 1 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'ember', 'spike']
  },
  'frigopotency': {
    'mods': ['coldDmg more 25', 'coldDmg more 1 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'ice', 'spike']
  },
  'electropotency': {
    'mods': ['lightDmg more 25', 'lightDmg more 1 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'spark', 'spike']
  },
  'toxopotency': {
    'mods': ['poisDmg more 25', 'poisDmg more 1 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'spore', 'spike']
  },
  'sure footing': {
    'mods': ['accuracy more 3 perLevel'],
    'slot': 'legs',
    'materials': ['toe', 'feather', 'spike']
  },
  'steady hands': {
    'mods': ['accuracy more 3 perLevel'],
    'slot': 'hands',
    'materials': ['finger', 'feather', 'spike']
  },
  'imaginary': {
    'mods': ['dodge more 3 perLevel'],
    'slot': 'weapon',
    'materials': ['handle', 'feather', 'spike', 'nightmare']
  },
  'planet buster': {
    'mods': ['projRadius more 200', 'spellDmg more 100', 'spellDmg more 5 perLevel', 'cooldownTime added 3000', 'manaCost more 100'],
    'slot': 'skill',
    'materials': ['energy', 'brain', 'spike', 'wight snow']
  },
  'nanotube reinforcement': {
    'mods': ['armor more 5 perLevel'],
    'slot': 'weapon',
    'materials': ['handle', 'metal', 'shield']
  },
  'pinpoint precision': {
    'mods': ['accuracy more 1 perLevel', 'rangeDmg more 20'],
    'slot': 'weapon',
    'materials': ['handle', 'feather', 'eye', 'elf ear']
  },
  'fletching': {
    'mods': ['rangeDmg more 3 perLevel'],
    'slot': 'weapon',
    'materials': ['handle', 'feather', 'eye', 'sigil']
  },
  'strafing': {
    'mods': ['projCount added 2', 'accuracy more -30', 'speed more -30', 'rangeDmg more -30', 'rangeDmg more 3 perLevel'],
    'slot': 'weapon',
    'materials': ['handle', 'feather', 'eye', 'spike']
  },
  'swift hands': {
    'mods': ['speed more -14.6', 'speed more -0.4 perLevel'],
    'slot': 'hands',
    'materials': ['finger', 'feather', 'eye', 'spike']
  },
  'war horse': {
    'mods': ['moveSpeed more 0.2 perLevel', 'meleeDmg more 2 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'muscle', 'spike', 'sigil']
  },
  'swashbuckling': {
    'mods': ['strength more 1 perLevel', 'dexterity more 1 perLevel'],
    'slot': 'weapon',
    'materials': ['handle', 'muscle', 'eye', 'spike']
  },
  'soft weapons': {
    'mods': ['dexterity more 2 perLevel'],
    'slot': 'weapon',
    'materials': ['handle', 'eye', 'spike', 'sigil']
  },
  'demonic split': {
    'mods': ['speed more 666', 'spellDmg more -66', 'projCount added 6', 'cooldownTime more -0.6 perLevel'],
    'slot': 'weapon',
    'materials': ['handle', 'brain', 'feather', 'sigil']
  },

  'minimum tolerances': {
    'mods': ['accuracy more 1.5 perLevel', 'accuracy more 20'],
    'slot': 'weapon',
    'materials': ['handle', 'feather', 'spike']
  },
  'hazmat suit': {
    'mods': ['eleResistAll more 5 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'brain', 'shield']
  },
  'hazmat gloves': {
    'mods': ['eleResistAll more 5 perLevel'],
    'slot': 'hands',
    'materials': ['finger', 'brain', 'shield']
  },
  'hazmat mask': {
    'mods': ['eleResistAll more 5 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'brain', 'shield']
  },
  'face training': {
    'mods': ['strength more 5 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'muscle', 'spike']
  },
  'cosmic channeling': {
    'mods': ['spellDmg more 50', 'rangeDmg more 50', 'meleeDmg more 50', 'cooldownTime added 2000', 'aoeSpeed more -50', 'aoeRadius more 5 perLevel', 'aoeSpeed more 1 perLevel'],
    'slot': 'skill',
    'materials': ['muscle', 'eye', 'brain', 'razor']
  },
  'electricians gloves': {
    'mods': ['lightResist more 6 perLevel'],
    'slot': 'hands',
    'materials': ['finger', 'spark', 'shield']
  },
  'basket hilt': {
    'mods': ['armor more 5 perLevel'],
    'slot': 'weapon',
    'materials': ['handle', 'metal', 'shield']
  },
  'accurate': {
    'mods': ['accuracy more 50', 'accuracy more 1 perLevel'],
    'slot': 'skill',
    'materials': ['energy', 'feather', 'spike']
  },
  'balanced': {
    'mods': ['dexterity more 1.5 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'eye', 'spike', 'feather']
  },
  'grabby arm': {
    'mods': ['range more 0.5 perLevel', 'range more 30'],
    'slot': 'hands',
    'materials': ['finger', 'eye', 'spike']
  },
  'bushido': {
    'mods': ['meleeDmg more 0.5 perLevel', 'armor more 0.5 perLevel', 'dodge more 0.5 perLevel', 'eleResistAll more 1 perLevel'],
    'slot': 'head',
    'materials': ['muscle', 'brain', 'eye', 'shield']
  },
  'jovial': {
    'mods': ['lineWidth added 60', 'maxHp more 30', 'maxHp more 0.75 perLevel', 'moveSpeed more -30'],
    'slot': 'head',
    'materials': ['skull', 'blood', 'spike', 'razor']
  },
  'proto-slime': {
    'mods': ['manaCost more -100', 'lineWidth added 500', 'height more -50', 'maxHp gainedas 20 hpLeech']
  },
  'proto-corpse': {
    'mods': ['moveSpeed more -100']
  },
  'impenetrable': {
    'mods': ['dodge more -50', 'armor more 50', 'armor more 1 perLevel'],
    'slot': 'chest',
    'materials': ['heart', 'metal', 'shield', 'razor']
  },
  'meditation': {
    'mods': ['eleResistAll more 10', 'eleResistAll more 1 perLevel', 'maxHp gainedas 0.5 hpRegen'],
    'slot': 'head',
    'materials': ['skull', 'brain', 'blood', 'potion']
  },
  'more balls': {
    'mods': ['projCount added 2', 'projRadius more 100', 'projRadius more 2.5 perLevel'],
    'slot': 'legs',
    'materials': ['toe', 'eye', 'blade', 'business card']
  },
  'ninja stance': {
    'mods': ['dexterity gainedas 0.2 moveSpeed', 'dexterity more 1 perLevel', 'range more -35', 'cooldownTime added 25'],
    'slot': 'legs',
    'materials': ['toe', 'eye', 'wing', 'razor']
  },
  'smart footing': {
    'mods': ['wisdom gainedas 0.1 moveSpeed', 'wisdom more 1 perLevel', 'speed more 25'],
    'slot': 'legs',
    'materials': ['toe', 'brain', 'wing', 'razor']
  },
  'momentum': {
    'mods': ['moveSpeed gainedas 100 projSpeed', 'projSpeed more 1 perLevel'],
    'slot': 'legs',
    'materials': ['toe', 'eye', 'wing', 'spike']
  },
  'overdraw': {
    'mods': ['projSpeed more 1 perLevel'],
    'slot': 'weapon',
    'materials': ['handle', 'wing', 'spike']
  },
  'eagle eye': {
    'mods': ['accuracy more 30', 'accuracy more 1 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'feather', 'spike']
  },
  'quick reaction': {
    'mods': ['dodge more 30', 'dodge more 1 perLevel'],
    'slot': 'head',
    'materials': ['skull', 'feather', 'shield']
  },
  'titan\'s grip': {
    'mods': ['strength added 10 perLevel'],
    'slot': 'hands',
    'materials': ['finger', 'muscle', 'blade', 'slime'],
    'designCredit': 'Virakai'
  }
};


},{}],15:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.monster = undefined;

var _colors = require('./colors');

var colors = _interopRequireWildcard(_colors);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var monster = exports.monster = {
  'skeleton': {
    'items': [['weapon', 'cardboard sword'], ['armor', 'balsa helmet'], ['armor', 't-shirt'], ['armor', 'jeans'], ['armor', 'latex gloves']],
    'skills': ['basic melee'],
    'sourceCards': [['proto-skeleton', 0], ['breadhat', 1], ['bloodbath', 1]],
    'color': colors.cbone
  },
  'fire skeleton': {
    'items': [['weapon', 'cardboard sword'], ['armor', 'balsa helmet'], ['armor', 't-shirt'], ['armor', 'jeans'], ['armor', 'latex gloves']],
    'skills': ['lethal strike', 'fire slash', 'super smash', 'basic melee'],
    'sourceCards': [['hot sword', 1], ['proto-skeleton', 0], ['six pack', 1], ['compression shorts', 1], ['asbestos lining', 1], ['basket hilt', 1]],
    'color': colors.cfire
  },
  'skeleton archer': {
    'items': [['weapon', 'wooden bow'], ['armor', 't-shirt'], ['armor', 'latex gloves'], ['armor', 'balsa helmet'], ['armor', 'jeans']],
    'skills': ['speed shot', 'basic range'],
    'sourceCards': [['proto-skeleton', 0], ['head of vigor', 1], ['bloodfingers', 1], ['mana on hit', 1], ['sharpened', 1]],
    'color': colors.cbone,
    'moveAngle': 45
  },
  'skeleton mage': {
    'items': [['weapon', 'simple wand'], ['armor', 'velvet tunic'], ['armor', 'mage hat'], ['armor', 'mage boots'], ['armor', 'mage gloves']],
    'skills': ['fire ball', 'basic spell'],
    'sourceCards': [['proto-skeleton', 0], ['brain juice', 1], ['heart juice', 1], ['life on hit', 1]],
    'color': colors.cbone
  },
  'skeleton warmage': {
    'items': [['weapon', 'demon wand'], ['armor', 'war robe'], ['armor', 'mage hat'], ['armor', 'mage boots'], ['armor', 'mage gloves']],
    'skills': ['shadow dagger', 'fire ball'],
    'sourceCards': [['big', 1], ['buff', 1], ['proto-skeleton', 0], ['brain juice', 1], ['heart juice', 1], ['life on hit', 1], ['long reach', 1], ['deadly focus', 1], ['telescoping handle', 1], ['more projectiles', 1], ['mageheart', 1]],
    'color': colors.cbone,
    'minLevel': 200,
    'moveAngle': 75
  },
  'skeleton champion': {
    'items': [['weapon', 'winged axe'], ['armor', 'elegant plate'], ['armor', 'crusader helm'], ['armor', 'buckaneer boots'], ['armor', 'polished gauntlets']],
    'skills': ['lethal strike', 'fire slash', 'quick hit'],
    'sourceCards': [['big', 1], ['buff', 1], ['ninja stance', 1], ['proto-skeleton', 0], ['alabaster', 1], ['riveted', 1], ['clockwork', 1], ['clawed', 1], ['balanced', 1], ['faster attacks', 1], ['long reach', 1], ['telescoping handle', 1]],
    'color': colors.cbone,
    'minLevel': 200,
    'moveAngle': -30
  },
  'skeleton highlord': {
    'items': [['weapon', 'winged axe'], ['armor', 'elegant plate'], ['armor', 'crusader helm'], ['armor', 'buckaneer boots'], ['armor', 'polished gauntlets']],
    'skills': ['lethal strike', 'fire slash', 'quick hit'],
    'sourceCards': [['big', 1], ['buff', 1], ['ninja stance', 1], ['proto-skeleton', 0], ['alabaster', 1], ['riveted', 1], ['clockwork', 1], ['clawed', 1], ['balanced', 1], ['faster attacks', 1], ['long reach', 1], ['telescoping handle', 1], ['stinging', 1], ['armor plating', 1], ['knee pads', 1], ['breadhat', 1]],
    'color': colors.cbone,
    'minLevel': 500,
    'moveAngle': -30
  },
  'skeleton pyromage': {
    'items': [['weapon', 'dragonstone wand'], ['armor', 'velvet tunic'], ['armor', 'mage hat'], ['armor', 'mage boots'], ['armor', 'mage gloves']],
    'skills': ['incinerate', 'fire ball', 'basic spell'],
    'sourceCards': [['proto-skeleton', 0], ['life on hit', 2], ['mana on hit', 2], ['pyromania', 1], ['ignited', 1], ['pyropotency', 1], ['armor plating', 1], ['knee pads', 1], ['breadhat', 1], ['riveted', 1], ['clockwork', 1], ['clawed', 1]],
    'rarity': 'rare',
    'color': colors.cbone,
    'moveAngle': -30,
    'minLevel': 400
  },
  'skeleton embermage': {
    'items': [['weapon', 'simple wand'], ['armor', 'velvet tunic'], ['armor', 'mage hat'], ['armor', 'mage boots'], ['armor', 'mage gloves']],
    'skills': ['incinerate', 'fire ball', 'basic spell'],
    'sourceCards': [['proto-skeleton', 0], ['life on hit', 2], ['mana on hit', 2], ['pyromania', 1]],
    'rarity': 'rare',
    'color': colors.cbone,
    'moveAngle': -30
  },
  'skeleton king': {
    'items': [['weapon', 'hand axe'], ['armor', 'collander'], ['armor', 'leatherscale armor'], ['armor', 'gardening gloves'], ['armor', 'leather boots']],
    'skills': ['lethal strike', 'super smash', 'basic melee'],
    'sourceCards': [['proto-skeleton', 1], ['proto-boss', 1], ['hot sword', 3], ['sharpened', 1], ['precise', 1], ['life on hit', 4], ['telescoping handle', 2], ['stinging', 4]],
    'color': colors.cbone
  },
  'wood nymph': {
    'items': [['weapon', 'cardboard sword'], ['armor', 'scout leather'], ['armor', 'balsa helmet'], ['armor', 'latex gloves'], ['armor', 'leather boots']],
    'skills': ['basic melee'],
    'sourceCards': [['small stature', 1], ['compression shorts', 1], ['life on hit', 2], ['hobbit foot', 1], ['accurate', 1], ['stinging', 1]],
    'color': colors.cplant
  },
  'bat': {
    'items': [['weapon', 'cardboard sword'], ['armor', 'batsuit'], ['armor', 'latex gloves'], ['armor', 'leather boots'], ['armor', 'balsa helmet']],
    'skills': ['quick hit', 'basic melee'],
    'sourceCards': [['proto-bat', 1], ['nimble', 1], ['bloodsucker', 1], ['life on hit', 1], ['clawed', 1], ['simple minded', 1], ['good circulation', 1]],
    'color': colors.cblack
  },
  'ent': {
    'items': [['weapon', 'cardboard sword'], ['armor', 'conquistador helm'], ['armor', 'leatherplate armor'], ['armor', 'arcane boots'], ['armor', 'gardening gloves']],
    'skills': ['super smash', 'basic melee'],
    'sourceCards': [['strong back', 2], ['thwomping', 2], ['precise', 1], ['accurate', 1], ['forest spirit', 1], ['hobbit foot', 1], ['sharpened', 1]],
    'color': colors.cplant,
    'moveAngle': -10
  },
  'elf': {
    'items': [['weapon', 'elf bow'], ['armor', 't-shirt'], ['armor', 'elf boots'], ['armor', 'leather gloves'], ['armor', 'dodgers cap']],
    'skills': ['poison arrow', 'speed shot', 'basic range'],
    'sourceCards': [['dexterous hands', 1], ['balanced', 1], ['accurate', 1], ['nimble', 1], ['steady hands', 1], ['pinpoint precision', 1]],
    'rarity': 'rare',
    'color': colors.celf,
    'moveAngle': 70
  },
  'elf marksman': {
    'items': [['weapon', 'elf bow'], ['armor', 't-shirt'], ['armor', 'elf boots'], ['armor', 'leather gloves'], ['armor', 'dodgers cap']],
    'skills': ['poison arrow', 'speed shot', 'basic range'],
    'sourceCards': [['dexterous hands', 1], ['balanced', 1], ['accurate', 1], ['nimble', 1], ['steady hands', 1], ['pinpoint precision', 1], ['unwavering', 1]],
    'rarity': 'rare',
    'color': colors.celf,
    'moveAngle': 70,
    'minLevel': 200
  },
  'elf king': {
    'items': [['weapon', 'composite bow'], ['armor', 'scout leather'], ['armor', 'elf boots'], ['armor', 'dodgers cap'], ['armor', 'goldenscale gauntlets']],
    'skills': ['deadly volley', 'poison arrow', 'speed shot'],
    'sourceCards': [['proto-boss', 0], ['dexterous hands', 2], ['bloodsucker', 1], ['balanced', 1], ['accurate', 1], ['sure footing', 1], ['steady hands', 1], ['pinpoint precision', 1], ['steam powered', 1], ['sharpened', 1], ['precise', 1]],
    'flavor': "He knows you've been naughty",
    'color': colors.celf
  },
  'dummy': { 'items': [], 'skills': [], 'sourceCards': [['dummy', 0]] },
  'fire golem': {
    'items': [['weapon', 'long sword'], ['armor', 'gladiator helm'], ['armor', 'leatherscale armor'], ['armor', 'handmail'], ['armor', 'arcane boots']],
    'skills': ['blazing inferno', 'ground smash', 'fire slash'],
    'sourceCards': [['heart of granite', 1], ['ignited', 1], ['flame ritual', 1], ['pyropotency', 1], ['hot blooded', 1], ['pyromania', 1], ['hot sword', 1], ['alabaster', 1], ['ignited', 1], ['goblin toe', 1], ['minimum tolerances', 1], ['sharpened', 1], ['stinging', 1], ['momentum', 1]],
    'rarity': 'rare',
    'color': colors.cfire
  },
  'ice golem': {
    'items': [['weapon', 'long sword'], ['armor', 'gladiator helm'], ['armor', 'leatherscale armor'], ['armor', 'handmail'], ['armor', 'arcane boots']],
    'skills': ['ice slash', 'basic melee'],
    'sourceCards': [['heart of granite', 1], ['frosted', 1], ['frost ritual', 1]],
    'rarity': 'rare',
    'color': colors.ccold
  },
  'shock golem': {
    'items': [['weapon', 'long sword'], ['armor', 'gladiator helm'], ['armor', 'leatherscale armor'], ['armor', 'handmail'], ['armor', 'arcane boots']],
    'skills': ['thunderstorm', 'lightning slash', 'basic melee'],
    'sourceCards': [['heart of granite', 1], ['shock ritual', 1], ['electropotency', 1], ['charged hands', 1], ['conductive suit', 1], ['static socks', 1], ['tinfoil hat', 1]],
    'rarity': 'rare',
    'color': colors.clight
  },
  'toxic golem': {
    'items': [['weapon', 'long sword'], ['armor', 'gladiator helm'], ['armor', 'leatherscale armor'], ['armor', 'handmail'], ['armor', 'arcane boots']],
    'skills': ['plague field', 'poison spray', 'poison nova'],
    'sourceCards': [['heart of granite', 1], ['festering', 1], ['plague ritual', 1], ['putrefied', 1], ['cosmic channeling', 1], ['increased radius', 1], ['hazmat suit', 1], ['hazmat gloves', 1], ['hazmat mask', 1], ['semi automatic', 1], ['healing charm', 1], ['blood pact', 1], ['faster propogation', 1], ['extreme odor', 1]],
    'rarity': 'rare',
    'color': colors.cpois
  },
  'gnome': {
    'items': [['weapon', 'falchion'], ['armor', 'gladiator helm'], ['armor', 'leatherscale armor'], ['armor', 'handmail'], ['armor', 'arcane boots']],
    'skills': ['lightning slash', 'quick hit', 'chain lightning', 'basic melee'],
    'sourceCards': [['small stature', 1], ['keen wit', 1], ['conductive suit', 1], ['shock ritual', 1], ['enchant weapon', 1], ['static socks', 1]],
    'color': colors.cgnome
  },
  'gnome electrician': {
    'items': [['weapon', 'simple wand'], ['armor', 'velvet tunic'], ['armor', 'gladiator helm'], ['armor', 'handmail'], ['armor', 'arcane boots']],
    'skills': ['lightning ball', 'nova', 'basic spell'],
    'sourceCards': [['small stature', 1], ['keen wit', 1], ['electrified', 1], ['healing charm', 3], ['blood pact', 3], ['conductive suit', 1], ['shock ritual', 1], ['rubber boots', 1], ['electricians gloves', 1], ['enchant weapon', 1]],
    'rarity': 'rare',
    'color': colors.cgnome,
    'moveAngle': 60
  },
  'gnome chuck testa': {
    'items': [['weapon', 'simple wand'], ['armor', 'velvet tunic'], ['armor', 'gladiator helm'], ['armor', 'handmail'], ['armor', 'arcane boots']],
    'skills': ['lightning ball', 'nova', 'basic spell'],
    'sourceCards': [['small stature', 1], ['keen wit', 1], ['electrified', 1], ['healing charm', 3], ['blood pact', 3], ['conductive suit', 1], ['shock ritual', 1], ['rubber boots', 1], ['electricians gloves', 1], ['enchant weapon', 1], ['well grounded', 1], ['capacitor', 1]],
    'rarity': 'rare',
    'color': colors.cgnome,
    'moveAngle': 60,
    'minLevel': 500
  },
  'roflcopter': {
    'items': [['weapon', 'hand axe'], ['armor', 'gladiator helm'], ['armor', 'leatherscale armor'], ['armor', 'handmail'], ['armor', 'arcane boots']],
    'skills': ['pressure wave', 'quick hit', 'basic melee'],
    'sourceCards': [['flying', 1], ['nimble', 1], ['proto-rofl', 1], ['clown shoes', 1], ['happy feet', 1], ['possessed weapon', 1], ['faster propogation', 1]],
    'color': colors.PHYS_COLOR,
    'moveAngle': 65
  },
  'harpy': {
    'items': [['weapon', 'winged axe'], ['armor', 'crusader helm'], ['armor', 'winged leather'], ['armor', 'handmail'], ['armor', 'arcane boots']],
    'skills': ['pressure wave', 'quick hit', 'basic melee'],
    'sourceCards': [['flying', 1], ['nimble', 1], ['clawed', 1], ['eagle eye', 1], ['quick reaction', 1]],
    'color': colors.cbrown,
    'moveAngle': -25
  },
  'mechcinerator': {
    'items': [['weapon', 'pewter wand'], ['armor', 'gladiator helm'], ['armor', 'leatherscale armor'], ['armor', 'handmail'], ['armor', 'arcane boots']],
    'skills': ['incinerate', 'fire nova', 'basic spell'],
    'sourceCards': [['mobility', 1], ['riveted', 1], ['clockwork', 1], ['mecha heart', 1], ['ignited', 1], ['steam powered', 1], ['jet pack', 1], ['flame ritual', 1], ['nanotube reinforcement', 1], ['minimum tolerances', 1], ['blazing', 1], ['hot hands', 1], ['firewalker', 1]],
    'rarity': 'rare',
    'color': colors.PHYS_COLOR,
    'moveAngle': -65
  },
  'mechfridgerator': {
    'items': [['weapon', 'pewter wand'], ['armor', 'gladiator helm'], ['armor', 'leatherscale armor'], ['armor', 'handmail'], ['armor', 'arcane boots']],
    'skills': ['ice blast', 'ice nova', 'basic spell'],
    'sourceCards': [['refridgerator', 1], ['mobility', 1], ['riveted', 1], ['clockwork', 1], ['mecha heart', 1], ['frosted', 1], ['steam powered', 1], ['frost ritual', 1], ['nanotube reinforcement', 1], ['minimum tolerances', 1], ['iced', 1], ['icy hands', 1]],
    'rarity': 'rare',
    'color': colors.PHYS_COLOR,
    'moveAngle': -65
  },
  'mecha watt': {
    'items': [['weapon', 'pewter wand'], ['armor', 'gladiator helm'], ['armor', 'leatherscale armor'], ['armor', 'handmail'], ['armor', 'arcane boots']],
    'skills': ['lightning ball', 'nova', 'basic spell'],
    'sourceCards': [['mobility', 1], ['riveted', 1], ['clockwork', 1], ['mecha heart', 1], ['charged', 1], ['steam powered', 1], ['conductive suit', 1], ['shock ritual', 1], ['nanotube reinforcement', 1], ['minimum tolerances', 1], ['static socks', 1], ['charged hands', 1]],
    'rarity': 'rare',
    'color': colors.PHYS_COLOR,
    'moveAngle': 65
  },
  'mecha tank': {
    'items': [['weapon', 'pewter wand'], ['armor', 'gladiator helm'], ['armor', 'leatherscale armor'], ['armor', 'handmail'], ['armor', 'arcane boots']],
    'skills': ['lightning ball', 'nova'],
    'sourceCards': [['mobility', 1], ['riveted', 1], ['clockwork', 1], ['mecha heart', 1], ['charged', 1], ['steam powered', 1], ['conductive suit', 1], ['shock ritual', 1], ['nanotube reinforcement', 1], ['minimum tolerances', 1], ['static socks', 1], ['charged hands', 1], ['proto-boss', 1], ['alabaster', 1], ['riveted', 1], ['clown shoes', 1], ['thwomping', 1], ['meditation', 1], ['forest spirit', 1], ['jovial', 1], ['good circulation', 1]],
    'rarity': 'rare',
    'color': colors.PHYS_COLOR,
    'moveAngle': 65,
    'minLevel': 250
  },
  'sir mechs-a-lot': {
    'items': [['weapon', 'long sword'], ['armor', 'gladiator helm'], ['armor', 'leatherscale armor'], ['armor', 'handmail'], ['armor', 'arcane boots']],
    'skills': ['ground smash', 'lightning ball', 'ice nova', 'basic melee'],
    'sourceCards': [['proto-boss', 1], ['riveted', 1], ['clockwork', 1], ['mecha heart', 1], ['charged', 1], ['steam powered', 4], ['frosted', 1], ['ignited', 1], ['shock ritual', 1], ['roller skates', 1], ['nanotube reinforcement', 1], ['minimum tolerances', 1]],
    'color': colors.PHYS_COLOR
  },
  'goblin': {
    'items': [['weapon', 'spikey mace'], ['armor', 'goblin leather'], ['armor', 'handmail'], ['armor', 'gladiator helm'], ['armor', 'buckaneer boots']],
    'skills': ['ground smash', 'flaming debris', 'basic melee'],
    'sourceCards': [['goblin toe', 1], ['berserking', 1], ['simple minded', 1], ['armor plating', 1], ['knee pads', 1], ['sopping underclothes', 1], ['quenching blade', 1], ['more physical damage', 1], ['faster attacks', 1]],
    'color': colors.cgoblin
  },
  'goblin priest': {
    'items': [['weapon', 'knobby wand'], ['armor', 'goblin leather'], ['armor', 'mage gloves'], ['armor', 'mage hat'], ['armor', 'mage boots']],
    'skills': ['fire ball', 'incinerate', 'basic spell'],
    'sourceCards': [['goblin toe', 1], ['berserking', 1], ['simple minded', 1], ['precise', 1], ['pyromania', 1], ['hot blooded', 1], ['cool shoes', 1], ['blazing', 1], ['firewalker', 1]],
    'rarity': 'rare',
    'color': colors.cgoblin,
    'moveAngle': 85
  },
  'goblin artillery': {
    'items': [['weapon', 'crossbow'], ['armor', 'goblin leather'], ['armor', 'conquistador helm'], ['armor', 'leather boots'], ['armor', 'handmail']],
    'skills': ['blast arrow', 'fire arrow', 'basic range'],
    'sourceCards': [['goblin toe', 1], ['berserking', 1], ['simple minded', 1], ['ignited', 2], ['hot blooded', 1], ['sharpened', 1], ['pinpoint precision', 1], ['faster attacks', 1], ['more physical damage', 1]],
    'color': colors.cgoblin
  },
  'goblin bombardier': {
    'items': [['weapon', 'crossbow'], ['armor', 'goblin leather'], ['armor', 'conquistador helm'], ['armor', 'leather boots'], ['armor', 'handmail']],
    'skills': ['blast arrow', 'fire arrow', 'basic range'],
    'sourceCards': [['faster detonation', 1], ['faster attacks', 1], ['goblin toe', 1], ['berserking', 1], ['simple minded', 1], ['ignited', 2], ['hot blooded', 1], ['sharpened', 1], ['pinpoint precision', 1], ['faster attacks', 1], ['more physical damage', 1]],
    'color': colors.cgoblin,
    'minLevel': 500
  },
  'goblin barbarian': {
    'items': [['weapon', 'barbarian blade'], ['armor', 'goblin leather'], ['armor', 'handmail'], ['armor', 'gladiator helm'], ['armor', 'buckaneer boots']],
    'skills': ['ground smash', 'flaming debris', 'exploding strike'],
    'sourceCards': [['big', 1], ['buff', 1], ['strong back', 1], ['face training', 1], ['goblin toe', 1], ['berserking', 1], ['armor plating', 1], ['knee pads', 1], ['sopping underclothes', 1], ['quenching blade', 1], ['hot hands', 1]],
    'minLevel': 200,
    'color': colors.cgoblin
  },
  'the inhuman torch': {
    'items': [['weapon', 'dragonstone wand'], ['armor', 'fancy gauntlets'], ['armor', 'velvet tunic'], ['armor', 'arcane boots'], ['armor', 'mage hat']],
    'skills': ['fire ball', 'incinerate', 'basic spell'],
    'sourceCards': [['ignited', 3], ['proto-boss', 1], ['pyromania', 2], ['keen wit', 3], ['brain juice', 3], ['mana on hit', 3], ['telescoping handle', 3], ['hot blooded', 1], ['flame ritual', 1], ['increased radius', 1]],
    'color': colors.cfire
  },
  'zombie': {
    'items': [['weapon', 'long sword'], ['armor', 'gladiator helm'], ['armor', 'iron chestplate'], ['armor', 'leather boots'], ['armor', 'handmail']],
    'skills': ['poison slash', 'basic melee'],
    'sourceCards': [['unwashed hands', 1], ['shambling', 1], ['simple minded', 1], ['knee pads', 1], ['hazmat boots', 1]],
    'color': colors.cplant
  },
  'angry imp': {
    'items': [['weapon', 'long sword'], ['armor', 'gladiator helm'], ['armor', 'iron chestplate'], ['armor', 'leather boots'], ['armor', 'handmail']],
    'skills': ['poison slash', 'quick hit', 'basic melee'],
    'sourceCards': [['berserking', 1], ['small stature', 1], ['simple minded', 1], ['indigenous toxins', 1], ['antibiotics', 1], ['happy feet', 1]],
    'color': colors.cimp
  },
  'dart imp': {
    'items': [['weapon', 'hand crossbow'], ['armor', 'plague doctor'], ['armor', 'iron chestplate'], ['armor', 'leather boots'], ['armor', 'handmail']],
    'skills': ['poison arrow', 'speed shot', 'basic range'],
    'sourceCards': [['berserking', 1], ['small stature', 1], ['simple minded', 1], ['indigenous toxins', 1], ['putrefied', 1], ['more projectiles', 1], ['antibiotics', 1], ['plague ritual', 1], ['overdraw', 1]],
    'color': colors.cimp,
    'moveAngle': -75
  },
  'imp shaman': {
    'items': [['weapon', 'star wand'], ['armor', 'plague doctor'], ['armor', 'iron chestplate'], ['armor', 'leather boots'], ['armor', 'handmail']],
    'skills': ['poison ball', 'poison spray', 'poison nova', 'basic spell'],
    'sourceCards': [['berserking', 1], ['small stature', 1], ['simple minded', 1], ['indigenous toxins', 1], ['antibiotics', 1], ['plague ritual', 1], ['potion holster', 1], ['increased radius', 1], ['pinpoint precision', 1]],
    'rarity': 'rare',
    'color': colors.cimp,
    'moveAngle': -75
  },
  'hydra': {
    'items': [['weapon', 'star wand'], ['armor', 'plague doctor'], ['armor', 'iron chestplate'], ['armor', 'leather boots'], ['armor', 'handmail']],
    'skills': ['poison ball', 'poison spray', 'poison nova', 'basic spell'],
    'sourceCards': [['hydra blood', 1], ['festering', 1], ['faster attacks', 1], ['berserking', 1], ['big', 1], ['buff', 1], ['simple minded', 1], ['indigenous toxins', 1], ['antibiotics', 1], ['plague ritual', 1], ['potion holster', 1], ['increased radius', 1], ['pinpoint precision', 1]],
    'rarity': 'rare',
    'color': colors.cimp,
    'moveAngle': -75,
    'minLevel': 300
  },
  'imp chieftain': {
    'items': [['weapon', 'star wand'], ['armor', 'plague doctor'], ['armor', 'iron chestplate'], ['armor', 'leather boots'], ['armor', 'handmail']],
    'skills': ['poison ball', 'poison spray', 'poison nova', 'basic spell'],
    'sourceCards': [['berserking', 1], ['small stature', 1], ['simple minded', 1], ['indigenous toxins', 1], ['antibiotics', 1], ['plague ritual', 1], ['potion holster', 1], ['increased radius', 1], ['pinpoint precision', 1], ['smart footing', 1], ['toxopotency', 1], ['faster attacks', 1], ['unwashed hands', 1]],
    'rarity': 'rare',
    'color': colors.cimp,
    'moveAngle': -75,
    'minLevel': 500
  },
  'marshwalker': {
    'items': [['weapon', 'long sword'], ['armor', 'iron chestplate'], ['armor', 'leather boots'], ['armor', 'handmail'], ['armor', 'gladiator helm']],
    'skills': ['poison slash', 'poison nova', 'basic melee'],
    'sourceCards': [['indigenous toxins', 1], ['swamp armor', 1], ['good circulation', 1], ['happy feet', 1], ['plague ritual', 1], ['hazmat boots', 1], ['potion holster', 1], ['hobbit foot', 1], ['reduced radius', 1], ['putrefied', 1], ['extreme odor', 1]],
    'color': colors.cdarkgreen,
    'moveAngle': 75
  },
  'mad ape': {
    'items': [['weapon', 'stone hammer'], ['armor', 'iron chestplate'], ['armor', 'leather boots'], ['armor', 'handmail'], ['armor', 'gladiator helm']],
    'skills': ['super smash', 'basic melee'],
    'sourceCards': [['big', 1], ['berserking', 1], ['buff', 1], ['clown shoes', 1], ['happy feet', 1], ['good circulation', 1], ['potion holster', 1]],
    'color': colors.cbrown
  },
  'scalp collector': {
    'items': [['weapon', 'compound bow'], ['armor', 'plague doctor'], ['armor', 'iron chestplate'], ['armor', 'leather boots'], ['armor', 'handmail']],
    'skills': ['headshot', 'speed shot'],
    'sourceCards': [['side arm', 1], ['indigenous toxins', 1], ['putrefied', 1], ['precise', 1], ['vest pockets', 1], ['semi automatic', 1], ['antibiotics', 1], ['bloodsucker', 1], ['plague ritual', 1], ['sharpened', 1], ['telescoping handle', 1], ['soulsucker', 1], ['potion holster', 1]],
    'color': colors.cgnome,
    'moveAngle': 135
  },
  'swamp thing': {
    'items': [['weapon', 'long sword'], ['armor', 'plague doctor'], ['armor', 'raider armor'], ['armor', 'elf boots'], ['armor', 'leather gloves']],
    'skills': ['sweep', 'throw weapon'],
    'sourceCards': [['proto-boss', 1], ['unwashed hands', 1], ['indigenous toxins', 1], ['swamp armor', 1], ['faster attacks', 1], ['festering', 1], ['good circulation', 1], ['plague ritual', 1], ['hobbit foot', 1], ['putrefied', 1], ['shorter cooldown', 1], ['micronaps', 1], ['toxopotency', 1], ['increased radius', 1], ['semi automatic', 20], ['basket hilt', 1], ['vampyric embrace', 1], ['buff', 1], ['vampyric touch', 1], ['minimum tolerances', 1], ['steady hands', 1], ['goblin toe', 1], ['shadow walker', 1], ['steam powered', 3]],
    'color': colors.cpois
  },
  'frost skeleton': {
    'items': [['weapon', 'long sword'], ['armor', 'balsa helmet'], ['armor', 'iron chestplate'], ['armor', 'buckaneer boots'], ['armor', 'handmail']],
    'skills': ['ice slash', 'basic melee'],
    'sourceCards': [['cold sword', 1], ['proto-skeleton', 0], ['six pack', 1], ['compression shorts', 1], ['fleece lining', 1], ['ice spikes', 1]],
    'color': colors.ccold
  },
  'frost mage': {
    'items': [['weapon', 'knobby wand'], ['armor', 'mage hat'], ['armor', 'embroidered silks'], ['armor', 'mage boots'], ['armor', 'mage gloves']],
    'skills': ['ice blast', 'ice nova', 'ice ball', 'basic spell'],
    'sourceCards': [['fleece lining', 1], ['frosted', 1], ['keen wit', 1], ['fur hat', 1], ['cold blooded', 1], ['frost ritual', 1]],
    'color': colors.ccold,
    'moveAngle': 45
  },
  'shiver spirit': {
    'items': [['weapon', 'knobby wand'], ['armor', 'mage hat'], ['armor', 'embroidered silks'], ['armor', 'mage boots'], ['armor', 'mage gloves']],
    'skills': ['ice ball', 'basic spell'],
    'sourceCards': [['fleece lining', 1], ['iced', 1], ['ice spikes', 1], ['icy hands', 1], ['frosted', 1], ['fur hat', 1], ['frost ritual', 1], ['planet buster', 1], ['minimum tolerances', 1]],
    'rarity': 'rare',
    'color': colors.ccold,
    'moveAngle': 135
  },
  'frozen warrior': {
    'items': [['weapon', 'long sword'], ['armor', 'gladiator helm'], ['armor', 'iron chestplate'], ['armor', 'leather boots'], ['armor', 'handmail']],
    'skills': ['ice slash', 'basic melee'],
    'sourceCards': [['fleece lining', 1], ['frosted', 1], ['chinchilla lining', 1], ['ice plating', 1], ['good circulation', 1], ['frost ritual', 1], ['sure footing', 1]],
    'color': colors.cstone,
    'moveAngle': 30
  },
  'frost goliath': {
    'items': [['weapon', 'barbarian blade'], ['armor', 'gladiator helm'], ['armor', 'iron chestplate'], ['armor', 'leather boots'], ['armor', 'handmail']],
    'skills': ['ice slash', 'basic melee'],
    'sourceCards': [['fleece lining', 1], ['frosted', 1], ['chinchilla lining', 1], ['ice plating', 1], ['good circulation', 1], ['frost ritual', 1], ['sure footing', 1], ['cold blooded', 1], ['proto-boss', 1], ['ice spikes', 1], ['side arm', 1], ['clown shoes', 1], ['clown shoes', 1], ['riveted', 1], ['alabaster', 1], ['knee pads', 1], ['thwomping', 1], ['big', 1], ['frosted', 1]],
    'color': colors.cstone,
    'moveAngle': 20,
    'minLevel': 250
  },
  'yeti': {
    'items': [['weapon', 'long sword'], ['armor', 'gladiator helm'], ['armor', 'iron chestplate'], ['armor', 'leather boots'], ['armor', 'handmail']],
    'skills': ['super smash', 'basic melee'],
    'sourceCards': [['big', 1], ['fleece lining', 1], ['frosted', 1], ['chinchilla lining', 1], ['clawed', 1], ['yeti fur', 1], ['cold blooded', 1], ['happy feet', 1], ['good circulation', 1], ['hobbit foot', 1], ['prismatic toe ring', 1]],
    'color': colors.cbone
  },
  'wight': {
    'items': [['weapon', 'delicate wand'], ['armor', 'gladiator helm'], ['armor', 'iron chestplate'], ['armor', 'leather boots'], ['armor', 'handmail']],
    'skills': ['ice blast', 'ice nova', 'ice ball', 'basic spell'],
    'sourceCards': [['fleece lining', 1], ['frosted', 1], ['fur hat', 1], ['ethereal', 1], ['shadow walker', 1], ['mind expansion', 1], ['frost ritual', 1], ['mageheart', 1], ['icy hands', 1]],
    'color': colors.cwhite,
    'moveAngle': 80
  },
  'walter wight': {
    'items': [['weapon', 'star wand'], ['armor', 'mage hat'], ['armor', 'embroidered silks'], ['armor', 'mage boots'], ['armor', 'mage gloves']],
    'skills': ['ice blast', 'ice nova', 'ice ball', 'basic spell'],
    'sourceCards': [['proto-boss', 0], ['fleece lining', 1], ['frosted', 1], ['blue ice', 3], ['fur hat', 1], ['ethereal', 1], ['shadow walker', 1], ['keen wit', 4], ['mana on hit', 3], ['frost ritual', 1], ['prismatic toe ring', 1], ['increased radius', 1], ['hazmat boots', 1], ['hazmat gloves', 1], ['hazmat suit', 1], ['hazmat mask', 1]],
    'color': colors.cwhite
  },
  'jesse blueman': {
    'items': [['weapon', 'star wand'], ['armor', 'mage hat'], ['armor', 'buckaneer boots'], ['armor', 'elegant plate'], ['armor', 'polished gauntlets']],
    'skills': ['shiverstorm', 'ice ball'],
    'sourceCards': [['proto-boss', 0], ['more balls', 1], ['fleece lining', 1], ['blue ice', 3], ['fur hat', 1], ['alabaster', 1], ['riveted', 1], ['pinpoint precision', 1], ['minimum tolerances', 1], ['semi automatic', 1], ['basket hilt', 1], ['nanotube reinforcement', 1], ['keen wit', 1], ['steam powered', 1], ['cold blooded', 1], ['pyromania', 1], ['ignited', 1], ['chilly powder', 1], ['chemistry', 1], ['plague ritual', 1], ['increased radius', 1], ['good circulation', 1], ['clown shoes', 1]],
    'rarity': 'boss',
    'minLevel': 75,
    'color': colors.cpureblue
  },
  'slagathor': {
    'items': [['weapon', 'barbarian blade'], ['armor', 'apollo helmet'], ['armor', 'polished gauntlets'], ['armor', 'elegant plate'], ['armor', 'leather boots']],
    'skills': ['fire slash', 'ice slash', 'poison slash', 'lightning slash', 'shadow dagger'],
    'sourceCards': [['proto-boss', 1], ['cycled attack', 1], ['alabaster', 1], ['riveted', 1], ['knee pads', 1], ['armor plating', 1], ['breadhat', 1], ['meditation', 1], ['basket hilt', 1], ['nanotube reinforcement', 1], ['faster attacks', 1], ['clawed', 1], ['sharpened', 1], ['stinging', 1], ['practiced', 1], ['hateful blade', 1], ['soulsucker', 1], ['goblin toe', 1], ['long reach', 1], ['side arm', 1], ['telescoping handle', 1], ['roller skates', 1]],
    'color': colors.cbone,
    'rarity': 'boss',
    'moveAngle': 45
  },
  'shadow knight': {
    'items': [['weapon', 'long sword'], ['armor', 'apollo helmet'], ['armor', 'polished gauntlets'], ['armor', 'shadow armor'], ['armor', 'buckaneer boots']],
    'skills': ['masterful strike', 'basic melee', 'shadow dagger'],
    'sourceCards': [['shadow walker', 1], ['full plating', 1], ['sharpened', 1], ['hateful blade', 1], ['quick reaction', 1], ['armor plating', 1], ['steel toed', 1], ['good circulation', 1], ['prismatic toe ring', 1], ['basket hilt', 1], ['sure footing', 1], ['steady hands', 1]],
    'rarity': 'rare',
    'color': colors.cblack,
    'moveAngle': 0
  },
  'death knight': {
    'items': [['weapon', 'long sword'], ['armor', 'apollo helmet'], ['armor', 'polished gauntlets'], ['armor', 'shadow armor'], ['armor', 'buckaneer boots']],
    'skills': ['masterful strike', 'basic melee', 'shadow dagger'],
    'sourceCards': [['proto-boss', 1], ['ninja stance', 1], ['balanced', 1], ['shadow walker', 1], ['full plating', 1], ['hateful blade', 1], ['quick reaction', 1], ['armor plating', 1], ['steel toed', 1], ['good circulation', 1], ['prismatic toe ring', 1], ['basket hilt', 1], ['sure footing', 1], ['steady hands', 1]],
    'rarity': 'rare',
    'color': colors.cblack,
    'moveAngle': 35,
    'minLevel': 300
  },
  'ghoul': {
    'items': [['weapon', 'long sword'], ['armor', 'apollo helmet'], ['armor', 'polished gauntlets'], ['armor', 'studded leather'], ['armor', 'buckaneer boots']],
    'skills': ['super smash', 'basic melee'],
    'sourceCards': [['shambling', 1], ['simple minded', 1], ['bloodsucker', 1], ['careful aim', 1]],
    'color': colors.cplant
  },
  'vampire': {
    'items': [['weapon', 'demon wand'], ['armor', 'apollo helmet'], ['armor', 'polished gauntlets'], ['armor', 'shadow armor'], ['armor', 'buckaneer boots']],
    'skills': ['health suck', 'basic spell'],
    'sourceCards': [['vampyric touch', 1], ['vampyric embrace', 1], ['bloodsucker', 1], ['soulsucker', 1], ['shadow walker', 1], ['flying', 1], ['mind expansion', 1], ['practiced', 1], ['bloodfingers', 1], ['mageheart', 1]],
    'color': colors.cdarkgrey,
    'moveAngle': -90
  },
  'living statue': {
    'items': [['weapon', 'spiked battle axe'], ['armor', 'apollo helmet'], ['armor', 'polished gauntlets'], ['armor', 'shadow armor'], ['armor', 'buckaneer boots']],
    'skills': ['super smash', 'basic melee'],
    'sourceCards': [['heart of granite', 1], ['simple minded', 1], ['alabaster', 1], ['accurate', 1], ['clown shoes', 1], ['happy feet', 1], ['bloodfingers', 1], ['face training', 1]],
    'color': colors.cbone,
    'moveAngle': 0
  },
  'gargoyle': {
    'items': [['weapon', 'long sword'], ['armor', 'apollo helmet'], ['armor', 'polished gauntlets'], ['armor', 'raider armor'], ['armor', 'buckaneer boots']],
    'skills': ['super smash', 'basic melee'],
    'sourceCards': [['heart of granite', 1], ['simple minded', 1], ['alabaster', 1], ['clawed', 1], ['flying', 1], ['sharpened', 1]],
    'color': colors.cstone,
    'moveAngle': 0
  },
  'minotaur': {
    'items': [['weapon', 'morning star'], ['armor', 'apollo helmet'], ['armor', 'polished gauntlets'], ['armor', 'muscle plate'], ['armor', 'buckaneer boots']],
    'skills': ['splashing hit', 'super smash', 'basic melee'],
    'sourceCards': [['simple minded', 1], ['big', 1], ['buff', 1], ['hobbit foot', 1], ['good circulation', 1], ['potion holster', 1], ['happy feet', 1], ['basket hilt', 1], ['possessed weapon', 1]],
    'color': colors.cstone,
    'moveAngle': 0
  },
  'acheron': {
    'items': [['weapon', 'hand axe'], ['armor', 'plague doctor'], ['armor', 'polished gauntlets'], ['armor', 'war robe'], ['armor', 'arcane boots']],
    'skills': ['quick hit'],
    'sourceCards': [['proto-boss', 0], ['proto-acheron', 1], ['telescoping handle', 1], ['roller skates', 1], ['practiced', 1], ['vest pockets', 1], ['dexterous hands', 1], ['pinpoint precision', 1], ['ethereal', 1], ['small stature', 1], ['frosted', 1], ['ignited', 1], ['pyromania', 1], ['simple minded', 1], ['unwashed hands', 1], ['blue ice', 1], ['vampyric touch', 1], ['grabby arm', 1], ['long reach', 1], ['hateful blade', 1]]
  },
  'wraith': {
    'items': [['weapon', 'long sword'], ['armor', 'apollo helmet'], ['armor', 'polished gauntlets'], ['armor', 'elegant plate'], ['armor', 'buckaneer boots']],
    'skills': ['ice slash', 'basic melee'],
    'sourceCards': [['berserking', 1], ['flying', 1], ['ethereal', 1], ['hobbit foot', 1], ['good circulation', 1], ['happy feet', 1], ['vampyric touch', 1]],
    'color': colors.cdarkgrey,
    'moveAngle': 60
  },
  'CFTS': {
    'items': [['weapon', 'hand crossbow'], ['armor', 'dodgers cap'], ['armor', 'raider armor'], ['armor', 'leather gloves'], ['armor', 'buckaneer boots']],
    'skills': ['blast arrow'],
    'sourceCards': [['side arm', 1], ['buff', 1], ['bloodbath', 1], ['nimble', 1], ['gratifying blow', 1], ['clockwork', 1], ['shambling', 1], ['ethereal', 1], ['dexterous hands', 1], ['balanced', 1], ['quick reaction', 1], ['hobbit foot', 1], ['thwomping', 1], ['shadow walker', 1], ['happy feet', 1], ['increased radius', 1], ['more projectiles', 1], ['practiced', 1], ['faster attacks', 1], ['accurate', 1]],
    'rarity': 'boss',
    'minLevel': 150
  },
  'elf sharpshooter': {
    'items': [['weapon', 'hand crossbow'], ['armor', 'dodgers cap'], ['armor', 'leather gloves'], ['armor', 'shadow armor'], ['armor', 'elf boots']],
    'skills': ['explonential shot', 'speed shot'],
    'sourceCards': [['side arm', 1], ['small stature', 1], ['nimble', 1], ['steady hands', 1], ['dexterous hands', 1], ['balanced', 1], ['quick reaction', 1], ['eagle eye', 1], ['bloodsucker', 1], ['thwomping', 1], ['sure footing', 1], ['shadow walker', 1], ['ninja stance', 1], ['semi automatic', 1], ['minimum tolerances', 1], ['pinpoint precision', 1], ['more projectiles', 1], ['faster attacks', 1]],
    'minLevel': 100,
    'rarity': 'boss',
    'color': colors.cbone
  },
  'umuri': {
    'items': [['weapon', 'hand crossbow'], ['armor', 'dodgers cap'], ['armor', 'leather gloves'], ['armor', 'shadow armor'], ['armor', 'elf boots']],
    'skills': ['fire arrow', 'cold arrow', 'lightning arrow', 'poison arrow'],
    'sourceCards': [['forest spirit', 1], ['cycled attack', 1], ['clockwork', 1], ['steady hands', 1], ['dexterous hands', 1], ['ethereal', 1], ['longer cooldown', 1], ['clawed', 1], ['soulsucker', 1], ['balanced', 1], ['eagle eye', 1], ['bloodsucker', 1], ['sure footing', 1], ['shadow walker', 1], ['ninja stance', 1], ['minimum tolerances', 1], ['pinpoint precision', 1], ['accurate', 1], ['precise', 1], ['pyropotency', 1], ['frigopotency', 1], ['electropotency', 1], ['toxopotency', 1], ['plague ritual', 1], ['flame ritual', 1], ['frost ritual', 1], ['shock ritual', 1]],
    'minLevel': 100,
    'rarity': 'boss',
    'color': colors.cbone
  },
  'dahd djinn': {
    'items': [['weapon', 'fairy wand'], ['armor', 'scout leather'], ['armor', 'elf boots'], ['armor', 'leather gloves'], ['armor', 'balsa helmet']],
    'skills': ['pressure wave'],
    'sourceCards': [['dexterous hands', 1], ['faster propogation', 1], ['practiced', 1], ['clown shoes', 1], ['telescoping handle', 1], ['accurate', 1], ['steady hands', 1], ['increased radius', 1], ['flying', 1], ['ethereal', 1], ['shadow walker', 1], ['balanced', 1], ['stinging', 1], ['precise', 1], ['faster attacks', 1], ['long reach', 1], ['grabby arm', 1], ['frugal', 1]],
    'minLevel': 50,
    'rarity': 'boss',
    'color': colors.PHYS_COLOR,
    'moveAngle': 75
  },
  'ser djinn': {
    'items': [['weapon', 'fairy wand'], ['armor', 'embroidered silks'], ['armor', 'mage boots'], ['armor', 'mage gloves'], ['armor', 'mage hat']],
    'skills': ['lightning ball'],
    'sourceCards': [['dexterous hands', 1], ['clown shoes', 1], ['telescoping handle', 1], ['accurate', 1], ['steady hands', 1], ['flying', 1], ['ethereal', 1], ['shadow walker', 1], ['charged', 1], ['conductive suit', 1], ['electrified', 1], ['shock ritual', 1], ['planet buster', 1], ['semi automatic', 1], ['faster attacks', 1], ['long reach', 1], ['grabby arm', 1], ['momentum', 1]],
    'minLevel': 50,
    'rarity': 'boss',
    'color': colors.clight
  },
  'kei djinn': {
    'items': [['weapon', 'fairy wand'], ['armor', 'embroidered silks'], ['armor', 'mage boots'], ['armor', 'mage gloves'], ['armor', 'mage hat']],
    'skills': ['fire ball'],
    'sourceCards': [['dexterous hands', 1], ['blazing', 1], ['clown shoes', 1], ['telescoping handle', 1], ['accurate', 1], ['steady hands', 1], ['flying', 1], ['ethereal', 1], ['shadow walker', 1], ['ignited', 1], ['pyromania', 1], ['flame ritual', 1], ['planet buster', 1], ['semi automatic', 1], ['faster attacks', 1], ['long reach', 1], ['grabby arm', 1], ['frugal', 1], ['momentum', 1]],
    'minLevel': 50,
    'rarity': 'boss',
    'color': colors.cfire
  },
  'al-err djinn': {
    'items': [['weapon', 'fairy wand'], ['armor', 'embroidered silks'], ['armor', 'mage boots'], ['armor', 'mage gloves'], ['armor', 'plague doctor']],
    'skills': ['poison ball'],
    'sourceCards': [['dexterous hands', 1], ['clown shoes', 1], ['telescoping handle', 1], ['accurate', 1], ['steady hands', 1], ['flying', 1], ['ethereal', 1], ['shadow walker', 1], ['putrefied', 1], ['unwashed hands', 1], ['plague ritual', 1], ['indigenous toxins', 1], ['planet buster', 1], ['semi automatic', 1], ['faster attacks', 1], ['long reach', 1], ['grabby arm', 1], ['frugal', 1], ['momentum', 1]],
    'minLevel': 50,
    'rarity': 'boss',
    'color': colors.cpois
  },
  'frow djinn': {
    'items': [['weapon', 'fairy wand'], ['armor', 'embroidered silks'], ['armor', 'mage boots'], ['armor', 'mage gloves'], ['armor', 'mage hat']],
    'skills': ['ice ball'],
    'sourceCards': [['dexterous hands', 1], ['clown shoes', 1], ['telescoping handle', 1], ['accurate', 1], ['steady hands', 1], ['flying', 1], ['ethereal', 1], ['shadow walker', 1], ['frosted', 1], ['frost ritual', 1], ['blue ice', 1], ['planet buster', 1], ['semi automatic', 1], ['faster attacks', 1], ['long reach', 1], ['grabby arm', 1], ['frugal', 1], ['momentum', 1]],
    'minLevel': 50,
    'rarity': 'boss',
    'color': colors.ccold
  },
  'buddha': {
    'items': [['armor', 'kabuto'], ['armor', 'buckaneer boots'], ['armor', 'elegant plate'], ['armor', 'polished gauntlets']],
    'skills': ['pacifism'],
    'sourceCards': [['blessed', 1], ['proto-buddha', 1], ['big', 1], ['buff', 1], ['riveted', 1], ['jovial', 1], ['impenetrable', 1], ['meditation', 1], ['roller skates', 1], ['mind expansion', 1], ['frugal', 1]],
    'color': colors.cgold
  },
  'ninja': {
    'items': [['weapon', 'tanto'], ['armor', 'kabuto'], ['armor', 'ninja tabi'], ['armor', 'shadow armor'], ['armor', 'leather gloves']],
    'skills': ['lethal strike', 'quick hit'],
    'sourceCards': [['shadow walker', 1], ['good circulation', 1], ['prismatic toe ring', 1], ['basket hilt', 1], ['sure footing', 1], ['steady hands', 1], ['balanced', 1], ['accurate', 1], ['ninja stance', 1], ['semi automatic', 1], ['pinpoint precision', 1], ['simple minded', 1], ['bloodsucker', 1], ['soulsucker', 1], ['long reach', 1], ['telescoping handle', 1], ['compression shorts', 1]],
    'color': colors.cblack,
    'moveAngle': -50
  },
  'ninja assassin': {
    'items': [['weapon', 'yumi'], ['armor', 'kabuto'], ['armor', 'ninja tabi'], ['armor', 'shadow armor'], ['armor', 'leather gloves']],
    'skills': ['headshot', 'piercing shot'],
    'sourceCards': [['shadow walker', 1], ['good circulation', 1], ['prismatic toe ring', 1], ['basket hilt', 1], ['sure footing', 1], ['steady hands', 1], ['balanced', 1], ['accurate', 1], ['ninja stance', 1], ['precise', 1], ['stinging', 1]],
    'color': colors.cblack,
    'moveAngle': -65
  },
  'samurai': {
    'items': [['weapon', 'katana'], ['armor', 'kabuto'], ['armor', 'fancy gauntlets'], ['armor', 'leatherscale armor'], ['armor', 'buckaneer boots']],
    'skills': ['super smash', 'quick hit'],
    'sourceCards': [['semi automatic', 1], ['knee pads', 1], ['sharpened', 1], ['quick reaction', 1], ['good circulation', 1], ['prismatic toe ring', 1], ['basket hilt', 1], ['sure footing', 1], ['steady hands', 1], ['balanced', 1], ['accurate', 1], ['pinpoint precision', 1], ['stinging', 1], ['clawed', 1], ['precise', 1], ['honed', 1], ['bushido', 1]],
    'color': colors.cdarkred,
    'moveAngle': 20
  },
  'fallen samurai': {
    'items': [['weapon', 'wakizashi'], ['armor', 'kabuto'], ['armor', 'fancy gauntlets'], ['armor', 'leatherscale armor'], ['armor', 'buckaneer boots']],
    'skills': ['lethal strike', 'super smash'],
    'sourceCards': [['semi automatic', 1], ['hateful blade', 1], ['sharpened', 1], ['quick reaction', 1], ['good circulation', 1], ['prismatic toe ring', 1], ['basket hilt', 1], ['sure footing', 1], ['steady hands', 1], ['balanced', 1], ['accurate', 1], ['pinpoint precision', 1], ['clawed', 1], ['honed', 1], ['bushido', 1]],
    'color': colors.cdarkred
  },
  'tanuki': {
    'items': [['weapon', 'shuriken'], ['armor', 'balsa helmet'], ['armor', 'leatherscale armor'], ['armor', 'leather boots'], ['armor', 'handmail']],
    'skills': ['headshot', 'speed shot', 'basic range'],
    'sourceCards': [['berserking', 1], ['small stature', 1], ['simple minded', 1], ['more projectiles', 1], ['more balls', 1], ['ninja stance', 1], ['precise', 1], ['practiced', 1], ['sharpened', 1], ['stinging', 1]],
    'rarity': 'rare',
    'color': colors.cbrown,
    'moveAngle': 45
  },
  'walking meat': {
    'items': [['weapon', 'morning star'], ['armor', 'balsa helmet'], ['armor', 't-shirt'], ['armor', 'jeans'], ['armor', 'latex gloves']],
    'skills': ['super smash'],
    'sourceCards': [['deathwish', 1], ['small stature', 1], ['berserking', 1], ['vengeful', 1], ['soul channeling', 1], ['arcane thirst', 1], ['basket hilt', 1], ['nanotube reinforcement', 1], ['knee pads', 1], ['eagle eye', 1], ['sure footing', 1], ['steady hands', 1], ['minimum tolerances', 1]],
    'color': colors.cmeat,
    'moveAngle': 40
  },
  'lich': {
    'items': [['weapon', 'demon wand'], ['armor', 'lichgaze'], ['armor', 'cultist robe'], ['armor', 'arcane boots'], ['armor', 'mage gloves']],
    'skills': ['fire ball', 'ice ball', 'lightning ball', 'poison ball'],
    'sourceCards': [['meditation', 1], ['textbook', 1], ['more projectiles', 1], ['manafingers', 1], ['cycled attack', 1], ['painful phylactery', 1], ['deadly focus', 1], ['undeath', 1], ['soul channeling', 1], ['arcane thirst', 1], ['blood pact', 1], ['alabaster', 1], ['riveted', 1], ['basket hilt', 1], ['nanotube reinforcement', 1], ['knee pads', 1], ['eagle eye', 1], ['sure footing', 1], ['steady hands', 1], ['minimum tolerances', 1]],
    'rarity': 'rare',
    'color': colors.cstone,
    'moveAngle': 60
  },
  'ice lich': {
    'items': [['weapon', 'demon wand'], ['armor', 'lichgaze'], ['armor', 'cultist robe'], ['armor', 'arcane boots'], ['armor', 'mage gloves']],
    'skills': ['ice ball'],
    'sourceCards': [['deathwish', 1], ['more projectiles', 1], ['manafingers', 1], ['painful phylactery', 1], ['deadly focus', 1], ['undeath', 1], ['soul channeling', 1], ['blood pact', 1], ['alabaster', 1], ['riveted', 1], ['basket hilt', 1], ['nanotube reinforcement', 1], ['knee pads', 1], ['eagle eye', 1], ['sure footing', 1], ['steady hands', 1], ['minimum tolerances', 1], ['clarity', 1], ['ice breath', 1]],
    'rarity': 'boss',
    'color': colors.cstone,
    'moveAngle': 60,
    'minLevel': 500
  },
  'withering goliath': {
    'items': [['weapon', 'morning star'], ['armor', 'gladiator helm'], ['armor', 'muscle plate'], ['armor', 'raider armor'], ['armor', 'fancy gauntlets']],
    'skills': ['sweep'],
    'sourceCards': [['side arm', 1], ['jovial', 1], ['bloodbath', 1], ['bloodfingers', 1], ['big', 1], ['big', 1], ['big', 1], ['thwomping', 1], ['alabaster', 1], ['riveted', 1], ['basket hilt', 1], ['nanotube reinforcement', 1], ['knee pads', 1], ['practiced', 1], ['vengeful', 1], ['vengeful', 1], ['painful phylactery', 1], ['blood pact', 1], ['eagle eye', 1], ['sure footing', 1], ['steady hands', 1], ['minimum tolerances', 1]],
    'color': colors.cdarkred
  },
  'tormented colossus': {
    'items': [['weapon', 'morning star'], ['armor', 'gladiator helm'], ['armor', 'muscle plate'], ['armor', 'raider armor'], ['armor', 'fancy gauntlets']],
    'skills': ['pacifism'],
    'sourceCards': [['proto-colossus', 1], ['jovial', 1], ['bloodbath', 1], ['bloodfingers', 1], ['thwomping', 1], ['clown shoes', 1], ['basket hilt', 1], ['blood pact', 1], ['colossus', 1]],
    'color': colors.cdarkred,
    'minLevel': 500
  },
  'abomination': {
    'items': [['weapon', 'demon wand'], ['armor', 'gladiator helm'], ['armor', 'muscle plate'], ['armor', 'raider armor'], ['armor', 'fancy gauntlets']],
    'skills': ['sacrifice', 'health suck'],
    'sourceCards': [['soulsucker', 1], ['big', 1], ['buff', 1], ['manafingers', 1], ['alabaster', 1], ['basket hilt', 1], ['nanotube reinforcement', 1]],
    'color': colors.cdarkgreen
  },
  'lichie lich': {
    'items': [['weapon', 'demon wand'], ['armor', 'lichgaze'], ['armor', 'cultist robe'], ['armor', 'arcane boots'], ['armor', 'mage gloves']],
    'skills': ['fire ball', 'ice ball', 'lightning ball', 'poison ball'],
    'sourceCards': [['proto-boss', 1], ['textbook', 1], ['more projectiles', 1], ['more balls', 1], ['manafingers', 1], ['cycled attack', 1], ['mana drinker', 1], ['shorter cooldown', 1], ['painful phylactery', 1], ['deadly focus', 1], ['undeath', 1], ['soul channeling', 1], ['arcane thirst', 1], ['blood pact', 1], ['big', 1], ['alabaster', 1], ['riveted', 1], ['basket hilt', 1], ['nanotube reinforcement', 1], ['knee pads', 1], ['eagle eye', 1], ['sure footing', 1], ['steady hands', 1], ['minimum tolerances', 1]],
    'color': colors.cstone,
    'moveAngle': 80
  },
  'treasure hunter': {
    'items': [['weapon', 'magic wand'], ['armor', 'cultist robe'], ['armor', 'foot plate']],
    'skills': ['shiverstorm', 'basic spell'],
    'sourceCards': [['concentration', 1], ['textbook', 1], ['dancing walk', 1], ['divine assistance', 1], ['gratifying blow', 1], ['more physical damage', 1], ['longer cooldown', 1], ['shorter cooldown', 1], ['shorter range', 1], ['ab shocker belt', 1], ['side arm', 1], ['mana drinker', 1], ['fatal blow', 1], ['finishing move', 1], ['stingy', 1], ['manafingers', 1], ['micronaps', 1], ['pyropotency', 1], ['frigopotency', 1], ['electropotency', 1], ['toxopotency', 1]]
  },
  'the z': {
    'items': [['weapon', 'composite bow'], ['armor', 'dragonscale'], ['armor', 'elf boots'], ['armor', 'dodgers cap'], ['armor', 'leather gloves']],
    'skills': ['deadly volley'],
    'sourceCards': [['concentration', 1], ['cycled attack', 1], ['textbook', 1], ['gratifying blow', 1], ['more physical damage', 1], ['shorter cooldown', 1], ['longer cooldown', 1], ['side arm', 1], ['mana drinker', 1], ['stingy', 1], ['short sighted', 1], ['manafingers', 1], ['micronaps', 1], ['pyropotency', 1], ['pinpoint precision', 1], ['explosive bolts', 1], ['frigopotency', 1], ['electropotency', 1], ['toxopotency', 1], ['fatal blow', 1], ['finishing move', 1]],
    'rarity': 'rare',
    'minLevel': 150
  },
  'slime': {
    'items': [['weapon', 'katana'], ['armor', 'gooey gaberdine'], ['armor', 'gooey gibus'], ['armor', 'gooey gauntlets'], ['armor', 'foot plate']],
    'skills': ['consume'],
    'sourceCards': [['proto-slime', 1], ['liquefied brain', 1], ['mobility', 1], ['faster attacks', 1], ['shorter cooldown', 1], ['potion guzzler', 1], ['earth commune', 1], ['forest spirit', 1]],
    'deathSpawns': ['baby slime', 'baby slime'],
    'color': colors.cpois,
    'rarity': 'slime'
  },
  'baby slime': {
    'items': [['weapon', 'katana'], ['armor', 'gooey gaberdine'], ['armor', 'gooey gibus'], ['armor', 'gooey gauntlets'], ['armor', 'foot plate']],
    'skills': ['consume', 'basic melee'],
    'sourceCards': [['proto-slime', 1], ['proto-bat', 1], ['small stature', 1], ['liquefied brain', 1], ['mobility', 1], ['faster attacks', 1], ['shorter cooldown', 1], ['potion guzzler', 1], ['earth commune', 1], ['forest spirit', 1]],
    'deathSpawns': [],
    'color': colors.cpois,
    'rarity': 'slime'
  },
  'big slime': {
    'items': [['weapon', 'katana'], ['armor', 'gooey gaberdine'], ['armor', 'gooey gibus'], ['armor', 'gooey gauntlets'], ['armor', 'foot plate']],
    'skills': ['consume'],
    'sourceCards': [['proto-slime', 1], ['proto-bigger', 1], ['proto-bigger', 1], ['liquefied brain', 1], ['mobility', 1], ['faster attacks', 1], ['shorter cooldown', 1], ['potion guzzler', 1], ['earth commune', 1], ['forest spirit', 1]],
    'deathSpawns': ['slime', 'slime'],
    'color': colors.cpois,
    'minLevel': 200,
    'rarity': 'slime'
  },
  'huge slime': {
    'items': [['weapon', 'katana'], ['armor', 'gooey gaberdine'], ['armor', 'gooey gibus'], ['armor', 'gooey gauntlets'], ['armor', 'foot plate']],
    'skills': ['consume'],
    'sourceCards': [['proto-slime', 1], ['proto-bigger', 1], ['proto-bigger', 1], ['proto-bigger', 1], ['liquefied brain', 1], ['mobility', 1], ['faster attacks', 1], ['shorter cooldown', 1], ['potion guzzler', 1], ['earth commune', 1], ['forest spirit', 1]],
    'deathSpawns': ['big slime', 'big slime'],
    'color': colors.cpois,
    'minLevel': 500,
    'rarity': 'slime'
  },
  'gigantic slime': {
    'items': [['weapon', 'katana'], ['armor', 'gooey gaberdine'], ['armor', 'gooey gibus'], ['armor', 'gooey gauntlets'], ['armor', 'foot plate']],
    'skills': ['consume'],
    'sourceCards': [['proto-slime', 1], ['proto-bigger', 1], ['proto-bigger', 1], ['proto-bigger', 1], ['proto-bigger', 1], ['liquefied brain', 1], ['jovial', 1], ['mobility', 1], ['faster attacks', 1], ['shorter cooldown', 1], ['potion guzzler', 1], ['earth commune', 1], ['forest spirit', 1]],
    'deathSpawns': ['huge slime', 'huge slime'],
    'color': colors.cpois,
    'minLevel': 1000,
    'rarity': 'slime'
  },
  'adventurer\'s corpse': {
    'items': [['weapon', 'katana'], ['armor', 'cultist robe'], ['armor', 'foot plate']],
    'skills': ['pacifism'],
    'sourceCards': [['proto-slime', 1], ['proto-corpse', 1]],
    'deathSpawns': ['adventuring slime', 'adventuring slime'],
    'color': colors.cblood
  },
  'adventuring slime': {
    'items': [['weapon', 'barbarian blade'], ['armor', 'gooey gaberdine'], ['armor', 'gooey gibus'], ['armor', 'gooey gauntlets'], ['armor', 'foot plate']],
    'skills': ['consume'],
    'sourceCards': [['proto-slime', 1], ['roller skates', 1], ['shorter cooldown', 1], ['micronaps', 1], ['clawed', 1], ['sharpened', 1], ['stinging', 1], ['clockwork', 1], ['small stature', 1], ['semi automatic', 1], ['titan\'s grip', 1], ['liquefied brain', 1], ['mobility', 1], ['faster attacks', 1], ['shorter cooldown', 1]],
    'color': colors.cpois,
    'moveAngle': -45,
    'rarity': 'rare'
  },
  'angry puddle': {
    'items': [['weapon', 'katana'], ['armor', 'gooey gaberdine'], ['armor', 'gooey gibus'], ['armor', 'gooey gauntlets'], ['armor', 'foot plate']],
    'skills': ['consume'],
    'sourceCards': [['frugal', 1], ['proto-bigger', 1], ['big', 1], ['liquefied brain', 1], ['liquefied body', 1], ['spiked', 1], ['mobility', 1], ['faster attacks', 1], ['shorter cooldown', 1]],
    'color': colors.cpois,
    'minLevel': 200,
    'rarity': 'rare'
  },
  'king slime': {
    'items': [['weapon', 'katana'], ['armor', 'gooey gaberdine'], ['armor', 'gooey gibus'], ['armor', 'gooey gauntlets'], ['armor', 'foot plate']],
    'skills': ['consume'],
    'sourceCards': [['proto-slime', 1], ['proto-boss', 1], ['proto-bigger', 1], ['proto-bigger', 1], ['big', 1], ['liquefied brain', 1], ['mobility', 1], ['faster attacks', 1], ['shorter cooldown', 1]],
    'deathSpawns': ['big slime', 'big slime', 'big slime', 'big slime', 'big slime', 'big slime', 'big slime', 'big slime', 'big slime', 'big slime'],
    'color': colors.cpois
  },
  'baku': {
    'items': [['weapon', 'dream eater'], ['armor', 'gladiator helm'], ['armor', 'muscle plate'], ['armor', 'polished gauntlets'], ['armor', 'foot plate']],
    'skills': ['super smash'],
    'sourceCards': [['long reach', 1], ['clawed', 1], ['ninja stance', 1], ['face training', 1], ['balanced', 1], ['armor plating', 1], ['ethereal', 1], ['derping out', 1], ['small stature', 1], ['compression shorts', 1]],
    'color': colors.cbrown
  },
  'succubus': {
    'items': [['weapon', 'succubus skull'], ['armor', 'gladiator helm'], ['armor', 'muscle plate'], ['armor', 'polished gauntlets'], ['armor', 'foot plate']],
    'skills': ['telekinesis', 'health suck'],
    'sourceCards': [['somnambulate', 1], ['mageheart', 1], ['ninja stance', 1], ['face training', 1], ['balanced', 1], ['armor plating', 1], ['flying', 1], ['dancing walk', 1], ['charged', 1], ['multi-fingered', 1], ['faster attacks', 1], ['electrified', 1], ['static socks', 1]],
    'color': colors.cbrown,
    'moveAngle': 30
  },
  'incubus': {
    'items': [['weapon', 'succubus skull'], ['armor', 'gladiator helm'], ['armor', 'muscle plate'], ['armor', 'polished gauntlets'], ['armor', 'foot plate']],
    'skills': ['telekinesis', 'health suck'],
    'sourceCards': [['mageheart', 1], ['frosted', 1], ['micronaps', 1], ['face training', 1], ['balanced', 1], ['armor plating', 1], ['flying', 1], ['dancing walk', 1], ['multi-fingered', 1], ['faster attacks', 1], ['iced', 1], ['ice spikes', 1], ['stimpack', 1]],
    'color': colors.cbrown,
    'moveAngle': -30
  },
  'freddy kooler': {
    'items': [['weapon', 'succubus skull'], ['armor', 'gladiator helm'], ['armor', 'muscle plate'], ['armor', 'polished gauntlets'], ['armor', 'foot plate']],
    'skills': ['ice nova', 'telekinesis', 'health suck'],
    'sourceCards': [['proto-boss', 1], ['mageheart', 1], ['clawed', 1], ['sharpened', 1], ['stinging', 1], ['frosted', 1], ['micronaps', 1], ['face training', 1], ['balanced', 1], ['armor plating', 1], ['flying', 1], ['dancing walk', 1], ['multi-fingered', 1], ['faster attacks', 1], ['iced', 1], ['ice spikes', 1]],
    'color': colors.cbrown,
    'minLevel': 500,
    'rarity': 'boss'
  },
  'lucid dreamer': {
    'items': [['weapon', 'succubus skull'], ['armor', 'dodgers cap'], ['armor', 'shadow armor'], ['armor', 'leather gloves'], ['armor', 'ninja tabi']],
    'skills': ['fire nova', 'ice nova', 'nova', 'poison nova'],
    'sourceCards': [['balanced', 1], ['mageheart', 1], ['cycled attack', 1], ['faster attacks', 1], ['increased radius', 1], ['micronaps', 1], ['face training', 1], ['balanced', 1], ['armor plating', 1], ['ethereal', 1], ['quick reaction', 1], ['dancing walk', 1], ['multi-fingered', 1], ['derping out', 1]],
    'color': colors.cdarkblue
  },
  'your biggest fear': {
    'items': [['weapon', 'succubus skull'], ['armor', 'gladiator helm'], ['armor', 'muscle plate'], ['armor', 'polished gauntlets'], ['armor', 'foot plate']],
    'skills': ['fire ball', 'ice ball', 'lightning ball', 'poison ball'],
    'sourceCards': [['mageheart', 1], ['cycled attack', 1], ['faster attacks', 1], ['increased radius', 1], ['micronaps', 1], ['face training', 1], ['balanced', 1], ['armor plating', 1], ['ethereal', 1], ['multi-fingered', 1], ['quick reaction', 1], ['invisibility', 1], ['imaginary', 1]],
    'color': colors.cdarkblue
  },
  'tall man': {
    'items': [['weapon', 'composite bow'], ['armor', 'shadow armor'], ['armor', 'elf boots'], ['armor', 'leather gloves'], ['armor', 'dodgers cap']],
    'skills': ['deadly volley', 'telekinesis'],
    'sourceCards': [['proto-tallman', 1], ['dexterous hands', 1], ['balanced', 1], ['accurate', 1], ['nimble', 1], ['steady hands', 1], ['pinpoint precision', 1], ['faster attacks', 1], ['shadow walker', 1], ['shorter cooldown', 1], ['micronaps', 1], ['semi automatic', 1]],
    'rarity': 'rare',
    'color': colors.cblack,
    'moveAngle': 70
  },
  'it': {
    'items': [['weapon', 'grounding rod'], ['armor', 'gladiator helm'], ['armor', 'muscle plate'], ['armor', 'polished gauntlets'], ['armor', 'foot plate']],
    'skills': ['ice blast', 'lightning spray', 'poison spray', 'incinerate'],
    'sourceCards': [['mageheart', 1], ['manafingers', 1], ['textbook', 1], ['clown shoes', 1], ['cycled attack', 1], ['faster attacks', 1], ['increased radius', 1], ['micronaps', 1], ['face training', 1], ['balanced', 1], ['armor plating', 1], ['ethereal', 1], ['quick reaction', 1], ['dancing walk', 1], ['multi-fingered', 1], ['derping out', 1], ['flash', 1]],
    'minLevel': 350,
    'color': colors.cdarkblue
  },
  'cthulhu': {
    'items': [['weapon', 'succubus skull'], ['armor', 'gladiator helm'], ['armor', 'muscle plate'], ['armor', 'polished gauntlets'], ['armor', 'foot plate']],
    'skills': ['oblivion ray'],
    'sourceCards': [['proto-boss', 1], ['proto-boss', 1], ['jovial', 1], ['faster detonation', 1], ['long reach', 1], ['telescoping handle', 1], ['faster attacks', 1], ['mobility', 1], ['big', 1], ['charged', 1], ['shock ritual', 1], ['frosted', 1], ['frost ritual', 1], ['iced', 1], ['electrified', 1], ['static socks', 1], ['ice spikes', 1], ['micronaps', 1], ['face training', 1], ['balanced', 1], ['armor plating', 1], ['flying', 1], ['quick reaction', 1], ['dancing walk', 1], ['multi-fingered', 1], ['riveted', 1], ['alabaster', 1], ['knee pads', 1], ['breadhat', 1]],
    'color': colors.cdarkgreen,
    'moveAngle': 10
  },
  'pikeman': {
    'items': [['weapon', 'pike'], ['armor', 'crusader helm'], ['armor', 'chainmail'], ['armor', 'handmail'], ['armor', 'foot plate']],
    'skills': ['super smash', 'basic melee'],
    'sourceCards': [['sharpened', 1], ['basket hilt', 1], ['simple minded', 1], ['head of vigor', 1], ['steady hands', 1], ['potion holster', 1], ['buff', 1], ['riveted', 1], ['knee pads', 1], ['good circulation', 1], ['stinging', 1], ['more physical damage', 1]],
    'color': colors.cdarkgrey
  },
  'crossbowman': {
    'items': [['weapon', 'crossbow'], ['armor', 'visor'], ['armor', 'chainmail'], ['armor', 'leather gloves'], ['armor', 'leather boots']],
    'skills': ['headshot', 'piercing shot'],
    'sourceCards': [['overdraw', 1], ['fletching', 1], ['pinpoint precision', 1], ['strafing', 1], ['balanced', 1], ['dexterous hands', 1], ['bloodfingers', 1], ['vest pockets', 1], ['sure footing', 1], ['careful aim', 1], ['shorter cooldown', 1]],
    'color': colors.cdarkgrey
  },
  'griffon': {
    'items': [['weapon', 'winged axe'], ['armor', 'apollo helmet'], ['armor', 'winged leather'], ['armor', 'front claws'], ['armor', 'rear claws']],
    'skills': ['pressure wave', 'chain lightning', 'lightning slash'],
    'sourceCards': [['electrified', 1], ['multi-fingered', 1], ['flash', 1], ['sharpened', 1], ['clawed', 1], ['titan\'s grip', 1], ['dexterous hands', 1], ['flying', 1], ['strong back', 1], ['nimble', 1], ['ninja stance', 1], ['faster attacks', 1], ['charged', 1]],
    'color': colors.cbrown
  },
  'crusader': {
    'items': [['weapon', 'long sword'], ['armor', 'crusader helm'], ['armor', 'batsuit'], ['armor', 'polished gauntlets'], ['armor', 'shiny greaves']],
    'skills': ['lethal strike', 'quick hit'],
    'sourceCards': [['hateful blade', 1], ['possessed weapon', 1], ['derping out', 1], ['face training', 1], ['simple minded', 1], ['bushido', 1], ['potion holster', 1], ['swift hands', 1], ['buff', 1], ['alabaster', 1], ['ab shocker belt', 1], ['compression shorts', 1], ['mobility', 1], ['divine assistance', 1]],
    'color': colors.cdarkgrey
  },
  'cavalier': {
    'items': [['weapon', 'pike'], ['armor', 'conquistador helm'], ['armor', 'raider armor'], ['armor', 'fancy gauntlets'], ['armor', 'cavalry boots']],
    'skills': ['charge', 'ground smash'],
    'sourceCards': [['sharpened', 1], ['enchant weapon', 1], ['face training', 1], ['armor plating', 1], ['potion holster', 1], ['buff', 1], ['strong back', 1], ['ab shocker belt', 1], ['war horse', 1], ['mobility', 1], ['precise', 1], ['finishing move', 1]],
    'color': colors.cdarkgrey,
    'rarity': 'rare'
  },
  'templar': {
    'items': [['weapon', 'delicate wand'], ['armor', 'crusader helm'], ['armor', 'velvet tunic'], ['armor', 'magesteel gauntlets'], ['armor', 'magesteel greaves']],
    'skills': ['ice nova'],
    'sourceCards': [['iced', 1], ['blazing', 1], ['electrified', 1], ['enchant weapon', 1], ['ice breath', 1], ['well grounded', 1], ['clarity', 1], ['textbook', 1], ['manafingers', 1], ['mageheart', 1], ['smart footing', 1], ['compression shorts', 1]],
    'color': colors.cdarkgrey,
    'rarity': 'rare'
  },
  'champion': {
    'items': [['weapon', 'barbarian blade'], ['armor', 'champion helm'], ['armor', 'champion gloves'], ['armor', 'champion mail'], ['armor', 'champion boots']],
    'skills': ['quick hit'],
    'sourceCards': [['swashbuckling', 1], ['multi-fingered', 1], ['soft weapons', 1], ['quick reaction', 1], ['face training', 1], ['simple minded', 1], ['head of vigor', 1], ['potion holster', 1], ['buff', 1], ['strong back', 1], ['ab shocker belt', 1], ['ninja stance', 1], ['precise', 1], ['honed', 1], ['practiced', 1]],
    'color': colors.cdarkgrey,
    'rarity': 'rare'
  },
  'zealot': {
    'items': [['weapon', 'demon wand'], ['armor', 'zealot hood'], ['armor', 'mage gloves'], ['armor', 'cultist robe'], ['armor', 'arcane boots']],
    'skills': ['fire ball'],
    'sourceCards': [['demonic split', 1], ['telescoping handle', 1], ['soul channeling', 1], ['berserking', 1], ['pyromania', 1], ['textbook', 1], ['chemistry', 1], ['hot blooded', 1], ['hydra blood', 1], ['jet pack', 1], ['firewalker', 1], ['momentum', 1], ['more balls', 1], ['more projectiles', 1], ['long reach', 1], ['faster detonation', 1]],
    'color': colors.cdarkred,
    'rarity': 'boss'
  },
  'paladin': {
    'items': [['weapon', 'stone hammer'], ['armor', 'apollo helmet'], ['armor', 'paladin armor'], ['armor', 'polished gauntlets'], ['armor', 'magesteel greaves']],
    'skills': ['holy light'],
    'sourceCards': [['enchant weapon', 1], ['blessed', 1], ['head of vigor', 1], ['jovial', 1], ['bushido', 1], ['meditation', 1], ['potion holster', 1], ['potion guzzler', 1], ['holy shield', 1], ['sacred shield', 1], ['alabaster', 1], ['divine assistance', 1]],
    'color': colors.cdarkgrey,
    'rarity': 'rare'
  },
  'seraph': {
    'items': [['weapon', 'angelic blade'], ['armor', 'halo'], ['armor', 'winged leather'], ['armor', 'silk feather gloves'], ['armor', 'winged sandals']],
    'skills': ['holy light', 'masterful strike'],
    'sourceCards': [['enchant weapon', 1], ['blessed', 1], ['hazmat mask', 1], ['keen wit', 1], ['head of vigor', 1], ['hazmat gloves', 1], ['steady hands', 1], ['titan\'s grip', 1], ['big', 1], ['buff', 1], ['nimble', 1], ['flying', 1], ['hazmat suit', 1], ['hazmat boots', 1], ['smart footing', 1], ['prismatic toe ring', 1], ['practiced', 1], ['honed', 1], ['shorter cooldown', 1]],
    'color': colors.cwhite,
    'rarity': 'boss'
  },
  'lost seraph': {
    'items': [['weapon', 'angelic blade'], ['armor', 'halo'], ['armor', 'winged leather'], ['armor', 'silk feather gloves'], ['armor', 'winged sandals']],
    'skills': ['holy light', 'masterful strike'],
    'sourceCards': [['proto-boss', 1], ['enchant weapon', 1], ['blessed', 1], ['hazmat mask', 1], ['keen wit', 1], ['head of vigor', 1], ['hazmat gloves', 1], ['steady hands', 1], ['titan\'s grip', 1], ['ascended', 1], ['big', 1], ['buff', 1], ['nimble', 1], ['flying', 1], ['aura', 1], ['hazmat suit', 1], ['hazmat boots', 1], ['smart footing', 1], ['prismatic toe ring', 1], ['practiced', 1], ['honed', 1], ['shorter cooldown', 1], ['more physical damage', 1], ['faster attacks', 1], ['shorter cooldown', 1]],
    'color': colors.cwhite,
    'rarity': 'boss'
  }

};


},{"./colors":11}],16:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.skill = exports.BASE_SPELL_RANGE = exports.BASE_RANGE_RANGE = exports.BASE_MELEE_RANGE = undefined;

var _colors = require('./colors');

var color = _interopRequireWildcard(_colors);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var BASE_MELEE_RANGE = exports.BASE_MELEE_RANGE = 300;
var BASE_RANGE_RANGE = exports.BASE_RANGE_RANGE = 4000;
var BASE_SPELL_RANGE = exports.BASE_SPELL_RANGE = 4000;

var skill = exports.skill = {
  'basic': {},
  'basic melee': {
    'prototype': ['basic'],
    'skillType': 'melee',
    'types': ['melee'],
    'specs': [{
      type: 'melee',
      color: color.PHYS_COLOR,
      quals: [],
      onHit: [],
      onKill: [],
      onRemove: []
    }],
    'baseMods': ['speed added 500', 'range added ' + BASE_MELEE_RANGE, 'physDmg added 2 perLevel']
  },
  'basic range': {
    'prototype': ['basic'],
    'skillType': 'range',
    'types': ['proj'],
    'specs': [{
      type: 'proj',
      color: color.PHYS_COLOR,
      quals: [],
      onHit: [],
      onKill: [],
      onRemove: []
    }],
    'baseMods': ['speed added 500', 'range added ' + BASE_RANGE_RANGE, 'physDmg added 2 perLevel']
  },
  'basic spell': {
    'prototype': ['basic'],
    'skillType': 'spell',
    'types': ['proj'],
    'specs': [{
      type: 'proj',
      color: color.PHYS_COLOR,
      quals: [],
      onHit: [],
      onKill: [],
      onRemove: []
    }],
    'baseMods': ['speed added 500', 'range added ' + BASE_SPELL_RANGE, 'physDmg added 2 perLevel']
  },
  'pacifism': {
    'prototype': ['basic melee'],
    'types': ['melee'],
    'specs': [{ type: 'melee', quals: ['dmg more -100'], color: '#fff' }],
    'baseMods': ['speed added 1000', 'projRadius more -100', 'physDmg more -100', 'range added ' + BASE_MELEE_RANGE * 3],
    'flavor': 'Why isn\'t this working??'
  },
  'super smash': {
    'prototype': ['basic melee'],
    'baseMods': ['manaCost added 3', 'speed added 800', 'range added ' + BASE_MELEE_RANGE, 'physDmg more 10', 'physDmg more 1 perLevel', 'physDmg added 2 perLevel']
  },
  'masterful strike': {
    'prototype': ['basic melee'],
    'baseMods': ['manaCost added 15', 'speed added 200', 'cooldownTime added 1000', 'range added ' + BASE_MELEE_RANGE, 'physDmg more 20', 'physDmg more 1 perLevel', 'physDmg added 5 perLevel']
  },
  'quick hit': {
    'prototype': ['basic melee'],
    'baseMods': ['manaCost added 3', 'speed added 250', 'physDmg more 2 perLevel', 'range added ' + BASE_MELEE_RANGE]
  },
  'charge': {
    'prototype': ['basic melee'],
    'baseMods': ['manaCost added 15', 'speed added 800', 'cooldownTime added 800', 'physDmg more 3 perLevel', 'range added ' + BASE_MELEE_RANGE * 3]
  },
  'sweep': {
    'prototype': ['basic melee'],
    'specs': [{ type: 'cone', quals: ['projRadius more 10000'] }],
    'baseMods': ['manaCost added 8', 'speed added 400', 'angle added 165', 'accuracy more 100', 'aoeSpeed more 200', 'aoeRadius more -50', 'physDmg more 2 perLevel', 'range added ' + BASE_MELEE_RANGE]
  },
  'throw weapon': {
    'prototype': ['basic melee'],
    'baseMods': ['manaCost added 25', 'speed added 250', 'cooldownTime added 2000', 'physDmg more 2.5 perLevel', 'range added ' + BASE_RANGE_RANGE]
  },
  'fire slash': {
    'prototype': ['basic melee'],
    'types': ['melee', 'fire'],
    'specs': [{ type: 'melee', color: color.FIRE_COLOR }],
    'baseMods': ['manaCost added 3', 'speed added 300', 'range added ' + BASE_MELEE_RANGE, 'fireDmg more 2 perLevel', 'fireDmg added 1 perLevel', 'physDmg added 1 perLevel', 'physDmg converted 60 fireDmg']
  },
  'flaming debris': {
    'prototype': ['basic melee'],
    'types': ['melee', 'fire'],
    'specs': [{
      type: 'melee',
      quals: [],
      onHit: [{
        type: 'proj',
        color: color.FIRE_COLOR,
        quals: ['projCount added 2', 'dmg more -20'],
        onKill: [],
        onRemove: []
      }],
      onKill: [],
      onRemove: []
    }],
    'baseMods': ['manaCost added 3', 'speed added 350', 'range added ' + BASE_MELEE_RANGE, 'projRange added ' + BASE_SPELL_RANGE, 'fireDmg more 1.8 perLevel', 'fireDmg added 1 perLevel', 'physDmg added 1 perLevel', 'physDmg converted 60 fireDmg', 'projSpeed more -80']
  },
  'exploding strike': {
    'prototype': ['basic melee'],
    'types': ['melee', 'fire'],
    'specs': [{
      type: 'melee',
      quals: [],
      color: color.FIRE_COLOR,
      onHit: [],
      onKill: [{
        type: 'circle',
        color: color.FIRE_COLOR,
        quals: ['dmg more 100'],
        onHit: [{ type: 'cone', color: color.FIRE_COLOR, quals: ['dmg more -50'] }],
        onKill: [],
        onRemove: []
      }],
      onRemove: []
    }],
    'baseMods': ['manaCost added 7', 'speed added 300', 'range added ' + BASE_MELEE_RANGE, 'fireDmg added 1 perLevel', 'physDmg added 1 perLevel', 'physDmg more 1.7 perLevel', 'physDmg converted 60 fireDmg', 'aoeRadius more -40', 'angle added 60', 'cooldownTime gainedas 100 physDmg'],
    'flavor': 'Creates fiery AoE explosions on kill dealing double damage and triggering fiery cones.'
  },
  'chain lightning': {
    'prototype': ['basic melee'],
    'types': ['melee', 'lightning'],
    'specs': [{
      type: 'melee',
      quals: [],
      color: color.LIGHT_COLOR,
      onHit: [],
      onKill: [{
        type: 'circle',
        color: color.LIGHT_COLOR,
        quals: ['dmg more 100'],
        onHit: [{
          type: 'circle',
          color: color.LIGHT_COLOR,
          quals: ['dmg more -50'],
          onHit: [],
          onKill: [],
          onRemove: []
        }],
        onKill: [],
        onRemove: []
      }],
      onRemove: []
    }],
    'baseMods': ['manaCost added 4', 'speed added 300', 'range added ' + BASE_MELEE_RANGE, 'lightDmg added 1 perLevel', 'physDmg added 1 perLevel', 'physDmg more 1.7 perLevel', 'physDmg converted 60 lightDmg', 'aoeRadius more -40', 'cooldownTime gainedas 100 physDmg'],
    'flavor': 'Creates chained electical AoE explosions on kill'
  },
  'splashing hit': {
    'prototype': ['basic melee'],
    'types': ['melee'],
    'specs': [{
      type: 'melee',
      quals: [],
      color: color.PHYS_COLOR,
      onHit: [{
        type: 'circle',
        color: color.PHYS_COLOR,
        quals: ['dmg more -20'],
        onHit: [],
        onKill: [],
        onRemove: []
      }],
      onKill: [],
      onRemove: []
    }],
    'baseMods': ['manaCost added 10', 'speed added 500', 'range added ' + BASE_MELEE_RANGE, 'physDmg more 2 perLevel', 'physDmg added 1 perLevel', 'aoeRadius more -60'],
    'flavor': 'Creates small AoE explosions on hit'
  },
  'blast arrow': {
    'prototype': ['basic range'],
    'types': ['range'],
    'specs': [{
      type: 'proj',
      quals: [],
      color: color.PHYS_COLOR,
      onHit: [{
        type: 'circle',
        color: color.PHYS_COLOR,
        quals: ['dmg more -20'],
        onHit: [],
        onKill: [],
        onRemove: []
      }],
      onKill: [],
      onRemove: []
    }],
    'baseMods': ['manaCost added 12', 'speed added 500', 'range added ' + BASE_RANGE_RANGE, 'physDmg more 1.3 perLevel', 'physDmg added 1 perLevel', 'physDmg more -40', 'aoeRadius more -60'],
    'flavor': 'Creates small AoE explosions on hit'
  },
  'piercing shot': {
    'prototype': ['basic range'],
    'types': ['range'],
    'specs': [{
      type: 'proj',
      quals: [],
      color: color.PHYS_COLOR,
      onHit: [{
        type: 'proj',
        color: color.PHYS_COLOR,
        quals: ['projCount added -100'],
        onHit: [{
          type: 'proj',
          color: color.PHYS_COLOR,
          quals: ['projCount added -100']
        }],
        onKill: [],
        onRemove: []
      }],
      onKill: [],
      onRemove: []
    }],
    'baseMods': ['manaCost added 12', 'speed added 600', 'range added ' + BASE_RANGE_RANGE, 'physDmg more 1.3 perLevel', 'physDmg added 1 perLevel'],
    'flavor': 'Pierces up to two enemies'
  },
  'explonential shot': {
    'prototype': ['basic range'],
    'types': ['range'],
    'specs': [{
      type: 'proj',
      quals: [],
      color: color.PHYS_COLOR,
      onHit: [{
        type: 'proj',
        color: color.PHYS_COLOR,
        quals: ['projCount added 8', 'dmg more -50'],
        onHit: [{
          type: 'proj',
          quals: ['projCount added 8', 'dmg more -90'],
          color: color.PHYS_COLOR,
          onHit: [{
            type: 'proj',
            color: color.PHYS_COLOR,
            quals: ['projCount added 8', 'dmg more -95']
          }]
        }],
        onKill: [],
        onRemove: []
      }],
      onKill: [],
      onRemove: []
    }],
    'baseMods': ['manaCost added 12', 'speed added 1000', 'cooldownTime added 8000', 'projCount more -100', 'range added ' + BASE_RANGE_RANGE, 'physDmg more 1.3 perLevel', 'physDmg added 1 perLevel', 'physDmg more -80', 'angle added 20'],
    'flavor': 'Spawns additional projectiles on hit'
  },
  'shiverstorm': {
    'prototype': ['basic spell'],
    'types': ['spell'],
    'specs': [{
      type: 'circle',
      color: color.COLD_COLOR,
      onHit: [{ type: 'circle', color: color.COLD_COLOR, quals: ['dmg more -50'] }]
    }],
    'baseMods': ['manaCost added 30', 'speed added 100', 'cooldownTime added 5000', 'range added ' + BASE_SPELL_RANGE / 2, 'coldDmg added 3 perLevel', 'coldDmg more 2 perLevel']
  },
  'plague field': {
    'prototype': ['basic spell'],
    'types': ['spell'],
    'specs': [{
      type: 'circle',
      color: color.POIS_COLOR,
      onHit: [{ type: 'circle', color: color.POIS_COLOR, quals: ['dmg more -50'] }]
    }],
    'baseMods': ['manaCost added 30', 'speed added 100', 'cooldownTime added 5000', 'range added ' + BASE_SPELL_RANGE / 2, 'poisDmg added 3 perLevel', 'poisDmg more 2 perLevel']
  },
  'thunderstorm': {
    'prototype': ['basic spell'],
    'types': ['spell'],
    'specs': [{
      type: 'circle',
      color: color.LIGHT_COLOR,
      onHit: [{ type: 'circle', color: color.LIGHT_COLOR, quals: ['dmg more -50'] }]
    }],
    'baseMods': ['manaCost added 30', 'speed added 100', 'cooldownTime added 5000', 'range added ' + BASE_SPELL_RANGE / 2, 'lightDmg added 3 perLevel', 'lightDmg more 2 perLevel']
  },
  'blazing inferno': {
    'prototype': ['basic spell'],
    'types': ['spell'],
    'specs': [{
      type: 'circle',
      color: color.FIRE_COLOR,
      onHit: [{ type: 'circle', color: color.FIRE_COLOR, quals: ['dmg more -50'] }]
    }],
    'baseMods': ['manaCost added 30', 'speed added 100', 'cooldownTime added 5000', 'range added ' + BASE_SPELL_RANGE / 2, 'fireDmg added 3 perLevel', 'fireDmg more 2 perLevel']
  },
  'sacrifice': {
    'prototype': ['basic spell'],
    'types': ['spell'],
    'specs': [{
      type: 'circle',
      color: '#400',
      onHit: [{ type: 'proj', color: '#900' }]
    }],
    'baseMods': ['manaCost added 0', 'cooldownTime added 30000', 'speed added 100', 'accuracy more 1000', 'aoeSpeed more -80', 'range added ' + BASE_SPELL_RANGE, 'physDmg added 100 perLevel', 'physDmg more 3 perLevel', 'physDmg gainedas -200 hpOnHit']
  },
  'ground smash': {
    'prototype': ['basic melee'],
    'types': ['melee', 'fire'],
    'specs': [{
      type: 'cone',
      color: color.FIRE_COLOR,
      quals: [],
      onHit: [{ type: 'proj', color: color.FIRE_COLOR }],
      onKill: [],
      onRemove: []
    }],

    'baseMods': ['manaCost added 3', 'speed added 400', 'range added ' + BASE_MELEE_RANGE, 'fireDmg more 1.5 perLevel', 'fireDmg added 1 perLevel', 'physDmg added 1 perLevel', 'physDmg converted 60 fireDmg', 'angle more 200', 'projRange more 500']
  },
  'ice slash': {
    'prototype': ['basic melee'],
    'types': ['melee', 'cold'],
    'specs': [{ type: 'melee', color: color.COLD_COLOR }],
    'baseMods': ['manaCost added 5', 'speed added 300', 'range added ' + BASE_MELEE_RANGE, 'coldDmg more 3 perLevel', 'coldDmg added 1 perLevel', 'physDmg added 1 perLevel', 'physDmg converted 60 coldDmg']
  },
  'lightning slash': {
    'prototype': ['basic melee'],
    'types': ['melee', 'lightning'],
    'specs': [{ type: 'melee', color: color.LIGHT_COLOR }],
    'baseMods': ['manaCost added 5', 'speed added 250', 'range added ' + BASE_MELEE_RANGE, 'lightDmg more 2 perLevel', 'lightDmg added 1 perLevel', 'physDmg added 1 perLevel', 'physDmg converted 60 lightDmg']
  },
  'poison slash': {
    'prototype': ['basic melee'],
    'types': ['melee', 'poison'],
    'specs': [{ type: 'melee', color: color.POIS_COLOR }],
    'baseMods': ['manaCost added 5', 'speed added 400', 'range added ' + BASE_MELEE_RANGE, 'poisDmg more 2 perLevel', 'poisDmg added 1 perLevel', 'physDmg added 1 perLevel', 'physDmg converted 60 poisDmg']
  },
  'speed shot': {
    'prototype': ['basic range'],
    'skillType': 'range',
    'types': ['proj'],
    'baseMods': ['manaCost added 3', 'physDmg more -35', 'physDmg added 1 perLevel', 'physDmg more 1.4 perLevel', 'speed added 250', 'range added ' + BASE_RANGE_RANGE]
  },
  'fire arrow': {
    'prototype': ['basic range'],
    'skillType': 'range',
    'types': ['proj', 'fire'],
    'specs': [{ type: 'proj', color: color.FIRE_COLOR }],
    'baseMods': ['manaCost added 6', 'speed added 300', 'range added ' + BASE_RANGE_RANGE, 'physDmg added 3 perLevel', 'fireDmg more 1.5 perLevel', 'physDmg converted 50 fireDmg']
  },
  'cold arrow': {
    'prototype': ['basic range'],
    'skillType': 'range',
    'types': ['proj', 'cold'],
    'specs': [{ type: 'proj', color: color.COLD_COLOR }],
    'baseMods': ['manaCost added 6', 'speed added 250', 'range added ' + BASE_RANGE_RANGE, 'physDmg added 1.2 perLevel', 'coldDmg more 3 perLevel', 'physDmg converted 50 coldDmg']
  },
  'lightning arrow': {
    'prototype': ['basic range'],
    'skillType': 'range',
    'types': ['proj', 'lightning'],
    'specs': [{ type: 'proj', color: color.LIGHT_COLOR }],
    'baseMods': ['manaCost added 6', 'speed added 200', 'range added ' + BASE_RANGE_RANGE, 'physDmg added 1 perLevel', 'lightDmg more 3 perLevel', 'physDmg converted 50 lightDmg']
  },
  'poison arrow': {
    'prototype': ['basic range'],
    'skillType': 'range',
    'types': ['proj', 'poison'],
    'specs': [{ type: 'proj', color: color.POIS_COLOR }],
    'baseMods': ['manaCost added 6', 'speed added 300', 'range added ' + BASE_RANGE_RANGE, 'physDmg added 1 perLevel', 'poisDmg more 3 perLevel', 'physDmg converted 50 poisDmg']
  },
  'headshot': {
    'prototype': ['basic'],
    'skillType': 'range',
    'types': ['proj'],
    'specs': [{
      type: 'proj',
      color: '#FFF',
      quals: [],
      onHit: [],
      onKill: [],
      onRemove: []
    }],
    'baseMods': ['manaCost added 13', 'speed added 500', 'range added ' + BASE_RANGE_RANGE, 'physDmg more 5 perLevel', 'projSpeed more 200', 'cooldownTime added 3000']
  },
  'incinerate': {
    'prototype': ['basic spell'],
    'skillType': 'spell',
    'types': ['proj', 'fire', 'spell'],
    'specs': [{ type: 'cone', color: color.FIRE_COLOR }],
    'baseMods': ['manaCost added 7', 'speed added 300', 'range added ' + BASE_SPELL_RANGE / 4, 'fireDmg added 2', 'fireDmg added 1 perLevel', 'fireDmg more 0.7 perLevel', 'physDmg converted 100 fireDmg', 'angle added 30']
  },
  'poison spray': {
    'prototype': ['basic spell'],
    'skillType': 'spell',
    'types': ['cone', 'pois', 'spell'],
    'specs': [{ type: 'cone', color: color.POIS_COLOR }],
    'baseMods': ['manaCost added 9', 'speed added 350', 'range added ' + BASE_RANGE_RANGE * 0.2, 'poisDmg added 4', 'poisDmg added 1 perLevel', 'poisDmg more 0.9 perLevel', 'physDmg converted 100 poisDmg', 'angle added 30']
  },
  'fire ball': {
    'prototype': ['basic spell'],
    'skillType': 'spell',
    'types': ['proj', 'fire', 'spell'],
    'specs': [{
      type: 'proj',
      color: color.FIRE_COLOR,
      onHit: [{ type: 'circle', color: color.FIRE_COLOR }]
    }],
    'baseMods': ['manaCost added 9', 'speed added 600', 'range added ' + BASE_SPELL_RANGE, 'fireDmg added 3 perLevel', 'fireDmg added 3', 'fireDmg more 0.5 perLevel', 'projRadius more 200', 'aoeRadius more -70'],
    'flavor': 'Goodness gracious, these balls are great!'
  },
  'ice ball': {
    'prototype': ['basic spell'],
    'skillType': 'spell',
    'types': ['proj', 'cold', 'spell'],
    'specs': [{
      type: 'proj',
      color: color.COLD_COLOR,
      onHit: [{ type: 'circle', color: color.COLD_COLOR }]
    }],
    'baseMods': ['manaCost added 9', 'speed added 600', 'range added ' + BASE_SPELL_RANGE, 'coldDmg added 3 perLevel', 'coldDmg added 3', 'coldDmg more 0.5 perLevel', 'projRadius more 200', 'aoeRadius more -70']
  },
  'lightning ball': {
    'prototype': ['basic spell'],
    'skillType': 'spell',
    'types': ['proj', 'lightning', 'spell'],
    'specs': [{
      type: 'proj',
      color: color.LIGHT_COLOR,
      onHit: [{ type: 'circle', color: color.LIGHT_COLOR }]
    }],
    'baseMods': ['manaCost added 9', 'speed added 600', 'range added ' + BASE_SPELL_RANGE, 'lightDmg added 3 perLevel', 'lightDmg added 3', 'lightDmg more 0.5 perLevel', 'projRadius more 200', 'aoeRadius more -50', 'projSpeed more 50']
  },
  'poison ball': {
    'prototype': ['basic spell'],
    'skillType': 'spell',
    'types': ['proj', 'poison', 'spell'],
    'specs': [{
      type: 'proj',
      color: color.POIS_COLOR,
      onHit: [{ type: 'circle', color: color.POIS_COLOR }]
    }],
    'baseMods': ['manaCost added 16', 'speed added 1000', 'range added ' + BASE_SPELL_RANGE * 0.7, 'poisDmg added 5 perLevel', 'poisDmg added 5', 'poisDmg more 0.5 perLevel', 'projRadius more 200', 'aoeRadius more -70']
  },
  'ice blast': {
    'prototype': ['basic spell'],
    'skillType': 'spell',
    'types': ['cone', 'cold', 'spell'],
    'specs': [{
      type: 'cone',
      color: color.COLD_COLOR,
      quals: [],
      onHit: [],
      onKill: [],
      onRemove: []
    }],
    'baseMods': ['manaCost added 5', 'speed added 400', 'range added ' + BASE_SPELL_RANGE / 4, 'coldDmg added 6', 'coldDmg added 3 perLevel', 'coldDmg more 0.7 perLevel', 'angle added 30']
  },
  'lightning spray': {
    'prototype': ['basic spell'],
    'skillType': 'spell',
    'types': ['cone', 'lightning', 'spell'],
    'specs': [{
      type: 'cone',
      color: color.LIGHT_COLOR,
      quals: [],
      onHit: [],
      onKill: [],
      onRemove: []
    }],
    'baseMods': ['manaCost added 5', 'speed added 400', 'range added ' + BASE_SPELL_RANGE / 4, 'lightDmg added 6', 'lightDmg added 3 perLevel', 'lightDmg more 0.7 perLevel', 'angle added 30']
  },
  'pressure wave': {
    'prototype': ['basic spell'],
    'skillType': 'spell',
    'types': ['cone', 'spell'],
    'specs': [{
      type: 'cone',
      color: color.PHYS_COLOR,
      quals: [],
      onHit: [],
      onKill: [],
      onRemove: []
    }],
    'baseMods': ['manaCost added 10', 'cooldownTime added 300', 'speed added 500', 'range added ' + BASE_SPELL_RANGE / 3, 'physDmg added 5 perLevel', 'aoeSpeed more 300', 'angle more 300']
  },
  'shadow dagger': {
    'prototype': ['basic spell'],
    'skillType': 'spell',
    'types': ['proj', 'spell'],
    'specs': [{ type: 'proj', color: '#000' }],
    'baseMods': ['manaCost added 10', 'cooldownTime added 5000', 'speed added 200', 'range added ' + BASE_SPELL_RANGE, 'physDmg added 10 perLevel']
  },
  'oblivion ray': {
    'prototype': ['basic spell'],
    'skillType': 'spell',
    'types': ['proj', 'spell'],
    'specs': [{ type: 'proj', color: '#000' }],
    'baseMods': ['manaCost added 20', 'projRadius more 300', 'projSpeed more -90', 'speed added 200', 'range added ' + BASE_SPELL_RANGE * 2, 'coldDmg added 5 perLevel', 'lightDmg added 5 perLevel']
  },
  'telekinesis': {
    'prototype': ['basic spell'],
    'skillType': 'spell',
    'types': ['proj', 'spell'],
    'specs': [{ type: 'proj', color: '#778' }],
    'baseMods': [
    //'maxMana gainedas 5 manaCost',
    'cooldownTime added 200', 'speed added 200', 'range added ' + BASE_SPELL_RANGE, 'physDmg added 6 perLevel']
  },
  'health suck': {
    'prototype': ['basic spell'],
    'skillType': 'spell',
    'types': ['proj', 'spell'],
    'baseMods': ['manaCost added 25', 'speed added 700', 'range added ' + BASE_SPELL_RANGE, 'physDmg added 9', 'physDmg added 1 perLevel', 'physDmg more 0.5 perLevel', 'physDmg gainedas 1 hpLeech']
  },
  'consume': {
    'prototype': ['basic melee'],
    'skillType': 'melee',
    'types': ['proj', 'spell'],
    'baseMods': ['manaCost added 25',
    //'cooldownTime added 3000',
    'speed added 3000', 'range added ' + BASE_MELEE_RANGE * 5, 'physDmg added 1 perLevel', 'physDmg more 0.5 perLevel', 'physDmg gainedas 500 hpLeech']
  },
  'nova': {
    'prototype': ['basic spell'],
    'skillType': 'spell',
    'types': ['proj', 'circle', 'spell'],
    'specs': [{
      type: 'circle',
      color: color.LIGHT_COLOR,
      quals: [],
      onHit: [],
      onKill: [],
      onRemove: []
    }],
    'baseMods': ['manaCost added 12', 'speed added 200', 'cooldownTime added 200', 'range added ' + BASE_SPELL_RANGE / 5, 'aoeRadius more -50', 'lightDmg added 3 perLevel', 'lightDmg more 1.2 perLevel']
  },
  'fire nova': {
    'prototype': ['basic spell'],
    'skillType': 'spell',
    'types': ['proj', 'aoecircle', 'spell'],
    'specs': [{ type: 'circle', color: color.FIRE_COLOR }],
    'baseMods': ['manaCost added 12', 'speed added 200', 'cooldownTime added 200', 'range added ' + BASE_SPELL_RANGE / 5, 'fireDmg added 3 perLevel', 'fireDmg more 1.2 perLevel', 'aoeRadius more -50']
  },
  'ice nova': {
    'prototype': ['basic spell'],
    'skillType': 'spell',
    'types': ['proj', 'aoecircle', 'spell'],
    'specs': [{ type: 'circle', color: color.COLD_COLOR }],
    'baseMods': ['manaCost added 12', 'speed added 200', 'cooldownTime added 200', 'range added ' + BASE_SPELL_RANGE / 5, 'coldDmg added 3 perLevel', 'coldDmg more 1.2 perLevel', 'aoeRadius more -50']
  },
  'poison nova': {
    'prototype': ['basic spell'],
    'skillType': 'spell',
    'types': ['proj', 'aoecircle', 'spell'],
    'specs': [{ type: 'circle', color: color.POIS_COLOR }],
    'baseMods': ['manaCost added 12', 'speed added 200', 'cooldownTime added 200', 'range added ' + BASE_SPELL_RANGE / 5, 'poisDmg added 3 perLevel', 'poisDmg more 1.2 perLevel', 'aoeRadius more -50']
  },
  'holy light': {
    'prototype': ['basic spell'],
    'skillType': 'spell',
    'types': ['proj', 'aoecircle', 'spell'],
    'specs': [{ type: 'circle', color: color.cbone }],
    'baseMods': ['manaCost added 20', 'speed added 200', 'cooldownTime added 200', 'range added ' + BASE_SPELL_RANGE / 5, 'physDmg added 3 perLevel', 'physDmg more 1.2 perLevel', 'aoeRadius more -50']
  },
  'flame cone': {
    'prototype': ['basic'],
    'skillType': 'melee',
    'types': ['cone', 'melee'],
    'specs': [{
      type: 'cone',
      color: color.FIRE_COLOR,
      quals: [],
      onHit: [],
      onKill: [],
      onRemove: []
    }],
    'baseMods': ['manaCost added 5', 'speed added 200', 'range added ' + BASE_MELEE_RANGE, 'aoeRadius more 50', 'fireDmg added 3 perLevel']
  },
  'lethal strike': {
    'prototype': ['basic melee'],
    'skillType': 'melee',
    'types': ['melee'],
    'baseMods': ['manaCost added 20', 'speed added 200', 'range added ' + BASE_MELEE_RANGE, 'physDmg added 1 perLevel', 'physDmg more 2 perLevel', 'physDmg more 100', 'cooldownTime added 3000']
  },
  'deadly volley': {
    'prototype': ['basic'],
    'skillType': 'range',
    'types': ['proj'],
    'specs': [{
      type: 'proj',
      color: '#FFF',
      quals: [],
      onHit: [],
      onKill: [],
      onRemove: []
    }],
    'baseMods': ['speed added 200', 'range added ' + BASE_RANGE_RANGE, 'manaCost added 20', 'physDmg added 1 perLevel', 'physDmg more 0.5 perLevel', 'projCount added 16', 'physDmg more -50', 'angle more -70', 'cooldownTime added 3000']
  }
};


},{"./colors":11}],17:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
var weapon = exports.weapon = {
  ////////////////////
  /// MELEE //////////
  ////////////////////
  'cardboard sword': {
    'mods': ['physDmg added 6', 'physDmg more 0.5 perLevel'],
    'weaponType': 'melee'
  },
  'hand axe': {
    'mods': ['speed more -20', 'physDmg added 10', 'physDmg more 0.55 perLevel'],
    'weaponType': 'melee'
  },
  'stone hammer': {
    'mods': ['speed more 20', 'physDmg added 10', 'physDmg more 1.1 perLevel'],
    'weaponType': 'melee'
  },
  'falchion': {
    'mods': ['speed more -25', 'physDmg added 12', 'physDmg more 0.7 perLevel'],
    'weaponType': 'melee'
  },
  'morning star': {
    'mods': ['speed more 100', 'physDmg added 14', 'physDmg more 2 perLevel'],
    'weaponType': 'melee'
  },
  'long sword': {
    'mods': ['speed more -20', 'speed more -0.1 perLevel', 'physDmg added 16', 'physDmg more 0.6 perLevel'],
    'weaponType': 'melee'
  },
  'spikey mace': {
    'mods': ['speed more 50', 'physDmg added 16', 'physDmg more 1.5 perLevel'],
    'weaponType': 'melee'
  },
  'spiked battle axe': {
    'mods': ['speed more -30', 'physDmg added 20', 'physDmg more 0.8 perLevel', 'accuracy more 2 perLevel'],
    'weaponType': 'melee'
  },
  'winged axe': {
    'mods': ['range more 50', 'range more 0.1 perLevel', 'physDmg added 25', 'physDmg more 0.8 perLevel'],
    'weaponType': 'melee'
  },
  'dream eater': {
    'mods': ['physDmg gainedas 0.5 hpLeech', 'physDmg gainedas 0.5 manaLeech', 'physDmg added 50', 'physDmg more 0.75 perLevel'],
    'weaponType': 'melee'
  },
  'tanto': {
    'mods': ['range more -60', 'speed more -30', 'physDmg added 1 perLevel', 'physDmg more 0.75 perLevel'],
    'weaponType': 'melee'
  },
  'katana': {
    'mods': ['speed more -30', 'physDmg added 1 perLevel', 'physDmg more 0.7 perLevel'],
    'weaponType': 'melee'
  },
  'wakizashi': {
    'mods': ['range more -90', 'accuracy more 100', 'physDmg added 1 perLevel', 'physDmg more 0.8 perLevel'],
    'weaponType': 'melee'
  },
  'barbarian blade': {
    'mods': ['strength gainedas 0.2 moveSpeed', 'strength more 0.2 perLevel', 'physDmg added 23', 'physDmg more 0.6 perLevel'],
    'weaponType': 'melee'
  },
  'grounding rod': {
    'mods': ['physDmg converted 100 lightDmg', 'physDmg added 21', 'physDmg more 0.55 perLevel'],
    'weaponType': 'melee'
  },
  'pike': {
    'mods': ['physDmg added 30', 'range added 1000', 'speed more 80', 'physDmg more 1.8 perLevel'],
    'weaponType': 'melee'
  },
  'angelic blade': {
    'mods': ['physDmg added 2 perLevel', 'fireDmg added 2 perLevel', 'coldDmg added 2 perLevel', 'lightDmg added 2 perLevel', 'meleeDmg more 1 perLevel'],
    'weaponType': 'melee'
  },
  ////////////////////
  ///// RANGED ///////
  ////////////////////
  'wooden bow': {
    'mods': ['physDmg added 5', 'physDmg more 0.5 perLevel'],
    'weaponType': 'range'
  },
  'elf bow': {
    'mods': ['projSpeed more 50', 'physDmg added 7', 'physDmg more 0.6 perLevel'],
    'weaponType': 'range'
  },
  'hand crossbow': {
    'mods': ['physDmg added 7', 'speed more -30', 'physDmg more 0.6 perLevel'],
    'weaponType': 'range'
  },
  'crossbow': {
    'mods': ['speed more 30', 'physDmg added 9', 'physDmg more 0.85 perLevel'],
    'weaponType': 'range'
  },
  'composite bow': {
    'mods': ['range more 20', 'physDmg added 20', 'physDmg more 0.75 perLevel'],
    'weaponType': 'range'
  },
  'shuriken': {
    'mods': ['projCount added 2', 'range more -40', 'physDmg added 15', 'physDmg more 0.7 perLevel'],
    'weaponType': 'range'
  },
  'yumi': {
    'mods': ['physDmg added 20', 'physDmg more 0.8 perLevel'],
    'weaponType': 'range'
  },
  'compound bow': {
    'mods': ['physDmg added 20', 'physDmg more 0.6 perLevel', 'projSpeed more 0.5 perLevel'],
    'weaponType': 'range'
  },
  ////////////////////
  ////// SPELL ///////
  ////////////////////
  'simple wand': {
    'mods': ['spellDmg more 15', 'spellDmg more 0.5 perLevel'],
    'weaponType': 'spell'
  },
  'knobby wand': {
    'mods': ['spellDmg more 15', 'spellDmg more 0.7 perLevel', 'speed more -0.1 perLevel'],
    'weaponType': 'spell'
  },
  'pewter wand': {
    'mods': ['spellDmg more 50', 'spellDmg more 1.5 perLevel', 'eleResistAll more -30'],
    'weaponType': 'spell'
  },
  'delicate wand': {
    'mods': ['speed more -20', 'spellDmg more 25', 'spellDmg more 1 perLevel'],
    'weaponType': 'spell'
  },
  'dragonstone wand': {
    'mods': ['spellDmg more 0.8 perLevel', 'fireDmg more 1 perLevel'],
    'weaponType': 'spell'
  },
  'fairy wand': {
    'mods': ['wisdom added 3 perLevel', 'spellDmg more 1.2 perLevel'],
    'weaponType': 'spell'
  },
  'star wand': {
    'mods': ['spellDmg more 50', 'spellDmg more 1 perLevel'],
    'weaponType': 'spell'
  },
  'demon wand': {
    'mods': ['hpRegen added -50', 'spellDmg more 1.4 perLevel'],
    'weaponType': 'spell'
  },
  'succubus skull': {
    'mods': ['maxHp converted 70 maxMana', 'spellDmg more 2 perLevel'],
    'weaponType': 'spell'
  },
  'magic wand': {
    'mods': ['speed more -20', 'spellDmg more 1.2 perLevel'],
    'weaponType': 'spell',
    'flavor': 'BZZZZZZZZZZZZZZ'
  }
};


},{}],18:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
var zone = exports.zone = {
  'spooky dungeon': {
    'choices': ['skeleton', 'skeleton archer', 'skeleton mage', 'fire skeleton', 'skeleton embermage', 'skeleton warmage', 'skeleton champion', 'skeleton highlord', 'skeleton pyromage'],
    'weights': [50, 20, 10, 10, 5, 10, 10, 10, 10],
    'boss': 'skeleton king',
    'roomCount': 20,
    'quantity': [1, 1, 3],
    'materials': ['metal', 'ember', 'blood', 'blade', 'spike', 'shield', 'potion', 'spine']
  },
  'dark forest': {
    'choices': ['wood nymph', 'bat', 'elf', 'elf marksman', 'ent', 'dahd djinn', 'umuri', 'elf sharpshooter'],
    'weights': [2000, 1500, 1500, 200, 500, 20, 5, 5],
    'boss': 'elf king',
    'roomCount': 20,
    'quantity': [1, 2, 3],
    'materials': ['metal', 'feather', 'eye', 'blade', 'shield', 'spike', 'needle', 'wing', 'elf ear']
  },
  'clockwork ruins': {
    'choices': ['gnome', 'gnome electrician', 'roflcopter', 'harpy', 'shock golem', 'mechcinerator', 'mechfridgerator', 'mecha watt', 'ser djinn', 'mecha tank', 'gnome chuck testa'],
    'weights': [200, 100, 100, 100, 50, 50, 50, 50, 1, 50, 5],
    'boss': 'sir mechs-a-lot',
    'roomCount': 20,
    'quantity': [1, 2, 3],
    'materials': ['spark', 'brain', 'blade', 'razor', 'spike', 'potion', 'converter', 'gnome']
  },
  'aggro crag': {
    'choices': ['goblin', 'goblin priest', 'goblin artillery', 'goblin barbarian', 'fire skeleton', 'fire golem', 'kei djinn', 'goblin bombardier'],
    'weights': [200, 100, 100, 100, 100, 50, 1, 10],
    'boss': 'the inhuman torch',
    'roomCount': 20,
    'quantity': [1, 2, 3],
    'materials': ['ember', 'muscle', 'blood', 'brain', 'shield', 'blade', 'razor', 'crag shard']
  },
  'hostile marsh': {
    'choices': ['zombie', 'angry imp', 'dart imp', 'imp shaman', 'marshwalker', 'mad ape', 'al-err djinn', 'scalp collector', 'toxic golem', 'imp chieftain', 'hydra'],
    'weights': [200, 100, 100, 100, 80, 80, 1, 50, 20, 10, 20],
    'boss': 'swamp thing',
    'roomCount': 20,
    'quantity': [1, 2, 6],
    'materials': ['spore', 'feather', 'brain', 'shield', 'spike', 'needle', 'potion', 'imp head']
  },
  'icy tunnel': {
    'choices': ['frost skeleton', 'ice golem', 'frost mage', 'frozen warrior', 'yeti', 'wight', 'frow djinn', 'shiver spirit', 'jesse blueman', 'frost goliath'],
    'weights': [200, 100, 50, 80, 70, 100, 1, 20, 1, 50],
    'boss': 'walter wight',
    'roomCount': 20,
    'quantity': [1, 2, 4],
    'materials': ['ice', 'brain', 'blade', 'razor', 'spike', 'converter', 'wight snow']
  },
  'gothic castle': {
    'choices': ['shadow knight', 'ghoul', 'vampire', 'living statue', 'gargoyle', 'minotaur', 'wraith', 'death knight'],
    'weights': [20, 10, 10, 10, 20, 20, 10, 10],
    'boss': 'acheron',
    'roomCount': 15,
    'quantity': [1, 3, 6],
    'materials': ['metal', 'blood', 'feather', 'muscle', 'brain', 'eye', 'spike', 'blade', 'shield', 'needle', 'gargoyle']
  },
  'anthropomorphic savanah': {
    'choices': ['buzzard', 'hyena', 'lion', 'hippo', 'honey badger', 'cheetah', 'bee'],
    'weights': [1, 1],
    'boss': 'bat',
    'roomCount': 20,
    'quantity': [20, 500, 5000]
  },
  'decaying temple': {
    'choices': ['buddha', 'ninja', 'ninja assassin', 'samurai', 'fallen samurai', 'tanuki', 'CFTS', 'the z'],
    'weights': [150, 200, 100, 200, 200, 100, 1, 50],
    'boss': 'treasure hunter',
    'roomCount': 15,
    'quantity': [2, 2, 6],
    'materials': ['metal', 'blood', 'brain', 'eye', 'feather', 'spike', 'blade', 'business card']
  },
  'lich tower': {
    'choices': ['walking meat', 'lich', 'withering goliath', 'abomination', 'slagathor', 'ice lich', 'tormented colossus'],
    'weights': [400, 200, 50, 100, 1, 10, 10],
    'boss': 'lichie lich',
    'quantity': [2, 2, 7],
    'materials': ['metal', 'brain', 'potion', 'razor', 'blood', 'spike', 'blade', 'lichen']
  },
  'beginners field': {
    'choices': ['baby slime', 'slime', 'big slime', 'huge slime', 'gigantic slime', 'adventurer\'s corpse', 'adventuring slime', 'angry puddle'],
    'weights': [100, 500, 1000, 500, 250, 300, 0, 500],
    'boss': 'king slime',
    'quantity': [1, 0, 0],
    'materials': ['slime', 'blood', 'brain', 'muscle', 'shield', 'blade', 'spike', 'needle']
  },
  'wicked dream': {
    'choices': ['baku', 'incubus', 'succubus', 'lucid dreamer', 'tall man', 'freddy kooler', 'it', 'your biggest fear'],
    'weights': [1000, 300, 200, 100, 50, 50, 50, 10],
    'boss': 'cthulhu',
    'roomCount': 20,
    'quantity': [2, 2, 5],
    'credit': 'Nemek',
    'materials': ['brain', 'blood', 'razor', 'mirror', 'nightmare', 'spark', 'ice']
  },
  'imperial barracks': {
    'choices': ['pikeman', 'crossbowman', 'griffon', 'crusader', 'cavalier', 'templar', 'champion', 'zealot', 'paladin', 'seraph'],
    'weights': [1000, 500, 500, 300, 50, 50, 50, 5, 10, 5],
    'boss': 'lost seraph',
    'roomCount': 20,
    'quantity': [2, 2, 5],
    'credit': 'WirelessKFC',
    'materials': ['brain', 'blood', 'razor', 'spike', 'sigil', 'spark', 'metal']
  },
  'forgotten tomb': {
    'choices': ['mummy', 'scarab', 'pharaoh', 'anubis', 'snake'],
    'weights': [1, 1],
    'boss': 'bat',
    'roomCount': 20,
    'quantity': [20, 500, 5000]
  },
  'shipwreck cove': {
    'choices': ['swashbucker', 'cannoneer', 'drowned corpse', 'parrot', 'monkey', 'mermaid', 'first mate'],
    'weights': [1, 1],
    'boss': 'bat',
    'roomCount': 20,
    'quantity': [20, 500, 5000]
  },
  'demonic laboroatory': {
    'choices': ['stitchling', 'mad scientist', 'evil grad student', 'blood golem'],
    'weights': [20, 10, 10],
    'boss': 'pigbearman',
    'roomCount': 20,
    'quantity': [2, 3, 4]
  },
  'scarred plains': {
    'choices': ['troll', 'cyclops', 'harpy', 'bandit', 'giant', 'frost giant'],
    'weights': [20, 10, 10],
    'boss': 'pigbearman',
    'roomCount': 20,
    'quantity': [3, 3, 6]
  },
  'hordecave': {
    'choices': ['vampire', 'shadow knight'],
    'weights': [1, 1],
    'boss': 'bat',
    'roomCount': 20,
    'quantity': [20, 500, 5000]
  },
  'halls of pain': {
    'choices': ['vampire', 'shadow knight', 'skeleton king', 'elf king', 'sir mechs-a-lot', 'flame dragon', 'scalp collector', 'walter wight'],
    'weights': [1, 1, 1, 1, 1, 1, 1, 1],
    'boss': 'vampire',
    'roomCount': 20,
    'quantity': [20, 500, 5000]
  },
  'dojo': {
    'choices': ['skeleton king'],
    'weights': [1],
    'boss': 'dummy',
    'roomCount': 10,
    'quantity': [10, 0, 0]
  },
  'empty dojo': {
    'choices': [],
    'weights': [],
    'boss': 'dummy',
    'roomCount': 10,
    'quantity': [0, 0, 0]
  }
};


},{}],19:[function(require,module,exports){
'use strict';

var _firebase = require('firebase');

var _underscore = require('underscore');

var _ = _interopRequireWildcard(_underscore);

var _globals = require('./globals');

var _utils = require('./utils');

var _constants = require('./constants');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var LOG_FNS = [debug, info, UI, warning, error, stack];
var LOG_NAMES = ['debug', 'info', 'UI', 'warning', 'error', 'stack'];

var FB;
var FBL;
var timeLog;
var uid;
var sessionId;
var version;
var deathCount = '';
var potionCount = '';

function init(v, sid) {
  console.log('log init');
  version = v;
  sessionId = sid;
  uid = localStorage.getItem('uid');

  if (uid) {
    warning('Recovered UID, resuming.');
  } else {
    warning('UID not found, creating new one.');
    uid = Math.floor(Math.random() * Math.pow(2, 32));
    localStorage.setItem('uid', uid);
  }

  FB = new _firebase.Firebase('https://fiery-heat-4226.firebaseio.com');
  FBL = FB.child('logs').child(uid).child(version);
  FBL.child('logs').push('starting');
  FBL.child('sessionOrder').push(sessionId);
  this.FB = FB;
  timeReport();
}

function timeReport(tc) {
  var timeLog = FBL.child('time').child(sessionId).child(Math.floor(_globals.gl.time).toString());
  timeLog.child('servertime').set(_firebase.Firebase.ServerValue.TIMESTAMP);
  timeLog.child('local-time').set(new Date().getTime());
  if (tc) {
    timeLog.child('timeCoef').set(tc);
  }
}

function enterZone(zoneName) {
  FBL.child('currentZone').set(zoneName);
}

function prestige(prestigeAmount) {
  FBL.child('prestiges').push('' + new Date() + ' - ' + prestigeAmount);
}

function reportData(game) {
  FBL.child('name').set(game.hero.name);
  FBL.child('version').set(_globals.gl.VERSION_NUMBER);
  FBL.child('lastReport').set(String(new Date()));
  FBL.child('level').set(game.hero.level);
  var data = game.toJSON();
  FBL.child('equipped').set(data.equipped);
  _.each(data.equipped, function (name, slot) {
    var cards = _.findWhere(data.inv, { 'name': name });
    FBL.child('cards').child(slot + 'cards').set(cards.cardNames.join(', '));
  });
  FBL.child('skillchain').set(data.skillchain);
  _.each(data.skillchain, function (name, slot) {
    var cards = _.findWhere(data.inv, { 'name': name });
    FBL.child('cards').child('s' + slot + 'cards').set(cards.cardNames.join(', '));
  });
  FBL.child('zone').set(data.zone.nextZone);
  FBL.child('unlockedZones').set(data.zone.unlockedZones);

  timeReport(game.timeCoefficient);
  if (_globals.gl.ZONE_LEVEL_SPACING !== 5) {
    FB.child('panel').child('weird').push(localStorage.getItem('uid') + ' - gl.ZONE_LEVEL_SPACING: ' + _globals.gl.VERSION_NUMBER);
  }
}

function reportWinner(hero, zone) {
  if (hero.name === 'some newbie') {
    error('default name, not elligible for leaderboard');
    return;
  }
  var msg = zone.unlockedZones + ':' + hero.name + ':' + hero.level + ':' + zone.getZoneFromNum(zone.unlockedZones).nameStr + ':' + zone.getZoneFromNum(zone.nextZone).nameStr + ':' + deathCount + ':' + potionCount + ':';

  _.each(hero.skillchain.skills, function (skill) {
    if (skill === undefined) {
      return;
    }
    msg += (0, _utils.firstCap)(skill.name) + ', ';
  });
  msg = msg.slice(0, msg.length - 2);
  msg += ':' + (0, _utils.firstCap)(hero.lastDeath);
  // error('leaderboard push: ' + msg);

  if (hero.versionCreated === '0-3-1') {
    FB.child('leaderboard').child('BARRACKS2').child(uid).set(msg);
  } else {
    FB.child('leaderboard').child('legacy').child(hero.versionCreated).child(uid).set(msg);
  }
}

function reportNewBuild() {
  FBL.child('deathCount').set(0);
  FBL.child('potionCount').set(0);
  FB.child(version).child('newBuilds').child(uid).set(_firebase.Firebase.ServerValue.TIMESTAMP);
}

function levelUp(lvl) {
  FBL.child('level').set(lvl);
}

function reportClear(game) {
  var equipped = [];
  var build = game.saveBuild();
  _.each(build.equipped, function (val, key) {
    equipped.push(val);
  });
  _.each(build.skillchain, function (val, key) {
    equipped.push(val);
  });
  _.each(build.inv, function (item) {
    equipped = equipped.concat(item.cardNames);
  });

  var clearLog = '' + localStorage.getItem('uid') + ':' + game.hero.level + ':' + game.zone.nameStr + ':' + equipped.join(',');
  // warning('reporting clear: ' + clearLog);
  FBL.child('clearLogs').child(clearLog).set(_firebase.Firebase.ServerValue.TIMESTAMP);
  // TODO - add time to zone clear
}

function handleDonationToken(token, amount) {
  var id = uid || localStorage.getItem('uid');
  var savedDonation = {
    amount: amount,
    uid: id,
    date: new Date().toString(),
    tokenId: token.id,
    email: token.email,
    type: token.type,
    version: _globals.gl.VERSION_NUMBER
  };
  FB.child('panel').child('payments').child(uid).set(savedDonation);
  error('Donation! token: %s', JSON.stringify(token));
}

function donateAttempt(amount) {
  FB.child('panel').child('donateAttempts').push(localStorage.getItem('uid') + ': ' + new Date() + ' ' + amount);
}

function weird(s) {
  // fn used for reporting hacking and similar attempts
  FB.child('panel').child('weird').child(s).push(localStorage.getItem('uid') + ': ' + new Date());
}

function reportDeath(msg) {
  warning(msg);
  FBL.child('deaths').push(msg);
  var dc = FBL.child('deathCount');
  dc.transaction(function (curr_val) {
    deathCount = (curr_val || 0) + 1;
    return deathCount;
  });
}

function reportPotion() {
  var dc = FBL.child('potionCount');
  dc.transaction(function (curr_val) {
    potionCount = (curr_val || 0) + 1;
    return potionCount;
  });
}

function reportBuild(slot, build) {
  FBL.child('loadedBuilds').child(slot).set(build);
}

function feedback(msg) {
  if (msg && msg.length) {
    var hasContent = msg.indexOf('says: ') < msg.length - 6;
    if (hasContent) {
      FB.child('panel').child('feedback').child(_globals.gl.VERSION_NUMBER).push(uid + ' - ' + msg);
    }
  }
}

function fileLine() {
  var s = new Error().stack.split('\n')[3];
  return s.slice(s.indexOf('(') + 1, s.length - 1);
}

function dateStr() {
  return new Date().toString().slice(4, -15);
}

function debug() {
  var a = arguments;
  a[0] = 'DEBUG ' + fileLine() + ' ' + a[0];
  console.log('%c' + sprintf.apply(null, a), 'color: blue');
}

function info() {
  var a = arguments;
  a[0] = 'INFO ' + fileLine() + ' ' + a[0];
  console.log('%c' + sprintf.apply(null, a), 'color: green');
}

function warning() {
  var a = arguments;
  a[0] = 'WARNING ' + fileLine() + ' ' + a[0];
  console.log('%c' + sprintf.apply(null, a), 'color: orange');
}

function error() {
  var a = arguments;
  logFB('ERROR:' + sprintf.apply(null, a) + '  @' + _globals.gl.time);
  a[0] = 'ERROR ' + fileLine() + ' ' + a[0];
  console.log('%c' + sprintf.apply(null, a), 'color: red');
}

//  call with 'log.line(new Error(), 'your text here');
function stack() {
  var a = arguments;
  a[0] = new Error().stack.replace(/   at /g, '').split('\n').slice(2).join('\n') + '\n  ' + a[0];
  console.log('%c' + sprintf.apply(null, a), 'color: purple');
}

function UI() {
  var a = arguments;
  a[0] = 'UI: ' + fileLine() + ' ' + a[0];
  console.log('%c' + sprintf.apply(null, a), 'color: cyan');
}

function logFB(str) {
  // FBL.child('logs').push(str);
}

function tmpr(s) {
  var id = uid || localStorage.getItem('uid');
  var name = 'Unable to retreive name';
  try {
    name = JSON.parse(s).hero.name;
  } catch (e) {
    error('%s when trying to get hero name', String(e));
  }
  FB.child('tmprs').child(id).push(version + ' - ' + name + ' - ' + String(new Date()));
}

var extender = {
  init: init,
  timeReport: timeReport,
  reportData: reportData,
  reportWinner: reportWinner,
  reportClear: reportClear,
  reportPotion: reportPotion,
  reportNewBuild: reportNewBuild,
  enterZone: enterZone,
  levelUp: levelUp,
  handleDonationToken: handleDonationToken,
  donateAttempt: donateAttempt,
  feedback: feedback,
  logFB: logFB,
  reportDeath: reportDeath,
  reportBuild: reportBuild,
  tmpr: tmpr,
  weird: weird,
  prestige: prestige
};

for (var key in extender) {
  extender[key] = function () {};
}

var clear = false;

for (var i = 0; i < LOG_FNS.length; i++) {
  if (clear || _constants.LOG_LEVEL === LOG_NAMES[i]) {
    extender[LOG_NAMES[i]] = LOG_FNS[i];
    clear = true;
  } else {
    extender[LOG_NAMES[i]] = function () {};
  }
}

Object.assign(module.exports, extender);


},{"./constants":3,"./globals":9,"./utils":25,"firebase":31,"underscore":33}],20:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GameModel = undefined;
exports.onReady = onReady;

var _itemref = require('itemref/itemref');

var _jquery = require('jquery');

var _jquery2 = _interopRequireDefault(_jquery);

var _underscore = require('underscore');

var _ = _interopRequireWildcard(_underscore);

var _drops = require('./drops');

var dropsLib = _interopRequireWildcard(_drops);

var _entity = require('./entity');

var entity = _interopRequireWildcard(_entity);

var _globals = require('./globals');

var _inventory = require('./inventory');

var inv = _interopRequireWildcard(_inventory);

var _log = require('./log');

var _log2 = _interopRequireDefault(_log);

var _model = require('./model');

var _storage = require('./storage');

var storage = _interopRequireWildcard(_storage);

var _views = require('./views');

var views = _interopRequireWildcard(_views);

var _zone = require('./zone');

var zone = _interopRequireWildcard(_zone);

var _statsTracker = require('./stats-tracker');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var STEP_SIZE = 10; /*
                       Version Number Order:
                       v0-1-1b, 0-1-2, 0-1-3, 0-1-4, 0-1-5, 0-1-6, 0-1-7
                       0-1-8, 0-1-9, 0-1-10, 0-1-11, 0-1-12, 0-1-13, 0-1-14, 0-1-15,
                       0-1-16, 0-1-17, 0-1-18, 0-1-19 0-1-20 0-1-21, 0-1-22, 0-1-23,
                       0-1-24, 0-1-25
                       0-2-0, 0-2-1, 0-2-2, 0-2-3, 0-2-4, 0.2.5, 0.2.6, 0.2.7, 0.2.8
                       0-2-9, 0-2-10, 2-1-11, 0-2-12, 0-2-13, 0-2-14, 0-2-15, 0-2-16
                       0-2-17, 0-2-18, 0-2-19, 0-2-20, 0-2-21, 0-2-22, 0-2-23, 0-2-24
                       0-2-25, 0-2-26, 0-2-27, 0-2-28, 0-2-29, 0-2-30, 0-2-31
                       0-3-0
                     */

var MAX_STEP = 500;
var SPEEDS_UP = {
  0: 0.1,
  0.1: 0.2,
  0.2: 0.5,
  0.5: 1,
  1: 2,
  2: 5,
  5: 10,
  10: 50,
  50: 250,
  250: 1000,
  1000: 1000
};
var SPEEDS_DOWN = {
  1000: 250,
  250: 50,
  50: 10,
  10: 5,
  5: 2,
  2: 1,
  1: 0.5,
  0.5: 0.2,
  0.2: 0.1,
  0.1: 0,
  0: 0
};

var globalStart = new Date().getTime();

function onReady() {
  _globals.gl.time = 0;
  _globals.gl.settings = {};
  _globals.gl.sessionId = Math.floor(Math.random() * 10000);
  if (localStorage.getItem('clientId') == null) {
    var newClientId = Math.floor(Math.random() * 10000000);
    localStorage.setItem('clientId', newClientId);
    _globals.gl.clientId = newClientId;
  } else {
    _globals.gl.clientId = localStorage.getItem('clientId');
  }
  _globals.gl.FB = new Firebase('https://fiery-heat-4226.firebaseio.com');
  var auth = _globals.gl.FB.getAuth();
  console.log('auth', auth);
  if (auth !== null) {
    if (auth.uid === undefined) {
      throw 'how do i have valid auth but no uid?';
    }
    _globals.gl.FB.child('accounts').child(auth.uid).child('lastClientId').set(_globals.gl.clientId);
    _globals.gl.FB.child('accounts').child(auth.uid).child('clientIds').child(_globals.gl.clientId).set(Firebase.ServerValue.TIMESTAMP);
    _globals.gl.FB.child('accounts').child(auth.uid).child('email').set(auth.password.email);

    if (auth !== null) {
      console.log('signing in as ' + _globals.gl.FB.getAuth().uid);
      if (auth !== _globals.gl.accountId) {}
      _globals.gl.accountId = auth.uid;
    } else {
      console.log('have account, but not signed in');
    }

    // code for taking control of account goes here
  }

  _globals.gl.VERSION_NUMBER = '0-3-1';

  _log2.default.init(_globals.gl.VERSION_NUMBER, _globals.gl.sessionId);

  _globals.gl.ZONE_LEVEL_SPACING = 5;
  (0, _jquery2.default)('title').html('Dungeons of Derp v' + _globals.gl.VERSION_NUMBER.replace(/\-/g, '.') + ' ALPHA');

  _log2.default.info('onReady');

  var gameModel = new GameModel();
  // gl.game = gameModel;
  // gl.validateZones = gameModel.validateZones.bind(gameModel);

  var gameView = new views.GameView({}, gameModel);

  // TODO remove
  _globals.gl.gameView = gameView;

  var keyHandler = new KeyHandler(gameModel);
  (0, _jquery2.default)(window).on('keydown', keyHandler.onKeydown.bind(keyHandler));
}

var GameModel = exports.GameModel = _model.Model.extend({
  initialize: function initialize() {
    this.lastSave = 0;

    _globals.gl.builds = [];

    this.inv = new inv.ItemCollection();
    this.cardInv = new inv.CardCollection();
    this.recycleManager = new inv.RecycleManager(this.inv, this.cardInv);
    this.matInv = new inv.MaterialManager(this.cardInv);
    _globals.gl.canLevelCard = this.matInv.canLevelCard.bind(this.matInv);

    this.newStateManager = new inv.NewStateManager(this.inv, this.cardInv);
    this.hero = new entity.newHeroSpec(this.inv, this.cardInv, this.matInv);
    this.cardInv.equipped = this.hero.equipped;
    this.cardInv.skillchain = this.hero.skillchain;
    _globals.gl.cardSort = this.cardInv.sort.bind(this.cardInv);
    _globals.gl.pause = this.triggerPause.bind(this);
    _globals.gl.setMoveAngle = this.setHeroMoveAngle.bind(this);
    this.settings = this.defaultSettings();
    this.zone = new zone.ZoneManager(this.hero, this.settings);
    _globals.gl.getMonStats = this.zone.getMonStats;
    _globals.gl.valMons = this.zone.valMons;

    _globals.gl.saveBuild = this.saveBuild.bind(this);
    _globals.gl.loadBuild = this.loadBuild.bind(this);
    _globals.gl.renameBuild = this.renameBuild;

    this.recycleManager.zone = this.zone;

    this.gameTime = new Date().getTime();
    this.curTime = this.gameTime;
    this.gameSpeed = 1;

    var loadSuccess = this.load();
    if (!loadSuccess) {
      this.noobGear();
      _log2.default.error('No save data found, starting new character with sessionId: %s', _globals.gl.sessionId);
    }

    this.zone.settings = this.settings; // Hack, zone needs a ref to settings
    // and loading erases it
    _globals.gl.settings = this.settings;
    this.zone.newZone(this.zone.nextZone);

    this.zonesCleared = 0;
    this.deaths = 0;

    this.mspf = 16;

    this.listenTo(_globals.gl.GameEvents, 'reportData', this.reportData);
    this.listenTo(_globals.gl.GameEvents, 'beatgame', this.beatGame);
    this.listenTo(_globals.gl.GameEvents, 'zoneClear', this.zoneClear);
    setInterval(this.intervalTick.bind(this), 1000);

    requestAnimFrame(this.onFrame.bind(this));
  },

  defaultSettings: function defaultSettings() {
    return {
      'enableBuildHotkeys': true,
      'autoAdvance': true,
      'disableShake': false,
      'autoCraft': true,
      'pauseOnDeath': false,
      'backOnDeath': false,
      'bossPause': false,
      'zonesBack': 1,
      'enableHeroDmgMsgs': true,
      'enableMonDmgMsgs': true,
      'enableMatMsgs': true
    };
  },

  fbFullSave: function fbFullSave() {
    console.log('main fullsave');
    var data = this.toJSON();
    _globals.gl.FB.child('accounts').child(_globals.gl.accountId).child('fullData').set(data);
  },

  fbFullLoad: function fbFullLoad() {
    _globals.gl.FB.child('accounts').child(_globals.gl.accountId).child('fullData').once('value', function (dataSnapshot) {
      console.log(dataSnapshot.val());
      localStorage.setItem('data', storage.enc(JSON.stringify(dataSnapshot.val())));
      location.reload();
    }, function (err) {
      console.log(err);
    });
  },

  trySave: function trySave() {
    var now = new Date().getTime();
    if (now - this.lastSave < 1000) {
      return;
    }
    this.lastSave = now;
    localStorage.setItem('data', storage.enc(JSON.stringify(this.toJSON())));
  },

  toJSON: function toJSON() {
    var data = {
      builds: _globals.gl.builds,
      settings: this.settings,
      version: _globals.gl.VERSION_NUMBER,
      cardInv: this.cardInv.toJSON(),
      inv: this.inv.toJSON(),
      matInv: this.matInv.toJSON(),
      zone: this.zone.toJSON(),
      hero: this.hero.toJSON(),
      skillchain: this.hero.skillchain.toJSON(),
      equipped: this.hero.equipped.toJSON(),
      cheats: 1,
      userXpMult: 1,
      timeCoef: 1,
      gameTime: this.gameTime
    };
    return data;
  },

  reportData: function reportData() {
    _log2.default.reportData(this);
  },

  saveBuild: function saveBuild(buildSlot) {
    if (_globals.gl.builds[buildSlot] !== undefined && _globals.gl.builds[buildSlot] !== null && _globals.gl.builds[buildSlot].name !== undefined) {
      var name = _globals.gl.builds[buildSlot].name;
    }
    var build = {};
    var data = this.toJSON();
    build.equipped = data.equipped;
    build.skillchain = data.skillchain;
    build.inv = _.filter(data.inv, function (m) {
      return m.cardNames.length;
    });
    if (buildSlot >= 0) {
      _globals.gl.builds[buildSlot] = build;
      _log2.default.warning('Build saved to slot %d', buildSlot);
      if (name !== undefined) {
        _globals.gl.builds[buildSlot].name = name;
      }
    }
    _globals.gl.UIEvents.trigger('buildsave');
    return build;
  },

  loadBuild: function loadBuild(buildSlot) {
    var items, invItem;
    var build = _globals.gl.builds[buildSlot];
    if (build !== undefined && build !== null) {
      if (build.name) {
        _globals.gl.lastBuildLoaded = build.name;
      } else {
        _globals.gl.lastBuildLoaded = "Build " + buildSlot;
      }
      _log2.default.reportBuild(buildSlot, build);
      _.each(this.hero.equipped.slots, function (slot) {
        this.hero.equipped.unequip(slot);
      }, this);
      _.each(_.range(5), function (i) {
        this.hero.skillchain.equip(undefined, i);
      }, this);

      this.hero.skillchain.fromJSON(build.skillchain, this.inv);
      this.hero.equipped.fromJSON(build.equipped, this.inv);
      _.each(build.inv, function (loadItem) {
        var invItem = _.findWhere(this.inv.getModels(), { name: loadItem.name });
        if (invItem) {
          invItem.loadCards(loadItem.cardNames, this.cardInv);
        }
      }, this);
      _log2.default.warning('Build loaded from slot %d', buildSlot);
      _globals.gl.UIEvents.trigger('buildload');
      return;
    }
    _log2.default.warning('No build loaded, slot %d empty or invalid', buildSlot);
  },

  renameBuild: function renameBuild() {
    var buildname = (0, _jquery2.default)('#renamebuild').val();
    var buildnum = (0, _jquery2.default)('#renamebuildnum').val();
    if (_globals.gl.builds[buildnum]) {
      _globals.gl.builds[buildnum].name = buildname;
    }
    _globals.gl.UIEvents.trigger('buildsave');
  },

  beatGame: function beatGame() {
    // var uid = localStorage.getItem('uid');
    // var msg = '' + this.zone.unlockedZones + ' - ' +
    // this.zone.getZoneFromNum(this.zone.unlockedZones).nameStr;
    _log2.default.reportWinner(this.hero, this.zone);
  },

  deathPause: function deathPause() {
    if (_globals.gl.settings.pauseOnDeath) {
      this.gameSpeed = 0;
    }
  },

  triggerPause: function triggerPause() {
    this.gameSpeed = 0;
  },

  setHeroMoveAngle: function setHeroMoveAngle(angle) {
    this.hero.moveAngle = angle;
  },

  zoneClear: function zoneClear() {
    _log2.default.reportClear(this);
  },

  load: function load() {
    var data = storage.getData();
    if (data) {
      _log2.default.warning('found some data');

      if (data.cheats !== undefined && data.cheats != 0) {
        _log2.default.error('cheat mode activated');
      }
      if (data.timeCoef !== undefined && data.timeCoef != 1) {
        _log2.default.error('time stretching activated');
      }
      if (data.userXpMult !== undefined && data.userXpMult != 1) {
        _log2.default.error('xp bonus activated');
      }

      _globals.gl.builds = data.builds !== undefined ? data.builds : [];
      this.settings = data.settings !== undefined ? data.settings : this.defaultSettings();
      data = this.upgradeData(data);
      this.cardInv.fromJSON(data.cardInv);
      this.inv.fromJSON(data.inv, this.cardInv);
      this.matInv.fromJSON(data.matInv);
      this.zone.fromJSON(data.zone);
      this.hero.fromJSON(data.hero);
      this.hero.skillchain.fromJSON(data.skillchain, this.inv);
      this.hero.equipped.fromJSON(data.equipped, this.inv);
      this.gameTime = data.gameTime;
      this.hero.computeAttrs();
      this.cardInv.sort();
      return true;
    }
    return false;
  },

  upgradeData: function upgradeData(data) {
    switch (data.version) {
      case undefined:
        _log2.default.error('Upgrading data from v0-1-1b to 0-1-2');
        data = JSON.parse(JSON.stringify(data).replace(/putrified/g, 'putrefied'));
        _.each(data.cardInv, function (card) {
          card.qp = 0;
        });
      case '0-1-2':
      case '0-1-3':
      case '0-1-4':
        _log2.default.error('Upgrading data from v0-1-3 to 0-1-4');
        var order = _itemref.ref.zoneOrder.order;
        var fromNextZone = order.indexOf(data.zone.nextZone);
        var ul = Math.max(fromNextZone, data.zone.unlockedZones);
        if (ul >= order.length) {
          ul = order.length - 1;
        }
        data.zone.unlockedZones = ul;
      case '0-1-5':
        _log2.default.error('Upgrading data from v0-1-4 to 0-1-5');
        data.settings = this.defaultSettings();
      case '0-1-6':
        _log2.default.error('Upgrading data from v0-1-5 to 0-1-6');
        data.settings.autoAdvance = false;
      case '0-1-7':
      case '0-1-8':
      case '0-1-9':
        this.hero.versionCreated = 'legacy';
      case '0-1-10':
      case '0-1-11':
      case '0-1-12':
      case '0-1-13':
      case '0-1-14':
      case '0-1-15':
      case '0-1-16':
        data.gameTime = new Date().getTime();
      case '0-1-17':
      case '0-1-18':
      case '0-1-19':
      case '0-1-20':
      case '0-1-21':
      case '0-1-22':
      case '0-1-23':
      case '0-1-24':
      case '0-2-0':
      case '0-2-1':
      case '0-2-2':
      case '0-2-3':
      case '0-2-4':
      case '0-2-5':
        data.settings.autoCraft = false;
      case '0-2-6':
      case '0-2-7':
      case '0-2-8':
        data.settings.pauseOnDeath = false;
      case '0-2-9':
      case '0-2-10':
      case '0-2-11':
      case '0-2-12':
        data.settings.bossPause = false;
        data.settings.backOnDeath = false;
      case '0-2-13':
        data.settings.zonesBack = 1;
      case '0-2-14':
      case '0-2-15':
      case '0-2-16':
      case '0-2-17':
      case '0-2-18':
      case '0-2-19':
      case '0-2-20':
      case '0-2-21':
      case '0-2-22':
      case '0-2-23':
      case '0-2-24':
        data.settings.enableHeroDmgMsgs = true;
        data.settings.enableMonDmgMsgs = true;
      case '0-2-25':
      case '0-2-26':
      case '0-2-27':
      case '0-2-28':
      case '0-2-29':
        data.settings.enableMatMsgs = true;
      case '0-2-30':
      case '0-2-31':
      case '0-3-0':
        break;

      default:
        _log2.default.error('No upgrade required');
        break;
    }
    data.version = _globals.gl.VERSION_NUMBER;
    _log2.default.error('Data is up to version %s spec', data.version);
    return data;
  },

  noobGear: function noobGear() {
    _log2.default.warning('noob gear');
    this.inv.noobGear();
    this.cardInv.noobGear();

    var items = this.inv.getModels();
    this.hero.equipped.equip(_.findWhere(items, { name: 'cardboard sword' }), 'weapon');
    this.hero.equipped.equip(_.findWhere(items, { name: 'balsa helmet' }), 'head');
    this.hero.equipped.equip(_.findWhere(items, { name: 'latex gloves' }), 'hands');
    this.hero.equipped.equip(_.findWhere(items, { name: 't-shirt' }), 'chest');
    this.hero.equipped.equip(_.findWhere(items, { name: 'jeans' }), 'legs');
    this.hero.skillchain.equip(_.findWhere(items, { name: 'basic melee' }), 0);
  },

  intervalTick: function intervalTick() {
    var thisTime = new Date().getTime();
    if (thisTime - this.curTime > 2000) {
      this.modelTick();
    }
  },

  onFrame: function onFrame() {
    if (new Date().getTime() - this.curTime > this.mspf) {
      this.modelTick();
      this.visTick();
    }

    this.trySave();
    requestAnimFrame(this.onFrame.bind(this));
  },

  computeTickTime: function computeTickTime(now) {
    var dt = now - this.curTime;
    this.curTime = now;

    // If this step is small enough, do the whole thing.
    if (dt < MAX_STEP) {
      return dt;
    }

    // Otherwise, step the MAX_STEP, and put the rest of the time back on the clock.
    _log2.default.error(sprintf('putting %dms back on the clock', Math.floor(dt - MAX_STEP)));
    this.gameTime -= dt - MAX_STEP;

    return MAX_STEP;
  },

  modelTick: function modelTick() {
    var now = new Date().getTime();
    var newTime = this.computeTickTime(now);
    var availTime = now - this.gameTime;

    if (newTime <= 0) {
      return;
    }

    var dt = newTime * this.gameSpeed;
    var cost = dt;

    if (cost > availTime) {
      dt *= availTime / cost;
      cost = availTime;
      this.gameSpeed = 1;
      _globals.gl.MessageEvents.trigger('message', {
        text: '没时间了!',
        type: 'timeleft',
        pos: this.zone.hero.pos,
        color: 'rgba(230, 10, 10, 0.8)',
        lifespan: 2000,
        verticalOffset: 0,
        time: _globals.gl.time,
        expires: _globals.gl.time + 2000
      });
    }

    _statsTracker.gameRateTracker.updateRates(cost);

    this.gameTime += cost;

    while (dt > 0) {
      var incBy = dt > STEP_SIZE ? STEP_SIZE : dt;
      _globals.gl.time += incBy;
      _globals.gl.lastTimeIncr = incBy;
      dt -= incBy;
      this.zone.zoneTick();
    }
  },

  visTick: function visTick() {
    _globals.gl.DirtyQueue.mark('tick');
    _globals.gl.DirtyQueue.triggerAll(_globals.gl.DirtyListener);
    _globals.gl.DirtyQueue.triggerAll(_globals.gl.DirtyListener);
    _globals.gl.DirtyQueue.triggerAll(_globals.gl.DirtyListener);
  },

  bestGear: function bestGear(itemType, type) {
    var items = _.where(this.inv.getModels(), { itemType: itemType });
    items = _.where(items, { type: type });
    items = _.sortBy(items, function (item) {
      return item.level;
    });
    if (items.length > 0) {
      return items.pop();
    }
    return undefined;
  },

  autoEquip: function autoEquip() {
    this.hero.equipped.equip(this.bestGear('weapon', 'melee'), 'weapon');
    this.hero.equipped.equip(this.bestGear('armor', 'head'), 'head');
    this.hero.equipped.equip(this.bestGear('armor', 'chest'), 'chest');
    this.hero.equipped.equip(this.bestGear('armor', 'hands'), 'hands');
    this.hero.equipped.equip(this.bestGear('armor', 'legs'), 'legs');

    var skills = _.where(this.inv.getModels(), { itemType: 'skill' });
    skills = _.sortBy(skills, function (skill) {
      return -skill.cooldownTime;
    });
    _log2.default.error('skill names: %s', _.pluck(skills, 'name').join(', '));
    _log2.default.error('skill cooldownTimes: %s', _.pluck(skills, 'cooldownTime').join(', '));
    _.each(skills.slice(0, 5), function (skill, i) {
      this.hero.skillchain.equip(skill, i);
    }, this);
  },

  adjustSpeed: function adjustSpeed(dir, godmode) {
    if (dir === 'up') {
      this.gameSpeed = SPEEDS_UP[this.gameSpeed];
      if (!godmode) {
        this.gameSpeed = Math.min(50, this.gameSpeed);
      }
    } else if (dir === 'down') {
      this.gameSpeed = SPEEDS_DOWN[this.gameSpeed];
    } else if (dir === 'play-pause') {
      this.gameSpeed = this.gameSpeed === 0 ? 1 : 0;
    }
  },

  validateZones: function validateZones() {
    console.log(this.zone);
    var res = this.zone.statResult;
    console.log(res);
    _.each(res.avgs, function (statval, stat) {
      if (statval === 0) {
        return;
      }
      console.log(stat + ' ratio : ' + res.maxs[stat] / res.avgs[stat]);
    });
  }
});

function KeyHandler(gameModel) {
  this.gameModel = gameModel;
}

KeyHandler.prototype.liveKeys = function (event, godmode) {
  var key = event.keyCode;
  var SPACE = 32,
      UP = 38,
      DN = 40,
      HKEY = 72,
      PKEY = 80,
      CKEY = 67,
      IKEY = 73,
      FKEY = 70,
      RKEY = 82,
      MKEY = 77,
      SKEY = 83,
      GKEY = 21;
  if (key === SPACE) {
    this.gameModel.adjustSpeed('play-pause', godmode);
  } else if (key === UP) {
    this.gameModel.adjustSpeed('up', godmode);
  } else if (key === DN) {
    this.gameModel.adjustSpeed('down', godmode);
  } else if (key >= 48 && key <= 57 && this.gameModel.settings.enableBuildHotkeys) {
    var buildSlot = key - 48;
    if (event.shiftKey) {
      _globals.gl.saveBuild(buildSlot);
    } else {
      _globals.gl.loadBuild(buildSlot);
    }
  } else if (key == PKEY) {
    this.gameModel.zone.hero.tryUsePotion();
  } else if (key == CKEY) {
    _globals.gl.UIEvents.trigger('footer:buttons:cards');
  } else if (key == IKEY) {
    _globals.gl.UIEvents.trigger('footer:buttons:inv');
  } else if (key == FKEY) {
    _globals.gl.UIEvents.trigger('footer:buttons:craft');
  } else if (key == RKEY) {
    _globals.gl.UIEvents.trigger('footer:buttons:recycle');
  } else if (key == MKEY) {
    _globals.gl.UIEvents.trigger('footer:buttons:map');
  } else if (key == HKEY) {
    _globals.gl.UIEvents.trigger('footer:buttons:help');
  } else if (key == SKEY) {
    _globals.gl.UIEvents.trigger('footer:buttons:stats');
  } else if (key == GKEY) {
    _globals.gl.UIEvents.trigger('footer:buttons:config');
  } else if (key == 192 && event.shiftKey) {
    /*if(this.gameModel.hero.level < 100) {
       log.warning('you must be at least level 100 to get test card');
       }
       if(_.findWhere(this.gameModel.cardInv.models, {'name': 'colossus'}) ==
       undefined) { this.gameModel.cardInv.addDrops([
       dropsLib.dropFactory('card', ['colossus', 1]),
       ]);
       log.warning('dropping colossus');
       } else {
       log.warning('you already have it');
       }*/
  }
};

KeyHandler.prototype.onKeydown = function (event) {
  if (document.activeElement.nodeName !== 'BODY') {
    return;
  }

  var godmode = isNaN(parseInt(localStorage.getItem('uid')));
  this.liveKeys(event, godmode);

  if (!godmode) {
    return;
  }

  var gameModel = this.gameModel;
  var SPACE = 32,
      EKEY = 69,
      TKEY = 84,
      UP = 38,
      DN = 40,
      BKEY = 66,
      XKEY = 88,
      VKEY = 86,
      ZKEY = 90;
  var key = event.key;

  _log2.default.info('keydown, key: %d', key);

  if (key === 'e') {
    // Cheat for adding 1000xp (for easier testing)
    _log2.default.error('XP Cheat!');
    this.gameModel.hero.applyXp(this.gameModel.hero.getNextLevelXp());
  } else if (key === 't') {
    _log2.default.error('Time Cheat');
    this.gameModel.curTime -= 3600000;
  } else if (key === 'z') {
    var TARGSTAT = undefined;
    var res = this.gameModel.zone.statResult;
    if (TARGSTAT !== undefined) {
      _log2.default.warning('%s: avg: %f, max: %f, min: %f', TARGSTAT, res.avgs[TARGSTAT], res.maxs[TARGSTAT], res.mins[TARGSTAT]);
      console.log(res.mons);
    } else {
      console.log('avgs', res.avgs);
      console.log('maxs', res.maxs);
      console.log('mins', res.mins);
    }
  } else if (key === 'b' || key === 'x' || key === 'v') {
    _log2.default.error('Melee Equipment cheat');
    var items = this.gameModel.inv.getModels();
    var egm = this.gameModel.hero.equipped;
    var sc = this.gameModel.hero.skillchain;

    if (key === 'b') {
      this.gameModel.inv.addDrops([dropsLib.dropFactory('item', ['weapon', 'spikey mace']), dropsLib.dropFactory('skill', 'lethal strike'), dropsLib.dropFactory('skill', 'flaming debris'), dropsLib.dropFactory('skill', 'ground smash')]);
      egm.equip(_.findWhere(items, { name: 'spikey mace' }), 'weapon');
      sc.equip(_.findWhere(items, { name: 'ground smash' }), 0);
      sc.equip(_.findWhere(items, { name: 'lethal strike' }), 1);
      sc.equip(_.findWhere(items, { name: 'flaming debris' }), 2);
      sc.equip(_.findWhere(items, { name: 'basic melee' }), 4);
    } else if (key === 'x') {
      this.gameModel.inv.addDrops([dropsLib.dropFactory('item', ['weapon', 'composite bow']), dropsLib.dropFactory('skill', 'headshot'), dropsLib.dropFactory('skill', 'speed shot'), dropsLib.dropFactory('skill', 'piercing shot'), dropsLib.dropFactory('skill', 'explonential shot')]);
      this.gameModel.cardInv.addDrops([dropsLib.dropFactory('card', ['more projectiles', 2])]);
      egm.equip(_.findWhere(items, { name: 'composite bow' }), 'weapon');
      sc.equip(_.findWhere(items, { name: 'headshot' }), 0);
      sc.equip(_.findWhere(items, { name: 'speed shot' }), 1);
      sc.equip(_.findWhere(items, { name: 'basic range' }), 4);
    } else if (key === 'v') {
      this.gameModel.inv.addDrops([dropsLib.dropFactory('item', ['weapon', 'star wand']), dropsLib.dropFactory('skill', 'fire ball'), dropsLib.dropFactory('skill', 'poison ball'), dropsLib.dropFactory('skill', 'lightning ball'), dropsLib.dropFactory('skill', 'ice ball'), dropsLib.dropFactory('skill', 'ice blast'), dropsLib.dropFactory('skill', 'nova')]);
      egm.equip(_.findWhere(items, { name: 'star wand' }), 'weapon');
      sc.equip(_.findWhere(items, { name: 'nova' }), 0);
      sc.equip(_.findWhere(items, { name: 'poison ball' }), 1);
      sc.equip(_.findWhere(items, { name: 'ice ball' }), 2);
      sc.equip(_.findWhere(items, { name: 'lightning ball' }), 3);
      sc.equip(_.findWhere(items, { name: 'basic spell' }), 4);
    }

    this.gameModel.inv.addDrops([dropsLib.dropFactory('item', ['armor', 'crusader helm']), dropsLib.dropFactory('item', ['armor', 'leatherplate armor']), dropsLib.dropFactory('item', ['armor', 'buckaneer boots']), dropsLib.dropFactory('item', ['armor', 'goldenscale gauntlets'])]);

    egm.equip(_.findWhere(items, { name: 'crusader helm' }), 'head');
    egm.equip(_.findWhere(items, { name: 'leatherplate armor' }), 'chest');
    egm.equip(_.findWhere(items, { name: 'buckaneer boots' }), 'legs');
    egm.equip(_.findWhere(items, { name: 'goldenscale gauntlets' }), 'hands');

    this.gameModel.cardInv.addDrops([dropsLib.dropFactory('card', ['heart juice', 4]), dropsLib.dropFactory('card', ['brain juice', 4]), dropsLib.dropFactory('card', ['hot sword', 4])]);
  }
};

// exports.extend({onReady : onReady, GameModel : GameModel});


},{"./drops":5,"./entity":6,"./globals":9,"./inventory":10,"./log":19,"./model":21,"./stats-tracker":23,"./storage":24,"./views":27,"./zone":29,"itemref/itemref":12,"jquery":32,"underscore":33}],21:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Model = undefined;

var _backbone = require('backbone');

var Backbone = _interopRequireWildcard(_backbone);

var _underscore = require('underscore');

var _ = _interopRequireWildcard(_underscore);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var Model = exports.Model = function Model() {
  this.id = _.uniqueId('m');
  this.initialize.apply(this, arguments);
};

_.extend(Model.prototype, Backbone.Events, { initialize: function initialize() {} });

Model.extend = Backbone.Model.extend;


},{"backbone":30,"underscore":33}],22:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.rand = rand;
exports.pyRand = pyRand;
exports.rootRand = rootRand;
exports.binProb = binProb;
exports.middle50 = middle50;
exports.pProb = pProb;
exports.sum = sum;
exports.pick = pick;
exports.memoFact = memoFact;
exports.randColor = randColor;
exports.test = test;

var _underscore = require('underscore');

var _ = _interopRequireWildcard(_underscore);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

/* exports.extend({
 *   rand : rand,
 *   pyRand : pyRand,
 *   rootRand : rootRand,
 *   binProb : binProb,
 *   middle50 : middle50,
 *   pProb : pProb,
 *   test : test,
 *   pick : pick,
 *   sum : sum,
 *   randColor : randColor
 * });*/

var fact;

// returns a random integer >= min and <= max
function rand(min, max) {
  // INCLUSIVE ON BOTH SIDES
  if (typeof min !== 'number' || typeof max !== 'number') {
    throw 'rand() must be called with 2 numbers';
  }
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function pyRand(min, max) {
  // inclusive of min, exclusive of max
  if (typeof min !== 'number' || typeof max !== 'number') {
    throw 'pyRand() must be called with 2 numbers';
  }
  return Math.floor(Math.random() * (max - min) + min);
}

function rootRand(min, max) {
  // call
  // var root = 5;
  // var range = Math.pow(max, root);
  // var result = Math.max(min, Math.floor(Math.pow(pyRand(0, range),
  // 1/root)));
  var result = pProb(min * 2, max);

  return Math.max(min, result);
}

// Binary probability, returns true or false based off a p
// p >= 1 always returns 1
// p = 0.01 returns 1 on average once per 100 tries, 0 other times
function binProb(p) {
  if (Math.random() < p) {
    return true;
  } else {
    return false;
  }
}

function middle50(s) {
  var a = Math.floor(s / 4);
  var b = Math.ceil(s * 3 / 4);
  return rand(a, b);
}

// lambda is expected value of the function.  aka:
//   If we ran this function a 1M times we would get around 1M * lambda
// x (sometimes written as k) is the variable to test
function pProb(lambda, limit) {
  var r = Math.random(); // num between 0 and 1
  var x = 0;
  var prob;
  if (!limit) {
    limit = 100;
  }
  /*
    Start with x = 0, get the probability that it will happen, subtract that
    probability from the random number If that makes it less than zero, return
    x, otherwise test x += 1
  */
  while (x < limit) {
    prob = Math.pow(lambda, x) * Math.exp(-lambda) / fact[x];
    // console.log('for lambda ' + lambda + ' and x ' + x + ' prob = ' +
    // prob);
    r -= prob;
    if (r < 0) {
      return x;
    }
    x++;
  }
  return x;
}

function sum(arr) {
  var s = 0;
  for (var i = arr.length; i--;) {
    s += arr[i];
  }
  return s;
}

// given an array of weights, of arbitrary sum, randomly selects an index and
// returns it
function pick(weights) {
  var len = weights.length;
  var rand = Math.random() * sum(weights);
  var s = 0;
  var index = 0;

  while (index < len && rand > 0) {
    rand -= weights[index];
    index++;
  }
  index -= 1;
  return index;
}

// memo or cache count factorials
function memoFact(count) {
  var arr = [1, 1];
  for (var i = 1; i < count; i++) {
    arr[i + 1] = arr[i] * (i + 1);
  }
  return arr;
}

function randColor(base, range) {
  var original = base;
  if (typeof base === 'string') {
    base = base.replace('#', '');
    if (base.length === 3) {
      base = base[0] + base[0] + base[1] + base[1] + base[2] + base[2];
    }
    if (base.length !== 6) {
      throw 'randcolor base != 6';
    }
    base = [parseInt(base.slice(0, 2), 16), parseInt(base.slice(2, 4), 16), parseInt(base.slice(4, 6), 16)];
  }

  color = _.map(base, function (c) {
    c += rand(-range, range);
    c = c > 255 ? 255 : c;
    c = c < 0 ? 0 : c;
    return c;
  });
  var res = sprintf('#%02X%02X%02X', color[0], color[1], color[2]);
  return res;
}

function test() {
  var fact = memoFact(200);

  // test it

  var start = new Date().getTime();

  var hist = [];
  for (var i = 0; i < 100; i++) {
    hist[i] = 0;
  }
  for (var i = 0; i < 1000; i++) {
    var prob = pProb(40, 200);
    console.log(prob + ' monsters in room ' + i);
    hist[prob]++;
  }

  console.log('1000 cycles took ' + (new Date().getTime() - start) + 'ms');
  console.log(hist);

  for (var i = 0; i < 20; i++) {
    s = '';
    var count = hist[i];
    for (var j = 0; j < count; j++) {
      s += 'x';
    }
    console.log(s);
  }
}

fact = memoFact(200);


},{"underscore":33}],23:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.gameRateTracker = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _utils = require('./utils');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var GameRateTracker = function () {
  function GameRateTracker() {
    _classCallCheck(this, GameRateTracker);

    this.powma3 = 1;
    this.powma30 = 1;
    this.lastNow = new Date().getTime();
  }

  _createClass(GameRateTracker, [{
    key: 'updateRates',
    value: function updateRates(cost) {
      var now = new Date().getTime();
      var diff = now - this.lastNow;
      var rate = cost / diff;

      this.lastNow = now;

      this.powma3 = (0, _utils.computeMovingPowma)(this.powma3, rate, 3000, diff);
      this.powma30 = (0, _utils.computeMovingPowma)(this.powma30, rate, 30000, diff);
    }
  }]);

  return GameRateTracker;
}();

var gameRateTracker = exports.gameRateTracker = new GameRateTracker();


},{"./utils":25}],24:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.enc = enc;
exports.dec = dec;
exports.getData = getData;

var _log = require('./log');

var _log2 = _interopRequireDefault(_log);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

'use strict';
/*\
|*|
|*|  Base64 / binary data / UTF-8 strings utilities
|*|
|*|
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Base64_encoding_and_decoding
|*|
\*/

/* Array of bytes to base64 string decoding */
function b64ToUint6(nChr) {
  return nChr > 64 && nChr < 91 ? nChr - 65 : nChr > 96 && nChr < 123 ? nChr - 71 : nChr > 47 && nChr < 58 ? nChr + 4 : nChr === 43 ? 62 : nChr === 47 ? 63 : 0;
}

function base64DecToArr(sBase64, nBlocksSize) {
  var sB64Enc = sBase64.replace(/[^A-Za-z0-9\+\/]/g, ''),
      nInLen = sB64Enc.length,
      nOutLen = nBlocksSize ? Math.ceil((nInLen * 3 + 1 >> 2) / nBlocksSize) * nBlocksSize : nInLen * 3 + 1 >> 2,
      taBytes = new Uint8Array(nOutLen);

  for (var nMod3, nMod4, nUint24 = 0, nOutIdx = 0, nInIdx = 0; nInIdx < nInLen; nInIdx++) {
    nMod4 = nInIdx & 3;
    nUint24 |= b64ToUint6(sB64Enc.charCodeAt(nInIdx)) << 6 * (3 - nMod4);
    if (nMod4 === 3 || nInLen - nInIdx === 1) {
      for (nMod3 = 0; nMod3 < 3 && nOutIdx < nOutLen; nMod3++, nOutIdx++) {
        taBytes[nOutIdx] = nUint24 >>> (16 >>> nMod3 & 24) & 255;
      }
      nUint24 = 0;
    }
  }
  return taBytes;
}

/* Base64 string to array encoding */

function uint6ToB64(nUint6) {
  return nUint6 < 26 ? nUint6 + 65 : nUint6 < 52 ? nUint6 + 71 : nUint6 < 62 ? nUint6 - 4 : nUint6 === 62 ? 43 : nUint6 === 63 ? 47 : 65;
}

function base64EncArr(aBytes) {
  var nMod3 = 2,
      sB64Enc = '';

  for (var nLen = aBytes.length, nUint24 = 0, nIdx = 0; nIdx < nLen; nIdx++) {
    nMod3 = nIdx % 3;
    if (nIdx > 0 && nIdx * 4 / 3 % 76 === 0) {
      sB64Enc += '\r\n';
    }
    nUint24 |= aBytes[nIdx] << (16 >>> nMod3 & 24);
    if (nMod3 === 2 || aBytes.length - nIdx === 1) {
      sB64Enc += String.fromCharCode(uint6ToB64(nUint24 >>> 18 & 63), uint6ToB64(nUint24 >>> 12 & 63), uint6ToB64(nUint24 >>> 6 & 63), uint6ToB64(nUint24 & 63));
      nUint24 = 0;
    }
  }
  return sB64Enc.substr(0, sB64Enc.length - 2 + nMod3) + (nMod3 === 2 ? '' : nMod3 === 1 ? '=' : '==');
}

/* UTF-8 array to DOMString and vice versa */

function UTF8ArrToStr(aBytes) {
  var sView = '';

  for (var nPart, nLen = aBytes.length, nIdx = 0; nIdx < nLen; nIdx++) {
    nPart = aBytes[nIdx];
    sView += String.fromCharCode(nPart > 251 && nPart < 254 && nIdx + 5 < nLen ? /* six bytes */
    /* (nPart - 252 << 30) may be not so safe in ECMAScript! So...: */
    (nPart - 252) * 1073741824 + (aBytes[++nIdx] - 128 << 24) + (aBytes[++nIdx] - 128 << 18) + (aBytes[++nIdx] - 128 << 12) + (aBytes[++nIdx] - 128 << 6) + aBytes[++nIdx] - 128 : nPart > 247 && nPart < 252 && nIdx + 4 < nLen ? /* five bytes */
    (nPart - 248 << 24) + (aBytes[++nIdx] - 128 << 18) + (aBytes[++nIdx] - 128 << 12) + (aBytes[++nIdx] - 128 << 6) + aBytes[++nIdx] - 128 : nPart > 239 && nPart < 248 && nIdx + 3 < nLen ? /* four bytes */
    (nPart - 240 << 18) + (aBytes[++nIdx] - 128 << 12) + (aBytes[++nIdx] - 128 << 6) + aBytes[++nIdx] - 128 : nPart > 223 && nPart < 240 && nIdx + 2 < nLen ? /* three bytes */
    (nPart - 224 << 12) + (aBytes[++nIdx] - 128 << 6) + aBytes[++nIdx] - 128 : nPart > 191 && nPart < 224 && nIdx + 1 < nLen ? /* two bytes */
    (nPart - 192 << 6) + aBytes[++nIdx] - 128 :
    /* nPart < 127 ? */ /* one byte */
    nPart);
  }
  return sView;
}

function strToUTF8Arr(sDOMStr) {
  var aBytes,
      nChr,
      nStrLen = sDOMStr.length,
      nArrLen = 0;

  /* mapping... */

  for (var nMapIdx = 0; nMapIdx < nStrLen; nMapIdx++) {
    nChr = sDOMStr.charCodeAt(nMapIdx);
    nArrLen += nChr < 0x80 ? 1 : nChr < 0x800 ? 2 : nChr < 0x10000 ? 3 : nChr < 0x200000 ? 4 : nChr < 0x4000000 ? 5 : 6;
  }

  aBytes = new Uint8Array(nArrLen);

  /* transcription... */

  for (var nIdx = 0, nChrIdx = 0; nIdx < nArrLen; nChrIdx++) {
    nChr = sDOMStr.charCodeAt(nChrIdx);
    if (nChr < 128) {
      /* one byte */
      aBytes[nIdx++] = nChr;
    } else if (nChr < 0x800) {
      /* two bytes */
      aBytes[nIdx++] = 192 + (nChr >>> 6);
      aBytes[nIdx++] = 128 + (nChr & 63);
    } else if (nChr < 0x10000) {
      /* three bytes */
      aBytes[nIdx++] = 224 + (nChr >>> 12);
      aBytes[nIdx++] = 128 + (nChr >>> 6 & 63);
      aBytes[nIdx++] = 128 + (nChr & 63);
    } else if (nChr < 0x200000) {
      /* four bytes */
      aBytes[nIdx++] = 240 + (nChr >>> 18);
      aBytes[nIdx++] = 128 + (nChr >>> 12 & 63);
      aBytes[nIdx++] = 128 + (nChr >>> 6 & 63);
      aBytes[nIdx++] = 128 + (nChr & 63);
    } else if (nChr < 0x4000000) {
      /* five bytes */
      aBytes[nIdx++] = 248 + (nChr >>> 24);
      aBytes[nIdx++] = 128 + (nChr >>> 18 & 63);
      aBytes[nIdx++] = 128 + (nChr >>> 12 & 63);
      aBytes[nIdx++] = 128 + (nChr >>> 6 & 63);
      aBytes[nIdx++] = 128 + (nChr & 63);
    } else /* if (nChr <= 0x7fffffff) */{
        /* six bytes */
        aBytes[nIdx++] = 252 + (nChr >>> 30);
        aBytes[nIdx++] = 128 + (nChr >>> 24 & 63);
        aBytes[nIdx++] = 128 + (nChr >>> 18 & 63);
        aBytes[nIdx++] = 128 + (nChr >>> 12 & 63);
        aBytes[nIdx++] = 128 + (nChr >>> 6 & 63);
        aBytes[nIdx++] = 128 + (nChr & 63);
      }
  }

  return aBytes;
}

function chk(a) {
  var c = 0x01000193,
      i = 0,
      l = a.length;
  for (; i < l; i++) {
    c = ((c >>> 1) + ((c & 1) << 15) | 0) + (a[i] & 0xff) & 0xffff | 0;
  }return c;
}

function enc(s) {
  /* if (arguments.callee.caller === null) {
   *   log.weird('enc_console');
   * }*/
  /*else if (arguments.callee.caller.toString().length !== 270 &&
   arguments.callee.caller.toString().length !== 151) { log.error('error no: '
   + arguments.callee.caller.toString().length);
       log.weird('enc_weirdFunc2');
   }*/

  localStorage.setItem('readOnlyData', s);

  return _enc(s);
}

function _enc(s) {
  // console.log('enc str:', s);
  var a = strToUTF8Arr(s);
  // console.log('arr:', a);
  var c = chk(a);
  // console.log('checksum:', c);
  var l = a.length;
  var ta = new Uint8Array(l + 2);
  for (var i = 0; i < l; i++) {
    ta[i] = a[i];
  }
  a = ta;
  a[l] = c >>> 8 & 0xff;
  a[l + 1] = c & 0xff;
  // console.log('arr:', a);
  var res = base64EncArr(a);
  // console.log('res:', res);
  return res;
}

function dec(s) {
  /* if (arguments.callee.caller === null) {
   *   log.weird('dec_console');
   * } else if (arguments.callee.caller.toString().length !== 501 &&
   *            arguments.callee.caller.toString().length !== 237) {
   *   log.weird('dec_weirdFunc' +
   *                           arguments.callee.caller.toString().length);
   * }*/

  return _dec(s);
}

// returns object or undefined
function _dec(s) {
  // console.log('dec str:', s);
  var a = base64DecToArr(s);
  var l = a.length;
  // console.log('arr:', a);
  var c = ((a[l - 2] & 0xff) << 8) + (a[l - 1] & 0xff);
  var v = a.subarray(0, l - 2);
  // console.log('stored checksum:', c);
  var cc = chk(v);
  // console.log('calculated checksum:', cc);
  var res = UTF8ArrToStr(v);
  // console.log('res:', res);

  try {
    var data = JSON.parse(res);
    if (cc !== c) {
      _log2.default.tmpr(res);
    }
    return data;
  } catch (e) {
    return;
  }
}

function getData() {
  _log2.default.warning('loading');
  var data = localStorage.getItem('data');
  if (!data) {
    return undefined;
  }
  try {
    data = JSON.parse(data);
    _log2.default.warning('Found regular json data');
  } catch (e) {
    try {
      data = dec(data);
      _log2.default.warning('Found encoded data');
    } catch (e) {
      return undefined;
    }
  }
  return data;
}

/* exports.extend({
 *   enc : enc,
 *   dec : dec,
 *   getData : getData,
 * });*/


},{"./log":19}],25:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Throttler = undefined;
exports.newBaseStatsDict = newBaseStatsDict;
exports.computeStats = computeStats;
exports.cloneStat = cloneStat;
exports.cloneStats = cloneStats;
exports.addMod = addMod;
exports.applyPerLevel = applyPerLevel;
exports.applyPerLevels = applyPerLevels;
exports.prettifyMods = prettifyMods;
exports.prettifyPerLvlMods = prettifyPerLvlMods;
exports.flattenSameMods = flattenSameMods;
exports.computeStat = computeStat;
exports.firstCap = firstCap;
exports.prettifyNum = prettifyNum;
exports.presentableSlot = presentableSlot;
exports.spaceToUnderscore = spaceToUnderscore;
exports.addAllMods = addAllMods;
exports.expandSourceCards = expandSourceCards;
exports.computeMovingAvg = computeMovingAvg;
exports.computeMovingPowma = computeMovingPowma;
exports.computeMovingEwma = computeMovingEwma;

var _jquery = require('jquery');

var _jquery2 = _interopRequireDefault(_jquery);

var _underscore = require('underscore');

var _ = _interopRequireWildcard(_underscore);

var _itemref = require('./itemref/itemref');

var _log = require('./log');

var _log2 = _interopRequireDefault(_log);

var _model = require('./model');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function newBaseStatsDict() {
  var a, i, j, l;
  var comp = {};
  for (i = 0; i < arguments.length; i++) {
    a = arguments[i];
    for (j = 0; j < a.length; j++) {
      comp[a[j]] = { added: 0, more: 1, converted: {}, gainedas: {} };
    }
  }
  return comp;
}

function computeStats(entity, bsd, keys) {
  _.each(keys, function (stat) {
    entity[stat] = computeStat(bsd, stat);
  });
}

function cloneStat(from) {
  return {
    added: from.added,
    more: from.more,
    converted: _jquery2.default.extend({}, from.converted),
    gainedas: _jquery2.default.extend({}, from.gainedas)
  };
}

function cloneStats(from, keys) {
  var all = {};
  _.each(keys, function (stat) {
    all[stat] = cloneStat(from[stat]);
  });
  return all;
}

// [primary] [verb] [amt] [special]   Note: special is either perLevel or
// dmgType in case of converted and gainedas mod restrictions: can only have
// 4, cannot have a converted or gainedas as perlevel
function addMod(dict, mod) {
  // console.log(mod);
  if (mod === undefined) {
    _log2.default.error('addMod called with undefined mod');
  }
  var s = mod.split(' ');
  var amt = parseFloat(s[2]);
  if (s[1] === 'added') {
    dict[s[0]]['added'] += amt;
  } else if (s[1] === 'more') {
    dict[s[0]]['more'] *= 1 + amt / 100;
  } else if (s[1] === 'gainedas' || s[1] === 'converted') {
    if (dict[s[0]][s[1]][s[3]]) {
      dict[s[0]][s[1]][s[3]] += amt;
    } else {
      dict[s[0]][s[1]][s[3]] = amt;
    }
  } else {
    console.log('addMod about to barf with state ', dict, mod);
    throw 'shoot';
  }
}

function applyPerLevel(mod, level) {
  var s = mod.split(' ');
  if (s.length === 4 && s[3] === 'perLevel') {
    if (s[1] === 'more') {
      if (s[2] > 0) {
        s[2] = s[2] * level;
      } else {
        s[2] = Math.pow(1 + parseFloat(s[2]) / 100, level) * 100 - 100;
      }
    } else {
      s[2] = parseFloat(s[2]) * level;
    }
    s.pop();
    return s.join(' ');
  } else {
    return mod;
  }
}

function applyPerLevels(mods, level) {
  var ret = [];
  for (var i = mods.length; i--;) {
    ret.push(applyPerLevel(mods[i], level));
  }
  return ret;
}

function prettifyMods(mods, level) {
  var res = [];
  _.each(mods, function (mod, i) {
    res[i] = applyPerLevel(mod, level);
  });

  var flatModDefs = flattenSameMods(res);
  res = [];

  _.each(flatModDefs, function (flatmod) {
    var finalmod = '';
    var spl = flatmod.split(' ');
    var val = prettifyNum(parseFloat(spl[2]));
    if (spl.length === 3) {
      if (spl[1] === 'added') {
        if (spl[2] >= 0) {
          finalmod = '+' + val + ' ' + _itemref.ref.statnames[spl[0]];
        } else {
          finalmod = val + ' ' + _itemref.ref.statnames[spl[0]];
        }
      } else if (spl[1] === 'more') {
        if (spl[2] >= 0) {
          finalmod = val + '% More ' + _itemref.ref.statnames[spl[0]];
        } else {
          finalmod = Math.abs(val) + '% Less ' + _itemref.ref.statnames[spl[0]];
        }
      }
    } else {
      if (spl[1] === 'gainedas') {
        finalmod = val + '% of ' + _itemref.ref.statnames[spl[0]] + ' Gained As ' + _itemref.ref.statnames[spl[3]];
      } else if (spl[1] === 'converted') {
        finalmod = val + '% of ' + _itemref.ref.statnames[spl[0]] + ' Converted To ' + _itemref.ref.statnames[spl[3]];
      } else {
        _log2.default.error('infobox display not configured for : ' + flatmod);
        finalmod = flatmod + ' unimplemented';
      }
    }
    res.push(finalmod);
  });
  return res;
}

function prettifyPerLvlMods(mods) {
  mods = _.filter(mods, function (mod) {
    var spl = mod.split(' ');
    return spl[spl.length - 1] === 'perLevel';
  });
  return prettifyMods(mods, 1);
}

function flattenSameMods(mods) {
  var fin = [];
  var lookup = {};

  _.each(mods, function (mod) {
    var spl = mod.split(' ');
    if (spl.length === 4) {
      fin.push(mod);
    } else if (spl.length === 3) {
      var stat = spl[0];
      var type = spl[1];
      if (lookup[type] === undefined) {
        lookup[type] = {};
      }
      if (lookup[type][stat] === undefined) {
        lookup[type][stat] = [];
      }
      lookup[type][stat].push(parseFloat(spl[2]));
    } else {
      throw 'weird mods in utils.flattenSameMods';
    }
  });
  _.each(['added', 'more', 'converted', 'gainedas'], function (typeKey) {
    var typeObj = lookup[typeKey];
    _.each(typeObj, function (statArr, statKey) {
      var total;
      if (typeKey === 'more') {
        total = 1;
        for (var i = statArr.length; i--;) {
          total *= statArr[i] / 100 + 1;
        }
        total = (total - 1) * 100;
        fin.push(statKey + ' ' + typeKey + ' ' + total.toFixed(2));
      } else {
        total = 0;
        for (var i = statArr.length; i--;) {
          total += statArr[i];
        }
        fin.push(statKey + ' ' + typeKey + ' ' + total);
      }
    });
  });
  return fin;
}

function computeStat(section, stat) {
  var obj = section[stat];
  var convPct = 100;
  var res = obj.added * obj.more;

  _.each(obj.converted, function (value, key) {
    var convAmt = obj.converted[key];
    if (convAmt > convPct) {
      convAmt = convPct;
    }
    section[key].added += convAmt / 100 * res;
    convPct -= convAmt;
  });

  res *= convPct / 100;

  _.each(obj.gainedas, function (value, key) {
    var gainedAmt = obj.gainedas[key];
    section[key].added += gainedAmt / 100 * res;
  });

  return res;
}

function firstCap(str) {
  if (str === undefined) {
    _log2.default.error('utils.firstCap called with undefined string');
    return;
  }
  var words = str.split(' ');
  _.each(words, function (word, i) {
    words[i] = word[0].toUpperCase() + word.slice(1);
  });
  return words.join(' ');
}

var numberSuffixes = ['', 'k', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'De', 'UnD', 'DuD', 'TrD', 'QaD', 'QiD', 'SeD', 'SpD', 'OcD', 'NoD', 'Vi', 'UnV'];

function prettifyNum(n) {
  if (typeof n === "string") {
    n = parseFloat(n);
  }
  if (n === Infinity) {
    return 'Infinity';
  }
  if (n < 0.001 && n > 0) {
    return n.toExponential(3);
  }
  if (n < 1000) {
    if (n >= 100) {
      return Math.floor(n).toString();
    }
    if (n === Math.floor(n)) {
      return Math.floor(n).toString();
    }
    var prec = 1;
    if (n < 1) {
      prec = 3;
    } else if (n < 10) {
      prec = 2;
    }
    return n.toFixed(prec);
  }
  var l, q, r;
  l = Math.floor(Math.log10(n));
  q = Math.floor(l / 3);
  if (q >= numberSuffixes.length) {
    return n.toPrecision(2);
  }
  r = l % 3;
  n /= Math.pow(1000, q);
  if (r === 2) {
    return Math.round(n).toString() + numberSuffixes[q];
  }
  return n.toFixed(2 - r) + numberSuffixes[q];
}

var presentableSlotDict = {
  'weapon': 'Weapon',
  'head': 'Head',
  'chest': 'Chest',
  'hands': 'Hand',
  'legs': 'Leg',
  'skill': 'Skill'
};

function presentableSlot(slotStr) {
  var res = presentableSlotDict[slotStr];
  if (!res) {
    res = slotStr;
  }
  return res;
}

function spaceToUnderscore(str) {
  var arr = str.split(' ');
  return arr.join('_');
}

function addAllMods(bsd, mods) {
  _.each(mods, function (mod) {
    addMod(bsd, mod);
  });
}

// turns shorthand from monster definitions into usable cards
// [['hot sword', 1], ['hard head', 1]] => [{mods: [(hot sword mods)], level:
// 1}, {mods: [(hard head mods)], level: 1}]
function expandSourceCards(sourceCards, level) {
  return _.flatten(_.map(sourceCards, function (card) {
    if (card[0] === undefined) {
      throw 'crap! did you forget a comma after card line in itemref?';
    }
    return applyPerLevels(_itemref.ref.card[card[0]].mods, card[1] + level);
  }, this));
}

var Throttler = exports.Throttler = _model.Model.extend({
  initialize: function initialize(fns, minTime) {
    this.fns = typeof fns === 'function' ? [fns] : fns;
    this.minTime = minTime;
    this.lastCall = 0;
    this.timeout = null;
    this.throttled = this._throttled.bind(this);
    this.clear = this._clear.bind(this);
  },

  _callFns: function _callFns() {
    this._clear();
    this.lastCall = new Date().getTime();
    _.each(this.fns, function (fn) {
      fn();
    });
  },

  _clear: function _clear() {
    clearTimeout(this.timeout);
    this.timeout = null;
  },

  _throttled: function _throttled() {
    var now = new Date().getTime();
    var sinceLast = now - this.lastCall;

    if (sinceLast > this.minTime) {
      this._callFns();
    } else if (this.timeout === null) {
      this.timeout = setTimeout(this._callFns.bind(this), this.minTime - sinceLast);
    }
  }
});

// Takes an existing moving average value and returns the next iteration given
// the [avg], the [newSample], the lookback window, [n], and how many samples
// this sample should count for, [ns].
function computeMovingAvg(avg, newSample, n, ns) {
  if (ns > n) {
    return newSample;
  }
  var oldWeight = (n - ns) / n;
  var newWeight = 1 - oldWeight;
  return avg * oldWeight + newSample * newWeight;
}

// Takes an existing moving average value and returns the next iteration given
// the [avg], the [newSample], the lookback window, [n], and how many samples
// this sample should count for, [ns].
function computeMovingPowma(avg, newSample, n, ns) {
  if (ns > n) {
    return newSample;
  }
  var oldLinearWeight = (n - ns) / n;
  var oldPowWeight = Math.pow(oldLinearWeight, 8);

  return avg * oldPowWeight + newSample * (1 - oldPowWeight);
}

// Takes an existing moving average value and returns the next iteration given
// the [avg], the [newSample], the lookback window, [n], and how many samples
// this sample should count for, [ns].
function computeMovingEwma(avg, newSample, n, ns) {
  if (ns > n) {
    return newSample;
  }
  var newWeight = Math.log2(ns / n + 1);
  var oldWeight = 1 - newWeight;
  return avg * oldWeight + newSample * newWeight;
}

/* exports.extend({
 *   applyPerLevel : applyPerLevel,
 *   applyPerLevels : applyPerLevels,
 *   expandSourceCards : expandSourceCards,
 *   newBaseStatsDict : newBaseStatsDict,
 *   cloneStats : cloneStats,
 *   prettifyMods : prettifyMods,
 *   prettifyPerLvlMods : prettifyPerLvlMods,
 *   addAllMods : addAllMods,
 *   addMod : addMod,
 *   computeStats : computeStats,
 *   computeStat : computeStat,
 *   firstCap : firstCap,
 *   spaceToUnderscore : spaceToUnderscore,
 *   presentableSlot : presentableSlot,
 *   prettifyNum : prettifyNum,
 *   Throttler : Throttler
 * });*/


},{"./itemref/itemref":12,"./log":19,"./model":21,"jquery":32,"underscore":33}],26:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PointFromEvent = PointFromEvent;
exports.Point = Point;
exports.hit = hit;
exports.coneHit = coneHit;
exports.getDistances = getDistances;

var _underscore = require('underscore');

var _ = _interopRequireWildcard(_underscore);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var PI = Math.PI;
var TAU = Math.PI * 2;

function PointFromEvent(event) {
  return new Point(event.pageX, event.pageY);
}

function Point(x, y) {
  this.x = x;
  this.y = y;
  if (isNaN(this.x)) {
    throw 'shoot: some point isnt number';
  }
}

Point.prototype.clone = function () {
  return new Point(this.x, this.y);
};

Point.prototype.add = function (p) {
  return new Point(this.x + p.x, this.y + p.y);
};

Point.prototype.abs = function () {
  return new Point(Math.abs(this.x), Math.abs(this.y));
};

Point.prototype.dadd = function (p) {
  this.x += p.x;
  this.y += p.y;
  return this;
};

Point.prototype.sub = function (p) {
  return new Point(this.x - p.x, this.y - p.y);
};

Point.prototype.flip = function () {
  return new Point(this.y, this.x);
};

Point.prototype.mult = function (scalar) {
  return new Point(this.x * scalar, this.y * scalar);
};

Point.prototype.dist = function (p) {
  return Math.sqrt(this.dist2(p));
};

Point.prototype.dist2 = function (p) {
  var x = this.x - p.x;
  var y = this.y - p.y;
  return x * x + y * y;
};

Point.prototype.len = function () {
  return Math.sqrt(this.x * this.x + this.y * this.y);
};

Point.prototype.len2 = function () {
  return this.x * this.x + this.y * this.y;
};

Point.prototype.within = function (p, radius) {
  return this.sub(p).len2() < radius * radius;
};

Point.prototype.rawDist = function (p) {
  return Math.sqrt(Math.pow(this.x - p.x, 2) + Math.pow(this.y - p.y, 2));
};

Point.prototype.equal = function (p) {
  return this.x === p.x && this.y === p.y;
};

Point.prototype.angle = function () {
  return Math.atan2(this.y, this.x);
};

Point.prototype.closer = function (dest, speed, stop) {
  var diff = dest.sub(this);
  var distance = this.dist(dest);
  var ratio;
  if (distance > stop) {
    if (distance - speed < stop) {
      speed = distance - stop;
    }
    ratio = 1 - (distance - speed) / distance;
  } else {
    if (distance + speed > stop) {
      speed = stop - distance;
    }
    ratio = 1 - (distance + speed) / distance;
  }
  return this.add(diff.mult(ratio));
};

Point.prototype.pctCloser = function (dest, pct) {
  return this.add(dest.sub(this).mult(pct));
};

Point.prototype.toIso = function () {
  return new Point(this.x - this.y, (this.x + this.y) / 2);
};

Point.prototype.toString = function () {
  return '(' + this.x + ', ' + this.y + ')';
};

Point.prototype.dot = function (v) {
  return this.x * v.x + this.y * v.y;
};

Point.prototype.unitVector = function () {
  var len = this.len();
  if (!len) {
    return this;
  } else {
    return this.mult(1 / len);
  }
};

Point.prototype.rotate = function (degrees) {
  var angle = degrees / 180 * Math.PI;
  var sn = Math.sin(angle);
  var cs = Math.cos(angle);

  return new Point(this.x * cs - this.y * sn, this.x * sn + this.y * cs);
};

Point.prototype.inBounds = function (size) {
  var p = this.clone();
  if (p.x < 0) {
    p.x = 0;
  }
  if (p.x > size.x) {
    p.x = size.x;
  }
  if (p.y < 0) {
    p.y = 0;
  }
  if (p.y > size.y) {
    p.y = size.y;
  }
  return p;
};

function hit(s, e, t, r1, r2) {
  var r = r1 + r2;
  var r2 = r * r;

  var st = t.sub(s);
  var et = t.sub(e);
  var se = e.sub(s);

  if (st.len2() < r2 || et.len2() < r2) {
    return true;
  }

  var sd = st.dot(se);
  var ed = et.dot(se);

  if (sd < 0 || ed > 0) {
    return false;
  }

  var closest = Math.sin(Math.acos(sd / (st.len() * se.len()))) * st.len();
  if (closest <= r) {
    return true;
  }
  return false;
}

function coneHit(start, diff, angle, tpos, trad) {
  var arcDist = diff.len();
  var tDist = tpos.sub(start).len();
  if (arcDist < tDist - trad || arcDist > tDist + trad) {
    // Too close or too far away
    return false;
  }

  var leftVector = diff.rotate(angle / 2);
  var leftPoint = start.add(leftVector);
  if (leftPoint.within(tpos, trad)) {
    return true;
  }

  var rightVector = diff.rotate(-angle / 2);
  var rightPoint = start.add(rightVector);
  if (rightPoint.within(tpos, trad)) {
    return true;
  }

  var tv = tpos.sub(start);
  var angleDiff = degrees(Math.abs(tv.angle() - diff.angle()));
  if (angleDiff > 180) {
    angleDiff = 360 - angleDiff;
  }
  if (angleDiff < angle / 2) {
    return true;
  }
  return false;
}

function degrees(x) {
  return x / Math.PI * 180;
}

function getDistances(p1, p2s) {
  return _.map(p2s, function (p2) {
    return p1.dist(p2);
  });
}

/* exports.extend({
 *   Point : Point,
 *   PointFromEvent : PointFromEvent,
 *   hit : hit,
 *   coneHit : coneHit,
 *   getDistances : getDistances
 * });*/


},{"underscore":33}],27:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.StatsTab = exports.GameView = undefined;

var _backbone = require('backbone');

var Backbone = _interopRequireWildcard(_backbone);

var _jquery = require('jquery');

var _jquery2 = _interopRequireDefault(_jquery);

var _underscore = require('underscore');

var _ = _interopRequireWildcard(_underscore);

var _entity = require('./entity');

var entity = _interopRequireWildcard(_entity);

var _footerViews = require('./footer-views');

var _globals = require('./globals');

var _itemref = require('./itemref/itemref');

var _log = require('./log');

var _log2 = _interopRequireDefault(_log);

var _model = require('./model');

var _utils = require('./utils');

var utils = _interopRequireWildcard(_utils);

var _vectorutils = require('./vectorutils');

var _vis = require('./vis');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var FOOTER_HEIGHT = 114;

var GameView = exports.GameView = Backbone.View.extend({
  el: (0, _jquery2.default)('body'),

  initialize: function initialize(options, game) {
    _log2.default.info('GameView initialize');

    this.configTab = new ConfigTab({}, game);
    this.statsTab = new StatsTab({}, game);
    this.itemTab = new ItemTab({}, game);
    this.helpTab = new HelpTab({}, game);
    this.accountTab = new AccountTab({}, game);
    this.mapTab = new MapTab({}, game);
    this.cardTab = new CardTab({}, game);
    this.craftTab = new CraftTab({}, game);
    this.recycleTab = new RecycleTab({}, game);
    this.buildTab = new BuildTab({}, game);

    this.leftButtonsView = new LeftButtonsView({}, this.getLeft.bind(this));
    this.rightButtonsView = new RightButtonsView({}, game.inv, game.cardInv, this.getRight.bind(this));
    this.footerView = new _footerViews.FooterView({}, game, this.itemTab.dragHandler, this.cardTab.dragHandler, this.craftTab);
    this.infoBox = new InfoBox({}, this.getRight.bind(this));

    this.visView = new _vis.VisView({}, game, this);
    this.$el.append(this.visView.render().el);

    this.$el.append(this.statsTab.render().el);
    this.$el.append(this.mapTab.render().el);
    this.$el.append(this.itemTab.render().el);
    this.$el.append(this.cardTab.render().el);
    this.$el.append(this.craftTab.render().el);
    this.$el.append(this.recycleTab.render().el);

    this.$el.append(this.leftButtonsView.render().el);
    this.$el.append(this.rightButtonsView.render().el);
    this.$el.append(this.infoBox.el);
    this.$el.append(this.footerView.render().el);
    this.$el.append(this.configTab.render().el);
    this.$el.append(this.helpTab.render().el);
    this.$el.append(this.accountTab.render().el);
    this.$el.append(this.buildTab.render().el);

    this.resizeThrottler = new _utils.Throttler(function () {
      _globals.gl.DirtyQueue.mark('throttledResize');
    }, 500);
    (0, _jquery2.default)(window).on('resize', this.resizeThrottler.throttled);
  },

  getLeft: function getLeft() {
    var left = 0;
    if (this.statsTab.tvm.visible) {
      left = this.statsTab.$el.width();
    } else if (this.mapTab.tvm.visible) {
      left = this.mapTab.$el.width();
    } else if (this.helpTab.tvm.visible) {
      left = this.helpTab.$el.width();
    } else if (this.configTab.tvm.visible) {
      left = this.configTab.$el.width();
    } else if (this.accountTab.tvm.visible) {
      left = this.accountTab.$el.width();
    }
    return left;
  },

  getRight: function getRight() {
    var right = 0;
    if (this.itemTab.tvm.visible) {
      right = this.itemTab.$el.width();
    } else if (this.cardTab.tvm.visible) {
      right = this.cardTab.$el.width();
    } else if (this.craftTab.tvm.visible) {
      right = this.craftTab.$el.width();
    } else if (this.recycleTab.tvm.visible) {
      right = this.recycleTab.$el.width();
    } else if (this.buildTab.tvm.visible) {
      right = this.buildTab.$el.width();
    }
    return right;
  },

  getCenter: function getCenter() {
    var left = this.getLeft();
    var right = this.getRight();

    return new _vectorutils.Point((window.innerWidth - left - right) / 2 + left, (window.innerHeight - FOOTER_HEIGHT) / 2);
  }
});

var TabVisibilityManager = _model.Model.extend({
  // This is a handy class which handles events triggered by clicking the
  // tab-opening buttons in the footer,
  //   shows or hides the appropriate tabs, and triggers tabShow and tabHide
  //   events for others to listen to.
  // Each TabView has an instance

  initialize: function initialize(name, $el, render, showEventStr) {
    // hideEventStr1, hideEventStr2, ..., hideEventStrN
    this.name = name;
    this.$el = $el;
    this.render = render; // Make sure render is bound to the correct this context
    this.visible = false;
    this.$el.addClass('hidden');
    this.listenTo(_globals.gl.UIEvents, showEventStr, this.toggleVisible);
    for (var i = 4; i < arguments.length; i++) {
      this.listenTo(_globals.gl.UIEvents, arguments[i], this.hide);
    }
  },

  show: function show() {
    _log2.default.UI('Showing %s tab', this.name);
    this.visible = true;
    this.$el.removeClass('hidden');

    // TODO - little janky
    if (this.name === 'cards' || this.name === 'craft') {
      _globals.gl.cardSort(this.name);
    }

    this.render();
    _globals.gl.UIEvents.trigger('tabShow', this.name);
  },

  hide: function hide() {
    _log2.default.info('Hiding %s tab', this.name);
    this.visible = false;
    this.$el.addClass('hidden');
    _globals.gl.UIEvents.trigger('tabHide', this.name);
  },

  toggleVisible: function toggleVisible() {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
    _globals.gl.DirtyQueue.mark('centerChange');
  }
});

var EntityView = Backbone.View.extend({
  tagName: 'div',

  template: _.template((0, _jquery2.default)('#kv-table-template').html()),

  initialize: function initialize(options, zone) {
    // TODO add selective updating
    this.listenTo(_globals.gl.DirtyListener, 'computeAttrs', this.render);
    this.zone = zone;
  },

  render: function render() {
    var skill, statname;
    var data = {};
    var skilldata = {};
    var matdata = {};
    var body = this.model;
    var spec = body.spec;

    data.body = [['Name', spec.name], ['Level', spec.level]];

    var zoneData = this.zone.statResult;

    for (var i = 0; i < this.model.skills.length; i++) {
      var arr = [];
      skill = this.model.skills[i];
      _.each(entity.dmgKeys, function (key) {
        if (key === 'projCount' && skill.spec.projCount <= 1) {
          return;
        }
        if (key === 'decayRange') {
          return;
        }
        if (key === 'radius' || key === 'rate' || key === 'angle') {
          // todo only if not aoe
          return;
        }
        statname = _itemref.ref.statnames[key];
        arr.push([statname, skill.spec[key].toFixed(2)]);
        if (key === 'accuracy') {
          var dodge = zoneData.avgs['dodge'];
          var alevel = this.model.spec.level;
          var dlevel = this.zone.level;
          var attAcc = skill.spec.accuracy;
          var hitChance = 3 * (attAcc / (attAcc + dodge)) * (0.5 + alevel / (alevel + dlevel) / 2);
          var chance = Math.max(Math.min(0.99, hitChance), 0.01);
          chance = (chance * 100).toFixed(2);
          arr.push(['Avg % Chance to Hit', chance + '%']);
        }
      }, this);

      var coolIn = Math.max(0, skill.coolAt - _globals.gl.time);
      arr.push(['Cool In', Math.floor(coolIn)]);
      skilldata[skill.spec.name] = arr;
    }

    data.spec = [];
    var specKeys = entity.defKeys.concat(entity.eleResistKeys).concat(entity.thornKeys);
    ;
    var key;

    var resistTypes = {
      'armor': 'physDmg',
      'fireResist': 'fireDmg',
      'coldResist': 'coldDmg',
      'lightResist': 'lightDmg',
      'poisResist': 'poisDmg'
    };

    for (var i = 0; i < specKeys.length; i++) {
      key = specKeys[i];
      statname = _itemref.ref.statnames[key];

      data.spec.push([statname, this.model.spec[key].toFixed(2)]);
      if (key === 'dodge') {
        statname = 'Avg % Dodge Chance (this zone)';
        var dodge = this.model.spec.dodge;
        var alevel = this.zone.level;
        var dlevel = this.model.spec.level;
        var attAcc = zoneData.avgs['accuracy'];
        var hitChance = 3 * (attAcc / (attAcc + dodge)) * (0.5 + alevel / (alevel + dlevel) / 2);
        var chance = Math.max(Math.min(0.99, 1 - hitChance), 0.01);
        chance = (chance * 100).toFixed(2);
        data.spec.push([statname, chance + '%']);
        statname = 'Min % Dodge Chance (this zone)';
        var dodge = this.model.spec.dodge;
        var alevel = this.zone.level;
        var dlevel = this.model.spec.level;
        var attAcc = zoneData.maxs['accuracy'];
        var hitChance = 3 * (attAcc / (attAcc + dodge)) * (0.5 + alevel / (alevel + dlevel) / 2);
        var chance = Math.max(Math.min(0.99, 1 - hitChance), 0.01);
        chance = (chance * 100).toFixed(2);
        data.spec.push([statname, chance + '%']);
      }
      if (Object.keys(resistTypes).indexOf(key) !== -1) {
        var dmgType = resistTypes[key];
        var prettyDmgName = _itemref.ref.statnames[dmgType];
        prettyDmgName = prettyDmgName.split(' ')[0];
        var avgDmg = zoneData.avgs[dmgType];
        var maxDmg = zoneData.maxs[dmgType];
        var avgRedFactor = avgDmg / (avgDmg + this.model.spec[key]);
        var maxRedFactor = maxDmg / (maxDmg + this.model.spec[key]);
        data.spec.push(['Avg % ' + prettyDmgName + ' Taken', (avgRedFactor * 100).toFixed(4) + '%']);
        data.spec.push(['Max % ' + prettyDmgName + ' Taken', (maxRedFactor * 100).toFixed(4) + '%']);
      }
    }
    var version = this.model.spec.versionCreated.split('-').join('.');
    data.spec.push(['Character Version', version]);
    data.spec.push(['Score', this.zone.unlockedZones]);
    data.spec.push(['Last Death', (0, _utils.firstCap)(this.model.spec.lastDeath)]);

    matdata['Materials'] = [];
    // TODO - possible improper use of each
    _.each(_itemref.ref.materials, function (mat, matname) {
      matdata['Materials'].push([mat.printed, (0, _utils.prettifyNum)(spec.matInv[matname])]);
    }, this);

    this.$el.html(this.template(Object.assign({ data: data, skilldata: skilldata, matdata: matdata }, utils)));
    return this;
  }
});

var StatsTab = exports.StatsTab = Backbone.View.extend({
  tagName: 'div',
  className: 'stats',

  initialize: function initialize(options, game) {
    _log2.default.info('GameView initialize');

    this.zone = game.zone;
    this.last = {};
    this.heroView = new EntityView({ model: this.zone.hero }, this.zone);
    this.listenTo(_globals.gl.DirtyListener, 'zoneTick', this.render);

    this.tvm = new TabVisibilityManager('stats', this.$el, this.render.bind(this), 'footer:buttons:stats', 'footer:buttons:map', 'footer:buttons:help', 'footer:buttons:config', 'footer:buttons:account');

    this.$el.append('<div class="holder"></div>');
    this.$holder = this.$('.holder');

    this.resize();
    this.listenTo(_globals.gl.DirtyListener, 'throttledResize', this.resize);
  },

  resize: function resize() {
    var size = new _vectorutils.Point(window.innerWidth, window.innerHeight - FOOTER_HEIGHT);
    this.$el.css({ height: size.y });
    this.$('.holder').css({ height: size.y });
  },

  diffs: function diffs() {
    return {
      inst_uid: this.zone.iuid,
      heroPos: this.zone.heroPos,
      liveMonsCount: this.zone.liveMons().length
    };
  },

  render: function render() {
    if (!this.tvm.visible) {
      return this;
    }
    var diffs = this.diffs();
    this.$holder.html(this.heroView.render().el);
    return this;
  }
});

var InfoBox = Backbone.View.extend({
  tagName: 'div',
  className: 'infoBox',
  template: _.template((0, _jquery2.default)('#info-box-template').html(), utils),

  initialize: function initialize(options, getRight) {
    this.getRight = getRight;

    this.listenTo(_globals.gl.UIEvents, 'itemSlotMouseenter', this.show);
    this.listenTo(_globals.gl.UIEvents, 'itemSlotMouseleave', this.hide);

    this.listenTo(_globals.gl.DirtyListener, 'hero:xp', this.render);
    this.listenTo(_globals.gl.DirtyListener, 'card:level', this.render);

    this.listenTo(_globals.gl.UIEvents, 'tabShow', this.updateRight);
    this.listenTo(_globals.gl.UIEvents, 'tabHide', this.updateRight);
  },

  updateRight: function updateRight() {
    this.$el.css('right', this.getRight() + 43);
  },

  show: function show(view) {
    if (view.model !== undefined) {
      this.view = view;
      this.render();
    }
  },

  hide: function hide() {
    this.view = undefined;
    this.render();
  },

  render: function render() {
    if (this.view) {
      this.$el.css('display', 'block');
      // Avoid crashes due to undefineds
      this.$el.html(this.template(Object.assign({}, utils, this.view)));
    } else {
      this.$el.css('display', 'none');
    }

    return this;
  }
});

var LeftButtonsView = Backbone.View.extend({
  tagName: 'div',
  className: 'buttons left',
  template: _.template((0, _jquery2.default)('#left-buttons-template').html()),

  events: {
    'mousedown .config-button': 'clickConfig',
    'mousedown .help-button': 'clickHelp',
    'mousedown .stats-button': 'clickStats',
    'mousedown .map-button': 'clickMap',
    'mousedown .account-button': 'clickAccount'
  },

  initialize: function initialize(options, getLeft) {
    this.getLeft = getLeft;

    this.listenTo(_globals.gl.UIEvents, 'tabShow', this.onTabShow);
    this.listenTo(_globals.gl.UIEvents, 'tabHide', this.onTabHide);

    this.listenTo(_globals.gl.DirtyListener, 'newChange', this.setNew);
  },

  onTabShow: function onTabShow(name) {
    this.updatePos();
    this.$('.' + name + '-button').addClass('open');
  },

  onTabHide: function onTabHide(name) {
    this.updatePos();
    this.$('.' + name + '-button').removeClass('open');
  },

  updatePos: function updatePos() {
    this.$el.css('left', this.getLeft());
  },

  clickConfig: function clickConfig() {
    _globals.gl.UIEvents.trigger('footer:buttons:config');
  },
  clickHelp: function clickHelp() {
    _globals.gl.UIEvents.trigger('footer:buttons:help');
  },
  clickStats: function clickStats() {
    _globals.gl.UIEvents.trigger('footer:buttons:stats');
  },
  clickMap: function clickMap() {
    _globals.gl.UIEvents.trigger('footer:buttons:map');
  },
  clickAccount: function clickAccount() {
    _globals.gl.UIEvents.trigger('footer:buttons:account');
  },

  render: function render() {
    this.$el.html(this.template(utils));
    this.updatePos();
    return this;
  }
});

var RightButtonsView = Backbone.View.extend({
  tagName: 'div',
  className: 'buttons right',
  template: _.template((0, _jquery2.default)('#right-buttons-template').html()),

  events: {
    'mousedown .inv-button': 'clickInv',
    'mousedown .cards-button': 'clickCards',
    'mousedown .craft-button': 'clickCraft',
    'mousedown .recycle-button': 'clickRecycle',
    'mousedown .build-button': 'clickBuild'
  },

  initialize: function initialize(options, inv, cardInv, getRight) {
    this.inv = inv;
    this.cardInv = cardInv;
    this.getRight = getRight;

    this.listenTo(_globals.gl.UIEvents, 'tabShow', this.onTabShow);
    this.listenTo(_globals.gl.UIEvents, 'tabHide', this.onTabHide);

    this.listenTo(_globals.gl.DirtyListener, 'newChange', this.setNew);
  },

  setNew: function setNew() {
    if (this.inv.hasNew) {
      this.$('#invnewflag').show();
    } else {
      this.$('#invnewflag').hide();
    }
    if (this.cardInv.hasNew) {
      this.$('#cardnewflag').show();
    } else {
      this.$('#cardnewflag').hide();
    }
  },

  onTabShow: function onTabShow(name) {
    this.updatePos();
    this.$('.' + name + '-button').addClass('open');
  },

  onTabHide: function onTabHide(name) {
    this.updatePos();
    this.$('.' + name + '-button').removeClass('open');
  },

  updatePos: function updatePos() {
    this.$el.css('right', this.getRight());
  },

  clickInv: function clickInv() {
    _globals.gl.UIEvents.trigger('footer:buttons:inv');
  },
  clickCards: function clickCards() {
    _globals.gl.UIEvents.trigger('footer:buttons:cards');
  },
  clickCraft: function clickCraft() {
    _globals.gl.UIEvents.trigger('footer:buttons:craft');
  },
  clickRecycle: function clickRecycle() {
    _globals.gl.UIEvents.trigger('footer:buttons:recycle');
  },
  clickBuild: function clickBuild() {
    _globals.gl.UIEvents.trigger('footer:buttons:build');
  },

  render: function render() {
    this.$el.html(this.template(utils));
    this.updatePos();
    return this;
  }
});

var FilterView = Backbone.View.extend({
  tagName: 'span',
  events: { 'mousedown': 'onClick' },
  onClick: function onClick() {
    this.trigger('click', this);
  },

  initialize: function initialize(options, text, value) {
    this.el.innerHTML = text;
    this.value = value;
  },

  select: function select() {
    this.selected = true;
    this.$el.addClass('selected');
  },

  unselect: function unselect() {
    this.selected = false;
    this.$el.removeClass('selected');
  }
});

var AbstractFilterBarView = Backbone.View.extend({
  tagName: 'div',

  initialize: function initialize(options, texts, values) {
    this.texts = texts;
    this.values = values;
    this.views = [];
  },

  render: function render() {
    var frag = document.createDocumentFragment();
    var view;
    for (var i = 0; i < this.texts.length; i++) {
      view = new FilterView({}, this.texts[i], this.values[i]);
      this.listenTo(view, 'click', this.onClick);
      frag.appendChild(view.render().el);
      this.views.push(view);
    }
    this.$el.append(frag);

    this.views[0].select();
    this.selectedValue = this.views[0].value;

    return this;
  },

  onClick: function onClick(view) {
    _.invoke(this.views, 'unselect');
    view.select();
    this.selectedValue = view.value;
    _globals.gl.DirtyQueue.mark('filterChange');
  },

  filter: function filter() {
    throw 'This is an abstract class';
  }
});

var WeaponTypeFilterBarView = AbstractFilterBarView.extend({
  filter: function filter(items) {
    if (this.selectedValue === undefined) {
      return items;
    }
    return _.filter(items, function (item) {
      if (item.itemType === 'armor') {
        return false;
      }
      if (item.itemType === 'weapon') {
        return item.weaponType === this.selectedValue;
      }
      if (item.itemType === 'skill') {
        return item.skillType === this.selectedValue;
      }
    }, this);
  }
});

var SlotTypeFilterBarView = AbstractFilterBarView.extend({
  filter: function filter(items) {
    if (this.selectedValue === undefined) {
      return items;
    }
    return _.filter(items, function (item) {
      return item.slot === this.selectedValue;
    }, this);
  }
});

var EquippedFilterBarView = AbstractFilterBarView.extend({
  filter: function filter(items) {
    if (this.selectedValue === undefined) {
      return items;
    }
    return _.filter(items, function (item) {
      return item.equipped === this.selectedValue;
    }, this);
  }
});

var DragHandler = Backbone.View.extend({
  tagName: 'div',
  template: _.template((0, _jquery2.default)('#draggable-template').html()),
  className: 'dragSlot',

  DISABLED: 0,
  DISABLED_WAIT: 1,
  UP_DRAG: 2,
  DOWN_DRAG: 3,

  initialize: function initialize(extraMDF) {
    this.uid = _.uniqueId('mml');
    this.state = this.DISABLED;
    this.extraMDF = extraMDF;
    (0, _jquery2.default)('body').append(this.el);
    (0, _jquery2.default)('body').on('mousedown ' + this.uid, this.onMousedown.bind(this));
    (0, _jquery2.default)('body').on('mousemove ' + this.uid, this.onMousemove.bind(this));
    (0, _jquery2.default)('body').on('mouseup ' + this.uid, this.onMouseup.bind(this));

    this.updateBodySize();
    this.listenTo(_globals.gl.DirtyListener, 'throttledResize', this.updateBodySize);
  },

  onViewMousedown: function onViewMousedown(event, model) {
    if (this.state === this.DISABLED) {
      _log2.default.info('disabled to disabled wait');
      this.state = this.DISABLED_WAIT;
      this.model = model;
      this.dragStart = (0, _vectorutils.PointFromEvent)(event);
      this.$el.html(this.template(Object.assign(this.model, utils)));
    }
  },

  onMousedown: function onMousedown(event) {
    if (this.extraMDF !== undefined) {
      this.extraMDF(event);
    }
    if (this.state === this.UP_DRAG) {
      _log2.default.info('up drag to down drag');
      this.state = this.DOWN_DRAG;
    }
  },

  onMousemove: function onMousemove(event) {
    if (this.state === this.DISABLED_WAIT) {
      if (this.dragStart.dist2((0, _vectorutils.PointFromEvent)(event)) > 25) {
        _log2.default.info('disabled wait to down drag');
        this.state = this.DOWN_DRAG;
        this.startDragging(event);
      }
    } else if (this.state === this.DOWN_DRAG || this.state === this.UP_DRAG) {
      this.updatePos(event);
    }
  },

  onMouseup: function onMouseup(event) {
    if (this.state === this.DISABLED_WAIT) {
      _log2.default.info('Disabled wait to up drag');
      this.state = this.UP_DRAG;
      this.startDragging(event);
    } else if (this.state === this.DOWN_DRAG) {
      _log2.default.info('down drag to disabled');
      this.state = this.DISABLED;
      this.stopDragging(event);
    }
  },

  isDraggingThis: function isDraggingThis(model) {
    return (this.state === this.DOWN_DRAG || this.state === this.UP_DRAG) && this.model.id === model.id;
  },

  startDragging: function startDragging(event) {
    this.$el.css('display', 'block');
    this.updatePos(event);

    this.trigger('dragstart');
  },

  stopDragging: function stopDragging(event) {
    _log2.default.info('DROP');

    this.state = this.DISABLED;
    this.$el.css('display', 'none');
    var model = this.model;
    this.model = undefined;
    this.trigger('drop', (0, _vectorutils.PointFromEvent)(event), model);
  },

  updateBodySize: function updateBodySize() {
    this.bodySize = new _vectorutils.Point(window.innerWidth, window.innerHeight);
  },

  updatePos: function updatePos(event) {
    var left = event.pageX - 37;
    var top = event.pageY - 37;

    if (left < 0) {
      left = 0;
    }
    if (left + 77 > this.bodySize.x) {
      left = this.bodySize.x - 77;
    }
    if (top < 0) {
      top = 0;
    }
    if (top + 77 > this.bodySize.y) {
      top = this.bodySize.y - 77;
    }

    this.$el.css({ top: top, left: left });
  },

  remove: function remove() {
    Backbone.View.prototype.remove.call(this);
    (0, _jquery2.default)('body').off('mousedown ' + this.uid, this.onMousedown.bind(this));
    (0, _jquery2.default)('body').off('mousemove ' + this.uid, this.onMousemove.bind(this));
    (0, _jquery2.default)('body').off('mouseup ' + this.uid, this.onMouseup.bind(this));
  }
});

var ItemSlot = Backbone.View.extend({
  tagName: 'div',
  className: 'itemSlot',
  template: _.template((0, _jquery2.default)('#item-slot-template').html()),

  events: {
    'mousedown': 'onMousedown',
    'mouseenter': 'onMouseenter',
    'mouseleave': 'onMouseleave'
  },

  onMousedown: function onMousedown(event) {
    if (this.model) {
      this.model.isNew = false;
      this.dragHandler.onViewMousedown(event, this.model);
      this.render();
    }
  },

  onMouseenter: function onMouseenter() {
    _globals.gl.UIEvents.trigger('itemSlotMouseenter', this);
    this.trigger('hovering', this);
  },

  onMouseleave: function onMouseleave() {
    if (this.model && this.model.isNew) {
      // log.error('removing is new from model %s', this.model.name);
      this.model.isNew = false;
      this.render();
      _globals.gl.DirtyQueue.mark('removeNew');
    }
    this.trigger('hovering');
    _globals.gl.UIEvents.trigger('itemSlotMouseleave');
  },

  initialize: function initialize(options, dragHandler, slot, equipper) {
    this.dragHandler = dragHandler;

    if (slot !== undefined) {
      this.slot = slot;
      this.equipper = equipper;
      this.listenTo(this.dragHandler, 'drop', this.onDrop);
    } else {
      this.slot = undefined;
    }
    this.listenTo(this.dragHandler, 'dragstart', this.render);

    this.listenTo(_globals.gl.UIEvents, 'itemSlotMouseenter', this.onOtherMouseenter);
    this.listenTo(_globals.gl.UIEvents, 'itemSlotMouseleave', this.onOtherMouseleave);
    this.listenTo(_globals.gl.DirtyListener, 'newChange', this.showIsNew);
    this.render();
  },

  onOtherMouseenter: function onOtherMouseenter(hoveredSlot) {
    if (hoveredSlot.slot === undefined && this.slot !== undefined) {
      if (this.slot === hoveredSlot.model.slot || typeof this.slot === 'number' && hoveredSlot.model.itemType === 'skill') {
        this.yellow = true;
        this.$el.addClass('yellow');
      }
    }
  },

  onOtherMouseleave: function onOtherMouseleave() {
    this.yellow = false;
    this.$el.removeClass('yellow');
  },

  dropSuccess: function dropSuccess(dropPos) {
    var off = this.$el.offset();
    var pos = new _vectorutils.Point(off.left, off.top);
    var diff = dropPos.sub(pos);

    return diff.x >= 0 && diff.x <= 73 && diff.y >= 0 && diff.y <= 73;
  },

  onDrop: function onDrop(dropPos, model) {
    if (this.dropSuccess(dropPos)) {
      this.equipper.equip(model, this.slot);
    }
    // TODO is this here only so that the model that is being dragged (and
    // hidden) can be shown again?
    //   if so, is a full tab re-render necessary?
    _globals.gl.DirtyQueue.mark('itemTab');
  },

  // Overwritten by CTItemSlot as logic is different
  showIsNew: function showIsNew() {
    if (this.model && this.model.isNew) {
      this.$el.addClass('new');
    } else {
      this.$el.removeClass('new');
    }
  },

  render: function render() {
    this.$el.html(this.template(Object.assign({}, utils, this)));
    if (this.model && this.model.disabled) {
      this.$el.addClass('red');
    }
    if (this.model && this.dragHandler.isDraggingThis(this.model)) {
      this.$el.addClass('dragging');
    }
    this.showIsNew();
    return this;
  }
});

// CardTab ItemSlot
var CTItemSlot = ItemSlot.extend({
  onMousedown: function onMousedown(event) {
    if (this.model) {
      if (this.model.itemType === 'card') {
        this.dragHandler.onViewMousedown(event, this.model);
        this.render();
      } else {
        this.trigger('gearMousedown', this);
      }
    }
  },

  select: function select() {
    this.selected = true;
    this.$el.addClass('selected');
  },
  unselect: function unselect() {
    this.selected = false;
    this.$el.removeClass('selected');
  },

  onDrop: function onDrop(dropPos, model) {
    if (this.dropSuccess(dropPos) && this.equipper) {
      this.equipper.equipCard(model, this.slot);
    }
    // TODO is this here only so that the model that is being dragged (and
    // hidden) can be shown again?
    //   if so, is a full tab re-render necessary?
    _globals.gl.DirtyQueue.mark('cardTab');
  },

  showIsNew: function showIsNew() {
    var isNew = false;
    if (this.model) {
      if (this.model.itemType === 'card') {
        isNew = this.model.isNew;
      } else {
        isNew = this.model.hasNewCards; // Set by NewStateManager in inventory
      }
    }
    if (isNew) {
      this.$el.addClass('new');
    } else {
      this.$el.removeClass('new');
    }
  },

  render: function render() {
    ItemSlot.prototype.render.call(this);
    if (this.selected) {
      this.$el.addClass('selected');
    }
  }
});

var ItemTab = Backbone.View.extend({
  tagName: 'div',
  className: 'itemTab',
  template: _.template((0, _jquery2.default)('#item-tab-template').html()),

  events: {
    'mouseleave': 'onMouseleave'
  },

  onMouseleave: function onMouseleave() {
    _globals.gl.UIEvents.trigger('itemSlotMouseleave');
  },

  initialize: function initialize(options, game) {
    this.equipped = game.hero.equipped;
    this.skillchain = game.hero.skillchain;
    this.inventory = game.inv;

    this.hovering = undefined;
    this.renderedOnce = false;

    this.allViews = [];
    this.dragHandler = new DragHandler(); // passed to itemSlots, used to
    // detect unequip drops
    this.listenTo(this.dragHandler, 'drop', this.onDrop);

    this.fb1 = new WeaponTypeFilterBarView({}, ['All', 'Ml', 'Ra', 'Sp'], [undefined, 'melee', 'range', 'spell']).render();
    this.fb2 = new SlotTypeFilterBarView({}, ['All', 'We', 'He', 'Ha', 'Ch', 'Lg', 'Sk'], [undefined, 'weapon', 'head', 'hands', 'chest', 'legs', 'skill']).render();

    // Map dirty queue events to itemTab update
    _globals.gl.DirtyQueue.mapMark(['item:new', 'recycleChange', 'computeAttrs', 'skillComputeAttrs', 'filterChange'], 'itemTab');
    // render on itemTab dirty
    this.listenTo(_globals.gl.DirtyListener, 'itemTab', this.render);

    this.throttler = new _utils.Throttler(function () {
      _globals.gl.DirtyQueue.mark('itemTab');
    }, 1000);
    this.listenTo(_globals.gl.DirtyListener, 'hero:xp', this.throttler.throttled);

    this.tvm = new TabVisibilityManager('inv', this.$el, this.render.bind(this), 'footer:buttons:inv', 'footer:buttons:craft', 'footer:buttons:cards', 'footer:buttons:recycle', 'footer:buttons:build');

    this.resize();
    this.listenTo(_globals.gl.DirtyListener, 'throttledResize', this.resize);
  },

  resize: function resize() {
    var size = new _vectorutils.Point(window.innerWidth, window.innerHeight - FOOTER_HEIGHT);
    this.$el.css('height', size.y);
    this.holderHeight = size.y;
    this.$('.holder').css('height', size.y);
  },

  onDrop: function onDrop(dropPos, model) {
    // log.warning('item tab onDrop');
    var off = this.$('.unequipped').offset();
    if (model.equipped && dropPos.x >= off.left && dropPos.y >= off.top) {
      if (model.itemType === 'skill') {
        // unequip a skill, must find out what slot it was in
        var slot = this.skillchain.getSkillSlot(model);
        this.skillchain.equip(undefined, slot);
      } else {
        this.equipped.equip(undefined, model.slot);
      }
      // log.warning('item tab onDrop unequipping');
    }
  },

  onHover: function onHover(itemSlot) {
    this.hovering = itemSlot;
  },

  newItemSlot: function newItemSlot(model, slot, parent) {
    var view = new ItemSlot({ model: model }, this.dragHandler, slot, parent);
    this.listenTo(view, 'hovering', this.onHover);
    this.allViews.push(view);
    return view;
  },

  render: function render() {
    if (!this.tvm.visible) {
      return this;
    }

    if (!this.renderedOnce) {
      this.$el.html(this.template(utils));
      this.$('.filters').append(this.fb1.el);
      this.$('.filters').append(this.fb2.el);
      this.$equipped = this.$('.equipped');
      this.$skillchain = this.$('.skillchain');
      this.$unequipped = this.$('.unequipped');
      this.renderedOnce = true;
      this.resize();
    }

    // properly remove all views
    _.each(this.allViews, function (view) {
      this.stopListening(view);
      view.remove();
    }, this);
    this.allViews = [];

    _.each(this.equipped.slots, function (slot) {
      var view = this.newItemSlot(this.equipped[slot], slot, this.equipped);
      this.$equipped.append(view.el);
    }, this);

    _.each(this.skillchain.skills, function (skill, i) {
      var view = this.newItemSlot(skill, i, this.skillchain);
      this.$skillchain.append(view.el);
    }, this);

    var items = _.where(this.inventory.getModels(), { equipped: false });
    items = this.fb1.filter(items);
    items = this.fb2.filter(items);
    _.each(items, function (model) {
      var view = this.newItemSlot(model);
      this.$unequipped.append(view.el);
    }, this);

    if (this.hovering && this.hovering.model) {
      this.hovering = _.find(this.allViews, function (view) {
        return view.model && this.hovering.model.id === view.model.id;
      }, this);
      if (this.hovering) {
        this.hovering.onMouseenter();
      }
    }

    return this;
  }
});

var CardTab = Backbone.View.extend({
  tagName: 'div',
  className: 'itemTab',
  template: _.template((0, _jquery2.default)('#card-tab-template').html()),

  events: { 'mouseleave': 'onMouseleave' },

  onMouseleave: function onMouseleave() {
    _globals.gl.UIEvents.trigger('itemSlotMouseleave');
  },

  initialize: function initialize(options, game) {
    this.equipped = game.hero.equipped;
    this.skillchain = game.hero.skillchain;
    this.cardInv = game.cardInv;

    this.renderedOnce = false;

    this.hovering = undefined;
    this.selected = undefined;

    this.allViews = [];
    this.dragHandler = new DragHandler(this.onBodyMousedown.bind(this));
    this.listenTo(this.dragHandler, 'drop', this.onDrop);

    // Map dirty queue events to itemTab update
    _globals.gl.DirtyQueue.mapMark(['card:new', 'card:levelup', 'recycleChange', 'computeAttrs', 'skillComputeAttrs'], 'cardTab');
    _globals.gl.DirtyQueue.mapMark(['equipChange'], 'hardRenderCardTab');

    this.listenTo(_globals.gl.DirtyListener, 'cardTab', this.render);
    this.listenTo(_globals.gl.DirtyListener, 'hardRenderCardTab', this.hardRender);

    this.throttler = new _utils.Throttler(function () {
      _globals.gl.DirtyQueue.mark('cardTab');
    }, 1000);
    this.listenTo(_globals.gl.DirtyListener, 'material:new', this.throttler.throttled);
    this.listenTo(_globals.gl.DirtyListener, 'hero:xp', this.throttler.throttled);

    this.tvm = new TabVisibilityManager('cards', this.$el, this.render.bind(this), 'footer:buttons:cards', 'footer:buttons:craft', 'footer:buttons:inv', 'footer:buttons:recycle', 'footer:buttons:build');

    var unselect = function () {
      this.selected = undefined;
    }.bind(this);

    this.listenTo(_globals.gl.UIEvents, 'footer:buttons:cards', unselect);
    this.listenTo(_globals.gl.UIEvents, 'footer:buttons:inv', unselect);

    this.resize();
    this.listenTo(_globals.gl.DirtyListener, 'throttledResize', this.resize);
  },

  onDrop: function onDrop(dropPos, cardModel) {
    if (cardModel.equipped) {
      var off = this.$('.unequipped').offset();
      if (dropPos.x < off.left || dropPos.x >= off.left && dropPos.y >= off.top && dropPos.y < window.innerHeight - FOOTER_HEIGHT) {
        var gear = cardModel.gearModel;
        var slot = gear.getCardSlot(cardModel);
        gear.equipCard(undefined, slot);
      }
    }
  },

  onBodyMousedown: function onBodyMousedown(event) {
    // if the mousedown is in the body and not on the card tab, deselect the
    // selected gear piece
    if (event.pageX <= this.$el.offset().left) {
      this.hardRender();
    }
  },

  resize: function resize() {
    var size = new _vectorutils.Point(window.innerWidth, window.innerHeight - FOOTER_HEIGHT);
    this.$el.css({ left: size.x - 405, height: size.y });
    this.holderHeight = size.y;
    this.$('.holder').css('height', size.y);
  },

  onGearMousedown: function onGearMousedown(view) {
    if (this.selected) {
      this.selected.unselect();

      if (this.selected.model.id === view.model.id) {
        this.selected = undefined;
        _globals.gl.DirtyQueue.mark('cardTab');
        return;
      }
    }
    this.selected = view;
    this.selected.select();
    _globals.gl.DirtyQueue.mark('cardTab');
  },

  onHover: function onHover(hoveredView) {
    this.hovering = hoveredView;
  },

  newItemSlot: function newItemSlot(model, slot, equipper) {
    // TODO: fix the args:
    var view = new CTItemSlot({ model: model }, this.dragHandler, slot, equipper);

    this.listenTo(view, 'gearMousedown', this.onGearMousedown);
    this.listenTo(view, 'hovering', this.onHover);

    this.allViews.push(view);
    return view;
  },

  hardRender: function hardRender() {
    this.selected = undefined;
    return this.render();
  },

  render: function render() {
    if (!this.tvm.visible) {
      return this;
    }

    if (!this.renderedOnce) {
      this.$el.html(this.template(Object.assign({ selected: this.selected }, utils)));
      this.$('.holder').css('height', this.holderHeight);
      this.renderedOnce = true;
    }

    if (this.selected) {
      this.$('.equipped-cards').find('.header').html('Equipped ' + (0, _utils.presentableSlot)(this.selected.model.slot) + ' Cards');
      this.$('.unequipped').find('.header').html('Unequipped ' + (0, _utils.presentableSlot)(this.selected.model.slot) + ' Cards');
    } else {
      this.$('.equipped-cards').find('.header').html('Click an item above to equip cards');
      this.$('.unequipped').find('.header').html('All Unequipped Cards');
    }

    // call remove() on all views, and stopListening on all views
    _.each(this.allViews, function (view) {
      this.stopListening(view);
      view.remove();
    }, this);
    this.allViews = [];

    var frag = document.createDocumentFragment();
    _.each(this.equipped.slots, function (slot) {
      // if model, can select, cannot unequip, is not card
      var view = this.newItemSlot(this.equipped[slot], slot);
      frag.appendChild(view.el);
    }, this);
    this.$('.equipped').append(frag);

    frag = document.createDocumentFragment();
    _.each(this.skillchain.skills, function (skill, i) {
      // if model, can select, cannot unequip, is not card
      var view = this.newItemSlot(skill, i);
      frag.appendChild(view.el);
    }, this);
    this.$('.skillchain').append(frag);

    // If item selected, show item's cards
    var cards;
    if (this.selected) {
      frag = document.createDocumentFragment();
      _.each(this.selected.model.cards, function (card, slot) {
        // cannot select, if model can unequip, is card
        var view = this.newItemSlot(card, slot, this.selected.model);
        frag.appendChild(view.el);
      }, this);
      this.$('.equipped-cards').append(frag);

      var slot = typeof this.selected.slot === 'number' ? 'skill' : this.selected.slot;
      cards = _.where(this.cardInv.getModels(), { slot: slot }); // get filtered cards
    } else {
      cards = this.cardInv.getModels(); // get all cards
    }
    cards = _.filter(cards, function (card) {
      return !card.equipped;
    });

    frag = document.createDocumentFragment();
    _.each(cards, function (card) {
      // no slot, no parent, can select, cannot unequip, is card
      var view = this.newItemSlot(card, card.slot);
      frag.appendChild(view.el);
    }, this);
    this.$('.unequipped').append(frag);

    // selected slot is an ItemSlot holding a equippedGear or skill model
    if (this.selected) {
      var selectedView = _.find(this.allViews, function (view) {
        return view.model && this.selected.model.id === view.model.id;
      }, this);
      if (selectedView && selectedView.model.equipped) {
        selectedView.select();
        this.selected = selectedView;
      } else {
        this.selected = undefined;
      }
    }
    if (this.hovering && this.hovering.model) {
      this.hovering = _.find(this.allViews, function (view) {
        return view.model && this.hovering.model.id === view.model.id;
      }, this);
      if (this.hovering) {
        this.hovering.onMouseenter();
      }
    }

    return this;
  }
});

var FocusedTabSlot = Backbone.View.extend({
  tagName: 'div',
  className: 'itemSlot',
  template: _.template((0, _jquery2.default)('#focused-tab-item-slot-template').html()),
  events: {
    'mousedown': 'onMousedown',
    'mouseenter': 'onMouseenter',
    'mouseleave': 'onMouseleave'
  },
  onMousedown: function onMousedown(event) {
    this.parent.onChildMousedown(this);
  },
  select: function select() {
    this.selected = true;
    this.render();
  },
  unselect: function unselect() {
    this.selected = false;
    this.render();
  },
  onMouseenter: function onMouseenter() {
    _globals.gl.UIEvents.trigger('itemSlotMouseenter', this);
  },
  onMouseleave: function onMouseleave() {
    _globals.gl.UIEvents.trigger('itemSlotMouseleave');
  },
  initialize: function initialize(options, parent) {
    this.parent = parent;
  },
  render: function render() {
    this.$el.html(this.template(Object.assign({}, utils, this)));
    if (this.selected) {
      this.$el.addClass('selected');
    } else {
      this.$el.removeClass('selected');
    }
    return this;
  }
});

var FocusedArea = Backbone.View.extend({
  tagName: 'div',
  className: 'focused-area',

  select: function select(model) {
    this.model = model;
    this.render();
  },

  unselect: function unselect() {
    this.model = undefined;
    this.render();
  },

  render: function render() {
    this.$el.html(this.template(Object.assign({}, this, utils)));
    return this;
  }
});

var CraftFocusedArea = FocusedArea.extend({
  template: _.template((0, _jquery2.default)('#craft-tab-focus-area-template').html()),

  events: { 'mousedown .upgrade': 'onUpgrade' },

  onUpgrade: function onUpgrade() {
    if (this.matInv.tryLevelCard(this.model, 1)) {
      this.render();
    }
    _log2.default.error('Upgraded %s to level %d', this.model.name, this.model.level);
    this.cardInv.sort('craft');
    _globals.gl.DirtyQueue.mark('card:levelup');
    _globals.gl.EquipEvents.trigger('change');
  },

  initialize: function initialize(options, matInv, cardInv) {
    this.matInv = matInv;
    this.cardInv = cardInv;
    this.ref = _itemref.ref;
    this.listenTo(_globals.gl.DirtyListener, 'material:new', this.render);
  }
});

var RecycleFocusedArea = FocusedArea.extend({
  template: _.template((0, _jquery2.default)('#recycle-tab-focus-area-template').html()),

  initialize: function initialize(options, matInv, recycleManager) {
    this.matInv = matInv;
    this.recycleManager = recycleManager;
  }
});

var FocusedTab = Backbone.View.extend({
  tagName: 'div',
  className: 'itemTab',
  template: _.template((0, _jquery2.default)('#focused-tab-template').html()),
  FocusedAreaClass: FocusedArea,

  events: { 'mouseleave': 'onMouseleave' },

  onMouseleave: function onMouseleave() {
    _globals.gl.UIEvents.trigger('itemSlotMouseleave');
  },

  onChildMousedown: function onChildMousedown(view, force) {
    if (this.selected) {
      this.selected.unselect();
      this.focusedAreaView.unselect();
    }
    // selected needs to remain here

    if (this.selected && this.selected.model.id === view.model.id && !force) {
      this.selected = undefined;
    } else {
      this.selected = view;
      this.selected.select();
      this.focusedAreaView.select(view.model);
    }
  },

  tryUnselect: function tryUnselect() {
    if (this.selected) {
      this.selected.unselect();
      this.focusedAreaView.unselect();
      this.selected = undefined;
    }
  },

  initialize: function initialize(options, game) {
    this.renderedOnce = false;
    this.selected = undefined;

    this.allViews = [];

    this.listenTo(_globals.gl.DirtyListener, 'throttledResize', this.resize);
  },

  resize: function resize() {
    var size = new _vectorutils.Point(window.innerWidth, window.innerHeight - FOOTER_HEIGHT);
    this.$el.css('height', size.y);
    this.holderHeight = size.y;
    this.$('.holder').css('height', size.y);
  },

  getItems: function getItems() {
    throw 'This is an abstract class';
  },

  render: function render() {
    if (!this.tvm.visible) {
      return this;
    }

    if (!this.renderedOnce) {
      this.$el.html(this.template(utils));
      this.$('.focused-area').html(this.focusedAreaView.render().el);
      this.$inv = this.$('.inventory');

      var $filters = this.$('.filters');
      _.each(this.fbs, function (fb) {
        $filters.append(fb.el);
      });
      this.resize();
      this.renderedOnce = true;
    }

    _.invoke(this.allViews, 'remove');
    this.allViews = [];

    var items = this.getItems();

    var frag = document.createDocumentFragment();
    _.each(items, function (model) {
      var view = new FocusedTabSlot({ model: model }, this);
      this.allViews.push(view);
      if (this.selected && this.selected.model.id === model.id) {
        this.selected = view;
        view.selected = true;
      }
      frag.appendChild(view.render().el);
    }, this);

    this.$inv.append(frag);
    this.focusedAreaView.render();

    return this;
  }
});

var CraftTab = FocusedTab.extend({
  initialize: function initialize(options, game) {
    FocusedTab.prototype.initialize.call(this, options, game);

    this.cardInv = game.cardInv;
    this.matInv = game.matInv;

    this.fbs = [new EquippedFilterBarView({}, ['All', 'Eq', 'Ueq'], [undefined, true, false]).render(), new SlotTypeFilterBarView({}, ['All', 'We', 'He', 'Ha', 'Ch', 'Lg', 'Sk'], [undefined, 'weapon', 'head', 'hands', 'chest', 'legs', 'skill']).render()];

    _globals.gl.DirtyQueue.mapMark(['filterChange', 'card'], 'craftTab');
    this.listenTo(_globals.gl.DirtyListener, 'craftTab', this.render);

    this.throttler = new _utils.Throttler(function () {
      _globals.gl.DirtyQueue.mark('sortCraftTab');
    }, 1000);
    this.listenTo(_globals.gl.DirtyListener, 'material:new', this.throttler.throttled);
    this.listenTo(_globals.gl.DirtyListener, 'sortCraftTab', this.sortRender);

    this.tvm = new TabVisibilityManager('craft', this.$el, this.render.bind(this), 'footer:buttons:craft', 'footer:buttons:inv', 'footer:buttons:cards', 'footer:buttons:recycle', 'footer:buttons:build');

    this.focusedAreaView = new CraftFocusedArea({}, this.matInv, this.cardInv);
  },

  sortRender: function sortRender() {
    var sortStyle = this.tvm.visible ? 'craft' : 'card';
    this.cardInv.sort(sortStyle);
    this.render();
  },

  getItems: function getItems() {
    var items = this.fbs[0].filter(this.cardInv.getModels());
    items = this.fbs[1].filter(items);
    return items;
  },

  forceFocus: function forceFocus(model) {
    var view = _.find(this.allViews, function (view) {
      return view.model.id === model.id;
    }, this);

    // force a mousedown
    this.onChildMousedown(view, true);
  },

  forceDeselect: function forceDeselect(model) {
    if (this.selected && this.selected.model.id === model.id) {
      this.selected.unselect();
      this.focusedAreaView.unselect();
      this.selected = undefined;
    }
  }
});

var RecycleTab = FocusedTab.extend({
  events: {
    'click .recycle-restore-button': 'onRestore',
    'click .recycle-this-button': 'onRecycle',
    'click .recycle-all-button': 'onRecycleAll'
  },

  onRestore: function onRestore() {
    _log2.default.warning('restore');
    if (this.selected) {
      this.selected.model.inRecycle = false;
      this.selected.unselect();
      this.focusedAreaView.unselect();
      this.selected = undefined;

      _globals.gl.DirtyQueue.mark('recycleChange');
    }
  },

  onAnyRecycle: function onAnyRecycle(matSlots) {
    // Handle the unselecting of focused item, trigger change events
    if (this.selected) {
      this.selected.unselect();
      this.focusedAreaView.unselect();
      this.selected = undefined;
    }

    var drops = [];
    _.each(matSlots, function (slot) {
      drops.push(this.recycleManager.getRecycleValue(slot));
    }, this);

    this.matInv.addDrops(drops);

    _globals.gl.DirtyQueue.mark('recycleChange');
  },

  onRecycle: function onRecycle() {
    _log2.default.warning('recycle');
    if (this.selected) {
      var slot = this.selected.model.recycle();
      this.onAnyRecycle([slot]);
    }
  },

  onRecycleAll: function onRecycleAll() {
    _log2.default.warning('recycle all');
    var slots = [];
    _.each(this.allViews, function (view) {
      slots.push(view.model.recycle());
    });
    this.onAnyRecycle(slots);
  },

  initialize: function initialize(options, game) {
    FocusedTab.prototype.initialize.call(this, options, game);

    this.inv = game.inv;
    this.cardInv = game.cardInv;
    this.matInv = game.matInv;
    this.recycleManager = game.recycleManager;

    this.fbs = [new SlotTypeFilterBarView({}, ['All', 'We', 'He', 'Ha', 'Ch', 'Lg', 'Sk'], [undefined, 'weapon', 'head', 'hands', 'chest', 'legs', 'skill']).render()];

    _globals.gl.DirtyQueue.mapMark(['item:new', 'card:new', 'filterChange', 'recycleChange', 'zone:unlocked'], 'recycleTab');
    this.listenTo(_globals.gl.DirtyListener, 'recycleTab', this.render);

    this.tvm = new TabVisibilityManager('recycle', this.$el, this.render.bind(this), 'footer:buttons:recycle', 'footer:buttons:inv', 'footer:buttons:cards', 'footer:buttons:craft', 'footer:buttons:build');

    this.focusedAreaView = new RecycleFocusedArea({}, this.matInv, this.recycleManager);
  },

  getItems: function getItems() {
    var items = this.recycleManager.getModels();
    items = this.fbs[0].filter(items);
    return items;
  }
});

var ZoneMapTab = Backbone.View.extend({
  tagName: 'div',
  className: 'zone noselect',
  template: _.template((0, _jquery2.default)('#zone-map-tab-template').html()),

  events: {
    'mousedown': 'onClick'
  },

  onClick: function onClick() {
    this.trigger('click', this.model.zoneNum);
  },

  render: function render() {
    if (this.model.running) {
      this.$el.addClass('running');
    }
    this.$el.html(this.template(Object.assign({}, utils, this.model)));
    return this;
  }
});

var MapTab = Backbone.View.extend({
  tagName: 'div',
  className: 'map',

  events: {
    'click #autoAdvance': 'toggleAutoAdvance'
  },

  initialize: function initialize(options, game) {
    this.zone = game.zone;
    this.settings = game.settings;

    this.tvm = new TabVisibilityManager('map', this.$el, this.render.bind(this), 'footer:buttons:map', 'footer:buttons:stats', 'footer:buttons:help', 'footer:buttons:config', 'footer:buttons:account');

    this.$el.html((0, _jquery2.default)('#map-tab-template').html());
    this.$holder = this.$('.holder');

    this.resize();
    this.listenTo(_globals.gl.DirtyListener, 'throttledResize', this.resize);
    this.listenTo(_globals.gl.DirtyListener, 'zone:unlocked', this.render);
    this.listenTo(_globals.gl.DirtyListener, 'zone:start', this.render);
  },

  resize: function resize() {
    this.$el.css({ height: window.innerHeight - FOOTER_HEIGHT });
    this.$holder.css({ height: window.innerHeight - FOOTER_HEIGHT });
  },

  toggleAutoAdvance: function toggleAutoAdvance() {
    this.settings['autoAdvance'] = this.$('#autoAdvance').prop('checked');
  },

  zoneClick: function zoneClick(zoneName) {
    _log2.default.UI('MapTab: Clicked on zone: %s', zoneName);
    this.zone.nextZone = zoneName;
    this.zone.newZone(zoneName);
    this.render();
  },

  render: function render() {
    if (!this.tvm.visible) {
      return this;
    }
    _.each(this.subs, function (sub) {
      sub.remove();
      this.stopListening(sub);
    }, this);
    this.subs = [];

    var frag = document.createDocumentFragment();
    var preTag = document.createElement('div');
    preTag.innerHTML = '<p><input type="checkbox" id="autoAdvance" /> Auto-advance on zone clear</p>';
    frag.appendChild(preTag);
    var data, sub, name, zoneRef;

    var len = this.zone.unlockedZones + 1;
    for (var i = len - 1; i >= 0; i--) {
      var currentZone = this.zone.getZoneFromNum(i);

      var zoneCount = this.zone.zoneOrder.length;
      var upgradeCount = currentZone.upgradeCount;
      var zoneI = currentZone.zoneI;
      var level = Math.max(1, i * 5); // 5 is constant for Zone spacing

      var name = currentZone.name;
      var zoneRef = this.zone.allZones[name];
      var nameStr = currentZone.nameStr;
      data = _.extend({
        name: nameStr,
        level: level,
        running: i === this.zone.nextZone,
        zoneNum: i
      }, zoneRef);
      sub = new ZoneMapTab({ model: data });
      this.listenTo(sub, 'click', this.zoneClick);
      this.subs.push(sub);
      frag.appendChild(sub.render().el);
    }

    this.$holder.html(frag);
    (0, _jquery2.default)('#autoAdvance').prop('checked', this.settings.autoAdvance);
    return this;
  }
});

var ConfigTab = Backbone.View.extend({
  tagName: 'div',
  className: 'config',
  template: _.template((0, _jquery2.default)('#config-template').html()),

  events: {
    'click #wipebutton': 'wipe',
    'click #namebutton': 'nameButton',
    'click #devbutton': 'devButton',
    'click #donateButton': 'donate',
    'click #enableBuildHotkeys': 'toggleEnableBuildHotkeys',
    'click #autoCraft': 'toggleEnableAutoCraft',
    'click #pauseOnDeath': 'pauseOnDeath',
    'click #enableHeroDmgMsgs': 'enableHeroDmgMsgs',
    'click #enableMonDmgMsgs': 'enableMonDmgMsgs',
    'click #enableMatMsgs': 'enableMatMsgs',
    'click #backOnDeath': 'backOnDeath',
    'click #bossPause': 'bossPause',
    'change #moveAngle': 'moveAngle',
    'change #zonesBack': 'zonesBack',
    'click #disable-shake': 'disableShake'
  },

  initialize: function initialize(options, game) {
    this.zone = game.zone;
    this.settings = game.settings;
    this.hero = game.hero;

    this.tvm = new TabVisibilityManager('config', this.$el, this.render.bind(this), 'footer:buttons:config', 'footer:buttons:map', 'footer:buttons:help', 'footer:buttons:stats', 'footer:buttons:account');

    this.$el.html('<div class="holder"></div>');
    this.$holder = this.$('.holder');

    this.resize();
    this.listenTo(_globals.gl.DirtyListener, 'throttledResize', this.resize);

    // Close Checkout on page navigation
    (0, _jquery2.default)(window).on('popstate', function () {
      if (this.handler) {
        this.handler.close();
      }
    });
  },

  resize: function resize() {
    this.$el.css({ height: window.innerHeight - FOOTER_HEIGHT });
    this.$holder.css({ height: window.innerHeight - FOOTER_HEIGHT });
  },

  render: function render() {
    if (!this.tvm.visible) {
      return this;
    }
    this.$holder.html(this.template(Object.assign({}, utils, this)));
    (0, _jquery2.default)('#enableBuildHotkeys').prop('checked', !!_globals.gl.settings.enableBuildHotkeys);
    (0, _jquery2.default)('#disable-shake').prop('checked', !!_globals.gl.settings.disableShake);
    (0, _jquery2.default)('#autoCraft').prop('checked', !!_globals.gl.settings.autoCraft);
    (0, _jquery2.default)('#pauseOnDeath').prop('checked', !!_globals.gl.settings.pauseOnDeath);
    (0, _jquery2.default)('#enableHeroDmgMsgs').prop('checked', !!_globals.gl.settings.enableHeroDmgMsgs);
    (0, _jquery2.default)('#enableMonDmgMsgs').prop('checked', !!_globals.gl.settings.enableMonDmgMsgs);
    (0, _jquery2.default)('#enableMatMsgs').prop('checked', !!_globals.gl.settings.enableMatMsgs);
    (0, _jquery2.default)('#backOnDeath').prop('checked', !!_globals.gl.settings.backOnDeath);
    (0, _jquery2.default)('#bossPause').prop('checked', !!_globals.gl.settings.bossPause);
    (0, _jquery2.default)('#moveAngle').val(this.hero.moveAngle ? this.hero.moveAngle : 0);
    (0, _jquery2.default)('#zonesBack').val(_globals.gl.settings.zonesBack);
    return this;
  },

  donate: function donate(e) {
    var amount = Math.round(parseFloat((0, _jquery2.default)('#donationamount').val()) * 100);
    amount = Math.max(100, amount);
    _log2.default.donateAttempt(amount);
    this.handler = StripeCheckout.configure({
      key: 'pk_live_Udj2pXdBbHxWllQWuAzempnY',
      bitcoin: true,
      token: function token(_token) {
        return _log2.default.handleDonationToken(_token, amount);
      }
    });
    this.handler.open({
      name: 'DungeonsOfDerp',
      description: 'Donate towards development',
      amount: amount
    });
    e.preventDefault();
  },

  toggleEnableBuildHotkeys: function toggleEnableBuildHotkeys() {
    _globals.gl.settings['enableBuildHotkeys'] = this.$('#enableBuildHotkeys').prop('checked');
  },

  toggleEnableAutoCraft: function toggleEnableAutoCraft() {
    _globals.gl.settings['autoCraft'] = this.$('#autoCraft').prop('checked');
  },

  pauseOnDeath: function pauseOnDeath() {
    _globals.gl.settings['pauseOnDeath'] = this.$('#pauseOnDeath').prop('checked');
  },

  enableHeroDmgMsgs: function enableHeroDmgMsgs() {
    _globals.gl.settings['enableHeroDmgMsgs'] = this.$('#enableHeroDmgMsgs').prop('checked');
  },

  enableMonDmgMsgs: function enableMonDmgMsgs() {
    _globals.gl.settings['enableMonDmgMsgs'] = this.$('#enableMonDmgMsgs').prop('checked');
  },

  enableMatMsgs: function enableMatMsgs() {
    _globals.gl.settings['enableMatMsgs'] = this.$('#enableMatMsgs').prop('checked');
  },

  backOnDeath: function backOnDeath() {
    _globals.gl.settings['backOnDeath'] = this.$('#backOnDeath').prop('checked');
  },

  bossPause: function bossPause() {
    _globals.gl.settings['bossPause'] = this.$('#bossPause').prop('checked');
  },

  moveAngle: function moveAngle() {
    _globals.gl.setMoveAngle(this.$('#moveAngle').val());
  },

  zonesBack: function zonesBack() {
    if (isNaN(parseInt(this.$('#zonesBack').val())) || parseInt(this.$('#zonesBack').val()) < 0) {
      return;
    }
    _globals.gl.settings['zonesBack'] = parseInt(this.$('#zonesBack').val());
  },

  wipe: function wipe() {
    _log2.default.error('Wiping save and creating new char with version: %s', _globals.gl.VERSION_NUMBER);
    _log2.default.reportNewBuild();
    localStorage.removeItem('data');
    location.reload();
  },

  nameButton: function nameButton() {
    var userInput = (0, _jquery2.default)('#charname').val();
    this.hero.name = userInput.length < 64 ? userInput : 'SMARTASS';
    _globals.gl.DirtyQueue.mark('rename');
  },

  devButton: function devButton() {
    var msg = (0, _jquery2.default)('#devmsg').val();
    _log2.default.feedback(this.hero.name + ' says: ' + msg);
    (0, _jquery2.default)('#devmsg').val('');
  },

  disableShake: function disableShake() {
    _globals.gl.settings.disableShake = (0, _jquery2.default)('#disable-shake').prop('checked');
  }
});

var HelpTab = Backbone.View.extend({
  tagName: 'div',
  className: 'help',

  initialize: function initialize(options, game) {
    this.template = _.template((0, _jquery2.default)('#help-template').html()), this.zone = game.zone;

    this.tvm = new TabVisibilityManager('help', this.$el, this.render.bind(this), 'footer:buttons:help', 'footer:buttons:map', 'footer:buttons:config', 'footer:buttons:stats', 'footer:buttons:account');

    this.$el.html('<div class="holder"></div>');
    this.$holder = this.$('.holder');

    this.resize();
    this.listenTo(_globals.gl.DirtyListener, 'throttledResize', this.resize);
  },

  resize: function resize() {
    this.$el.css({ height: window.innerHeight - FOOTER_HEIGHT });
    this.$holder.css({ height: window.innerHeight - FOOTER_HEIGHT });
  },

  render: function render() {
    if (!this.tvm.visible) {
      return this;
    }
    this.$holder.html(this.template(Object.assign({ gl: _globals.gl }, utils)));
    return this;
  }
});

var BuildTab = Backbone.View.extend({
  tagName: 'div',
  className: 'build',
  template: _.template((0, _jquery2.default)('#build-template').html()),

  initialize: function initialize(options, game) {
    this.zone = game.zone;

    this.tvm = new TabVisibilityManager('build', this.$el, this.render.bind(this), 'footer:buttons:build', 'footer:buttons:recycle', 'footer:buttons:inv', 'footer:buttons:cards', 'footer:buttons:craft');

    this.$el.html('<div class="holder"></div>');
    this.$holder = this.$('.holder');

    this.resize();
    this.listenTo(_globals.gl.DirtyListener, 'throttledResize', this.resize);
    this.listenTo(_globals.gl.UIEvents, 'buildsave', this.render);
    this.listenTo(_globals.gl.UIEvents, 'buildload', this.render);
  },

  resize: function resize() {
    this.$el.css({ height: window.innerHeight - FOOTER_HEIGHT });
    this.$holder.css({ height: window.innerHeight - FOOTER_HEIGHT });
  },

  render: function render() {
    if (!this.tvm.visible) {
      return this;
    }

    var buildNames = [];
    for (var _i = 0; _i < 21; _i++) {
      var build = _globals.gl.builds[_i];
      if (!build) {
        buildNames[_i] = 'Empty';
        continue;
      }
      buildNames[_i] = !!build.name ? build.name : buildNames[_i] = 'Build ' + _i;
    }

    this.$holder.html(this.template(Object.assign({
      lastBuildLoaded: _globals.gl.lastBuildLoaded,
      buildNames: buildNames
    }, utils)));

    for (var i = 0; i < 21; i++) {
      this.$holder.find('#load-build-' + i).on('click', _globals.gl.loadBuild.bind(null, i));
      this.$holder.find('#save-build-' + i).on('click', _globals.gl.saveBuild.bind(null, i));
    }
    this.$holder.find('#rename-build-button').on('click', _globals.gl.renameBuild);
    return this;
  }
});

var AccountTab = Backbone.View.extend({
  tagName: 'div',
  className: 'account',

  events: {
    'click #signInSubmit': 'signInSubmit',
    'click #newAccSubmit': 'newAccSubmit',
    'click #fbFullSave': 'fbFullSave',
    'click #fbFullLoad': 'fbFullLoad',
    'click #signOut': 'signOut',
    'click #prestige': 'prestige',
    'click .spendPrestige': 'spendPrestige'
  },

  initialize: function initialize(options, game) {
    this.template = _.template((0, _jquery2.default)('#account-template').html());
    this.zone = game.zone;
    this.game = game;
    this.tvm = new TabVisibilityManager('account', this.$el, this.render.bind(this), 'footer:buttons:account', 'footer:buttons:map', 'footer:buttons:config', 'footer:buttons:stats', 'footer:buttons:help');

    this.$el.html('<div class="holder"></div>');
    this.$holder = this.$('.holder');

    this.prestigeStats = ['strength', 'dexterity', 'wisdom', 'vitality', 'maxHp', 'maxMana', 'armor', 'dodge', 'eleResistAll', 'fireResist', 'coldResist', 'lightResist', 'poisResist', 'meleeDmg', 'rangeDmg', 'spellDmg', 'physDmg', 'fireDmg', 'coldDmg', 'lightDmg', 'poisDmg', 'accuracy'];
    this.remainingPrestige;
    if (this.game.hero.prestige === undefined) {
      this.game.hero.prestige = {};
      _.each(this.prestigeStats, function (stat) {
        this.game.hero.prestige[stat] = 0;
      }, this);
    } else {
      _.each(this.prestigeStats, function (stat) {
        if (this.game.hero.prestige[stat] === undefined) {
          this.game.hero.prestige[stat] = 0;
        }
      }, this);
    }

    this.resize();
    this.listenTo(_globals.gl.DirtyListener, 'throttledResize', this.resize);
    this.listenTo(_globals.gl.DirtyListener, 'hero:xp', this.render);
  },

  signInSubmit: function signInSubmit() {
    // alert('sign in');
    _globals.gl.FB.authWithPassword({
      email: (0, _jquery2.default)('#signInUsername').val(),
      password: (0, _jquery2.default)('#signInPassword').val()
    }, function (error, authData) {
      console.log('err', error);
      if (error !== undefined && error !== null) {
        alert(error.message);
      }
      console.log('a', authData);
      if (authData !== undefined) {
        _globals.gl.accountId = authData.uid;
        localStorage.setItem('accountId', authData.uid);
        this.render();
      } else {
        console.log(error);
      }
    }.bind(this), {});
  },

  newAccSubmit: function newAccSubmit() {
    _globals.gl.FB.createUser({
      email: (0, _jquery2.default)('#newAccUsername').val(),
      password: (0, _jquery2.default)('#newAccPassword').val()
    }, function (error, userData) {
      if (error) {
        switch (error.code) {
          case "EMAIL_TAKEN":
            alert("The new user account cannot be created because the email is already in use.");
            break;
          case "INVALID_EMAIL":
            alert("The specified email is not a valid email.");
            break;
          default:
            alert("Error creating user:", error);
        }
      } else {
        alert("Successfully created user account with uid:" + userData.uid + " - Please sign in");
      }
    });
  },

  fbFullSave: function fbFullSave() {
    this.game.fbFullSave();
  },

  fbFullLoad: function fbFullLoad() {
    this.game.fbFullLoad();
  },

  signOut: function signOut() {
    _globals.gl.FB.unauth();
    _globals.gl.accountId = undefined;
    localStorage.removeItem('accountId');
    this.render();
  },

  resize: function resize() {
    this.$el.css({ height: window.innerHeight - FOOTER_HEIGHT });
    this.$holder.css({ height: window.innerHeight - FOOTER_HEIGHT });
  },

  prestige: function prestige() {
    var prestigeAmount = this.lvlPrestigeVal(this.game.hero.level);
    _log2.default.error('Prestiging for ' + prestigeAmount + ' points');
    _log2.default.prestige(prestigeAmount);
    localStorage.removeItem('data');
    localStorage.setItem('prestigeTotal', prestigeAmount);
    location.reload();
  },

  spendPrestige: function spendPrestige() {
    if (arguments[0].shiftKey) {
      recurse = true;
    }
    var stat = arguments[0].currentTarget.id;
    while (this.game.hero.prestige[stat] !== undefined && this.remainingPrestige > this.game.hero.prestige[stat]) {
      this.game.hero.prestige[stat] += 1;
      this.game.hero.computeAttrs();
      this.render();
      if (recurse !== true) {
        return;
      }
    }
  },

  render: function render() {
    if (!this.tvm.visible) {
      return this;
    }
    (0, _jquery2.default)('#signInUsername').val("bobtony@firebase.com");
    (0, _jquery2.default)('#signInPassword').val("correcthorsebatterystaple");

    var prestigeNext = this.lvlPrestigeVal(this.game.hero.level);
    var statSelectors = '';
    var totalAllocatedPoints = 0;
    var statObjs = [];

    _.map(this.prestigeStats, function (stat) {
      var points = this.game.hero.prestige[stat];
      statObjs.push({
        stat: stat,
        pretty: _itemref.ref.statnames[stat],
        points: points,
        cost: points + 1
      });
      totalAllocatedPoints += _.range(points + 1).sum();
    }, this);

    var remainingPrestige = this.game.hero.prestigeTotal - totalAllocatedPoints;

    this.$holder.html(this.template(Object.assign({
      gl: _globals.gl,
      statObjs: statObjs,
      remainingPrestige: remainingPrestige,
      prestigeNext: prestigeNext,
      prestigeTotal: this.game.hero.prestigeTotal
    }, utils)));

    return this;
  },

  lvlPrestigeVal: function lvlPrestigeVal(lvl) {
    return Math.pow(Math.max(0, lvl - 100), 2);
  }
});

/* exports.extend({
 *   GameView : GameView,
 *   StatsTab : StatsTab,
 * });*/


},{"./entity":6,"./footer-views":8,"./globals":9,"./itemref/itemref":12,"./log":19,"./model":21,"./utils":25,"./vectorutils":26,"./vis":28,"backbone":30,"jquery":32,"underscore":33}],28:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.VisView = undefined;

var _backbone = require('backbone');

var Backbone = _interopRequireWildcard(_backbone);

var _jquery = require('jquery');

var _jquery2 = _interopRequireDefault(_jquery);

var _underscore = require('underscore');

var _ = _interopRequireWildcard(_underscore);

var _globals = require('./globals');

var _itemref = require('./itemref/itemref');

var _log = require('./log');

var _log2 = _interopRequireDefault(_log);

var _model = require('./model');

var _vectorutils = require('./vectorutils');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

/*
  TODO:
  Vis view's el is a div
  Make BackgroundView its own el=canvas view
  Make EntityView its own el=canvas view
  Make canvas full screen, abs positioned
  OnResize adjust global RATIO, REAL_SIZE so the max dimension is
  the min size of the screen
*/

var FOOTER_HEIGHT = 113;

var vvs = {}; // vis vars
var SIZE = 1000 * 10;

var VisView = exports.VisView = Backbone.View.extend({
  tagName: 'div',
  className: 'vis',

  events: { 'mouseenter': 'onMouseenter' },
  onMouseenter: function onMouseenter() {
    _globals.gl.UIEvents.trigger('itemSlotMouseleave');
  }, // this is because chrome's mouse leave doesn't work

  // this needs to get all zones, when game model changes, probably should get
  // all of gameModel
  initialize: function initialize(options, game, gameView) {
    _globals.gl.vvsRatioMod = 1;
    _log2.default.info('visview init');
    this.zone = game.zone;
    this.gameView = gameView;

    this.updateConstants();

    this.bg = new BackgroundView({}, game);
    this.entity = new EntityView({}, game);

    this.listenTo(_globals.gl.DirtyListener, 'throttledResize', this.resize);
    this.resize();

    this.$el.append(this.bg.render().el);
    this.$el.append(this.entity.render().el);

    this.listenTo(_globals.gl.DirtyListener, 'tick', this.render);
    this.listenTo(_globals.gl.DirtyListener, 'hero:move', this.updateConstants);
    this.listenTo(_globals.gl.DirtyListener, 'centerChange', this.force);

    window.forceUpdateConstants = this.updateConstants.bind(this);
  },

  updateConstants: function updateConstants() {
    var ss = new _vectorutils.Point(window.innerWidth, window.innerHeight - FOOTER_HEIGHT);
    if (ss.y < 40) {
      ss.y = 40;
    }
    vvs.ss = ss.clone();

    if (ss.x / 2 > ss.y) {
      // if height is the limiting factor
      vvs.realSize = ss.y;
    } else {
      vvs.realSize = ss.x / 2;
    }
    vvs.ratio = vvs.realSize / SIZE * _globals.gl.vvsRatioMod;

    vvs.center = this.gameView.getCenter();
    vvs.cart = this.zone.hero.pos.mult(vvs.ratio);
    vvs.iso = vvs.cart.toIso();
    vvs.iso.y -= SIZE / 2;
    vvs.diff = vvs.center.sub(vvs.iso);
  },

  resize: function resize() {
    this.updateConstants();
    this.$el.css({ width: vvs.ss.x, height: vvs.ss.y });

    this.bg.resize();
    this.entity.resize();
  },

  force: function force() {
    this.updateConstants();
    this.bg.force();
  },

  render: function render() {
    return this;
  }
});

function transpose(modelPoint) {
  var viewPoint = modelPoint.mult(vvs.ratio);
  viewPoint = viewPoint.toIso();
  viewPoint.y -= SIZE / 2;
  return viewPoint.add(vvs.diff);
}

var BackgroundTiler = _model.Model.extend({
  initialize: function initialize() {
    var names = _itemref.ref.zoneOrder.order;
    this.tiles = {};
    for (var i = 0; i < names.length; i++) {
      this.tiles[names[i]] = new BackgroundTiles(names[i]);
    }
  },

  ready: function ready(zoneName) {
    this.tiles[zoneName].cache();
    return this.tiles[zoneName].imgLoaded && this.tiles[zoneName].cached;
  },

  get: function get(zoneName) {
    var bt = this.tiles[zoneName];
    bt.cache();
    return bt.canvas;
  }
});

var BackgroundTiles = _model.Model.extend({
  initialize: function initialize(name) {
    this.canvas = document.createElement('canvas');
    this.cached = false;

    this.name = name;
    this.filename = 'assets/' + name.replace(/ /g, '_') + '.jpg';
    this.img = new Image();
    this.img.onload = function () {
      this.imgLoaded = true;
    }.bind(this);
    this.img.src = this.filename;

    this.listenTo(_globals.gl.DirtyListener, 'throttledResize', this.resize);
  },

  getCanvasSize: function getCanvasSize() {
    return new _vectorutils.Point(Math.ceil(20000 * vvs.ratio), Math.ceil(20000 * vvs.ratio));
  },

  cache: function cache() {
    if (!this.imgLoaded) {
      setTimeout(this.cache.bind(this), 50);
      return;
    }
    if (this.cached) {
      return;
    }

    var canvasSize = this.getCanvasSize();
    (0, _jquery2.default)(this.canvas).attr({ width: canvasSize.x, height: canvasSize.y });

    var scaled = Math.floor(256 * vvs.ratio * 10);
    var ctx = this.canvas.getContext('2d');
    var pos, size;

    ctx.drawImage(this.img, 0, 0, 256, 256, 0, 0, scaled, scaled);

    // this still could be faster, uses too many args, could use a separate
    // tmp scaled canvas and draw with that

    for (var pos = scaled; pos <= canvasSize.x; pos *= 2) {
      ctx.drawImage(this.canvas, 0, 0, pos, pos, pos, 0, pos, pos);
      ctx.drawImage(this.canvas, 0, 0, pos, pos, pos, pos, pos, pos);
      ctx.drawImage(this.canvas, 0, 0, pos, pos, 0, pos, pos, pos);
    }

    this.cached = true;

    _globals.gl.DirtyQueue.mark('centerChange');
  },

  resize: function resize() {
    this.cached = false;
  }
});

var BackgroundView = Backbone.View.extend({
  tagName: 'canvas',
  className: 'bg',

  initialize: function initialize(options, game) {
    this.zone = game.zone;

    this.redraw = true;
    this.reposition = true;

    this.tiler = new BackgroundTiler(this.zone.name);

    this.resize();
    this.listenTo(_globals.gl.DirtyListener, 'tick', this.render);
    this.listenTo(_globals.gl.DirtyListener, 'hero:move', function () {
      this.redraw = true;
    });
    this.listenTo(_globals.gl.DirtyListener, 'zone:nextRoom', function () {
      this.redraw = true;
    });
    this.listenTo(_globals.gl.DirtyListener, 'zone:start', function () {
      this.redraw = true;
    });

    this.totalFrames = 0;
    this.totalTime = 0;
  },

  resize: function resize() {
    this.size = new _vectorutils.Point(Math.max(window.innerWidth, 40), Math.max(window.innerHeight - FOOTER_HEIGHT, 40));
    this.$el.attr({ width: this.size.x, height: this.size.y });
    this.ctx = this.el.getContext('2d');
    this.force();
  },

  clear: function clear() {
    this.$el.attr('width', this.size.x);
    this.redraw = true;
  },

  force: function force() {
    this.redraw = true;
    _log2.default.info('force background');
    this.render();
  },

  render: function render() {
    if (this.redraw) {
      var t = new Date().getTime();
      // log.error('redrawing');
      this.clear();

      this.ctx.save();
      this.transform();
      this.drawBg();
      this.redraw = false;
      this.reposition = false;

      this.totalFrames += 1;
      this.totalTime += new Date().getTime() - t;

      if (this.totalFrames >= 60) {
        // log.warning('%d frames, %.3f ms per frame', this.totalFrames,
        // this.totalTime / this.totalFrames);
        this.totalFrames = 0;
        this.totalTime = 0;
      }
    }
    if (this.reposition) {
      _log2.default.error('repositioning');
      this.retransform();
      this.reposition = false;
    }
    return this;
  },

  transform: function transform() {
    var a = 1,
        b = 0.5,
        c = -1,
        d = 0.5;
    var coords = transpose(new _vectorutils.Point(0, 0));
    this.lastPos = this.zone.hero.pos;
    this.ctx.setTransform(a, b, c, d, coords.x, coords.y);
  },

  retransform: function retransform() {
    var a = 1,
        b = 0.5,
        c = -1,
        d = 0.5;
    var posDiff = this.zone.hero.pos.sub(this.lastPos);
    var coords = transpose(posDiff);
    this.ctx.setTransform(a, b, c, d, coords.x, coords.y);
  },

  drawBg: function drawBg() {
    if (!this.tiler.ready(this.zone.name)) {
      return;
    }
    var start = this.zone.heroPos - 4;
    var end = this.zone.heroPos + 4;
    if (start < 0) {
      start = 0;
    }
    if (end >= this.zone.rooms.length) {
      end = this.zone.rooms.length - 1;
    }

    var tiles = this.tiler.get(this.zone.name);

    for (var i = start; i <= end; i++) {
      var room = this.zone.rooms[i];
      var pos = room.pos.sub(this.zone.getCurrentRoom().pos);
      var size;

      pos = pos.mult(vvs.ratio);
      size = room.size.mult(vvs.ratio);
      this.ctx.drawImage(tiles, 0, 0, size.x, size.y, pos.x, pos.y, size.x, size.y);
    }
  }
});

var EntityView = Backbone.View.extend({
  tagName: 'canvas',
  className: 'entity',

  initialize: function initialize(options, game) {
    _log2.default.info('visview init');
    this.zone = game.zone;

    this.resize();
    this.listenTo(_globals.gl.DirtyListener, 'tick', this.render);
    this.tempCanvas = document.createElement('canvas');
    (0, _jquery2.default)(this.tempCanvas).attr({ width: 2000, height: 400 });
    this.tctx = this.tempCanvas.getContext('2d');
  },

  resize: function resize() {
    this.size = new _vectorutils.Point(Math.max(window.innerWidth, 40), Math.max(window.innerHeight - FOOTER_HEIGHT, 40));
    this.$el.attr({ width: this.size.x, height: this.size.y });
  },

  clear: function clear() {
    this.el.getContext('2d').clearRect(0, 0, this.size.x, this.size.y);
  },

  render: function render() {
    this.clear();
    var ctx = this.el.getContext('2d');

    // draw all mons
    var room = this.zone.ensureRoom();
    var mons = this.zone.liveMons();

    var drawables = [];

    _.each(mons, function (mon) {
      drawables.push(new BodyView(mon));
    }, this);

    drawables.push(new BodyView(this.zone.hero));

    _.each(this.zone.getAttacks(), function (atk) {
      drawables.push(new AttackView(atk));
    });

    sortDrawables(drawables);

    _.each(drawables, function (drawable) {
      drawable.draw(ctx, this.tempCanvas);
    }, this);

    this.zone.messages.prune();
    drawMessages(ctx, this.zone.messages.msgs);

    return this;
  }
});

function drawMessages(ctx, msgs) {
  // TODO: fix offset for separating messages about multiple item drops from
  // the same entity
  _.each(msgs, function (msg) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = Math.floor(vvs.ratio * 300) + 'px Source Code Pro';
    if (msg.type === 'dmg') {
      var dmg = msg.dmg;
      ctx.fillStyle = dmg.color;
      var base = transpose(dmg.getBase());
      base.y -= dmg.getY() * vvs.ratio;
      ctx.fillText(msg.text, base.x, base.y);
    } else {
      ctx.fillStyle = msg.color;
      var pos = transpose(msg.pos);
      if (msg.verticalOffset) {
        pos.y -= msg.verticalOffset * vvs.ratio;
      }
      ctx.fillText(msg.text, pos.x, pos.y - (_globals.gl.time - msg.time) / msg.lifespan * 20);
    }
  });
}

function sortDrawables(drawables) {
  for (var i = drawables.length; i--;) {
    drawables[i].updateZ();
  }
  drawables.sort(function (a, b) {
    return a.z - b.z;
  });
}

function AttackView(atk) {
  this.atk = atk;
  this.z = 0;
}

AttackView.prototype.updateZ = function () {
  if (this.atk.type === 'cone' || this.atk.type === 'circle') {
    this.z = 0;
  } else {
    this.z = (this.atk.pos.x + this.atk.pos.y) / 2;
  }
};

AttackView.prototype.draw = function (ctx, tempCanvas) {
  if (this.atk.type === 'proj' && _globals.gl.time < this.atk.fireTime) {
    return;
  }
  if (this.atk.type === 'cone' && _globals.gl.time < this.atk.fireTime) {
    return;
  }
  if (this.atk.type === 'circle' && _globals.gl.time < this.atk.fireTime) {
    return;
  }

  var pos = transpose(this.atk.pos);
  pos.y -= this.atk.z * vvs.ratio;
  if (this.atk.type === 'circle') {
    flatCircle(ctx, this.atk);
  } else if (this.atk.type === 'cone') {
    flatArc(ctx, this.atk); // atk.start, atk. pos, this.atk.color,
    // this.atk.radius * vvs.ratio, true);
  } else {
    circle(ctx, pos, this.atk.color, this.atk.projRadius * vvs.ratio);
  }
};

// Implements drawable interface
function BodyView(body) {
  this.body = body;
  this.z = 0;
  if (this.body.spec.color) {
    this.color = this.body.spec.color;
  } else {
    this.color = this.body.isHero() ? 'rgba(0, 150, 240, 1)' : 'rgba(240, 20, 30, 1)';
  }
}

BodyView.prototype.updateZ = function () {
  this.z = (this.body.pos.x + this.body.pos.y) / 2;
};

BodyView.prototype.draw = function (ctx, tempCanvas) {
  var coords = transpose(this.body.pos);
  var p;
  var height = this.body.spec.height * vvs.ratio;
  var width = this.body.spec.width * vvs.ratio;
  ctx.lineCap = 'round';
  ctx.lineWidth = this.body.spec.lineWidth * vvs.ratio;

  // height *= 3 / 4

  var headPos = new _vectorutils.Point(0, height * 67 / 72);
  var headSize = height * 10 / 72;
  var crotch = new _vectorutils.Point(0, height * 23 / 72);
  var legSize = height * 23 / 72;
  var armPos = new _vectorutils.Point(0, height * 45 / 72);
  var armSize = height * 28 / 72;
  var bodyPos = [headPos, new _vectorutils.Point(0, legSize)];

  var opacity = Math.round(100 * this.body.spec.opacity) / 100;
  var actualColor = this.color.slice(0, this.color.length - 2) + opacity + ")";
  // console.log([this.color, actualColor]);
  ctx.strokeStyle = actualColor;
  // head
  circle(ctx, coords.sub(headPos), actualColor, headSize);
  // isoCircle(ctx, coords.sub(headPos), this.color, headSize, headSize,
  // true);

  // draw body, legs
  var legFrame = 0;
  if (this.body.moveStart > -1) {
    // range 0 to 2.
    var secPerWidth = this.body.spec.width / this.body.spec.moveSpeed * 8; // the * 8 makes it 8x slower than real
    legFrame = (_globals.gl.time - this.body.moveStart) % secPerWidth / secPerWidth * 2;
  }
  ctx.beginPath();
  lines(ctx, coords.sub(new _vectorutils.Point(bodyPos[0].x, bodyPos[0].y - headSize)), coords.sub(bodyPos[1]), coords.add(new _vectorutils.Point(width / 2 * (1 - legFrame), 0)));

  lines(ctx, coords.sub(bodyPos[1]), coords.sub(new _vectorutils.Point(width / 2 * (1 - legFrame), 0)));

  // arms
  var rArm;
  var lArm;

  if (this.body.busy()) {
    var pct;
    if (this.body.lastDuration > 0) {
      pct = (this.body.nextAction - _globals.gl.time) / this.body.lastDuration;
    } else {
      pct = 1;
    }
    var ra = (pct + .1) * 1.3 * Math.PI * 2;
    var mra = Math.PI / 4 * Math.sin(ra);

    var la = pct * Math.PI * 2;
    var mla = Math.PI / 4 * Math.sin(la);

    rArm = new _vectorutils.Point(Math.cos(mra) * width / 2, Math.sin(mra) * width / 2);
    lArm = new _vectorutils.Point(Math.cos(mla + Math.PI) * width / 2, Math.sin(mla + Math.PI) * width / 2);
  } else {
    rArm = new _vectorutils.Point(width / 2, 0);
    lArm = new _vectorutils.Point(-width / 2, 0);
  }

  var armBase = coords.sub(armPos);

  lines(ctx, armBase, armBase.add(rArm));

  lines(ctx, armBase, armBase.add(lArm));

  ctx.stroke();

  drawNameHealth(ctx, tempCanvas, this.body.spec.name, coords.sub(new _vectorutils.Point(0, height)), this.body.hp / this.body.spec.maxHp);
};

function lines(ctx, p) {
  if (p) {
    ctx.moveTo(p.x, p.y);
  }
  for (var i = 2; i < arguments.length; i++) {
    ctx.lineTo(arguments[i].x, arguments[i].y);
  }
}

function drawNameHealth(ctx, tcanvas, text, pos, hpPct) {
  if (hpPct < 0) {
    hpPct = 0;
  }
  text = text.toUpperCase();

  var fontHeight = Math.floor(vvs.ratio * 300);

  ctx.fillStyle = '#111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = fontHeight + 'px Source Code Pro';
  ctx.fillText(text, pos.x, pos.y - fontHeight * 1.75);

  var tctx = tcanvas.getContext('2d');

  var textWidth = tctx.measureText(text).width;

  tctx.clearRect(0, 0, textWidth, fontHeight);

  tctx.fillStyle = '#e12';
  tctx.textAlign = 'left';
  tctx.textBaseline = 'top';
  tctx.font = fontHeight + 'px Source Code Pro';
  tctx.fillText(text, 0, 0);

  tctx.clearRect(textWidth * hpPct, 0, textWidth, fontHeight);
  ctx.drawImage(tcanvas, 0, 0, textWidth, fontHeight, pos.x - textWidth / 2, pos.y - fontHeight * 1.75, textWidth, fontHeight);
}

function circle(ctx, pos, color, radius) {
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI, false);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function isoCircle(ctx, pos, color, width, height, fill) {
  ctx.strokeStyle = color;
  drawEllipseByCenter(ctx, pos.x, pos.y, width * 2, height * 2);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = color;
    ctx.fill();
  }
}

function drawEllipseByCenter(ctx, cx, cy, w, h) {
  drawEllipse(ctx, cx - w / 2.0, cy - h / 2.0, w, h);
}

function drawEllipse(ctx, x, y, w, h) {
  var kappa = .5522848,
      ox = w / 2 * kappa,
      // control point offset horizontal
  oy = h / 2 * kappa,
      // control point offset vertical
  xe = x + w,
      // x-end
  ye = y + h,
      // y-end
  xm = x + w / 2,
      // x-middle
  ym = y + h / 2; // y-middle

  ctx.beginPath();
  ctx.moveTo(x, ym);
  ctx.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
  ctx.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
  ctx.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
  ctx.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);
  // ctx.closePath(); // not used correctly, see comments (use to close off
  // open path)
  ctx.stroke();
}

function flatArc(ctx, atk) {
  var outerRadius = atk.pos.sub(atk.start).len();
  var innerRadius = outerRadius - atk.aoeRadius / 2;
  if (innerRadius < 0) {
    innerRadius = 0;
  }
  outerRadius *= vvs.ratio;
  innerRadius *= vvs.ratio;

  var pos = transpose(atk.start);

  var a1 = atk.vector.rotate(-atk.angle / 2).angle();
  var a2 = atk.vector.rotate(atk.angle / 2).angle();

  var properAngle = function properAngle(a) {
    if (a < 0) {
      a += Math.PI * 2;
    }
    return a;
  };

  a1 = properAngle(a1);
  a2 = properAngle(a2);

  ctx.save();
  ctx.beginPath();

  var a = 1,
      b = 0.5,
      c = -1,
      d = 0.5;
  ctx.setTransform(a, b, c, d, pos.x, pos.y);

  ctx.fillStyle = atk.color;

  ctx.arc(0, 0, outerRadius, a1, a2, false);
  ctx.arc(0, 0, innerRadius, a2, a1, true);
  ctx.fill();

  ctx.restore();
}

function flatCircle(ctx, atk) {
  var outerRadius = atk.pos.sub(atk.start).len();
  var innerRadius = outerRadius - 200;
  if (innerRadius < 0) {
    innerRadius = 0;
  }
  outerRadius *= vvs.ratio;
  innerRadius *= vvs.ratio;

  var pos = transpose(atk.start);

  ctx.save();
  ctx.beginPath();

  var a = 1,
      b = 0.5,
      c = -1,
      d = 0.5;
  ctx.setTransform(a, b, c, d, pos.x, pos.y);

  ctx.fillStyle = atk.color;

  ctx.arc(0, 0, outerRadius, 0, Math.PI * 2, false);
  ctx.arc(0, 0, innerRadius, Math.PI * 2, 0, true);
  ctx.fill();

  ctx.restore();
}

// exports.extend({VisView : VisView});


},{"./globals":9,"./itemref/itemref":12,"./log":19,"./model":21,"./vectorutils":26,"backbone":30,"jquery":32,"underscore":33}],29:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ZoneManager = undefined;

var _itemref = require('itemref/itemref');

var _underscore = require('underscore');

var _ = _interopRequireWildcard(_underscore);

var _attacks = require('./attacks');

var _bodies = require('./bodies');

var _damage = require('./damage');

var _entity = require('./entity');

var entity = _interopRequireWildcard(_entity);

var _globals = require('./globals');

var _log = require('./log');

var _log2 = _interopRequireDefault(_log);

var _model = require('./model');

var _prob = require('./prob');

var prob = _interopRequireWildcard(_prob);

var _vectorutils = require('./vectorutils');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var TEAM_HERO = 0;
var TEAM_MONSTER = 1;

var ZoneManager = exports.ZoneManager = _model.Model.extend({
  initialize: function initialize(hero, settings) {
    this.allZones = _itemref.ref.zone;
    this.zoneOrder = _itemref.ref.zoneOrder.order; // to be used later for rank increases

    this.settings = settings;
    this.hero = new _bodies.HeroBody(hero, this);
    this.attackManager = new _attacks.AttackManager(this.ensureRoom.bind(this));

    // Expose attack manager functions for EntityBodies and chaining
    // projectiles
    _globals.gl.addAttack = this.attackManager.addAttack.bind(this.attackManager);
    this.messages = new ZoneMessages();
    this.waitingUntil = 0;

    this.nextZone = 0;
    this.unlockedZones = 0;
    this.newZone(this.nextZone);
  },

  toJSON: function toJSON() {
    return { nextZone: this.nextZone, unlockedZones: this.unlockedZones };
  },

  fromJSON: function fromJSON(data) {
    _.extend(this, data);
    this.newZone(this.nextZone); // this is redundent
  },

  getZoneFromNum: function getZoneFromNum(zoneNum) {
    var offset, upgradeCount, zoneI;
    if (zoneNum < 6) {
      offset = 0;
      upgradeCount = 0;
    } else if (zoneNum < 13) {
      offset = 6;
      upgradeCount = 1;
    } else if (zoneNum < 21) {
      offset = 13;
      upgradeCount = 2;
    } else if (zoneNum < 30) {
      offset = 21;
      upgradeCount = 3;
    } else if (zoneNum < 40) {
      offset = 30;
      upgradeCount = 4;
    } else if (zoneNum < 51) {
      offset = 40;
      upgradeCount = 5;
    } else {
      offset = 51;
      upgradeCount = 6 + Math.floor((zoneNum - offset) / 12);
    }
    var zoneCount = this.zoneOrder.length;
    var zoneI = (zoneNum - offset) % zoneCount;
    var name = this.zoneOrder[zoneI];

    if (name === 'beginners field') {
      upgradeCount -= 1;
    } else if (name === 'gothic castle') {
      upgradeCount -= 2;
    } else if (name === 'decaying temple') {
      upgradeCount -= 3;
    } else if (name === 'lich tower') {
      upgradeCount -= 4;
    } else if (name === 'wicked dream') {
      upgradeCount -= 5;
    } else if (name === 'imperial barracks') {
      upgradeCount -= 6;
    }

    var nameStr = name + (upgradeCount > 0 ? ' ' + (upgradeCount + 1) : '');
    // console.log(zoneNum, nameStr);
    return {
      nameStr: nameStr,
      upgradeCount: upgradeCount,
      zoneI: zoneI,
      name: name
    };
  },

  getMonStats: function getMonStats(name, level, verbose) {
    verbose = verbose === false ? false : true;
    var mbod = new _bodies.MonsterBody(name, level, this);
    var bodyStats = entity.defKeys.concat(entity.eleResistKeys);
    var attStats = entity.dmgKeys;
    _.each(bodyStats, function (stat) {
      if (verbose) {
        console.log(stat + ": " + mbod.spec[stat]);
      }
      if (mbod.spec[stat] === undefined || isNaN(mbod.spec[stat])) {
        throw name + " has invalid " + stat;
      }
    });
    _.each(mbod.spec.skillchain.skills, function (skill) {
      if (skill === undefined) {
        return;
      }
      if (verbose) {
        console.log(skill.name);
      }
      _.each(attStats, function (stat) {
        if (verbose) {
          console.log(stat + ': ' + skill[stat]);
        }
        if (skill[stat] === undefined || isNaN(skill[stat])) {
          throw name + " -  " + skill.name + " has invalid " + stat;
        }
      });
    });
  },

  valMons: function valMons(level) {
    var mons = _itemref.ref.monster;
    _.each(mons, function (mon, name) {
      this.getMonStats(name, level, false);
      _.each(mon.sourceCards, function (card) {
        if (_itemref.ref.card[card[0]] === undefined) {
          console.log('monster' + name + ' has weird card', card);
        }
      });
    }, this);
    console.log(this.statResult);
    return 'done';
  },

  getZoneStats: function getZoneStats() {
    var monsters = {};
    var EXCLUDE_BOSSES = true;
    var skillWeights = 0;
    var rooms = EXCLUDE_BOSSES ? this.rooms.slice(0, this.rooms.length - 1) : this.rooms;

    _.each(this.weights, function (weight, i) {
      var monName = this.choices[i];
      var mon = new _bodies.MonsterBody(this.choices[i], this.level, this);
      if (monsters[mon.spec.name] === undefined) {
        mon.weight = weight;
        monsters[mon.spec.name] = mon;
      }
    }, this);

    var defStats = ['moveSpeed', 'maxHp', 'armor', 'dodge', 'eleResistAll'];

    var attStats = ['physDmg', 'fireDmg', 'coldDmg', 'poisDmg', 'lightDmg', 'accuracy', 'speed'];

    var maxs = {};
    var avgs = {};
    var mins = {};
    var maxnames = {};
    var minnames = {};
    var totalMonWeight = 0;

    _.each(monsters, function (mon) {
      if (mon.spec.name == 'buddha') {
        return;
      }
      totalMonWeight += mon.weight;
      _.each(defStats, function (stat) {
        if (maxs[stat] === undefined || mon.spec[stat] > maxs[stat]) {
          maxs[stat] = mon.spec[stat];
          maxnames[stat] = mon.spec.name + ' ' + mon.spec[stat];
        }
        if (mins[stat] === undefined || mon.spec[stat] < mins[stat]) {
          mins[stat] = mon.spec[stat];
          minnames[stat] = mon.spec.name + ' ' + mon.spec[stat];
        }
        if (avgs[stat] === undefined) {
          avgs[stat] = mon.spec[stat] * mon.weight;
        } else {
          avgs[stat] += mon.spec[stat] * mon.weight;
        }
      }, this);
      _.each(mon.spec.skillchain.skills, function (skill) {
        if (skill === undefined) {
          return;
        }
        skillWeights += mon.weight;
        _.each(attStats, function (stat) {
          if (maxs[stat] === undefined || skill[stat] > maxs[stat]) {
            maxs[stat] = skill[stat];
            maxnames[stat] = mon.spec.name + ' ' + skill.name + ' ' + skill[stat];
          }
          if (mins[stat] === undefined || skill[stat] < mins[stat]) {
            mins[stat] = skill[stat];
            minnames[stat] = mon.spec.name + ' ' + skill.name + ' ' + skill[stat];
          }
          if (avgs[stat] === undefined) {
            avgs[stat] = skill[stat] * mon.weight;
          } else {
            avgs[stat] += skill[stat] * mon.weight;
          }
        }, this);
      }, this);
    }, this);

    _.each(defStats, function (stat) {
      avgs[stat] /= totalMonWeight;
    });

    _.each(attStats, function (stat) {
      avgs[stat] /= skillWeights;
      if (isNaN(avgs[stat])) {
        console.log('weirdstat', stat);
      }
    });

    // console.log(maxs);
    // console.log(mins);
    // console.log(avgs);
    // console.log("max", maxs);
    // console.log("min", minnames);
    // console.log("avg", avgs);

    this.statResult = {
      'avgs': avgs,
      'maxs': maxs,
      'mins': mins,
      'mons': monsters
    };

    return this.statResult;
    // console.log(this.statResult);
    // console.log(totalMonWeight);
  },

  newZone: function newZone(zoneNum) {
    _globals.gl.DirtyQueue.mark('zone:start');
    if (typeof zoneNum !== 'number') {
      zoneNum = 0;
      this.nextZone = 0;
    }

    this.iuid = _.uniqueId('inst');

    var i, j, rooms, monsters, count, data;

    var currentZone = this.getZoneFromNum(zoneNum);
    var zoneCount = this.zoneOrder.length;
    var zoneI = currentZone.zoneI;
    var upgradeCount = currentZone.upgradeCount;

    this.name = currentZone.name;

    this.nameStr = currentZone.nameStr;
    _log2.default.enterZone(this.nameStr);
    // console.log(zoneCount, upgradeCount, zoneI, this.name, this.level);
    _.extend(this, this.allZones[this.name]);
    this.level = Math.max(1, zoneNum * 5); // 5 is constant for zone level spacing

    // Overriding roomcount to scale with zone number
    this.roomCount = 5 + Math.floor(Math.sqrt(zoneNum));

    this.rooms = this.generator();
    var choices = [];
    var weights = [];
    _.each(this.choices, function (mon, i) {
      var monref = _itemref.ref.monster[mon];
      if (!monref.minLevel || monref.minLevel <= this.level) {
        choices.push(mon);
        weights.push(this.weights[i]);
      }
    }, this);
    var newMon;
    for (i = 0; i < this.rooms.length; i++) {
      monsters = [];
      if (i % 2 === 0) {
        // if this is not a corridor
        count = this.quantity[0] + prob.pProb(this.quantity[1] + upgradeCount / 2, this.quantity[2] + upgradeCount);
        // max room pop is i+1 (first room always only one monster)
        count = Math.min((i / 2 + 1) * (this.quantity[0] + upgradeCount), count);
        for (var j = 0; j < count; j++) {
          newMon = new _bodies.MonsterBody(choices[prob.pick(weights)], this.level, this);
          newMon.spec.materials = this.getZoneMats(newMon.spec.rarity);
          monsters.push(newMon);
        }
        if (i === this.rooms.length - 1) {
          newMon = new _bodies.MonsterBody(this.boss, this.level, this);
          newMon.spec.materials = this.getZoneMats('boss');
          newMon.spec.rarity = 'boss';
          monsters.push(newMon);
        }
      }
      _.extend(this.rooms[i], { monsters: monsters, heros: {}, attackManager: undefined });
      _.each(this.rooms[i].monsters, function (mon) {
        mon.initPos(this.rooms[i]);
      }, this);
    }

    this.heroPos = 0;
    this.rooms[0].heros[this.hero.id] = this.hero;
    this.hero.revive();
    this.hero.initPos(this.rooms[0]);
    this.attackManager.nextRoom(this.rooms[0]);
    _globals.gl.DirtyQueue.mark('zone:new');
    this.getZoneStats();
  },

  getZoneMats: function getZoneMats(rarity) {
    var categoryRates = _itemref.ref.matDropRates;

    if (rarity === undefined) {
      rarity = 'normal';
    }

    var droppableMats = [];
    _.each(this.materials, function (mat) {
      var matRef = _itemref.ref.materials[mat];
      if (matRef === undefined) {
        _log2.default.error('mat %s not in itemref', mat);
      }

      var catI = Math.abs(matRef.category - 4);
      var rate = categoryRates[rarity][catI];
      if (rate > 0) {
        droppableMats.push(mat);
      }
    }, this);

    return droppableMats;
  },

  generator: function generator() {
    // windyness
    // lrange
    // hrange
    // scale

    var lrange = [10, 20];
    var hrange = [7, 10];
    var scale = 1000;
    var weights;
    var dir = 1; // [up, right, down, left], just like margins/padding in css
    var width, height;

    var rooms = [];
    var room;

    var size, pos, ent, exit, absEnt;

    size = new _vectorutils.Point(prob.rand(lrange[0], lrange[1]), prob.rand(hrange[0], hrange[1]));
    pos = new _vectorutils.Point(0, 0);
    ent = new _vectorutils.Point(0, prob.middle50(size.y));

    room = { size: size, pos: pos, ent: ent };

    rooms.push(room);

    while (rooms.length < this.roomCount * 2 - 1) {
      // Pick a new direction
      dir = prob.rand(0, 1);

      // get a width + height, swap height and len ranges if we aren't going
      // right, so the l/w ranges
      //   stay the same wrt the player
      // set the abs exit for the old room
      if (dir === 0) {
        room.exit = new _vectorutils.Point(prob.middle50(room.size.x), 0);
      } else {
        room.exit = new _vectorutils.Point(room.size.x, prob.middle50(room.size.y));
      }
      // old room is done
      // make corridor in the dir chosen

      absEnt = room.pos.add(room.exit);
      if (dir === 0) {
        size = new _vectorutils.Point(2, 5);
        ent = new _vectorutils.Point(1, 5);
        pos = absEnt.sub(ent);
        exit = new _vectorutils.Point(1, 0);
      } else {
        size = new _vectorutils.Point(5, 2);
        ent = new _vectorutils.Point(0, 1);
        pos = absEnt.sub(ent);
        exit = new _vectorutils.Point(5, 1);
      }
      room = { size: size, pos: pos, ent: ent, exit: exit };
      rooms.push(room);

      size = new _vectorutils.Point(prob.rand(lrange[0], lrange[1]), prob.rand(hrange[0], hrange[1]));
      absEnt = room.pos.add(room.exit);

      if (dir === 0) {
        size = size.flip();
        ent = new _vectorutils.Point(prob.middle50(size.x), size.y);
        pos = absEnt.sub(ent);
      } else {
        ent = new _vectorutils.Point(0, prob.middle50(size.y));
        pos = absEnt.sub(ent);
      }
      room = { size: size, pos: pos, ent: ent };
      rooms.push(room);
    }

    for (var i = 0; i < rooms.length; i++) {
      rooms[i].size = rooms[i].size.mult(scale);
      rooms[i].pos = rooms[i].pos.mult(scale);
      rooms[i].ent = rooms[i].ent.mult(scale);
      if (rooms[i].exit) {
        rooms[i].exit = rooms[i].exit.mult(scale);
      }
    }

    return rooms;
  },

  ensureRoom: function ensureRoom() {
    if (this.waitingUntil) {
      return this.rooms[this.heroPos];
    }

    if (this.roomCleared() && this.atExit()) {
      var room = this.rooms[this.heroPos];
      delete room.heros[this.hero.id];
      room.attackManager = undefined;
      this.heroPos += 1;
      room = this.rooms[this.heroPos];
      this.hero.initPos(room);
      room.heros[this.hero.id] = this.hero;
      this.attackManager.nextRoom(this.rooms[this.heroPos]);
      room.attackManager = this.attackManager;
      _.each(room.monsters, function (mon) {
        mon.revive();
      });
      if (_globals.gl.settings.bossPause) {
        if (this.heroPos < this.rooms.length - 1) {
          var anyBoss = false;
          _.each(this.rooms[this.heroPos + 1].monsters, function (mon) {
            if (mon.spec.rarity === "boss") {
              anyBoss = true;
            }
          });
          if (anyBoss) {
            _globals.gl.pause();
          }
        }
      }

      _globals.gl.DirtyQueue.mark('zone:nextRoom');
    }
    return this.rooms[this.heroPos];
  },

  checkDone: function checkDone() {
    if (this.waitingUntil) {
      return;
    }

    if (!this.hero.isAlive()) {
      this.startWaiting({
        text: '你挂掉了!',
        type: 'death'
      });
      if (_globals.gl.settings.backOnDeath === true) {
        var zonesBack = Math.max(_globals.gl.settings.zonesBack, 0);
        this.nextZone -= zonesBack;
        this.nextZone = Math.max(this.nextZone, 0);
      }
    } else if (this.done()) {
      _log2.default.error('Zone %s index: %d cleared', this.nameStr, this.nextZone);
      this.tryUnlockNextZone();
      _globals.gl.DirtyQueue.mark('zone:nextRoom');
      if (this.settings.autoAdvance) {
        this.nextZone += 1;
      }
      _globals.gl.GameEvents.trigger('zoneClear');
      _globals.gl.GameEvents.trigger('reportData');

      this.startWaiting({
        text: '区域已清除!',
        type: 'clear'
      });
    }
  },

  startWaiting: function startWaiting(msgBase) {
    this.hero.moveStart = -1;
    this.messages.addMessage(_.extend(msgBase, {
      pos: this.hero.pos,
      color: '#FFF',
      lifespan: 2000,
      verticalOffset: 0,
      time: _globals.gl.time,
      expires: _globals.gl.time + 2000
    }));
    this.waitingUntil = _globals.gl.time + 2000;
  },

  tryUnlockNextZone: function tryUnlockNextZone() {
    _globals.gl.GameEvents.trigger('beatgame');
    if (this.nextZone === this.unlockedZones) {
      this.unlockedZones += 1;
      /*this.messages.addMessage({
          text: 'New Map Unlocked!',
          type: 'newlevel',
          pos: this.hero.pos,
          color: '#FFF',
          lifespan: 5000,
          verticalOffset: 0,
          time: gl.time,
          expires: gl.time + 5000});*/
      _globals.gl.DirtyQueue.mark('zone:unlocked');
      _log2.default.error('New map unlocked - #%d', this.unlockedZones);
    }
  },

  atExit: function atExit() {
    var room = this.rooms[this.heroPos];
    return room.exit && this.hero.pos.equal(room.exit);
  },

  getNearbyPos: function getNearbyPos(pos, range) {
    var room = this.getCurrentRoom();
    var res = new _vectorutils.Point(0, 0);
    res.x = pos.x + Math.random() * range * 2 - range;
    res.x = Math.floor(Math.max(0, Math.min(room.size.x, res.x)));
    res.y = pos.y + Math.random() * range * 2 - range;
    res.y = Math.floor(Math.max(0, Math.min(room.size.y, res.y)));
    return res;
  },

  zoneTick: function zoneTick() {
    var room = void 0,
        mons = void 0,
        heroes = void 0;

    if (this.waitingUntil) {
      if (_globals.gl.time > this.waitingUntil) {
        _log2.default.info('Getting new zone');
        this.hero.revive();
        this.newZone(this.nextZone);
        this.waitingUntil = 0;
      }
    } else {
      room = this.ensureRoom();
      _.each(this.liveHeroes(), function (h) {
        h.tryDoStuff(room, this.liveMons());
      }, this);

      room = this.ensureRoom();
      _.each(this.liveMons(), function (mon) {
        mon.tryDoStuff(room, this.liveHeroes());
      }, this);
    }
    this.attackManager.tick([this.liveHeroes(), this.liveMons()]);

    this.checkDone();

    _globals.gl.DirtyQueue.mark('zoneTick');
  },

  maxStep: function maxStep() {
    var room, mons, min, i;
    room = this.ensureRoom();
    mons = room.monsters;

    min = this.hero.nextAction;
    for (i = mons.length; i--;) {
      ml = Math.min(mons[i].nextAction, min);
    }
    return min - _globals.gl.time;
  },

  liveMons: function liveMons() {
    return _.filter(this.rooms[this.heroPos].monsters, function (mon) {
      return mon.isAlive();
    });
  },

  liveHeroes: function liveHeroes() {
    return _.filter(this.rooms[this.heroPos].heros, function (h) {
      return h.isAlive();
    });
  },

  getCurrentRoom: function getCurrentRoom() {
    return this.rooms[this.heroPos];
  },

  roomCleared: function roomCleared() {
    return this.liveMons().length === 0;
  },

  done: function done() {
    return this.roomCleared() && this.heroPos === this.rooms.length - 1;
  },

  getAttacks: function getAttacks() {
    return this.attackManager.getAttacks();
  }
});

var ZoneMessages = _model.Model.extend({
  initialize: function initialize() {
    this.listenTo(_globals.gl.MessageEvents, 'message', this.addMessage);
    this.listenTo(_globals.gl.DirtyListener, 'zone:nextRoom', this.flush);
    this.listenTo(_globals.gl.DirtyListener, 'zone:new', this.flush);
    this.msgs = [];
  },

  addMessage: function addMessage(msgObj) {
    this.msgs.push(msgObj);
    this.prune();
  },

  prune: function prune() {
    // TODO: when messages die, make them pool on the ground, in iso fmt
    this.msgs = _.filter(this.msgs, function (msg) {
      return msg.expires > _globals.gl.time && (!(msg.type === 'dmg') || msg.dmg.getY() > 0);
    });
  },

  flush: function flush() {
    this.msgs = [];
  }
});

/* exports.extend({
 *   ZoneManager : ZoneManager,
 *   MonsterBody : MonsterBody, // extended for use in test.js
 *   HeroBody : HeroBody
 * });*/


},{"./attacks":1,"./bodies":2,"./damage":4,"./entity":6,"./globals":9,"./log":19,"./model":21,"./prob":22,"./vectorutils":26,"itemref/itemref":12,"underscore":33}],30:[function(require,module,exports){
(function (global){
//     Backbone.js 1.3.3

//     (c) 2010-2016 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Backbone may be freely distributed under the MIT license.
//     For all details and documentation:
//     http://backbonejs.org

(function(factory) {

  // Establish the root object, `window` (`self`) in the browser, or `global` on the server.
  // We use `self` instead of `window` for `WebWorker` support.
  var root = (typeof self == 'object' && self.self === self && self) ||
            (typeof global == 'object' && global.global === global && global);

  // Set up Backbone appropriately for the environment. Start with AMD.
  if (typeof define === 'function' && define.amd) {
    define(['underscore', 'jquery', 'exports'], function(_, $, exports) {
      // Export global even in AMD case in case this script is loaded with
      // others that may still expect a global Backbone.
      root.Backbone = factory(root, exports, _, $);
    });

  // Next for Node.js or CommonJS. jQuery may not be needed as a module.
  } else if (typeof exports !== 'undefined') {
    var _ = require('underscore'), $;
    try { $ = require('jquery'); } catch (e) {}
    factory(root, exports, _, $);

  // Finally, as a browser global.
  } else {
    root.Backbone = factory(root, {}, root._, (root.jQuery || root.Zepto || root.ender || root.$));
  }

})(function(root, Backbone, _, $) {

  // Initial Setup
  // -------------

  // Save the previous value of the `Backbone` variable, so that it can be
  // restored later on, if `noConflict` is used.
  var previousBackbone = root.Backbone;

  // Create a local reference to a common array method we'll want to use later.
  var slice = Array.prototype.slice;

  // Current version of the library. Keep in sync with `package.json`.
  Backbone.VERSION = '1.3.3';

  // For Backbone's purposes, jQuery, Zepto, Ender, or My Library (kidding) owns
  // the `$` variable.
  Backbone.$ = $;

  // Runs Backbone.js in *noConflict* mode, returning the `Backbone` variable
  // to its previous owner. Returns a reference to this Backbone object.
  Backbone.noConflict = function() {
    root.Backbone = previousBackbone;
    return this;
  };

  // Turn on `emulateHTTP` to support legacy HTTP servers. Setting this option
  // will fake `"PATCH"`, `"PUT"` and `"DELETE"` requests via the `_method` parameter and
  // set a `X-Http-Method-Override` header.
  Backbone.emulateHTTP = false;

  // Turn on `emulateJSON` to support legacy servers that can't deal with direct
  // `application/json` requests ... this will encode the body as
  // `application/x-www-form-urlencoded` instead and will send the model in a
  // form param named `model`.
  Backbone.emulateJSON = false;

  // Proxy Backbone class methods to Underscore functions, wrapping the model's
  // `attributes` object or collection's `models` array behind the scenes.
  //
  // collection.filter(function(model) { return model.get('age') > 10 });
  // collection.each(this.addView);
  //
  // `Function#apply` can be slow so we use the method's arg count, if we know it.
  var addMethod = function(length, method, attribute) {
    switch (length) {
      case 1: return function() {
        return _[method](this[attribute]);
      };
      case 2: return function(value) {
        return _[method](this[attribute], value);
      };
      case 3: return function(iteratee, context) {
        return _[method](this[attribute], cb(iteratee, this), context);
      };
      case 4: return function(iteratee, defaultVal, context) {
        return _[method](this[attribute], cb(iteratee, this), defaultVal, context);
      };
      default: return function() {
        var args = slice.call(arguments);
        args.unshift(this[attribute]);
        return _[method].apply(_, args);
      };
    }
  };
  var addUnderscoreMethods = function(Class, methods, attribute) {
    _.each(methods, function(length, method) {
      if (_[method]) Class.prototype[method] = addMethod(length, method, attribute);
    });
  };

  // Support `collection.sortBy('attr')` and `collection.findWhere({id: 1})`.
  var cb = function(iteratee, instance) {
    if (_.isFunction(iteratee)) return iteratee;
    if (_.isObject(iteratee) && !instance._isModel(iteratee)) return modelMatcher(iteratee);
    if (_.isString(iteratee)) return function(model) { return model.get(iteratee); };
    return iteratee;
  };
  var modelMatcher = function(attrs) {
    var matcher = _.matches(attrs);
    return function(model) {
      return matcher(model.attributes);
    };
  };

  // Backbone.Events
  // ---------------

  // A module that can be mixed in to *any object* in order to provide it with
  // a custom event channel. You may bind a callback to an event with `on` or
  // remove with `off`; `trigger`-ing an event fires all callbacks in
  // succession.
  //
  //     var object = {};
  //     _.extend(object, Backbone.Events);
  //     object.on('expand', function(){ alert('expanded'); });
  //     object.trigger('expand');
  //
  var Events = Backbone.Events = {};

  // Regular expression used to split event strings.
  var eventSplitter = /\s+/;

  // Iterates over the standard `event, callback` (as well as the fancy multiple
  // space-separated events `"change blur", callback` and jQuery-style event
  // maps `{event: callback}`).
  var eventsApi = function(iteratee, events, name, callback, opts) {
    var i = 0, names;
    if (name && typeof name === 'object') {
      // Handle event maps.
      if (callback !== void 0 && 'context' in opts && opts.context === void 0) opts.context = callback;
      for (names = _.keys(name); i < names.length ; i++) {
        events = eventsApi(iteratee, events, names[i], name[names[i]], opts);
      }
    } else if (name && eventSplitter.test(name)) {
      // Handle space-separated event names by delegating them individually.
      for (names = name.split(eventSplitter); i < names.length; i++) {
        events = iteratee(events, names[i], callback, opts);
      }
    } else {
      // Finally, standard events.
      events = iteratee(events, name, callback, opts);
    }
    return events;
  };

  // Bind an event to a `callback` function. Passing `"all"` will bind
  // the callback to all events fired.
  Events.on = function(name, callback, context) {
    return internalOn(this, name, callback, context);
  };

  // Guard the `listening` argument from the public API.
  var internalOn = function(obj, name, callback, context, listening) {
    obj._events = eventsApi(onApi, obj._events || {}, name, callback, {
      context: context,
      ctx: obj,
      listening: listening
    });

    if (listening) {
      var listeners = obj._listeners || (obj._listeners = {});
      listeners[listening.id] = listening;
    }

    return obj;
  };

  // Inversion-of-control versions of `on`. Tell *this* object to listen to
  // an event in another object... keeping track of what it's listening to
  // for easier unbinding later.
  Events.listenTo = function(obj, name, callback) {
    if (!obj) return this;
    var id = obj._listenId || (obj._listenId = _.uniqueId('l'));
    var listeningTo = this._listeningTo || (this._listeningTo = {});
    var listening = listeningTo[id];

    // This object is not listening to any other events on `obj` yet.
    // Setup the necessary references to track the listening callbacks.
    if (!listening) {
      var thisId = this._listenId || (this._listenId = _.uniqueId('l'));
      listening = listeningTo[id] = {obj: obj, objId: id, id: thisId, listeningTo: listeningTo, count: 0};
    }

    // Bind callbacks on obj, and keep track of them on listening.
    internalOn(obj, name, callback, this, listening);
    return this;
  };

  // The reducing API that adds a callback to the `events` object.
  var onApi = function(events, name, callback, options) {
    if (callback) {
      var handlers = events[name] || (events[name] = []);
      var context = options.context, ctx = options.ctx, listening = options.listening;
      if (listening) listening.count++;

      handlers.push({callback: callback, context: context, ctx: context || ctx, listening: listening});
    }
    return events;
  };

  // Remove one or many callbacks. If `context` is null, removes all
  // callbacks with that function. If `callback` is null, removes all
  // callbacks for the event. If `name` is null, removes all bound
  // callbacks for all events.
  Events.off = function(name, callback, context) {
    if (!this._events) return this;
    this._events = eventsApi(offApi, this._events, name, callback, {
      context: context,
      listeners: this._listeners
    });
    return this;
  };

  // Tell this object to stop listening to either specific events ... or
  // to every object it's currently listening to.
  Events.stopListening = function(obj, name, callback) {
    var listeningTo = this._listeningTo;
    if (!listeningTo) return this;

    var ids = obj ? [obj._listenId] : _.keys(listeningTo);

    for (var i = 0; i < ids.length; i++) {
      var listening = listeningTo[ids[i]];

      // If listening doesn't exist, this object is not currently
      // listening to obj. Break out early.
      if (!listening) break;

      listening.obj.off(name, callback, this);
    }

    return this;
  };

  // The reducing API that removes a callback from the `events` object.
  var offApi = function(events, name, callback, options) {
    if (!events) return;

    var i = 0, listening;
    var context = options.context, listeners = options.listeners;

    // Delete all events listeners and "drop" events.
    if (!name && !callback && !context) {
      var ids = _.keys(listeners);
      for (; i < ids.length; i++) {
        listening = listeners[ids[i]];
        delete listeners[listening.id];
        delete listening.listeningTo[listening.objId];
      }
      return;
    }

    var names = name ? [name] : _.keys(events);
    for (; i < names.length; i++) {
      name = names[i];
      var handlers = events[name];

      // Bail out if there are no events stored.
      if (!handlers) break;

      // Replace events if there are any remaining.  Otherwise, clean up.
      var remaining = [];
      for (var j = 0; j < handlers.length; j++) {
        var handler = handlers[j];
        if (
          callback && callback !== handler.callback &&
            callback !== handler.callback._callback ||
              context && context !== handler.context
        ) {
          remaining.push(handler);
        } else {
          listening = handler.listening;
          if (listening && --listening.count === 0) {
            delete listeners[listening.id];
            delete listening.listeningTo[listening.objId];
          }
        }
      }

      // Update tail event if the list has any events.  Otherwise, clean up.
      if (remaining.length) {
        events[name] = remaining;
      } else {
        delete events[name];
      }
    }
    return events;
  };

  // Bind an event to only be triggered a single time. After the first time
  // the callback is invoked, its listener will be removed. If multiple events
  // are passed in using the space-separated syntax, the handler will fire
  // once for each event, not once for a combination of all events.
  Events.once = function(name, callback, context) {
    // Map the event into a `{event: once}` object.
    var events = eventsApi(onceMap, {}, name, callback, _.bind(this.off, this));
    if (typeof name === 'string' && context == null) callback = void 0;
    return this.on(events, callback, context);
  };

  // Inversion-of-control versions of `once`.
  Events.listenToOnce = function(obj, name, callback) {
    // Map the event into a `{event: once}` object.
    var events = eventsApi(onceMap, {}, name, callback, _.bind(this.stopListening, this, obj));
    return this.listenTo(obj, events);
  };

  // Reduces the event callbacks into a map of `{event: onceWrapper}`.
  // `offer` unbinds the `onceWrapper` after it has been called.
  var onceMap = function(map, name, callback, offer) {
    if (callback) {
      var once = map[name] = _.once(function() {
        offer(name, once);
        callback.apply(this, arguments);
      });
      once._callback = callback;
    }
    return map;
  };

  // Trigger one or many events, firing all bound callbacks. Callbacks are
  // passed the same arguments as `trigger` is, apart from the event name
  // (unless you're listening on `"all"`, which will cause your callback to
  // receive the true name of the event as the first argument).
  Events.trigger = function(name) {
    if (!this._events) return this;

    var length = Math.max(0, arguments.length - 1);
    var args = Array(length);
    for (var i = 0; i < length; i++) args[i] = arguments[i + 1];

    eventsApi(triggerApi, this._events, name, void 0, args);
    return this;
  };

  // Handles triggering the appropriate event callbacks.
  var triggerApi = function(objEvents, name, callback, args) {
    if (objEvents) {
      var events = objEvents[name];
      var allEvents = objEvents.all;
      if (events && allEvents) allEvents = allEvents.slice();
      if (events) triggerEvents(events, args);
      if (allEvents) triggerEvents(allEvents, [name].concat(args));
    }
    return objEvents;
  };

  // A difficult-to-believe, but optimized internal dispatch function for
  // triggering events. Tries to keep the usual cases speedy (most internal
  // Backbone events have 3 arguments).
  var triggerEvents = function(events, args) {
    var ev, i = -1, l = events.length, a1 = args[0], a2 = args[1], a3 = args[2];
    switch (args.length) {
      case 0: while (++i < l) (ev = events[i]).callback.call(ev.ctx); return;
      case 1: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1); return;
      case 2: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2); return;
      case 3: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2, a3); return;
      default: while (++i < l) (ev = events[i]).callback.apply(ev.ctx, args); return;
    }
  };

  // Aliases for backwards compatibility.
  Events.bind   = Events.on;
  Events.unbind = Events.off;

  // Allow the `Backbone` object to serve as a global event bus, for folks who
  // want global "pubsub" in a convenient place.
  _.extend(Backbone, Events);

  // Backbone.Model
  // --------------

  // Backbone **Models** are the basic data object in the framework --
  // frequently representing a row in a table in a database on your server.
  // A discrete chunk of data and a bunch of useful, related methods for
  // performing computations and transformations on that data.

  // Create a new model with the specified attributes. A client id (`cid`)
  // is automatically generated and assigned for you.
  var Model = Backbone.Model = function(attributes, options) {
    var attrs = attributes || {};
    options || (options = {});
    this.cid = _.uniqueId(this.cidPrefix);
    this.attributes = {};
    if (options.collection) this.collection = options.collection;
    if (options.parse) attrs = this.parse(attrs, options) || {};
    var defaults = _.result(this, 'defaults');
    attrs = _.defaults(_.extend({}, defaults, attrs), defaults);
    this.set(attrs, options);
    this.changed = {};
    this.initialize.apply(this, arguments);
  };

  // Attach all inheritable methods to the Model prototype.
  _.extend(Model.prototype, Events, {

    // A hash of attributes whose current and previous value differ.
    changed: null,

    // The value returned during the last failed validation.
    validationError: null,

    // The default name for the JSON `id` attribute is `"id"`. MongoDB and
    // CouchDB users may want to set this to `"_id"`.
    idAttribute: 'id',

    // The prefix is used to create the client id which is used to identify models locally.
    // You may want to override this if you're experiencing name clashes with model ids.
    cidPrefix: 'c',

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // Return a copy of the model's `attributes` object.
    toJSON: function(options) {
      return _.clone(this.attributes);
    },

    // Proxy `Backbone.sync` by default -- but override this if you need
    // custom syncing semantics for *this* particular model.
    sync: function() {
      return Backbone.sync.apply(this, arguments);
    },

    // Get the value of an attribute.
    get: function(attr) {
      return this.attributes[attr];
    },

    // Get the HTML-escaped value of an attribute.
    escape: function(attr) {
      return _.escape(this.get(attr));
    },

    // Returns `true` if the attribute contains a value that is not null
    // or undefined.
    has: function(attr) {
      return this.get(attr) != null;
    },

    // Special-cased proxy to underscore's `_.matches` method.
    matches: function(attrs) {
      return !!_.iteratee(attrs, this)(this.attributes);
    },

    // Set a hash of model attributes on the object, firing `"change"`. This is
    // the core primitive operation of a model, updating the data and notifying
    // anyone who needs to know about the change in state. The heart of the beast.
    set: function(key, val, options) {
      if (key == null) return this;

      // Handle both `"key", value` and `{key: value}` -style arguments.
      var attrs;
      if (typeof key === 'object') {
        attrs = key;
        options = val;
      } else {
        (attrs = {})[key] = val;
      }

      options || (options = {});

      // Run validation.
      if (!this._validate(attrs, options)) return false;

      // Extract attributes and options.
      var unset      = options.unset;
      var silent     = options.silent;
      var changes    = [];
      var changing   = this._changing;
      this._changing = true;

      if (!changing) {
        this._previousAttributes = _.clone(this.attributes);
        this.changed = {};
      }

      var current = this.attributes;
      var changed = this.changed;
      var prev    = this._previousAttributes;

      // For each `set` attribute, update or delete the current value.
      for (var attr in attrs) {
        val = attrs[attr];
        if (!_.isEqual(current[attr], val)) changes.push(attr);
        if (!_.isEqual(prev[attr], val)) {
          changed[attr] = val;
        } else {
          delete changed[attr];
        }
        unset ? delete current[attr] : current[attr] = val;
      }

      // Update the `id`.
      if (this.idAttribute in attrs) this.id = this.get(this.idAttribute);

      // Trigger all relevant attribute changes.
      if (!silent) {
        if (changes.length) this._pending = options;
        for (var i = 0; i < changes.length; i++) {
          this.trigger('change:' + changes[i], this, current[changes[i]], options);
        }
      }

      // You might be wondering why there's a `while` loop here. Changes can
      // be recursively nested within `"change"` events.
      if (changing) return this;
      if (!silent) {
        while (this._pending) {
          options = this._pending;
          this._pending = false;
          this.trigger('change', this, options);
        }
      }
      this._pending = false;
      this._changing = false;
      return this;
    },

    // Remove an attribute from the model, firing `"change"`. `unset` is a noop
    // if the attribute doesn't exist.
    unset: function(attr, options) {
      return this.set(attr, void 0, _.extend({}, options, {unset: true}));
    },

    // Clear all attributes on the model, firing `"change"`.
    clear: function(options) {
      var attrs = {};
      for (var key in this.attributes) attrs[key] = void 0;
      return this.set(attrs, _.extend({}, options, {unset: true}));
    },

    // Determine if the model has changed since the last `"change"` event.
    // If you specify an attribute name, determine if that attribute has changed.
    hasChanged: function(attr) {
      if (attr == null) return !_.isEmpty(this.changed);
      return _.has(this.changed, attr);
    },

    // Return an object containing all the attributes that have changed, or
    // false if there are no changed attributes. Useful for determining what
    // parts of a view need to be updated and/or what attributes need to be
    // persisted to the server. Unset attributes will be set to undefined.
    // You can also pass an attributes object to diff against the model,
    // determining if there *would be* a change.
    changedAttributes: function(diff) {
      if (!diff) return this.hasChanged() ? _.clone(this.changed) : false;
      var old = this._changing ? this._previousAttributes : this.attributes;
      var changed = {};
      for (var attr in diff) {
        var val = diff[attr];
        if (_.isEqual(old[attr], val)) continue;
        changed[attr] = val;
      }
      return _.size(changed) ? changed : false;
    },

    // Get the previous value of an attribute, recorded at the time the last
    // `"change"` event was fired.
    previous: function(attr) {
      if (attr == null || !this._previousAttributes) return null;
      return this._previousAttributes[attr];
    },

    // Get all of the attributes of the model at the time of the previous
    // `"change"` event.
    previousAttributes: function() {
      return _.clone(this._previousAttributes);
    },

    // Fetch the model from the server, merging the response with the model's
    // local attributes. Any changed attributes will trigger a "change" event.
    fetch: function(options) {
      options = _.extend({parse: true}, options);
      var model = this;
      var success = options.success;
      options.success = function(resp) {
        var serverAttrs = options.parse ? model.parse(resp, options) : resp;
        if (!model.set(serverAttrs, options)) return false;
        if (success) success.call(options.context, model, resp, options);
        model.trigger('sync', model, resp, options);
      };
      wrapError(this, options);
      return this.sync('read', this, options);
    },

    // Set a hash of model attributes, and sync the model to the server.
    // If the server returns an attributes hash that differs, the model's
    // state will be `set` again.
    save: function(key, val, options) {
      // Handle both `"key", value` and `{key: value}` -style arguments.
      var attrs;
      if (key == null || typeof key === 'object') {
        attrs = key;
        options = val;
      } else {
        (attrs = {})[key] = val;
      }

      options = _.extend({validate: true, parse: true}, options);
      var wait = options.wait;

      // If we're not waiting and attributes exist, save acts as
      // `set(attr).save(null, opts)` with validation. Otherwise, check if
      // the model will be valid when the attributes, if any, are set.
      if (attrs && !wait) {
        if (!this.set(attrs, options)) return false;
      } else if (!this._validate(attrs, options)) {
        return false;
      }

      // After a successful server-side save, the client is (optionally)
      // updated with the server-side state.
      var model = this;
      var success = options.success;
      var attributes = this.attributes;
      options.success = function(resp) {
        // Ensure attributes are restored during synchronous saves.
        model.attributes = attributes;
        var serverAttrs = options.parse ? model.parse(resp, options) : resp;
        if (wait) serverAttrs = _.extend({}, attrs, serverAttrs);
        if (serverAttrs && !model.set(serverAttrs, options)) return false;
        if (success) success.call(options.context, model, resp, options);
        model.trigger('sync', model, resp, options);
      };
      wrapError(this, options);

      // Set temporary attributes if `{wait: true}` to properly find new ids.
      if (attrs && wait) this.attributes = _.extend({}, attributes, attrs);

      var method = this.isNew() ? 'create' : (options.patch ? 'patch' : 'update');
      if (method === 'patch' && !options.attrs) options.attrs = attrs;
      var xhr = this.sync(method, this, options);

      // Restore attributes.
      this.attributes = attributes;

      return xhr;
    },

    // Destroy this model on the server if it was already persisted.
    // Optimistically removes the model from its collection, if it has one.
    // If `wait: true` is passed, waits for the server to respond before removal.
    destroy: function(options) {
      options = options ? _.clone(options) : {};
      var model = this;
      var success = options.success;
      var wait = options.wait;

      var destroy = function() {
        model.stopListening();
        model.trigger('destroy', model, model.collection, options);
      };

      options.success = function(resp) {
        if (wait) destroy();
        if (success) success.call(options.context, model, resp, options);
        if (!model.isNew()) model.trigger('sync', model, resp, options);
      };

      var xhr = false;
      if (this.isNew()) {
        _.defer(options.success);
      } else {
        wrapError(this, options);
        xhr = this.sync('delete', this, options);
      }
      if (!wait) destroy();
      return xhr;
    },

    // Default URL for the model's representation on the server -- if you're
    // using Backbone's restful methods, override this to change the endpoint
    // that will be called.
    url: function() {
      var base =
        _.result(this, 'urlRoot') ||
        _.result(this.collection, 'url') ||
        urlError();
      if (this.isNew()) return base;
      var id = this.get(this.idAttribute);
      return base.replace(/[^\/]$/, '$&/') + encodeURIComponent(id);
    },

    // **parse** converts a response into the hash of attributes to be `set` on
    // the model. The default implementation is just to pass the response along.
    parse: function(resp, options) {
      return resp;
    },

    // Create a new model with identical attributes to this one.
    clone: function() {
      return new this.constructor(this.attributes);
    },

    // A model is new if it has never been saved to the server, and lacks an id.
    isNew: function() {
      return !this.has(this.idAttribute);
    },

    // Check if the model is currently in a valid state.
    isValid: function(options) {
      return this._validate({}, _.extend({}, options, {validate: true}));
    },

    // Run validation against the next complete set of model attributes,
    // returning `true` if all is well. Otherwise, fire an `"invalid"` event.
    _validate: function(attrs, options) {
      if (!options.validate || !this.validate) return true;
      attrs = _.extend({}, this.attributes, attrs);
      var error = this.validationError = this.validate(attrs, options) || null;
      if (!error) return true;
      this.trigger('invalid', this, error, _.extend(options, {validationError: error}));
      return false;
    }

  });

  // Underscore methods that we want to implement on the Model, mapped to the
  // number of arguments they take.
  var modelMethods = {keys: 1, values: 1, pairs: 1, invert: 1, pick: 0,
      omit: 0, chain: 1, isEmpty: 1};

  // Mix in each Underscore method as a proxy to `Model#attributes`.
  addUnderscoreMethods(Model, modelMethods, 'attributes');

  // Backbone.Collection
  // -------------------

  // If models tend to represent a single row of data, a Backbone Collection is
  // more analogous to a table full of data ... or a small slice or page of that
  // table, or a collection of rows that belong together for a particular reason
  // -- all of the messages in this particular folder, all of the documents
  // belonging to this particular author, and so on. Collections maintain
  // indexes of their models, both in order, and for lookup by `id`.

  // Create a new **Collection**, perhaps to contain a specific type of `model`.
  // If a `comparator` is specified, the Collection will maintain
  // its models in sort order, as they're added and removed.
  var Collection = Backbone.Collection = function(models, options) {
    options || (options = {});
    if (options.model) this.model = options.model;
    if (options.comparator !== void 0) this.comparator = options.comparator;
    this._reset();
    this.initialize.apply(this, arguments);
    if (models) this.reset(models, _.extend({silent: true}, options));
  };

  // Default options for `Collection#set`.
  var setOptions = {add: true, remove: true, merge: true};
  var addOptions = {add: true, remove: false};

  // Splices `insert` into `array` at index `at`.
  var splice = function(array, insert, at) {
    at = Math.min(Math.max(at, 0), array.length);
    var tail = Array(array.length - at);
    var length = insert.length;
    var i;
    for (i = 0; i < tail.length; i++) tail[i] = array[i + at];
    for (i = 0; i < length; i++) array[i + at] = insert[i];
    for (i = 0; i < tail.length; i++) array[i + length + at] = tail[i];
  };

  // Define the Collection's inheritable methods.
  _.extend(Collection.prototype, Events, {

    // The default model for a collection is just a **Backbone.Model**.
    // This should be overridden in most cases.
    model: Model,

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // The JSON representation of a Collection is an array of the
    // models' attributes.
    toJSON: function(options) {
      return this.map(function(model) { return model.toJSON(options); });
    },

    // Proxy `Backbone.sync` by default.
    sync: function() {
      return Backbone.sync.apply(this, arguments);
    },

    // Add a model, or list of models to the set. `models` may be Backbone
    // Models or raw JavaScript objects to be converted to Models, or any
    // combination of the two.
    add: function(models, options) {
      return this.set(models, _.extend({merge: false}, options, addOptions));
    },

    // Remove a model, or a list of models from the set.
    remove: function(models, options) {
      options = _.extend({}, options);
      var singular = !_.isArray(models);
      models = singular ? [models] : models.slice();
      var removed = this._removeModels(models, options);
      if (!options.silent && removed.length) {
        options.changes = {added: [], merged: [], removed: removed};
        this.trigger('update', this, options);
      }
      return singular ? removed[0] : removed;
    },

    // Update a collection by `set`-ing a new list of models, adding new ones,
    // removing models that are no longer present, and merging models that
    // already exist in the collection, as necessary. Similar to **Model#set**,
    // the core operation for updating the data contained by the collection.
    set: function(models, options) {
      if (models == null) return;

      options = _.extend({}, setOptions, options);
      if (options.parse && !this._isModel(models)) {
        models = this.parse(models, options) || [];
      }

      var singular = !_.isArray(models);
      models = singular ? [models] : models.slice();

      var at = options.at;
      if (at != null) at = +at;
      if (at > this.length) at = this.length;
      if (at < 0) at += this.length + 1;

      var set = [];
      var toAdd = [];
      var toMerge = [];
      var toRemove = [];
      var modelMap = {};

      var add = options.add;
      var merge = options.merge;
      var remove = options.remove;

      var sort = false;
      var sortable = this.comparator && at == null && options.sort !== false;
      var sortAttr = _.isString(this.comparator) ? this.comparator : null;

      // Turn bare objects into model references, and prevent invalid models
      // from being added.
      var model, i;
      for (i = 0; i < models.length; i++) {
        model = models[i];

        // If a duplicate is found, prevent it from being added and
        // optionally merge it into the existing model.
        var existing = this.get(model);
        if (existing) {
          if (merge && model !== existing) {
            var attrs = this._isModel(model) ? model.attributes : model;
            if (options.parse) attrs = existing.parse(attrs, options);
            existing.set(attrs, options);
            toMerge.push(existing);
            if (sortable && !sort) sort = existing.hasChanged(sortAttr);
          }
          if (!modelMap[existing.cid]) {
            modelMap[existing.cid] = true;
            set.push(existing);
          }
          models[i] = existing;

        // If this is a new, valid model, push it to the `toAdd` list.
        } else if (add) {
          model = models[i] = this._prepareModel(model, options);
          if (model) {
            toAdd.push(model);
            this._addReference(model, options);
            modelMap[model.cid] = true;
            set.push(model);
          }
        }
      }

      // Remove stale models.
      if (remove) {
        for (i = 0; i < this.length; i++) {
          model = this.models[i];
          if (!modelMap[model.cid]) toRemove.push(model);
        }
        if (toRemove.length) this._removeModels(toRemove, options);
      }

      // See if sorting is needed, update `length` and splice in new models.
      var orderChanged = false;
      var replace = !sortable && add && remove;
      if (set.length && replace) {
        orderChanged = this.length !== set.length || _.some(this.models, function(m, index) {
          return m !== set[index];
        });
        this.models.length = 0;
        splice(this.models, set, 0);
        this.length = this.models.length;
      } else if (toAdd.length) {
        if (sortable) sort = true;
        splice(this.models, toAdd, at == null ? this.length : at);
        this.length = this.models.length;
      }

      // Silently sort the collection if appropriate.
      if (sort) this.sort({silent: true});

      // Unless silenced, it's time to fire all appropriate add/sort/update events.
      if (!options.silent) {
        for (i = 0; i < toAdd.length; i++) {
          if (at != null) options.index = at + i;
          model = toAdd[i];
          model.trigger('add', model, this, options);
        }
        if (sort || orderChanged) this.trigger('sort', this, options);
        if (toAdd.length || toRemove.length || toMerge.length) {
          options.changes = {
            added: toAdd,
            removed: toRemove,
            merged: toMerge
          };
          this.trigger('update', this, options);
        }
      }

      // Return the added (or merged) model (or models).
      return singular ? models[0] : models;
    },

    // When you have more items than you want to add or remove individually,
    // you can reset the entire set with a new list of models, without firing
    // any granular `add` or `remove` events. Fires `reset` when finished.
    // Useful for bulk operations and optimizations.
    reset: function(models, options) {
      options = options ? _.clone(options) : {};
      for (var i = 0; i < this.models.length; i++) {
        this._removeReference(this.models[i], options);
      }
      options.previousModels = this.models;
      this._reset();
      models = this.add(models, _.extend({silent: true}, options));
      if (!options.silent) this.trigger('reset', this, options);
      return models;
    },

    // Add a model to the end of the collection.
    push: function(model, options) {
      return this.add(model, _.extend({at: this.length}, options));
    },

    // Remove a model from the end of the collection.
    pop: function(options) {
      var model = this.at(this.length - 1);
      return this.remove(model, options);
    },

    // Add a model to the beginning of the collection.
    unshift: function(model, options) {
      return this.add(model, _.extend({at: 0}, options));
    },

    // Remove a model from the beginning of the collection.
    shift: function(options) {
      var model = this.at(0);
      return this.remove(model, options);
    },

    // Slice out a sub-array of models from the collection.
    slice: function() {
      return slice.apply(this.models, arguments);
    },

    // Get a model from the set by id, cid, model object with id or cid
    // properties, or an attributes object that is transformed through modelId.
    get: function(obj) {
      if (obj == null) return void 0;
      return this._byId[obj] ||
        this._byId[this.modelId(obj.attributes || obj)] ||
        obj.cid && this._byId[obj.cid];
    },

    // Returns `true` if the model is in the collection.
    has: function(obj) {
      return this.get(obj) != null;
    },

    // Get the model at the given index.
    at: function(index) {
      if (index < 0) index += this.length;
      return this.models[index];
    },

    // Return models with matching attributes. Useful for simple cases of
    // `filter`.
    where: function(attrs, first) {
      return this[first ? 'find' : 'filter'](attrs);
    },

    // Return the first model with matching attributes. Useful for simple cases
    // of `find`.
    findWhere: function(attrs) {
      return this.where(attrs, true);
    },

    // Force the collection to re-sort itself. You don't need to call this under
    // normal circumstances, as the set will maintain sort order as each item
    // is added.
    sort: function(options) {
      var comparator = this.comparator;
      if (!comparator) throw new Error('Cannot sort a set without a comparator');
      options || (options = {});

      var length = comparator.length;
      if (_.isFunction(comparator)) comparator = _.bind(comparator, this);

      // Run sort based on type of `comparator`.
      if (length === 1 || _.isString(comparator)) {
        this.models = this.sortBy(comparator);
      } else {
        this.models.sort(comparator);
      }
      if (!options.silent) this.trigger('sort', this, options);
      return this;
    },

    // Pluck an attribute from each model in the collection.
    pluck: function(attr) {
      return this.map(attr + '');
    },

    // Fetch the default set of models for this collection, resetting the
    // collection when they arrive. If `reset: true` is passed, the response
    // data will be passed through the `reset` method instead of `set`.
    fetch: function(options) {
      options = _.extend({parse: true}, options);
      var success = options.success;
      var collection = this;
      options.success = function(resp) {
        var method = options.reset ? 'reset' : 'set';
        collection[method](resp, options);
        if (success) success.call(options.context, collection, resp, options);
        collection.trigger('sync', collection, resp, options);
      };
      wrapError(this, options);
      return this.sync('read', this, options);
    },

    // Create a new instance of a model in this collection. Add the model to the
    // collection immediately, unless `wait: true` is passed, in which case we
    // wait for the server to agree.
    create: function(model, options) {
      options = options ? _.clone(options) : {};
      var wait = options.wait;
      model = this._prepareModel(model, options);
      if (!model) return false;
      if (!wait) this.add(model, options);
      var collection = this;
      var success = options.success;
      options.success = function(m, resp, callbackOpts) {
        if (wait) collection.add(m, callbackOpts);
        if (success) success.call(callbackOpts.context, m, resp, callbackOpts);
      };
      model.save(null, options);
      return model;
    },

    // **parse** converts a response into a list of models to be added to the
    // collection. The default implementation is just to pass it through.
    parse: function(resp, options) {
      return resp;
    },

    // Create a new collection with an identical list of models as this one.
    clone: function() {
      return new this.constructor(this.models, {
        model: this.model,
        comparator: this.comparator
      });
    },

    // Define how to uniquely identify models in the collection.
    modelId: function(attrs) {
      return attrs[this.model.prototype.idAttribute || 'id'];
    },

    // Private method to reset all internal state. Called when the collection
    // is first initialized or reset.
    _reset: function() {
      this.length = 0;
      this.models = [];
      this._byId  = {};
    },

    // Prepare a hash of attributes (or other model) to be added to this
    // collection.
    _prepareModel: function(attrs, options) {
      if (this._isModel(attrs)) {
        if (!attrs.collection) attrs.collection = this;
        return attrs;
      }
      options = options ? _.clone(options) : {};
      options.collection = this;
      var model = new this.model(attrs, options);
      if (!model.validationError) return model;
      this.trigger('invalid', this, model.validationError, options);
      return false;
    },

    // Internal method called by both remove and set.
    _removeModels: function(models, options) {
      var removed = [];
      for (var i = 0; i < models.length; i++) {
        var model = this.get(models[i]);
        if (!model) continue;

        var index = this.indexOf(model);
        this.models.splice(index, 1);
        this.length--;

        // Remove references before triggering 'remove' event to prevent an
        // infinite loop. #3693
        delete this._byId[model.cid];
        var id = this.modelId(model.attributes);
        if (id != null) delete this._byId[id];

        if (!options.silent) {
          options.index = index;
          model.trigger('remove', model, this, options);
        }

        removed.push(model);
        this._removeReference(model, options);
      }
      return removed;
    },

    // Method for checking whether an object should be considered a model for
    // the purposes of adding to the collection.
    _isModel: function(model) {
      return model instanceof Model;
    },

    // Internal method to create a model's ties to a collection.
    _addReference: function(model, options) {
      this._byId[model.cid] = model;
      var id = this.modelId(model.attributes);
      if (id != null) this._byId[id] = model;
      model.on('all', this._onModelEvent, this);
    },

    // Internal method to sever a model's ties to a collection.
    _removeReference: function(model, options) {
      delete this._byId[model.cid];
      var id = this.modelId(model.attributes);
      if (id != null) delete this._byId[id];
      if (this === model.collection) delete model.collection;
      model.off('all', this._onModelEvent, this);
    },

    // Internal method called every time a model in the set fires an event.
    // Sets need to update their indexes when models change ids. All other
    // events simply proxy through. "add" and "remove" events that originate
    // in other collections are ignored.
    _onModelEvent: function(event, model, collection, options) {
      if (model) {
        if ((event === 'add' || event === 'remove') && collection !== this) return;
        if (event === 'destroy') this.remove(model, options);
        if (event === 'change') {
          var prevId = this.modelId(model.previousAttributes());
          var id = this.modelId(model.attributes);
          if (prevId !== id) {
            if (prevId != null) delete this._byId[prevId];
            if (id != null) this._byId[id] = model;
          }
        }
      }
      this.trigger.apply(this, arguments);
    }

  });

  // Underscore methods that we want to implement on the Collection.
  // 90% of the core usefulness of Backbone Collections is actually implemented
  // right here:
  var collectionMethods = {forEach: 3, each: 3, map: 3, collect: 3, reduce: 0,
      foldl: 0, inject: 0, reduceRight: 0, foldr: 0, find: 3, detect: 3, filter: 3,
      select: 3, reject: 3, every: 3, all: 3, some: 3, any: 3, include: 3, includes: 3,
      contains: 3, invoke: 0, max: 3, min: 3, toArray: 1, size: 1, first: 3,
      head: 3, take: 3, initial: 3, rest: 3, tail: 3, drop: 3, last: 3,
      without: 0, difference: 0, indexOf: 3, shuffle: 1, lastIndexOf: 3,
      isEmpty: 1, chain: 1, sample: 3, partition: 3, groupBy: 3, countBy: 3,
      sortBy: 3, indexBy: 3, findIndex: 3, findLastIndex: 3};

  // Mix in each Underscore method as a proxy to `Collection#models`.
  addUnderscoreMethods(Collection, collectionMethods, 'models');

  // Backbone.View
  // -------------

  // Backbone Views are almost more convention than they are actual code. A View
  // is simply a JavaScript object that represents a logical chunk of UI in the
  // DOM. This might be a single item, an entire list, a sidebar or panel, or
  // even the surrounding frame which wraps your whole app. Defining a chunk of
  // UI as a **View** allows you to define your DOM events declaratively, without
  // having to worry about render order ... and makes it easy for the view to
  // react to specific changes in the state of your models.

  // Creating a Backbone.View creates its initial element outside of the DOM,
  // if an existing element is not provided...
  var View = Backbone.View = function(options) {
    this.cid = _.uniqueId('view');
    _.extend(this, _.pick(options, viewOptions));
    this._ensureElement();
    this.initialize.apply(this, arguments);
  };

  // Cached regex to split keys for `delegate`.
  var delegateEventSplitter = /^(\S+)\s*(.*)$/;

  // List of view options to be set as properties.
  var viewOptions = ['model', 'collection', 'el', 'id', 'attributes', 'className', 'tagName', 'events'];

  // Set up all inheritable **Backbone.View** properties and methods.
  _.extend(View.prototype, Events, {

    // The default `tagName` of a View's element is `"div"`.
    tagName: 'div',

    // jQuery delegate for element lookup, scoped to DOM elements within the
    // current view. This should be preferred to global lookups where possible.
    $: function(selector) {
      return this.$el.find(selector);
    },

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // **render** is the core function that your view should override, in order
    // to populate its element (`this.el`), with the appropriate HTML. The
    // convention is for **render** to always return `this`.
    render: function() {
      return this;
    },

    // Remove this view by taking the element out of the DOM, and removing any
    // applicable Backbone.Events listeners.
    remove: function() {
      this._removeElement();
      this.stopListening();
      return this;
    },

    // Remove this view's element from the document and all event listeners
    // attached to it. Exposed for subclasses using an alternative DOM
    // manipulation API.
    _removeElement: function() {
      this.$el.remove();
    },

    // Change the view's element (`this.el` property) and re-delegate the
    // view's events on the new element.
    setElement: function(element) {
      this.undelegateEvents();
      this._setElement(element);
      this.delegateEvents();
      return this;
    },

    // Creates the `this.el` and `this.$el` references for this view using the
    // given `el`. `el` can be a CSS selector or an HTML string, a jQuery
    // context or an element. Subclasses can override this to utilize an
    // alternative DOM manipulation API and are only required to set the
    // `this.el` property.
    _setElement: function(el) {
      this.$el = el instanceof Backbone.$ ? el : Backbone.$(el);
      this.el = this.$el[0];
    },

    // Set callbacks, where `this.events` is a hash of
    //
    // *{"event selector": "callback"}*
    //
    //     {
    //       'mousedown .title':  'edit',
    //       'click .button':     'save',
    //       'click .open':       function(e) { ... }
    //     }
    //
    // pairs. Callbacks will be bound to the view, with `this` set properly.
    // Uses event delegation for efficiency.
    // Omitting the selector binds the event to `this.el`.
    delegateEvents: function(events) {
      events || (events = _.result(this, 'events'));
      if (!events) return this;
      this.undelegateEvents();
      for (var key in events) {
        var method = events[key];
        if (!_.isFunction(method)) method = this[method];
        if (!method) continue;
        var match = key.match(delegateEventSplitter);
        this.delegate(match[1], match[2], _.bind(method, this));
      }
      return this;
    },

    // Add a single event listener to the view's element (or a child element
    // using `selector`). This only works for delegate-able events: not `focus`,
    // `blur`, and not `change`, `submit`, and `reset` in Internet Explorer.
    delegate: function(eventName, selector, listener) {
      this.$el.on(eventName + '.delegateEvents' + this.cid, selector, listener);
      return this;
    },

    // Clears all callbacks previously bound to the view by `delegateEvents`.
    // You usually don't need to use this, but may wish to if you have multiple
    // Backbone views attached to the same DOM element.
    undelegateEvents: function() {
      if (this.$el) this.$el.off('.delegateEvents' + this.cid);
      return this;
    },

    // A finer-grained `undelegateEvents` for removing a single delegated event.
    // `selector` and `listener` are both optional.
    undelegate: function(eventName, selector, listener) {
      this.$el.off(eventName + '.delegateEvents' + this.cid, selector, listener);
      return this;
    },

    // Produces a DOM element to be assigned to your view. Exposed for
    // subclasses using an alternative DOM manipulation API.
    _createElement: function(tagName) {
      return document.createElement(tagName);
    },

    // Ensure that the View has a DOM element to render into.
    // If `this.el` is a string, pass it through `$()`, take the first
    // matching element, and re-assign it to `el`. Otherwise, create
    // an element from the `id`, `className` and `tagName` properties.
    _ensureElement: function() {
      if (!this.el) {
        var attrs = _.extend({}, _.result(this, 'attributes'));
        if (this.id) attrs.id = _.result(this, 'id');
        if (this.className) attrs['class'] = _.result(this, 'className');
        this.setElement(this._createElement(_.result(this, 'tagName')));
        this._setAttributes(attrs);
      } else {
        this.setElement(_.result(this, 'el'));
      }
    },

    // Set attributes from a hash on this view's element.  Exposed for
    // subclasses using an alternative DOM manipulation API.
    _setAttributes: function(attributes) {
      this.$el.attr(attributes);
    }

  });

  // Backbone.sync
  // -------------

  // Override this function to change the manner in which Backbone persists
  // models to the server. You will be passed the type of request, and the
  // model in question. By default, makes a RESTful Ajax request
  // to the model's `url()`. Some possible customizations could be:
  //
  // * Use `setTimeout` to batch rapid-fire updates into a single request.
  // * Send up the models as XML instead of JSON.
  // * Persist models via WebSockets instead of Ajax.
  //
  // Turn on `Backbone.emulateHTTP` in order to send `PUT` and `DELETE` requests
  // as `POST`, with a `_method` parameter containing the true HTTP method,
  // as well as all requests with the body as `application/x-www-form-urlencoded`
  // instead of `application/json` with the model in a param named `model`.
  // Useful when interfacing with server-side languages like **PHP** that make
  // it difficult to read the body of `PUT` requests.
  Backbone.sync = function(method, model, options) {
    var type = methodMap[method];

    // Default options, unless specified.
    _.defaults(options || (options = {}), {
      emulateHTTP: Backbone.emulateHTTP,
      emulateJSON: Backbone.emulateJSON
    });

    // Default JSON-request options.
    var params = {type: type, dataType: 'json'};

    // Ensure that we have a URL.
    if (!options.url) {
      params.url = _.result(model, 'url') || urlError();
    }

    // Ensure that we have the appropriate request data.
    if (options.data == null && model && (method === 'create' || method === 'update' || method === 'patch')) {
      params.contentType = 'application/json';
      params.data = JSON.stringify(options.attrs || model.toJSON(options));
    }

    // For older servers, emulate JSON by encoding the request into an HTML-form.
    if (options.emulateJSON) {
      params.contentType = 'application/x-www-form-urlencoded';
      params.data = params.data ? {model: params.data} : {};
    }

    // For older servers, emulate HTTP by mimicking the HTTP method with `_method`
    // And an `X-HTTP-Method-Override` header.
    if (options.emulateHTTP && (type === 'PUT' || type === 'DELETE' || type === 'PATCH')) {
      params.type = 'POST';
      if (options.emulateJSON) params.data._method = type;
      var beforeSend = options.beforeSend;
      options.beforeSend = function(xhr) {
        xhr.setRequestHeader('X-HTTP-Method-Override', type);
        if (beforeSend) return beforeSend.apply(this, arguments);
      };
    }

    // Don't process data on a non-GET request.
    if (params.type !== 'GET' && !options.emulateJSON) {
      params.processData = false;
    }

    // Pass along `textStatus` and `errorThrown` from jQuery.
    var error = options.error;
    options.error = function(xhr, textStatus, errorThrown) {
      options.textStatus = textStatus;
      options.errorThrown = errorThrown;
      if (error) error.call(options.context, xhr, textStatus, errorThrown);
    };

    // Make the request, allowing the user to override any Ajax options.
    var xhr = options.xhr = Backbone.ajax(_.extend(params, options));
    model.trigger('request', model, xhr, options);
    return xhr;
  };

  // Map from CRUD to HTTP for our default `Backbone.sync` implementation.
  var methodMap = {
    'create': 'POST',
    'update': 'PUT',
    'patch': 'PATCH',
    'delete': 'DELETE',
    'read': 'GET'
  };

  // Set the default implementation of `Backbone.ajax` to proxy through to `$`.
  // Override this if you'd like to use a different library.
  Backbone.ajax = function() {
    return Backbone.$.ajax.apply(Backbone.$, arguments);
  };

  // Backbone.Router
  // ---------------

  // Routers map faux-URLs to actions, and fire events when routes are
  // matched. Creating a new one sets its `routes` hash, if not set statically.
  var Router = Backbone.Router = function(options) {
    options || (options = {});
    if (options.routes) this.routes = options.routes;
    this._bindRoutes();
    this.initialize.apply(this, arguments);
  };

  // Cached regular expressions for matching named param parts and splatted
  // parts of route strings.
  var optionalParam = /\((.*?)\)/g;
  var namedParam    = /(\(\?)?:\w+/g;
  var splatParam    = /\*\w+/g;
  var escapeRegExp  = /[\-{}\[\]+?.,\\\^$|#\s]/g;

  // Set up all inheritable **Backbone.Router** properties and methods.
  _.extend(Router.prototype, Events, {

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // Manually bind a single named route to a callback. For example:
    //
    //     this.route('search/:query/p:num', 'search', function(query, num) {
    //       ...
    //     });
    //
    route: function(route, name, callback) {
      if (!_.isRegExp(route)) route = this._routeToRegExp(route);
      if (_.isFunction(name)) {
        callback = name;
        name = '';
      }
      if (!callback) callback = this[name];
      var router = this;
      Backbone.history.route(route, function(fragment) {
        var args = router._extractParameters(route, fragment);
        if (router.execute(callback, args, name) !== false) {
          router.trigger.apply(router, ['route:' + name].concat(args));
          router.trigger('route', name, args);
          Backbone.history.trigger('route', router, name, args);
        }
      });
      return this;
    },

    // Execute a route handler with the provided parameters.  This is an
    // excellent place to do pre-route setup or post-route cleanup.
    execute: function(callback, args, name) {
      if (callback) callback.apply(this, args);
    },

    // Simple proxy to `Backbone.history` to save a fragment into the history.
    navigate: function(fragment, options) {
      Backbone.history.navigate(fragment, options);
      return this;
    },

    // Bind all defined routes to `Backbone.history`. We have to reverse the
    // order of the routes here to support behavior where the most general
    // routes can be defined at the bottom of the route map.
    _bindRoutes: function() {
      if (!this.routes) return;
      this.routes = _.result(this, 'routes');
      var route, routes = _.keys(this.routes);
      while ((route = routes.pop()) != null) {
        this.route(route, this.routes[route]);
      }
    },

    // Convert a route string into a regular expression, suitable for matching
    // against the current location hash.
    _routeToRegExp: function(route) {
      route = route.replace(escapeRegExp, '\\$&')
                   .replace(optionalParam, '(?:$1)?')
                   .replace(namedParam, function(match, optional) {
                     return optional ? match : '([^/?]+)';
                   })
                   .replace(splatParam, '([^?]*?)');
      return new RegExp('^' + route + '(?:\\?([\\s\\S]*))?$');
    },

    // Given a route, and a URL fragment that it matches, return the array of
    // extracted decoded parameters. Empty or unmatched parameters will be
    // treated as `null` to normalize cross-browser behavior.
    _extractParameters: function(route, fragment) {
      var params = route.exec(fragment).slice(1);
      return _.map(params, function(param, i) {
        // Don't decode the search params.
        if (i === params.length - 1) return param || null;
        return param ? decodeURIComponent(param) : null;
      });
    }

  });

  // Backbone.History
  // ----------------

  // Handles cross-browser history management, based on either
  // [pushState](http://diveintohtml5.info/history.html) and real URLs, or
  // [onhashchange](https://developer.mozilla.org/en-US/docs/DOM/window.onhashchange)
  // and URL fragments. If the browser supports neither (old IE, natch),
  // falls back to polling.
  var History = Backbone.History = function() {
    this.handlers = [];
    this.checkUrl = _.bind(this.checkUrl, this);

    // Ensure that `History` can be used outside of the browser.
    if (typeof window !== 'undefined') {
      this.location = window.location;
      this.history = window.history;
    }
  };

  // Cached regex for stripping a leading hash/slash and trailing space.
  var routeStripper = /^[#\/]|\s+$/g;

  // Cached regex for stripping leading and trailing slashes.
  var rootStripper = /^\/+|\/+$/g;

  // Cached regex for stripping urls of hash.
  var pathStripper = /#.*$/;

  // Has the history handling already been started?
  History.started = false;

  // Set up all inheritable **Backbone.History** properties and methods.
  _.extend(History.prototype, Events, {

    // The default interval to poll for hash changes, if necessary, is
    // twenty times a second.
    interval: 50,

    // Are we at the app root?
    atRoot: function() {
      var path = this.location.pathname.replace(/[^\/]$/, '$&/');
      return path === this.root && !this.getSearch();
    },

    // Does the pathname match the root?
    matchRoot: function() {
      var path = this.decodeFragment(this.location.pathname);
      var rootPath = path.slice(0, this.root.length - 1) + '/';
      return rootPath === this.root;
    },

    // Unicode characters in `location.pathname` are percent encoded so they're
    // decoded for comparison. `%25` should not be decoded since it may be part
    // of an encoded parameter.
    decodeFragment: function(fragment) {
      return decodeURI(fragment.replace(/%25/g, '%2525'));
    },

    // In IE6, the hash fragment and search params are incorrect if the
    // fragment contains `?`.
    getSearch: function() {
      var match = this.location.href.replace(/#.*/, '').match(/\?.+/);
      return match ? match[0] : '';
    },

    // Gets the true hash value. Cannot use location.hash directly due to bug
    // in Firefox where location.hash will always be decoded.
    getHash: function(window) {
      var match = (window || this).location.href.match(/#(.*)$/);
      return match ? match[1] : '';
    },

    // Get the pathname and search params, without the root.
    getPath: function() {
      var path = this.decodeFragment(
        this.location.pathname + this.getSearch()
      ).slice(this.root.length - 1);
      return path.charAt(0) === '/' ? path.slice(1) : path;
    },

    // Get the cross-browser normalized URL fragment from the path or hash.
    getFragment: function(fragment) {
      if (fragment == null) {
        if (this._usePushState || !this._wantsHashChange) {
          fragment = this.getPath();
        } else {
          fragment = this.getHash();
        }
      }
      return fragment.replace(routeStripper, '');
    },

    // Start the hash change handling, returning `true` if the current URL matches
    // an existing route, and `false` otherwise.
    start: function(options) {
      if (History.started) throw new Error('Backbone.history has already been started');
      History.started = true;

      // Figure out the initial configuration. Do we need an iframe?
      // Is pushState desired ... is it available?
      this.options          = _.extend({root: '/'}, this.options, options);
      this.root             = this.options.root;
      this._wantsHashChange = this.options.hashChange !== false;
      this._hasHashChange   = 'onhashchange' in window && (document.documentMode === void 0 || document.documentMode > 7);
      this._useHashChange   = this._wantsHashChange && this._hasHashChange;
      this._wantsPushState  = !!this.options.pushState;
      this._hasPushState    = !!(this.history && this.history.pushState);
      this._usePushState    = this._wantsPushState && this._hasPushState;
      this.fragment         = this.getFragment();

      // Normalize root to always include a leading and trailing slash.
      this.root = ('/' + this.root + '/').replace(rootStripper, '/');

      // Transition from hashChange to pushState or vice versa if both are
      // requested.
      if (this._wantsHashChange && this._wantsPushState) {

        // If we've started off with a route from a `pushState`-enabled
        // browser, but we're currently in a browser that doesn't support it...
        if (!this._hasPushState && !this.atRoot()) {
          var rootPath = this.root.slice(0, -1) || '/';
          this.location.replace(rootPath + '#' + this.getPath());
          // Return immediately as browser will do redirect to new url
          return true;

        // Or if we've started out with a hash-based route, but we're currently
        // in a browser where it could be `pushState`-based instead...
        } else if (this._hasPushState && this.atRoot()) {
          this.navigate(this.getHash(), {replace: true});
        }

      }

      // Proxy an iframe to handle location events if the browser doesn't
      // support the `hashchange` event, HTML5 history, or the user wants
      // `hashChange` but not `pushState`.
      if (!this._hasHashChange && this._wantsHashChange && !this._usePushState) {
        this.iframe = document.createElement('iframe');
        this.iframe.src = 'javascript:0';
        this.iframe.style.display = 'none';
        this.iframe.tabIndex = -1;
        var body = document.body;
        // Using `appendChild` will throw on IE < 9 if the document is not ready.
        var iWindow = body.insertBefore(this.iframe, body.firstChild).contentWindow;
        iWindow.document.open();
        iWindow.document.close();
        iWindow.location.hash = '#' + this.fragment;
      }

      // Add a cross-platform `addEventListener` shim for older browsers.
      var addEventListener = window.addEventListener || function(eventName, listener) {
        return attachEvent('on' + eventName, listener);
      };

      // Depending on whether we're using pushState or hashes, and whether
      // 'onhashchange' is supported, determine how we check the URL state.
      if (this._usePushState) {
        addEventListener('popstate', this.checkUrl, false);
      } else if (this._useHashChange && !this.iframe) {
        addEventListener('hashchange', this.checkUrl, false);
      } else if (this._wantsHashChange) {
        this._checkUrlInterval = setInterval(this.checkUrl, this.interval);
      }

      if (!this.options.silent) return this.loadUrl();
    },

    // Disable Backbone.history, perhaps temporarily. Not useful in a real app,
    // but possibly useful for unit testing Routers.
    stop: function() {
      // Add a cross-platform `removeEventListener` shim for older browsers.
      var removeEventListener = window.removeEventListener || function(eventName, listener) {
        return detachEvent('on' + eventName, listener);
      };

      // Remove window listeners.
      if (this._usePushState) {
        removeEventListener('popstate', this.checkUrl, false);
      } else if (this._useHashChange && !this.iframe) {
        removeEventListener('hashchange', this.checkUrl, false);
      }

      // Clean up the iframe if necessary.
      if (this.iframe) {
        document.body.removeChild(this.iframe);
        this.iframe = null;
      }

      // Some environments will throw when clearing an undefined interval.
      if (this._checkUrlInterval) clearInterval(this._checkUrlInterval);
      History.started = false;
    },

    // Add a route to be tested when the fragment changes. Routes added later
    // may override previous routes.
    route: function(route, callback) {
      this.handlers.unshift({route: route, callback: callback});
    },

    // Checks the current URL to see if it has changed, and if it has,
    // calls `loadUrl`, normalizing across the hidden iframe.
    checkUrl: function(e) {
      var current = this.getFragment();

      // If the user pressed the back button, the iframe's hash will have
      // changed and we should use that for comparison.
      if (current === this.fragment && this.iframe) {
        current = this.getHash(this.iframe.contentWindow);
      }

      if (current === this.fragment) return false;
      if (this.iframe) this.navigate(current);
      this.loadUrl();
    },

    // Attempt to load the current URL fragment. If a route succeeds with a
    // match, returns `true`. If no defined routes matches the fragment,
    // returns `false`.
    loadUrl: function(fragment) {
      // If the root doesn't match, no routes can match either.
      if (!this.matchRoot()) return false;
      fragment = this.fragment = this.getFragment(fragment);
      return _.some(this.handlers, function(handler) {
        if (handler.route.test(fragment)) {
          handler.callback(fragment);
          return true;
        }
      });
    },

    // Save a fragment into the hash history, or replace the URL state if the
    // 'replace' option is passed. You are responsible for properly URL-encoding
    // the fragment in advance.
    //
    // The options object can contain `trigger: true` if you wish to have the
    // route callback be fired (not usually desirable), or `replace: true`, if
    // you wish to modify the current URL without adding an entry to the history.
    navigate: function(fragment, options) {
      if (!History.started) return false;
      if (!options || options === true) options = {trigger: !!options};

      // Normalize the fragment.
      fragment = this.getFragment(fragment || '');

      // Don't include a trailing slash on the root.
      var rootPath = this.root;
      if (fragment === '' || fragment.charAt(0) === '?') {
        rootPath = rootPath.slice(0, -1) || '/';
      }
      var url = rootPath + fragment;

      // Strip the hash and decode for matching.
      fragment = this.decodeFragment(fragment.replace(pathStripper, ''));

      if (this.fragment === fragment) return;
      this.fragment = fragment;

      // If pushState is available, we use it to set the fragment as a real URL.
      if (this._usePushState) {
        this.history[options.replace ? 'replaceState' : 'pushState']({}, document.title, url);

      // If hash changes haven't been explicitly disabled, update the hash
      // fragment to store history.
      } else if (this._wantsHashChange) {
        this._updateHash(this.location, fragment, options.replace);
        if (this.iframe && fragment !== this.getHash(this.iframe.contentWindow)) {
          var iWindow = this.iframe.contentWindow;

          // Opening and closing the iframe tricks IE7 and earlier to push a
          // history entry on hash-tag change.  When replace is true, we don't
          // want this.
          if (!options.replace) {
            iWindow.document.open();
            iWindow.document.close();
          }

          this._updateHash(iWindow.location, fragment, options.replace);
        }

      // If you've told us that you explicitly don't want fallback hashchange-
      // based history, then `navigate` becomes a page refresh.
      } else {
        return this.location.assign(url);
      }
      if (options.trigger) return this.loadUrl(fragment);
    },

    // Update the hash location, either replacing the current entry, or adding
    // a new one to the browser history.
    _updateHash: function(location, fragment, replace) {
      if (replace) {
        var href = location.href.replace(/(javascript:|#).*$/, '');
        location.replace(href + '#' + fragment);
      } else {
        // Some browsers require that `hash` contains a leading #.
        location.hash = '#' + fragment;
      }
    }

  });

  // Create the default Backbone.history.
  Backbone.history = new History;

  // Helpers
  // -------

  // Helper function to correctly set up the prototype chain for subclasses.
  // Similar to `goog.inherits`, but uses a hash of prototype properties and
  // class properties to be extended.
  var extend = function(protoProps, staticProps) {
    var parent = this;
    var child;

    // The constructor function for the new subclass is either defined by you
    // (the "constructor" property in your `extend` definition), or defaulted
    // by us to simply call the parent constructor.
    if (protoProps && _.has(protoProps, 'constructor')) {
      child = protoProps.constructor;
    } else {
      child = function(){ return parent.apply(this, arguments); };
    }

    // Add static properties to the constructor function, if supplied.
    _.extend(child, parent, staticProps);

    // Set the prototype chain to inherit from `parent`, without calling
    // `parent`'s constructor function and add the prototype properties.
    child.prototype = _.create(parent.prototype, protoProps);
    child.prototype.constructor = child;

    // Set a convenience property in case the parent's prototype is needed
    // later.
    child.__super__ = parent.prototype;

    return child;
  };

  // Set up inheritance for the model, collection, router, view and history.
  Model.extend = Collection.extend = Router.extend = View.extend = History.extend = extend;

  // Throw an error when a URL is needed, and none is supplied.
  var urlError = function() {
    throw new Error('A "url" property or function must be specified');
  };

  // Wrap an optional error callback with a fallback error event.
  var wrapError = function(model, options) {
    var error = options.error;
    options.error = function(resp) {
      if (error) error.call(options.context, model, resp, options);
      model.trigger('error', model, resp, options);
    };
  };

  return Backbone;
});

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"jquery":32,"underscore":33}],31:[function(require,module,exports){
/*! @license Firebase v2.4.2
    License: https://www.firebase.com/terms/terms-of-service.html */
(function() {var h,n=this;function p(a){return void 0!==a}function aa(){}function ba(a){a.yb=function(){return a.zf?a.zf:a.zf=new a}}
function ca(a){var b=typeof a;if("object"==b)if(a){if(a instanceof Array)return"array";if(a instanceof Object)return b;var c=Object.prototype.toString.call(a);if("[object Window]"==c)return"object";if("[object Array]"==c||"number"==typeof a.length&&"undefined"!=typeof a.splice&&"undefined"!=typeof a.propertyIsEnumerable&&!a.propertyIsEnumerable("splice"))return"array";if("[object Function]"==c||"undefined"!=typeof a.call&&"undefined"!=typeof a.propertyIsEnumerable&&!a.propertyIsEnumerable("call"))return"function"}else return"null";
else if("function"==b&&"undefined"==typeof a.call)return"object";return b}function da(a){return"array"==ca(a)}function ea(a){var b=ca(a);return"array"==b||"object"==b&&"number"==typeof a.length}function q(a){return"string"==typeof a}function fa(a){return"number"==typeof a}function r(a){return"function"==ca(a)}function ga(a){var b=typeof a;return"object"==b&&null!=a||"function"==b}function ha(a,b,c){return a.call.apply(a.bind,arguments)}
function ia(a,b,c){if(!a)throw Error();if(2<arguments.length){var d=Array.prototype.slice.call(arguments,2);return function(){var c=Array.prototype.slice.call(arguments);Array.prototype.unshift.apply(c,d);return a.apply(b,c)}}return function(){return a.apply(b,arguments)}}function u(a,b,c){u=Function.prototype.bind&&-1!=Function.prototype.bind.toString().indexOf("native code")?ha:ia;return u.apply(null,arguments)}var ja=Date.now||function(){return+new Date};
function ka(a,b){function c(){}c.prototype=b.prototype;a.ph=b.prototype;a.prototype=new c;a.prototype.constructor=a;a.lh=function(a,c,f){for(var g=Array(arguments.length-2),k=2;k<arguments.length;k++)g[k-2]=arguments[k];return b.prototype[c].apply(a,g)}};function la(a){if(Error.captureStackTrace)Error.captureStackTrace(this,la);else{var b=Error().stack;b&&(this.stack=b)}a&&(this.message=String(a))}ka(la,Error);la.prototype.name="CustomError";function v(a,b){for(var c in a)b.call(void 0,a[c],c,a)}function ma(a,b){var c={},d;for(d in a)c[d]=b.call(void 0,a[d],d,a);return c}function na(a,b){for(var c in a)if(!b.call(void 0,a[c],c,a))return!1;return!0}function oa(a){var b=0,c;for(c in a)b++;return b}function pa(a){for(var b in a)return b}function qa(a){var b=[],c=0,d;for(d in a)b[c++]=a[d];return b}function ra(a){var b=[],c=0,d;for(d in a)b[c++]=d;return b}function sa(a,b){for(var c in a)if(a[c]==b)return!0;return!1}
function ta(a,b,c){for(var d in a)if(b.call(c,a[d],d,a))return d}function ua(a,b){var c=ta(a,b,void 0);return c&&a[c]}function va(a){for(var b in a)return!1;return!0}function wa(a){var b={},c;for(c in a)b[c]=a[c];return b}var xa="constructor hasOwnProperty isPrototypeOf propertyIsEnumerable toLocaleString toString valueOf".split(" ");
function ya(a,b){for(var c,d,e=1;e<arguments.length;e++){d=arguments[e];for(c in d)a[c]=d[c];for(var f=0;f<xa.length;f++)c=xa[f],Object.prototype.hasOwnProperty.call(d,c)&&(a[c]=d[c])}};function za(a){a=String(a);if(/^\s*$/.test(a)?0:/^[\],:{}\s\u2028\u2029]*$/.test(a.replace(/\\["\\\/bfnrtu]/g,"@").replace(/"[^"\\\n\r\u2028\u2029\x00-\x08\x0a-\x1f]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,"]").replace(/(?:^|:|,)(?:[\s\u2028\u2029]*\[)+/g,"")))try{return eval("("+a+")")}catch(b){}throw Error("Invalid JSON string: "+a);}function Aa(){this.Vd=void 0}
function Ba(a,b,c){switch(typeof b){case "string":Ca(b,c);break;case "number":c.push(isFinite(b)&&!isNaN(b)?b:"null");break;case "boolean":c.push(b);break;case "undefined":c.push("null");break;case "object":if(null==b){c.push("null");break}if(da(b)){var d=b.length;c.push("[");for(var e="",f=0;f<d;f++)c.push(e),e=b[f],Ba(a,a.Vd?a.Vd.call(b,String(f),e):e,c),e=",";c.push("]");break}c.push("{");d="";for(f in b)Object.prototype.hasOwnProperty.call(b,f)&&(e=b[f],"function"!=typeof e&&(c.push(d),Ca(f,c),
c.push(":"),Ba(a,a.Vd?a.Vd.call(b,f,e):e,c),d=","));c.push("}");break;case "function":break;default:throw Error("Unknown type: "+typeof b);}}var Da={'"':'\\"',"\\":"\\\\","/":"\\/","\b":"\\b","\f":"\\f","\n":"\\n","\r":"\\r","\t":"\\t","\x0B":"\\u000b"},Ea=/\uffff/.test("\uffff")?/[\\\"\x00-\x1f\x7f-\uffff]/g:/[\\\"\x00-\x1f\x7f-\xff]/g;
function Ca(a,b){b.push('"',a.replace(Ea,function(a){if(a in Da)return Da[a];var b=a.charCodeAt(0),e="\\u";16>b?e+="000":256>b?e+="00":4096>b&&(e+="0");return Da[a]=e+b.toString(16)}),'"')};function Fa(){return Math.floor(2147483648*Math.random()).toString(36)+Math.abs(Math.floor(2147483648*Math.random())^ja()).toString(36)};var w;a:{var Ga=n.navigator;if(Ga){var Ha=Ga.userAgent;if(Ha){w=Ha;break a}}w=""};function Ia(){this.Ya=-1};function Ja(){this.Ya=-1;this.Ya=64;this.P=[];this.pe=[];this.eg=[];this.Od=[];this.Od[0]=128;for(var a=1;a<this.Ya;++a)this.Od[a]=0;this.ge=this.ec=0;this.reset()}ka(Ja,Ia);Ja.prototype.reset=function(){this.P[0]=1732584193;this.P[1]=4023233417;this.P[2]=2562383102;this.P[3]=271733878;this.P[4]=3285377520;this.ge=this.ec=0};
function Ka(a,b,c){c||(c=0);var d=a.eg;if(q(b))for(var e=0;16>e;e++)d[e]=b.charCodeAt(c)<<24|b.charCodeAt(c+1)<<16|b.charCodeAt(c+2)<<8|b.charCodeAt(c+3),c+=4;else for(e=0;16>e;e++)d[e]=b[c]<<24|b[c+1]<<16|b[c+2]<<8|b[c+3],c+=4;for(e=16;80>e;e++){var f=d[e-3]^d[e-8]^d[e-14]^d[e-16];d[e]=(f<<1|f>>>31)&4294967295}b=a.P[0];c=a.P[1];for(var g=a.P[2],k=a.P[3],m=a.P[4],l,e=0;80>e;e++)40>e?20>e?(f=k^c&(g^k),l=1518500249):(f=c^g^k,l=1859775393):60>e?(f=c&g|k&(c|g),l=2400959708):(f=c^g^k,l=3395469782),f=(b<<
5|b>>>27)+f+m+l+d[e]&4294967295,m=k,k=g,g=(c<<30|c>>>2)&4294967295,c=b,b=f;a.P[0]=a.P[0]+b&4294967295;a.P[1]=a.P[1]+c&4294967295;a.P[2]=a.P[2]+g&4294967295;a.P[3]=a.P[3]+k&4294967295;a.P[4]=a.P[4]+m&4294967295}
Ja.prototype.update=function(a,b){if(null!=a){p(b)||(b=a.length);for(var c=b-this.Ya,d=0,e=this.pe,f=this.ec;d<b;){if(0==f)for(;d<=c;)Ka(this,a,d),d+=this.Ya;if(q(a))for(;d<b;){if(e[f]=a.charCodeAt(d),++f,++d,f==this.Ya){Ka(this,e);f=0;break}}else for(;d<b;)if(e[f]=a[d],++f,++d,f==this.Ya){Ka(this,e);f=0;break}}this.ec=f;this.ge+=b}};var x=Array.prototype,La=x.indexOf?function(a,b,c){return x.indexOf.call(a,b,c)}:function(a,b,c){c=null==c?0:0>c?Math.max(0,a.length+c):c;if(q(a))return q(b)&&1==b.length?a.indexOf(b,c):-1;for(;c<a.length;c++)if(c in a&&a[c]===b)return c;return-1},Ma=x.forEach?function(a,b,c){x.forEach.call(a,b,c)}:function(a,b,c){for(var d=a.length,e=q(a)?a.split(""):a,f=0;f<d;f++)f in e&&b.call(c,e[f],f,a)},Na=x.filter?function(a,b,c){return x.filter.call(a,b,c)}:function(a,b,c){for(var d=a.length,e=[],f=0,g=q(a)?
a.split(""):a,k=0;k<d;k++)if(k in g){var m=g[k];b.call(c,m,k,a)&&(e[f++]=m)}return e},Oa=x.map?function(a,b,c){return x.map.call(a,b,c)}:function(a,b,c){for(var d=a.length,e=Array(d),f=q(a)?a.split(""):a,g=0;g<d;g++)g in f&&(e[g]=b.call(c,f[g],g,a));return e},Pa=x.reduce?function(a,b,c,d){for(var e=[],f=1,g=arguments.length;f<g;f++)e.push(arguments[f]);d&&(e[0]=u(b,d));return x.reduce.apply(a,e)}:function(a,b,c,d){var e=c;Ma(a,function(c,g){e=b.call(d,e,c,g,a)});return e},Qa=x.every?function(a,b,
c){return x.every.call(a,b,c)}:function(a,b,c){for(var d=a.length,e=q(a)?a.split(""):a,f=0;f<d;f++)if(f in e&&!b.call(c,e[f],f,a))return!1;return!0};function Ra(a,b){var c=Sa(a,b,void 0);return 0>c?null:q(a)?a.charAt(c):a[c]}function Sa(a,b,c){for(var d=a.length,e=q(a)?a.split(""):a,f=0;f<d;f++)if(f in e&&b.call(c,e[f],f,a))return f;return-1}function Ta(a,b){var c=La(a,b);0<=c&&x.splice.call(a,c,1)}function Ua(a,b,c){return 2>=arguments.length?x.slice.call(a,b):x.slice.call(a,b,c)}
function Va(a,b){a.sort(b||Wa)}function Wa(a,b){return a>b?1:a<b?-1:0};function Xa(a){n.setTimeout(function(){throw a;},0)}var Ya;
function Za(){var a=n.MessageChannel;"undefined"===typeof a&&"undefined"!==typeof window&&window.postMessage&&window.addEventListener&&-1==w.indexOf("Presto")&&(a=function(){var a=document.createElement("iframe");a.style.display="none";a.src="";document.documentElement.appendChild(a);var b=a.contentWindow,a=b.document;a.open();a.write("");a.close();var c="callImmediate"+Math.random(),d="file:"==b.location.protocol?"*":b.location.protocol+"//"+b.location.host,a=u(function(a){if(("*"==d||a.origin==
d)&&a.data==c)this.port1.onmessage()},this);b.addEventListener("message",a,!1);this.port1={};this.port2={postMessage:function(){b.postMessage(c,d)}}});if("undefined"!==typeof a&&-1==w.indexOf("Trident")&&-1==w.indexOf("MSIE")){var b=new a,c={},d=c;b.port1.onmessage=function(){if(p(c.next)){c=c.next;var a=c.hb;c.hb=null;a()}};return function(a){d.next={hb:a};d=d.next;b.port2.postMessage(0)}}return"undefined"!==typeof document&&"onreadystatechange"in document.createElement("script")?function(a){var b=
document.createElement("script");b.onreadystatechange=function(){b.onreadystatechange=null;b.parentNode.removeChild(b);b=null;a();a=null};document.documentElement.appendChild(b)}:function(a){n.setTimeout(a,0)}};function $a(a,b){ab||bb();cb||(ab(),cb=!0);db.push(new eb(a,b))}var ab;function bb(){if(n.Promise&&n.Promise.resolve){var a=n.Promise.resolve();ab=function(){a.then(fb)}}else ab=function(){var a=fb;!r(n.setImmediate)||n.Window&&n.Window.prototype&&n.Window.prototype.setImmediate==n.setImmediate?(Ya||(Ya=Za()),Ya(a)):n.setImmediate(a)}}var cb=!1,db=[];[].push(function(){cb=!1;db=[]});
function fb(){for(;db.length;){var a=db;db=[];for(var b=0;b<a.length;b++){var c=a[b];try{c.yg.call(c.scope)}catch(d){Xa(d)}}}cb=!1}function eb(a,b){this.yg=a;this.scope=b};var gb=-1!=w.indexOf("Opera")||-1!=w.indexOf("OPR"),hb=-1!=w.indexOf("Trident")||-1!=w.indexOf("MSIE"),ib=-1!=w.indexOf("Gecko")&&-1==w.toLowerCase().indexOf("webkit")&&!(-1!=w.indexOf("Trident")||-1!=w.indexOf("MSIE")),jb=-1!=w.toLowerCase().indexOf("webkit");
(function(){var a="",b;if(gb&&n.opera)return a=n.opera.version,r(a)?a():a;ib?b=/rv\:([^\);]+)(\)|;)/:hb?b=/\b(?:MSIE|rv)[: ]([^\);]+)(\)|;)/:jb&&(b=/WebKit\/(\S+)/);b&&(a=(a=b.exec(w))?a[1]:"");return hb&&(b=(b=n.document)?b.documentMode:void 0,b>parseFloat(a))?String(b):a})();var kb=null,lb=null,mb=null;function nb(a,b){if(!ea(a))throw Error("encodeByteArray takes an array as a parameter");ob();for(var c=b?lb:kb,d=[],e=0;e<a.length;e+=3){var f=a[e],g=e+1<a.length,k=g?a[e+1]:0,m=e+2<a.length,l=m?a[e+2]:0,t=f>>2,f=(f&3)<<4|k>>4,k=(k&15)<<2|l>>6,l=l&63;m||(l=64,g||(k=64));d.push(c[t],c[f],c[k],c[l])}return d.join("")}
function ob(){if(!kb){kb={};lb={};mb={};for(var a=0;65>a;a++)kb[a]="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".charAt(a),lb[a]="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.".charAt(a),mb[lb[a]]=a,62<=a&&(mb["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".charAt(a)]=a)}};function pb(a,b){this.N=qb;this.Rf=void 0;this.Ba=this.Ha=null;this.yd=this.ye=!1;if(a==rb)sb(this,tb,b);else try{var c=this;a.call(b,function(a){sb(c,tb,a)},function(a){if(!(a instanceof ub))try{if(a instanceof Error)throw a;throw Error("Promise rejected.");}catch(b){}sb(c,vb,a)})}catch(d){sb(this,vb,d)}}var qb=0,tb=2,vb=3;function rb(){}pb.prototype.then=function(a,b,c){return wb(this,r(a)?a:null,r(b)?b:null,c)};pb.prototype.then=pb.prototype.then;pb.prototype.$goog_Thenable=!0;h=pb.prototype;
h.gh=function(a,b){return wb(this,null,a,b)};h.cancel=function(a){this.N==qb&&$a(function(){var b=new ub(a);xb(this,b)},this)};function xb(a,b){if(a.N==qb)if(a.Ha){var c=a.Ha;if(c.Ba){for(var d=0,e=-1,f=0,g;g=c.Ba[f];f++)if(g=g.o)if(d++,g==a&&(e=f),0<=e&&1<d)break;0<=e&&(c.N==qb&&1==d?xb(c,b):(d=c.Ba.splice(e,1)[0],yb(c,d,vb,b)))}a.Ha=null}else sb(a,vb,b)}function zb(a,b){a.Ba&&a.Ba.length||a.N!=tb&&a.N!=vb||Ab(a);a.Ba||(a.Ba=[]);a.Ba.push(b)}
function wb(a,b,c,d){var e={o:null,Hf:null,Jf:null};e.o=new pb(function(a,g){e.Hf=b?function(c){try{var e=b.call(d,c);a(e)}catch(l){g(l)}}:a;e.Jf=c?function(b){try{var e=c.call(d,b);!p(e)&&b instanceof ub?g(b):a(e)}catch(l){g(l)}}:g});e.o.Ha=a;zb(a,e);return e.o}h.Yf=function(a){this.N=qb;sb(this,tb,a)};h.Zf=function(a){this.N=qb;sb(this,vb,a)};
function sb(a,b,c){if(a.N==qb){if(a==c)b=vb,c=new TypeError("Promise cannot resolve to itself");else{var d;if(c)try{d=!!c.$goog_Thenable}catch(e){d=!1}else d=!1;if(d){a.N=1;c.then(a.Yf,a.Zf,a);return}if(ga(c))try{var f=c.then;if(r(f)){Bb(a,c,f);return}}catch(g){b=vb,c=g}}a.Rf=c;a.N=b;a.Ha=null;Ab(a);b!=vb||c instanceof ub||Cb(a,c)}}function Bb(a,b,c){function d(b){f||(f=!0,a.Zf(b))}function e(b){f||(f=!0,a.Yf(b))}a.N=1;var f=!1;try{c.call(b,e,d)}catch(g){d(g)}}
function Ab(a){a.ye||(a.ye=!0,$a(a.wg,a))}h.wg=function(){for(;this.Ba&&this.Ba.length;){var a=this.Ba;this.Ba=null;for(var b=0;b<a.length;b++)yb(this,a[b],this.N,this.Rf)}this.ye=!1};function yb(a,b,c,d){if(c==tb)b.Hf(d);else{if(b.o)for(;a&&a.yd;a=a.Ha)a.yd=!1;b.Jf(d)}}function Cb(a,b){a.yd=!0;$a(function(){a.yd&&Db.call(null,b)})}var Db=Xa;function ub(a){la.call(this,a)}ka(ub,la);ub.prototype.name="cancel";var Eb=Eb||"2.4.2";function y(a,b){return Object.prototype.hasOwnProperty.call(a,b)}function z(a,b){if(Object.prototype.hasOwnProperty.call(a,b))return a[b]}function Fb(a,b){for(var c in a)Object.prototype.hasOwnProperty.call(a,c)&&b(c,a[c])}function Gb(a){var b={};Fb(a,function(a,d){b[a]=d});return b}function Hb(a){return"object"===typeof a&&null!==a};function Ib(a){var b=[];Fb(a,function(a,d){da(d)?Ma(d,function(d){b.push(encodeURIComponent(a)+"="+encodeURIComponent(d))}):b.push(encodeURIComponent(a)+"="+encodeURIComponent(d))});return b.length?"&"+b.join("&"):""}function Jb(a){var b={};a=a.replace(/^\?/,"").split("&");Ma(a,function(a){a&&(a=a.split("="),b[a[0]]=a[1])});return b};function Kb(a,b){if(!a)throw Lb(b);}function Lb(a){return Error("Firebase ("+Eb+") INTERNAL ASSERT FAILED: "+a)};var Mb=n.Promise||pb;pb.prototype["catch"]=pb.prototype.gh;function B(){var a=this;this.reject=this.resolve=null;this.D=new Mb(function(b,c){a.resolve=b;a.reject=c})}function C(a,b){return function(c,d){c?a.reject(c):a.resolve(d);r(b)&&(Nb(a.D),1===b.length?b(c):b(c,d))}}function Nb(a){a.then(void 0,aa)};function Ob(a){for(var b=[],c=0,d=0;d<a.length;d++){var e=a.charCodeAt(d);55296<=e&&56319>=e&&(e-=55296,d++,Kb(d<a.length,"Surrogate pair missing trail surrogate."),e=65536+(e<<10)+(a.charCodeAt(d)-56320));128>e?b[c++]=e:(2048>e?b[c++]=e>>6|192:(65536>e?b[c++]=e>>12|224:(b[c++]=e>>18|240,b[c++]=e>>12&63|128),b[c++]=e>>6&63|128),b[c++]=e&63|128)}return b}function Pb(a){for(var b=0,c=0;c<a.length;c++){var d=a.charCodeAt(c);128>d?b++:2048>d?b+=2:55296<=d&&56319>=d?(b+=4,c++):b+=3}return b};function D(a,b,c,d){var e;d<b?e="at least "+b:d>c&&(e=0===c?"none":"no more than "+c);if(e)throw Error(a+" failed: Was called with "+d+(1===d?" argument.":" arguments.")+" Expects "+e+".");}function E(a,b,c){var d="";switch(b){case 1:d=c?"first":"First";break;case 2:d=c?"second":"Second";break;case 3:d=c?"third":"Third";break;case 4:d=c?"fourth":"Fourth";break;default:throw Error("errorPrefix called with argumentNumber > 4.  Need to update it?");}return a=a+" failed: "+(d+" argument ")}
function F(a,b,c,d){if((!d||p(c))&&!r(c))throw Error(E(a,b,d)+"must be a valid function.");}function Qb(a,b,c){if(p(c)&&(!ga(c)||null===c))throw Error(E(a,b,!0)+"must be a valid context object.");};function Rb(a){return"undefined"!==typeof JSON&&p(JSON.parse)?JSON.parse(a):za(a)}function G(a){if("undefined"!==typeof JSON&&p(JSON.stringify))a=JSON.stringify(a);else{var b=[];Ba(new Aa,a,b);a=b.join("")}return a};function Sb(){this.Zd=H}Sb.prototype.j=function(a){return this.Zd.S(a)};Sb.prototype.toString=function(){return this.Zd.toString()};function Tb(){}Tb.prototype.uf=function(){return null};Tb.prototype.Ce=function(){return null};var Ub=new Tb;function Vb(a,b,c){this.bg=a;this.Oa=b;this.Nd=c}Vb.prototype.uf=function(a){var b=this.Oa.Q;if(Wb(b,a))return b.j().T(a);b=null!=this.Nd?new Xb(this.Nd,!0,!1):this.Oa.w();return this.bg.Bc(a,b)};Vb.prototype.Ce=function(a,b,c){var d=null!=this.Nd?this.Nd:Yb(this.Oa);a=this.bg.qe(d,b,1,c,a);return 0===a.length?null:a[0]};function Zb(){this.xb=[]}function $b(a,b){for(var c=null,d=0;d<b.length;d++){var e=b[d],f=e.cc();null===c||f.ea(c.cc())||(a.xb.push(c),c=null);null===c&&(c=new ac(f));c.add(e)}c&&a.xb.push(c)}function bc(a,b,c){$b(a,c);cc(a,function(a){return a.ea(b)})}function dc(a,b,c){$b(a,c);cc(a,function(a){return a.contains(b)||b.contains(a)})}
function cc(a,b){for(var c=!0,d=0;d<a.xb.length;d++){var e=a.xb[d];if(e)if(e=e.cc(),b(e)){for(var e=a.xb[d],f=0;f<e.xd.length;f++){var g=e.xd[f];if(null!==g){e.xd[f]=null;var k=g.Zb();ec&&fc("event: "+g.toString());gc(k)}}a.xb[d]=null}else c=!1}c&&(a.xb=[])}function ac(a){this.ta=a;this.xd=[]}ac.prototype.add=function(a){this.xd.push(a)};ac.prototype.cc=function(){return this.ta};function J(a,b,c,d){this.type=a;this.Na=b;this.Za=c;this.Oe=d;this.Td=void 0}function hc(a){return new J(ic,a)}var ic="value";function jc(a,b,c,d){this.xe=b;this.be=c;this.Td=d;this.wd=a}jc.prototype.cc=function(){var a=this.be.Mb();return"value"===this.wd?a.path:a.parent().path};jc.prototype.De=function(){return this.wd};jc.prototype.Zb=function(){return this.xe.Zb(this)};jc.prototype.toString=function(){return this.cc().toString()+":"+this.wd+":"+G(this.be.qf())};function kc(a,b,c){this.xe=a;this.error=b;this.path=c}kc.prototype.cc=function(){return this.path};kc.prototype.De=function(){return"cancel"};
kc.prototype.Zb=function(){return this.xe.Zb(this)};kc.prototype.toString=function(){return this.path.toString()+":cancel"};function Xb(a,b,c){this.A=a;this.ga=b;this.Yb=c}function lc(a){return a.ga}function mc(a){return a.Yb}function nc(a,b){return b.e()?a.ga&&!a.Yb:Wb(a,K(b))}function Wb(a,b){return a.ga&&!a.Yb||a.A.Fa(b)}Xb.prototype.j=function(){return this.A};function oc(a){this.pg=a;this.Gd=null}oc.prototype.get=function(){var a=this.pg.get(),b=wa(a);if(this.Gd)for(var c in this.Gd)b[c]-=this.Gd[c];this.Gd=a;return b};function pc(a,b){this.Vf={};this.hd=new oc(a);this.da=b;var c=1E4+2E4*Math.random();setTimeout(u(this.Of,this),Math.floor(c))}pc.prototype.Of=function(){var a=this.hd.get(),b={},c=!1,d;for(d in a)0<a[d]&&y(this.Vf,d)&&(b[d]=a[d],c=!0);c&&this.da.Ye(b);setTimeout(u(this.Of,this),Math.floor(6E5*Math.random()))};function qc(){this.Hc={}}function rc(a,b,c){p(c)||(c=1);y(a.Hc,b)||(a.Hc[b]=0);a.Hc[b]+=c}qc.prototype.get=function(){return wa(this.Hc)};var sc={},tc={};function uc(a){a=a.toString();sc[a]||(sc[a]=new qc);return sc[a]}function vc(a,b){var c=a.toString();tc[c]||(tc[c]=b());return tc[c]};function L(a,b){this.name=a;this.U=b}function wc(a,b){return new L(a,b)};function xc(a,b){return yc(a.name,b.name)}function zc(a,b){return yc(a,b)};function Ac(a,b,c){this.type=Bc;this.source=a;this.path=b;this.Ja=c}Ac.prototype.$c=function(a){return this.path.e()?new Ac(this.source,M,this.Ja.T(a)):new Ac(this.source,N(this.path),this.Ja)};Ac.prototype.toString=function(){return"Operation("+this.path+": "+this.source.toString()+" overwrite: "+this.Ja.toString()+")"};function Cc(a,b){this.type=Dc;this.source=a;this.path=b}Cc.prototype.$c=function(){return this.path.e()?new Cc(this.source,M):new Cc(this.source,N(this.path))};Cc.prototype.toString=function(){return"Operation("+this.path+": "+this.source.toString()+" listen_complete)"};function Ec(a,b){this.Pa=a;this.xa=b?b:Fc}h=Ec.prototype;h.Sa=function(a,b){return new Ec(this.Pa,this.xa.Sa(a,b,this.Pa).$(null,null,!1,null,null))};h.remove=function(a){return new Ec(this.Pa,this.xa.remove(a,this.Pa).$(null,null,!1,null,null))};h.get=function(a){for(var b,c=this.xa;!c.e();){b=this.Pa(a,c.key);if(0===b)return c.value;0>b?c=c.left:0<b&&(c=c.right)}return null};
function Gc(a,b){for(var c,d=a.xa,e=null;!d.e();){c=a.Pa(b,d.key);if(0===c){if(d.left.e())return e?e.key:null;for(d=d.left;!d.right.e();)d=d.right;return d.key}0>c?d=d.left:0<c&&(e=d,d=d.right)}throw Error("Attempted to find predecessor key for a nonexistent key.  What gives?");}h.e=function(){return this.xa.e()};h.count=function(){return this.xa.count()};h.Vc=function(){return this.xa.Vc()};h.jc=function(){return this.xa.jc()};h.ka=function(a){return this.xa.ka(a)};
h.ac=function(a){return new Hc(this.xa,null,this.Pa,!1,a)};h.bc=function(a,b){return new Hc(this.xa,a,this.Pa,!1,b)};h.dc=function(a,b){return new Hc(this.xa,a,this.Pa,!0,b)};h.xf=function(a){return new Hc(this.xa,null,this.Pa,!0,a)};function Hc(a,b,c,d,e){this.Xd=e||null;this.Je=d;this.Ta=[];for(e=1;!a.e();)if(e=b?c(a.key,b):1,d&&(e*=-1),0>e)a=this.Je?a.left:a.right;else if(0===e){this.Ta.push(a);break}else this.Ta.push(a),a=this.Je?a.right:a.left}
function Ic(a){if(0===a.Ta.length)return null;var b=a.Ta.pop(),c;c=a.Xd?a.Xd(b.key,b.value):{key:b.key,value:b.value};if(a.Je)for(b=b.left;!b.e();)a.Ta.push(b),b=b.right;else for(b=b.right;!b.e();)a.Ta.push(b),b=b.left;return c}function Jc(a){if(0===a.Ta.length)return null;var b;b=a.Ta;b=b[b.length-1];return a.Xd?a.Xd(b.key,b.value):{key:b.key,value:b.value}}function Kc(a,b,c,d,e){this.key=a;this.value=b;this.color=null!=c?c:!0;this.left=null!=d?d:Fc;this.right=null!=e?e:Fc}h=Kc.prototype;
h.$=function(a,b,c,d,e){return new Kc(null!=a?a:this.key,null!=b?b:this.value,null!=c?c:this.color,null!=d?d:this.left,null!=e?e:this.right)};h.count=function(){return this.left.count()+1+this.right.count()};h.e=function(){return!1};h.ka=function(a){return this.left.ka(a)||a(this.key,this.value)||this.right.ka(a)};function Lc(a){return a.left.e()?a:Lc(a.left)}h.Vc=function(){return Lc(this).key};h.jc=function(){return this.right.e()?this.key:this.right.jc()};
h.Sa=function(a,b,c){var d,e;e=this;d=c(a,e.key);e=0>d?e.$(null,null,null,e.left.Sa(a,b,c),null):0===d?e.$(null,b,null,null,null):e.$(null,null,null,null,e.right.Sa(a,b,c));return Mc(e)};function Nc(a){if(a.left.e())return Fc;a.left.ha()||a.left.left.ha()||(a=Oc(a));a=a.$(null,null,null,Nc(a.left),null);return Mc(a)}
h.remove=function(a,b){var c,d;c=this;if(0>b(a,c.key))c.left.e()||c.left.ha()||c.left.left.ha()||(c=Oc(c)),c=c.$(null,null,null,c.left.remove(a,b),null);else{c.left.ha()&&(c=Pc(c));c.right.e()||c.right.ha()||c.right.left.ha()||(c=Qc(c),c.left.left.ha()&&(c=Pc(c),c=Qc(c)));if(0===b(a,c.key)){if(c.right.e())return Fc;d=Lc(c.right);c=c.$(d.key,d.value,null,null,Nc(c.right))}c=c.$(null,null,null,null,c.right.remove(a,b))}return Mc(c)};h.ha=function(){return this.color};
function Mc(a){a.right.ha()&&!a.left.ha()&&(a=Rc(a));a.left.ha()&&a.left.left.ha()&&(a=Pc(a));a.left.ha()&&a.right.ha()&&(a=Qc(a));return a}function Oc(a){a=Qc(a);a.right.left.ha()&&(a=a.$(null,null,null,null,Pc(a.right)),a=Rc(a),a=Qc(a));return a}function Rc(a){return a.right.$(null,null,a.color,a.$(null,null,!0,null,a.right.left),null)}function Pc(a){return a.left.$(null,null,a.color,null,a.$(null,null,!0,a.left.right,null))}
function Qc(a){return a.$(null,null,!a.color,a.left.$(null,null,!a.left.color,null,null),a.right.$(null,null,!a.right.color,null,null))}function Sc(){}h=Sc.prototype;h.$=function(){return this};h.Sa=function(a,b){return new Kc(a,b,null)};h.remove=function(){return this};h.count=function(){return 0};h.e=function(){return!0};h.ka=function(){return!1};h.Vc=function(){return null};h.jc=function(){return null};h.ha=function(){return!1};var Fc=new Sc;function Tc(a,b){return a&&"object"===typeof a?(O(".sv"in a,"Unexpected leaf node or priority contents"),b[a[".sv"]]):a}function Uc(a,b){var c=new Vc;Wc(a,new P(""),function(a,e){c.rc(a,Xc(e,b))});return c}function Xc(a,b){var c=a.C().J(),c=Tc(c,b),d;if(a.L()){var e=Tc(a.Ea(),b);return e!==a.Ea()||c!==a.C().J()?new Yc(e,Q(c)):a}d=a;c!==a.C().J()&&(d=d.ia(new Yc(c)));a.R(R,function(a,c){var e=Xc(c,b);e!==c&&(d=d.W(a,e))});return d};function Zc(){this.Ac={}}Zc.prototype.set=function(a,b){null==b?delete this.Ac[a]:this.Ac[a]=b};Zc.prototype.get=function(a){return y(this.Ac,a)?this.Ac[a]:null};Zc.prototype.remove=function(a){delete this.Ac[a]};Zc.prototype.Af=!0;function $c(a){this.Ic=a;this.Sd="firebase:"}h=$c.prototype;h.set=function(a,b){null==b?this.Ic.removeItem(this.Sd+a):this.Ic.setItem(this.Sd+a,G(b))};h.get=function(a){a=this.Ic.getItem(this.Sd+a);return null==a?null:Rb(a)};h.remove=function(a){this.Ic.removeItem(this.Sd+a)};h.Af=!1;h.toString=function(){return this.Ic.toString()};function ad(a){try{if("undefined"!==typeof window&&"undefined"!==typeof window[a]){var b=window[a];b.setItem("firebase:sentinel","cache");b.removeItem("firebase:sentinel");return new $c(b)}}catch(c){}return new Zc}var bd=ad("localStorage"),cd=ad("sessionStorage");function dd(a,b,c,d,e){this.host=a.toLowerCase();this.domain=this.host.substr(this.host.indexOf(".")+1);this.ob=b;this.lc=c;this.jh=d;this.Rd=e||"";this.ab=bd.get("host:"+a)||this.host}function ed(a,b){b!==a.ab&&(a.ab=b,"s-"===a.ab.substr(0,2)&&bd.set("host:"+a.host,a.ab))}
function fd(a,b,c){O("string"===typeof b,"typeof type must == string");O("object"===typeof c,"typeof params must == object");if(b===gd)b=(a.ob?"wss://":"ws://")+a.ab+"/.ws?";else if(b===hd)b=(a.ob?"https://":"http://")+a.ab+"/.lp?";else throw Error("Unknown connection type: "+b);a.host!==a.ab&&(c.ns=a.lc);var d=[];v(c,function(a,b){d.push(b+"="+a)});return b+d.join("&")}dd.prototype.toString=function(){var a=(this.ob?"https://":"http://")+this.host;this.Rd&&(a+="<"+this.Rd+">");return a};var id=function(){var a=1;return function(){return a++}}(),O=Kb,jd=Lb;
function kd(a){try{var b;if("undefined"!==typeof atob)b=atob(a);else{ob();for(var c=mb,d=[],e=0;e<a.length;){var f=c[a.charAt(e++)],g=e<a.length?c[a.charAt(e)]:0;++e;var k=e<a.length?c[a.charAt(e)]:64;++e;var m=e<a.length?c[a.charAt(e)]:64;++e;if(null==f||null==g||null==k||null==m)throw Error();d.push(f<<2|g>>4);64!=k&&(d.push(g<<4&240|k>>2),64!=m&&d.push(k<<6&192|m))}if(8192>d.length)b=String.fromCharCode.apply(null,d);else{a="";for(c=0;c<d.length;c+=8192)a+=String.fromCharCode.apply(null,Ua(d,c,
c+8192));b=a}}return b}catch(l){fc("base64Decode failed: ",l)}return null}function ld(a){var b=Ob(a);a=new Ja;a.update(b);var b=[],c=8*a.ge;56>a.ec?a.update(a.Od,56-a.ec):a.update(a.Od,a.Ya-(a.ec-56));for(var d=a.Ya-1;56<=d;d--)a.pe[d]=c&255,c/=256;Ka(a,a.pe);for(d=c=0;5>d;d++)for(var e=24;0<=e;e-=8)b[c]=a.P[d]>>e&255,++c;return nb(b)}
function md(a){for(var b="",c=0;c<arguments.length;c++)b=ea(arguments[c])?b+md.apply(null,arguments[c]):"object"===typeof arguments[c]?b+G(arguments[c]):b+arguments[c],b+=" ";return b}var ec=null,nd=!0;
function od(a,b){Kb(!b||!0===a||!1===a,"Can't turn on custom loggers persistently.");!0===a?("undefined"!==typeof console&&("function"===typeof console.log?ec=u(console.log,console):"object"===typeof console.log&&(ec=function(a){console.log(a)})),b&&cd.set("logging_enabled",!0)):r(a)?ec=a:(ec=null,cd.remove("logging_enabled"))}function fc(a){!0===nd&&(nd=!1,null===ec&&!0===cd.get("logging_enabled")&&od(!0));if(ec){var b=md.apply(null,arguments);ec(b)}}
function pd(a){return function(){fc(a,arguments)}}function qd(a){if("undefined"!==typeof console){var b="FIREBASE INTERNAL ERROR: "+md.apply(null,arguments);"undefined"!==typeof console.error?console.error(b):console.log(b)}}function rd(a){var b=md.apply(null,arguments);throw Error("FIREBASE FATAL ERROR: "+b);}function S(a){if("undefined"!==typeof console){var b="FIREBASE WARNING: "+md.apply(null,arguments);"undefined"!==typeof console.warn?console.warn(b):console.log(b)}}
function sd(a){var b="",c="",d="",e="",f=!0,g="https",k=443;if(q(a)){var m=a.indexOf("//");0<=m&&(g=a.substring(0,m-1),a=a.substring(m+2));m=a.indexOf("/");-1===m&&(m=a.length);b=a.substring(0,m);e="";a=a.substring(m).split("/");for(m=0;m<a.length;m++)if(0<a[m].length){var l=a[m];try{l=decodeURIComponent(l.replace(/\+/g," "))}catch(t){}e+="/"+l}a=b.split(".");3===a.length?(c=a[1],d=a[0].toLowerCase()):2===a.length&&(c=a[0]);m=b.indexOf(":");0<=m&&(f="https"===g||"wss"===g,k=b.substring(m+1),isFinite(k)&&
(k=String(k)),k=q(k)?/^\s*-?0x/i.test(k)?parseInt(k,16):parseInt(k,10):NaN)}return{host:b,port:k,domain:c,fh:d,ob:f,scheme:g,bd:e}}function td(a){return fa(a)&&(a!=a||a==Number.POSITIVE_INFINITY||a==Number.NEGATIVE_INFINITY)}
function ud(a){if("complete"===document.readyState)a();else{var b=!1,c=function(){document.body?b||(b=!0,a()):setTimeout(c,Math.floor(10))};document.addEventListener?(document.addEventListener("DOMContentLoaded",c,!1),window.addEventListener("load",c,!1)):document.attachEvent&&(document.attachEvent("onreadystatechange",function(){"complete"===document.readyState&&c()}),window.attachEvent("onload",c))}}
function yc(a,b){if(a===b)return 0;if("[MIN_NAME]"===a||"[MAX_NAME]"===b)return-1;if("[MIN_NAME]"===b||"[MAX_NAME]"===a)return 1;var c=vd(a),d=vd(b);return null!==c?null!==d?0==c-d?a.length-b.length:c-d:-1:null!==d?1:a<b?-1:1}function wd(a,b){if(b&&a in b)return b[a];throw Error("Missing required key ("+a+") in object: "+G(b));}
function xd(a){if("object"!==typeof a||null===a)return G(a);var b=[],c;for(c in a)b.push(c);b.sort();c="{";for(var d=0;d<b.length;d++)0!==d&&(c+=","),c+=G(b[d]),c+=":",c+=xd(a[b[d]]);return c+"}"}function yd(a,b){if(a.length<=b)return[a];for(var c=[],d=0;d<a.length;d+=b)d+b>a?c.push(a.substring(d,a.length)):c.push(a.substring(d,d+b));return c}function zd(a,b){if(da(a))for(var c=0;c<a.length;++c)b(c,a[c]);else v(a,b)}
function Ad(a){O(!td(a),"Invalid JSON number");var b,c,d,e;0===a?(d=c=0,b=-Infinity===1/a?1:0):(b=0>a,a=Math.abs(a),a>=Math.pow(2,-1022)?(d=Math.min(Math.floor(Math.log(a)/Math.LN2),1023),c=d+1023,d=Math.round(a*Math.pow(2,52-d)-Math.pow(2,52))):(c=0,d=Math.round(a/Math.pow(2,-1074))));e=[];for(a=52;a;--a)e.push(d%2?1:0),d=Math.floor(d/2);for(a=11;a;--a)e.push(c%2?1:0),c=Math.floor(c/2);e.push(b?1:0);e.reverse();b=e.join("");c="";for(a=0;64>a;a+=8)d=parseInt(b.substr(a,8),2).toString(16),1===d.length&&
(d="0"+d),c+=d;return c.toLowerCase()}var Bd=/^-?\d{1,10}$/;function vd(a){return Bd.test(a)&&(a=Number(a),-2147483648<=a&&2147483647>=a)?a:null}function gc(a){try{a()}catch(b){setTimeout(function(){S("Exception was thrown by user callback.",b.stack||"");throw b;},Math.floor(0))}}function T(a,b){if(r(a)){var c=Array.prototype.slice.call(arguments,1).slice();gc(function(){a.apply(null,c)})}};function Cd(a){var b={},c={},d={},e="";try{var f=a.split("."),b=Rb(kd(f[0])||""),c=Rb(kd(f[1])||""),e=f[2],d=c.d||{};delete c.d}catch(g){}return{mh:b,Ec:c,data:d,bh:e}}function Dd(a){a=Cd(a).Ec;return"object"===typeof a&&a.hasOwnProperty("iat")?z(a,"iat"):null}function Ed(a){a=Cd(a);var b=a.Ec;return!!a.bh&&!!b&&"object"===typeof b&&b.hasOwnProperty("iat")};function Fd(a){this.Y=a;this.g=a.n.g}function Gd(a,b,c,d){var e=[],f=[];Ma(b,function(b){"child_changed"===b.type&&a.g.Dd(b.Oe,b.Na)&&f.push(new J("child_moved",b.Na,b.Za))});Hd(a,e,"child_removed",b,d,c);Hd(a,e,"child_added",b,d,c);Hd(a,e,"child_moved",f,d,c);Hd(a,e,"child_changed",b,d,c);Hd(a,e,ic,b,d,c);return e}function Hd(a,b,c,d,e,f){d=Na(d,function(a){return a.type===c});Va(d,u(a.qg,a));Ma(d,function(c){var d=Id(a,c,f);Ma(e,function(e){e.Qf(c.type)&&b.push(e.createEvent(d,a.Y))})})}
function Id(a,b,c){"value"!==b.type&&"child_removed"!==b.type&&(b.Td=c.wf(b.Za,b.Na,a.g));return b}Fd.prototype.qg=function(a,b){if(null==a.Za||null==b.Za)throw jd("Should only compare child_ events.");return this.g.compare(new L(a.Za,a.Na),new L(b.Za,b.Na))};function Jd(){this.ib={}}
function Kd(a,b){var c=b.type,d=b.Za;O("child_added"==c||"child_changed"==c||"child_removed"==c,"Only child changes supported for tracking");O(".priority"!==d,"Only non-priority child changes can be tracked.");var e=z(a.ib,d);if(e){var f=e.type;if("child_added"==c&&"child_removed"==f)a.ib[d]=new J("child_changed",b.Na,d,e.Na);else if("child_removed"==c&&"child_added"==f)delete a.ib[d];else if("child_removed"==c&&"child_changed"==f)a.ib[d]=new J("child_removed",e.Oe,d);else if("child_changed"==c&&
"child_added"==f)a.ib[d]=new J("child_added",b.Na,d);else if("child_changed"==c&&"child_changed"==f)a.ib[d]=new J("child_changed",b.Na,d,e.Oe);else throw jd("Illegal combination of changes: "+b+" occurred after "+e);}else a.ib[d]=b};function Ld(a){this.g=a}h=Ld.prototype;h.H=function(a,b,c,d,e,f){O(a.Mc(this.g),"A node must be indexed if only a child is updated");e=a.T(b);if(e.S(d).ea(c.S(d))&&e.e()==c.e())return a;null!=f&&(c.e()?a.Fa(b)?Kd(f,new J("child_removed",e,b)):O(a.L(),"A child remove without an old child only makes sense on a leaf node"):e.e()?Kd(f,new J("child_added",c,b)):Kd(f,new J("child_changed",c,b,e)));return a.L()&&c.e()?a:a.W(b,c).pb(this.g)};
h.ya=function(a,b,c){null!=c&&(a.L()||a.R(R,function(a,e){b.Fa(a)||Kd(c,new J("child_removed",e,a))}),b.L()||b.R(R,function(b,e){if(a.Fa(b)){var f=a.T(b);f.ea(e)||Kd(c,new J("child_changed",e,b,f))}else Kd(c,new J("child_added",e,b))}));return b.pb(this.g)};h.ia=function(a,b){return a.e()?H:a.ia(b)};h.Ra=function(){return!1};h.$b=function(){return this};function Md(a){this.Fe=new Ld(a.g);this.g=a.g;var b;a.oa?(b=Nd(a),b=a.g.Sc(Od(a),b)):b=a.g.Wc();this.gd=b;a.ra?(b=Pd(a),a=a.g.Sc(Rd(a),b)):a=a.g.Tc();this.Jc=a}h=Md.prototype;h.matches=function(a){return 0>=this.g.compare(this.gd,a)&&0>=this.g.compare(a,this.Jc)};h.H=function(a,b,c,d,e,f){this.matches(new L(b,c))||(c=H);return this.Fe.H(a,b,c,d,e,f)};
h.ya=function(a,b,c){b.L()&&(b=H);var d=b.pb(this.g),d=d.ia(H),e=this;b.R(R,function(a,b){e.matches(new L(a,b))||(d=d.W(a,H))});return this.Fe.ya(a,d,c)};h.ia=function(a){return a};h.Ra=function(){return!0};h.$b=function(){return this.Fe};function Sd(a){this.ua=new Md(a);this.g=a.g;O(a.la,"Only valid if limit has been set");this.ma=a.ma;this.Nb=!Td(a)}h=Sd.prototype;h.H=function(a,b,c,d,e,f){this.ua.matches(new L(b,c))||(c=H);return a.T(b).ea(c)?a:a.Hb()<this.ma?this.ua.$b().H(a,b,c,d,e,f):Ud(this,a,b,c,e,f)};
h.ya=function(a,b,c){var d;if(b.L()||b.e())d=H.pb(this.g);else if(2*this.ma<b.Hb()&&b.Mc(this.g)){d=H.pb(this.g);b=this.Nb?b.dc(this.ua.Jc,this.g):b.bc(this.ua.gd,this.g);for(var e=0;0<b.Ta.length&&e<this.ma;){var f=Ic(b),g;if(g=this.Nb?0>=this.g.compare(this.ua.gd,f):0>=this.g.compare(f,this.ua.Jc))d=d.W(f.name,f.U),e++;else break}}else{d=b.pb(this.g);d=d.ia(H);var k,m,l;if(this.Nb){b=d.xf(this.g);k=this.ua.Jc;m=this.ua.gd;var t=Vd(this.g);l=function(a,b){return t(b,a)}}else b=d.ac(this.g),k=this.ua.gd,
m=this.ua.Jc,l=Vd(this.g);for(var e=0,A=!1;0<b.Ta.length;)f=Ic(b),!A&&0>=l(k,f)&&(A=!0),(g=A&&e<this.ma&&0>=l(f,m))?e++:d=d.W(f.name,H)}return this.ua.$b().ya(a,d,c)};h.ia=function(a){return a};h.Ra=function(){return!0};h.$b=function(){return this.ua.$b()};
function Ud(a,b,c,d,e,f){var g;if(a.Nb){var k=Vd(a.g);g=function(a,b){return k(b,a)}}else g=Vd(a.g);O(b.Hb()==a.ma,"");var m=new L(c,d),l=a.Nb?Wd(b,a.g):Xd(b,a.g),t=a.ua.matches(m);if(b.Fa(c)){for(var A=b.T(c),l=e.Ce(a.g,l,a.Nb);null!=l&&(l.name==c||b.Fa(l.name));)l=e.Ce(a.g,l,a.Nb);e=null==l?1:g(l,m);if(t&&!d.e()&&0<=e)return null!=f&&Kd(f,new J("child_changed",d,c,A)),b.W(c,d);null!=f&&Kd(f,new J("child_removed",A,c));b=b.W(c,H);return null!=l&&a.ua.matches(l)?(null!=f&&Kd(f,new J("child_added",
l.U,l.name)),b.W(l.name,l.U)):b}return d.e()?b:t&&0<=g(l,m)?(null!=f&&(Kd(f,new J("child_removed",l.U,l.name)),Kd(f,new J("child_added",d,c))),b.W(c,d).W(l.name,H)):b};function Yd(a,b){this.me=a;this.og=b}function Zd(a){this.X=a}
Zd.prototype.gb=function(a,b,c,d){var e=new Jd,f;if(b.type===Bc)b.source.Ae?c=$d(this,a,b.path,b.Ja,c,d,e):(O(b.source.tf,"Unknown source."),f=b.source.ef||mc(a.w())&&!b.path.e(),c=ae(this,a,b.path,b.Ja,c,d,f,e));else if(b.type===be)b.source.Ae?c=ce(this,a,b.path,b.children,c,d,e):(O(b.source.tf,"Unknown source."),f=b.source.ef||mc(a.w()),c=de(this,a,b.path,b.children,c,d,f,e));else if(b.type===ee)if(b.Yd)if(b=b.path,null!=c.xc(b))c=a;else{f=new Vb(c,a,d);d=a.Q.j();if(b.e()||".priority"===K(b))lc(a.w())?
b=c.Aa(Yb(a)):(b=a.w().j(),O(b instanceof fe,"serverChildren would be complete if leaf node"),b=c.Cc(b)),b=this.X.ya(d,b,e);else{var g=K(b),k=c.Bc(g,a.w());null==k&&Wb(a.w(),g)&&(k=d.T(g));b=null!=k?this.X.H(d,g,k,N(b),f,e):a.Q.j().Fa(g)?this.X.H(d,g,H,N(b),f,e):d;b.e()&&lc(a.w())&&(d=c.Aa(Yb(a)),d.L()&&(b=this.X.ya(b,d,e)))}d=lc(a.w())||null!=c.xc(M);c=ge(a,b,d,this.X.Ra())}else c=he(this,a,b.path,b.Ub,c,d,e);else if(b.type===Dc)d=b.path,b=a.w(),f=b.j(),g=b.ga||d.e(),c=ie(this,new je(a.Q,new Xb(f,
g,b.Yb)),d,c,Ub,e);else throw jd("Unknown operation type: "+b.type);e=qa(e.ib);d=c;b=d.Q;b.ga&&(f=b.j().L()||b.j().e(),g=ke(a),(0<e.length||!a.Q.ga||f&&!b.j().ea(g)||!b.j().C().ea(g.C()))&&e.push(hc(ke(d))));return new Yd(c,e)};
function ie(a,b,c,d,e,f){var g=b.Q;if(null!=d.xc(c))return b;var k;if(c.e())O(lc(b.w()),"If change path is empty, we must have complete server data"),mc(b.w())?(e=Yb(b),d=d.Cc(e instanceof fe?e:H)):d=d.Aa(Yb(b)),f=a.X.ya(b.Q.j(),d,f);else{var m=K(c);if(".priority"==m)O(1==le(c),"Can't have a priority with additional path components"),f=g.j(),k=b.w().j(),d=d.nd(c,f,k),f=null!=d?a.X.ia(f,d):g.j();else{var l=N(c);Wb(g,m)?(k=b.w().j(),d=d.nd(c,g.j(),k),d=null!=d?g.j().T(m).H(l,d):g.j().T(m)):d=d.Bc(m,
b.w());f=null!=d?a.X.H(g.j(),m,d,l,e,f):g.j()}}return ge(b,f,g.ga||c.e(),a.X.Ra())}function ae(a,b,c,d,e,f,g,k){var m=b.w();g=g?a.X:a.X.$b();if(c.e())d=g.ya(m.j(),d,null);else if(g.Ra()&&!m.Yb)d=m.j().H(c,d),d=g.ya(m.j(),d,null);else{var l=K(c);if(!nc(m,c)&&1<le(c))return b;var t=N(c);d=m.j().T(l).H(t,d);d=".priority"==l?g.ia(m.j(),d):g.H(m.j(),l,d,t,Ub,null)}m=m.ga||c.e();b=new je(b.Q,new Xb(d,m,g.Ra()));return ie(a,b,c,e,new Vb(e,b,f),k)}
function $d(a,b,c,d,e,f,g){var k=b.Q;e=new Vb(e,b,f);if(c.e())g=a.X.ya(b.Q.j(),d,g),a=ge(b,g,!0,a.X.Ra());else if(f=K(c),".priority"===f)g=a.X.ia(b.Q.j(),d),a=ge(b,g,k.ga,k.Yb);else{c=N(c);var m=k.j().T(f);if(!c.e()){var l=e.uf(f);d=null!=l?".priority"===me(c)&&l.S(c.parent()).e()?l:l.H(c,d):H}m.ea(d)?a=b:(g=a.X.H(k.j(),f,d,c,e,g),a=ge(b,g,k.ga,a.X.Ra()))}return a}
function ce(a,b,c,d,e,f,g){var k=b;ne(d,function(d,l){var t=c.o(d);Wb(b.Q,K(t))&&(k=$d(a,k,t,l,e,f,g))});ne(d,function(d,l){var t=c.o(d);Wb(b.Q,K(t))||(k=$d(a,k,t,l,e,f,g))});return k}function oe(a,b){ne(b,function(b,d){a=a.H(b,d)});return a}
function de(a,b,c,d,e,f,g,k){if(b.w().j().e()&&!lc(b.w()))return b;var m=b;c=c.e()?d:pe(qe,c,d);var l=b.w().j();c.children.ka(function(c,d){if(l.Fa(c)){var I=b.w().j().T(c),I=oe(I,d);m=ae(a,m,new P(c),I,e,f,g,k)}});c.children.ka(function(c,d){var I=!Wb(b.w(),c)&&null==d.value;l.Fa(c)||I||(I=b.w().j().T(c),I=oe(I,d),m=ae(a,m,new P(c),I,e,f,g,k))});return m}
function he(a,b,c,d,e,f,g){if(null!=e.xc(c))return b;var k=mc(b.w()),m=b.w();if(null!=d.value){if(c.e()&&m.ga||nc(m,c))return ae(a,b,c,m.j().S(c),e,f,k,g);if(c.e()){var l=qe;m.j().R(re,function(a,b){l=l.set(new P(a),b)});return de(a,b,c,l,e,f,k,g)}return b}l=qe;ne(d,function(a){var b=c.o(a);nc(m,b)&&(l=l.set(a,m.j().S(b)))});return de(a,b,c,l,e,f,k,g)};function se(){}var te={};function Vd(a){return u(a.compare,a)}se.prototype.Dd=function(a,b){return 0!==this.compare(new L("[MIN_NAME]",a),new L("[MIN_NAME]",b))};se.prototype.Wc=function(){return ue};function ve(a){O(!a.e()&&".priority"!==K(a),"Can't create PathIndex with empty path or .priority key");this.gc=a}ka(ve,se);h=ve.prototype;h.Lc=function(a){return!a.S(this.gc).e()};h.compare=function(a,b){var c=a.U.S(this.gc),d=b.U.S(this.gc),c=c.Gc(d);return 0===c?yc(a.name,b.name):c};
h.Sc=function(a,b){var c=Q(a),c=H.H(this.gc,c);return new L(b,c)};h.Tc=function(){var a=H.H(this.gc,we);return new L("[MAX_NAME]",a)};h.toString=function(){return this.gc.slice().join("/")};function xe(){}ka(xe,se);h=xe.prototype;h.compare=function(a,b){var c=a.U.C(),d=b.U.C(),c=c.Gc(d);return 0===c?yc(a.name,b.name):c};h.Lc=function(a){return!a.C().e()};h.Dd=function(a,b){return!a.C().ea(b.C())};h.Wc=function(){return ue};h.Tc=function(){return new L("[MAX_NAME]",new Yc("[PRIORITY-POST]",we))};
h.Sc=function(a,b){var c=Q(a);return new L(b,new Yc("[PRIORITY-POST]",c))};h.toString=function(){return".priority"};var R=new xe;function ye(){}ka(ye,se);h=ye.prototype;h.compare=function(a,b){return yc(a.name,b.name)};h.Lc=function(){throw jd("KeyIndex.isDefinedOn not expected to be called.");};h.Dd=function(){return!1};h.Wc=function(){return ue};h.Tc=function(){return new L("[MAX_NAME]",H)};h.Sc=function(a){O(q(a),"KeyIndex indexValue must always be a string.");return new L(a,H)};h.toString=function(){return".key"};
var re=new ye;function ze(){}ka(ze,se);h=ze.prototype;h.compare=function(a,b){var c=a.U.Gc(b.U);return 0===c?yc(a.name,b.name):c};h.Lc=function(){return!0};h.Dd=function(a,b){return!a.ea(b)};h.Wc=function(){return ue};h.Tc=function(){return Ae};h.Sc=function(a,b){var c=Q(a);return new L(b,c)};h.toString=function(){return".value"};var Be=new ze;function Ce(){this.Xb=this.ra=this.Pb=this.oa=this.la=!1;this.ma=0;this.Rb="";this.ic=null;this.Bb="";this.fc=null;this.zb="";this.g=R}var De=new Ce;function Td(a){return""===a.Rb?a.oa:"l"===a.Rb}function Od(a){O(a.oa,"Only valid if start has been set");return a.ic}function Nd(a){O(a.oa,"Only valid if start has been set");return a.Pb?a.Bb:"[MIN_NAME]"}function Rd(a){O(a.ra,"Only valid if end has been set");return a.fc}
function Pd(a){O(a.ra,"Only valid if end has been set");return a.Xb?a.zb:"[MAX_NAME]"}function Ee(a){var b=new Ce;b.la=a.la;b.ma=a.ma;b.oa=a.oa;b.ic=a.ic;b.Pb=a.Pb;b.Bb=a.Bb;b.ra=a.ra;b.fc=a.fc;b.Xb=a.Xb;b.zb=a.zb;b.g=a.g;return b}h=Ce.prototype;h.Le=function(a){var b=Ee(this);b.la=!0;b.ma=a;b.Rb="";return b};h.Me=function(a){var b=Ee(this);b.la=!0;b.ma=a;b.Rb="l";return b};h.Ne=function(a){var b=Ee(this);b.la=!0;b.ma=a;b.Rb="r";return b};
h.ce=function(a,b){var c=Ee(this);c.oa=!0;p(a)||(a=null);c.ic=a;null!=b?(c.Pb=!0,c.Bb=b):(c.Pb=!1,c.Bb="");return c};h.vd=function(a,b){var c=Ee(this);c.ra=!0;p(a)||(a=null);c.fc=a;p(b)?(c.Xb=!0,c.zb=b):(c.oh=!1,c.zb="");return c};function Fe(a,b){var c=Ee(a);c.g=b;return c}function Ge(a){var b={};a.oa&&(b.sp=a.ic,a.Pb&&(b.sn=a.Bb));a.ra&&(b.ep=a.fc,a.Xb&&(b.en=a.zb));if(a.la){b.l=a.ma;var c=a.Rb;""===c&&(c=Td(a)?"l":"r");b.vf=c}a.g!==R&&(b.i=a.g.toString());return b}
function He(a){return!(a.oa||a.ra||a.la)}function Ie(a){return He(a)&&a.g==R}function Je(a){var b={};if(Ie(a))return b;var c;a.g===R?c="$priority":a.g===Be?c="$value":a.g===re?c="$key":(O(a.g instanceof ve,"Unrecognized index type!"),c=a.g.toString());b.orderBy=G(c);a.oa&&(b.startAt=G(a.ic),a.Pb&&(b.startAt+=","+G(a.Bb)));a.ra&&(b.endAt=G(a.fc),a.Xb&&(b.endAt+=","+G(a.zb)));a.la&&(Td(a)?b.limitToFirst=a.ma:b.limitToLast=a.ma);return b}h.toString=function(){return G(Ge(this))};function Ke(a,b){this.Ed=a;this.hc=b}Ke.prototype.get=function(a){var b=z(this.Ed,a);if(!b)throw Error("No index defined for "+a);return b===te?null:b};function Le(a,b,c){var d=ma(a.Ed,function(d,f){var g=z(a.hc,f);O(g,"Missing index implementation for "+f);if(d===te){if(g.Lc(b.U)){for(var k=[],m=c.ac(wc),l=Ic(m);l;)l.name!=b.name&&k.push(l),l=Ic(m);k.push(b);return Me(k,Vd(g))}return te}g=c.get(b.name);k=d;g&&(k=k.remove(new L(b.name,g)));return k.Sa(b,b.U)});return new Ke(d,a.hc)}
function Ne(a,b,c){var d=ma(a.Ed,function(a){if(a===te)return a;var d=c.get(b.name);return d?a.remove(new L(b.name,d)):a});return new Ke(d,a.hc)}var Oe=new Ke({".priority":te},{".priority":R});function Yc(a,b){this.B=a;O(p(this.B)&&null!==this.B,"LeafNode shouldn't be created with null/undefined value.");this.ca=b||H;Pe(this.ca);this.Gb=null}var Qe=["object","boolean","number","string"];h=Yc.prototype;h.L=function(){return!0};h.C=function(){return this.ca};h.ia=function(a){return new Yc(this.B,a)};h.T=function(a){return".priority"===a?this.ca:H};h.S=function(a){return a.e()?this:".priority"===K(a)?this.ca:H};h.Fa=function(){return!1};h.wf=function(){return null};
h.W=function(a,b){return".priority"===a?this.ia(b):b.e()&&".priority"!==a?this:H.W(a,b).ia(this.ca)};h.H=function(a,b){var c=K(a);if(null===c)return b;if(b.e()&&".priority"!==c)return this;O(".priority"!==c||1===le(a),".priority must be the last token in a path");return this.W(c,H.H(N(a),b))};h.e=function(){return!1};h.Hb=function(){return 0};h.R=function(){return!1};h.J=function(a){return a&&!this.C().e()?{".value":this.Ea(),".priority":this.C().J()}:this.Ea()};
h.hash=function(){if(null===this.Gb){var a="";this.ca.e()||(a+="priority:"+Re(this.ca.J())+":");var b=typeof this.B,a=a+(b+":"),a="number"===b?a+Ad(this.B):a+this.B;this.Gb=ld(a)}return this.Gb};h.Ea=function(){return this.B};h.Gc=function(a){if(a===H)return 1;if(a instanceof fe)return-1;O(a.L(),"Unknown node type");var b=typeof a.B,c=typeof this.B,d=La(Qe,b),e=La(Qe,c);O(0<=d,"Unknown leaf type: "+b);O(0<=e,"Unknown leaf type: "+c);return d===e?"object"===c?0:this.B<a.B?-1:this.B===a.B?0:1:e-d};
h.pb=function(){return this};h.Mc=function(){return!0};h.ea=function(a){return a===this?!0:a.L()?this.B===a.B&&this.ca.ea(a.ca):!1};h.toString=function(){return G(this.J(!0))};function fe(a,b,c){this.m=a;(this.ca=b)&&Pe(this.ca);a.e()&&O(!this.ca||this.ca.e(),"An empty node cannot have a priority");this.Ab=c;this.Gb=null}h=fe.prototype;h.L=function(){return!1};h.C=function(){return this.ca||H};h.ia=function(a){return this.m.e()?this:new fe(this.m,a,this.Ab)};h.T=function(a){if(".priority"===a)return this.C();a=this.m.get(a);return null===a?H:a};h.S=function(a){var b=K(a);return null===b?this:this.T(b).S(N(a))};h.Fa=function(a){return null!==this.m.get(a)};
h.W=function(a,b){O(b,"We should always be passing snapshot nodes");if(".priority"===a)return this.ia(b);var c=new L(a,b),d,e;b.e()?(d=this.m.remove(a),c=Ne(this.Ab,c,this.m)):(d=this.m.Sa(a,b),c=Le(this.Ab,c,this.m));e=d.e()?H:this.ca;return new fe(d,e,c)};h.H=function(a,b){var c=K(a);if(null===c)return b;O(".priority"!==K(a)||1===le(a),".priority must be the last token in a path");var d=this.T(c).H(N(a),b);return this.W(c,d)};h.e=function(){return this.m.e()};h.Hb=function(){return this.m.count()};
var Se=/^(0|[1-9]\d*)$/;h=fe.prototype;h.J=function(a){if(this.e())return null;var b={},c=0,d=0,e=!0;this.R(R,function(f,g){b[f]=g.J(a);c++;e&&Se.test(f)?d=Math.max(d,Number(f)):e=!1});if(!a&&e&&d<2*c){var f=[],g;for(g in b)f[g]=b[g];return f}a&&!this.C().e()&&(b[".priority"]=this.C().J());return b};h.hash=function(){if(null===this.Gb){var a="";this.C().e()||(a+="priority:"+Re(this.C().J())+":");this.R(R,function(b,c){var d=c.hash();""!==d&&(a+=":"+b+":"+d)});this.Gb=""===a?"":ld(a)}return this.Gb};
h.wf=function(a,b,c){return(c=Te(this,c))?(a=Gc(c,new L(a,b)))?a.name:null:Gc(this.m,a)};function Wd(a,b){var c;c=(c=Te(a,b))?(c=c.Vc())&&c.name:a.m.Vc();return c?new L(c,a.m.get(c)):null}function Xd(a,b){var c;c=(c=Te(a,b))?(c=c.jc())&&c.name:a.m.jc();return c?new L(c,a.m.get(c)):null}h.R=function(a,b){var c=Te(this,a);return c?c.ka(function(a){return b(a.name,a.U)}):this.m.ka(b)};h.ac=function(a){return this.bc(a.Wc(),a)};
h.bc=function(a,b){var c=Te(this,b);if(c)return c.bc(a,function(a){return a});for(var c=this.m.bc(a.name,wc),d=Jc(c);null!=d&&0>b.compare(d,a);)Ic(c),d=Jc(c);return c};h.xf=function(a){return this.dc(a.Tc(),a)};h.dc=function(a,b){var c=Te(this,b);if(c)return c.dc(a,function(a){return a});for(var c=this.m.dc(a.name,wc),d=Jc(c);null!=d&&0<b.compare(d,a);)Ic(c),d=Jc(c);return c};h.Gc=function(a){return this.e()?a.e()?0:-1:a.L()||a.e()?1:a===we?-1:0};
h.pb=function(a){if(a===re||sa(this.Ab.hc,a.toString()))return this;var b=this.Ab,c=this.m;O(a!==re,"KeyIndex always exists and isn't meant to be added to the IndexMap.");for(var d=[],e=!1,c=c.ac(wc),f=Ic(c);f;)e=e||a.Lc(f.U),d.push(f),f=Ic(c);d=e?Me(d,Vd(a)):te;e=a.toString();c=wa(b.hc);c[e]=a;a=wa(b.Ed);a[e]=d;return new fe(this.m,this.ca,new Ke(a,c))};h.Mc=function(a){return a===re||sa(this.Ab.hc,a.toString())};
h.ea=function(a){if(a===this)return!0;if(a.L())return!1;if(this.C().ea(a.C())&&this.m.count()===a.m.count()){var b=this.ac(R);a=a.ac(R);for(var c=Ic(b),d=Ic(a);c&&d;){if(c.name!==d.name||!c.U.ea(d.U))return!1;c=Ic(b);d=Ic(a)}return null===c&&null===d}return!1};function Te(a,b){return b===re?null:a.Ab.get(b.toString())}h.toString=function(){return G(this.J(!0))};function Q(a,b){if(null===a)return H;var c=null;"object"===typeof a&&".priority"in a?c=a[".priority"]:"undefined"!==typeof b&&(c=b);O(null===c||"string"===typeof c||"number"===typeof c||"object"===typeof c&&".sv"in c,"Invalid priority type found: "+typeof c);"object"===typeof a&&".value"in a&&null!==a[".value"]&&(a=a[".value"]);if("object"!==typeof a||".sv"in a)return new Yc(a,Q(c));if(a instanceof Array){var d=H,e=a;v(e,function(a,b){if(y(e,b)&&"."!==b.substring(0,1)){var c=Q(a);if(c.L()||!c.e())d=
d.W(b,c)}});return d.ia(Q(c))}var f=[],g=!1,k=a;Fb(k,function(a){if("string"!==typeof a||"."!==a.substring(0,1)){var b=Q(k[a]);b.e()||(g=g||!b.C().e(),f.push(new L(a,b)))}});if(0==f.length)return H;var m=Me(f,xc,function(a){return a.name},zc);if(g){var l=Me(f,Vd(R));return new fe(m,Q(c),new Ke({".priority":l},{".priority":R}))}return new fe(m,Q(c),Oe)}var Ue=Math.log(2);
function Ve(a){this.count=parseInt(Math.log(a+1)/Ue,10);this.nf=this.count-1;this.ng=a+1&parseInt(Array(this.count+1).join("1"),2)}function We(a){var b=!(a.ng&1<<a.nf);a.nf--;return b}
function Me(a,b,c,d){function e(b,d){var f=d-b;if(0==f)return null;if(1==f){var l=a[b],t=c?c(l):l;return new Kc(t,l.U,!1,null,null)}var l=parseInt(f/2,10)+b,f=e(b,l),A=e(l+1,d),l=a[l],t=c?c(l):l;return new Kc(t,l.U,!1,f,A)}a.sort(b);var f=function(b){function d(b,g){var k=t-b,A=t;t-=b;var A=e(k+1,A),k=a[k],I=c?c(k):k,A=new Kc(I,k.U,g,null,A);f?f.left=A:l=A;f=A}for(var f=null,l=null,t=a.length,A=0;A<b.count;++A){var I=We(b),Qd=Math.pow(2,b.count-(A+1));I?d(Qd,!1):(d(Qd,!1),d(Qd,!0))}return l}(new Ve(a.length));
return null!==f?new Ec(d||b,f):new Ec(d||b)}function Re(a){return"number"===typeof a?"number:"+Ad(a):"string:"+a}function Pe(a){if(a.L()){var b=a.J();O("string"===typeof b||"number"===typeof b||"object"===typeof b&&y(b,".sv"),"Priority must be a string or number.")}else O(a===we||a.e(),"priority of unexpected type.");O(a===we||a.C().e(),"Priority nodes can't have a priority of their own.")}var H=new fe(new Ec(zc),null,Oe);function Xe(){fe.call(this,new Ec(zc),H,Oe)}ka(Xe,fe);h=Xe.prototype;
h.Gc=function(a){return a===this?0:1};h.ea=function(a){return a===this};h.C=function(){return this};h.T=function(){return H};h.e=function(){return!1};var we=new Xe,ue=new L("[MIN_NAME]",H),Ae=new L("[MAX_NAME]",we);function je(a,b){this.Q=a;this.ae=b}function ge(a,b,c,d){return new je(new Xb(b,c,d),a.ae)}function ke(a){return a.Q.ga?a.Q.j():null}je.prototype.w=function(){return this.ae};function Yb(a){return a.ae.ga?a.ae.j():null};function Ye(a,b){this.Y=a;var c=a.n,d=new Ld(c.g),c=He(c)?new Ld(c.g):c.la?new Sd(c):new Md(c);this.Nf=new Zd(c);var e=b.w(),f=b.Q,g=d.ya(H,e.j(),null),k=c.ya(H,f.j(),null);this.Oa=new je(new Xb(k,f.ga,c.Ra()),new Xb(g,e.ga,d.Ra()));this.$a=[];this.ug=new Fd(a)}function Ze(a){return a.Y}h=Ye.prototype;h.w=function(){return this.Oa.w().j()};h.kb=function(a){var b=Yb(this.Oa);return b&&(He(this.Y.n)||!a.e()&&!b.T(K(a)).e())?b.S(a):null};h.e=function(){return 0===this.$a.length};h.Tb=function(a){this.$a.push(a)};
h.nb=function(a,b){var c=[];if(b){O(null==a,"A cancel should cancel all event registrations.");var d=this.Y.path;Ma(this.$a,function(a){(a=a.lf(b,d))&&c.push(a)})}if(a){for(var e=[],f=0;f<this.$a.length;++f){var g=this.$a[f];if(!g.matches(a))e.push(g);else if(a.yf()){e=e.concat(this.$a.slice(f+1));break}}this.$a=e}else this.$a=[];return c};
h.gb=function(a,b,c){a.type===be&&null!==a.source.Lb&&(O(Yb(this.Oa),"We should always have a full cache before handling merges"),O(ke(this.Oa),"Missing event cache, even though we have a server cache"));var d=this.Oa;a=this.Nf.gb(d,a,b,c);b=this.Nf;c=a.me;O(c.Q.j().Mc(b.X.g),"Event snap not indexed");O(c.w().j().Mc(b.X.g),"Server snap not indexed");O(lc(a.me.w())||!lc(d.w()),"Once a server snap is complete, it should never go back");this.Oa=a.me;return $e(this,a.og,a.me.Q.j(),null)};
function af(a,b){var c=a.Oa.Q,d=[];c.j().L()||c.j().R(R,function(a,b){d.push(new J("child_added",b,a))});c.ga&&d.push(hc(c.j()));return $e(a,d,c.j(),b)}function $e(a,b,c,d){return Gd(a.ug,b,c,d?[d]:a.$a)};function bf(a,b,c){this.type=be;this.source=a;this.path=b;this.children=c}bf.prototype.$c=function(a){if(this.path.e())return a=this.children.subtree(new P(a)),a.e()?null:a.value?new Ac(this.source,M,a.value):new bf(this.source,M,a);O(K(this.path)===a,"Can't get a merge for a child not on the path of the operation");return new bf(this.source,N(this.path),this.children)};bf.prototype.toString=function(){return"Operation("+this.path+": "+this.source.toString()+" merge: "+this.children.toString()+")"};function cf(a,b){this.f=pd("p:rest:");this.G=a;this.Kb=b;this.Ca=null;this.ba={}}function df(a,b){if(p(b))return"tag$"+b;O(Ie(a.n),"should have a tag if it's not a default query.");return a.path.toString()}h=cf.prototype;
h.Cf=function(a,b,c,d){var e=a.path.toString();this.f("Listen called for "+e+" "+a.wa());var f=df(a,c),g={};this.ba[f]=g;a=Je(a.n);var k=this;ef(this,e+".json",a,function(a,b){var t=b;404===a&&(a=t=null);null===a&&k.Kb(e,t,!1,c);z(k.ba,f)===g&&d(a?401==a?"permission_denied":"rest_error:"+a:"ok",null)})};h.$f=function(a,b){var c=df(a,b);delete this.ba[c]};h.O=function(a,b){this.Ca=a;var c=Cd(a),d=c.data,c=c.Ec&&c.Ec.exp;b&&b("ok",{auth:d,expires:c})};h.je=function(a){this.Ca=null;a("ok",null)};
h.Qe=function(){};h.Gf=function(){};h.Md=function(){};h.put=function(){};h.Df=function(){};h.Ye=function(){};
function ef(a,b,c,d){c=c||{};c.format="export";a.Ca&&(c.auth=a.Ca);var e=(a.G.ob?"https://":"http://")+a.G.host+b+"?"+Ib(c);a.f("Sending REST request for "+e);var f=new XMLHttpRequest;f.onreadystatechange=function(){if(d&&4===f.readyState){a.f("REST Response for "+e+" received. status:",f.status,"response:",f.responseText);var b=null;if(200<=f.status&&300>f.status){try{b=Rb(f.responseText)}catch(c){S("Failed to parse JSON response for "+e+": "+f.responseText)}d(null,b)}else 401!==f.status&&404!==
f.status&&S("Got unsuccessful REST response for "+e+" Status: "+f.status),d(f.status);d=null}};f.open("GET",e,!0);f.send()};function ff(a){O(da(a)&&0<a.length,"Requires a non-empty array");this.fg=a;this.Rc={}}ff.prototype.ie=function(a,b){var c;c=this.Rc[a]||[];var d=c.length;if(0<d){for(var e=Array(d),f=0;f<d;f++)e[f]=c[f];c=e}else c=[];for(d=0;d<c.length;d++)c[d].Dc.apply(c[d].Qa,Array.prototype.slice.call(arguments,1))};ff.prototype.Ib=function(a,b,c){gf(this,a);this.Rc[a]=this.Rc[a]||[];this.Rc[a].push({Dc:b,Qa:c});(a=this.Ee(a))&&b.apply(c,a)};
ff.prototype.mc=function(a,b,c){gf(this,a);a=this.Rc[a]||[];for(var d=0;d<a.length;d++)if(a[d].Dc===b&&(!c||c===a[d].Qa)){a.splice(d,1);break}};function gf(a,b){O(Ra(a.fg,function(a){return a===b}),"Unknown event: "+b)};var hf=function(){var a=0,b=[];return function(c){var d=c===a;a=c;for(var e=Array(8),f=7;0<=f;f--)e[f]="-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz".charAt(c%64),c=Math.floor(c/64);O(0===c,"Cannot push at time == 0");c=e.join("");if(d){for(f=11;0<=f&&63===b[f];f--)b[f]=0;b[f]++}else for(f=0;12>f;f++)b[f]=Math.floor(64*Math.random());for(f=0;12>f;f++)c+="-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz".charAt(b[f]);O(20===c.length,"nextPushId: Length should be 20.");
return c}}();function jf(){ff.call(this,["online"]);this.oc=!0;if("undefined"!==typeof window&&"undefined"!==typeof window.addEventListener){var a=this;window.addEventListener("online",function(){a.oc||(a.oc=!0,a.ie("online",!0))},!1);window.addEventListener("offline",function(){a.oc&&(a.oc=!1,a.ie("online",!1))},!1)}}ka(jf,ff);jf.prototype.Ee=function(a){O("online"===a,"Unknown event type: "+a);return[this.oc]};ba(jf);function kf(){ff.call(this,["visible"]);var a,b;"undefined"!==typeof document&&"undefined"!==typeof document.addEventListener&&("undefined"!==typeof document.hidden?(b="visibilitychange",a="hidden"):"undefined"!==typeof document.mozHidden?(b="mozvisibilitychange",a="mozHidden"):"undefined"!==typeof document.msHidden?(b="msvisibilitychange",a="msHidden"):"undefined"!==typeof document.webkitHidden&&(b="webkitvisibilitychange",a="webkitHidden"));this.Sb=!0;if(b){var c=this;document.addEventListener(b,
function(){var b=!document[a];b!==c.Sb&&(c.Sb=b,c.ie("visible",b))},!1)}}ka(kf,ff);kf.prototype.Ee=function(a){O("visible"===a,"Unknown event type: "+a);return[this.Sb]};ba(kf);function P(a,b){if(1==arguments.length){this.u=a.split("/");for(var c=0,d=0;d<this.u.length;d++)0<this.u[d].length&&(this.u[c]=this.u[d],c++);this.u.length=c;this.aa=0}else this.u=a,this.aa=b}function lf(a,b){var c=K(a);if(null===c)return b;if(c===K(b))return lf(N(a),N(b));throw Error("INTERNAL ERROR: innerPath ("+b+") is not within outerPath ("+a+")");}
function mf(a,b){for(var c=a.slice(),d=b.slice(),e=0;e<c.length&&e<d.length;e++){var f=yc(c[e],d[e]);if(0!==f)return f}return c.length===d.length?0:c.length<d.length?-1:1}function K(a){return a.aa>=a.u.length?null:a.u[a.aa]}function le(a){return a.u.length-a.aa}function N(a){var b=a.aa;b<a.u.length&&b++;return new P(a.u,b)}function me(a){return a.aa<a.u.length?a.u[a.u.length-1]:null}h=P.prototype;
h.toString=function(){for(var a="",b=this.aa;b<this.u.length;b++)""!==this.u[b]&&(a+="/"+this.u[b]);return a||"/"};h.slice=function(a){return this.u.slice(this.aa+(a||0))};h.parent=function(){if(this.aa>=this.u.length)return null;for(var a=[],b=this.aa;b<this.u.length-1;b++)a.push(this.u[b]);return new P(a,0)};
h.o=function(a){for(var b=[],c=this.aa;c<this.u.length;c++)b.push(this.u[c]);if(a instanceof P)for(c=a.aa;c<a.u.length;c++)b.push(a.u[c]);else for(a=a.split("/"),c=0;c<a.length;c++)0<a[c].length&&b.push(a[c]);return new P(b,0)};h.e=function(){return this.aa>=this.u.length};h.ea=function(a){if(le(this)!==le(a))return!1;for(var b=this.aa,c=a.aa;b<=this.u.length;b++,c++)if(this.u[b]!==a.u[c])return!1;return!0};
h.contains=function(a){var b=this.aa,c=a.aa;if(le(this)>le(a))return!1;for(;b<this.u.length;){if(this.u[b]!==a.u[c])return!1;++b;++c}return!0};var M=new P("");function nf(a,b){this.Ua=a.slice();this.Ka=Math.max(1,this.Ua.length);this.pf=b;for(var c=0;c<this.Ua.length;c++)this.Ka+=Pb(this.Ua[c]);of(this)}nf.prototype.push=function(a){0<this.Ua.length&&(this.Ka+=1);this.Ua.push(a);this.Ka+=Pb(a);of(this)};nf.prototype.pop=function(){var a=this.Ua.pop();this.Ka-=Pb(a);0<this.Ua.length&&--this.Ka};
function of(a){if(768<a.Ka)throw Error(a.pf+"has a key path longer than 768 bytes ("+a.Ka+").");if(32<a.Ua.length)throw Error(a.pf+"path specified exceeds the maximum depth that can be written (32) or object contains a cycle "+pf(a));}function pf(a){return 0==a.Ua.length?"":"in property '"+a.Ua.join(".")+"'"};function qf(a,b){this.value=a;this.children=b||rf}var rf=new Ec(function(a,b){return a===b?0:a<b?-1:1});function sf(a){var b=qe;v(a,function(a,d){b=b.set(new P(d),a)});return b}h=qf.prototype;h.e=function(){return null===this.value&&this.children.e()};function tf(a,b,c){if(null!=a.value&&c(a.value))return{path:M,value:a.value};if(b.e())return null;var d=K(b);a=a.children.get(d);return null!==a?(b=tf(a,N(b),c),null!=b?{path:(new P(d)).o(b.path),value:b.value}:null):null}
function uf(a,b){return tf(a,b,function(){return!0})}h.subtree=function(a){if(a.e())return this;var b=this.children.get(K(a));return null!==b?b.subtree(N(a)):qe};h.set=function(a,b){if(a.e())return new qf(b,this.children);var c=K(a),d=(this.children.get(c)||qe).set(N(a),b),c=this.children.Sa(c,d);return new qf(this.value,c)};
h.remove=function(a){if(a.e())return this.children.e()?qe:new qf(null,this.children);var b=K(a),c=this.children.get(b);return c?(a=c.remove(N(a)),b=a.e()?this.children.remove(b):this.children.Sa(b,a),null===this.value&&b.e()?qe:new qf(this.value,b)):this};h.get=function(a){if(a.e())return this.value;var b=this.children.get(K(a));return b?b.get(N(a)):null};
function pe(a,b,c){if(b.e())return c;var d=K(b);b=pe(a.children.get(d)||qe,N(b),c);d=b.e()?a.children.remove(d):a.children.Sa(d,b);return new qf(a.value,d)}function vf(a,b){return wf(a,M,b)}function wf(a,b,c){var d={};a.children.ka(function(a,f){d[a]=wf(f,b.o(a),c)});return c(b,a.value,d)}function xf(a,b,c){return yf(a,b,M,c)}function yf(a,b,c,d){var e=a.value?d(c,a.value):!1;if(e)return e;if(b.e())return null;e=K(b);return(a=a.children.get(e))?yf(a,N(b),c.o(e),d):null}
function zf(a,b,c){Af(a,b,M,c)}function Af(a,b,c,d){if(b.e())return a;a.value&&d(c,a.value);var e=K(b);return(a=a.children.get(e))?Af(a,N(b),c.o(e),d):qe}function ne(a,b){Bf(a,M,b)}function Bf(a,b,c){a.children.ka(function(a,e){Bf(e,b.o(a),c)});a.value&&c(b,a.value)}function Cf(a,b){a.children.ka(function(a,d){d.value&&b(a,d.value)})}var qe=new qf(null);qf.prototype.toString=function(){var a={};ne(this,function(b,c){a[b.toString()]=c.toString()});return G(a)};function Df(a,b,c){this.type=ee;this.source=Ef;this.path=a;this.Ub=b;this.Yd=c}Df.prototype.$c=function(a){if(this.path.e()){if(null!=this.Ub.value)return O(this.Ub.children.e(),"affectedTree should not have overlapping affected paths."),this;a=this.Ub.subtree(new P(a));return new Df(M,a,this.Yd)}O(K(this.path)===a,"operationForChild called for unrelated child.");return new Df(N(this.path),this.Ub,this.Yd)};
Df.prototype.toString=function(){return"Operation("+this.path+": "+this.source.toString()+" ack write revert="+this.Yd+" affectedTree="+this.Ub+")"};var Bc=0,be=1,ee=2,Dc=3;function Ff(a,b,c,d){this.Ae=a;this.tf=b;this.Lb=c;this.ef=d;O(!d||b,"Tagged queries must be from server.")}var Ef=new Ff(!0,!1,null,!1),Gf=new Ff(!1,!0,null,!1);Ff.prototype.toString=function(){return this.Ae?"user":this.ef?"server(queryID="+this.Lb+")":"server"};function Hf(a){this.Z=a}var If=new Hf(new qf(null));function Jf(a,b,c){if(b.e())return new Hf(new qf(c));var d=uf(a.Z,b);if(null!=d){var e=d.path,d=d.value;b=lf(e,b);d=d.H(b,c);return new Hf(a.Z.set(e,d))}a=pe(a.Z,b,new qf(c));return new Hf(a)}function Kf(a,b,c){var d=a;Fb(c,function(a,c){d=Jf(d,b.o(a),c)});return d}Hf.prototype.Ud=function(a){if(a.e())return If;a=pe(this.Z,a,qe);return new Hf(a)};function Lf(a,b){var c=uf(a.Z,b);return null!=c?a.Z.get(c.path).S(lf(c.path,b)):null}
function Mf(a){var b=[],c=a.Z.value;null!=c?c.L()||c.R(R,function(a,c){b.push(new L(a,c))}):a.Z.children.ka(function(a,c){null!=c.value&&b.push(new L(a,c.value))});return b}function Nf(a,b){if(b.e())return a;var c=Lf(a,b);return null!=c?new Hf(new qf(c)):new Hf(a.Z.subtree(b))}Hf.prototype.e=function(){return this.Z.e()};Hf.prototype.apply=function(a){return Of(M,this.Z,a)};
function Of(a,b,c){if(null!=b.value)return c.H(a,b.value);var d=null;b.children.ka(function(b,f){".priority"===b?(O(null!==f.value,"Priority writes must always be leaf nodes"),d=f.value):c=Of(a.o(b),f,c)});c.S(a).e()||null===d||(c=c.H(a.o(".priority"),d));return c};function Pf(){this.V=If;this.pa=[];this.Pc=-1}function Qf(a,b){for(var c=0;c<a.pa.length;c++){var d=a.pa[c];if(d.md===b)return d}return null}h=Pf.prototype;
h.Ud=function(a){var b=Sa(this.pa,function(b){return b.md===a});O(0<=b,"removeWrite called with nonexistent writeId.");var c=this.pa[b];this.pa.splice(b,1);for(var d=c.visible,e=!1,f=this.pa.length-1;d&&0<=f;){var g=this.pa[f];g.visible&&(f>=b&&Rf(g,c.path)?d=!1:c.path.contains(g.path)&&(e=!0));f--}if(d){if(e)this.V=Sf(this.pa,Tf,M),this.Pc=0<this.pa.length?this.pa[this.pa.length-1].md:-1;else if(c.Ja)this.V=this.V.Ud(c.path);else{var k=this;v(c.children,function(a,b){k.V=k.V.Ud(c.path.o(b))})}return!0}return!1};
h.Aa=function(a,b,c,d){if(c||d){var e=Nf(this.V,a);return!d&&e.e()?b:d||null!=b||null!=Lf(e,M)?(e=Sf(this.pa,function(b){return(b.visible||d)&&(!c||!(0<=La(c,b.md)))&&(b.path.contains(a)||a.contains(b.path))},a),b=b||H,e.apply(b)):null}e=Lf(this.V,a);if(null!=e)return e;e=Nf(this.V,a);return e.e()?b:null!=b||null!=Lf(e,M)?(b=b||H,e.apply(b)):null};
h.Cc=function(a,b){var c=H,d=Lf(this.V,a);if(d)d.L()||d.R(R,function(a,b){c=c.W(a,b)});else if(b){var e=Nf(this.V,a);b.R(R,function(a,b){var d=Nf(e,new P(a)).apply(b);c=c.W(a,d)});Ma(Mf(e),function(a){c=c.W(a.name,a.U)})}else e=Nf(this.V,a),Ma(Mf(e),function(a){c=c.W(a.name,a.U)});return c};h.nd=function(a,b,c,d){O(c||d,"Either existingEventSnap or existingServerSnap must exist");a=a.o(b);if(null!=Lf(this.V,a))return null;a=Nf(this.V,a);return a.e()?d.S(b):a.apply(d.S(b))};
h.Bc=function(a,b,c){a=a.o(b);var d=Lf(this.V,a);return null!=d?d:Wb(c,b)?Nf(this.V,a).apply(c.j().T(b)):null};h.xc=function(a){return Lf(this.V,a)};h.qe=function(a,b,c,d,e,f){var g;a=Nf(this.V,a);g=Lf(a,M);if(null==g)if(null!=b)g=a.apply(b);else return[];g=g.pb(f);if(g.e()||g.L())return[];b=[];a=Vd(f);e=e?g.dc(c,f):g.bc(c,f);for(f=Ic(e);f&&b.length<d;)0!==a(f,c)&&b.push(f),f=Ic(e);return b};
function Rf(a,b){return a.Ja?a.path.contains(b):!!ta(a.children,function(c,d){return a.path.o(d).contains(b)})}function Tf(a){return a.visible}
function Sf(a,b,c){for(var d=If,e=0;e<a.length;++e){var f=a[e];if(b(f)){var g=f.path;if(f.Ja)c.contains(g)?(g=lf(c,g),d=Jf(d,g,f.Ja)):g.contains(c)&&(g=lf(g,c),d=Jf(d,M,f.Ja.S(g)));else if(f.children)if(c.contains(g))g=lf(c,g),d=Kf(d,g,f.children);else{if(g.contains(c))if(g=lf(g,c),g.e())d=Kf(d,M,f.children);else if(f=z(f.children,K(g)))f=f.S(N(g)),d=Jf(d,M,f)}else throw jd("WriteRecord should have .snap or .children");}}return d}function Uf(a,b){this.Qb=a;this.Z=b}h=Uf.prototype;
h.Aa=function(a,b,c){return this.Z.Aa(this.Qb,a,b,c)};h.Cc=function(a){return this.Z.Cc(this.Qb,a)};h.nd=function(a,b,c){return this.Z.nd(this.Qb,a,b,c)};h.xc=function(a){return this.Z.xc(this.Qb.o(a))};h.qe=function(a,b,c,d,e){return this.Z.qe(this.Qb,a,b,c,d,e)};h.Bc=function(a,b){return this.Z.Bc(this.Qb,a,b)};h.o=function(a){return new Uf(this.Qb.o(a),this.Z)};function Vf(){this.children={};this.pd=0;this.value=null}function Wf(a,b,c){this.Jd=a?a:"";this.Ha=b?b:null;this.A=c?c:new Vf}function Xf(a,b){for(var c=b instanceof P?b:new P(b),d=a,e;null!==(e=K(c));)d=new Wf(e,d,z(d.A.children,e)||new Vf),c=N(c);return d}h=Wf.prototype;h.Ea=function(){return this.A.value};function Yf(a,b){O("undefined"!==typeof b,"Cannot set value to undefined");a.A.value=b;Zf(a)}h.clear=function(){this.A.value=null;this.A.children={};this.A.pd=0;Zf(this)};
h.zd=function(){return 0<this.A.pd};h.e=function(){return null===this.Ea()&&!this.zd()};h.R=function(a){var b=this;v(this.A.children,function(c,d){a(new Wf(d,b,c))})};function $f(a,b,c,d){c&&!d&&b(a);a.R(function(a){$f(a,b,!0,d)});c&&d&&b(a)}function ag(a,b){for(var c=a.parent();null!==c&&!b(c);)c=c.parent()}h.path=function(){return new P(null===this.Ha?this.Jd:this.Ha.path()+"/"+this.Jd)};h.name=function(){return this.Jd};h.parent=function(){return this.Ha};
function Zf(a){if(null!==a.Ha){var b=a.Ha,c=a.Jd,d=a.e(),e=y(b.A.children,c);d&&e?(delete b.A.children[c],b.A.pd--,Zf(b)):d||e||(b.A.children[c]=a.A,b.A.pd++,Zf(b))}};var bg=/[\[\].#$\/\u0000-\u001F\u007F]/,cg=/[\[\].#$\u0000-\u001F\u007F]/,dg=/^[a-zA-Z][a-zA-Z._\-+]+$/;function eg(a){return q(a)&&0!==a.length&&!bg.test(a)}function fg(a){return null===a||q(a)||fa(a)&&!td(a)||ga(a)&&y(a,".sv")}function gg(a,b,c,d){d&&!p(b)||hg(E(a,1,d),b,c)}
function hg(a,b,c){c instanceof P&&(c=new nf(c,a));if(!p(b))throw Error(a+"contains undefined "+pf(c));if(r(b))throw Error(a+"contains a function "+pf(c)+" with contents: "+b.toString());if(td(b))throw Error(a+"contains "+b.toString()+" "+pf(c));if(q(b)&&b.length>10485760/3&&10485760<Pb(b))throw Error(a+"contains a string greater than 10485760 utf8 bytes "+pf(c)+" ('"+b.substring(0,50)+"...')");if(ga(b)){var d=!1,e=!1;Fb(b,function(b,g){if(".value"===b)d=!0;else if(".priority"!==b&&".sv"!==b&&(e=
!0,!eg(b)))throw Error(a+" contains an invalid key ("+b+") "+pf(c)+'.  Keys must be non-empty strings and can\'t contain ".", "#", "$", "/", "[", or "]"');c.push(b);hg(a,g,c);c.pop()});if(d&&e)throw Error(a+' contains ".value" child '+pf(c)+" in addition to actual children.");}}
function ig(a,b){var c,d;for(c=0;c<b.length;c++){d=b[c];for(var e=d.slice(),f=0;f<e.length;f++)if((".priority"!==e[f]||f!==e.length-1)&&!eg(e[f]))throw Error(a+"contains an invalid key ("+e[f]+") in path "+d.toString()+'. Keys must be non-empty strings and can\'t contain ".", "#", "$", "/", "[", or "]"');}b.sort(mf);e=null;for(c=0;c<b.length;c++){d=b[c];if(null!==e&&e.contains(d))throw Error(a+"contains a path "+e.toString()+" that is ancestor of another path "+d.toString());e=d}}
function jg(a,b,c){var d=E(a,1,!1);if(!ga(b)||da(b))throw Error(d+" must be an object containing the children to replace.");var e=[];Fb(b,function(a,b){var k=new P(a);hg(d,b,c.o(k));if(".priority"===me(k)&&!fg(b))throw Error(d+"contains an invalid value for '"+k.toString()+"', which must be a valid Firebase priority (a string, finite number, server value, or null).");e.push(k)});ig(d,e)}
function kg(a,b,c){if(td(c))throw Error(E(a,b,!1)+"is "+c.toString()+", but must be a valid Firebase priority (a string, finite number, server value, or null).");if(!fg(c))throw Error(E(a,b,!1)+"must be a valid Firebase priority (a string, finite number, server value, or null).");}
function lg(a,b,c){if(!c||p(b))switch(b){case "value":case "child_added":case "child_removed":case "child_changed":case "child_moved":break;default:throw Error(E(a,1,c)+'must be a valid event type: "value", "child_added", "child_removed", "child_changed", or "child_moved".');}}function mg(a,b){if(p(b)&&!eg(b))throw Error(E(a,2,!0)+'was an invalid key: "'+b+'".  Firebase keys must be non-empty strings and can\'t contain ".", "#", "$", "/", "[", or "]").');}
function ng(a,b){if(!q(b)||0===b.length||cg.test(b))throw Error(E(a,1,!1)+'was an invalid path: "'+b+'". Paths must be non-empty strings and can\'t contain ".", "#", "$", "[", or "]"');}function og(a,b){if(".info"===K(b))throw Error(a+" failed: Can't modify data under /.info/");}function pg(a,b){if(!q(b))throw Error(E(a,1,!1)+"must be a valid credential (a string).");}function qg(a,b,c){if(!q(c))throw Error(E(a,b,!1)+"must be a valid string.");}
function rg(a,b){qg(a,1,b);if(!dg.test(b))throw Error(E(a,1,!1)+"'"+b+"' is not a valid authentication provider.");}function sg(a,b,c,d){if(!d||p(c))if(!ga(c)||null===c)throw Error(E(a,b,d)+"must be a valid object.");}function tg(a,b,c){if(!ga(b)||!y(b,c))throw Error(E(a,1,!1)+'must contain the key "'+c+'"');if(!q(z(b,c)))throw Error(E(a,1,!1)+'must contain the key "'+c+'" with type "string"');};function ug(){this.set={}}h=ug.prototype;h.add=function(a,b){this.set[a]=null!==b?b:!0};h.contains=function(a){return y(this.set,a)};h.get=function(a){return this.contains(a)?this.set[a]:void 0};h.remove=function(a){delete this.set[a]};h.clear=function(){this.set={}};h.e=function(){return va(this.set)};h.count=function(){return oa(this.set)};function vg(a,b){v(a.set,function(a,d){b(d,a)})}h.keys=function(){var a=[];v(this.set,function(b,c){a.push(c)});return a};function Vc(){this.m=this.B=null}Vc.prototype.find=function(a){if(null!=this.B)return this.B.S(a);if(a.e()||null==this.m)return null;var b=K(a);a=N(a);return this.m.contains(b)?this.m.get(b).find(a):null};Vc.prototype.rc=function(a,b){if(a.e())this.B=b,this.m=null;else if(null!==this.B)this.B=this.B.H(a,b);else{null==this.m&&(this.m=new ug);var c=K(a);this.m.contains(c)||this.m.add(c,new Vc);c=this.m.get(c);a=N(a);c.rc(a,b)}};
function wg(a,b){if(b.e())return a.B=null,a.m=null,!0;if(null!==a.B){if(a.B.L())return!1;var c=a.B;a.B=null;c.R(R,function(b,c){a.rc(new P(b),c)});return wg(a,b)}return null!==a.m?(c=K(b),b=N(b),a.m.contains(c)&&wg(a.m.get(c),b)&&a.m.remove(c),a.m.e()?(a.m=null,!0):!1):!0}function Wc(a,b,c){null!==a.B?c(b,a.B):a.R(function(a,e){var f=new P(b.toString()+"/"+a);Wc(e,f,c)})}Vc.prototype.R=function(a){null!==this.m&&vg(this.m,function(b,c){a(b,c)})};var xg="auth.firebase.com";function yg(a,b,c){this.qd=a||{};this.he=b||{};this.fb=c||{};this.qd.remember||(this.qd.remember="default")}var zg=["remember","redirectTo"];function Ag(a){var b={},c={};Fb(a||{},function(a,e){0<=La(zg,a)?b[a]=e:c[a]=e});return new yg(b,{},c)};function Bg(a,b){this.Ue=["session",a.Rd,a.lc].join(":");this.ee=b}Bg.prototype.set=function(a,b){if(!b)if(this.ee.length)b=this.ee[0];else throw Error("fb.login.SessionManager : No storage options available!");b.set(this.Ue,a)};Bg.prototype.get=function(){var a=Oa(this.ee,u(this.Bg,this)),a=Na(a,function(a){return null!==a});Va(a,function(a,c){return Dd(c.token)-Dd(a.token)});return 0<a.length?a.shift():null};Bg.prototype.Bg=function(a){try{var b=a.get(this.Ue);if(b&&b.token)return b}catch(c){}return null};
Bg.prototype.clear=function(){var a=this;Ma(this.ee,function(b){b.remove(a.Ue)})};function Cg(){return"undefined"!==typeof navigator&&"string"===typeof navigator.userAgent?navigator.userAgent:""}function Dg(){return"undefined"!==typeof window&&!!(window.cordova||window.phonegap||window.PhoneGap)&&/ios|iphone|ipod|ipad|android|blackberry|iemobile/i.test(Cg())}function Eg(){return"undefined"!==typeof location&&/^file:\//.test(location.href)}
function Fg(a){var b=Cg();if(""===b)return!1;if("Microsoft Internet Explorer"===navigator.appName){if((b=b.match(/MSIE ([0-9]{1,}[\.0-9]{0,})/))&&1<b.length)return parseFloat(b[1])>=a}else if(-1<b.indexOf("Trident")&&(b=b.match(/rv:([0-9]{2,2}[\.0-9]{0,})/))&&1<b.length)return parseFloat(b[1])>=a;return!1};function Gg(){var a=window.opener.frames,b;for(b=a.length-1;0<=b;b--)try{if(a[b].location.protocol===window.location.protocol&&a[b].location.host===window.location.host&&"__winchan_relay_frame"===a[b].name)return a[b]}catch(c){}return null}function Hg(a,b,c){a.attachEvent?a.attachEvent("on"+b,c):a.addEventListener&&a.addEventListener(b,c,!1)}function Ig(a,b,c){a.detachEvent?a.detachEvent("on"+b,c):a.removeEventListener&&a.removeEventListener(b,c,!1)}
function Jg(a){/^https?:\/\//.test(a)||(a=window.location.href);var b=/^(https?:\/\/[\-_a-zA-Z\.0-9:]+)/.exec(a);return b?b[1]:a}function Kg(a){var b="";try{a=a.replace(/.*\?/,"");var c=Jb(a);c&&y(c,"__firebase_request_key")&&(b=z(c,"__firebase_request_key"))}catch(d){}return b}function Lg(){try{var a=document.location.hash.replace(/&__firebase_request_key=([a-zA-z0-9]*)/,""),a=a.replace(/\?$/,""),a=a.replace(/^#+$/,"");document.location.hash=a}catch(b){}}
function Mg(){var a=sd(xg);return a.scheme+"://"+a.host+"/v2"}function Ng(a){return Mg()+"/"+a+"/auth/channel"};function Og(a){var b=this;this.hb=a;this.fe="*";Fg(8)?this.Uc=this.Cd=Gg():(this.Uc=window.opener,this.Cd=window);if(!b.Uc)throw"Unable to find relay frame";Hg(this.Cd,"message",u(this.nc,this));Hg(this.Cd,"message",u(this.Ff,this));try{Pg(this,{a:"ready"})}catch(c){Hg(this.Uc,"load",function(){Pg(b,{a:"ready"})})}Hg(window,"unload",u(this.Ng,this))}function Pg(a,b){b=G(b);Fg(8)?a.Uc.doPost(b,a.fe):a.Uc.postMessage(b,a.fe)}
Og.prototype.nc=function(a){var b=this,c;try{c=Rb(a.data)}catch(d){}c&&"request"===c.a&&(Ig(window,"message",this.nc),this.fe=a.origin,this.hb&&setTimeout(function(){b.hb(b.fe,c.d,function(a,c){b.mg=!c;b.hb=void 0;Pg(b,{a:"response",d:a,forceKeepWindowOpen:c})})},0))};Og.prototype.Ng=function(){try{Ig(this.Cd,"message",this.Ff)}catch(a){}this.hb&&(Pg(this,{a:"error",d:"unknown closed window"}),this.hb=void 0);try{window.close()}catch(b){}};Og.prototype.Ff=function(a){if(this.mg&&"die"===a.data)try{window.close()}catch(b){}};function Qg(a){this.tc=Fa()+Fa()+Fa();this.Kf=a}Qg.prototype.open=function(a,b){cd.set("redirect_request_id",this.tc);cd.set("redirect_request_id",this.tc);b.requestId=this.tc;b.redirectTo=b.redirectTo||window.location.href;a+=(/\?/.test(a)?"":"?")+Ib(b);window.location=a};Qg.isAvailable=function(){return!Eg()&&!Dg()};Qg.prototype.Fc=function(){return"redirect"};var Rg={NETWORK_ERROR:"Unable to contact the Firebase server.",SERVER_ERROR:"An unknown server error occurred.",TRANSPORT_UNAVAILABLE:"There are no login transports available for the requested method.",REQUEST_INTERRUPTED:"The browser redirected the page before the login request could complete.",USER_CANCELLED:"The user cancelled authentication."};function Sg(a){var b=Error(z(Rg,a),a);b.code=a;return b};function Tg(a){var b;(b=!a.window_features)||(b=Cg(),b=-1!==b.indexOf("Fennec/")||-1!==b.indexOf("Firefox/")&&-1!==b.indexOf("Android"));b&&(a.window_features=void 0);a.window_name||(a.window_name="_blank");this.options=a}
Tg.prototype.open=function(a,b,c){function d(a){g&&(document.body.removeChild(g),g=void 0);t&&(t=clearInterval(t));Ig(window,"message",e);Ig(window,"unload",d);if(l&&!a)try{l.close()}catch(b){k.postMessage("die",m)}l=k=void 0}function e(a){if(a.origin===m)try{var b=Rb(a.data);"ready"===b.a?k.postMessage(A,m):"error"===b.a?(d(!1),c&&(c(b.d),c=null)):"response"===b.a&&(d(b.forceKeepWindowOpen),c&&(c(null,b.d),c=null))}catch(e){}}var f=Fg(8),g,k;if(!this.options.relay_url)return c(Error("invalid arguments: origin of url and relay_url must match"));
var m=Jg(a);if(m!==Jg(this.options.relay_url))c&&setTimeout(function(){c(Error("invalid arguments: origin of url and relay_url must match"))},0);else{f&&(g=document.createElement("iframe"),g.setAttribute("src",this.options.relay_url),g.style.display="none",g.setAttribute("name","__winchan_relay_frame"),document.body.appendChild(g),k=g.contentWindow);a+=(/\?/.test(a)?"":"?")+Ib(b);var l=window.open(a,this.options.window_name,this.options.window_features);k||(k=l);var t=setInterval(function(){l&&l.closed&&
(d(!1),c&&(c(Sg("USER_CANCELLED")),c=null))},500),A=G({a:"request",d:b});Hg(window,"unload",d);Hg(window,"message",e)}};
Tg.isAvailable=function(){var a;if(a="postMessage"in window&&!Eg())(a=Dg()||"undefined"!==typeof navigator&&(!!Cg().match(/Windows Phone/)||!!window.Windows&&/^ms-appx:/.test(location.href)))||(a=Cg(),a="undefined"!==typeof navigator&&"undefined"!==typeof window&&!!(a.match(/(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i)||a.match(/CriOS/)||a.match(/Twitter for iPhone/)||a.match(/FBAN\/FBIOS/)||window.navigator.standalone)),a=!a;return a&&!Cg().match(/PhantomJS/)};Tg.prototype.Fc=function(){return"popup"};function Ug(a){a.method||(a.method="GET");a.headers||(a.headers={});a.headers.content_type||(a.headers.content_type="application/json");a.headers.content_type=a.headers.content_type.toLowerCase();this.options=a}
Ug.prototype.open=function(a,b,c){function d(){c&&(c(Sg("REQUEST_INTERRUPTED")),c=null)}var e=new XMLHttpRequest,f=this.options.method.toUpperCase(),g;Hg(window,"beforeunload",d);e.onreadystatechange=function(){if(c&&4===e.readyState){var a;if(200<=e.status&&300>e.status){try{a=Rb(e.responseText)}catch(b){}c(null,a)}else 500<=e.status&&600>e.status?c(Sg("SERVER_ERROR")):c(Sg("NETWORK_ERROR"));c=null;Ig(window,"beforeunload",d)}};if("GET"===f)a+=(/\?/.test(a)?"":"?")+Ib(b),g=null;else{var k=this.options.headers.content_type;
"application/json"===k&&(g=G(b));"application/x-www-form-urlencoded"===k&&(g=Ib(b))}e.open(f,a,!0);a={"X-Requested-With":"XMLHttpRequest",Accept:"application/json;text/plain"};ya(a,this.options.headers);for(var m in a)e.setRequestHeader(m,a[m]);e.send(g)};Ug.isAvailable=function(){var a;if(a=!!window.XMLHttpRequest)a=Cg(),a=!(a.match(/MSIE/)||a.match(/Trident/))||Fg(10);return a};Ug.prototype.Fc=function(){return"json"};function Vg(a){this.tc=Fa()+Fa()+Fa();this.Kf=a}
Vg.prototype.open=function(a,b,c){function d(){c&&(c(Sg("USER_CANCELLED")),c=null)}var e=this,f=sd(xg),g;b.requestId=this.tc;b.redirectTo=f.scheme+"://"+f.host+"/blank/page.html";a+=/\?/.test(a)?"":"?";a+=Ib(b);(g=window.open(a,"_blank","location=no"))&&r(g.addEventListener)?(g.addEventListener("loadstart",function(a){var b;if(b=a&&a.url)a:{try{var l=document.createElement("a");l.href=a.url;b=l.host===f.host&&"/blank/page.html"===l.pathname;break a}catch(t){}b=!1}b&&(a=Kg(a.url),g.removeEventListener("exit",
d),g.close(),a=new yg(null,null,{requestId:e.tc,requestKey:a}),e.Kf.requestWithCredential("/auth/session",a,c),c=null)}),g.addEventListener("exit",d)):c(Sg("TRANSPORT_UNAVAILABLE"))};Vg.isAvailable=function(){return Dg()};Vg.prototype.Fc=function(){return"redirect"};function Wg(a){a.callback_parameter||(a.callback_parameter="callback");this.options=a;window.__firebase_auth_jsonp=window.__firebase_auth_jsonp||{}}
Wg.prototype.open=function(a,b,c){function d(){c&&(c(Sg("REQUEST_INTERRUPTED")),c=null)}function e(){setTimeout(function(){window.__firebase_auth_jsonp[f]=void 0;va(window.__firebase_auth_jsonp)&&(window.__firebase_auth_jsonp=void 0);try{var a=document.getElementById(f);a&&a.parentNode.removeChild(a)}catch(b){}},1);Ig(window,"beforeunload",d)}var f="fn"+(new Date).getTime()+Math.floor(99999*Math.random());b[this.options.callback_parameter]="__firebase_auth_jsonp."+f;a+=(/\?/.test(a)?"":"?")+Ib(b);
Hg(window,"beforeunload",d);window.__firebase_auth_jsonp[f]=function(a){c&&(c(null,a),c=null);e()};Xg(f,a,c)};
function Xg(a,b,c){setTimeout(function(){try{var d=document.createElement("script");d.type="text/javascript";d.id=a;d.async=!0;d.src=b;d.onerror=function(){var b=document.getElementById(a);null!==b&&b.parentNode.removeChild(b);c&&c(Sg("NETWORK_ERROR"))};var e=document.getElementsByTagName("head");(e&&0!=e.length?e[0]:document.documentElement).appendChild(d)}catch(f){c&&c(Sg("NETWORK_ERROR"))}},0)}Wg.isAvailable=function(){return"undefined"!==typeof document&&null!=document.createElement};
Wg.prototype.Fc=function(){return"json"};function Yg(a,b,c,d){ff.call(this,["auth_status"]);this.G=a;this.hf=b;this.ih=c;this.Pe=d;this.wc=new Bg(a,[bd,cd]);this.qb=null;this.We=!1;Zg(this)}ka(Yg,ff);h=Yg.prototype;h.Be=function(){return this.qb||null};function Zg(a){cd.get("redirect_request_id")&&$g(a);var b=a.wc.get();b&&b.token?(ah(a,b),a.hf(b.token,function(c,d){bh(a,c,d,!1,b.token,b)},function(b,d){ch(a,"resumeSession()",b,d)})):ah(a,null)}
function dh(a,b,c,d,e,f){"firebaseio-demo.com"===a.G.domain&&S("Firebase authentication is not supported on demo Firebases (*.fireba1seio-demo.com). To secure your Firebase, create a production Firebase at https://www.firebase.com.");a.hf(b,function(f,k){bh(a,f,k,!0,b,c,d||{},e)},function(b,c){ch(a,"auth()",b,c,f)})}function eh(a,b){a.wc.clear();ah(a,null);a.ih(function(a,d){if("ok"===a)T(b,null);else{var e=(a||"error").toUpperCase(),f=e;d&&(f+=": "+d);f=Error(f);f.code=e;T(b,f)}})}
function bh(a,b,c,d,e,f,g,k){"ok"===b?(d&&(b=c.auth,f.auth=b,f.expires=c.expires,f.token=Ed(e)?e:"",c=null,b&&y(b,"uid")?c=z(b,"uid"):y(f,"uid")&&(c=z(f,"uid")),f.uid=c,c="custom",b&&y(b,"provider")?c=z(b,"provider"):y(f,"provider")&&(c=z(f,"provider")),f.provider=c,a.wc.clear(),Ed(e)&&(g=g||{},c=bd,"sessionOnly"===g.remember&&(c=cd),"none"!==g.remember&&a.wc.set(f,c)),ah(a,f)),T(k,null,f)):(a.wc.clear(),ah(a,null),f=a=(b||"error").toUpperCase(),c&&(f+=": "+c),f=Error(f),f.code=a,T(k,f))}
function ch(a,b,c,d,e){S(b+" was canceled: "+d);a.wc.clear();ah(a,null);a=Error(d);a.code=c.toUpperCase();T(e,a)}function fh(a,b,c,d,e){gh(a);c=new yg(d||{},{},c||{});hh(a,[Ug,Wg],"/auth/"+b,c,e)}
function ih(a,b,c,d){gh(a);var e=[Tg,Vg];c=Ag(c);var f=625;"anonymous"===b||"password"===b?setTimeout(function(){T(d,Sg("TRANSPORT_UNAVAILABLE"))},0):("github"===b&&(f=1025),c.he.window_features="menubar=yes,modal=yes,alwaysRaised=yeslocation=yes,resizable=yes,scrollbars=yes,status=yes,height=625,width="+f+",top="+("object"===typeof screen?.5*(screen.height-625):0)+",left="+("object"===typeof screen?.5*(screen.width-f):0),c.he.relay_url=Ng(a.G.lc),c.he.requestWithCredential=u(a.uc,a),hh(a,e,"/auth/"+
b,c,d))}function $g(a){var b=cd.get("redirect_request_id");if(b){var c=cd.get("redirect_client_options");cd.remove("redirect_request_id");cd.remove("redirect_client_options");var d=[Ug,Wg],b={requestId:b,requestKey:Kg(document.location.hash)},c=new yg(c,{},b);a.We=!0;Lg();hh(a,d,"/auth/session",c,function(){this.We=!1}.bind(a))}}h.ve=function(a,b){gh(this);var c=Ag(a);c.fb._method="POST";this.uc("/users",c,function(a,c){a?T(b,a):T(b,a,c)})};
h.Xe=function(a,b){var c=this;gh(this);var d="/users/"+encodeURIComponent(a.email),e=Ag(a);e.fb._method="DELETE";this.uc(d,e,function(a,d){!a&&d&&d.uid&&c.qb&&c.qb.uid&&c.qb.uid===d.uid&&eh(c);T(b,a)})};h.se=function(a,b){gh(this);var c="/users/"+encodeURIComponent(a.email)+"/password",d=Ag(a);d.fb._method="PUT";d.fb.password=a.newPassword;this.uc(c,d,function(a){T(b,a)})};
h.re=function(a,b){gh(this);var c="/users/"+encodeURIComponent(a.oldEmail)+"/email",d=Ag(a);d.fb._method="PUT";d.fb.email=a.newEmail;d.fb.password=a.password;this.uc(c,d,function(a){T(b,a)})};h.Ze=function(a,b){gh(this);var c="/users/"+encodeURIComponent(a.email)+"/password",d=Ag(a);d.fb._method="POST";this.uc(c,d,function(a){T(b,a)})};h.uc=function(a,b,c){jh(this,[Ug,Wg],a,b,c)};
function hh(a,b,c,d,e){jh(a,b,c,d,function(b,c){!b&&c&&c.token&&c.uid?dh(a,c.token,c,d.qd,function(a,b){a?T(e,a):T(e,null,b)}):T(e,b||Sg("UNKNOWN_ERROR"))})}
function jh(a,b,c,d,e){b=Na(b,function(a){return"function"===typeof a.isAvailable&&a.isAvailable()});0===b.length?setTimeout(function(){T(e,Sg("TRANSPORT_UNAVAILABLE"))},0):(b=new (b.shift())(d.he),d=Gb(d.fb),d.v="js-"+Eb,d.transport=b.Fc(),d.suppress_status_codes=!0,a=Mg()+"/"+a.G.lc+c,b.open(a,d,function(a,b){if(a)T(e,a);else if(b&&b.error){var c=Error(b.error.message);c.code=b.error.code;c.details=b.error.details;T(e,c)}else T(e,null,b)}))}
function ah(a,b){var c=null!==a.qb||null!==b;a.qb=b;c&&a.ie("auth_status",b);a.Pe(null!==b)}h.Ee=function(a){O("auth_status"===a,'initial event must be of type "auth_status"');return this.We?null:[this.qb]};function gh(a){var b=a.G;if("firebaseio.com"!==b.domain&&"firebaseio-demo.com"!==b.domain&&"auth.firebase.com"===xg)throw Error("This custom Firebase server ('"+a.G.domain+"') does not support delegated login.");};var gd="websocket",hd="long_polling";function kh(a){this.nc=a;this.Qd=[];this.Wb=0;this.te=-1;this.Jb=null}function lh(a,b,c){a.te=b;a.Jb=c;a.te<a.Wb&&(a.Jb(),a.Jb=null)}function mh(a,b,c){for(a.Qd[b]=c;a.Qd[a.Wb];){var d=a.Qd[a.Wb];delete a.Qd[a.Wb];for(var e=0;e<d.length;++e)if(d[e]){var f=a;gc(function(){f.nc(d[e])})}if(a.Wb===a.te){a.Jb&&(clearTimeout(a.Jb),a.Jb(),a.Jb=null);break}a.Wb++}};function nh(a,b,c,d){this.ue=a;this.f=pd(a);this.rb=this.sb=0;this.Xa=uc(b);this.Xf=c;this.Kc=!1;this.Fb=d;this.ld=function(a){return fd(b,hd,a)}}var oh,ph;
nh.prototype.open=function(a,b){this.mf=0;this.na=b;this.Ef=new kh(a);this.Db=!1;var c=this;this.ub=setTimeout(function(){c.f("Timed out trying to connect.");c.bb();c.ub=null},Math.floor(3E4));ud(function(){if(!c.Db){c.Wa=new qh(function(a,b,d,k,m){rh(c,arguments);if(c.Wa)if(c.ub&&(clearTimeout(c.ub),c.ub=null),c.Kc=!0,"start"==a)c.id=b,c.Mf=d;else if("close"===a)b?(c.Wa.$d=!1,lh(c.Ef,b,function(){c.bb()})):c.bb();else throw Error("Unrecognized command received: "+a);},function(a,b){rh(c,arguments);
mh(c.Ef,a,b)},function(){c.bb()},c.ld);var a={start:"t"};a.ser=Math.floor(1E8*Math.random());c.Wa.ke&&(a.cb=c.Wa.ke);a.v="5";c.Xf&&(a.s=c.Xf);c.Fb&&(a.ls=c.Fb);"undefined"!==typeof location&&location.href&&-1!==location.href.indexOf("firebaseio.com")&&(a.r="f");a=c.ld(a);c.f("Connecting via long-poll to "+a);sh(c.Wa,a,function(){})}})};
nh.prototype.start=function(){var a=this.Wa,b=this.Mf;a.Gg=this.id;a.Hg=b;for(a.oe=!0;th(a););a=this.id;b=this.Mf;this.kc=document.createElement("iframe");var c={dframe:"t"};c.id=a;c.pw=b;this.kc.src=this.ld(c);this.kc.style.display="none";document.body.appendChild(this.kc)};
nh.isAvailable=function(){return oh||!ph&&"undefined"!==typeof document&&null!=document.createElement&&!("object"===typeof window&&window.chrome&&window.chrome.extension&&!/^chrome/.test(window.location.href))&&!("object"===typeof Windows&&"object"===typeof Windows.kh)&&!0};h=nh.prototype;h.Hd=function(){};h.fd=function(){this.Db=!0;this.Wa&&(this.Wa.close(),this.Wa=null);this.kc&&(document.body.removeChild(this.kc),this.kc=null);this.ub&&(clearTimeout(this.ub),this.ub=null)};
h.bb=function(){this.Db||(this.f("Longpoll is closing itself"),this.fd(),this.na&&(this.na(this.Kc),this.na=null))};h.close=function(){this.Db||(this.f("Longpoll is being closed."),this.fd())};h.send=function(a){a=G(a);this.sb+=a.length;rc(this.Xa,"bytes_sent",a.length);a=Ob(a);a=nb(a,!0);a=yd(a,1840);for(var b=0;b<a.length;b++){var c=this.Wa;c.cd.push({Yg:this.mf,hh:a.length,of:a[b]});c.oe&&th(c);this.mf++}};function rh(a,b){var c=G(b).length;a.rb+=c;rc(a.Xa,"bytes_received",c)}
function qh(a,b,c,d){this.ld=d;this.lb=c;this.Te=new ug;this.cd=[];this.we=Math.floor(1E8*Math.random());this.$d=!0;this.ke=id();window["pLPCommand"+this.ke]=a;window["pRTLPCB"+this.ke]=b;a=document.createElement("iframe");a.style.display="none";if(document.body){document.body.appendChild(a);try{a.contentWindow.document||fc("No IE domain setting required")}catch(e){a.src="javascript:void((function(){document.open();document.domain='"+document.domain+"';document.close();})())"}}else throw"Document body has not initialized. Wait to initialize Firebase until after the document is ready.";
a.contentDocument?a.jb=a.contentDocument:a.contentWindow?a.jb=a.contentWindow.document:a.document&&(a.jb=a.document);this.Ga=a;a="";this.Ga.src&&"javascript:"===this.Ga.src.substr(0,11)&&(a='<script>document.domain="'+document.domain+'";\x3c/script>');a="<html><body>"+a+"</body></html>";try{this.Ga.jb.open(),this.Ga.jb.write(a),this.Ga.jb.close()}catch(f){fc("frame writing exception"),f.stack&&fc(f.stack),fc(f)}}
qh.prototype.close=function(){this.oe=!1;if(this.Ga){this.Ga.jb.body.innerHTML="";var a=this;setTimeout(function(){null!==a.Ga&&(document.body.removeChild(a.Ga),a.Ga=null)},Math.floor(0))}var b=this.lb;b&&(this.lb=null,b())};
function th(a){if(a.oe&&a.$d&&a.Te.count()<(0<a.cd.length?2:1)){a.we++;var b={};b.id=a.Gg;b.pw=a.Hg;b.ser=a.we;for(var b=a.ld(b),c="",d=0;0<a.cd.length;)if(1870>=a.cd[0].of.length+30+c.length){var e=a.cd.shift(),c=c+"&seg"+d+"="+e.Yg+"&ts"+d+"="+e.hh+"&d"+d+"="+e.of;d++}else break;uh(a,b+c,a.we);return!0}return!1}function uh(a,b,c){function d(){a.Te.remove(c);th(a)}a.Te.add(c,1);var e=setTimeout(d,Math.floor(25E3));sh(a,b,function(){clearTimeout(e);d()})}
function sh(a,b,c){setTimeout(function(){try{if(a.$d){var d=a.Ga.jb.createElement("script");d.type="text/javascript";d.async=!0;d.src=b;d.onload=d.onreadystatechange=function(){var a=d.readyState;a&&"loaded"!==a&&"complete"!==a||(d.onload=d.onreadystatechange=null,d.parentNode&&d.parentNode.removeChild(d),c())};d.onerror=function(){fc("Long-poll script failed to load: "+b);a.$d=!1;a.close()};a.Ga.jb.body.appendChild(d)}}catch(e){}},Math.floor(1))};var vh=null;"undefined"!==typeof MozWebSocket?vh=MozWebSocket:"undefined"!==typeof WebSocket&&(vh=WebSocket);function wh(a,b,c,d){this.ue=a;this.f=pd(this.ue);this.frames=this.Nc=null;this.rb=this.sb=this.ff=0;this.Xa=uc(b);a={v:"5"};"undefined"!==typeof location&&location.href&&-1!==location.href.indexOf("firebaseio.com")&&(a.r="f");c&&(a.s=c);d&&(a.ls=d);this.jf=fd(b,gd,a)}var xh;
wh.prototype.open=function(a,b){this.lb=b;this.Lg=a;this.f("Websocket connecting to "+this.jf);this.Kc=!1;bd.set("previous_websocket_failure",!0);try{this.La=new vh(this.jf)}catch(c){this.f("Error instantiating WebSocket.");var d=c.message||c.data;d&&this.f(d);this.bb();return}var e=this;this.La.onopen=function(){e.f("Websocket connected.");e.Kc=!0};this.La.onclose=function(){e.f("Websocket connection was disconnected.");e.La=null;e.bb()};this.La.onmessage=function(a){if(null!==e.La)if(a=a.data,e.rb+=
a.length,rc(e.Xa,"bytes_received",a.length),yh(e),null!==e.frames)zh(e,a);else{a:{O(null===e.frames,"We already have a frame buffer");if(6>=a.length){var b=Number(a);if(!isNaN(b)){e.ff=b;e.frames=[];a=null;break a}}e.ff=1;e.frames=[]}null!==a&&zh(e,a)}};this.La.onerror=function(a){e.f("WebSocket error.  Closing connection.");(a=a.message||a.data)&&e.f(a);e.bb()}};wh.prototype.start=function(){};
wh.isAvailable=function(){var a=!1;if("undefined"!==typeof navigator&&navigator.userAgent){var b=navigator.userAgent.match(/Android ([0-9]{0,}\.[0-9]{0,})/);b&&1<b.length&&4.4>parseFloat(b[1])&&(a=!0)}return!a&&null!==vh&&!xh};wh.responsesRequiredToBeHealthy=2;wh.healthyTimeout=3E4;h=wh.prototype;h.Hd=function(){bd.remove("previous_websocket_failure")};function zh(a,b){a.frames.push(b);if(a.frames.length==a.ff){var c=a.frames.join("");a.frames=null;c=Rb(c);a.Lg(c)}}
h.send=function(a){yh(this);a=G(a);this.sb+=a.length;rc(this.Xa,"bytes_sent",a.length);a=yd(a,16384);1<a.length&&Ah(this,String(a.length));for(var b=0;b<a.length;b++)Ah(this,a[b])};h.fd=function(){this.Db=!0;this.Nc&&(clearInterval(this.Nc),this.Nc=null);this.La&&(this.La.close(),this.La=null)};h.bb=function(){this.Db||(this.f("WebSocket is closing itself"),this.fd(),this.lb&&(this.lb(this.Kc),this.lb=null))};h.close=function(){this.Db||(this.f("WebSocket is being closed"),this.fd())};
function yh(a){clearInterval(a.Nc);a.Nc=setInterval(function(){a.La&&Ah(a,"0");yh(a)},Math.floor(45E3))}function Ah(a,b){try{a.La.send(b)}catch(c){a.f("Exception thrown from WebSocket.send():",c.message||c.data,"Closing connection."),setTimeout(u(a.bb,a),0)}};function Bh(a){Ch(this,a)}var Dh=[nh,wh];function Ch(a,b){var c=wh&&wh.isAvailable(),d=c&&!(bd.Af||!0===bd.get("previous_websocket_failure"));b.jh&&(c||S("wss:// URL used, but browser isn't known to support websockets.  Trying anyway."),d=!0);if(d)a.jd=[wh];else{var e=a.jd=[];zd(Dh,function(a,b){b&&b.isAvailable()&&e.push(b)})}}function Eh(a){if(0<a.jd.length)return a.jd[0];throw Error("No transports available");};function Fh(a,b,c,d,e,f,g){this.id=a;this.f=pd("c:"+this.id+":");this.nc=c;this.Zc=d;this.na=e;this.Re=f;this.G=b;this.Pd=[];this.kf=0;this.Wf=new Bh(b);this.N=0;this.Fb=g;this.f("Connection created");Gh(this)}
function Gh(a){var b=Eh(a.Wf);a.K=new b("c:"+a.id+":"+a.kf++,a.G,void 0,a.Fb);a.Ve=b.responsesRequiredToBeHealthy||0;var c=Hh(a,a.K),d=Ih(a,a.K);a.kd=a.K;a.ed=a.K;a.F=null;a.Eb=!1;setTimeout(function(){a.K&&a.K.open(c,d)},Math.floor(0));b=b.healthyTimeout||0;0<b&&(a.Bd=setTimeout(function(){a.Bd=null;a.Eb||(a.K&&102400<a.K.rb?(a.f("Connection exceeded healthy timeout but has received "+a.K.rb+" bytes.  Marking connection healthy."),a.Eb=!0,a.K.Hd()):a.K&&10240<a.K.sb?a.f("Connection exceeded healthy timeout but has sent "+
a.K.sb+" bytes.  Leaving connection alive."):(a.f("Closing unhealthy connection after timeout."),a.close()))},Math.floor(b)))}function Ih(a,b){return function(c){b===a.K?(a.K=null,c||0!==a.N?1===a.N&&a.f("Realtime connection lost."):(a.f("Realtime connection failed."),"s-"===a.G.ab.substr(0,2)&&(bd.remove("host:"+a.G.host),a.G.ab=a.G.host)),a.close()):b===a.F?(a.f("Secondary connection lost."),c=a.F,a.F=null,a.kd!==c&&a.ed!==c||a.close()):a.f("closing an old connection")}}
function Hh(a,b){return function(c){if(2!=a.N)if(b===a.ed){var d=wd("t",c);c=wd("d",c);if("c"==d){if(d=wd("t",c),"d"in c)if(c=c.d,"h"===d){var d=c.ts,e=c.v,f=c.h;a.Uf=c.s;ed(a.G,f);0==a.N&&(a.K.start(),Jh(a,a.K,d),"5"!==e&&S("Protocol version mismatch detected"),c=a.Wf,(c=1<c.jd.length?c.jd[1]:null)&&Kh(a,c))}else if("n"===d){a.f("recvd end transmission on primary");a.ed=a.F;for(c=0;c<a.Pd.length;++c)a.Ld(a.Pd[c]);a.Pd=[];Lh(a)}else"s"===d?(a.f("Connection shutdown command received. Shutting down..."),
a.Re&&(a.Re(c),a.Re=null),a.na=null,a.close()):"r"===d?(a.f("Reset packet received.  New host: "+c),ed(a.G,c),1===a.N?a.close():(Mh(a),Gh(a))):"e"===d?qd("Server Error: "+c):"o"===d?(a.f("got pong on primary."),Nh(a),Oh(a)):qd("Unknown control packet command: "+d)}else"d"==d&&a.Ld(c)}else if(b===a.F)if(d=wd("t",c),c=wd("d",c),"c"==d)"t"in c&&(c=c.t,"a"===c?Ph(a):"r"===c?(a.f("Got a reset on secondary, closing it"),a.F.close(),a.kd!==a.F&&a.ed!==a.F||a.close()):"o"===c&&(a.f("got pong on secondary."),
a.Tf--,Ph(a)));else if("d"==d)a.Pd.push(c);else throw Error("Unknown protocol layer: "+d);else a.f("message on old connection")}}Fh.prototype.Ia=function(a){Qh(this,{t:"d",d:a})};function Lh(a){a.kd===a.F&&a.ed===a.F&&(a.f("cleaning up and promoting a connection: "+a.F.ue),a.K=a.F,a.F=null)}
function Ph(a){0>=a.Tf?(a.f("Secondary connection is healthy."),a.Eb=!0,a.F.Hd(),a.F.start(),a.f("sending client ack on secondary"),a.F.send({t:"c",d:{t:"a",d:{}}}),a.f("Ending transmission on primary"),a.K.send({t:"c",d:{t:"n",d:{}}}),a.kd=a.F,Lh(a)):(a.f("sending ping on secondary."),a.F.send({t:"c",d:{t:"p",d:{}}}))}Fh.prototype.Ld=function(a){Nh(this);this.nc(a)};function Nh(a){a.Eb||(a.Ve--,0>=a.Ve&&(a.f("Primary connection is healthy."),a.Eb=!0,a.K.Hd()))}
function Kh(a,b){a.F=new b("c:"+a.id+":"+a.kf++,a.G,a.Uf);a.Tf=b.responsesRequiredToBeHealthy||0;a.F.open(Hh(a,a.F),Ih(a,a.F));setTimeout(function(){a.F&&(a.f("Timed out trying to upgrade."),a.F.close())},Math.floor(6E4))}function Jh(a,b,c){a.f("Realtime connection established.");a.K=b;a.N=1;a.Zc&&(a.Zc(c,a.Uf),a.Zc=null);0===a.Ve?(a.f("Primary connection is healthy."),a.Eb=!0):setTimeout(function(){Oh(a)},Math.floor(5E3))}
function Oh(a){a.Eb||1!==a.N||(a.f("sending ping on primary."),Qh(a,{t:"c",d:{t:"p",d:{}}}))}function Qh(a,b){if(1!==a.N)throw"Connection is not connected";a.kd.send(b)}Fh.prototype.close=function(){2!==this.N&&(this.f("Closing realtime connection."),this.N=2,Mh(this),this.na&&(this.na(),this.na=null))};function Mh(a){a.f("Shutting down all connections");a.K&&(a.K.close(),a.K=null);a.F&&(a.F.close(),a.F=null);a.Bd&&(clearTimeout(a.Bd),a.Bd=null)};function Rh(a,b,c,d){this.id=Sh++;this.f=pd("p:"+this.id+":");this.Bf=this.Ie=!1;this.ba={};this.sa=[];this.ad=0;this.Yc=[];this.qa=!1;this.eb=1E3;this.Id=3E5;this.Kb=b;this.Xc=c;this.Se=d;this.G=a;this.wb=this.Ca=this.Ma=this.Fb=this.$e=null;this.Sb=!1;this.Wd={};this.Xg=0;this.rf=!0;this.Oc=this.Ke=null;Th(this,0);kf.yb().Ib("visible",this.Og,this);-1===a.host.indexOf("fblocal")&&jf.yb().Ib("online",this.Mg,this)}var Sh=0,Uh=0;h=Rh.prototype;
h.Ia=function(a,b,c){var d=++this.Xg;a={r:d,a:a,b:b};this.f(G(a));O(this.qa,"sendRequest call when we're not connected not allowed.");this.Ma.Ia(a);c&&(this.Wd[d]=c)};h.Cf=function(a,b,c,d){var e=a.wa(),f=a.path.toString();this.f("Listen called for "+f+" "+e);this.ba[f]=this.ba[f]||{};O(Ie(a.n)||!He(a.n),"listen() called for non-default but complete query");O(!this.ba[f][e],"listen() called twice for same path/queryId.");a={I:d,Ad:b,Ug:a,tag:c};this.ba[f][e]=a;this.qa&&Vh(this,a)};
function Vh(a,b){var c=b.Ug,d=c.path.toString(),e=c.wa();a.f("Listen on "+d+" for "+e);var f={p:d};b.tag&&(f.q=Ge(c.n),f.t=b.tag);f.h=b.Ad();a.Ia("q",f,function(f){var k=f.d,m=f.s;if(k&&"object"===typeof k&&y(k,"w")){var l=z(k,"w");da(l)&&0<=La(l,"no_index")&&S("Using an unspecified index. Consider adding "+('".indexOn": "'+c.n.g.toString()+'"')+" at "+c.path.toString()+" to your security rules for better performance")}(a.ba[d]&&a.ba[d][e])===b&&(a.f("listen response",f),"ok"!==m&&Wh(a,d,e),b.I&&
b.I(m,k))})}h.O=function(a,b,c){this.Ca={rg:a,sf:!1,Dc:b,od:c};this.f("Authenticating using credential: "+a);Xh(this);(b=40==a.length)||(a=Cd(a).Ec,b="object"===typeof a&&!0===z(a,"admin"));b&&(this.f("Admin auth credential detected.  Reducing max reconnect time."),this.Id=3E4)};h.je=function(a){this.Ca=null;this.qa&&this.Ia("unauth",{},function(b){a(b.s,b.d)})};
function Xh(a){var b=a.Ca;a.qa&&b&&a.Ia("auth",{cred:b.rg},function(c){var d=c.s;c=c.d||"error";"ok"!==d&&a.Ca===b&&(a.Ca=null);b.sf?"ok"!==d&&b.od&&b.od(d,c):(b.sf=!0,b.Dc&&b.Dc(d,c))})}h.$f=function(a,b){var c=a.path.toString(),d=a.wa();this.f("Unlisten called for "+c+" "+d);O(Ie(a.n)||!He(a.n),"unlisten() called for non-default but complete query");if(Wh(this,c,d)&&this.qa){var e=Ge(a.n);this.f("Unlisten on "+c+" for "+d);c={p:c};b&&(c.q=e,c.t=b);this.Ia("n",c)}};
h.Qe=function(a,b,c){this.qa?Yh(this,"o",a,b,c):this.Yc.push({bd:a,action:"o",data:b,I:c})};h.Gf=function(a,b,c){this.qa?Yh(this,"om",a,b,c):this.Yc.push({bd:a,action:"om",data:b,I:c})};h.Md=function(a,b){this.qa?Yh(this,"oc",a,null,b):this.Yc.push({bd:a,action:"oc",data:null,I:b})};function Yh(a,b,c,d,e){c={p:c,d:d};a.f("onDisconnect "+b,c);a.Ia(b,c,function(a){e&&setTimeout(function(){e(a.s,a.d)},Math.floor(0))})}h.put=function(a,b,c,d){Zh(this,"p",a,b,c,d)};
h.Df=function(a,b,c,d){Zh(this,"m",a,b,c,d)};function Zh(a,b,c,d,e,f){d={p:c,d:d};p(f)&&(d.h=f);a.sa.push({action:b,Pf:d,I:e});a.ad++;b=a.sa.length-1;a.qa?$h(a,b):a.f("Buffering put: "+c)}function $h(a,b){var c=a.sa[b].action,d=a.sa[b].Pf,e=a.sa[b].I;a.sa[b].Vg=a.qa;a.Ia(c,d,function(d){a.f(c+" response",d);delete a.sa[b];a.ad--;0===a.ad&&(a.sa=[]);e&&e(d.s,d.d)})}
h.Ye=function(a){this.qa&&(a={c:a},this.f("reportStats",a),this.Ia("s",a,function(a){"ok"!==a.s&&this.f("reportStats","Error sending stats: "+a.d)}))};
h.Ld=function(a){if("r"in a){this.f("from server: "+G(a));var b=a.r,c=this.Wd[b];c&&(delete this.Wd[b],c(a.b))}else{if("error"in a)throw"A server-side error has occurred: "+a.error;"a"in a&&(b=a.a,c=a.b,this.f("handleServerMessage",b,c),"d"===b?this.Kb(c.p,c.d,!1,c.t):"m"===b?this.Kb(c.p,c.d,!0,c.t):"c"===b?ai(this,c.p,c.q):"ac"===b?(a=c.s,b=c.d,c=this.Ca,this.Ca=null,c&&c.od&&c.od(a,b)):"sd"===b?this.$e?this.$e(c):"msg"in c&&"undefined"!==typeof console&&console.log("FIREBASE: "+c.msg.replace("\n",
"\nFIREBASE: ")):qd("Unrecognized action received from server: "+G(b)+"\nAre you using the latest client?"))}};h.Zc=function(a,b){this.f("connection ready");this.qa=!0;this.Oc=(new Date).getTime();this.Se({serverTimeOffset:a-(new Date).getTime()});this.Fb=b;if(this.rf){var c={};c["sdk.js."+Eb.replace(/\./g,"-")]=1;Dg()?c["framework.cordova"]=1:"object"===typeof navigator&&"ReactNative"===navigator.product&&(c["framework.reactnative"]=1);this.Ye(c)}bi(this);this.rf=!1;this.Xc(!0)};
function Th(a,b){O(!a.Ma,"Scheduling a connect when we're already connected/ing?");a.wb&&clearTimeout(a.wb);a.wb=setTimeout(function(){a.wb=null;ci(a)},Math.floor(b))}h.Og=function(a){a&&!this.Sb&&this.eb===this.Id&&(this.f("Window became visible.  Reducing delay."),this.eb=1E3,this.Ma||Th(this,0));this.Sb=a};h.Mg=function(a){a?(this.f("Browser went online."),this.eb=1E3,this.Ma||Th(this,0)):(this.f("Browser went offline.  Killing connection."),this.Ma&&this.Ma.close())};
h.If=function(){this.f("data client disconnected");this.qa=!1;this.Ma=null;for(var a=0;a<this.sa.length;a++){var b=this.sa[a];b&&"h"in b.Pf&&b.Vg&&(b.I&&b.I("disconnect"),delete this.sa[a],this.ad--)}0===this.ad&&(this.sa=[]);this.Wd={};di(this)&&(this.Sb?this.Oc&&(3E4<(new Date).getTime()-this.Oc&&(this.eb=1E3),this.Oc=null):(this.f("Window isn't visible.  Delaying reconnect."),this.eb=this.Id,this.Ke=(new Date).getTime()),a=Math.max(0,this.eb-((new Date).getTime()-this.Ke)),a*=Math.random(),this.f("Trying to reconnect in "+
a+"ms"),Th(this,a),this.eb=Math.min(this.Id,1.3*this.eb));this.Xc(!1)};function ci(a){if(di(a)){a.f("Making a connection attempt");a.Ke=(new Date).getTime();a.Oc=null;var b=u(a.Ld,a),c=u(a.Zc,a),d=u(a.If,a),e=a.id+":"+Uh++;a.Ma=new Fh(e,a.G,b,c,d,function(b){S(b+" ("+a.G.toString()+")");a.Bf=!0},a.Fb)}}h.Cb=function(){this.Ie=!0;this.Ma?this.Ma.close():(this.wb&&(clearTimeout(this.wb),this.wb=null),this.qa&&this.If())};h.vc=function(){this.Ie=!1;this.eb=1E3;this.Ma||Th(this,0)};
function ai(a,b,c){c=c?Oa(c,function(a){return xd(a)}).join("$"):"default";(a=Wh(a,b,c))&&a.I&&a.I("permission_denied")}function Wh(a,b,c){b=(new P(b)).toString();var d;p(a.ba[b])?(d=a.ba[b][c],delete a.ba[b][c],0===oa(a.ba[b])&&delete a.ba[b]):d=void 0;return d}function bi(a){Xh(a);v(a.ba,function(b){v(b,function(b){Vh(a,b)})});for(var b=0;b<a.sa.length;b++)a.sa[b]&&$h(a,b);for(;a.Yc.length;)b=a.Yc.shift(),Yh(a,b.action,b.bd,b.data,b.I)}function di(a){var b;b=jf.yb().oc;return!a.Bf&&!a.Ie&&b};var U={zg:function(){oh=xh=!0}};U.forceLongPolling=U.zg;U.Ag=function(){ph=!0};U.forceWebSockets=U.Ag;U.Eg=function(){return wh.isAvailable()};U.isWebSocketsAvailable=U.Eg;U.ah=function(a,b){a.k.Va.$e=b};U.setSecurityDebugCallback=U.ah;U.bf=function(a,b){a.k.bf(b)};U.stats=U.bf;U.cf=function(a,b){a.k.cf(b)};U.statsIncrementCounter=U.cf;U.ud=function(a){return a.k.ud};U.dataUpdateCount=U.ud;U.Dg=function(a,b){a.k.He=b};U.interceptServerData=U.Dg;U.Kg=function(a){new Og(a)};U.onPopupOpen=U.Kg;
U.Zg=function(a){xg=a};U.setAuthenticationServer=U.Zg;function ei(a,b){this.committed=a;this.snapshot=b};function V(a,b){this.dd=a;this.ta=b}V.prototype.cancel=function(a){D("Firebase.onDisconnect().cancel",0,1,arguments.length);F("Firebase.onDisconnect().cancel",1,a,!0);var b=new B;this.dd.Md(this.ta,C(b,a));return b.D};V.prototype.cancel=V.prototype.cancel;V.prototype.remove=function(a){D("Firebase.onDisconnect().remove",0,1,arguments.length);og("Firebase.onDisconnect().remove",this.ta);F("Firebase.onDisconnect().remove",1,a,!0);var b=new B;fi(this.dd,this.ta,null,C(b,a));return b.D};
V.prototype.remove=V.prototype.remove;V.prototype.set=function(a,b){D("Firebase.onDisconnect().set",1,2,arguments.length);og("Firebase.onDisconnect().set",this.ta);gg("Firebase.onDisconnect().set",a,this.ta,!1);F("Firebase.onDisconnect().set",2,b,!0);var c=new B;fi(this.dd,this.ta,a,C(c,b));return c.D};V.prototype.set=V.prototype.set;
V.prototype.Ob=function(a,b,c){D("Firebase.onDisconnect().setWithPriority",2,3,arguments.length);og("Firebase.onDisconnect().setWithPriority",this.ta);gg("Firebase.onDisconnect().setWithPriority",a,this.ta,!1);kg("Firebase.onDisconnect().setWithPriority",2,b);F("Firebase.onDisconnect().setWithPriority",3,c,!0);var d=new B;gi(this.dd,this.ta,a,b,C(d,c));return d.D};V.prototype.setWithPriority=V.prototype.Ob;
V.prototype.update=function(a,b){D("Firebase.onDisconnect().update",1,2,arguments.length);og("Firebase.onDisconnect().update",this.ta);if(da(a)){for(var c={},d=0;d<a.length;++d)c[""+d]=a[d];a=c;S("Passing an Array to Firebase.onDisconnect().update() is deprecated. Use set() if you want to overwrite the existing data, or an Object with integer keys if you really do want to only update some of the children.")}jg("Firebase.onDisconnect().update",a,this.ta);F("Firebase.onDisconnect().update",2,b,!0);
c=new B;hi(this.dd,this.ta,a,C(c,b));return c.D};V.prototype.update=V.prototype.update;function W(a,b,c){this.A=a;this.Y=b;this.g=c}W.prototype.J=function(){D("Firebase.DataSnapshot.val",0,0,arguments.length);return this.A.J()};W.prototype.val=W.prototype.J;W.prototype.qf=function(){D("Firebase.DataSnapshot.exportVal",0,0,arguments.length);return this.A.J(!0)};W.prototype.exportVal=W.prototype.qf;W.prototype.xg=function(){D("Firebase.DataSnapshot.exists",0,0,arguments.length);return!this.A.e()};W.prototype.exists=W.prototype.xg;
W.prototype.o=function(a){D("Firebase.DataSnapshot.child",0,1,arguments.length);fa(a)&&(a=String(a));ng("Firebase.DataSnapshot.child",a);var b=new P(a),c=this.Y.o(b);return new W(this.A.S(b),c,R)};W.prototype.child=W.prototype.o;W.prototype.Fa=function(a){D("Firebase.DataSnapshot.hasChild",1,1,arguments.length);ng("Firebase.DataSnapshot.hasChild",a);var b=new P(a);return!this.A.S(b).e()};W.prototype.hasChild=W.prototype.Fa;
W.prototype.C=function(){D("Firebase.DataSnapshot.getPriority",0,0,arguments.length);return this.A.C().J()};W.prototype.getPriority=W.prototype.C;W.prototype.forEach=function(a){D("Firebase.DataSnapshot.forEach",1,1,arguments.length);F("Firebase.DataSnapshot.forEach",1,a,!1);if(this.A.L())return!1;var b=this;return!!this.A.R(this.g,function(c,d){return a(new W(d,b.Y.o(c),R))})};W.prototype.forEach=W.prototype.forEach;
W.prototype.zd=function(){D("Firebase.DataSnapshot.hasChildren",0,0,arguments.length);return this.A.L()?!1:!this.A.e()};W.prototype.hasChildren=W.prototype.zd;W.prototype.name=function(){S("Firebase.DataSnapshot.name() being deprecated. Please use Firebase.DataSnapshot.key() instead.");D("Firebase.DataSnapshot.name",0,0,arguments.length);return this.key()};W.prototype.name=W.prototype.name;W.prototype.key=function(){D("Firebase.DataSnapshot.key",0,0,arguments.length);return this.Y.key()};
W.prototype.key=W.prototype.key;W.prototype.Hb=function(){D("Firebase.DataSnapshot.numChildren",0,0,arguments.length);return this.A.Hb()};W.prototype.numChildren=W.prototype.Hb;W.prototype.Mb=function(){D("Firebase.DataSnapshot.ref",0,0,arguments.length);return this.Y};W.prototype.ref=W.prototype.Mb;function ii(a,b,c){this.Vb=a;this.tb=b;this.vb=c||null}h=ii.prototype;h.Qf=function(a){return"value"===a};h.createEvent=function(a,b){var c=b.n.g;return new jc("value",this,new W(a.Na,b.Mb(),c))};h.Zb=function(a){var b=this.vb;if("cancel"===a.De()){O(this.tb,"Raising a cancel event on a listener with no cancel callback");var c=this.tb;return function(){c.call(b,a.error)}}var d=this.Vb;return function(){d.call(b,a.be)}};h.lf=function(a,b){return this.tb?new kc(this,a,b):null};
h.matches=function(a){return a instanceof ii?a.Vb&&this.Vb?a.Vb===this.Vb&&a.vb===this.vb:!0:!1};h.yf=function(){return null!==this.Vb};function ji(a,b,c){this.ja=a;this.tb=b;this.vb=c}h=ji.prototype;h.Qf=function(a){a="children_added"===a?"child_added":a;return("children_removed"===a?"child_removed":a)in this.ja};h.lf=function(a,b){return this.tb?new kc(this,a,b):null};
h.createEvent=function(a,b){O(null!=a.Za,"Child events should have a childName.");var c=b.Mb().o(a.Za);return new jc(a.type,this,new W(a.Na,c,b.n.g),a.Td)};h.Zb=function(a){var b=this.vb;if("cancel"===a.De()){O(this.tb,"Raising a cancel event on a listener with no cancel callback");var c=this.tb;return function(){c.call(b,a.error)}}var d=this.ja[a.wd];return function(){d.call(b,a.be,a.Td)}};
h.matches=function(a){if(a instanceof ji){if(!this.ja||!a.ja)return!0;if(this.vb===a.vb){var b=oa(a.ja);if(b===oa(this.ja)){if(1===b){var b=pa(a.ja),c=pa(this.ja);return c===b&&(!a.ja[b]||!this.ja[c]||a.ja[b]===this.ja[c])}return na(this.ja,function(b,c){return a.ja[c]===b})}}}return!1};h.yf=function(){return null!==this.ja};function ki(){this.za={}}h=ki.prototype;h.e=function(){return va(this.za)};h.gb=function(a,b,c){var d=a.source.Lb;if(null!==d)return d=z(this.za,d),O(null!=d,"SyncTree gave us an op for an invalid query."),d.gb(a,b,c);var e=[];v(this.za,function(d){e=e.concat(d.gb(a,b,c))});return e};h.Tb=function(a,b,c,d,e){var f=a.wa(),g=z(this.za,f);if(!g){var g=c.Aa(e?d:null),k=!1;g?k=!0:(g=d instanceof fe?c.Cc(d):H,k=!1);g=new Ye(a,new je(new Xb(g,k,!1),new Xb(d,e,!1)));this.za[f]=g}g.Tb(b);return af(g,b)};
h.nb=function(a,b,c){var d=a.wa(),e=[],f=[],g=null!=li(this);if("default"===d){var k=this;v(this.za,function(a,d){f=f.concat(a.nb(b,c));a.e()&&(delete k.za[d],He(a.Y.n)||e.push(a.Y))})}else{var m=z(this.za,d);m&&(f=f.concat(m.nb(b,c)),m.e()&&(delete this.za[d],He(m.Y.n)||e.push(m.Y)))}g&&null==li(this)&&e.push(new X(a.k,a.path));return{Wg:e,vg:f}};function mi(a){return Na(qa(a.za),function(a){return!He(a.Y.n)})}h.kb=function(a){var b=null;v(this.za,function(c){b=b||c.kb(a)});return b};
function ni(a,b){if(He(b.n))return li(a);var c=b.wa();return z(a.za,c)}function li(a){return ua(a.za,function(a){return He(a.Y.n)})||null};function oi(a){this.va=qe;this.mb=new Pf;this.df={};this.qc={};this.Qc=a}function pi(a,b,c,d,e){var f=a.mb,g=e;O(d>f.Pc,"Stacking an older write on top of newer ones");p(g)||(g=!0);f.pa.push({path:b,Ja:c,md:d,visible:g});g&&(f.V=Jf(f.V,b,c));f.Pc=d;return e?qi(a,new Ac(Ef,b,c)):[]}function ri(a,b,c,d){var e=a.mb;O(d>e.Pc,"Stacking an older merge on top of newer ones");e.pa.push({path:b,children:c,md:d,visible:!0});e.V=Kf(e.V,b,c);e.Pc=d;c=sf(c);return qi(a,new bf(Ef,b,c))}
function si(a,b,c){c=c||!1;var d=Qf(a.mb,b);if(a.mb.Ud(b)){var e=qe;null!=d.Ja?e=e.set(M,!0):Fb(d.children,function(a,b){e=e.set(new P(a),b)});return qi(a,new Df(d.path,e,c))}return[]}function ti(a,b,c){c=sf(c);return qi(a,new bf(Gf,b,c))}function ui(a,b,c,d){d=vi(a,d);if(null!=d){var e=wi(d);d=e.path;e=e.Lb;b=lf(d,b);c=new Ac(new Ff(!1,!0,e,!0),b,c);return xi(a,d,c)}return[]}
function yi(a,b,c,d){if(d=vi(a,d)){var e=wi(d);d=e.path;e=e.Lb;b=lf(d,b);c=sf(c);c=new bf(new Ff(!1,!0,e,!0),b,c);return xi(a,d,c)}return[]}
oi.prototype.Tb=function(a,b){var c=a.path,d=null,e=!1;zf(this.va,c,function(a,b){var f=lf(a,c);d=d||b.kb(f);e=e||null!=li(b)});var f=this.va.get(c);f?(e=e||null!=li(f),d=d||f.kb(M)):(f=new ki,this.va=this.va.set(c,f));var g;null!=d?g=!0:(g=!1,d=H,Cf(this.va.subtree(c),function(a,b){var c=b.kb(M);c&&(d=d.W(a,c))}));var k=null!=ni(f,a);if(!k&&!He(a.n)){var m=zi(a);O(!(m in this.qc),"View does not exist, but we have a tag");var l=Ai++;this.qc[m]=l;this.df["_"+l]=m}g=f.Tb(a,b,new Uf(c,this.mb),d,g);
k||e||(f=ni(f,a),g=g.concat(Bi(this,a,f)));return g};
oi.prototype.nb=function(a,b,c){var d=a.path,e=this.va.get(d),f=[];if(e&&("default"===a.wa()||null!=ni(e,a))){f=e.nb(a,b,c);e.e()&&(this.va=this.va.remove(d));e=f.Wg;f=f.vg;b=-1!==Sa(e,function(a){return He(a.n)});var g=xf(this.va,d,function(a,b){return null!=li(b)});if(b&&!g&&(d=this.va.subtree(d),!d.e()))for(var d=Ci(d),k=0;k<d.length;++k){var m=d[k],l=m.Y,m=Di(this,m);this.Qc.af(Ei(l),Fi(this,l),m.Ad,m.I)}if(!g&&0<e.length&&!c)if(b)this.Qc.de(Ei(a),null);else{var t=this;Ma(e,function(a){a.wa();
var b=t.qc[zi(a)];t.Qc.de(Ei(a),b)})}Gi(this,e)}return f};oi.prototype.Aa=function(a,b){var c=this.mb,d=xf(this.va,a,function(b,c){var d=lf(b,a);if(d=c.kb(d))return d});return c.Aa(a,d,b,!0)};function Ci(a){return vf(a,function(a,c,d){if(c&&null!=li(c))return[li(c)];var e=[];c&&(e=mi(c));v(d,function(a){e=e.concat(a)});return e})}function Gi(a,b){for(var c=0;c<b.length;++c){var d=b[c];if(!He(d.n)){var d=zi(d),e=a.qc[d];delete a.qc[d];delete a.df["_"+e]}}}
function Ei(a){return He(a.n)&&!Ie(a.n)?a.Mb():a}function Bi(a,b,c){var d=b.path,e=Fi(a,b);c=Di(a,c);b=a.Qc.af(Ei(b),e,c.Ad,c.I);d=a.va.subtree(d);if(e)O(null==li(d.value),"If we're adding a query, it shouldn't be shadowed");else for(e=vf(d,function(a,b,c){if(!a.e()&&b&&null!=li(b))return[Ze(li(b))];var d=[];b&&(d=d.concat(Oa(mi(b),function(a){return a.Y})));v(c,function(a){d=d.concat(a)});return d}),d=0;d<e.length;++d)c=e[d],a.Qc.de(Ei(c),Fi(a,c));return b}
function Di(a,b){var c=b.Y,d=Fi(a,c);return{Ad:function(){return(b.w()||H).hash()},I:function(b){if("ok"===b){if(d){var f=c.path;if(b=vi(a,d)){var g=wi(b);b=g.path;g=g.Lb;f=lf(b,f);f=new Cc(new Ff(!1,!0,g,!0),f);b=xi(a,b,f)}else b=[]}else b=qi(a,new Cc(Gf,c.path));return b}f="Unknown Error";"too_big"===b?f="The data requested exceeds the maximum size that can be accessed with a single request.":"permission_denied"==b?f="Client doesn't have permission to access the desired data.":"unavailable"==b&&
(f="The service is unavailable");f=Error(b+" at "+c.path.toString()+": "+f);f.code=b.toUpperCase();return a.nb(c,null,f)}}}function zi(a){return a.path.toString()+"$"+a.wa()}function wi(a){var b=a.indexOf("$");O(-1!==b&&b<a.length-1,"Bad queryKey.");return{Lb:a.substr(b+1),path:new P(a.substr(0,b))}}function vi(a,b){var c=a.df,d="_"+b;return d in c?c[d]:void 0}function Fi(a,b){var c=zi(b);return z(a.qc,c)}var Ai=1;
function xi(a,b,c){var d=a.va.get(b);O(d,"Missing sync point for query tag that we're tracking");return d.gb(c,new Uf(b,a.mb),null)}function qi(a,b){return Hi(a,b,a.va,null,new Uf(M,a.mb))}function Hi(a,b,c,d,e){if(b.path.e())return Ii(a,b,c,d,e);var f=c.get(M);null==d&&null!=f&&(d=f.kb(M));var g=[],k=K(b.path),m=b.$c(k);if((c=c.children.get(k))&&m)var l=d?d.T(k):null,k=e.o(k),g=g.concat(Hi(a,m,c,l,k));f&&(g=g.concat(f.gb(b,e,d)));return g}
function Ii(a,b,c,d,e){var f=c.get(M);null==d&&null!=f&&(d=f.kb(M));var g=[];c.children.ka(function(c,f){var l=d?d.T(c):null,t=e.o(c),A=b.$c(c);A&&(g=g.concat(Ii(a,A,f,l,t)))});f&&(g=g.concat(f.gb(b,e,d)));return g};function Ji(a,b){this.G=a;this.Xa=uc(a);this.hd=null;this.fa=new Zb;this.Kd=1;this.Va=null;b||0<=("object"===typeof window&&window.navigator&&window.navigator.userAgent||"").search(/googlebot|google webmaster tools|bingbot|yahoo! slurp|baiduspider|yandexbot|duckduckbot/i)?(this.da=new cf(this.G,u(this.Kb,this)),setTimeout(u(this.Xc,this,!0),0)):this.da=this.Va=new Rh(this.G,u(this.Kb,this),u(this.Xc,this),u(this.Se,this));this.eh=vc(a,u(function(){return new pc(this.Xa,this.da)},this));this.yc=new Wf;
this.Ge=new Sb;var c=this;this.Fd=new oi({af:function(a,b,f,g){b=[];f=c.Ge.j(a.path);f.e()||(b=qi(c.Fd,new Ac(Gf,a.path,f)),setTimeout(function(){g("ok")},0));return b},de:aa});Ki(this,"connected",!1);this.na=new Vc;this.O=new Yg(a,u(this.da.O,this.da),u(this.da.je,this.da),u(this.Pe,this));this.ud=0;this.He=null;this.M=new oi({af:function(a,b,f,g){c.da.Cf(a,f,b,function(b,e){var f=g(b,e);dc(c.fa,a.path,f)});return[]},de:function(a,b){c.da.$f(a,b)}})}h=Ji.prototype;
h.toString=function(){return(this.G.ob?"https://":"http://")+this.G.host};h.name=function(){return this.G.lc};function Li(a){a=a.Ge.j(new P(".info/serverTimeOffset")).J()||0;return(new Date).getTime()+a}function Mi(a){a=a={timestamp:Li(a)};a.timestamp=a.timestamp||(new Date).getTime();return a}
h.Kb=function(a,b,c,d){this.ud++;var e=new P(a);b=this.He?this.He(a,b):b;a=[];d?c?(b=ma(b,function(a){return Q(a)}),a=yi(this.M,e,b,d)):(b=Q(b),a=ui(this.M,e,b,d)):c?(d=ma(b,function(a){return Q(a)}),a=ti(this.M,e,d)):(d=Q(b),a=qi(this.M,new Ac(Gf,e,d)));d=e;0<a.length&&(d=Ni(this,e));dc(this.fa,d,a)};h.Xc=function(a){Ki(this,"connected",a);!1===a&&Oi(this)};h.Se=function(a){var b=this;zd(a,function(a,d){Ki(b,d,a)})};h.Pe=function(a){Ki(this,"authenticated",a)};
function Ki(a,b,c){b=new P("/.info/"+b);c=Q(c);var d=a.Ge;d.Zd=d.Zd.H(b,c);c=qi(a.Fd,new Ac(Gf,b,c));dc(a.fa,b,c)}h.Ob=function(a,b,c,d){this.f("set",{path:a.toString(),value:b,nh:c});var e=Mi(this);b=Q(b,c);var e=Xc(b,e),f=this.Kd++,e=pi(this.M,a,e,f,!0);$b(this.fa,e);var g=this;this.da.put(a.toString(),b.J(!0),function(b,c){var e="ok"===b;e||S("set at "+a+" failed: "+b);e=si(g.M,f,!e);dc(g.fa,a,e);Pi(d,b,c)});e=Qi(this,a);Ni(this,e);dc(this.fa,e,[])};
h.update=function(a,b,c){this.f("update",{path:a.toString(),value:b});var d=!0,e=Mi(this),f={};v(b,function(a,b){d=!1;var c=Q(a);f[b]=Xc(c,e)});if(d)fc("update() called with empty data.  Don't do anything."),Pi(c,"ok");else{var g=this.Kd++,k=ri(this.M,a,f,g);$b(this.fa,k);var m=this;this.da.Df(a.toString(),b,function(b,d){var e="ok"===b;e||S("update at "+a+" failed: "+b);var e=si(m.M,g,!e),f=a;0<e.length&&(f=Ni(m,a));dc(m.fa,f,e);Pi(c,b,d)});b=Qi(this,a);Ni(this,b);dc(this.fa,a,[])}};
function Oi(a){a.f("onDisconnectEvents");var b=Mi(a),c=[];Wc(Uc(a.na,b),M,function(b,e){c=c.concat(qi(a.M,new Ac(Gf,b,e)));var f=Qi(a,b);Ni(a,f)});a.na=new Vc;dc(a.fa,M,c)}h.Md=function(a,b){var c=this;this.da.Md(a.toString(),function(d,e){"ok"===d&&wg(c.na,a);Pi(b,d,e)})};function fi(a,b,c,d){var e=Q(c);a.da.Qe(b.toString(),e.J(!0),function(c,g){"ok"===c&&a.na.rc(b,e);Pi(d,c,g)})}function gi(a,b,c,d,e){var f=Q(c,d);a.da.Qe(b.toString(),f.J(!0),function(c,d){"ok"===c&&a.na.rc(b,f);Pi(e,c,d)})}
function hi(a,b,c,d){var e=!0,f;for(f in c)e=!1;e?(fc("onDisconnect().update() called with empty data.  Don't do anything."),Pi(d,"ok")):a.da.Gf(b.toString(),c,function(e,f){if("ok"===e)for(var m in c){var l=Q(c[m]);a.na.rc(b.o(m),l)}Pi(d,e,f)})}function Ri(a,b,c){c=".info"===K(b.path)?a.Fd.Tb(b,c):a.M.Tb(b,c);bc(a.fa,b.path,c)}h.Cb=function(){this.Va&&this.Va.Cb()};h.vc=function(){this.Va&&this.Va.vc()};
h.bf=function(a){if("undefined"!==typeof console){a?(this.hd||(this.hd=new oc(this.Xa)),a=this.hd.get()):a=this.Xa.get();var b=Pa(ra(a),function(a,b){return Math.max(b.length,a)},0),c;for(c in a){for(var d=a[c],e=c.length;e<b+2;e++)c+=" ";console.log(c+d)}}};h.cf=function(a){rc(this.Xa,a);this.eh.Vf[a]=!0};h.f=function(a){var b="";this.Va&&(b=this.Va.id+":");fc(b,arguments)};
function Pi(a,b,c){a&&gc(function(){if("ok"==b)a(null);else{var d=(b||"error").toUpperCase(),e=d;c&&(e+=": "+c);e=Error(e);e.code=d;a(e)}})};function Si(a,b,c,d,e){function f(){}a.f("transaction on "+b);var g=new X(a,b);g.Ib("value",f);c={path:b,update:c,I:d,status:null,Lf:id(),gf:e,Sf:0,le:function(){g.mc("value",f)},ne:null,Da:null,rd:null,sd:null,td:null};d=a.M.Aa(b,void 0)||H;c.rd=d;d=c.update(d.J());if(p(d)){hg("transaction failed: Data returned ",d,c.path);c.status=1;e=Xf(a.yc,b);var k=e.Ea()||[];k.push(c);Yf(e,k);"object"===typeof d&&null!==d&&y(d,".priority")?(k=z(d,".priority"),O(fg(k),"Invalid priority returned by transaction. Priority must be a valid string, finite number, server value, or null.")):
k=(a.M.Aa(b)||H).C().J();e=Mi(a);d=Q(d,k);e=Xc(d,e);c.sd=d;c.td=e;c.Da=a.Kd++;c=pi(a.M,b,e,c.Da,c.gf);dc(a.fa,b,c);Ti(a)}else c.le(),c.sd=null,c.td=null,c.I&&(a=new W(c.rd,new X(a,c.path),R),c.I(null,!1,a))}function Ti(a,b){var c=b||a.yc;b||Ui(a,c);if(null!==c.Ea()){var d=Vi(a,c);O(0<d.length,"Sending zero length transaction queue");Qa(d,function(a){return 1===a.status})&&Wi(a,c.path(),d)}else c.zd()&&c.R(function(b){Ti(a,b)})}
function Wi(a,b,c){for(var d=Oa(c,function(a){return a.Da}),e=a.M.Aa(b,d)||H,d=e,e=e.hash(),f=0;f<c.length;f++){var g=c[f];O(1===g.status,"tryToSendTransactionQueue_: items in queue should all be run.");g.status=2;g.Sf++;var k=lf(b,g.path),d=d.H(k,g.sd)}d=d.J(!0);a.da.put(b.toString(),d,function(d){a.f("transaction put response",{path:b.toString(),status:d});var e=[];if("ok"===d){d=[];for(f=0;f<c.length;f++){c[f].status=3;e=e.concat(si(a.M,c[f].Da));if(c[f].I){var g=c[f].td,k=new X(a,c[f].path);d.push(u(c[f].I,
null,null,!0,new W(g,k,R)))}c[f].le()}Ui(a,Xf(a.yc,b));Ti(a);dc(a.fa,b,e);for(f=0;f<d.length;f++)gc(d[f])}else{if("datastale"===d)for(f=0;f<c.length;f++)c[f].status=4===c[f].status?5:1;else for(S("transaction at "+b.toString()+" failed: "+d),f=0;f<c.length;f++)c[f].status=5,c[f].ne=d;Ni(a,b)}},e)}function Ni(a,b){var c=Xi(a,b),d=c.path(),c=Vi(a,c);Yi(a,c,d);return d}
function Yi(a,b,c){if(0!==b.length){for(var d=[],e=[],f=Na(b,function(a){return 1===a.status}),f=Oa(f,function(a){return a.Da}),g=0;g<b.length;g++){var k=b[g],m=lf(c,k.path),l=!1,t;O(null!==m,"rerunTransactionsUnderNode_: relativePath should not be null.");if(5===k.status)l=!0,t=k.ne,e=e.concat(si(a.M,k.Da,!0));else if(1===k.status)if(25<=k.Sf)l=!0,t="maxretry",e=e.concat(si(a.M,k.Da,!0));else{var A=a.M.Aa(k.path,f)||H;k.rd=A;var I=b[g].update(A.J());p(I)?(hg("transaction failed: Data returned ",
I,k.path),m=Q(I),"object"===typeof I&&null!=I&&y(I,".priority")||(m=m.ia(A.C())),A=k.Da,I=Mi(a),I=Xc(m,I),k.sd=m,k.td=I,k.Da=a.Kd++,Ta(f,A),e=e.concat(pi(a.M,k.path,I,k.Da,k.gf)),e=e.concat(si(a.M,A,!0))):(l=!0,t="nodata",e=e.concat(si(a.M,k.Da,!0)))}dc(a.fa,c,e);e=[];l&&(b[g].status=3,setTimeout(b[g].le,Math.floor(0)),b[g].I&&("nodata"===t?(k=new X(a,b[g].path),d.push(u(b[g].I,null,null,!1,new W(b[g].rd,k,R)))):d.push(u(b[g].I,null,Error(t),!1,null))))}Ui(a,a.yc);for(g=0;g<d.length;g++)gc(d[g]);
Ti(a)}}function Xi(a,b){for(var c,d=a.yc;null!==(c=K(b))&&null===d.Ea();)d=Xf(d,c),b=N(b);return d}function Vi(a,b){var c=[];Zi(a,b,c);c.sort(function(a,b){return a.Lf-b.Lf});return c}function Zi(a,b,c){var d=b.Ea();if(null!==d)for(var e=0;e<d.length;e++)c.push(d[e]);b.R(function(b){Zi(a,b,c)})}function Ui(a,b){var c=b.Ea();if(c){for(var d=0,e=0;e<c.length;e++)3!==c[e].status&&(c[d]=c[e],d++);c.length=d;Yf(b,0<c.length?c:null)}b.R(function(b){Ui(a,b)})}
function Qi(a,b){var c=Xi(a,b).path(),d=Xf(a.yc,b);ag(d,function(b){$i(a,b)});$i(a,d);$f(d,function(b){$i(a,b)});return c}
function $i(a,b){var c=b.Ea();if(null!==c){for(var d=[],e=[],f=-1,g=0;g<c.length;g++)4!==c[g].status&&(2===c[g].status?(O(f===g-1,"All SENT items should be at beginning of queue."),f=g,c[g].status=4,c[g].ne="set"):(O(1===c[g].status,"Unexpected transaction status in abort"),c[g].le(),e=e.concat(si(a.M,c[g].Da,!0)),c[g].I&&d.push(u(c[g].I,null,Error("set"),!1,null))));-1===f?Yf(b,null):c.length=f+1;dc(a.fa,b.path(),e);for(g=0;g<d.length;g++)gc(d[g])}};function aj(){this.sc={};this.ag=!1}aj.prototype.Cb=function(){for(var a in this.sc)this.sc[a].Cb()};aj.prototype.vc=function(){for(var a in this.sc)this.sc[a].vc()};aj.prototype.ze=function(){this.ag=!0};ba(aj);aj.prototype.interrupt=aj.prototype.Cb;aj.prototype.resume=aj.prototype.vc;function Y(a,b,c,d){this.k=a;this.path=b;this.n=c;this.pc=d}
function bj(a){var b=null,c=null;a.oa&&(b=Od(a));a.ra&&(c=Rd(a));if(a.g===re){if(a.oa){if("[MIN_NAME]"!=Nd(a))throw Error("Query: When ordering by key, you may only pass one argument to startAt(), endAt(), or equalTo().");if("string"!==typeof b)throw Error("Query: When ordering by key, the argument passed to startAt(), endAt(),or equalTo() must be a string.");}if(a.ra){if("[MAX_NAME]"!=Pd(a))throw Error("Query: When ordering by key, you may only pass one argument to startAt(), endAt(), or equalTo().");if("string"!==
typeof c)throw Error("Query: When ordering by key, the argument passed to startAt(), endAt(),or equalTo() must be a string.");}}else if(a.g===R){if(null!=b&&!fg(b)||null!=c&&!fg(c))throw Error("Query: When ordering by priority, the first argument passed to startAt(), endAt(), or equalTo() must be a valid priority value (null, a number, or a string).");}else if(O(a.g instanceof ve||a.g===Be,"unknown index type."),null!=b&&"object"===typeof b||null!=c&&"object"===typeof c)throw Error("Query: First argument passed to startAt(), endAt(), or equalTo() cannot be an object.");
}function cj(a){if(a.oa&&a.ra&&a.la&&(!a.la||""===a.Rb))throw Error("Query: Can't combine startAt(), endAt(), and limit(). Use limitToFirst() or limitToLast() instead.");}function dj(a,b){if(!0===a.pc)throw Error(b+": You can't combine multiple orderBy calls.");}h=Y.prototype;h.Mb=function(){D("Query.ref",0,0,arguments.length);return new X(this.k,this.path)};
h.Ib=function(a,b,c,d){D("Query.on",2,4,arguments.length);lg("Query.on",a,!1);F("Query.on",2,b,!1);var e=ej("Query.on",c,d);if("value"===a)Ri(this.k,this,new ii(b,e.cancel||null,e.Qa||null));else{var f={};f[a]=b;Ri(this.k,this,new ji(f,e.cancel,e.Qa))}return b};
h.mc=function(a,b,c){D("Query.off",0,3,arguments.length);lg("Query.off",a,!0);F("Query.off",2,b,!0);Qb("Query.off",3,c);var d=null,e=null;"value"===a?d=new ii(b||null,null,c||null):a&&(b&&(e={},e[a]=b),d=new ji(e,null,c||null));e=this.k;d=".info"===K(this.path)?e.Fd.nb(this,d):e.M.nb(this,d);bc(e.fa,this.path,d)};
h.Pg=function(a,b){function c(k){f&&(f=!1,e.mc(a,c),b&&b.call(d.Qa,k),g.resolve(k))}D("Query.once",1,4,arguments.length);lg("Query.once",a,!1);F("Query.once",2,b,!0);var d=ej("Query.once",arguments[2],arguments[3]),e=this,f=!0,g=new B;Nb(g.D);this.Ib(a,c,function(b){e.mc(a,c);d.cancel&&d.cancel.call(d.Qa,b);g.reject(b)});return g.D};
h.Le=function(a){S("Query.limit() being deprecated. Please use Query.limitToFirst() or Query.limitToLast() instead.");D("Query.limit",1,1,arguments.length);if(!fa(a)||Math.floor(a)!==a||0>=a)throw Error("Query.limit: First argument must be a positive integer.");if(this.n.la)throw Error("Query.limit: Limit was already set (by another call to limit, limitToFirst, orlimitToLast.");var b=this.n.Le(a);cj(b);return new Y(this.k,this.path,b,this.pc)};
h.Me=function(a){D("Query.limitToFirst",1,1,arguments.length);if(!fa(a)||Math.floor(a)!==a||0>=a)throw Error("Query.limitToFirst: First argument must be a positive integer.");if(this.n.la)throw Error("Query.limitToFirst: Limit was already set (by another call to limit, limitToFirst, or limitToLast).");return new Y(this.k,this.path,this.n.Me(a),this.pc)};
h.Ne=function(a){D("Query.limitToLast",1,1,arguments.length);if(!fa(a)||Math.floor(a)!==a||0>=a)throw Error("Query.limitToLast: First argument must be a positive integer.");if(this.n.la)throw Error("Query.limitToLast: Limit was already set (by another call to limit, limitToFirst, or limitToLast).");return new Y(this.k,this.path,this.n.Ne(a),this.pc)};
h.Qg=function(a){D("Query.orderByChild",1,1,arguments.length);if("$key"===a)throw Error('Query.orderByChild: "$key" is invalid.  Use Query.orderByKey() instead.');if("$priority"===a)throw Error('Query.orderByChild: "$priority" is invalid.  Use Query.orderByPriority() instead.');if("$value"===a)throw Error('Query.orderByChild: "$value" is invalid.  Use Query.orderByValue() instead.');ng("Query.orderByChild",a);dj(this,"Query.orderByChild");var b=new P(a);if(b.e())throw Error("Query.orderByChild: cannot pass in empty path.  Use Query.orderByValue() instead.");
b=new ve(b);b=Fe(this.n,b);bj(b);return new Y(this.k,this.path,b,!0)};h.Rg=function(){D("Query.orderByKey",0,0,arguments.length);dj(this,"Query.orderByKey");var a=Fe(this.n,re);bj(a);return new Y(this.k,this.path,a,!0)};h.Sg=function(){D("Query.orderByPriority",0,0,arguments.length);dj(this,"Query.orderByPriority");var a=Fe(this.n,R);bj(a);return new Y(this.k,this.path,a,!0)};
h.Tg=function(){D("Query.orderByValue",0,0,arguments.length);dj(this,"Query.orderByValue");var a=Fe(this.n,Be);bj(a);return new Y(this.k,this.path,a,!0)};h.ce=function(a,b){D("Query.startAt",0,2,arguments.length);gg("Query.startAt",a,this.path,!0);mg("Query.startAt",b);var c=this.n.ce(a,b);cj(c);bj(c);if(this.n.oa)throw Error("Query.startAt: Starting point was already set (by another call to startAt or equalTo).");p(a)||(b=a=null);return new Y(this.k,this.path,c,this.pc)};
h.vd=function(a,b){D("Query.endAt",0,2,arguments.length);gg("Query.endAt",a,this.path,!0);mg("Query.endAt",b);var c=this.n.vd(a,b);cj(c);bj(c);if(this.n.ra)throw Error("Query.endAt: Ending point was already set (by another call to endAt or equalTo).");return new Y(this.k,this.path,c,this.pc)};
h.tg=function(a,b){D("Query.equalTo",1,2,arguments.length);gg("Query.equalTo",a,this.path,!1);mg("Query.equalTo",b);if(this.n.oa)throw Error("Query.equalTo: Starting point was already set (by another call to endAt or equalTo).");if(this.n.ra)throw Error("Query.equalTo: Ending point was already set (by another call to endAt or equalTo).");return this.ce(a,b).vd(a,b)};
h.toString=function(){D("Query.toString",0,0,arguments.length);for(var a=this.path,b="",c=a.aa;c<a.u.length;c++)""!==a.u[c]&&(b+="/"+encodeURIComponent(String(a.u[c])));return this.k.toString()+(b||"/")};h.wa=function(){var a=xd(Ge(this.n));return"{}"===a?"default":a};
function ej(a,b,c){var d={cancel:null,Qa:null};if(b&&c)d.cancel=b,F(a,3,d.cancel,!0),d.Qa=c,Qb(a,4,d.Qa);else if(b)if("object"===typeof b&&null!==b)d.Qa=b;else if("function"===typeof b)d.cancel=b;else throw Error(E(a,3,!0)+" must either be a cancel callback or a context object.");return d}Y.prototype.ref=Y.prototype.Mb;Y.prototype.on=Y.prototype.Ib;Y.prototype.off=Y.prototype.mc;Y.prototype.once=Y.prototype.Pg;Y.prototype.limit=Y.prototype.Le;Y.prototype.limitToFirst=Y.prototype.Me;
Y.prototype.limitToLast=Y.prototype.Ne;Y.prototype.orderByChild=Y.prototype.Qg;Y.prototype.orderByKey=Y.prototype.Rg;Y.prototype.orderByPriority=Y.prototype.Sg;Y.prototype.orderByValue=Y.prototype.Tg;Y.prototype.startAt=Y.prototype.ce;Y.prototype.endAt=Y.prototype.vd;Y.prototype.equalTo=Y.prototype.tg;Y.prototype.toString=Y.prototype.toString;var Z={};Z.zc=Rh;Z.DataConnection=Z.zc;Rh.prototype.dh=function(a,b){this.Ia("q",{p:a},b)};Z.zc.prototype.simpleListen=Z.zc.prototype.dh;Rh.prototype.sg=function(a,b){this.Ia("echo",{d:a},b)};Z.zc.prototype.echo=Z.zc.prototype.sg;Rh.prototype.interrupt=Rh.prototype.Cb;Z.dg=Fh;Z.RealTimeConnection=Z.dg;Fh.prototype.sendRequest=Fh.prototype.Ia;Fh.prototype.close=Fh.prototype.close;
Z.Cg=function(a){var b=Rh.prototype.put;Rh.prototype.put=function(c,d,e,f){p(f)&&(f=a());b.call(this,c,d,e,f)};return function(){Rh.prototype.put=b}};Z.hijackHash=Z.Cg;Z.cg=dd;Z.ConnectionTarget=Z.cg;Z.wa=function(a){return a.wa()};Z.queryIdentifier=Z.wa;Z.Fg=function(a){return a.k.Va.ba};Z.listens=Z.Fg;Z.ze=function(a){a.ze()};Z.forceRestClient=Z.ze;function X(a,b){var c,d,e;if(a instanceof Ji)c=a,d=b;else{D("new Firebase",1,2,arguments.length);d=sd(arguments[0]);c=d.fh;"firebase"===d.domain&&rd(d.host+" is no longer supported. Please use <YOUR FIREBASE>.firebaseio.com instead");c&&"undefined"!=c||rd("Cannot parse Firebase url. Please use https://<YOUR FIREBASE>.firebaseio.com");d.ob||"undefined"!==typeof window&&window.location&&window.location.protocol&&-1!==window.location.protocol.indexOf("https:")&&S("Insecure Firebase access from a secure page. Please use https in calls to new Firebase().");
c=new dd(d.host,d.ob,c,"ws"===d.scheme||"wss"===d.scheme);d=new P(d.bd);e=d.toString();var f;!(f=!q(c.host)||0===c.host.length||!eg(c.lc))&&(f=0!==e.length)&&(e&&(e=e.replace(/^\/*\.info(\/|$)/,"/")),f=!(q(e)&&0!==e.length&&!cg.test(e)));if(f)throw Error(E("new Firebase",1,!1)+'must be a valid firebase URL and the path can\'t contain ".", "#", "$", "[", or "]".');if(b)if(b instanceof aj)e=b;else if(q(b))e=aj.yb(),c.Rd=b;else throw Error("Expected a valid Firebase.Context for second argument to new Firebase()");
else e=aj.yb();f=c.toString();var g=z(e.sc,f);g||(g=new Ji(c,e.ag),e.sc[f]=g);c=g}Y.call(this,c,d,De,!1);this.then=void 0;this["catch"]=void 0}ka(X,Y);var fj=X,gj=["Firebase"],hj=n;gj[0]in hj||!hj.execScript||hj.execScript("var "+gj[0]);for(var ij;gj.length&&(ij=gj.shift());)!gj.length&&p(fj)?hj[ij]=fj:hj=hj[ij]?hj[ij]:hj[ij]={};X.goOffline=function(){D("Firebase.goOffline",0,0,arguments.length);aj.yb().Cb()};X.goOnline=function(){D("Firebase.goOnline",0,0,arguments.length);aj.yb().vc()};
X.enableLogging=od;X.ServerValue={TIMESTAMP:{".sv":"timestamp"}};X.SDK_VERSION=Eb;X.INTERNAL=U;X.Context=aj;X.TEST_ACCESS=Z;X.prototype.name=function(){S("Firebase.name() being deprecated. Please use Firebase.key() instead.");D("Firebase.name",0,0,arguments.length);return this.key()};X.prototype.name=X.prototype.name;X.prototype.key=function(){D("Firebase.key",0,0,arguments.length);return this.path.e()?null:me(this.path)};X.prototype.key=X.prototype.key;
X.prototype.o=function(a){D("Firebase.child",1,1,arguments.length);if(fa(a))a=String(a);else if(!(a instanceof P))if(null===K(this.path)){var b=a;b&&(b=b.replace(/^\/*\.info(\/|$)/,"/"));ng("Firebase.child",b)}else ng("Firebase.child",a);return new X(this.k,this.path.o(a))};X.prototype.child=X.prototype.o;X.prototype.parent=function(){D("Firebase.parent",0,0,arguments.length);var a=this.path.parent();return null===a?null:new X(this.k,a)};X.prototype.parent=X.prototype.parent;
X.prototype.root=function(){D("Firebase.ref",0,0,arguments.length);for(var a=this;null!==a.parent();)a=a.parent();return a};X.prototype.root=X.prototype.root;X.prototype.set=function(a,b){D("Firebase.set",1,2,arguments.length);og("Firebase.set",this.path);gg("Firebase.set",a,this.path,!1);F("Firebase.set",2,b,!0);var c=new B;this.k.Ob(this.path,a,null,C(c,b));return c.D};X.prototype.set=X.prototype.set;
X.prototype.update=function(a,b){D("Firebase.update",1,2,arguments.length);og("Firebase.update",this.path);if(da(a)){for(var c={},d=0;d<a.length;++d)c[""+d]=a[d];a=c;S("Passing an Array to Firebase.update() is deprecated. Use set() if you want to overwrite the existing data, or an Object with integer keys if you really do want to only update some of the children.")}jg("Firebase.update",a,this.path);F("Firebase.update",2,b,!0);c=new B;this.k.update(this.path,a,C(c,b));return c.D};
X.prototype.update=X.prototype.update;X.prototype.Ob=function(a,b,c){D("Firebase.setWithPriority",2,3,arguments.length);og("Firebase.setWithPriority",this.path);gg("Firebase.setWithPriority",a,this.path,!1);kg("Firebase.setWithPriority",2,b);F("Firebase.setWithPriority",3,c,!0);if(".length"===this.key()||".keys"===this.key())throw"Firebase.setWithPriority failed: "+this.key()+" is a read-only object.";var d=new B;this.k.Ob(this.path,a,b,C(d,c));return d.D};X.prototype.setWithPriority=X.prototype.Ob;
X.prototype.remove=function(a){D("Firebase.remove",0,1,arguments.length);og("Firebase.remove",this.path);F("Firebase.remove",1,a,!0);return this.set(null,a)};X.prototype.remove=X.prototype.remove;
X.prototype.transaction=function(a,b,c){D("Firebase.transaction",1,3,arguments.length);og("Firebase.transaction",this.path);F("Firebase.transaction",1,a,!1);F("Firebase.transaction",2,b,!0);if(p(c)&&"boolean"!=typeof c)throw Error(E("Firebase.transaction",3,!0)+"must be a boolean.");if(".length"===this.key()||".keys"===this.key())throw"Firebase.transaction failed: "+this.key()+" is a read-only object.";"undefined"===typeof c&&(c=!0);var d=new B;r(b)&&Nb(d.D);Si(this.k,this.path,a,function(a,c,g){a?
d.reject(a):d.resolve(new ei(c,g));r(b)&&b(a,c,g)},c);return d.D};X.prototype.transaction=X.prototype.transaction;X.prototype.$g=function(a,b){D("Firebase.setPriority",1,2,arguments.length);og("Firebase.setPriority",this.path);kg("Firebase.setPriority",1,a);F("Firebase.setPriority",2,b,!0);var c=new B;this.k.Ob(this.path.o(".priority"),a,null,C(c,b));return c.D};X.prototype.setPriority=X.prototype.$g;
X.prototype.push=function(a,b){D("Firebase.push",0,2,arguments.length);og("Firebase.push",this.path);gg("Firebase.push",a,this.path,!0);F("Firebase.push",2,b,!0);var c=Li(this.k),d=hf(c),c=this.o(d);if(null!=a){var e=this,f=c.set(a,b).then(function(){return e.o(d)});c.then=u(f.then,f);c["catch"]=u(f.then,f,void 0);r(b)&&Nb(f)}return c};X.prototype.push=X.prototype.push;X.prototype.lb=function(){og("Firebase.onDisconnect",this.path);return new V(this.k,this.path)};X.prototype.onDisconnect=X.prototype.lb;
X.prototype.O=function(a,b,c){S("FirebaseRef.auth() being deprecated. Please use FirebaseRef.authWithCustomToken() instead.");D("Firebase.auth",1,3,arguments.length);pg("Firebase.auth",a);F("Firebase.auth",2,b,!0);F("Firebase.auth",3,b,!0);var d=new B;dh(this.k.O,a,{},{remember:"none"},C(d,b),c);return d.D};X.prototype.auth=X.prototype.O;X.prototype.je=function(a){D("Firebase.unauth",0,1,arguments.length);F("Firebase.unauth",1,a,!0);var b=new B;eh(this.k.O,C(b,a));return b.D};X.prototype.unauth=X.prototype.je;
X.prototype.Be=function(){D("Firebase.getAuth",0,0,arguments.length);return this.k.O.Be()};X.prototype.getAuth=X.prototype.Be;X.prototype.Jg=function(a,b){D("Firebase.onAuth",1,2,arguments.length);F("Firebase.onAuth",1,a,!1);Qb("Firebase.onAuth",2,b);this.k.O.Ib("auth_status",a,b)};X.prototype.onAuth=X.prototype.Jg;X.prototype.Ig=function(a,b){D("Firebase.offAuth",1,2,arguments.length);F("Firebase.offAuth",1,a,!1);Qb("Firebase.offAuth",2,b);this.k.O.mc("auth_status",a,b)};X.prototype.offAuth=X.prototype.Ig;
X.prototype.hg=function(a,b,c){D("Firebase.authWithCustomToken",1,3,arguments.length);2===arguments.length&&Hb(b)&&(c=b,b=void 0);pg("Firebase.authWithCustomToken",a);F("Firebase.authWithCustomToken",2,b,!0);sg("Firebase.authWithCustomToken",3,c,!0);var d=new B;dh(this.k.O,a,{},c||{},C(d,b));return d.D};X.prototype.authWithCustomToken=X.prototype.hg;
X.prototype.ig=function(a,b,c){D("Firebase.authWithOAuthPopup",1,3,arguments.length);2===arguments.length&&Hb(b)&&(c=b,b=void 0);rg("Firebase.authWithOAuthPopup",a);F("Firebase.authWithOAuthPopup",2,b,!0);sg("Firebase.authWithOAuthPopup",3,c,!0);var d=new B;ih(this.k.O,a,c,C(d,b));return d.D};X.prototype.authWithOAuthPopup=X.prototype.ig;
X.prototype.jg=function(a,b,c){D("Firebase.authWithOAuthRedirect",1,3,arguments.length);2===arguments.length&&Hb(b)&&(c=b,b=void 0);rg("Firebase.authWithOAuthRedirect",a);F("Firebase.authWithOAuthRedirect",2,b,!1);sg("Firebase.authWithOAuthRedirect",3,c,!0);var d=new B,e=this.k.O,f=c,g=C(d,b);gh(e);var k=[Qg],f=Ag(f);"anonymous"===a||"firebase"===a?T(g,Sg("TRANSPORT_UNAVAILABLE")):(cd.set("redirect_client_options",f.qd),hh(e,k,"/auth/"+a,f,g));return d.D};X.prototype.authWithOAuthRedirect=X.prototype.jg;
X.prototype.kg=function(a,b,c,d){D("Firebase.authWithOAuthToken",2,4,arguments.length);3===arguments.length&&Hb(c)&&(d=c,c=void 0);rg("Firebase.authWithOAuthToken",a);F("Firebase.authWithOAuthToken",3,c,!0);sg("Firebase.authWithOAuthToken",4,d,!0);var e=new B;q(b)?(qg("Firebase.authWithOAuthToken",2,b),fh(this.k.O,a+"/token",{access_token:b},d,C(e,c))):(sg("Firebase.authWithOAuthToken",2,b,!1),fh(this.k.O,a+"/token",b,d,C(e,c)));return e.D};X.prototype.authWithOAuthToken=X.prototype.kg;
X.prototype.gg=function(a,b){D("Firebase.authAnonymously",0,2,arguments.length);1===arguments.length&&Hb(a)&&(b=a,a=void 0);F("Firebase.authAnonymously",1,a,!0);sg("Firebase.authAnonymously",2,b,!0);var c=new B;fh(this.k.O,"anonymous",{},b,C(c,a));return c.D};X.prototype.authAnonymously=X.prototype.gg;
X.prototype.lg=function(a,b,c){D("Firebase.authWithPassword",1,3,arguments.length);2===arguments.length&&Hb(b)&&(c=b,b=void 0);sg("Firebase.authWithPassword",1,a,!1);tg("Firebase.authWithPassword",a,"email");tg("Firebase.authWithPassword",a,"password");F("Firebase.authWithPassword",2,b,!0);sg("Firebase.authWithPassword",3,c,!0);var d=new B;fh(this.k.O,"password",a,c,C(d,b));return d.D};X.prototype.authWithPassword=X.prototype.lg;
X.prototype.ve=function(a,b){D("Firebase.createUser",1,2,arguments.length);sg("Firebase.createUser",1,a,!1);tg("Firebase.createUser",a,"email");tg("Firebase.createUser",a,"password");F("Firebase.createUser",2,b,!0);var c=new B;this.k.O.ve(a,C(c,b));return c.D};X.prototype.createUser=X.prototype.ve;
X.prototype.Xe=function(a,b){D("Firebase.removeUser",1,2,arguments.length);sg("Firebase.removeUser",1,a,!1);tg("Firebase.removeUser",a,"email");tg("Firebase.removeUser",a,"password");F("Firebase.removeUser",2,b,!0);var c=new B;this.k.O.Xe(a,C(c,b));return c.D};X.prototype.removeUser=X.prototype.Xe;
X.prototype.se=function(a,b){D("Firebase.changePassword",1,2,arguments.length);sg("Firebase.changePassword",1,a,!1);tg("Firebase.changePassword",a,"email");tg("Firebase.changePassword",a,"oldPassword");tg("Firebase.changePassword",a,"newPassword");F("Firebase.changePassword",2,b,!0);var c=new B;this.k.O.se(a,C(c,b));return c.D};X.prototype.changePassword=X.prototype.se;
X.prototype.re=function(a,b){D("Firebase.changeEmail",1,2,arguments.length);sg("Firebase.changeEmail",1,a,!1);tg("Firebase.changeEmail",a,"oldEmail");tg("Firebase.changeEmail",a,"newEmail");tg("Firebase.changeEmail",a,"password");F("Firebase.changeEmail",2,b,!0);var c=new B;this.k.O.re(a,C(c,b));return c.D};X.prototype.changeEmail=X.prototype.re;
X.prototype.Ze=function(a,b){D("Firebase.resetPassword",1,2,arguments.length);sg("Firebase.resetPassword",1,a,!1);tg("Firebase.resetPassword",a,"email");F("Firebase.resetPassword",2,b,!0);var c=new B;this.k.O.Ze(a,C(c,b));return c.D};X.prototype.resetPassword=X.prototype.Ze;})();

module.exports = Firebase;

},{}],32:[function(require,module,exports){
/*!
 * jQuery JavaScript Library v3.3.1
 * https://jquery.com/
 *
 * Includes Sizzle.js
 * https://sizzlejs.com/
 *
 * Copyright JS Foundation and other contributors
 * Released under the MIT license
 * https://jquery.org/license
 *
 * Date: 2018-01-20T17:24Z
 */
( function( global, factory ) {

	"use strict";

	if ( typeof module === "object" && typeof module.exports === "object" ) {

		// For CommonJS and CommonJS-like environments where a proper `window`
		// is present, execute the factory and get jQuery.
		// For environments that do not have a `window` with a `document`
		// (such as Node.js), expose a factory as module.exports.
		// This accentuates the need for the creation of a real `window`.
		// e.g. var jQuery = require("jquery")(window);
		// See ticket #14549 for more info.
		module.exports = global.document ?
			factory( global, true ) :
			function( w ) {
				if ( !w.document ) {
					throw new Error( "jQuery requires a window with a document" );
				}
				return factory( w );
			};
	} else {
		factory( global );
	}

// Pass this if window is not defined yet
} )( typeof window !== "undefined" ? window : this, function( window, noGlobal ) {

// Edge <= 12 - 13+, Firefox <=18 - 45+, IE 10 - 11, Safari 5.1 - 9+, iOS 6 - 9.1
// throw exceptions when non-strict code (e.g., ASP.NET 4.5) accesses strict mode
// arguments.callee.caller (trac-13335). But as of jQuery 3.0 (2016), strict mode should be common
// enough that all such attempts are guarded in a try block.
"use strict";

var arr = [];

var document = window.document;

var getProto = Object.getPrototypeOf;

var slice = arr.slice;

var concat = arr.concat;

var push = arr.push;

var indexOf = arr.indexOf;

var class2type = {};

var toString = class2type.toString;

var hasOwn = class2type.hasOwnProperty;

var fnToString = hasOwn.toString;

var ObjectFunctionString = fnToString.call( Object );

var support = {};

var isFunction = function isFunction( obj ) {

      // Support: Chrome <=57, Firefox <=52
      // In some browsers, typeof returns "function" for HTML <object> elements
      // (i.e., `typeof document.createElement( "object" ) === "function"`).
      // We don't want to classify *any* DOM node as a function.
      return typeof obj === "function" && typeof obj.nodeType !== "number";
  };


var isWindow = function isWindow( obj ) {
		return obj != null && obj === obj.window;
	};




	var preservedScriptAttributes = {
		type: true,
		src: true,
		noModule: true
	};

	function DOMEval( code, doc, node ) {
		doc = doc || document;

		var i,
			script = doc.createElement( "script" );

		script.text = code;
		if ( node ) {
			for ( i in preservedScriptAttributes ) {
				if ( node[ i ] ) {
					script[ i ] = node[ i ];
				}
			}
		}
		doc.head.appendChild( script ).parentNode.removeChild( script );
	}


function toType( obj ) {
	if ( obj == null ) {
		return obj + "";
	}

	// Support: Android <=2.3 only (functionish RegExp)
	return typeof obj === "object" || typeof obj === "function" ?
		class2type[ toString.call( obj ) ] || "object" :
		typeof obj;
}
/* global Symbol */
// Defining this global in .eslintrc.json would create a danger of using the global
// unguarded in another place, it seems safer to define global only for this module



var
	version = "3.3.1",

	// Define a local copy of jQuery
	jQuery = function( selector, context ) {

		// The jQuery object is actually just the init constructor 'enhanced'
		// Need init if jQuery is called (just allow error to be thrown if not included)
		return new jQuery.fn.init( selector, context );
	},

	// Support: Android <=4.0 only
	// Make sure we trim BOM and NBSP
	rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;

jQuery.fn = jQuery.prototype = {

	// The current version of jQuery being used
	jquery: version,

	constructor: jQuery,

	// The default length of a jQuery object is 0
	length: 0,

	toArray: function() {
		return slice.call( this );
	},

	// Get the Nth element in the matched element set OR
	// Get the whole matched element set as a clean array
	get: function( num ) {

		// Return all the elements in a clean array
		if ( num == null ) {
			return slice.call( this );
		}

		// Return just the one element from the set
		return num < 0 ? this[ num + this.length ] : this[ num ];
	},

	// Take an array of elements and push it onto the stack
	// (returning the new matched element set)
	pushStack: function( elems ) {

		// Build a new jQuery matched element set
		var ret = jQuery.merge( this.constructor(), elems );

		// Add the old object onto the stack (as a reference)
		ret.prevObject = this;

		// Return the newly-formed element set
		return ret;
	},

	// Execute a callback for every element in the matched set.
	each: function( callback ) {
		return jQuery.each( this, callback );
	},

	map: function( callback ) {
		return this.pushStack( jQuery.map( this, function( elem, i ) {
			return callback.call( elem, i, elem );
		} ) );
	},

	slice: function() {
		return this.pushStack( slice.apply( this, arguments ) );
	},

	first: function() {
		return this.eq( 0 );
	},

	last: function() {
		return this.eq( -1 );
	},

	eq: function( i ) {
		var len = this.length,
			j = +i + ( i < 0 ? len : 0 );
		return this.pushStack( j >= 0 && j < len ? [ this[ j ] ] : [] );
	},

	end: function() {
		return this.prevObject || this.constructor();
	},

	// For internal use only.
	// Behaves like an Array's method, not like a jQuery method.
	push: push,
	sort: arr.sort,
	splice: arr.splice
};

jQuery.extend = jQuery.fn.extend = function() {
	var options, name, src, copy, copyIsArray, clone,
		target = arguments[ 0 ] || {},
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if ( typeof target === "boolean" ) {
		deep = target;

		// Skip the boolean and the target
		target = arguments[ i ] || {};
		i++;
	}

	// Handle case when target is a string or something (possible in deep copy)
	if ( typeof target !== "object" && !isFunction( target ) ) {
		target = {};
	}

	// Extend jQuery itself if only one argument is passed
	if ( i === length ) {
		target = this;
		i--;
	}

	for ( ; i < length; i++ ) {

		// Only deal with non-null/undefined values
		if ( ( options = arguments[ i ] ) != null ) {

			// Extend the base object
			for ( name in options ) {
				src = target[ name ];
				copy = options[ name ];

				// Prevent never-ending loop
				if ( target === copy ) {
					continue;
				}

				// Recurse if we're merging plain objects or arrays
				if ( deep && copy && ( jQuery.isPlainObject( copy ) ||
					( copyIsArray = Array.isArray( copy ) ) ) ) {

					if ( copyIsArray ) {
						copyIsArray = false;
						clone = src && Array.isArray( src ) ? src : [];

					} else {
						clone = src && jQuery.isPlainObject( src ) ? src : {};
					}

					// Never move original objects, clone them
					target[ name ] = jQuery.extend( deep, clone, copy );

				// Don't bring in undefined values
				} else if ( copy !== undefined ) {
					target[ name ] = copy;
				}
			}
		}
	}

	// Return the modified object
	return target;
};

jQuery.extend( {

	// Unique for each copy of jQuery on the page
	expando: "jQuery" + ( version + Math.random() ).replace( /\D/g, "" ),

	// Assume jQuery is ready without the ready module
	isReady: true,

	error: function( msg ) {
		throw new Error( msg );
	},

	noop: function() {},

	isPlainObject: function( obj ) {
		var proto, Ctor;

		// Detect obvious negatives
		// Use toString instead of jQuery.type to catch host objects
		if ( !obj || toString.call( obj ) !== "[object Object]" ) {
			return false;
		}

		proto = getProto( obj );

		// Objects with no prototype (e.g., `Object.create( null )`) are plain
		if ( !proto ) {
			return true;
		}

		// Objects with prototype are plain iff they were constructed by a global Object function
		Ctor = hasOwn.call( proto, "constructor" ) && proto.constructor;
		return typeof Ctor === "function" && fnToString.call( Ctor ) === ObjectFunctionString;
	},

	isEmptyObject: function( obj ) {

		/* eslint-disable no-unused-vars */
		// See https://github.com/eslint/eslint/issues/6125
		var name;

		for ( name in obj ) {
			return false;
		}
		return true;
	},

	// Evaluates a script in a global context
	globalEval: function( code ) {
		DOMEval( code );
	},

	each: function( obj, callback ) {
		var length, i = 0;

		if ( isArrayLike( obj ) ) {
			length = obj.length;
			for ( ; i < length; i++ ) {
				if ( callback.call( obj[ i ], i, obj[ i ] ) === false ) {
					break;
				}
			}
		} else {
			for ( i in obj ) {
				if ( callback.call( obj[ i ], i, obj[ i ] ) === false ) {
					break;
				}
			}
		}

		return obj;
	},

	// Support: Android <=4.0 only
	trim: function( text ) {
		return text == null ?
			"" :
			( text + "" ).replace( rtrim, "" );
	},

	// results is for internal usage only
	makeArray: function( arr, results ) {
		var ret = results || [];

		if ( arr != null ) {
			if ( isArrayLike( Object( arr ) ) ) {
				jQuery.merge( ret,
					typeof arr === "string" ?
					[ arr ] : arr
				);
			} else {
				push.call( ret, arr );
			}
		}

		return ret;
	},

	inArray: function( elem, arr, i ) {
		return arr == null ? -1 : indexOf.call( arr, elem, i );
	},

	// Support: Android <=4.0 only, PhantomJS 1 only
	// push.apply(_, arraylike) throws on ancient WebKit
	merge: function( first, second ) {
		var len = +second.length,
			j = 0,
			i = first.length;

		for ( ; j < len; j++ ) {
			first[ i++ ] = second[ j ];
		}

		first.length = i;

		return first;
	},

	grep: function( elems, callback, invert ) {
		var callbackInverse,
			matches = [],
			i = 0,
			length = elems.length,
			callbackExpect = !invert;

		// Go through the array, only saving the items
		// that pass the validator function
		for ( ; i < length; i++ ) {
			callbackInverse = !callback( elems[ i ], i );
			if ( callbackInverse !== callbackExpect ) {
				matches.push( elems[ i ] );
			}
		}

		return matches;
	},

	// arg is for internal usage only
	map: function( elems, callback, arg ) {
		var length, value,
			i = 0,
			ret = [];

		// Go through the array, translating each of the items to their new values
		if ( isArrayLike( elems ) ) {
			length = elems.length;
			for ( ; i < length; i++ ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}

		// Go through every key on the object,
		} else {
			for ( i in elems ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}
		}

		// Flatten any nested arrays
		return concat.apply( [], ret );
	},

	// A global GUID counter for objects
	guid: 1,

	// jQuery.support is not used in Core but other projects attach their
	// properties to it so it needs to exist.
	support: support
} );

if ( typeof Symbol === "function" ) {
	jQuery.fn[ Symbol.iterator ] = arr[ Symbol.iterator ];
}

// Populate the class2type map
jQuery.each( "Boolean Number String Function Array Date RegExp Object Error Symbol".split( " " ),
function( i, name ) {
	class2type[ "[object " + name + "]" ] = name.toLowerCase();
} );

function isArrayLike( obj ) {

	// Support: real iOS 8.2 only (not reproducible in simulator)
	// `in` check used to prevent JIT error (gh-2145)
	// hasOwn isn't used here due to false negatives
	// regarding Nodelist length in IE
	var length = !!obj && "length" in obj && obj.length,
		type = toType( obj );

	if ( isFunction( obj ) || isWindow( obj ) ) {
		return false;
	}

	return type === "array" || length === 0 ||
		typeof length === "number" && length > 0 && ( length - 1 ) in obj;
}
var Sizzle =
/*!
 * Sizzle CSS Selector Engine v2.3.3
 * https://sizzlejs.com/
 *
 * Copyright jQuery Foundation and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2016-08-08
 */
(function( window ) {

var i,
	support,
	Expr,
	getText,
	isXML,
	tokenize,
	compile,
	select,
	outermostContext,
	sortInput,
	hasDuplicate,

	// Local document vars
	setDocument,
	document,
	docElem,
	documentIsHTML,
	rbuggyQSA,
	rbuggyMatches,
	matches,
	contains,

	// Instance-specific data
	expando = "sizzle" + 1 * new Date(),
	preferredDoc = window.document,
	dirruns = 0,
	done = 0,
	classCache = createCache(),
	tokenCache = createCache(),
	compilerCache = createCache(),
	sortOrder = function( a, b ) {
		if ( a === b ) {
			hasDuplicate = true;
		}
		return 0;
	},

	// Instance methods
	hasOwn = ({}).hasOwnProperty,
	arr = [],
	pop = arr.pop,
	push_native = arr.push,
	push = arr.push,
	slice = arr.slice,
	// Use a stripped-down indexOf as it's faster than native
	// https://jsperf.com/thor-indexof-vs-for/5
	indexOf = function( list, elem ) {
		var i = 0,
			len = list.length;
		for ( ; i < len; i++ ) {
			if ( list[i] === elem ) {
				return i;
			}
		}
		return -1;
	},

	booleans = "checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",

	// Regular expressions

	// http://www.w3.org/TR/css3-selectors/#whitespace
	whitespace = "[\\x20\\t\\r\\n\\f]",

	// http://www.w3.org/TR/CSS21/syndata.html#value-def-identifier
	identifier = "(?:\\\\.|[\\w-]|[^\0-\\xa0])+",

	// Attribute selectors: http://www.w3.org/TR/selectors/#attribute-selectors
	attributes = "\\[" + whitespace + "*(" + identifier + ")(?:" + whitespace +
		// Operator (capture 2)
		"*([*^$|!~]?=)" + whitespace +
		// "Attribute values must be CSS identifiers [capture 5] or strings [capture 3 or capture 4]"
		"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|(" + identifier + "))|)" + whitespace +
		"*\\]",

	pseudos = ":(" + identifier + ")(?:\\((" +
		// To reduce the number of selectors needing tokenize in the preFilter, prefer arguments:
		// 1. quoted (capture 3; capture 4 or capture 5)
		"('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|" +
		// 2. simple (capture 6)
		"((?:\\\\.|[^\\\\()[\\]]|" + attributes + ")*)|" +
		// 3. anything else (capture 2)
		".*" +
		")\\)|)",

	// Leading and non-escaped trailing whitespace, capturing some non-whitespace characters preceding the latter
	rwhitespace = new RegExp( whitespace + "+", "g" ),
	rtrim = new RegExp( "^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$", "g" ),

	rcomma = new RegExp( "^" + whitespace + "*," + whitespace + "*" ),
	rcombinators = new RegExp( "^" + whitespace + "*([>+~]|" + whitespace + ")" + whitespace + "*" ),

	rattributeQuotes = new RegExp( "=" + whitespace + "*([^\\]'\"]*?)" + whitespace + "*\\]", "g" ),

	rpseudo = new RegExp( pseudos ),
	ridentifier = new RegExp( "^" + identifier + "$" ),

	matchExpr = {
		"ID": new RegExp( "^#(" + identifier + ")" ),
		"CLASS": new RegExp( "^\\.(" + identifier + ")" ),
		"TAG": new RegExp( "^(" + identifier + "|[*])" ),
		"ATTR": new RegExp( "^" + attributes ),
		"PSEUDO": new RegExp( "^" + pseudos ),
		"CHILD": new RegExp( "^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" + whitespace +
			"*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" + whitespace +
			"*(\\d+)|))" + whitespace + "*\\)|)", "i" ),
		"bool": new RegExp( "^(?:" + booleans + ")$", "i" ),
		// For use in libraries implementing .is()
		// We use this for POS matching in `select`
		"needsContext": new RegExp( "^" + whitespace + "*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" +
			whitespace + "*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)", "i" )
	},

	rinputs = /^(?:input|select|textarea|button)$/i,
	rheader = /^h\d$/i,

	rnative = /^[^{]+\{\s*\[native \w/,

	// Easily-parseable/retrievable ID or TAG or CLASS selectors
	rquickExpr = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,

	rsibling = /[+~]/,

	// CSS escapes
	// http://www.w3.org/TR/CSS21/syndata.html#escaped-characters
	runescape = new RegExp( "\\\\([\\da-f]{1,6}" + whitespace + "?|(" + whitespace + ")|.)", "ig" ),
	funescape = function( _, escaped, escapedWhitespace ) {
		var high = "0x" + escaped - 0x10000;
		// NaN means non-codepoint
		// Support: Firefox<24
		// Workaround erroneous numeric interpretation of +"0x"
		return high !== high || escapedWhitespace ?
			escaped :
			high < 0 ?
				// BMP codepoint
				String.fromCharCode( high + 0x10000 ) :
				// Supplemental Plane codepoint (surrogate pair)
				String.fromCharCode( high >> 10 | 0xD800, high & 0x3FF | 0xDC00 );
	},

	// CSS string/identifier serialization
	// https://drafts.csswg.org/cssom/#common-serializing-idioms
	rcssescape = /([\0-\x1f\x7f]|^-?\d)|^-$|[^\0-\x1f\x7f-\uFFFF\w-]/g,
	fcssescape = function( ch, asCodePoint ) {
		if ( asCodePoint ) {

			// U+0000 NULL becomes U+FFFD REPLACEMENT CHARACTER
			if ( ch === "\0" ) {
				return "\uFFFD";
			}

			// Control characters and (dependent upon position) numbers get escaped as code points
			return ch.slice( 0, -1 ) + "\\" + ch.charCodeAt( ch.length - 1 ).toString( 16 ) + " ";
		}

		// Other potentially-special ASCII characters get backslash-escaped
		return "\\" + ch;
	},

	// Used for iframes
	// See setDocument()
	// Removing the function wrapper causes a "Permission Denied"
	// error in IE
	unloadHandler = function() {
		setDocument();
	},

	disabledAncestor = addCombinator(
		function( elem ) {
			return elem.disabled === true && ("form" in elem || "label" in elem);
		},
		{ dir: "parentNode", next: "legend" }
	);

// Optimize for push.apply( _, NodeList )
try {
	push.apply(
		(arr = slice.call( preferredDoc.childNodes )),
		preferredDoc.childNodes
	);
	// Support: Android<4.0
	// Detect silently failing push.apply
	arr[ preferredDoc.childNodes.length ].nodeType;
} catch ( e ) {
	push = { apply: arr.length ?

		// Leverage slice if possible
		function( target, els ) {
			push_native.apply( target, slice.call(els) );
		} :

		// Support: IE<9
		// Otherwise append directly
		function( target, els ) {
			var j = target.length,
				i = 0;
			// Can't trust NodeList.length
			while ( (target[j++] = els[i++]) ) {}
			target.length = j - 1;
		}
	};
}

function Sizzle( selector, context, results, seed ) {
	var m, i, elem, nid, match, groups, newSelector,
		newContext = context && context.ownerDocument,

		// nodeType defaults to 9, since context defaults to document
		nodeType = context ? context.nodeType : 9;

	results = results || [];

	// Return early from calls with invalid selector or context
	if ( typeof selector !== "string" || !selector ||
		nodeType !== 1 && nodeType !== 9 && nodeType !== 11 ) {

		return results;
	}

	// Try to shortcut find operations (as opposed to filters) in HTML documents
	if ( !seed ) {

		if ( ( context ? context.ownerDocument || context : preferredDoc ) !== document ) {
			setDocument( context );
		}
		context = context || document;

		if ( documentIsHTML ) {

			// If the selector is sufficiently simple, try using a "get*By*" DOM method
			// (excepting DocumentFragment context, where the methods don't exist)
			if ( nodeType !== 11 && (match = rquickExpr.exec( selector )) ) {

				// ID selector
				if ( (m = match[1]) ) {

					// Document context
					if ( nodeType === 9 ) {
						if ( (elem = context.getElementById( m )) ) {

							// Support: IE, Opera, Webkit
							// TODO: identify versions
							// getElementById can match elements by name instead of ID
							if ( elem.id === m ) {
								results.push( elem );
								return results;
							}
						} else {
							return results;
						}

					// Element context
					} else {

						// Support: IE, Opera, Webkit
						// TODO: identify versions
						// getElementById can match elements by name instead of ID
						if ( newContext && (elem = newContext.getElementById( m )) &&
							contains( context, elem ) &&
							elem.id === m ) {

							results.push( elem );
							return results;
						}
					}

				// Type selector
				} else if ( match[2] ) {
					push.apply( results, context.getElementsByTagName( selector ) );
					return results;

				// Class selector
				} else if ( (m = match[3]) && support.getElementsByClassName &&
					context.getElementsByClassName ) {

					push.apply( results, context.getElementsByClassName( m ) );
					return results;
				}
			}

			// Take advantage of querySelectorAll
			if ( support.qsa &&
				!compilerCache[ selector + " " ] &&
				(!rbuggyQSA || !rbuggyQSA.test( selector )) ) {

				if ( nodeType !== 1 ) {
					newContext = context;
					newSelector = selector;

				// qSA looks outside Element context, which is not what we want
				// Thanks to Andrew Dupont for this workaround technique
				// Support: IE <=8
				// Exclude object elements
				} else if ( context.nodeName.toLowerCase() !== "object" ) {

					// Capture the context ID, setting it first if necessary
					if ( (nid = context.getAttribute( "id" )) ) {
						nid = nid.replace( rcssescape, fcssescape );
					} else {
						context.setAttribute( "id", (nid = expando) );
					}

					// Prefix every selector in the list
					groups = tokenize( selector );
					i = groups.length;
					while ( i-- ) {
						groups[i] = "#" + nid + " " + toSelector( groups[i] );
					}
					newSelector = groups.join( "," );

					// Expand context for sibling selectors
					newContext = rsibling.test( selector ) && testContext( context.parentNode ) ||
						context;
				}

				if ( newSelector ) {
					try {
						push.apply( results,
							newContext.querySelectorAll( newSelector )
						);
						return results;
					} catch ( qsaError ) {
					} finally {
						if ( nid === expando ) {
							context.removeAttribute( "id" );
						}
					}
				}
			}
		}
	}

	// All others
	return select( selector.replace( rtrim, "$1" ), context, results, seed );
}

/**
 * Create key-value caches of limited size
 * @returns {function(string, object)} Returns the Object data after storing it on itself with
 *	property name the (space-suffixed) string and (if the cache is larger than Expr.cacheLength)
 *	deleting the oldest entry
 */
function createCache() {
	var keys = [];

	function cache( key, value ) {
		// Use (key + " ") to avoid collision with native prototype properties (see Issue #157)
		if ( keys.push( key + " " ) > Expr.cacheLength ) {
			// Only keep the most recent entries
			delete cache[ keys.shift() ];
		}
		return (cache[ key + " " ] = value);
	}
	return cache;
}

/**
 * Mark a function for special use by Sizzle
 * @param {Function} fn The function to mark
 */
function markFunction( fn ) {
	fn[ expando ] = true;
	return fn;
}

/**
 * Support testing using an element
 * @param {Function} fn Passed the created element and returns a boolean result
 */
function assert( fn ) {
	var el = document.createElement("fieldset");

	try {
		return !!fn( el );
	} catch (e) {
		return false;
	} finally {
		// Remove from its parent by default
		if ( el.parentNode ) {
			el.parentNode.removeChild( el );
		}
		// release memory in IE
		el = null;
	}
}

/**
 * Adds the same handler for all of the specified attrs
 * @param {String} attrs Pipe-separated list of attributes
 * @param {Function} handler The method that will be applied
 */
function addHandle( attrs, handler ) {
	var arr = attrs.split("|"),
		i = arr.length;

	while ( i-- ) {
		Expr.attrHandle[ arr[i] ] = handler;
	}
}

/**
 * Checks document order of two siblings
 * @param {Element} a
 * @param {Element} b
 * @returns {Number} Returns less than 0 if a precedes b, greater than 0 if a follows b
 */
function siblingCheck( a, b ) {
	var cur = b && a,
		diff = cur && a.nodeType === 1 && b.nodeType === 1 &&
			a.sourceIndex - b.sourceIndex;

	// Use IE sourceIndex if available on both nodes
	if ( diff ) {
		return diff;
	}

	// Check if b follows a
	if ( cur ) {
		while ( (cur = cur.nextSibling) ) {
			if ( cur === b ) {
				return -1;
			}
		}
	}

	return a ? 1 : -1;
}

/**
 * Returns a function to use in pseudos for input types
 * @param {String} type
 */
function createInputPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return name === "input" && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for buttons
 * @param {String} type
 */
function createButtonPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return (name === "input" || name === "button") && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for :enabled/:disabled
 * @param {Boolean} disabled true for :disabled; false for :enabled
 */
function createDisabledPseudo( disabled ) {

	// Known :disabled false positives: fieldset[disabled] > legend:nth-of-type(n+2) :can-disable
	return function( elem ) {

		// Only certain elements can match :enabled or :disabled
		// https://html.spec.whatwg.org/multipage/scripting.html#selector-enabled
		// https://html.spec.whatwg.org/multipage/scripting.html#selector-disabled
		if ( "form" in elem ) {

			// Check for inherited disabledness on relevant non-disabled elements:
			// * listed form-associated elements in a disabled fieldset
			//   https://html.spec.whatwg.org/multipage/forms.html#category-listed
			//   https://html.spec.whatwg.org/multipage/forms.html#concept-fe-disabled
			// * option elements in a disabled optgroup
			//   https://html.spec.whatwg.org/multipage/forms.html#concept-option-disabled
			// All such elements have a "form" property.
			if ( elem.parentNode && elem.disabled === false ) {

				// Option elements defer to a parent optgroup if present
				if ( "label" in elem ) {
					if ( "label" in elem.parentNode ) {
						return elem.parentNode.disabled === disabled;
					} else {
						return elem.disabled === disabled;
					}
				}

				// Support: IE 6 - 11
				// Use the isDisabled shortcut property to check for disabled fieldset ancestors
				return elem.isDisabled === disabled ||

					// Where there is no isDisabled, check manually
					/* jshint -W018 */
					elem.isDisabled !== !disabled &&
						disabledAncestor( elem ) === disabled;
			}

			return elem.disabled === disabled;

		// Try to winnow out elements that can't be disabled before trusting the disabled property.
		// Some victims get caught in our net (label, legend, menu, track), but it shouldn't
		// even exist on them, let alone have a boolean value.
		} else if ( "label" in elem ) {
			return elem.disabled === disabled;
		}

		// Remaining elements are neither :enabled nor :disabled
		return false;
	};
}

/**
 * Returns a function to use in pseudos for positionals
 * @param {Function} fn
 */
function createPositionalPseudo( fn ) {
	return markFunction(function( argument ) {
		argument = +argument;
		return markFunction(function( seed, matches ) {
			var j,
				matchIndexes = fn( [], seed.length, argument ),
				i = matchIndexes.length;

			// Match elements found at the specified indexes
			while ( i-- ) {
				if ( seed[ (j = matchIndexes[i]) ] ) {
					seed[j] = !(matches[j] = seed[j]);
				}
			}
		});
	});
}

/**
 * Checks a node for validity as a Sizzle context
 * @param {Element|Object=} context
 * @returns {Element|Object|Boolean} The input node if acceptable, otherwise a falsy value
 */
function testContext( context ) {
	return context && typeof context.getElementsByTagName !== "undefined" && context;
}

// Expose support vars for convenience
support = Sizzle.support = {};

/**
 * Detects XML nodes
 * @param {Element|Object} elem An element or a document
 * @returns {Boolean} True iff elem is a non-HTML XML node
 */
isXML = Sizzle.isXML = function( elem ) {
	// documentElement is verified for cases where it doesn't yet exist
	// (such as loading iframes in IE - #4833)
	var documentElement = elem && (elem.ownerDocument || elem).documentElement;
	return documentElement ? documentElement.nodeName !== "HTML" : false;
};

/**
 * Sets document-related variables once based on the current document
 * @param {Element|Object} [doc] An element or document object to use to set the document
 * @returns {Object} Returns the current document
 */
setDocument = Sizzle.setDocument = function( node ) {
	var hasCompare, subWindow,
		doc = node ? node.ownerDocument || node : preferredDoc;

	// Return early if doc is invalid or already selected
	if ( doc === document || doc.nodeType !== 9 || !doc.documentElement ) {
		return document;
	}

	// Update global variables
	document = doc;
	docElem = document.documentElement;
	documentIsHTML = !isXML( document );

	// Support: IE 9-11, Edge
	// Accessing iframe documents after unload throws "permission denied" errors (jQuery #13936)
	if ( preferredDoc !== document &&
		(subWindow = document.defaultView) && subWindow.top !== subWindow ) {

		// Support: IE 11, Edge
		if ( subWindow.addEventListener ) {
			subWindow.addEventListener( "unload", unloadHandler, false );

		// Support: IE 9 - 10 only
		} else if ( subWindow.attachEvent ) {
			subWindow.attachEvent( "onunload", unloadHandler );
		}
	}

	/* Attributes
	---------------------------------------------------------------------- */

	// Support: IE<8
	// Verify that getAttribute really returns attributes and not properties
	// (excepting IE8 booleans)
	support.attributes = assert(function( el ) {
		el.className = "i";
		return !el.getAttribute("className");
	});

	/* getElement(s)By*
	---------------------------------------------------------------------- */

	// Check if getElementsByTagName("*") returns only elements
	support.getElementsByTagName = assert(function( el ) {
		el.appendChild( document.createComment("") );
		return !el.getElementsByTagName("*").length;
	});

	// Support: IE<9
	support.getElementsByClassName = rnative.test( document.getElementsByClassName );

	// Support: IE<10
	// Check if getElementById returns elements by name
	// The broken getElementById methods don't pick up programmatically-set names,
	// so use a roundabout getElementsByName test
	support.getById = assert(function( el ) {
		docElem.appendChild( el ).id = expando;
		return !document.getElementsByName || !document.getElementsByName( expando ).length;
	});

	// ID filter and find
	if ( support.getById ) {
		Expr.filter["ID"] = function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				return elem.getAttribute("id") === attrId;
			};
		};
		Expr.find["ID"] = function( id, context ) {
			if ( typeof context.getElementById !== "undefined" && documentIsHTML ) {
				var elem = context.getElementById( id );
				return elem ? [ elem ] : [];
			}
		};
	} else {
		Expr.filter["ID"] =  function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				var node = typeof elem.getAttributeNode !== "undefined" &&
					elem.getAttributeNode("id");
				return node && node.value === attrId;
			};
		};

		// Support: IE 6 - 7 only
		// getElementById is not reliable as a find shortcut
		Expr.find["ID"] = function( id, context ) {
			if ( typeof context.getElementById !== "undefined" && documentIsHTML ) {
				var node, i, elems,
					elem = context.getElementById( id );

				if ( elem ) {

					// Verify the id attribute
					node = elem.getAttributeNode("id");
					if ( node && node.value === id ) {
						return [ elem ];
					}

					// Fall back on getElementsByName
					elems = context.getElementsByName( id );
					i = 0;
					while ( (elem = elems[i++]) ) {
						node = elem.getAttributeNode("id");
						if ( node && node.value === id ) {
							return [ elem ];
						}
					}
				}

				return [];
			}
		};
	}

	// Tag
	Expr.find["TAG"] = support.getElementsByTagName ?
		function( tag, context ) {
			if ( typeof context.getElementsByTagName !== "undefined" ) {
				return context.getElementsByTagName( tag );

			// DocumentFragment nodes don't have gEBTN
			} else if ( support.qsa ) {
				return context.querySelectorAll( tag );
			}
		} :

		function( tag, context ) {
			var elem,
				tmp = [],
				i = 0,
				// By happy coincidence, a (broken) gEBTN appears on DocumentFragment nodes too
				results = context.getElementsByTagName( tag );

			// Filter out possible comments
			if ( tag === "*" ) {
				while ( (elem = results[i++]) ) {
					if ( elem.nodeType === 1 ) {
						tmp.push( elem );
					}
				}

				return tmp;
			}
			return results;
		};

	// Class
	Expr.find["CLASS"] = support.getElementsByClassName && function( className, context ) {
		if ( typeof context.getElementsByClassName !== "undefined" && documentIsHTML ) {
			return context.getElementsByClassName( className );
		}
	};

	/* QSA/matchesSelector
	---------------------------------------------------------------------- */

	// QSA and matchesSelector support

	// matchesSelector(:active) reports false when true (IE9/Opera 11.5)
	rbuggyMatches = [];

	// qSa(:focus) reports false when true (Chrome 21)
	// We allow this because of a bug in IE8/9 that throws an error
	// whenever `document.activeElement` is accessed on an iframe
	// So, we allow :focus to pass through QSA all the time to avoid the IE error
	// See https://bugs.jquery.com/ticket/13378
	rbuggyQSA = [];

	if ( (support.qsa = rnative.test( document.querySelectorAll )) ) {
		// Build QSA regex
		// Regex strategy adopted from Diego Perini
		assert(function( el ) {
			// Select is set to empty string on purpose
			// This is to test IE's treatment of not explicitly
			// setting a boolean content attribute,
			// since its presence should be enough
			// https://bugs.jquery.com/ticket/12359
			docElem.appendChild( el ).innerHTML = "<a id='" + expando + "'></a>" +
				"<select id='" + expando + "-\r\\' msallowcapture=''>" +
				"<option selected=''></option></select>";

			// Support: IE8, Opera 11-12.16
			// Nothing should be selected when empty strings follow ^= or $= or *=
			// The test attribute must be unknown in Opera but "safe" for WinRT
			// https://msdn.microsoft.com/en-us/library/ie/hh465388.aspx#attribute_section
			if ( el.querySelectorAll("[msallowcapture^='']").length ) {
				rbuggyQSA.push( "[*^$]=" + whitespace + "*(?:''|\"\")" );
			}

			// Support: IE8
			// Boolean attributes and "value" are not treated correctly
			if ( !el.querySelectorAll("[selected]").length ) {
				rbuggyQSA.push( "\\[" + whitespace + "*(?:value|" + booleans + ")" );
			}

			// Support: Chrome<29, Android<4.4, Safari<7.0+, iOS<7.0+, PhantomJS<1.9.8+
			if ( !el.querySelectorAll( "[id~=" + expando + "-]" ).length ) {
				rbuggyQSA.push("~=");
			}

			// Webkit/Opera - :checked should return selected option elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			// IE8 throws error here and will not see later tests
			if ( !el.querySelectorAll(":checked").length ) {
				rbuggyQSA.push(":checked");
			}

			// Support: Safari 8+, iOS 8+
			// https://bugs.webkit.org/show_bug.cgi?id=136851
			// In-page `selector#id sibling-combinator selector` fails
			if ( !el.querySelectorAll( "a#" + expando + "+*" ).length ) {
				rbuggyQSA.push(".#.+[+~]");
			}
		});

		assert(function( el ) {
			el.innerHTML = "<a href='' disabled='disabled'></a>" +
				"<select disabled='disabled'><option/></select>";

			// Support: Windows 8 Native Apps
			// The type and name attributes are restricted during .innerHTML assignment
			var input = document.createElement("input");
			input.setAttribute( "type", "hidden" );
			el.appendChild( input ).setAttribute( "name", "D" );

			// Support: IE8
			// Enforce case-sensitivity of name attribute
			if ( el.querySelectorAll("[name=d]").length ) {
				rbuggyQSA.push( "name" + whitespace + "*[*^$|!~]?=" );
			}

			// FF 3.5 - :enabled/:disabled and hidden elements (hidden elements are still enabled)
			// IE8 throws error here and will not see later tests
			if ( el.querySelectorAll(":enabled").length !== 2 ) {
				rbuggyQSA.push( ":enabled", ":disabled" );
			}

			// Support: IE9-11+
			// IE's :disabled selector does not pick up the children of disabled fieldsets
			docElem.appendChild( el ).disabled = true;
			if ( el.querySelectorAll(":disabled").length !== 2 ) {
				rbuggyQSA.push( ":enabled", ":disabled" );
			}

			// Opera 10-11 does not throw on post-comma invalid pseudos
			el.querySelectorAll("*,:x");
			rbuggyQSA.push(",.*:");
		});
	}

	if ( (support.matchesSelector = rnative.test( (matches = docElem.matches ||
		docElem.webkitMatchesSelector ||
		docElem.mozMatchesSelector ||
		docElem.oMatchesSelector ||
		docElem.msMatchesSelector) )) ) {

		assert(function( el ) {
			// Check to see if it's possible to do matchesSelector
			// on a disconnected node (IE 9)
			support.disconnectedMatch = matches.call( el, "*" );

			// This should fail with an exception
			// Gecko does not error, returns false instead
			matches.call( el, "[s!='']:x" );
			rbuggyMatches.push( "!=", pseudos );
		});
	}

	rbuggyQSA = rbuggyQSA.length && new RegExp( rbuggyQSA.join("|") );
	rbuggyMatches = rbuggyMatches.length && new RegExp( rbuggyMatches.join("|") );

	/* Contains
	---------------------------------------------------------------------- */
	hasCompare = rnative.test( docElem.compareDocumentPosition );

	// Element contains another
	// Purposefully self-exclusive
	// As in, an element does not contain itself
	contains = hasCompare || rnative.test( docElem.contains ) ?
		function( a, b ) {
			var adown = a.nodeType === 9 ? a.documentElement : a,
				bup = b && b.parentNode;
			return a === bup || !!( bup && bup.nodeType === 1 && (
				adown.contains ?
					adown.contains( bup ) :
					a.compareDocumentPosition && a.compareDocumentPosition( bup ) & 16
			));
		} :
		function( a, b ) {
			if ( b ) {
				while ( (b = b.parentNode) ) {
					if ( b === a ) {
						return true;
					}
				}
			}
			return false;
		};

	/* Sorting
	---------------------------------------------------------------------- */

	// Document order sorting
	sortOrder = hasCompare ?
	function( a, b ) {

		// Flag for duplicate removal
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		// Sort on method existence if only one input has compareDocumentPosition
		var compare = !a.compareDocumentPosition - !b.compareDocumentPosition;
		if ( compare ) {
			return compare;
		}

		// Calculate position if both inputs belong to the same document
		compare = ( a.ownerDocument || a ) === ( b.ownerDocument || b ) ?
			a.compareDocumentPosition( b ) :

			// Otherwise we know they are disconnected
			1;

		// Disconnected nodes
		if ( compare & 1 ||
			(!support.sortDetached && b.compareDocumentPosition( a ) === compare) ) {

			// Choose the first element that is related to our preferred document
			if ( a === document || a.ownerDocument === preferredDoc && contains(preferredDoc, a) ) {
				return -1;
			}
			if ( b === document || b.ownerDocument === preferredDoc && contains(preferredDoc, b) ) {
				return 1;
			}

			// Maintain original order
			return sortInput ?
				( indexOf( sortInput, a ) - indexOf( sortInput, b ) ) :
				0;
		}

		return compare & 4 ? -1 : 1;
	} :
	function( a, b ) {
		// Exit early if the nodes are identical
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		var cur,
			i = 0,
			aup = a.parentNode,
			bup = b.parentNode,
			ap = [ a ],
			bp = [ b ];

		// Parentless nodes are either documents or disconnected
		if ( !aup || !bup ) {
			return a === document ? -1 :
				b === document ? 1 :
				aup ? -1 :
				bup ? 1 :
				sortInput ?
				( indexOf( sortInput, a ) - indexOf( sortInput, b ) ) :
				0;

		// If the nodes are siblings, we can do a quick check
		} else if ( aup === bup ) {
			return siblingCheck( a, b );
		}

		// Otherwise we need full lists of their ancestors for comparison
		cur = a;
		while ( (cur = cur.parentNode) ) {
			ap.unshift( cur );
		}
		cur = b;
		while ( (cur = cur.parentNode) ) {
			bp.unshift( cur );
		}

		// Walk down the tree looking for a discrepancy
		while ( ap[i] === bp[i] ) {
			i++;
		}

		return i ?
			// Do a sibling check if the nodes have a common ancestor
			siblingCheck( ap[i], bp[i] ) :

			// Otherwise nodes in our document sort first
			ap[i] === preferredDoc ? -1 :
			bp[i] === preferredDoc ? 1 :
			0;
	};

	return document;
};

Sizzle.matches = function( expr, elements ) {
	return Sizzle( expr, null, null, elements );
};

Sizzle.matchesSelector = function( elem, expr ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	// Make sure that attribute selectors are quoted
	expr = expr.replace( rattributeQuotes, "='$1']" );

	if ( support.matchesSelector && documentIsHTML &&
		!compilerCache[ expr + " " ] &&
		( !rbuggyMatches || !rbuggyMatches.test( expr ) ) &&
		( !rbuggyQSA     || !rbuggyQSA.test( expr ) ) ) {

		try {
			var ret = matches.call( elem, expr );

			// IE 9's matchesSelector returns false on disconnected nodes
			if ( ret || support.disconnectedMatch ||
					// As well, disconnected nodes are said to be in a document
					// fragment in IE 9
					elem.document && elem.document.nodeType !== 11 ) {
				return ret;
			}
		} catch (e) {}
	}

	return Sizzle( expr, document, null, [ elem ] ).length > 0;
};

Sizzle.contains = function( context, elem ) {
	// Set document vars if needed
	if ( ( context.ownerDocument || context ) !== document ) {
		setDocument( context );
	}
	return contains( context, elem );
};

Sizzle.attr = function( elem, name ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	var fn = Expr.attrHandle[ name.toLowerCase() ],
		// Don't get fooled by Object.prototype properties (jQuery #13807)
		val = fn && hasOwn.call( Expr.attrHandle, name.toLowerCase() ) ?
			fn( elem, name, !documentIsHTML ) :
			undefined;

	return val !== undefined ?
		val :
		support.attributes || !documentIsHTML ?
			elem.getAttribute( name ) :
			(val = elem.getAttributeNode(name)) && val.specified ?
				val.value :
				null;
};

Sizzle.escape = function( sel ) {
	return (sel + "").replace( rcssescape, fcssescape );
};

Sizzle.error = function( msg ) {
	throw new Error( "Syntax error, unrecognized expression: " + msg );
};

/**
 * Document sorting and removing duplicates
 * @param {ArrayLike} results
 */
Sizzle.uniqueSort = function( results ) {
	var elem,
		duplicates = [],
		j = 0,
		i = 0;

	// Unless we *know* we can detect duplicates, assume their presence
	hasDuplicate = !support.detectDuplicates;
	sortInput = !support.sortStable && results.slice( 0 );
	results.sort( sortOrder );

	if ( hasDuplicate ) {
		while ( (elem = results[i++]) ) {
			if ( elem === results[ i ] ) {
				j = duplicates.push( i );
			}
		}
		while ( j-- ) {
			results.splice( duplicates[ j ], 1 );
		}
	}

	// Clear input after sorting to release objects
	// See https://github.com/jquery/sizzle/pull/225
	sortInput = null;

	return results;
};

/**
 * Utility function for retrieving the text value of an array of DOM nodes
 * @param {Array|Element} elem
 */
getText = Sizzle.getText = function( elem ) {
	var node,
		ret = "",
		i = 0,
		nodeType = elem.nodeType;

	if ( !nodeType ) {
		// If no nodeType, this is expected to be an array
		while ( (node = elem[i++]) ) {
			// Do not traverse comment nodes
			ret += getText( node );
		}
	} else if ( nodeType === 1 || nodeType === 9 || nodeType === 11 ) {
		// Use textContent for elements
		// innerText usage removed for consistency of new lines (jQuery #11153)
		if ( typeof elem.textContent === "string" ) {
			return elem.textContent;
		} else {
			// Traverse its children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				ret += getText( elem );
			}
		}
	} else if ( nodeType === 3 || nodeType === 4 ) {
		return elem.nodeValue;
	}
	// Do not include comment or processing instruction nodes

	return ret;
};

Expr = Sizzle.selectors = {

	// Can be adjusted by the user
	cacheLength: 50,

	createPseudo: markFunction,

	match: matchExpr,

	attrHandle: {},

	find: {},

	relative: {
		">": { dir: "parentNode", first: true },
		" ": { dir: "parentNode" },
		"+": { dir: "previousSibling", first: true },
		"~": { dir: "previousSibling" }
	},

	preFilter: {
		"ATTR": function( match ) {
			match[1] = match[1].replace( runescape, funescape );

			// Move the given value to match[3] whether quoted or unquoted
			match[3] = ( match[3] || match[4] || match[5] || "" ).replace( runescape, funescape );

			if ( match[2] === "~=" ) {
				match[3] = " " + match[3] + " ";
			}

			return match.slice( 0, 4 );
		},

		"CHILD": function( match ) {
			/* matches from matchExpr["CHILD"]
				1 type (only|nth|...)
				2 what (child|of-type)
				3 argument (even|odd|\d*|\d*n([+-]\d+)?|...)
				4 xn-component of xn+y argument ([+-]?\d*n|)
				5 sign of xn-component
				6 x of xn-component
				7 sign of y-component
				8 y of y-component
			*/
			match[1] = match[1].toLowerCase();

			if ( match[1].slice( 0, 3 ) === "nth" ) {
				// nth-* requires argument
				if ( !match[3] ) {
					Sizzle.error( match[0] );
				}

				// numeric x and y parameters for Expr.filter.CHILD
				// remember that false/true cast respectively to 0/1
				match[4] = +( match[4] ? match[5] + (match[6] || 1) : 2 * ( match[3] === "even" || match[3] === "odd" ) );
				match[5] = +( ( match[7] + match[8] ) || match[3] === "odd" );

			// other types prohibit arguments
			} else if ( match[3] ) {
				Sizzle.error( match[0] );
			}

			return match;
		},

		"PSEUDO": function( match ) {
			var excess,
				unquoted = !match[6] && match[2];

			if ( matchExpr["CHILD"].test( match[0] ) ) {
				return null;
			}

			// Accept quoted arguments as-is
			if ( match[3] ) {
				match[2] = match[4] || match[5] || "";

			// Strip excess characters from unquoted arguments
			} else if ( unquoted && rpseudo.test( unquoted ) &&
				// Get excess from tokenize (recursively)
				(excess = tokenize( unquoted, true )) &&
				// advance to the next closing parenthesis
				(excess = unquoted.indexOf( ")", unquoted.length - excess ) - unquoted.length) ) {

				// excess is a negative index
				match[0] = match[0].slice( 0, excess );
				match[2] = unquoted.slice( 0, excess );
			}

			// Return only captures needed by the pseudo filter method (type and argument)
			return match.slice( 0, 3 );
		}
	},

	filter: {

		"TAG": function( nodeNameSelector ) {
			var nodeName = nodeNameSelector.replace( runescape, funescape ).toLowerCase();
			return nodeNameSelector === "*" ?
				function() { return true; } :
				function( elem ) {
					return elem.nodeName && elem.nodeName.toLowerCase() === nodeName;
				};
		},

		"CLASS": function( className ) {
			var pattern = classCache[ className + " " ];

			return pattern ||
				(pattern = new RegExp( "(^|" + whitespace + ")" + className + "(" + whitespace + "|$)" )) &&
				classCache( className, function( elem ) {
					return pattern.test( typeof elem.className === "string" && elem.className || typeof elem.getAttribute !== "undefined" && elem.getAttribute("class") || "" );
				});
		},

		"ATTR": function( name, operator, check ) {
			return function( elem ) {
				var result = Sizzle.attr( elem, name );

				if ( result == null ) {
					return operator === "!=";
				}
				if ( !operator ) {
					return true;
				}

				result += "";

				return operator === "=" ? result === check :
					operator === "!=" ? result !== check :
					operator === "^=" ? check && result.indexOf( check ) === 0 :
					operator === "*=" ? check && result.indexOf( check ) > -1 :
					operator === "$=" ? check && result.slice( -check.length ) === check :
					operator === "~=" ? ( " " + result.replace( rwhitespace, " " ) + " " ).indexOf( check ) > -1 :
					operator === "|=" ? result === check || result.slice( 0, check.length + 1 ) === check + "-" :
					false;
			};
		},

		"CHILD": function( type, what, argument, first, last ) {
			var simple = type.slice( 0, 3 ) !== "nth",
				forward = type.slice( -4 ) !== "last",
				ofType = what === "of-type";

			return first === 1 && last === 0 ?

				// Shortcut for :nth-*(n)
				function( elem ) {
					return !!elem.parentNode;
				} :

				function( elem, context, xml ) {
					var cache, uniqueCache, outerCache, node, nodeIndex, start,
						dir = simple !== forward ? "nextSibling" : "previousSibling",
						parent = elem.parentNode,
						name = ofType && elem.nodeName.toLowerCase(),
						useCache = !xml && !ofType,
						diff = false;

					if ( parent ) {

						// :(first|last|only)-(child|of-type)
						if ( simple ) {
							while ( dir ) {
								node = elem;
								while ( (node = node[ dir ]) ) {
									if ( ofType ?
										node.nodeName.toLowerCase() === name :
										node.nodeType === 1 ) {

										return false;
									}
								}
								// Reverse direction for :only-* (if we haven't yet done so)
								start = dir = type === "only" && !start && "nextSibling";
							}
							return true;
						}

						start = [ forward ? parent.firstChild : parent.lastChild ];

						// non-xml :nth-child(...) stores cache data on `parent`
						if ( forward && useCache ) {

							// Seek `elem` from a previously-cached index

							// ...in a gzip-friendly way
							node = parent;
							outerCache = node[ expando ] || (node[ expando ] = {});

							// Support: IE <9 only
							// Defend against cloned attroperties (jQuery gh-1709)
							uniqueCache = outerCache[ node.uniqueID ] ||
								(outerCache[ node.uniqueID ] = {});

							cache = uniqueCache[ type ] || [];
							nodeIndex = cache[ 0 ] === dirruns && cache[ 1 ];
							diff = nodeIndex && cache[ 2 ];
							node = nodeIndex && parent.childNodes[ nodeIndex ];

							while ( (node = ++nodeIndex && node && node[ dir ] ||

								// Fallback to seeking `elem` from the start
								(diff = nodeIndex = 0) || start.pop()) ) {

								// When found, cache indexes on `parent` and break
								if ( node.nodeType === 1 && ++diff && node === elem ) {
									uniqueCache[ type ] = [ dirruns, nodeIndex, diff ];
									break;
								}
							}

						} else {
							// Use previously-cached element index if available
							if ( useCache ) {
								// ...in a gzip-friendly way
								node = elem;
								outerCache = node[ expando ] || (node[ expando ] = {});

								// Support: IE <9 only
								// Defend against cloned attroperties (jQuery gh-1709)
								uniqueCache = outerCache[ node.uniqueID ] ||
									(outerCache[ node.uniqueID ] = {});

								cache = uniqueCache[ type ] || [];
								nodeIndex = cache[ 0 ] === dirruns && cache[ 1 ];
								diff = nodeIndex;
							}

							// xml :nth-child(...)
							// or :nth-last-child(...) or :nth(-last)?-of-type(...)
							if ( diff === false ) {
								// Use the same loop as above to seek `elem` from the start
								while ( (node = ++nodeIndex && node && node[ dir ] ||
									(diff = nodeIndex = 0) || start.pop()) ) {

									if ( ( ofType ?
										node.nodeName.toLowerCase() === name :
										node.nodeType === 1 ) &&
										++diff ) {

										// Cache the index of each encountered element
										if ( useCache ) {
											outerCache = node[ expando ] || (node[ expando ] = {});

											// Support: IE <9 only
											// Defend against cloned attroperties (jQuery gh-1709)
											uniqueCache = outerCache[ node.uniqueID ] ||
												(outerCache[ node.uniqueID ] = {});

											uniqueCache[ type ] = [ dirruns, diff ];
										}

										if ( node === elem ) {
											break;
										}
									}
								}
							}
						}

						// Incorporate the offset, then check against cycle size
						diff -= last;
						return diff === first || ( diff % first === 0 && diff / first >= 0 );
					}
				};
		},

		"PSEUDO": function( pseudo, argument ) {
			// pseudo-class names are case-insensitive
			// http://www.w3.org/TR/selectors/#pseudo-classes
			// Prioritize by case sensitivity in case custom pseudos are added with uppercase letters
			// Remember that setFilters inherits from pseudos
			var args,
				fn = Expr.pseudos[ pseudo ] || Expr.setFilters[ pseudo.toLowerCase() ] ||
					Sizzle.error( "unsupported pseudo: " + pseudo );

			// The user may use createPseudo to indicate that
			// arguments are needed to create the filter function
			// just as Sizzle does
			if ( fn[ expando ] ) {
				return fn( argument );
			}

			// But maintain support for old signatures
			if ( fn.length > 1 ) {
				args = [ pseudo, pseudo, "", argument ];
				return Expr.setFilters.hasOwnProperty( pseudo.toLowerCase() ) ?
					markFunction(function( seed, matches ) {
						var idx,
							matched = fn( seed, argument ),
							i = matched.length;
						while ( i-- ) {
							idx = indexOf( seed, matched[i] );
							seed[ idx ] = !( matches[ idx ] = matched[i] );
						}
					}) :
					function( elem ) {
						return fn( elem, 0, args );
					};
			}

			return fn;
		}
	},

	pseudos: {
		// Potentially complex pseudos
		"not": markFunction(function( selector ) {
			// Trim the selector passed to compile
			// to avoid treating leading and trailing
			// spaces as combinators
			var input = [],
				results = [],
				matcher = compile( selector.replace( rtrim, "$1" ) );

			return matcher[ expando ] ?
				markFunction(function( seed, matches, context, xml ) {
					var elem,
						unmatched = matcher( seed, null, xml, [] ),
						i = seed.length;

					// Match elements unmatched by `matcher`
					while ( i-- ) {
						if ( (elem = unmatched[i]) ) {
							seed[i] = !(matches[i] = elem);
						}
					}
				}) :
				function( elem, context, xml ) {
					input[0] = elem;
					matcher( input, null, xml, results );
					// Don't keep the element (issue #299)
					input[0] = null;
					return !results.pop();
				};
		}),

		"has": markFunction(function( selector ) {
			return function( elem ) {
				return Sizzle( selector, elem ).length > 0;
			};
		}),

		"contains": markFunction(function( text ) {
			text = text.replace( runescape, funescape );
			return function( elem ) {
				return ( elem.textContent || elem.innerText || getText( elem ) ).indexOf( text ) > -1;
			};
		}),

		// "Whether an element is represented by a :lang() selector
		// is based solely on the element's language value
		// being equal to the identifier C,
		// or beginning with the identifier C immediately followed by "-".
		// The matching of C against the element's language value is performed case-insensitively.
		// The identifier C does not have to be a valid language name."
		// http://www.w3.org/TR/selectors/#lang-pseudo
		"lang": markFunction( function( lang ) {
			// lang value must be a valid identifier
			if ( !ridentifier.test(lang || "") ) {
				Sizzle.error( "unsupported lang: " + lang );
			}
			lang = lang.replace( runescape, funescape ).toLowerCase();
			return function( elem ) {
				var elemLang;
				do {
					if ( (elemLang = documentIsHTML ?
						elem.lang :
						elem.getAttribute("xml:lang") || elem.getAttribute("lang")) ) {

						elemLang = elemLang.toLowerCase();
						return elemLang === lang || elemLang.indexOf( lang + "-" ) === 0;
					}
				} while ( (elem = elem.parentNode) && elem.nodeType === 1 );
				return false;
			};
		}),

		// Miscellaneous
		"target": function( elem ) {
			var hash = window.location && window.location.hash;
			return hash && hash.slice( 1 ) === elem.id;
		},

		"root": function( elem ) {
			return elem === docElem;
		},

		"focus": function( elem ) {
			return elem === document.activeElement && (!document.hasFocus || document.hasFocus()) && !!(elem.type || elem.href || ~elem.tabIndex);
		},

		// Boolean properties
		"enabled": createDisabledPseudo( false ),
		"disabled": createDisabledPseudo( true ),

		"checked": function( elem ) {
			// In CSS3, :checked should return both checked and selected elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			var nodeName = elem.nodeName.toLowerCase();
			return (nodeName === "input" && !!elem.checked) || (nodeName === "option" && !!elem.selected);
		},

		"selected": function( elem ) {
			// Accessing this property makes selected-by-default
			// options in Safari work properly
			if ( elem.parentNode ) {
				elem.parentNode.selectedIndex;
			}

			return elem.selected === true;
		},

		// Contents
		"empty": function( elem ) {
			// http://www.w3.org/TR/selectors/#empty-pseudo
			// :empty is negated by element (1) or content nodes (text: 3; cdata: 4; entity ref: 5),
			//   but not by others (comment: 8; processing instruction: 7; etc.)
			// nodeType < 6 works because attributes (2) do not appear as children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				if ( elem.nodeType < 6 ) {
					return false;
				}
			}
			return true;
		},

		"parent": function( elem ) {
			return !Expr.pseudos["empty"]( elem );
		},

		// Element/input types
		"header": function( elem ) {
			return rheader.test( elem.nodeName );
		},

		"input": function( elem ) {
			return rinputs.test( elem.nodeName );
		},

		"button": function( elem ) {
			var name = elem.nodeName.toLowerCase();
			return name === "input" && elem.type === "button" || name === "button";
		},

		"text": function( elem ) {
			var attr;
			return elem.nodeName.toLowerCase() === "input" &&
				elem.type === "text" &&

				// Support: IE<8
				// New HTML5 attribute values (e.g., "search") appear with elem.type === "text"
				( (attr = elem.getAttribute("type")) == null || attr.toLowerCase() === "text" );
		},

		// Position-in-collection
		"first": createPositionalPseudo(function() {
			return [ 0 ];
		}),

		"last": createPositionalPseudo(function( matchIndexes, length ) {
			return [ length - 1 ];
		}),

		"eq": createPositionalPseudo(function( matchIndexes, length, argument ) {
			return [ argument < 0 ? argument + length : argument ];
		}),

		"even": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 0;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"odd": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 1;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"lt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; --i >= 0; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"gt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; ++i < length; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		})
	}
};

Expr.pseudos["nth"] = Expr.pseudos["eq"];

// Add button/input type pseudos
for ( i in { radio: true, checkbox: true, file: true, password: true, image: true } ) {
	Expr.pseudos[ i ] = createInputPseudo( i );
}
for ( i in { submit: true, reset: true } ) {
	Expr.pseudos[ i ] = createButtonPseudo( i );
}

// Easy API for creating new setFilters
function setFilters() {}
setFilters.prototype = Expr.filters = Expr.pseudos;
Expr.setFilters = new setFilters();

tokenize = Sizzle.tokenize = function( selector, parseOnly ) {
	var matched, match, tokens, type,
		soFar, groups, preFilters,
		cached = tokenCache[ selector + " " ];

	if ( cached ) {
		return parseOnly ? 0 : cached.slice( 0 );
	}

	soFar = selector;
	groups = [];
	preFilters = Expr.preFilter;

	while ( soFar ) {

		// Comma and first run
		if ( !matched || (match = rcomma.exec( soFar )) ) {
			if ( match ) {
				// Don't consume trailing commas as valid
				soFar = soFar.slice( match[0].length ) || soFar;
			}
			groups.push( (tokens = []) );
		}

		matched = false;

		// Combinators
		if ( (match = rcombinators.exec( soFar )) ) {
			matched = match.shift();
			tokens.push({
				value: matched,
				// Cast descendant combinators to space
				type: match[0].replace( rtrim, " " )
			});
			soFar = soFar.slice( matched.length );
		}

		// Filters
		for ( type in Expr.filter ) {
			if ( (match = matchExpr[ type ].exec( soFar )) && (!preFilters[ type ] ||
				(match = preFilters[ type ]( match ))) ) {
				matched = match.shift();
				tokens.push({
					value: matched,
					type: type,
					matches: match
				});
				soFar = soFar.slice( matched.length );
			}
		}

		if ( !matched ) {
			break;
		}
	}

	// Return the length of the invalid excess
	// if we're just parsing
	// Otherwise, throw an error or return tokens
	return parseOnly ?
		soFar.length :
		soFar ?
			Sizzle.error( selector ) :
			// Cache the tokens
			tokenCache( selector, groups ).slice( 0 );
};

function toSelector( tokens ) {
	var i = 0,
		len = tokens.length,
		selector = "";
	for ( ; i < len; i++ ) {
		selector += tokens[i].value;
	}
	return selector;
}

function addCombinator( matcher, combinator, base ) {
	var dir = combinator.dir,
		skip = combinator.next,
		key = skip || dir,
		checkNonElements = base && key === "parentNode",
		doneName = done++;

	return combinator.first ?
		// Check against closest ancestor/preceding element
		function( elem, context, xml ) {
			while ( (elem = elem[ dir ]) ) {
				if ( elem.nodeType === 1 || checkNonElements ) {
					return matcher( elem, context, xml );
				}
			}
			return false;
		} :

		// Check against all ancestor/preceding elements
		function( elem, context, xml ) {
			var oldCache, uniqueCache, outerCache,
				newCache = [ dirruns, doneName ];

			// We can't set arbitrary data on XML nodes, so they don't benefit from combinator caching
			if ( xml ) {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						if ( matcher( elem, context, xml ) ) {
							return true;
						}
					}
				}
			} else {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						outerCache = elem[ expando ] || (elem[ expando ] = {});

						// Support: IE <9 only
						// Defend against cloned attroperties (jQuery gh-1709)
						uniqueCache = outerCache[ elem.uniqueID ] || (outerCache[ elem.uniqueID ] = {});

						if ( skip && skip === elem.nodeName.toLowerCase() ) {
							elem = elem[ dir ] || elem;
						} else if ( (oldCache = uniqueCache[ key ]) &&
							oldCache[ 0 ] === dirruns && oldCache[ 1 ] === doneName ) {

							// Assign to newCache so results back-propagate to previous elements
							return (newCache[ 2 ] = oldCache[ 2 ]);
						} else {
							// Reuse newcache so results back-propagate to previous elements
							uniqueCache[ key ] = newCache;

							// A match means we're done; a fail means we have to keep checking
							if ( (newCache[ 2 ] = matcher( elem, context, xml )) ) {
								return true;
							}
						}
					}
				}
			}
			return false;
		};
}

function elementMatcher( matchers ) {
	return matchers.length > 1 ?
		function( elem, context, xml ) {
			var i = matchers.length;
			while ( i-- ) {
				if ( !matchers[i]( elem, context, xml ) ) {
					return false;
				}
			}
			return true;
		} :
		matchers[0];
}

function multipleContexts( selector, contexts, results ) {
	var i = 0,
		len = contexts.length;
	for ( ; i < len; i++ ) {
		Sizzle( selector, contexts[i], results );
	}
	return results;
}

function condense( unmatched, map, filter, context, xml ) {
	var elem,
		newUnmatched = [],
		i = 0,
		len = unmatched.length,
		mapped = map != null;

	for ( ; i < len; i++ ) {
		if ( (elem = unmatched[i]) ) {
			if ( !filter || filter( elem, context, xml ) ) {
				newUnmatched.push( elem );
				if ( mapped ) {
					map.push( i );
				}
			}
		}
	}

	return newUnmatched;
}

function setMatcher( preFilter, selector, matcher, postFilter, postFinder, postSelector ) {
	if ( postFilter && !postFilter[ expando ] ) {
		postFilter = setMatcher( postFilter );
	}
	if ( postFinder && !postFinder[ expando ] ) {
		postFinder = setMatcher( postFinder, postSelector );
	}
	return markFunction(function( seed, results, context, xml ) {
		var temp, i, elem,
			preMap = [],
			postMap = [],
			preexisting = results.length,

			// Get initial elements from seed or context
			elems = seed || multipleContexts( selector || "*", context.nodeType ? [ context ] : context, [] ),

			// Prefilter to get matcher input, preserving a map for seed-results synchronization
			matcherIn = preFilter && ( seed || !selector ) ?
				condense( elems, preMap, preFilter, context, xml ) :
				elems,

			matcherOut = matcher ?
				// If we have a postFinder, or filtered seed, or non-seed postFilter or preexisting results,
				postFinder || ( seed ? preFilter : preexisting || postFilter ) ?

					// ...intermediate processing is necessary
					[] :

					// ...otherwise use results directly
					results :
				matcherIn;

		// Find primary matches
		if ( matcher ) {
			matcher( matcherIn, matcherOut, context, xml );
		}

		// Apply postFilter
		if ( postFilter ) {
			temp = condense( matcherOut, postMap );
			postFilter( temp, [], context, xml );

			// Un-match failing elements by moving them back to matcherIn
			i = temp.length;
			while ( i-- ) {
				if ( (elem = temp[i]) ) {
					matcherOut[ postMap[i] ] = !(matcherIn[ postMap[i] ] = elem);
				}
			}
		}

		if ( seed ) {
			if ( postFinder || preFilter ) {
				if ( postFinder ) {
					// Get the final matcherOut by condensing this intermediate into postFinder contexts
					temp = [];
					i = matcherOut.length;
					while ( i-- ) {
						if ( (elem = matcherOut[i]) ) {
							// Restore matcherIn since elem is not yet a final match
							temp.push( (matcherIn[i] = elem) );
						}
					}
					postFinder( null, (matcherOut = []), temp, xml );
				}

				// Move matched elements from seed to results to keep them synchronized
				i = matcherOut.length;
				while ( i-- ) {
					if ( (elem = matcherOut[i]) &&
						(temp = postFinder ? indexOf( seed, elem ) : preMap[i]) > -1 ) {

						seed[temp] = !(results[temp] = elem);
					}
				}
			}

		// Add elements to results, through postFinder if defined
		} else {
			matcherOut = condense(
				matcherOut === results ?
					matcherOut.splice( preexisting, matcherOut.length ) :
					matcherOut
			);
			if ( postFinder ) {
				postFinder( null, results, matcherOut, xml );
			} else {
				push.apply( results, matcherOut );
			}
		}
	});
}

function matcherFromTokens( tokens ) {
	var checkContext, matcher, j,
		len = tokens.length,
		leadingRelative = Expr.relative[ tokens[0].type ],
		implicitRelative = leadingRelative || Expr.relative[" "],
		i = leadingRelative ? 1 : 0,

		// The foundational matcher ensures that elements are reachable from top-level context(s)
		matchContext = addCombinator( function( elem ) {
			return elem === checkContext;
		}, implicitRelative, true ),
		matchAnyContext = addCombinator( function( elem ) {
			return indexOf( checkContext, elem ) > -1;
		}, implicitRelative, true ),
		matchers = [ function( elem, context, xml ) {
			var ret = ( !leadingRelative && ( xml || context !== outermostContext ) ) || (
				(checkContext = context).nodeType ?
					matchContext( elem, context, xml ) :
					matchAnyContext( elem, context, xml ) );
			// Avoid hanging onto element (issue #299)
			checkContext = null;
			return ret;
		} ];

	for ( ; i < len; i++ ) {
		if ( (matcher = Expr.relative[ tokens[i].type ]) ) {
			matchers = [ addCombinator(elementMatcher( matchers ), matcher) ];
		} else {
			matcher = Expr.filter[ tokens[i].type ].apply( null, tokens[i].matches );

			// Return special upon seeing a positional matcher
			if ( matcher[ expando ] ) {
				// Find the next relative operator (if any) for proper handling
				j = ++i;
				for ( ; j < len; j++ ) {
					if ( Expr.relative[ tokens[j].type ] ) {
						break;
					}
				}
				return setMatcher(
					i > 1 && elementMatcher( matchers ),
					i > 1 && toSelector(
						// If the preceding token was a descendant combinator, insert an implicit any-element `*`
						tokens.slice( 0, i - 1 ).concat({ value: tokens[ i - 2 ].type === " " ? "*" : "" })
					).replace( rtrim, "$1" ),
					matcher,
					i < j && matcherFromTokens( tokens.slice( i, j ) ),
					j < len && matcherFromTokens( (tokens = tokens.slice( j )) ),
					j < len && toSelector( tokens )
				);
			}
			matchers.push( matcher );
		}
	}

	return elementMatcher( matchers );
}

function matcherFromGroupMatchers( elementMatchers, setMatchers ) {
	var bySet = setMatchers.length > 0,
		byElement = elementMatchers.length > 0,
		superMatcher = function( seed, context, xml, results, outermost ) {
			var elem, j, matcher,
				matchedCount = 0,
				i = "0",
				unmatched = seed && [],
				setMatched = [],
				contextBackup = outermostContext,
				// We must always have either seed elements or outermost context
				elems = seed || byElement && Expr.find["TAG"]( "*", outermost ),
				// Use integer dirruns iff this is the outermost matcher
				dirrunsUnique = (dirruns += contextBackup == null ? 1 : Math.random() || 0.1),
				len = elems.length;

			if ( outermost ) {
				outermostContext = context === document || context || outermost;
			}

			// Add elements passing elementMatchers directly to results
			// Support: IE<9, Safari
			// Tolerate NodeList properties (IE: "length"; Safari: <number>) matching elements by id
			for ( ; i !== len && (elem = elems[i]) != null; i++ ) {
				if ( byElement && elem ) {
					j = 0;
					if ( !context && elem.ownerDocument !== document ) {
						setDocument( elem );
						xml = !documentIsHTML;
					}
					while ( (matcher = elementMatchers[j++]) ) {
						if ( matcher( elem, context || document, xml) ) {
							results.push( elem );
							break;
						}
					}
					if ( outermost ) {
						dirruns = dirrunsUnique;
					}
				}

				// Track unmatched elements for set filters
				if ( bySet ) {
					// They will have gone through all possible matchers
					if ( (elem = !matcher && elem) ) {
						matchedCount--;
					}

					// Lengthen the array for every element, matched or not
					if ( seed ) {
						unmatched.push( elem );
					}
				}
			}

			// `i` is now the count of elements visited above, and adding it to `matchedCount`
			// makes the latter nonnegative.
			matchedCount += i;

			// Apply set filters to unmatched elements
			// NOTE: This can be skipped if there are no unmatched elements (i.e., `matchedCount`
			// equals `i`), unless we didn't visit _any_ elements in the above loop because we have
			// no element matchers and no seed.
			// Incrementing an initially-string "0" `i` allows `i` to remain a string only in that
			// case, which will result in a "00" `matchedCount` that differs from `i` but is also
			// numerically zero.
			if ( bySet && i !== matchedCount ) {
				j = 0;
				while ( (matcher = setMatchers[j++]) ) {
					matcher( unmatched, setMatched, context, xml );
				}

				if ( seed ) {
					// Reintegrate element matches to eliminate the need for sorting
					if ( matchedCount > 0 ) {
						while ( i-- ) {
							if ( !(unmatched[i] || setMatched[i]) ) {
								setMatched[i] = pop.call( results );
							}
						}
					}

					// Discard index placeholder values to get only actual matches
					setMatched = condense( setMatched );
				}

				// Add matches to results
				push.apply( results, setMatched );

				// Seedless set matches succeeding multiple successful matchers stipulate sorting
				if ( outermost && !seed && setMatched.length > 0 &&
					( matchedCount + setMatchers.length ) > 1 ) {

					Sizzle.uniqueSort( results );
				}
			}

			// Override manipulation of globals by nested matchers
			if ( outermost ) {
				dirruns = dirrunsUnique;
				outermostContext = contextBackup;
			}

			return unmatched;
		};

	return bySet ?
		markFunction( superMatcher ) :
		superMatcher;
}

compile = Sizzle.compile = function( selector, match /* Internal Use Only */ ) {
	var i,
		setMatchers = [],
		elementMatchers = [],
		cached = compilerCache[ selector + " " ];

	if ( !cached ) {
		// Generate a function of recursive functions that can be used to check each element
		if ( !match ) {
			match = tokenize( selector );
		}
		i = match.length;
		while ( i-- ) {
			cached = matcherFromTokens( match[i] );
			if ( cached[ expando ] ) {
				setMatchers.push( cached );
			} else {
				elementMatchers.push( cached );
			}
		}

		// Cache the compiled function
		cached = compilerCache( selector, matcherFromGroupMatchers( elementMatchers, setMatchers ) );

		// Save selector and tokenization
		cached.selector = selector;
	}
	return cached;
};

/**
 * A low-level selection function that works with Sizzle's compiled
 *  selector functions
 * @param {String|Function} selector A selector or a pre-compiled
 *  selector function built with Sizzle.compile
 * @param {Element} context
 * @param {Array} [results]
 * @param {Array} [seed] A set of elements to match against
 */
select = Sizzle.select = function( selector, context, results, seed ) {
	var i, tokens, token, type, find,
		compiled = typeof selector === "function" && selector,
		match = !seed && tokenize( (selector = compiled.selector || selector) );

	results = results || [];

	// Try to minimize operations if there is only one selector in the list and no seed
	// (the latter of which guarantees us context)
	if ( match.length === 1 ) {

		// Reduce context if the leading compound selector is an ID
		tokens = match[0] = match[0].slice( 0 );
		if ( tokens.length > 2 && (token = tokens[0]).type === "ID" &&
				context.nodeType === 9 && documentIsHTML && Expr.relative[ tokens[1].type ] ) {

			context = ( Expr.find["ID"]( token.matches[0].replace(runescape, funescape), context ) || [] )[0];
			if ( !context ) {
				return results;

			// Precompiled matchers will still verify ancestry, so step up a level
			} else if ( compiled ) {
				context = context.parentNode;
			}

			selector = selector.slice( tokens.shift().value.length );
		}

		// Fetch a seed set for right-to-left matching
		i = matchExpr["needsContext"].test( selector ) ? 0 : tokens.length;
		while ( i-- ) {
			token = tokens[i];

			// Abort if we hit a combinator
			if ( Expr.relative[ (type = token.type) ] ) {
				break;
			}
			if ( (find = Expr.find[ type ]) ) {
				// Search, expanding context for leading sibling combinators
				if ( (seed = find(
					token.matches[0].replace( runescape, funescape ),
					rsibling.test( tokens[0].type ) && testContext( context.parentNode ) || context
				)) ) {

					// If seed is empty or no tokens remain, we can return early
					tokens.splice( i, 1 );
					selector = seed.length && toSelector( tokens );
					if ( !selector ) {
						push.apply( results, seed );
						return results;
					}

					break;
				}
			}
		}
	}

	// Compile and execute a filtering function if one is not provided
	// Provide `match` to avoid retokenization if we modified the selector above
	( compiled || compile( selector, match ) )(
		seed,
		context,
		!documentIsHTML,
		results,
		!context || rsibling.test( selector ) && testContext( context.parentNode ) || context
	);
	return results;
};

// One-time assignments

// Sort stability
support.sortStable = expando.split("").sort( sortOrder ).join("") === expando;

// Support: Chrome 14-35+
// Always assume duplicates if they aren't passed to the comparison function
support.detectDuplicates = !!hasDuplicate;

// Initialize against the default document
setDocument();

// Support: Webkit<537.32 - Safari 6.0.3/Chrome 25 (fixed in Chrome 27)
// Detached nodes confoundingly follow *each other*
support.sortDetached = assert(function( el ) {
	// Should return 1, but returns 4 (following)
	return el.compareDocumentPosition( document.createElement("fieldset") ) & 1;
});

// Support: IE<8
// Prevent attribute/property "interpolation"
// https://msdn.microsoft.com/en-us/library/ms536429%28VS.85%29.aspx
if ( !assert(function( el ) {
	el.innerHTML = "<a href='#'></a>";
	return el.firstChild.getAttribute("href") === "#" ;
}) ) {
	addHandle( "type|href|height|width", function( elem, name, isXML ) {
		if ( !isXML ) {
			return elem.getAttribute( name, name.toLowerCase() === "type" ? 1 : 2 );
		}
	});
}

// Support: IE<9
// Use defaultValue in place of getAttribute("value")
if ( !support.attributes || !assert(function( el ) {
	el.innerHTML = "<input/>";
	el.firstChild.setAttribute( "value", "" );
	return el.firstChild.getAttribute( "value" ) === "";
}) ) {
	addHandle( "value", function( elem, name, isXML ) {
		if ( !isXML && elem.nodeName.toLowerCase() === "input" ) {
			return elem.defaultValue;
		}
	});
}

// Support: IE<9
// Use getAttributeNode to fetch booleans when getAttribute lies
if ( !assert(function( el ) {
	return el.getAttribute("disabled") == null;
}) ) {
	addHandle( booleans, function( elem, name, isXML ) {
		var val;
		if ( !isXML ) {
			return elem[ name ] === true ? name.toLowerCase() :
					(val = elem.getAttributeNode( name )) && val.specified ?
					val.value :
				null;
		}
	});
}

return Sizzle;

})( window );



jQuery.find = Sizzle;
jQuery.expr = Sizzle.selectors;

// Deprecated
jQuery.expr[ ":" ] = jQuery.expr.pseudos;
jQuery.uniqueSort = jQuery.unique = Sizzle.uniqueSort;
jQuery.text = Sizzle.getText;
jQuery.isXMLDoc = Sizzle.isXML;
jQuery.contains = Sizzle.contains;
jQuery.escapeSelector = Sizzle.escape;




var dir = function( elem, dir, until ) {
	var matched = [],
		truncate = until !== undefined;

	while ( ( elem = elem[ dir ] ) && elem.nodeType !== 9 ) {
		if ( elem.nodeType === 1 ) {
			if ( truncate && jQuery( elem ).is( until ) ) {
				break;
			}
			matched.push( elem );
		}
	}
	return matched;
};


var siblings = function( n, elem ) {
	var matched = [];

	for ( ; n; n = n.nextSibling ) {
		if ( n.nodeType === 1 && n !== elem ) {
			matched.push( n );
		}
	}

	return matched;
};


var rneedsContext = jQuery.expr.match.needsContext;



function nodeName( elem, name ) {

  return elem.nodeName && elem.nodeName.toLowerCase() === name.toLowerCase();

};
var rsingleTag = ( /^<([a-z][^\/\0>:\x20\t\r\n\f]*)[\x20\t\r\n\f]*\/?>(?:<\/\1>|)$/i );



// Implement the identical functionality for filter and not
function winnow( elements, qualifier, not ) {
	if ( isFunction( qualifier ) ) {
		return jQuery.grep( elements, function( elem, i ) {
			return !!qualifier.call( elem, i, elem ) !== not;
		} );
	}

	// Single element
	if ( qualifier.nodeType ) {
		return jQuery.grep( elements, function( elem ) {
			return ( elem === qualifier ) !== not;
		} );
	}

	// Arraylike of elements (jQuery, arguments, Array)
	if ( typeof qualifier !== "string" ) {
		return jQuery.grep( elements, function( elem ) {
			return ( indexOf.call( qualifier, elem ) > -1 ) !== not;
		} );
	}

	// Filtered directly for both simple and complex selectors
	return jQuery.filter( qualifier, elements, not );
}

jQuery.filter = function( expr, elems, not ) {
	var elem = elems[ 0 ];

	if ( not ) {
		expr = ":not(" + expr + ")";
	}

	if ( elems.length === 1 && elem.nodeType === 1 ) {
		return jQuery.find.matchesSelector( elem, expr ) ? [ elem ] : [];
	}

	return jQuery.find.matches( expr, jQuery.grep( elems, function( elem ) {
		return elem.nodeType === 1;
	} ) );
};

jQuery.fn.extend( {
	find: function( selector ) {
		var i, ret,
			len = this.length,
			self = this;

		if ( typeof selector !== "string" ) {
			return this.pushStack( jQuery( selector ).filter( function() {
				for ( i = 0; i < len; i++ ) {
					if ( jQuery.contains( self[ i ], this ) ) {
						return true;
					}
				}
			} ) );
		}

		ret = this.pushStack( [] );

		for ( i = 0; i < len; i++ ) {
			jQuery.find( selector, self[ i ], ret );
		}

		return len > 1 ? jQuery.uniqueSort( ret ) : ret;
	},
	filter: function( selector ) {
		return this.pushStack( winnow( this, selector || [], false ) );
	},
	not: function( selector ) {
		return this.pushStack( winnow( this, selector || [], true ) );
	},
	is: function( selector ) {
		return !!winnow(
			this,

			// If this is a positional/relative selector, check membership in the returned set
			// so $("p:first").is("p:last") won't return true for a doc with two "p".
			typeof selector === "string" && rneedsContext.test( selector ) ?
				jQuery( selector ) :
				selector || [],
			false
		).length;
	}
} );


// Initialize a jQuery object


// A central reference to the root jQuery(document)
var rootjQuery,

	// A simple way to check for HTML strings
	// Prioritize #id over <tag> to avoid XSS via location.hash (#9521)
	// Strict HTML recognition (#11290: must start with <)
	// Shortcut simple #id case for speed
	rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+))$/,

	init = jQuery.fn.init = function( selector, context, root ) {
		var match, elem;

		// HANDLE: $(""), $(null), $(undefined), $(false)
		if ( !selector ) {
			return this;
		}

		// Method init() accepts an alternate rootjQuery
		// so migrate can support jQuery.sub (gh-2101)
		root = root || rootjQuery;

		// Handle HTML strings
		if ( typeof selector === "string" ) {
			if ( selector[ 0 ] === "<" &&
				selector[ selector.length - 1 ] === ">" &&
				selector.length >= 3 ) {

				// Assume that strings that start and end with <> are HTML and skip the regex check
				match = [ null, selector, null ];

			} else {
				match = rquickExpr.exec( selector );
			}

			// Match html or make sure no context is specified for #id
			if ( match && ( match[ 1 ] || !context ) ) {

				// HANDLE: $(html) -> $(array)
				if ( match[ 1 ] ) {
					context = context instanceof jQuery ? context[ 0 ] : context;

					// Option to run scripts is true for back-compat
					// Intentionally let the error be thrown if parseHTML is not present
					jQuery.merge( this, jQuery.parseHTML(
						match[ 1 ],
						context && context.nodeType ? context.ownerDocument || context : document,
						true
					) );

					// HANDLE: $(html, props)
					if ( rsingleTag.test( match[ 1 ] ) && jQuery.isPlainObject( context ) ) {
						for ( match in context ) {

							// Properties of context are called as methods if possible
							if ( isFunction( this[ match ] ) ) {
								this[ match ]( context[ match ] );

							// ...and otherwise set as attributes
							} else {
								this.attr( match, context[ match ] );
							}
						}
					}

					return this;

				// HANDLE: $(#id)
				} else {
					elem = document.getElementById( match[ 2 ] );

					if ( elem ) {

						// Inject the element directly into the jQuery object
						this[ 0 ] = elem;
						this.length = 1;
					}
					return this;
				}

			// HANDLE: $(expr, $(...))
			} else if ( !context || context.jquery ) {
				return ( context || root ).find( selector );

			// HANDLE: $(expr, context)
			// (which is just equivalent to: $(context).find(expr)
			} else {
				return this.constructor( context ).find( selector );
			}

		// HANDLE: $(DOMElement)
		} else if ( selector.nodeType ) {
			this[ 0 ] = selector;
			this.length = 1;
			return this;

		// HANDLE: $(function)
		// Shortcut for document ready
		} else if ( isFunction( selector ) ) {
			return root.ready !== undefined ?
				root.ready( selector ) :

				// Execute immediately if ready is not present
				selector( jQuery );
		}

		return jQuery.makeArray( selector, this );
	};

// Give the init function the jQuery prototype for later instantiation
init.prototype = jQuery.fn;

// Initialize central reference
rootjQuery = jQuery( document );


var rparentsprev = /^(?:parents|prev(?:Until|All))/,

	// Methods guaranteed to produce a unique set when starting from a unique set
	guaranteedUnique = {
		children: true,
		contents: true,
		next: true,
		prev: true
	};

jQuery.fn.extend( {
	has: function( target ) {
		var targets = jQuery( target, this ),
			l = targets.length;

		return this.filter( function() {
			var i = 0;
			for ( ; i < l; i++ ) {
				if ( jQuery.contains( this, targets[ i ] ) ) {
					return true;
				}
			}
		} );
	},

	closest: function( selectors, context ) {
		var cur,
			i = 0,
			l = this.length,
			matched = [],
			targets = typeof selectors !== "string" && jQuery( selectors );

		// Positional selectors never match, since there's no _selection_ context
		if ( !rneedsContext.test( selectors ) ) {
			for ( ; i < l; i++ ) {
				for ( cur = this[ i ]; cur && cur !== context; cur = cur.parentNode ) {

					// Always skip document fragments
					if ( cur.nodeType < 11 && ( targets ?
						targets.index( cur ) > -1 :

						// Don't pass non-elements to Sizzle
						cur.nodeType === 1 &&
							jQuery.find.matchesSelector( cur, selectors ) ) ) {

						matched.push( cur );
						break;
					}
				}
			}
		}

		return this.pushStack( matched.length > 1 ? jQuery.uniqueSort( matched ) : matched );
	},

	// Determine the position of an element within the set
	index: function( elem ) {

		// No argument, return index in parent
		if ( !elem ) {
			return ( this[ 0 ] && this[ 0 ].parentNode ) ? this.first().prevAll().length : -1;
		}

		// Index in selector
		if ( typeof elem === "string" ) {
			return indexOf.call( jQuery( elem ), this[ 0 ] );
		}

		// Locate the position of the desired element
		return indexOf.call( this,

			// If it receives a jQuery object, the first element is used
			elem.jquery ? elem[ 0 ] : elem
		);
	},

	add: function( selector, context ) {
		return this.pushStack(
			jQuery.uniqueSort(
				jQuery.merge( this.get(), jQuery( selector, context ) )
			)
		);
	},

	addBack: function( selector ) {
		return this.add( selector == null ?
			this.prevObject : this.prevObject.filter( selector )
		);
	}
} );

function sibling( cur, dir ) {
	while ( ( cur = cur[ dir ] ) && cur.nodeType !== 1 ) {}
	return cur;
}

jQuery.each( {
	parent: function( elem ) {
		var parent = elem.parentNode;
		return parent && parent.nodeType !== 11 ? parent : null;
	},
	parents: function( elem ) {
		return dir( elem, "parentNode" );
	},
	parentsUntil: function( elem, i, until ) {
		return dir( elem, "parentNode", until );
	},
	next: function( elem ) {
		return sibling( elem, "nextSibling" );
	},
	prev: function( elem ) {
		return sibling( elem, "previousSibling" );
	},
	nextAll: function( elem ) {
		return dir( elem, "nextSibling" );
	},
	prevAll: function( elem ) {
		return dir( elem, "previousSibling" );
	},
	nextUntil: function( elem, i, until ) {
		return dir( elem, "nextSibling", until );
	},
	prevUntil: function( elem, i, until ) {
		return dir( elem, "previousSibling", until );
	},
	siblings: function( elem ) {
		return siblings( ( elem.parentNode || {} ).firstChild, elem );
	},
	children: function( elem ) {
		return siblings( elem.firstChild );
	},
	contents: function( elem ) {
        if ( nodeName( elem, "iframe" ) ) {
            return elem.contentDocument;
        }

        // Support: IE 9 - 11 only, iOS 7 only, Android Browser <=4.3 only
        // Treat the template element as a regular one in browsers that
        // don't support it.
        if ( nodeName( elem, "template" ) ) {
            elem = elem.content || elem;
        }

        return jQuery.merge( [], elem.childNodes );
	}
}, function( name, fn ) {
	jQuery.fn[ name ] = function( until, selector ) {
		var matched = jQuery.map( this, fn, until );

		if ( name.slice( -5 ) !== "Until" ) {
			selector = until;
		}

		if ( selector && typeof selector === "string" ) {
			matched = jQuery.filter( selector, matched );
		}

		if ( this.length > 1 ) {

			// Remove duplicates
			if ( !guaranteedUnique[ name ] ) {
				jQuery.uniqueSort( matched );
			}

			// Reverse order for parents* and prev-derivatives
			if ( rparentsprev.test( name ) ) {
				matched.reverse();
			}
		}

		return this.pushStack( matched );
	};
} );
var rnothtmlwhite = ( /[^\x20\t\r\n\f]+/g );



// Convert String-formatted options into Object-formatted ones
function createOptions( options ) {
	var object = {};
	jQuery.each( options.match( rnothtmlwhite ) || [], function( _, flag ) {
		object[ flag ] = true;
	} );
	return object;
}

/*
 * Create a callback list using the following parameters:
 *
 *	options: an optional list of space-separated options that will change how
 *			the callback list behaves or a more traditional option object
 *
 * By default a callback list will act like an event callback list and can be
 * "fired" multiple times.
 *
 * Possible options:
 *
 *	once:			will ensure the callback list can only be fired once (like a Deferred)
 *
 *	memory:			will keep track of previous values and will call any callback added
 *					after the list has been fired right away with the latest "memorized"
 *					values (like a Deferred)
 *
 *	unique:			will ensure a callback can only be added once (no duplicate in the list)
 *
 *	stopOnFalse:	interrupt callings when a callback returns false
 *
 */
jQuery.Callbacks = function( options ) {

	// Convert options from String-formatted to Object-formatted if needed
	// (we check in cache first)
	options = typeof options === "string" ?
		createOptions( options ) :
		jQuery.extend( {}, options );

	var // Flag to know if list is currently firing
		firing,

		// Last fire value for non-forgettable lists
		memory,

		// Flag to know if list was already fired
		fired,

		// Flag to prevent firing
		locked,

		// Actual callback list
		list = [],

		// Queue of execution data for repeatable lists
		queue = [],

		// Index of currently firing callback (modified by add/remove as needed)
		firingIndex = -1,

		// Fire callbacks
		fire = function() {

			// Enforce single-firing
			locked = locked || options.once;

			// Execute callbacks for all pending executions,
			// respecting firingIndex overrides and runtime changes
			fired = firing = true;
			for ( ; queue.length; firingIndex = -1 ) {
				memory = queue.shift();
				while ( ++firingIndex < list.length ) {

					// Run callback and check for early termination
					if ( list[ firingIndex ].apply( memory[ 0 ], memory[ 1 ] ) === false &&
						options.stopOnFalse ) {

						// Jump to end and forget the data so .add doesn't re-fire
						firingIndex = list.length;
						memory = false;
					}
				}
			}

			// Forget the data if we're done with it
			if ( !options.memory ) {
				memory = false;
			}

			firing = false;

			// Clean up if we're done firing for good
			if ( locked ) {

				// Keep an empty list if we have data for future add calls
				if ( memory ) {
					list = [];

				// Otherwise, this object is spent
				} else {
					list = "";
				}
			}
		},

		// Actual Callbacks object
		self = {

			// Add a callback or a collection of callbacks to the list
			add: function() {
				if ( list ) {

					// If we have memory from a past run, we should fire after adding
					if ( memory && !firing ) {
						firingIndex = list.length - 1;
						queue.push( memory );
					}

					( function add( args ) {
						jQuery.each( args, function( _, arg ) {
							if ( isFunction( arg ) ) {
								if ( !options.unique || !self.has( arg ) ) {
									list.push( arg );
								}
							} else if ( arg && arg.length && toType( arg ) !== "string" ) {

								// Inspect recursively
								add( arg );
							}
						} );
					} )( arguments );

					if ( memory && !firing ) {
						fire();
					}
				}
				return this;
			},

			// Remove a callback from the list
			remove: function() {
				jQuery.each( arguments, function( _, arg ) {
					var index;
					while ( ( index = jQuery.inArray( arg, list, index ) ) > -1 ) {
						list.splice( index, 1 );

						// Handle firing indexes
						if ( index <= firingIndex ) {
							firingIndex--;
						}
					}
				} );
				return this;
			},

			// Check if a given callback is in the list.
			// If no argument is given, return whether or not list has callbacks attached.
			has: function( fn ) {
				return fn ?
					jQuery.inArray( fn, list ) > -1 :
					list.length > 0;
			},

			// Remove all callbacks from the list
			empty: function() {
				if ( list ) {
					list = [];
				}
				return this;
			},

			// Disable .fire and .add
			// Abort any current/pending executions
			// Clear all callbacks and values
			disable: function() {
				locked = queue = [];
				list = memory = "";
				return this;
			},
			disabled: function() {
				return !list;
			},

			// Disable .fire
			// Also disable .add unless we have memory (since it would have no effect)
			// Abort any pending executions
			lock: function() {
				locked = queue = [];
				if ( !memory && !firing ) {
					list = memory = "";
				}
				return this;
			},
			locked: function() {
				return !!locked;
			},

			// Call all callbacks with the given context and arguments
			fireWith: function( context, args ) {
				if ( !locked ) {
					args = args || [];
					args = [ context, args.slice ? args.slice() : args ];
					queue.push( args );
					if ( !firing ) {
						fire();
					}
				}
				return this;
			},

			// Call all the callbacks with the given arguments
			fire: function() {
				self.fireWith( this, arguments );
				return this;
			},

			// To know if the callbacks have already been called at least once
			fired: function() {
				return !!fired;
			}
		};

	return self;
};


function Identity( v ) {
	return v;
}
function Thrower( ex ) {
	throw ex;
}

function adoptValue( value, resolve, reject, noValue ) {
	var method;

	try {

		// Check for promise aspect first to privilege synchronous behavior
		if ( value && isFunction( ( method = value.promise ) ) ) {
			method.call( value ).done( resolve ).fail( reject );

		// Other thenables
		} else if ( value && isFunction( ( method = value.then ) ) ) {
			method.call( value, resolve, reject );

		// Other non-thenables
		} else {

			// Control `resolve` arguments by letting Array#slice cast boolean `noValue` to integer:
			// * false: [ value ].slice( 0 ) => resolve( value )
			// * true: [ value ].slice( 1 ) => resolve()
			resolve.apply( undefined, [ value ].slice( noValue ) );
		}

	// For Promises/A+, convert exceptions into rejections
	// Since jQuery.when doesn't unwrap thenables, we can skip the extra checks appearing in
	// Deferred#then to conditionally suppress rejection.
	} catch ( value ) {

		// Support: Android 4.0 only
		// Strict mode functions invoked without .call/.apply get global-object context
		reject.apply( undefined, [ value ] );
	}
}

jQuery.extend( {

	Deferred: function( func ) {
		var tuples = [

				// action, add listener, callbacks,
				// ... .then handlers, argument index, [final state]
				[ "notify", "progress", jQuery.Callbacks( "memory" ),
					jQuery.Callbacks( "memory" ), 2 ],
				[ "resolve", "done", jQuery.Callbacks( "once memory" ),
					jQuery.Callbacks( "once memory" ), 0, "resolved" ],
				[ "reject", "fail", jQuery.Callbacks( "once memory" ),
					jQuery.Callbacks( "once memory" ), 1, "rejected" ]
			],
			state = "pending",
			promise = {
				state: function() {
					return state;
				},
				always: function() {
					deferred.done( arguments ).fail( arguments );
					return this;
				},
				"catch": function( fn ) {
					return promise.then( null, fn );
				},

				// Keep pipe for back-compat
				pipe: function( /* fnDone, fnFail, fnProgress */ ) {
					var fns = arguments;

					return jQuery.Deferred( function( newDefer ) {
						jQuery.each( tuples, function( i, tuple ) {

							// Map tuples (progress, done, fail) to arguments (done, fail, progress)
							var fn = isFunction( fns[ tuple[ 4 ] ] ) && fns[ tuple[ 4 ] ];

							// deferred.progress(function() { bind to newDefer or newDefer.notify })
							// deferred.done(function() { bind to newDefer or newDefer.resolve })
							// deferred.fail(function() { bind to newDefer or newDefer.reject })
							deferred[ tuple[ 1 ] ]( function() {
								var returned = fn && fn.apply( this, arguments );
								if ( returned && isFunction( returned.promise ) ) {
									returned.promise()
										.progress( newDefer.notify )
										.done( newDefer.resolve )
										.fail( newDefer.reject );
								} else {
									newDefer[ tuple[ 0 ] + "With" ](
										this,
										fn ? [ returned ] : arguments
									);
								}
							} );
						} );
						fns = null;
					} ).promise();
				},
				then: function( onFulfilled, onRejected, onProgress ) {
					var maxDepth = 0;
					function resolve( depth, deferred, handler, special ) {
						return function() {
							var that = this,
								args = arguments,
								mightThrow = function() {
									var returned, then;

									// Support: Promises/A+ section 2.3.3.3.3
									// https://promisesaplus.com/#point-59
									// Ignore double-resolution attempts
									if ( depth < maxDepth ) {
										return;
									}

									returned = handler.apply( that, args );

									// Support: Promises/A+ section 2.3.1
									// https://promisesaplus.com/#point-48
									if ( returned === deferred.promise() ) {
										throw new TypeError( "Thenable self-resolution" );
									}

									// Support: Promises/A+ sections 2.3.3.1, 3.5
									// https://promisesaplus.com/#point-54
									// https://promisesaplus.com/#point-75
									// Retrieve `then` only once
									then = returned &&

										// Support: Promises/A+ section 2.3.4
										// https://promisesaplus.com/#point-64
										// Only check objects and functions for thenability
										( typeof returned === "object" ||
											typeof returned === "function" ) &&
										returned.then;

									// Handle a returned thenable
									if ( isFunction( then ) ) {

										// Special processors (notify) just wait for resolution
										if ( special ) {
											then.call(
												returned,
												resolve( maxDepth, deferred, Identity, special ),
												resolve( maxDepth, deferred, Thrower, special )
											);

										// Normal processors (resolve) also hook into progress
										} else {

											// ...and disregard older resolution values
											maxDepth++;

											then.call(
												returned,
												resolve( maxDepth, deferred, Identity, special ),
												resolve( maxDepth, deferred, Thrower, special ),
												resolve( maxDepth, deferred, Identity,
													deferred.notifyWith )
											);
										}

									// Handle all other returned values
									} else {

										// Only substitute handlers pass on context
										// and multiple values (non-spec behavior)
										if ( handler !== Identity ) {
											that = undefined;
											args = [ returned ];
										}

										// Process the value(s)
										// Default process is resolve
										( special || deferred.resolveWith )( that, args );
									}
								},

								// Only normal processors (resolve) catch and reject exceptions
								process = special ?
									mightThrow :
									function() {
										try {
											mightThrow();
										} catch ( e ) {

											if ( jQuery.Deferred.exceptionHook ) {
												jQuery.Deferred.exceptionHook( e,
													process.stackTrace );
											}

											// Support: Promises/A+ section 2.3.3.3.4.1
											// https://promisesaplus.com/#point-61
											// Ignore post-resolution exceptions
											if ( depth + 1 >= maxDepth ) {

												// Only substitute handlers pass on context
												// and multiple values (non-spec behavior)
												if ( handler !== Thrower ) {
													that = undefined;
													args = [ e ];
												}

												deferred.rejectWith( that, args );
											}
										}
									};

							// Support: Promises/A+ section 2.3.3.3.1
							// https://promisesaplus.com/#point-57
							// Re-resolve promises immediately to dodge false rejection from
							// subsequent errors
							if ( depth ) {
								process();
							} else {

								// Call an optional hook to record the stack, in case of exception
								// since it's otherwise lost when execution goes async
								if ( jQuery.Deferred.getStackHook ) {
									process.stackTrace = jQuery.Deferred.getStackHook();
								}
								window.setTimeout( process );
							}
						};
					}

					return jQuery.Deferred( function( newDefer ) {

						// progress_handlers.add( ... )
						tuples[ 0 ][ 3 ].add(
							resolve(
								0,
								newDefer,
								isFunction( onProgress ) ?
									onProgress :
									Identity,
								newDefer.notifyWith
							)
						);

						// fulfilled_handlers.add( ... )
						tuples[ 1 ][ 3 ].add(
							resolve(
								0,
								newDefer,
								isFunction( onFulfilled ) ?
									onFulfilled :
									Identity
							)
						);

						// rejected_handlers.add( ... )
						tuples[ 2 ][ 3 ].add(
							resolve(
								0,
								newDefer,
								isFunction( onRejected ) ?
									onRejected :
									Thrower
							)
						);
					} ).promise();
				},

				// Get a promise for this deferred
				// If obj is provided, the promise aspect is added to the object
				promise: function( obj ) {
					return obj != null ? jQuery.extend( obj, promise ) : promise;
				}
			},
			deferred = {};

		// Add list-specific methods
		jQuery.each( tuples, function( i, tuple ) {
			var list = tuple[ 2 ],
				stateString = tuple[ 5 ];

			// promise.progress = list.add
			// promise.done = list.add
			// promise.fail = list.add
			promise[ tuple[ 1 ] ] = list.add;

			// Handle state
			if ( stateString ) {
				list.add(
					function() {

						// state = "resolved" (i.e., fulfilled)
						// state = "rejected"
						state = stateString;
					},

					// rejected_callbacks.disable
					// fulfilled_callbacks.disable
					tuples[ 3 - i ][ 2 ].disable,

					// rejected_handlers.disable
					// fulfilled_handlers.disable
					tuples[ 3 - i ][ 3 ].disable,

					// progress_callbacks.lock
					tuples[ 0 ][ 2 ].lock,

					// progress_handlers.lock
					tuples[ 0 ][ 3 ].lock
				);
			}

			// progress_handlers.fire
			// fulfilled_handlers.fire
			// rejected_handlers.fire
			list.add( tuple[ 3 ].fire );

			// deferred.notify = function() { deferred.notifyWith(...) }
			// deferred.resolve = function() { deferred.resolveWith(...) }
			// deferred.reject = function() { deferred.rejectWith(...) }
			deferred[ tuple[ 0 ] ] = function() {
				deferred[ tuple[ 0 ] + "With" ]( this === deferred ? undefined : this, arguments );
				return this;
			};

			// deferred.notifyWith = list.fireWith
			// deferred.resolveWith = list.fireWith
			// deferred.rejectWith = list.fireWith
			deferred[ tuple[ 0 ] + "With" ] = list.fireWith;
		} );

		// Make the deferred a promise
		promise.promise( deferred );

		// Call given func if any
		if ( func ) {
			func.call( deferred, deferred );
		}

		// All done!
		return deferred;
	},

	// Deferred helper
	when: function( singleValue ) {
		var

			// count of uncompleted subordinates
			remaining = arguments.length,

			// count of unprocessed arguments
			i = remaining,

			// subordinate fulfillment data
			resolveContexts = Array( i ),
			resolveValues = slice.call( arguments ),

			// the master Deferred
			master = jQuery.Deferred(),

			// subordinate callback factory
			updateFunc = function( i ) {
				return function( value ) {
					resolveContexts[ i ] = this;
					resolveValues[ i ] = arguments.length > 1 ? slice.call( arguments ) : value;
					if ( !( --remaining ) ) {
						master.resolveWith( resolveContexts, resolveValues );
					}
				};
			};

		// Single- and empty arguments are adopted like Promise.resolve
		if ( remaining <= 1 ) {
			adoptValue( singleValue, master.done( updateFunc( i ) ).resolve, master.reject,
				!remaining );

			// Use .then() to unwrap secondary thenables (cf. gh-3000)
			if ( master.state() === "pending" ||
				isFunction( resolveValues[ i ] && resolveValues[ i ].then ) ) {

				return master.then();
			}
		}

		// Multiple arguments are aggregated like Promise.all array elements
		while ( i-- ) {
			adoptValue( resolveValues[ i ], updateFunc( i ), master.reject );
		}

		return master.promise();
	}
} );


// These usually indicate a programmer mistake during development,
// warn about them ASAP rather than swallowing them by default.
var rerrorNames = /^(Eval|Internal|Range|Reference|Syntax|Type|URI)Error$/;

jQuery.Deferred.exceptionHook = function( error, stack ) {

	// Support: IE 8 - 9 only
	// Console exists when dev tools are open, which can happen at any time
	if ( window.console && window.console.warn && error && rerrorNames.test( error.name ) ) {
		window.console.warn( "jQuery.Deferred exception: " + error.message, error.stack, stack );
	}
};




jQuery.readyException = function( error ) {
	window.setTimeout( function() {
		throw error;
	} );
};




// The deferred used on DOM ready
var readyList = jQuery.Deferred();

jQuery.fn.ready = function( fn ) {

	readyList
		.then( fn )

		// Wrap jQuery.readyException in a function so that the lookup
		// happens at the time of error handling instead of callback
		// registration.
		.catch( function( error ) {
			jQuery.readyException( error );
		} );

	return this;
};

jQuery.extend( {

	// Is the DOM ready to be used? Set to true once it occurs.
	isReady: false,

	// A counter to track how many items to wait for before
	// the ready event fires. See #6781
	readyWait: 1,

	// Handle when the DOM is ready
	ready: function( wait ) {

		// Abort if there are pending holds or we're already ready
		if ( wait === true ? --jQuery.readyWait : jQuery.isReady ) {
			return;
		}

		// Remember that the DOM is ready
		jQuery.isReady = true;

		// If a normal DOM Ready event fired, decrement, and wait if need be
		if ( wait !== true && --jQuery.readyWait > 0 ) {
			return;
		}

		// If there are functions bound, to execute
		readyList.resolveWith( document, [ jQuery ] );
	}
} );

jQuery.ready.then = readyList.then;

// The ready event handler and self cleanup method
function completed() {
	document.removeEventListener( "DOMContentLoaded", completed );
	window.removeEventListener( "load", completed );
	jQuery.ready();
}

// Catch cases where $(document).ready() is called
// after the browser event has already occurred.
// Support: IE <=9 - 10 only
// Older IE sometimes signals "interactive" too soon
if ( document.readyState === "complete" ||
	( document.readyState !== "loading" && !document.documentElement.doScroll ) ) {

	// Handle it asynchronously to allow scripts the opportunity to delay ready
	window.setTimeout( jQuery.ready );

} else {

	// Use the handy event callback
	document.addEventListener( "DOMContentLoaded", completed );

	// A fallback to window.onload, that will always work
	window.addEventListener( "load", completed );
}




// Multifunctional method to get and set values of a collection
// The value/s can optionally be executed if it's a function
var access = function( elems, fn, key, value, chainable, emptyGet, raw ) {
	var i = 0,
		len = elems.length,
		bulk = key == null;

	// Sets many values
	if ( toType( key ) === "object" ) {
		chainable = true;
		for ( i in key ) {
			access( elems, fn, i, key[ i ], true, emptyGet, raw );
		}

	// Sets one value
	} else if ( value !== undefined ) {
		chainable = true;

		if ( !isFunction( value ) ) {
			raw = true;
		}

		if ( bulk ) {

			// Bulk operations run against the entire set
			if ( raw ) {
				fn.call( elems, value );
				fn = null;

			// ...except when executing function values
			} else {
				bulk = fn;
				fn = function( elem, key, value ) {
					return bulk.call( jQuery( elem ), value );
				};
			}
		}

		if ( fn ) {
			for ( ; i < len; i++ ) {
				fn(
					elems[ i ], key, raw ?
					value :
					value.call( elems[ i ], i, fn( elems[ i ], key ) )
				);
			}
		}
	}

	if ( chainable ) {
		return elems;
	}

	// Gets
	if ( bulk ) {
		return fn.call( elems );
	}

	return len ? fn( elems[ 0 ], key ) : emptyGet;
};


// Matches dashed string for camelizing
var rmsPrefix = /^-ms-/,
	rdashAlpha = /-([a-z])/g;

// Used by camelCase as callback to replace()
function fcamelCase( all, letter ) {
	return letter.toUpperCase();
}

// Convert dashed to camelCase; used by the css and data modules
// Support: IE <=9 - 11, Edge 12 - 15
// Microsoft forgot to hump their vendor prefix (#9572)
function camelCase( string ) {
	return string.replace( rmsPrefix, "ms-" ).replace( rdashAlpha, fcamelCase );
}
var acceptData = function( owner ) {

	// Accepts only:
	//  - Node
	//    - Node.ELEMENT_NODE
	//    - Node.DOCUMENT_NODE
	//  - Object
	//    - Any
	return owner.nodeType === 1 || owner.nodeType === 9 || !( +owner.nodeType );
};




function Data() {
	this.expando = jQuery.expando + Data.uid++;
}

Data.uid = 1;

Data.prototype = {

	cache: function( owner ) {

		// Check if the owner object already has a cache
		var value = owner[ this.expando ];

		// If not, create one
		if ( !value ) {
			value = {};

			// We can accept data for non-element nodes in modern browsers,
			// but we should not, see #8335.
			// Always return an empty object.
			if ( acceptData( owner ) ) {

				// If it is a node unlikely to be stringify-ed or looped over
				// use plain assignment
				if ( owner.nodeType ) {
					owner[ this.expando ] = value;

				// Otherwise secure it in a non-enumerable property
				// configurable must be true to allow the property to be
				// deleted when data is removed
				} else {
					Object.defineProperty( owner, this.expando, {
						value: value,
						configurable: true
					} );
				}
			}
		}

		return value;
	},
	set: function( owner, data, value ) {
		var prop,
			cache = this.cache( owner );

		// Handle: [ owner, key, value ] args
		// Always use camelCase key (gh-2257)
		if ( typeof data === "string" ) {
			cache[ camelCase( data ) ] = value;

		// Handle: [ owner, { properties } ] args
		} else {

			// Copy the properties one-by-one to the cache object
			for ( prop in data ) {
				cache[ camelCase( prop ) ] = data[ prop ];
			}
		}
		return cache;
	},
	get: function( owner, key ) {
		return key === undefined ?
			this.cache( owner ) :

			// Always use camelCase key (gh-2257)
			owner[ this.expando ] && owner[ this.expando ][ camelCase( key ) ];
	},
	access: function( owner, key, value ) {

		// In cases where either:
		//
		//   1. No key was specified
		//   2. A string key was specified, but no value provided
		//
		// Take the "read" path and allow the get method to determine
		// which value to return, respectively either:
		//
		//   1. The entire cache object
		//   2. The data stored at the key
		//
		if ( key === undefined ||
				( ( key && typeof key === "string" ) && value === undefined ) ) {

			return this.get( owner, key );
		}

		// When the key is not a string, or both a key and value
		// are specified, set or extend (existing objects) with either:
		//
		//   1. An object of properties
		//   2. A key and value
		//
		this.set( owner, key, value );

		// Since the "set" path can have two possible entry points
		// return the expected data based on which path was taken[*]
		return value !== undefined ? value : key;
	},
	remove: function( owner, key ) {
		var i,
			cache = owner[ this.expando ];

		if ( cache === undefined ) {
			return;
		}

		if ( key !== undefined ) {

			// Support array or space separated string of keys
			if ( Array.isArray( key ) ) {

				// If key is an array of keys...
				// We always set camelCase keys, so remove that.
				key = key.map( camelCase );
			} else {
				key = camelCase( key );

				// If a key with the spaces exists, use it.
				// Otherwise, create an array by matching non-whitespace
				key = key in cache ?
					[ key ] :
					( key.match( rnothtmlwhite ) || [] );
			}

			i = key.length;

			while ( i-- ) {
				delete cache[ key[ i ] ];
			}
		}

		// Remove the expando if there's no more data
		if ( key === undefined || jQuery.isEmptyObject( cache ) ) {

			// Support: Chrome <=35 - 45
			// Webkit & Blink performance suffers when deleting properties
			// from DOM nodes, so set to undefined instead
			// https://bugs.chromium.org/p/chromium/issues/detail?id=378607 (bug restricted)
			if ( owner.nodeType ) {
				owner[ this.expando ] = undefined;
			} else {
				delete owner[ this.expando ];
			}
		}
	},
	hasData: function( owner ) {
		var cache = owner[ this.expando ];
		return cache !== undefined && !jQuery.isEmptyObject( cache );
	}
};
var dataPriv = new Data();

var dataUser = new Data();



//	Implementation Summary
//
//	1. Enforce API surface and semantic compatibility with 1.9.x branch
//	2. Improve the module's maintainability by reducing the storage
//		paths to a single mechanism.
//	3. Use the same single mechanism to support "private" and "user" data.
//	4. _Never_ expose "private" data to user code (TODO: Drop _data, _removeData)
//	5. Avoid exposing implementation details on user objects (eg. expando properties)
//	6. Provide a clear path for implementation upgrade to WeakMap in 2014

var rbrace = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,
	rmultiDash = /[A-Z]/g;

function getData( data ) {
	if ( data === "true" ) {
		return true;
	}

	if ( data === "false" ) {
		return false;
	}

	if ( data === "null" ) {
		return null;
	}

	// Only convert to a number if it doesn't change the string
	if ( data === +data + "" ) {
		return +data;
	}

	if ( rbrace.test( data ) ) {
		return JSON.parse( data );
	}

	return data;
}

function dataAttr( elem, key, data ) {
	var name;

	// If nothing was found internally, try to fetch any
	// data from the HTML5 data-* attribute
	if ( data === undefined && elem.nodeType === 1 ) {
		name = "data-" + key.replace( rmultiDash, "-$&" ).toLowerCase();
		data = elem.getAttribute( name );

		if ( typeof data === "string" ) {
			try {
				data = getData( data );
			} catch ( e ) {}

			// Make sure we set the data so it isn't changed later
			dataUser.set( elem, key, data );
		} else {
			data = undefined;
		}
	}
	return data;
}

jQuery.extend( {
	hasData: function( elem ) {
		return dataUser.hasData( elem ) || dataPriv.hasData( elem );
	},

	data: function( elem, name, data ) {
		return dataUser.access( elem, name, data );
	},

	removeData: function( elem, name ) {
		dataUser.remove( elem, name );
	},

	// TODO: Now that all calls to _data and _removeData have been replaced
	// with direct calls to dataPriv methods, these can be deprecated.
	_data: function( elem, name, data ) {
		return dataPriv.access( elem, name, data );
	},

	_removeData: function( elem, name ) {
		dataPriv.remove( elem, name );
	}
} );

jQuery.fn.extend( {
	data: function( key, value ) {
		var i, name, data,
			elem = this[ 0 ],
			attrs = elem && elem.attributes;

		// Gets all values
		if ( key === undefined ) {
			if ( this.length ) {
				data = dataUser.get( elem );

				if ( elem.nodeType === 1 && !dataPriv.get( elem, "hasDataAttrs" ) ) {
					i = attrs.length;
					while ( i-- ) {

						// Support: IE 11 only
						// The attrs elements can be null (#14894)
						if ( attrs[ i ] ) {
							name = attrs[ i ].name;
							if ( name.indexOf( "data-" ) === 0 ) {
								name = camelCase( name.slice( 5 ) );
								dataAttr( elem, name, data[ name ] );
							}
						}
					}
					dataPriv.set( elem, "hasDataAttrs", true );
				}
			}

			return data;
		}

		// Sets multiple values
		if ( typeof key === "object" ) {
			return this.each( function() {
				dataUser.set( this, key );
			} );
		}

		return access( this, function( value ) {
			var data;

			// The calling jQuery object (element matches) is not empty
			// (and therefore has an element appears at this[ 0 ]) and the
			// `value` parameter was not undefined. An empty jQuery object
			// will result in `undefined` for elem = this[ 0 ] which will
			// throw an exception if an attempt to read a data cache is made.
			if ( elem && value === undefined ) {

				// Attempt to get data from the cache
				// The key will always be camelCased in Data
				data = dataUser.get( elem, key );
				if ( data !== undefined ) {
					return data;
				}

				// Attempt to "discover" the data in
				// HTML5 custom data-* attrs
				data = dataAttr( elem, key );
				if ( data !== undefined ) {
					return data;
				}

				// We tried really hard, but the data doesn't exist.
				return;
			}

			// Set the data...
			this.each( function() {

				// We always store the camelCased key
				dataUser.set( this, key, value );
			} );
		}, null, value, arguments.length > 1, null, true );
	},

	removeData: function( key ) {
		return this.each( function() {
			dataUser.remove( this, key );
		} );
	}
} );


jQuery.extend( {
	queue: function( elem, type, data ) {
		var queue;

		if ( elem ) {
			type = ( type || "fx" ) + "queue";
			queue = dataPriv.get( elem, type );

			// Speed up dequeue by getting out quickly if this is just a lookup
			if ( data ) {
				if ( !queue || Array.isArray( data ) ) {
					queue = dataPriv.access( elem, type, jQuery.makeArray( data ) );
				} else {
					queue.push( data );
				}
			}
			return queue || [];
		}
	},

	dequeue: function( elem, type ) {
		type = type || "fx";

		var queue = jQuery.queue( elem, type ),
			startLength = queue.length,
			fn = queue.shift(),
			hooks = jQuery._queueHooks( elem, type ),
			next = function() {
				jQuery.dequeue( elem, type );
			};

		// If the fx queue is dequeued, always remove the progress sentinel
		if ( fn === "inprogress" ) {
			fn = queue.shift();
			startLength--;
		}

		if ( fn ) {

			// Add a progress sentinel to prevent the fx queue from being
			// automatically dequeued
			if ( type === "fx" ) {
				queue.unshift( "inprogress" );
			}

			// Clear up the last queue stop function
			delete hooks.stop;
			fn.call( elem, next, hooks );
		}

		if ( !startLength && hooks ) {
			hooks.empty.fire();
		}
	},

	// Not public - generate a queueHooks object, or return the current one
	_queueHooks: function( elem, type ) {
		var key = type + "queueHooks";
		return dataPriv.get( elem, key ) || dataPriv.access( elem, key, {
			empty: jQuery.Callbacks( "once memory" ).add( function() {
				dataPriv.remove( elem, [ type + "queue", key ] );
			} )
		} );
	}
} );

jQuery.fn.extend( {
	queue: function( type, data ) {
		var setter = 2;

		if ( typeof type !== "string" ) {
			data = type;
			type = "fx";
			setter--;
		}

		if ( arguments.length < setter ) {
			return jQuery.queue( this[ 0 ], type );
		}

		return data === undefined ?
			this :
			this.each( function() {
				var queue = jQuery.queue( this, type, data );

				// Ensure a hooks for this queue
				jQuery._queueHooks( this, type );

				if ( type === "fx" && queue[ 0 ] !== "inprogress" ) {
					jQuery.dequeue( this, type );
				}
			} );
	},
	dequeue: function( type ) {
		return this.each( function() {
			jQuery.dequeue( this, type );
		} );
	},
	clearQueue: function( type ) {
		return this.queue( type || "fx", [] );
	},

	// Get a promise resolved when queues of a certain type
	// are emptied (fx is the type by default)
	promise: function( type, obj ) {
		var tmp,
			count = 1,
			defer = jQuery.Deferred(),
			elements = this,
			i = this.length,
			resolve = function() {
				if ( !( --count ) ) {
					defer.resolveWith( elements, [ elements ] );
				}
			};

		if ( typeof type !== "string" ) {
			obj = type;
			type = undefined;
		}
		type = type || "fx";

		while ( i-- ) {
			tmp = dataPriv.get( elements[ i ], type + "queueHooks" );
			if ( tmp && tmp.empty ) {
				count++;
				tmp.empty.add( resolve );
			}
		}
		resolve();
		return defer.promise( obj );
	}
} );
var pnum = ( /[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/ ).source;

var rcssNum = new RegExp( "^(?:([+-])=|)(" + pnum + ")([a-z%]*)$", "i" );


var cssExpand = [ "Top", "Right", "Bottom", "Left" ];

var isHiddenWithinTree = function( elem, el ) {

		// isHiddenWithinTree might be called from jQuery#filter function;
		// in that case, element will be second argument
		elem = el || elem;

		// Inline style trumps all
		return elem.style.display === "none" ||
			elem.style.display === "" &&

			// Otherwise, check computed style
			// Support: Firefox <=43 - 45
			// Disconnected elements can have computed display: none, so first confirm that elem is
			// in the document.
			jQuery.contains( elem.ownerDocument, elem ) &&

			jQuery.css( elem, "display" ) === "none";
	};

var swap = function( elem, options, callback, args ) {
	var ret, name,
		old = {};

	// Remember the old values, and insert the new ones
	for ( name in options ) {
		old[ name ] = elem.style[ name ];
		elem.style[ name ] = options[ name ];
	}

	ret = callback.apply( elem, args || [] );

	// Revert the old values
	for ( name in options ) {
		elem.style[ name ] = old[ name ];
	}

	return ret;
};




function adjustCSS( elem, prop, valueParts, tween ) {
	var adjusted, scale,
		maxIterations = 20,
		currentValue = tween ?
			function() {
				return tween.cur();
			} :
			function() {
				return jQuery.css( elem, prop, "" );
			},
		initial = currentValue(),
		unit = valueParts && valueParts[ 3 ] || ( jQuery.cssNumber[ prop ] ? "" : "px" ),

		// Starting value computation is required for potential unit mismatches
		initialInUnit = ( jQuery.cssNumber[ prop ] || unit !== "px" && +initial ) &&
			rcssNum.exec( jQuery.css( elem, prop ) );

	if ( initialInUnit && initialInUnit[ 3 ] !== unit ) {

		// Support: Firefox <=54
		// Halve the iteration target value to prevent interference from CSS upper bounds (gh-2144)
		initial = initial / 2;

		// Trust units reported by jQuery.css
		unit = unit || initialInUnit[ 3 ];

		// Iteratively approximate from a nonzero starting point
		initialInUnit = +initial || 1;

		while ( maxIterations-- ) {

			// Evaluate and update our best guess (doubling guesses that zero out).
			// Finish if the scale equals or crosses 1 (making the old*new product non-positive).
			jQuery.style( elem, prop, initialInUnit + unit );
			if ( ( 1 - scale ) * ( 1 - ( scale = currentValue() / initial || 0.5 ) ) <= 0 ) {
				maxIterations = 0;
			}
			initialInUnit = initialInUnit / scale;

		}

		initialInUnit = initialInUnit * 2;
		jQuery.style( elem, prop, initialInUnit + unit );

		// Make sure we update the tween properties later on
		valueParts = valueParts || [];
	}

	if ( valueParts ) {
		initialInUnit = +initialInUnit || +initial || 0;

		// Apply relative offset (+=/-=) if specified
		adjusted = valueParts[ 1 ] ?
			initialInUnit + ( valueParts[ 1 ] + 1 ) * valueParts[ 2 ] :
			+valueParts[ 2 ];
		if ( tween ) {
			tween.unit = unit;
			tween.start = initialInUnit;
			tween.end = adjusted;
		}
	}
	return adjusted;
}


var defaultDisplayMap = {};

function getDefaultDisplay( elem ) {
	var temp,
		doc = elem.ownerDocument,
		nodeName = elem.nodeName,
		display = defaultDisplayMap[ nodeName ];

	if ( display ) {
		return display;
	}

	temp = doc.body.appendChild( doc.createElement( nodeName ) );
	display = jQuery.css( temp, "display" );

	temp.parentNode.removeChild( temp );

	if ( display === "none" ) {
		display = "block";
	}
	defaultDisplayMap[ nodeName ] = display;

	return display;
}

function showHide( elements, show ) {
	var display, elem,
		values = [],
		index = 0,
		length = elements.length;

	// Determine new display value for elements that need to change
	for ( ; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}

		display = elem.style.display;
		if ( show ) {

			// Since we force visibility upon cascade-hidden elements, an immediate (and slow)
			// check is required in this first loop unless we have a nonempty display value (either
			// inline or about-to-be-restored)
			if ( display === "none" ) {
				values[ index ] = dataPriv.get( elem, "display" ) || null;
				if ( !values[ index ] ) {
					elem.style.display = "";
				}
			}
			if ( elem.style.display === "" && isHiddenWithinTree( elem ) ) {
				values[ index ] = getDefaultDisplay( elem );
			}
		} else {
			if ( display !== "none" ) {
				values[ index ] = "none";

				// Remember what we're overwriting
				dataPriv.set( elem, "display", display );
			}
		}
	}

	// Set the display of the elements in a second loop to avoid constant reflow
	for ( index = 0; index < length; index++ ) {
		if ( values[ index ] != null ) {
			elements[ index ].style.display = values[ index ];
		}
	}

	return elements;
}

jQuery.fn.extend( {
	show: function() {
		return showHide( this, true );
	},
	hide: function() {
		return showHide( this );
	},
	toggle: function( state ) {
		if ( typeof state === "boolean" ) {
			return state ? this.show() : this.hide();
		}

		return this.each( function() {
			if ( isHiddenWithinTree( this ) ) {
				jQuery( this ).show();
			} else {
				jQuery( this ).hide();
			}
		} );
	}
} );
var rcheckableType = ( /^(?:checkbox|radio)$/i );

var rtagName = ( /<([a-z][^\/\0>\x20\t\r\n\f]+)/i );

var rscriptType = ( /^$|^module$|\/(?:java|ecma)script/i );



// We have to close these tags to support XHTML (#13200)
var wrapMap = {

	// Support: IE <=9 only
	option: [ 1, "<select multiple='multiple'>", "</select>" ],

	// XHTML parsers do not magically insert elements in the
	// same way that tag soup parsers do. So we cannot shorten
	// this by omitting <tbody> or other required elements.
	thead: [ 1, "<table>", "</table>" ],
	col: [ 2, "<table><colgroup>", "</colgroup></table>" ],
	tr: [ 2, "<table><tbody>", "</tbody></table>" ],
	td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],

	_default: [ 0, "", "" ]
};

// Support: IE <=9 only
wrapMap.optgroup = wrapMap.option;

wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
wrapMap.th = wrapMap.td;


function getAll( context, tag ) {

	// Support: IE <=9 - 11 only
	// Use typeof to avoid zero-argument method invocation on host objects (#15151)
	var ret;

	if ( typeof context.getElementsByTagName !== "undefined" ) {
		ret = context.getElementsByTagName( tag || "*" );

	} else if ( typeof context.querySelectorAll !== "undefined" ) {
		ret = context.querySelectorAll( tag || "*" );

	} else {
		ret = [];
	}

	if ( tag === undefined || tag && nodeName( context, tag ) ) {
		return jQuery.merge( [ context ], ret );
	}

	return ret;
}


// Mark scripts as having already been evaluated
function setGlobalEval( elems, refElements ) {
	var i = 0,
		l = elems.length;

	for ( ; i < l; i++ ) {
		dataPriv.set(
			elems[ i ],
			"globalEval",
			!refElements || dataPriv.get( refElements[ i ], "globalEval" )
		);
	}
}


var rhtml = /<|&#?\w+;/;

function buildFragment( elems, context, scripts, selection, ignored ) {
	var elem, tmp, tag, wrap, contains, j,
		fragment = context.createDocumentFragment(),
		nodes = [],
		i = 0,
		l = elems.length;

	for ( ; i < l; i++ ) {
		elem = elems[ i ];

		if ( elem || elem === 0 ) {

			// Add nodes directly
			if ( toType( elem ) === "object" ) {

				// Support: Android <=4.0 only, PhantomJS 1 only
				// push.apply(_, arraylike) throws on ancient WebKit
				jQuery.merge( nodes, elem.nodeType ? [ elem ] : elem );

			// Convert non-html into a text node
			} else if ( !rhtml.test( elem ) ) {
				nodes.push( context.createTextNode( elem ) );

			// Convert html into DOM nodes
			} else {
				tmp = tmp || fragment.appendChild( context.createElement( "div" ) );

				// Deserialize a standard representation
				tag = ( rtagName.exec( elem ) || [ "", "" ] )[ 1 ].toLowerCase();
				wrap = wrapMap[ tag ] || wrapMap._default;
				tmp.innerHTML = wrap[ 1 ] + jQuery.htmlPrefilter( elem ) + wrap[ 2 ];

				// Descend through wrappers to the right content
				j = wrap[ 0 ];
				while ( j-- ) {
					tmp = tmp.lastChild;
				}

				// Support: Android <=4.0 only, PhantomJS 1 only
				// push.apply(_, arraylike) throws on ancient WebKit
				jQuery.merge( nodes, tmp.childNodes );

				// Remember the top-level container
				tmp = fragment.firstChild;

				// Ensure the created nodes are orphaned (#12392)
				tmp.textContent = "";
			}
		}
	}

	// Remove wrapper from fragment
	fragment.textContent = "";

	i = 0;
	while ( ( elem = nodes[ i++ ] ) ) {

		// Skip elements already in the context collection (trac-4087)
		if ( selection && jQuery.inArray( elem, selection ) > -1 ) {
			if ( ignored ) {
				ignored.push( elem );
			}
			continue;
		}

		contains = jQuery.contains( elem.ownerDocument, elem );

		// Append to fragment
		tmp = getAll( fragment.appendChild( elem ), "script" );

		// Preserve script evaluation history
		if ( contains ) {
			setGlobalEval( tmp );
		}

		// Capture executables
		if ( scripts ) {
			j = 0;
			while ( ( elem = tmp[ j++ ] ) ) {
				if ( rscriptType.test( elem.type || "" ) ) {
					scripts.push( elem );
				}
			}
		}
	}

	return fragment;
}


( function() {
	var fragment = document.createDocumentFragment(),
		div = fragment.appendChild( document.createElement( "div" ) ),
		input = document.createElement( "input" );

	// Support: Android 4.0 - 4.3 only
	// Check state lost if the name is set (#11217)
	// Support: Windows Web Apps (WWA)
	// `name` and `type` must use .setAttribute for WWA (#14901)
	input.setAttribute( "type", "radio" );
	input.setAttribute( "checked", "checked" );
	input.setAttribute( "name", "t" );

	div.appendChild( input );

	// Support: Android <=4.1 only
	// Older WebKit doesn't clone checked state correctly in fragments
	support.checkClone = div.cloneNode( true ).cloneNode( true ).lastChild.checked;

	// Support: IE <=11 only
	// Make sure textarea (and checkbox) defaultValue is properly cloned
	div.innerHTML = "<textarea>x</textarea>";
	support.noCloneChecked = !!div.cloneNode( true ).lastChild.defaultValue;
} )();
var documentElement = document.documentElement;



var
	rkeyEvent = /^key/,
	rmouseEvent = /^(?:mouse|pointer|contextmenu|drag|drop)|click/,
	rtypenamespace = /^([^.]*)(?:\.(.+)|)/;

function returnTrue() {
	return true;
}

function returnFalse() {
	return false;
}

// Support: IE <=9 only
// See #13393 for more info
function safeActiveElement() {
	try {
		return document.activeElement;
	} catch ( err ) { }
}

function on( elem, types, selector, data, fn, one ) {
	var origFn, type;

	// Types can be a map of types/handlers
	if ( typeof types === "object" ) {

		// ( types-Object, selector, data )
		if ( typeof selector !== "string" ) {

			// ( types-Object, data )
			data = data || selector;
			selector = undefined;
		}
		for ( type in types ) {
			on( elem, type, selector, data, types[ type ], one );
		}
		return elem;
	}

	if ( data == null && fn == null ) {

		// ( types, fn )
		fn = selector;
		data = selector = undefined;
	} else if ( fn == null ) {
		if ( typeof selector === "string" ) {

			// ( types, selector, fn )
			fn = data;
			data = undefined;
		} else {

			// ( types, data, fn )
			fn = data;
			data = selector;
			selector = undefined;
		}
	}
	if ( fn === false ) {
		fn = returnFalse;
	} else if ( !fn ) {
		return elem;
	}

	if ( one === 1 ) {
		origFn = fn;
		fn = function( event ) {

			// Can use an empty set, since event contains the info
			jQuery().off( event );
			return origFn.apply( this, arguments );
		};

		// Use same guid so caller can remove using origFn
		fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
	}
	return elem.each( function() {
		jQuery.event.add( this, types, fn, data, selector );
	} );
}

/*
 * Helper functions for managing events -- not part of the public interface.
 * Props to Dean Edwards' addEvent library for many of the ideas.
 */
jQuery.event = {

	global: {},

	add: function( elem, types, handler, data, selector ) {

		var handleObjIn, eventHandle, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData = dataPriv.get( elem );

		// Don't attach events to noData or text/comment nodes (but allow plain objects)
		if ( !elemData ) {
			return;
		}

		// Caller can pass in an object of custom data in lieu of the handler
		if ( handler.handler ) {
			handleObjIn = handler;
			handler = handleObjIn.handler;
			selector = handleObjIn.selector;
		}

		// Ensure that invalid selectors throw exceptions at attach time
		// Evaluate against documentElement in case elem is a non-element node (e.g., document)
		if ( selector ) {
			jQuery.find.matchesSelector( documentElement, selector );
		}

		// Make sure that the handler has a unique ID, used to find/remove it later
		if ( !handler.guid ) {
			handler.guid = jQuery.guid++;
		}

		// Init the element's event structure and main handler, if this is the first
		if ( !( events = elemData.events ) ) {
			events = elemData.events = {};
		}
		if ( !( eventHandle = elemData.handle ) ) {
			eventHandle = elemData.handle = function( e ) {

				// Discard the second event of a jQuery.event.trigger() and
				// when an event is called after a page has unloaded
				return typeof jQuery !== "undefined" && jQuery.event.triggered !== e.type ?
					jQuery.event.dispatch.apply( elem, arguments ) : undefined;
			};
		}

		// Handle multiple events separated by a space
		types = ( types || "" ).match( rnothtmlwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[ t ] ) || [];
			type = origType = tmp[ 1 ];
			namespaces = ( tmp[ 2 ] || "" ).split( "." ).sort();

			// There *must* be a type, no attaching namespace-only handlers
			if ( !type ) {
				continue;
			}

			// If event changes its type, use the special event handlers for the changed type
			special = jQuery.event.special[ type ] || {};

			// If selector defined, determine special event api type, otherwise given type
			type = ( selector ? special.delegateType : special.bindType ) || type;

			// Update special based on newly reset type
			special = jQuery.event.special[ type ] || {};

			// handleObj is passed to all event handlers
			handleObj = jQuery.extend( {
				type: type,
				origType: origType,
				data: data,
				handler: handler,
				guid: handler.guid,
				selector: selector,
				needsContext: selector && jQuery.expr.match.needsContext.test( selector ),
				namespace: namespaces.join( "." )
			}, handleObjIn );

			// Init the event handler queue if we're the first
			if ( !( handlers = events[ type ] ) ) {
				handlers = events[ type ] = [];
				handlers.delegateCount = 0;

				// Only use addEventListener if the special events handler returns false
				if ( !special.setup ||
					special.setup.call( elem, data, namespaces, eventHandle ) === false ) {

					if ( elem.addEventListener ) {
						elem.addEventListener( type, eventHandle );
					}
				}
			}

			if ( special.add ) {
				special.add.call( elem, handleObj );

				if ( !handleObj.handler.guid ) {
					handleObj.handler.guid = handler.guid;
				}
			}

			// Add to the element's handler list, delegates in front
			if ( selector ) {
				handlers.splice( handlers.delegateCount++, 0, handleObj );
			} else {
				handlers.push( handleObj );
			}

			// Keep track of which events have ever been used, for event optimization
			jQuery.event.global[ type ] = true;
		}

	},

	// Detach an event or set of events from an element
	remove: function( elem, types, handler, selector, mappedTypes ) {

		var j, origCount, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData = dataPriv.hasData( elem ) && dataPriv.get( elem );

		if ( !elemData || !( events = elemData.events ) ) {
			return;
		}

		// Once for each type.namespace in types; type may be omitted
		types = ( types || "" ).match( rnothtmlwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[ t ] ) || [];
			type = origType = tmp[ 1 ];
			namespaces = ( tmp[ 2 ] || "" ).split( "." ).sort();

			// Unbind all events (on this namespace, if provided) for the element
			if ( !type ) {
				for ( type in events ) {
					jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
				}
				continue;
			}

			special = jQuery.event.special[ type ] || {};
			type = ( selector ? special.delegateType : special.bindType ) || type;
			handlers = events[ type ] || [];
			tmp = tmp[ 2 ] &&
				new RegExp( "(^|\\.)" + namespaces.join( "\\.(?:.*\\.|)" ) + "(\\.|$)" );

			// Remove matching events
			origCount = j = handlers.length;
			while ( j-- ) {
				handleObj = handlers[ j ];

				if ( ( mappedTypes || origType === handleObj.origType ) &&
					( !handler || handler.guid === handleObj.guid ) &&
					( !tmp || tmp.test( handleObj.namespace ) ) &&
					( !selector || selector === handleObj.selector ||
						selector === "**" && handleObj.selector ) ) {
					handlers.splice( j, 1 );

					if ( handleObj.selector ) {
						handlers.delegateCount--;
					}
					if ( special.remove ) {
						special.remove.call( elem, handleObj );
					}
				}
			}

			// Remove generic event handler if we removed something and no more handlers exist
			// (avoids potential for endless recursion during removal of special event handlers)
			if ( origCount && !handlers.length ) {
				if ( !special.teardown ||
					special.teardown.call( elem, namespaces, elemData.handle ) === false ) {

					jQuery.removeEvent( elem, type, elemData.handle );
				}

				delete events[ type ];
			}
		}

		// Remove data and the expando if it's no longer used
		if ( jQuery.isEmptyObject( events ) ) {
			dataPriv.remove( elem, "handle events" );
		}
	},

	dispatch: function( nativeEvent ) {

		// Make a writable jQuery.Event from the native event object
		var event = jQuery.event.fix( nativeEvent );

		var i, j, ret, matched, handleObj, handlerQueue,
			args = new Array( arguments.length ),
			handlers = ( dataPriv.get( this, "events" ) || {} )[ event.type ] || [],
			special = jQuery.event.special[ event.type ] || {};

		// Use the fix-ed jQuery.Event rather than the (read-only) native event
		args[ 0 ] = event;

		for ( i = 1; i < arguments.length; i++ ) {
			args[ i ] = arguments[ i ];
		}

		event.delegateTarget = this;

		// Call the preDispatch hook for the mapped type, and let it bail if desired
		if ( special.preDispatch && special.preDispatch.call( this, event ) === false ) {
			return;
		}

		// Determine handlers
		handlerQueue = jQuery.event.handlers.call( this, event, handlers );

		// Run delegates first; they may want to stop propagation beneath us
		i = 0;
		while ( ( matched = handlerQueue[ i++ ] ) && !event.isPropagationStopped() ) {
			event.currentTarget = matched.elem;

			j = 0;
			while ( ( handleObj = matched.handlers[ j++ ] ) &&
				!event.isImmediatePropagationStopped() ) {

				// Triggered event must either 1) have no namespace, or 2) have namespace(s)
				// a subset or equal to those in the bound event (both can have no namespace).
				if ( !event.rnamespace || event.rnamespace.test( handleObj.namespace ) ) {

					event.handleObj = handleObj;
					event.data = handleObj.data;

					ret = ( ( jQuery.event.special[ handleObj.origType ] || {} ).handle ||
						handleObj.handler ).apply( matched.elem, args );

					if ( ret !== undefined ) {
						if ( ( event.result = ret ) === false ) {
							event.preventDefault();
							event.stopPropagation();
						}
					}
				}
			}
		}

		// Call the postDispatch hook for the mapped type
		if ( special.postDispatch ) {
			special.postDispatch.call( this, event );
		}

		return event.result;
	},

	handlers: function( event, handlers ) {
		var i, handleObj, sel, matchedHandlers, matchedSelectors,
			handlerQueue = [],
			delegateCount = handlers.delegateCount,
			cur = event.target;

		// Find delegate handlers
		if ( delegateCount &&

			// Support: IE <=9
			// Black-hole SVG <use> instance trees (trac-13180)
			cur.nodeType &&

			// Support: Firefox <=42
			// Suppress spec-violating clicks indicating a non-primary pointer button (trac-3861)
			// https://www.w3.org/TR/DOM-Level-3-Events/#event-type-click
			// Support: IE 11 only
			// ...but not arrow key "clicks" of radio inputs, which can have `button` -1 (gh-2343)
			!( event.type === "click" && event.button >= 1 ) ) {

			for ( ; cur !== this; cur = cur.parentNode || this ) {

				// Don't check non-elements (#13208)
				// Don't process clicks on disabled elements (#6911, #8165, #11382, #11764)
				if ( cur.nodeType === 1 && !( event.type === "click" && cur.disabled === true ) ) {
					matchedHandlers = [];
					matchedSelectors = {};
					for ( i = 0; i < delegateCount; i++ ) {
						handleObj = handlers[ i ];

						// Don't conflict with Object.prototype properties (#13203)
						sel = handleObj.selector + " ";

						if ( matchedSelectors[ sel ] === undefined ) {
							matchedSelectors[ sel ] = handleObj.needsContext ?
								jQuery( sel, this ).index( cur ) > -1 :
								jQuery.find( sel, this, null, [ cur ] ).length;
						}
						if ( matchedSelectors[ sel ] ) {
							matchedHandlers.push( handleObj );
						}
					}
					if ( matchedHandlers.length ) {
						handlerQueue.push( { elem: cur, handlers: matchedHandlers } );
					}
				}
			}
		}

		// Add the remaining (directly-bound) handlers
		cur = this;
		if ( delegateCount < handlers.length ) {
			handlerQueue.push( { elem: cur, handlers: handlers.slice( delegateCount ) } );
		}

		return handlerQueue;
	},

	addProp: function( name, hook ) {
		Object.defineProperty( jQuery.Event.prototype, name, {
			enumerable: true,
			configurable: true,

			get: isFunction( hook ) ?
				function() {
					if ( this.originalEvent ) {
							return hook( this.originalEvent );
					}
				} :
				function() {
					if ( this.originalEvent ) {
							return this.originalEvent[ name ];
					}
				},

			set: function( value ) {
				Object.defineProperty( this, name, {
					enumerable: true,
					configurable: true,
					writable: true,
					value: value
				} );
			}
		} );
	},

	fix: function( originalEvent ) {
		return originalEvent[ jQuery.expando ] ?
			originalEvent :
			new jQuery.Event( originalEvent );
	},

	special: {
		load: {

			// Prevent triggered image.load events from bubbling to window.load
			noBubble: true
		},
		focus: {

			// Fire native event if possible so blur/focus sequence is correct
			trigger: function() {
				if ( this !== safeActiveElement() && this.focus ) {
					this.focus();
					return false;
				}
			},
			delegateType: "focusin"
		},
		blur: {
			trigger: function() {
				if ( this === safeActiveElement() && this.blur ) {
					this.blur();
					return false;
				}
			},
			delegateType: "focusout"
		},
		click: {

			// For checkbox, fire native event so checked state will be right
			trigger: function() {
				if ( this.type === "checkbox" && this.click && nodeName( this, "input" ) ) {
					this.click();
					return false;
				}
			},

			// For cross-browser consistency, don't fire native .click() on links
			_default: function( event ) {
				return nodeName( event.target, "a" );
			}
		},

		beforeunload: {
			postDispatch: function( event ) {

				// Support: Firefox 20+
				// Firefox doesn't alert if the returnValue field is not set.
				if ( event.result !== undefined && event.originalEvent ) {
					event.originalEvent.returnValue = event.result;
				}
			}
		}
	}
};

jQuery.removeEvent = function( elem, type, handle ) {

	// This "if" is needed for plain objects
	if ( elem.removeEventListener ) {
		elem.removeEventListener( type, handle );
	}
};

jQuery.Event = function( src, props ) {

	// Allow instantiation without the 'new' keyword
	if ( !( this instanceof jQuery.Event ) ) {
		return new jQuery.Event( src, props );
	}

	// Event object
	if ( src && src.type ) {
		this.originalEvent = src;
		this.type = src.type;

		// Events bubbling up the document may have been marked as prevented
		// by a handler lower down the tree; reflect the correct value.
		this.isDefaultPrevented = src.defaultPrevented ||
				src.defaultPrevented === undefined &&

				// Support: Android <=2.3 only
				src.returnValue === false ?
			returnTrue :
			returnFalse;

		// Create target properties
		// Support: Safari <=6 - 7 only
		// Target should not be a text node (#504, #13143)
		this.target = ( src.target && src.target.nodeType === 3 ) ?
			src.target.parentNode :
			src.target;

		this.currentTarget = src.currentTarget;
		this.relatedTarget = src.relatedTarget;

	// Event type
	} else {
		this.type = src;
	}

	// Put explicitly provided properties onto the event object
	if ( props ) {
		jQuery.extend( this, props );
	}

	// Create a timestamp if incoming event doesn't have one
	this.timeStamp = src && src.timeStamp || Date.now();

	// Mark it as fixed
	this[ jQuery.expando ] = true;
};

// jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
// https://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
jQuery.Event.prototype = {
	constructor: jQuery.Event,
	isDefaultPrevented: returnFalse,
	isPropagationStopped: returnFalse,
	isImmediatePropagationStopped: returnFalse,
	isSimulated: false,

	preventDefault: function() {
		var e = this.originalEvent;

		this.isDefaultPrevented = returnTrue;

		if ( e && !this.isSimulated ) {
			e.preventDefault();
		}
	},
	stopPropagation: function() {
		var e = this.originalEvent;

		this.isPropagationStopped = returnTrue;

		if ( e && !this.isSimulated ) {
			e.stopPropagation();
		}
	},
	stopImmediatePropagation: function() {
		var e = this.originalEvent;

		this.isImmediatePropagationStopped = returnTrue;

		if ( e && !this.isSimulated ) {
			e.stopImmediatePropagation();
		}

		this.stopPropagation();
	}
};

// Includes all common event props including KeyEvent and MouseEvent specific props
jQuery.each( {
	altKey: true,
	bubbles: true,
	cancelable: true,
	changedTouches: true,
	ctrlKey: true,
	detail: true,
	eventPhase: true,
	metaKey: true,
	pageX: true,
	pageY: true,
	shiftKey: true,
	view: true,
	"char": true,
	charCode: true,
	key: true,
	keyCode: true,
	button: true,
	buttons: true,
	clientX: true,
	clientY: true,
	offsetX: true,
	offsetY: true,
	pointerId: true,
	pointerType: true,
	screenX: true,
	screenY: true,
	targetTouches: true,
	toElement: true,
	touches: true,

	which: function( event ) {
		var button = event.button;

		// Add which for key events
		if ( event.which == null && rkeyEvent.test( event.type ) ) {
			return event.charCode != null ? event.charCode : event.keyCode;
		}

		// Add which for click: 1 === left; 2 === middle; 3 === right
		if ( !event.which && button !== undefined && rmouseEvent.test( event.type ) ) {
			if ( button & 1 ) {
				return 1;
			}

			if ( button & 2 ) {
				return 3;
			}

			if ( button & 4 ) {
				return 2;
			}

			return 0;
		}

		return event.which;
	}
}, jQuery.event.addProp );

// Create mouseenter/leave events using mouseover/out and event-time checks
// so that event delegation works in jQuery.
// Do the same for pointerenter/pointerleave and pointerover/pointerout
//
// Support: Safari 7 only
// Safari sends mouseenter too often; see:
// https://bugs.chromium.org/p/chromium/issues/detail?id=470258
// for the description of the bug (it existed in older Chrome versions as well).
jQuery.each( {
	mouseenter: "mouseover",
	mouseleave: "mouseout",
	pointerenter: "pointerover",
	pointerleave: "pointerout"
}, function( orig, fix ) {
	jQuery.event.special[ orig ] = {
		delegateType: fix,
		bindType: fix,

		handle: function( event ) {
			var ret,
				target = this,
				related = event.relatedTarget,
				handleObj = event.handleObj;

			// For mouseenter/leave call the handler if related is outside the target.
			// NB: No relatedTarget if the mouse left/entered the browser window
			if ( !related || ( related !== target && !jQuery.contains( target, related ) ) ) {
				event.type = handleObj.origType;
				ret = handleObj.handler.apply( this, arguments );
				event.type = fix;
			}
			return ret;
		}
	};
} );

jQuery.fn.extend( {

	on: function( types, selector, data, fn ) {
		return on( this, types, selector, data, fn );
	},
	one: function( types, selector, data, fn ) {
		return on( this, types, selector, data, fn, 1 );
	},
	off: function( types, selector, fn ) {
		var handleObj, type;
		if ( types && types.preventDefault && types.handleObj ) {

			// ( event )  dispatched jQuery.Event
			handleObj = types.handleObj;
			jQuery( types.delegateTarget ).off(
				handleObj.namespace ?
					handleObj.origType + "." + handleObj.namespace :
					handleObj.origType,
				handleObj.selector,
				handleObj.handler
			);
			return this;
		}
		if ( typeof types === "object" ) {

			// ( types-object [, selector] )
			for ( type in types ) {
				this.off( type, selector, types[ type ] );
			}
			return this;
		}
		if ( selector === false || typeof selector === "function" ) {

			// ( types [, fn] )
			fn = selector;
			selector = undefined;
		}
		if ( fn === false ) {
			fn = returnFalse;
		}
		return this.each( function() {
			jQuery.event.remove( this, types, fn, selector );
		} );
	}
} );


var

	/* eslint-disable max-len */

	// See https://github.com/eslint/eslint/issues/3229
	rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([a-z][^\/\0>\x20\t\r\n\f]*)[^>]*)\/>/gi,

	/* eslint-enable */

	// Support: IE <=10 - 11, Edge 12 - 13 only
	// In IE/Edge using regex groups here causes severe slowdowns.
	// See https://connect.microsoft.com/IE/feedback/details/1736512/
	rnoInnerhtml = /<script|<style|<link/i,

	// checked="checked" or checked
	rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,
	rcleanScript = /^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g;

// Prefer a tbody over its parent table for containing new rows
function manipulationTarget( elem, content ) {
	if ( nodeName( elem, "table" ) &&
		nodeName( content.nodeType !== 11 ? content : content.firstChild, "tr" ) ) {

		return jQuery( elem ).children( "tbody" )[ 0 ] || elem;
	}

	return elem;
}

// Replace/restore the type attribute of script elements for safe DOM manipulation
function disableScript( elem ) {
	elem.type = ( elem.getAttribute( "type" ) !== null ) + "/" + elem.type;
	return elem;
}
function restoreScript( elem ) {
	if ( ( elem.type || "" ).slice( 0, 5 ) === "true/" ) {
		elem.type = elem.type.slice( 5 );
	} else {
		elem.removeAttribute( "type" );
	}

	return elem;
}

function cloneCopyEvent( src, dest ) {
	var i, l, type, pdataOld, pdataCur, udataOld, udataCur, events;

	if ( dest.nodeType !== 1 ) {
		return;
	}

	// 1. Copy private data: events, handlers, etc.
	if ( dataPriv.hasData( src ) ) {
		pdataOld = dataPriv.access( src );
		pdataCur = dataPriv.set( dest, pdataOld );
		events = pdataOld.events;

		if ( events ) {
			delete pdataCur.handle;
			pdataCur.events = {};

			for ( type in events ) {
				for ( i = 0, l = events[ type ].length; i < l; i++ ) {
					jQuery.event.add( dest, type, events[ type ][ i ] );
				}
			}
		}
	}

	// 2. Copy user data
	if ( dataUser.hasData( src ) ) {
		udataOld = dataUser.access( src );
		udataCur = jQuery.extend( {}, udataOld );

		dataUser.set( dest, udataCur );
	}
}

// Fix IE bugs, see support tests
function fixInput( src, dest ) {
	var nodeName = dest.nodeName.toLowerCase();

	// Fails to persist the checked state of a cloned checkbox or radio button.
	if ( nodeName === "input" && rcheckableType.test( src.type ) ) {
		dest.checked = src.checked;

	// Fails to return the selected option to the default selected state when cloning options
	} else if ( nodeName === "input" || nodeName === "textarea" ) {
		dest.defaultValue = src.defaultValue;
	}
}

function domManip( collection, args, callback, ignored ) {

	// Flatten any nested arrays
	args = concat.apply( [], args );

	var fragment, first, scripts, hasScripts, node, doc,
		i = 0,
		l = collection.length,
		iNoClone = l - 1,
		value = args[ 0 ],
		valueIsFunction = isFunction( value );

	// We can't cloneNode fragments that contain checked, in WebKit
	if ( valueIsFunction ||
			( l > 1 && typeof value === "string" &&
				!support.checkClone && rchecked.test( value ) ) ) {
		return collection.each( function( index ) {
			var self = collection.eq( index );
			if ( valueIsFunction ) {
				args[ 0 ] = value.call( this, index, self.html() );
			}
			domManip( self, args, callback, ignored );
		} );
	}

	if ( l ) {
		fragment = buildFragment( args, collection[ 0 ].ownerDocument, false, collection, ignored );
		first = fragment.firstChild;

		if ( fragment.childNodes.length === 1 ) {
			fragment = first;
		}

		// Require either new content or an interest in ignored elements to invoke the callback
		if ( first || ignored ) {
			scripts = jQuery.map( getAll( fragment, "script" ), disableScript );
			hasScripts = scripts.length;

			// Use the original fragment for the last item
			// instead of the first because it can end up
			// being emptied incorrectly in certain situations (#8070).
			for ( ; i < l; i++ ) {
				node = fragment;

				if ( i !== iNoClone ) {
					node = jQuery.clone( node, true, true );

					// Keep references to cloned scripts for later restoration
					if ( hasScripts ) {

						// Support: Android <=4.0 only, PhantomJS 1 only
						// push.apply(_, arraylike) throws on ancient WebKit
						jQuery.merge( scripts, getAll( node, "script" ) );
					}
				}

				callback.call( collection[ i ], node, i );
			}

			if ( hasScripts ) {
				doc = scripts[ scripts.length - 1 ].ownerDocument;

				// Reenable scripts
				jQuery.map( scripts, restoreScript );

				// Evaluate executable scripts on first document insertion
				for ( i = 0; i < hasScripts; i++ ) {
					node = scripts[ i ];
					if ( rscriptType.test( node.type || "" ) &&
						!dataPriv.access( node, "globalEval" ) &&
						jQuery.contains( doc, node ) ) {

						if ( node.src && ( node.type || "" ).toLowerCase()  !== "module" ) {

							// Optional AJAX dependency, but won't run scripts if not present
							if ( jQuery._evalUrl ) {
								jQuery._evalUrl( node.src );
							}
						} else {
							DOMEval( node.textContent.replace( rcleanScript, "" ), doc, node );
						}
					}
				}
			}
		}
	}

	return collection;
}

function remove( elem, selector, keepData ) {
	var node,
		nodes = selector ? jQuery.filter( selector, elem ) : elem,
		i = 0;

	for ( ; ( node = nodes[ i ] ) != null; i++ ) {
		if ( !keepData && node.nodeType === 1 ) {
			jQuery.cleanData( getAll( node ) );
		}

		if ( node.parentNode ) {
			if ( keepData && jQuery.contains( node.ownerDocument, node ) ) {
				setGlobalEval( getAll( node, "script" ) );
			}
			node.parentNode.removeChild( node );
		}
	}

	return elem;
}

jQuery.extend( {
	htmlPrefilter: function( html ) {
		return html.replace( rxhtmlTag, "<$1></$2>" );
	},

	clone: function( elem, dataAndEvents, deepDataAndEvents ) {
		var i, l, srcElements, destElements,
			clone = elem.cloneNode( true ),
			inPage = jQuery.contains( elem.ownerDocument, elem );

		// Fix IE cloning issues
		if ( !support.noCloneChecked && ( elem.nodeType === 1 || elem.nodeType === 11 ) &&
				!jQuery.isXMLDoc( elem ) ) {

			// We eschew Sizzle here for performance reasons: https://jsperf.com/getall-vs-sizzle/2
			destElements = getAll( clone );
			srcElements = getAll( elem );

			for ( i = 0, l = srcElements.length; i < l; i++ ) {
				fixInput( srcElements[ i ], destElements[ i ] );
			}
		}

		// Copy the events from the original to the clone
		if ( dataAndEvents ) {
			if ( deepDataAndEvents ) {
				srcElements = srcElements || getAll( elem );
				destElements = destElements || getAll( clone );

				for ( i = 0, l = srcElements.length; i < l; i++ ) {
					cloneCopyEvent( srcElements[ i ], destElements[ i ] );
				}
			} else {
				cloneCopyEvent( elem, clone );
			}
		}

		// Preserve script evaluation history
		destElements = getAll( clone, "script" );
		if ( destElements.length > 0 ) {
			setGlobalEval( destElements, !inPage && getAll( elem, "script" ) );
		}

		// Return the cloned set
		return clone;
	},

	cleanData: function( elems ) {
		var data, elem, type,
			special = jQuery.event.special,
			i = 0;

		for ( ; ( elem = elems[ i ] ) !== undefined; i++ ) {
			if ( acceptData( elem ) ) {
				if ( ( data = elem[ dataPriv.expando ] ) ) {
					if ( data.events ) {
						for ( type in data.events ) {
							if ( special[ type ] ) {
								jQuery.event.remove( elem, type );

							// This is a shortcut to avoid jQuery.event.remove's overhead
							} else {
								jQuery.removeEvent( elem, type, data.handle );
							}
						}
					}

					// Support: Chrome <=35 - 45+
					// Assign undefined instead of using delete, see Data#remove
					elem[ dataPriv.expando ] = undefined;
				}
				if ( elem[ dataUser.expando ] ) {

					// Support: Chrome <=35 - 45+
					// Assign undefined instead of using delete, see Data#remove
					elem[ dataUser.expando ] = undefined;
				}
			}
		}
	}
} );

jQuery.fn.extend( {
	detach: function( selector ) {
		return remove( this, selector, true );
	},

	remove: function( selector ) {
		return remove( this, selector );
	},

	text: function( value ) {
		return access( this, function( value ) {
			return value === undefined ?
				jQuery.text( this ) :
				this.empty().each( function() {
					if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
						this.textContent = value;
					}
				} );
		}, null, value, arguments.length );
	},

	append: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.appendChild( elem );
			}
		} );
	},

	prepend: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.insertBefore( elem, target.firstChild );
			}
		} );
	},

	before: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this );
			}
		} );
	},

	after: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this.nextSibling );
			}
		} );
	},

	empty: function() {
		var elem,
			i = 0;

		for ( ; ( elem = this[ i ] ) != null; i++ ) {
			if ( elem.nodeType === 1 ) {

				// Prevent memory leaks
				jQuery.cleanData( getAll( elem, false ) );

				// Remove any remaining nodes
				elem.textContent = "";
			}
		}

		return this;
	},

	clone: function( dataAndEvents, deepDataAndEvents ) {
		dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
		deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

		return this.map( function() {
			return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
		} );
	},

	html: function( value ) {
		return access( this, function( value ) {
			var elem = this[ 0 ] || {},
				i = 0,
				l = this.length;

			if ( value === undefined && elem.nodeType === 1 ) {
				return elem.innerHTML;
			}

			// See if we can take a shortcut and just use innerHTML
			if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
				!wrapMap[ ( rtagName.exec( value ) || [ "", "" ] )[ 1 ].toLowerCase() ] ) {

				value = jQuery.htmlPrefilter( value );

				try {
					for ( ; i < l; i++ ) {
						elem = this[ i ] || {};

						// Remove element nodes and prevent memory leaks
						if ( elem.nodeType === 1 ) {
							jQuery.cleanData( getAll( elem, false ) );
							elem.innerHTML = value;
						}
					}

					elem = 0;

				// If using innerHTML throws an exception, use the fallback method
				} catch ( e ) {}
			}

			if ( elem ) {
				this.empty().append( value );
			}
		}, null, value, arguments.length );
	},

	replaceWith: function() {
		var ignored = [];

		// Make the changes, replacing each non-ignored context element with the new content
		return domManip( this, arguments, function( elem ) {
			var parent = this.parentNode;

			if ( jQuery.inArray( this, ignored ) < 0 ) {
				jQuery.cleanData( getAll( this ) );
				if ( parent ) {
					parent.replaceChild( elem, this );
				}
			}

		// Force callback invocation
		}, ignored );
	}
} );

jQuery.each( {
	appendTo: "append",
	prependTo: "prepend",
	insertBefore: "before",
	insertAfter: "after",
	replaceAll: "replaceWith"
}, function( name, original ) {
	jQuery.fn[ name ] = function( selector ) {
		var elems,
			ret = [],
			insert = jQuery( selector ),
			last = insert.length - 1,
			i = 0;

		for ( ; i <= last; i++ ) {
			elems = i === last ? this : this.clone( true );
			jQuery( insert[ i ] )[ original ]( elems );

			// Support: Android <=4.0 only, PhantomJS 1 only
			// .get() because push.apply(_, arraylike) throws on ancient WebKit
			push.apply( ret, elems.get() );
		}

		return this.pushStack( ret );
	};
} );
var rnumnonpx = new RegExp( "^(" + pnum + ")(?!px)[a-z%]+$", "i" );

var getStyles = function( elem ) {

		// Support: IE <=11 only, Firefox <=30 (#15098, #14150)
		// IE throws on elements created in popups
		// FF meanwhile throws on frame elements through "defaultView.getComputedStyle"
		var view = elem.ownerDocument.defaultView;

		if ( !view || !view.opener ) {
			view = window;
		}

		return view.getComputedStyle( elem );
	};

var rboxStyle = new RegExp( cssExpand.join( "|" ), "i" );



( function() {

	// Executing both pixelPosition & boxSizingReliable tests require only one layout
	// so they're executed at the same time to save the second computation.
	function computeStyleTests() {

		// This is a singleton, we need to execute it only once
		if ( !div ) {
			return;
		}

		container.style.cssText = "position:absolute;left:-11111px;width:60px;" +
			"margin-top:1px;padding:0;border:0";
		div.style.cssText =
			"position:relative;display:block;box-sizing:border-box;overflow:scroll;" +
			"margin:auto;border:1px;padding:1px;" +
			"width:60%;top:1%";
		documentElement.appendChild( container ).appendChild( div );

		var divStyle = window.getComputedStyle( div );
		pixelPositionVal = divStyle.top !== "1%";

		// Support: Android 4.0 - 4.3 only, Firefox <=3 - 44
		reliableMarginLeftVal = roundPixelMeasures( divStyle.marginLeft ) === 12;

		// Support: Android 4.0 - 4.3 only, Safari <=9.1 - 10.1, iOS <=7.0 - 9.3
		// Some styles come back with percentage values, even though they shouldn't
		div.style.right = "60%";
		pixelBoxStylesVal = roundPixelMeasures( divStyle.right ) === 36;

		// Support: IE 9 - 11 only
		// Detect misreporting of content dimensions for box-sizing:border-box elements
		boxSizingReliableVal = roundPixelMeasures( divStyle.width ) === 36;

		// Support: IE 9 only
		// Detect overflow:scroll screwiness (gh-3699)
		div.style.position = "absolute";
		scrollboxSizeVal = div.offsetWidth === 36 || "absolute";

		documentElement.removeChild( container );

		// Nullify the div so it wouldn't be stored in the memory and
		// it will also be a sign that checks already performed
		div = null;
	}

	function roundPixelMeasures( measure ) {
		return Math.round( parseFloat( measure ) );
	}

	var pixelPositionVal, boxSizingReliableVal, scrollboxSizeVal, pixelBoxStylesVal,
		reliableMarginLeftVal,
		container = document.createElement( "div" ),
		div = document.createElement( "div" );

	// Finish early in limited (non-browser) environments
	if ( !div.style ) {
		return;
	}

	// Support: IE <=9 - 11 only
	// Style of cloned element affects source element cloned (#8908)
	div.style.backgroundClip = "content-box";
	div.cloneNode( true ).style.backgroundClip = "";
	support.clearCloneStyle = div.style.backgroundClip === "content-box";

	jQuery.extend( support, {
		boxSizingReliable: function() {
			computeStyleTests();
			return boxSizingReliableVal;
		},
		pixelBoxStyles: function() {
			computeStyleTests();
			return pixelBoxStylesVal;
		},
		pixelPosition: function() {
			computeStyleTests();
			return pixelPositionVal;
		},
		reliableMarginLeft: function() {
			computeStyleTests();
			return reliableMarginLeftVal;
		},
		scrollboxSize: function() {
			computeStyleTests();
			return scrollboxSizeVal;
		}
	} );
} )();


function curCSS( elem, name, computed ) {
	var width, minWidth, maxWidth, ret,

		// Support: Firefox 51+
		// Retrieving style before computed somehow
		// fixes an issue with getting wrong values
		// on detached elements
		style = elem.style;

	computed = computed || getStyles( elem );

	// getPropertyValue is needed for:
	//   .css('filter') (IE 9 only, #12537)
	//   .css('--customProperty) (#3144)
	if ( computed ) {
		ret = computed.getPropertyValue( name ) || computed[ name ];

		if ( ret === "" && !jQuery.contains( elem.ownerDocument, elem ) ) {
			ret = jQuery.style( elem, name );
		}

		// A tribute to the "awesome hack by Dean Edwards"
		// Android Browser returns percentage for some values,
		// but width seems to be reliably pixels.
		// This is against the CSSOM draft spec:
		// https://drafts.csswg.org/cssom/#resolved-values
		if ( !support.pixelBoxStyles() && rnumnonpx.test( ret ) && rboxStyle.test( name ) ) {

			// Remember the original values
			width = style.width;
			minWidth = style.minWidth;
			maxWidth = style.maxWidth;

			// Put in the new values to get a computed value out
			style.minWidth = style.maxWidth = style.width = ret;
			ret = computed.width;

			// Revert the changed values
			style.width = width;
			style.minWidth = minWidth;
			style.maxWidth = maxWidth;
		}
	}

	return ret !== undefined ?

		// Support: IE <=9 - 11 only
		// IE returns zIndex value as an integer.
		ret + "" :
		ret;
}


function addGetHookIf( conditionFn, hookFn ) {

	// Define the hook, we'll check on the first run if it's really needed.
	return {
		get: function() {
			if ( conditionFn() ) {

				// Hook not needed (or it's not possible to use it due
				// to missing dependency), remove it.
				delete this.get;
				return;
			}

			// Hook needed; redefine it so that the support test is not executed again.
			return ( this.get = hookFn ).apply( this, arguments );
		}
	};
}


var

	// Swappable if display is none or starts with table
	// except "table", "table-cell", or "table-caption"
	// See here for display values: https://developer.mozilla.org/en-US/docs/CSS/display
	rdisplayswap = /^(none|table(?!-c[ea]).+)/,
	rcustomProp = /^--/,
	cssShow = { position: "absolute", visibility: "hidden", display: "block" },
	cssNormalTransform = {
		letterSpacing: "0",
		fontWeight: "400"
	},

	cssPrefixes = [ "Webkit", "Moz", "ms" ],
	emptyStyle = document.createElement( "div" ).style;

// Return a css property mapped to a potentially vendor prefixed property
function vendorPropName( name ) {

	// Shortcut for names that are not vendor prefixed
	if ( name in emptyStyle ) {
		return name;
	}

	// Check for vendor prefixed names
	var capName = name[ 0 ].toUpperCase() + name.slice( 1 ),
		i = cssPrefixes.length;

	while ( i-- ) {
		name = cssPrefixes[ i ] + capName;
		if ( name in emptyStyle ) {
			return name;
		}
	}
}

// Return a property mapped along what jQuery.cssProps suggests or to
// a vendor prefixed property.
function finalPropName( name ) {
	var ret = jQuery.cssProps[ name ];
	if ( !ret ) {
		ret = jQuery.cssProps[ name ] = vendorPropName( name ) || name;
	}
	return ret;
}

function setPositiveNumber( elem, value, subtract ) {

	// Any relative (+/-) values have already been
	// normalized at this point
	var matches = rcssNum.exec( value );
	return matches ?

		// Guard against undefined "subtract", e.g., when used as in cssHooks
		Math.max( 0, matches[ 2 ] - ( subtract || 0 ) ) + ( matches[ 3 ] || "px" ) :
		value;
}

function boxModelAdjustment( elem, dimension, box, isBorderBox, styles, computedVal ) {
	var i = dimension === "width" ? 1 : 0,
		extra = 0,
		delta = 0;

	// Adjustment may not be necessary
	if ( box === ( isBorderBox ? "border" : "content" ) ) {
		return 0;
	}

	for ( ; i < 4; i += 2 ) {

		// Both box models exclude margin
		if ( box === "margin" ) {
			delta += jQuery.css( elem, box + cssExpand[ i ], true, styles );
		}

		// If we get here with a content-box, we're seeking "padding" or "border" or "margin"
		if ( !isBorderBox ) {

			// Add padding
			delta += jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );

			// For "border" or "margin", add border
			if ( box !== "padding" ) {
				delta += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );

			// But still keep track of it otherwise
			} else {
				extra += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}

		// If we get here with a border-box (content + padding + border), we're seeking "content" or
		// "padding" or "margin"
		} else {

			// For "content", subtract padding
			if ( box === "content" ) {
				delta -= jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );
			}

			// For "content" or "padding", subtract border
			if ( box !== "margin" ) {
				delta -= jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		}
	}

	// Account for positive content-box scroll gutter when requested by providing computedVal
	if ( !isBorderBox && computedVal >= 0 ) {

		// offsetWidth/offsetHeight is a rounded sum of content, padding, scroll gutter, and border
		// Assuming integer scroll gutter, subtract the rest and round down
		delta += Math.max( 0, Math.ceil(
			elem[ "offset" + dimension[ 0 ].toUpperCase() + dimension.slice( 1 ) ] -
			computedVal -
			delta -
			extra -
			0.5
		) );
	}

	return delta;
}

function getWidthOrHeight( elem, dimension, extra ) {

	// Start with computed style
	var styles = getStyles( elem ),
		val = curCSS( elem, dimension, styles ),
		isBorderBox = jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
		valueIsBorderBox = isBorderBox;

	// Support: Firefox <=54
	// Return a confounding non-pixel value or feign ignorance, as appropriate.
	if ( rnumnonpx.test( val ) ) {
		if ( !extra ) {
			return val;
		}
		val = "auto";
	}

	// Check for style in case a browser which returns unreliable values
	// for getComputedStyle silently falls back to the reliable elem.style
	valueIsBorderBox = valueIsBorderBox &&
		( support.boxSizingReliable() || val === elem.style[ dimension ] );

	// Fall back to offsetWidth/offsetHeight when value is "auto"
	// This happens for inline elements with no explicit setting (gh-3571)
	// Support: Android <=4.1 - 4.3 only
	// Also use offsetWidth/offsetHeight for misreported inline dimensions (gh-3602)
	if ( val === "auto" ||
		!parseFloat( val ) && jQuery.css( elem, "display", false, styles ) === "inline" ) {

		val = elem[ "offset" + dimension[ 0 ].toUpperCase() + dimension.slice( 1 ) ];

		// offsetWidth/offsetHeight provide border-box values
		valueIsBorderBox = true;
	}

	// Normalize "" and auto
	val = parseFloat( val ) || 0;

	// Adjust for the element's box model
	return ( val +
		boxModelAdjustment(
			elem,
			dimension,
			extra || ( isBorderBox ? "border" : "content" ),
			valueIsBorderBox,
			styles,

			// Provide the current computed size to request scroll gutter calculation (gh-3589)
			val
		)
	) + "px";
}

jQuery.extend( {

	// Add in style property hooks for overriding the default
	// behavior of getting and setting a style property
	cssHooks: {
		opacity: {
			get: function( elem, computed ) {
				if ( computed ) {

					// We should always get a number back from opacity
					var ret = curCSS( elem, "opacity" );
					return ret === "" ? "1" : ret;
				}
			}
		}
	},

	// Don't automatically add "px" to these possibly-unitless properties
	cssNumber: {
		"animationIterationCount": true,
		"columnCount": true,
		"fillOpacity": true,
		"flexGrow": true,
		"flexShrink": true,
		"fontWeight": true,
		"lineHeight": true,
		"opacity": true,
		"order": true,
		"orphans": true,
		"widows": true,
		"zIndex": true,
		"zoom": true
	},

	// Add in properties whose names you wish to fix before
	// setting or getting the value
	cssProps: {},

	// Get and set the style property on a DOM Node
	style: function( elem, name, value, extra ) {

		// Don't set styles on text and comment nodes
		if ( !elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style ) {
			return;
		}

		// Make sure that we're working with the right name
		var ret, type, hooks,
			origName = camelCase( name ),
			isCustomProp = rcustomProp.test( name ),
			style = elem.style;

		// Make sure that we're working with the right name. We don't
		// want to query the value if it is a CSS custom property
		// since they are user-defined.
		if ( !isCustomProp ) {
			name = finalPropName( origName );
		}

		// Gets hook for the prefixed version, then unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// Check if we're setting a value
		if ( value !== undefined ) {
			type = typeof value;

			// Convert "+=" or "-=" to relative numbers (#7345)
			if ( type === "string" && ( ret = rcssNum.exec( value ) ) && ret[ 1 ] ) {
				value = adjustCSS( elem, name, ret );

				// Fixes bug #9237
				type = "number";
			}

			// Make sure that null and NaN values aren't set (#7116)
			if ( value == null || value !== value ) {
				return;
			}

			// If a number was passed in, add the unit (except for certain CSS properties)
			if ( type === "number" ) {
				value += ret && ret[ 3 ] || ( jQuery.cssNumber[ origName ] ? "" : "px" );
			}

			// background-* props affect original clone's values
			if ( !support.clearCloneStyle && value === "" && name.indexOf( "background" ) === 0 ) {
				style[ name ] = "inherit";
			}

			// If a hook was provided, use that value, otherwise just set the specified value
			if ( !hooks || !( "set" in hooks ) ||
				( value = hooks.set( elem, value, extra ) ) !== undefined ) {

				if ( isCustomProp ) {
					style.setProperty( name, value );
				} else {
					style[ name ] = value;
				}
			}

		} else {

			// If a hook was provided get the non-computed value from there
			if ( hooks && "get" in hooks &&
				( ret = hooks.get( elem, false, extra ) ) !== undefined ) {

				return ret;
			}

			// Otherwise just get the value from the style object
			return style[ name ];
		}
	},

	css: function( elem, name, extra, styles ) {
		var val, num, hooks,
			origName = camelCase( name ),
			isCustomProp = rcustomProp.test( name );

		// Make sure that we're working with the right name. We don't
		// want to modify the value if it is a CSS custom property
		// since they are user-defined.
		if ( !isCustomProp ) {
			name = finalPropName( origName );
		}

		// Try prefixed name followed by the unprefixed name
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// If a hook was provided get the computed value from there
		if ( hooks && "get" in hooks ) {
			val = hooks.get( elem, true, extra );
		}

		// Otherwise, if a way to get the computed value exists, use that
		if ( val === undefined ) {
			val = curCSS( elem, name, styles );
		}

		// Convert "normal" to computed value
		if ( val === "normal" && name in cssNormalTransform ) {
			val = cssNormalTransform[ name ];
		}

		// Make numeric if forced or a qualifier was provided and val looks numeric
		if ( extra === "" || extra ) {
			num = parseFloat( val );
			return extra === true || isFinite( num ) ? num || 0 : val;
		}

		return val;
	}
} );

jQuery.each( [ "height", "width" ], function( i, dimension ) {
	jQuery.cssHooks[ dimension ] = {
		get: function( elem, computed, extra ) {
			if ( computed ) {

				// Certain elements can have dimension info if we invisibly show them
				// but it must have a current display style that would benefit
				return rdisplayswap.test( jQuery.css( elem, "display" ) ) &&

					// Support: Safari 8+
					// Table columns in Safari have non-zero offsetWidth & zero
					// getBoundingClientRect().width unless display is changed.
					// Support: IE <=11 only
					// Running getBoundingClientRect on a disconnected node
					// in IE throws an error.
					( !elem.getClientRects().length || !elem.getBoundingClientRect().width ) ?
						swap( elem, cssShow, function() {
							return getWidthOrHeight( elem, dimension, extra );
						} ) :
						getWidthOrHeight( elem, dimension, extra );
			}
		},

		set: function( elem, value, extra ) {
			var matches,
				styles = getStyles( elem ),
				isBorderBox = jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
				subtract = extra && boxModelAdjustment(
					elem,
					dimension,
					extra,
					isBorderBox,
					styles
				);

			// Account for unreliable border-box dimensions by comparing offset* to computed and
			// faking a content-box to get border and padding (gh-3699)
			if ( isBorderBox && support.scrollboxSize() === styles.position ) {
				subtract -= Math.ceil(
					elem[ "offset" + dimension[ 0 ].toUpperCase() + dimension.slice( 1 ) ] -
					parseFloat( styles[ dimension ] ) -
					boxModelAdjustment( elem, dimension, "border", false, styles ) -
					0.5
				);
			}

			// Convert to pixels if value adjustment is needed
			if ( subtract && ( matches = rcssNum.exec( value ) ) &&
				( matches[ 3 ] || "px" ) !== "px" ) {

				elem.style[ dimension ] = value;
				value = jQuery.css( elem, dimension );
			}

			return setPositiveNumber( elem, value, subtract );
		}
	};
} );

jQuery.cssHooks.marginLeft = addGetHookIf( support.reliableMarginLeft,
	function( elem, computed ) {
		if ( computed ) {
			return ( parseFloat( curCSS( elem, "marginLeft" ) ) ||
				elem.getBoundingClientRect().left -
					swap( elem, { marginLeft: 0 }, function() {
						return elem.getBoundingClientRect().left;
					} )
				) + "px";
		}
	}
);

// These hooks are used by animate to expand properties
jQuery.each( {
	margin: "",
	padding: "",
	border: "Width"
}, function( prefix, suffix ) {
	jQuery.cssHooks[ prefix + suffix ] = {
		expand: function( value ) {
			var i = 0,
				expanded = {},

				// Assumes a single number if not a string
				parts = typeof value === "string" ? value.split( " " ) : [ value ];

			for ( ; i < 4; i++ ) {
				expanded[ prefix + cssExpand[ i ] + suffix ] =
					parts[ i ] || parts[ i - 2 ] || parts[ 0 ];
			}

			return expanded;
		}
	};

	if ( prefix !== "margin" ) {
		jQuery.cssHooks[ prefix + suffix ].set = setPositiveNumber;
	}
} );

jQuery.fn.extend( {
	css: function( name, value ) {
		return access( this, function( elem, name, value ) {
			var styles, len,
				map = {},
				i = 0;

			if ( Array.isArray( name ) ) {
				styles = getStyles( elem );
				len = name.length;

				for ( ; i < len; i++ ) {
					map[ name[ i ] ] = jQuery.css( elem, name[ i ], false, styles );
				}

				return map;
			}

			return value !== undefined ?
				jQuery.style( elem, name, value ) :
				jQuery.css( elem, name );
		}, name, value, arguments.length > 1 );
	}
} );


function Tween( elem, options, prop, end, easing ) {
	return new Tween.prototype.init( elem, options, prop, end, easing );
}
jQuery.Tween = Tween;

Tween.prototype = {
	constructor: Tween,
	init: function( elem, options, prop, end, easing, unit ) {
		this.elem = elem;
		this.prop = prop;
		this.easing = easing || jQuery.easing._default;
		this.options = options;
		this.start = this.now = this.cur();
		this.end = end;
		this.unit = unit || ( jQuery.cssNumber[ prop ] ? "" : "px" );
	},
	cur: function() {
		var hooks = Tween.propHooks[ this.prop ];

		return hooks && hooks.get ?
			hooks.get( this ) :
			Tween.propHooks._default.get( this );
	},
	run: function( percent ) {
		var eased,
			hooks = Tween.propHooks[ this.prop ];

		if ( this.options.duration ) {
			this.pos = eased = jQuery.easing[ this.easing ](
				percent, this.options.duration * percent, 0, 1, this.options.duration
			);
		} else {
			this.pos = eased = percent;
		}
		this.now = ( this.end - this.start ) * eased + this.start;

		if ( this.options.step ) {
			this.options.step.call( this.elem, this.now, this );
		}

		if ( hooks && hooks.set ) {
			hooks.set( this );
		} else {
			Tween.propHooks._default.set( this );
		}
		return this;
	}
};

Tween.prototype.init.prototype = Tween.prototype;

Tween.propHooks = {
	_default: {
		get: function( tween ) {
			var result;

			// Use a property on the element directly when it is not a DOM element,
			// or when there is no matching style property that exists.
			if ( tween.elem.nodeType !== 1 ||
				tween.elem[ tween.prop ] != null && tween.elem.style[ tween.prop ] == null ) {
				return tween.elem[ tween.prop ];
			}

			// Passing an empty string as a 3rd parameter to .css will automatically
			// attempt a parseFloat and fallback to a string if the parse fails.
			// Simple values such as "10px" are parsed to Float;
			// complex values such as "rotate(1rad)" are returned as-is.
			result = jQuery.css( tween.elem, tween.prop, "" );

			// Empty strings, null, undefined and "auto" are converted to 0.
			return !result || result === "auto" ? 0 : result;
		},
		set: function( tween ) {

			// Use step hook for back compat.
			// Use cssHook if its there.
			// Use .style if available and use plain properties where available.
			if ( jQuery.fx.step[ tween.prop ] ) {
				jQuery.fx.step[ tween.prop ]( tween );
			} else if ( tween.elem.nodeType === 1 &&
				( tween.elem.style[ jQuery.cssProps[ tween.prop ] ] != null ||
					jQuery.cssHooks[ tween.prop ] ) ) {
				jQuery.style( tween.elem, tween.prop, tween.now + tween.unit );
			} else {
				tween.elem[ tween.prop ] = tween.now;
			}
		}
	}
};

// Support: IE <=9 only
// Panic based approach to setting things on disconnected nodes
Tween.propHooks.scrollTop = Tween.propHooks.scrollLeft = {
	set: function( tween ) {
		if ( tween.elem.nodeType && tween.elem.parentNode ) {
			tween.elem[ tween.prop ] = tween.now;
		}
	}
};

jQuery.easing = {
	linear: function( p ) {
		return p;
	},
	swing: function( p ) {
		return 0.5 - Math.cos( p * Math.PI ) / 2;
	},
	_default: "swing"
};

jQuery.fx = Tween.prototype.init;

// Back compat <1.8 extension point
jQuery.fx.step = {};




var
	fxNow, inProgress,
	rfxtypes = /^(?:toggle|show|hide)$/,
	rrun = /queueHooks$/;

function schedule() {
	if ( inProgress ) {
		if ( document.hidden === false && window.requestAnimationFrame ) {
			window.requestAnimationFrame( schedule );
		} else {
			window.setTimeout( schedule, jQuery.fx.interval );
		}

		jQuery.fx.tick();
	}
}

// Animations created synchronously will run synchronously
function createFxNow() {
	window.setTimeout( function() {
		fxNow = undefined;
	} );
	return ( fxNow = Date.now() );
}

// Generate parameters to create a standard animation
function genFx( type, includeWidth ) {
	var which,
		i = 0,
		attrs = { height: type };

	// If we include width, step value is 1 to do all cssExpand values,
	// otherwise step value is 2 to skip over Left and Right
	includeWidth = includeWidth ? 1 : 0;
	for ( ; i < 4; i += 2 - includeWidth ) {
		which = cssExpand[ i ];
		attrs[ "margin" + which ] = attrs[ "padding" + which ] = type;
	}

	if ( includeWidth ) {
		attrs.opacity = attrs.width = type;
	}

	return attrs;
}

function createTween( value, prop, animation ) {
	var tween,
		collection = ( Animation.tweeners[ prop ] || [] ).concat( Animation.tweeners[ "*" ] ),
		index = 0,
		length = collection.length;
	for ( ; index < length; index++ ) {
		if ( ( tween = collection[ index ].call( animation, prop, value ) ) ) {

			// We're done with this property
			return tween;
		}
	}
}

function defaultPrefilter( elem, props, opts ) {
	var prop, value, toggle, hooks, oldfire, propTween, restoreDisplay, display,
		isBox = "width" in props || "height" in props,
		anim = this,
		orig = {},
		style = elem.style,
		hidden = elem.nodeType && isHiddenWithinTree( elem ),
		dataShow = dataPriv.get( elem, "fxshow" );

	// Queue-skipping animations hijack the fx hooks
	if ( !opts.queue ) {
		hooks = jQuery._queueHooks( elem, "fx" );
		if ( hooks.unqueued == null ) {
			hooks.unqueued = 0;
			oldfire = hooks.empty.fire;
			hooks.empty.fire = function() {
				if ( !hooks.unqueued ) {
					oldfire();
				}
			};
		}
		hooks.unqueued++;

		anim.always( function() {

			// Ensure the complete handler is called before this completes
			anim.always( function() {
				hooks.unqueued--;
				if ( !jQuery.queue( elem, "fx" ).length ) {
					hooks.empty.fire();
				}
			} );
		} );
	}

	// Detect show/hide animations
	for ( prop in props ) {
		value = props[ prop ];
		if ( rfxtypes.test( value ) ) {
			delete props[ prop ];
			toggle = toggle || value === "toggle";
			if ( value === ( hidden ? "hide" : "show" ) ) {

				// Pretend to be hidden if this is a "show" and
				// there is still data from a stopped show/hide
				if ( value === "show" && dataShow && dataShow[ prop ] !== undefined ) {
					hidden = true;

				// Ignore all other no-op show/hide data
				} else {
					continue;
				}
			}
			orig[ prop ] = dataShow && dataShow[ prop ] || jQuery.style( elem, prop );
		}
	}

	// Bail out if this is a no-op like .hide().hide()
	propTween = !jQuery.isEmptyObject( props );
	if ( !propTween && jQuery.isEmptyObject( orig ) ) {
		return;
	}

	// Restrict "overflow" and "display" styles during box animations
	if ( isBox && elem.nodeType === 1 ) {

		// Support: IE <=9 - 11, Edge 12 - 15
		// Record all 3 overflow attributes because IE does not infer the shorthand
		// from identically-valued overflowX and overflowY and Edge just mirrors
		// the overflowX value there.
		opts.overflow = [ style.overflow, style.overflowX, style.overflowY ];

		// Identify a display type, preferring old show/hide data over the CSS cascade
		restoreDisplay = dataShow && dataShow.display;
		if ( restoreDisplay == null ) {
			restoreDisplay = dataPriv.get( elem, "display" );
		}
		display = jQuery.css( elem, "display" );
		if ( display === "none" ) {
			if ( restoreDisplay ) {
				display = restoreDisplay;
			} else {

				// Get nonempty value(s) by temporarily forcing visibility
				showHide( [ elem ], true );
				restoreDisplay = elem.style.display || restoreDisplay;
				display = jQuery.css( elem, "display" );
				showHide( [ elem ] );
			}
		}

		// Animate inline elements as inline-block
		if ( display === "inline" || display === "inline-block" && restoreDisplay != null ) {
			if ( jQuery.css( elem, "float" ) === "none" ) {

				// Restore the original display value at the end of pure show/hide animations
				if ( !propTween ) {
					anim.done( function() {
						style.display = restoreDisplay;
					} );
					if ( restoreDisplay == null ) {
						display = style.display;
						restoreDisplay = display === "none" ? "" : display;
					}
				}
				style.display = "inline-block";
			}
		}
	}

	if ( opts.overflow ) {
		style.overflow = "hidden";
		anim.always( function() {
			style.overflow = opts.overflow[ 0 ];
			style.overflowX = opts.overflow[ 1 ];
			style.overflowY = opts.overflow[ 2 ];
		} );
	}

	// Implement show/hide animations
	propTween = false;
	for ( prop in orig ) {

		// General show/hide setup for this element animation
		if ( !propTween ) {
			if ( dataShow ) {
				if ( "hidden" in dataShow ) {
					hidden = dataShow.hidden;
				}
			} else {
				dataShow = dataPriv.access( elem, "fxshow", { display: restoreDisplay } );
			}

			// Store hidden/visible for toggle so `.stop().toggle()` "reverses"
			if ( toggle ) {
				dataShow.hidden = !hidden;
			}

			// Show elements before animating them
			if ( hidden ) {
				showHide( [ elem ], true );
			}

			/* eslint-disable no-loop-func */

			anim.done( function() {

			/* eslint-enable no-loop-func */

				// The final step of a "hide" animation is actually hiding the element
				if ( !hidden ) {
					showHide( [ elem ] );
				}
				dataPriv.remove( elem, "fxshow" );
				for ( prop in orig ) {
					jQuery.style( elem, prop, orig[ prop ] );
				}
			} );
		}

		// Per-property setup
		propTween = createTween( hidden ? dataShow[ prop ] : 0, prop, anim );
		if ( !( prop in dataShow ) ) {
			dataShow[ prop ] = propTween.start;
			if ( hidden ) {
				propTween.end = propTween.start;
				propTween.start = 0;
			}
		}
	}
}

function propFilter( props, specialEasing ) {
	var index, name, easing, value, hooks;

	// camelCase, specialEasing and expand cssHook pass
	for ( index in props ) {
		name = camelCase( index );
		easing = specialEasing[ name ];
		value = props[ index ];
		if ( Array.isArray( value ) ) {
			easing = value[ 1 ];
			value = props[ index ] = value[ 0 ];
		}

		if ( index !== name ) {
			props[ name ] = value;
			delete props[ index ];
		}

		hooks = jQuery.cssHooks[ name ];
		if ( hooks && "expand" in hooks ) {
			value = hooks.expand( value );
			delete props[ name ];

			// Not quite $.extend, this won't overwrite existing keys.
			// Reusing 'index' because we have the correct "name"
			for ( index in value ) {
				if ( !( index in props ) ) {
					props[ index ] = value[ index ];
					specialEasing[ index ] = easing;
				}
			}
		} else {
			specialEasing[ name ] = easing;
		}
	}
}

function Animation( elem, properties, options ) {
	var result,
		stopped,
		index = 0,
		length = Animation.prefilters.length,
		deferred = jQuery.Deferred().always( function() {

			// Don't match elem in the :animated selector
			delete tick.elem;
		} ),
		tick = function() {
			if ( stopped ) {
				return false;
			}
			var currentTime = fxNow || createFxNow(),
				remaining = Math.max( 0, animation.startTime + animation.duration - currentTime ),

				// Support: Android 2.3 only
				// Archaic crash bug won't allow us to use `1 - ( 0.5 || 0 )` (#12497)
				temp = remaining / animation.duration || 0,
				percent = 1 - temp,
				index = 0,
				length = animation.tweens.length;

			for ( ; index < length; index++ ) {
				animation.tweens[ index ].run( percent );
			}

			deferred.notifyWith( elem, [ animation, percent, remaining ] );

			// If there's more to do, yield
			if ( percent < 1 && length ) {
				return remaining;
			}

			// If this was an empty animation, synthesize a final progress notification
			if ( !length ) {
				deferred.notifyWith( elem, [ animation, 1, 0 ] );
			}

			// Resolve the animation and report its conclusion
			deferred.resolveWith( elem, [ animation ] );
			return false;
		},
		animation = deferred.promise( {
			elem: elem,
			props: jQuery.extend( {}, properties ),
			opts: jQuery.extend( true, {
				specialEasing: {},
				easing: jQuery.easing._default
			}, options ),
			originalProperties: properties,
			originalOptions: options,
			startTime: fxNow || createFxNow(),
			duration: options.duration,
			tweens: [],
			createTween: function( prop, end ) {
				var tween = jQuery.Tween( elem, animation.opts, prop, end,
						animation.opts.specialEasing[ prop ] || animation.opts.easing );
				animation.tweens.push( tween );
				return tween;
			},
			stop: function( gotoEnd ) {
				var index = 0,

					// If we are going to the end, we want to run all the tweens
					// otherwise we skip this part
					length = gotoEnd ? animation.tweens.length : 0;
				if ( stopped ) {
					return this;
				}
				stopped = true;
				for ( ; index < length; index++ ) {
					animation.tweens[ index ].run( 1 );
				}

				// Resolve when we played the last frame; otherwise, reject
				if ( gotoEnd ) {
					deferred.notifyWith( elem, [ animation, 1, 0 ] );
					deferred.resolveWith( elem, [ animation, gotoEnd ] );
				} else {
					deferred.rejectWith( elem, [ animation, gotoEnd ] );
				}
				return this;
			}
		} ),
		props = animation.props;

	propFilter( props, animation.opts.specialEasing );

	for ( ; index < length; index++ ) {
		result = Animation.prefilters[ index ].call( animation, elem, props, animation.opts );
		if ( result ) {
			if ( isFunction( result.stop ) ) {
				jQuery._queueHooks( animation.elem, animation.opts.queue ).stop =
					result.stop.bind( result );
			}
			return result;
		}
	}

	jQuery.map( props, createTween, animation );

	if ( isFunction( animation.opts.start ) ) {
		animation.opts.start.call( elem, animation );
	}

	// Attach callbacks from options
	animation
		.progress( animation.opts.progress )
		.done( animation.opts.done, animation.opts.complete )
		.fail( animation.opts.fail )
		.always( animation.opts.always );

	jQuery.fx.timer(
		jQuery.extend( tick, {
			elem: elem,
			anim: animation,
			queue: animation.opts.queue
		} )
	);

	return animation;
}

jQuery.Animation = jQuery.extend( Animation, {

	tweeners: {
		"*": [ function( prop, value ) {
			var tween = this.createTween( prop, value );
			adjustCSS( tween.elem, prop, rcssNum.exec( value ), tween );
			return tween;
		} ]
	},

	tweener: function( props, callback ) {
		if ( isFunction( props ) ) {
			callback = props;
			props = [ "*" ];
		} else {
			props = props.match( rnothtmlwhite );
		}

		var prop,
			index = 0,
			length = props.length;

		for ( ; index < length; index++ ) {
			prop = props[ index ];
			Animation.tweeners[ prop ] = Animation.tweeners[ prop ] || [];
			Animation.tweeners[ prop ].unshift( callback );
		}
	},

	prefilters: [ defaultPrefilter ],

	prefilter: function( callback, prepend ) {
		if ( prepend ) {
			Animation.prefilters.unshift( callback );
		} else {
			Animation.prefilters.push( callback );
		}
	}
} );

jQuery.speed = function( speed, easing, fn ) {
	var opt = speed && typeof speed === "object" ? jQuery.extend( {}, speed ) : {
		complete: fn || !fn && easing ||
			isFunction( speed ) && speed,
		duration: speed,
		easing: fn && easing || easing && !isFunction( easing ) && easing
	};

	// Go to the end state if fx are off
	if ( jQuery.fx.off ) {
		opt.duration = 0;

	} else {
		if ( typeof opt.duration !== "number" ) {
			if ( opt.duration in jQuery.fx.speeds ) {
				opt.duration = jQuery.fx.speeds[ opt.duration ];

			} else {
				opt.duration = jQuery.fx.speeds._default;
			}
		}
	}

	// Normalize opt.queue - true/undefined/null -> "fx"
	if ( opt.queue == null || opt.queue === true ) {
		opt.queue = "fx";
	}

	// Queueing
	opt.old = opt.complete;

	opt.complete = function() {
		if ( isFunction( opt.old ) ) {
			opt.old.call( this );
		}

		if ( opt.queue ) {
			jQuery.dequeue( this, opt.queue );
		}
	};

	return opt;
};

jQuery.fn.extend( {
	fadeTo: function( speed, to, easing, callback ) {

		// Show any hidden elements after setting opacity to 0
		return this.filter( isHiddenWithinTree ).css( "opacity", 0 ).show()

			// Animate to the value specified
			.end().animate( { opacity: to }, speed, easing, callback );
	},
	animate: function( prop, speed, easing, callback ) {
		var empty = jQuery.isEmptyObject( prop ),
			optall = jQuery.speed( speed, easing, callback ),
			doAnimation = function() {

				// Operate on a copy of prop so per-property easing won't be lost
				var anim = Animation( this, jQuery.extend( {}, prop ), optall );

				// Empty animations, or finishing resolves immediately
				if ( empty || dataPriv.get( this, "finish" ) ) {
					anim.stop( true );
				}
			};
			doAnimation.finish = doAnimation;

		return empty || optall.queue === false ?
			this.each( doAnimation ) :
			this.queue( optall.queue, doAnimation );
	},
	stop: function( type, clearQueue, gotoEnd ) {
		var stopQueue = function( hooks ) {
			var stop = hooks.stop;
			delete hooks.stop;
			stop( gotoEnd );
		};

		if ( typeof type !== "string" ) {
			gotoEnd = clearQueue;
			clearQueue = type;
			type = undefined;
		}
		if ( clearQueue && type !== false ) {
			this.queue( type || "fx", [] );
		}

		return this.each( function() {
			var dequeue = true,
				index = type != null && type + "queueHooks",
				timers = jQuery.timers,
				data = dataPriv.get( this );

			if ( index ) {
				if ( data[ index ] && data[ index ].stop ) {
					stopQueue( data[ index ] );
				}
			} else {
				for ( index in data ) {
					if ( data[ index ] && data[ index ].stop && rrun.test( index ) ) {
						stopQueue( data[ index ] );
					}
				}
			}

			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this &&
					( type == null || timers[ index ].queue === type ) ) {

					timers[ index ].anim.stop( gotoEnd );
					dequeue = false;
					timers.splice( index, 1 );
				}
			}

			// Start the next in the queue if the last step wasn't forced.
			// Timers currently will call their complete callbacks, which
			// will dequeue but only if they were gotoEnd.
			if ( dequeue || !gotoEnd ) {
				jQuery.dequeue( this, type );
			}
		} );
	},
	finish: function( type ) {
		if ( type !== false ) {
			type = type || "fx";
		}
		return this.each( function() {
			var index,
				data = dataPriv.get( this ),
				queue = data[ type + "queue" ],
				hooks = data[ type + "queueHooks" ],
				timers = jQuery.timers,
				length = queue ? queue.length : 0;

			// Enable finishing flag on private data
			data.finish = true;

			// Empty the queue first
			jQuery.queue( this, type, [] );

			if ( hooks && hooks.stop ) {
				hooks.stop.call( this, true );
			}

			// Look for any active animations, and finish them
			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && timers[ index ].queue === type ) {
					timers[ index ].anim.stop( true );
					timers.splice( index, 1 );
				}
			}

			// Look for any animations in the old queue and finish them
			for ( index = 0; index < length; index++ ) {
				if ( queue[ index ] && queue[ index ].finish ) {
					queue[ index ].finish.call( this );
				}
			}

			// Turn off finishing flag
			delete data.finish;
		} );
	}
} );

jQuery.each( [ "toggle", "show", "hide" ], function( i, name ) {
	var cssFn = jQuery.fn[ name ];
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return speed == null || typeof speed === "boolean" ?
			cssFn.apply( this, arguments ) :
			this.animate( genFx( name, true ), speed, easing, callback );
	};
} );

// Generate shortcuts for custom animations
jQuery.each( {
	slideDown: genFx( "show" ),
	slideUp: genFx( "hide" ),
	slideToggle: genFx( "toggle" ),
	fadeIn: { opacity: "show" },
	fadeOut: { opacity: "hide" },
	fadeToggle: { opacity: "toggle" }
}, function( name, props ) {
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return this.animate( props, speed, easing, callback );
	};
} );

jQuery.timers = [];
jQuery.fx.tick = function() {
	var timer,
		i = 0,
		timers = jQuery.timers;

	fxNow = Date.now();

	for ( ; i < timers.length; i++ ) {
		timer = timers[ i ];

		// Run the timer and safely remove it when done (allowing for external removal)
		if ( !timer() && timers[ i ] === timer ) {
			timers.splice( i--, 1 );
		}
	}

	if ( !timers.length ) {
		jQuery.fx.stop();
	}
	fxNow = undefined;
};

jQuery.fx.timer = function( timer ) {
	jQuery.timers.push( timer );
	jQuery.fx.start();
};

jQuery.fx.interval = 13;
jQuery.fx.start = function() {
	if ( inProgress ) {
		return;
	}

	inProgress = true;
	schedule();
};

jQuery.fx.stop = function() {
	inProgress = null;
};

jQuery.fx.speeds = {
	slow: 600,
	fast: 200,

	// Default speed
	_default: 400
};


// Based off of the plugin by Clint Helfers, with permission.
// https://web.archive.org/web/20100324014747/http://blindsignals.com/index.php/2009/07/jquery-delay/
jQuery.fn.delay = function( time, type ) {
	time = jQuery.fx ? jQuery.fx.speeds[ time ] || time : time;
	type = type || "fx";

	return this.queue( type, function( next, hooks ) {
		var timeout = window.setTimeout( next, time );
		hooks.stop = function() {
			window.clearTimeout( timeout );
		};
	} );
};


( function() {
	var input = document.createElement( "input" ),
		select = document.createElement( "select" ),
		opt = select.appendChild( document.createElement( "option" ) );

	input.type = "checkbox";

	// Support: Android <=4.3 only
	// Default value for a checkbox should be "on"
	support.checkOn = input.value !== "";

	// Support: IE <=11 only
	// Must access selectedIndex to make default options select
	support.optSelected = opt.selected;

	// Support: IE <=11 only
	// An input loses its value after becoming a radio
	input = document.createElement( "input" );
	input.value = "t";
	input.type = "radio";
	support.radioValue = input.value === "t";
} )();


var boolHook,
	attrHandle = jQuery.expr.attrHandle;

jQuery.fn.extend( {
	attr: function( name, value ) {
		return access( this, jQuery.attr, name, value, arguments.length > 1 );
	},

	removeAttr: function( name ) {
		return this.each( function() {
			jQuery.removeAttr( this, name );
		} );
	}
} );

jQuery.extend( {
	attr: function( elem, name, value ) {
		var ret, hooks,
			nType = elem.nodeType;

		// Don't get/set attributes on text, comment and attribute nodes
		if ( nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		// Fallback to prop when attributes are not supported
		if ( typeof elem.getAttribute === "undefined" ) {
			return jQuery.prop( elem, name, value );
		}

		// Attribute hooks are determined by the lowercase version
		// Grab necessary hook if one is defined
		if ( nType !== 1 || !jQuery.isXMLDoc( elem ) ) {
			hooks = jQuery.attrHooks[ name.toLowerCase() ] ||
				( jQuery.expr.match.bool.test( name ) ? boolHook : undefined );
		}

		if ( value !== undefined ) {
			if ( value === null ) {
				jQuery.removeAttr( elem, name );
				return;
			}

			if ( hooks && "set" in hooks &&
				( ret = hooks.set( elem, value, name ) ) !== undefined ) {
				return ret;
			}

			elem.setAttribute( name, value + "" );
			return value;
		}

		if ( hooks && "get" in hooks && ( ret = hooks.get( elem, name ) ) !== null ) {
			return ret;
		}

		ret = jQuery.find.attr( elem, name );

		// Non-existent attributes return null, we normalize to undefined
		return ret == null ? undefined : ret;
	},

	attrHooks: {
		type: {
			set: function( elem, value ) {
				if ( !support.radioValue && value === "radio" &&
					nodeName( elem, "input" ) ) {
					var val = elem.value;
					elem.setAttribute( "type", value );
					if ( val ) {
						elem.value = val;
					}
					return value;
				}
			}
		}
	},

	removeAttr: function( elem, value ) {
		var name,
			i = 0,

			// Attribute names can contain non-HTML whitespace characters
			// https://html.spec.whatwg.org/multipage/syntax.html#attributes-2
			attrNames = value && value.match( rnothtmlwhite );

		if ( attrNames && elem.nodeType === 1 ) {
			while ( ( name = attrNames[ i++ ] ) ) {
				elem.removeAttribute( name );
			}
		}
	}
} );

// Hooks for boolean attributes
boolHook = {
	set: function( elem, value, name ) {
		if ( value === false ) {

			// Remove boolean attributes when set to false
			jQuery.removeAttr( elem, name );
		} else {
			elem.setAttribute( name, name );
		}
		return name;
	}
};

jQuery.each( jQuery.expr.match.bool.source.match( /\w+/g ), function( i, name ) {
	var getter = attrHandle[ name ] || jQuery.find.attr;

	attrHandle[ name ] = function( elem, name, isXML ) {
		var ret, handle,
			lowercaseName = name.toLowerCase();

		if ( !isXML ) {

			// Avoid an infinite loop by temporarily removing this function from the getter
			handle = attrHandle[ lowercaseName ];
			attrHandle[ lowercaseName ] = ret;
			ret = getter( elem, name, isXML ) != null ?
				lowercaseName :
				null;
			attrHandle[ lowercaseName ] = handle;
		}
		return ret;
	};
} );




var rfocusable = /^(?:input|select|textarea|button)$/i,
	rclickable = /^(?:a|area)$/i;

jQuery.fn.extend( {
	prop: function( name, value ) {
		return access( this, jQuery.prop, name, value, arguments.length > 1 );
	},

	removeProp: function( name ) {
		return this.each( function() {
			delete this[ jQuery.propFix[ name ] || name ];
		} );
	}
} );

jQuery.extend( {
	prop: function( elem, name, value ) {
		var ret, hooks,
			nType = elem.nodeType;

		// Don't get/set properties on text, comment and attribute nodes
		if ( nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		if ( nType !== 1 || !jQuery.isXMLDoc( elem ) ) {

			// Fix name and attach hooks
			name = jQuery.propFix[ name ] || name;
			hooks = jQuery.propHooks[ name ];
		}

		if ( value !== undefined ) {
			if ( hooks && "set" in hooks &&
				( ret = hooks.set( elem, value, name ) ) !== undefined ) {
				return ret;
			}

			return ( elem[ name ] = value );
		}

		if ( hooks && "get" in hooks && ( ret = hooks.get( elem, name ) ) !== null ) {
			return ret;
		}

		return elem[ name ];
	},

	propHooks: {
		tabIndex: {
			get: function( elem ) {

				// Support: IE <=9 - 11 only
				// elem.tabIndex doesn't always return the
				// correct value when it hasn't been explicitly set
				// https://web.archive.org/web/20141116233347/http://fluidproject.org/blog/2008/01/09/getting-setting-and-removing-tabindex-values-with-javascript/
				// Use proper attribute retrieval(#12072)
				var tabindex = jQuery.find.attr( elem, "tabindex" );

				if ( tabindex ) {
					return parseInt( tabindex, 10 );
				}

				if (
					rfocusable.test( elem.nodeName ) ||
					rclickable.test( elem.nodeName ) &&
					elem.href
				) {
					return 0;
				}

				return -1;
			}
		}
	},

	propFix: {
		"for": "htmlFor",
		"class": "className"
	}
} );

// Support: IE <=11 only
// Accessing the selectedIndex property
// forces the browser to respect setting selected
// on the option
// The getter ensures a default option is selected
// when in an optgroup
// eslint rule "no-unused-expressions" is disabled for this code
// since it considers such accessions noop
if ( !support.optSelected ) {
	jQuery.propHooks.selected = {
		get: function( elem ) {

			/* eslint no-unused-expressions: "off" */

			var parent = elem.parentNode;
			if ( parent && parent.parentNode ) {
				parent.parentNode.selectedIndex;
			}
			return null;
		},
		set: function( elem ) {

			/* eslint no-unused-expressions: "off" */

			var parent = elem.parentNode;
			if ( parent ) {
				parent.selectedIndex;

				if ( parent.parentNode ) {
					parent.parentNode.selectedIndex;
				}
			}
		}
	};
}

jQuery.each( [
	"tabIndex",
	"readOnly",
	"maxLength",
	"cellSpacing",
	"cellPadding",
	"rowSpan",
	"colSpan",
	"useMap",
	"frameBorder",
	"contentEditable"
], function() {
	jQuery.propFix[ this.toLowerCase() ] = this;
} );




	// Strip and collapse whitespace according to HTML spec
	// https://infra.spec.whatwg.org/#strip-and-collapse-ascii-whitespace
	function stripAndCollapse( value ) {
		var tokens = value.match( rnothtmlwhite ) || [];
		return tokens.join( " " );
	}


function getClass( elem ) {
	return elem.getAttribute && elem.getAttribute( "class" ) || "";
}

function classesToArray( value ) {
	if ( Array.isArray( value ) ) {
		return value;
	}
	if ( typeof value === "string" ) {
		return value.match( rnothtmlwhite ) || [];
	}
	return [];
}

jQuery.fn.extend( {
	addClass: function( value ) {
		var classes, elem, cur, curValue, clazz, j, finalValue,
			i = 0;

		if ( isFunction( value ) ) {
			return this.each( function( j ) {
				jQuery( this ).addClass( value.call( this, j, getClass( this ) ) );
			} );
		}

		classes = classesToArray( value );

		if ( classes.length ) {
			while ( ( elem = this[ i++ ] ) ) {
				curValue = getClass( elem );
				cur = elem.nodeType === 1 && ( " " + stripAndCollapse( curValue ) + " " );

				if ( cur ) {
					j = 0;
					while ( ( clazz = classes[ j++ ] ) ) {
						if ( cur.indexOf( " " + clazz + " " ) < 0 ) {
							cur += clazz + " ";
						}
					}

					// Only assign if different to avoid unneeded rendering.
					finalValue = stripAndCollapse( cur );
					if ( curValue !== finalValue ) {
						elem.setAttribute( "class", finalValue );
					}
				}
			}
		}

		return this;
	},

	removeClass: function( value ) {
		var classes, elem, cur, curValue, clazz, j, finalValue,
			i = 0;

		if ( isFunction( value ) ) {
			return this.each( function( j ) {
				jQuery( this ).removeClass( value.call( this, j, getClass( this ) ) );
			} );
		}

		if ( !arguments.length ) {
			return this.attr( "class", "" );
		}

		classes = classesToArray( value );

		if ( classes.length ) {
			while ( ( elem = this[ i++ ] ) ) {
				curValue = getClass( elem );

				// This expression is here for better compressibility (see addClass)
				cur = elem.nodeType === 1 && ( " " + stripAndCollapse( curValue ) + " " );

				if ( cur ) {
					j = 0;
					while ( ( clazz = classes[ j++ ] ) ) {

						// Remove *all* instances
						while ( cur.indexOf( " " + clazz + " " ) > -1 ) {
							cur = cur.replace( " " + clazz + " ", " " );
						}
					}

					// Only assign if different to avoid unneeded rendering.
					finalValue = stripAndCollapse( cur );
					if ( curValue !== finalValue ) {
						elem.setAttribute( "class", finalValue );
					}
				}
			}
		}

		return this;
	},

	toggleClass: function( value, stateVal ) {
		var type = typeof value,
			isValidValue = type === "string" || Array.isArray( value );

		if ( typeof stateVal === "boolean" && isValidValue ) {
			return stateVal ? this.addClass( value ) : this.removeClass( value );
		}

		if ( isFunction( value ) ) {
			return this.each( function( i ) {
				jQuery( this ).toggleClass(
					value.call( this, i, getClass( this ), stateVal ),
					stateVal
				);
			} );
		}

		return this.each( function() {
			var className, i, self, classNames;

			if ( isValidValue ) {

				// Toggle individual class names
				i = 0;
				self = jQuery( this );
				classNames = classesToArray( value );

				while ( ( className = classNames[ i++ ] ) ) {

					// Check each className given, space separated list
					if ( self.hasClass( className ) ) {
						self.removeClass( className );
					} else {
						self.addClass( className );
					}
				}

			// Toggle whole class name
			} else if ( value === undefined || type === "boolean" ) {
				className = getClass( this );
				if ( className ) {

					// Store className if set
					dataPriv.set( this, "__className__", className );
				}

				// If the element has a class name or if we're passed `false`,
				// then remove the whole classname (if there was one, the above saved it).
				// Otherwise bring back whatever was previously saved (if anything),
				// falling back to the empty string if nothing was stored.
				if ( this.setAttribute ) {
					this.setAttribute( "class",
						className || value === false ?
						"" :
						dataPriv.get( this, "__className__" ) || ""
					);
				}
			}
		} );
	},

	hasClass: function( selector ) {
		var className, elem,
			i = 0;

		className = " " + selector + " ";
		while ( ( elem = this[ i++ ] ) ) {
			if ( elem.nodeType === 1 &&
				( " " + stripAndCollapse( getClass( elem ) ) + " " ).indexOf( className ) > -1 ) {
					return true;
			}
		}

		return false;
	}
} );




var rreturn = /\r/g;

jQuery.fn.extend( {
	val: function( value ) {
		var hooks, ret, valueIsFunction,
			elem = this[ 0 ];

		if ( !arguments.length ) {
			if ( elem ) {
				hooks = jQuery.valHooks[ elem.type ] ||
					jQuery.valHooks[ elem.nodeName.toLowerCase() ];

				if ( hooks &&
					"get" in hooks &&
					( ret = hooks.get( elem, "value" ) ) !== undefined
				) {
					return ret;
				}

				ret = elem.value;

				// Handle most common string cases
				if ( typeof ret === "string" ) {
					return ret.replace( rreturn, "" );
				}

				// Handle cases where value is null/undef or number
				return ret == null ? "" : ret;
			}

			return;
		}

		valueIsFunction = isFunction( value );

		return this.each( function( i ) {
			var val;

			if ( this.nodeType !== 1 ) {
				return;
			}

			if ( valueIsFunction ) {
				val = value.call( this, i, jQuery( this ).val() );
			} else {
				val = value;
			}

			// Treat null/undefined as ""; convert numbers to string
			if ( val == null ) {
				val = "";

			} else if ( typeof val === "number" ) {
				val += "";

			} else if ( Array.isArray( val ) ) {
				val = jQuery.map( val, function( value ) {
					return value == null ? "" : value + "";
				} );
			}

			hooks = jQuery.valHooks[ this.type ] || jQuery.valHooks[ this.nodeName.toLowerCase() ];

			// If set returns undefined, fall back to normal setting
			if ( !hooks || !( "set" in hooks ) || hooks.set( this, val, "value" ) === undefined ) {
				this.value = val;
			}
		} );
	}
} );

jQuery.extend( {
	valHooks: {
		option: {
			get: function( elem ) {

				var val = jQuery.find.attr( elem, "value" );
				return val != null ?
					val :

					// Support: IE <=10 - 11 only
					// option.text throws exceptions (#14686, #14858)
					// Strip and collapse whitespace
					// https://html.spec.whatwg.org/#strip-and-collapse-whitespace
					stripAndCollapse( jQuery.text( elem ) );
			}
		},
		select: {
			get: function( elem ) {
				var value, option, i,
					options = elem.options,
					index = elem.selectedIndex,
					one = elem.type === "select-one",
					values = one ? null : [],
					max = one ? index + 1 : options.length;

				if ( index < 0 ) {
					i = max;

				} else {
					i = one ? index : 0;
				}

				// Loop through all the selected options
				for ( ; i < max; i++ ) {
					option = options[ i ];

					// Support: IE <=9 only
					// IE8-9 doesn't update selected after form reset (#2551)
					if ( ( option.selected || i === index ) &&

							// Don't return options that are disabled or in a disabled optgroup
							!option.disabled &&
							( !option.parentNode.disabled ||
								!nodeName( option.parentNode, "optgroup" ) ) ) {

						// Get the specific value for the option
						value = jQuery( option ).val();

						// We don't need an array for one selects
						if ( one ) {
							return value;
						}

						// Multi-Selects return an array
						values.push( value );
					}
				}

				return values;
			},

			set: function( elem, value ) {
				var optionSet, option,
					options = elem.options,
					values = jQuery.makeArray( value ),
					i = options.length;

				while ( i-- ) {
					option = options[ i ];

					/* eslint-disable no-cond-assign */

					if ( option.selected =
						jQuery.inArray( jQuery.valHooks.option.get( option ), values ) > -1
					) {
						optionSet = true;
					}

					/* eslint-enable no-cond-assign */
				}

				// Force browsers to behave consistently when non-matching value is set
				if ( !optionSet ) {
					elem.selectedIndex = -1;
				}
				return values;
			}
		}
	}
} );

// Radios and checkboxes getter/setter
jQuery.each( [ "radio", "checkbox" ], function() {
	jQuery.valHooks[ this ] = {
		set: function( elem, value ) {
			if ( Array.isArray( value ) ) {
				return ( elem.checked = jQuery.inArray( jQuery( elem ).val(), value ) > -1 );
			}
		}
	};
	if ( !support.checkOn ) {
		jQuery.valHooks[ this ].get = function( elem ) {
			return elem.getAttribute( "value" ) === null ? "on" : elem.value;
		};
	}
} );




// Return jQuery for attributes-only inclusion


support.focusin = "onfocusin" in window;


var rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
	stopPropagationCallback = function( e ) {
		e.stopPropagation();
	};

jQuery.extend( jQuery.event, {

	trigger: function( event, data, elem, onlyHandlers ) {

		var i, cur, tmp, bubbleType, ontype, handle, special, lastElement,
			eventPath = [ elem || document ],
			type = hasOwn.call( event, "type" ) ? event.type : event,
			namespaces = hasOwn.call( event, "namespace" ) ? event.namespace.split( "." ) : [];

		cur = lastElement = tmp = elem = elem || document;

		// Don't do events on text and comment nodes
		if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
			return;
		}

		// focus/blur morphs to focusin/out; ensure we're not firing them right now
		if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
			return;
		}

		if ( type.indexOf( "." ) > -1 ) {

			// Namespaced trigger; create a regexp to match event type in handle()
			namespaces = type.split( "." );
			type = namespaces.shift();
			namespaces.sort();
		}
		ontype = type.indexOf( ":" ) < 0 && "on" + type;

		// Caller can pass in a jQuery.Event object, Object, or just an event type string
		event = event[ jQuery.expando ] ?
			event :
			new jQuery.Event( type, typeof event === "object" && event );

		// Trigger bitmask: & 1 for native handlers; & 2 for jQuery (always true)
		event.isTrigger = onlyHandlers ? 2 : 3;
		event.namespace = namespaces.join( "." );
		event.rnamespace = event.namespace ?
			new RegExp( "(^|\\.)" + namespaces.join( "\\.(?:.*\\.|)" ) + "(\\.|$)" ) :
			null;

		// Clean up the event in case it is being reused
		event.result = undefined;
		if ( !event.target ) {
			event.target = elem;
		}

		// Clone any incoming data and prepend the event, creating the handler arg list
		data = data == null ?
			[ event ] :
			jQuery.makeArray( data, [ event ] );

		// Allow special events to draw outside the lines
		special = jQuery.event.special[ type ] || {};
		if ( !onlyHandlers && special.trigger && special.trigger.apply( elem, data ) === false ) {
			return;
		}

		// Determine event propagation path in advance, per W3C events spec (#9951)
		// Bubble up to document, then to window; watch for a global ownerDocument var (#9724)
		if ( !onlyHandlers && !special.noBubble && !isWindow( elem ) ) {

			bubbleType = special.delegateType || type;
			if ( !rfocusMorph.test( bubbleType + type ) ) {
				cur = cur.parentNode;
			}
			for ( ; cur; cur = cur.parentNode ) {
				eventPath.push( cur );
				tmp = cur;
			}

			// Only add window if we got to document (e.g., not plain obj or detached DOM)
			if ( tmp === ( elem.ownerDocument || document ) ) {
				eventPath.push( tmp.defaultView || tmp.parentWindow || window );
			}
		}

		// Fire handlers on the event path
		i = 0;
		while ( ( cur = eventPath[ i++ ] ) && !event.isPropagationStopped() ) {
			lastElement = cur;
			event.type = i > 1 ?
				bubbleType :
				special.bindType || type;

			// jQuery handler
			handle = ( dataPriv.get( cur, "events" ) || {} )[ event.type ] &&
				dataPriv.get( cur, "handle" );
			if ( handle ) {
				handle.apply( cur, data );
			}

			// Native handler
			handle = ontype && cur[ ontype ];
			if ( handle && handle.apply && acceptData( cur ) ) {
				event.result = handle.apply( cur, data );
				if ( event.result === false ) {
					event.preventDefault();
				}
			}
		}
		event.type = type;

		// If nobody prevented the default action, do it now
		if ( !onlyHandlers && !event.isDefaultPrevented() ) {

			if ( ( !special._default ||
				special._default.apply( eventPath.pop(), data ) === false ) &&
				acceptData( elem ) ) {

				// Call a native DOM method on the target with the same name as the event.
				// Don't do default actions on window, that's where global variables be (#6170)
				if ( ontype && isFunction( elem[ type ] ) && !isWindow( elem ) ) {

					// Don't re-trigger an onFOO event when we call its FOO() method
					tmp = elem[ ontype ];

					if ( tmp ) {
						elem[ ontype ] = null;
					}

					// Prevent re-triggering of the same event, since we already bubbled it above
					jQuery.event.triggered = type;

					if ( event.isPropagationStopped() ) {
						lastElement.addEventListener( type, stopPropagationCallback );
					}

					elem[ type ]();

					if ( event.isPropagationStopped() ) {
						lastElement.removeEventListener( type, stopPropagationCallback );
					}

					jQuery.event.triggered = undefined;

					if ( tmp ) {
						elem[ ontype ] = tmp;
					}
				}
			}
		}

		return event.result;
	},

	// Piggyback on a donor event to simulate a different one
	// Used only for `focus(in | out)` events
	simulate: function( type, elem, event ) {
		var e = jQuery.extend(
			new jQuery.Event(),
			event,
			{
				type: type,
				isSimulated: true
			}
		);

		jQuery.event.trigger( e, null, elem );
	}

} );

jQuery.fn.extend( {

	trigger: function( type, data ) {
		return this.each( function() {
			jQuery.event.trigger( type, data, this );
		} );
	},
	triggerHandler: function( type, data ) {
		var elem = this[ 0 ];
		if ( elem ) {
			return jQuery.event.trigger( type, data, elem, true );
		}
	}
} );


// Support: Firefox <=44
// Firefox doesn't have focus(in | out) events
// Related ticket - https://bugzilla.mozilla.org/show_bug.cgi?id=687787
//
// Support: Chrome <=48 - 49, Safari <=9.0 - 9.1
// focus(in | out) events fire after focus & blur events,
// which is spec violation - http://www.w3.org/TR/DOM-Level-3-Events/#events-focusevent-event-order
// Related ticket - https://bugs.chromium.org/p/chromium/issues/detail?id=449857
if ( !support.focusin ) {
	jQuery.each( { focus: "focusin", blur: "focusout" }, function( orig, fix ) {

		// Attach a single capturing handler on the document while someone wants focusin/focusout
		var handler = function( event ) {
			jQuery.event.simulate( fix, event.target, jQuery.event.fix( event ) );
		};

		jQuery.event.special[ fix ] = {
			setup: function() {
				var doc = this.ownerDocument || this,
					attaches = dataPriv.access( doc, fix );

				if ( !attaches ) {
					doc.addEventListener( orig, handler, true );
				}
				dataPriv.access( doc, fix, ( attaches || 0 ) + 1 );
			},
			teardown: function() {
				var doc = this.ownerDocument || this,
					attaches = dataPriv.access( doc, fix ) - 1;

				if ( !attaches ) {
					doc.removeEventListener( orig, handler, true );
					dataPriv.remove( doc, fix );

				} else {
					dataPriv.access( doc, fix, attaches );
				}
			}
		};
	} );
}
var location = window.location;

var nonce = Date.now();

var rquery = ( /\?/ );



// Cross-browser xml parsing
jQuery.parseXML = function( data ) {
	var xml;
	if ( !data || typeof data !== "string" ) {
		return null;
	}

	// Support: IE 9 - 11 only
	// IE throws on parseFromString with invalid input.
	try {
		xml = ( new window.DOMParser() ).parseFromString( data, "text/xml" );
	} catch ( e ) {
		xml = undefined;
	}

	if ( !xml || xml.getElementsByTagName( "parsererror" ).length ) {
		jQuery.error( "Invalid XML: " + data );
	}
	return xml;
};


var
	rbracket = /\[\]$/,
	rCRLF = /\r?\n/g,
	rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
	rsubmittable = /^(?:input|select|textarea|keygen)/i;

function buildParams( prefix, obj, traditional, add ) {
	var name;

	if ( Array.isArray( obj ) ) {

		// Serialize array item.
		jQuery.each( obj, function( i, v ) {
			if ( traditional || rbracket.test( prefix ) ) {

				// Treat each array item as a scalar.
				add( prefix, v );

			} else {

				// Item is non-scalar (array or object), encode its numeric index.
				buildParams(
					prefix + "[" + ( typeof v === "object" && v != null ? i : "" ) + "]",
					v,
					traditional,
					add
				);
			}
		} );

	} else if ( !traditional && toType( obj ) === "object" ) {

		// Serialize object item.
		for ( name in obj ) {
			buildParams( prefix + "[" + name + "]", obj[ name ], traditional, add );
		}

	} else {

		// Serialize scalar item.
		add( prefix, obj );
	}
}

// Serialize an array of form elements or a set of
// key/values into a query string
jQuery.param = function( a, traditional ) {
	var prefix,
		s = [],
		add = function( key, valueOrFunction ) {

			// If value is a function, invoke it and use its return value
			var value = isFunction( valueOrFunction ) ?
				valueOrFunction() :
				valueOrFunction;

			s[ s.length ] = encodeURIComponent( key ) + "=" +
				encodeURIComponent( value == null ? "" : value );
		};

	// If an array was passed in, assume that it is an array of form elements.
	if ( Array.isArray( a ) || ( a.jquery && !jQuery.isPlainObject( a ) ) ) {

		// Serialize the form elements
		jQuery.each( a, function() {
			add( this.name, this.value );
		} );

	} else {

		// If traditional, encode the "old" way (the way 1.3.2 or older
		// did it), otherwise encode params recursively.
		for ( prefix in a ) {
			buildParams( prefix, a[ prefix ], traditional, add );
		}
	}

	// Return the resulting serialization
	return s.join( "&" );
};

jQuery.fn.extend( {
	serialize: function() {
		return jQuery.param( this.serializeArray() );
	},
	serializeArray: function() {
		return this.map( function() {

			// Can add propHook for "elements" to filter or add form elements
			var elements = jQuery.prop( this, "elements" );
			return elements ? jQuery.makeArray( elements ) : this;
		} )
		.filter( function() {
			var type = this.type;

			// Use .is( ":disabled" ) so that fieldset[disabled] works
			return this.name && !jQuery( this ).is( ":disabled" ) &&
				rsubmittable.test( this.nodeName ) && !rsubmitterTypes.test( type ) &&
				( this.checked || !rcheckableType.test( type ) );
		} )
		.map( function( i, elem ) {
			var val = jQuery( this ).val();

			if ( val == null ) {
				return null;
			}

			if ( Array.isArray( val ) ) {
				return jQuery.map( val, function( val ) {
					return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
				} );
			}

			return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
		} ).get();
	}
} );


var
	r20 = /%20/g,
	rhash = /#.*$/,
	rantiCache = /([?&])_=[^&]*/,
	rheaders = /^(.*?):[ \t]*([^\r\n]*)$/mg,

	// #7653, #8125, #8152: local protocol detection
	rlocalProtocol = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/,
	rnoContent = /^(?:GET|HEAD)$/,
	rprotocol = /^\/\//,

	/* Prefilters
	 * 1) They are useful to introduce custom dataTypes (see ajax/jsonp.js for an example)
	 * 2) These are called:
	 *    - BEFORE asking for a transport
	 *    - AFTER param serialization (s.data is a string if s.processData is true)
	 * 3) key is the dataType
	 * 4) the catchall symbol "*" can be used
	 * 5) execution will start with transport dataType and THEN continue down to "*" if needed
	 */
	prefilters = {},

	/* Transports bindings
	 * 1) key is the dataType
	 * 2) the catchall symbol "*" can be used
	 * 3) selection will start with transport dataType and THEN go to "*" if needed
	 */
	transports = {},

	// Avoid comment-prolog char sequence (#10098); must appease lint and evade compression
	allTypes = "*/".concat( "*" ),

	// Anchor tag for parsing the document origin
	originAnchor = document.createElement( "a" );
	originAnchor.href = location.href;

// Base "constructor" for jQuery.ajaxPrefilter and jQuery.ajaxTransport
function addToPrefiltersOrTransports( structure ) {

	// dataTypeExpression is optional and defaults to "*"
	return function( dataTypeExpression, func ) {

		if ( typeof dataTypeExpression !== "string" ) {
			func = dataTypeExpression;
			dataTypeExpression = "*";
		}

		var dataType,
			i = 0,
			dataTypes = dataTypeExpression.toLowerCase().match( rnothtmlwhite ) || [];

		if ( isFunction( func ) ) {

			// For each dataType in the dataTypeExpression
			while ( ( dataType = dataTypes[ i++ ] ) ) {

				// Prepend if requested
				if ( dataType[ 0 ] === "+" ) {
					dataType = dataType.slice( 1 ) || "*";
					( structure[ dataType ] = structure[ dataType ] || [] ).unshift( func );

				// Otherwise append
				} else {
					( structure[ dataType ] = structure[ dataType ] || [] ).push( func );
				}
			}
		}
	};
}

// Base inspection function for prefilters and transports
function inspectPrefiltersOrTransports( structure, options, originalOptions, jqXHR ) {

	var inspected = {},
		seekingTransport = ( structure === transports );

	function inspect( dataType ) {
		var selected;
		inspected[ dataType ] = true;
		jQuery.each( structure[ dataType ] || [], function( _, prefilterOrFactory ) {
			var dataTypeOrTransport = prefilterOrFactory( options, originalOptions, jqXHR );
			if ( typeof dataTypeOrTransport === "string" &&
				!seekingTransport && !inspected[ dataTypeOrTransport ] ) {

				options.dataTypes.unshift( dataTypeOrTransport );
				inspect( dataTypeOrTransport );
				return false;
			} else if ( seekingTransport ) {
				return !( selected = dataTypeOrTransport );
			}
		} );
		return selected;
	}

	return inspect( options.dataTypes[ 0 ] ) || !inspected[ "*" ] && inspect( "*" );
}

// A special extend for ajax options
// that takes "flat" options (not to be deep extended)
// Fixes #9887
function ajaxExtend( target, src ) {
	var key, deep,
		flatOptions = jQuery.ajaxSettings.flatOptions || {};

	for ( key in src ) {
		if ( src[ key ] !== undefined ) {
			( flatOptions[ key ] ? target : ( deep || ( deep = {} ) ) )[ key ] = src[ key ];
		}
	}
	if ( deep ) {
		jQuery.extend( true, target, deep );
	}

	return target;
}

/* Handles responses to an ajax request:
 * - finds the right dataType (mediates between content-type and expected dataType)
 * - returns the corresponding response
 */
function ajaxHandleResponses( s, jqXHR, responses ) {

	var ct, type, finalDataType, firstDataType,
		contents = s.contents,
		dataTypes = s.dataTypes;

	// Remove auto dataType and get content-type in the process
	while ( dataTypes[ 0 ] === "*" ) {
		dataTypes.shift();
		if ( ct === undefined ) {
			ct = s.mimeType || jqXHR.getResponseHeader( "Content-Type" );
		}
	}

	// Check if we're dealing with a known content-type
	if ( ct ) {
		for ( type in contents ) {
			if ( contents[ type ] && contents[ type ].test( ct ) ) {
				dataTypes.unshift( type );
				break;
			}
		}
	}

	// Check to see if we have a response for the expected dataType
	if ( dataTypes[ 0 ] in responses ) {
		finalDataType = dataTypes[ 0 ];
	} else {

		// Try convertible dataTypes
		for ( type in responses ) {
			if ( !dataTypes[ 0 ] || s.converters[ type + " " + dataTypes[ 0 ] ] ) {
				finalDataType = type;
				break;
			}
			if ( !firstDataType ) {
				firstDataType = type;
			}
		}

		// Or just use first one
		finalDataType = finalDataType || firstDataType;
	}

	// If we found a dataType
	// We add the dataType to the list if needed
	// and return the corresponding response
	if ( finalDataType ) {
		if ( finalDataType !== dataTypes[ 0 ] ) {
			dataTypes.unshift( finalDataType );
		}
		return responses[ finalDataType ];
	}
}

/* Chain conversions given the request and the original response
 * Also sets the responseXXX fields on the jqXHR instance
 */
function ajaxConvert( s, response, jqXHR, isSuccess ) {
	var conv2, current, conv, tmp, prev,
		converters = {},

		// Work with a copy of dataTypes in case we need to modify it for conversion
		dataTypes = s.dataTypes.slice();

	// Create converters map with lowercased keys
	if ( dataTypes[ 1 ] ) {
		for ( conv in s.converters ) {
			converters[ conv.toLowerCase() ] = s.converters[ conv ];
		}
	}

	current = dataTypes.shift();

	// Convert to each sequential dataType
	while ( current ) {

		if ( s.responseFields[ current ] ) {
			jqXHR[ s.responseFields[ current ] ] = response;
		}

		// Apply the dataFilter if provided
		if ( !prev && isSuccess && s.dataFilter ) {
			response = s.dataFilter( response, s.dataType );
		}

		prev = current;
		current = dataTypes.shift();

		if ( current ) {

			// There's only work to do if current dataType is non-auto
			if ( current === "*" ) {

				current = prev;

			// Convert response if prev dataType is non-auto and differs from current
			} else if ( prev !== "*" && prev !== current ) {

				// Seek a direct converter
				conv = converters[ prev + " " + current ] || converters[ "* " + current ];

				// If none found, seek a pair
				if ( !conv ) {
					for ( conv2 in converters ) {

						// If conv2 outputs current
						tmp = conv2.split( " " );
						if ( tmp[ 1 ] === current ) {

							// If prev can be converted to accepted input
							conv = converters[ prev + " " + tmp[ 0 ] ] ||
								converters[ "* " + tmp[ 0 ] ];
							if ( conv ) {

								// Condense equivalence converters
								if ( conv === true ) {
									conv = converters[ conv2 ];

								// Otherwise, insert the intermediate dataType
								} else if ( converters[ conv2 ] !== true ) {
									current = tmp[ 0 ];
									dataTypes.unshift( tmp[ 1 ] );
								}
								break;
							}
						}
					}
				}

				// Apply converter (if not an equivalence)
				if ( conv !== true ) {

					// Unless errors are allowed to bubble, catch and return them
					if ( conv && s.throws ) {
						response = conv( response );
					} else {
						try {
							response = conv( response );
						} catch ( e ) {
							return {
								state: "parsererror",
								error: conv ? e : "No conversion from " + prev + " to " + current
							};
						}
					}
				}
			}
		}
	}

	return { state: "success", data: response };
}

jQuery.extend( {

	// Counter for holding the number of active queries
	active: 0,

	// Last-Modified header cache for next request
	lastModified: {},
	etag: {},

	ajaxSettings: {
		url: location.href,
		type: "GET",
		isLocal: rlocalProtocol.test( location.protocol ),
		global: true,
		processData: true,
		async: true,
		contentType: "application/x-www-form-urlencoded; charset=UTF-8",

		/*
		timeout: 0,
		data: null,
		dataType: null,
		username: null,
		password: null,
		cache: null,
		throws: false,
		traditional: false,
		headers: {},
		*/

		accepts: {
			"*": allTypes,
			text: "text/plain",
			html: "text/html",
			xml: "application/xml, text/xml",
			json: "application/json, text/javascript"
		},

		contents: {
			xml: /\bxml\b/,
			html: /\bhtml/,
			json: /\bjson\b/
		},

		responseFields: {
			xml: "responseXML",
			text: "responseText",
			json: "responseJSON"
		},

		// Data converters
		// Keys separate source (or catchall "*") and destination types with a single space
		converters: {

			// Convert anything to text
			"* text": String,

			// Text to html (true = no transformation)
			"text html": true,

			// Evaluate text as a json expression
			"text json": JSON.parse,

			// Parse text as xml
			"text xml": jQuery.parseXML
		},

		// For options that shouldn't be deep extended:
		// you can add your own custom options here if
		// and when you create one that shouldn't be
		// deep extended (see ajaxExtend)
		flatOptions: {
			url: true,
			context: true
		}
	},

	// Creates a full fledged settings object into target
	// with both ajaxSettings and settings fields.
	// If target is omitted, writes into ajaxSettings.
	ajaxSetup: function( target, settings ) {
		return settings ?

			// Building a settings object
			ajaxExtend( ajaxExtend( target, jQuery.ajaxSettings ), settings ) :

			// Extending ajaxSettings
			ajaxExtend( jQuery.ajaxSettings, target );
	},

	ajaxPrefilter: addToPrefiltersOrTransports( prefilters ),
	ajaxTransport: addToPrefiltersOrTransports( transports ),

	// Main method
	ajax: function( url, options ) {

		// If url is an object, simulate pre-1.5 signature
		if ( typeof url === "object" ) {
			options = url;
			url = undefined;
		}

		// Force options to be an object
		options = options || {};

		var transport,

			// URL without anti-cache param
			cacheURL,

			// Response headers
			responseHeadersString,
			responseHeaders,

			// timeout handle
			timeoutTimer,

			// Url cleanup var
			urlAnchor,

			// Request state (becomes false upon send and true upon completion)
			completed,

			// To know if global events are to be dispatched
			fireGlobals,

			// Loop variable
			i,

			// uncached part of the url
			uncached,

			// Create the final options object
			s = jQuery.ajaxSetup( {}, options ),

			// Callbacks context
			callbackContext = s.context || s,

			// Context for global events is callbackContext if it is a DOM node or jQuery collection
			globalEventContext = s.context &&
				( callbackContext.nodeType || callbackContext.jquery ) ?
					jQuery( callbackContext ) :
					jQuery.event,

			// Deferreds
			deferred = jQuery.Deferred(),
			completeDeferred = jQuery.Callbacks( "once memory" ),

			// Status-dependent callbacks
			statusCode = s.statusCode || {},

			// Headers (they are sent all at once)
			requestHeaders = {},
			requestHeadersNames = {},

			// Default abort message
			strAbort = "canceled",

			// Fake xhr
			jqXHR = {
				readyState: 0,

				// Builds headers hashtable if needed
				getResponseHeader: function( key ) {
					var match;
					if ( completed ) {
						if ( !responseHeaders ) {
							responseHeaders = {};
							while ( ( match = rheaders.exec( responseHeadersString ) ) ) {
								responseHeaders[ match[ 1 ].toLowerCase() ] = match[ 2 ];
							}
						}
						match = responseHeaders[ key.toLowerCase() ];
					}
					return match == null ? null : match;
				},

				// Raw string
				getAllResponseHeaders: function() {
					return completed ? responseHeadersString : null;
				},

				// Caches the header
				setRequestHeader: function( name, value ) {
					if ( completed == null ) {
						name = requestHeadersNames[ name.toLowerCase() ] =
							requestHeadersNames[ name.toLowerCase() ] || name;
						requestHeaders[ name ] = value;
					}
					return this;
				},

				// Overrides response content-type header
				overrideMimeType: function( type ) {
					if ( completed == null ) {
						s.mimeType = type;
					}
					return this;
				},

				// Status-dependent callbacks
				statusCode: function( map ) {
					var code;
					if ( map ) {
						if ( completed ) {

							// Execute the appropriate callbacks
							jqXHR.always( map[ jqXHR.status ] );
						} else {

							// Lazy-add the new callbacks in a way that preserves old ones
							for ( code in map ) {
								statusCode[ code ] = [ statusCode[ code ], map[ code ] ];
							}
						}
					}
					return this;
				},

				// Cancel the request
				abort: function( statusText ) {
					var finalText = statusText || strAbort;
					if ( transport ) {
						transport.abort( finalText );
					}
					done( 0, finalText );
					return this;
				}
			};

		// Attach deferreds
		deferred.promise( jqXHR );

		// Add protocol if not provided (prefilters might expect it)
		// Handle falsy url in the settings object (#10093: consistency with old signature)
		// We also use the url parameter if available
		s.url = ( ( url || s.url || location.href ) + "" )
			.replace( rprotocol, location.protocol + "//" );

		// Alias method option to type as per ticket #12004
		s.type = options.method || options.type || s.method || s.type;

		// Extract dataTypes list
		s.dataTypes = ( s.dataType || "*" ).toLowerCase().match( rnothtmlwhite ) || [ "" ];

		// A cross-domain request is in order when the origin doesn't match the current origin.
		if ( s.crossDomain == null ) {
			urlAnchor = document.createElement( "a" );

			// Support: IE <=8 - 11, Edge 12 - 15
			// IE throws exception on accessing the href property if url is malformed,
			// e.g. http://example.com:80x/
			try {
				urlAnchor.href = s.url;

				// Support: IE <=8 - 11 only
				// Anchor's host property isn't correctly set when s.url is relative
				urlAnchor.href = urlAnchor.href;
				s.crossDomain = originAnchor.protocol + "//" + originAnchor.host !==
					urlAnchor.protocol + "//" + urlAnchor.host;
			} catch ( e ) {

				// If there is an error parsing the URL, assume it is crossDomain,
				// it can be rejected by the transport if it is invalid
				s.crossDomain = true;
			}
		}

		// Convert data if not already a string
		if ( s.data && s.processData && typeof s.data !== "string" ) {
			s.data = jQuery.param( s.data, s.traditional );
		}

		// Apply prefilters
		inspectPrefiltersOrTransports( prefilters, s, options, jqXHR );

		// If request was aborted inside a prefilter, stop there
		if ( completed ) {
			return jqXHR;
		}

		// We can fire global events as of now if asked to
		// Don't fire events if jQuery.event is undefined in an AMD-usage scenario (#15118)
		fireGlobals = jQuery.event && s.global;

		// Watch for a new set of requests
		if ( fireGlobals && jQuery.active++ === 0 ) {
			jQuery.event.trigger( "ajaxStart" );
		}

		// Uppercase the type
		s.type = s.type.toUpperCase();

		// Determine if request has content
		s.hasContent = !rnoContent.test( s.type );

		// Save the URL in case we're toying with the If-Modified-Since
		// and/or If-None-Match header later on
		// Remove hash to simplify url manipulation
		cacheURL = s.url.replace( rhash, "" );

		// More options handling for requests with no content
		if ( !s.hasContent ) {

			// Remember the hash so we can put it back
			uncached = s.url.slice( cacheURL.length );

			// If data is available and should be processed, append data to url
			if ( s.data && ( s.processData || typeof s.data === "string" ) ) {
				cacheURL += ( rquery.test( cacheURL ) ? "&" : "?" ) + s.data;

				// #9682: remove data so that it's not used in an eventual retry
				delete s.data;
			}

			// Add or update anti-cache param if needed
			if ( s.cache === false ) {
				cacheURL = cacheURL.replace( rantiCache, "$1" );
				uncached = ( rquery.test( cacheURL ) ? "&" : "?" ) + "_=" + ( nonce++ ) + uncached;
			}

			// Put hash and anti-cache on the URL that will be requested (gh-1732)
			s.url = cacheURL + uncached;

		// Change '%20' to '+' if this is encoded form body content (gh-2658)
		} else if ( s.data && s.processData &&
			( s.contentType || "" ).indexOf( "application/x-www-form-urlencoded" ) === 0 ) {
			s.data = s.data.replace( r20, "+" );
		}

		// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
		if ( s.ifModified ) {
			if ( jQuery.lastModified[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-Modified-Since", jQuery.lastModified[ cacheURL ] );
			}
			if ( jQuery.etag[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-None-Match", jQuery.etag[ cacheURL ] );
			}
		}

		// Set the correct header, if data is being sent
		if ( s.data && s.hasContent && s.contentType !== false || options.contentType ) {
			jqXHR.setRequestHeader( "Content-Type", s.contentType );
		}

		// Set the Accepts header for the server, depending on the dataType
		jqXHR.setRequestHeader(
			"Accept",
			s.dataTypes[ 0 ] && s.accepts[ s.dataTypes[ 0 ] ] ?
				s.accepts[ s.dataTypes[ 0 ] ] +
					( s.dataTypes[ 0 ] !== "*" ? ", " + allTypes + "; q=0.01" : "" ) :
				s.accepts[ "*" ]
		);

		// Check for headers option
		for ( i in s.headers ) {
			jqXHR.setRequestHeader( i, s.headers[ i ] );
		}

		// Allow custom headers/mimetypes and early abort
		if ( s.beforeSend &&
			( s.beforeSend.call( callbackContext, jqXHR, s ) === false || completed ) ) {

			// Abort if not done already and return
			return jqXHR.abort();
		}

		// Aborting is no longer a cancellation
		strAbort = "abort";

		// Install callbacks on deferreds
		completeDeferred.add( s.complete );
		jqXHR.done( s.success );
		jqXHR.fail( s.error );

		// Get transport
		transport = inspectPrefiltersOrTransports( transports, s, options, jqXHR );

		// If no transport, we auto-abort
		if ( !transport ) {
			done( -1, "No Transport" );
		} else {
			jqXHR.readyState = 1;

			// Send global event
			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxSend", [ jqXHR, s ] );
			}

			// If request was aborted inside ajaxSend, stop there
			if ( completed ) {
				return jqXHR;
			}

			// Timeout
			if ( s.async && s.timeout > 0 ) {
				timeoutTimer = window.setTimeout( function() {
					jqXHR.abort( "timeout" );
				}, s.timeout );
			}

			try {
				completed = false;
				transport.send( requestHeaders, done );
			} catch ( e ) {

				// Rethrow post-completion exceptions
				if ( completed ) {
					throw e;
				}

				// Propagate others as results
				done( -1, e );
			}
		}

		// Callback for when everything is done
		function done( status, nativeStatusText, responses, headers ) {
			var isSuccess, success, error, response, modified,
				statusText = nativeStatusText;

			// Ignore repeat invocations
			if ( completed ) {
				return;
			}

			completed = true;

			// Clear timeout if it exists
			if ( timeoutTimer ) {
				window.clearTimeout( timeoutTimer );
			}

			// Dereference transport for early garbage collection
			// (no matter how long the jqXHR object will be used)
			transport = undefined;

			// Cache response headers
			responseHeadersString = headers || "";

			// Set readyState
			jqXHR.readyState = status > 0 ? 4 : 0;

			// Determine if successful
			isSuccess = status >= 200 && status < 300 || status === 304;

			// Get response data
			if ( responses ) {
				response = ajaxHandleResponses( s, jqXHR, responses );
			}

			// Convert no matter what (that way responseXXX fields are always set)
			response = ajaxConvert( s, response, jqXHR, isSuccess );

			// If successful, handle type chaining
			if ( isSuccess ) {

				// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
				if ( s.ifModified ) {
					modified = jqXHR.getResponseHeader( "Last-Modified" );
					if ( modified ) {
						jQuery.lastModified[ cacheURL ] = modified;
					}
					modified = jqXHR.getResponseHeader( "etag" );
					if ( modified ) {
						jQuery.etag[ cacheURL ] = modified;
					}
				}

				// if no content
				if ( status === 204 || s.type === "HEAD" ) {
					statusText = "nocontent";

				// if not modified
				} else if ( status === 304 ) {
					statusText = "notmodified";

				// If we have data, let's convert it
				} else {
					statusText = response.state;
					success = response.data;
					error = response.error;
					isSuccess = !error;
				}
			} else {

				// Extract error from statusText and normalize for non-aborts
				error = statusText;
				if ( status || !statusText ) {
					statusText = "error";
					if ( status < 0 ) {
						status = 0;
					}
				}
			}

			// Set data for the fake xhr object
			jqXHR.status = status;
			jqXHR.statusText = ( nativeStatusText || statusText ) + "";

			// Success/Error
			if ( isSuccess ) {
				deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
			} else {
				deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
			}

			// Status-dependent callbacks
			jqXHR.statusCode( statusCode );
			statusCode = undefined;

			if ( fireGlobals ) {
				globalEventContext.trigger( isSuccess ? "ajaxSuccess" : "ajaxError",
					[ jqXHR, s, isSuccess ? success : error ] );
			}

			// Complete
			completeDeferred.fireWith( callbackContext, [ jqXHR, statusText ] );

			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxComplete", [ jqXHR, s ] );

				// Handle the global AJAX counter
				if ( !( --jQuery.active ) ) {
					jQuery.event.trigger( "ajaxStop" );
				}
			}
		}

		return jqXHR;
	},

	getJSON: function( url, data, callback ) {
		return jQuery.get( url, data, callback, "json" );
	},

	getScript: function( url, callback ) {
		return jQuery.get( url, undefined, callback, "script" );
	}
} );

jQuery.each( [ "get", "post" ], function( i, method ) {
	jQuery[ method ] = function( url, data, callback, type ) {

		// Shift arguments if data argument was omitted
		if ( isFunction( data ) ) {
			type = type || callback;
			callback = data;
			data = undefined;
		}

		// The url can be an options object (which then must have .url)
		return jQuery.ajax( jQuery.extend( {
			url: url,
			type: method,
			dataType: type,
			data: data,
			success: callback
		}, jQuery.isPlainObject( url ) && url ) );
	};
} );


jQuery._evalUrl = function( url ) {
	return jQuery.ajax( {
		url: url,

		// Make this explicit, since user can override this through ajaxSetup (#11264)
		type: "GET",
		dataType: "script",
		cache: true,
		async: false,
		global: false,
		"throws": true
	} );
};


jQuery.fn.extend( {
	wrapAll: function( html ) {
		var wrap;

		if ( this[ 0 ] ) {
			if ( isFunction( html ) ) {
				html = html.call( this[ 0 ] );
			}

			// The elements to wrap the target around
			wrap = jQuery( html, this[ 0 ].ownerDocument ).eq( 0 ).clone( true );

			if ( this[ 0 ].parentNode ) {
				wrap.insertBefore( this[ 0 ] );
			}

			wrap.map( function() {
				var elem = this;

				while ( elem.firstElementChild ) {
					elem = elem.firstElementChild;
				}

				return elem;
			} ).append( this );
		}

		return this;
	},

	wrapInner: function( html ) {
		if ( isFunction( html ) ) {
			return this.each( function( i ) {
				jQuery( this ).wrapInner( html.call( this, i ) );
			} );
		}

		return this.each( function() {
			var self = jQuery( this ),
				contents = self.contents();

			if ( contents.length ) {
				contents.wrapAll( html );

			} else {
				self.append( html );
			}
		} );
	},

	wrap: function( html ) {
		var htmlIsFunction = isFunction( html );

		return this.each( function( i ) {
			jQuery( this ).wrapAll( htmlIsFunction ? html.call( this, i ) : html );
		} );
	},

	unwrap: function( selector ) {
		this.parent( selector ).not( "body" ).each( function() {
			jQuery( this ).replaceWith( this.childNodes );
		} );
		return this;
	}
} );


jQuery.expr.pseudos.hidden = function( elem ) {
	return !jQuery.expr.pseudos.visible( elem );
};
jQuery.expr.pseudos.visible = function( elem ) {
	return !!( elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length );
};




jQuery.ajaxSettings.xhr = function() {
	try {
		return new window.XMLHttpRequest();
	} catch ( e ) {}
};

var xhrSuccessStatus = {

		// File protocol always yields status code 0, assume 200
		0: 200,

		// Support: IE <=9 only
		// #1450: sometimes IE returns 1223 when it should be 204
		1223: 204
	},
	xhrSupported = jQuery.ajaxSettings.xhr();

support.cors = !!xhrSupported && ( "withCredentials" in xhrSupported );
support.ajax = xhrSupported = !!xhrSupported;

jQuery.ajaxTransport( function( options ) {
	var callback, errorCallback;

	// Cross domain only allowed if supported through XMLHttpRequest
	if ( support.cors || xhrSupported && !options.crossDomain ) {
		return {
			send: function( headers, complete ) {
				var i,
					xhr = options.xhr();

				xhr.open(
					options.type,
					options.url,
					options.async,
					options.username,
					options.password
				);

				// Apply custom fields if provided
				if ( options.xhrFields ) {
					for ( i in options.xhrFields ) {
						xhr[ i ] = options.xhrFields[ i ];
					}
				}

				// Override mime type if needed
				if ( options.mimeType && xhr.overrideMimeType ) {
					xhr.overrideMimeType( options.mimeType );
				}

				// X-Requested-With header
				// For cross-domain requests, seeing as conditions for a preflight are
				// akin to a jigsaw puzzle, we simply never set it to be sure.
				// (it can always be set on a per-request basis or even using ajaxSetup)
				// For same-domain requests, won't change header if already provided.
				if ( !options.crossDomain && !headers[ "X-Requested-With" ] ) {
					headers[ "X-Requested-With" ] = "XMLHttpRequest";
				}

				// Set headers
				for ( i in headers ) {
					xhr.setRequestHeader( i, headers[ i ] );
				}

				// Callback
				callback = function( type ) {
					return function() {
						if ( callback ) {
							callback = errorCallback = xhr.onload =
								xhr.onerror = xhr.onabort = xhr.ontimeout =
									xhr.onreadystatechange = null;

							if ( type === "abort" ) {
								xhr.abort();
							} else if ( type === "error" ) {

								// Support: IE <=9 only
								// On a manual native abort, IE9 throws
								// errors on any property access that is not readyState
								if ( typeof xhr.status !== "number" ) {
									complete( 0, "error" );
								} else {
									complete(

										// File: protocol always yields status 0; see #8605, #14207
										xhr.status,
										xhr.statusText
									);
								}
							} else {
								complete(
									xhrSuccessStatus[ xhr.status ] || xhr.status,
									xhr.statusText,

									// Support: IE <=9 only
									// IE9 has no XHR2 but throws on binary (trac-11426)
									// For XHR2 non-text, let the caller handle it (gh-2498)
									( xhr.responseType || "text" ) !== "text"  ||
									typeof xhr.responseText !== "string" ?
										{ binary: xhr.response } :
										{ text: xhr.responseText },
									xhr.getAllResponseHeaders()
								);
							}
						}
					};
				};

				// Listen to events
				xhr.onload = callback();
				errorCallback = xhr.onerror = xhr.ontimeout = callback( "error" );

				// Support: IE 9 only
				// Use onreadystatechange to replace onabort
				// to handle uncaught aborts
				if ( xhr.onabort !== undefined ) {
					xhr.onabort = errorCallback;
				} else {
					xhr.onreadystatechange = function() {

						// Check readyState before timeout as it changes
						if ( xhr.readyState === 4 ) {

							// Allow onerror to be called first,
							// but that will not handle a native abort
							// Also, save errorCallback to a variable
							// as xhr.onerror cannot be accessed
							window.setTimeout( function() {
								if ( callback ) {
									errorCallback();
								}
							} );
						}
					};
				}

				// Create the abort callback
				callback = callback( "abort" );

				try {

					// Do send the request (this may raise an exception)
					xhr.send( options.hasContent && options.data || null );
				} catch ( e ) {

					// #14683: Only rethrow if this hasn't been notified as an error yet
					if ( callback ) {
						throw e;
					}
				}
			},

			abort: function() {
				if ( callback ) {
					callback();
				}
			}
		};
	}
} );




// Prevent auto-execution of scripts when no explicit dataType was provided (See gh-2432)
jQuery.ajaxPrefilter( function( s ) {
	if ( s.crossDomain ) {
		s.contents.script = false;
	}
} );

// Install script dataType
jQuery.ajaxSetup( {
	accepts: {
		script: "text/javascript, application/javascript, " +
			"application/ecmascript, application/x-ecmascript"
	},
	contents: {
		script: /\b(?:java|ecma)script\b/
	},
	converters: {
		"text script": function( text ) {
			jQuery.globalEval( text );
			return text;
		}
	}
} );

// Handle cache's special case and crossDomain
jQuery.ajaxPrefilter( "script", function( s ) {
	if ( s.cache === undefined ) {
		s.cache = false;
	}
	if ( s.crossDomain ) {
		s.type = "GET";
	}
} );

// Bind script tag hack transport
jQuery.ajaxTransport( "script", function( s ) {

	// This transport only deals with cross domain requests
	if ( s.crossDomain ) {
		var script, callback;
		return {
			send: function( _, complete ) {
				script = jQuery( "<script>" ).prop( {
					charset: s.scriptCharset,
					src: s.url
				} ).on(
					"load error",
					callback = function( evt ) {
						script.remove();
						callback = null;
						if ( evt ) {
							complete( evt.type === "error" ? 404 : 200, evt.type );
						}
					}
				);

				// Use native DOM manipulation to avoid our domManip AJAX trickery
				document.head.appendChild( script[ 0 ] );
			},
			abort: function() {
				if ( callback ) {
					callback();
				}
			}
		};
	}
} );




var oldCallbacks = [],
	rjsonp = /(=)\?(?=&|$)|\?\?/;

// Default jsonp settings
jQuery.ajaxSetup( {
	jsonp: "callback",
	jsonpCallback: function() {
		var callback = oldCallbacks.pop() || ( jQuery.expando + "_" + ( nonce++ ) );
		this[ callback ] = true;
		return callback;
	}
} );

// Detect, normalize options and install callbacks for jsonp requests
jQuery.ajaxPrefilter( "json jsonp", function( s, originalSettings, jqXHR ) {

	var callbackName, overwritten, responseContainer,
		jsonProp = s.jsonp !== false && ( rjsonp.test( s.url ) ?
			"url" :
			typeof s.data === "string" &&
				( s.contentType || "" )
					.indexOf( "application/x-www-form-urlencoded" ) === 0 &&
				rjsonp.test( s.data ) && "data"
		);

	// Handle iff the expected data type is "jsonp" or we have a parameter to set
	if ( jsonProp || s.dataTypes[ 0 ] === "jsonp" ) {

		// Get callback name, remembering preexisting value associated with it
		callbackName = s.jsonpCallback = isFunction( s.jsonpCallback ) ?
			s.jsonpCallback() :
			s.jsonpCallback;

		// Insert callback into url or form data
		if ( jsonProp ) {
			s[ jsonProp ] = s[ jsonProp ].replace( rjsonp, "$1" + callbackName );
		} else if ( s.jsonp !== false ) {
			s.url += ( rquery.test( s.url ) ? "&" : "?" ) + s.jsonp + "=" + callbackName;
		}

		// Use data converter to retrieve json after script execution
		s.converters[ "script json" ] = function() {
			if ( !responseContainer ) {
				jQuery.error( callbackName + " was not called" );
			}
			return responseContainer[ 0 ];
		};

		// Force json dataType
		s.dataTypes[ 0 ] = "json";

		// Install callback
		overwritten = window[ callbackName ];
		window[ callbackName ] = function() {
			responseContainer = arguments;
		};

		// Clean-up function (fires after converters)
		jqXHR.always( function() {

			// If previous value didn't exist - remove it
			if ( overwritten === undefined ) {
				jQuery( window ).removeProp( callbackName );

			// Otherwise restore preexisting value
			} else {
				window[ callbackName ] = overwritten;
			}

			// Save back as free
			if ( s[ callbackName ] ) {

				// Make sure that re-using the options doesn't screw things around
				s.jsonpCallback = originalSettings.jsonpCallback;

				// Save the callback name for future use
				oldCallbacks.push( callbackName );
			}

			// Call if it was a function and we have a response
			if ( responseContainer && isFunction( overwritten ) ) {
				overwritten( responseContainer[ 0 ] );
			}

			responseContainer = overwritten = undefined;
		} );

		// Delegate to script
		return "script";
	}
} );




// Support: Safari 8 only
// In Safari 8 documents created via document.implementation.createHTMLDocument
// collapse sibling forms: the second one becomes a child of the first one.
// Because of that, this security measure has to be disabled in Safari 8.
// https://bugs.webkit.org/show_bug.cgi?id=137337
support.createHTMLDocument = ( function() {
	var body = document.implementation.createHTMLDocument( "" ).body;
	body.innerHTML = "<form></form><form></form>";
	return body.childNodes.length === 2;
} )();


// Argument "data" should be string of html
// context (optional): If specified, the fragment will be created in this context,
// defaults to document
// keepScripts (optional): If true, will include scripts passed in the html string
jQuery.parseHTML = function( data, context, keepScripts ) {
	if ( typeof data !== "string" ) {
		return [];
	}
	if ( typeof context === "boolean" ) {
		keepScripts = context;
		context = false;
	}

	var base, parsed, scripts;

	if ( !context ) {

		// Stop scripts or inline event handlers from being executed immediately
		// by using document.implementation
		if ( support.createHTMLDocument ) {
			context = document.implementation.createHTMLDocument( "" );

			// Set the base href for the created document
			// so any parsed elements with URLs
			// are based on the document's URL (gh-2965)
			base = context.createElement( "base" );
			base.href = document.location.href;
			context.head.appendChild( base );
		} else {
			context = document;
		}
	}

	parsed = rsingleTag.exec( data );
	scripts = !keepScripts && [];

	// Single tag
	if ( parsed ) {
		return [ context.createElement( parsed[ 1 ] ) ];
	}

	parsed = buildFragment( [ data ], context, scripts );

	if ( scripts && scripts.length ) {
		jQuery( scripts ).remove();
	}

	return jQuery.merge( [], parsed.childNodes );
};


/**
 * Load a url into a page
 */
jQuery.fn.load = function( url, params, callback ) {
	var selector, type, response,
		self = this,
		off = url.indexOf( " " );

	if ( off > -1 ) {
		selector = stripAndCollapse( url.slice( off ) );
		url = url.slice( 0, off );
	}

	// If it's a function
	if ( isFunction( params ) ) {

		// We assume that it's the callback
		callback = params;
		params = undefined;

	// Otherwise, build a param string
	} else if ( params && typeof params === "object" ) {
		type = "POST";
	}

	// If we have elements to modify, make the request
	if ( self.length > 0 ) {
		jQuery.ajax( {
			url: url,

			// If "type" variable is undefined, then "GET" method will be used.
			// Make value of this field explicit since
			// user can override it through ajaxSetup method
			type: type || "GET",
			dataType: "html",
			data: params
		} ).done( function( responseText ) {

			// Save response for use in complete callback
			response = arguments;

			self.html( selector ?

				// If a selector was specified, locate the right elements in a dummy div
				// Exclude scripts to avoid IE 'Permission Denied' errors
				jQuery( "<div>" ).append( jQuery.parseHTML( responseText ) ).find( selector ) :

				// Otherwise use the full result
				responseText );

		// If the request succeeds, this function gets "data", "status", "jqXHR"
		// but they are ignored because response was set above.
		// If it fails, this function gets "jqXHR", "status", "error"
		} ).always( callback && function( jqXHR, status ) {
			self.each( function() {
				callback.apply( this, response || [ jqXHR.responseText, status, jqXHR ] );
			} );
		} );
	}

	return this;
};




// Attach a bunch of functions for handling common AJAX events
jQuery.each( [
	"ajaxStart",
	"ajaxStop",
	"ajaxComplete",
	"ajaxError",
	"ajaxSuccess",
	"ajaxSend"
], function( i, type ) {
	jQuery.fn[ type ] = function( fn ) {
		return this.on( type, fn );
	};
} );




jQuery.expr.pseudos.animated = function( elem ) {
	return jQuery.grep( jQuery.timers, function( fn ) {
		return elem === fn.elem;
	} ).length;
};




jQuery.offset = {
	setOffset: function( elem, options, i ) {
		var curPosition, curLeft, curCSSTop, curTop, curOffset, curCSSLeft, calculatePosition,
			position = jQuery.css( elem, "position" ),
			curElem = jQuery( elem ),
			props = {};

		// Set position first, in-case top/left are set even on static elem
		if ( position === "static" ) {
			elem.style.position = "relative";
		}

		curOffset = curElem.offset();
		curCSSTop = jQuery.css( elem, "top" );
		curCSSLeft = jQuery.css( elem, "left" );
		calculatePosition = ( position === "absolute" || position === "fixed" ) &&
			( curCSSTop + curCSSLeft ).indexOf( "auto" ) > -1;

		// Need to be able to calculate position if either
		// top or left is auto and position is either absolute or fixed
		if ( calculatePosition ) {
			curPosition = curElem.position();
			curTop = curPosition.top;
			curLeft = curPosition.left;

		} else {
			curTop = parseFloat( curCSSTop ) || 0;
			curLeft = parseFloat( curCSSLeft ) || 0;
		}

		if ( isFunction( options ) ) {

			// Use jQuery.extend here to allow modification of coordinates argument (gh-1848)
			options = options.call( elem, i, jQuery.extend( {}, curOffset ) );
		}

		if ( options.top != null ) {
			props.top = ( options.top - curOffset.top ) + curTop;
		}
		if ( options.left != null ) {
			props.left = ( options.left - curOffset.left ) + curLeft;
		}

		if ( "using" in options ) {
			options.using.call( elem, props );

		} else {
			curElem.css( props );
		}
	}
};

jQuery.fn.extend( {

	// offset() relates an element's border box to the document origin
	offset: function( options ) {

		// Preserve chaining for setter
		if ( arguments.length ) {
			return options === undefined ?
				this :
				this.each( function( i ) {
					jQuery.offset.setOffset( this, options, i );
				} );
		}

		var rect, win,
			elem = this[ 0 ];

		if ( !elem ) {
			return;
		}

		// Return zeros for disconnected and hidden (display: none) elements (gh-2310)
		// Support: IE <=11 only
		// Running getBoundingClientRect on a
		// disconnected node in IE throws an error
		if ( !elem.getClientRects().length ) {
			return { top: 0, left: 0 };
		}

		// Get document-relative position by adding viewport scroll to viewport-relative gBCR
		rect = elem.getBoundingClientRect();
		win = elem.ownerDocument.defaultView;
		return {
			top: rect.top + win.pageYOffset,
			left: rect.left + win.pageXOffset
		};
	},

	// position() relates an element's margin box to its offset parent's padding box
	// This corresponds to the behavior of CSS absolute positioning
	position: function() {
		if ( !this[ 0 ] ) {
			return;
		}

		var offsetParent, offset, doc,
			elem = this[ 0 ],
			parentOffset = { top: 0, left: 0 };

		// position:fixed elements are offset from the viewport, which itself always has zero offset
		if ( jQuery.css( elem, "position" ) === "fixed" ) {

			// Assume position:fixed implies availability of getBoundingClientRect
			offset = elem.getBoundingClientRect();

		} else {
			offset = this.offset();

			// Account for the *real* offset parent, which can be the document or its root element
			// when a statically positioned element is identified
			doc = elem.ownerDocument;
			offsetParent = elem.offsetParent || doc.documentElement;
			while ( offsetParent &&
				( offsetParent === doc.body || offsetParent === doc.documentElement ) &&
				jQuery.css( offsetParent, "position" ) === "static" ) {

				offsetParent = offsetParent.parentNode;
			}
			if ( offsetParent && offsetParent !== elem && offsetParent.nodeType === 1 ) {

				// Incorporate borders into its offset, since they are outside its content origin
				parentOffset = jQuery( offsetParent ).offset();
				parentOffset.top += jQuery.css( offsetParent, "borderTopWidth", true );
				parentOffset.left += jQuery.css( offsetParent, "borderLeftWidth", true );
			}
		}

		// Subtract parent offsets and element margins
		return {
			top: offset.top - parentOffset.top - jQuery.css( elem, "marginTop", true ),
			left: offset.left - parentOffset.left - jQuery.css( elem, "marginLeft", true )
		};
	},

	// This method will return documentElement in the following cases:
	// 1) For the element inside the iframe without offsetParent, this method will return
	//    documentElement of the parent window
	// 2) For the hidden or detached element
	// 3) For body or html element, i.e. in case of the html node - it will return itself
	//
	// but those exceptions were never presented as a real life use-cases
	// and might be considered as more preferable results.
	//
	// This logic, however, is not guaranteed and can change at any point in the future
	offsetParent: function() {
		return this.map( function() {
			var offsetParent = this.offsetParent;

			while ( offsetParent && jQuery.css( offsetParent, "position" ) === "static" ) {
				offsetParent = offsetParent.offsetParent;
			}

			return offsetParent || documentElement;
		} );
	}
} );

// Create scrollLeft and scrollTop methods
jQuery.each( { scrollLeft: "pageXOffset", scrollTop: "pageYOffset" }, function( method, prop ) {
	var top = "pageYOffset" === prop;

	jQuery.fn[ method ] = function( val ) {
		return access( this, function( elem, method, val ) {

			// Coalesce documents and windows
			var win;
			if ( isWindow( elem ) ) {
				win = elem;
			} else if ( elem.nodeType === 9 ) {
				win = elem.defaultView;
			}

			if ( val === undefined ) {
				return win ? win[ prop ] : elem[ method ];
			}

			if ( win ) {
				win.scrollTo(
					!top ? val : win.pageXOffset,
					top ? val : win.pageYOffset
				);

			} else {
				elem[ method ] = val;
			}
		}, method, val, arguments.length );
	};
} );

// Support: Safari <=7 - 9.1, Chrome <=37 - 49
// Add the top/left cssHooks using jQuery.fn.position
// Webkit bug: https://bugs.webkit.org/show_bug.cgi?id=29084
// Blink bug: https://bugs.chromium.org/p/chromium/issues/detail?id=589347
// getComputedStyle returns percent when specified for top/left/bottom/right;
// rather than make the css module depend on the offset module, just check for it here
jQuery.each( [ "top", "left" ], function( i, prop ) {
	jQuery.cssHooks[ prop ] = addGetHookIf( support.pixelPosition,
		function( elem, computed ) {
			if ( computed ) {
				computed = curCSS( elem, prop );

				// If curCSS returns percentage, fallback to offset
				return rnumnonpx.test( computed ) ?
					jQuery( elem ).position()[ prop ] + "px" :
					computed;
			}
		}
	);
} );


// Create innerHeight, innerWidth, height, width, outerHeight and outerWidth methods
jQuery.each( { Height: "height", Width: "width" }, function( name, type ) {
	jQuery.each( { padding: "inner" + name, content: type, "": "outer" + name },
		function( defaultExtra, funcName ) {

		// Margin is only for outerHeight, outerWidth
		jQuery.fn[ funcName ] = function( margin, value ) {
			var chainable = arguments.length && ( defaultExtra || typeof margin !== "boolean" ),
				extra = defaultExtra || ( margin === true || value === true ? "margin" : "border" );

			return access( this, function( elem, type, value ) {
				var doc;

				if ( isWindow( elem ) ) {

					// $( window ).outerWidth/Height return w/h including scrollbars (gh-1729)
					return funcName.indexOf( "outer" ) === 0 ?
						elem[ "inner" + name ] :
						elem.document.documentElement[ "client" + name ];
				}

				// Get document width or height
				if ( elem.nodeType === 9 ) {
					doc = elem.documentElement;

					// Either scroll[Width/Height] or offset[Width/Height] or client[Width/Height],
					// whichever is greatest
					return Math.max(
						elem.body[ "scroll" + name ], doc[ "scroll" + name ],
						elem.body[ "offset" + name ], doc[ "offset" + name ],
						doc[ "client" + name ]
					);
				}

				return value === undefined ?

					// Get width or height on the element, requesting but not forcing parseFloat
					jQuery.css( elem, type, extra ) :

					// Set width or height on the element
					jQuery.style( elem, type, value, extra );
			}, type, chainable ? margin : undefined, chainable );
		};
	} );
} );


jQuery.each( ( "blur focus focusin focusout resize scroll click dblclick " +
	"mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
	"change select submit keydown keypress keyup contextmenu" ).split( " " ),
	function( i, name ) {

	// Handle event binding
	jQuery.fn[ name ] = function( data, fn ) {
		return arguments.length > 0 ?
			this.on( name, null, data, fn ) :
			this.trigger( name );
	};
} );

jQuery.fn.extend( {
	hover: function( fnOver, fnOut ) {
		return this.mouseenter( fnOver ).mouseleave( fnOut || fnOver );
	}
} );




jQuery.fn.extend( {

	bind: function( types, data, fn ) {
		return this.on( types, null, data, fn );
	},
	unbind: function( types, fn ) {
		return this.off( types, null, fn );
	},

	delegate: function( selector, types, data, fn ) {
		return this.on( types, selector, data, fn );
	},
	undelegate: function( selector, types, fn ) {

		// ( namespace ) or ( selector, types [, fn] )
		return arguments.length === 1 ?
			this.off( selector, "**" ) :
			this.off( types, selector || "**", fn );
	}
} );

// Bind a function to a context, optionally partially applying any
// arguments.
// jQuery.proxy is deprecated to promote standards (specifically Function#bind)
// However, it is not slated for removal any time soon
jQuery.proxy = function( fn, context ) {
	var tmp, args, proxy;

	if ( typeof context === "string" ) {
		tmp = fn[ context ];
		context = fn;
		fn = tmp;
	}

	// Quick check to determine if target is callable, in the spec
	// this throws a TypeError, but we will just return undefined.
	if ( !isFunction( fn ) ) {
		return undefined;
	}

	// Simulated bind
	args = slice.call( arguments, 2 );
	proxy = function() {
		return fn.apply( context || this, args.concat( slice.call( arguments ) ) );
	};

	// Set the guid of unique handler to the same of original handler, so it can be removed
	proxy.guid = fn.guid = fn.guid || jQuery.guid++;

	return proxy;
};

jQuery.holdReady = function( hold ) {
	if ( hold ) {
		jQuery.readyWait++;
	} else {
		jQuery.ready( true );
	}
};
jQuery.isArray = Array.isArray;
jQuery.parseJSON = JSON.parse;
jQuery.nodeName = nodeName;
jQuery.isFunction = isFunction;
jQuery.isWindow = isWindow;
jQuery.camelCase = camelCase;
jQuery.type = toType;

jQuery.now = Date.now;

jQuery.isNumeric = function( obj ) {

	// As of jQuery 3.0, isNumeric is limited to
	// strings and numbers (primitives or objects)
	// that can be coerced to finite numbers (gh-2662)
	var type = jQuery.type( obj );
	return ( type === "number" || type === "string" ) &&

		// parseFloat NaNs numeric-cast false positives ("")
		// ...but misinterprets leading-number strings, particularly hex literals ("0x...")
		// subtraction forces infinities to NaN
		!isNaN( obj - parseFloat( obj ) );
};




// Register as a named AMD module, since jQuery can be concatenated with other
// files that may use define, but not via a proper concatenation script that
// understands anonymous AMD modules. A named AMD is safest and most robust
// way to register. Lowercase jquery is used because AMD module names are
// derived from file names, and jQuery is normally delivered in a lowercase
// file name. Do this after creating the global so that if an AMD module wants
// to call noConflict to hide this version of jQuery, it will work.

// Note that for maximum portability, libraries that are not jQuery should
// declare themselves as anonymous modules, and avoid setting a global if an
// AMD loader is present. jQuery is a special case. For more information, see
// https://github.com/jrburke/requirejs/wiki/Updating-existing-libraries#wiki-anon

if ( typeof define === "function" && define.amd ) {
	define( "jquery", [], function() {
		return jQuery;
	} );
}




var

	// Map over jQuery in case of overwrite
	_jQuery = window.jQuery,

	// Map over the $ in case of overwrite
	_$ = window.$;

jQuery.noConflict = function( deep ) {
	if ( window.$ === jQuery ) {
		window.$ = _$;
	}

	if ( deep && window.jQuery === jQuery ) {
		window.jQuery = _jQuery;
	}

	return jQuery;
};

// Expose jQuery and $ identifiers, even in AMD
// (#7102#comment:10, https://github.com/jquery/jquery/pull/557)
// and CommonJS for browser emulators (#13566)
if ( !noGlobal ) {
	window.jQuery = window.$ = jQuery;
}




return jQuery;
} );

},{}],33:[function(require,module,exports){
(function (global){
//     Underscore.js 1.9.1
//     http://underscorejs.org
//     (c) 2009-2018 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Underscore may be freely distributed under the MIT license.

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` (`self`) in the browser, `global`
  // on the server, or `this` in some virtual machines. We use `self`
  // instead of `window` for `WebWorker` support.
  var root = typeof self == 'object' && self.self === self && self ||
            typeof global == 'object' && global.global === global && global ||
            this ||
            {};

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype;
  var SymbolProto = typeof Symbol !== 'undefined' ? Symbol.prototype : null;

  // Create quick reference variables for speed access to core prototypes.
  var push = ArrayProto.push,
      slice = ArrayProto.slice,
      toString = ObjProto.toString,
      hasOwnProperty = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var nativeIsArray = Array.isArray,
      nativeKeys = Object.keys,
      nativeCreate = Object.create;

  // Naked function reference for surrogate-prototype-swapping.
  var Ctor = function(){};

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for their old module API. If we're in
  // the browser, add `_` as a global object.
  // (`nodeType` is checked to ensure that `module`
  // and `exports` are not HTML elements.)
  if (typeof exports != 'undefined' && !exports.nodeType) {
    if (typeof module != 'undefined' && !module.nodeType && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  _.VERSION = '1.9.1';

  // Internal function that returns an efficient (for current engines) version
  // of the passed-in callback, to be repeatedly applied in other Underscore
  // functions.
  var optimizeCb = function(func, context, argCount) {
    if (context === void 0) return func;
    switch (argCount == null ? 3 : argCount) {
      case 1: return function(value) {
        return func.call(context, value);
      };
      // The 2-argument case is omitted because we’re not using it.
      case 3: return function(value, index, collection) {
        return func.call(context, value, index, collection);
      };
      case 4: return function(accumulator, value, index, collection) {
        return func.call(context, accumulator, value, index, collection);
      };
    }
    return function() {
      return func.apply(context, arguments);
    };
  };

  var builtinIteratee;

  // An internal function to generate callbacks that can be applied to each
  // element in a collection, returning the desired result — either `identity`,
  // an arbitrary callback, a property matcher, or a property accessor.
  var cb = function(value, context, argCount) {
    if (_.iteratee !== builtinIteratee) return _.iteratee(value, context);
    if (value == null) return _.identity;
    if (_.isFunction(value)) return optimizeCb(value, context, argCount);
    if (_.isObject(value) && !_.isArray(value)) return _.matcher(value);
    return _.property(value);
  };

  // External wrapper for our callback generator. Users may customize
  // `_.iteratee` if they want additional predicate/iteratee shorthand styles.
  // This abstraction hides the internal-only argCount argument.
  _.iteratee = builtinIteratee = function(value, context) {
    return cb(value, context, Infinity);
  };

  // Some functions take a variable number of arguments, or a few expected
  // arguments at the beginning and then a variable number of values to operate
  // on. This helper accumulates all remaining arguments past the function’s
  // argument length (or an explicit `startIndex`), into an array that becomes
  // the last argument. Similar to ES6’s "rest parameter".
  var restArguments = function(func, startIndex) {
    startIndex = startIndex == null ? func.length - 1 : +startIndex;
    return function() {
      var length = Math.max(arguments.length - startIndex, 0),
          rest = Array(length),
          index = 0;
      for (; index < length; index++) {
        rest[index] = arguments[index + startIndex];
      }
      switch (startIndex) {
        case 0: return func.call(this, rest);
        case 1: return func.call(this, arguments[0], rest);
        case 2: return func.call(this, arguments[0], arguments[1], rest);
      }
      var args = Array(startIndex + 1);
      for (index = 0; index < startIndex; index++) {
        args[index] = arguments[index];
      }
      args[startIndex] = rest;
      return func.apply(this, args);
    };
  };

  // An internal function for creating a new object that inherits from another.
  var baseCreate = function(prototype) {
    if (!_.isObject(prototype)) return {};
    if (nativeCreate) return nativeCreate(prototype);
    Ctor.prototype = prototype;
    var result = new Ctor;
    Ctor.prototype = null;
    return result;
  };

  var shallowProperty = function(key) {
    return function(obj) {
      return obj == null ? void 0 : obj[key];
    };
  };

  var has = function(obj, path) {
    return obj != null && hasOwnProperty.call(obj, path);
  }

  var deepGet = function(obj, path) {
    var length = path.length;
    for (var i = 0; i < length; i++) {
      if (obj == null) return void 0;
      obj = obj[path[i]];
    }
    return length ? obj : void 0;
  };

  // Helper for collection methods to determine whether a collection
  // should be iterated as an array or as an object.
  // Related: http://people.mozilla.org/~jorendorff/es6-draft.html#sec-tolength
  // Avoids a very nasty iOS 8 JIT bug on ARM-64. #2094
  var MAX_ARRAY_INDEX = Math.pow(2, 53) - 1;
  var getLength = shallowProperty('length');
  var isArrayLike = function(collection) {
    var length = getLength(collection);
    return typeof length == 'number' && length >= 0 && length <= MAX_ARRAY_INDEX;
  };

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles raw objects in addition to array-likes. Treats all
  // sparse array-likes as if they were dense.
  _.each = _.forEach = function(obj, iteratee, context) {
    iteratee = optimizeCb(iteratee, context);
    var i, length;
    if (isArrayLike(obj)) {
      for (i = 0, length = obj.length; i < length; i++) {
        iteratee(obj[i], i, obj);
      }
    } else {
      var keys = _.keys(obj);
      for (i = 0, length = keys.length; i < length; i++) {
        iteratee(obj[keys[i]], keys[i], obj);
      }
    }
    return obj;
  };

  // Return the results of applying the iteratee to each element.
  _.map = _.collect = function(obj, iteratee, context) {
    iteratee = cb(iteratee, context);
    var keys = !isArrayLike(obj) && _.keys(obj),
        length = (keys || obj).length,
        results = Array(length);
    for (var index = 0; index < length; index++) {
      var currentKey = keys ? keys[index] : index;
      results[index] = iteratee(obj[currentKey], currentKey, obj);
    }
    return results;
  };

  // Create a reducing function iterating left or right.
  var createReduce = function(dir) {
    // Wrap code that reassigns argument variables in a separate function than
    // the one that accesses `arguments.length` to avoid a perf hit. (#1991)
    var reducer = function(obj, iteratee, memo, initial) {
      var keys = !isArrayLike(obj) && _.keys(obj),
          length = (keys || obj).length,
          index = dir > 0 ? 0 : length - 1;
      if (!initial) {
        memo = obj[keys ? keys[index] : index];
        index += dir;
      }
      for (; index >= 0 && index < length; index += dir) {
        var currentKey = keys ? keys[index] : index;
        memo = iteratee(memo, obj[currentKey], currentKey, obj);
      }
      return memo;
    };

    return function(obj, iteratee, memo, context) {
      var initial = arguments.length >= 3;
      return reducer(obj, optimizeCb(iteratee, context, 4), memo, initial);
    };
  };

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`.
  _.reduce = _.foldl = _.inject = createReduce(1);

  // The right-associative version of reduce, also known as `foldr`.
  _.reduceRight = _.foldr = createReduce(-1);

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, predicate, context) {
    var keyFinder = isArrayLike(obj) ? _.findIndex : _.findKey;
    var key = keyFinder(obj, predicate, context);
    if (key !== void 0 && key !== -1) return obj[key];
  };

  // Return all the elements that pass a truth test.
  // Aliased as `select`.
  _.filter = _.select = function(obj, predicate, context) {
    var results = [];
    predicate = cb(predicate, context);
    _.each(obj, function(value, index, list) {
      if (predicate(value, index, list)) results.push(value);
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, predicate, context) {
    return _.filter(obj, _.negate(cb(predicate)), context);
  };

  // Determine whether all of the elements match a truth test.
  // Aliased as `all`.
  _.every = _.all = function(obj, predicate, context) {
    predicate = cb(predicate, context);
    var keys = !isArrayLike(obj) && _.keys(obj),
        length = (keys || obj).length;
    for (var index = 0; index < length; index++) {
      var currentKey = keys ? keys[index] : index;
      if (!predicate(obj[currentKey], currentKey, obj)) return false;
    }
    return true;
  };

  // Determine if at least one element in the object matches a truth test.
  // Aliased as `any`.
  _.some = _.any = function(obj, predicate, context) {
    predicate = cb(predicate, context);
    var keys = !isArrayLike(obj) && _.keys(obj),
        length = (keys || obj).length;
    for (var index = 0; index < length; index++) {
      var currentKey = keys ? keys[index] : index;
      if (predicate(obj[currentKey], currentKey, obj)) return true;
    }
    return false;
  };

  // Determine if the array or object contains a given item (using `===`).
  // Aliased as `includes` and `include`.
  _.contains = _.includes = _.include = function(obj, item, fromIndex, guard) {
    if (!isArrayLike(obj)) obj = _.values(obj);
    if (typeof fromIndex != 'number' || guard) fromIndex = 0;
    return _.indexOf(obj, item, fromIndex) >= 0;
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = restArguments(function(obj, path, args) {
    var contextPath, func;
    if (_.isFunction(path)) {
      func = path;
    } else if (_.isArray(path)) {
      contextPath = path.slice(0, -1);
      path = path[path.length - 1];
    }
    return _.map(obj, function(context) {
      var method = func;
      if (!method) {
        if (contextPath && contextPath.length) {
          context = deepGet(context, contextPath);
        }
        if (context == null) return void 0;
        method = context[path];
      }
      return method == null ? method : method.apply(context, args);
    });
  });

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, _.property(key));
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // containing specific `key:value` pairs.
  _.where = function(obj, attrs) {
    return _.filter(obj, _.matcher(attrs));
  };

  // Convenience version of a common use case of `find`: getting the first object
  // containing specific `key:value` pairs.
  _.findWhere = function(obj, attrs) {
    return _.find(obj, _.matcher(attrs));
  };

  // Return the maximum element (or element-based computation).
  _.max = function(obj, iteratee, context) {
    var result = -Infinity, lastComputed = -Infinity,
        value, computed;
    if (iteratee == null || typeof iteratee == 'number' && typeof obj[0] != 'object' && obj != null) {
      obj = isArrayLike(obj) ? obj : _.values(obj);
      for (var i = 0, length = obj.length; i < length; i++) {
        value = obj[i];
        if (value != null && value > result) {
          result = value;
        }
      }
    } else {
      iteratee = cb(iteratee, context);
      _.each(obj, function(v, index, list) {
        computed = iteratee(v, index, list);
        if (computed > lastComputed || computed === -Infinity && result === -Infinity) {
          result = v;
          lastComputed = computed;
        }
      });
    }
    return result;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iteratee, context) {
    var result = Infinity, lastComputed = Infinity,
        value, computed;
    if (iteratee == null || typeof iteratee == 'number' && typeof obj[0] != 'object' && obj != null) {
      obj = isArrayLike(obj) ? obj : _.values(obj);
      for (var i = 0, length = obj.length; i < length; i++) {
        value = obj[i];
        if (value != null && value < result) {
          result = value;
        }
      }
    } else {
      iteratee = cb(iteratee, context);
      _.each(obj, function(v, index, list) {
        computed = iteratee(v, index, list);
        if (computed < lastComputed || computed === Infinity && result === Infinity) {
          result = v;
          lastComputed = computed;
        }
      });
    }
    return result;
  };

  // Shuffle a collection.
  _.shuffle = function(obj) {
    return _.sample(obj, Infinity);
  };

  // Sample **n** random values from a collection using the modern version of the
  // [Fisher-Yates shuffle](http://en.wikipedia.org/wiki/Fisher–Yates_shuffle).
  // If **n** is not specified, returns a single random element.
  // The internal `guard` argument allows it to work with `map`.
  _.sample = function(obj, n, guard) {
    if (n == null || guard) {
      if (!isArrayLike(obj)) obj = _.values(obj);
      return obj[_.random(obj.length - 1)];
    }
    var sample = isArrayLike(obj) ? _.clone(obj) : _.values(obj);
    var length = getLength(sample);
    n = Math.max(Math.min(n, length), 0);
    var last = length - 1;
    for (var index = 0; index < n; index++) {
      var rand = _.random(index, last);
      var temp = sample[index];
      sample[index] = sample[rand];
      sample[rand] = temp;
    }
    return sample.slice(0, n);
  };

  // Sort the object's values by a criterion produced by an iteratee.
  _.sortBy = function(obj, iteratee, context) {
    var index = 0;
    iteratee = cb(iteratee, context);
    return _.pluck(_.map(obj, function(value, key, list) {
      return {
        value: value,
        index: index++,
        criteria: iteratee(value, key, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index - right.index;
    }), 'value');
  };

  // An internal function used for aggregate "group by" operations.
  var group = function(behavior, partition) {
    return function(obj, iteratee, context) {
      var result = partition ? [[], []] : {};
      iteratee = cb(iteratee, context);
      _.each(obj, function(value, index) {
        var key = iteratee(value, index, obj);
        behavior(result, value, key);
      });
      return result;
    };
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = group(function(result, value, key) {
    if (has(result, key)) result[key].push(value); else result[key] = [value];
  });

  // Indexes the object's values by a criterion, similar to `groupBy`, but for
  // when you know that your index values will be unique.
  _.indexBy = group(function(result, value, key) {
    result[key] = value;
  });

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  _.countBy = group(function(result, value, key) {
    if (has(result, key)) result[key]++; else result[key] = 1;
  });

  var reStrSymbol = /[^\ud800-\udfff]|[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff]/g;
  // Safely create a real, live array from anything iterable.
  _.toArray = function(obj) {
    if (!obj) return [];
    if (_.isArray(obj)) return slice.call(obj);
    if (_.isString(obj)) {
      // Keep surrogate pair characters together
      return obj.match(reStrSymbol);
    }
    if (isArrayLike(obj)) return _.map(obj, _.identity);
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    if (obj == null) return 0;
    return isArrayLike(obj) ? obj.length : _.keys(obj).length;
  };

  // Split a collection into two arrays: one whose elements all satisfy the given
  // predicate, and one whose elements all do not satisfy the predicate.
  _.partition = group(function(result, value, pass) {
    result[pass ? 0 : 1].push(value);
  }, true);

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    if (array == null || array.length < 1) return n == null ? void 0 : [];
    if (n == null || guard) return array[0];
    return _.initial(array, array.length - n);
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, Math.max(0, array.length - (n == null || guard ? 1 : n)));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array.
  _.last = function(array, n, guard) {
    if (array == null || array.length < 1) return n == null ? void 0 : [];
    if (n == null || guard) return array[array.length - 1];
    return _.rest(array, Math.max(0, array.length - n));
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array.
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, n == null || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, Boolean);
  };

  // Internal implementation of a recursive `flatten` function.
  var flatten = function(input, shallow, strict, output) {
    output = output || [];
    var idx = output.length;
    for (var i = 0, length = getLength(input); i < length; i++) {
      var value = input[i];
      if (isArrayLike(value) && (_.isArray(value) || _.isArguments(value))) {
        // Flatten current level of array or arguments object.
        if (shallow) {
          var j = 0, len = value.length;
          while (j < len) output[idx++] = value[j++];
        } else {
          flatten(value, shallow, strict, output);
          idx = output.length;
        }
      } else if (!strict) {
        output[idx++] = value;
      }
    }
    return output;
  };

  // Flatten out an array, either recursively (by default), or just one level.
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, false);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = restArguments(function(array, otherArrays) {
    return _.difference(array, otherArrays);
  });

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // The faster algorithm will not work with an iteratee if the iteratee
  // is not a one-to-one function, so providing an iteratee will disable
  // the faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iteratee, context) {
    if (!_.isBoolean(isSorted)) {
      context = iteratee;
      iteratee = isSorted;
      isSorted = false;
    }
    if (iteratee != null) iteratee = cb(iteratee, context);
    var result = [];
    var seen = [];
    for (var i = 0, length = getLength(array); i < length; i++) {
      var value = array[i],
          computed = iteratee ? iteratee(value, i, array) : value;
      if (isSorted && !iteratee) {
        if (!i || seen !== computed) result.push(value);
        seen = computed;
      } else if (iteratee) {
        if (!_.contains(seen, computed)) {
          seen.push(computed);
          result.push(value);
        }
      } else if (!_.contains(result, value)) {
        result.push(value);
      }
    }
    return result;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = restArguments(function(arrays) {
    return _.uniq(flatten(arrays, true, true));
  });

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  _.intersection = function(array) {
    var result = [];
    var argsLength = arguments.length;
    for (var i = 0, length = getLength(array); i < length; i++) {
      var item = array[i];
      if (_.contains(result, item)) continue;
      var j;
      for (j = 1; j < argsLength; j++) {
        if (!_.contains(arguments[j], item)) break;
      }
      if (j === argsLength) result.push(item);
    }
    return result;
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = restArguments(function(array, rest) {
    rest = flatten(rest, true, true);
    return _.filter(array, function(value){
      return !_.contains(rest, value);
    });
  });

  // Complement of _.zip. Unzip accepts an array of arrays and groups
  // each array's elements on shared indices.
  _.unzip = function(array) {
    var length = array && _.max(array, getLength).length || 0;
    var result = Array(length);

    for (var index = 0; index < length; index++) {
      result[index] = _.pluck(array, index);
    }
    return result;
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = restArguments(_.unzip);

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values. Passing by pairs is the reverse of _.pairs.
  _.object = function(list, values) {
    var result = {};
    for (var i = 0, length = getLength(list); i < length; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // Generator function to create the findIndex and findLastIndex functions.
  var createPredicateIndexFinder = function(dir) {
    return function(array, predicate, context) {
      predicate = cb(predicate, context);
      var length = getLength(array);
      var index = dir > 0 ? 0 : length - 1;
      for (; index >= 0 && index < length; index += dir) {
        if (predicate(array[index], index, array)) return index;
      }
      return -1;
    };
  };

  // Returns the first index on an array-like that passes a predicate test.
  _.findIndex = createPredicateIndexFinder(1);
  _.findLastIndex = createPredicateIndexFinder(-1);

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iteratee, context) {
    iteratee = cb(iteratee, context, 1);
    var value = iteratee(obj);
    var low = 0, high = getLength(array);
    while (low < high) {
      var mid = Math.floor((low + high) / 2);
      if (iteratee(array[mid]) < value) low = mid + 1; else high = mid;
    }
    return low;
  };

  // Generator function to create the indexOf and lastIndexOf functions.
  var createIndexFinder = function(dir, predicateFind, sortedIndex) {
    return function(array, item, idx) {
      var i = 0, length = getLength(array);
      if (typeof idx == 'number') {
        if (dir > 0) {
          i = idx >= 0 ? idx : Math.max(idx + length, i);
        } else {
          length = idx >= 0 ? Math.min(idx + 1, length) : idx + length + 1;
        }
      } else if (sortedIndex && idx && length) {
        idx = sortedIndex(array, item);
        return array[idx] === item ? idx : -1;
      }
      if (item !== item) {
        idx = predicateFind(slice.call(array, i, length), _.isNaN);
        return idx >= 0 ? idx + i : -1;
      }
      for (idx = dir > 0 ? i : length - 1; idx >= 0 && idx < length; idx += dir) {
        if (array[idx] === item) return idx;
      }
      return -1;
    };
  };

  // Return the position of the first occurrence of an item in an array,
  // or -1 if the item is not included in the array.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = createIndexFinder(1, _.findIndex, _.sortedIndex);
  _.lastIndexOf = createIndexFinder(-1, _.findLastIndex);

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (stop == null) {
      stop = start || 0;
      start = 0;
    }
    if (!step) {
      step = stop < start ? -1 : 1;
    }

    var length = Math.max(Math.ceil((stop - start) / step), 0);
    var range = Array(length);

    for (var idx = 0; idx < length; idx++, start += step) {
      range[idx] = start;
    }

    return range;
  };

  // Chunk a single array into multiple arrays, each containing `count` or fewer
  // items.
  _.chunk = function(array, count) {
    if (count == null || count < 1) return [];
    var result = [];
    var i = 0, length = array.length;
    while (i < length) {
      result.push(slice.call(array, i, i += count));
    }
    return result;
  };

  // Function (ahem) Functions
  // ------------------

  // Determines whether to execute a function as a constructor
  // or a normal function with the provided arguments.
  var executeBound = function(sourceFunc, boundFunc, context, callingContext, args) {
    if (!(callingContext instanceof boundFunc)) return sourceFunc.apply(context, args);
    var self = baseCreate(sourceFunc.prototype);
    var result = sourceFunc.apply(self, args);
    if (_.isObject(result)) return result;
    return self;
  };

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
  // available.
  _.bind = restArguments(function(func, context, args) {
    if (!_.isFunction(func)) throw new TypeError('Bind must be called on a function');
    var bound = restArguments(function(callArgs) {
      return executeBound(func, bound, context, this, args.concat(callArgs));
    });
    return bound;
  });

  // Partially apply a function by creating a version that has had some of its
  // arguments pre-filled, without changing its dynamic `this` context. _ acts
  // as a placeholder by default, allowing any combination of arguments to be
  // pre-filled. Set `_.partial.placeholder` for a custom placeholder argument.
  _.partial = restArguments(function(func, boundArgs) {
    var placeholder = _.partial.placeholder;
    var bound = function() {
      var position = 0, length = boundArgs.length;
      var args = Array(length);
      for (var i = 0; i < length; i++) {
        args[i] = boundArgs[i] === placeholder ? arguments[position++] : boundArgs[i];
      }
      while (position < arguments.length) args.push(arguments[position++]);
      return executeBound(func, bound, this, this, args);
    };
    return bound;
  });

  _.partial.placeholder = _;

  // Bind a number of an object's methods to that object. Remaining arguments
  // are the method names to be bound. Useful for ensuring that all callbacks
  // defined on an object belong to it.
  _.bindAll = restArguments(function(obj, keys) {
    keys = flatten(keys, false, false);
    var index = keys.length;
    if (index < 1) throw new Error('bindAll must be passed function names');
    while (index--) {
      var key = keys[index];
      obj[key] = _.bind(obj[key], obj);
    }
  });

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memoize = function(key) {
      var cache = memoize.cache;
      var address = '' + (hasher ? hasher.apply(this, arguments) : key);
      if (!has(cache, address)) cache[address] = func.apply(this, arguments);
      return cache[address];
    };
    memoize.cache = {};
    return memoize;
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = restArguments(function(func, wait, args) {
    return setTimeout(function() {
      return func.apply(null, args);
    }, wait);
  });

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = _.partial(_.delay, _, 1);

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time. Normally, the throttled function will run
  // as much as it can, without ever going more than once per `wait` duration;
  // but if you'd like to disable the execution on the leading edge, pass
  // `{leading: false}`. To disable execution on the trailing edge, ditto.
  _.throttle = function(func, wait, options) {
    var timeout, context, args, result;
    var previous = 0;
    if (!options) options = {};

    var later = function() {
      previous = options.leading === false ? 0 : _.now();
      timeout = null;
      result = func.apply(context, args);
      if (!timeout) context = args = null;
    };

    var throttled = function() {
      var now = _.now();
      if (!previous && options.leading === false) previous = now;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0 || remaining > wait) {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        previous = now;
        result = func.apply(context, args);
        if (!timeout) context = args = null;
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };

    throttled.cancel = function() {
      clearTimeout(timeout);
      previous = 0;
      timeout = context = args = null;
    };

    return throttled;
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout, result;

    var later = function(context, args) {
      timeout = null;
      if (args) result = func.apply(context, args);
    };

    var debounced = restArguments(function(args) {
      if (timeout) clearTimeout(timeout);
      if (immediate) {
        var callNow = !timeout;
        timeout = setTimeout(later, wait);
        if (callNow) result = func.apply(this, args);
      } else {
        timeout = _.delay(later, wait, this, args);
      }

      return result;
    });

    debounced.cancel = function() {
      clearTimeout(timeout);
      timeout = null;
    };

    return debounced;
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return _.partial(wrapper, func);
  };

  // Returns a negated version of the passed-in predicate.
  _.negate = function(predicate) {
    return function() {
      return !predicate.apply(this, arguments);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var args = arguments;
    var start = args.length - 1;
    return function() {
      var i = start;
      var result = args[start].apply(this, arguments);
      while (i--) result = args[i].call(this, result);
      return result;
    };
  };

  // Returns a function that will only be executed on and after the Nth call.
  _.after = function(times, func) {
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Returns a function that will only be executed up to (but not including) the Nth call.
  _.before = function(times, func) {
    var memo;
    return function() {
      if (--times > 0) {
        memo = func.apply(this, arguments);
      }
      if (times <= 1) func = null;
      return memo;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = _.partial(_.before, 2);

  _.restArguments = restArguments;

  // Object Functions
  // ----------------

  // Keys in IE < 9 that won't be iterated by `for key in ...` and thus missed.
  var hasEnumBug = !{toString: null}.propertyIsEnumerable('toString');
  var nonEnumerableProps = ['valueOf', 'isPrototypeOf', 'toString',
    'propertyIsEnumerable', 'hasOwnProperty', 'toLocaleString'];

  var collectNonEnumProps = function(obj, keys) {
    var nonEnumIdx = nonEnumerableProps.length;
    var constructor = obj.constructor;
    var proto = _.isFunction(constructor) && constructor.prototype || ObjProto;

    // Constructor is a special case.
    var prop = 'constructor';
    if (has(obj, prop) && !_.contains(keys, prop)) keys.push(prop);

    while (nonEnumIdx--) {
      prop = nonEnumerableProps[nonEnumIdx];
      if (prop in obj && obj[prop] !== proto[prop] && !_.contains(keys, prop)) {
        keys.push(prop);
      }
    }
  };

  // Retrieve the names of an object's own properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`.
  _.keys = function(obj) {
    if (!_.isObject(obj)) return [];
    if (nativeKeys) return nativeKeys(obj);
    var keys = [];
    for (var key in obj) if (has(obj, key)) keys.push(key);
    // Ahem, IE < 9.
    if (hasEnumBug) collectNonEnumProps(obj, keys);
    return keys;
  };

  // Retrieve all the property names of an object.
  _.allKeys = function(obj) {
    if (!_.isObject(obj)) return [];
    var keys = [];
    for (var key in obj) keys.push(key);
    // Ahem, IE < 9.
    if (hasEnumBug) collectNonEnumProps(obj, keys);
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var values = Array(length);
    for (var i = 0; i < length; i++) {
      values[i] = obj[keys[i]];
    }
    return values;
  };

  // Returns the results of applying the iteratee to each element of the object.
  // In contrast to _.map it returns an object.
  _.mapObject = function(obj, iteratee, context) {
    iteratee = cb(iteratee, context);
    var keys = _.keys(obj),
        length = keys.length,
        results = {};
    for (var index = 0; index < length; index++) {
      var currentKey = keys[index];
      results[currentKey] = iteratee(obj[currentKey], currentKey, obj);
    }
    return results;
  };

  // Convert an object into a list of `[key, value]` pairs.
  // The opposite of _.object.
  _.pairs = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var pairs = Array(length);
    for (var i = 0; i < length; i++) {
      pairs[i] = [keys[i], obj[keys[i]]];
    }
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    var keys = _.keys(obj);
    for (var i = 0, length = keys.length; i < length; i++) {
      result[obj[keys[i]]] = keys[i];
    }
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`.
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // An internal function for creating assigner functions.
  var createAssigner = function(keysFunc, defaults) {
    return function(obj) {
      var length = arguments.length;
      if (defaults) obj = Object(obj);
      if (length < 2 || obj == null) return obj;
      for (var index = 1; index < length; index++) {
        var source = arguments[index],
            keys = keysFunc(source),
            l = keys.length;
        for (var i = 0; i < l; i++) {
          var key = keys[i];
          if (!defaults || obj[key] === void 0) obj[key] = source[key];
        }
      }
      return obj;
    };
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = createAssigner(_.allKeys);

  // Assigns a given object with all the own properties in the passed-in object(s).
  // (https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object/assign)
  _.extendOwn = _.assign = createAssigner(_.keys);

  // Returns the first key on an object that passes a predicate test.
  _.findKey = function(obj, predicate, context) {
    predicate = cb(predicate, context);
    var keys = _.keys(obj), key;
    for (var i = 0, length = keys.length; i < length; i++) {
      key = keys[i];
      if (predicate(obj[key], key, obj)) return key;
    }
  };

  // Internal pick helper function to determine if `obj` has key `key`.
  var keyInObj = function(value, key, obj) {
    return key in obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = restArguments(function(obj, keys) {
    var result = {}, iteratee = keys[0];
    if (obj == null) return result;
    if (_.isFunction(iteratee)) {
      if (keys.length > 1) iteratee = optimizeCb(iteratee, keys[1]);
      keys = _.allKeys(obj);
    } else {
      iteratee = keyInObj;
      keys = flatten(keys, false, false);
      obj = Object(obj);
    }
    for (var i = 0, length = keys.length; i < length; i++) {
      var key = keys[i];
      var value = obj[key];
      if (iteratee(value, key, obj)) result[key] = value;
    }
    return result;
  });

  // Return a copy of the object without the blacklisted properties.
  _.omit = restArguments(function(obj, keys) {
    var iteratee = keys[0], context;
    if (_.isFunction(iteratee)) {
      iteratee = _.negate(iteratee);
      if (keys.length > 1) context = keys[1];
    } else {
      keys = _.map(flatten(keys, false, false), String);
      iteratee = function(value, key) {
        return !_.contains(keys, key);
      };
    }
    return _.pick(obj, iteratee, context);
  });

  // Fill in a given object with default properties.
  _.defaults = createAssigner(_.allKeys, true);

  // Creates an object that inherits from the given prototype object.
  // If additional properties are provided then they will be added to the
  // created object.
  _.create = function(prototype, props) {
    var result = baseCreate(prototype);
    if (props) _.extendOwn(result, props);
    return result;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Returns whether an object has a given set of `key:value` pairs.
  _.isMatch = function(object, attrs) {
    var keys = _.keys(attrs), length = keys.length;
    if (object == null) return !length;
    var obj = Object(object);
    for (var i = 0; i < length; i++) {
      var key = keys[i];
      if (attrs[key] !== obj[key] || !(key in obj)) return false;
    }
    return true;
  };


  // Internal recursive comparison function for `isEqual`.
  var eq, deepEq;
  eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
    if (a === b) return a !== 0 || 1 / a === 1 / b;
    // `null` or `undefined` only equal to itself (strict comparison).
    if (a == null || b == null) return false;
    // `NaN`s are equivalent, but non-reflexive.
    if (a !== a) return b !== b;
    // Exhaust primitive checks
    var type = typeof a;
    if (type !== 'function' && type !== 'object' && typeof b != 'object') return false;
    return deepEq(a, b, aStack, bStack);
  };

  // Internal recursive comparison function for `isEqual`.
  deepEq = function(a, b, aStack, bStack) {
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className !== toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, regular expressions, dates, and booleans are compared by value.
      case '[object RegExp]':
      // RegExps are coerced to strings for comparison (Note: '' + /a/i === '/a/i')
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return '' + a === '' + b;
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive.
        // Object(NaN) is equivalent to NaN.
        if (+a !== +a) return +b !== +b;
        // An `egal` comparison is performed for other numeric values.
        return +a === 0 ? 1 / +a === 1 / b : +a === +b;
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a === +b;
      case '[object Symbol]':
        return SymbolProto.valueOf.call(a) === SymbolProto.valueOf.call(b);
    }

    var areArrays = className === '[object Array]';
    if (!areArrays) {
      if (typeof a != 'object' || typeof b != 'object') return false;

      // Objects with different constructors are not equivalent, but `Object`s or `Array`s
      // from different frames are.
      var aCtor = a.constructor, bCtor = b.constructor;
      if (aCtor !== bCtor && !(_.isFunction(aCtor) && aCtor instanceof aCtor &&
                               _.isFunction(bCtor) && bCtor instanceof bCtor)
                          && ('constructor' in a && 'constructor' in b)) {
        return false;
      }
    }
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.

    // Initializing stack of traversed objects.
    // It's done here since we only need them for objects and arrays comparison.
    aStack = aStack || [];
    bStack = bStack || [];
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] === a) return bStack[length] === b;
    }

    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);

    // Recursively compare objects and arrays.
    if (areArrays) {
      // Compare array lengths to determine if a deep comparison is necessary.
      length = a.length;
      if (length !== b.length) return false;
      // Deep compare the contents, ignoring non-numeric properties.
      while (length--) {
        if (!eq(a[length], b[length], aStack, bStack)) return false;
      }
    } else {
      // Deep compare objects.
      var keys = _.keys(a), key;
      length = keys.length;
      // Ensure that both objects contain the same number of properties before comparing deep equality.
      if (_.keys(b).length !== length) return false;
      while (length--) {
        // Deep compare each member
        key = keys[length];
        if (!(has(b, key) && eq(a[key], b[key], aStack, bStack))) return false;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return true;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (isArrayLike(obj) && (_.isArray(obj) || _.isString(obj) || _.isArguments(obj))) return obj.length === 0;
    return _.keys(obj).length === 0;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) === '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    var type = typeof obj;
    return type === 'function' || type === 'object' && !!obj;
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp, isError, isMap, isWeakMap, isSet, isWeakSet.
  _.each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp', 'Error', 'Symbol', 'Map', 'WeakMap', 'Set', 'WeakSet'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) === '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE < 9), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return has(obj, 'callee');
    };
  }

  // Optimize `isFunction` if appropriate. Work around some typeof bugs in old v8,
  // IE 11 (#1621), Safari 8 (#1929), and PhantomJS (#2236).
  var nodelist = root.document && root.document.childNodes;
  if (typeof /./ != 'function' && typeof Int8Array != 'object' && typeof nodelist != 'function') {
    _.isFunction = function(obj) {
      return typeof obj == 'function' || false;
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return !_.isSymbol(obj) && isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`?
  _.isNaN = function(obj) {
    return _.isNumber(obj) && isNaN(obj);
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) === '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, path) {
    if (!_.isArray(path)) {
      return has(obj, path);
    }
    var length = path.length;
    for (var i = 0; i < length; i++) {
      var key = path[i];
      if (obj == null || !hasOwnProperty.call(obj, key)) {
        return false;
      }
      obj = obj[key];
    }
    return !!length;
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iteratees.
  _.identity = function(value) {
    return value;
  };

  // Predicate-generating functions. Often useful outside of Underscore.
  _.constant = function(value) {
    return function() {
      return value;
    };
  };

  _.noop = function(){};

  // Creates a function that, when passed an object, will traverse that object’s
  // properties down the given `path`, specified as an array of keys or indexes.
  _.property = function(path) {
    if (!_.isArray(path)) {
      return shallowProperty(path);
    }
    return function(obj) {
      return deepGet(obj, path);
    };
  };

  // Generates a function for a given object that returns a given property.
  _.propertyOf = function(obj) {
    if (obj == null) {
      return function(){};
    }
    return function(path) {
      return !_.isArray(path) ? obj[path] : deepGet(obj, path);
    };
  };

  // Returns a predicate for checking whether an object has a given set of
  // `key:value` pairs.
  _.matcher = _.matches = function(attrs) {
    attrs = _.extendOwn({}, attrs);
    return function(obj) {
      return _.isMatch(obj, attrs);
    };
  };

  // Run a function **n** times.
  _.times = function(n, iteratee, context) {
    var accum = Array(Math.max(0, n));
    iteratee = optimizeCb(iteratee, context, 1);
    for (var i = 0; i < n; i++) accum[i] = iteratee(i);
    return accum;
  };

  // Return a random integer between min and max (inclusive).
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  // A (possibly faster) way to get the current timestamp as an integer.
  _.now = Date.now || function() {
    return new Date().getTime();
  };

  // List of HTML entities for escaping.
  var escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '`': '&#x60;'
  };
  var unescapeMap = _.invert(escapeMap);

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  var createEscaper = function(map) {
    var escaper = function(match) {
      return map[match];
    };
    // Regexes for identifying a key that needs to be escaped.
    var source = '(?:' + _.keys(map).join('|') + ')';
    var testRegexp = RegExp(source);
    var replaceRegexp = RegExp(source, 'g');
    return function(string) {
      string = string == null ? '' : '' + string;
      return testRegexp.test(string) ? string.replace(replaceRegexp, escaper) : string;
    };
  };
  _.escape = createEscaper(escapeMap);
  _.unescape = createEscaper(unescapeMap);

  // Traverses the children of `obj` along `path`. If a child is a function, it
  // is invoked with its parent as context. Returns the value of the final
  // child, or `fallback` if any child is undefined.
  _.result = function(obj, path, fallback) {
    if (!_.isArray(path)) path = [path];
    var length = path.length;
    if (!length) {
      return _.isFunction(fallback) ? fallback.call(obj) : fallback;
    }
    for (var i = 0; i < length; i++) {
      var prop = obj == null ? void 0 : obj[path[i]];
      if (prop === void 0) {
        prop = fallback;
        i = length; // Ensure we don't continue iterating.
      }
      obj = _.isFunction(prop) ? prop.call(obj) : prop;
    }
    return obj;
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = ++idCounter + '';
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate: /<%([\s\S]+?)%>/g,
    interpolate: /<%=([\s\S]+?)%>/g,
    escape: /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'": "'",
    '\\': '\\',
    '\r': 'r',
    '\n': 'n',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escapeRegExp = /\\|'|\r|\n|\u2028|\u2029/g;

  var escapeChar = function(match) {
    return '\\' + escapes[match];
  };

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  // NB: `oldSettings` only exists for backwards compatibility.
  _.template = function(text, settings, oldSettings) {
    if (!settings && oldSettings) settings = oldSettings;
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset).replace(escapeRegExp, escapeChar);
      index = offset + match.length;

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      } else if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      } else if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }

      // Adobe VMs need the match returned to produce the correct offset.
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + 'return __p;\n';

    var render;
    try {
      render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled source as a convenience for precompilation.
    var argument = settings.variable || 'obj';
    template.source = 'function(' + argument + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function. Start chaining a wrapped Underscore object.
  _.chain = function(obj) {
    var instance = _(obj);
    instance._chain = true;
    return instance;
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  var chainResult = function(instance, obj) {
    return instance._chain ? _(obj).chain() : obj;
  };

  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    _.each(_.functions(obj), function(name) {
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return chainResult(this, func.apply(_, args));
      };
    });
    return _;
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  _.each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name === 'shift' || name === 'splice') && obj.length === 0) delete obj[0];
      return chainResult(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  _.each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return chainResult(this, method.apply(this._wrapped, arguments));
    };
  });

  // Extracts the result from a wrapped and chained object.
  _.prototype.value = function() {
    return this._wrapped;
  };

  // Provide unwrapping proxy for some methods used in engine operations
  // such as arithmetic and JSON stringification.
  _.prototype.valueOf = _.prototype.toJSON = _.prototype.value;

  _.prototype.toString = function() {
    return String(this._wrapped);
  };

  // AMD registration happens at the end for compatibility with AMD loaders
  // that may not enforce next-turn semantics on modules. Even though general
  // practice for AMD registration is to be anonymous, underscore registers
  // as a named module because, like jQuery, it is a base library that is
  // popular enough to be bundled in a third party lib, but not be part of
  // an AMD load request. Those cases could generate an error when an
  // anonymous define() is called outside of a loader request.
  if (typeof define == 'function' && define.amd) {
    define('underscore', [], function() {
      return _;
    });
  }
}());

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}]},{},[20])(20)
});
