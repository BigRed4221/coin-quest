
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

  // Damage flashing/invulnerability
  invulnerableTimer: number = 0;
  flashTimer: number = 0;

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
    } else if (skillName === 'Golden Shield') {
      this.isShieldActive = true;
      this.shieldTimer = 300; // Shield lasts 5 seconds
    } else if (skillName === 'Coin Toss') {
      this.coinTossTriggered = true;
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
    const setColor = (color: string) => {
      ctx.fillStyle = isOutline ? '#000000' : color;
    };

    const bob = (this.isRunning && !this.isCoinSliding) ? Math.floor(Math.sin(tick * 0.45) * 3) : 0;

    if (this.isCoinSliding) {
      this.drawSlideShape(ctx, isOutline);
    } else {
      if (this.isCrouching) {
        // --- Crouched Carl ---
        // 1. Legs / Sneakers
        setColor('#1e40af'); // Blue jeans
        ctx.fillRect(-10, -10 + bob, 8, 6);
        
        // SUPPORT LEG KICK FIX: Only draw supporting leg when not roundhouse kicking
        if (!(this.attackActiveTimer > 0 && this.comboStep === 3)) {
          ctx.fillRect(2, -10 + bob, 8, 6);
          setColor('#f8fafc'); // White sneakers
          ctx.fillRect(1, -4, 10, 4);
        }
        setColor('#f8fafc'); // White sneakers
        ctx.fillRect(-11, -4, 10, 4);

        // 2. Torso (Faded light-blue T-shirt)
        setColor('#0ea5e9'); // Cyan
        ctx.fillRect(-12, -22 + bob, 24, 12);
        
        // 3. Head (Peach Skin + Brown hair)
        setColor('#ffedd5'); // Peach skin
        ctx.fillRect(-8, -38 + bob, 16, 16);
        
        if (!isOutline) {
          ctx.fillStyle = '#1e3a8a'; // Blue eye
          ctx.fillRect(4, -34 + bob, 2, 2);
          ctx.fillStyle = '#7c2d12'; // Brown beard
          ctx.fillRect(2, -26 + bob, 5, 2);
        }

        setColor('#7c2d12'); // Brown hair
        ctx.fillRect(-9, -41 + bob, 18, 5);
        ctx.fillRect(-9, -38 + bob, 4, 8); // Sideburns

        // 4. Arms
        setColor('#0ea5e9'); // Sleeve
        if (this.attackActiveTimer > 0) {
          if (this.comboStep === 1) {
            ctx.fillRect(-4, -18 + bob, 28, 6); // Punch
          } else if (this.comboStep === 2) {
            ctx.fillRect(-4, -14 + bob, 30, 6); // Punch
          } else if (this.comboStep === 3) {
            setColor('#1e40af'); // blue kick leg
            ctx.fillRect(-2, -10 + bob, 30, 8); // Kick
          }
        } else {
          ctx.fillRect(-6, -18 + bob, 4, 8); // Hanging arm
        }
      } else {
        // --- Standing Carl ---
        // 1. Legs / Sneakers
        setColor('#1e40af'); // Blue jeans
        if (this.isRunning) {
          const legSwing = Math.floor(Math.sin(tick * 0.35) * 6);
          ctx.fillRect(-10, -21 + bob, 8, 16 - legSwing); // Left Leg
          
          // SUPPORT LEG KICK FIX
          if (!(this.attackActiveTimer > 0 && this.comboStep === 3)) {
            ctx.fillRect(2, -21 + bob, 8, 16 + legSwing); // Right Leg
            setColor('#f8fafc'); // White sneakers
            ctx.fillRect(1, -5 + legSwing, 10, 5);
          }
          setColor('#f8fafc'); // White sneakers
          ctx.fillRect(-11, -5 - legSwing, 10, 5);
        } else {
          ctx.fillRect(-10, -21, 8, 16);
          
          // SUPPORT LEG KICK FIX
          if (!(this.attackActiveTimer > 0 && this.comboStep === 3)) {
            ctx.fillRect(2, -21, 8, 16);
            setColor('#f8fafc'); // White sneakers
            ctx.fillRect(1, -5, 10, 5);
          }
          setColor('#f8fafc'); // White sneakers
          ctx.fillRect(-11, -5, 10, 5);
        }

        // 2. Torso (Faded light-blue T-shirt)
        setColor('#0ea5e9'); // Cyan
        ctx.fillRect(-12, -49 + bob, 24, 28);
        
        if (!isOutline) {
          ctx.fillStyle = '#f8fafc';
          ctx.font = '8px Outfit';
          ctx.fillText("C", -3, -34 + bob);
        }

        // 3. Head (Peach Skin + Brown hair)
        setColor('#ffedd5'); // Peach skin
        ctx.fillRect(-8, -65 + bob, 16, 16);

        if (!isOutline) {
          ctx.fillStyle = '#1e3a8a'; // Blue eye
          ctx.fillRect(4, -61 + bob, 2, 2);
          ctx.fillStyle = '#7c2d12'; // Brown beard
          ctx.fillRect(2, -53 + bob, 5, 2);
        }
        
        setColor('#7c2d12'); // Brown hair
        ctx.fillRect(-9, -68 + bob, 18, 5);
        ctx.fillRect(-9, -65 + bob, 4, 10); // Sideburns

        // 4. Arms
        setColor('#0ea5e9'); // Sleeve
        if (this.attackActiveTimer > 0) {
          if (this.comboStep === 1) {
            ctx.fillRect(-4, -41 + bob, 28, 6);
          } else if (this.comboStep === 2) {
            ctx.fillRect(-4, -34 + bob, 30, 6);
          } else if (this.comboStep === 3) {
            setColor('#1e40af'); // blue kick leg
            ctx.fillRect(-2, -21 + bob, 30, 8);
          }
        } else {
          ctx.fillRect(-6, -41 + bob, 4, 14);
        }
      }
    }

    ctx.fillStyle = originalFillStyle;
  }

  private drawSlideShape(ctx: CanvasRenderingContext2D, isOutline: boolean) {
    const originalFillStyle = ctx.fillStyle;
    const setColor = (color: string) => {
      ctx.fillStyle = isOutline ? '#000000' : color;
    };

    // Slanted slide body (blocky)
    setColor('#1e40af'); // Jeans
    ctx.fillRect(-22, -12, 36, 12);
    setColor('#0ea5e9'); // Torso tilted
    ctx.fillRect(-10, -27, 24, 15);
    setColor('#ffedd5'); // Head
    ctx.fillRect(8, -34, 12, 12);
    setColor('#7c2d12'); // Hair
    ctx.fillRect(6, -36, 14, 4);

    // Dust smoke trail (skip on outline)
    if (!isOutline) {
      ctx.fillStyle = 'rgba(226, 232, 240, 0.6)';
      ctx.fillRect(-34, -10, 12, 12);
      ctx.fillRect(-44, -6, 8, 8);
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
    const setColor = (color: string) => {
      ctx.fillStyle = isOutline ? '#000000' : color;
    };

    setColor('#0ea5e9');
    ctx.fillRect(-12, -20, 24, 28); // Torso
    setColor('#ffedd5');
    ctx.fillRect(-8, -36, 16, 16); // Head
    setColor('#7c2d12');
    ctx.fillRect(-9, -39, 18, 5); // Hair
    setColor('#1e40af');
    ctx.fillRect(-10, 8, 8, 12); // Legs

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
