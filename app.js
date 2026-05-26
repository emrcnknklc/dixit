(function () {
  "use strict";

  const STORAGE_KEY = "dixitLocalGameState";
  const SETTINGS_KEY = "dixitLocalGameSettings";
  const MAX_SCORE = 30;
  const CARD_COUNT = 108;
  const CARD_FOLDER = "assets/cards";
  const CARD_BACK_IMAGE = `${CARD_FOLDER}/card-back.webp`;

  const defaultSettings = {
    playerCount: 4,
    maxScore: MAX_SCORE,
    cardsPerPlayer: 6,
    soundEnabled: false,
    timerEnabled: false
  };

  const colorOptions = ["#c84848", "#2f6f73", "#4f63a6", "#9b6a2f", "#d39b36", "#7b4fa3", "#2f8f5b"];
  const playerColors = colorOptions.slice(0, 4);

  const scorePositions = [
    { score: 0, x: 60.7, y: 70.1 },
    { score: 1, x: 52.5, y: 54.5 },
    { score: 2, x: 55.5, y: 44.5 },
    { score: 3, x: 39, y: 46 },
    { score: 4, x: 20, y: 43.5 },
    { score: 5, x: 13.5, y: 54.5 },
    { score: 6, x: 24, y: 62.5 },
    { score: 7, x: 15.5, y: 72.5 },
    { score: 8, x: 32, y: 82.5 },
    { score: 9, x: 14.5, y: 90 },
    { score: 10, x: 32, y: 96 },
    { score: 11, x: 46, y: 90.5 },
    { score: 12, x: 61, y: 87 },
    { score: 13, x: 75, y: 95 },
    { score: 14, x: 90, y: 90 },
    { score: 15, x: 86, y: 77 },
    { score: 16, x: 96, y: 66.5 },
    { score: 17, x: 78, y: 59 },
    { score: 18, x: 77, y: 51.5 },
    { score: 19, x: 89, y: 43 },
    { score: 20, x: 95, y: 30.5 },
    { score: 21, x: 83, y: 18 },
    { score: 22, x: 91, y: 7.5 },
    { score: 23, x: 78, y: 7.5 },
    { score: 24, x: 62, y: 17.5 },
    { score: 25, x: 49, y: 15 },
    { score: 26, x: 42, y: 8.5 },
    { score: 27, x: 27, y: 9.5 },
    { score: 28, x: 12.5, y: 10 },
    { score: 29, x: 12, y: 22 },
    { score: 30, x: 28, y: 26.5 }
  ];

  const app = document.getElementById("app");
  const memoryStorage = new Map();
  let gameState = null;
  let settings = loadSettings();
  let currentView = "home";
  let toastMessage = "";
  let modal = null;
  let centerCardsRevealed = false;
  let shuffleAnimating = false;
  let setupDraft = createSetupDraft();

  function loadSettings() {
    try {
      const saved = readStorage(SETTINGS_KEY);
      return saved ? { ...defaultSettings, ...JSON.parse(saved) } : { ...defaultSettings };
    } catch {
      return { ...defaultSettings };
    }
  }

  function saveSettings() {
    writeStorage(SETTINGS_KEY, JSON.stringify(settings));
  }

  function loadGame() {
    try {
      const saved = readStorage(STORAGE_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (isLegacyPlaceholderGame(parsed)) return { legacyInvalid: true };
      return normalizeGameState(parsed);
    } catch {
      return null;
    }
  }

  function saveGame() {
    if (!gameState) return;
    writeStorage(STORAGE_KEY, JSON.stringify(gameState));
  }

  function clearSavedGame() {
    removeStorage(STORAGE_KEY);
  }

  function readStorage(key) {
    try {
      return globalThis.localStorage.getItem(key);
    } catch {
      return memoryStorage.has(key) ? memoryStorage.get(key) : null;
    }
  }

  function writeStorage(key, value) {
    try {
      globalThis.localStorage.setItem(key, value);
    } catch {
      memoryStorage.set(key, value);
    }
  }

  function removeStorage(key) {
    try {
      globalThis.localStorage.removeItem(key);
    } catch {
      memoryStorage.delete(key);
    }
  }

  function normalizeGameState(state) {
    const playedCards = Array.isArray(state.playedCards) ? state.playedCards : [];
    const discardPile = Array.isArray(state.discardPile) ? state.discardPile : [];
    const players = normalizePlayersForSavedState(Array.isArray(state.players) ? state.players : [], playedCards, discardPile);
    const usedDeckIds = new Set([
      ...players.flatMap((player) => Array.isArray(player.handCards) ? player.handCards : []),
      ...playedCards,
      ...discardPile
    ].map((card) => getBaseCardId(card)));
    const deck = removeBlockedCardsFromDeck(Array.isArray(state.deck) ? state.deck : [], usedDeckIds);

    return {
      players,
      currentRound: Number(state.currentRound) || 1,
      currentStorytellerPlayerId: Number(state.currentStorytellerPlayerId) || 1,
      selectedPlayerId: state.selectedPlayerId == null ? null : Number(state.selectedPlayerId),
      spectatorMode: Boolean(state.spectatorMode),
      playedCards,
      deck,
      votingMode: Boolean(state.votingMode),
      selectedVoterPlayerId: state.selectedVoterPlayerId == null ? null : Number(state.selectedVoterPlayerId),
      votes: Array.isArray(state.votes) ? state.votes : [],
      roundResolved: Boolean(state.roundResolved),
      roundScoreSummary: state.roundScoreSummary || null,
      discardPile,
      isGameStarted: Boolean(state.isGameStarted),
      isGameFinished: Boolean(state.isGameFinished)
    };
  }

  function createSetupDraft() {
    return Array.from({ length: 4 }, (_, index) => ({
      id: index + 1,
      name: "",
      color: playerColors[index]
    }));
  }

  function createNewGame(playersDraft) {
    const deck = shuffleDeck(createDeck());
    const players = playersDraft.map((draft, index) => ({
      id: index + 1,
      name: draft.name.trim() || `${index + 1} Player`,
      color: draft.color || playerColors[index],
      score: 0,
      handCards: dealCards(index + 1, settings.cardsPerPlayer, deck, false, new Set())
    }));

    return {
      players,
      currentRound: 1,
      currentStorytellerPlayerId: 1,
      selectedPlayerId: null,
      spectatorMode: false,
      playedCards: [],
      deck,
      votingMode: false,
      selectedVoterPlayerId: null,
      votes: [],
      roundResolved: false,
      roundScoreSummary: null,
      discardPile: [],
      isGameStarted: true,
      isGameFinished: false
    };
  }

  function normalizePlayer(player) {
    const migratedName = String(player?.name || "").trim().replace(/^Player\s+([1-4])$/i, "$1 Player");
    return {
      ...player,
      name: migratedName || `${player.id} Player`
    };
  }

  function normalizePlayersForSavedState(players, playedCards, discardPile) {
    const discardIds = new Set(discardPile.map((card) => getBaseCardId(card)).filter(Boolean));
    const playedIds = new Set(playedCards.map((card) => getBaseCardId(card)).filter(Boolean));
    const seenHandIds = new Set();
    return players.map((player) => {
      const normalized = normalizePlayer(player);
      const handCards = (Array.isArray(normalized.handCards) ? normalized.handCards : []).filter((card) => {
        const cardId = getBaseCardId(card);
        if (!cardId) return false;
        if (discardIds.has(cardId)) return false;
        if (seenHandIds.has(cardId) && !playedIds.has(cardId)) return false;
        seenHandIds.add(cardId);
        return true;
      });
      return { ...normalized, handCards };
    });
  }

  function createDeck() {
    return Array.from({ length: CARD_COUNT }, (_, index) => {
      const cardId = `card-${String(index + 1).padStart(3, "0")}`;
      return {
        id: cardId,
        image: `${CARD_FOLDER}/${cardId}.webp`,
        ownerPlayerId: null,
        isPlayed: false,
        isSelected: false,
        isNew: false
      };
    });
  }

  function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function createGalleryCards() {
    return createDeck().map((card) => ({
      ...card,
      ownerPlayerId: null,
      isPlayed: false,
      isSelected: false,
      isNew: false
    }));
  }

  function dealCards(playerId, count, deck, isNew, blockedIds = new Set()) {
    const drawn = [];
    while (drawn.length < count && deck.length) {
      const card = deck.shift();
      const cardId = getBaseCardId(card);
      if (!cardId || blockedIds.has(cardId)) continue;
      blockedIds.add(cardId);
      drawn.push(card);
    }
    return drawn.map((card) => ({
      ...card,
      ownerPlayerId: playerId,
      isPlayed: false,
      isSelected: false,
      isNew
    }));
  }

  function selectPlayer(playerId) {
    if (!gameState) return;
    if (gameState.votingMode) {
      if (playerId === gameState.currentStorytellerPlayerId) return;
      gameState.selectedVoterPlayerId = playerId;
      saveGame();
      render();
      return;
    }
    gameState.selectedPlayerId = playerId;
    clearHandSelections();
    saveGame();
    render();
  }

  function toggleSpectatorMode(enabled) {
    if (!gameState) return;
    gameState.spectatorMode = enabled;
    if (enabled) {
      gameState.selectedPlayerId = null;
      clearHandSelections();
    }
    saveGame();
    render();
  }

  function selectCard(playerId, cardId) {
    if (!gameState || gameState.spectatorMode || gameState.selectedPlayerId !== playerId) return;
    const player = getPlayer(playerId);
    const currentCard = player?.handCards.find((card) => card.id === cardId);
    if (currentCard?.isSelected && !currentCard.isPlayed) {
      openCardPreview(currentCard);
      return;
    }
    gameState.players = gameState.players.map((player) => {
      if (player.id !== playerId) return player;
      return {
        ...player,
        handCards: player.handCards.map((card) => ({
          ...card,
          isSelected: card.id === cardId ? !card.isSelected : false,
          isNew: card.id === cardId ? false : card.isNew
        }))
      };
    });
    saveGame();
    render();
  }

  function playSelectedCard() {
    if (!gameState || gameState.spectatorMode) return;
    if (gameState.roundResolved) return;
    const player = getPlayer(gameState.selectedPlayerId);
    if (!player) return;
    if (gameState.playedCards.length === 0 && player.id !== gameState.currentStorytellerPlayerId) {
      showToast("Önce anlatıcı kartını oynamalı.");
      return;
    }
    if (gameState.playedCards.some((card) => card.ownerPlayerId === player.id)) {
      showToast("Bu round için zaten kart oynadın.");
      return;
    }
    const selectedCard = player.handCards.find((card) => card.isSelected && !card.isPlayed);
    if (!selectedCard) {
      showToast("Önce açık elde bir kart seç.");
      return;
    }

    gameState.players = gameState.players.map((currentPlayer) => {
      if (currentPlayer.id !== player.id) return currentPlayer;
      return {
        ...currentPlayer,
        handCards: currentPlayer.handCards.map((card) =>
          card.id === selectedCard.id ? { ...card, isPlayed: true, isSelected: false } : card
        )
      };
    });

    gameState.playedCards = [
      ...gameState.playedCards,
      { ...selectedCard, isPlayed: true, isSelected: false }
    ];
    centerCardsRevealed = false;
    saveGame();
    render();
  }

  function revealCenterCards() {
    centerCardsRevealed = true;
    render();
  }

  function toggleCenterCards() {
    if (!gameState?.playedCards.length) return;
    const willOpen = !centerCardsRevealed;
    centerCardsRevealed = willOpen;
    if (!centerCardsRevealed) {
      gameState.votingMode = false;
      gameState.selectedVoterPlayerId = null;
      gameState.selectedPlayerId = null;
    }
    saveGame();
    render();
  }

  function canStartVoting() {
    return Boolean(
      gameState &&
      gameState.spectatorMode &&
      centerCardsRevealed &&
      !gameState.roundResolved &&
      gameState.playedCards.length === gameState.players.length &&
      gameState.players.every((player) => gameState.playedCards.some((card) => card.ownerPlayerId === player.id))
    );
  }

  function allVotesCast() {
    if (!gameState) return false;
    return gameState.players
      .filter((player) => player.id !== gameState.currentStorytellerPlayerId)
      .every((player) => gameState.votes.some((vote) => vote.voterPlayerId === player.id));
  }

  function toggleVotingMode() {
    if (!canStartVoting() && !gameState?.votingMode) return;
    gameState.votingMode = !gameState.votingMode;
    gameState.selectedVoterPlayerId = null;
    gameState.selectedPlayerId = null;
    saveGame();
    render();
  }

  function voteForCard(cardId) {
    if (!gameState?.votingMode || !gameState.selectedVoterPlayerId) return;
    if (gameState.selectedVoterPlayerId === gameState.currentStorytellerPlayerId) return;
    const votedCard = gameState.playedCards.find((card) => card.id === cardId);
    if (!votedCard) return;
    if (votedCard.ownerPlayerId === gameState.selectedVoterPlayerId) {
      showToast("Kendi kartına oy veremezsin.");
      return;
    }
    gameState.votes = [
      ...gameState.votes.filter((vote) => vote.voterPlayerId !== gameState.selectedVoterPlayerId),
      { voterPlayerId: gameState.selectedVoterPlayerId, cardId }
    ];
    saveGame();
    render();
  }

  function confirmCurrentVote() {
    if (!gameState?.selectedVoterPlayerId) return;
    if (!gameState.votes.some((vote) => vote.voterPlayerId === gameState.selectedVoterPlayerId)) return;
    gameState.selectedVoterPlayerId = null;
    saveGame();
    render();
  }

  function openRoundResolveConfirm() {
    if (!allVotesCast() || gameState?.roundResolved) return;
    modal = { type: "roundResolveConfirm" };
    render();
  }

  function resolveRoundScoring() {
    if (!gameState || !allVotesCast()) return;
    const storytellerId = gameState.currentStorytellerPlayerId;
    const storytellerCard = gameState.playedCards.find((card) => card.ownerPlayerId === storytellerId);
    if (!storytellerCard) return;
    const nonStorytellers = gameState.players.filter((player) => player.id !== storytellerId);
    const validVotes = getValidScoringVotes();
    const correctVotes = validVotes.filter((vote) => vote.cardId === storytellerCard.id);
    const allCorrect = correctVotes.length === nonStorytellers.length;
    const noneCorrect = correctVotes.length === 0;
    const deltas = Object.fromEntries(gameState.players.map((player) => [player.id, 0]));

    if (allCorrect || noneCorrect) {
      nonStorytellers.forEach((player) => {
        deltas[player.id] += 2;
      });
    } else {
      deltas[storytellerId] += 3;
      correctVotes.forEach((vote) => {
        deltas[vote.voterPlayerId] += 3;
      });
    }
    validVotes.forEach((vote) => {
      const votedCard = gameState.playedCards.find((card) => card.id === vote.cardId);
      if (votedCard && votedCard.ownerPlayerId !== storytellerId) {
        deltas[votedCard.ownerPlayerId] += 1;
      }
    });

    gameState.players = gameState.players.map((player) => ({
      ...player,
      score: clamp(player.score + deltas[player.id], 0, settings.maxScore)
    }));
    gameState.roundResolved = true;
    gameState.votingMode = false;
    gameState.selectedVoterPlayerId = null;
    gameState.roundScoreSummary = gameState.players.map((player) => ({
      playerId: player.id,
      name: player.name,
      delta: deltas[player.id]
    }));
    modal = null;
    saveGame();
    checkWinner();
    render();
  }

  function getValidScoringVotes() {
    if (!gameState) return [];
    const storytellerId = gameState.currentStorytellerPlayerId;
    return gameState.votes.filter((vote) => {
      if (vote.voterPlayerId === storytellerId) return false;
      const votedCard = gameState.playedCards.find((card) => card.id === vote.cardId);
      if (!votedCard) return false;
      return votedCard.ownerPlayerId !== vote.voterPlayerId;
    });
  }

  function goToNextRound() {
    if (!gameState?.roundResolved) return;
    gameState.discardPile = [...gameState.discardPile, ...gameState.playedCards];
    const blockedIds = getUnavailableCardIds(gameState);
    gameState.deck = removeBlockedCardsFromDeck(gameState.deck, blockedIds);
    gameState.players = gameState.players.map((player) => {
      const activeHand = player.handCards
        .filter((card) => !card.isPlayed)
        .map((card) => ({ ...card, isSelected: false }));
      return {
        ...player,
        handCards: [...activeHand, ...dealCards(player.id, Math.max(0, settings.cardsPerPlayer - activeHand.length), gameState.deck, true, blockedIds)]
      };
    });
    gameState.currentRound += 1;
    gameState.currentStorytellerPlayerId = nextStorytellerId();
    gameState.selectedPlayerId = null;
    gameState.spectatorMode = false;
    gameState.playedCards = [];
    gameState.votingMode = false;
    gameState.selectedVoterPlayerId = null;
    gameState.votes = [];
    gameState.roundResolved = false;
    gameState.roundScoreSummary = null;
    centerCardsRevealed = false;
    modal = null;
    saveGame();
    navigate("score");
  }

  function openCardPreview(card) {
    modal = { type: "cardPreview", card };
    render();
  }

  function reclaimPlayedCard(cardId) {
    if (!gameState) return;
    const playedCard = gameState.playedCards.find((card) => card.id === cardId);
    if (!playedCard) return;
    if (!gameState.selectedPlayerId || playedCard.ownerPlayerId !== gameState.selectedPlayerId) {
      showToast("Sadece seçili oyuncu kendi kartını geri alabilir.");
      return;
    }

    const cardsToReturn = playedCard.ownerPlayerId === gameState.currentStorytellerPlayerId
      ? [...gameState.playedCards]
      : [playedCard];
    const returnIds = new Set(cardsToReturn.map((card) => card.id));
    gameState.playedCards = gameState.playedCards.filter((card) => !returnIds.has(card.id));
    gameState.players = gameState.players.map((player) => {
      return {
        ...player,
        handCards: player.handCards.map((card) =>
          returnIds.has(card.id) ? { ...card, isPlayed: false, isSelected: false } : card
        )
      };
    });
    centerCardsRevealed = gameState.playedCards.length ? centerCardsRevealed : false;
    saveGame();
    render();
  }

  function shufflePlayedCards(options = {}) {
    const { animate = true, force = false } = options;
    if (!gameState || gameState.playedCards.length < 2 || shuffleAnimating) return;
    if (!force && (centerCardsRevealed || !gameState.spectatorMode || gameState.playedCards.length !== gameState.players.length)) return;
    const shuffled = [...gameState.playedCards];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    gameState.playedCards = shuffled;
    saveGame();
    if (animate) {
      shuffleAnimating = true;
      render();
      setTimeout(() => {
        shuffleAnimating = false;
        render();
      }, 850);
    }
  }

  function clearHandSelections() {
    if (!gameState) return;
    gameState.players = gameState.players.map((player) => ({
      ...player,
      handCards: player.handCards.map((card) => ({ ...card, isSelected: false }))
    }));
  }

  function openRoundEndModal() {
    openRoundResolveConfirm();
  }

  function finishRound(deltas = null) {
    if (!gameState) return;
    if (deltas) {
      Object.entries(deltas).forEach(([playerId, delta]) => {
        updateScore(Number(playerId), Number(delta), false);
      });
    }
    gameState.currentRound += 1;
    gameState.currentStorytellerPlayerId = nextStorytellerId();
    gameState.selectedPlayerId = gameState.currentStorytellerPlayerId;
    gameState.spectatorMode = false;
    gameState.playedCards = [];
    centerCardsRevealed = false;
    modal = null;
    saveGame();
    checkWinner();
    render();
  }

  function nextStorytellerId() {
    const currentIndex = gameState.players.findIndex((player) => player.id === gameState.currentStorytellerPlayerId);
    const nextIndex = (currentIndex + 1) % gameState.players.length;
    return gameState.players[nextIndex].id;
  }

  function updateScore(playerId, delta, shouldRender = true) {
    if (!gameState) return;
    gameState.players = gameState.players.map((player) => {
      if (player.id !== playerId) return player;
      const score = clamp(player.score + delta, 0, settings.maxScore);
      return { ...player, score };
    });
    saveGame();
    checkWinner();
    if (shouldRender) render();
  }

  function setScore(playerId, scoreValue, shouldRender = true) {
    if (!gameState) return;
    const score = clamp(scoreValue, 0, settings.maxScore);
    gameState.players = gameState.players.map((player) =>
      player.id === playerId ? { ...player, score } : player
    );
    saveGame();
    checkWinner();
    if (shouldRender) render();
  }

  function updatePlayerProfile(playerId, changes, shouldRender = true) {
    if (!gameState) return;
    gameState.players = gameState.players.map((player) => {
      if (player.id !== playerId) return player;
      return { ...player, ...changes };
    });
    saveGame();
    if (shouldRender) render();
  }

  function normalizePlayerNames() {
    if (!gameState) return;
    gameState.players = gameState.players.map((player) => ({
      ...player,
      name: player.name.trim() || `${player.id} Player`
    }));
    saveGame();
  }

  function checkWinner() {
    if (!gameState) return;
    const winner = gameState.players.find((player) => player.score >= settings.maxScore);
    if (!winner) return;
    gameState.isGameFinished = true;
    modal = { type: "gameFinished", winnerId: winner.id };
    saveGame();
  }

  function isLegacyPlaceholderGame(state) {
    const cards = [
      ...(Array.isArray(state.deck) ? state.deck : []),
      ...(Array.isArray(state.playedCards) ? state.playedCards : []),
      ...(Array.isArray(state.discardPile) ? state.discardPile : []),
      ...(Array.isArray(state.players)
        ? state.players.flatMap((player) => Array.isArray(player.handCards) ? player.handCards : [])
        : [])
    ];
    return cards.some((card) => {
      const image = String(card?.image || "");
      const id = String(card?.id || "");
      return image.startsWith("placeholder-") || id.startsWith("deck-") || /^p\d+-deck-/.test(id);
    });
  }

  function getUnavailableCardIds(state) {
    return new Set([
      ...(Array.isArray(state.players)
        ? state.players.flatMap((player) => Array.isArray(player.handCards) ? player.handCards : [])
        : []),
      ...(Array.isArray(state.playedCards) ? state.playedCards : []),
      ...(Array.isArray(state.discardPile) ? state.discardPile : [])
    ].map((card) => getBaseCardId(card)).filter(Boolean));
  }

  function removeBlockedCardsFromDeck(deck, blockedIds) {
    const seen = new Set();
    return (Array.isArray(deck) ? deck : []).filter((card) => {
      const cardId = getBaseCardId(card);
      if (!cardId || blockedIds.has(cardId) || seen.has(cardId)) return false;
      seen.add(cardId);
      return true;
    });
  }

  function getBaseCardId(card) {
    return String(card?.id || "").replace(/^p\d+-/, "");
  }

  function getCardImageSrc(card) {
    const image = String(card?.image || "");
    return image || `${CARD_FOLDER}/${getBaseCardId(card)}.webp`;
  }

  function getCardNumber(card) {
    const baseId = getBaseCardId(card);
    return baseId.replace("card-", "");
  }

  function getPlayerToken(player) {
    const fallbackName = `${player?.id || ""} Player`;
    const name = String(player?.name || fallbackName).trim() || fallbackName;
    return (Array.from(name)[0] || String(player?.id || "?")).toLocaleUpperCase("tr-TR");
  }

  function colorWithAlpha(color, alpha) {
    const value = String(color || "").trim();
    const hex = value.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!hex) return value;
    const [, r, g, b] = hex;
    return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${alpha})`;
  }

  function getPlayer(playerId) {
    return gameState?.players.find((player) => player.id === playerId);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showToast(message) {
    toastMessage = message;
    render();
  }

  function navigate(view) {
    currentView = view;
    toastMessage = "";
    render();
  }

  function render() {
    if (currentView === "home") app.innerHTML = renderHome();
    if (currentView === "setup") app.innerHTML = renderSetup();
    if (currentView === "game") app.innerHTML = renderGame();
    if (currentView === "score") app.innerHTML = renderScore();
    if (currentView === "cards") app.innerHTML = renderCardGallery();
    if (modal) app.insertAdjacentHTML("beforeend", renderModal());
  }

  function renderHome() {
    return `
      <main class="screen home-screen">
        <section class="home-card home-menu">
          <div class="button-stack">
            <button class="btn home-btn primary" data-action="new-game">Yeni Oyun</button>
            <button class="btn home-btn" data-action="continue-game">Devam Et</button>
            <button class="btn home-btn" data-action="show-all-cards">Bütün Kartlar</button>
          </div>
          ${toastMessage ? `<div class="toast">${escapeHtml(toastMessage)}</div>` : ""}
        </section>
      </main>
    `;
  }

  function renderCardGallery() {
    return `
      <main class="screen card-gallery-screen">
        <section class="card-gallery-shell">
          <div class="gallery-topbar">
            <h1>Bütün Kartlar</h1>
            <button class="btn small" data-action="go-home">Ana Menü</button>
          </div>
          <div class="card-gallery-grid">
            ${createGalleryCards().map((card) => renderGalleryCard(card)).join("")}
          </div>
          <button class="gallery-scroll-top btn icon-control" data-action="gallery-scroll-top" title="Yukarı çık" aria-label="Yukarı çık">↑</button>
        </section>
      </main>
    `;
  }

  function renderGalleryCard(card) {
    return `
      <button class="gallery-card" data-action="preview-gallery-card" data-card-id="${card.id}" aria-label="${escapeHtml(card.id)} kartını büyüt">
        <img src="${escapeHtml(card.image)}" alt="${escapeHtml(card.id)}" loading="lazy">
      </button>
    `;
  }

  function renderSetup() {
    return `
      <main class="screen setup-screen">
        <section class="setup-panel">
          <div class="setup-grid">
            ${setupDraft.map(renderSetupPlayer).join("")}
          </div>
          <div class="modal-actions">
            <button class="btn" data-action="go-home">Ana Menü</button>
            <button class="btn primary" data-action="start-game">Başlat</button>
          </div>
        </section>
      </main>
    `;
  }

  function renderSetupPlayer(player) {
    return `
      <article class="player-setup-card">
        <label class="field-label">
          Oyuncu ${player.id}
          <input class="text-input" data-action="setup-name" data-player-id="${player.id}" value="${escapeHtml(player.name)}" placeholder="${player.id} Player">
        </label>
        ${renderColorChoices(player, "setup-color")}
      </article>
    `;
  }

  function renderColorChoices(player, action) {
    return `
      <div class="color-choice-row" aria-label="Piyon rengi">
        ${colorOptions.map((color) => `
          <button
            class="color-choice ${player.color === color ? "selected" : ""}"
            style="background:${color}"
            data-action="${action}"
            data-player-id="${player.id}"
            data-color="${color}"
            title="Piyon rengi"
          ></button>
        `).join("")}
      </div>
    `;
  }

  function renderGame() {
    if (!gameState) return renderHome();
    const selectedPlayer = getPlayer(gameState.selectedPlayerId);
    const selectedPlayableCard = selectedPlayer?.handCards.some((card) => card.isSelected && !card.isPlayed);
    const selectedPlayerHasPlayed = selectedPlayer &&
      gameState.playedCards.some((card) => card.ownerPlayerId === selectedPlayer.id);
    return `
      <main class="screen game-screen">
        <section class="game-layout">
          <section class="map-board" aria-label="Ana oyun haritası">
            ${selectedPlayer ? renderPlayerHand(selectedPlayer, "player-zone-4") : ""}
            ${selectedPlayer ? `<button class="hand-play-button btn small" data-action="play-card" ${!selectedPlayableCard || selectedPlayerHasPlayed || gameState.spectatorMode ? "disabled" : ""}>Kartı Oyna</button>` : ""}
            ${renderVotingDock()}
            ${renderShuffleButton()}
            ${gameState.roundScoreSummary ? renderRoundSummary() : ""}
            <div class="played-slot">
              ${renderPlayedCards()}
            </div>
          </section>

          <nav class="game-controls">
            <div class="game-primary-controls">
              <div class="selector-bar">
                <div class="player-selector" aria-label="Oyuncu seçici">
                ${gameState.players.map((player) => `
                    <button class="selector-button ${getSelectorClass(player)}" data-action="select-player" data-player-id="${player.id}" ${isSelectorDisabled(player) ? "disabled" : ""}>
                      ${hasPlayerVoted(player.id) ? `<span class="selector-vote-check" aria-hidden="true">✓</span>` : ""}
                      ${escapeHtml(getPlayerToken(player))}
                    </button>
                  `).join("")}
                </div>
              </div>
              <div class="game-action-row">
                ${gameState.roundResolved
                  ? `<button class="btn warn small" data-action="next-round">Sonraki Round</button>`
                  : `<button class="btn warn small" data-action="finish-round" ${allVotesCast() ? "" : "disabled"}>Round Bitir</button>`}
                <button class="btn small" data-action="go-score">Skor</button>
              </div>
            </div>
            <div class="mode-control">
              <div class="mode-row">
                <button class="btn mode-btn ${gameState.spectatorMode ? "active" : ""}" data-action="toggle-spectator-button">Game Mode</button>
                <button class="btn icon-control" data-action="open-player-edit" title="Düzenleme" aria-label="Düzenleme">⚙</button>
              </div>
              <div class="mode-row">
                <button class="btn small reveal-btn ${centerCardsRevealed ? "active" : ""}" data-action="toggle-center" ${gameState.spectatorMode && gameState.playedCards.length === gameState.players.length ? "" : "disabled"}>${centerCardsRevealed ? "Kartları Kapat" : "Kartları Aç"}</button>
                <button class="btn icon-control" data-action="open-exit-confirm" title="Ana Menü" aria-label="Ana Menü">⌂</button>
              </div>
            </div>
          </nav>
        </section>
      </main>
    `;
  }

  function renderVotingDock() {
    if (!canStartVoting() && !gameState.votingMode) return "";
    const canConfirm = gameState.selectedVoterPlayerId &&
      gameState.votes.some((vote) => vote.voterPlayerId === gameState.selectedVoterPlayerId);
    return `
      <div class="voting-dock">
        <button class="btn small reveal-btn ${gameState.votingMode ? "active" : ""}" data-action="toggle-voting">Oylama</button>
        <button class="btn icon-control" data-action="confirm-vote" title="Oyu onayla" aria-label="Oyu onayla" ${canConfirm ? "" : "disabled"}>✓</button>
      </div>
    `;
  }

  function getSelectorClass(player) {
    const activeId = gameState.votingMode ? gameState.selectedVoterPlayerId : gameState.selectedPlayerId;
    return `${player.id === activeId ? "active" : ""} ${player.id === gameState.currentStorytellerPlayerId ? "storyteller" : ""}`;
  }

  function hasPlayerVoted(playerId) {
    return Boolean(
      gameState?.votingMode &&
      playerId !== gameState.currentStorytellerPlayerId &&
      gameState.votes.some((vote) => vote.voterPlayerId === playerId)
    );
  }

  function isSelectorDisabled(player) {
    if (gameState.votingMode) return player.id === gameState.currentStorytellerPlayerId || gameState.roundResolved;
    return gameState.spectatorMode;
  }

  function renderPlayerHand(player, zoneClass = `player-zone-${player.id}`) {
    const isVisible = !gameState.spectatorMode && player.id === gameState.selectedPlayerId;
    const isActive = player.id === gameState.selectedPlayerId;
    const isStoryteller = player.id === gameState.currentStorytellerPlayerId;
    return `
      <article class="player-hand ${zoneClass} ${isActive ? "active" : ""} ${isStoryteller ? "storyteller" : ""}">
        <div class="hand-header">
          <h2 class="hand-title">
            ${escapeHtml(player.name)}
          </h2>
        </div>
        <div class="cards-row">
          ${player.handCards.map((card) => renderCard(card, isVisible, true)).join("")}
        </div>
      </article>
    `;
  }

  function renderCard(card, isVisible, isHandCard, isPreviewOnly = false) {
    const openClass = isVisible ? "open" : "closed";
    const selectedClass = card.isSelected ? "selected" : "";
    const playedClass = card.isPlayed ? "played" : "";
    const imageSrc = isVisible ? getCardImageSrc(card) : CARD_BACK_IMAGE;
    const label = isVisible ? `Kart ${getCardNumber(card)}` : "Gizli kart";
    let actionAttrs = "";
    if (!isPreviewOnly && isHandCard && isVisible && !card.isPlayed) {
      actionAttrs = `data-action="select-card" data-player-id="${card.ownerPlayerId}" data-card-id="${card.id}"`;
    }
    if (!isPreviewOnly && !isHandCard && isVisible) {
      actionAttrs = `data-action="${gameState.votingMode ? "vote-card" : "preview-card"}" data-card-id="${card.id}"`;
    }
    const disabledAttr = isHandCard && card.isPlayed ? "disabled" : "";
    return `
      <button class="card-tile ${openClass} ${selectedClass} ${playedClass}" ${actionAttrs} ${disabledAttr} aria-label="${escapeHtml(label)}">
        ${card.isNew && isHandCard && isVisible ? `<span class="new-badge">Yeni</span>` : ""}
        <img class="card-art" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(label)}" draggable="false">
      </button>
    `;
  }

  function renderPlayedCards() {
    if (!gameState.playedCards.length) {
      return "";
    }
    return `
      <div class="played-grid ${shuffleAnimating ? "shuffling" : ""}">
        ${gameState.playedCards.map((card) => `
          <div class="played-card-wrap ${gameState.roundResolved && card.ownerPlayerId === gameState.currentStorytellerPlayerId ? "storyteller-card" : ""}">
            <div class="played-card-stack">
              ${renderCard(card, isPlayedCardVisible(card), false)}
              ${renderVoteMarkers(card.id)}
              ${card.ownerPlayerId === gameState.selectedPlayerId ? `<button class="reclaim-card" data-action="reclaim-card" data-card-id="${card.id}" title="Kartı geri al" aria-label="Kartı geri al">↩</button>` : ""}
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderShuffleButton() {
    if (!gameState) return "";
    const canShow = !centerCardsRevealed &&
      gameState.spectatorMode &&
      gameState.playedCards.length === gameState.players.length;
    if (!canShow) return "";
    return `<button class="played-shuffle" data-action="shuffle-played" ${gameState.playedCards.length > 1 && !shuffleAnimating ? "" : "disabled"} title="Karıştır" aria-label="Karıştır">⟳</button>`;
  }

  function isPlayedCardVisible(card) {
    if (centerCardsRevealed) return true;
    return !gameState.spectatorMode &&
      !gameState.votingMode &&
      gameState.selectedPlayerId === card.ownerPlayerId;
  }

  function renderVoteMarkers(cardId) {
    const visibleVotes = gameState.roundResolved
      ? gameState.votes
      : gameState.votingMode && gameState.selectedVoterPlayerId
        ? gameState.votes.filter((vote) => vote.voterPlayerId === gameState.selectedVoterPlayerId)
        : [];
    const votes = visibleVotes.filter((vote) => vote.cardId === cardId);
    if (!votes.length) return "";
    return `
      <div class="vote-markers">
        ${votes.map((vote) => {
          const player = getPlayer(vote.voterPlayerId);
          return player ? renderPawn(player) : "";
        }).join("")}
      </div>
    `;
  }

  function renderRoundSummary() {
    return `
      <div class="round-summary">
        ${gameState.roundScoreSummary.map((item) => `
          <span>${escapeHtml(item.name)} ${item.delta >= 0 ? "+" : ""}${item.delta}</span>
        `).join("")}
      </div>
    `;
  }

  function renderScore() {
    if (!gameState) return renderHome();
    return `
      <main class="screen score-screen">
        <section class="score-layout">
          <div class="score-map-wrap">
            <div class="score-map" aria-label="Skor haritası">
              ${gameState.players.map(renderScorePawn).join("")}
            </div>
          </div>
          <aside class="score-list">
            <div class="score-panel-header">
              <h2>Oyuncular</h2>
              <button class="btn small" data-action="go-game">Oyuna Dön</button>
            </div>
            ${gameState.players.map(renderScoreRow).join("")}
          </aside>
        </section>
      </main>
    `;
  }

  function renderScorePawn(player) {
    const position = scorePositions.find((item) => item.score === clamp(player.score, 0, settings.maxScore)) || scorePositions[0];
    const offset = (player.id - 2.5) * 8;
    return `
      <span
        class="score-pawn"
        style="left:calc(${position.x}% + ${offset}px);top:calc(${position.y}% + ${offset}px);background:${colorWithAlpha(player.color, 0.58)}"
        title="${escapeHtml(player.name)}: ${player.score}"
      >${escapeHtml(getPlayerToken(player))}</span>
    `;
  }

  function renderScoreRow(player) {
    return `
      <div class="score-row compact">
        <div class="score-name">${renderPawn(player)} ${escapeHtml(player.name)}</div>
        <div class="score-actions compact">
          <button class="btn icon-btn" data-action="score-delta" data-player-id="${player.id}" data-delta="-1">-</button>
          <span class="score-value-compact">${player.score}</span>
          <button class="btn icon-btn" data-action="score-delta" data-player-id="${player.id}" data-delta="1">+</button>
        </div>
      </div>
    `;
  }

  function renderPawn(player) {
    return `<span class="pawn" style="background:${player.color}">${escapeHtml(getPlayerToken(player))}</span>`;
  }

  function renderModal() {
    if (modal.type === "settings") return renderSettingsModal();
    if (modal.type === "roundScore") return renderRoundScoreModal();
    if (modal.type === "gameFinished") return renderGameFinishedModal();
    if (modal.type === "confirmExit") return renderConfirmExitModal();
    if (modal.type === "playerEdit") return renderPlayerEditModal();
    if (modal.type === "cardPreview") return renderCardPreviewModal();
    if (modal.type === "roundResolveConfirm") return renderRoundResolveConfirmModal();
    return "";
  }

  function renderSettingsModal() {
    return `
      <div class="modal-backdrop">
        <section class="modal-card">
          <h2>Ayarlar</h2>
          <label class="settings-row">
            <span>Oyuncu sayısı</span>
            <input class="number-input" value="4" disabled>
          </label>
          <label class="settings-row">
            <span>Oyuncu başına kart</span>
            <input class="number-input" type="number" min="3" max="12" value="${settings.cardsPerPlayer}" data-action="setting-cards">
          </label>
          <label class="settings-row">
            <span>Ses</span>
            <input type="checkbox" data-action="setting-sound" ${settings.soundEnabled ? "checked" : ""}>
          </label>
          <label class="settings-row">
            <span>Timer</span>
            <input type="checkbox" data-action="setting-timer" ${settings.timerEnabled ? "checked" : ""}>
          </label>
          <div class="modal-actions">
            <button class="btn primary" data-action="close-modal">Tamam</button>
          </div>
        </section>
      </div>
    `;
  }

  function renderRoundScoreModal() {
    return `
      <div class="modal-backdrop">
        <section class="modal-card">
          <h2>Round ${gameState.currentRound} Skorları</h2>
          <div class="round-score-grid">
            ${gameState.players.map((player) => `
              <label class="round-score-line">
                <span>${renderPawn(player)} ${escapeHtml(player.name)}</span>
                <input class="number-input" type="number" min="-10" max="10" value="${modal.deltas[player.id] || 0}" data-action="round-delta" data-player-id="${player.id}">
              </label>
            `).join("")}
          </div>
          <div class="modal-actions">
            <button class="btn" data-action="close-modal">İptal</button>
            <button class="btn primary" data-action="apply-round-score">Skorları Kaydet</button>
          </div>
        </section>
      </div>
    `;
  }

  function renderGameFinishedModal() {
    const winner = getPlayer(modal.winnerId);
    return `
      <div class="modal-backdrop">
        <section class="modal-card">
          <h2>Oyun Bitti</h2>
          <p><strong>${escapeHtml(winner?.name || "Kazanan")}</strong> ${settings.maxScore} puana ulaştı.</p>
          <div class="modal-actions">
            <button class="btn primary" data-action="new-game">Yeni Oyun Başlat</button>
            <button class="btn" data-action="correct-score">Düzelt</button>
            <button class="btn" data-action="go-home">Ana Menüye Dön</button>
          </div>
        </section>
      </div>
    `;
  }

  function renderConfirmExitModal() {
    return `
      <div class="modal-backdrop">
        <section class="modal-card">
          <h2>Ana menüye dön?</h2>
          <p>Oyundan çıkmak istediğinden emin misin? Mevcut oyun otomatik kaydedildi, Devam Et ile geri dönebilirsin.</p>
          <div class="modal-actions">
            <button class="btn" data-action="close-modal">Vazgeç</button>
            <button class="btn danger" data-action="confirm-exit">Ana Menüye Dön</button>
          </div>
        </section>
      </div>
    `;
  }

  function renderPlayerEditModal() {
    return `
      <div class="modal-backdrop">
        <section class="modal-card">
          <h2>Oyuncuları Düzenle</h2>
          <div class="setup-grid player-edit-grid">
            ${gameState.players.map(renderPlayerEditCard).join("")}
          </div>
          <div class="modal-actions">
            <button class="btn primary" data-action="close-modal">Tamam</button>
          </div>
        </section>
      </div>
    `;
  }

  function renderPlayerEditCard(player) {
    return `
      <article class="player-setup-card">
        <label class="field-label">
          Oyuncu ${player.id}
          <input class="text-input" data-action="edit-player-name" data-player-id="${player.id}" value="${escapeHtml(player.name)}" placeholder="${player.id} Player">
        </label>
        ${renderColorChoices(player, "edit-player-color")}
      </article>
    `;
  }

  function renderCardPreviewModal() {
    const card = modal.card;
    return `
      <div class="modal-backdrop card-preview-backdrop" data-action="close-preview">
        <section class="card-preview-card">
          ${renderCard(card, true, false, true)}
        </section>
      </div>
    `;
  }

  function renderRoundResolveConfirmModal() {
    return `
      <div class="modal-backdrop">
        <section class="modal-card">
          <h2>Round bitsin mi?</h2>
          <p>Oylar kilitlenecek, puanlar otomatik hesaplanacak ve kartların üzerindeki oylar açık kalacak.</p>
          <div class="modal-actions">
            <button class="btn" data-action="close-modal">Vazgeç</button>
            <button class="btn primary" data-action="resolve-round">Evet, bitir</button>
          </div>
        </section>
      </div>
    `;
  }

  app.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    if (typeof target.matches === "function" && target.matches("button, a")) {
      event.preventDefault();
    }
    const action = target.dataset.action;

    if (action === "new-game") {
      clearSavedGame();
      setupDraft = createSetupDraft();
      modal = null;
      navigate("setup");
    }

    if (action === "continue-game") {
      const saved = loadGame();
      if (saved?.legacyInvalid) {
        showToast("Eski placeholder kartli kayit yeni deste ile uyumlu degil. Lutfen yeni oyun baslat.");
        return;
      }
      if (!saved || !saved.isGameStarted) {
        showToast("Kayıtlı oyun bulunamadı.");
        return;
      }
      gameState = saved;
      saveGame();
      modal = gameState.isGameFinished ? { type: "gameFinished", winnerId: gameState.players.find((p) => p.score >= settings.maxScore)?.id } : null;
      centerCardsRevealed = false;
      navigate("game");
    }

    if (action === "show-all-cards") {
      modal = null;
      navigate("cards");
    }

    if (action === "gallery-scroll-top") {
      globalThis.scrollTo({ top: 0, behavior: "smooth" });
    }

    if (action === "open-settings") {
      modal = { type: "settings" };
      render();
    }

    if (action === "open-exit-confirm") {
      modal = { type: "confirmExit" };
      render();
    }

    if (action === "open-player-edit") {
      modal = { type: "playerEdit" };
      render();
    }

    if (action === "close-modal") {
      if (modal?.type === "playerEdit") normalizePlayerNames();
      modal = null;
      render();
    }

    if (action === "close-preview") {
      modal = null;
      render();
    }

    if (action === "confirm-exit") {
      modal = null;
      navigate("home");
    }

    if (action === "correct-score") {
      if (gameState) {
        gameState.isGameFinished = false;
        saveGame();
      }
      modal = null;
      navigate("score");
    }

    if (action === "go-home") {
      modal = null;
      navigate("home");
    }

    if (action === "go-game") {
      modal = null;
      navigate("game");
    }

    if (action === "go-score") {
      modal = null;
      navigate("score");
    }

    if (action === "setup-color") {
      const playerId = Number(target.dataset.playerId);
      setupDraft = setupDraft.map((player) =>
        player.id === playerId ? { ...player, color: target.dataset.color } : player
      );
      render();
    }

    if (action === "start-game") {
      gameState = createNewGame(setupDraft);
      saveGame();
      modal = null;
      centerCardsRevealed = false;
      navigate("game");
    }

    if (action === "select-player") selectPlayer(Number(target.dataset.playerId));
    if (action === "select-card") selectCard(Number(target.dataset.playerId), target.dataset.cardId);
    if (action === "preview-card") {
      const card = gameState?.playedCards.find((playedCard) => playedCard.id === target.dataset.cardId);
      if (card && centerCardsRevealed) openCardPreview(card);
    }
    if (action === "preview-gallery-card") {
      const card = createGalleryCards().find((galleryCard) => galleryCard.id === target.dataset.cardId);
      if (card) openCardPreview(card);
    }
    if (action === "vote-card") voteForCard(target.dataset.cardId);
    if (action === "play-card") playSelectedCard();
    if (action === "toggle-spectator-button") toggleSpectatorMode(!gameState.spectatorMode);
    if (action === "reveal-center" || action === "toggle-center") toggleCenterCards();
    if (action === "toggle-voting") toggleVotingMode();
    if (action === "confirm-vote") confirmCurrentVote();
    if (action === "finish-round") openRoundEndModal();
    if (action === "resolve-round") resolveRoundScoring();
    if (action === "next-round") goToNextRound();
    if (action === "apply-round-score") finishRound(modal.deltas);
    if (action === "reclaim-card") reclaimPlayedCard(target.dataset.cardId);
    if (action === "shuffle-played") shufflePlayedCards();

    if (action === "score-delta") {
      updateScore(Number(target.dataset.playerId), Number(target.dataset.delta));
    }

    if (action === "edit-player-color") {
      updatePlayerProfile(Number(target.dataset.playerId), { color: target.dataset.color });
    }
  });

  app.addEventListener("input", (event) => {
    const target = event.target;
    const action = target.dataset.action;

    if (action === "setup-name") {
      const playerId = Number(target.dataset.playerId);
      setupDraft = setupDraft.map((player) =>
        player.id === playerId ? { ...player, name: target.value } : player
      );
    }

    if (action === "round-delta" && modal?.type === "roundScore") {
      modal.deltas[target.dataset.playerId] = Number(target.value) || 0;
    }

    if (action === "setting-cards") {
      settings.cardsPerPlayer = clamp(Number(target.value) || defaultSettings.cardsPerPlayer, 3, 12);
      saveSettings();
    }

    if (action === "score-set") {
      setScore(Number(target.dataset.playerId), Number(target.value) || 0);
    }

    if (action === "edit-player-name") {
      const playerId = Number(target.dataset.playerId);
      updatePlayerProfile(playerId, { name: target.value }, false);
    }
  });

  app.addEventListener("change", (event) => {
    const target = event.target;
    const action = target.dataset.action;

    if (action === "toggle-spectator") toggleSpectatorMode(target.checked);

    if (action === "setting-sound") {
      settings.soundEnabled = target.checked;
      saveSettings();
    }

    if (action === "setting-timer") {
      settings.timerEnabled = target.checked;
      saveSettings();
    }
  });

  render();
})();
