const PIECE_IMAGES = {
  'p': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg', 'n': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg', 'b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg', 'r': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg', 'q': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg', 'k': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
  'P': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg', 'N': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg', 'B': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg', 'R': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg', 'Q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg', 'K': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg'
};

const pieceValues = { p: 10, n: 30, b: 30, r: 50, q: 90, k: 900, P: -10, N: -30, B: -30, R: -50, Q: -90, K: -900 };
const evaluateBoard = (game) => {
  let totalEvaluation = 0; const board = game.board();
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const piece = board[i][j];
    if (piece) { let val = pieceValues[piece.type] || 0; if (piece.color === 'w') val = -val; totalEvaluation += val; }
  }
  return totalEvaluation;
};

const minimax = (game, depth, alpha, beta, isMaximizingPlayer, endTime) => {
  if (Date.now() > endTime) return null;
  if (depth === 0 || game.game_over()) return evaluateBoard(game);
  let moves = game.moves();
  moves.sort((a, b) => {
    let vA = 0, vB = 0;
    if (a.includes('x')) vA += 10; if (b.includes('x')) vB += 10;
    if (a.includes('+')) vA += 5; if (b.includes('+')) vB += 5;
    if (a.includes('=')) vA += 8; if (b.includes('=')) vB += 8;
    return vB - vA;
  });
  if (isMaximizingPlayer) {
    let bestVal = -Infinity;
    for (let i = 0; i < moves.length; i++) {
      game.move(moves[i]);
      let res = minimax(game, depth - 1, alpha, beta, !isMaximizingPlayer, endTime);
      game.undo();
      if (res === null) return null;
      bestVal = Math.max(bestVal, res); alpha = Math.max(alpha, bestVal);
      if (beta <= alpha) break;
    }
    return bestVal;
  } else {
    let bestVal = Infinity;
    for (let i = 0; i < moves.length; i++) {
      game.move(moves[i]);
      let res = minimax(game, depth - 1, alpha, beta, !isMaximizingPlayer, endTime);
      game.undo();
      if (res === null) return null;
      bestVal = Math.min(bestVal, res); beta = Math.min(beta, bestVal);
      if (beta <= alpha) break;
    }
    return bestVal;
  }
};

const getBestMove = (game, aiColor, maxDepth = 5) => {
  const endTime = Date.now() + 950;
  let moves = game.moves(); if (moves.length === 0) return null;
  moves.sort((a, b) => {
    let vA = 0, vB = 0;
    if (a.includes('x')) vA += 10; if (b.includes('x')) vB += 10;
    if (a.includes('+')) vA += 5; if (b.includes('+')) vB += 5;
    if (a.includes('=')) vA += 8; if (b.includes('=')) vB += 8;
    return vB - vA;
  });

  const isAIBlack = aiColor === 'b';
  let overallBestMove = moves[Math.floor(Math.random() * moves.length)];

  for (let currDepth = 1; currDepth <= maxDepth; currDepth++) {
    let currentBestMove = null; let bestValue = isAIBlack ? -Infinity : Infinity;
    for (let i = 0; i < moves.length; i++) {
      const move = moves[i]; game.move(move);
      const boardValue = minimax(game, currDepth - 1, -Infinity, Infinity, !isAIBlack, endTime);
      game.undo();

      if (boardValue === null) return overallBestMove;

      if (isAIBlack) { if (boardValue > bestValue) { bestValue = boardValue; currentBestMove = move; } }
      else { if (boardValue < bestValue) { bestValue = boardValue; currentBestMove = move; } }
    }

    if (currentBestMove) {
      overallBestMove = currentBestMove;
      moves = [overallBestMove, ...moves.filter(m => m !== overallBestMove)];
    }
  }
  return overallBestMove;
};
