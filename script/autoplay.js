(function () {
  'use strict';

  // Optional, reversible helper. It uses the game's own buttons and cooldowns;
  // it never edits save data or bypasses the game's resource costs.
  var enabled = false;
  var timer = null;
  var lastAction = 0;
  function setEnabled(value) {
    enabled = value;
    if (enabled) {
      if (!timer) timer = window.setInterval(tick, 1200);
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
    ['stoke fire', 120], ['add fuel', 115], ['gather wood', 110],
    ['check traps', 108], ['collect', 95], ['return home', 94],
    ['return to village', 94], ['embark', 92], ['explore', 90],
    ['build hut', 88], ['build cart', 86], ['build trap', 84],
    ['build lodge', 82], ['build trading post', 80], ['build workshop', 78],
    ['build tannery', 76], ['build smokehouse', 75], ['build steelworks', 74],
    ['build armoury', 73], ['craft', 70], ['make', 65],
    ['upgrade', 62], ['train', 60], ['hire', 58],
    ['gather', 55], ['hunt', 52], ['scavenge', 50],
    ['attack', 48], ['fight', 47], ['continue', 45], ['next', 42],
    ['trade', 38], ['buy', 35], ['sell', 30], ['leave', 20]
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
    return best;
  }

  function tick() {
    if (!enabled || !document.body || (window.Engine && Engine.GAME_OVER)) return;
    // Prefer buttons in the current view; the game's own disabled state
    // prevents spending resources that are unavailable.
    var candidates = Array.prototype.slice.call(document.querySelectorAll(
      '.button, button, a.button, [role="button"]'
    )).filter(function (el) {
      return visible(el) && !el.classList.contains('disabled') &&
        !el.hasAttribute('disabled') && !el.closest('.menu');
    }).map(function (el) {
      return { el: el, score: score(el) };
    }).filter(function (item) { return item.score > 0; });

    candidates.sort(function (a, b) {
      return b.score - a.score;
    });

    if (candidates.length) {
      var chosen = candidates[0].el;
      // Keep a human-like cadence rather than firing every available action
      // in one frame. Native cooldowns handle the actual game timing.
      if (Date.now() - lastAction >= 1000) {
        chosen.click();
        lastAction = Date.now();
      }
    }
  }

  document.addEventListener('keydown', function (event) {
    if (!(event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'p') || event.repeat) return;
    event.preventDefault();
    setEnabled(!enabled);
  });

})();
