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
  state: 'patrol' | 'chase' | 'crash_stun' | 'dead' | 'swooping' = 'patrol';

  // Lawnmower crash tracking
  lawnmowerStunDuration: number = 180; // 3 seconds at 60fps

  // Patrol boundaries
  patrolMinX: number;
  patrolMaxX: number;

  // Boss specific properties
  bossStateTimer: number = 0;
  bossPhase: 'charge' | 'shoot' | 'idle' = 'idle';

  groundY: number = 480;

  constructor(x: number, y: number, type: EnemyType, patrolWidth: number = 200) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.vx = 0;
    this.vy = 0;
    this.groundY = 480;

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

  swoopUp() {
    if (this.type === 'pigeon' && this.state !== 'swooping') {
      this.state = 'swooping';
      this.vy = -6;
    }
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

    // Find ground Y under enemy
    let underY = 480;
    for (const p of platforms) {
      if (
        p.type === 'ground' ||
        p.type === 'obstacle' ||
        (p.type === 'trashcan' && !p.broken) ||
        (p.type === 'box' && !p.broken) ||
        (p.type === 'gate' && !p.broken)
      ) {
        if (this.x + this.width > p.x && this.x < p.x + p.w) {
          if (p.y >= this.y + this.height - 4 && p.y < underY) {
            underY = p.y;
          }
        }
      }
    }
    this.groundY = underY;

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
      if (this.state === 'swooping') {
        this.vy += 0.2; // Gravity
        this.y += this.vy;
        this.x += this.vx;
        if (this.y >= this.groundY - 35 && this.vy > 0) {
          this.y = this.groundY - 35;
          this.state = 'chase';
        }
        return;
      }

      // Ground-charging Pigeon AI: hover 35px above current ground
      this.y = (this.groundY - 35) + Math.sin(tick * 0.15) * 4;
      this.vy = 0;

      if (this.state === 'patrol') {
        if (this.vx === 0) this.vx = this.facingRight ? this.speed : -this.speed;
        
        // Simple back and forth patrol
        if (this.x > this.patrolMaxX) {
          this.vx = -this.speed;
          this.facingRight = false;
        } else if (this.x < this.patrolMinX) {
          this.vx = this.speed;
          this.facingRight = true;
        }

        // Trigger horizontal charge
        if (distToPlayer < 220) {
          this.state = 'chase';
        }
      } else if (this.state === 'chase') {
        // Charge horizontally at player
        this.vx = playerX > this.x ? this.speed * 2.5 : -this.speed * 2.5;
        this.facingRight = this.vx > 0;

        // Lose interest if too far
        if (distToPlayer > 300) {
          this.state = 'patrol';
          this.vx = this.facingRight ? this.speed : -this.speed;
        }
      }
      this.x += this.vx;

    } else if (this.type === 'dog') {
      // Dog AI: Patrols, chases if player is nearby, barks
      this.vy += 0.5; // Gravity
      this.y += this.vy;
      
      let isGrounded = false;
      if (this.y >= this.groundY - this.height) {
        this.y = this.groundY - this.height;
        this.vy = 0;
        isGrounded = true;
      }

      // Check for obstacles ahead
      const lookAheadX = this.facingRight ? this.x + this.width + 10 : this.x - 10;
      let obstacleAhead = false;
      for (const p of platforms) {
        if (p.type === 'obstacle' || (p.type === 'trashcan' && !p.broken)) {
          if (lookAheadX > p.x && lookAheadX < p.x + p.w) {
            if (p.y < this.y + this.height) {
              obstacleAhead = true;
              break;
            }
          }
        }
      }

      if (obstacleAhead && isGrounded && Math.abs(this.vx) > 0) {
        this.vy = -10; // Jump!
      }

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

    // --- Draw Ground Shadow ---
    ctx.save();
    ctx.translate(this.x + this.width / 2 - cameraX, this.groundY);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    const heightDiff = Math.max(0, this.groundY - (this.y + this.height));
    const shadowScale = Math.max(0.3, 1 - heightDiff / 250);
    const shadowWidth = Math.floor(this.width * 1.1 * shadowScale);
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
    const gridSize = 4;
    const setColor = (color: string) => {
      ctx.fillStyle = isOutline ? '#0f172a' : color;
    };
    const drawRect = (color: string, rx: number, ry: number, rw: number, rh: number) => {
      setColor(color);
      const x = Math.floor(rx / gridSize) * gridSize;
      const y = Math.floor(ry / gridSize) * gridSize;
      const w = Math.ceil(rw / gridSize) * gridSize;
      const h = Math.ceil(rh / gridSize) * gridSize;
      ctx.fillRect(x, y, w, h);
    };

    // Body
    drawRect('#64748b', -12, -8, 22, 15);
    drawRect('#1e293b', -12, 3, 22, 4); // Deeper slate shading on belly

    // Iridescent Neck (gritty city pigeon style!)
    drawRect('#14b8a6', 0, -10, 8, 6); // Teal neck sheen
    drawRect('#8b5cf6', 2, -7, 6, 4); // Purple neck sheen

    // Head
    drawRect('#475569', 4, -14, 12, 10);
    drawRect('#64748b', 6, -14, 8, 3); // head highlight

    // Beak
    drawRect('#fbbf24', 16, -11, 4, 3);

    // Eye
    if (!isOutline) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(11, -11, 2, 2);
      ctx.fillStyle = '#ef4444'; // Angry red pupil!
      ctx.fillRect(12, -11, 1, 1);
    }

    // Wings (Animates flapping)
    const wingOffset = Math.sin(tick * 0.45) > 0 ? -3 : 3;
    drawRect('#334155', -8, -5 + wingOffset, 12, 8); // Wing base
    drawRect('#1e293b', -6, -2 + wingOffset, 8, 3); // Wing shadow/feather stripe

    // Claws
    drawRect('#f97316', -8, 7, 3, 4);
    drawRect('#f97316', 2, 7, 3, 4);

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
    const gridSize = 4;
    const setColor = (color: string) => {
      ctx.fillStyle = isOutline ? '#0f172a' : color;
    };
    const drawRect = (color: string, rx: number, ry: number, rw: number, rh: number) => {
      setColor(color);
      const x = Math.floor(rx / gridSize) * gridSize;
      const y = Math.floor(ry / gridSize) * gridSize;
      const w = Math.ceil(rw / gridSize) * gridSize;
      const h = Math.ceil(rh / gridSize) * gridSize;
      ctx.fillRect(x, y, w, h);
    };

    const isRunning = this.state === 'chase';
    const bob = isRunning ? Math.floor(Math.sin(tick * 0.45) * 2) : 0;

    // Tail (blocky brawler tail wag)
    const tailYOffset = isRunning && Math.floor(tick / 5) % 2 === 0 ? -6 : -2;
    drawRect('#78350f', -18, -8 + bob + tailYOffset, 4, 8);
    drawRect('#a16207', -17, -6 + bob + tailYOffset, 2, 4);

    // Body
    drawRect('#a16207', -14, -10 + bob, 26, 18);
    drawRect('#451a03', -14, 2 + bob, 26, 6); // Deeper dark brown shadow on belly
    drawRect('#d97706', -12, -10 + bob, 20, 3); // back highlight

    // Spike Collar (gritty street dog!)
    drawRect('#475569', 5, -12 + bob, 4, 14);
    if (!isOutline) {
      ctx.fillStyle = '#ffffff'; // White spikes
      ctx.fillRect(6, -10 + bob, 2, 2);
      ctx.fillRect(6, -2 + bob, 2, 2);
    }

    // Legs (swings when running)
    const step = Math.floor(tick / 6) % 2;
    const leg1H = isRunning ? (step === 0 ? 8 : 4) : 8;
    const leg2H = isRunning ? (step === 1 ? 8 : 4) : 8;

    drawRect('#78350f', -10, 8 + bob, 4, leg1H); // Rear back leg
    drawRect('#a16207', -8, 8 + bob, 3, leg1H - 1);
    drawRect('#78350f', 4, 8 + bob, 4, leg2H); // Front leg
    drawRect('#a16207', 6, 8 + bob, 3, leg2H - 1);

    // Head
    drawRect('#a16207', 8, -18 + bob, 12, 12);
    drawRect('#d97706', 10, -18 + bob, 8, 3); // Head top highlight

    // Glowing red eye for stray dog
    if (!isOutline) {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(15, -14 + bob, 2, 2);
      ctx.fillStyle = '#ffffff'; // glare
      ctx.fillRect(16, -14 + bob, 1, 1);
    }

    // Snout / Jaws (fierce bulldog underbite)
    drawRect('#78350f', 18, -12 + bob, 6, 6);
    drawRect('#451a03', 19, -8 + bob, 5, 2); // open growling mouth line
    if (!isOutline) {
      ctx.fillStyle = '#ffffff'; // white fang
      ctx.fillRect(21, -9 + bob, 1, 1);
    }

    // Ears (folded dark ears)
    drawRect('#451a03', 6, -19 + bob, 4, 8);

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
    const gridSize = 4;
    const setColor = (color: string) => {
      ctx.fillStyle = isOutline ? '#0f172a' : color;
    };
    const drawRect = (color: string, rx: number, ry: number, rw: number, rh: number) => {
      setColor(color);
      const x = Math.floor(rx / gridSize) * gridSize;
      const y = Math.floor(ry / gridSize) * gridSize;
      const w = Math.ceil(rw / gridSize) * gridSize;
      const h = Math.ceil(rh / gridSize) * gridSize;
      ctx.fillRect(x, y, w, h);
    };

    const isStunned = this.state === 'crash_stun';
    const shakeX = isStunned ? Math.floor((Math.random() - 0.5) * 4) : 0;
    const shakeY = isStunned ? Math.floor((Math.random() - 0.5) * 4) : 0;

    // Body / Legs (standing suit pants with crease shading)
    drawRect('#0f172a', -8 + shakeX, 10 + shakeY, 16, 20); // Darker suit base
    drawRect('#020617', -2 + shakeX, 10 + shakeY, 2, 20); // Near-black crease shadow

    // Shaded Combat Shoes
    drawRect('#020617', -11 + shakeX, 26 + shakeY, 7, 4);
    drawRect('#1e293b', -11 + shakeX, 26 + shakeY, 7, 1); // toe highlight
    drawRect('#020617', 4 + shakeX, 26 + shakeY, 7, 4);
    drawRect('#1e293b', 4 + shakeX, 26 + shakeY, 7, 1);

    // Torso (Light blue dress shirt + Neon HOA vest with reflective stripes)
    drawRect('#0284c7', -10 + shakeX, -15 + shakeY, 20, 25); // Richer sky blue shirt
    drawRect('#0369a1', -10 + shakeX, 0 + shakeY, 20, 10); // Shirt shadow under vest
    
    // Neon Orange Vest
    drawRect('#ea580c', -10 + shakeX, -15 + shakeY, 5, 25);
    drawRect('#ea580c', 5 + shakeX, -15 + shakeY, 5, 25);
    drawRect('#ea580c', -5 + shakeX, 5 + shakeY, 10, 5);

    // Reflective Lime-Green Stripes
    drawRect('#84cc16', -9 + shakeX, -8 + shakeY, 3, 3);
    drawRect('#84cc16', 6 + shakeX, -8 + shakeY, 3, 3);
    drawRect('#84cc16', -5 + shakeX, 6 + shakeY, 10, 2);

    // Head
    drawRect('#ffedd5', -7 + shakeX, -29 + shakeY, 14, 14);
    drawRect('#ffcc99', -7 + shakeX, -19 + shakeY, 14, 4); // chin shadow

    // Hair / Glasses
    drawRect('#78350f', -8 + shakeX, -32 + shakeY, 16, 5); // Brown hair
    drawRect('#451a03', -8 + shakeX, -32 + shakeY, 3, 7); // sideburns shadow
    
    // Angry sunglasses
    drawRect('#000000', 0 + shakeX, -26 + shakeY, 7, 4);
    if (!isOutline) {
      ctx.fillStyle = '#fbbf24'; // Golden glass reflection
      ctx.fillRect(4 + shakeX, -25 + shakeY, 2, 2);
    }

    // Clipboard Shield (The central guard item)
    ctx.save();
    if (isStunned) {
      ctx.translate(5 + shakeX, 5 + shakeY);
      ctx.rotate(0.6); // tilted down
      
      // Clipboard wooden board
      drawRect('#a16207', 0, -10, 10, 16);
      drawRect('#78350f', 8, -10, 2, 16); // shadow
      
      // Violation citation paper on clip
      drawRect('#f8fafc', 2, -6, 6, 11);
      if (!isOutline) {
        ctx.fillStyle = '#ef4444'; // Red stamp
        ctx.fillRect(3, 0, 4, 3);
      }

      // Metal clip
      drawRect('#94a3b8', 3, -12, 4, 3);
    } else {
      // Waving hand/clipboard in front of body to block attacks
      const wave = Math.sin(tick * 0.1) * 2;
      
      // Clipboard wooden board
      drawRect('#a16207', 5 + shakeX, -10 + shakeY + wave, 10, 20);
      drawRect('#78350f', 13 + shakeX, -10 + shakeY + wave, 2, 20); // shadow
      
      // Citation paper
      drawRect('#f8fafc', 7 + shakeX, -6 + shakeY + wave, 6, 14);
      if (!isOutline) {
        ctx.fillStyle = '#ef4444'; // Red stamp
        ctx.fillRect(8 + shakeX, 2 + shakeY + wave, 4, 3);
      }

      // Metal clip
      drawRect('#94a3b8', 8 + shakeX, -13 + shakeY + wave, 4, 4);
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
    const gridSize = 4;
    const setColor = (color: string) => {
      ctx.fillStyle = isOutline ? '#0f172a' : color;
    };
    const drawRect = (color: string, rx: number, ry: number, rw: number, rh: number) => {
      setColor(color);
      const x = Math.floor(rx / gridSize) * gridSize;
      const y = Math.floor(ry / gridSize) * gridSize;
      const w = Math.ceil(rw / gridSize) * gridSize;
      const h = Math.ceil(rh / gridSize) * gridSize;
      ctx.fillRect(x, y, w, h);
    };

    // 1. Segway base wheel & mudguard
    drawRect('#020617', -22, 24, 44, 12); // Big tire outline
    drawRect('#475569', -14, 27, 28, 6); // Metallic rim
    drawRect('#0f172a', -6, 29, 12, 2); // Hubcap

    // Mudguard
    drawRect('#334155', -24, 18, 48, 6);
    drawRect('#0f172a', -24, 20, 48, 4); // Mudguard shadow

    // Segway post/steering column
    drawRect('#334155', 8, -15, 5, 36);
    drawRect('#0f172a', 8, -15, 2, 36); // column shadow
    drawRect('#020617', 4, -18, 12, 4); // handlebars base

    // 2. Officer body (Deep blue uniform)
    drawRect('#172554', -12, -26, 24, 44); // Torso
    drawRect('#0f172a', -12, -26, 5, 44); // back shadow
    
    // Gold Epaulets on shoulders
    drawRect('#eab308', -13, -27, 6, 3);
    drawRect('#eab308', 7, -27, 6, 3);

    // Officer buttons/badge
    if (!isOutline) {
      ctx.fillStyle = '#fbbf24'; // Gold star badge
      ctx.fillRect(-4, -18, 4, 4);
      ctx.fillStyle = '#eab308'; // Buttons
      ctx.fillRect(-2, -10, 2, 2);
      ctx.fillRect(-2, -2, 2, 2);
    }

    // Officer arms (Holding handlebars)
    drawRect('#172554', -2, -22, 14, 8); // Arm sleeve
    drawRect('#f8fafc', 8, -20, 6, 6); // White police gloves!

    // 3. Officer Head
    drawRect('#ffedd5', -8, -40, 16, 15);
    drawRect('#ffcc99', -8, -29, 16, 4); // chin shadow

    // Sunglasses (Aviator shades)
    drawRect('#000000', 0, -36, 9, 5);
    if (!isOutline) {
      ctx.fillStyle = '#fbbf24'; // Gold rim bridge
      ctx.fillRect(3, -36, 3, 2);
      ctx.fillStyle = '#ffffff'; // glare dot
      ctx.fillRect(6, -34, 1, 1);
    }

    // Chevron Mustache
    drawRect('#451a03', 0, -31, 8, 3);

    // Police Cap
    drawRect('#172554', -10, -44, 20, 5); // cap base
    drawRect('#0f172a', -2, -41, 13, 2); // visor rim
    drawRect('#fbbf24', 4, -43, 3, 3); // gold cap badge

    // 4. Flashing siren light on Segway mudguard (orange/red/blue block)
    const flashColor = Math.floor(tick / 5) % 2 === 0 ? '#3b82f6' : '#ef4444';
    drawRect(flashColor, -16, 10, 10, 8);
    drawRect('#ffffff', -14, 10, 6, 2); // siren inner glow

    // Siren beam lines (translucent shapes, skip on outline)
    if (!isOutline) {
      ctx.fillStyle = flashColor === '#3b82f6' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(239, 68, 68, 0.25)';
      ctx.beginPath();
      ctx.moveTo(-11, 14);
      ctx.lineTo(-45, -10);
      ctx.lineTo(-45, 30);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = originalFillStyle;
  }
}
