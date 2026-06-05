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

  // Cutscene state
  private cutsceneSlideIndex: number = 0;
  private cutsceneTimer: number = 0;
  private cutsceneFadeAlpha: number = 0;
  private cutsceneFadeState: 'fadeIn' | 'display' | 'fadeOut' = 'fadeIn';
  private cutsceneSlideDuration: number = 210; // 3.5 seconds at 60fps
  private cutsceneFadeDuration: number = 30;  // 0.5 seconds at 60fps
  private cameraX: number = 0;
  private maxCameraX: number = 2640; // 3600 level width - 960 canvas width

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
  private tutorialTitle: HTMLElement | null = null;
  private tutorialText: HTMLElement | null = null;
  private triggeredTutorials: { [key: string]: boolean } = {
    movement: false,
    crouch: false,
    attack: false,
    inspector: false,
    campfire: false
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get Canvas 2D Context');
    this.ctx = context;

    this.player = new Player();
    this.level = new Level();

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
    this.tutorialTitle = document.getElementById('tutorial-title');
    this.tutorialText = document.getElementById('tutorial-text');

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

      // Handle cutscene keypress advance
      if (this.gameState === 'cutscene') {
        this.advanceCutscene();
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      this.keys[key] = false;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.gameState === 'playing') {
        this.mouseClicked = true;
      } else if (this.gameState === 'cutscene') {
        // Get relative coordinates
        const rect = this.canvas.getBoundingClientRect();
        const clickX = ((e.clientX - rect.left) / rect.width) * this.canvas.width;
        const clickY = ((e.clientY - rect.top) / rect.height) * this.canvas.height;
        
        // Check if inside Skip button: [840, 20, 100, 30]
        if (clickX >= 840 && clickX <= 940 && clickY >= 20 && clickY <= 50) {
          this.skipCutscene();
        } else {
          this.advanceCutscene();
        }
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
    this.gameState = 'cutscene';
    this.startScreen?.classList.add('hidden');
    // Keep HUD hidden initially
    this.cutsceneSlideIndex = 0;
    this.cutsceneTimer = 0;
    this.cutsceneFadeAlpha = 1; // start fully black
    this.cutsceneFadeState = 'fadeIn';
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
    this.cameraX = Math.max(0, Math.min(this.player.x - 200, this.maxCameraX));

    this.projectiles = [];
    this.particles = [];
    this.drops = [];

    // Reset level obstacles
    this.level.initLevel();

    // Spawn Suburbs Enemies in Grouped Waves
    this.enemies = [
      // Group 1: Stray Dog pack (X=1100 to 1160)
      new Enemy(1100, 450, 'dog', 0),
      new Enemy(1160, 450, 'dog', 0),

      // Group 2: Angry Pigeon swarm (X=1450 to 1510)
      new Enemy(1450, 200, 'pigeon', 100),
      new Enemy(1510, 240, 'pigeon', 100),

      // Group 3: HOA Inspector squad (X=2100 to 2380)
      new Enemy(2100, 420, 'inspector', 350),
      new Enemy(2380, 420, 'inspector', 250),

      // Group 4: Post-campfire ambush (X=2650 to 2850)
      new Enemy(2650, 450, 'dog', 150),
      new Enemy(2700, 210, 'pigeon', 80),
      new Enemy(2760, 240, 'pigeon', 80),
      new Enemy(2850, 420, 'inspector', 300)
    ];

    // Re-initialize arenas
    this.arenas = [
      {
        id: 'dogs',
        triggerX: 1020,
        leftBarrierX: 1000,
        rightBarrierX: 1250,
        isActive: false,
        isCleared: false,
        enemyIndices: [0, 1],
        leftPlatform: null,
        rightPlatform: null
      },
      {
        id: 'pigeons',
        triggerX: 1370,
        leftBarrierX: 1350,
        rightBarrierX: 1620,
        isActive: false,
        isCleared: false,
        enemyIndices: [2, 3],
        leftPlatform: null,
        rightPlatform: null
      },
      {
        id: 'inspectors',
        triggerX: 2000,
        leftBarrierX: 1950,
        rightBarrierX: 2530,
        isActive: false,
        isCleared: false,
        enemyIndices: [4, 5],
        leftPlatform: null,
        rightPlatform: null
      },
      {
        id: 'ambush',
        triggerX: 2600,
        leftBarrierX: 2580,
        rightBarrierX: 3000,
        isActive: false,
        isCleared: false,
        enemyIndices: [6, 7, 8, 9],
        leftPlatform: null,
        rightPlatform: null
      }
    ];

    // Handle checkpoint spawning
    if (this.lastCheckpointX === this.level.campfireX) {
      // Arenas 1 and 2 are cleared automatically if starting from campfire
      this.arenas[0].isCleared = true;
      this.arenas[1].isCleared = true;

      // Mark the associated enemies as dead so they don't appear frozen on screen
      this.arenas[0].enemyIndices.forEach(idx => {
        if (this.enemies[idx]) this.enemies[idx].state = 'dead';
      });
      this.arenas[1].enemyIndices.forEach(idx => {
        if (this.enemies[idx]) this.enemies[idx].state = 'dead';
      });
    }

    // Reset tutorial triggers if starting a fresh run from porch
    if (this.lastCheckpointX === 100) {
      this.triggeredTutorials = {
        movement: false,
        crouch: false,
        attack: false,
        inspector: false,
        campfire: false
      };
    }

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

  private triggerTutorial(id: string, title: string, text: string) {
    this.gameState = 'tutorial';
    this.triggeredTutorials[id] = true;
    
    if (this.tutorialTitle) this.tutorialTitle.innerText = title;
    if (this.tutorialText) this.tutorialText.innerHTML = text;
    
    this.tutorialOverlay?.classList.remove('hidden');
  }

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
      } else if (p.type === 'trashcan' && !p.broken) {
        if (
          ax + aw > p.x &&
          ax < p.x + p.w &&
          ay + ah > p.y &&
          ay < p.y + p.h
        ) {
          if (this.player.comboStep === 3) {
            // Break the trashcan!
            p.broken = true;
            this.spawnBreakEffect(p.x + p.w / 2, p.y + p.h / 2, '#64748b');
            
            // Spawn coins/XP out of broken trashcan
            for (let i = 0; i < 3; i++) {
              this.drops.push(new Drop(p.x + p.w / 2, p.y + p.h / 2, 'coin', 10));
            }
            this.drops.push(new Drop(p.x + p.w / 2, p.y + p.h / 2, 'xp', 15));
          } else {
            this.spawnHitSpark(p.x + p.w / 2, p.y + p.h / 2);
            if (this.tutorialPrompt) {
              this.tutorialPrompt.textContent = "Only the 3rd hit (Roundhouse Kick) can smash the trash can!";
            }
          }
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
      if (p.x < this.cameraX - 100 || p.x > this.cameraX + 1060 || p.y > 540) {
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
        color: i % 2 === 0 ? '#f59e0b' : '#ef4444',
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
      if (activeArena.id === 'dogs') enemyName = 'Stray Dogs';
      else if (activeArena.id === 'pigeons') enemyName = 'Angry Pigeons';
      else if (activeArena.id === 'inspectors') enemyName = 'HOA Inspectors';
      else if (activeArena.id === 'ambush') enemyName = 'Ambush Patrol';
      
      this.tutorialPrompt.textContent = `COMBAT ZONE: Defeat the ${enemyName} to drop the laser barriers!`;
      return;
    }

    const px = this.player.x;
    if (px < 400) {
      this.tutorialPrompt.textContent = 'Press A / D to Walk. Hold W to Jump!';
    } else if (px >= 400 && px < 600) {
      this.tutorialPrompt.textContent = 'Jump over Grandma\'s white picket fence!';
    } else if (px >= 600 && px < 800) {
      this.tutorialPrompt.textContent = 'Ducking time! Press S to Crouch under the low tree branch!';
    } else if (px >= 800 && px < 1000) {
      this.tutorialPrompt.textContent = 'Smash the Trash Can! Press J consecutively to perform a Punch-Punch-Kick combo.';
    } else if (px >= 1000 && px < 1300) {
      this.tutorialPrompt.textContent = 'Defeat the Stray Dogs to drop the laser barriers!';
    } else if (px >= 1300 && px < 1700) {
      this.tutorialPrompt.textContent = 'Jump or crouch under diving pigeons!';
    } else if (px >= 1700 && px < 1950) {
      this.tutorialPrompt.textContent = 'Stand near campfire. Press R to rest & equip skills!';
    } else if (px >= 1950 && px < 2580) {
      this.tutorialPrompt.textContent = 'HOA Inspectors block front attacks! Use Roundhouse Kick (3rd J combo hit) to break guard!';
    } else if (px >= 2580 && px < 3100) {
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
    if (this.gameState === 'cutscene') {
      this.tick++;
      this.updateCutscene();
    } else if (this.gameState === 'playing') {
      this.tick++;

      // 1. Update Player Inputs & States
      this.player.handleInput(this.keys, this.mouseClicked);
      this.mouseClicked = false; // Reset click triggers

      this.player.update(this.level.platforms);

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

      // Check tutorial checkpoints
      if (this.player.x >= 250 && !this.triggeredTutorials.movement) {
        this.triggerTutorial(
          'movement',
          'Movement & Crouching',
          'Carl, it\'s time to escape Grandma\'s suburbs! Use <strong>A / D</strong> to Walk, and hold <strong>W</strong> to Jump over picket fences. When you reach the low tree branch overhang, press <strong>S</strong> to Crouch under it safely!'
        );
      } else if (this.player.x >= 820 && !this.triggeredTutorials.attack) {
        this.triggerTutorial(
          'attack',
          'Attack Combo Tutorial',
          'A heavy metal trash can blocks the sidewalk! Click <strong>Left Mouse</strong> or press <strong>J</strong> to attack. Press it consecutively to perform a <strong>Punch-Punch-Kick combo</strong>. Only the third hit (Roundhouse Kick) is strong enough to smash the trash can!'
        );
      } else if (this.player.x >= 1320 && !this.triggeredTutorials.crouch) {
        this.triggerTutorial(
          'crouch',
          'Diving Pigeons Tutorial',
          'Heads up! Angry pigeons dive-bomb from above and fly straight at you. Press <strong>W</strong> to jump over them, or press <strong>S</strong> to crouch and let them fly right over you!'
        );
      } else if (this.player.x >= 1750 && !this.triggeredTutorials.campfire) {
        this.triggerTutorial(
          'campfire',
          'Rest Campfire Tutorial',
          'Checkpoint reached! Stand next to the campfire and press <strong>R</strong> to rest, save your progress, fully heal, and equip active skills like the <strong>Coin Slide</strong>!'
        );
      } else if (this.player.x >= 2000 && !this.triggeredTutorials.inspector) {
        this.triggerTutorial(
          'inspector',
          'HOA Inspector Tutorial',
          'HOA Inspectors block all front attacks with their clipboards! Perform a <strong>Punch-Punch-Kick combo</strong> (J-J-J) and hit them with the <strong>Roundhouse Kick</strong> to break their guard, or jump behind them to hit their vulnerable back!'
        );
      }

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
        const targetCamX = this.player.x - 400;
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

    if (this.gameState === 'cutscene') {
      this.renderCutscene();
      return;
    }

    // 1. Draw level layers (parallax backgrounds)
    this.level.drawBackground(this.ctx, this.cameraX);

    // 2. Draw solid blocks, campfire checkpoint
    this.level.drawForeground(this.ctx, this.cameraX, this.tick);

    // 2b. Draw active laser barriers
    this.drawBarriers(this.ctx);

    // 3. Draw physical drops (coins & XP gems)
    this.drops.forEach(d => d.draw(this.ctx, this.cameraX));

    // 4. Draw projectiles (citations, thrown coins)
    this.projectiles.forEach(p => {
      this.ctx.save();
      this.ctx.translate(-this.cameraX, 0);
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = p.color;
      this.ctx.shadowBlur = 8;
      this.ctx.shadowColor = p.color;
      this.ctx.fill();
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
        color: i % 2 === 0 ? '#ef4444' : '#f87171',
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
        color: i % 2 === 0 ? '#10b981' : '#fbbf24',
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
    const wallWidth = 12;

    // Laser beam vertical gradient
    const gradient = ctx.createLinearGradient(x - wallWidth, 0, x + wallWidth, 0);
    const alpha = 0.4 + Math.sin(this.tick * 0.15) * 0.15;
    gradient.addColorStop(0, 'rgba(239, 68, 68, 0)');
    gradient.addColorStop(0.5, `rgba(239, 68, 68, ${alpha})`);
    gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(x - wallWidth, wallYStart, wallWidth * 2, wallYEnd - wallYStart);

    // Bright core line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, wallYStart);
    ctx.lineTo(x, wallYEnd);
    ctx.stroke();

    // Side glow lines
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 3, wallYStart);
    ctx.lineTo(x - 3, wallYEnd);
    ctx.moveTo(x + 3, wallYStart);
    ctx.lineTo(x + 3, wallYEnd);
    ctx.stroke();

    // Laser cross-pulses sliding down
    ctx.fillStyle = 'rgba(254, 202, 202, 0.85)';
    const scanlineY = wallYStart + ((this.tick * 3.5) % (wallYEnd - wallYStart));
    ctx.fillRect(x - 8, scanlineY, 16, 4);

    // Draw warning text above player height
    if (Math.floor(this.tick / 20) % 2 === 0) {
      ctx.fillStyle = '#ef4444';
      ctx.font = '6px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.fillText('HALT', x, wallYStart - 10);
    }

    ctx.restore();
  }

  // --- Cutscene Methods ---
  private updateCutscene() {
    this.cutsceneTimer++;
    
    if (this.cutsceneFadeState === 'fadeIn') {
      this.cutsceneFadeAlpha = 1 - (this.cutsceneTimer / this.cutsceneFadeDuration);
      if (this.cutsceneTimer >= this.cutsceneFadeDuration) {
        this.cutsceneFadeState = 'display';
        this.cutsceneTimer = 0;
        this.cutsceneFadeAlpha = 0;
      }
    } else if (this.cutsceneFadeState === 'display') {
      this.cutsceneFadeAlpha = 0;
      if (this.cutsceneTimer >= this.cutsceneSlideDuration) {
        this.cutsceneFadeState = 'fadeOut';
        this.cutsceneTimer = 0;
      }
    } else if (this.cutsceneFadeState === 'fadeOut') {
      this.cutsceneFadeAlpha = this.cutsceneTimer / this.cutsceneFadeDuration;
      if (this.cutsceneTimer >= this.cutsceneFadeDuration) {
        this.cutsceneSlideIndex++;
        if (this.cutsceneSlideIndex >= 5) {
          this.skipCutscene();
        } else {
          this.cutsceneFadeState = 'fadeIn';
          this.cutsceneTimer = 0;
          this.cutsceneFadeAlpha = 1;
        }
      }
    }
  }

  private advanceCutscene() {
    if (this.cutsceneFadeState === 'fadeIn' || this.cutsceneFadeState === 'display') {
      this.cutsceneFadeState = 'fadeOut';
      this.cutsceneTimer = 0;
    }
  }

  private skipCutscene() {
    this.gameState = 'playing';
    this.hudElement?.classList.remove('hud-hidden');
    this.resetLevel();
  }

  private renderCutscene() {
    this.ctx.fillStyle = '#090d16';
    this.ctx.fillRect(0, 0, 960, 540);

    switch (this.cutsceneSlideIndex) {
      case 0:
        this.drawSlide1();
        break;
      case 1:
        this.drawSlide2();
        break;
      case 2:
        this.drawSlide3();
        break;
      case 3:
        this.drawSlide4();
        break;
      case 4:
        this.drawSlide5();
        break;
    }

    this.drawNarrativeBar();
    this.drawSkipButton();

    if (this.cutsceneFadeAlpha > 0) {
      this.ctx.fillStyle = `rgba(9, 13, 22, ${Math.max(0, Math.min(1, this.cutsceneFadeAlpha))})`;
      this.ctx.fillRect(0, 0, 960, 540);
    }
  }

  private drawNarrativeBar() {
    const textHeight = 90;
    const y = 540 - textHeight - 20;
    const x = 50;
    const w = 960 - 100;
    const h = textHeight;

    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    this.ctx.strokeStyle = 'rgba(51, 65, 85, 0.5)';
    this.ctx.lineWidth = 3;
    this.ctx.fillRect(x, y, w, h);
    this.ctx.strokeRect(x, y, w, h);

    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = '12px "Press Start 2P"';
    this.ctx.textAlign = 'center';

    let text = '';
    switch (this.cutsceneSlideIndex) {
      case 0:
        text = "Carl Quest is returning home after a long day's work...";
        break;
      case 1:
        text = "Back at Grandma's, everything seems quiet... too quiet.";
        break;
      case 2:
        text = "A mysterious paper is taped to the front door...";
        break;
      case 3:
        text = "WHAT?! An EVICTION NOTICE?! Owe $1,432,980.24?!";
        break;
      case 4:
        text = "With no choice left, Carl runs to buy back the house!";
        break;
    }

    this.ctx.fillText(text, 960 / 2, y + h / 2 + 5);
  }

  private drawSkipButton() {
    const x = 840;
    const y = 20;
    const w = 100;
    const h = 30;

    this.ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
    this.ctx.strokeStyle = 'rgba(71, 85, 105, 0.5)';
    this.ctx.lineWidth = 2;
    this.ctx.fillRect(x, y, w, h);
    this.ctx.strokeRect(x, y, w, h);

    this.ctx.fillStyle = '#94a3b8';
    this.ctx.font = '8px "Press Start 2P"';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('SKIP', x + w / 2, y + h / 2 + 3);
  }

  private drawSlide1() {
    const skyGrad = this.ctx.createLinearGradient(0, 0, 0, 350);
    skyGrad.addColorStop(0, '#1e1b4b');
    skyGrad.addColorStop(0.5, '#4338ca');
    skyGrad.addColorStop(1, '#f97316');
    this.ctx.fillStyle = skyGrad;
    this.ctx.fillRect(0, 0, 960, 420);

    this.ctx.fillStyle = '#fde047';
    this.ctx.fillRect(700, 100, 80, 80);
    this.ctx.fillRect(720, 80, 40, 120);
    this.ctx.fillRect(680, 120, 120, 40);

    this.ctx.fillStyle = '#311042';
    const shiftBG1 = (this.tick * 0.5) % 300;
    for (let i = -300; i < 1200; i += 300) {
      const startX = i - shiftBG1;
      this.ctx.beginPath();
      this.ctx.moveTo(startX, 420);
      this.ctx.lineTo(startX + 150, 250);
      this.ctx.lineTo(startX + 300, 420);
      this.ctx.fill();
    }

    this.ctx.fillStyle = '#1e3a1e';
    const shiftBG2 = (this.tick * 1.5) % 180;
    for (let i = -180; i < 1100; i += 180) {
      const startX = i - shiftBG2;
      this.ctx.fillRect(startX + 60, 320, 15, 100);
      this.ctx.fillStyle = '#15803d';
      this.ctx.fillRect(startX + 30, 240, 75, 80);
      this.ctx.fillRect(startX + 45, 200, 45, 40);
      this.ctx.fillStyle = '#1e3a1e';
    }

    this.ctx.fillStyle = '#1e293b';
    this.ctx.fillRect(0, 420, 960, 120);
    this.ctx.fillStyle = '#cbd5e1';
    this.ctx.fillRect(0, 420, 960, 6);

    this.ctx.fillStyle = '#fef08a';
    const shiftRoad = (this.tick * 6) % 240;
    for (let i = -240; i < 1200; i += 240) {
      this.ctx.fillRect(i - shiftRoad, 465, 80, 10);
    }

    const carY = 320 + Math.floor(Math.sin(this.tick * 0.2) * 2);
    const carX = 350;

    this.ctx.fillStyle = '#ffedd5';
    this.ctx.fillRect(carX + 45, carY + 12, 16, 16);
    this.ctx.fillStyle = '#475569';
    this.ctx.fillRect(carX + 53, carY + 16, 8, 4);
    this.ctx.fillStyle = '#78350f';
    this.ctx.fillRect(carX + 41, carY + 8, 20, 6);

    this.ctx.fillStyle = '#ef4444';
    this.ctx.fillRect(carX, carY + 30, 150, 45);
    this.ctx.fillRect(carX + 30, carY + 6, 80, 25);
    this.ctx.fillStyle = '#94a3b8';
    this.ctx.fillRect(carX + 38, carY + 10, 30, 16);
    this.ctx.fillRect(carX + 72, carY + 10, 30, 16);

    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(carX + 20, carY + 65, 30, 15);
    this.ctx.fillRect(carX + 100, carY + 65, 30, 15);

    this.ctx.fillStyle = '#1e293b';
    const w1 = carX + 22;
    const w2 = carX + 102;
    const tireY = carY + 60;
    this.ctx.fillRect(w1, tireY, 26, 26);
    this.ctx.fillRect(w2, tireY, 26, 26);

    this.ctx.fillStyle = '#cbd5e1';
    const spinOffset = Math.floor(this.tick / 4) % 2 === 0 ? 4 : 12;
    this.ctx.fillRect(w1 + spinOffset, tireY + 8, 10, 10);
    this.ctx.fillRect(w2 + spinOffset, tireY + 8, 10, 10);

    const glowAlpha = 0.3 + Math.sin(this.tick * 0.15) * 0.1;
    const headlightGrad = this.ctx.createRadialGradient(carX + 155, carY + 45, 0, carX + 155, carY + 45, 120);
    headlightGrad.addColorStop(0, `rgba(254, 240, 138, ${glowAlpha})`);
    headlightGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
    this.ctx.fillStyle = headlightGrad;
    this.ctx.beginPath();
    this.ctx.moveTo(carX + 150, carY + 35);
    this.ctx.lineTo(carX + 320, carY + 10);
    this.ctx.lineTo(carX + 320, carY + 90);
    this.ctx.fill();
  }

  private drawSlide2() {
    this.ctx.fillStyle = '#93c5fd';
    this.ctx.fillRect(0, 0, 960, 420);
    this.ctx.fillStyle = '#22c55e';
    this.ctx.fillRect(0, 420, 960, 120);
    
    this.ctx.fillStyle = '#64748b';
    this.ctx.fillRect(100, 420, 180, 120);

    const houseX = 420;
    const houseY = 180;
    
    this.ctx.fillStyle = '#ffedd5';
    this.ctx.fillRect(houseX, houseY, 400, 240);
    
    this.ctx.fillStyle = '#15803d';
    this.ctx.fillRect(houseX - 20, houseY - 15, 440, 15);
    this.ctx.fillRect(houseX + 10, houseY - 45, 380, 30);
    this.ctx.fillRect(houseX + 50, houseY - 75, 300, 30);
    this.ctx.fillRect(houseX + 100, houseY - 105, 200, 30);

    this.ctx.fillStyle = '#b91c1c';
    this.ctx.fillRect(houseX + 310, houseY - 120, 40, 80);

    this.ctx.fillStyle = '#78350f';
    this.ctx.fillRect(houseX + 180, houseY + 120, 50, 120);
    this.ctx.fillStyle = '#eab308';
    this.ctx.fillRect(houseX + 220, houseY + 180, 6, 6);

    this.ctx.fillStyle = '#38bdf8';
    this.ctx.fillRect(houseX + 50, houseY + 40, 80, 80);
    this.ctx.fillRect(houseX + 270, houseY + 40, 80, 80);
    
    this.ctx.fillStyle = '#ffedd5';
    this.ctx.fillRect(houseX + 88, houseY + 40, 4, 80);
    this.ctx.fillRect(houseX + 50, houseY + 78, 80, 4);
    this.ctx.fillRect(houseX + 308, houseY + 40, 4, 80);
    this.ctx.fillRect(houseX + 270, houseY + 78, 80, 4);

    const carX = 120;
    const carY = 370;
    this.ctx.fillStyle = '#ef4444';
    this.ctx.fillRect(carX, carY, 130, 40);
    this.ctx.fillRect(carX + 25, carY - 20, 70, 20);
    this.ctx.fillStyle = '#94a3b8';
    this.ctx.fillRect(carX + 32, carY - 16, 25, 14);
    this.ctx.fillRect(carX + 62, carY - 16, 25, 14);
    this.ctx.fillStyle = '#1e293b';
    this.ctx.fillRect(carX + 15, carY + 30, 22, 20);
    this.ctx.fillRect(carX + 90, carY + 30, 22, 20);

    const maxWalkDist = 320;
    const walkTimer = Math.min(this.cutsceneSlideDuration, this.cutsceneTimer);
    const walkProgress = walkTimer / this.cutsceneSlideDuration;
    const carlX = 260 + Math.floor(walkProgress * maxWalkDist);
    const carlY = 350;

    const bob = Math.floor(this.tick / 6) % 2 === 0 ? 0 : -3;
    const step = Math.floor(this.tick / 6) % 2;

    this.ctx.fillStyle = '#1e293b';
    this.ctx.fillRect(carlX + 6, carlY + 36 + (step === 0 ? 0 : 3), 6, 24);
    this.ctx.fillRect(carlX + 16, carlY + 36 + (step === 1 ? 0 : 3), 6, 24);

    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(carlX + 6, carlY + 56 + (step === 0 ? 0 : 3), 10, 4);
    this.ctx.fillRect(carlX + 16, carlY + 56 + (step === 1 ? 0 : 3), 10, 4);

    this.ctx.fillStyle = '#38bdf8';
    this.ctx.fillRect(carlX + 2, carlY + 12 + bob, 24, 25);

    this.ctx.fillStyle = '#ffedd5';
    this.ctx.fillRect(carlX + 6, carlY - 4 + bob, 16, 16);

    this.ctx.fillStyle = '#475569';
    this.ctx.fillRect(carlX + 14, carlY + bob, 10, 4);

    this.ctx.fillStyle = '#78350f';
    this.ctx.fillRect(carlX + 4, carlY - 8 + bob, 18, 5);
  }

  private drawSlide3() {
    this.ctx.fillStyle = '#cbd5e1';
    this.ctx.fillRect(0, 0, 960, 540);

    this.ctx.fillStyle = '#475569';
    this.ctx.fillRect(280, 0, 400, 540);

    this.ctx.fillStyle = '#78350f';
    this.ctx.fillRect(300, 0, 360, 540);

    this.ctx.fillStyle = '#451a03';
    this.ctx.fillRect(320, 20, 140, 180);
    this.ctx.fillRect(500, 20, 140, 180);
    this.ctx.fillRect(320, 240, 140, 260);
    this.ctx.fillRect(500, 240, 140, 260);

    this.ctx.fillStyle = '#78350f';
    this.ctx.fillRect(330, 30, 120, 160);
    this.ctx.fillRect(510, 30, 120, 160);
    this.ctx.fillRect(330, 250, 120, 240);
    this.ctx.fillRect(510, 250, 120, 240);

    this.ctx.fillStyle = '#ca8a04';
    this.ctx.fillRect(310, 260, 25, 25);
    this.ctx.fillStyle = '#fbbf24';
    this.ctx.fillRect(315, 265, 15, 15);

    const noteX = 400;
    const noteY = 100;
    const noteW = 160;
    const noteH = 190;

    this.ctx.fillStyle = '#f8fafc';
    this.ctx.fillRect(noteX, noteY, noteW, noteH);
    
    this.ctx.fillStyle = 'rgba(250, 204, 21, 0.6)';
    this.ctx.fillRect(noteX + 15, noteY - 10, 30, 15);
    this.ctx.fillRect(noteX + noteW - 45, noteY - 10, 30, 15);

    this.ctx.fillStyle = '#ef4444';
    this.ctx.fillRect(noteX + 15, noteY + 20, 130, 12);
    this.ctx.fillRect(noteX + 25, noteY + 38, 110, 10);

    this.ctx.fillStyle = '#475569';
    for (let yOffset = 65; yOffset < 170; yOffset += 14) {
      const lineW = 100 + Math.floor(Math.random() * 30);
      this.ctx.fillRect(noteX + 15, noteY + yOffset, lineW, 4);
    }

    const progress = Math.min(1, this.cutsceneTimer / (this.cutsceneSlideDuration * 0.75));
    const handX = 20 + Math.floor(progress * 350);
    const handY = 540 - Math.floor(progress * 260);

    this.ctx.fillStyle = '#38bdf8';
    this.ctx.beginPath();
    this.ctx.moveTo(0, 540);
    this.ctx.lineTo(handX, handY);
    this.ctx.lineTo(handX - 20, handY + 60);
    this.ctx.lineTo(0, 540);
    this.ctx.fill();

    this.ctx.fillStyle = '#ffedd5';
    this.ctx.fillRect(handX - 5, handY - 15, 30, 30);
  }

  private drawSlide4() {
    this.ctx.fillStyle = '#38bdf8';
    this.ctx.fillRect(0, 0, 960, 540);

    const faceX = 330;
    const faceY = 120;
    const faceW = 300;
    const faceH = 320;

    this.ctx.fillStyle = '#fddfbe';
    this.ctx.fillRect(faceX + 90, faceY + 280, 120, 60);

    this.ctx.fillStyle = '#0284c7';
    this.ctx.fillRect(faceX + 70, faceY + 310, 160, 40);

    this.ctx.fillStyle = '#ffedd5';
    this.ctx.fillRect(faceX, faceY, faceW, faceH - 40);

    this.ctx.fillStyle = '#fddfbe';
    this.ctx.fillRect(faceX, faceY + 240, faceW, 40);

    this.ctx.fillStyle = '#78350f';
    this.ctx.fillRect(faceX - 20, faceY - 40, faceW + 40, 50);
    this.ctx.fillRect(faceX - 20, faceY, 30, 200);
    this.ctx.fillRect(faceX + faceW - 10, faceY, 30, 200);

    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(faceX + 20, faceY + 60, 110, 70);
    this.ctx.fillRect(faceX + 170, faceY + 60, 110, 70);
    this.ctx.fillRect(faceX + 120, faceY + 85, 60, 15);

    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(faceX + 30, faceY + 70, 90, 50);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(faceX + 180, faceY + 70, 90, 50);

    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(faceX + 70, faceY + 90, 10, 10);
    this.ctx.fillRect(faceX + 220, faceY + 90, 10, 10);

    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(faceX + 90, faceY + 180, 120, 80);
    
    this.ctx.fillStyle = '#ef4444';
    this.ctx.fillRect(faceX + 110, faceY + 230, 80, 20);

    this.ctx.fillStyle = '#60a5fa';
    const sweatOffset = (this.tick * 2) % 40;
    this.ctx.fillRect(faceX + 40, faceY + 40 + sweatOffset, 6, 12);
    this.ctx.fillRect(faceX + 240, faceY + 20 + ((sweatOffset + 15) % 40), 6, 12);

    this.ctx.strokeStyle = '#fde047';
    this.ctx.lineWidth = 4;
    const shake = Math.floor(Math.sin(this.tick * 0.5) * 3);
    
    this.ctx.beginPath();
    this.ctx.moveTo(faceX - 60 + shake, faceY + 50);
    this.ctx.lineTo(faceX - 30 + shake, faceY + 50);
    this.ctx.moveTo(faceX - 60 + shake, faceY + 120);
    this.ctx.lineTo(faceX - 30 + shake, faceY + 120);
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(faceX + faceW + 30 + shake, faceY + 50);
    this.ctx.lineTo(faceX + faceW + 60 + shake, faceY + 50);
    this.ctx.moveTo(faceX + faceW + 30 + shake, faceY + 120);
    this.ctx.lineTo(faceX + faceW + 60 + shake, faceY + 120);
    this.ctx.stroke();
  }

  private drawSlide5() {
    this.ctx.fillStyle = '#60a5fa';
    this.ctx.fillRect(0, 0, 960, 420);
    
    this.ctx.fillStyle = '#047857';
    this.ctx.fillRect(200, 300, 40, 120);
    this.ctx.fillRect(650, 300, 45, 120);

    this.ctx.fillStyle = '#16a34a';
    this.ctx.fillRect(0, 420, 960, 120);

    const progress = Math.min(1, this.cutsceneTimer / this.cutsceneSlideDuration);
    const carlX = 350 + Math.floor(progress * 450);
    const carlY = 320;

    const runFrame = Math.floor(this.tick / 4) % 4;
    const bob = runFrame % 2 === 0 ? 0 : -4;

    this.ctx.fillStyle = '#0284c7';
    if (runFrame === 0 || runFrame === 2) {
      this.ctx.fillRect(carlX - 10, carlY + 15, 10, 15);
    } else {
      this.ctx.fillRect(carlX + 22, carlY + 15, 10, 15);
    }

    this.ctx.fillStyle = '#1e293b';
    if (runFrame === 0) {
      this.ctx.fillRect(carlX + 2, carlY + 36, 8, 16);
      this.ctx.fillRect(carlX + 16, carlY + 36, 12, 10);
    } else if (runFrame === 1) {
      this.ctx.fillRect(carlX - 4, carlY + 36, 12, 10);
      this.ctx.fillRect(carlX + 12, carlY + 36, 8, 20);
    } else if (runFrame === 2) {
      this.ctx.fillRect(carlX + 12, carlY + 36, 8, 16);
      this.ctx.fillRect(carlX - 2, carlY + 36, 12, 10);
    } else {
      this.ctx.fillRect(carlX + 14, carlY + 36, 12, 10);
      this.ctx.fillRect(carlX + 2, carlY + 36, 8, 20);
    }

    this.ctx.fillStyle = '#38bdf8';
    this.ctx.fillRect(carlX + 2, carlY + 12 + bob, 22, 25);

    this.ctx.fillStyle = '#38bdf8';
    if (runFrame === 0 || runFrame === 2) {
      this.ctx.fillRect(carlX + 20, carlY + 15 + bob, 12, 10);
    } else {
      this.ctx.fillRect(carlX - 8, carlY + 15 + bob, 12, 10);
    }

    this.ctx.fillStyle = '#ffedd5';
    this.ctx.fillRect(carlX + 6, carlY - 4 + bob, 16, 16);
    this.ctx.fillStyle = '#475569';
    this.ctx.fillRect(carlX + 14, carlY + bob, 8, 4);
    this.ctx.fillStyle = '#78350f';
    this.ctx.fillRect(carlX + 4, carlY - 8 + bob, 18, 5);

    const noteY = Math.min(410, 240 + Math.floor(progress * 280));
    const noteX = 300 - Math.floor(progress * 100);
    const rotate = progress * Math.PI * 2.5;

    this.ctx.save();
    this.ctx.translate(noteX, noteY);
    this.ctx.rotate(rotate);
    
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.strokeStyle = '#94a3b8';
    this.ctx.lineWidth = 1;
    this.ctx.fillRect(-12, -16, 24, 32);
    this.ctx.strokeRect(-12, -16, 24, 32);

    this.ctx.fillStyle = '#ef4444';
    this.ctx.fillRect(-8, -10, 16, 3);
    
    this.ctx.fillStyle = '#475569';
    this.ctx.fillRect(-8, -4, 16, 1.5);
    this.ctx.fillRect(-8, 1, 12, 1.5);
    this.ctx.fillRect(-8, 6, 14, 1.5);
    this.ctx.fillRect(-8, 11, 10, 1.5);
    
    this.ctx.restore();

    const magnX = 80;
    const magnY = 180;
    const magnW = 160;
    const magnH = 100;

    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    this.ctx.strokeStyle = '#f87171';
    this.ctx.lineWidth = 4;
    this.ctx.fillRect(magnX, magnY, magnW, magnH);
    this.ctx.strokeRect(magnX, magnY, magnW, magnH);

    this.ctx.fillStyle = '#f8fafc';
    this.ctx.fillRect(magnX + 10, magnY + 10, magnW - 20, magnH - 20);

    this.ctx.fillStyle = '#ef4444';
    this.ctx.font = '7px "Press Start 2P"';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('EVICTION', magnX + magnW / 2, magnY + 30);
    this.ctx.fillText('NOTICE', magnX + magnW / 2, magnY + 45);

    this.ctx.fillStyle = '#475569';
    this.ctx.font = '5px "Press Start 2P"';
    this.ctx.fillText('DEBT DUE:', magnX + magnW / 2, magnY + 65);
    this.ctx.fillStyle = '#15803d';
    this.ctx.fillText('$1,432,980', magnX + magnW / 2, magnY + 78);
  }
}
