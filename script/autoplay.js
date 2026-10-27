(function () {
  'use strict';

  // Optional, reversible helper. It uses the game's own buttons and cooldowns;
  // it never edits save data or bypasses the game's resource costs.
  var enabled = false;
  var timer = null;
  var lastAction = 0;
  var lastManualNavigation = 0;
  function setEnabled(value) {
    enabled = value;
    if (enabled) {
      adaptiveLastState = adaptiveSnapshot();
      adaptiveLastProgressAt = Date.now();
      beginAdaptiveRun();
      loadCombatPolicy('default', true);
      if (!timer) timer = window.setInterval(tick, 250);
      tick();
    } else {
      settleAdaptiveAction(false,'autoplay_disabled',adaptiveSnapshot());
      finishAdaptiveRun('completed');
      if (timer) {
        window.clearInterval(timer);
        timer = null;
      }
    }
  }

  function visible(el) {
    if (!el || !el.isConnected) return false;
    var rect = el.getBoundingClientRect();
    var style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' &&
      style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05;
  }

  function activePanel() {
    var panels = Array.prototype.slice.call(document.querySelectorAll('.location'));
    return panels.find(function (panel) {
      return visible(panel) && (panel.classList.contains('active') ||
        panel.style.display !== 'none' || panel.offsetParent !== null);
    }) || document.querySelector('.location');
  }

  function norm(text) {
    return (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // A conservative progression strategy: keep the fire going, grow the
  // settlement, unlock production and equipment, then use expedition/ship
  // controls as they become available. Cooldowns and affordability stay native.
  var priorities = [
    // Keep the survival loop stable before spending resources on expansion.
    ['light fire', 132], ['stoke fire', 130], ['add fuel', 125],
    ['gather wood', 120], ['check traps', 118], ['collect all', 115],
    ['take everything', 114], ['take all', 113], ['collect', 108],
    // Main progression: settlement, expedition, ship and endgame.
    ['return home', 106], ['return to village', 106], ['embark', 104],
    ['explore', 102], ['reinforce hull', 100], ['upgrade engine', 99],
    ['lift off', 98], ['power cycle', 97], ['wait', 94],
    ['build hut', 92], ['build cart', 90], ['build trap', 88],
    ['build lodge', 86], ['build trading post', 84], ['build workshop', 82],
    ['build tannery', 80], ['build smokehouse', 79], ['build steelworks', 78],
    ['build armoury', 77], ['build ', 76], ['fabricate', 76], ['craft', 74], ['make', 72],
    ['upgrade', 70], ['repair', 69], ['reinforce', 68], ['train', 66],
    ['hire', 64], ['gather', 62], ['hunt', 60], ['scavenge', 58],
    ['go inside', 56], ['enter', 55], ['investigate', 54], ['continue', 53],
    ['next', 52], ['open', 50], ['attack', 48], ['fight', 47],
    ['trade', 42], ['buy', 40], ['sell', 38], ['say goodbye', 35],
    ['leave cave', 34], ['leave', 30], ['go home', 28], ['linger', 20]
  ];

  function score(el) {
    var text = norm(el.innerText || el.textContent);
    var id = norm(el.id).replace(/[_-]+/g, ' ');
    var label = text + ' ' + id;
    var best = -1;
    priorities.forEach(function (entry) {
      if (label.indexOf(entry[0]) !== -1) best = Math.max(best, entry[1]);
    });
    if (/restart|delete|reset|share|save|import|export|hyper|language|sound|lights off/.test(label)) return -100;
    if (el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true') return -100;
    if (el.closest('.menu') || el.closest('#adr-autoplay-status')) return -100;
    if (el.id === 'gatherButton') best = Math.max(best, 110);
    if (/^(stoke fire|light fire)[.!]?$/.test(text)) return 1000;
    if (/^(stoke fire|gather wood|check traps|embark|return home)[.!]?$/.test(text)) best += 8;
    best += investmentBonus(el);
    return best;
  }


  // Evaluate purchases by their long-run economic and progression value, not
  // just the wording of the button. These are strategic bonuses layered on
  // top of the action priorities; native game checks still enforce affordability.
  function investmentBonus(el) {
    var id = norm(el.id).replace(/[_-]+/g, ' ');
    var thing = norm(el.getAttribute('buildThing') || el.getAttribute('fabricateThing') || '');
    if (!thing) {
      var match = id.match(/^(?:build|fabricate) (.+)$/);
      if (match) thing = match[1];
    }
    if (!thing) return 0;

    var stores = window.$SM && $SM.get ? ($SM.get('stores') || {}) : {};
    var buildings = window.$SM && $SM.get ? ($SM.get('game.buildings') || {}) : {};
    var population = window.$SM && $SM.get ? (Number($SM.get('game.population')) || 0) : 0;
    var workers = window.$SM && $SM.get ? ($SM.get('game.workers') || {}) : {};
    var huts = Number(buildings.hut) || 0;
    var bonus = 0;

    // High-leverage economy engines and unlocks come before marginal upgrades.
    // A trading post unlocks the buy/sell economy; a cart improves wood
    // gathering; huts expand population and therefore the workforce.
    var ranks = {
      'trading post': 115, 'cart': 95, 'hut': 76, 'lodge': 72,
      'tannery': 69, 'smokehouse': 68, 'workshop': 65,
      'steelworks': 62, 'armoury': 59, 'trap': 56,
      // Trading-post purchases are progression actions too: stock the materials
      // needed for better gear, medicine, and ultimately the ship.
      'compass': 145, 'scales': 54, 'teeth': 54, 'iron': 64, 'coal': 58,
      'steel': 72, 'medicine': 28, 'bullets': 24, 'energy cell': 58,
      'bolas': 45, 'grenade': 52, 'bayonet': 78, 'alien alloy': 125,
      'bait': 24,
      'rucksack': 88, 'wagon': 82, 'convoy': 86,
      'cargo drone': 100, 'fluid recycler': 92, 'water tank': 84,
      'cask': 76, 'waterskin': 62,
      'bone spear': 70, 'iron sword': 78, 'steel sword': 84,
      'rifle': 82, 'energy blade': 90, 'plasma rifle': 96,
      'kinetic armour': 91, 'disruptor': 88, 'hypo': 85, 'stim': 72,
      'glowstone': 58, 'l armour': 60, 'i armour': 72, 's armour': 82,
      'torch': 28
    };
    bonus = ranks[thing] || 35;
    if (window.World && World.Weapons && World.Weapons[thing]) {
      var plan = combatWeaponPlan();
      if (plan) {
        var current = plan.candidates.filter(function(candidate) {
          return candidate.inventory > 0 && candidate.ammoAvailable;
        }).sort(function(a,b) { return b.score - a.score; })[0];
        var proposed = plan.candidates.filter(function(candidate) { return candidate.name === thing; })[0];
        if (proposed && current && proposed.score > current.score + 0.5) bonus += Math.min(45, (proposed.score - current.score) * 12);
      }
    }

    // Don't keep expanding housing when there is already ample unused capacity;
    // do invest in housing when population is near its cap or workers are scarce.
    if (thing === 'hut') {
      var capacity = huts * 4;
      bonus += (population >= capacity - 3 || population < 4) ? 24 : (population < capacity - 8 ? -24 : 0);
      if (huts >= 8) bonus -= 18;
    }
    if (thing === 'trading post' && Number(buildings['trading post']) > 0) return -100;
    if (thing === 'cart' && Number(stores.cart) > 0) return -100;
    if (thing === 'compass' && Number(stores.compass) > 0) return -100;

    // Prefer productive infrastructure before buying consumables or duplicate
    // gear. Weapons/medical supplies get a boost when exploration is underway.
    if (/^(bullets|medicine|energy cell|bolas|grenade|bayonet)$/.test(thing)) {
      var onPath = window.Engine && Engine.activeModule === window.Path;
      bonus = onPath ? 48 : 8;
    }
    if (thing === 'alien alloy') bonus = 125;
    if (thing === 'steel' && Number(stores.steel) < 20) bonus += 14;
    if (thing === 'iron' && Number(stores.iron) < 30) bonus += 12;
    if (thing === 'coal' && Number(stores.coal) < 30) bonus += 10;
    if (thing === 'scales') {
      var scaleStock = Number(stores.scales) || 0;
      bonus += scaleStock < 20 ? 24 : (scaleStock < 50 ? 10 : (scaleStock >= 100 ? -24 : 0));
    }
    if (thing === 'teeth') {
      var toothStock = Number(stores.teeth) || 0;
      bonus += toothStock < 15 ? 24 : (toothStock < 40 ? 10 : (toothStock >= 80 ? -24 : 0));
    }
    if (thing === 'bait') {
      var trapCount = Number(buildings.trap) || 0;
      var baitStock = Number(stores.bait) || 0;
      bonus += trapCount > baitStock ? 18 : -18;
    }
    if (thing === 'medicine' && Number(stores.medicine) >= 10) bonus -= 24;
    if (thing === 'bullets' && Number(stores.bullets) >= 40) bonus -= 22;
    if (thing === 'energy cell' && Number(stores['energy cell']) >= 12) bonus -= 20;

    // Reward investments that unlock worker roles, but don't assign jobs before
    // the population and input stock can sustain them.
    if (thing === 'lodge' && population < 4) bonus -= 18;
    if (thing === 'tannery' && (Number(stores.fur) || 0) < 20) bonus -= 12;
    if (thing === 'smokehouse' && (Number(stores.meat) || 0) < 20) bonus -= 12;
    if (thing === 'steelworks' && ((Number(stores.iron) || 0) < 20 || (Number(stores.coal) || 0) < 20)) bonus -= 12;
    if (thing === 'armoury' && ((Number(stores.steel) || 0) < 20 || (Number(stores.sulphur) || 0) < 10)) bonus -= 12;

    // Existing productive jobs are valuable only when their input resources
    // and population can support them; manageWorkers handles the actual split.
    if (thing === 'hut' && population > 0 && (Number(workers.gatherer) || 0) < 1) bonus += 8;
    return bonus;
  }

  function ready(el) {
    return visible(el) && !el.hasAttribute('disabled') &&
      !el.classList.contains('disabled') &&
      !el.classList.contains('onCooldown') &&
      el.getAttribute('aria-disabled') !== 'true' &&
      !(window.jQuery && jQuery(el).data('onCooldown'));
  }

  function clickReady(el) {
    if (!ready(el) || Date.now() - lastAction < 200) return false;
    if (typeof beginAdaptiveAction === 'function' && !beginAdaptiveAction(el)) return false;
    el.click();
    lastAction = Date.now();
    return true;
  }

  // Persistent combat learning: Supabase stores outcome-weighted action scores.
  // Local storage is only a short-lived queue so an offline death can sync later.
  var COMBAT_AI_URL = 'https://dkwmkvruzebnqlmvwzhy.supabase.co/functions/v1/adr-combat-ai';
  var COMBAT_AI_KEY = 'sb_publishable_Tur9X4MaQjH__4DnEtwAAQ_Xy9xVl5P';
  var combatEpisode = null;
  var combatPolicyCache = {};
  var combatPolicyPending = {};
  var combatEndCandidateAt = 0;
  var learningFlushInProgress = false;

  function combatContext(hp, maxHp, playerStatus, enemyStunned) {
    if (enemyStunned) return 'enemy_stunned';
    if (playerStatus === 'shield') return 'shielded';
    var ratio = maxHp > 0 ? hp / maxHp : 1;
    return ratio <= 0.33 ? 'low_hp' : ratio <= 0.66 ? 'mid_hp' : 'high_hp';
  }

  function requestCombatAI(payload) {
    return fetch(COMBAT_AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': COMBAT_AI_KEY, 'Authorization': 'Bearer ' + COMBAT_AI_KEY },
      body: JSON.stringify(payload)
    }).then(function (response) {
      if (!response.ok) throw new Error('combat AI request failed');
      return response.json();
    });
  }

  function sendAITelemetry(payload) {
    return requestCombatAI(payload).catch(function(error) {
      // Keep telemetry in the browser if the network is unavailable; retry on a later tick.
      throw error;
    });
  }

  function startAIRun(runType, summary) {
    return sendAITelemetry({ op: 'run_start', run_type: runType, summary: summary || {} })
      .then(function(data) { return data && data.run ? data.run.id : null; });
  }

  function finishAIRun(runId, status, summary) {
    if (!runId) return Promise.resolve(null);
    return sendAITelemetry({ op: 'run_finish', run_id: runId, status: status || 'completed', summary: summary || {} });
  }

  function sendAIEventBatch(events) {
    if (!events || !events.length) return Promise.resolve({ inserted: 0 });
    return sendAITelemetry({ op: 'event_batch', events: events });
  }


  // General autoplay AI: reward state/story progress, punish stalled actions,
  // and persist every decision/outcome through Supabase. The game remains the
  // source of truth for costs, cooldowns, and whether an action is legal.
  var adaptivePendingAction = null;
  var adaptiveActionCooldowns = {};
  var adaptiveRecentCounts = {};
  var adaptiveRunId = null;
  var adaptiveRunStartPending = false;
  var adaptiveLastState = '';
  var adaptiveLastProgressAt = Date.now();
  var adaptiveLastDecisionAt = 0;
  var adaptiveCompleted = 0;
  var adaptiveStalled = 0;

  function adaptiveActionKey(el) {
    var raw = norm((el && (el.id || el.getAttribute('buildThing') || el.getAttribute('fabricateThing') ||
      el.innerText || el.textContent)) || 'unknown-action');
    raw = raw.replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').replace(/-+/g, '-');
    return (raw || 'unknown-action').slice(0, 48);
  }

  function adaptiveSnapshot() {
    var moduleName = window.Engine && Engine.activeModule ?
      (Engine.activeModule.name || Engine.activeModule.title || Engine.activeModule.constructor && Engine.activeModule.constructor.name || 'module') : 'none';
    var stores = window.$SM && $SM.get ? ($SM.get('stores') || {}) : {};
    var game = window.$SM && $SM.get ? {
      buildings: $SM.get('game.buildings') || {},
      population: $SM.get('game.population') || 0,
      workers: $SM.get('game.workers') || {},
      path: $SM.get('game.path') || {},
      craft: $SM.get('game.craft') || {}
    } : {};
    var panel = window.Engine && Engine.activeModule && Engine.activeModule.panel;
    var panelText = panel && panel.length ? norm(panel[0].innerText || panel[0].textContent).slice(0, 1800) : '';
    var event = document.getElementById('event');
    var eventText = event && visible(event) ? norm(event.innerText || event.textContent).slice(0, 700) : '';
    var story = document.getElementById('log') || document.getElementById('story') ||
      document.querySelector('.log, #events, .events');
    var storyText = story ? norm(story.innerText || story.textContent).slice(-1400) : '';
    return JSON.stringify({module:moduleName,stores:stores,game:game,position:window.World && World.curPos || null,
      health:window.World && World.health,water:window.World && World.water,food:window.Path && Path.outfit && Path.outfit['cured meat'],
      panel:panelText,event:eventText,story:storyText});
  }

  function adaptiveLog(type, action, reward, payload) {
    var row = {run_id:adaptiveRunId || null,event_type:type,context:'default',action:action || null,
      reward:reward == null ? null : reward,payload:payload || {}};
    sendAIEventBatch([row]).catch(function(){});
  }

  function beginAdaptiveRun() {
    if (adaptiveRunStartPending || adaptiveRunId) return;
    adaptiveRunStartPending = true;
    startAIRun('live_autoplay', {source:'live_game',policy:'progress_novelty_v1'}).then(function(id) {
      adaptiveRunId = id || null;
      adaptiveLog('autoplay_enabled','start_autoplay',0,{policy:'progress_novelty_v1'});
    }).catch(function() {}).then(function(){ adaptiveRunStartPending = false; });
  }

  function finishAdaptiveRun(status) {
    var id = adaptiveRunId;
    adaptiveRunId = null;
    if (id) finishAIRun(id,status || 'completed',{completed_actions:adaptiveCompleted,stalled_actions:adaptiveStalled,
      policy:'progress_novelty_v1'}).catch(function(){});
  }

  function settleAdaptiveAction(progressed, reason, currentState) {
    if (!adaptivePendingAction) return;
    var pending = adaptivePendingAction;
    adaptivePendingAction = null;
    var reward = progressed ? 1 : -1;
    if (progressed) {
      adaptiveCompleted++;
      adaptiveLastProgressAt = Date.now();
      adaptiveActionCooldowns[pending.key] = 0;
    } else {
      adaptiveStalled++;
      adaptiveActionCooldowns[pending.key] = Date.now() + 30000;
    }
    adaptiveLog('action_result',pending.key,reward,{
      source:'live_autoplay',progressed:progressed,reason:reason,elapsed_ms:Date.now()-pending.startedAt,
      before:pending.before.slice(0,1800),after:(currentState || '').slice(0,1800),simulation:false
    });
    adaptiveLog('autoplay_feedback',pending.key,reward,{progressed:progressed,reason:reason,
      elapsed_ms:Date.now()-pending.startedAt,simulation:false});
    if (progressed) {
      // A useful change is evidence; refresh policy so later decisions use it.
      loadCombatPolicy('default',true);
    }
  }

  function monitorAdaptiveAction() {
    if (!enabled) return false;
    var state = adaptiveSnapshot();
    if (!adaptiveLastState) adaptiveLastState = state;
    if (state !== adaptiveLastState) {
      adaptiveLastState = state;
      adaptiveLastProgressAt = Date.now();
    }
    if (adaptivePendingAction) {
      var elapsed = Date.now() - adaptivePendingAction.startedAt;
      // Compare with the action's own baseline, not just the previous tick;
      // otherwise a quick change would be noticed once but never rewarded.
      if (state !== adaptivePendingAction.before && elapsed >= 700) {
        settleAdaptiveAction(true,'state_or_story_changed',state);
      } else if (elapsed >= 4500) {
        settleAdaptiveAction(false,'no_progress_within_4_5_seconds',state);
      } else {
        return true;
      }
    }
    return false;
  }

  function beginAdaptiveAction(el) {
    if (!enabled || !el) return true;
    var now = Date.now();
    if (adaptivePendingAction) return false;
    var key = adaptiveActionKey(el);
    if (adaptiveActionCooldowns[key] && adaptiveActionCooldowns[key] > now) return false;
    var state = adaptiveSnapshot();
    adaptivePendingAction = {key:key,label:norm(el.innerText || el.textContent).slice(0,120),
      before:state,startedAt:now,module:window.Engine && Engine.activeModule &&
        (Engine.activeModule.name || Engine.activeModule.title || 'module') || 'none'};
    adaptiveRecentCounts[key] = (adaptiveRecentCounts[key] || 0) + 1;
    adaptiveLastDecisionAt = now;
    adaptiveLog('autoplay_decision',key,null,{label:adaptivePendingAction.label,module:adaptivePendingAction.module,
      baseline:state.slice(0,1800),repeat_count:adaptiveRecentCounts[key],policy:'progress_novelty_v1',simulation:false});
    return true;
  }

  function adaptiveScore(el, baseScore) {
    var key = adaptiveActionKey(el);
    var now = Date.now();
    if (adaptiveActionCooldowns[key] && adaptiveActionCooldowns[key] > now) return -100;
    var localRepeats = adaptiveRecentCounts[key] || 0;
    var repeatPenalty = Math.min(28, Math.max(0, localRepeats - 1) * 5);
    var learned = learnedActionBonus('default',key);
    var label = norm(el.innerText || el.textContent);
    // Story choices, unlocks, new locations and resource/inventory changes are
    // worth trying; pure maintenance gets less priority when it repeats.
    var noveltyBonus = /discover|new|unlock|story|continue|investigate|explore|find|learn|build|craft|fabricate|upgrade|repair|trade|buy|equip|embark|return|landmark|signal|ship|launch|lift off/.test(label) ? 9 : 0;
    if (/stoke fire|light fire|gather wood|check traps/.test(label) && localRepeats > 2) noveltyBonus -= 8;
    return baseScore + learned + noveltyBonus - repeatPenalty;
  }

  function loadCombatPolicy(context, forceRefresh) {
    if (!context) return;
    if (forceRefresh) delete combatPolicyCache[context];
    if (combatPolicyCache[context] || combatPolicyPending[context]) return;
    combatPolicyPending[context] = true;
    requestCombatAI({ op: 'policy', context: context, actions: [] })
      .then(function (data) {
        combatPolicyCache[context] = data && data.stats && typeof data.stats === 'object' ? data.stats : {};
      })
      .catch(function () {
        // Do not cache a failed request as an empty policy forever. A later
        // combat tick can retry and recover the learned policy.
        delete combatPolicyCache[context];
      })
      .then(function () { delete combatPolicyPending[context]; });
  }

  function invalidateCombatPolicy() {
    combatPolicyCache = {};
    // Refresh every context already observed by this client after the next
    // fight begins; this avoids reusing pre-learning statistics indefinitely.
  }

  var LOCAL_COMBAT_LEARNING_KEY = 'adrCombatAILocalPolicyV1';

  function readLocalCombatPolicy() {
    try {
      var data = JSON.parse(localStorage.getItem(LOCAL_COMBAT_LEARNING_KEY) || '{}');
      return data && typeof data === 'object' ? data : {};
    } catch (e) { return {}; }
  }

  function writeLocalCombatOutcome(context, action, reward) {
    if (!context || !action) return;
    var policy = readLocalCombatPolicy();
    if (!policy[context]) policy[context] = {};
    var stat = policy[context][action] || { attempts: 0, reward_sum: 0, wins: 0, failures: 0 };
    stat.attempts = (Number(stat.attempts) || 0) + 1;
    stat.reward_sum = (Number(stat.reward_sum) || 0) + reward;
    if (reward > 0) stat.wins = (Number(stat.wins) || 0) + 1;
    if (reward < 0) stat.failures = (Number(stat.failures) || 0) + 1;
    policy[context][action] = stat;
    try { localStorage.setItem(LOCAL_COMBAT_LEARNING_KEY, JSON.stringify(policy)); } catch (e) {}
  }

  function localLearnedActionBonus(context, action) {
    var policy = readLocalCombatPolicy();
    var stat = policy[context] && policy[context][action];
    if (!stat || Number(stat.attempts) < 2) return 0;
    var attempts = Math.max(0, Number(stat.attempts) || 0);
    var confidence = Math.min(1, attempts / 5);
    var average = (Number(stat.reward_sum) || 0) / Math.max(1, attempts);
    return Math.max(-7, Math.min(7, average * 7)) * confidence;
  }

  function learnedActionBonus(context, action) {
    var stat = combatPolicyCache[context] && combatPolicyCache[context][action];
    var attempts = stat ? Math.max(0, Number(stat.attempts) || 0) : 0;
    var confidence = Math.min(1, attempts / 5);
    var average = stat ? (Number(stat.avgReward) || 0) : 0;
    var serverBonus = attempts >= 2 ? Math.max(-7, Math.min(7, average * 7)) * confidence : 0;
    return Math.max(-7, Math.min(7, serverBonus + localLearnedActionBonus(context, action)));
  }

  // Combat-only loadout planner. It enumerates every supported weapon and
  // compares damage rate, hit chance, cooldown, ammunition burden, crafting
  // cost, and whether the current save can reasonably obtain its ingredients.
  function combatInventory() {
    return window.$SM && $SM.get ? ($SM.get('stores') || {}) : {};
  }

  function combatWeaponPlan() {
    if (!window.World || !World.Weapons) return null;
    var stores = combatInventory();
    var candidates = [];
    Object.keys(World.Weapons).forEach(function(name) {
      var weapon = World.Weapons[name];
      if (!weapon) return;
      var damage = weapon.damage === 'stun' ? 0 : Math.max(0, Number(weapon.damage) || 0);
      var cooldown = Math.max(0.5, Number(weapon.cooldown) || 1);
      var cost = weapon.cost || {};
      var ammoCount = 0;
      var ammoAvailable = true;
      Object.keys(cost).forEach(function(key) {
        var have = Number(stores[key]) || 0;
        ammoCount += have;
        if (have < Number(cost[key] || 0)) ammoAvailable = false;
      });
      var inventory = Number(stores[name]) || 0;
      var expectedDamage = damage * (window.World.getHitChance ? World.getHitChance() : 0.8);
      var score = expectedDamage / cooldown;
      if (weapon.damage === 'stun') score = 2.2 + (name === 'disruptor' ? 1.1 : 0);
      if (name === 'grenade') score -= 0.65; // high burst, expensive consumable
      if (name === 'rifle') score += (Number(stores.bullets) || 0) >= 8 ? 0.5 : 0;
      if (name === 'laser rifle' || name === 'plasma rifle') score += (Number(stores['energy cell']) || 0) >= 8 ? 0.7 : -0.25;
      if (name === 'fists' && window.$SM.hasPerk && $SM.hasPerk('unarmed master')) score += 1.2;
      var craft = (window.Room && Room.Craftables && Room.Craftables[name]) ||
        (window.Fabricator && Fabricator.Craftables && Fabricator.Craftables[name]);
      var cost = craft && typeof craft.cost === 'function' ? craft.cost() : {};
      var missing = 0, missingRare = 0;
      Object.keys(cost || {}).forEach(function(key) {
        var gap = Math.max(0, (Number(cost[key]) || 0) - (Number(stores[key]) || 0));
        missing += gap;
        var rarity = ({'alien alloy':8, steel:4, iron:2.5, sulphur:2, coal:1.5, leather:1.5, teeth:1.3, scales:1.3, wood:0.2, fur:0.25})[key];
        missingRare += gap * (rarity || 1);
      });
      var unlocked = !craft || !craft.blueprintRequired ||
        Boolean($SM && $SM.get && $SM.get("character.blueprints['" + name + "']"));
      var canCraft = Boolean(craft && unlocked && missing === 0);
      // Existing weapons win over an aspirational weapon unless the upgrade is
      // meaningfully stronger and the cost can be paid without crippling supplies.
      if (inventory > 0 && ammoAvailable) score += 1.5;
      if (inventory <= 0 && canCraft) score += 0.9;
      if (!ammoAvailable) score -= 1.7;
      if (!unlocked) score -= 2.5;
      score -= missingRare * 0.008;
      candidates.push({name:name, weapon:weapon, score:score, inventory:inventory,
        ammoAvailable:ammoAvailable, canCraft:canCraft, missing:missing,
        missingRare:missingRare, cost:cost || {}, craft:craft || null});
    });
    candidates.sort(function(a,b) { return b.score - a.score; });
    return candidates.length ? { best:candidates[0], candidates:candidates } : null;
  }

  function combatMaterialUrgency(resource) {
    var plan = combatWeaponPlan();
    if (!plan || !plan.candidates.length) return 0;
    var stores = combatInventory();
    var baseline = 0;
    plan.candidates.forEach(function(candidate) {
      if (candidate.inventory > 0 && candidate.ammoAvailable) baseline = Math.max(baseline, candidate.score);
    });
    var bonus = 0;
    plan.candidates.forEach(function(candidate) {
      if (!candidate.craft || candidate.inventory > 0 || !candidate.missing) return;
      // Only buy materials for a weapon that improves on what can be used now.
      if (candidate.score < baseline + 0.65) return;
      var gap = Math.max(0, (Number(candidate.cost[resource]) || 0) - (Number(stores[resource]) || 0));
      if (gap <= 0) return;
      var improvement = candidate.score - baseline;
      bonus = Math.max(bonus, Math.min(36, improvement * 8 + Math.min(12, gap * 0.12)));
    });
    // Replenish ammunition for the best weapon that is actually owned and usable.
    var owned = plan.candidates.filter(function(candidate) {
      return candidate.inventory > 0 && candidate.ammoAvailable && candidate.weapon &&
        Object.keys(candidate.weapon.cost || {}).length > 0;
    }).sort(function(a,b) { return b.score - a.score; })[0];
    var ammoCost = owned && owned.weapon ? (owned.weapon.cost || {}) : {};
    if (owned && Object.prototype.hasOwnProperty.call(ammoCost, resource)) {
      var have = Number(stores[resource]) || 0;
      if (have < 8) bonus = Math.max(bonus, 16 + (8 - have) * 2);
    }
    // Some strong weapons are purchased directly at the trading post instead
    // of crafted. Evaluate those purchases as weapon candidates too.
    if (window.Room && Room.TradeGoods && Room.TradeGoods[resource] &&
        Room.TradeGoods[resource].type === 'weapon' && !(Number(stores[resource]) > 0) &&
        window.World && World.Weapons && World.Weapons[resource]) {
      var directWeapon = World.Weapons[resource];
      var directScore = directWeapon.damage === 'stun' ? 2.8 :
        (Math.max(0, Number(directWeapon.damage) || 0) *
          (window.World.getHitChance ? World.getHitChance() : 0.8) /
          Math.max(0.5, Number(directWeapon.cooldown) || 1));
      if (directScore > baseline + 0.5) bonus = Math.max(bonus, Math.min(34, 10 + (directScore - baseline) * 8));
    }
    return bonus;
  }

  function beginCombatLearning(event, enemy, context) {
    if (combatEpisode && combatEpisode.event === event && combatEpisode.enemy === enemy) return;
    // A replacement enemy or a new event means the previous enemy was defeated,
    // unless the game has already marked the expedition as a death.
    if (combatEpisode) finishCombatLearning(!(window.World && World.dead));
    combatEpisode = { event: event, enemy: enemy, context: context, actions: [], startedAt: Date.now() };
    combatEndCandidateAt = 0;
    loadCombatPolicy(context, true);
  }

  function recordCombatChoice(el, context) {
    if (!combatEpisode) return;
    var action = norm(el.id).replace(/[^a-z0-9_-]/g, '').slice(0, 48);
    if (!action) action = 'unknown';
    var actionContext = context || combatEpisode.context;
    combatEpisode.actions.push({ action: action, context: actionContext });
    if (combatEpisode.actions.length > 40) combatEpisode.actions.shift();
    sendAIEventBatch([{ run_id: window.__adrLiveCombatRunId || null, event_type: 'combat_choice',
      context: actionContext, action: action, reward: 0,
      payload: { source: 'live_combat', event: 'action_selected', enemy: combatEpisode.enemy && (combatEpisode.enemy.name || combatEpisode.enemy.id) || null } }]).catch(function() {});
    loadCombatPolicy(actionContext);
  }

  function finishCombatLearning(won) {
    if (!combatEpisode) return;
    var episode = combatEpisode;
    combatEpisode = null;
    combatEndCandidateAt = 0;
    if (!episode.actions.length) return;
    // Later choices receive more credit/blame because they are closest to the
    // outcome. This is a lightweight online reinforcement-learning signal.
    var actions = episode.actions.map(function (entry, index, all) {
      var recency = (index + 1) / all.length;
      return {
        action: typeof entry === 'string' ? entry : entry.action,
        context: typeof entry === 'string' ? episode.context : (entry.context || episode.context),
        reward: won ? (0.35 + 0.65 * recency) : -(0.35 + 0.65 * recency)
      };
    });
    var queue = [];
    try { queue = JSON.parse(localStorage.getItem('adrCombatAILearningQueue') || '[]'); } catch (e) {}
    queue.push({ context: episode.context, won: won, actions: actions });
    try { localStorage.setItem('adrCombatAILearningQueue', JSON.stringify(queue.slice(-20))); } catch (e) {}
    var telemetry = actions.map(function(item) {
      return { run_id: window.__adrLiveCombatRunId || null, event_type: 'action_result',
        context: item.context || episode.context, action: item.action, reward: item.reward,
        payload: { source: 'live_combat', won: won, reward: item.reward, episode_context: episode.context } };
    });
    telemetry.push({ run_id: window.__adrLiveCombatRunId || null, event_type: 'combat_episode_finished',
      context: episode.context, action: null, reward: won ? 1 : -1,
      payload: { source: 'live_combat', won: won, action_count: actions.length } });
    sendAIEventBatch(telemetry).catch(function() {});
    flushCombatLearningQueue();
  }

  function flushCombatLearningQueue() {
    if (learningFlushInProgress) return;
    var queue = [];
    try { queue = JSON.parse(localStorage.getItem('adrCombatAILearningQueue') || '[]'); } catch (e) {}
    if (!queue.length || !navigator.onLine) return;
    learningFlushInProgress = true;
    var batch = queue[0];
    var index = 0;
    function sendNext() {
      if (index >= batch.actions.length) {
        queue.shift();
        try { localStorage.setItem('adrCombatAILearningQueue', JSON.stringify(queue)); } catch (e) {}
        learningFlushInProgress = false;
        invalidateCombatPolicy();
        if (queue.length) flushCombatLearningQueue();
        return;
      }
      var item = batch.actions[index++];
      requestCombatAI({ op: 'outcome', context: item.context || batch.context, won: item.reward > 0, actions: [item.action], reward: item.reward })
        .then(function () { sendNext(); })
        .catch(function () {
          index--;
          learningFlushInProgress = false;
          // Keep the batch queued, but avoid hammering a failed endpoint every
          // autoplay tick. The next successful policy/outcome interaction can
          // retry it.
        });
    }
    sendNext();
  }

  function monitorCombatLearning() {
    if (!combatEpisode) return;
    if (window.World && World.dead) {
      finishCombatLearning(false);
      return;
    }
    var event = window.Events && Events.activeEvent && Events.activeEvent();
    var enemy = event && event.eventPanel && event.eventPanel.length
      ? event.eventPanel[0].querySelector('#enemy') : null;
    if (enemy && visible(enemy)) {
      combatEndCandidateAt = 0;
      return;
    }
    if (!combatEndCandidateAt) combatEndCandidateAt = Date.now();
    // Allow scene transitions to replace the enemy before deciding it was defeated.
    if (Date.now() - combatEndCandidateAt >= 1400) {
      if (!event || !event.eventPanel || !visible(event.eventPanel[0])) finishCombatLearning(true);
      else if (!event.eventPanel[0].querySelector('#enemy')) finishCombatLearning(true);
    }
  }

  function eventChoiceScore(el, info) {
    var label = norm((el.innerText || el.textContent) + ' ' + el.id);
    var value = 0;

    // Favor loot, worthwhile purchases, and useful progression; avoid paying
    // scarce materials for choices with no meaningful reward.
    if (/take all|take everything|collect all|loot_takeeverything/.test(label)) value += 180;
    if (/leave|return|escape|retreat|run away/.test(label)) value -= 15;
    if (/fight|attack|kill|hunt/.test(label)) value += 12;
    if (/help|save|rescue|free|protect/.test(label)) value += 28;
    if (/buy|purchase|trade/.test(label)) value += 8;
    if (/steal|rob|threaten|insult|betray/.test(label)) value -= 24;
    if (/ignore|refuse|decline|turn him away/.test(label)) value -= 12;
    if (/spare|help|rescue|give medicine|heal|cure|repair|fix/.test(label)) value += 16;
    if (/hang him|execute/.test(label)) value -= 16;
    if (/continue|next|leave cave|go home/.test(label)) value += 5;

    function quantity(key) {
      if (window.Events && typeof Events.getQuantity === 'function') {
        return Number(Events.getQuantity(key)) || 0;
      }
      if (window.Engine && Engine.activeModule === window.World &&
          window.Path && Path.outfit) {
        return Number(Path.outfit[key]) || 0;
      }
      var stores = window.$SM && $SM.get ? ($SM.get('stores') || {}) : {};
      return Number(stores[key]) || 0;
    }

    if (info) {
      var reward = info.reward || {};
      Object.keys(reward).forEach(function (key) {
        var n = Number(reward[key]) || 0;
        if (!n) return;
        var have = quantity(key);
        var perUnit = 1;
        switch (key) {
          case 'compass': perUnit = have > 0 ? -150 : 260; break;
          case 'alien alloy': perUnit = 170; break;
          case 'steel': perUnit = have < 20 ? 5 : 1; break;
          case 'iron': perUnit = have < 30 ? 4 : 1; break;
          case 'coal': perUnit = have < 30 ? 3.5 : 1; break;
          case 'scales': perUnit = have < 20 ? 42 : (have < 50 ? 20 : 4); break;
          case 'teeth': perUnit = have < 15 ? 42 : (have < 40 ? 20 : 4); break;
          case 'medicine': perUnit = have < 5 ? 16 : (have < 12 ? 8 : 1); break;
          case 'bullets': perUnit = have < 20 ? 8 : 2; break;
          case 'energy cell': perUnit = have < 8 ? 18 : 4; break;
          case 'bait':
            var buildings = window.$SM && $SM.get ? ($SM.get('game.buildings') || {}) : {};
            perUnit = (Number(buildings.trap) || 0) > have ? 20 : -8;
            break;
          case 'fur': perUnit = have < 300 ? 0.16 : 0.07; break;
          case 'wood': perUnit = 0.035; break;
          case 'meat': perUnit = 0.02; break;
          case 'cured meat': perUnit = 0.2; break;
          case 'water': perUnit = 0.15; break;
          default: perUnit = 1.5; break;
        }
        value += n * perUnit;
      });

      // When a trade offers a weapon ingredient, value it by the best
      // upgrade it unlocks, not by a generic resource price alone.
      Object.keys(reward).forEach(function(key) {
        value += combatMaterialUrgency(key);
      });
      var cost = info.cost || {};
      Object.keys(cost).forEach(function (key) {
        var n = Number(cost[key]) || 0;
        if (!n) return;
        var have = quantity(key);
        if (have < n) {
          value -= 1000;
          return;
        }

        // Cost value is measured in score units, not multiplied by an arbitrary
        // large penalty. Fur/wood are renewable; expedition supplies and rare
        // metals are much more expensive to give up.
        var unitCost = 0.08;
        switch (key) {
          case 'fur': unitCost = 0.06; break;
          case 'wood': unitCost = 0.025; break;
          case 'meat': unitCost = 0.02; break;
          case 'cured meat': unitCost = 0.35; break;
          case 'scales': unitCost = 0.45; break;
          case 'teeth': unitCost = 0.55; break;
          case 'iron': unitCost = 0.55; break;
          case 'coal': unitCost = 0.4; break;
          case 'steel': unitCost = 0.9; break;
          case 'medicine': unitCost = 12; break;
          case 'bullets': unitCost = 0.35; break;
          case 'energy cell': unitCost = 3; break;
          case 'alien alloy': unitCost = 20; break;
          case 'water': unitCost = 0.2; break;
        }
        var remaining = have - n;
        var scarcity = remaining <= n ? 1.8 : (remaining <= n * 2 ? 1.25 : 1);
        value -= Math.min(180, n * unitCost * scarcity);
      });

      if (info.nextScene && info.nextScene !== 'end') value += 4;
      if (info.link) value -= 100;
    }
    return value;
  }


  function handleEvent() {
    if (!window.Events || typeof Events.activeEvent !== 'function') return false;
    var event = Events.activeEvent();
    if (!event || !event.eventPanel || !visible(event.eventPanel[0])) return false;

    var panel = event.eventPanel[0];
    var enemy = panel.querySelector('#enemy');
    var lootAll = panel.querySelector('#loot_takeEverything');
    if (lootAll && ready(lootAll)) return clickReady(lootAll);

    // Combat priority is state-aware: preserve rare healing supplies, prefer
    // attacks by expected useful damage per cooldown, and use stun against a
    // dangerous enemy rather than treating the string "stun" as numeric damage.
    if (enemy && visible(enemy)) {
      var player = panel.querySelector('#wanderer');
      var enemyHp = Number(window.jQuery ? jQuery(enemy).data('hp') : enemy.getAttribute('data-hp')) || 0;
      var enemyMaxHp = Number(window.jQuery ? jQuery(enemy).data('maxHp') : enemy.getAttribute('data-max-hp')) || enemyHp;
      var hp = Number(player && (window.jQuery ? jQuery(player).data('hp') : player.getAttribute('data-hp'))) || 0;
      var maxHp = window.World && typeof World.getMaxHealth === 'function' ? World.getMaxHealth() : hp;
      var hpRatio = maxHp > 0 ? hp / maxHp : 1;
      var enemyStatus = window.jQuery ? jQuery(enemy).data('status') : enemy.getAttribute('data-status');
      var enemyStunned = enemyStatus === 'stunned' || Boolean(enemy.classList && enemy.classList.contains('stunned')) ||
        Boolean(window.jQuery ? jQuery(enemy).data('stunned') : enemy.getAttribute('data-stunned') === 'true');
      var playerStatusForContext = window.jQuery ? jQuery(player).data('status') : player && player.getAttribute('data-status');
      var aiContext = combatContext(hp, maxHp, playerStatusForContext, enemyStunned);
      beginCombatLearning(event, enemy, aiContext);
      var scene = window.Events && Events.activeEvent() && Events.activeEvent().scenes
        ? Events.activeEvent().scenes[Events.activeScene] : null;
      var enemyDamage = Math.max(0, Number(scene && scene.damage) || 0);
      var enemyDelay = Math.max(0.5, Number(scene && scene.attackDelay) || 2);
      var threat = enemyDamage / enemyDelay;

      function healAmount(id) {
        if (id === 'eat') return window.World && typeof World.meatHeal === 'function' ? World.meatHeal() : 4;
        if (id === 'meds') return window.World && typeof World.medsHeal === 'function' ? World.medsHeal() : 10;
        if (id === 'hypo') return window.World && typeof World.hypoHeal === 'function' ? World.hypoHeal() : 25;
        return 0;
      }
      function healingCost(id) {
        // Meat is replenishable; medicine and especially hypos are much rarer.
        if (id === 'eat') return 1;
        if (id === 'meds') return 4;
        if (id === 'hypo') return 9;
        return 99;
      }

      var healButtons = Array.prototype.slice.call(panel.querySelectorAll(
        '#healButtons .button, #buttons #eat, #buttons #meds, #buttons #hypo'
      )).filter(ready).filter(function(el) {
        return hp < maxHp && healAmount(el.id) > 0;
      });
      var incomingRisk = threat >= 5 || hpRatio <= 0.25;
      var healThreshold = threat >= 7 ? 0.58 : threat >= 4 ? 0.42 : 0.30;
      if (hpRatio <= healThreshold || incomingRisk) {
        healButtons.sort(function(a, b) {
          var missing = maxHp - hp;
          var aHeal = Math.min(missing, healAmount(a.id));
          var bHeal = Math.min(missing, healAmount(b.id));
          // Choose the lowest-value resource that provides enough healing to
          // survive at least one likely hit; otherwise maximize useful healing.
          var required = Math.min(missing, Math.max(enemyDamage + 1, maxHp * 0.22));
          var aEnough = aHeal >= required, bEnough = bHeal >= required;
          if (aEnough !== bEnough) return aEnough ? -1 : 1;
          var aWaste = Math.max(0, healAmount(a.id) - missing);
          var bWaste = Math.max(0, healAmount(b.id) - missing);
          var aValue = healingCost(a.id) + aWaste * 0.2 - learnedActionBonus(aiContext, norm(a.id).replace(/[^a-z0-9_-]/g, '').slice(0, 48));
          var bValue = healingCost(b.id) + bWaste * 0.2 - learnedActionBonus(aiContext, norm(b.id).replace(/[^a-z0-9_-]/g, '').slice(0, 48));
          if (aEnough && bEnough) return aValue - bValue;
          return bHeal - aHeal || aValue - bValue;
        });
        if (healButtons.length) {
          for (var healIndex = 0; healIndex < healButtons.length; healIndex++) {
            if (!ready(healButtons[healIndex])) continue;
            recordCombatChoice(healButtons[healIndex], aiContext);
            if (clickReady(healButtons[healIndex])) return true;
          }
        }
      }

      // A shield prevents the next incoming hit. Use it against a high-damage
      // enemy when available, but do not waste turns against harmless foes.
      var shield = panel.querySelector('#buttons #shld');
      if (shield && ready(shield) && threat >= 5 && hpRatio <= 0.8 &&
          (window.jQuery ? jQuery(player).data('status') : player && player.getAttribute('data-status')) !== 'shield' &&
          learnedActionBonus(aiContext, norm(shield.id).replace(/[^a-z0-9_-]/g, '').slice(0, 48)) > -2.5) {
        recordCombatChoice(shield, aiContext);
        return clickReady(shield);
      }

      var attacks = Array.prototype.slice.call(panel.querySelectorAll(
        '#attackButtons .button, .weaponButton, #attack_fists, #buttons #attack-disruptor, #buttons #attack-bolas'
      )).filter(ready);
      attacks.sort(function(a, b) {
        function attackValue(el) {
          var name = el.id.replace(/^attack[_-]/, '').replace(/-/g, ' ');
          var weapon = window.World && World.Weapons && World.Weapons[name];
          if (!weapon) return el.id === 'attack_fists' ? 0.5 : -100;

          var damage = weapon.damage;
          var cooldown = Math.max(0.5, Number(weapon.cooldown) || 1);
          var cost = weapon.cost || {};
          var outfit = window.Path && Path.outfit ? Path.outfit : {};
          var playerStatus = window.jQuery ? jQuery(player).data('status') : player.getAttribute('data-status');
          var score = 0;

          if (damage === 'stun') {
            // Stun is control, not damage: valuable against a live dangerous
            // enemy, nearly worthless if it is already stunned or almost dead.
            score = enemyStunned || enemyHp <= 0 ? -5 : (threat * 2.8 + enemyDamage * 0.65);
            if (enemyStatus === 'shield') score += 12;
            if (enemyMaxHp > 0 && enemyHp / enemyMaxHp < 0.18) score -= 8;
          } else {
            var baseDamage = Math.max(0, Number(damage) || 0);
            if (weapon.type === 'unarmed' && window.$SM && $SM.hasPerk) {
              if ($SM.hasPerk('boxer')) baseDamage *= 2;
              if ($SM.hasPerk('martial artist')) baseDamage *= 3;
              if ($SM.hasPerk('unarmed master')) baseDamage *= 2;
            }
            if (weapon.type === 'melee' && window.$SM && $SM.hasPerk && $SM.hasPerk('barbarian')) {
              baseDamage = Math.floor(baseDamage * 1.5);
            }
            var hitChance = window.World && typeof World.getHitChance === 'function' ? World.getHitChance() : 0.8;
            var usefulDamage = Math.min(enemyHp || baseDamage, baseDamage) * hitChance;
            // Killing this enemy immediately is worth more than conserving ammo.
            var killBonus = baseDamage >= enemyHp && enemyHp > 0 ? 5 : 0;
            score = usefulDamage / cooldown + killBonus;

            if (playerStatus === 'boost' || playerStatus === 'energised' || playerStatus === 'venomous') {
              score *= 1.65;
            }
            if (enemyStatus === 'shield') score -= usefulDamage / cooldown * 2 + 3;
          }

          Object.keys(cost).forEach(function(resource) {
            var price = Math.max(0, Number(cost[resource]) || 0);
            var have = Math.max(0, Number(outfit[resource]) || 0);
            var remaining = have - price;
            var penalty = 0;
            if (remaining <= 0) penalty = 1.8;
            else if (remaining <= price * 2) penalty = 0.9;
            else if (remaining <= price * 4) penalty = 0.35;
            // Spending the last scarce consumable should require a meaningful
            // tactical advantage; it should not make an otherwise strong weapon
            // unusable when that attack can end a dangerous fight.
            score -= penalty;
          });

          if (name === 'fists' && window.$SM && $SM.hasPerk && $SM.hasPerk('unarmed master')) {
            score += 0.8;
          }
          score += learnedActionBonus(aiContext, norm(el.id).replace(/[^a-z0-9_-]/g, '').slice(0, 48));
          return score;
        }
        return attackValue(b) - attackValue(a);
      });
      if (attacks.length) {
        // Ranked fallback: if the top option became unavailable between scoring
        // and execution, attempt the next best action rather than wasting a tick.
        for (var attackIndex = 0; attackIndex < attacks.length; attackIndex++) {
          if (!ready(attacks[attackIndex])) continue;
          recordCombatChoice(attacks[attackIndex], aiContext);
          if (clickReady(attacks[attackIndex])) return true;
        }
      }
      return true;
    }

    // Story/event branch: evaluate the actual event choices, including their
    // declared costs and rewards, instead of clicking unrelated room controls.
    var buttons = Array.prototype.slice.call(panel.querySelectorAll('#exitButtons .button, #buttons > .button, #buttons .button'))
      .filter(ready)
      .filter(function(el) { return !el.closest('#healButtons') && !el.closest('#attackButtons'); });
    if (!buttons.length) return true;
    var scene = event.scenes && event.scenes[Events.activeScene];
    var definitions = scene && scene.buttons || {};
    buttons.sort(function(a,b) {
      return eventChoiceScore(b, definitions[b.id]) - eventChoiceScore(a, definitions[a.id]);
    });
    return clickReady(buttons[0]);
  }


  function advanceModule() {
    // Never immediately override the player's own location choice. Autoplay
    // waits after manual tab navigation, then only advances if the current
    // location still has no useful action.
    if (Date.now() - lastManualNavigation < 10000) return false;
    if (!window.Engine || !Engine.activeModule || Engine.activeModule === window.Space) return false;
    var route = [window.Room, window.Outside, window.Path, window.Fabricator, window.Ship];
    var current = route.indexOf(Engine.activeModule);
    if (current < 0) current = -1;
    for (var step = 1; step <= route.length; step++) {
      var module = route[(current + step + route.length) % route.length];
      if (!module || module === Engine.activeModule || !module.tab || !module.panel) continue;
      var tab = module.tab.jquery ? module.tab[0] : module.tab;
      var panel = module.panel.jquery ? module.panel[0] : module.panel;
      if (!tab || !tab.isConnected || !panel || !panel.isConnected) continue;
      if (tab.classList.contains('disabled') || tab.getAttribute('aria-disabled') === 'true') continue;
      if (typeof Engine.travelTo === 'function') {
        Engine.travelTo(module);
        lastAction = Date.now();
        return true;
      }
    }
    return false;
  }

  function manageWorkers() {
    if (!window.Engine || Engine.activeModule !== window.Outside ||
        !window.Outside || !window.$SM || !Outside._INCOME) return false;
    var population = Number($SM.get('game.population')) || 0;
    var workers = $SM.get('game.workers') || {};
    var free = typeof Outside.getNumGatherers === 'function' ? Outside.getNumGatherers() : 0;
    if (free <= 2) return false;
    var stores = $SM.get('stores') || {};
    var plans = [
      { key: 'hunter', count: population >= 4 ? 1 : 0 },
      { key: 'trapper', count: population >= 7 && (Number(stores.meat) || 0) >= 8 ? 1 : 0 },
      { key: 'tanner', count: population >= 8 && (Number(stores.fur) || 0) >= 8 ? 1 : 0 },
      { key: 'charcutier', count: population >= 9 && (Number(stores.meat) || 0) >= 12 && (Number(stores.wood) || 0) >= 12 ? 1 : 0 },
      { key: 'iron miner', count: population >= 10 && (Number(stores['cured meat']) || 0) >= 8 ? 1 : 0 },
      { key: 'coal miner', count: population >= 12 && (Number(stores['cured meat']) || 0) >= 12 ? 1 : 0 },
      { key: 'sulphur miner', count: population >= 14 && (Number(stores['cured meat']) || 0) >= 16 ? 1 : 0 },
      { key: 'steelworker', count: population >= 16 && (Number(stores.iron) || 0) >= 4 && (Number(stores.coal) || 0) >= 4 ? 1 : 0 },
      { key: 'armourer', count: population >= 18 && (Number(stores.steel) || 0) >= 4 && (Number(stores.sulphur) || 0) >= 4 ? 1 : 0 }
    ];
    for (var i = 0; i < plans.length; i++) {
      var plan = plans[i];
      if (plan.count > 0 && (Number(workers[plan.key]) || 0) < plan.count) {
        var row = document.getElementById('workers_row_' + plan.key.replace(/ /g, '-'));
        var up = row && row.querySelector('.upBtn:not(.disabled)');
        if (up && clickReady(up)) return true;
      }
    }
    return false;
  }

  // Journey automation. It runs only on the Path/World screens, preserving
  // manual control over the game's other location tabs.
  var activeJourney = null;
  var lastObservedModule = null;
  var journeyDirections = [
    { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 1 }
  ];

  function storeCount(name) {
    if (!window.$SM || typeof $SM.get !== 'function') return 0;
    return Math.max(0, Number($SM.get('stores["' + name + '"]', true)) || 0);
  }

  function journeyStores() {
    return window.$SM && $SM.get ? ($SM.get('stores') || {}) : {};
  }

  function tileTextAt(x, y) {
    if (!window.World || !World.state || !World.state.map ||
        !World.state.map[x] || typeof World.state.map[x][y] === 'undefined') return '';
    return String(World.state.map[x][y] || '');
  }

  function baseTileAt(x, y) {
    return tileTextAt(x, y).charAt(0);
  }

  function journeyKey(x, y) {
    return x + ',' + y;
  }

  function visitedJourneyLandmarks() {
    return window.$SM && $SM.get ? ($SM.get('config.autoplayVisitedLandmarks') || {}) : {};
  }

  function isJourneyLandmarkVisited(x, y) {
    return Boolean(visitedJourneyLandmarks()[journeyKey(x, y)]);
  }

  function markCurrentJourneyLandmark() {
    if (!window.World || !World.state || !World.curPos || !window.$SM) return;
    var x = World.curPos[0], y = World.curPos[1];
    var tileText = tileTextAt(x, y), tile = tileText.charAt(0);
    if (!tile || tileText.indexOf('!') >= 0 || tile === World.TILE.VILLAGE ||
        !World.LANDMARKS || !World.LANDMARKS[tile]) return;

    var visited = visitedJourneyLandmarks(), key = journeyKey(x, y);
    if (visited[key]) return;
    var next = {};
    Object.keys(visited).forEach(function (oldKey) { next[oldKey] = visited[oldKey]; });
    next[key] = true;
    $SM.set('config.autoplayVisitedLandmarks', next, false);
  }

  function journeyHazardLimit() {
    // Match the game's actual distance checks: only iron/steel armour affect
    // the wilderness danger thresholds in World.checkDanger().
    if (storeCount('s armour') > 0) return 29;
    if (storeCount('i armour') > 0) return 17;
    return 7;
  }

  function journeyRangeFromWater() {
    var water = window.World && typeof World.getMaxWater === 'function'
      ? Math.max(0, Number(World.getMaxWater()) || 0) : 10;
    return Math.max(1, Math.min(journeyHazardLimit(), Math.floor(Math.max(0, water - 2) / 2) || 1));
  }

  function outfitWeight(items) {
    var sum = 0;
    Object.keys(items || {}).forEach(function (name) {
      var count = Number(items[name]) || 0;
      if (count > 0 && window.Path && typeof Path.getWeight === 'function') {
        sum += count * Path.getWeight(name);
      }
    });
    return sum;
  }

  function managedJourneyItems() {
    var names = [
      'cured meat', 'medicine', 'bullets', 'energy cell', 'grenade', 'bolas',
      'laser rifle', 'bayonet', 'charm', 'torch', 'glowstone', 'hypo', 'stim',
      'kinetic armour', 'alien alloy'
    ];
    if (window.World && World.Weapons) {
      Object.keys(World.Weapons).forEach(function (name) {
        if (names.indexOf(name) < 0) names.push(name);
      });
    }
    if (window.Room && Room.Craftables) {
      Object.keys(Room.Craftables).forEach(function (name) {
        var item = Room.Craftables[name];
        if (item && item.type !== 'building' && names.indexOf(name) < 0) names.push(name);
      });
    }
    if (window.Fabricator && Fabricator.Craftables) {
      Object.keys(Fabricator.Craftables).forEach(function (name) {
        if (names.indexOf(name) < 0) names.push(name);
      });
    }
    if (window.Room && Room.MiscItems) {
      Object.keys(Room.MiscItems).forEach(function (name) {
        if (names.indexOf(name) < 0) names.push(name);
      });
    }
    return names;
  }

  function chooseJourneyWeapon(capacity) {
    if (!window.World || !World.Weapons || !window.Path) return null;
    var stores = journeyStores(), options = [];
    Object.keys(World.Weapons).forEach(function (name) {
      var weapon = World.Weapons[name];
      if (!weapon || name === 'fists' || typeof weapon.damage !== 'number' ||
          weapon.damage <= 0 || (Number(stores[name]) || 0) < 1) return;
      var weight = Path.getWeight(name);
      if (weight >= capacity) return;

      var ammo = {}, ammoWeight = 0, canUse = true;
      Object.keys(weapon.cost || {}).forEach(function (resource) {
        var available = Math.floor(Number(stores[resource]) || 0);
        if (available < 1) {
          canUse = false;
          return;
        }
        var desired = Math.min(4, available);
        ammo[resource] = desired;
        ammoWeight += desired * Path.getWeight(resource);
      });
      if (!canUse || weight + ammoWeight >= capacity) return;

      var scoreValue = weapon.damage / Math.max(1, Number(weapon.cooldown) || 1);
      if (!Object.keys(weapon.cost || {}).length) scoreValue += 0.35;
      scoreValue -= weight * 0.04;
      scoreValue -= Object.keys(ammo).length * 0.1;
      options.push({ name: name, score: scoreValue, weight: weight, ammo: ammo });
    });
    options.sort(function (a, b) { return b.score - a.score; });
    return options.length ? options[0] : null;
  }

  function setJourneyOutfit(outfit) {
    Path.outfit = outfit;
    $SM.set('outfit', outfit, false);
    if (typeof Path.updateOutfitting === 'function') Path.updateOutfitting();
  }

  function prepareJourneySupplies() {
    if (!window.Path || !window.World || !window.$SM ||
        typeof Path.getCapacity !== 'function') return false;

    var stores = journeyStores();
    var capacity = Math.max(1, Number(Path.getCapacity()) || 10);
    var availableFood = Math.floor(Number(stores['cured meat']) || 0);
    if (availableFood < 1) return false;

    // Preserve unknown carried contents, but rebuild normal equipment counts
    // from the inventory actually available at home.
    var outfit = {};
    Object.keys(Path.outfit || {}).forEach(function (name) { outfit[name] = Path.outfit[name]; });
    managedJourneyItems().forEach(function (name) { outfit[name] = 0; });

    // Prefer the strongest loadout that fits with food and supplies.
    // The general journey selector remains the fallback when no combat plan
    // can be carried with a safe food reserve.
    var combatPlan = combatWeaponPlan();
    var preferred = combatPlan && combatPlan.best;
    var weapon = chooseJourneyWeapon(capacity);
    if (preferred && preferred.name !== 'fists' && preferred.inventory > 0 &&
        preferred.weapon && (preferred.ammoAvailable || !Object.keys(preferred.weapon.cost || {}).length)) {
      var preferredWeight = Path.getWeight(preferred.name);
      var preferredAmmo = {};
      var preferredAmmoWeight = 0;
      Object.keys(preferred.weapon.cost || {}).forEach(function(resource) {
        var available = Math.floor(Number(stores[resource]) || 0);
        var count = Math.min(8, available);
        if (count > 0) {
          preferredAmmo[resource] = count;
          preferredAmmoWeight += count * Path.getWeight(resource);
        }
      });
      if (preferredWeight + preferredAmmoWeight < capacity - 2) {
        weapon = {name:preferred.name, score:preferred.score, weight:preferredWeight, ammo:preferredAmmo};
      }
    }
    if (weapon) {
      if (Object.keys(weapon.ammo).some(function (name) { return name === weapon.name; })) {
        outfit[weapon.name] = Math.min(Number(stores[weapon.name]) || 0, weapon.ammo[weapon.name]);
      } else {
        outfit[weapon.name] = 1;
        Object.keys(weapon.ammo).forEach(function (name) {
          outfit[name] = Math.min(Number(stores[name]) || 0, weapon.ammo[name]);
        });
      }
    }

    var foodMoves = Math.max(1, Number(World.MOVES_PER_FOOD) || 2);
    if ($SM.hasPerk && $SM.hasPerk('slow metabolism')) foodMoves *= 2;
    var safeRange = journeyRangeFromWater();
    var foodTarget = Math.max(1, Math.ceil((safeRange * 2 - 1) / foodMoves));
    var roomForFood = Math.max(0, Math.floor(capacity - outfitWeight(outfit)));
    var food = Math.min(availableFood, foodTarget, roomForFood);

    if (food < 1) {
      // If the current weapon leaves no room for food, sacrifice it for the trip.
      managedJourneyItems().forEach(function (name) { outfit[name] = 0; });
      roomForFood = Math.max(0, Math.floor(capacity - outfitWeight(outfit)));
      food = Math.min(availableFood, roomForFood);
    }
    if (food < 1) return false;
    outfit['cured meat'] = food;

    function addOptional(name, wanted) {
      var available = Math.floor(Number(stores[name]) || 0);
      var existing = Number(outfit[name]) || 0;
      var room = capacity - outfitWeight(outfit);
      var spaceCount = Math.max(0, Math.floor(room / Path.getWeight(name)));
      var add = Math.min(Math.max(0, wanted - existing), Math.max(0, available - existing), spaceCount);
      if (add > 0) outfit[name] = existing + add;
    }

    // Add equipment for survival and landmarks only when space remains.
    addOptional('medicine', 1);
    addOptional('hypo', 1);
    addOptional('glowstone', 1);
    if (!(Number(outfit.glowstone) > 0)) addOptional('torch', 1);
    addOptional('charm', 1);
    addOptional('stim', 1);

    // Food remains the final priority; fill any leftover bag capacity with it.
    var spareRoom = Math.max(0, Math.floor(capacity - outfitWeight(outfit)));
    var spareFood = Math.min(Math.max(0, availableFood - food), spareRoom);
    if (spareFood > 0) outfit['cured meat'] += spareFood;

    if (outfitWeight(outfit) > capacity + 0.001 || !(Number(outfit['cured meat']) > 0)) return false;
    setJourneyOutfit(outfit);
    return true;
  }

  function journeyPositionIs(x, y) {
    return Boolean(window.World && World.curPos &&
      World.curPos[0] === x && World.curPos[1] === y);
  }

  function routeTileBlocked(x, y, start, target) {
    if ((x === start[0] && y === start[1]) || (x === target[0] && y === target[1])) return false;
    var text = tileTextAt(x, y), tile = text.charAt(0);
    if (!tile || text.indexOf('!') >= 0 || tile === World.TILE.OUTPOST) return false;
    return Boolean(World.LANDMARKS && World.LANDMARKS[tile] && isJourneyLandmarkVisited(x, y));
  }

  function buildJourneyRoute(targetX, targetY) {
    if (!window.World || !World.curPos || !World.state || !World.state.map) return [];
    var start = [World.curPos[0], World.curPos[1]];
    var target = [targetX, targetY];
    if (start[0] === targetX && start[1] === targetY) return [];

    var edge = World.RADIUS * 2;
    var queue = [start], parent = {};
    var startKey = journeyKey(start[0], start[1]);
    var targetKey = journeyKey(targetX, targetY);
    var found = false;
    parent[startKey] = null;
    var directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    for (var head = 0; head < queue.length; head++) {
      var position = queue[head];
      for (var i = 0; i < directions.length; i++) {
        var nx = position[0] + directions[i][0];
        var ny = position[1] + directions[i][1];
        if (nx < 0 || ny < 0 || nx > edge || ny > edge) continue;
        var key = journeyKey(nx, ny);
        if (Object.prototype.hasOwnProperty.call(parent, key)) continue;
        if (routeTileBlocked(nx, ny, start, target)) continue;
        parent[key] = journeyKey(position[0], position[1]);
        if (key === targetKey) {
          found = true;
          break;
        }
        queue.push([nx, ny]);
      }
      if (found) break;
    }
    if (!found) return [];

    var route = [], cursor = targetKey;
    while (cursor !== startKey) {
      var parts = cursor.split(',');
      route.push([Number(parts[0]), Number(parts[1])]);
      cursor = parent[cursor];
      if (cursor == null) return [];
    }
    route.reverse();
    return route;
  }

  function journeyLandmarkPriority(tile) {
    var rank = {};
    rank[World.TILE.SHIP] = 150;
    rank[World.TILE.IRON_MINE] = 125;
    rank[World.TILE.COAL_MINE] = 115;
    rank[World.TILE.SULPHUR_MINE] = 105;
    rank[World.TILE.CACHE] = 120;
    rank[World.TILE.BOREHOLE] = 95;
    rank[World.TILE.CAVE] = 85;
    rank[World.TILE.SWAMP] = 82;
    rank[World.TILE.BATTLEFIELD] = 80;
    rank[World.TILE.TOWN] = 75;
    rank[World.TILE.CITY] = 70;
    rank[World.TILE.HOUSE] = 72;
    rank[World.TILE.OUTPOST] = 45;
    rank[World.TILE.EXECUTIONER] = -20;
    return rank[tile] || 0;
  }

  function chooseJourneyTarget(range) {
    var center = World.VILLAGE_POS || [World.RADIUS, World.RADIUS];
    var map = World.state && World.state.map;
    var mask = World.state && World.state.mask;
    var targets = [];

    if (map && mask) {
      for (var x = 0; x < map.length; x++) {
        for (var y = 0; y < (map[x] || []).length; y++) {
          if (!mask[x] || !mask[x][y]) continue;
          var text = String(map[x][y] || '');
          var tile = text.charAt(0);
          if (!tile || tile === World.TILE.VILLAGE || text.indexOf('!') >= 0) continue;
          if (!World.LANDMARKS || !World.LANDMARKS[tile] || isJourneyLandmarkVisited(x, y)) continue;
          if (tile === World.TILE.EXECUTIONER && storeCount('s armour') < 1) continue;
          if (tile === World.TILE.OUTPOST && World.outpostUsed && World.outpostUsed(x, y)) continue;
          var distance = Math.abs(x - center[0]) + Math.abs(y - center[1]);
          if (distance < 1 || distance > range) continue;
          targets.push({
            x: x, y: y, tile: tile,
            score: journeyLandmarkPriority(tile) - distance * 3
          });
        }
      }
    }

    targets.sort(function (a, b) { return b.score - a.score; });
    for (var i = 0; i < targets.length; i++) {
      var path = buildJourneyRoute(targets[i].x, targets[i].y);
      if (path.length > 0 && path.length <= range + 2) {
        return { x: targets[i].x, y: targets[i].y, route: path };
      }
    }

    // No reachable landmark is in view: move toward the least-explored sector.
    var options = journeyDirections.slice();
    var ship = window.World.ship && World.ship.length ? World.ship[0] : null;
    function explorationScore(direction) {
      var unseen = 0, seen = 0;
      var perpendicular = direction.x !== 0 ? { x: 0, y: 1 } : { x: 1, y: 0 };
      for (var d = 1; d <= range; d++) {
        for (var side = -2; side <= 2; side++) {
          var sx = center[0] + direction.x * d + perpendicular.x * side;
          var sy = center[1] + direction.y * d + perpendicular.y * side;
          if (sx < 0 || sy < 0 || !mask[sx] || sy >= mask[sx].length) continue;
          if (mask[sx][sy]) seen++;
          else unseen++;
        }
      }
      var shipBias = ship ? direction.x * Math.sign(ship.x) + direction.y * Math.sign(ship.y) : 0;
      return unseen - seen * 0.15 + shipBias * 0.01;
    }
    options.sort(function (a, b) { return explorationScore(b) - explorationScore(a); });
    var direction = options[0] || journeyDirections[0];
    return {
      x: Math.max(0, Math.min(World.RADIUS * 2, center[0] + direction.x * range)),
      y: Math.max(0, Math.min(World.RADIUS * 2, center[1] + direction.y * range)),
      route: []
    };
  }

  function initializeJourney() {
    if (!window.World || !World.state || !World.curPos || !window.Path) return null;
    var range = journeyRangeFromWater();
    var target = chooseJourneyTarget(range);
    if (!target) return null;
    if (target.x === World.curPos[0] && target.y === World.curPos[1]) return null;
    var route = target.route && target.route.length
      ? target.route : buildJourneyRoute(target.x, target.y);
    if (!route.length) return null;
    return {
      target: [target.x, target.y],
      maxDistance: range,
      returning: false,
      route: route
    };
  }

  function beginJourneyReturn() {
    if (!activeJourney || activeJourney.returning || !window.World || !World.curPos) return;
    activeJourney.returning = true;
    var home = World.VILLAGE_POS || [World.RADIUS, World.RADIUS];
    activeJourney.target = [home[0], home[1]];
    activeJourney.route = buildJourneyRoute(home[0], home[1]);
  }

  function moveJourneyStep() {
    if (!activeJourney || !window.World || !World.curPos || !World.state) return false;
    var target = activeJourney.target;

    if (journeyPositionIs(target[0], target[1])) {
      if (!activeJourney.returning) beginJourneyReturn();
      else {
        var completedRun = window.__adrLiveJourneyRunId || null;
        if (completedRun) {
          window.__adrLiveJourneyRunId = null;
          finishAIRun(completedRun, 'completed', { source: 'live_journey', returned_home: true,
            final_position: World.curPos, inventory: combatInventory(), simulation: false }).catch(function() {});
          sendAIEventBatch([{run_id:completedRun,event_type:'journey_finished',context:'default',action:'return_home',reward:1,
            payload:{source:'live_journey',returned_home:true,position:World.curPos,inventory:combatInventory(),simulation:false}}]).catch(function(){});
        }
        activeJourney = null;
        return false;
      }
    }
    if (!activeJourney.route || !activeJourney.route.length) {
      activeJourney.route = buildJourneyRoute(activeJourney.target[0], activeJourney.target[1]);
    }
    if (!activeJourney.route.length) {
      if (!activeJourney.returning) beginJourneyReturn();
      return true;
    }

    var next = activeJourney.route.shift();
    var dx = next[0] - World.curPos[0];
    var dy = next[1] - World.curPos[1];
    if (Math.abs(dx) + Math.abs(dy) !== 1) {
      activeJourney.route = buildJourneyRoute(activeJourney.target[0], activeJourney.target[1]);
      return true;
    }
    var previous = [World.curPos[0], World.curPos[1]];
    var pathKey = previous[0] + ',' + previous[1] + '>' + next[0] + ',' + next[1];
    World.move([dx, dy]);
    lastAction = Date.now();
    // Record the live journey decision and the selected edge for later route analysis.
    if (enabled) {
      var liveRunId = window.__adrLiveJourneyRunId || null;
      sendAIEventBatch([{
        run_id: liveRunId, event_type: 'journey_step', context: 'default', action: 'journey_move', reward: 0,
        payload: { from: previous, to: next, target: activeJourney.target, returning: !!activeJourney.returning,
          route_remaining: activeJourney.route.length, water: Number(World.water) || 0,
          health: Number(World.health) || 0, food: Number(Path.outfit && Path.outfit['cured meat']) || 0,
          tile: tileTextAt(next[0], next[1]), simulation: false }
      }, {
        run_id: liveRunId, event_type: 'path_result', context: 'default', action: 'journey_move', reward: -0.01,
        payload: { path_key: pathKey, coordinates: { from_x: previous[0], from_y: previous[1], to_x: next[0], to_y: next[1] },
          result: 'observed', visited: true, source: 'live_journey', returning: !!activeJourney.returning, simulation: false }
      }, {
        run_id: liveRunId, event_type: 'inventory_snapshot', context: 'default', action: null, reward: null,
        payload: { reason: 'live_journey_step', position: next, stores: combatInventory(),
          water: Number(World.water) || 0, health: Number(World.health) || 0,
          food: Number(Path.outfit && Path.outfit['cured meat']) || 0, simulation: false }
      }]).catch(function() {});
    }
    return true;
  }

  function handleAutoJourney() {
    if (!enabled || !window.Engine || !Engine.activeModule) return false;
    var module = Engine.activeModule;
    if (lastObservedModule === window.World && module !== window.World) activeJourney = null;
    lastObservedModule = module;

    if (module === window.Path) {
      if (!window.World || !window.Path || !window.$SM) return false;
      if (!Path.outfit) Path.outfit = $SM.get('outfit') || {};
      if (!activeJourney) {
        // No cured meat means there is no safe trip to launch yet.
        if (storeCount('cured meat') < 1) return false;
        if (!prepareJourneySupplies()) return false;
        Path.updateOutfitting();
        var embark = document.getElementById('embarkButton');
        if (embark && ready(embark) &&
            Number(Path.outfit['cured meat']) > 0 && Date.now() - lastAction >= 200) {
          startAIRun('live_journey', { source: 'live_game', start_position: World.curPos || null,
            inventory: combatInventory(), note: 'Live player journey; actions recorded as observed' }).then(function(runId) {
            if (runId) window.__adrLiveJourneyRunId = runId;
            embark.click();
            sendAIEventBatch([{run_id:runId || null,event_type:'journey_started',context:'default',action:'embark',reward:0,
              payload:{source:'live_journey',position:World.curPos || null,inventory:combatInventory(),simulation:false}}]).catch(function(){});
          }).catch(function() { embark.click(); });
          lastAction = Date.now();
          return true;
        }
        return false;
      }
      return false;
    }

    if (module === window.World) {
      if (!World.state || !World.curPos) {
        activeJourney = null;
        return true;
      }
      markCurrentJourneyLandmark();
      if (!activeJourney) {
        activeJourney = initializeJourney();
        if (!activeJourney) return true;
      }

      var distance = World.getDistance(World.curPos, World.VILLAGE_POS);
      var food = Number(Path.outfit && Path.outfit['cured meat']) || 0;
      var water = Number(World.water) || 0;
      var hp = Number(World.health) || 0;
      var maxHp = typeof World.getMaxHealth === 'function' ? World.getMaxHealth() : hp;
      var foodMoves = Math.max(1, Number(World.MOVES_PER_FOOD) || 2);
      if ($SM.hasPerk && $SM.hasPerk('slow metabolism')) foodMoves *= 2;

      if (!activeJourney.returning) {
        var atTarget = journeyPositionIs(activeJourney.target[0], activeJourney.target[1]);
        var lowHealth = maxHp > 0 && hp / maxHp <= 0.35;
        var lowWater = water <= distance + 2;
        var lowFood = food <= 0 || food * foodMoves < distance + 1;
        var tooFar = distance >= activeJourney.maxDistance;
        if (atTarget || lowHealth || lowWater || lowFood || tooFar || distance >= journeyHazardLimit()) {
          beginJourneyReturn();
        }
      }

      if (Date.now() - lastAction < 350) return true;
      return moveJourneyStep();
    }

    return false;
  }

  function tick() {
    if (!enabled || !document.body || (window.Engine && Engine.GAME_OVER)) return;
    flushCombatLearningQueue();
    monitorCombatLearning();
    beginAdaptiveRun();
    if (monitorAdaptiveAction()) return;
    // Resolve active random events before journey movement or normal actions.
    if (handleEvent()) return;
    // Equip, embark, explore safely, and return home when on the journey screens.
    if (handleAutoJourney()) return;
    // Build a sustainable economy without consuming every villager as a worker.
    if (manageWorkers()) return;
    // Prefer buttons in the current view; the game's own disabled state
    // prevents spending resources that are unavailable.
    var activeRoot = window.Engine && Engine.activeModule && Engine.activeModule.panel;
    var root = activeRoot && activeRoot.length && activeRoot[0].contains(document.activeElement)
      ? activeRoot[0] : (activeRoot && activeRoot.length && visible(activeRoot[0]) ? activeRoot[0] : document);
    var candidates = Array.prototype.slice.call(root.querySelectorAll(
      '.button, button, a.button, [role="button"]'
    )).filter(function (el) {
      return ready(el) && !el.closest('.menu') && !el.closest('#event');
    }).map(function (el) {
      return { el: el, score: adaptiveScore(el, score(el)) };
    }).filter(function (item) { return item.score > 0; });

    candidates.sort(function (a, b) {
      return b.score - a.score;
    });

    if (candidates.length) {
      // Avoid blindly repeating a disabled/cooling-down action; each click
      // uses the game's own handlers, costs, unlocks and progression rules.
      clickReady(candidates[0].el);
    } else {
      // Stay in the player's chosen location. Autoplay must never navigate
      // between locations on its own; the player controls tab switching.
      return;
    }
  }


  // Journey/AI test bench. Ctrl+Shift+P opens it; simulation telemetry is persisted in Supabase.
  var combatTestPanel = null;
  function ensureCombatTestPanel() {
    if (combatTestPanel && combatTestPanel.isConnected) return combatTestPanel;
    combatTestPanel = document.createElement('section');
    combatTestPanel.id = 'adr-combat-test-panel';
    combatTestPanel.style.cssText = 'position:fixed;z-index:2147483000;top:12px;right:12px;width:min(520px,calc(100vw - 24px));max-height:85vh;overflow:auto;background:#171717;color:#f4f4f4;border:1px solid #777;border-radius:10px;padding:14px;box-shadow:0 8px 32px #0009;font:13px/1.45 system-ui,sans-serif;display:none';
    combatTestPanel.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px"><strong style="font-size:16px">Adaptive Autoplay AI & Supabase</strong><button type="button" data-adr-test="close" style="background:#444;color:white;border:0;border-radius:5px;padding:5px 9px;cursor:pointer">Close</button></div>' +
      '<div style="color:#ccc;margin-bottom:10px">AI rule: actions that reveal new content, change inventory/state, unlock something, or advance the story are rewarded. If an action makes no progress for 4.5 seconds, it is penalized and avoided for 30 seconds while the AI tries another action. Decisions, outcomes, journey data, and learned action statistics are stored in Supabase.</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:8px">' +
      '<button type="button" data-adr-test="ai-command" style="padding:7px 9px;cursor:pointer">AI command</button>' +
      '<button type="button" data-adr-test="journey" style="padding:7px 9px;cursor:pointer">Run 1 learning journey</button>' +
      '<button type="button" data-adr-test="combat" style="padding:7px 9px;cursor:pointer">Run 100 combat rounds</button>' +
      '<button type="button" data-adr-test="connection" style="padding:7px 9px;cursor:pointer">Check API</button></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">' +
      '<button type="button" data-adr-test="runs">View runs</button><button type="button" data-adr-test="events">View decisions/events</button>' +
      '<button type="button" data-adr-test="actions">View learned action stats</button><button type="button" data-adr-test="paths">View path stats</button>' +
      '<button type="button" data-adr-test="inventory">View inventory snapshots</button><button type="button" data-adr-test="policy">View combat policy</button><button type="button" data-adr-test="refresh">Refresh all outputs</button></div>' +
      '<div id="adr-ai-command-box" style="display:none;margin:8px 0;padding:10px;background:#202020;border-radius:7px">' +
      '<label for="adr-ai-command-input" style="display:block;margin-bottom:5px">Tell the game what you want in plain English</label>' +
      '<textarea id="adr-ai-command-input" rows="3" placeholder="Examples: build a trading post, then get a compass; explore until you find something new; stop wasting time on the same action." style="box-sizing:border-box;width:100%;resize:vertical;background:#111;color:#fff;border:1px solid #666;border-radius:5px;padding:8px"></textarea>' +
      '<div style="display:flex;gap:7px;margin-top:7px"><button type="button" data-adr-test="submit-command">Plan & execute</button><button type="button" data-adr-test="inspect-actions">Inspect available actions</button><button type="button" data-adr-test="stop-command">Stop command</button></div>' +
      '<div style="color:#aaa;font-size:11px;margin-top:6px">Commands use available game controls, observe outcomes, and save the plan/results in Supabase. Destructive save/reset actions are never auto-invoked.</div></div>' +
      '<div id="adr-combat-test-results" role="status" aria-live="polite" style="white-space:pre-wrap;overflow-wrap:anywhere;background:#242424;border-radius:6px;padding:10px;min-height:90px;max-height:45vh;overflow:auto">Ready. Open AI command to issue a natural-language instruction or inspect Supabase learning data.</div>' +
      '<div style="color:#aaa;font-size:11px;margin-top:8px">Shortcuts: Ctrl+Shift+P for the AI panel, Ctrl+Shift+I for direct English commands. Live actions are logged when possible; simulated outcomes are clearly marked.</div>';
    document.body.appendChild(combatTestPanel);
    combatTestPanel.addEventListener('click', function(e) {
      var button = e.target.closest('[data-adr-test]');
      if (!button) return;
      var action = button.getAttribute('data-adr-test');
      if (action === 'close') { combatTestPanel.style.display = 'none'; return; }
      if (action === 'ai-command') {
        var commandBox = combatTestPanel.querySelector('#adr-ai-command-box');
        if (commandBox) commandBox.style.display = commandBox.style.display === 'none' ? 'block' : 'none';
        return;
      }
      if (action === 'submit-command') { submitNaturalLanguageCommand(); return; }
      if (action === 'inspect-actions') { inspectAvailableGameActions(); return; }
      if (action === 'stop-command') { stopNaturalLanguageCommand(); return; }
      if (action === 'journey') runJourneyLearningSimulation();
      if (action === 'combat') runCombatLearningSimulation();
      if (action === 'connection') runCombatAPIHealthCheck();
      if (action === 'refresh') showAIDashboard('all');
      if (action === 'runs' || action === 'events' || action === 'actions' || action === 'paths' || action === 'inventory' || action === 'policy') showAIDashboard(action);
    });
    return combatTestPanel;
  }


  // Natural-language command system. It builds executable plans from the live
  // game's controls and exposed APIs, then observes each action before continuing.
  // Supabase persists the request, resolved plan, and each result.
  var aiCommandQueue = [];
  var aiCommandActive = false;
  var aiCommandRunId = null;
  var aiCommandTimer = null;
  var aiCommandIndex = 0;
  var aiCommandText = '';
  var aiCommandRepeatGoal = false;
  var aiCommandRepeatCount = 0;

  function logNaturalLanguageEvent(type, action, reward, payload) {
    sendAIEventBatch([{run_id:aiCommandRunId || null,event_type:type,context:'default',
      action:action || null,reward:reward == null ? null : reward,payload:payload || {}}]).catch(function(){});
  }

  function splitCommandIntoSteps(text) {
    return String(text || '').replace(/\b(?:and then|then after that|after that|and next)\b/gi, ';')
      .replace(/[\n]+/g, ';').split(/[;]+/).map(function(part) {
        return part.trim().replace(/^(?:please|could you|can you|i want you to|i want to|try to|try|then)\s+/i, '');
      }).filter(Boolean);
  }

  function liveGameActions() {
    var roots = [];
    var panel = window.Engine && Engine.activeModule && Engine.activeModule.panel;
    if (panel && panel.length && visible(panel[0])) roots.push(panel[0]);
    roots.push(document);
    var found = [], seen = [];
    roots.forEach(function(root) {
      Array.prototype.slice.call(root.querySelectorAll('.button,button,a.button,[role="button"]')).forEach(function(el) {
        if (seen.indexOf(el) !== -1 || !ready(el) || el.closest('.menu') ||
            el.closest('#adr-combat-test-panel') || el.closest('#event')) return;
        seen.push(el);
        var label = norm((el.innerText || el.textContent || '') + ' ' + (el.id || '')).trim();
        if (!label || /restart|delete save|reset game|import save|export save|clear data/.test(label)) return;
        var base = score(el);
        found.push({el:el,label:label,key:adaptiveActionKey(el),baseScore:base});
      });
    });
    return found;
  }

  function inspectAvailableGameActions() {
    var actions = liveGameActions();
    var globalFns = [];
    ['Engine','World','Path','Outside','Room','Outside','Events','$SM'].forEach(function(name) {
      var obj = window[name];
      if (!obj) return;
      Object.keys(obj).forEach(function(key) {
        try { if (typeof obj[key] === 'function') globalFns.push(name+'.'+key); } catch (e) {}
      });
    });
    combatTestReport('AVAILABLE GAME ACTIONS ('+actions.length+')\n'+actions.map(function(a,i) {
      return (i+1)+'. '+a.label+' [score '+a.baseScore+']';
    }).join('\n')+'\n\nEXPOSED GAME API FUNCTIONS ('+globalFns.length+')\n'+globalFns.slice(0,180).join('\n')+
      (globalFns.length>180?'\n… truncated':'')+
      '\n\nOnly current, ready UI actions are directly executable. API functions are catalogued for planning/inspection, not blindly invoked.');
  }

  function resolveNaturalLanguageStep(step, actions) {
    var q = norm(step);
    var stripped = q.replace(/\b(the|a|an|please|for me|in the game|as soon as possible|right now|if possible|i want|i need|make sure to|try to|go ahead and)\b/g,' ')
      .replace(/\s+/g,' ').trim();
    var intent = 'best_progress';
    if (/\b(stop|pause|cancel|abort)\b/.test(q)) return {kind:'stop',text:step};
    if (/\b(status|what is happening|what are you doing|show progress)\b/.test(q)) return {kind:'status',text:step};
    if (/\b(inspect|list|show|what).*\b(actions|buttons|commands|functions)\b/.test(q)) return {kind:'inspect',text:step};
    if (/\b(explore|expedition|journey|go out|find something new|discover|see what.s out there|what.s beyond|venture out|ready to leave)\b/.test(q)) intent='explore';
    else if (/\b(story|progress|advance|finish|endgame|ship|launch|lift off|get further|move forward|make progress|what comes next)\b/.test(q)) intent='progress';
    else if (/\b(build|construct|make a|create a|grow the settlement|place thriving|develop the village|expand the town)\b/.test(q)) intent='build';
    else if (/\b(craft|fabricate|produce|manufacture|make better gear)\b/.test(q)) intent='craft';
    else if (/\b(gather|collect|farm|harvest|wood|food|meat|resources|running out|need supplies|struggling to survive|stay alive|survive longer)\b/.test(q)) intent='gather';
    else if (/\b(weapon|weaponry|armour|armor|fight|combat|attack|prepare for battle|make me stronger|defend myself)\b/.test(q)) intent='combat';
    else if (/\b(trade|buy|purchase|sell|merchant|trading post|make money|earn more)\b/.test(q)) intent='trade';
    else if (/\b(return home|come back|go home|return to village)\b/.test(q)) intent='return';
    else if (/\b(stoke|fire|keep warm|fuel|keep the fire going)\b/.test(q)) intent='fire';

    var explicit = stripped.replace(/\b(build|construct|make|create|craft|fabricate|produce|buy|purchase|gather|collect|find|get|obtain|upgrade|repair|equip|use|go to|visit|return to|explore|investigate|unlock|advance|progress|continue|finish|complete|please|the|a|an|some|me|for|as many as possible|as many as you can|as much as possible|as much as you can|keep|continue to|until|you can|possible|available|afford|affordably)\b/g,' ')
      .replace(/\s+/g,' ').trim();
    // Goal phrases often contain a target noun rather than a game button's wording.
    // Match the target explicitly before broad intent scoring to avoid doing an unrelated action.
    var target = '';
    var targetMatch = q.match(/\b(?:build|construct|make|create|craft|fabricate|produce|buy|purchase|get|obtain)\s+(?:as many|as much|more|some|lots of|a lot of|additional)?\s*(?:of\s+the\s+|of\s+|the\s+)?([a-z][a-z -]{1,35}?)(?:\s+as many as possible|\s+as much as possible|\s+as many as you can|\s+as much as you can|\s+if possible|\s+until\b|\s+as possible|\s+please)?$/i);
    if (targetMatch) target = targetMatch[1].replace(/\b(as many|as much|more|possible|you can|as you can)\b/gi,' ').replace(/\s+/g,' ').trim();
    var targetWords = target.split(/\s+/).filter(function(w){return w.length>2 && !/^(many|much|more|lots|lot|some|the|and|for)$/.test(w);});
    if (targetWords.length) {
      var targeted = actions.map(function(a) {
        var label = a.label;
        var hit = targetWords.filter(function(w) {
          return label.indexOf(w) !== -1 || (w==='traps' && /\btrap\b/.test(label)) ||
            (w==='trapping' && /\btrap\b/.test(label));
        }).length;
        var actionType = /\b(build|construct|make|create)\b/.test(q) ? /build|construct/.test(label) : true;
        return {action:a,score:hit * 30 + (actionType ? 15 : 0),overlap:hit * 10};
      }).filter(function(item){return item.score >= 45;}).sort(function(a,b){return b.score-a.score;});
      if (targeted.length) return {kind:'action',text:step,intent:intent,actionKey:targeted[0].action.key,
        label:targeted[0].action.label,score:targeted[0].score,matched:true,target:target,repeat:/(?:\b(?:as many|as much)\b.*\b(?:as possible|as you can)\b|\bkeep (?:building|making|crafting|producing|buying)\b|\buntil (?:i|we|you) (?:can't|cannot|can no longer|run out|have no)\b)/.test(q)};
    }
    var ranked = actions.map(function(a) {
      var label = a.label, scoreValue = a.baseScore;
      var overlap = 0;
      var words = explicit.split(/\s+/).filter(function(w){return w.length>2;});
      words.forEach(function(w){ if(label.indexOf(w)!==-1) overlap += Math.min(6,w.length); });
      if (explicit && (label.indexOf(explicit)!==-1 || explicit.indexOf(label)!==-1)) overlap += 20;
      if (intent==='explore' && /embark|explore|return home|go out|leave|investigate/.test(label)) scoreValue += 55;
      if (intent==='progress' && /lift off|launch|ship|upgrade engine|power cycle|reinforce hull|continue|investigate|discover|unlock|embark/.test(label)) scoreValue += 70;
      if (intent==='build' && /build|construct|hut|trading post|cart|lodge|workshop|tannery|smokehouse/.test(label)) scoreValue += 45;
      if (intent==='craft' && /craft|fabricate|make|create|upgrade|repair/.test(label)) scoreValue += 45;
      if (intent==='gather' && /gather|collect|hunt|check traps|scavenge|wood|food|trap/.test(label)) scoreValue += 40;
      if (intent==='combat' && /weapon|armour|armor|bullets|attack|fight|equip|embark|buy|fabricate/.test(label)) scoreValue += 35;
      if (intent==='trade' && /trade|buy|sell|purchase|trading post|merchant/.test(label)) scoreValue += 45;
      if (intent==='return' && /return home|return to village|go home/.test(label)) scoreValue += 100;
      if (intent==='fire' && /stoke fire|light fire|add fuel/.test(label)) scoreValue += 35;
      if (/\b(don't|do not|avoid|stop wasting time|instead)\b/.test(q) && /stoke fire|light fire|wait|gather wood/.test(label)) scoreValue -= 60;
      scoreValue += overlap;
      return {action:a,score:scoreValue,overlap:overlap};
    }).sort(function(a,b){return b.score-a.score;});
    if (!ranked.length || ranked[0].score <= 0) return {kind:'unresolved',text:step,intent:intent};
    return {kind:'action',text:step,intent:intent,actionKey:ranked[0].action.key,
      label:ranked[0].action.label,score:ranked[0].score,matched:ranked[0].overlap>0,
      repeat:/(?:\b(?:as many|as much)\b.*\b(?:as possible|as you can)\b|\bkeep (?:building|making|crafting|producing|buying)\b|\buntil (?:i|we|you) (?:can't|cannot|can no longer|run out|have no)\b)/.test(q)};
  }

  function submitNaturalLanguageCommand() {
    var input = combatTestPanel && combatTestPanel.querySelector('#adr-ai-command-input');
    var text = input ? input.value.trim() : '';
    if (!text) { combatTestReport('Type an instruction first.'); return; }
    if (aiCommandActive) { combatTestReport('A command is already running. Stop it before issuing another.'); return; }

    aiCommandText = text;
    aiCommandRunId = null;
    aiCommandQueue = [];
    aiCommandIndex = 0;
    aiCommandRepeatGoal = /(?:\b(?:as many|as much)\b.*\b(?:as possible|as you can)\b|\bkeep (?:building|making|crafting|producing|buying)\b|\buntil (?:i|we|you) (?:can't|cannot|can no longer|run out|have no)\b)/i.test(text);
    aiCommandRepeatCount = 0;

    var actions = liveGameActions();
    var fallbackSteps = splitCommandIntoSteps(text).map(function(step) {
      return resolveNaturalLanguageStep(step, actions);
    });
    var directControl = fallbackSteps.length && fallbackSteps.every(function(step) {
      return step.kind === 'stop' || step.kind === 'status' || step.kind === 'inspect';
    });
    var directAction = fallbackSteps.length && fallbackSteps.every(function(step) {
      return step.kind !== 'unresolved' && (step.kind !== 'action' || step.matched);
    });

    function startExecution(plans, plannerName, explanation) {
      aiCommandQueue = plans || [];
      aiCommandIndex = 0;
      if (!aiCommandQueue.length) {
        aiCommandActive = false;
        combatTestReport('No executable plan found. Try a specific action or inspect the available actions.');
        return;
      }
      if (aiCommandRepeatGoal && aiCommandQueue[0] && aiCommandQueue[0].kind === 'action') {
        combatTestReport('Interpreting quantity goal: ' + text + '\nTarget: ' +
          (aiCommandQueue[0].label || aiCommandQueue[0].target || 'matching action') +
          '\nI will repeat while the action remains available and the game accepts it.');
      } else if (explanation) {
        combatTestReport(explanation);
      } else {
        combatTestReport('Executing command using ' + plannerName + '.\n' +
          aiCommandQueue.map(function(p,i) {
            return (i+1)+'. '+p.text+' → '+(p.label || p.kind);
          }).join('\n'));
      }

      // Telemetry is optional: never let a slow or unavailable network prevent gameplay.
      aiCommandActive = true;
      try {
        var runPromise = startAIRun('diagnostic', {
          source:'natural_language_command', request:text, planner:plannerName, steps:aiCommandQueue
        });
        Promise.resolve(runPromise).then(function(runId) {
          if (runId) aiCommandRunId = runId;
          logNaturalLanguageEvent('natural_language_request','interpret_command',null,{
            request:text, plan:aiCommandQueue, planner:plannerName, source:'live_game'
          });
        }).catch(function() {});
      } catch (e) {}
      executeNextNaturalLanguageStep();
    }

    // Exact/ordinary commands should execute immediately. Do not make familiar
    // commands wait for a ~1 GB model download or a WebGPU initialization.
    if (directControl || directAction || aiCommandRepeatGoal && fallbackSteps[0] &&
        fallbackSteps[0].kind === 'action' && fallbackSteps[0].matched) {
      startExecution(fallbackSteps, 'local_intent_matching',
        'Matched your command directly to currently available game actions.');
      return;
    }

    var localPlanner = window.WebLLMCommandPlanner;
    if (!localPlanner || typeof localPlanner.plan !== 'function') {
      startExecution(fallbackSteps, 'local_fallback',
        'The local language model is not ready; using the built-in command matcher.');
      return;
    }

    combatTestReport('Understanding the broader request with the local model. Standard commands do not need to wait for this.');
    var stopModelStatus = typeof localPlanner.subscribe === 'function' ?
      localPlanner.subscribe(function(status) {
        if (!aiCommandActive) combatTestReport(status);
      }) : function() {};
    Promise.resolve().then(function() {
      return localPlanner.plan(text, JSON.parse(adaptiveSnapshot()), actions.map(function(a) {
        return {key:a.key, label:a.label, score:a.baseScore};
      }));
    }).then(function(modelPlan) {
      stopModelStatus();
      if (aiCommandActive) return;
      if (modelPlan && modelPlan.model_available && Array.isArray(modelPlan.steps) && modelPlan.steps.length) {
        var plans = modelPlan.steps.map(function(step) {
          return {kind:'action', text:text, intent:'local_model_planned', actionKey:step.action_key,
            label:step.label, reason:step.reason, score:100, matched:true};
        });
        startExecution(plans, modelPlan.model,
          'LOCAL MODEL INTERPRETATION ('+modelPlan.model+')\n'+(modelPlan.explanation||'')+
          '\n\nEXECUTION PLAN\n'+plans.map(function(p,i) {
            return (i+1)+'. '+p.label+' — '+(p.reason||'selected for your request');
          }).join('\n'));
      } else {
        startExecution(fallbackSteps, 'local_fallback',
          'The local model did not produce a usable plan; using the built-in command matcher.');
      }
    }).catch(function(error) {
      stopModelStatus();
      if (aiCommandActive) return;
      startExecution(fallbackSteps, 'local_fallback',
        'Local model unavailable; using built-in command matching.\n'+(error && error.message || error));
    });
  }

  function executeNextNaturalLanguageStep() {
    if (!aiCommandActive) return;
    if (aiCommandIndex >= aiCommandQueue.length) {
      aiCommandActive = false;
      finishAIRun(aiCommandRunId,'completed',{request:aiCommandText,steps:aiCommandQueue.length,completed:true});
      combatTestReport('COMMAND PLAN FINISHED\n'+aiCommandText+'\n\n'+aiCommandQueue.map(function(p,i) {
        return (i+1)+'. '+p.text+' → '+(p.result || p.label || p.kind);
      }).join('\n'));
      return;
    }
    var plan = aiCommandQueue[aiCommandIndex];
    if (plan.kind==='stop') { stopNaturalLanguageCommand(); return; }
    if (plan.kind==='status') {
      plan.result='Current game state inspected';
      logNaturalLanguageEvent('command_step_result','status',1,{request:plan.text,state:adaptiveSnapshot()});
      aiCommandIndex++; executeNextNaturalLanguageStep(); return;
    }
    if (plan.kind==='inspect') { inspectAvailableGameActions(); plan.result='Action catalog shown'; aiCommandIndex++; executeNextNaturalLanguageStep(); return; }
    if (plan.kind!=='action') {
      plan.result='Could not confidently map this sentence to a ready game action; skipped';
      logNaturalLanguageEvent('command_step_result','unresolved',-1,{request:plan.text,reason:plan.result});
      aiCommandIndex++; executeNextNaturalLanguageStep(); return;
    }
    var actions = liveGameActions();
    var selected = actions.find(function(a){return a.key===plan.actionKey;});
    if (!selected || !ready(selected.el)) {
      plan.result='Chosen action is no longer available; trying the next step';
      logNaturalLanguageEvent('command_step_result',plan.actionKey,-1,{request:plan.text,reason:plan.result});
      aiCommandIndex++; executeNextNaturalLanguageStep(); return;
    }
    plan.before=adaptiveSnapshot();
    plan.startedAt=Date.now();
    plan.result='Executing '+selected.label+'; waiting for a game-state change';
    combatTestReport('EXECUTING COMMAND '+(aiCommandIndex+1)+'/'+aiCommandQueue.length+'\n'+plan.text+'\nSelected game action: '+selected.label+'\nWaiting for observable progress…');
    if (!clickReady(selected.el)) {
      plan.result='Action could not be triggered';
      aiCommandIndex++; executeNextNaturalLanguageStep(); return;
    }
    aiCommandTimer=window.setTimeout(function pollCommandOutcome(){
      if (!aiCommandActive) return;
      var nowState=adaptiveSnapshot();
      if (nowState!==plan.before && Date.now()-plan.startedAt>=700) {
        plan.result='Success: game state/story changed after '+Math.round((Date.now()-plan.startedAt)/1000)+'s';
        logNaturalLanguageEvent('command_step_result',plan.actionKey,1,{request:plan.text,action:selected.label,elapsed_ms:Date.now()-plan.startedAt,changed:true});
        if (aiCommandRepeatGoal && aiCommandRepeatCount < 100) {
          var repeatActions = liveGameActions();
          var nextRepeat = resolveNaturalLanguageStep(aiCommandText, repeatActions);
          var requestedTarget = norm(plan.target || (plan.text.match(/\\b(?:traps?|huts?|carts?|lodges?|trading posts?|workshops?|tanneries|smokehouses|steelworks|armouries)\\b/i) || [])[0] || '');
          var nextLabel = norm(nextRepeat.label || '');
          var targetStillAvailable = nextRepeat.kind === 'action' &&
            (requestedTarget ? nextLabel.indexOf(requestedTarget.replace(/s$/, '')) !== -1 || requestedTarget === 'traps' && /\\btrap\\b/.test(nextLabel) :
              nextRepeat.actionKey === plan.actionKey);
          if (targetStillAvailable) {
            aiCommandRepeatCount++;
            nextRepeat.repeat = true;
            nextRepeat.target = plan.target || requestedTarget;
            aiCommandQueue = [nextRepeat];
            aiCommandIndex = 0;
            combatTestReport('GOAL IN PROGRESS ('+aiCommandRepeatCount+' completed)\\n'+aiCommandText+'\\nBuilt/used: '+selected.label+'\\nRepeating while affordable and available…');
            executeNextNaturalLanguageStep();
            return;
          }
          aiCommandActive = false;
          finishAIRun(aiCommandRunId,'completed',{request:aiCommandText,repeat_count:aiCommandRepeatCount+1,stopped:'target action no longer available'});
          combatTestReport('GOAL FINISHED\\n'+aiCommandText+'\\nCompleted '+(aiCommandRepeatCount+1)+' successful action(s). The target action is no longer available or affordable.');
          return;
        }
        aiCommandIndex++; executeNextNaturalLanguageStep();
      } else if (Date.now()-plan.startedAt>=4500) {
        plan.result='Stalled: no observable change; action penalized, trying something else';
        adaptiveActionCooldowns[plan.actionKey]=Date.now()+30000;
        adaptiveRecentCounts[plan.actionKey]=(adaptiveRecentCounts[plan.actionKey]||0)+2;
        logNaturalLanguageEvent('command_step_result',plan.actionKey,-1,{request:plan.text,action:selected.label,elapsed_ms:Date.now()-plan.startedAt,changed:false,reason:'stall'});
        // Re-resolve the same user goal against current controls while excluding the stalled action.
        var alternatives=liveGameActions().filter(function(a){return a.key!==plan.actionKey;});
        var alternative=resolveNaturalLanguageStep(plan.text,alternatives);
        if (alternative.kind==='action' && alternative.actionKey!==plan.actionKey) {
          plan.alternative=alternative.label;
          plan.actionKey=alternative.actionKey;
          plan.label=alternative.label;
          plan.result+='; fallback: '+alternative.label;
          executeNextNaturalLanguageStep();
        } else {
          aiCommandIndex++;
          executeNextNaturalLanguageStep();
        }
      } else {
        aiCommandTimer=window.setTimeout(pollCommandOutcome,500);
      }
    },500);
  }

  function stopNaturalLanguageCommand() {
    aiCommandActive=false;
    if (aiCommandTimer) window.clearTimeout(aiCommandTimer);
    aiCommandTimer=null;
    if (aiCommandRunId) finishAIRun(aiCommandRunId,'cancelled',{request:aiCommandText,completed_steps:aiCommandIndex});
    combatTestReport('Command stopped. No additional actions will be issued.');
  }

  function showCombatTestPanel() {
    var panel = ensureCombatTestPanel();
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }

  function combatTestReport(message) {
    var panel = ensureCombatTestPanel();
    var output = panel.querySelector('#adr-combat-test-results');
    if (output) output.textContent = message;
  }

  function showAIDashboard(section) {
    combatTestReport('Loading Supabase AI tables…');
    sendAITelemetry({ op: 'dashboard', limit: 40 }).then(function(data) {
      var names = section === 'all' ? ['runs','events','actions','paths','inventory','combat_policy'] : [section === 'policy' ? 'combat_policy' : section];
      var output = names.map(function(name) {
        var rows = data[name] || [];
        return '=== ' + name.toUpperCase() + ' (' + rows.length + ' rows returned) ===\n' +
          JSON.stringify(rows, null, 2);
      }).join('\n\n');
      combatTestReport(output || 'No rows returned.');
    }).catch(function(error) {
      combatTestReport('Could not read Supabase tables.\n' + (error && error.message || error));
    });
  }

  function runJourneyLearningSimulation() {
    combatTestReport('Starting a simulated expedition and loading existing path knowledge…');
    sendAITelemetry({ op: 'dashboard', limit: 100 }).then(function(existing) {
      return startAIRun('journey_simulation', { source: 'test_panel', model: 'grid_exploration_v1' }).then(function(runId) {
        if (!runId) throw new Error('Supabase did not return a run ID.');
        var known = {};
        (existing.paths || []).forEach(function(p) { known[p.path_key] = p; });
        var size = 13, pos = { x: 6, y: 6 }, home = { x: 6, y: 6 };
        var inventory = { food: 12, water: 12, wood: 0, iron: 0, medicine: 0, relics: 0 };
        var seen = {}, events = [], resourcesFound = {}, successes = 0, failures = 0, newEdges = 0;
        var directions = [{x:1,y:0,n:'east'},{x:-1,y:0,n:'west'},{x:0,y:1,n:'south'},{x:0,y:-1,n:'north'}];
        var map = {};
        function key(p) { return p.x + ',' + p.y; }
        function tileAt(p) {
          var k = key(p);
          if (!map[k]) {
            var n = Math.abs((p.x * 37 + p.y * 71 + p.x * p.y * 13) % 19);
            map[k] = n < 3 ? 'hazard' : n < 7 ? 'wood' : n < 10 ? 'iron' : n < 12 ? 'medicine' : n < 15 ? 'water' : n < 17 ? 'relic' : 'empty';
          }
          return map[k];
        }
        function add(type, action, reward, payload, context) {
          events.push({ run_id: runId, event_type: type, context: context || 'default',
            action: action || null, reward: reward == null ? null : reward, payload: payload || {} });
        }
        add('journey_started', 'start_expedition', 0, { position: pos, home: home, inventory: inventory, simulation: true });
        add('inventory_snapshot', null, null, { reason: 'journey_start', inventory: inventory, position: pos, simulation: true });
        for (var step = 0; step < 60; step++) {
          var options = directions.map(function(d) {
            var next = { x: Math.max(0, Math.min(size - 1, pos.x + d.x)), y: Math.max(0, Math.min(size - 1, pos.y + d.y)) };
            var pathKey = key(pos) + '>' + key(next);
            var old = known[pathKey];
            var tile = tileAt(next);
            var utility = tile === 'relic' ? 8 : tile === 'medicine' ? (inventory.medicine < 2 ? 6 : 1) :
              tile === 'water' ? (inventory.water < 8 ? 5 : 1) : tile === 'iron' ? (inventory.iron < 6 ? 4 : 1) :
              tile === 'wood' ? (inventory.wood < 8 ? 3 : 0.5) : tile === 'hazard' ? -5 : 0;
            var novelty = seen[pathKey] ? -4 : old ? -Math.min(2, Number(old.attempts) * 0.25) : 3;
            var distanceHome = Math.abs(next.x-home.x)+Math.abs(next.y-home.y);
            var survival = inventory.food <= 2 || inventory.water <= 2 ? -distanceHome * 1.4 : 0;
            var boundaryPenalty = (next.x === pos.x && next.y === pos.y) ? -20 : 0;
            return { d:d, next:next, pathKey:pathKey, tile:tile, score:utility + novelty + survival + boundaryPenalty + ((step * 17 + d.x * 5 + d.y * 9) % 7) / 20 };
          }).sort(function(a,b) { return b.score-a.score; });
          var chosen = options[0], from = {x:pos.x,y:pos.y};
          if (seen[chosen.pathKey]) newEdges += 0; else { newEdges++; }
          seen[chosen.pathKey] = (seen[chosen.pathKey] || 0) + 1;
          var result = chosen.tile === 'hazard' ? 'failure' : 'success';
          var reward = chosen.tile === 'hazard' ? -1 : chosen.tile === 'relic' ? 1 : chosen.tile === 'empty' ? -0.1 : 0.6;
          if (result === 'failure') { failures++; inventory.food = Math.max(0, inventory.food - 2); inventory.water = Math.max(0, inventory.water - 2); }
          else {
            successes++;
            if (chosen.tile === 'wood') inventory.wood += 2;
            if (chosen.tile === 'iron') inventory.iron += 1;
            if (chosen.tile === 'medicine') inventory.medicine += 1;
            if (chosen.tile === 'water') inventory.water = Math.min(20, inventory.water + 4);
            if (chosen.tile === 'relic') inventory.relics += 1;
          }
          resourcesFound[chosen.tile] = (resourcesFound[chosen.tile] || 0) + 1;
          add('journey_decision', 'choose_path', chosen.score, { step:step+1, from:from, to:chosen.next, tile:chosen.tile,
            candidate_paths:options.map(function(o){return {path_key:o.pathKey,score:Number(o.score.toFixed(3)),tile:o.tile,known:!!known[o.pathKey],visited:!!seen[o.pathKey]};}),
            selected_path:chosen.pathKey, novelty_bonus:known[chosen.pathKey] ? 0 : 3, simulation:true });
          add('path_result', 'journey_move', reward, { path_key:chosen.pathKey,
            coordinates:{from_x:from.x,from_y:from.y,to_x:chosen.next.x,to_y:chosen.next.y},
            result:result, visited:true, tile:chosen.tile, source:'journey_simulation', simulation:true }, 'default');
          add('action_result', 'journey_move', reward, { step:step+1, tile:chosen.tile, result:result, simulation:true }, 'default');
          pos = chosen.next;
          inventory.food = Math.max(0, inventory.food - 0.2);
          inventory.water = Math.max(0, inventory.water - 0.25);
          if ((step+1)%5===0) add('inventory_snapshot', null, null, {reason:'journey_step_'+(step+1),inventory:inventory,position:pos,resourcesFound:resourcesFound,simulation:true});
          if (events.length >= 200) {
            // Keep requests below the server's bounded batch size and yield through a promise chain.
            break;
          }
        }
        add('journey_finished', 'return_or_stop', successes - failures, { position:pos, inventory:inventory,
          successes:successes, failures:failures, newEdges:newEdges, resourcesFound:resourcesFound, simulation:true });
        var batches = [];
        for (var i=0;i<events.length;i+=200) batches.push(events.slice(i,i+200));
        var chain = Promise.resolve();
        batches.forEach(function(batch) { chain = chain.then(function(){ return sendAIEventBatch(batch); }); });
        return chain.then(function() {
          return finishAIRun(runId, 'completed', { steps:events.filter(function(e){return e.event_type==='path_result';}).length,
            successes:successes, failures:failures, newEdges:newEdges, resourcesFound:resourcesFound,
            finalInventory:inventory, finalPosition:pos, simulation:true });
        }).then(function() {
          combatTestReport('JOURNEY SIMULATION SAVED TO SUPABASE\nRun ID: '+runId+'\nSteps: '+successes+' successful / '+failures+' hazardous\nNew path edges explored: '+newEdges+
            '\nResources/tiles: '+JSON.stringify(resourcesFound)+'\nFinal inventory: '+JSON.stringify(inventory)+
            '\nSaved event records: '+events.length+'\nUse the table buttons to inspect runs, decisions, path stats, action stats and inventory snapshots.');
        });
      });
    }).catch(function(error) {
      combatTestReport('Journey simulation failed to save.\n'+(error && error.message || error));
    });
  }

  function runCombatLearningSimulation() {
    combatTestReport('Recording 100 simulated combat rounds to Supabase…');
    startAIRun('combat_simulation', { source: 'test_panel' }).then(function(runId) {
      if (!runId) throw new Error('Supabase did not return a run ID.');
      var contexts = ['low_hp', 'mid_hp', 'high_hp', 'shielded', 'enemy_stunned', 'default'];
      var candidates = [];
      if (window.World && World.Weapons) Object.keys(World.Weapons).forEach(function(name) {
        var weapon = World.Weapons[name]; if (!weapon) return;
        var damage = weapon.damage === 'stun' ? 0 : Math.max(0, Number(weapon.damage) || 0);
        var cooldown = Math.max(0.5, Number(weapon.cooldown) || 1);
        candidates.push({name:name,action:'attack_'+norm(name).replace(/\s+/g,'-').replace(/[^a-z0-9_-]/g,'').slice(0,40),score:weapon.damage==='stun'?2.2:damage*0.8/cooldown});
      });
      if (!candidates.length) candidates = [{name:'training-fast-weapon',action:'attack_training-fast-weapon',score:2},{name:'training-heavy-weapon',action:'attack_training-heavy-weapon',score:1.6},{name:'training-stun-weapon',action:'attack_training-stun-weapon',score:1.8},{name:'training-weak-weapon',action:'attack_training-weak-weapon',score:0.6}];
      candidates.sort(function(a,b){return b.score-a.score;});
      var events=[];
      for (var i=0;i<100;i++) {
        var context=contexts[i%contexts.length], candidate=candidates[(i*7+Math.floor(i/contexts.length))%candidates.length];
        var rank=candidates.indexOf(candidate), normalized=candidates.length>1?rank/(candidates.length-1):0;
        var probability=Math.max(0.08,Math.min(0.92,0.78-normalized*0.55+((i*13)%17)/100));
        var roll=((i*37+rank*19+context.length*11)%100)/100, won=roll<probability, reward=won?1:-1;
        events.push({run_id:runId,event_type:'action_result',context:context,action:candidate.action,reward:reward,
          payload:{source:'combat_simulation',weapon:candidate.name,won:won,score:candidate.score,round:i+1,simulation:true}});
      }
      var chain=Promise.resolve();
      for(var j=0;j<events.length;j+=200) (function(batch){chain=chain.then(function(){return sendAIEventBatch(batch);});})(events.slice(j,j+200));
      return chain.then(function(){return finishAIRun(runId,'completed',{rounds:100,events:events.length,simulation:true});})
        .then(function(){combatTestReport('COMBAT SIMULATION SAVED\n100 synthetic rounds written to Supabase.\nRun ID: '+runId+'\nThe synthetic results are marked as simulations and are separate from real-fight combat policy.\nUse View events / View action stats to inspect.');});
    }).catch(function(error){combatTestReport('Combat simulation failed.\n'+(error&&error.message||error));});
  }

  function runCombatAPIHealthCheck() {
    combatTestReport('Checking Supabase AI endpoints and tables…');
    var contexts = ['low_hp','mid_hp','high_hp','shielded','enemy_stunned','default'];
    var passed=0, details=[], chain=Promise.resolve();
    contexts.forEach(function(context){chain=chain.then(function(){
      return requestCombatAI({op:'policy',context:context,actions:[]}).then(function(data){
        if(!data||!data.stats||typeof data.stats!=='object')throw new Error('Invalid policy response');
        passed++;details.push('✓ policy '+context+': '+Object.keys(data.stats).length+' actions');
      }).catch(function(error){details.push('✗ policy '+context+': '+(error&&error.message||'request failed'));});
    });});
    chain.then(function(){return requestCombatAI({op:'dashboard',limit:2}).then(function(data){
      details.push('✓ tables: runs='+data.runs.length+', events='+data.events.length+', actions='+data.actions.length+', paths='+data.paths.length+', inventory='+data.inventory.length);
    }).catch(function(error){details.push('✗ dashboard: '+(error&&error.message||'request failed'));});})
    .then(function(){combatTestReport((passed===contexts.length?'PASS':'PARTIAL')+' — Supabase API check\n'+details.join('\n'));});
  }

  // Remember manual location changes so the autoplay loop doesn't snap back
  // to another tab on its next tick.
  document.addEventListener('click', function (event) {
    var tab = event.target && event.target.closest ? event.target.closest('.headerButton') : null;
    if (tab) lastManualNavigation = Date.now();
  }, true);

  document.addEventListener('keydown', function (event) {
    if (event.repeat || event.altKey || event.metaKey) return;
    var key = String(event.key || '').toLowerCase();
    if (event.ctrlKey && event.shiftKey && key === 'p') {
      event.preventDefault();
      showCombatTestPanel();
      return;
    }
    if (event.ctrlKey && event.shiftKey && key === 'i') {
      event.preventDefault();
      var aiPanel = ensureCombatTestPanel();
      aiPanel.style.display = 'block';
      var commandBox = aiPanel.querySelector('#adr-ai-command-box');
      if (commandBox) commandBox.style.display = 'block';
      var commandInput = aiPanel.querySelector('#adr-ai-command-input');
      if (commandInput) commandInput.focus();
      return;
    }
    if (event.ctrlKey && !event.shiftKey && key === 'p') {
      event.preventDefault();
      setEnabled(!enabled);
    }
  });

})();
