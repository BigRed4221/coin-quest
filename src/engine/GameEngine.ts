import { Player, SkillName } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { Drop } from '../entities/Drop';
import { Level, Platform } from './Level';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  type: 'cointoss' | 'citation';
  bounces: number;
  damage: number;
  color: string;
}

interface TutorialArena {
  id: string;
  triggerX: number;
  leftBarrierX: number;
  rightBarrierX: number;
  isActive: boolean;
  isCleared: boolean;
  enemyIndices: number[];
  leftPlatform: Platform | null;
  rightPlatform: Platform | null;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  
  // Game state
  private gameState: 'start_screen' | 'cutscene' | 'playing' | 'campfire' | 'game_over' | 'victory' | 'tutorial' = 'start_screen';
  private tick: number = 0;

  // Cutscene state removed
  private cameraScale: number = 1.6; // Moved camera further back (from 2.0 to 1.6)
  private cameraX: number = 0;
  private maxCameraX: number = 3000; // 3600 level width - 600 zoomed viewport width

  // Entities
  private player: Player;
  private enemies: Enemy[] = [];
  private enemiesHitThisSwing: Enemy[] = [];
  private enemiesHitThisSlide: Enemy[] = [];
  private drops: Drop[] = [];
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private level: Level;
  private arenas: TutorialArena[] = [];

  // Checkpoint tracking
  private lastCheckpointX: number = 100;
  private hasCampfireBeenUsed: boolean = false;
  private isNearCampfire: boolean = false;

  // Keyboard/Mouse inputs
  private keys: { [key: string]: boolean } = {};
  private mouseClicked: boolean = false;

  // Boss state
  private bossSpawned: boolean = false;
  private bossDefeated: boolean = false;
  private isCameraLockedForBoss: boolean = false;

  // HUD elements
  private hudElement: HTMLElement | null;
  private healthFill: HTMLElement | null;
  private moneyFill: HTMLElement | null;
  private hudCoins: HTMLElement | null;
  private hudSkill1: HTMLElement | null;
  private hudSkill2: HTMLElement | null;
  private tutorialPrompt: HTMLElement | null;

  // Screens
  private startScreen: HTMLElement | null;
  private campfireScreen: HTMLElement | null;
  private gameOverScreen: HTMLElement | null;
  private victoryScreen: HTMLElement | null;

  // Selected campfire slot
  private selectedCampfireSlot: 1 | 2 = 1;

  // Tutorial screen elements
  private tutorialOverlay: HTMLElement | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get Canvas 2D Context');
    this.ctx = context;

    this.player = new Player();
    this.level = new Level();
    this.maxCameraX = this.level.width - (960 / this.cameraScale);

    // Cache HUD references
    this.hudElement = document.getElementById('game-hud');
    this.healthFill = document.getElementById('health-bar');
    this.moneyFill = document.getElementById('money-bar');
    this.hudCoins = document.getElementById('hud-coins');
    this.hudSkill1 = document.getElementById('hud-skill-1');
    this.hudSkill2 = document.getElementById('hud-skill-2');
    this.tutorialPrompt = document.getElementById('tutorial-prompt');

    // Cache Screens
    this.startScreen = document.getElementById('start-screen');
    this.campfireScreen = document.getElementById('campfire-screen');
    this.gameOverScreen = document.getElementById('game-over-screen');
    this.victoryScreen = document.getElementById('victory-screen');
    this.tutorialOverlay = document.getElementById('tutorial-overlay');

    const closeBtn = document.getElementById('tutorial-close-btn');
    closeBtn?.addEventListener('click', () => {
      this.resumeFromTutorial();
    });

    this.setupInputs();
    this.setupCampfireScreenListeners();

    // Run core render loops
    this.animate();
  }

  private setupInputs() {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      this.keys[key] = true;

      // Handle interaction key 'r' when playing and near campfire
      if (key === 'r' && this.gameState === 'playing' && this.isNearCampfire) {
        this.enterCampfire();
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      this.keys[key] = false;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.gameState === 'playing') {
        this.mouseClicked = true;
      }
    });
  }

  // Bind click listeners for campfire skill selection
  private setupCampfireScreenListeners() {
    const slots = document.querySelectorAll('.loadout-slot');
    slots.forEach(slot => {
      slot.addEventListener('click', (e) => {
        slots.forEach(s => s.classList.remove('selected-slot'));
        const el = e.currentTarget as HTMLElement;
        el.classList.add('selected-slot');
        this.selectedCampfireSlot = parseInt(el.getAttribute('data-slot') || '1') as 1 | 2;
      });
    });
  }

  startGame() {
    this.startScreen?.classList.add('hidden');
    this.gameState = 'playing';
    this.hudElement?.classList.remove('hud-hidden');
    this.resetLevel();
  }

  restartLevel() {
    this.gameState = 'playing';
    this.gameOverScreen?.classList.add('hidden');
    this.resetLevel();
  }

  private resetLevel() {
    this.player.reset();
    
    // Spawn player at last checkpoint
    this.player.x = this.lastCheckpointX;
    this.player.y = 400;
    this.cameraX = Math.max(0, Math.min(this.player.x - (480 / this.cameraScale), this.maxCameraX));

    this.projectiles = [];
    this.particles = [];
    this.drops = [];

    // Reset level obstacles
    this.level.initLevel();

    // Spawn Suburbs Enemies (Sky-Drop Tutorial Arenas)
    this.enemies = [
      // Arena 1: Stray Dog Drop (Indices 0, 1)
      new Enemy(550, -100, 'dog', 0),
      new Enemy(700, -200, 'dog', 0),

      // Arena 2: Angry Pigeon Drop (Indices 2, 3)
      new Enemy(1000, -100, 'pigeon', 100),
      new Enemy(1200, -200, 'pigeon', 100),

      // Arena 3: HOA Inspector Drop (Indices 4, 5)
      new Enemy(1600, -100, 'inspector', 350),
      new Enemy(1750, -200, 'inspector', 250),

      // Group 4: Post-campfire ambush (X=2300 to 2850)
      new Enemy(2300, 450, 'dog', 150),
      new Enemy(2500, 440, 'pigeon', 80),
      new Enemy(2760, 440, 'pigeon', 80),
      new Enemy(2850, 420, 'inspector', 300)
    ];

    // Initialize the 3 locked tutorial arenas
    this.arenas = [
      { id: 'arena_dogs', triggerX: 500, leftBarrierX: 400, rightBarrierX: 800, isActive: false, isCleared: false, enemyIndices: [0, 1], leftPlatform: null, rightPlatform: null },
      { id: 'arena_pigeons', triggerX: 900, leftBarrierX: 800, rightBarrierX: 1400, isActive: false, isCleared: false, enemyIndices: [2, 3], leftPlatform: null, rightPlatform: null },
      { id: 'arena_inspectors', triggerX: 1500, leftBarrierX: 1400, rightBarrierX: 1900, isActive: false, isCleared: false, enemyIndices: [4, 5], leftPlatform: null, rightPlatform: null }
    ];



    // If player has already beaten boss once or campfire used
    if (this.hasCampfireBeenUsed) {
      this.player.unlockSkill('Coin Slide');
    }

    this.bossSpawned = false;
    this.bossDefeated = false;
    this.isCameraLockedForBoss = false;

    this.updateHUD();
  }

  private enterCampfire() {
    this.gameState = 'campfire';
    this.campfireScreen?.classList.remove('hidden');
    this.lastCheckpointX = this.level.campfireX;
    this.hasCampfireBeenUsed = true;
    this.player.health = this.player.maxHealth; // Fully heal

    // Unlock Coin Slide automatically at campfire if not already unlocked
    this.player.unlockSkill('Coin Slide');

    this.populateCampfireSkills();
  }

  // private triggerTutorial(id: string, title: string, text: string) {
  //   this.gameState = 'tutorial';
  //   this.triggeredTutorials[id] = true;
  //   
  //   if (this.tutorialTitle) this.tutorialTitle.innerText = title;
  //   if (this.tutorialText) this.tutorialText.innerHTML = text;
  //   
  //   this.tutorialOverlay?.classList.remove('hidden');
  // }

  private resumeFromTutorial() {
    this.gameState = 'playing';
    this.tutorialOverlay?.classList.add('hidden');
    window.focus();
  }

  private populateCampfireSkills() {
    const slot1El = document.getElementById('campfire-slot-1');
    const slot2El = document.getElementById('campfire-slot-2');
    
    if (slot1El) slot1El.textContent = this.player.equippedSkills.slot1 || 'None';
    if (slot2El) slot2El.textContent = this.player.equippedSkills.slot2 || 'None';

    const container = document.getElementById('unlocked-skills-container');
    if (!container) return;
    container.innerHTML = '';

    if (this.player.unlockedSkills.length === 0) {
      container.innerHTML = '<p style="font-size:0.75rem;color:var(--text-muted)">No skills unlocked yet.</p>';
      return;
    }

    this.player.unlockedSkills.forEach(skill => {
      const div = document.createElement('div');
      div.className = 'skill-list-item';
      
      let desc = '';
      if (skill === 'Coin Slide') desc = 'Dash forward & crash enemies';
      if (skill === 'Coin Toss') desc = 'Frisbee coin bounce-explodes';
      if (skill === 'Golden Shield') desc = 'Spinning shield absorbs damage';

      div.innerHTML = `
        <div class="skill-item-info">
          <span class="skill-item-name">${skill}</span>
          <span class="skill-item-desc">${desc}</span>
        </div>
        <button class="equip-btn" data-skill="${skill}">Equip</button>
      `;

      div.querySelector('.equip-btn')?.addEventListener('click', () => {
        this.equipSkillAtCampfire(skill);
      });

      container.appendChild(div);
    });
  }

  private equipSkillAtCampfire(skill: SkillName) {
    if (this.selectedCampfireSlot === 1) {
      // Prevent equipping same skill in both slots
      if (this.player.equippedSkills.slot2 === skill) {
        this.player.equippedSkills.slot2 = null;
      }
      this.player.equippedSkills.slot1 = skill;
    } else {
      if (this.player.equippedSkills.slot1 === skill) {
        this.player.equippedSkills.slot1 = null;
      }
      this.player.equippedSkills.slot2 = skill;
    }

    // Refresh display
    this.populateCampfireSkills();
    this.updateHUD();
  }

  resumeFromCampfire() {
    this.gameState = 'playing';
    this.campfireScreen?.classList.add('hidden');
    // Save checkpoint
    this.lastCheckpointX = this.level.campfireX;
    window.focus();
  }

  transitionToJungle() {
    // In the full game, this would load Area 2.
    // For this prototype, we restart the level with all skills unlocked to allow Sandbox play!
    this.victoryScreen?.classList.add('hidden');
    this.lastCheckpointX = 100;
    this.hasCampfireBeenUsed = true;
    this.resetLevel();
    this.player.unlockSkill('Coin Slide');
    this.player.unlockSkill('Coin Toss');
    this.player.unlockSkill('Golden Shield');
    this.updateHUD();
    this.gameState = 'playing';
    window.focus();
  }

  private handleCampfireTrigger() {
    const distToCamp = Math.abs(this.player.x - this.level.campfireX);
    if (distToCamp < 50 && this.player.isGrounded) {
      this.isNearCampfire = true;
    } else {
      this.isNearCampfire = false;
    }
  }

  private handleBossTrigger() {
    if (this.player.x >= this.level.bossTriggerX && !this.bossSpawned) {
      this.bossSpawned = true;
      this.isCameraLockedForBoss = true;
      
      // Spawn Officer Bob Boss
      const boss = new Enemy(this.level.endGateX - 250, 400, 'officer_bob', 0);
      this.enemies.push(boss);
    }
  }

  private handleCombatCollisions() {
    if (this.player.attackActiveTimer <= 0) {
      this.enemiesHitThisSwing = [];
      return;
    }

    const currentHeight = this.player.isCrouching ? this.player.height / 2 : this.player.height;
    
    // Define player attack hitbox
    const reach = this.player.comboStep === 3 ? 45 : 30; // Kick has longer reach
    const ax = this.player.facingRight ? this.player.x + this.player.width : this.player.x - reach;
    const ay = this.player.y + currentHeight / 2 - 20;
    const aw = reach;
    const ah = 40;

    // Check collision against cardboard boxes & trashcans
    for (const p of this.level.platforms) {
      if (p.type === 'box' && !p.broken) {
        if (
          ax + aw > p.x &&
          ax < p.x + p.w &&
          ay + ah > p.y &&
          ay < p.y + p.h
        ) {
          // Break the box!
          p.broken = true;
          this.spawnBreakEffect(p.x + p.w / 2, p.y + p.h / 2, '#ca8a04');
          
          // Spawn coins/XP out of broken boxes
          for (let i = 0; i < 2; i++) {
            this.drops.push(new Drop(p.x + p.w / 2, p.y + p.h / 2, 'coin', 10));
          }
          this.drops.push(new Drop(p.x + p.w / 2, p.y + p.h / 2, 'xp', 15));
        }
        }
    }

    // Check collision against enemies
    for (const enemy of this.enemies) {
      if (enemy.state === 'dead') continue;
      if (this.enemiesHitThisSwing.includes(enemy)) continue; // Already hit this swing

      if (
        ax + aw > enemy.x &&
        ax < enemy.x + enemy.width &&
        ay + ah > enemy.y &&
        ay < enemy.y + enemy.height
      ) {
        this.enemiesHitThisSwing.push(enemy); // Register hit
        
        // Damage calculations
        const damage = this.player.comboStep === 3 ? 20 : 10; // Kick does double damage
        const knockback = this.player.facingRight ? 6 : -6;
        const isKick = this.player.comboStep === 3;
        
        const newDrops = enemy.takeDamage(damage, knockback, this.player.x, isKick);
        
        // Spawn hit spark particles
        this.spawnHitSpark(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);

        if (newDrops) {
          this.drops.push(...newDrops);
          if (enemy.type === 'officer_bob') {
            this.bossDefeated = true;
            this.isCameraLockedForBoss = false;
            // Unlocked gate platform
            const gate = this.level.platforms.find(p => p.type === 'gate');
            if (gate) gate.broken = true; // Open the gate!
            
            // Spawn victory trigger
            setTimeout(() => {
              this.gameState = 'victory';
              this.victoryScreen?.classList.remove('hidden');
            }, 1500);
          }
        }
      }
    }
  }

  private handlePlayerSlideCollisions() {
    if (!this.player.isCoinSliding) {
      this.enemiesHitThisSlide = [];
      return;
    }

    // Bounding box of slide
    const sax = this.player.x;
    const say = this.player.y + this.player.height - 30;
    const saw = this.player.width;
    const sah = 30;

    for (const enemy of this.enemies) {
      if (enemy.state === 'dead') continue;
      if (this.enemiesHitThisSlide.includes(enemy)) continue; // Already hit this slide

      if (
        sax + saw > enemy.x &&
        sax < enemy.x + enemy.width &&
        say + sah > enemy.y &&
        say < enemy.y + enemy.height
      ) {
        this.enemiesHitThisSlide.push(enemy); // Register slide hit
        
        // Slide hits enemy: deal medium damage and heavy knockback
        const knockback = this.player.facingRight ? 10 : -10;
        const newDrops = enemy.takeDamage(15, knockback, this.player.x);
        this.spawnHitSpark(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);

        if (newDrops) {
          this.drops.push(...newDrops);
          if (enemy.type === 'officer_bob') {
            this.bossDefeated = true;
            this.isCameraLockedForBoss = false;
            const gate = this.level.platforms.find(p => p.type === 'gate');
            if (gate) gate.broken = true;
            setTimeout(() => {
              this.gameState = 'victory';
              this.victoryScreen?.classList.remove('hidden');
            }, 1500);
          }
        }
      }
    }
  }

  private handleEnemyProjectiles(enemy: Enemy) {
    if (enemy.type === 'officer_bob' && enemy.bossPhase === 'shoot' && this.tick % 45 === 0) {
      // Officer Bob throws a Citation Ticket projectile!
      const px = enemy.x + (enemy.facingRight ? enemy.width : 0);
      const py = enemy.y + 25;
      const angle = enemy.facingRight ? 0 : Math.PI;
      this.projectiles.push({
        x: px,
        y: py,
        vx: Math.cos(angle) * 6,
        vy: -2, // Slight arc upward
        radius: 6,
        type: 'citation',
        bounces: 0,
        damage: 12,
        color: '#f8fafc' // White ticket
      });
    } else if (enemy.type === 'inspector' && enemy.state === 'chase' && enemy.bossStateTimer === 25) {
      // HOA Inspector throws a Citation Ticket projectile!
      const px = enemy.x + (enemy.facingRight ? enemy.width : 0);
      const py = enemy.y + 20;
      const angle = enemy.facingRight ? 0 : Math.PI;
      this.projectiles.push({
        x: px,
        y: py,
        vx: Math.cos(angle) * 5,
        vy: -1, // Slight arc upward
        radius: 5,
        type: 'citation',
        bounces: 0,
        damage: 8,
        color: '#f8fafc' // White ticket
      });
    }
  }

  private updateProjectiles() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx;
      p.y += p.vy;

      // Apply simple gravity to projectiles
      p.vy += 0.1;

      // Check collision with player
      if (p.type === 'citation') {
        const dx = this.player.x + this.player.width / 2 - p.x;
        const dy = this.player.y + this.player.height / 2 - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < p.radius + 15) {
          // Hit player!
          this.player.takeDamage(p.damage);
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      // Check collision/physics for player cointoss projectile
      if (p.type === 'cointoss') {
        // Bounce on platforms
        for (const plat of this.level.platforms) {
          if (plat.broken) continue;
          if (
            p.x + p.radius > plat.x &&
            p.x - p.radius < plat.x + plat.w &&
            p.y + p.radius > plat.y &&
            p.y - p.radius < plat.y + plat.h
          ) {
            // Collision from top
            if (p.vy > 0 && p.y - p.vy + p.radius <= plat.y + 4) {
              p.y = plat.y - p.radius;
              p.vy = -p.vy * 0.6; // Bounce up
              p.vx *= 0.9;
              p.bounces++;
            }
            // Lateral collision
            else if (p.vx > 0 && p.x - p.vx + p.radius <= plat.x) {
              p.x = plat.x - p.radius;
              p.vx = -p.vx * 0.8;
              p.bounces++;
            }
            else if (p.vx < 0 && p.x - p.vx - p.radius >= plat.x + plat.w) {
              p.x = plat.x + plat.w + p.radius;
              p.vx = -p.vx * 0.8;
              p.bounces++;
            }
          }
        }

        // Hard floor boundary
        const groundY = 480;
        if (p.y + p.radius >= groundY) {
          p.y = groundY - p.radius;
          p.vy = -p.vy * 0.6;
          p.vx *= 0.9;
          p.bounces++;
        }

        // Check collision against enemies
        for (const enemy of this.enemies) {
          if (enemy.state === 'dead') continue;
          const dx = enemy.x + enemy.width / 2 - p.x;
          const dy = enemy.y + enemy.height / 2 - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < p.radius + Math.max(enemy.width, enemy.height) / 2) {
            // Explode!
            const newDrops = enemy.takeDamage(p.damage, p.vx > 0 ? 6 : -6, this.player.x);
            this.spawnExplosion(p.x, p.y);
            if (newDrops) {
              this.drops.push(...newDrops);
              if (enemy.type === 'officer_bob') {
                this.bossDefeated = true;
                this.isCameraLockedForBoss = false;
                const gate = this.level.platforms.find(plat => plat.type === 'gate');
                if (gate) gate.broken = true;
                setTimeout(() => {
                  this.gameState = 'victory';
                  this.victoryScreen?.classList.remove('hidden');
                }, 1500);
              }
            }
            this.projectiles.splice(i, 1);
            break;
          }
        }

        // Clean up if it bounced too much or if it's already removed
        const index = this.projectiles.indexOf(p);
        if (index !== -1 && p.bounces > 3) {
          this.spawnExplosion(p.x, p.y);
          this.projectiles.splice(index, 1);
        }
      }

      // Out of bounds cleanup
      const viewportWidth = 960 / this.cameraScale;
      if (p.x < this.cameraX - 100 || p.x > this.cameraX + viewportWidth + 100 || p.y > 540) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  private handleEnemyAttacks() {
    for (let idx = 0; idx < this.enemies.length; idx++) {
      const enemy = this.enemies[idx];
      if (enemy.state === 'dead' || enemy.isStunned) continue;

      // Check if enemy's arena is inactive
      const associatedArena = this.arenas.find(a => a.enemyIndices.includes(idx));
      if (associatedArena && !associatedArena.isActive) {
        continue;
      }

      const playerHeight = this.player.isCrouching ? this.player.height / 2 : this.player.height;
      const px = this.player.x;
      const py = this.player.y;
      const pw = this.player.width;
      const ph = playerHeight;

      // Lawnmower hits anything
      if (
        enemy.x + enemy.width > px &&
        enemy.x < px + pw &&
        enemy.y + enemy.height > py &&
        enemy.y < py + ph
      ) {
        if (enemy.type === 'inspector') {
          // If guard-broken, Carl can safely hit it!
          if (enemy.state === 'crash_stun') continue;
          this.player.takeDamage(15);
        } else if (enemy.type === 'dog') {
          this.player.takeDamage(15);
        } else if (enemy.type === 'pigeon') {
          // If Carl is crouching, Pigeon flies right over him!
          if (this.player.isCrouching && enemy.y < py + 10) continue;
          this.player.takeDamage(10);
          enemy.swoopUp();
        } else if (enemy.type === 'officer_bob') {
          this.player.takeDamage(25);
        }
      }

      // Check if boss spawns citations
      this.handleEnemyProjectiles(enemy);
    }
  }

  private handleLootCollection() {
    for (const drop of this.drops) {
      if (drop.isCollected) continue;

      const px = this.player.x + this.player.width / 2;
      const py = this.player.y + this.player.height / 2;
      const dx = px - drop.x;
      const dy = py - drop.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 25) {
        // Collect!
        drop.isCollected = true;
        if (drop.type === 'coin') {
          this.player.coins += drop.value;
        } else {
          // XP increases Money Meter
          this.player.moneyMeter = Math.min(this.player.maxMoneyMeter, this.player.moneyMeter + drop.value);
        }
        
        // Spawn small glitter trail particle
        this.spawnGlitter(drop.x, drop.y, drop.type === 'coin' ? '#ffd700' : '#10b981');
        this.updateHUD();
      }
    }
  }

  private spawnHitSpark(x: number, y: number) {
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        color: '#ffffff', // Spark white
        size: Math.random() * 3 + 2,
        life: 0,
        maxLife: 15 + Math.random() * 10
      });
    }
  }

  private spawnBreakEffect(x: number, y: number, color: string) {
    for (let i = 0; i < 15; i++) {
      this.particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 6,
        vy: -Math.random() * 4 - 2,
        color: color,
        size: Math.random() * 4 + 3,
        life: 0,
        maxLife: 30 + Math.random() * 15
      });
    }
  }

  private spawnGlitter(x: number, y: number, color: string) {
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2 - 1,
        color: color,
        size: Math.random() * 2 + 1,
        life: 0,
        maxLife: 20
      });
    }
  }

  private spawnPlayerCoinToss() {
    const px = this.player.x + (this.player.facingRight ? this.player.width : 0);
    const py = this.player.y + this.player.height / 2 - 10;
    const vx = this.player.facingRight ? 8 : -8;
    const vy = -3;
    this.projectiles.push({
      x: px,
      y: py,
      vx: vx,
      vy: vy,
      radius: 8,
      type: 'cointoss',
      bounces: 0,
      damage: 20,
      color: '#ffd700'
    });
  }

  private spawnShieldAbsorbEffect(x: number, y: number) {
    for (let i = 0; i < 15; i++) {
      this.particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        color: '#ffd700',
        size: Math.random() * 3 + 2,
        life: 0,
        maxLife: 20 + Math.random() * 10
      });
    }
  }

  private spawnExplosion(x: number, y: number) {
    for (let i = 0; i < 12; i++) {
      this.particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6 - 2,
        color: i % 2 === 0 ? '#fb7185' : '#fde047',
        size: Math.random() * 4 + 3,
        life: 0,
        maxLife: 20 + Math.random() * 10
      });
    }
  }

  private updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1; // Minor gravity pull
      p.life++;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }
  }

  private updateTutorialPrompts() {
    if (!this.tutorialPrompt) return;

    // Check if any arena is active
    const activeArena = this.arenas.find(a => a.isActive && !a.isCleared);
    if (activeArena) {
      let enemyName = 'enemies';
      if (activeArena.id === 'arena_dogs') enemyName = 'Stray Dogs. Press J to punch!';
      else if (activeArena.id === 'arena_pigeons') enemyName = 'Angry Pigeons. Jump or punch!';
      else if (activeArena.id === 'arena_inspectors') enemyName = 'HOA Inspectors. Use full 3-hit combo to break guard!';
      else if (activeArena.id === 'ambush') enemyName = 'Ambush Patrol';
      
      this.tutorialPrompt.textContent = `COMBAT ZONE: Defeat the ${enemyName}`;
      return;
    }

    const px = this.player.x;
    if (px < 400) {
      this.tutorialPrompt.textContent = 'Press A / D to Walk. Hold W or Space to Jump!';
    } else if (px >= 400 && px < 500) {
      this.tutorialPrompt.textContent = 'Jump over Grandma\\'s white picket fence!';
    } else if (px >= 500 && px < 1900) {
      this.tutorialPrompt.textContent = 'Walk forward to trigger the next Combat Zone!';
    } else if (px >= 1900 && px < 2100) {
      this.tutorialPrompt.textContent = 'Stand near campfire. Press R to rest & equip skills!';
    } else if (px >= 2100 && px < 3100) {
      this.tutorialPrompt.textContent = 'Use E / F to activate equipped skills!';
    } else if (px >= 3100 && !this.bossDefeated) {
      this.tutorialPrompt.textContent = 'BOSS: Officer Bob! Jump over Segway charges!';
    } else if (this.bossDefeated) {
      this.tutorialPrompt.textContent = 'Walk to the end gate to escape!';
    }
  }

  private updateHUD() {
    if (this.healthFill) {
      this.healthFill.style.width = `${Math.max(0, this.player.health)}%`;
    }
    if (this.moneyFill) {
      this.moneyFill.style.width = `${this.player.moneyMeter}%`;
    }
    if (this.hudCoins) {
      this.hudCoins.textContent = this.player.coins.toLocaleString();
    }
    if (this.hudSkill1) {
      this.hudSkill1.textContent = this.player.equippedSkills.slot1 || 'None';
      const slot = document.getElementById('slot-1');
      if (this.player.equippedSkills.slot1) {
        slot?.classList.add('equipped');
      } else {
        slot?.classList.remove('equipped');
      }
    }
    if (this.hudSkill2) {
      this.hudSkill2.textContent = this.player.equippedSkills.slot2 || 'None';
      const slot = document.getElementById('slot-2');
      if (this.player.equippedSkills.slot2) {
        slot?.classList.add('equipped');
      } else {
        slot?.classList.remove('equipped');
      }
    }

    // Cooldown visual HUD percentages
    const cd1 = document.getElementById('cooldown-1');
    const cd2 = document.getElementById('cooldown-2');
    
    if (cd1 && this.player.equippedSkills.slot1) {
      const cd = this.player.cooldowns[this.player.equippedSkills.slot1] || 0;
      const duration = this.player.cooldownDurations[this.player.equippedSkills.slot1] || 1;
      cd1.style.height = `${(cd / duration) * 100}%`;
    }
    if (cd2 && this.player.equippedSkills.slot2) {
      const cd = this.player.cooldowns[this.player.equippedSkills.slot2] || 0;
      const duration = this.player.cooldownDurations[this.player.equippedSkills.slot2] || 1;
      cd2.style.height = `${(cd / duration) * 100}%`;
    }
  }

  // Orchestrator loop
  private animate = () => {
    if (this.gameState === 'playing') {
      this.tick++;

      // 1. Update Player Inputs & States
      this.player.handleInput(this.keys, this.mouseClicked);
      this.mouseClicked = false; // Reset click triggers

      this.player.update(this.level.platforms);

      // Spawn floating gold skill particles if the player has active gold skills
      if (this.player.goldSkillEffectTimer > 0) {
        const pCount = Math.random() < 0.4 ? 2 : 1;
        for (let i = 0; i < pCount; i++) {
          const px = this.player.x + Math.random() * this.player.width;
          const py = this.player.y + (this.player.isCrouching ? this.player.height / 2 : this.player.height) - 5;
          this.particles.push({
            x: px,
            y: py,
            vx: (Math.random() - 0.5) * 1.6,
            vy: -Math.random() * 2 - 1.5, // rising speed
            color: Math.random() < 0.6 ? '#ffd700' : '#fbbf24',
            size: Math.random() * 2 + 2,
            life: 0,
            maxLife: 15 + Math.random() * 15
          });
        }
      }

      // Update Combat Arenas
      for (const arena of this.arenas) {
        // Trigger arena activation
        if (!arena.isActive && !arena.isCleared && this.player.x >= arena.triggerX) {
          arena.isActive = true;
          arena.leftPlatform = { x: arena.leftBarrierX - 5, y: 100, w: 10, h: 380, type: 'obstacle', isBarrier: true };
          arena.rightPlatform = { x: arena.rightBarrierX - 5, y: 100, w: 10, h: 380, type: 'obstacle', isBarrier: true };
          this.level.platforms.push(arena.leftPlatform);
          this.level.platforms.push(arena.rightPlatform);

          // Spawn activation particles
          this.spawnBarrierActivationEffect(arena.leftBarrierX);
          this.spawnBarrierActivationEffect(arena.rightBarrierX);
        }

        // Check if arena is cleared
        if (arena.isActive && !arena.isCleared) {
          const allDead = arena.enemyIndices.every(idx => {
            const enemy = this.enemies[idx];
            return !enemy || enemy.state === 'dead';
          });

          if (allDead) {
            arena.isCleared = true;
            arena.isActive = false;

            // Remove barrier platforms from the level
            this.level.platforms = this.level.platforms.filter(
              p => p !== arena.leftPlatform && p !== arena.rightPlatform
            );
            arena.leftPlatform = null;
            arena.rightPlatform = null;

            // Spawn clear particles
            this.spawnBarrierClearEffect(arena.leftBarrierX);
            this.spawnBarrierClearEffect(arena.rightBarrierX);
          }
        }
      }

      // Inline tutorial dialog popups have been replaced by the intro cutscene tutorial slideshow.

      // Check skill flags
      if (this.player.coinTossTriggered) {
        this.player.coinTossTriggered = false;
        this.spawnPlayerCoinToss();
      }
      if (this.player.shieldAbsorbedHit) {
        this.player.shieldAbsorbedHit = false;
        this.spawnShieldAbsorbEffect(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2);
      }

      // Check game over triggers
      if (this.player.health <= 0) {
        this.gameState = 'game_over';
        setTimeout(() => {
          this.gameOverScreen?.classList.remove('hidden');
        }, 1500);
      }

      // 2. Camera tracking player (horizontal scroll)
      if (!this.isCameraLockedForBoss) {
        // Center player on screen
        const viewportWidth = 960 / this.cameraScale;
        const targetCamX = this.player.x - viewportWidth / 2;
        this.cameraX += (targetCamX - this.cameraX) * 0.1;
        this.cameraX = Math.max(0, Math.min(this.cameraX, this.maxCameraX));
      }

      // 3. Update Drops and Projectiles
      this.drops.forEach(d => d.update(this.player.x, this.player.y, this.level.platforms));
      this.updateProjectiles();
      this.updateParticles();

      // 4. Update Enemies
      this.enemies.forEach((e, idx) => {
        const associatedArena = this.arenas.find(a => a.enemyIndices.includes(idx));
        if (associatedArena) {
          if (!associatedArena.isActive && !associatedArena.isCleared) {
            // Freeze the enemy (prevent movement & actions) until their zone triggers
            return;
          }
          
          e.update(this.player.x, this.player.y, this.level.platforms, this.tick);

          // Keep enemies strictly bound within active arena barriers to prevent knockback out of the zone
          if (associatedArena.isActive && !associatedArena.isCleared) {
            const enemyLeft = e.x;
            const enemyRight = e.x + e.width;

            if (enemyLeft < associatedArena.leftBarrierX) {
              e.x = associatedArena.leftBarrierX;
              if (e.vx < 0) {
                if (e.type === 'inspector') {
                  e.vx = e.speed;
                  e.facingRight = true;
                } else {
                  e.vx = 0;
                }
              }
            }
            if (enemyRight > associatedArena.rightBarrierX) {
              e.x = associatedArena.rightBarrierX - e.width;
              if (e.vx > 0) {
                if (e.type === 'inspector') {
                  e.vx = -e.speed;
                  e.facingRight = false;
                } else {
                  e.vx = 0;
                }
              }
            }
          }
        } else {
          e.update(this.player.x, this.player.y, this.level.platforms, this.tick);
        }
      });

      // 5. Run triggers & Collisions check
      this.handleCampfireTrigger();
      this.handleBossTrigger();
      this.handleCombatCollisions();
      this.handlePlayerSlideCollisions();
      this.handleEnemyAttacks();
      this.handleLootCollection();
      
      // Update HUD elements
      this.updateTutorialPrompts();
      this.updateHUD();
    }

    // 6. RENDER EVERYTHING TO CANVAS
    this.render();

    requestAnimationFrame(this.animate);
  };

  private render() {
    this.ctx.clearRect(0, 0, 960, 540);

    this.ctx.save();
    
    // Scale context for retro pixelation and zoom
    this.ctx.scale(this.cameraScale, this.cameraScale);
    // Shift context Y so that we view the bottom of the 540-height level coordinates
    const viewportHeight = 540 / this.cameraScale;
    this.ctx.translate(0, -(540 - viewportHeight));

    // 1. Draw level layers (parallax backgrounds)
    this.level.drawBackground(this.ctx, this.cameraX, this.cameraScale);

    // 2. Draw solid blocks, campfire checkpoint
    this.level.drawForeground(this.ctx, this.cameraX, this.tick);

    // 2b. Draw active laser barriers
    this.drawBarriers(this.ctx);

    // 3. Draw physical drops (coins & XP gems)
    this.drops.forEach(d => d.draw(this.ctx, this.cameraX));

    // 4. Draw projectiles (citations, thrown coins) in blocky retro pixel style
    this.projectiles.forEach(p => {
      this.ctx.save();
      this.ctx.translate(p.x - this.cameraX, p.y);

      if (p.type === 'cointoss') {
        // Spin the coin blockily
        const angle = (this.tick * 0.2) % (Math.PI * 2);
        this.ctx.rotate(angle);
        
        // Outline silhouette
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(-7, -7, 14, 14);
        
        // Gold Coin octagon body
        this.ctx.fillStyle = '#ffd700';
        this.ctx.fillRect(-6, -4, 12, 8);
        this.ctx.fillRect(-4, -6, 8, 12);
        
        // Inner shading
        this.ctx.fillStyle = '#fbbf24';
        this.ctx.fillRect(-3, -3, 6, 6);
        this.ctx.fillStyle = '#d97706'; // center dot
        this.ctx.fillRect(-1, -1, 2, 2);
      } else {
        // Citation paper card
        const angle = (this.tick * 0.1) % (Math.PI * 2);
        this.ctx.rotate(angle);

        // Outline
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(-6, -8, 12, 16);

        // White paper card base
        this.ctx.fillStyle = '#f8fafc';
        this.ctx.fillRect(-5, -7, 10, 14);

        // Red citation stamp / warning lines
        this.ctx.fillStyle = '#ef4444';
        this.ctx.fillRect(-3, -4, 6, 2);
        this.ctx.fillRect(-3, 1, 6, 2);
      }
      this.ctx.restore();
    });

    // 5. Draw Enemies
    this.enemies.forEach(e => e.draw(this.ctx, this.cameraX, this.tick));

    // 6. Draw Player
    this.player.draw(this.ctx, this.cameraX, this.tick);

    // 7. Draw particle effects
    this.particles.forEach(p => {
      this.ctx.save();
      this.ctx.translate(-this.cameraX, 0);
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(p.x, p.y, p.size, p.size);
      this.ctx.restore();
    });

    // 8. Draw "Press R to sit" prompts if near campfire
    if (this.isNearCampfire && this.gameState === 'playing') {
      this.ctx.fillStyle = 'rgba(0,0,0,0.75)';
      this.ctx.fillRect(this.level.campfireX - 60 - this.cameraX, 360, 120, 24);
      
      this.ctx.fillStyle = '#ff7300';
      this.ctx.font = '8px "Press Start 2P"';
      this.ctx.fillText('Press R to sit', this.level.campfireX - 52 - this.cameraX, 376);
    }

    this.ctx.restore();
  }

  private spawnBarrierActivationEffect(x: number) {
    // Red sparks shooting up from the ground along the barrier
    const groundY = 480;
    for (let i = 0; i < 20; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 10,
        y: groundY - Math.random() * 380,
        vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 4 - 2,
        color: i % 2 === 0 ? '#c084fc' : '#e879f9',
        size: Math.random() * 3 + 2,
        life: 0,
        maxLife: 20 + Math.random() * 20
      });
    }
  }

  private spawnBarrierClearEffect(x: number) {
    // Green/gold sparks exploding outwards from the barrier columns
    const groundY = 480;
    const wallYStart = 100;
    for (let i = 0; i < 40; i++) {
      const spawnY = wallYStart + Math.random() * (groundY - wallYStart);
      this.particles.push({
        x: x + (Math.random() - 0.5) * 10,
        y: spawnY,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 4,
        color: i % 2 === 0 ? '#34d399' : '#fde047',
        size: Math.random() * 4 + 2,
        life: 0,
        maxLife: 15 + Math.random() * 25
      });
    }
  }

  private drawBarriers(ctx: CanvasRenderingContext2D) {
    for (const arena of this.arenas) {
      if (arena.isActive && !arena.isCleared) {
        this.drawLaserWall(ctx, arena.leftBarrierX);
        this.drawLaserWall(ctx, arena.rightBarrierX);
      }
    }
  }

  private drawLaserWall(ctx: CanvasRenderingContext2D, x: number) {
    ctx.save();
    ctx.translate(-this.cameraX, 0);

    const wallYStart = 100;
    const wallYEnd = 480;
    const blockWidth = 14;
    const blockHeight = 16;
    
    // Draw stacked warning segments (chunky pixel lights)
    const scroll = Math.floor(this.tick * 0.15) % 2;
    for (let y = wallYStart; y < wallYEnd; y += blockHeight) {
      const isRed = ((Math.floor(y / blockHeight) + scroll) % 2 === 0);
      
      // Outline
      ctx.fillStyle = '#000000';
      ctx.fillRect(x - blockWidth / 2 - 2, y, blockWidth + 4, blockHeight);
      
      // Neon warning block
      ctx.fillStyle = isRed ? '#c084fc' : '#ffffff';
      ctx.fillRect(x - blockWidth / 2, y + 2, blockWidth, blockHeight - 4);
      
      // Core highlight block
      ctx.fillStyle = isRed ? '#e879f9' : '#e2e8f0';
      ctx.fillRect(x - blockWidth / 2 + 3, y + 4, blockWidth - 6, blockHeight - 8);
    }

    // Draw warning text above player height
    if (Math.floor(this.tick / 20) % 2 === 0) {
      ctx.fillStyle = '#c084fc';
      ctx.font = '6px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.fillText('HALT', x, wallYStart - 10);
    }

    ctx.restore();
  }

}
