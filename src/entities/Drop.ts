import { Platform } from '../engine/Level';

export class Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number = 6;
  type: 'coin' | 'xp';
  value: number;
  isCollected: boolean = false;
  isMagnetized: boolean = false;

  private gravity: number = 0.4;
  private friction: number = 0.98;
  private bounce: number = -0.55;
  private groundY: number = 480; // Default floor

  constructor(x: number, y: number, type: 'coin' | 'xp', value: number) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.value = value;

    // Spawn with a random upward explosion velocity
    this.vx = (Math.random() - 0.5) * 6;
    this.vy = -Math.random() * 5 - 4;
  }

  update(playerX: number, playerY: number, platforms: Platform[]) {
    if (this.isCollected) return;

    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Magnetic pull if player is close (150px range)
    if (distance < 150) {
      this.isMagnetized = true;
    }

    if (this.isMagnetized) {
      // Direct pull toward player, accelerating as it gets closer
      const speed = 7;
      this.vx = (dx / distance) * speed;
      this.vy = (dy / distance) * speed;

      this.x += this.vx;
      this.y += this.vy;
    } else {
      // Normal physics: gravity and movement
      this.vy += this.gravity;
      this.vx *= this.friction;

      this.x += this.vx;
      this.y += this.vy;

      // Platform collisions
      for (const p of platforms) {
        if (p.broken) continue;
        if (
          this.x + this.radius > p.x &&
          this.x - this.radius < p.x + p.w &&
          this.y + this.radius > p.y &&
          this.y - this.radius < p.y + p.h
        ) {
          // Collision from top of platform
          if (this.vy > 0 && this.y - this.vy + this.radius <= p.y + 2) {
            this.y = p.y - this.radius;
            this.vy *= this.bounce;
            // Add friction when rolling on floor
            this.vx *= 0.8;
          } else if (this.vx > 0 && this.x - this.vx + this.radius <= p.x) {
            // Left side bounce
            this.x = p.x - this.radius;
            this.vx = -this.vx * 0.5;
          } else if (this.vx < 0 && this.x - this.vx - this.radius >= p.x + p.w) {
            // Right side bounce
            this.x = p.x + p.w + this.radius;
            this.vx = -this.vx * 0.5;
          }
        }
      }

      // Hard floor boundary
      if (this.y + this.radius >= this.groundY) {
        this.y = this.groundY - this.radius;
        this.vy *= this.bounce;
        this.vx *= 0.8;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, cameraX: number) {
    if (this.isCollected) return;

    ctx.save();
    ctx.translate(-cameraX, 0);

    if (this.type === 'coin') {
      // Draw octagonal pixel coin
      ctx.fillStyle = '#b8860b'; // Dark gold border
      ctx.fillRect(this.x - 3, this.y - 6, 6, 12);
      ctx.fillRect(this.x - 6, this.y - 3, 12, 6);
      ctx.fillRect(this.x - 4, this.y - 5, 8, 10);
      ctx.fillRect(this.x - 5, this.y - 4, 10, 8);

      ctx.fillStyle = '#ffd700'; // Gold core
      ctx.fillRect(this.x - 2, this.y - 5, 4, 10);
      ctx.fillRect(this.x - 5, this.y - 2, 10, 4);
      ctx.fillRect(this.x - 3, this.y - 4, 6, 8);
      ctx.fillRect(this.x - 4, this.y - 3, 8, 6);

      ctx.fillStyle = '#fef08a'; // Inner highlights
      ctx.fillRect(this.x - 1, this.y - 3, 2, 2);
    } else {
      // Octagonal/diamond pixel XP gem
      ctx.fillStyle = '#059669'; // Dark emerald border
      ctx.fillRect(this.x - 2, this.y - 6, 4, 12);
      ctx.fillRect(this.x - 6, this.y - 2, 12, 4);
      ctx.fillRect(this.x - 4, this.y - 4, 8, 8);
      
      ctx.fillStyle = '#10b981'; // Emerald core
      ctx.fillRect(this.x - 1, this.y - 5, 2, 10);
      ctx.fillRect(this.x - 5, this.y - 1, 10, 2);
      ctx.fillRect(this.x - 3, this.y - 3, 6, 6);

      ctx.fillStyle = '#6ee7b7'; // Inner highlight
      ctx.fillRect(this.x - 1, this.y - 3, 2, 2);
    }

    ctx.restore();
  }
}
