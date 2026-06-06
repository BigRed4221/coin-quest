
import { Platform } from '../engine/Level';

export type SkillName = 'Coin Slide' | 'Coin Toss' | 'Golden Shield';

export class Player {
  x: number = 100;
  y: number = 400;
  vx: number = 0;
  vy: number = 0;
  width: number = 32;
  height: number = 64;

  // Skill triggers / communication flags
  coinTossTriggered: boolean = false;
  shieldAbsorbedHit: boolean = false;

  // Stats
  health: number = 100;
  maxHealth: number = 100;
  coins: number = 0;
  moneyMeter: number = 0; // Max 100, fills with XP and time
  maxMoneyMeter: number = 100;

  // Physics constants
  private gravity: number = 0.5;
  private friction: number = 0.85;
  private moveSpeed: number = 4.5;
  private jumpForce: number = -11.5;

  // Movement State
  isGrounded: boolean = false;
  isCrouching: boolean = false;
  facingRight: boolean = true;
  isRunning: boolean = false;

  // Combat Combo system
  comboStep: number = 0; // 0: Idle, 1: Punch 1, 2: Punch 2, 3: Roundhouse Kick
  comboTimer: number = 0; // Time window to hit next attack (ticks)
  attackActiveTimer: number = 0; // Duration of active hit box (ticks)
  attackCooldown: number = 0;

  // Active Skills system
  unlockedSkills: SkillName[] = []; // Skills the player has found
  equippedSkills: { slot1: SkillName | null; slot2: SkillName | null } = {
    slot1: null,
    slot2: null
  };
  
  // Cooldowns (in frames)
  cooldowns: { [key in SkillName]: number } = {
    'Coin Slide': 0,
    'Coin Toss': 0,
    'Golden Shield': 0
  };
  
  cooldownDurations: { [key in SkillName]: number } = {
    'Coin Slide': 120, // 2s
    'Coin Toss': 150,  // 2.5s
    'Golden Shield': 300 // 5s
  };

  // Skill active states
  isCoinSliding: boolean = false;
  coinSlideTimer: number = 0;
  
  isShieldActive: boolean = false;
  shieldTimer: number = 0;

  goldSkillEffectTimer: number = 0;

  // Damage flashing/invulnerability
  invulnerableTimer: number = 0;
  flashTimer: number = 0;

  groundY: number = 480;

  constructor() {
    this.reset();
  }

  reset() {
    this.x = 100;
    this.y = 400;
    this.vx = 0;
    this.vy = 0;
    this.health = 100;
    this.moneyMeter = 0;
    this.coins = 0;
    this.comboStep = 0;
    this.comboTimer = 0;
    this.attackActiveTimer = 0;
    this.attackCooldown = 0;
    this.coinTossTriggered = false;
    this.shieldAbsorbedHit = false;
    this.isCrouching = false;
    this.goldSkillEffectTimer = 0;
    this.groundY = 480;
    
    // Starting loadout: starts with no skills in slot 1 and 2
    this.unlockedSkills = [];
    this.equippedSkills = { slot1: null, slot2: null };
  }

  unlockSkill(skill: SkillName) {
    if (!this.unlockedSkills.includes(skill)) {
      this.unlockedSkills.push(skill);
      // Auto equip to empty slots
      if (!this.equippedSkills.slot1) {
        this.equippedSkills.slot1 = skill;
      } else if (!this.equippedSkills.slot2 && this.equippedSkills.slot1 !== skill) {
        this.equippedSkills.slot2 = skill;
      }
    }
  }

  handleInput(keys: { [key: string]: boolean }, mouseClicked: boolean) {
    if (this.health <= 0 || this.isCoinSliding) return;

    // 1. Crouch logic (S)
    if (keys['s'] || keys['ArrowDown']) {
      if (!this.isCrouching) {
        this.isCrouching = true;
        this.y += this.height / 2;
      }
    } else {
      if (this.isCrouching) {
        this.isCrouching = false;
        this.y -= this.height / 2;
      }
    }

    // 2. Move left/right (A/D)
    if (keys['a'] || keys['ArrowLeft']) {
      this.vx = this.isCrouching ? -this.moveSpeed * 0.35 : -this.moveSpeed;
      this.facingRight = false;
      this.isRunning = true;
    } else if (keys['d'] || keys['ArrowRight']) {
      this.vx = this.isCrouching ? this.moveSpeed * 0.35 : this.moveSpeed;
      this.facingRight = true;
      this.isRunning = true;
    } else {
      this.isRunning = false;
      if (this.isCrouching) {
        this.vx *= 0.5; // Slide to a halt when crouching
      }
    }

    // 3. Jump logic (W)
    if ((keys['w'] || keys['ArrowUp']) && this.isGrounded && !this.isCrouching) {
      this.vy = this.jumpForce;
      this.isGrounded = false;
    }

    // 4. Attack logic (J or Mouse Click)
    if ((mouseClicked || keys['j']) && this.attackCooldown <= 0) {
      this.triggerAttack();
    }

    // 5. Active Skill activation (E and F)
    if (keys['e'] && this.equippedSkills.slot1) {
      this.useSkill(this.equippedSkills.slot1);
    }
    if (keys['f'] && this.equippedSkills.slot2) {
      this.useSkill(this.equippedSkills.slot2);
    }
  }

  private triggerAttack() {
    this.attackCooldown = 15; // Delay between starting any combo attacks
    this.attackActiveTimer = 10; // Hitbox active for 10 frames

    // Advance combo
    if (this.comboStep === 0 || this.comboTimer <= 0) {
      this.comboStep = 1; // Left Punch
    } else if (this.comboStep === 1) {
      this.comboStep = 2; // Right Punch
    } else if (this.comboStep === 2) {
      this.comboStep = 3; // Roundhouse Kick
    } else {
      this.comboStep = 1; // Reset to Punch 1
    }

    this.comboTimer = 35; // Must press within 35 frames to chain combo
  }

  private useSkill(skillName: SkillName) {
    if (this.cooldowns[skillName] > 0) return; // Cooldown active

    const cost = skillName === 'Coin Slide' ? 30 : (skillName === 'Coin Toss' ? 25 : 45);
    if (this.moneyMeter < cost) return; // Not enough money meter points

    // Consume money meter
    this.moneyMeter -= cost;
    this.cooldowns[skillName] = this.cooldownDurations[skillName];

    if (skillName === 'Coin Slide') {
      this.isCoinSliding = true;
      this.coinSlideTimer = 20; // Slide lasts 20 frames (~0.33s)
      this.vx = this.facingRight ? 12 : -12;
      this.vy = 0;
      this.invulnerableTimer = 22; // Invulnerable during slide
      this.goldSkillEffectTimer = 20;
    } else if (skillName === 'Golden Shield') {
      this.isShieldActive = true;
      this.shieldTimer = 300; // Shield lasts 5 seconds
      this.goldSkillEffectTimer = 300;
    } else if (skillName === 'Coin Toss') {
      this.coinTossTriggered = true;
      this.goldSkillEffectTimer = 15;
    }
  }

  takeDamage(amount: number) {
    if (this.invulnerableTimer > 0 || this.health <= 0) return;

    if (this.isShieldActive) {
      this.shieldAbsorbedHit = true;
      this.invulnerableTimer = 20; // Brief invulnerability grace period
      return;
    }

    this.health -= amount;
    this.invulnerableTimer = 60; // 1 second of I-frames
    this.flashTimer = 60;

    // Moderate damage flinch/recoil
    this.vy = -3;
    this.vx = this.facingRight ? -4 : 4;
  }

  update(platforms: Platform[]) {
    // 1. Cooldowns & Timers ticks
    for (const key in this.cooldowns) {
      const skill = key as SkillName;
      if (this.cooldowns[skill] > 0) this.cooldowns[skill]--;
    }

    if (this.invulnerableTimer > 0) this.invulnerableTimer--;
    if (this.flashTimer > 0) this.flashTimer--;
    if (this.attackActiveTimer > 0) this.attackActiveTimer--;
    if (this.goldSkillEffectTimer > 0) this.goldSkillEffectTimer--;
    
    if (this.comboTimer > 0) {
      this.comboTimer--;
      if (this.comboTimer <= 0) {
        this.comboStep = 0; // Combo reset to idle
      }
    }
    if (this.attackCooldown > 0) this.attackCooldown--;

    // Fills money meter slowly over time (+0.03 per frame ~ 1.8/sec)
    if (this.moneyMeter < this.maxMoneyMeter && this.health > 0) {
      this.moneyMeter = Math.min(this.maxMoneyMeter, this.moneyMeter + 0.03);
    }

    // 2. Skill Active States updates
    if (this.isCoinSliding) {
      this.coinSlideTimer--;
      if (this.coinSlideTimer <= 0) {
        this.isCoinSliding = false;
        this.vx *= 0.5; // Friction slowdown after slide
      }
    }

    if (this.isShieldActive) {
      this.shieldTimer--;
      if (this.shieldTimer <= 0) {
        this.isShieldActive = false;
      }
    }

    // Find ground Y under player
    let underY = 480;
    const checkHeight = this.isCrouching ? this.height / 2 : this.height;
    for (const p of platforms) {
      if (
        p.type === 'ground' ||
        p.type === 'obstacle' ||
        p.type === 'overhang' ||
        (p.type === 'trashcan' && !p.broken) ||
        (p.type === 'box' && !p.broken) ||
        (p.type === 'gate' && !p.broken)
      ) {
        if (this.x + this.width > p.x && this.x < p.x + p.w) {
          if (p.y >= this.y + checkHeight - 4 && p.y < underY) {
            underY = p.y;
          }
        }
      }
    }
    this.groundY = underY;

    // 3. Apply physics
    if (!this.isCoinSliding) {
      this.vy += this.gravity;
      this.vx *= this.friction;
    }

    // Move player position
    this.x += this.vx;
    this.y += this.vy;

    // Floor collision
    this.isGrounded = false;
    const currentHeight = this.isCrouching ? this.height / 2 : this.height;

    // Check platform collisions
    for (const p of platforms) {
      if (
        p.type === 'ground' ||
        p.type === 'obstacle' ||
        p.type === 'overhang' ||
        (p.type === 'trashcan' && !p.broken) ||
        (p.type === 'box' && !p.broken) ||
        (p.type === 'gate' && !p.broken)
      ) {
        const playerLeft = this.x;
        const playerRight = this.x + this.width;
        const playerBottom = this.y + currentHeight;

        // AABB check
        if (
          playerRight > p.x &&
          playerLeft < p.x + p.w &&
          playerBottom > p.y &&
          this.y < p.y + p.h
        ) {
          // Landing on top of platform
          if (this.vy > 0 && this.y + currentHeight - this.vy <= p.y + 4) {
            this.y = p.y - currentHeight;
            this.vy = 0;
            this.isGrounded = true;
          }
          // Ceiling collision
          else if (this.vy < 0 && this.y - this.vy >= p.y + p.h - 4) {
            this.y = p.y + p.h;
            this.vy = 0;
          }
          // Lateral collisions (walls/fences)
          else if (this.vx > 0 && playerRight - this.vx <= p.x) {
            this.x = p.x - this.width;
            this.vx = 0;
          }
          else if (this.vx < 0 && playerLeft - this.vx >= p.x + p.w) {
            this.x = p.x + p.w;
            this.vx = 0;
          }
        }
      }
    }

    // Limit within level borders
    if (this.x < 0) this.x = 0;
    if (this.y < 0) {
      this.y = 0;
      this.vy = 0;
    }
  }

  // Draw Player on Canvas
  draw(ctx: CanvasRenderingContext2D, cameraX: number, tick: number) {
    if (this.health <= 0) {
      this.drawDead(ctx, cameraX);
      return;
    }

    // Damage flash toggle
    if (this.flashTimer > 0 && Math.floor(tick / 4) % 2 === 0) {
      return; // Skip rendering for flash effect
    }

    const currentHeight = this.isCrouching ? this.height / 2 : this.height;

    // --- Draw Ground Shadow ---
    ctx.save();
    ctx.translate(this.x + this.width / 2 - cameraX, this.groundY);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    const heightDiff = Math.max(0, this.groundY - (this.y + currentHeight));
    const shadowScale = Math.max(0.4, 1 - heightDiff / 300);
    const shadowWidth = Math.floor((this.isCrouching ? 40 : 32) * shadowScale);
    const shadowHeight = Math.floor(8 * shadowScale);
    const sx = -Math.floor(shadowWidth / 2);
    const sy = -Math.floor(shadowHeight / 2);
    
    // Snap to 4px
    const snap = 4;
    const snapX = Math.floor(sx / snap) * snap;
    const snapY = Math.floor(sy / snap) * snap;
    const snapW = Math.ceil(shadowWidth / snap) * snap;
    const snapH = Math.ceil(shadowHeight / snap) * snap;
    ctx.fillRect(snapX, snapY, snapW, snapH);
    ctx.fillRect(snapX + snap, snapY - snap, snapW - 2 * snap, snapH + 2 * snap);
    ctx.restore();

    ctx.save();
    // Translate directly to feet level
    ctx.translate(this.x + this.width / 2 - cameraX, this.y + currentHeight);
    if (!this.facingRight) ctx.scale(-1, 1);

    // --- Draw Golden Shield (If active) ---
    if (this.isShieldActive) {
      ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
      ctx.fillRect(-20, -35, 40, 3);
      ctx.fillRect(-20, 32, 40, 3);
      ctx.fillRect(-35, -20, 3, 40);
      ctx.fillRect(32, -20, 3, 40);
      ctx.fillRect(-30, -30, 10, 3);
      ctx.fillRect(20, -30, 10, 3);
      ctx.fillRect(-30, 27, 10, 3);
      ctx.fillRect(20, 27, 10, 3);

      // Spin shield coins
      const shieldSpinAngle = tick * 0.08;
      for (let i = 0; i < 3; i++) {
        const angle = shieldSpinAngle + (i * Math.PI * 2) / 3;
        const cx = Math.floor(Math.cos(angle) * 35);
        const cy = Math.floor(Math.sin(angle) * 35);
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(cx - 5, cy - 5, 10, 10);
        ctx.fillStyle = '#b8860b';
        ctx.fillRect(cx - 6, cy - 3, 1, 6);
        ctx.fillRect(cx + 5, cy - 3, 1, 6);
        ctx.fillRect(cx - 3, cy - 6, 6, 1);
        ctx.fillRect(cx - 3, cy + 5, 6, 1);
      }
    }

    // --- Draw Outlines ---
    const outlineOffsets = [
      [-2, 0], [2, 0], [0, -2], [0, 2]
    ];
    for (const [ox, oy] of outlineOffsets) {
      ctx.save();
      ctx.translate(ox, oy);
      this.drawPlayerShape(ctx, tick, true);
      ctx.restore();
    }

    // --- Draw Color Sprite ---
    this.drawPlayerShape(ctx, tick, false);

    ctx.restore();

    // Draw visual attack arcs (blocky)
    if (this.attackActiveTimer > 0) {
      this.drawAttackArc(ctx, cameraX);
    }
  }

  private drawPlayerShape(ctx: CanvasRenderingContext2D, tick: number, isOutline: boolean) {
    const originalFillStyle = ctx.fillStyle;
    const isGoldActive = this.goldSkillEffectTimer > 0 || this.isShieldActive;
    
    // Core color palette
    const colorOutline = isGoldActive ? (tick % 6 < 3 ? '#ffe600' : '#d4af37') : '#000000';
    
    const colorShirt = isGoldActive ? '#fbbf24' : '#dc2626';
    const colorShirtShade = isGoldActive ? '#b45309' : '#991b1b';
    const colorShirtFlowers = isGoldActive ? '#ffd700' : '#fde047';
    
    const colorShorts = isGoldActive ? '#fef08a' : '#d2b48c';
    const colorShortsShade = isGoldActive ? '#ca8a04' : '#b59970';
    
    const colorHair = isGoldActive ? '#fde047' : '#0f172a'; // Pure near-black hair
    const colorHairHighlight = isGoldActive ? '#fef08a' : '#334155'; // Dark blue-gray highlights
    
    const colorBelt = isGoldActive ? '#b45309' : '#78350f'; // Brown leather belt
    const colorBeltHighlight = isGoldActive ? '#fef08a' : '#ffd700'; // Gold buckle
    
    const colorSkin = isGoldActive ? '#fef08a' : '#df9a66'; // Rich skin
    const colorSkinShade = isGoldActive ? '#ca8a04' : '#9a3412'; // Deeper, high-contrast copper shadow
    
    const colorWraps = isGoldActive ? '#fbbf24' : '#b91c1c'; // Saturated wrap red
    
    const colorHeadband = isGoldActive ? '#fbbf24' : '#b91c1c';
    const colorHeadbandShade = isGoldActive ? '#b45309' : '#7f1d1d';

    const colorSandalSole = isGoldActive ? '#b45309' : '#78350f';
    const colorSandalStrap = isGoldActive ? '#fef08a' : '#451a03';
    const colorSunglasses = isGoldActive ? '#ffd700' : '#111111';

    const gridSize = 4;
    const setColor = (color: string) => {
      ctx.fillStyle = isOutline ? colorOutline : color;
    };
    const drawRect = (color: string, rx: number, ry: number, rw: number, rh: number) => {
      setColor(color);
      const x = Math.floor(rx / gridSize) * gridSize;
      const y = Math.floor(ry / gridSize) * gridSize;
      const w = Math.ceil(rw / gridSize) * gridSize;
      const h = Math.ceil(rh / gridSize) * gridSize;
      ctx.fillRect(x, y, w, h);
    };

    const bob = (this.isRunning && !this.isCoinSliding) ? Math.floor(Math.sin(tick * 0.45) * 3) : 0;
    const idleBob = (!this.isRunning && this.isGrounded && !this.isCoinSliding) ? Math.floor(Math.sin(tick * 0.15) * 1.5) : 0;

    if (this.isCoinSliding) {
      this.drawSlideShape(ctx, isOutline);
    } else {
      if (this.isCrouching) {
        // --- Crouched Brawler ---
        // 1. Legs / Feet (folded)
        drawRect(colorShorts, -12, -12, 24, 8);
        drawRect(colorShortsShade, -12, -12, 6, 8);
        drawRect(colorSkin, -13, -4, 10, 3);
        drawRect(colorSandalStrap, -11, -3, 3, 1);
        drawRect(colorSandalSole, -13, -1, 10, 1);
        
        // SUPPORT LEG KICK FIX
        if (!(this.attackActiveTimer > 0 && this.comboStep === 3)) {
          drawRect(colorSkin, 3, -4, 10, 3);
          drawRect(colorSandalStrap, 5, -3, 3, 1);
          drawRect(colorSandalSole, 3, -1, 10, 1);
        }

        // 2. Torso (Hawaiian shirt lowered)
        drawRect(colorShirt, -12, -28 + bob, 24, 16);
        drawRect(colorShirtShade, -12, -28 + bob, 6, 16);
        
        // Hawaiian floral print
        if (!isOutline) {
          drawRect(colorShirtFlowers, -8, -24 + bob, 4, 4);
          drawRect(colorShirtFlowers, 4, -20 + bob, 4, 4);
          drawRect(colorShirtFlowers, -4, -16 + bob, 4, 4);
        }
        
        // Belt
        drawRect(colorBelt, -13, -16 + bob, 26, 4);
        drawRect(colorBeltHighlight, -3, -16 + bob, 6, 4);

        // Chest opening skin
        drawRect(colorSkin, -2, -28 + bob, 4, 6);

        // 3. Head & Hair
        drawRect(colorSkin, -7, -42 + bob, 14, 14);
        
        // Face details: Sunglasses
        if (!isOutline) {
          drawRect(colorSunglasses, 0, -36 + bob, 8, 4);
          drawRect('#ffffff', 4, -36 + bob, 4, 4); // glare
        }

        // Hair & Headband
        drawRect(colorHair, -8, -46 + bob, 16, 4);
        drawRect(colorHair, -9, -44 + bob, 2, 6); // left spike
        drawRect(colorHair, 7, -44 + bob, 2, 6); // right spike
        
        drawRect(colorHeadband, -8, -40 + bob, 16, 3);
        drawRect(colorHeadband, -11, -40 + bob, 3, 8); // headband ribbon tail

        // 4. Arms & Fists
        if (this.attackActiveTimer > 0) {
          if (this.comboStep === 1) {
            // Punch 1 (Left jab): extend rear arm
            drawRect(colorShirt, -4, -24 + bob, 12, 6); // short sleeve
            drawRect(colorSkin, 8, -24 + bob, 14, 6); // bare forearm
            drawRect(colorWraps, 22, -25 + bob, 6, 8); // fist wrap
          } else if (this.comboStep === 2) {
            // Punch 2 (Right punch): extend front arm
            drawRect(colorShirt, 0, -21 + bob, 12, 6); // short sleeve
            drawRect(colorSkin, 12, -21 + bob, 14, 6); // bare forearm
            drawRect(colorWraps, 24, -22 + bob, 6, 8);
          } else if (this.comboStep === 3) {
            // Kick (Roundhouse): extend leg
            drawRect(colorShorts, -2, -14 + bob, 12, 8); // extended leg shorts
            drawRect(colorSkin, 10, -14 + bob, 12, 8); // bare leg
            drawRect(colorWraps, 22, -15 + bob, 6, 8); // foot wraps
            drawRect(colorSandalSole, 22, -7 + bob, 6, 1);
          }
        } else {
          // Low guard stance (short sleeve & bare skin)
          drawRect(colorShirt, -13, -26 + bob, 4, 4);
          drawRect(colorSkin, -13, -22 + bob, 4, 6);
          drawRect(colorWraps, -14, -18 + bob, 5, 5); // left wrap
          
          drawRect(colorShirt, 9, -24 + bob, 4, 4);
          drawRect(colorSkin, 9, -20 + bob, 4, 4);
          drawRect(colorWraps, 8, -18 + bob, 6, 6); // right wrap
        }
      } else {
        // --- Standing Brawler ---
        // 1. Legs / Feet
        if (!this.isGrounded) {
          // --- Jumping stance ---
          // Left Leg (bent)
          drawRect(colorShorts, -9, -20, 7, 8);
          drawRect(colorShortsShade, -9, -20, 2, 8);
          drawRect(colorSkin, -10, -12, 8, 8);
          drawRect(colorSkinShade, -10, -12, 2, 8);
          drawRect(colorSandalStrap, -9, -5, 6, 1);
          drawRect(colorSandalSole, -10, -4, 8, 1);

          // Right Leg (bent)
          // SUPPORT LEG KICK FIX
          if (!(this.attackActiveTimer > 0 && this.comboStep === 3)) {
            drawRect(colorShorts, 2, -20, 7, 8);
            drawRect(colorShortsShade, 2, -20, 2, 8);
            drawRect(colorSkin, 1, -12, 8, 8);
            drawRect(colorSkinShade, 1, -12, 2, 8);
            drawRect(colorSandalStrap, 2, -5, 6, 1);
            drawRect(colorSandalSole, 1, -4, 8, 1);
          }
        } else if (this.isRunning) {
          // --- Running stance ---
          const swing = Math.sin(tick * 0.35);
          const offsetRun = swing * 4;
          
          // Left Leg
          drawRect(colorShorts, -10 + offsetRun, -20 + bob, 7, 8);
          drawRect(colorShortsShade, -10 + offsetRun, -20 + bob, 2, 8);
          drawRect(colorSkin, -10 + offsetRun, -12 + bob, 7, 8);
          drawRect(colorSkin, -11 + offsetRun - (swing < 0 ? 2 : 0), -4 + bob - Math.floor(Math.abs(swing) * 2), 9, 3);
          drawRect(colorSandalStrap, -10 + offsetRun - (swing < 0 ? 2 : 0), -2 + bob - Math.floor(Math.abs(swing) * 2), 7, 1);
          drawRect(colorSandalSole, -11 + offsetRun - (swing < 0 ? 2 : 0), -1 + bob - Math.floor(Math.abs(swing) * 2), 9, 1);
          
          // Right Leg
          // SUPPORT LEG KICK FIX
          if (!(this.attackActiveTimer > 0 && this.comboStep === 3)) {
            drawRect(colorShorts, 3 - offsetRun, -20 + bob, 7, 8);
            drawRect(colorShortsShade, 3 - offsetRun, -20 + bob, 2, 8);
            drawRect(colorSkin, 3 - offsetRun, -12 + bob, 7, 8);
            drawRect(colorSkin, 2 - offsetRun - (swing > 0 ? 2 : 0), -4 + bob - Math.floor(Math.abs(swing) * 2), 9, 3);
            drawRect(colorSandalStrap, 3 - offsetRun - (swing > 0 ? 2 : 0), -2 + bob - Math.floor(Math.abs(swing) * 2), 7, 1);
            drawRect(colorSandalSole, 2 - offsetRun - (swing > 0 ? 2 : 0), -1 + bob - Math.floor(Math.abs(swing) * 2), 9, 1);
          }
        } else {
          // --- Idle standing stance ---
          // Left Leg
          drawRect(colorShorts, -10, -20 + idleBob, 7, 8);
          drawRect(colorShortsShade, -10, -20 + idleBob, 2, 8);
          drawRect(colorSkin, -10, -12 + idleBob, 7, 8);
          drawRect(colorSkinShade, -10, -12 + idleBob, 2, 8);
          drawRect(colorSkin, -11, -4 + idleBob, 9, 3);
          drawRect(colorSandalStrap, -10, -2 + idleBob, 7, 1);
          drawRect(colorSandalSole, -11, -1 + idleBob, 9, 1);
          
          // Right Leg
          // SUPPORT LEG KICK FIX
          if (!(this.attackActiveTimer > 0 && this.comboStep === 3)) {
            drawRect(colorShorts, 3, -20 + idleBob, 7, 8);
            drawRect(colorShortsShade, 3, -20 + idleBob, 2, 8);
            drawRect(colorSkin, 3, -12 + idleBob, 7, 8);
            drawRect(colorSkinShade, 3, -12 + idleBob, 2, 8);
            drawRect(colorSkin, 2, -4 + idleBob, 9, 3);
            drawRect(colorSandalStrap, 3, -2 + idleBob, 7, 1);
            drawRect(colorSandalSole, 2, -1 + idleBob, 9, 1);
          }
        }
 
        // 2. Torso
        const currentBob = this.isRunning ? bob : idleBob;
        let xOffset = 0;
        if (this.attackActiveTimer > 0) {
          if (this.comboStep === 1) xOffset = 2; // lean in punch 1
          else if (this.comboStep === 2) xOffset = 4; // lean in punch 2
          else if (this.comboStep === 3) xOffset = -3; // lean back kick 3
        }
 
        // Draw Hawaiian shirt body
        drawRect(colorShirt, -11 + xOffset, -48 + currentBob, 22, 28);
        drawRect(colorShirtShade, -11 + xOffset, -48 + currentBob, 4, 28); // Shadow on back
        
        // Fold detailing
        drawRect(colorShirtShade, -7 + xOffset, -38 + currentBob, 14, 2);
        drawRect(colorShirtShade, -3 + xOffset, -32 + currentBob, 10, 2);
 
        // Hawaiian flowers pattern
        if (!isOutline) {
          drawRect(colorShirtFlowers, -7 + xOffset, -44 + currentBob, 4, 4);
          drawRect(colorShirtFlowers, 3 + xOffset, -40 + currentBob, 4, 4);
          drawRect(colorShirtFlowers, -3 + xOffset, -32 + currentBob, 4, 4);
          drawRect(colorShirtFlowers, 5 + xOffset, -28 + currentBob, 4, 4);
        }

        // V-Neck chest skin opening
        drawRect(colorSkin, -3 + xOffset, -48 + currentBob, 6, 8);
 
        // Brown belt wrapping waist
        drawRect(colorBelt, -12 + xOffset, -24 + currentBob, 24, 5);
        drawRect(colorBeltHighlight, -3 + xOffset, -24 + currentBob, 6, 5);
 
        // 3. Head
        drawRect(colorSkin, -7 + xOffset, -62 + currentBob, 14, 14);
 
        if (!isOutline) {
          // Sunglasses
          drawRect(colorSunglasses, 1 + xOffset, -57 + currentBob, 8, 4);
          drawRect('#ffffff', 5 + xOffset, -57 + currentBob, 4, 4); // glare
        }
        
        // Spiky Hair
        drawRect(colorHair, -8 + xOffset, -66 + currentBob, 16, 4);
        drawRect(colorHair, -9 + xOffset, -64 + currentBob, 2, 8); // left spikes
        drawRect(colorHair, 7 + xOffset, -64 + currentBob, 2, 8); // right spikes
        drawRect(colorHairHighlight, -4 + xOffset, -65 + currentBob, 8, 1); // highlights
 
        // Red Headband
        drawRect(colorHeadband, -8 + xOffset, -60 + currentBob, 16, 3);
        
        // Ribbon tails flying back
        if (this.isRunning) {
          drawRect(colorHeadband, -14 + xOffset, -59 + currentBob, 6, 3);
          drawRect(colorHeadbandShade, -18 + xOffset, -57 + currentBob, 5, 3);
        } else {
          drawRect(colorHeadband, -11 + xOffset, -59 + currentBob, 3, 10);
          drawRect(colorHeadbandShade, -13 + xOffset, -56 + currentBob, 2, 7);
        }
 
        // 4. Arms / Attacks
        if (this.attackActiveTimer > 0) {
          if (this.comboStep === 1) {
            // Punch 1 (Left Jab): extend rear arm straight
            drawRect(colorShirt, -4 + xOffset, -43 + currentBob, 10, 6); // short sleeve
            drawRect(colorSkin, 6 + xOffset, -43 + currentBob, 14, 6); // bare forearm
            drawRect(colorWraps, 18 + xOffset, -44 + currentBob, 7, 8); // red fist wraps
            
            // Rear arm (Right) in guard
            drawRect(colorShirt, -10 + xOffset, -40 + currentBob, 4, 4);
            drawRect(colorSkin, -10 + xOffset, -36 + currentBob, 4, 6);
            drawRect(colorWraps, -12 + xOffset, -32 + currentBob, 5, 5);
          } else if (this.comboStep === 2) {
            // Punch 2 (Right Straight): extend front arm straight
            drawRect(colorShirt, 0 + xOffset, -38 + currentBob, 10, 6); // short sleeve
            drawRect(colorSkin, 10 + xOffset, -38 + currentBob, 16, 6); // bare forearm
            drawRect(colorWraps, 24 + xOffset, -39 + currentBob, 7, 8); // red fist wraps
 
            // Rear arm (Left) in guard
            drawRect(colorShirt, -12 + xOffset, -42 + currentBob, 4, 4);
            drawRect(colorSkin, -12 + xOffset, -38 + currentBob, 4, 6);
            drawRect(colorWraps, -14 + xOffset, -34 + currentBob, 5, 5);
          } else if (this.comboStep === 3) {
            // Kick 3 (Roundhouse Kick): extended leg kicking right
            drawRect(colorShorts, -2 + xOffset, -24 + currentBob, 12, 9); // shorts
            drawRect(colorShortsShade, -2 + xOffset, -24 + currentBob, 4, 9);
            drawRect(colorSkin, 10 + xOffset, -24 + currentBob, 14, 9); // bare leg
            drawRect(colorSkinShade, 10 + xOffset, -24 + currentBob, 2, 9);
            drawRect(colorWraps, 24 + xOffset, -25 + currentBob, 6, 8); // foot wraps
            drawRect(colorSandalSole, 22 + xOffset, -16 + currentBob, 8, 1);
 
            // Fists in guard close to chest
            drawRect(colorShirt, -6 + xOffset, -38 + currentBob, 4, 4);
            drawRect(colorSkin, -6 + xOffset, -34 + currentBob, 4, 4);
            drawRect(colorWraps, -7 + xOffset, -32 + currentBob, 6, 6);
          }
        } else {
          // Rear arm (Left) - short sleeve + bare skin
          drawRect(colorShirt, -13 + xOffset, -44 + currentBob, 4, 6);
          drawRect(colorSkin, -13 + xOffset, -38 + currentBob, 4, 6);
          drawRect(colorWraps, -14 + xOffset, -32 + currentBob, 5, 5);
          
          // Front arm (Right) - short sleeve + bare skin
          const runArmBob = this.isRunning ? bob : Math.floor(Math.sin(tick * 0.15) * 2);
          drawRect(colorShirt, 9 + xOffset, -42 + currentBob + runArmBob, 4, 5);
          drawRect(colorSkin, 9 + xOffset, -37 + currentBob + runArmBob, 4, 5);
          drawRect(colorWraps, 8 + xOffset, -30 + currentBob + runArmBob, 6, 6);
        }
      }
    }
 
    ctx.fillStyle = originalFillStyle;
  }

  private drawSlideShape(ctx: CanvasRenderingContext2D, isOutline: boolean) {
    const originalFillStyle = ctx.fillStyle;
    const isGoldActive = this.goldSkillEffectTimer > 0 || this.isShieldActive;
    const colorOutline = isGoldActive ? (this.coinSlideTimer % 6 < 3 ? '#ffe600' : '#d4af37') : '#000000';

    const gridSize = 4;
    const setColor = (color: string) => {
      ctx.fillStyle = isOutline ? colorOutline : color;
    };
    const drawRect = (color: string, rx: number, ry: number, rw: number, rh: number) => {
      setColor(color);
      const x = Math.floor(rx / gridSize) * gridSize;
      const y = Math.floor(ry / gridSize) * gridSize;
      const w = Math.ceil(rw / gridSize) * gridSize;
      const h = Math.ceil(rh / gridSize) * gridSize;
      ctx.fillRect(x, y, w, h);
    };

    const colorShirt = isGoldActive ? '#fbbf24' : '#dc2626';
    const colorShirtShade = isGoldActive ? '#b45309' : '#991b1b';
    const colorShirtFlowers = isGoldActive ? '#ffd700' : '#fde047';
    const colorShorts = isGoldActive ? '#fef08a' : '#d2b48c';
    const colorShortsShade = isGoldActive ? '#ca8a04' : '#b59970';
    const colorHair = isGoldActive ? '#fde047' : '#1a1a1a';
    const colorSkin = isGoldActive ? '#fef08a' : '#df9a66';
    const colorSkinShade = isGoldActive ? '#ca8a04' : '#9a3412';
    const colorBelt = isGoldActive ? '#b45309' : '#78350f';
    const colorHeadband = isGoldActive ? '#fbbf24' : '#b91c1c';
    const colorSandalSole = isGoldActive ? '#b45309' : '#78350f';
    const colorSandalStrap = isGoldActive ? '#fef08a' : '#451a03';
    const colorSunglasses = isGoldActive ? '#ffd700' : '#111111';

    // Slide pose: slanted legs and torso sliding right
    // 1. Legs sliding (extended right, bent left)
    drawRect(colorShorts, -20, -12, 20, 12); // Shorts
    drawRect(colorShortsShade, -20, -8, 20, 4); // Shorts shadow
    drawRect(colorSkin, 0, -12, 14, 12); // Bare leg
    drawRect(colorSkinShade, 0, -8, 14, 4); // Bare leg shadow
    drawRect(colorSkin, 14, -10, 10, 6); // Slide foot extended forward
    drawRect(colorSandalStrap, 16, -10, 3, 2);
    drawRect(colorSandalSole, 14, -6, 10, 2); // Sole

    // 2. Torso (tilted Hawaiian shirt)
    drawRect(colorShirt, -14, -26, 26, 14);
    drawRect(colorShirtShade, -14, -26, 5, 14);
    
    // Flowers
    if (!isOutline) {
      drawRect(colorShirtFlowers, -10, -22, 4, 4);
      drawRect(colorShirtFlowers, 2, -20, 4, 4);
    }
    
    drawRect(colorSkin, -6, -24, 6, 6); // Neck/chest opening

    // Belt
    drawRect(colorBelt, -15, -18, 5, 6);

    // 3. Head (tilted right/up)
    drawRect(colorSkin, 6, -34, 12, 12);
    
    // Sunglasses
    if (!isOutline) {
      drawRect(colorSunglasses, 10, -30, 8, 4);
      drawRect('#ffffff', 14, -30, 4, 4); // glare
    }
    
    drawRect(colorHair, 4, -37, 14, 4); // Hair
    drawRect(colorHeadband, 5, -31, 14, 2); // Headband

    // Headband ribbons flying left
    drawRect(colorHeadband, -6, -29, 12, 2);

    // Dust smoke trail (skip on outline)
    if (!isOutline) {
      ctx.fillStyle = isGoldActive ? 'rgba(253, 224, 71, 0.6)' : 'rgba(226, 232, 240, 0.6)';
      ctx.fillRect(-34, -10, 12, 12);
      ctx.fillRect(-44, -6, 8, 8);
      
      // Floating slide sparkles if gold
      if (isGoldActive) {
        ctx.fillStyle = '#fde047';
        ctx.fillRect(-26, -14, 3, 3);
        ctx.fillRect(-16, -18, 2, 2);
      }
    }

    ctx.fillStyle = originalFillStyle;
  }

  private drawDead(ctx: CanvasRenderingContext2D, cameraX: number) {
    ctx.save();
    ctx.translate(this.x + this.width / 2 - cameraX, this.y + this.height - 5);
    ctx.rotate(Math.PI / 2);

    const outlineOffsets = [
      [-2, 0], [2, 0], [0, -2], [0, 2]
    ];
    for (const [ox, oy] of outlineOffsets) {
      ctx.save();
      ctx.translate(ox, oy);
      this.drawDeadShape(ctx, true);
      ctx.restore();
    }

    this.drawDeadShape(ctx, false);
    ctx.restore();
  }

  private drawDeadShape(ctx: CanvasRenderingContext2D, isOutline: boolean) {
    const originalFillStyle = ctx.fillStyle;
    const gridSize = 4;
    const setColor = (color: string) => {
      ctx.fillStyle = isOutline ? '#000000' : color;
    };
    const drawRect = (color: string, rx: number, ry: number, rw: number, rh: number) => {
      setColor(color);
      const x = Math.floor(rx / gridSize) * gridSize;
      const y = Math.floor(ry / gridSize) * gridSize;
      const w = Math.ceil(rw / gridSize) * gridSize;
      const h = Math.ceil(rh / gridSize) * gridSize;
      ctx.fillRect(x, y, w, h);
    };

    const colorShirt = '#dc2626';
    const colorShirtShade = '#991b1b';
    const colorShirtFlowers = '#fde047';
    const colorShorts = '#d2b48c';
    const colorSkin = '#df9a66';
    const colorBelt = '#78350f';
    const colorHair = '#0f172a';
    const colorSandalSole = '#78350f';
    const colorSunglasses = '#111111';

    // Drawn rotated 90 degrees in drawDead
    drawRect(colorShirt, -12, -20, 24, 28); // Torso shirt
    drawRect(colorShirtShade, -12, -20, 6, 28);
    
    // Flowers
    if (!isOutline) {
      drawRect(colorShirtFlowers, -8, -16, 4, 4);
      drawRect(colorShirtFlowers, 4, -8, 4, 4);
    }
    
    drawRect(colorBelt, -13, 0, 26, 4); // Belt

    drawRect(colorSkin, -8, -36, 16, 16); // Head
    
    // Sunglasses
    if (!isOutline) {
      drawRect(colorSunglasses, 0, -32, 8, 4);
      drawRect('#ffffff', 4, -32, 4, 4);
    }
    
    drawRect(colorHair, -9, -39, 18, 5); // Hair

    // Legs: shorts (Y=8 to 12) + bare leg (Y=12 to 20) + sandals (Y=20 to 22)
    // Left Leg
    drawRect(colorShorts, -10, 8, 8, 4);
    drawRect(colorSkin, -10, 12, 8, 8);
    drawRect(colorSandalSole, -11, 20, 10, 2);
    
    // Right Leg
    drawRect(colorShorts, 2, 8, 8, 4);
    drawRect(colorSkin, 2, 12, 8, 8);
    drawRect(colorSandalSole, 1, 20, 10, 2);

    ctx.fillStyle = originalFillStyle;
  }

  private drawAttackArc(ctx: CanvasRenderingContext2D, cameraX: number) {
    ctx.save();
    ctx.translate(-cameraX, 0);

    ctx.fillStyle = this.comboStep === 3 ? 'rgba(6, 182, 212, 0.8)' : 'rgba(255, 255, 255, 0.7)';
    const currentHeight = this.isCrouching ? this.height / 2 : this.height;
    const ax = this.facingRight ? this.x + this.width + 5 : this.x - 20;
    const ay = this.y + currentHeight / 2 - 5;

    // Draw a blocky 3-step slash arc
    ctx.fillRect(ax, ay - 12, 6, 24);
    ctx.fillRect(ax + (this.facingRight ? 6 : -6), ay - 6, 6, 18);
    ctx.fillRect(ax + (this.facingRight ? 12 : -12), ay, 6, 12);

    ctx.restore();
  }
}
