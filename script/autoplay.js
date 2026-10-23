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
      if (!timer) timer = window.setInterval(tick, 250);
      tick();
    } else if (timer) {
      window.clearInterval(timer);
      timer = null;
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
      'trading post': 105, 'cart': 95, 'hut': 76, 'lodge': 72,
      'tannery': 69, 'smokehouse': 68, 'workshop': 65,
      'steelworks': 62, 'armoury': 59, 'trap': 56,
      'compass': 110, 'rucksack': 88, 'wagon': 82, 'convoy': 86,
      'cargo drone': 100, 'fluid recycler': 92, 'water tank': 84,
      'cask': 76, 'waterskin': 62,
      'bone spear': 70, 'iron sword': 78, 'steel sword': 84,
      'rifle': 82, 'energy blade': 90, 'plasma rifle': 96,
      'kinetic armour': 91, 'disruptor': 88, 'hypo': 85, 'stim': 72,
      'glowstone': 58, 'l armour': 60, 'i armour': 72, 's armour': 82,
      'torch': 28
    };
    bonus = ranks[thing] || 35;

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
    if (thing === 'alien alloy') bonus = 98;
    if (thing === 'steel' && Number(stores.steel) < 20) bonus += 12;
    if (thing === 'iron' && Number(stores.iron) < 30) bonus += 10;
    if (thing === 'scales' && Number(stores.scales) < 30) bonus += 8;
    if (thing === 'teeth' && Number(stores.teeth) < 20) bonus += 6;

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
    el.click();
    lastAction = Date.now();
    return true;
  }

  function eventChoiceScore(el, info) {
    var label = norm((el.innerText || el.textContent) + ' ' + el.id);
    var value = 0;
    // Prefer non-violent, useful outcomes and progress; avoid paying scarce
    // resources for vague outcomes when a clear reward is available.
    if (/take all|take everything|collect all|loot_takeeverything/.test(label)) value += 180;
    if (/leave|return|escape|retreat|run away/.test(label)) value -= 15;
    if (/fight|attack|kill|hunt/.test(label)) value += 12;
    if (/help|save|rescue|free|protect/.test(label)) value += 28;
    if (/trade|buy|purchase|give|pay|offer/.test(label)) value -= 8;
    if (/steal|rob|threaten|insult|betray/.test(label)) value -= 24;
    if (/ignore|refuse|decline|turn him away/.test(label)) value -= 12;
    if (/spare|help|rescue|give medicine|heal|cure|repair|fix/.test(label)) value += 16;
    if (/hang him|kill|execute/.test(label)) value -= 16;
    if (/continue|next|leave cave|go home/.test(label)) value += 5;

    if (info) {
      var reward = info.reward || {};
      Object.keys(reward).forEach(function (key) {
        var n = Number(reward[key]) || 0;
        value += n * (/fur|teeth|scale|bait|meat|herb|medicine|medicine|iron|steel|leather|cloth|torch|cured meat|water/.test(key) ? 3 : 1);
      });
      var cost = info.cost || {};
      Object.keys(cost).forEach(function (key) {
        var n = Number(cost[key]) || 0;
        var available = window.Path && Path.outfit ? Number(Path.outfit[key]) || 0 : 0;
        value -= n * (available <= n * 2 ? 8 : 2);
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

    // Combat: heal only when needed, then use the strongest affordable
    // attack that is off cooldown. Native combat logic still controls damage.
    if (enemy && visible(enemy)) {
      var player = panel.querySelector('#wanderer');
      var hp = player && Number(window.jQuery ? jQuery(player).data('hp') : player.getAttribute('data-hp'));
      var maxHp = window.World && typeof World.getMaxHealth === 'function' ? World.getMaxHealth() : 0;
      if (hp > 0 && maxHp > 0 && hp / maxHp <= 0.38) {
        var heal = Array.prototype.slice.call(panel.querySelectorAll('#healButtons .button, #buttons #eat, #buttons #meds, #buttons #hypo'))
          .filter(ready)
          .sort(function(a,b) {
            var rank = function(el) { return el.id === 'hypo' ? 3 : el.id === 'meds' ? 2 : el.id === 'eat' ? 1 : 0; };
            return rank(b) - rank(a);
          })[0];
        if (heal) return clickReady(heal);
      }
      var attacks = Array.prototype.slice.call(panel.querySelectorAll('#attackButtons .button, .weaponButton, #attack_fists')).filter(ready);
      attacks.sort(function(a,b) {
        function attackValue(el) {
          var name = el.id.replace(/^attack_/, '').replace(/-/g, ' ');
          var weapon = window.World && World.Weapons && World.Weapons[name];
          if (!weapon) return el.id === 'attack_fists' ? 1 : 0;
          var cost = weapon.cost || {};
          var scarcity = Object.keys(cost).reduce(function(sum,key) {
            var have = window.Path && Path.outfit ? Number(Path.outfit[key]) || 0 : 0;
            return sum + (have <= (Number(cost[key]) || 0) * 2 ? 8 : 0);
          },0);
          return (Number(weapon.damage) || 0) / Math.max(Number(weapon.cooldown) || 1, 1) - scarcity;
        }
        return attackValue(b) - attackValue(a);
      });
      if (attacks.length) return clickReady(attacks[0]);
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

  function tick() {
    if (!enabled || !document.body || (window.Engine && Engine.GAME_OVER)) return;
    // Resolve active random events before normal settlement/exploration actions.
    if (handleEvent()) return;
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
      return { el: el, score: score(el) };
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

  // Remember manual location changes so the autoplay loop doesn't snap back
  // to another tab on its next tick.
  document.addEventListener('click', function (event) {
    var tab = event.target && event.target.closest ? event.target.closest('.headerButton') : null;
    if (tab) lastManualNavigation = Date.now();
  }, true);

  document.addEventListener('keydown', function (event) {
    if (!(event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'p') || event.repeat) return;
    event.preventDefault();
    setEnabled(!enabled);
  });

})();
