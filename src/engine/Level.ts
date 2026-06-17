export interface Platform {
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'ground' | 'obstacle' | 'box' | 'checkpoint' | 'gate' | 'overhang' | 'house' | 'garbage_bag';
  broken?: boolean;
  isBarrier?: boolean;
}

export class Level {
  width: number = 3600;
  height: number = 540;
  platforms: Platform[] = [];
  tutorialTexts: { x: number, text: string }[] = [];
  campfireX: number = 2000;
  bossTriggerX: number = 3100;
  endGateX: number = 3500;
  
  constructor() {
    this.initLevel();
  }

  initLevel() {
    this.platforms = [];
    this.tutorialTexts = [];

    // Main street sidewalk floor (runs the entire length of the level)
    this.platforms.push({ x: 0, y: 480, w: this.width, h: 60, type: 'ground' });

    // --- Tutorial Section ---
    // Floating text
    this.tutorialTexts.push({ x: 150, text: 'Use A/D to move' });
    this.tutorialTexts.push({ x: 320, text: 'SPACE to jump' });

    // Wooden Fence (Jump 1)
    this.platforms.push({ x: 400, y: 380, w: 20, h: 100, type: 'obstacle' });
    
    // --- Raised wooden deck platforms ---
    this.platforms.push({ x: 2350, y: 380, w: 160, h: 20, type: 'ground' });
    this.platforms.push({ x: 2600, y: 340, w: 160, h: 20, type: 'ground' });

    // --- The End Gate ---
    // Officer Bob blocks the gate at 3250
    this.platforms.push({ x: this.endGateX, y: 200, w: 30, h: 280, type: 'gate' });
  }

  // Draw background elements (parallax sky, ruined skyscrapers, street clouds)
  drawBackground(ctx: CanvasRenderingContext2D, cameraX: number, cameraScale: number = 2.0) {
    // 1. Smooth Sky Gradient and Sun
    const skyHeight = 540 / cameraScale;
    const skyTop = 540 - skyHeight;

    const skyGrad = ctx.createLinearGradient(0, skyTop, 0, 540);
    skyGrad.addColorStop(0, '#0ea5e9'); // Deep bright blue
    skyGrad.addColorStop(1, '#e0f2fe'); // Light horizon
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, skyTop, 960, skyHeight);

    // Realistic Glowing Sun
    const sunX = 800 - cameraX * 0.05; // Slow parallax for sun
    const sunY = skyTop + 80;
    
    ctx.save();
    ctx.shadowBlur = 40;
    ctx.shadowColor = '#fde047';
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Parallax Clouds (Fluffy white clouds)
    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    const cloudParallax = cameraX * 0.12;
    this.drawCloud(ctx, 100 - cloudParallax, 60, 60);
    this.drawCloud(ctx, 400 - cloudParallax, 40, 80);
    this.drawCloud(ctx, 750 - cloudParallax, 90, 55);
    this.drawCloud(ctx, 1100 - cloudParallax, 50, 70);
    this.drawCloud(ctx, 1600 - cloudParallax, 80, 90);
    this.drawCloud(ctx, 2200 - cloudParallax, 50, 60);
    ctx.restore();

    // 3. Far Parallax Hills (Smooth distant rolling hills at X * 0.22)
    const farParallax = cameraX * 0.22;
    ctx.save();
    ctx.translate(-farParallax, 0);
    
    // Create a smooth continuous path for the hills
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.fillStyle = '#bae6fd';
    ctx.beginPath();
    ctx.moveTo(-200, 480);
    for (let x = -200; x < this.width + 800; x += 300) {
      const hillHeight = 150 + Math.floor((Math.sin(x * 0.02) + 1) * 50);
      ctx.quadraticCurveTo(x + 150, 480 - hillHeight - 80, x + 300, 480 - hillHeight);
    }
    ctx.lineTo(this.width + 800, 480);
    ctx.lineTo(-200, 480);
    ctx.fill();
    ctx.restore();

    // 4. Mid Parallax Suburban Houses (at X * 0.42)
    const midParallax = cameraX * 0.42;
    ctx.save();
    ctx.translate(-midParallax, 0);

    for (let x = 120; x < this.width + 400; x += 320) {
      const hWidth = 180;
      const hHeight = 140 + Math.floor(Math.sin(x * 0.05) * 20); // 1-2 story houses
      const hTop = 480 - hHeight;

      // Base house color
      const colors = ['#fbcfe8', '#fed7aa', '#fef08a', '#a7f3d0', '#e0f2fe', '#ddd6fe'];
      const shadeColors = ['#f472b6', '#fb923c', '#facc15', '#34d399', '#38bdf8', '#a78bfa'];
      const cIndex = Math.abs(Math.floor(x / 320)) % colors.length;
      
      // Draw 3D side wall
      ctx.fillStyle = shadeColors[cIndex] || '#f472b6';
      ctx.beginPath();
      ctx.moveTo(x + hWidth, hTop);
      ctx.lineTo(x + hWidth + 30, hTop - 15);
      ctx.lineTo(x + hWidth + 30, 480 - 15);
      ctx.lineTo(x + hWidth, 480);
      ctx.fill();

      // Front Face
      ctx.fillStyle = colors[cIndex] || '#fbcfe8';
      ctx.fillRect(x, hTop, hWidth, hHeight);

      // Siding lines (horizontal)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
      for (let sy = hTop + 10; sy < 480; sy += 15) {
        ctx.fillRect(x, sy, hWidth, 2);
      }

      const roofPeak = hTop - 80;

      // Pitched Roof Side (3D effect)
      ctx.fillStyle = '#1e293b'; // Darker roof shade
      ctx.beginPath();
      ctx.moveTo(x + hWidth / 2, roofPeak);
      ctx.lineTo(x + hWidth / 2 + 30, roofPeak - 15);
      ctx.lineTo(x + hWidth + 15 + 30, hTop - 15);
      ctx.lineTo(x + hWidth + 15, hTop);
      ctx.fill();

      // Pitched Roof Front
      ctx.fillStyle = '#475569'; // Dark slate roof
      ctx.beginPath();
      ctx.moveTo(x - 15, hTop);
      ctx.lineTo(x + hWidth / 2, roofPeak);
      ctx.lineTo(x + hWidth + 15, hTop);
      ctx.closePath();
      ctx.fill();

      // Chimney
      if (Math.sin(x) > 0) {
        ctx.fillStyle = '#ef4444'; // Red brick chimney
        ctx.fillRect(x + hWidth - 40, roofPeak + 20, 20, 40);
        ctx.fillStyle = '#1e293b'; // Chimney cap
        ctx.fillRect(x + hWidth - 42, roofPeak + 15, 24, 5);
      }

      // Front Door
      const doorX = x + hWidth / 2 - 15;
      const doorY = 480 - 45;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(doorX, doorY, 30, 45);
      // Door knob
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(doorX + 24, doorY + 25, 3, 0, Math.PI * 2);
      ctx.fill();

      // Smooth Glowing Windows
      for (let wy = hTop + 20; wy < doorY - 10; wy += 50) {
        for (let wx of [x + 20, x + hWidth - 50]) {
          // Window glow/glint
          ctx.save();
          ctx.shadowBlur = 15;
          ctx.shadowColor = '#fde047';
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(wx, wy, 30, 35);
          ctx.restore();

          // Smooth Window frames (White)
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(wx - 2, wy - 2, 34, 4); // Top frame
          ctx.fillRect(wx - 2, wy + 35, 34, 4); // Bottom sill
          ctx.fillRect(wx - 2, wy, 4, 35); // Left frame
          ctx.fillRect(wx + 28, wy, 4, 35); // Right frame
          // Crossbars
          ctx.fillRect(wx + 13, wy, 4, 35); // Vertical crossbar
          ctx.fillRect(wx, wy + 15, 30, 4); // Horizontal crossbar
        }
      }
    }
    ctx.restore();
  }

  // Draw smooth fluffy clouds using arcs
  private drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    ctx.beginPath();
    ctx.arc(x, y, size * 0.4, Math.PI, 0);
    ctx.arc(x + size * 0.5, y - size * 0.1, size * 0.5, Math.PI, 0);
    ctx.arc(x + size * 1.1, y, size * 0.35, Math.PI, 0);
    ctx.rect(x - size * 0.4, y, size * 1.5, size * 0.1);
    ctx.fill();
  }

  // Draw solid level platforms (sidewalk, fences, boxes)
  drawForeground(ctx: CanvasRenderingContext2D, cameraX: number, campfireFrame: number) {
    ctx.save();
    ctx.translate(-cameraX, 0);

    // Draw tutorial texts
    ctx.save();
    ctx.fillStyle = '#1e293b';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(255,255,255,0.8)';
    ctx.shadowBlur = 4;
    for (const t of this.tutorialTexts) {
      ctx.fillText(t.text, t.x, 220);
    }
    ctx.restore();

    for (const p of this.platforms) {
      if (p.broken || p.isBarrier) continue;

      if (p.type === 'ground') {
        // Isometric Top Face (Grass)
        ctx.fillStyle = '#86efac'; // Lighter grass for top
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + 30, p.y - 15);
        ctx.lineTo(p.x + p.w + 30, p.y - 15);
        ctx.lineTo(p.x + p.w, p.y);
        ctx.fill();

        // Front Face (Dirt/Stone)
        ctx.fillStyle = '#78350f'; // Dirt brown
        ctx.fillRect(p.x, p.y, p.w, p.h);

        // Top grass overhang on front face
        ctx.fillStyle = '#4ade80'; // Bright grass green
        ctx.fillRect(p.x, p.y, p.w, 8);
        ctx.fillStyle = '#22c55e'; // Dark shading
        ctx.fillRect(p.x, p.y + 8, p.w, 3);

        // Draw scattered flowers
        for (let j = p.x + 20; j < p.x + p.w; j += 120) {
          const offset = Math.sin(j * 1.5) * 40 + 50;
          ctx.fillStyle = '#fb7185'; // Pink flower
          ctx.fillRect(j + offset, p.y + 16, 4, 4);
          ctx.fillStyle = '#fde047'; // Yellow center
          ctx.fillRect(j + offset + 1, p.y + 17, 2, 2);

          // Second flower
          ctx.fillStyle = '#c084fc'; // Purple flower
          ctx.fillRect(j + offset + 35, p.y + 30, 4, 4);
          ctx.fillStyle = '#fde047'; // Yellow center
          ctx.fillRect(j + offset + 36, p.y + 31, 2, 2);
        }
      } else if (p.type === 'obstacle') {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = -8;
        ctx.shadowOffsetY = 8;

        // Smooth vector wooden picket fence
        const woodColor = '#fcd34d';
        const outlineColor = '#b45309';

        ctx.fillStyle = woodColor;
        ctx.strokeStyle = outlineColor;
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';

        // Draw pickets
        for (let fx = p.x; fx < p.x + p.w; fx += 16) {
          ctx.beginPath();
          ctx.moveTo(fx, p.y + 10);
          ctx.lineTo(fx + 6, p.y);
          ctx.lineTo(fx + 12, p.y + 10);
          ctx.lineTo(fx + 12, p.y + p.h);
          ctx.lineTo(fx, p.y + p.h);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        // Draw crossbeams
        ctx.beginPath();
        ctx.roundRect(p.x - 4, p.y + 20, p.w + 8, 12, 6);
        ctx.roundRect(p.x - 4, p.y + p.h - 30, p.w + 8, 12, 6);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      } else if (p.type === 'box') {
        // Isometric 3D Cardboard Box
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = -8;
        ctx.shadowOffsetY = 8;

        const bx = p.x; const by = p.y; const bw = p.w; const bh = p.h;
        const depth = 15;

        // Top Face
        ctx.fillStyle = '#fef08a'; // Light cardboard top
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + depth, by - depth);
        ctx.lineTo(bx + bw + depth, by - depth);
        ctx.lineTo(bx + bw, by);
        ctx.fill();

        // Right Side Face
        ctx.fillStyle = '#a16207'; // Dark cardboard side
        ctx.beginPath();
        ctx.moveTo(bx + bw, by);
        ctx.lineTo(bx + bw + depth, by - depth);
        ctx.lineTo(bx + bw + depth, by + bh - depth);
        ctx.lineTo(bx + bw, by + bh);
        ctx.fill();

        // Front Face
        ctx.fillStyle = '#ca8a04'; // Normal cardboard front
        ctx.fillRect(bx, by, bw, bh);

        // Highlight edge
        ctx.fillStyle = '#eab308';
        ctx.fillRect(bx, by, bw, 2);

        // Tape on front
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(bx + bw / 2 - 4, by, 8, bh);

        ctx.restore();
      } else if (p.type === 'gate') {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = -10;
        ctx.shadowOffsetY = 5;

        // Heavy rusted steel bars neighborhood gate
        const borderOutline = '#0f172a';
        ctx.fillStyle = borderOutline;
        ctx.fillRect(p.x - 2, p.y - 2, p.w + 4, p.h + 4); // Outline

        ctx.fillStyle = '#334155'; // Dark industrial metal
        ctx.fillRect(p.x, p.y, p.w, p.h);

        // Metal panels shading
        ctx.fillStyle = '#475569'; // Left highlight
        ctx.fillRect(p.x, p.y, 6, p.h);
        ctx.fillStyle = '#1e293b'; // Right shadow
        ctx.fillRect(p.x + p.w - 6, p.y, 6, p.h);

        // Security bars grid (metallic sheen)
        ctx.fillStyle = '#cbd5e1';
        for (let gy = p.y + 12; gy < p.y + p.h - 10; gy += 25) {
          ctx.fillRect(p.x, gy, p.w, 4);
          ctx.fillStyle = '#94a3b8'; // Bar shadow
          ctx.fillRect(p.x, gy + 3, p.w, 1);
          ctx.fillStyle = '#cbd5e1';
        }

        // Metal rivets (small light dots)
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(p.x + 2, p.y + 4, 3, 3);
        ctx.fillRect(p.x + p.w - 5, p.y + 4, 3, 3);
        ctx.fillRect(p.x + 2, p.y + p.h - 7, 3, 3);
        ctx.fillRect(p.x + p.w - 5, p.y + p.h - 7, 3, 3);

        // Rusted spots (gritty brown stains)
        ctx.fillStyle = '#78350f';
        ctx.fillRect(p.x + 12, p.y + 40, 4, 8);
        ctx.fillRect(p.x + 16, p.y + 44, 3, 10);
        ctx.fillRect(p.x + 8, p.y + 130, 5, 6);
        ctx.restore();
      }
    }

    // --- Draw Campfire (Checkpoint) ---
    this.drawCampfire(ctx, this.campfireX, 480, campfireFrame);

    ctx.restore();
  }

  // Animating Campfire check point (highly textured rocks, detailed burning logs, and premium flame sparks)
  private drawCampfire(ctx: CanvasRenderingContext2D, x: number, groundY: number, frame: number) {
    ctx.save();
    
    const outlineColor = '#1a0d00';

    // 1. Stones base (shaded blocky stone outlines)
    ctx.fillStyle = outlineColor;
    ctx.fillRect(x - 26, groundY - 6, 52, 6);
    ctx.fillStyle = '#475569'; // Dark stone
    ctx.fillRect(x - 24, groundY - 4, 48, 4);
    ctx.fillStyle = '#64748b'; // Slate stones highlight
    ctx.fillRect(x - 22, groundY - 4, 8, 2);
    ctx.fillRect(x - 8, groundY - 4, 10, 2);
    ctx.fillRect(x + 12, groundY - 4, 10, 2);

    // 2. Wood logs
    ctx.fillStyle = outlineColor;
    ctx.fillRect(x - 18, groundY - 14, 36, 8); // Log 1 outline
    ctx.fillStyle = '#7c2d12'; // Log 1 wood
    ctx.fillRect(x - 16, groundY - 12, 32, 5);
    ctx.fillStyle = '#9a3412'; // Log 2
    ctx.fillRect(x - 10, groundY - 17, 20, 5);

    // Glowing ember pixels inside logs
    if (Math.floor(frame / 6) % 2 === 0) {
      ctx.fillStyle = '#f97316';
      ctx.fillRect(x - 8, groundY - 10, 3, 2);
      ctx.fillRect(x + 4, groundY - 11, 2, 2);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(x - 2, groundY - 15, 2, 2);
    } else {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x - 6, groundY - 11, 2, 2);
      ctx.fillRect(x + 2, groundY - 10, 3, 2);
      ctx.fillStyle = '#f97316';
      ctx.fillRect(x + 1, groundY - 16, 2, 2);
    }

    // 3. Animating brawler-style pixel flames
    const flameHeight = 22 + Math.floor(Math.sin(frame * 0.35) * 6);
    
    // Outer flame (red)
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(x - 12, groundY - 17 - flameHeight, 24, flameHeight);
    ctx.fillRect(x - 14, groundY - 17 - Math.floor(flameHeight * 0.6), 28, Math.floor(flameHeight * 0.6));
    
    // Mid flame (orange)
    ctx.fillStyle = '#f97316';
    ctx.fillRect(x - 8, groundY - 17 - Math.floor(flameHeight * 0.8), 16, Math.floor(flameHeight * 0.8));
    ctx.fillRect(x - 10, groundY - 17 - Math.floor(flameHeight * 0.45), 20, Math.floor(flameHeight * 0.45));
    
    // Inner flame (yellow glow core)
    ctx.fillStyle = '#fde047';
    ctx.fillRect(x - 4, groundY - 17 - Math.floor(flameHeight * 0.5), 8, Math.floor(flameHeight * 0.5));
    ctx.fillStyle = '#ffffff'; // White hot core center
    ctx.fillRect(x - 2, groundY - 17 - Math.floor(flameHeight * 0.25), 4, Math.floor(flameHeight * 0.25));

    // Floating flame ember sparks rising programmatically
    const spark1Y = (frame * 1.5) % 40;
    ctx.fillStyle = '#fde047';
    ctx.fillRect(x - 6 + Math.floor(Math.sin(frame * 0.1) * 4), groundY - 30 - spark1Y, 2, 2);
    
    const spark2Y = (frame * 1.2 + 20) % 45;
    ctx.fillStyle = '#f97316';
    ctx.fillRect(x + 4 + Math.floor(Math.cos(frame * 0.1) * 5), groundY - 30 - spark2Y, 2, 2);

    ctx.restore();
  }
}
