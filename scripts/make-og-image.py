#!/usr/bin/env python3
"""
Create a simple OG image using Python PIL if available,
or output instructions for manual creation
"""
try:
    from PIL import Image, ImageDraw, ImageFont
    import os
    
    WIDTH, HEIGHT = 1200, 630
    img = Image.new('RGB', (WIDTH, HEIGHT), color='#0a0a0f')
    draw = ImageDraw.Draw(img)
    
    # Draw gradient-like background
    for y in range(HEIGHT):
        ratio = y / HEIGHT
        r = int(10 + ratio * 20)
        g = int(10 + ratio * 10)
        b = int(15 + ratio * 30)
        draw.line([(0, y), (WIDTH, y)], fill=(r, g, b))
    
    # Title
    try:
        title_font = ImageFont.truetype("arial.ttf", 72)
        subtitle_font = ImageFont.truetype("arial.ttf", 36)
        badge_font = ImageFont.truetype("arial.ttf", 28)
    except:
        title_font = ImageFont.load_default()
        subtitle_font = title_font
        badge_font = title_font
    
    # Main title
    draw.text((60, 200), "AutoTasker Hub", fill='white', font=title_font)
    
    # Subtitle
    draw.text((60, 290), "Machine-Payable Data API for AI Agents", fill='#aaa', font=subtitle_font)
    
    # Badges
    badges = ["Score 100/100", "$0.05/call", "x402 Protocol"]
    badge_y = 360
    for badge in badges:
        draw.rectangle([60, badge_y, 60 + len(badge)*18, badge_y + 35], fill='#22c55e20', outline='#22c55e')
        draw.text((70, badge_y + 5), badge, fill='#22c55e', font=badge_font)
        badge_y += 50
    
    # URL
    draw.text((60, 550), "autotasker-hub.vercel.app", fill='#666', font=badge_font)
    
    # Save
    out_path = os.path.join(os.path.dirname(__file__), '..', 'public', 'og-image.png')
    img.save(out_path)
    print(f"✅ OG image saved: {out_path}")
    
except ImportError:
    print("PIL not available. Install with: pip install Pillow")
    print("\nManual OG image specs:")
    print("- Size: 1200x630px")
    print("- Dark gradient background (#0a0a0f → #1a1a2e)")
    print("- White title: 'AutoTasker Hub'")
    print("- Subtitle: 'Machine-Payable Data API for AI Agents'")
    print("- Green badges: 'Score 100/100', '$0.05/call', 'x402 Protocol'")
    print("- URL at bottom")
