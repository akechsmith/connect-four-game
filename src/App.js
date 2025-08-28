import React, { useState, useCallback, useEffect, useRef } from 'react';

const ROWS = 6;
const COLS = 7;
const EMPTY = 0;
const PLAYER1 = 1;
const PLAYER2 = 2;

const ConnectFourGame = () => {
  const [board, setBoard] = useState(() => 
    Array(ROWS).fill(null).map(() => Array(COLS).fill(EMPTY))
  );
  const [currentPlayer, setCurrentPlayer] = useState(PLAYER1);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [winningCells, setWinningCells] = useState([]);
  const [isAIMode, setIsAIMode] = useState(false);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [droppingDisc, setDroppingDisc] = useState(null);
  const [hoverColumn, setHoverColumn] = useState(-1);
  const [previewDisc, setPreviewDisc] = useState({ col: -1, visible: false });
  const [scores, setScores] = useState({ player1: 0, player2: 0, draws: 0 });
  const [gameHistory, setGameHistory] = useState([]);
  const audioContextRef = useRef(null);
  const animationFrameRef = useRef(null);
  const dropStartTimeRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const aiMoveTimeoutRef = useRef(null);

  // Sound effects
  const playSound = (frequency, duration = 200, type = 'drop') => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        return; // Audio not supported
      }
    }
    
    try {
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      if (type === 'drop') {
        oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.5, ctx.currentTime + duration / 1000);
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);
      } else if (type === 'win') {
        oscillator.frequency.setValueAtTime(523, ctx.currentTime); // C5
        oscillator.frequency.setValueAtTime(659, ctx.currentTime + 0.1); // E5
        oscillator.frequency.setValueAtTime(784, ctx.currentTime + 0.2); // G5
        gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      }
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + (type === 'win' ? 0.4 : duration / 1000));
    } catch (e) {
      // Ignore audio errors
    }
  };

  const copyBoard = (board) => board.map(row => [...row]);
  const isColumnFull = (board, col) => board[0][col] !== EMPTY;
  const getNextRow = (board, col) => {
    for (let row = ROWS - 1; row >= 0; row--) {
      if (board[row][col] === EMPTY) return row;
    }
    return -1;
  };

  const checkWin = (board, player) => {
    const directions = [
      [[0, 1], [0, 2], [0, 3]], // horizontal
      [[1, 0], [2, 0], [3, 0]], // vertical
      [[1, 1], [2, 2], [3, 3]], // diagonal /
      [[-1, 1], [-2, 2], [-3, 3]] // diagonal \
    ];

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (board[row][col] === player) {
          for (const direction of directions) {
            const cells = [[row, col]];
            let valid = true;

            for (const [dr, dc] of direction) {
              const newRow = row + dr;
              const newCol = col + dc;
              
              if (newRow >= 0 && newRow < ROWS && newCol >= 0 && newCol < COLS && 
                  board[newRow][newCol] === player) {
                cells.push([newRow, newCol]);
              } else {
                valid = false;
                break;
              }
            }

            if (valid) return cells;
          }
        }
      }
    }
    return null;
  };

  const isBoardFull = (board) => board[0].every(cell => cell !== EMPTY);

  // Enhanced AI with better strategy
  const evaluateWindow = (window, player) => {
    let score = 0;
    const opponent = player === PLAYER1 ? PLAYER2 : PLAYER1;
    
    const playerCount = window.filter(cell => cell === player).length;
    const emptyCount = window.filter(cell => cell === EMPTY).length;
    const opponentCount = window.filter(cell => cell === opponent).length;

    if (playerCount === 4) score += 100000;
    else if (playerCount === 3 && emptyCount === 1) score += 50;
    else if (playerCount === 2 && emptyCount === 2) score += 10;
    else if (playerCount === 1 && emptyCount === 3) score += 1;

    if (opponentCount === 3 && emptyCount === 1) score -= 80;
    else if (opponentCount === 2 && emptyCount === 2) score -= 5;

    return score;
  };

  const scorePosition = (board, player) => {
    let score = 0;

    // Center column preference
    const centerCol = Math.floor(COLS / 2);
    const centerArray = board.map(row => row[centerCol]);
    score += centerArray.filter(cell => cell === player).length * 6;

    // Evaluate all possible 4-cell windows
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS - 3; col++) {
        const window = board[row].slice(col, col + 4);
        score += evaluateWindow(window, player);
      }
    }

    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS - 3; row++) {
        const window = [board[row][col], board[row + 1][col], board[row + 2][col], board[row + 3][col]];
        score += evaluateWindow(window, player);
      }
    }

    for (let row = 0; row < ROWS - 3; row++) {
      for (let col = 0; col < COLS - 3; col++) {
        const window = [board[row][col], board[row + 1][col + 1], board[row + 2][col + 2], board[row + 3][col + 3]];
        score += evaluateWindow(window, player);
      }
    }

    for (let row = 3; row < ROWS; row++) {
      for (let col = 0; col < COLS - 3; col++) {
        const window = [board[row][col], board[row - 1][col + 1], board[row - 2][col + 2], board[row - 3][col + 3]];
        score += evaluateWindow(window, player);
      }
    }

    return score;
  };

  const minimax = (board, depth, alpha, beta, maximizingPlayer) => {
    const validCols = [];
    for (let col = 0; col < COLS; col++) {
      if (!isColumnFull(board, col)) validCols.push(col);
    }

    const isTerminal = checkWin(board, PLAYER1) || checkWin(board, PLAYER2) || validCols.length === 0;

    if (depth === 0 || isTerminal) {
      if (isTerminal) {
        if (checkWin(board, PLAYER2)) return [null, 1000000];
        if (checkWin(board, PLAYER1)) return [null, -1000000];
        return [null, 0];
      } else {
        return [null, scorePosition(board, PLAYER2)];
      }
    }

    if (maximizingPlayer) {
      let value = -Infinity;
      let column = validCols[Math.floor(Math.random() * validCols.length)];
      
      for (const col of validCols) {
        const row = getNextRow(board, col);
        const newBoard = copyBoard(board);
        newBoard[row][col] = PLAYER2;
        const newScore = minimax(newBoard, depth - 1, alpha, beta, false)[1];
        
        if (newScore > value) {
          value = newScore;
          column = col;
        }
        alpha = Math.max(alpha, value);
        if (beta <= alpha) break;
      }
      return [column, value];
    } else {
      let value = Infinity;
      let column = validCols[Math.floor(Math.random() * validCols.length)];
      
      for (const col of validCols) {
        const row = getNextRow(board, col);
        const newBoard = copyBoard(board);
        newBoard[row][col] = PLAYER1;
        const newScore = minimax(newBoard, depth - 1, alpha, beta, true)[1];
        
        if (newScore < value) {
          value = newScore;
          column = col;
        }
        beta = Math.min(beta, value);
        if (beta <= alpha) break;
      }
      return [column, value];
    }
  };

  const getAIMove = (board) => {
    try {
      const [col] = minimax(board, 5, -Infinity, Infinity, true);
      return col;
    } catch (error) {
      // Fallback to random valid move
      const validCols = [];
      for (let col = 0; col < COLS; col++) {
        if (!isColumnFull(board, col)) validCols.push(col);
      }
      return validCols.length > 0 ? validCols[Math.floor(Math.random() * validCols.length)] : null;
    }
  };

  // Smooth animation function with better easing
  const easeInCubic = (t) => t * t * t;
  const easeOutElastic = (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  };
  
  const easeInOutCubic = (t) => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  const finalizeMoveAfterAnimation = useCallback((newBoard, targetRow, col, player) => {
    console.log('Finalizing move:', { col, targetRow, player });
    setBoard(newBoard);
    
    // Add to game history
    setGameHistory(prev => [...prev, { col, row: targetRow, player }]);

    // Check for win
    const winCells = checkWin(newBoard, player);
    if (winCells) {
      setWinner(player);
      setWinningCells(winCells);
      setGameOver(true);
      playSound(523, 600, 'win');
      
      // Update scores
      setScores(prev => ({
        ...prev,
        [`player${player}`]: prev[`player${player}`] + 1
      }));
      return;
    }

    // Check for draw
    if (isBoardFull(newBoard)) {
      setGameOver(true);
      setScores(prev => ({ ...prev, draws: prev.draws + 1 }));
      return;
    }

    // Switch players
    setCurrentPlayer(player === PLAYER1 ? PLAYER2 : PLAYER1);
  }, []);

  const animateDiscDrop = useCallback((col, targetRow, player, boardSnapshot) => {
    console.log('Starting animation:', { col, targetRow, player });
    const ANIMATION_DURATION = 1200;
    const startTime = Date.now();
    dropStartTimeRef.current = startTime;

    const animate = () => {
      const currentTime = Date.now();
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / ANIMATION_DURATION, 1);

      // Use improved easing function for more natural drop
      let easedProgress;
      if (progress < 0.6) {
        // Falling phase - accelerating
        easedProgress = easeInCubic(progress / 0.6) * 0.85;
      } else {
        // Bouncing phase - elastic bounce
        const bounceProgress = (progress - 0.6) / 0.4;
        easedProgress = 0.85 + easeOutElastic(bounceProgress) * 0.15;
      }

      setDroppingDisc({
        col,
        targetRow,
        player,
        progress: easedProgress,
        startTime
      });

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        // Animation complete
        console.log('Animation complete, finalizing move');
        setDroppingDisc(null);
        
        // Update the board and check game state using the snapshot
        const newBoard = copyBoard(boardSnapshot);
        newBoard[targetRow][col] = player;
        finalizeMoveAfterAnimation(newBoard, targetRow, col, player);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [finalizeMoveAfterAnimation]);

  const makeMove = useCallback((col, boardSnapshot = null) => {
    const currentBoard = boardSnapshot || board;
    
    if (gameOver || droppingDisc) return false;
    if (isColumnFull(currentBoard, col)) return false;
    
    const row = getNextRow(currentBoard, col);
    if (row === -1) return false;

    console.log('Making move:', { col, row, player: currentPlayer });

    // Cancel any existing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Play drop sound
    playSound(400 + (row * 50), 300, 'drop');

    // Start smooth drop animation with board snapshot
    animateDiscDrop(col, row, currentPlayer, currentBoard);

    return true;
  }, [currentPlayer, gameOver, droppingDisc, board, animateDiscDrop]);

  // AI move effect - Completely rewritten for better reliability
  useEffect(() => {
    // Only proceed if it's AI's turn and conditions are right
    if (!isAIMode || currentPlayer !== PLAYER2 || gameOver || droppingDisc) {
      return;
    }

    console.log('Setting up AI move...');
    setIsAIThinking(true);
    
    const aiMoveTimeout = setTimeout(() => {
      console.log('AI executing move...');
      
      // Capture current board state
      const currentBoard = board;
      
      try {
        const aiCol = getAIMove(currentBoard);
        console.log('AI chose column:', aiCol);
        
        if (aiCol !== null && aiCol >= 0 && aiCol < COLS && !isColumnFull(currentBoard, aiCol)) {
          const row = getNextRow(currentBoard, aiCol);
          if (row !== -1) {
            console.log('AI making valid move at column', aiCol, 'row', row);
            // Reset AI thinking state
            setIsAIThinking(false);
            
            // Make the move with current board snapshot
            makeMove(aiCol, currentBoard);
          } else {
            console.log('Invalid row for AI move');
            setIsAIThinking(false);
          }
        } else {
          console.log('AI move invalid, trying fallback');
          // Fallback: find any valid column
          let moved = false;
          for (let col = 0; col < COLS; col++) {
            if (!isColumnFull(currentBoard, col)) {
              const row = getNextRow(currentBoard, col);
              if (row !== -1) {
                console.log('AI fallback move at column', col);
                setIsAIThinking(false);
                makeMove(col, currentBoard);
                moved = true;
                break;
              }
            }
          }
          if (!moved) {
            console.log('No valid moves found for AI');
            setIsAIThinking(false);
          }
        }
      } catch (error) {
        console.error('AI move error:', error);
        setIsAIThinking(false);
      }
    }, 800);

    // Cleanup function
    return () => {
      clearTimeout(aiMoveTimeout);
    };
  }, [isAIMode, currentPlayer, gameOver, droppingDisc, board, makeMove]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (aiMoveTimeoutRef.current) {
        clearTimeout(aiMoveTimeoutRef.current);
      }
    };
  }, []);

  const resetGame = () => {
    console.log('Resetting game...');
    
    // Clear all timeouts and animations
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (aiMoveTimeoutRef.current) {
      clearTimeout(aiMoveTimeoutRef.current);
      aiMoveTimeoutRef.current = null;
    }
    
    // Reset all states
    setBoard(Array(ROWS).fill(null).map(() => Array(COLS).fill(EMPTY)));
    setCurrentPlayer(PLAYER1);
    setGameOver(false);
    setWinner(null);
    setWinningCells([]);
    setIsAIThinking(false);
    setDroppingDisc(null);
    setHoverColumn(-1);
    setPreviewDisc({ col: -1, visible: false });
    setGameHistory([]);
  };

  const isWinningCell = (row, col) => {
    return winningCells.some(([r, c]) => r === row && c === col);
  };

  const handleColumnHover = (col) => {
    if (!gameOver && !isAIThinking && !droppingDisc && !isColumnFull(board, col)) {
      // Clear any existing timeout
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      setHoverColumn(col);
      setPreviewDisc({ col, visible: true });
    }
  };

  const handleColumnLeave = () => {
    // Clear any existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    // Use a small delay to prevent flickering when moving between elements in the same column
    hoverTimeoutRef.current = setTimeout(() => {
      setHoverColumn(-1);
      setPreviewDisc({ col: -1, visible: false });
    }, 50);
  };

  const getDiscStyle = (row, col, value) => {
    const isWinner = isWinningCell(row, col);
    
    // Check if this is the dropping disc
    const isDropping = droppingDisc && 
                       droppingDisc.col === col && 
                       droppingDisc.targetRow === row;

    let transform = '';
    let zIndex = 1;
    let opacity = 1;
    
    if (isDropping) {
      const totalDistance = (row + 1) * 100; // Slightly increased distance for smoother visual
      const currentY = -totalDistance + (totalDistance * droppingDisc.progress);
      
      // Add subtle scaling effect during drop
      const scale = 0.9 + (0.1 * Math.min(droppingDisc.progress * 1.5, 1));
      transform = `translateY(${currentY}px) scale(${scale})`;
      zIndex = 10;
      
      // Fade in effect
      opacity = Math.min(droppingDisc.progress * 2, 1);
    }

    const baseClasses = "w-full h-full rounded-full border-4 transition-opacity duration-200 relative";
    
    let colorClasses = "";
    let glowClasses = "";
    
    if (value === PLAYER1 || (isDropping && droppingDisc.player === PLAYER1)) {
      colorClasses = "bg-gradient-to-br from-red-400 via-red-500 to-red-600 border-red-700";
      glowClasses = isWinner ? "shadow-2xl ring-4 ring-red-300 ring-opacity-75 animate-pulse" : "shadow-lg";
    } else if (value === PLAYER2 || (isDropping && droppingDisc.player === PLAYER2)) {
      colorClasses = "bg-gradient-to-br from-yellow-300 via-yellow-400 to-yellow-500 border-yellow-600";
      glowClasses = isWinner ? "shadow-2xl ring-4 ring-yellow-300 ring-opacity-75 animate-pulse" : "shadow-lg";
    }

    return {
      className: `${baseClasses} ${colorClasses} ${glowClasses}`,
      style: { transform, zIndex, opacity }
    };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex flex-col items-center justify-center p-2 sm:p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-20 -right-20 sm:-top-40 sm:-right-40 w-40 h-40 sm:w-80 sm:h-80 rounded-full bg-blue-500 opacity-10 animate-pulse"></div>
        <div className="absolute -bottom-20 -left-20 sm:-bottom-40 sm:-left-40 w-40 h-40 sm:w-80 sm:h-80 rounded-full bg-purple-500 opacity-10 animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-48 sm:w-96 sm:h-96 rounded-full bg-indigo-500 opacity-5 animate-spin" style={{animationDuration: '20s'}}></div>
      </div>

      {/* Header */}
      <div className="relative z-10 text-center mb-4 sm:mb-6 lg:mb-8">
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-red-500 to-pink-500 mb-3 sm:mb-4 lg:mb-6 tracking-tight">
          Connect Four
        </h1>
        
        {/* Game Mode Toggle */}
        <div className="flex items-center justify-center mb-4 sm:mb-6">
          <div className="bg-white/10 backdrop-blur-md rounded-full p-1 border border-white/20">
            <button
              onClick={() => { setIsAIMode(false); resetGame(); }}
              className={`px-3 py-2 sm:px-4 sm:py-2 md:px-6 md:py-3 rounded-full font-bold transition-all duration-300 text-sm sm:text-base ${
                !isAIMode 
                  ? 'bg-white text-blue-900 shadow-xl transform scale-105' 
                  : 'text-white hover:bg-white/10'
              }`}
            >
              👥 2 Players
            </button>
            <button
              onClick={() => { setIsAIMode(true); resetGame(); }}
              className={`px-3 py-2 sm:px-4 sm:py-2 md:px-6 md:py-3 rounded-full font-bold transition-all duration-300 text-sm sm:text-base ${
                isAIMode 
                  ? 'bg-white text-blue-900 shadow-xl transform scale-105' 
                  : 'text-white hover:bg-white/10'
              }`}
            >
              🤖 vs AI
            </button>
          </div>
        </div>

        {/* Scoreboard */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-white/20 mb-4 sm:mb-6">
          <div className="grid grid-cols-3 gap-3 sm:gap-4 md:gap-6 text-white">
            <div className="text-center">
              <div className="text-lg sm:text-xl md:text-2xl font-bold text-red-400">{scores.player1}</div>
              <div className="text-xs sm:text-sm opacity-75">Player 1</div>
            </div>
            <div className="text-center">
              <div className="text-lg sm:text-xl md:text-2xl font-bold text-gray-400">{scores.draws}</div>
              <div className="text-xs sm:text-sm opacity-75">Draws</div>
            </div>
            <div className="text-center">
              <div className="text-lg sm:text-xl md:text-2xl font-bold text-yellow-400">{scores.player2}</div>
              <div className="text-xs sm:text-sm opacity-75">{isAIMode ? 'AI' : 'Player 2'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Game Status */}
      <div className="relative z-10 text-center mb-4 sm:mb-6 lg:mb-8">
        {gameOver ? (
          <div className="bg-white/20 backdrop-blur-md rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-white/30">
            <div className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold mb-2">
              {winner ? (
                <span className={`${winner === PLAYER1 ? 'text-red-400' : 'text-yellow-400'} animate-bounce`}>
                  🎉 {isAIMode && winner === PLAYER2 ? 'AI Wins!' : `Player ${winner} Wins!`} 🎉
                </span>
              ) : (
                <span className="text-gray-300">🤝 It's a Draw! 🤝</span>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white/10 backdrop-blur-md rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-white/20">
            {isAIThinking ? (
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                <div className="animate-spin w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 border-2 border-yellow-400 border-t-transparent rounded-full"></div>
                <span className="text-base sm:text-lg md:text-xl font-semibold text-yellow-400">AI is thinking...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                <div className={`w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 rounded-full ${currentPlayer === PLAYER1 ? 'bg-red-500' : 'bg-yellow-400'} animate-pulse`}></div>
                <span className={`text-base sm:text-lg md:text-xl font-semibold ${currentPlayer === PLAYER1 ? 'text-red-400' : 'text-yellow-400'}`}>
                  {isAIMode && currentPlayer === PLAYER2 ? "AI's Turn" : `Player ${currentPlayer}'s Turn`}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Game Board */}
      <div className="relative z-10 mb-4 sm:mb-6 lg:mb-8 w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl">
        <div className="bg-gradient-to-br from-blue-800 via-blue-900 to-indigo-900 rounded-2xl sm:rounded-3xl shadow-2xl border-2 sm:border-4 border-blue-700/50 backdrop-blur-sm overflow-hidden">
          {/* Column hover areas - Responsive sizing */}
          <div className="grid grid-cols-7 gap-0 p-3 sm:p-4 md:p-6 pb-1 sm:pb-2">
            {Array(COLS).fill(null).map((_, colIndex) => (
              <div 
                key={`col-container-${colIndex}`} 
                className="flex flex-col items-center"
                onMouseEnter={() => handleColumnHover(colIndex)}
                onMouseLeave={handleColumnLeave}
              >
                <button
                  className={`w-10 h-8 sm:w-12 sm:h-10 md:w-16 md:h-12 lg:w-20 lg:h-12 xl:w-24 xl:h-12 rounded-t-lg sm:rounded-t-xl transition-all duration-200 flex items-center justify-center ${
                    isColumnFull(board, colIndex) || gameOver || isAIThinking || droppingDisc
                      ? 'cursor-not-allowed opacity-30'
                      : hoverColumn === colIndex
                      ? currentPlayer === PLAYER1
                        ? 'bg-red-500/20 hover:bg-red-500/30'
                        : 'bg-yellow-400/20 hover:bg-yellow-400/30'
                      : 'hover:bg-white/5'
                  }`}
                  onClick={() => !isAIThinking && makeMove(colIndex)}
                  disabled={isColumnFull(board, colIndex) || gameOver || isAIThinking || droppingDisc}
                >
                  <div className="text-white/70 text-xs sm:text-sm font-bold">{colIndex + 1}</div>
                </button>
                
                {/* Preview disc - Responsive sizing */}
                {previewDisc.visible && previewDisc.col === colIndex && !gameOver && !isAIThinking && !droppingDisc && (
                  <div className="mt-1 sm:mt-2 animate-bounce">
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 lg:w-20 lg:h-20 xl:w-24 xl:h-24 rounded-full border-2 sm:border-4 opacity-60 ${
                      currentPlayer === PLAYER1 
                        ? 'bg-gradient-to-br from-red-400 via-red-500 to-red-600 border-red-700' 
                        : 'bg-gradient-to-br from-yellow-300 via-yellow-400 to-yellow-500 border-yellow-600'
                    }`}>
                      <div className="absolute inset-1 sm:inset-2 rounded-full bg-gradient-to-tl from-transparent via-white/20 to-white/40 opacity-60"></div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Board grid - Responsive sizing */}
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1 bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 mx-3 sm:mx-4 md:mx-6 mb-3 sm:mb-4 md:mb-6 p-2 sm:p-3 md:p-4 rounded-xl sm:rounded-2xl shadow-inner border border-blue-600/50 sm:border-2">
            {board.map((row, rowIndex) =>
              row.map((cell, colIndex) => {
                const discStyle = getDiscStyle(rowIndex, colIndex, cell);
                return (
                  <div
                    key={`${rowIndex}-${colIndex}`}
                    className="relative w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 lg:w-20 lg:h-20 xl:w-24 xl:h-24"
                  >
                    {/* Grid slot background - always visible */}
                    <div className="absolute inset-0 rounded-full bg-blue-900/80 border border-blue-500/30 sm:border-2 shadow-inner">
                      <div className="absolute inset-0.5 sm:inset-1 rounded-full bg-gradient-to-br from-blue-800/50 to-blue-900/80 border border-blue-400/20"></div>
                    </div>
                    
                    {/* Disc - only visible when there's a piece */}
                    {(cell !== EMPTY || (droppingDisc && droppingDisc.col === colIndex && droppingDisc.targetRow === rowIndex)) && (
                      <div
                        className={`absolute inset-0 ${discStyle.className}`}
                        style={discStyle.style}
                      >
                        {/* Inner shine effect */}
                        <div className="absolute inset-1 sm:inset-2 rounded-full bg-gradient-to-tl from-transparent via-white/20 to-white/40 opacity-60"></div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Control buttons */}
      <div className="relative z-10 flex flex-col sm:flex-row gap-3 sm:gap-4 w-full max-w-sm sm:max-w-none">
        <button
          onClick={resetGame}
          className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white px-4 sm:px-6 md:px-8 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-sm sm:text-base md:text-lg shadow-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl border border-green-400/50"
        >
          🔄 New Game
        </button>
        
        <button
          onClick={() => setScores({ player1: 0, player2: 0, draws: 0 })}
          className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white px-4 sm:px-6 md:px-8 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-sm sm:text-base md:text-lg shadow-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl border border-purple-400/50"
        >
          🏆 Reset Score
        </button>
      </div>

      {/* Instructions */}
      <div className="relative z-10 mt-6 sm:mt-8 text-center text-white/70 max-w-xs sm:max-w-sm md:max-w-md px-4">
        <p className="mb-2 text-sm sm:text-base">🎯 Drop discs by clicking on columns</p>
        <p className="mb-2 text-sm sm:text-base">🏆 Get 4 in a row to win!</p>
        <div className="flex justify-center items-center gap-4 sm:gap-6 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 sm:w-5 sm:h-5 bg-gradient-to-br from-red-400 to-red-600 rounded-full shadow-lg"></div>
            <span className="font-semibold text-sm sm:text-base">Player 1</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 sm:w-5 sm:h-5 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-full shadow-lg"></div>
            <span className="font-semibold text-sm sm:text-base">{isAIMode ? 'AI' : 'Player 2'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectFourGame;