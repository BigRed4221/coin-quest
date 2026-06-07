export interface Platform {
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'ground' | 'obstacle' | 'box' | 'checkpoint' | 'gate' | 'overhang' | 'trashcan';
  broken?: boolean;
  isBarrier?: boolean;
}

export class Level {
  width: number = 3600;
  height: number = 540;
  platforms: Platform[] = [];
  campfireX: number = 1800;
  bossTriggerX: number = 3100;
  endGateX: number = 3500;
  
  constructor() {
    this.initLevel();
  }

  initLevel() {
    this.platforms = [];

    // Main street sidewalk floor (runs the entire length of the level)
    this.platforms.push({ x: 0, y: 480, w: this.width, h: 60, type: 'ground' });

    // --- Tutorial Obstacles ---
    // Grandma's Picket Fence (Jump 1) at X = 400
    this.platforms.push({ x: 400, y: 420, w: 20, h: 60, type: 'obstacle' });
    
    // Low tree branch overhang (Crouch Tutorial) at X = 600
    this.platforms.push({ x: 600, y: 320, w: 80, h: 120, type: 'overhang' });

    // Breakable Trash Can (Combat Tutorial) at X = 950
    this.platforms.push({ x: 950, y: 420, w: 40, h: 60, type: 'trashcan', broken: false });

    // --- Midpoint Campfire Checkpoint ---
    // Campfire sits at X: 1800.
    
    // --- Post-Campfire Obstacles ---
    // Fences and concrete walls
    
    // Raised wooden deck platforms
    this.platforms.push({ x: 2350, y: 380, w: 160, h: 20, type: 'ground' });
    this.platforms.push({ x: 2600, y: 340, w: 160, h: 20, type: 'ground' });

    // --- The End Gate ---
    // Officer Bob blocks the gate at 3250
    this.platforms.push({ x: this.endGateX, y: 200, w: 30, h: 280, type: 'gate' });
  }

  // Draw background elements (parallax sky, ruined skyscrapers, street clouds)
  drawBackground(ctx: CanvasRenderingContext2D, cameraX: number, cameraScale: number = 2.0) {
    // 1. Dithered/Banded Sky (Chunky horizontal color stripes)
    const skyColors = [
      '#232630', '#2a2d38', '#313440', '#383b48', 
      '#3f4250', '#464958', '#4b4d58', '#514f58', 
      '#575258', '#5d5558', '#635957', '#665d56',
      '#665d56', '#5d5558', '#514f58'
    ];
    const skyHeight = 540 / cameraScale;
    const stripeHeight = skyHeight / 15;
    const skyTop = 540 - skyHeight;
    for (let i = 0; i < 15; i++) {
      ctx.fillStyle = skyColors[i] || '#665d56';
      ctx.fillRect(0, skyTop + i * stripeHeight, 960, stripeHeight + 1);
    }

    // 2. Parallax Smog Clouds (Slow moving dark smoke)
    ctx.fillStyle = 'rgba(28, 29, 36, 0.4)';
    const cloudParallax = cameraX * 0.12;
    this.drawCloud(ctx, 100 - cloudParallax, 60, 60);
    this.drawCloud(ctx, 400 - cloudParallax, 40, 80);
    this.drawCloud(ctx, 750 - cloudParallax, 90, 55);
    this.drawCloud(ctx, 1100 - cloudParallax, 50, 70);
    this.drawCloud(ctx, 1600 - cloudParallax, 80, 90);
    this.drawCloud(ctx, 2200 - cloudParallax, 50, 60);

    // 3. Far Parallax Silhouettes (Distant ruined towers at X * 0.22)
    const farParallax = cameraX * 0.22;
    ctx.save();
    ctx.translate(-farParallax, 0);
    ctx.fillStyle = '#373a45'; // Darker silhouette grey
    for (let x = 50; x < this.width; x += 250) {
      const height = 280 + Math.floor((Math.sin(x * 0.05) + 1) * 60);
      ctx.fillRect(x, 480 - height, 110, height);
      
      // Crumbling skyscraper tops (blocky bites taken out)
      ctx.clearRect(x + 10, 480 - height, 20, 15);
      ctx.clearRect(x + 70, 480 - height, 15, 25);
    }
    ctx.restore();

    // 4. Mid Parallax Buildings (Detailed brick ruins & skyscrapers at X * 0.42)
    const midParallax = cameraX * 0.42;
    ctx.save();
    ctx.translate(-midParallax, 0);

    for (let x = 120; x < this.width; x += 380) {
      const bHeight = 320 + Math.floor((Math.cos(x * 0.03) + 1) * 50);
      const bWidth = 170;
      const bTop = 480 - bHeight;

      // Base concrete/brick facade color
      ctx.fillStyle = '#50535e'; // Mid brawler grey
      ctx.fillRect(x, bTop, bWidth, bHeight);

      // Shadow on left side of building (16-bit lighting)
      ctx.fillStyle = '#41434c'; 
      ctx.fillRect(x, bTop, 15, bHeight);

      // Crumbling building top details
      ctx.fillStyle = '#303138'; // Dark gap outlines for cracks
      ctx.fillRect(x - 5, bTop - 4, bWidth + 10, 4); // Roof ledge
      
      // Crumble chunks on roof
      ctx.clearRect(x + 30, bTop - 6, 20, 10);
      ctx.clearRect(x + 110, bTop - 6, 30, 8);

      // Draw rows of windows with grids and panels
      for (let wy = bTop + 30; wy < 460; wy += 45) {
        for (let wx = x + 25; wx < x + bWidth - 20; wx += 35) {
          // Check if window is broken/empty (black) or has light (yellow/orange glow)
          const randVal = Math.sin(wx * 2.3 + wy * 1.7);
          if (randVal < -0.4) {
            // Broken empty window pane
            ctx.fillStyle = '#1e1f24';
            ctx.fillRect(wx, wy, 20, 25);
            // Cracks on frame
            ctx.fillStyle = '#303138';
            ctx.fillRect(wx - 2, wy + 8, 2, 6);
          } else if (randVal > 0.5) {
            // Glowing window (orange fire glow)
            ctx.fillStyle = '#d97706'; // Dark orange
            ctx.fillRect(wx, wy, 20, 25);
            ctx.fillStyle = '#fbbf24'; // Yellow center
            ctx.fillRect(wx + 4, wy + 4, 12, 17);
            
            // Pane grids (cross)
            ctx.fillStyle = '#5c3905';
            ctx.fillRect(wx + 9, wy, 2, 25);
            ctx.fillRect(wx, wy + 11, 20, 2);
          } else {
            // Standard retro brawler blue-grey window pane
            ctx.fillStyle = '#64748b'; // Window blue-grey
            ctx.fillRect(wx, wy, 20, 25);
            
            // Glass reflections (chunky blocky diagonal)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.fillRect(wx + 4, wy + 18, 4, 4);
            ctx.fillRect(wx + 8, wy + 12, 4, 4);
            ctx.fillRect(wx + 12, wy + 6, 4, 4);

            // Window frames
            ctx.fillStyle = '#334155';
            ctx.fillRect(wx + 9, wy, 2, 25);
            ctx.fillRect(wx, wy + 11, 20, 2);
          }

          // Shaded window sill (16-bit blocky ledge)
          ctx.fillStyle = '#2d2e34';
          ctx.fillRect(wx - 2, wy + 25, 24, 3);
        }
      }

      // Vertical brick column lines (shading panels)
      ctx.fillStyle = '#484b55';
      for (let bx = x + 15; bx < x + bWidth; bx += 55) {
        ctx.fillRect(bx, bTop, 2, bHeight);
      }
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
      if (p.broken || p.isBarrier) continue;

      if (p.type === 'ground') {
        // Concrete ground blocky tiles (highly textured)
        ctx.fillStyle = '#474954'; // Dark concrete slate
        ctx.fillRect(p.x, p.y, p.w, p.h);

        // Top curb border (concrete edge)
        ctx.fillStyle = '#6b7280'; // Lighter gray
        ctx.fillRect(p.x, p.y, p.w, 4);
        ctx.fillStyle = '#374151'; // Dark shading
        ctx.fillRect(p.x, p.y + 4, p.w, 2);

        // expansion joints (lines separating sections)
        const panelSize = 120;
        for (let j = p.x; j < p.x + p.w; j += panelSize) {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(j, p.y, 4, p.h);
          
          // Shading on expansion joints
          ctx.fillStyle = '#111827';
          ctx.fillRect(j + 3, p.y, 1, p.h);
          
          // Draw random concrete cracks inside panels programmatically using deterministic math
          const offset = Math.sin(j * 1.5) * 40 + 50;
          ctx.fillStyle = '#1e293b';
          // Draw crack 1
          ctx.fillRect(j + offset, p.y + 6, 2, 8);
          ctx.fillRect(j + offset - 3, p.y + 14, 5, 2);
          ctx.fillRect(j + offset - 3, p.y + 16, 2, 12);
          
          // Draw crack 2 (rare)
          if (Math.sin(j * 4.3) > 0.4) {
            ctx.fillRect(j + offset + 35, p.y + 20, 2, 10);
            ctx.fillRect(j + offset + 35, p.y + 30, 8, 2);
            ctx.fillRect(j + offset + 41, p.y + 32, 2, 8);
          }
        }

        // Draw scattered concrete texture noise dots (using Math.sin for deterministic placement)
        ctx.fillStyle = '#555866'; // lighter dots
        for (let tx = p.x + 10; tx < p.x + p.w - 10; tx += 65) {
          const dy = 12 + Math.floor((Math.sin(tx * 0.9) + 1) * 20);
          ctx.fillRect(tx, p.y + dy, 2, 2);
        }
        ctx.fillStyle = '#373a46'; // darker dots
        for (let tx = p.x + 35; tx < p.x + p.w - 10; tx += 75) {
          const dy = 12 + Math.floor((Math.cos(tx * 1.2) + 1) * 20);
          ctx.fillRect(tx, p.y + dy, 2, 2);
        }

        // Scatter concrete brick rubble piles to fit "ruined city" street
        for (let rx = p.x + 220; rx < p.x + p.w; rx += 480) {
          ctx.fillStyle = '#7c2d12'; // Dark red brick
          ctx.fillRect(rx, p.y - 12, 10, 6);
          ctx.fillRect(rx + 6, p.y - 6, 8, 6);
          ctx.fillStyle = '#9a3412'; // Highlight brick
          ctx.fillRect(rx + 2, p.y - 10, 8, 2);
          ctx.fillRect(rx + 6, p.y - 4, 6, 2);
          
          ctx.fillStyle = '#451a03'; // Outline/shadow
          ctx.fillRect(rx - 2, p.y - 14, 14, 2);
          ctx.fillRect(rx, p.y - 6, 2, 6);
        }
      } else if (p.type === 'obstacle') {
        // 16-bit weathered wooden picket fence
        const outlineColor = '#1f2937';
        for (let fx = p.x; fx < p.x + p.w; fx += 12) {
          // Outline silhouette
          ctx.fillStyle = outlineColor;
          ctx.fillRect(fx - 1, p.y - 1, 8, p.h + 2);
          ctx.fillRect(fx + 1, p.y - 5, 4, 4);

          // Wood picket base (light weathered gray/white)
          ctx.fillStyle = '#e2e8f0';
          ctx.fillRect(fx, p.y, 6, p.h);
          ctx.fillRect(fx + 2, p.y - 4, 2, 4); // Pointy top

          // Shading (right shadow)
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(fx + 4, p.y, 2, p.h);
          ctx.fillRect(fx + 3, p.y - 3, 1, 3);

          // Wood grain vertical knot line
          ctx.fillStyle = '#cbd5e1';
          ctx.fillRect(fx + 2, p.y + 10, 1, p.h - 15);
          ctx.fillStyle = '#475569';
          ctx.fillRect(fx + 2, p.y + 18, 2, 2); // wood knot dot
        }
        
        // Draw crossbeams
        ctx.fillStyle = outlineColor;
        ctx.fillRect(p.x - 2, p.y + 13, p.w + 4, 8);
        ctx.fillRect(p.x - 2, p.y + p.h - 22, p.w + 4, 8);

        ctx.fillStyle = '#64748b'; // Crossbeam color
        ctx.fillRect(p.x, p.y + 14, p.w, 6);
        ctx.fillRect(p.x, p.y + p.h - 21, p.w, 6);
        ctx.fillStyle = '#475569'; // Shadow
        ctx.fillRect(p.x, p.y + 18, p.w, 2);
        ctx.fillRect(p.x, p.y + p.h - 17, p.w, 2);
      } else if (p.type === 'box') {
        // Detailed 16-bit Cardboard Box
        const outlineColor = '#451a03';
        ctx.fillStyle = outlineColor;
        ctx.fillRect(p.x - 2, p.y - 2, p.w + 4, p.h + 4); // Outline

        ctx.fillStyle = '#ca8a04'; // Cardboard brown base
        ctx.fillRect(p.x, p.y, p.w, p.h);
        
        ctx.fillStyle = '#a16207'; // Left and bottom shadows
        ctx.fillRect(p.x, p.y, 4, p.h);
        ctx.fillRect(p.x, p.y + p.h - 4, p.w, 4);

        ctx.fillStyle = '#eab308'; // Highlight edge
        ctx.fillRect(p.x, p.y, p.w, 2);
        ctx.fillRect(p.x + p.w - 2, p.y, 2, p.h);

        // Shipping tape (detailed yellow/amber tape)
        ctx.fillStyle = outlineColor;
        ctx.fillRect(p.x + p.w / 2 - 5, p.y, 10, p.h);
        ctx.fillStyle = '#fbbf24'; // Tape yellow
        ctx.fillRect(p.x + p.w / 2 - 4, p.y, 8, p.h);
        ctx.fillStyle = '#f59e0b'; // Shading on tape
        ctx.fillRect(p.x + p.w / 2, p.y, 4, p.h);

        // Cardboard stamps / labels
        ctx.fillStyle = '#78350f'; // Dark brown stamps
        ctx.fillRect(p.x + 6, p.y + 10, 8, 4);
        ctx.fillRect(p.x + 6, p.y + 16, 5, 2);
      } else if (p.type === 'gate') {
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
      } else if (p.type === 'overhang') {
        // Gritty brawler tree branch overhang
        const outlineColor = '#1c1917';
        
        // 1. Draw branch outline & bark shading
        ctx.fillStyle = outlineColor;
        ctx.fillRect(p.x - 2, p.y + p.h - 22, p.w + 4, 24); // Branch outline

        ctx.fillStyle = '#451a03'; // Dark brown bark
        ctx.fillRect(p.x, p.y + p.h - 20, p.w, 20);
        ctx.fillStyle = '#78350f'; // Highlight bark lines
        ctx.fillRect(p.x, p.y + p.h - 20, p.w, 5);
        ctx.fillRect(p.x + 20, p.y + p.h - 12, 40, 2);

        // 2. Leaf Clusters (translucent layered dark olive leaves)
        const leafOutline = '#022c22';
        
        // Canopy outline
        ctx.fillStyle = leafOutline;
        ctx.fillRect(p.x - 14, p.y - 2, p.w + 28, p.h - 16);
        ctx.fillRect(p.x - 4, p.y - 4, p.w + 8, 4);

        // Outer foliage (Bright green)
        ctx.fillStyle = '#10b981';
        ctx.fillRect(p.x - 10, p.y, p.w + 20, p.h - 20);

        // Mid foliage (Dark teal green)
        ctx.fillStyle = '#065f46';
        ctx.fillRect(p.x - 6, p.y + 8, p.w + 12, p.h - 32);

        // Inner foliage (Darkest pine green)
        ctx.fillStyle = '#022c22';
        ctx.fillRect(p.x, p.y + 16, p.w, p.h - 44);
      } else if (p.type === 'trashcan') {
        // Detailed Corrugated Steel Trash Can
        const outlineColor = '#1e293b';
        ctx.fillStyle = outlineColor;
        ctx.fillRect(p.x - 2, p.y - 5, p.w + 4, p.h + 7); // Outline

        ctx.fillStyle = '#64748b'; // Steel base gray
        ctx.fillRect(p.x, p.y, p.w, p.h);

        // Shading highlights and shadows
        ctx.fillStyle = '#94a3b8'; // Left highlight
        ctx.fillRect(p.x, p.y, 5, p.h);
        ctx.fillStyle = '#475569'; // Right shadow
        ctx.fillRect(p.x + p.w - 5, p.y, 5, p.h);

        // Lid handle & rim
        ctx.fillStyle = '#475569'; // Dark lid rim
        ctx.fillRect(p.x, p.y, p.w, 4);
        ctx.fillStyle = '#cbd5e1'; // Metallic lid highlight
        ctx.fillRect(p.x, p.y, p.w, 2);
        
        ctx.fillStyle = '#334155'; // Handle outline
        ctx.fillRect(p.x + p.w / 2 - 8, p.y - 4, 16, 4);
        ctx.fillStyle = '#64748b'; // Handle fill
        ctx.fillRect(p.x + p.w / 2 - 6, p.y - 3, 12, 3);

        // Vertical corrugation bars with highlight/shadow pairs (16-bit pixel sheen)
        for (let cx = p.x + 6; cx < p.x + p.w - 4; cx += 8) {
          ctx.fillStyle = '#334155'; // Dark crease
          ctx.fillRect(cx, p.y + 4, 2, p.h - 4);
          ctx.fillStyle = '#94a3b8'; // Bright ridge
          ctx.fillRect(cx + 2, p.y + 4, 2, p.h - 4);
        }
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
