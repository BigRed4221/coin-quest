import { Player, SkillName } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { Drop } from '../entities/Drop';
import { Level } from './Level';

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

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  
  // Game state
  private gameState: 'start_screen' | 'playing' | 'campfire' | 'game_over' | 'victory' = 'start_screen';
  private tick: number = 0;
  private cameraX: number = 0;
  private maxCameraX: number = 2240; // 3200 level width - 960 canvas width

  // Entities
  private player: Player;
  private enemies: Enemy[] = [];
  private drops: Drop[] = [];
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private level: Level;

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

    this.canvas.addEventListener('mousedown', () => {
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
    this.gameState = 'playing';
    this.startScreen?.classList.add('hidden');
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
    this.cameraX = Math.max(0, Math.min(this.player.x - 200, this.maxCameraX));

    this.projectiles = [];
    this.particles = [];
    this.drops = [];

    // Reset level obstacles
    this.level.initLevel();

    // Spawn Suburbs Enemies
    this.enemies = [
      new Enemy(550, 450, 'dog', 0),        // First Dog near picket fence
      new Enemy(950, 200, 'pigeon', 150),   // First Pigeon diving
      new Enemy(1250, 450, 'lawnmower', 0),  // Mower running toward cardboard box
      new Enemy(1450, 220, 'pigeon', 200),  // Second Pigeon
      
      // Post Campfire enemies
      new Enemy(1900, 450, 'dog', 200),     // Dog patrolling after campfire
      new Enemy(2050, 240, 'pigeon', 100),  // Pigeon diving over raised platform
      new Enemy(2200, 320, 'lawnmower', 0)  // Lawnmower patrolling on top of raised platform
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
    if (this.player.attackActiveTimer <= 0) return;

    const currentHeight = this.player.isCrouching ? this.player.height / 2 : this.player.height;
    
    // Define player attack hitbox
    const reach = this.player.comboStep === 3 ? 45 : 30; // Kick has longer reach
    const ax = this.player.facingRight ? this.player.x + this.player.width : this.player.x - reach;
    const ay = this.player.y + currentHeight / 2 - 20;
    const aw = reach;
    const ah = 40;

    // Check collision against cardboard boxes
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

      if (
        ax + aw > enemy.x &&
        ax < enemy.x + enemy.width &&
        ay + ah > enemy.y &&
        ay < enemy.y + enemy.height
      ) {
        // Damage calculations
        const damage = this.player.comboStep === 3 ? 20 : 10; // Kick does double damage
        const knockback = this.player.facingRight ? 6 : -6;
        
        const newDrops = enemy.takeDamage(damage, knockback, this.player.x);
        
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
    if (!this.player.isCoinSliding) return;

    // Bounding box of slide
    const sax = this.player.x;
    const say = this.player.y + this.player.height - 30;
    const saw = this.player.width;
    const sah = 30;

    for (const enemy of this.enemies) {
      if (enemy.state === 'dead') continue;

      if (
        sax + saw > enemy.x &&
        sax < enemy.x + enemy.width &&
        say + sah > enemy.y &&
        say < enemy.y + enemy.height
      ) {
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

      // Out of bounds cleanup
      if (p.x < this.cameraX - 100 || p.x > this.cameraX + 1060 || p.y > 540) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  private handleEnemyAttacks() {
    for (const enemy of this.enemies) {
      if (enemy.state === 'dead' || enemy.isStunned) continue;

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
        if (enemy.type === 'lawnmower') {
          // If crashed, Carl can safely hit it!
          if (enemy.state === 'crash_stun') continue;
          this.player.takeDamage(20);
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

    const px = this.player.x;
    if (px < 400) {
      this.tutorialPrompt.textContent = 'Press A / D to Walk. Hold W to Jump!';
    } else if (px >= 400 && px < 700) {
      this.tutorialPrompt.textContent = 'Jump over Grandma\'s white picket fence!';
    } else if (px >= 700 && px < 1050) {
      this.tutorialPrompt.textContent = 'Watch out! Press S to Crouch under diving pigeons!';
    } else if (px >= 1050 && px < 1250) {
      this.tutorialPrompt.textContent = 'Consecutively click Left Mouse or press J to smash boxes!';
    } else if (px >= 1250 && px < 1550) {
      this.tutorialPrompt.textContent = 'Dodge the Lawnmower! Attack only after it crashes & stuns!';
    } else if (px >= 1550 && px < 1700) {
      this.tutorialPrompt.textContent = 'Stand near campfire. Press R to rest & equip skills!';
    } else if (px >= 1700 && px < 2400) {
      this.tutorialPrompt.textContent = 'Use E / F to activate equipped skills!';
    } else if (px >= 2400 && !this.bossDefeated) {
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
    this.tick++;

    if (this.gameState === 'playing') {
      // 1. Update Player Inputs & States
      this.player.handleInput(this.keys, this.mouseClicked);
      this.mouseClicked = false; // Reset click triggers

      this.player.update(this.level.platforms);

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
      this.enemies.forEach(e => e.update(this.player.x, this.player.y, this.level.platforms, this.tick));

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

    // 1. Draw level layers (parallax backgrounds)
    this.level.drawBackground(this.ctx, this.cameraX);

    // 2. Draw solid blocks, campfire checkpoint
    this.level.drawForeground(this.ctx, this.cameraX, this.tick);

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
}
