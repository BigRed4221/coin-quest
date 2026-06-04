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

  update(playerX: number, playerY: number, platforms: { x: number; y: number; w: number; h: number }[]) {
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
      // Golden glowing coin
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd700'; // Gold
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();

      // Inner coin detail
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius - 2.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Coin glow shadow
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(255, 215, 0, 0.6)';
    } else {
      // Emerald glowing XP gem
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - this.radius);
      ctx.lineTo(this.x + this.radius - 1, this.y);
      ctx.lineTo(this.x, this.y + this.radius);
      ctx.lineTo(this.x - this.radius + 1, this.y);
      ctx.closePath();

      ctx.fillStyle = '#10b981'; // Emerald Green
      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();

      // Inner shine
      ctx.fillStyle = '#6ee7b7';
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - this.radius + 2);
      ctx.lineTo(this.x + this.radius - 3, this.y);
      ctx.lineTo(this.x, this.y + this.radius - 3);
      ctx.closePath();
      ctx.fill();

      // XP glow shadow
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(16, 185, 129, 0.6)';
    }

    ctx.restore();
  }
}
