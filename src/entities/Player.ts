
export type SkillName = 'Coin Slide' | 'Coin Toss' | 'Golden Shield';

export class Player {
  x: number = 100;
  y: number = 400;
  vx: number = 0;
  vy: number = 0;
  width: number = 32;
  height: number = 64;

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
      this.isCrouching = true;
      this.isRunning = false;
      this.vx *= 0.5; // Slide to a halt
    } else {
      this.isCrouching = false;
    }

    // 2. Move left/right (A/D) if not crouching
    if (!this.isCrouching) {
      if (keys['a'] || keys['ArrowLeft']) {
        this.vx = -this.moveSpeed;
        this.facingRight = false;
        this.isRunning = true;
      } else if (keys['d'] || keys['ArrowRight']) {
        this.vx = this.moveSpeed;
        this.facingRight = true;
        this.isRunning = true;
      } else {
        this.isRunning = false;
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
      // Handled in GameEngine by spawning a projectile
    }
  }

  takeDamage(amount: number) {
    if (this.invulnerableTimer > 0 || this.health <= 0) return;

    this.health -= amount;
    this.invulnerableTimer = 60; // 1 second of I-frames
    this.flashTimer = 60;

    // Moderate damage flinch/recoil
    this.vy = -3;
    this.vx = this.facingRight ? -4 : 4;
  }

  update(platforms: { x: number; y: number; w: number; h: number; type: string }[]) {
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
      if (p.type === 'ground' || p.type === 'obstacle' || p.type === 'box') {
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

    ctx.save();
    ctx.translate(this.x + this.width / 2 - cameraX, this.y + (this.isCrouching ? this.height / 4 : 0) + this.height / 2);
    if (!this.facingRight) ctx.scale(-1, 1);

    // Dynamic Bobbing
    const bob = (this.isRunning && !this.isCoinSliding) ? Math.sin(tick * 0.45) * 3 : 0;

    // --- Draw Golden Shield (If active) ---
    if (this.isShieldActive) {
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.8)';
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(255, 215, 0, 0.7)';
      
      ctx.beginPath();
      ctx.arc(0, 0, 35, 0, Math.PI * 2);
      ctx.stroke();

      // Spin shield coins
      const shieldSpinAngle = tick * 0.08;
      for (let i = 0; i < 3; i++) {
        const angle = shieldSpinAngle + (i * Math.PI * 2) / 3;
        const cx = Math.cos(angle) * 35;
        const cy = Math.sin(angle) * 35;
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0; // Reset shadow
    }

    // --- Draw Carl's Body Parts ---
    if (this.isCoinSliding) {
      this.drawSlide(ctx);
    } else {
      // 1. Legs / Sneakers
      ctx.fillStyle = '#1e40af'; // Blue jeans
      if (this.isRunning) {
        const legSwing = Math.sin(tick * 0.35) * 12;
        ctx.fillRect(-10, 8 + bob, 8, 16 - legSwing); // Left Leg
        ctx.fillRect(2, 8 + bob, 8, 16 + legSwing); // Right Leg
        ctx.fillStyle = '#f8fafc'; // White sneakers
        ctx.fillRect(-11, 24 + bob - legSwing, 10, 5);
        ctx.fillRect(1, 24 + bob + legSwing, 10, 5);
      } else {
        ctx.fillRect(-10, 8, 8, 16);
        ctx.fillRect(2, 8, 8, 16);
        ctx.fillStyle = '#f8fafc'; // White sneakers
        ctx.fillRect(-11, 24, 10, 5);
        ctx.fillRect(1, 24, 10, 5);
      }

      // 2. Torso (Faded light-blue T-shirt)
      ctx.fillStyle = '#0ea5e9'; // Cyan/Light-blue
      ctx.fillRect(-12, -20 + bob, 24, 28);
      
      // "C" detail on shirt
      ctx.fillStyle = '#f8fafc';
      ctx.font = '8px Outfit';
      ctx.fillText("C", -3, -5 + bob);

      // 3. Head (Peach Skin + Brown hair)
      ctx.fillStyle = '#ffedd5'; // Peach skin
      ctx.fillRect(-8, -36 + bob, 16, 16);
      
      ctx.fillStyle = '#7c2d12'; // Brown hair
      ctx.fillRect(-9, -39 + bob, 18, 5);
      ctx.fillRect(-9, -36 + bob, 4, 10); // Sideburns

      // 4. Arms (Punches animations)
      ctx.fillStyle = '#0ea5e9'; // Sleeve
      ctx.strokeStyle = '#ffedd5'; // Skin fist
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';

      if (this.attackActiveTimer > 0) {
        if (this.comboStep === 1) {
          // Left Punch (Front arm extended)
          ctx.beginPath();
          ctx.moveTo(-4, -12 + bob);
          ctx.lineTo(24, -12 + bob); // Extended fist
          ctx.stroke();
        } else if (this.comboStep === 2) {
          // Right Punch (Back arm extended)
          ctx.beginPath();
          ctx.moveTo(-4, -5 + bob);
          ctx.lineTo(26, -5 + bob); // Extended fist
          ctx.stroke();
        } else if (this.comboStep === 3) {
          // Roundhouse Kick (Body rotated, leg extended horizontally)
          ctx.strokeStyle = '#1e40af'; // Blue denim kick leg
          ctx.beginPath();
          ctx.moveTo(0, 0 + bob);
          ctx.lineTo(28, -6 + bob); // Extended leg
          ctx.stroke();
          ctx.fillStyle = '#f8fafc'; // Sneaker tip
          ctx.fillRect(26, -9 + bob, 7, 5);
        }
      } else {
        // Normal arm hanging/swimming
        ctx.beginPath();
        ctx.moveTo(-6, -16 + bob);
        ctx.lineTo(-12, -2 + bob);
        ctx.stroke();
      }
    }

    ctx.restore();

    // Draw visual attack arcs
    if (this.attackActiveTimer > 0) {
      this.drawAttackArc(ctx, cameraX);
    }
  }

  private drawSlide(ctx: CanvasRenderingContext2D) {
    // Slanted slide body (fast dashing animation)
    ctx.fillStyle = '#1e40af'; // Jeans
    ctx.fillRect(-22, 10, 36, 12);
    ctx.fillStyle = '#0ea5e9'; // Torso tilted
    ctx.fillRect(-10, -5, 24, 15);
    ctx.fillStyle = '#ffedd5'; // Head
    ctx.fillRect(8, -12, 12, 12);
    ctx.fillStyle = '#7c2d12'; // Hair
    ctx.fillRect(6, -14, 14, 4);

    // Dust smoke trail back of slide
    ctx.fillStyle = 'rgba(226, 232, 240, 0.6)';
    ctx.beginPath();
    ctx.arc(-26, 16, 8, 0, Math.PI * 2);
    ctx.arc(-36, 18, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawDead(ctx: CanvasRenderingContext2D, cameraX: number) {
    ctx.save();
    ctx.translate(this.x + this.width / 2 - cameraX, this.y + this.height - 10);
    // Render lying down flat
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(-12, -20, 24, 28); // Torso
    ctx.fillStyle = '#ffedd5';
    ctx.fillRect(-8, -36, 16, 16); // Head
    ctx.fillStyle = '#7c2d12';
    ctx.fillRect(-9, -39, 18, 5); // Hair
    ctx.fillStyle = '#1e40af';
    ctx.fillRect(-10, 8, 8, 12); // Legs
    ctx.restore();
  }

  private drawAttackArc(ctx: CanvasRenderingContext2D, cameraX: number) {
    ctx.save();
    ctx.translate(-cameraX, 0);

    ctx.strokeStyle = this.comboStep === 3 ? 'rgba(6, 182, 212, 0.7)' : 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = this.comboStep === 3 ? 5 : 3;
    ctx.beginPath();

    const currentHeight = this.isCrouching ? this.height / 2 : this.height;
    const ax = this.facingRight ? this.x + this.width + 5 : this.x - 25;
    const ay = this.y + currentHeight / 2 - (this.comboStep === 3 ? 10 : 20);

    if (this.facingRight) {
      ctx.arc(ax, ay, this.comboStep === 3 ? 24 : 18, -Math.PI / 4, Math.PI / 4);
    } else {
      ctx.arc(ax + 20, ay, this.comboStep === 3 ? 24 : 18, Math.PI * 0.75, Math.PI * 1.25);
    }
    ctx.stroke();

    ctx.restore();
  }
}
