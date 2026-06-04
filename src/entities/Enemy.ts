import { Drop } from './Drop';

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
      this.health = 10; // Low health (dies in 1 punch)
      this.maxHealth = 10;
      this.speed = 2;
      this.vy = 0;
    } else if (type === 'dog') {
      this.width = 40;
      this.height = 30;
      this.health = 30; // Medium health (requires a full PPK combo)
      this.maxHealth = 30;
      this.speed = 1.5;
    } else if (type === 'lawnmower') {
      this.width = 45;
      this.height = 30;
      this.health = 1; // 1 hit once vulnerable
      this.maxHealth = 1;
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

  update(playerX: number, playerY: number, platforms: { x: number; y: number; w: number; h: number; type: string }[], tick: number) {
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
          if (p.type === 'obstacle' || p.type === 'box') {
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

    // Body (slate gray)
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head (dark blue-gray)
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(8, -6, 6, 0, Math.PI * 2);
    ctx.fill();

    // Beak (yellow)
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(13, -8);
    ctx.lineTo(19, -6);
    ctx.lineTo(13, -4);
    ctx.closePath();
    ctx.fill();

    // Wing (animating up and down)
    const wingAngle = Math.sin(tick * 0.4) * 0.7;
    ctx.fillStyle = '#334155';
    ctx.save();
    ctx.translate(-3, -2);
    ctx.rotate(wingAngle);
    ctx.beginPath();
    ctx.ellipse(0, -4, 8, 4, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  private drawDog(ctx: CanvasRenderingContext2D, tick: number) {
    ctx.save();
    ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
    if (!this.facingRight) ctx.scale(-1, 1);

    const isRunning = this.state === 'chase';
    const bob = isRunning ? Math.sin(tick * 0.4) * 2 : Math.sin(tick * 0.1) * 0.5;

    // Tail (wagging if chasing)
    const tailWag = isRunning ? Math.sin(tick * 0.6) * 0.5 : -0.2;
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = 3;
    ctx.save();
    ctx.translate(-15, -5 + bob);
    ctx.rotate(tailWag);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-8, -10, -12, -8);
    ctx.stroke();
    ctx.restore();

    // Body (brown dog)
    ctx.fillStyle = '#a16207'; // Medium brown
    ctx.fillRect(-16, -10 + bob, 30, 18);

    // Legs
    ctx.fillStyle = '#78350f'; // Dark brown legs
    if (isRunning) {
      const legCycle = Math.sin(tick * 0.3) * 8;
      ctx.fillRect(-12, 8 + bob, 4, 8 - legCycle);
      ctx.fillRect(8, 8 + bob, 4, 8 + legCycle);
    } else {
      ctx.fillRect(-12, 8 + bob, 4, 8);
      ctx.fillRect(8, 8 + bob, 4, 8);
    }

    // Head
    ctx.fillStyle = '#a16207';
    ctx.fillRect(8, -18 + bob, 14, 14);

    // Snout
    ctx.fillStyle = '#78350f';
    ctx.fillRect(20, -12 + bob, 6, 6);

    // Ear (floppy black/dark brown ear)
    ctx.fillStyle = '#451a03';
    ctx.fillRect(6, -18 + bob, 4, 10);

    ctx.restore();
  }

  private drawLawnmower(ctx: CanvasRenderingContext2D, tick: number) {
    ctx.save();
    ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
    if (!this.facingRight) ctx.scale(-1, 1);

    const isStunned = this.state === 'crash_stun';
    
    // Shaking if stunned (sparks)
    const shakeX = isStunned ? (Math.random() - 0.5) * 3 : 0;
    const shakeY = isStunned ? (Math.random() - 0.5) * 3 : 0;

    // Smoke/sparks effect
    if (isStunned && tick % 8 === 0) {
      // Render small yellow star spark
      ctx.fillStyle = '#eab308';
      ctx.fillRect(shakeX - 10, -25 + shakeY, 3, 3);
      ctx.fillRect(shakeX + 5, -20 + shakeY, 2, 2);
    }

    // Main metal body (bright red)
    ctx.fillStyle = isStunned ? '#b91c1c' : '#ef4444';
    ctx.fillRect(-20 + shakeX, -10 + shakeY, 40, 16);

    // Wheels
    ctx.fillStyle = '#334155'; // Dark wheels
    ctx.beginPath();
    ctx.arc(-13 + shakeX, 8 + shakeY, 6, 0, Math.PI * 2);
    ctx.arc(13 + shakeX, 8 + shakeY, 6, 0, Math.PI * 2);
    ctx.fill();

    // Wheel hubs (gray)
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(-13 + shakeX, 8 + shakeY, 2, 0, Math.PI * 2);
    ctx.arc(13 + shakeX, 8 + shakeY, 2, 0, Math.PI * 2);
    ctx.fill();

    // Engine top block (black/metal)
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-12 + shakeX, -18 + shakeY, 24, 8);

    // Handle (metal rod)
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-18 + shakeX, -8 + shakeY);
    ctx.lineTo(-32 + shakeX, -24 + shakeY);
    ctx.stroke();

    ctx.restore();
  }

  private drawOfficerBob(ctx: CanvasRenderingContext2D, tick: number) {
    ctx.save();
    ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
    if (!this.facingRight) ctx.scale(-1, 1);

    // Segway base wheel (spinning effect)
    ctx.fillStyle = '#1e293b'; // Black tires
    ctx.beginPath();
    ctx.ellipse(0, 30, 20, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Segway hubcaps (blue/silver)
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.ellipse(0, 30, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Segway post/handlebars
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(8, 30);
    ctx.lineTo(8, -10);
    ctx.stroke();

    // Officer body (Blue uniform)
    ctx.fillStyle = '#1e3a8a'; // Police blue
    ctx.fillRect(-10, -25, 20, 35);

    // Officer arms on handlebars
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(-2, -18, 12, 6);

    // Officer Head (Peach skin)
    ctx.fillStyle = '#ffedd5';
    ctx.fillRect(-7, -39, 14, 14);

    // Sunglasses
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, -35, 8, 4);

    // Police Cap (Blue and gold badge)
    ctx.fillStyle = '#172554'; // Dark police navy
    ctx.fillRect(-9, -43, 18, 5);
    ctx.fillStyle = '#fbbf24'; // Golden badge
    ctx.fillRect(4, -42, 3, 3);

    // Flashing siren light on Segway (orange/red/blue)
    const flashColor = Math.floor(tick / 5) % 2 === 0 ? '#3b82f6' : '#ef4444';
    ctx.fillStyle = flashColor;
    ctx.beginPath();
    ctx.arc(-8, -10, 5, 0, Math.PI * 2);
    ctx.fill();

    // Siren beam lines
    ctx.strokeStyle = flashColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, -10);
    ctx.lineTo(-20, -18);
    ctx.moveTo(-8, -10);
    ctx.lineTo(-20, -2);
    ctx.stroke();

    ctx.restore();
  }
}
