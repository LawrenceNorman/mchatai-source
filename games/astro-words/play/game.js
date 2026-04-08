(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.MChatAIGamesSpec = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var SUPPORTED_ENGINE = 'word-grid';
  var SUPPORTED_BOARD_TYPE = 'letter-grid';
  var SUPPORTED_TURN_MODEL = 'single-player';
  var SUPPORTED_MODE = 'word-hunt';
  var SUPPORTED_INPUT_MODE = 'touch-drag-or-tap';

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function isPositiveInteger(value) {
    return Number.isInteger(value) && value > 0;
  }

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function isUppercaseWord(value) {
    return isNonEmptyString(value) && /^[A-Z]+$/.test(value);
  }

  function normalizeWord(value) {
    return String(value || '').trim().toUpperCase();
  }

  function pushError(errors, path, message) {
    errors.push(path + ': ' + message);
  }

  function canSpellWord(board, target) {
    var height = board.length;
    var width = board[0].length;
    var visited = new Set();

    function visit(row, col, index) {
      var key = row + ':' + col;
      if (visited.has(key)) {
        return false;
      }

      if (board[row][col] !== target[index]) {
        return false;
      }

      if (index === target.length - 1) {
        return true;
      }

      visited.add(key);

      for (var nextRow = Math.max(0, row - 1); nextRow <= Math.min(height - 1, row + 1); nextRow += 1) {
        for (var nextCol = Math.max(0, col - 1); nextCol <= Math.min(width - 1, col + 1); nextCol += 1) {
          if (nextRow === row && nextCol === col) {
            continue;
          }

          if (visit(nextRow, nextCol, index + 1)) {
            visited.delete(key);
            return true;
          }
        }
      }

      visited.delete(key);
      return false;
    }

    for (var row = 0; row < height; row += 1) {
      for (var col = 0; col < width; col += 1) {
        if (visit(row, col, 0)) {
          return true;
        }
      }
    }

    return false;
  }

  function validateBoardShape(board, width, height, path, errors) {
    if (!Array.isArray(board) || board.length !== height) {
      pushError(errors, path, 'must contain ' + height + ' rows');
      return;
    }

    for (var row = 0; row < board.length; row += 1) {
      if (!Array.isArray(board[row]) || board[row].length !== width) {
        pushError(errors, path + '[' + row + ']', 'must contain ' + width + ' columns');
        continue;
      }

      for (var col = 0; col < board[row].length; col += 1) {
        if (!isUppercaseWord(board[row][col]) || board[row][col].length !== 1) {
          pushError(errors, path + '[' + row + '][' + col + ']', 'must be a single uppercase letter');
        }
      }
    }
  }

  function validateGameSpec(spec) {
    var errors = [];

    if (!isObject(spec)) {
      return {
        valid: false,
        errors: ['game spec must be an object'],
      };
    }

    if (spec.schemaVersion !== 1) {
      pushError(errors, 'schemaVersion', 'must be 1');
    }

    if (spec.engine !== SUPPORTED_ENGINE) {
      pushError(errors, 'engine', 'must be "' + SUPPORTED_ENGINE + '"');
    }

    if (!isNonEmptyString(spec.id)) {
      pushError(errors, 'id', 'must be a non-empty string');
    }

    if (!isNonEmptyString(spec.title)) {
      pushError(errors, 'title', 'must be a non-empty string');
    }

    if (!isNonEmptyString(spec.genre)) {
      pushError(errors, 'genre', 'must be a non-empty string');
    }

    if (!isPositiveInteger(spec.version)) {
      pushError(errors, 'version', 'must be a positive integer');
    }

    if (!isObject(spec.board)) {
      pushError(errors, 'board', 'must be an object');
    } else {
      if (spec.board.type !== SUPPORTED_BOARD_TYPE) {
        pushError(errors, 'board.type', 'must be "' + SUPPORTED_BOARD_TYPE + '"');
      }

      if (!isPositiveInteger(spec.board.width)) {
        pushError(errors, 'board.width', 'must be a positive integer');
      }

      if (!isPositiveInteger(spec.board.height)) {
        pushError(errors, 'board.height', 'must be a positive integer');
      }
    }

    if (!isObject(spec.rules)) {
      pushError(errors, 'rules', 'must be an object');
    } else {
      if (spec.rules.turnModel !== SUPPORTED_TURN_MODEL) {
        pushError(errors, 'rules.turnModel', 'must be "' + SUPPORTED_TURN_MODEL + '"');
      }

      if (spec.rules.mode !== SUPPORTED_MODE) {
        pushError(errors, 'rules.mode', 'must be "' + SUPPORTED_MODE + '"');
      }

      if (!isNonEmptyString(spec.rules.winCondition)) {
        pushError(errors, 'rules.winCondition', 'must be a non-empty string');
      }

      if (spec.rules.loseCondition !== null && spec.rules.loseCondition !== undefined && !isNonEmptyString(spec.rules.loseCondition)) {
        pushError(errors, 'rules.loseCondition', 'must be null or a non-empty string');
      }

      if (typeof spec.rules.hints !== 'boolean') {
        pushError(errors, 'rules.hints', 'must be a boolean');
      }

      if (spec.rules.timerSeconds !== undefined && spec.rules.timerSeconds !== null && !isPositiveInteger(spec.rules.timerSeconds)) {
        pushError(errors, 'rules.timerSeconds', 'must be a positive integer when provided');
      }
    }

    if (!isObject(spec.content)) {
      pushError(errors, 'content', 'must be an object');
    } else {
      if (!isNonEmptyString(spec.content.dictionary)) {
        pushError(errors, 'content.dictionary', 'must be a non-empty string');
      }

      if (!isNonEmptyString(spec.content.puzzlePath)) {
        pushError(errors, 'content.puzzlePath', 'must be a non-empty string');
      }

      if (spec.content.locale !== undefined && !isNonEmptyString(spec.content.locale)) {
        pushError(errors, 'content.locale', 'must be a non-empty string when provided');
      }

      if (spec.content.seedWords !== undefined) {
        if (!Array.isArray(spec.content.seedWords) || spec.content.seedWords.length === 0) {
          pushError(errors, 'content.seedWords', 'must be a non-empty array when provided');
        } else {
          for (var seedIndex = 0; seedIndex < spec.content.seedWords.length; seedIndex += 1) {
            if (!isUppercaseWord(spec.content.seedWords[seedIndex])) {
              pushError(errors, 'content.seedWords[' + seedIndex + ']', 'must be uppercase A-Z');
            }
          }
        }
      }
    }

    if (!isObject(spec.ui)) {
      pushError(errors, 'ui', 'must be an object');
    } else {
      if (!isNonEmptyString(spec.ui.theme)) {
        pushError(errors, 'ui.theme', 'must be a non-empty string');
      }

      if (spec.ui.inputMode !== SUPPORTED_INPUT_MODE) {
        pushError(errors, 'ui.inputMode', 'must be "' + SUPPORTED_INPUT_MODE + '"');
      }

      if (spec.ui.instructions !== undefined && !isNonEmptyString(spec.ui.instructions)) {
        pushError(errors, 'ui.instructions', 'must be a non-empty string when provided');
      }

      if (spec.ui.themeTokens !== undefined && !isObject(spec.ui.themeTokens)) {
        pushError(errors, 'ui.themeTokens', 'must be an object when provided');
      }
    }

    if (!isObject(spec.assets)) {
      pushError(errors, 'assets', 'must be an object');
    } else {
      if (typeof spec.assets.inline !== 'boolean') {
        pushError(errors, 'assets.inline', 'must be a boolean');
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors,
    };
  }

  function validatePuzzleData(spec, puzzleData) {
    var errors = [];
    var width = spec && spec.board && spec.board.width;
    var height = spec && spec.board && spec.board.height;

    if (!isObject(puzzleData)) {
      return {
        valid: false,
        errors: ['puzzle data must be an object'],
      };
    }

    if (puzzleData.schemaVersion !== 1) {
      pushError(errors, 'schemaVersion', 'must be 1');
    }

    if (!isNonEmptyString(puzzleData.gameId)) {
      pushError(errors, 'gameId', 'must be a non-empty string');
    } else if (spec && spec.id && puzzleData.gameId !== spec.id) {
      pushError(errors, 'gameId', 'must match game spec id');
    }

    if (!Array.isArray(puzzleData.puzzles) || puzzleData.puzzles.length === 0) {
      pushError(errors, 'puzzles', 'must be a non-empty array');
    } else {
      for (var puzzleIndex = 0; puzzleIndex < puzzleData.puzzles.length; puzzleIndex += 1) {
        var puzzle = puzzleData.puzzles[puzzleIndex];
        var path = 'puzzles[' + puzzleIndex + ']';

        if (!isObject(puzzle)) {
          pushError(errors, path, 'must be an object');
          continue;
        }

        if (!isNonEmptyString(puzzle.id)) {
          pushError(errors, path + '.id', 'must be a non-empty string');
        }

        if (puzzle.title !== undefined && !isNonEmptyString(puzzle.title)) {
          pushError(errors, path + '.title', 'must be a non-empty string when provided');
        }

        validateBoardShape(puzzle.board, width, height, path + '.board', errors);

        if (!Array.isArray(puzzle.targets) || puzzle.targets.length === 0) {
          pushError(errors, path + '.targets', 'must be a non-empty array');
        } else {
          var seenTargets = new Set();

          for (var targetIndex = 0; targetIndex < puzzle.targets.length; targetIndex += 1) {
            var word = normalizeWord(puzzle.targets[targetIndex]);
            if (!isUppercaseWord(word)) {
              pushError(errors, path + '.targets[' + targetIndex + ']', 'must be uppercase A-Z');
              continue;
            }

            if (seenTargets.has(word)) {
              pushError(errors, path + '.targets[' + targetIndex + ']', 'must be unique');
              continue;
            }

            seenTargets.add(word);

            if (Array.isArray(puzzle.board) && puzzle.board.length === height) {
              if (!canSpellWord(puzzle.board, word)) {
                pushError(errors, path + '.targets[' + targetIndex + ']', 'cannot be formed from the board');
              }
            }
          }
        }

        if (puzzle.timerSeconds !== undefined && puzzle.timerSeconds !== null && !isPositiveInteger(puzzle.timerSeconds)) {
          pushError(errors, path + '.timerSeconds', 'must be a positive integer when provided');
        }

        if (puzzle.message !== undefined && !isNonEmptyString(puzzle.message)) {
          pushError(errors, path + '.message', 'must be a non-empty string when provided');
        }
      }
    }

    if (spec && spec.content && Array.isArray(spec.content.seedWords) && Array.isArray(puzzleData.puzzles) && puzzleData.puzzles[0]) {
      var targetSet = new Set((puzzleData.puzzles[0].targets || []).map(normalizeWord));
      for (var index = 0; index < spec.content.seedWords.length; index += 1) {
        var seedWord = normalizeWord(spec.content.seedWords[index]);
        if (!targetSet.has(seedWord)) {
          pushError(errors, 'content.seedWords[' + index + ']', 'must exist in the first puzzle target list');
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors,
    };
  }

  function validateGameBundle(spec, puzzleData) {
    var specResult = validateGameSpec(spec);
    var puzzleResult = specResult.valid ? validatePuzzleData(spec, puzzleData) : validatePuzzleData(spec || {}, puzzleData);
    return {
      valid: specResult.valid && puzzleResult.valid,
      errors: specResult.errors.concat(puzzleResult.errors),
      spec: specResult,
      puzzleData: puzzleResult,
    };
  }

  return {
    SUPPORTED_ENGINE: SUPPORTED_ENGINE,
    validateGameSpec: validateGameSpec,
    validatePuzzleData: validatePuzzleData,
    validateGameBundle: validateGameBundle,
  };
}));

(function (root, factory) {
  root.MChatAIGamesWordGridRuntime = factory(root.MChatAIGamesSpec);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (specApi) {
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function applyThemeTokens(element, tokens) {
    if (!tokens || typeof tokens !== 'object') {
      return;
    }

    Object.keys(tokens).forEach(function (token) {
      element.style.setProperty('--' + token, String(tokens[token]));
    });
  }

  function getStorageKeys(gameId, puzzleId, version) {
    var prefix = 'mchatai.games.' + gameId + '.v' + version + '.' + puzzleId;
    return {
      state: prefix + '.state',
      best: prefix + '.best',
    };
  }

  function getCellKey(row, col) {
    return row + ':' + col;
  }

  function areAdjacent(cellA, cellB) {
    return Math.abs(cellA.row - cellB.row) <= 1 && Math.abs(cellA.col - cellB.col) <= 1;
  }

  function normalizeSelection(selection, board) {
    return selection.map(function (cell) {
      return board[cell.row][cell.col];
    }).join('');
  }

  function clonePath(path) {
    return path.map(function (cell) {
      return {
        row: cell.row,
        col: cell.col,
      };
    });
  }

  function mountWordGridGame(container, bundle) {
    if (!container) {
      throw new Error('A container element is required.');
    }

    if (!specApi || typeof specApi.validateGameBundle !== 'function') {
      throw new Error('Spec validator is not available.');
    }

    var validation = specApi.validateGameBundle(bundle.spec, bundle.puzzleData);
    if (!validation.valid) {
      throw new Error('Invalid game bundle: ' + validation.errors.join(' | '));
    }

    var spec = bundle.spec;
    var puzzle = bundle.puzzleData.puzzles[0];
    var storageKeys = getStorageKeys(spec.id, puzzle.id, spec.version);
    var timerSeconds = puzzle.timerSeconds || spec.rules.timerSeconds || 0;
    var foundWords = [];
    var foundPaths = {};
    var selectedCells = [];
    var timeLeft = timerSeconds;
    var timerId = null;

    container.className = 'mchatai-game-shell theme-' + spec.ui.theme;
    applyThemeTokens(container, spec.ui.themeTokens);
    container.innerHTML = [
      '<section class="mchatai-game-panel">',
      '<div class="mchatai-game-header">',
      '<div>',
      '<p class="mchatai-game-eyebrow">Canonical Word Grid Runtime</p>',
      '<h1>' + escapeHtml(spec.title) + '</h1>',
      '<p class="mchatai-game-subhead">' + escapeHtml(spec.ui.instructions || puzzle.message || 'Find the target words by tapping or dragging across adjacent letters.') + '</p>',
      '</div>',
      '<div class="mchatai-game-badges">',
      '<span>' + escapeHtml(spec.genre) + '</span>',
      '<span>' + escapeHtml(spec.board.width + 'x' + spec.board.height + ' grid') + '</span>',
      '</div>',
      '</div>',
      '<div class="mchatai-status-row">',
      '<div class="mchatai-stat"><span class="mchatai-stat-label">Time Left</span><span class="mchatai-stat-value" data-role="time-left">-</span></div>',
      '<div class="mchatai-stat"><span class="mchatai-stat-label">Words Found</span><span class="mchatai-stat-value" data-role="score">0 / 0</span></div>',
      '<div class="mchatai-stat"><span class="mchatai-stat-label">Best Run</span><span class="mchatai-stat-value" data-role="best-run">0 / 0</span></div>',
      '</div>',
      '<div class="mchatai-grid-wrap">',
      '<div class="mchatai-grid" data-role="grid" aria-label="Letter grid"></div>',
      '</div>',
      '<div class="mchatai-current-word" data-role="current-word"></div>',
      '<div class="mchatai-message" data-role="message"></div>',
      '<div class="mchatai-controls">',
      '<button type="button" class="mchatai-action" data-action="submit">Submit Word</button>',
      '<button type="button" class="mchatai-action secondary" data-action="clear">Clear</button>',
      '<button type="button" class="mchatai-action secondary" data-action="restart">Restart</button>',
      '<a class="mchatai-action secondary" href="/games">More Games</a>',
      '</div>',
      '<div class="mchatai-targets">',
      '<strong>Target words</strong>',
      '<ul data-role="target-list"></ul>',
      '</div>',
      '<p class="mchatai-install-note">iPhone: open in Safari, tap Share, then Add to Home Screen. Offline play works after the first load because the site service worker caches published game bundles.</p>',
      '</section>',
    ].join('');

    var gridElement = container.querySelector('[data-role="grid"]');
    var currentWordElement = container.querySelector('[data-role="current-word"]');
    var messageElement = container.querySelector('[data-role="message"]');
    var scoreElement = container.querySelector('[data-role="score"]');
    var timeLeftElement = container.querySelector('[data-role="time-left"]');
    var bestRunElement = container.querySelector('[data-role="best-run"]');
    var targetListElement = container.querySelector('[data-role="target-list"]');
    var submitButton = container.querySelector('[data-action="submit"]');
    var clearButton = container.querySelector('[data-action="clear"]');
    var restartButton = container.querySelector('[data-action="restart"]');

    gridElement.style.setProperty('--grid-columns', String(spec.board.width));

    function setMessage(text, isError) {
      messageElement.textContent = text;
      messageElement.className = isError ? 'mchatai-message error' : 'mchatai-message';
    }

    function getBestScore() {
      return Number(localStorage.getItem(storageKeys.best) || 0);
    }

    function saveBestScore() {
      if (foundWords.length > getBestScore()) {
        localStorage.setItem(storageKeys.best, String(foundWords.length));
      }
    }

    function loadState() {
      try {
        var saved = JSON.parse(localStorage.getItem(storageKeys.state) || 'null');
        if (!saved) {
          return;
        }

        if (Array.isArray(saved.foundWords)) {
          foundWords = saved.foundWords.filter(function (word) {
            return puzzle.targets.indexOf(word) >= 0;
          });
        }

        if (saved.foundPaths && typeof saved.foundPaths === 'object') {
          Object.keys(saved.foundPaths).forEach(function (word) {
            if (foundWords.indexOf(word) >= 0 && Array.isArray(saved.foundPaths[word])) {
              foundPaths[word] = saved.foundPaths[word];
            }
          });
        }

        if (typeof saved.timeLeft === 'number' && timerSeconds > 0) {
          timeLeft = Math.max(0, saved.timeLeft);
        }
      } catch (error) {
        foundWords = [];
        foundPaths = {};
        timeLeft = timerSeconds;
      }
    }

    function saveState() {
      localStorage.setItem(storageKeys.state, JSON.stringify({
        foundWords: foundWords,
        foundPaths: foundPaths,
        timeLeft: timeLeft,
      }));
    }

    function getFoundCellKeys() {
      var keys = new Set();
      Object.keys(foundPaths).forEach(function (word) {
        foundPaths[word].forEach(function (cell) {
          keys.add(getCellKey(cell.row, cell.col));
        });
      });
      return keys;
    }

    function renderTargets() {
      targetListElement.innerHTML = '';
      puzzle.targets.forEach(function (word) {
        var item = document.createElement('li');
        item.className = foundWords.indexOf(word) >= 0 ? 'found' : '';
        item.textContent = foundWords.indexOf(word) >= 0 ? word + ' found' : word;
        targetListElement.appendChild(item);
      });
    }

    function updateCurrentWord() {
      currentWordElement.textContent = normalizeSelection(selectedCells, puzzle.board);
    }

    function updateScoreboard() {
      scoreElement.textContent = foundWords.length + ' / ' + puzzle.targets.length;
      timeLeftElement.textContent = timerSeconds > 0 ? String(timeLeft) : 'Free';
      bestRunElement.textContent = getBestScore() + ' / ' + puzzle.targets.length;
      renderTargets();
    }

    function stopTimer() {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
    }

    function startTimer() {
      if (timerSeconds <= 0) {
        return;
      }

      stopTimer();
      timerId = setInterval(function () {
        if (timeLeft <= 0) {
          stopTimer();
          setMessage('Time is up. Restart to try again.', true);
          return;
        }

        timeLeft -= 1;
        saveState();
        updateScoreboard();
      }, 1000);
    }

    function clearSelection() {
      selectedCells = [];
      updateCurrentWord();
      renderBoard();
    }

    function finishPuzzle() {
      stopTimer();
      saveBestScore();
      saveState();
      updateScoreboard();
      setMessage('Puzzle complete. Restart to play again.', false);
    }

    function submitCurrentWord() {
      var word = normalizeSelection(selectedCells, puzzle.board);
      if (!word) {
        setMessage('Pick letters first.', true);
        return;
      }

      if (puzzle.targets.indexOf(word) < 0) {
        setMessage('That word is not in this puzzle.', true);
        clearSelection();
        return;
      }

      if (foundWords.indexOf(word) >= 0) {
        setMessage('Already found.', true);
        clearSelection();
        return;
      }

      foundWords.push(word);
      foundPaths[word] = clonePath(selectedCells);
      saveBestScore();
      saveState();
      updateScoreboard();
      setMessage('Found ' + word + '.', false);
      clearSelection();

      if (foundWords.length === puzzle.targets.length) {
        finishPuzzle();
      }
    }

    function restartGame() {
      foundWords = [];
      foundPaths = {};
      selectedCells = [];
      timeLeft = timerSeconds;
      saveState();
      updateCurrentWord();
      updateScoreboard();
      setMessage(puzzle.message || 'Fresh board. Find all of the target words.', false);
      renderBoard();
      startTimer();
    }

    function renderBoard() {
      var activeKeys = new Set(selectedCells.map(function (cell) {
        return getCellKey(cell.row, cell.col);
      }));
      var foundKeys = getFoundCellKeys();

      gridElement.innerHTML = '';
      puzzle.board.forEach(function (rowLetters, row) {
        rowLetters.forEach(function (letter, col) {
          var button = document.createElement('button');
          var key = getCellKey(row, col);
          button.type = 'button';
          button.className = 'mchatai-tile';
          button.textContent = letter;
          button.setAttribute('aria-label', 'Letter ' + letter + ' at row ' + (row + 1) + ', column ' + (col + 1));

          if (activeKeys.has(key)) {
            button.classList.add('active');
          }

          if (foundKeys.has(key)) {
            button.classList.add('found');
          }

          button.addEventListener('click', function () {
            toggleCell(row, col);
          });
          button.addEventListener('pointerenter', function (event) {
            if (event.buttons === 1) {
              toggleCell(row, col);
            }
          });

          gridElement.appendChild(button);
        });
      });
    }

    function toggleCell(row, col) {
      var cell = {
        row: row,
        col: col,
      };
      var cellKey = getCellKey(row, col);
      var lastCell = selectedCells[selectedCells.length - 1];
      var alreadyIncluded = selectedCells.some(function (selected) {
        return getCellKey(selected.row, selected.col) === cellKey;
      });

      if (alreadyIncluded || foundWords.length === puzzle.targets.length || (timerSeconds > 0 && timeLeft === 0)) {
        return;
      }

      if (lastCell && !areAdjacent(lastCell, cell)) {
        setMessage('Selections must stay adjacent.', true);
        return;
      }

      selectedCells.push(cell);
      updateCurrentWord();
      renderBoard();
    }

    submitButton.addEventListener('click', submitCurrentWord);
    clearButton.addEventListener('click', clearSelection);
    restartButton.addEventListener('click', restartGame);

    loadState();
    renderBoard();
    updateCurrentWord();
    updateScoreboard();
    setMessage(puzzle.message || 'Find all of the target words.', false);

    if (foundWords.length === puzzle.targets.length) {
      finishPuzzle();
    } else if (timerSeconds <= 0 || timeLeft > 0) {
      startTimer();
    }
  }

  return {
    mountWordGridGame: mountWordGridGame,
  };
}));

(function (root) {
  var bundle = {
  "spec": {
    "schemaVersion": 1,
    "engine": "word-grid",
    "id": "astro-words",
    "title": "Astro Words",
    "genre": "word-grid-hybrid",
    "version": 1,
    "board": {
      "type": "letter-grid",
      "width": 5,
      "height": 5
    },
    "rules": {
      "turnModel": "single-player",
      "mode": "word-hunt",
      "winCondition": "find-all-target-words-before-timer-expires",
      "loseCondition": "timer-expires",
      "hints": false,
      "timerSeconds": 120
    },
    "content": {
      "dictionary": "embedded-starter",
      "locale": "en-US",
      "puzzlePath": "puzzle.json",
      "seedWords": [
        "STAR",
        "MOON",
        "MARS",
        "NOVA",
        "ORBIT"
      ]
    },
    "ui": {
      "theme": "cosmic-night",
      "inputMode": "touch-drag-or-tap",
      "instructions": "Explore the cosmos! Find space words hidden in the letter grid before time runs out.",
      "themeTokens": {
        "bg": "#0c0a1d",
        "panel": "rgba(15, 10, 40, 0.88)",
        "panel-border": "rgba(167, 139, 250, 0.2)",
        "tile": "#1e1b4b",
        "tile-active": "#7c3aed",
        "tile-found": "#312e81",
        "text": "#f5f3ff",
        "muted": "#c4b5fd",
        "accent": "#a78bfa",
        "danger": "#fb7185",
        "button-text": "#0c0a1d"
      }
    },
    "assets": {
      "inline": true
    }
  },
  "puzzleData": {
    "schemaVersion": 1,
    "gameId": "astro-words",
    "puzzles": [
      {
        "id": "launch-pad",
        "title": "Launch Pad",
        "board": [
          [
            "S",
            "T",
            "A",
            "R",
            "K"
          ],
          [
            "N",
            "O",
            "V",
            "A",
            "W"
          ],
          [
            "M",
            "O",
            "O",
            "N",
            "D"
          ],
          [
            "M",
            "A",
            "R",
            "S",
            "E"
          ],
          [
            "O",
            "R",
            "B",
            "I",
            "T"
          ]
        ],
        "targets": [
          "STAR",
          "NOVA",
          "MOON",
          "MARS",
          "ORBIT"
        ],
        "timerSeconds": 120,
        "message": "Find STAR, NOVA, MOON, MARS, and ORBIT."
      }
    ]
  }
};
  function mount() {
    var rootElement = document.querySelector('[data-mchatai-game-root]');
    if (!rootElement) {
      return;
    }
    try {
      root.MChatAIGamesWordGridRuntime.mountWordGridGame(rootElement, bundle);
    } catch (error) {
      rootElement.className = 'mchatai-game-shell';
      rootElement.innerHTML = '<section class="mchatai-game-panel"><h1>Game Load Failed</h1><p class="mchatai-game-subhead">' + error.message + '</p></section>';
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
