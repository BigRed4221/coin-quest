import { Drop } from './Drop';
import { Platform } from '../engine/Level';

export type EnemyType = 'pigeon' | 'dog' | 'inspector' | 'officer_bob';

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
    } else if (type === 'inspector') {
      this.width = 30;
      this.height = 60;
      this.health = 40; // 4 hits normally
      this.maxHealth = 40;
      this.speed = 1.2;
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

  takeDamage(amount: number, knockbackX: number, playerX: number, isKick: boolean = false): Drop[] | null {
    if (this.state === 'dead') return null;

    // HOA Inspector is immune to front attacks unless it's a guard break kick or it's in guard-broken state!
    if (this.type === 'inspector') {
      const isFront = this.facingRight ? (playerX > this.x) : (playerX < this.x);
      
      // If attacked from front, and not a Kick, and not in stun state, block it!
      if (isFront && !isKick && this.state !== 'crash_stun') {
        return null;
      }

      // If it is a Kick from front, and not in stun state, trigger guard break!
      if (isFront && isKick && this.state !== 'crash_stun') {
        this.state = 'crash_stun';
        this.bossStateTimer = 120; // 2 seconds stun duration
      }
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
    const coinCount = this.type === 'officer_bob' ? 20 : (this.type === 'dog' ? 4 : (this.type === 'inspector' ? 6 : 2));
    const xpCount = this.type === 'officer_bob' ? 15 : (this.type === 'dog' ? 3 : (this.type === 'inspector' ? 4 : 2));

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

        // Swoop down to ground-level height (Y = 420) and fly straight horizontally!
        if (this.y >= 420) {
          this.y = 420;
          this.vy = 0;
          if (this.vx === 0) {
            this.vx = this.facingRight ? this.speed * 2 : -this.speed * 2;
          }

          // Reverse direction at patrol boundaries
          if (this.x > this.patrolMaxX) {
            this.vx = -Math.abs(this.vx);
            this.facingRight = false;
          } else if (this.x < this.patrolMinX) {
            this.vx = Math.abs(this.vx);
            this.facingRight = true;
          }
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

    } else if (this.type === 'inspector') {
      // Inspector AI: Patrols back and forth, occasionally stopping to write/throw a citation ticket
      if (this.state === 'patrol') {
        if (this.vx === 0) this.vx = this.facingRight ? this.speed : -this.speed;
        this.x += this.vx;

        // Turn around at patrol boundaries
        if (this.x > this.patrolMaxX) {
          this.vx = -this.speed;
          this.facingRight = false;
        } else if (this.x < this.patrolMinX) {
          this.vx = this.speed;
          this.facingRight = true;
        }

        // Check if player is close to pause and throw a ticket
        const distToPlayer = Math.abs(playerX - this.x);
        if (distToPlayer < 250 && Math.abs(playerY - this.y) < 50 && Math.random() < 0.015) {
          this.state = 'chase'; // Pause to write a citation
          this.bossStateTimer = 45; // 45 frames pause
          this.vx = 0;
          this.facingRight = playerX > this.x; // Face the player
        }
      } else if (this.state === 'chase') {
        // Stop and write violation notice
        this.bossStateTimer--;
        if (this.bossStateTimer <= 0) {
          this.state = 'patrol';
          this.vx = this.facingRight ? this.speed : -this.speed;
        }
      } else if (this.state === 'crash_stun') {
        // Guard-broken stun state (reuses bossStateTimer)
        this.bossStateTimer--;
        if (this.bossStateTimer <= 0) {
          this.state = 'patrol';
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
        // Keep in arena limits around the gate (3050 - 3450)
        if (this.x < 3050) {
          this.x = 3050;
          this.vx = -this.vx;
          this.facingRight = true;
        } else if (this.x > 3450) {
          this.x = 3450;
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
    } else if (this.type === 'inspector') {
      this.drawInspector(ctx, tick);
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

  private drawInspector(ctx: CanvasRenderingContext2D, tick: number) {
    ctx.save();
    ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
    if (!this.facingRight) ctx.scale(-1, 1);

    const outlineOffsets = [[-2, 0], [2, 0], [0, -2], [0, 2]];
    for (const [ox, oy] of outlineOffsets) {
      ctx.save();
      ctx.translate(ox, oy);
      this.drawInspectorShape(ctx, tick, true);
      ctx.restore();
    }

    this.drawInspectorShape(ctx, tick, false);
    ctx.restore();
  }

  private drawInspectorShape(ctx: CanvasRenderingContext2D, tick: number, isOutline: boolean) {
    const originalFillStyle = ctx.fillStyle;
    const setColor = (color: string) => {
      ctx.fillStyle = isOutline ? '#0f172a' : color;
    };

    const isStunned = this.state === 'crash_stun';
    const shakeX = isStunned ? Math.floor((Math.random() - 0.5) * 4) : 0;
    const shakeY = isStunned ? Math.floor((Math.random() - 0.5) * 4) : 0;

    // Body / Legs (standing pants)
    setColor('#1e293b'); // Dark pants
    ctx.fillRect(-8 + shakeX, 10 + shakeY, 16, 20);

    // Shoes
    setColor('#0f172a');
    ctx.fillRect(-10 + shakeX, 26 + shakeY, 6, 4);
    ctx.fillRect(4 + shakeX, 26 + shakeY, 6, 4);

    // Torso (Light blue shirt + Neon HOA vest)
    setColor('#38bdf8'); // Sky blue shirt
    ctx.fillRect(-10 + shakeX, -15 + shakeY, 20, 25);
    
    // Neon Orange/Yellow Vest on top
    setColor('#f97316'); // Neon orange vest
    ctx.fillRect(-10 + shakeX, -15 + shakeY, 5, 25);
    ctx.fillRect(5 + shakeX, -15 + shakeY, 5, 25);
    ctx.fillRect(-5 + shakeX, 5 + shakeY, 10, 5);

    // Head
    setColor('#ffedd5'); // Skin tone
    ctx.fillRect(-7 + shakeX, -29 + shakeY, 14, 14);

    // Hair/Glasses
    setColor('#78350f'); // Brown hair
    ctx.fillRect(-8 + shakeX, -31 + shakeY, 16, 4);
    setColor('#475569'); // Glasses
    ctx.fillRect(1 + shakeX, -25 + shakeY, 6, 3);

    // Clipboard Shield (The central guard item)
    // If stunned, clipboard is lowered/tilted
    ctx.save();
    if (isStunned) {
      ctx.translate(5 + shakeX, 5 + shakeY);
      ctx.rotate(0.6); // tilted down
      
      setColor('#ca8a04'); // Cardboard brown clipboard
      ctx.fillRect(0, -10, 8, 14);
      setColor('#94a3b8'); // Metal clip
      ctx.fillRect(2, -12, 4, 3);
    } else {
      // Waving hand/clipboard in front of body to block attacks
      const wave = Math.sin(tick * 0.1) * 2;
      setColor('#ca8a04'); // Cardboard brown clipboard
      ctx.fillRect(5 + shakeX, -10 + shakeY + wave, 8, 18);
      setColor('#94a3b8'); // Metal clip
      ctx.fillRect(7 + shakeX, -13 + shakeY + wave, 4, 4);
    }
    ctx.restore();

    // Dizziness stars/sparks if stunned
    if (!isOutline && isStunned && tick % 8 === 0) {
      ctx.fillStyle = '#fde047'; // Yellow sparkles
      ctx.fillRect(shakeX - 10, -38 + shakeY, 3, 3);
      ctx.fillRect(shakeX + 8, -35 + shakeY, 2, 2);
    }

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
