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
  private maxCameraX: number = 3120; // 3600 level width - 480 zoomed viewport width

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
    this.cameraX = Math.max(0, Math.min(this.player.x - 240, this.maxCameraX));

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
      new Enemy(1450, 440, 'pigeon', 100),
      new Enemy(1510, 440, 'pigeon', 100),

      // Group 3: HOA Inspector squad (X=2100 to 2380)
      new Enemy(2100, 420, 'inspector', 350),
      new Enemy(2380, 420, 'inspector', 250),

      // Group 4: Post-campfire ambush (X=2650 to 2850)
      new Enemy(2650, 450, 'dog', 150),
      new Enemy(2700, 440, 'pigeon', 80),
      new Enemy(2760, 440, 'pigeon', 80),
      new Enemy(2850, 420, 'inspector', 300)
    ];

    // Re-initialize arenas (empty to remove forced movement blocks/laser barriers)
    this.arenas = [];



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
      if (p.x < this.cameraX - 100 || p.x > this.cameraX + 580 || p.y > 540) {
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
      this.tutorialPrompt.textContent = 'Jump over low-charging pigeons or punch them!';
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
        const targetCamX = this.player.x - 240;
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

    this.ctx.save();
    
    // Scale context by 2x for retro pixelation and zoom
    this.ctx.scale(2, 2);
    // Shift context Y so that we view the bottom 270 pixels of the 540-height level coordinates
    this.ctx.translate(0, -270);

    // 1. Draw level layers (parallax backgrounds)
    this.level.drawBackground(this.ctx, this.cameraX);

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
      ctx.fillStyle = isRed ? '#ef4444' : '#ffffff';
      ctx.fillRect(x - blockWidth / 2, y + 2, blockWidth, blockHeight - 4);
      
      // Core highlight block
      ctx.fillStyle = isRed ? '#fca5a5' : '#e2e8f0';
      ctx.fillRect(x - blockWidth / 2 + 3, y + 4, blockWidth - 6, blockHeight - 8);
    }

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
        if (this.cutsceneSlideIndex >= 9) {
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
      case 5:
        this.drawSlide6();
        break;
      case 6:
        this.drawSlide7();
        break;
      case 7:
        this.drawSlide8();
        break;
      case 8:
        this.drawSlide9();
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
      case 5:
        text = "CONTROLS: Press A/D to Walk left/right. Press W to Jump over fences.";
        break;
      case 6:
        text = "COMBAT: Click/J to attack. Chain J-J-J for Punch-Punch-Kick combo. Press S to Crouch.";
        break;
      case 7:
        text = "CAMPFIRE: Stand near Campfires and press R to rest, fully heal, and equip skills.";
        break;
      case 8:
        text = "Let the Quest begin! Retrieve $1,432,980 to buy back Grandma's home...";
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

    this.ctx.fillStyle = '#78350f'; // Brown leather satchel
    if (runFrame === 0 || runFrame === 2) {
      this.ctx.fillRect(carlX - 10, carlY + 15, 10, 15);
    } else {
      this.ctx.fillRect(carlX + 22, carlY + 15, 10, 15);
    }

    this.ctx.fillStyle = '#df9a66'; // Bare skin shins
    if (runFrame === 0) {
      this.ctx.fillRect(carlX + 2, carlY + 36, 8, 12);
      this.ctx.fillRect(carlX + 16, carlY + 36, 12, 6);
      this.ctx.fillStyle = '#78350f'; // Sandal soles
      this.ctx.fillRect(carlX + 2, carlY + 48, 8, 4);
      this.ctx.fillRect(carlX + 16, carlY + 42, 12, 4);
    } else if (runFrame === 1) {
      this.ctx.fillRect(carlX - 4, carlY + 36, 12, 6);
      this.ctx.fillRect(carlX + 12, carlY + 36, 8, 16);
      this.ctx.fillStyle = '#78350f'; // Sandal soles
      this.ctx.fillRect(carlX - 4, carlY + 42, 12, 4);
      this.ctx.fillRect(carlX + 12, carlY + 52, 8, 4);
    } else if (runFrame === 2) {
      this.ctx.fillRect(carlX + 12, carlY + 36, 8, 12);
      this.ctx.fillRect(carlX - 2, carlY + 36, 12, 6);
      this.ctx.fillStyle = '#78350f'; // Sandal soles
      this.ctx.fillRect(carlX + 12, carlY + 48, 8, 4);
      this.ctx.fillRect(carlX - 2, carlY + 42, 12, 4);
    } else {
      this.ctx.fillRect(carlX + 14, carlY + 36, 12, 6);
      this.ctx.fillRect(carlX + 2, carlY + 36, 8, 16);
      this.ctx.fillStyle = '#78350f'; // Sandal soles
      this.ctx.fillRect(carlX + 14, carlY + 42, 12, 4);
      this.ctx.fillRect(carlX + 2, carlY + 52, 8, 4);
    }

    // Shorts
    this.ctx.fillStyle = '#d2b48c';
    this.ctx.fillRect(carlX + 2, carlY + 28 + bob, 22, 9);

    // Torso Shirt
    this.ctx.fillStyle = '#dc2626';
    this.ctx.fillRect(carlX + 2, carlY + 12 + bob, 22, 16);
    
    // Flowers
    this.ctx.fillStyle = '#fde047';
    this.ctx.fillRect(carlX + 6, carlY + 16 + bob, 4, 4);
    this.ctx.fillRect(carlX + 14, carlY + 22 + bob, 4, 4);

    // Short sleeves & bare skin arms
    this.ctx.fillStyle = '#dc2626'; // shirt red sleeve
    if (runFrame === 0 || runFrame === 2) {
      this.ctx.fillRect(carlX + 20, carlY + 15 + bob, 6, 10);
      this.ctx.fillStyle = '#df9a66'; // bare skin forearm
      this.ctx.fillRect(carlX + 26, carlY + 15 + bob, 6, 10);
    } else {
      this.ctx.fillRect(carlX - 2, carlY + 15 + bob, 6, 10);
      this.ctx.fillStyle = '#df9a66'; // bare skin forearm
      this.ctx.fillRect(carlX - 8, carlY + 15 + bob, 6, 10);
    }

    // Head skin
    this.ctx.fillStyle = '#df9a66';
    this.ctx.fillRect(carlX + 6, carlY - 4 + bob, 16, 16);
    
    // Sunglasses
    this.ctx.fillStyle = '#111111';
    this.ctx.fillRect(carlX + 12, carlY + bob, 10, 4);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(carlX + 18, carlY + bob, 4, 4);

    // Hair
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(carlX + 4, carlY - 8 + bob, 18, 5);
    
    // Red headband
    this.ctx.fillStyle = '#b91c1c';
    this.ctx.fillRect(carlX + 4, carlY - 4 + bob, 18, 3);
    this.ctx.fillRect(carlX - 2, carlY - 3 + bob, 6, 2); // tail flying back

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

  private drawCarlCutscene(cx: number, cy: number, pose: 'stand' | 'kick' | 'crouch' = 'stand') {
    this.ctx.save();
    this.ctx.translate(cx, cy);

    // Outline
    this.ctx.fillStyle = '#000000';
    if (pose === 'stand') {
      this.ctx.fillRect(-24, -96, 48, 96);
    } else if (pose === 'crouch') {
      this.ctx.fillRect(-24, -48, 48, 48);
    } else {
      this.ctx.fillRect(-32, -96, 96, 96);
    }

    // Color layers
    const colorShirt = '#dc2626';
    const colorShirtFlowers = '#fde047';
    const colorShorts = '#d2b48c';
    const colorSkin = '#df9a66';
    const colorBelt = '#78350f';
    const colorBeltHighlight = '#ffd700';
    const colorHair = '#0f172a';
    const colorWraps = '#b91c1c';
    const colorHeadband = '#b91c1c';
    const colorSandalSole = '#78350f';
    const colorSandalStrap = '#451a03';
    const colorSunglasses = '#111111';

    if (pose === 'stand') {
      // Shorts
      this.ctx.fillStyle = colorShorts;
      this.ctx.fillRect(-20, -32, 40, 14);
      // Bare skin shins
      this.ctx.fillStyle = colorSkin;
      this.ctx.fillRect(-18, -18, 36, 14);
      // Sandal straps
      this.ctx.fillStyle = colorSandalStrap;
      this.ctx.fillRect(-16, -6, 12, 2);
      this.ctx.fillRect(4, -6, 12, 2);
      // Sandal soles
      this.ctx.fillStyle = colorSandalSole;
      this.ctx.fillRect(-18, -4, 14, 4);
      this.ctx.fillRect(4, -4, 14, 4);

      // Torso shirt
      this.ctx.fillStyle = colorShirt;
      this.ctx.fillRect(-20, -72, 40, 40);
      
      // Flowers print
      this.ctx.fillStyle = colorShirtFlowers;
      this.ctx.fillRect(-14, -64, 6, 6);
      this.ctx.fillRect(6, -56, 6, 6);
      this.ctx.fillRect(-10, -46, 6, 6);

      // Skin Chest V-Neck
      this.ctx.fillStyle = colorSkin;
      this.ctx.fillRect(-6, -72, 12, 16);
      
      // Belt
      this.ctx.fillStyle = colorBelt;
      this.ctx.fillRect(-22, -36, 44, 8);
      this.ctx.fillStyle = colorBeltHighlight;
      this.ctx.fillRect(-4, -36, 8, 8);

      // Head
      this.ctx.fillStyle = colorSkin;
      this.ctx.fillRect(-12, -92, 24, 20);
      
      // Sunglasses
      this.ctx.fillStyle = colorSunglasses;
      this.ctx.fillRect(-2, -86, 14, 6);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(6, -86, 4, 6);

      // Hair
      this.ctx.fillStyle = colorHair;
      this.ctx.fillRect(-14, -98, 28, 8);
      
      // Headband
      this.ctx.fillStyle = colorHeadband;
      this.ctx.fillRect(-14, -92, 28, 6);

      // Wraps/Hands
      this.ctx.fillStyle = colorWraps;
      this.ctx.fillRect(16, -56, 12, 12);
    } else if (pose === 'crouch') {
      // Crouched
      // Hawaiian shirt
      this.ctx.fillStyle = colorShirt;
      this.ctx.fillRect(-20, -38, 40, 18);
      
      // Flowers
      this.ctx.fillStyle = colorShirtFlowers;
      this.ctx.fillRect(-10, -34, 4, 4);
      this.ctx.fillRect(6, -32, 4, 4);

      // Shorts
      this.ctx.fillStyle = colorShorts;
      this.ctx.fillRect(-20, -38, 40, 6);

      // Bare shins
      this.ctx.fillStyle = colorSkin;
      this.ctx.fillRect(-20, -20, 40, 16);
      
      // Sandal soles
      this.ctx.fillStyle = colorSandalSole;
      this.ctx.fillRect(-22, -4, 44, 4);

      // Belt
      this.ctx.fillStyle = colorBelt;
      this.ctx.fillRect(-22, -22, 44, 4);
      this.ctx.fillStyle = colorBeltHighlight;
      this.ctx.fillRect(-4, -22, 8, 4);

      // Head
      this.ctx.fillStyle = colorSkin;
      this.ctx.fillRect(-10, -48, 20, 12);
      
      // Sunglasses
      this.ctx.fillStyle = colorSunglasses;
      this.ctx.fillRect(0, -44, 10, 4);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(6, -44, 4, 4);

      // Hair
      this.ctx.fillStyle = colorHair;
      this.ctx.fillRect(-12, -54, 24, 6);
      
      // Headband
      this.ctx.fillStyle = colorHeadband;
      this.ctx.fillRect(-12, -48, 24, 3);
    } else if (pose === 'kick') {
      // Extended kick
      // Left standing leg shorts & bare skin
      this.ctx.fillStyle = colorShorts;
      this.ctx.fillRect(-20, -32, 24, 14);
      this.ctx.fillStyle = colorSkin;
      this.ctx.fillRect(-18, -18, 20, 14);
      this.ctx.fillStyle = colorSandalSole;
      this.ctx.fillRect(-20, -4, 24, 4);

      // Torso shirt
      this.ctx.fillStyle = colorShirt;
      this.ctx.fillRect(-10, -72, 40, 40);
      
      // Flowers
      this.ctx.fillStyle = colorShirtFlowers;
      this.ctx.fillRect(-4, -64, 6, 6);
      this.ctx.fillRect(16, -56, 6, 6);

      // Extended leg (shorts + bare leg + sandal sole)
      this.ctx.fillStyle = colorShorts;
      this.ctx.fillRect(30, -32, 16, 12);
      this.ctx.fillStyle = colorSkin;
      this.ctx.fillRect(46, -32, 24, 12);
      this.ctx.fillStyle = colorWraps;
      this.ctx.fillRect(70, -32, 10, 12); // Foot
      this.ctx.fillStyle = colorSandalSole;
      this.ctx.fillRect(80, -32, 4, 12);

      // Head
      this.ctx.fillStyle = colorSkin;
      this.ctx.fillRect(0, -92, 24, 20);
      
      // Sunglasses
      this.ctx.fillStyle = colorSunglasses;
      this.ctx.fillRect(10, -86, 14, 6);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(18, -86, 4, 6);

      // Hair
      this.ctx.fillStyle = colorHair;
      this.ctx.fillRect(-2, -98, 28, 8);
      
      // Belt
      this.ctx.fillStyle = colorBelt;
      this.ctx.fillRect(-12, -36, 40, 8);
    }

    this.ctx.restore();
  }

  private drawSlide6() {
    this.ctx.fillStyle = '#60a5fa'; // Sky
    this.ctx.fillRect(0, 0, 960, 420);
    this.ctx.fillStyle = '#474954'; // Street sidewalk
    this.ctx.fillRect(0, 420, 960, 120);

    // Draw keyboard prompt boxes for A, D, W
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(160, 80, 80, 80); // A Key
    this.ctx.fillRect(280, 80, 80, 80); // D Key
    this.ctx.fillRect(440, 80, 80, 80); // W Key

    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 4;
    this.ctx.strokeRect(160, 80, 80, 80);
    this.ctx.strokeRect(280, 80, 80, 80);
    this.ctx.strokeRect(440, 80, 80, 80);

    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '24px "Press Start 2P"';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('A', 200, 130);
    this.ctx.fillText('D', 320, 130);
    this.ctx.fillText('W', 480, 130);

    this.ctx.font = '9px "Press Start 2P"';
    this.ctx.fillText('WALK LEFT', 200, 190);
    this.ctx.fillText('WALK RIGHT', 320, 190);
    this.ctx.fillText('JUMP', 480, 190);

    // Draw Carl Quest in the center-right, walking/jumping
    const carlX = 700;
    const carlY = 320 + Math.floor(Math.sin(this.tick * 0.15) * 6);
    this.drawCarlCutscene(carlX, carlY);
  }

  private drawSlide7() {
    this.ctx.fillStyle = '#60a5fa'; // Sky
    this.ctx.fillRect(0, 0, 960, 420);
    this.ctx.fillStyle = '#474954'; // Sidewalk
    this.ctx.fillRect(0, 420, 960, 120);

    // Prompt keys
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(160, 80, 80, 80); // S Key
    this.ctx.fillRect(280, 80, 80, 80); // J Key

    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 4;
    this.ctx.strokeRect(160, 80, 80, 80);
    this.ctx.strokeRect(280, 80, 80, 80);

    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '24px "Press Start 2P"';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('S', 200, 130);
    this.ctx.fillText('J', 320, 130);

    this.ctx.font = '9px "Press Start 2P"';
    this.ctx.fillText('CROUCH', 200, 190);
    this.ctx.fillText('ATTACK/COMBO', 320, 190);

    // Left Carl: crouching under a leaf overhang
    this.ctx.fillStyle = '#047857';
    this.ctx.fillRect(450, 180, 140, 60); // leaf overhang
    this.drawCarlCutscene(520, 380, 'crouch');

    // Right Carl: roundhouse kicking a box
    this.drawCarlCutscene(720, 320, 'kick');
    // Cardboard crate box
    this.ctx.fillStyle = '#ca8a04';
    this.ctx.fillRect(800, 280, 50, 50);
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(800, 280, 50, 50);
  }

  private drawSlide8() {
    this.ctx.fillStyle = '#1e1b4b'; // Night sky
    this.ctx.fillRect(0, 0, 960, 420);
    this.ctx.fillStyle = '#334155'; // Dark sidewalk
    this.ctx.fillRect(0, 420, 960, 120);

    // Prompt keys
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(100, 80, 80, 80); // R Key
    this.ctx.fillRect(220, 80, 80, 80); // E Key
    this.ctx.fillRect(340, 80, 80, 80); // F Key

    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 4;
    this.ctx.strokeRect(100, 80, 80, 80);
    this.ctx.strokeRect(220, 80, 80, 80);
    this.ctx.strokeRect(340, 80, 80, 80);

    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '24px "Press Start 2P"';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('R', 140, 130);
    this.ctx.fillText('E', 260, 130);
    this.ctx.fillText('F', 380, 130);

    this.ctx.font = '9px "Press Start 2P"';
    this.ctx.fillText('REST/CAMP', 140, 190);
    this.ctx.fillText('SKILL 1', 260, 190);
    this.ctx.fillText('SKILL 2', 380, 190);

    // Campfire in the center-right
    const campX = 680;
    const campY = 420;
    
    // Stones base
    this.ctx.fillStyle = '#475569';
    this.ctx.fillRect(campX - 24, campY - 4, 48, 4);
    // Logs
    this.ctx.fillStyle = '#7c2d12';
    this.ctx.fillRect(campX - 16, campY - 12, 32, 8);
    // Flame
    const flameH = 20 + Math.floor(Math.sin(this.tick * 0.4) * 6);
    this.ctx.fillStyle = '#ef4444';
    this.ctx.fillRect(campX - 10, campY - 12 - flameH, 20, flameH);
    this.ctx.fillStyle = '#f97316';
    this.ctx.fillRect(campX - 6, campY - 12 - Math.floor(flameH * 0.7), 12, Math.floor(flameH * 0.7));

    // Carl sitting near campfire
    this.drawCarlCutscene(campX - 80, campY, 'crouch');
    
    // Draw gold slide effect around Carl
    this.ctx.fillStyle = 'rgba(251, 191, 36, 0.4)';
    this.ctx.fillRect(campX - 140, campY - 30, 200, 3);
  }

  private drawSlide9() {
    // Cinematic background sky (rich purple/pink gradient bands)
    const skyColors = ['#0f172a', '#1e1b4b', '#311042', '#581c87', '#701a75', '#86198f', '#a21caf', '#c084fc', '#e9d5ff'];
    const stripeH = 34; // 9 * 34 = 306
    for (let i = 0; i < 9; i++) {
      this.ctx.fillStyle = skyColors[i];
      this.ctx.fillRect(0, i * stripeH, 960, stripeH);
    }

    // Giant glowing sunset sun in the horizon (blocky, pixelated)
    this.ctx.fillStyle = '#eab308'; // orange sun outer
    this.ctx.fillRect(380, 150, 200, 150);
    this.ctx.fillRect(410, 120, 140, 210);
    this.ctx.fillRect(450, 90, 60, 270);
    
    this.ctx.fillStyle = '#fbbf24'; // yellow sun mid
    this.ctx.fillRect(400, 160, 160, 120);
    this.ctx.fillRect(430, 130, 100, 180);
    
    this.ctx.fillStyle = '#ffffff'; // white sun core
    this.ctx.fillRect(420, 170, 120, 90);
    this.ctx.fillRect(440, 150, 80, 130);

    // Skyscraper silhouette ruins on left & right
    this.ctx.fillStyle = '#090d16'; // Deep silhouette
    this.ctx.fillRect(40, 120, 140, 300);
    this.ctx.fillRect(80, 80, 60, 340);
    this.ctx.clearRect(100, 80, 15, 20); // crumbles
    this.ctx.fillRect(180, 200, 100, 220);
    
    this.ctx.fillRect(680, 180, 100, 240);
    this.ctx.fillRect(780, 100, 140, 320);
    this.ctx.fillRect(820, 60, 60, 360);
    this.ctx.clearRect(840, 60, 20, 15);

    // Ground platform Y = 420
    this.ctx.fillStyle = '#020617';
    this.ctx.fillRect(0, 420, 960, 120);
    this.ctx.fillStyle = '#1e293b';
    this.ctx.fillRect(0, 420, 960, 8); // edge highlights

    // Ground rubble concrete cracks
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(200, 450, 80, 10);
    this.ctx.fillRect(240, 460, 40, 8);
    this.ctx.fillRect(600, 470, 120, 12);
    this.ctx.fillRect(640, 482, 60, 6);

    // Spawning beautiful animated golden sparks rising
    this.ctx.fillStyle = '#fbbf24';
    for (let i = 0; i < 20; i++) {
      const sparkX = Math.floor((Math.sin(i * 9.7 + this.tick * 0.03) * 0.5 + 0.5) * 800) + 80;
      const sparkY = (420 - (this.tick * (0.8 + (i % 3) * 0.4)) - (i * 25)) % 420;
      const size = 4 + (i % 3) * 4; // chunky size
      this.ctx.fillRect(sparkX, sparkY, size, size);
      
      // inner core
      if (size > 4) {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(sparkX + 2, sparkY + 2, size - 4, size - 4);
        this.ctx.fillStyle = '#fbbf24';
      }
    }

    // Huge 2.5x detailed Carl Quest in martial arts stance in the center
    this.ctx.save();
    this.ctx.translate(480, 390);
    this.ctx.scale(2.5, 2.5);
    
    const colorShirt = '#dc2626';
    const colorShirtShade = '#991b1b';
    const colorShirtFlowers = '#fde047';
    const colorShorts = '#d2b48c';
    const colorShortsShade = '#b59970';
    const colorSkin = '#df9a66';
    const colorBelt = '#78350f';
    const colorBeltHighlight = '#ffd700';
    const colorHair = '#0f172a';
    const colorWraps = '#b91c1c';
    const colorHeadband = '#b91c1c';
    const colorSandalSole = '#78350f';
    const colorSandalStrap = '#451a03';
    const colorSunglasses = '#111111';

    // Draw Carl Quest standing determined
    // Outline
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(-22, -92, 44, 92);
    this.ctx.fillRect(-28, -72, 8, 30); // arm
    this.ctx.fillRect(20, -72, 8, 30); // arm
    
    // Shorts
    this.ctx.fillStyle = colorShorts;
    this.ctx.fillRect(-18, -32, 16, 14); // left shorts
    this.ctx.fillRect(2, -32, 16, 14); // right shorts
    this.ctx.fillStyle = colorShortsShade;
    this.ctx.fillRect(2, -32, 4, 14); // right shorts shaded border
    
    // Bare legs
    this.ctx.fillStyle = colorSkin;
    this.ctx.fillRect(-16, -18, 12, 14); // left bare shin
    this.ctx.fillRect(4, -18, 12, 14); // right bare shin
    
    // Sandal straps
    this.ctx.fillStyle = colorSandalStrap;
    this.ctx.fillRect(-14, -6, 8, 2);
    this.ctx.fillRect(6, -6, 8, 2);
    
    // Sandal soles (Feet)
    this.ctx.fillStyle = colorSandalSole;
    this.ctx.fillRect(-18, -4, 14, 4);
    this.ctx.fillRect(4, -4, 14, 4);

    // Torso shirt
    this.ctx.fillStyle = colorShirt;
    this.ctx.fillRect(-18, -68, 36, 36);
    this.ctx.fillStyle = colorShirtShade;
    this.ctx.fillRect(-18, -68, 8, 36);
    
    // Shirt flowers print
    this.ctx.fillStyle = colorShirtFlowers;
    this.ctx.fillRect(-8, -60, 6, 6);
    this.ctx.fillRect(6, -52, 6, 6);
    this.ctx.fillRect(-6, -44, 6, 6);

    // V-neck skin
    this.ctx.fillStyle = colorSkin;
    this.ctx.fillRect(-4, -68, 8, 12);

    // Brown leather belt with gold buckle
    this.ctx.fillStyle = colorBelt;
    this.ctx.fillRect(-20, -32, 40, 6);
    this.ctx.fillStyle = colorBeltHighlight;
    this.ctx.fillRect(-4, -32, 8, 6);

    // Arms (short sleeve + bare forearm)
    this.ctx.fillStyle = colorShirt;
    this.ctx.fillRect(-26, -66, 8, 10); // left sleeve
    this.ctx.fillRect(18, -66, 8, 10); // right sleeve
    
    this.ctx.fillStyle = colorSkin;
    this.ctx.fillRect(-26, -56, 8, 8); // left bare arm
    this.ctx.fillRect(18, -56, 8, 8); // right bare arm
    
    // Hands/Wraps
    this.ctx.fillStyle = colorWraps;
    this.ctx.fillRect(-28, -48, 10, 10);
    this.ctx.fillRect(18, -48, 10, 10);

    // Head
    this.ctx.fillStyle = colorSkin;
    this.ctx.fillRect(-12, -88, 24, 20);
    
    // Sunglasses
    this.ctx.fillStyle = colorSunglasses;
    this.ctx.fillRect(-2, -82, 16, 6);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(6, -82, 4, 6);
    
    // Hair
    this.ctx.fillStyle = colorHair;
    this.ctx.fillRect(-14, -94, 28, 6);
    this.ctx.fillRect(-12, -96, 24, 2);
    // Spikes blowing right
    this.ctx.fillRect(-16, -92, 4, 8);
    this.ctx.fillRect(-18, -88, 4, 8);

    // Red Headband
    this.ctx.fillStyle = colorHeadband;
    this.ctx.fillRect(-12, -84, 24, 4);
    this.ctx.fillRect(-16, -82, 4, 12); // sash flying left

    this.ctx.restore();

    // Widescreen black cinematic letterbox bars (top & bottom)
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, 960, 50);
    this.ctx.fillRect(0, 490, 960, 50);

    // Shiny flashing text in the center
    const titleGlow = Math.floor(this.tick / 15) % 2 === 0;
    this.ctx.font = '36px "Press Start 2P"';
    this.ctx.textAlign = 'center';
    
    // Draw drop shadows
    this.ctx.fillStyle = '#000000';
    this.ctx.fillText('COIN QUEST', 480 + 4, 230 + 4);
    
    this.ctx.fillStyle = titleGlow ? '#ffd700' : '#fbbf24';
    this.ctx.fillText('COIN QUEST', 480, 230);
  }
}
