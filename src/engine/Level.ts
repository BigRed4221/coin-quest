export interface Platform {
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'ground' | 'obstacle' | 'box' | 'checkpoint' | 'gate';
  broken?: boolean;
}

export class Level {
  width: number = 3200;
  height: number = 540;
  platforms: Platform[] = [];
  campfireX: number = 1600;
  bossTriggerX: number = 2500;
  endGateX: number = 3100;
  
  constructor() {
    this.initLevel();
  }

  initLevel() {
    this.platforms = [];

    // Main street sidewalk floor (runs the entire length of the level)
    this.platforms.push({ x: 0, y: 480, w: this.width, h: 60, type: 'ground' });

    // --- Tutorial Obstacles ---
    // Grandma's Picket Fence (Jump 1)
    this.platforms.push({ x: 450, y: 420, w: 20, h: 60, type: 'obstacle' });
    
    // Trash Cans (Jump 2)
    this.platforms.push({ x: 800, y: 420, w: 35, h: 60, type: 'obstacle' });

    // Cardboard Box Stack (Combat Tutorial)
    // Three breakable boxes stacked together
    this.platforms.push({ x: 1100, y: 420, w: 40, h: 60, type: 'box', broken: false });
    this.platforms.push({ x: 1140, y: 420, w: 40, h: 60, type: 'box', broken: false });

    // --- Midpoint Campfire Checkpoint ---
    // Campfire sits at X: 1600. It is a checkpoint.
    
    // --- Post-Campfire Obstacles ---
    // Fences and concrete walls
    this.platforms.push({ x: 1950, y: 400, w: 25, h: 80, type: 'obstacle' });
    
    // A raised wooden deck platform
    this.platforms.push({ x: 2150, y: 380, w: 160, h: 20, type: 'ground' });
    this.platforms.push({ x: 2350, y: 340, w: 160, h: 20, type: 'ground' });

    // --- The End Gate ---
    // Officer Bob blocks the gate at 2650
    this.platforms.push({ x: this.endGateX, y: 200, w: 30, h: 280, type: 'gate' });
  }

  // Draw background elements (parallax sky, houses, road, clouds)
  drawBackground(ctx: CanvasRenderingContext2D, cameraX: number) {
    // 1. Sky Gradient (Bright morning sun)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 480);
    skyGrad.addColorStop(0, '#56ccf2'); // Sky blue
    skyGrad.addColorStop(1, '#f2c94c'); // Sunlight yellow
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 960, 540);

    // 2. Parallax Clouds (Slow scrolling)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    const cloudParallax = cameraX * 0.15;
    this.drawCloud(ctx, 150 - cloudParallax, 80, 50);
    this.drawCloud(ctx, 450 - cloudParallax, 50, 70);
    this.drawCloud(ctx, 800 - cloudParallax, 110, 45);
    this.drawCloud(ctx, 1200 - cloudParallax, 70, 60);
    this.drawCloud(ctx, 1800 - cloudParallax, 90, 80);
    this.drawCloud(ctx, 2400 - cloudParallax, 60, 50);

    // 3. Parallax Houses and Trees (Medium scrolling)
    const midParallax = cameraX * 0.45;
    ctx.save();
    ctx.translate(-midParallax, 0);

    // Houses silhouettes
    for (let x = 100; x < this.width; x += 400) {
      // Draw simple colored house silhouettes in background
      ctx.fillStyle = '#b5c6d0'; // Light slate blue-gray
      ctx.beginPath();
      ctx.moveTo(x, 480);
      ctx.lineTo(x, 380);
      ctx.lineTo(x + 80, 310);
      ctx.lineTo(x + 160, 380);
      ctx.lineTo(x + 160, 480);
      ctx.closePath();
      ctx.fill();

      // Window detail
      ctx.fillStyle = '#fffae0'; // Light yellow glow
      ctx.fillRect(x + 30, 390, 20, 20);
      ctx.fillRect(x + 110, 390, 20, 20);

      // Trees in background
      ctx.fillStyle = '#4ade80'; // Bright light green
      ctx.beginPath();
      ctx.arc(x - 80, 360, 35, 0, Math.PI * 2);
      ctx.arc(x - 50, 330, 45, 0, Math.PI * 2);
      ctx.arc(x - 20, 360, 35, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();

      // Tree trunk
      ctx.fillStyle = '#854d0e'; // Brown trunk
      ctx.fillRect(x - 60, 360, 20, 120);
    }
    ctx.restore();
  }

  // Draw clouds using Canvas arcs
  private drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.arc(x + size * 0.6, y - size * 0.3, size * 0.8, 0, Math.PI * 2);
    ctx.arc(x + size * 1.2, y, size * 0.6, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }

  // Draw solid level platforms (sidewalk, fences, boxes)
  drawForeground(ctx: CanvasRenderingContext2D, cameraX: number, campfireFrame: number) {
    ctx.save();
    ctx.translate(-cameraX, 0);

    for (const p of this.platforms) {
      if (p.broken) continue;

      if (p.type === 'ground') {
        // Sidewalk styling
        ctx.fillStyle = '#94a3b8'; // Sidewalk slate gray
        ctx.fillRect(p.x, p.y, p.w, p.h);

        // Side walk expansion border (top edge lines)
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(p.x, p.y, p.w, 4);

        // Expansion joints (vertical lines on the road)
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        for (let j = p.x; j < p.x + p.w; j += 150) {
          ctx.beginPath();
          ctx.moveTo(j, p.y + 4);
          ctx.lineTo(j, p.y + p.h);
          ctx.stroke();
        }
      } else if (p.type === 'obstacle') {
        // White picket fence
        ctx.fillStyle = '#f8fafc'; // White
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;

        // Draw multiple pickets
        for (let fx = p.x; fx < p.x + p.w; fx += 8) {
          ctx.beginPath();
          ctx.moveTo(fx, p.y + p.h);
          ctx.lineTo(fx, p.y + 10);
          ctx.lineTo(fx + 3, p.y);
          ctx.lineTo(fx + 6, p.y + 10);
          ctx.lineTo(fx + 6, p.y + p.h);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        
        // Draw crossbeams
        ctx.fillRect(p.x, p.y + 15, p.w, 4);
        ctx.fillRect(p.x, p.y + p.h - 20, p.w, 4);
      } else if (p.type === 'box') {
        // Cardboard Box
        ctx.fillStyle = '#ca8a04'; // Brownish cardboard
        ctx.strokeStyle = '#854d0e';
        ctx.lineWidth = 2;
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.strokeRect(p.x, p.y, p.w, p.h);

        // Cardboard shipping tape details
        ctx.fillStyle = '#eab308'; // Yellow tape
        ctx.fillRect(p.x + p.w / 2 - 4, p.y, 8, p.h);

        // Cardboard wrinkles/lines
        ctx.strokeStyle = 'rgba(133, 77, 14, 0.4)';
        ctx.beginPath();
        ctx.moveTo(p.x + 5, p.y + 10);
        ctx.lineTo(p.x + p.w - 5, p.y + 10);
        ctx.moveTo(p.x + 5, p.y + p.h - 10);
        ctx.lineTo(p.x + p.w - 5, p.y + p.h - 10);
        ctx.stroke();
      } else if (p.type === 'gate') {
        // High security metal neighborhood gate
        ctx.fillStyle = '#334155'; // Dark metal
        ctx.fillRect(p.x, p.y, p.w, p.h);

        // Security bars
        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 3;
        for (let gy = p.y + 10; gy < p.y + p.h; gy += 25) {
          ctx.beginPath();
          ctx.moveTo(p.x, gy);
          ctx.lineTo(p.x + p.w, gy);
          ctx.stroke();
        }
      }
    }

    // --- Draw Campfire (Checkpoint) ---
    // Let's render the campfire dynamically
    this.drawCampfire(ctx, this.campfireX, 480, campfireFrame);

    ctx.restore();
  }

  // Animating Campfire check point
  private drawCampfire(ctx: CanvasRenderingContext2D, x: number, groundY: number, frame: number) {
    ctx.save();
    
    // Stones circle base
    ctx.fillStyle = '#64748b'; // Slate gray stones
    ctx.beginPath();
    ctx.ellipse(x, groundY - 2, 25, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wood logs
    ctx.fillStyle = '#7c2d12'; // Dark reddish brown wood logs
    ctx.fillRect(x - 15, groundY - 8, 30, 6);
    ctx.fillRect(x - 8, groundY - 12, 16, 6);

    // Animating flames (layers of orange, yellow, and red arcs)
    const flameHeight = 15 + Math.sin(frame * 0.25) * 6;
    
    // Outer flame (red)
    ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
    ctx.beginPath();
    ctx.moveTo(x - 12, groundY - 8);
    ctx.quadraticCurveTo(x - 5, groundY - 12, x, groundY - 8 - flameHeight);
    ctx.quadraticCurveTo(x + 5, groundY - 12, x + 12, groundY - 8);
    ctx.closePath();
    ctx.fill();

    // Mid flame (orange)
    ctx.fillStyle = 'rgba(249, 115, 22, 0.9)';
    ctx.beginPath();
    ctx.moveTo(x - 8, groundY - 8);
    ctx.quadraticCurveTo(x - 3, groundY - 10, x, groundY - 8 - flameHeight * 0.7);
    ctx.quadraticCurveTo(x + 3, groundY - 10, x + 8, groundY - 8);
    ctx.closePath();
    ctx.fill();

    // Inner flame (yellow)
    ctx.fillStyle = 'rgba(253, 224, 71, 0.95)';
    ctx.beginPath();
    ctx.moveTo(x - 4, groundY - 8);
    ctx.quadraticCurveTo(x - 1, groundY - 9, x, groundY - 8 - flameHeight * 0.4);
    ctx.quadraticCurveTo(x + 1, groundY - 9, x + 4, groundY - 8);
    ctx.closePath();
    ctx.fill();

    // Fire glow
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgba(249, 115, 22, 0.5)';

    ctx.restore();
  }
}
