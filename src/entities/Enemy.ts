import { Drop } from './Drop';
import { Platform } from '../engine/Level';

export type EnemyType = 'pigeon' | 'dog' | 'lawnmower' | 'officer_bob';

export class Enemy {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  type: EnemyType;
  
  health: number;
  maxHealth: number;
  speed: number;
  
  isStunned: boolean = false;
  stunTimer: number = 0;
  flashTimer: number = 0; // Turns white when > 0
  facingRight: boolean = false;
  state: 'patrol' | 'chase' | 'crash_stun' | 'dead' = 'patrol';

  // Lawnmower crash tracking
  lawnmowerStunDuration: number = 180; // 3 seconds at 60fps

  // Patrol boundaries
  patrolMinX: number;
  patrolMaxX: number;

  // Boss specific properties
  bossStateTimer: number = 0;
  bossPhase: 'charge' | 'shoot' | 'idle' = 'idle';

  constructor(x: number, y: number, type: EnemyType, patrolWidth: number = 200) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.vx = 0;
    this.vy = 0;

    this.patrolMinX = x - patrolWidth / 2;
    this.patrolMaxX = x + patrolWidth / 2;

    // Apply specific parameters per type
    if (type === 'pigeon') {
      this.width = 24;
      this.height = 20;
      this.health = 20; // 2 hits
      this.maxHealth = 20;
      this.speed = 2;
      this.vy = 0;
    } else if (type === 'dog') {
      this.width = 40;
      this.height = 30;
      this.health = 30; // 3 hits
      this.maxHealth = 30;
      this.speed = 1.5;
    } else if (type === 'lawnmower') {
      this.width = 45;
      this.height = 30;
      this.health = 60; // 6 hits once vulnerable
      this.maxHealth = 60;
      this.speed = 2.5;
      this.vx = this.speed;
    } else {
      // Officer Bob (Boss)
      this.width = 50;
      this.height = 80;
      this.health = 200; // Boss health
      this.maxHealth = 200;
      this.speed = 3;
      this.state = 'patrol';
    }
  }

  takeDamage(amount: number, knockbackX: number, playerX: number): Drop[] | null {
    if (this.state === 'dead') return null;

    // Lawnmower is immune unless it's in crashed stun state!
    if (this.type === 'lawnmower' && this.state !== 'crash_stun') {
      // Sparks bounce off
      return null;
    }

    this.health -= amount;
    this.flashTimer = 8; // Flash white for 8 frames
    
    // Apply hit stun
    this.isStunned = true;
    this.stunTimer = 15; // Stun for 15 frames

    // Knockback
    this.vx = knockbackX;
    
    // Face the player
    this.facingRight = playerX > this.x;

    if (this.health <= 0) {
      this.state = 'dead';
      return this.spawnDrops();
    }
    return null;
  }

  private spawnDrops(): Drop[] {
    const drops: Drop[] = [];
    const coinCount = this.type === 'officer_bob' ? 20 : (this.type === 'dog' ? 4 : (this.type === 'lawnmower' ? 6 : 2));
    const xpCount = this.type === 'officer_bob' ? 15 : (this.type === 'dog' ? 3 : (this.type === 'lawnmower' ? 4 : 2));

    for (let i = 0; i < coinCount; i++) {
      drops.push(new Drop(this.x + this.width / 2, this.y + this.height / 2, 'coin', 10));
    }
    for (let i = 0; i < xpCount; i++) {
      drops.push(new Drop(this.x + this.width / 2, this.y + this.height / 2, 'xp', 15));
    }
    return drops;
  }

  update(playerX: number, playerY: number, platforms: Platform[], tick: number) {
    if (this.state === 'dead') return;

    // Flash timer tick
    if (this.flashTimer > 0) this.flashTimer--;

    // Stun timer tick
    if (this.isStunned) {
      this.stunTimer--;
      if (this.stunTimer <= 0) {
        this.isStunned = false;
      }
      // Apply friction to knockback velocity
      this.vx *= 0.85;
      this.x += this.vx;
      return;
    }

    const distToPlayer = Math.abs(playerX - this.x);

    // AI Logic by Type
    if (this.type === 'pigeon') {
      // Pigeon AI: Hover and dive when player is close
      if (this.state === 'patrol') {
        this.vy = Math.sin(tick * 0.08) * 0.5; // Slight hover drift
        
        // Patrol back and forth
        if (this.vx === 0) this.vx = this.speed;
        if (this.x > this.patrolMaxX) {
          this.vx = -this.speed;
          this.facingRight = false;
        } else if (this.x < this.patrolMinX) {
          this.vx = this.speed;
          this.facingRight = true;
        }

        // Dive trigger
        if (distToPlayer < 200 && playerY > this.y && Math.random() < 0.02) {
          this.state = 'chase'; // Dive state
          // Calculate dive vector
          const dx = playerX - this.x;
          const dy = playerY - this.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          this.vx = (dx / dist) * 5;
          this.vy = (dy / dist) * 5;
          this.facingRight = this.vx > 0;
        }
      } else if (this.state === 'chase') {
        // Diving physics
        this.x += this.vx;
        this.y += this.vy;

        // Reset to patrol if it hits the ground boundary or goes too far
        if (this.y >= 460) {
          this.y = 460;
          this.state = 'patrol';
          this.vx = this.facingRight ? this.speed : -this.speed;
          this.vy = -3; // Fly back up
        }
      }
      this.x += this.vx;
      this.y += this.vy;

      // Keep height bound
      if (this.y < 150) this.y = 150;
      if (this.y > 470) this.y = 470;

    } else if (this.type === 'dog') {
      // Dog AI: Patrols, chases if player is nearby, barks
      if (this.state === 'patrol') {
        if (this.vx === 0) this.vx = this.speed;
        
        // Simple back and forth patrol
        if (this.x > this.patrolMaxX) {
          this.vx = -this.speed;
          this.facingRight = false;
        } else if (this.x < this.patrolMinX) {
          this.vx = this.speed;
          this.facingRight = true;
        }

        // Trigger chase
        if (distToPlayer < 200 && Math.abs(playerY - this.y) < 50) {
          this.state = 'chase';
        }
      } else if (this.state === 'chase') {
        // Charge toward player
        this.vx = playerX > this.x ? this.speed * 2 : -this.speed * 2;
        this.facingRight = this.vx > 0;

        // Lose interest if too far
        if (distToPlayer > 300) {
          this.state = 'patrol';
          this.vx = this.facingRight ? this.speed : -this.speed;
        }
      }

      this.x += this.vx;

    } else if (this.type === 'lawnmower') {
      // Lawnmower AI: Patrols fast, hits obstacle -> crashes and gets stunned
      if (this.state === 'patrol') {
        // Move forward
        this.x += this.vx;

        // Check if hit any obstacle in level
        for (const p of platforms) {
          if (p.type === 'obstacle' || (p.type === 'box' && !p.broken)) {
            const hitLeft = this.x + this.width >= p.x && this.x + this.width <= p.x + 10;
            const hitRight = this.x <= p.x + p.w && this.x >= p.x + p.w - 10;
            const checkY = this.y + this.height > p.y && this.y < p.y + p.h;

            if (checkY && (hitLeft || hitRight)) {
              // CRASH!
              this.state = 'crash_stun';
              this.vx = 0;
              this.stunTimer = this.lawnmowerStunDuration;
              break;
            }
          }
        }
      } else if (this.state === 'crash_stun') {
        // Stunned on crash
        this.stunTimer--;
        if (this.stunTimer <= 0) {
          this.state = 'patrol';
          // Reverse direction
          this.facingRight = !this.facingRight;
          this.vx = this.facingRight ? this.speed : -this.speed;
        }
      }

    } else if (this.type === 'officer_bob') {
      // Boss Officer Bob AI state machine
      this.bossStateTimer--;
      
      if (this.bossStateTimer <= 0) {
        // Swap phases
        const rand = Math.random();
        if (rand < 0.4) {
          this.bossPhase = 'charge';
          this.bossStateTimer = 120; // 2 seconds
          this.vx = playerX > this.x ? this.speed * 2.5 : -this.speed * 2.5;
          this.facingRight = this.vx > 0;
        } else if (rand < 0.8) {
          this.bossPhase = 'shoot';
          this.bossStateTimer = 90; // 1.5 seconds
          this.vx = 0;
        } else {
          this.bossPhase = 'idle';
          this.bossStateTimer = 60; // 1 second
          this.vx = 0;
        }
      }

      if (this.bossPhase === 'charge') {
        // Charge back and forth
        this.x += this.vx;
        // Keep in arena limits around the gate (2500 - 3080)
        if (this.x < 2400) {
          this.x = 2400;
          this.vx = -this.vx;
          this.facingRight = true;
        } else if (this.x > 3050) {
          this.x = 3050;
          this.vx = -this.vx;
          this.facingRight = false;
        }
      } else if (this.bossPhase === 'shoot') {
        this.facingRight = playerX > this.x;
        // Projectiles are spawned by game engine checking this phase!
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, cameraX: number, tick: number) {
    if (this.state === 'dead') return;

    ctx.save();
    ctx.translate(-cameraX, 0);

    // Apply flash effect (render as pure white silhouette)
    if (this.flashTimer > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(this.x, this.y, this.width, this.height);
      ctx.restore();
      return;
    }

    if (this.type === 'pigeon') {
      this.drawPigeon(ctx, tick);
    } else if (this.type === 'dog') {
      this.drawDog(ctx, tick);
    } else if (this.type === 'lawnmower') {
      this.drawLawnmower(ctx, tick);
    } else if (this.type === 'officer_bob') {
      this.drawOfficerBob(ctx, tick);
    }

    ctx.restore();
  }

  private drawPigeon(ctx: CanvasRenderingContext2D, tick: number) {
    ctx.save();
    ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
    if (!this.facingRight) ctx.scale(-1, 1);

    const outlineOffsets = [[-2, 0], [2, 0], [0, -2], [0, 2]];
    for (const [ox, oy] of outlineOffsets) {
      ctx.save();
      ctx.translate(ox, oy);
      this.drawPigeonShape(ctx, tick, true);
      ctx.restore();
    }

    this.drawPigeonShape(ctx, tick, false);
    ctx.restore();
  }

  private drawPigeonShape(ctx: CanvasRenderingContext2D, tick: number, isOutline: boolean) {
    const originalFillStyle = ctx.fillStyle;
    const setColor = (color: string) => {
      ctx.fillStyle = isOutline ? '#0f172a' : color;
    };

    // Body (slate gray block)
    setColor('#64748b');
    ctx.fillRect(-12, -8, 22, 15);

    // Dark shading
    setColor('#475569');
    ctx.fillRect(-12, 3, 22, 4);

    // Head (dark blue-gray block)
    setColor('#475569');
    ctx.fillRect(6, -14, 10, 10);

    // Beak (yellow rect)
    setColor('#fbbf24');
    ctx.fillRect(16, -11, 4, 3);

    // Eye (pixel-art white/black dot)
    if (!isOutline) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(11, -12, 2, 2);
      ctx.fillStyle = '#000000';
      ctx.fillRect(12, -12, 1, 1);
    }

    // Wing (animating up and down using a block)
    const wingOffset = Math.sin(tick * 0.45) > 0 ? -2 : 2;
    setColor('#334155');
    ctx.fillRect(-6, -6 + wingOffset, 10, 8);

    ctx.fillStyle = originalFillStyle;
  }

  private drawDog(ctx: CanvasRenderingContext2D, tick: number) {
    ctx.save();
    ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
    if (!this.facingRight) ctx.scale(-1, 1);

    const outlineOffsets = [[-2, 0], [2, 0], [0, -2], [0, 2]];
    for (const [ox, oy] of outlineOffsets) {
      ctx.save();
      ctx.translate(ox, oy);
      this.drawDogShape(ctx, tick, true);
      ctx.restore();
    }

    this.drawDogShape(ctx, tick, false);
    ctx.restore();
  }

  private drawDogShape(ctx: CanvasRenderingContext2D, tick: number, isOutline: boolean) {
    const originalFillStyle = ctx.fillStyle;
    const setColor = (color: string) => {
      ctx.fillStyle = isOutline ? '#0f172a' : color;
    };

    const isRunning = this.state === 'chase';
    const bob = isRunning ? Math.floor(Math.sin(tick * 0.45) * 2) : 0;

    // Tail (blocky wagging)
    setColor('#854d0e');
    const tailYOffset = isRunning && Math.floor(tick / 5) % 2 === 0 ? -6 : -2;
    ctx.fillRect(-18, -8 + bob + tailYOffset, 4, 6);

    // Body (brown dog block)
    setColor('#a16207'); // Medium brown
    ctx.fillRect(-14, -10 + bob, 26, 18);

    // Legs (blocky swing)
    setColor('#78350f'); // Dark brown legs
    if (isRunning) {
      const step = Math.floor(tick / 6) % 2;
      ctx.fillRect(-10, 8 + bob, 4, step === 0 ? 8 : 4);
      ctx.fillRect(4, 8 + bob, 4, step === 1 ? 8 : 4);
    } else {
      ctx.fillRect(-10, 8 + bob, 4, 8);
      ctx.fillRect(4, 8 + bob, 4, 8);
    }

    // Head
    setColor('#a16207');
    ctx.fillRect(8, -18 + bob, 12, 12);

    // Glowing red eye for stray dog
    if (!isOutline) {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(15, -14 + bob, 2, 2);
    }

    // Snout
    setColor('#78350f');
    ctx.fillRect(18, -12 + bob, 6, 6);

    // Ear (floppy dark block)
    setColor('#451a03');
    ctx.fillRect(6, -18 + bob, 4, 8);

    ctx.fillStyle = originalFillStyle;
  }

  private drawLawnmower(ctx: CanvasRenderingContext2D, tick: number) {
    ctx.save();
    ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
    if (!this.facingRight) ctx.scale(-1, 1);

    const outlineOffsets = [[-2, 0], [2, 0], [0, -2], [0, 2]];
    for (const [ox, oy] of outlineOffsets) {
      ctx.save();
      ctx.translate(ox, oy);
      this.drawLawnmowerShape(ctx, tick, true);
      ctx.restore();
    }

    this.drawLawnmowerShape(ctx, tick, false);
    ctx.restore();
  }

  private drawLawnmowerShape(ctx: CanvasRenderingContext2D, tick: number, isOutline: boolean) {
    const originalFillStyle = ctx.fillStyle;
    const setColor = (color: string) => {
      ctx.fillStyle = isOutline ? '#0f172a' : color;
    };

    const isStunned = this.state === 'crash_stun';
    const shakeX = isStunned ? Math.floor((Math.random() - 0.5) * 4) : 0;
    const shakeY = isStunned ? Math.floor((Math.random() - 0.5) * 4) : 0;

    // Sparks (blocky, skip on outline)
    if (!isOutline && isStunned && tick % 8 === 0) {
      ctx.fillStyle = '#eab308';
      ctx.fillRect(shakeX - 12, -22 + shakeY, 4, 4);
      ctx.fillRect(shakeX + 8, -18 + shakeY, 3, 3);
    }

    // Main red body
    setColor(isStunned ? '#b91c1c' : '#ef4444');
    ctx.fillRect(-20 + shakeX, -10 + shakeY, 40, 16);

    // Shading
    setColor(isStunned ? '#7f1d1d' : '#991b1b');
    ctx.fillRect(-20 + shakeX, 2 + shakeY, 40, 4);

    // Wheels (square wheels!)
    setColor('#1e293b');
    ctx.fillRect(-16 + shakeX, 4 + shakeY, 8, 8);
    ctx.fillRect(8 + shakeX, 4 + shakeY, 8, 8);

    setColor('#cbd5e1'); // hubs
    ctx.fillRect(-14 + shakeX, 6 + shakeY, 4, 4);
    ctx.fillRect(10 + shakeX, 6 + shakeY, 4, 4);

    // Engine top block
    setColor('#334155');
    ctx.fillRect(-10 + shakeX, -18 + shakeY, 20, 8);

    // Handle (blocky line)
    setColor('#64748b');
    ctx.fillRect(-24 + shakeX, -18 + shakeY, 8, 3);
    ctx.fillRect(-30 + shakeX, -24 + shakeY, 8, 3);

    ctx.fillStyle = originalFillStyle;
  }

  private drawOfficerBob(ctx: CanvasRenderingContext2D, tick: number) {
    ctx.save();
    ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
    if (!this.facingRight) ctx.scale(-1, 1);

    const outlineOffsets = [[-2, 0], [2, 0], [0, -2], [0, 2]];
    for (const [ox, oy] of outlineOffsets) {
      ctx.save();
      ctx.translate(ox, oy);
      this.drawOfficerBobShape(ctx, tick, true);
      ctx.restore();
    }

    this.drawOfficerBobShape(ctx, tick, false);
    ctx.restore();
  }

  private drawOfficerBobShape(ctx: CanvasRenderingContext2D, tick: number, isOutline: boolean) {
    const originalFillStyle = ctx.fillStyle;
    const setColor = (color: string) => {
      ctx.fillStyle = isOutline ? '#0f172a' : color;
    };

    // Segway base wheel (blocky ellipse)
    setColor('#1e293b');
    ctx.fillRect(-20, 26, 40, 10);
    setColor('#475569');
    ctx.fillRect(-12, 28, 24, 6);

    // Segway post/handlebars (blocky)
    setColor('#475569');
    ctx.fillRect(6, -10, 4, 40);

    // Officer body (Blue uniform)
    setColor('#1e3a8a');
    ctx.fillRect(-10, -25, 20, 35);
    
    // Yellow buttons/badge
    if (!isOutline) {
      ctx.fillStyle = '#eab308';
      ctx.fillRect(-2, -18, 3, 3);
      ctx.fillRect(-2, -10, 3, 3);
    }

    // Officer arms
    setColor('#172554');
    ctx.fillRect(-2, -22, 12, 6);

    // Officer Head
    setColor('#ffedd5');
    ctx.fillRect(-7, -39, 14, 14);

    // Sunglasses (pixel-art shades)
    setColor('#000000');
    ctx.fillRect(0, -35, 8, 4);
    if (!isOutline) {
      // Golden bridge on glasses
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(3, -35, 2, 2);
    }

    // mustache block
    setColor('#451a03');
    ctx.fillRect(0, -30, 6, 2);

    // Police Cap
    setColor('#172554');
    ctx.fillRect(-9, -43, 18, 5);
    setColor('#fbbf24'); // gold badge
    ctx.fillRect(4, -42, 3, 3);

    // Flashing siren light on Segway (orange/red/blue block)
    const flashColor = Math.floor(tick / 5) % 2 === 0 ? '#3b82f6' : '#ef4444';
    setColor(flashColor);
    ctx.fillRect(-12, -14, 8, 8);

    // Siren beam lines (drawn as small square particles, skip on outline)
    if (!isOutline) {
      ctx.fillStyle = flashColor;
      ctx.fillRect(-20, -20, 3, 3);
      ctx.fillRect(-24, -16, 3, 3);
      ctx.fillRect(-20, -8, 3, 3);
    }

    ctx.fillStyle = originalFillStyle;
  }
}
