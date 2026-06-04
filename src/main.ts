import { GameEngine } from './engine/GameEngine';

window.addEventListener('load', () => {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (!canvas) return;

  // Set logical dimensions for internal rendering (standard 16:9)
  canvas.width = 960;
  canvas.height = 540;

  // Initialize Game Engine
  const engine = new GameEngine(canvas);

  // Setup button listeners for menus
  const startBtn = document.getElementById('start-btn');
  const retryBtn = document.getElementById('retry-btn');
  const resumeBtn = document.getElementById('resume-btn');
  const nextBtn = document.getElementById('next-btn');

  startBtn?.addEventListener('click', () => {
    engine.startGame();
  });

  retryBtn?.addEventListener('click', () => {
    engine.restartLevel();
  });

  resumeBtn?.addEventListener('click', () => {
    engine.resumeFromCampfire();
  });

  nextBtn?.addEventListener('click', () => {
    engine.transitionToJungle();
  });

  // Keep focus on window/canvas for keyboard controls
  window.focus();
});
