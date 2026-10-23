(function () {
  'use strict';

  var overlay = null;
  var statusNode = null;
  var resourceSelect, resourceAmount, buildingSelect, buildingAmount, populationAmount;
  var ADMIN_MAX = 1000000;
  var knownResources = [
    'wood', 'fur', 'meat', 'cured meat', 'bait', 'scales', 'teeth', 'cloth',
    'leather', 'iron', 'coal', 'sulphur', 'steel', 'medicine', 'bullets',
    'energy cell', 'alien alloy', 'compass', 'rucksack', 'wagon', 'convoy',
    'water tank', 'cask', 'waterskin', 'torch', 'trap', 'bone spear', 'l armour',
    'i armour', 's armour', 'iron sword', 'steel sword', 'rifle', 'bolas',
    'grenade', 'bayonet', 'glowstone', 'hypo', 'stim', 'kinetic armour',
    'cargo drone', 'fluid recycler', 'plasma rifle', 'energy blade', 'disruptor'
  ];
  var knownBuildings = [
    'hut', 'trap', 'cart', 'lodge', 'trading post', 'tannery',
    'smokehouse', 'workshop', 'steelworks', 'armoury'
  ];

  function el(tag, text, className) {
    var node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function addButton(parent, label, action, extraClass) {
    var node = el('button', label, 'adr-admin-action' + (extraClass ? ' ' + extraClass : ''));
    node.type = 'button';
    node.addEventListener('click', action);
    parent.appendChild(node);
    return node;
  }

  function row(parent) {
    var node = el('div', null, 'adr-admin-row');
    parent.appendChild(node);
    return node;
  }

  function addOptions(select, values, preferred) {
    select.textContent = '';
    values.forEach(function (value) {
      var option = el('option', value);
      option.value = value;
      select.appendChild(option);
    });
    if (preferred && values.indexOf(preferred) >= 0) select.value = preferred;
  }

  function resourceNames() {
    var values = knownResources.slice();
    if (window.$SM && typeof $SM.get === 'function') {
      var stores = $SM.get('stores') || {};
      Object.keys(stores).forEach(function (key) {
        if (typeof stores[key] === 'number' && values.indexOf(key) < 0) values.push(key);
      });
    }
    if (window.Room) {
      [Room.TradeGoods, Room.Craftables].forEach(function (catalog) {
        Object.keys(catalog || {}).forEach(function (key) {
          var item = catalog[key];
          if (item && item.type !== 'building' && values.indexOf(key) < 0) values.push(key);
        });
      });
    }
    if (window.Fabricator && Fabricator.Craftables) {
      Object.keys(Fabricator.Craftables).forEach(function (key) {
        if (values.indexOf(key) < 0) values.push(key);
      });
    }
    return values.sort();
  }

  function buildingNames() {
    var values = knownBuildings.slice();
    if (window.Room && Room.Craftables) {
      Object.keys(Room.Craftables).forEach(function (key) {
        if (Room.Craftables[key] && Room.Craftables[key].type === 'building' && values.indexOf(key) < 0) {
          values.push(key);
        }
      });
    }
    return values.sort();
  }

  function report(message, isError) {
    if (!statusNode) return;
    statusNode.textContent = message;
    statusNode.style.color = isError ? '#ff9292' : '#c8e6a0';
  }

  function ready() {
    if (!window.$SM || typeof $SM.get !== 'function' || typeof $SM.set !== 'function') {
      report('The game state is not ready yet. Try again after the game loads.', true);
      return false;
    }
    return true;
  }

  function amount(input, fallback, maximum) {
    var value = Number(input.value);
    if (!isFinite(value)) value = fallback;
    return Math.max(0, Math.min(maximum || ADMIN_MAX, Math.floor(value)));
  }

  function updateViews() {
    try {
      if (window.Room) {
        if (typeof Room.updateStoresView === 'function') Room.updateStoresView();
        if (typeof Room.updateBuildButtons === 'function') Room.updateBuildButtons();
        if (typeof Room.updateButton === 'function') Room.updateButton();
      }
      if (window.Outside) {
        if (typeof Outside.updateVillage === 'function') Outside.updateVillage();
        if (typeof Outside.updateWorkersView === 'function') Outside.updateWorkersView();
        if (typeof Outside.updateVillageIncome === 'function') Outside.updateVillageIncome();
        if (typeof Outside.updateTrapButton === 'function') Outside.updateTrapButton();
      }
      if (window.World && window.Engine && Engine.activeModule === World &&
          typeof World.updateSupplies === 'function') World.updateSupplies();
      if (window.Engine && typeof Engine.saveGame === 'function') Engine.saveGame();
    } catch (error) {
      report('Change applied, but a display refresh failed: ' + error.message, true);
    }
  }

  function refreshSelectors() {
    if (resourceSelect) {
      var oldResource = resourceSelect.value || 'wood';
      addOptions(resourceSelect, resourceNames(), oldResource);
    }
    if (buildingSelect) {
      var oldBuilding = buildingSelect.value || 'hut';
      addOptions(buildingSelect, buildingNames(), oldBuilding);
    }
  }

  function editResource(mode) {
    if (!ready()) return;
    var name = resourceSelect.value;
    var value = amount(resourceAmount, 100, ADMIN_MAX);
    var stores = $SM.get('stores') || {};
    if (!name) return;

    if (mode === 'add') {
      $SM.set('stores["' + name + '"]', Math.min(ADMIN_MAX, (Number(stores[name]) || 0) + value));
      report('Added ' + value.toLocaleString() + ' ' + name + '.');
    } else if (mode === 'set') {
      $SM.set('stores["' + name + '"]', value);
      report('Set ' + name + ' to ' + value.toLocaleString() + '.');
    } else if (mode === 'max') {
      $SM.set('stores["' + name + '"]', ADMIN_MAX);
      report('Set ' + name + ' to ' + ADMIN_MAX.toLocaleString() + '.');
    } else if (mode === 'zero') {
      $SM.set('stores["' + name + '"]', 0);
      report('Set ' + name + ' to 0.');
    }
    updateViews();
    refreshSelectors();
  }

  function addAllResources() {
    if (!ready()) return;
    var stores = $SM.get('stores') || {};
    var updates = {};
    resourceNames().forEach(function (name) {
      updates[name] = Math.min(ADMIN_MAX, (Number(stores[name]) || 0) + 1000);
    });
    $SM.setM('stores', updates);
    updateViews();
    refreshSelectors();
    report('Added up to 1,000 of every known resource and item.');
  }

  function editBuilding(mode) {
    if (!ready()) return;
    var name = buildingSelect.value;
    var count = amount(buildingAmount, 1, 10000);
    var buildings = $SM.get('game.buildings') || {};
    var old = Number(buildings[name]) || 0;
    var next = mode === 'add' ? Math.min(10000, old + count) : count;
    $SM.set('game.buildings["' + name + '"]', next);
    if (window.Outside && typeof Outside.checkWorker === 'function') Outside.checkWorker(name);
    updateViews();
    report(mode === 'add' ? 'Added ' + count + ' ' + name + ' building(s).' : 'Set ' + name + ' count to ' + next + '.');
  }

  function editPopulation(mode) {
    if (!ready()) return;
    var count = amount(populationAmount, 10, 10000);
    var old = Number($SM.get('game.population')) || 0;
    var next = mode === 'add' ? Math.min(10000, old + count) : count;
    $SM.set('game.population', next);
    updateViews();
    report('Population set to ' + next + '.');
  }

  function restoreSupplies() {
    if (!ready()) return;
    if (window.World && typeof World.setHp === 'function' && typeof World.getMaxHealth === 'function') {
      World.setHp(World.getMaxHealth());
    }
    if (window.World && typeof World.setWater === 'function' && typeof World.getMaxWater === 'function') {
      World.setWater(World.getMaxWater());
    }
    if (window.Path && Path.outfit) {
      Path.outfit['cured meat'] = Math.max(Number(Path.outfit['cured meat']) || 0, 100);
      Path.outfit.medicine = Math.max(Number(Path.outfit.medicine) || 0, 10);
      Path.outfit.hypo = Math.max(Number(Path.outfit.hypo) || 0, 5);
      Path.outfit.bullets = Math.max(Number(Path.outfit.bullets) || 0, 100);
      Path.outfit['energy cell'] = Math.max(Number(Path.outfit['energy cell']) || 0, 50);
      $SM.set('outfit', Path.outfit);
    }
    updateViews();
    report('Restored health, water, and expedition supplies.');
  }

  function unlockCraftingAndTrading() {
    if (!ready()) return;
    $SM.set('game.builder.level', 4);
    var buildings = $SM.get('game.buildings') || {};
    if (!(Number(buildings.workshop) > 0)) $SM.set('game.buildings["workshop"]', 1);
    if (!(Number(buildings['trading post']) > 0)) $SM.set('game.buildings["trading post"]', 1);
    if (window.Room) {
      Room.buttons = Room.buttons || {};
      Object.keys(Room.Craftables || {}).forEach(function (key) { Room.buttons[key] = true; });
      Object.keys(Room.TradeGoods || {}).forEach(function (key) { Room.buttons[key] = true; });
    }
    updateViews();
    report('Unlocked builder level 4, workshop, trading post, and their menus.');
  }

  function clearCooldowns() {
    if (!ready()) return;
    var count = 0;
    if (window.Button && typeof Button.clearCooldown === 'function' && window.jQuery) {
      Array.prototype.slice.call(document.querySelectorAll('.button, button'))
        .filter(function (node) { return !node.closest('#adrAdminPanel'); })
        .forEach(function (node) {
          try {
            Button.clearCooldown(window.jQuery(node));
            count++;
          } catch (error) {}
        });
    }
    updateViews();
    report('Cleared cooldowns on ' + count + ' game controls.');
  }

  function closePanel() {
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function openPanel() {
    if (!overlay) createPanel();
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    refreshSelectors();
    report('Admin menu open. Changes use the game state manager and save normally.');
    var first = overlay.querySelector('button, select, input');
    if (first) first.focus();
  }

  function togglePanel() {
    if (overlay && !overlay.hidden) closePanel();
    else openPanel();
  }

  function createPanel() {
    var style = el('style');
    style.textContent =
      '#adrAdminOverlay{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font-family:monospace;color:#ddd}' +
      '#adrAdminPanel{width:min(780px,100%);max-height:92vh;overflow:auto;background:#171717;border:1px solid #777;box-shadow:0 12px 50px #000;padding:18px;box-sizing:border-box}' +
      '#adrAdminPanel *{box-sizing:border-box}' +
      '#adrAdminPanel .adr-admin-header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #555;padding-bottom:10px;margin-bottom:12px;gap:12px}' +
      '#adrAdminPanel h2{font-size:20px;letter-spacing:2px;margin:0;color:#eee}' +
      '#adrAdminPanel h3{font-size:14px;margin:0 0 10px;color:#ddd;text-transform:uppercase;letter-spacing:1px}' +
      '#adrAdminPanel .adr-admin-hint{color:#aaa;font-size:12px;line-height:1.5;margin:6px 0 12px}' +
      '#adrAdminPanel .adr-admin-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}' +
      '#adrAdminPanel .adr-admin-section{border:1px solid #444;padding:12px;margin:10px 0;background:#1d1d1d;min-width:0}' +
      '#adrAdminPanel .adr-admin-row{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}' +
      '#adrAdminPanel select,#adrAdminPanel input{min-width:0;max-width:100%;padding:8px;background:#101010;color:#eee;border:1px solid #555;border-radius:2px;font:inherit;flex:1 1 120px}' +
      '#adrAdminPanel button{padding:8px 10px;background:#292929;color:#eee;border:1px solid #666;border-radius:2px;font:inherit;cursor:pointer}' +
      '#adrAdminPanel button:hover{background:#3a3a3a;border-color:#aaa}' +
      '#adrAdminPanel .adr-admin-close{font-size:20px;line-height:1;padding:5px 10px}' +
      '#adrAdminStatus{padding:9px;border-left:3px solid #9dbc75;background:#20251c;color:#c8e6a0;min-height:34px;font-size:12px;line-height:1.5;margin-bottom:10px}' +
      '@media(max-width:560px){#adrAdminPanel .adr-admin-grid{grid-template-columns:1fr}#adrAdminPanel{padding:12px;max-height:95vh}#adrAdminPanel h2{font-size:16px}}';
    document.head.appendChild(style);

    overlay = el('div');
    overlay.id = 'adrAdminOverlay';
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    var panel = el('div');
    panel.id = 'adrAdminPanel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'adrAdminTitle');

    var header = el('div', null, 'adr-admin-header');
    var title = el('h2', 'A DARK ROOM // ADMIN');
    title.id = 'adrAdminTitle';
    header.appendChild(title);
    var close = addButton(header, '×', closePanel, 'adr-admin-close');
    close.setAttribute('aria-label', 'Close admin menu');
    panel.appendChild(header);
    panel.appendChild(el('p', 'Developer controls. Resource, settlement, and progression changes affect this browser save.', 'adr-admin-hint'));

    statusNode = el('div', 'Ready. Press Ctrl+O to close this panel.');
    statusNode.id = 'adrAdminStatus';
    statusNode.setAttribute('role', 'status');
    statusNode.setAttribute('aria-live', 'polite');
    panel.appendChild(statusNode);

    var grid = el('div', null, 'adr-admin-grid');

    var resources = el('section', null, 'adr-admin-section');
    resources.appendChild(el('h3', 'Resources & items'));
    resourceSelect = el('select');
    resourceSelect.setAttribute('aria-label', 'Resource or item');
    resourceAmount = el('input');
    resourceAmount.type = 'number';
    resourceAmount.min = '0';
    resourceAmount.max = String(ADMIN_MAX);
    resourceAmount.step = '1';
    resourceAmount.value = '100';
    resourceAmount.setAttribute('aria-label', 'Resource amount');
    var resourceRow = row(resources);
    resourceRow.appendChild(resourceSelect);
    resourceRow.appendChild(resourceAmount);
    var resourceActions = row(resources);
    addButton(resourceActions, 'Add amount', function () { editResource('add'); });
    addButton(resourceActions, 'Set amount', function () { editResource('set'); });
    addButton(resourceActions, 'Set to 1M', function () { editResource('max'); });
    addButton(resourceActions, 'Set to 0', function () { editResource('zero'); });
    addButton(resources, 'Add 1,000 to all resources/items', addAllResources);
    grid.appendChild(resources);

    var settlement = el('section', null, 'adr-admin-section');
    settlement.appendChild(el('h3', 'Settlement'));
    buildingSelect = el('select');
    buildingSelect.setAttribute('aria-label', 'Building');
    buildingAmount = el('input');
    buildingAmount.type = 'number';
    buildingAmount.min = '0';
    buildingAmount.max = '10000';
    buildingAmount.step = '1';
    buildingAmount.value = '1';
    buildingAmount.setAttribute('aria-label', 'Building amount');
    var buildingRow = row(settlement);
    buildingRow.appendChild(buildingSelect);
    buildingRow.appendChild(buildingAmount);
    var buildingActions = row(settlement);
    addButton(buildingActions, 'Add buildings', function () { editBuilding('add'); });
    addButton(buildingActions, 'Set building count', function () { editBuilding('set'); });
    populationAmount = el('input');
    populationAmount.type = 'number';
    populationAmount.min = '0';
    populationAmount.max = '10000';
    populationAmount.step = '1';
    populationAmount.value = '10';
    populationAmount.setAttribute('aria-label', 'Population count');
    var populationRow = row(settlement);
    populationRow.appendChild(populationAmount);
    addButton(populationRow, 'Set population', function () { editPopulation('set'); });
    addButton(populationRow, 'Add villagers', function () { editPopulation('add'); });
    grid.appendChild(settlement);
    panel.appendChild(grid);

    var controls = el('section', null, 'adr-admin-section');
    controls.appendChild(el('h3', 'Game controls'));
    var controlRow = row(controls);
    addButton(controlRow, 'Restore health & water', restoreSupplies);
    addButton(controlRow, 'Unlock crafting & trading', unlockCraftingAndTrading);
    addButton(controlRow, 'Clear game cooldowns', clearCooldowns);
    panel.appendChild(controls);

    overlay.appendChild(panel);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closePanel();
    });
    document.body.appendChild(overlay);
    refreshSelectors();
  }

  document.addEventListener('keydown', function (event) {
    if (event.ctrlKey && !event.altKey && !event.metaKey &&
        event.key.toLowerCase() === 'o' && !event.repeat) {
      event.preventDefault();
      event.stopPropagation();
      togglePanel();
      return;
    }
    if (event.key === 'Escape' && overlay && !overlay.hidden) {
      event.preventDefault();
      closePanel();
    }
  }, true);
})();