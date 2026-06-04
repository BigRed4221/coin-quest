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

    // 2. Parallax Clouds (Slow scrolling, blocky)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    const cloudParallax = cameraX * 0.15;
    this.drawCloud(ctx, 150 - cloudParallax, 80, 50);
    this.drawCloud(ctx, 450 - cloudParallax, 50, 70);
    this.drawCloud(ctx, 800 - cloudParallax, 110, 45);
    this.drawCloud(ctx, 1200 - cloudParallax, 70, 60);
    this.drawCloud(ctx, 1800 - cloudParallax, 90, 80);
    this.drawCloud(ctx, 2400 - cloudParallax, 60, 50);

    // 3. Parallax Houses and Trees (Medium scrolling, blocky)
    const midParallax = cameraX * 0.45;
    ctx.save();
    ctx.translate(-midParallax, 0);

    // Houses silhouettes
    for (let x = 100; x < this.width; x += 400) {
      // Draw simple colored house silhouettes in background
      ctx.fillStyle = '#b5c6d0'; // Light slate blue-gray
      ctx.fillRect(x, 380, 160, 100);
      
      // Blocky roof
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(x - 10, 370, 180, 10);
      ctx.fillRect(x + 10, 350, 140, 20);
      ctx.fillRect(x + 30, 330, 100, 20);
      ctx.fillRect(x + 50, 310, 60, 20);

      // Window detail
      ctx.fillStyle = '#fffae0'; // Light yellow glow
      ctx.fillRect(x + 30, 390, 20, 20);
      ctx.fillRect(x + 110, 390, 20, 20);

      // Window panes (pixel lines)
      ctx.fillStyle = '#475569';
      ctx.fillRect(x + 39, 390, 2, 20);
      ctx.fillRect(x + 30, 399, 20, 2);
      ctx.fillRect(x + 119, 390, 2, 20);
      ctx.fillRect(x + 110, 399, 20, 2);

      // Trees in background (blocky pixel canopy)
      ctx.fillStyle = '#4ade80'; // Bright light green
      ctx.fillRect(x - 90, 330, 80, 50);
      ctx.fillRect(x - 80, 300, 60, 30);
      ctx.fillRect(x - 70, 270, 40, 30);
      ctx.fillRect(x - 60, 250, 20, 20);

      // Tree trunk
      ctx.fillStyle = '#854d0e'; // Brown trunk
      ctx.fillRect(x - 60, 360, 20, 120);
    }
    ctx.restore();
  }

  // Draw clouds using Canvas rects (pixelated style)
  private drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    ctx.fillRect(x - size * 0.5, y, size * 1.5, size * 0.4);
    ctx.fillRect(x - size * 0.2, y - size * 0.2, size * 1.1, size * 0.2);
    ctx.fillRect(x + size * 0.1, y - size * 0.4, size * 0.6, size * 0.2);
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
        for (let j = p.x; j < p.x + p.w; j += 150) {
          ctx.fillStyle = '#475569';
          ctx.fillRect(j, p.y + 4, 3, p.h);
        }
      } else if (p.type === 'obstacle') {
        // White picket fence (sharp pixel elements)
        ctx.fillStyle = '#f8fafc'; // White
        for (let fx = p.x; fx < p.x + p.w; fx += 10) {
          ctx.fillRect(fx, p.y, 6, p.h); // Picket
          ctx.fillRect(fx + 2, p.y - 4, 2, 4); // Pointy top
        }
        
        // Draw crossbeams
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(p.x, p.y + 15, p.w, 4);
        ctx.fillRect(p.x, p.y + p.h - 20, p.w, 4);
      } else if (p.type === 'box') {
        // Cardboard Box (blocky borders)
        ctx.fillStyle = '#ca8a04'; // Brownish cardboard
        ctx.fillRect(p.x, p.y, p.w, p.h);
        
        ctx.fillStyle = '#854d0e'; // Border outline
        ctx.fillRect(p.x, p.y, p.w, 2);
        ctx.fillRect(p.x, p.y + p.h - 2, p.w, 2);
        ctx.fillRect(p.x, p.y, 2, p.h);
        ctx.fillRect(p.x + p.w - 2, p.y, 2, p.h);

        // Cardboard shipping tape details
        ctx.fillStyle = '#eab308'; // Yellow tape
        ctx.fillRect(p.x + p.w / 2 - 4, p.y, 8, p.h);

        // Cardboard wrinkles/lines
        ctx.fillStyle = 'rgba(133, 77, 14, 0.4)';
        ctx.fillRect(p.x + 5, p.y + 10, p.w - 10, 2);
        ctx.fillRect(p.x + 5, p.y + p.h - 12, p.w - 10, 2);
      } else if (p.type === 'gate') {
        // High security metal neighborhood gate
        ctx.fillStyle = '#334155'; // Dark metal
        ctx.fillRect(p.x, p.y, p.w, p.h);

        ctx.fillStyle = '#475569'; // Border shading
        ctx.fillRect(p.x, p.y, 4, p.h);
        ctx.fillRect(p.x + p.w - 4, p.y, 4, p.h);

        // Security bars
        ctx.fillStyle = '#cbd5e1';
        for (let gy = p.y + 10; gy < p.y + p.h; gy += 25) {
          ctx.fillRect(p.x, gy, p.w, 3);
        }
      }
    }

    // --- Draw Campfire (Checkpoint) ---
    this.drawCampfire(ctx, this.campfireX, 480, campfireFrame);

    ctx.restore();
  }

  // Animating Campfire check point (blocky flame shapes)
  private drawCampfire(ctx: CanvasRenderingContext2D, x: number, groundY: number, frame: number) {
    ctx.save();
    
    // Stones base (blocky)
    ctx.fillStyle = '#64748b'; // Slate stones
    ctx.fillRect(x - 24, groundY - 4, 48, 4);
    ctx.fillRect(x - 18, groundY - 6, 36, 2);
    ctx.fillRect(x - 8, groundY - 8, 16, 2);

    // Wood logs (blocky bars)
    ctx.fillStyle = '#7c2d12'; // Log 1
    ctx.fillRect(x - 16, groundY - 12, 32, 5);
    ctx.fillStyle = '#9a3412'; // Log 2
    ctx.fillRect(x - 10, groundY - 17, 20, 5);

    // Animating flames (blocky layers)
    const flameHeight = 16 + Math.floor(Math.sin(frame * 0.3) * 6);
    
    // Outer flame (red)
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(x - 12, groundY - 17 - flameHeight, 24, flameHeight);
    
    // Mid flame (orange)
    ctx.fillStyle = '#f97316';
    ctx.fillRect(x - 8, groundY - 17 - Math.floor(flameHeight * 0.75), 16, Math.floor(flameHeight * 0.75));
    
    // Inner flame (yellow)
    ctx.fillStyle = '#fde047';
    ctx.fillRect(x - 4, groundY - 17 - Math.floor(flameHeight * 0.45), 8, Math.floor(flameHeight * 0.45));

    ctx.restore();
  }
}
