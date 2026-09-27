from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG = (15, 23, 42)       # slate-900
ACCENT = (59, 130, 246) # blue-500 (matches site favicon accent)
WHITE = (248, 250, 252)
MUTED = (148, 163, 184)

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

# subtle diagonal accent band
d.rectangle([0, 0, W, 10], fill=ACCENT)

bold = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 40)
title_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 72)
tag_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 34)

# badge square with "PA"
badge = (80, 80)
bx, by = 90, 90
d.rounded_rectangle([bx, by, bx + badge[0], by + badge[1]], radius=20, fill=ACCENT)
pa_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 34)
bbox = d.textbbox((0, 0), "PA", font=pa_font)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
d.text((bx + (badge[0]-tw)/2, by + (badge[1]-th)/2 - bbox[1]), "PA", font=pa_font, fill=WHITE)

# Wordmark
d.text((bx + badge[0] + 24, by + 14), "Open PA Jobs", font=bold, fill=WHITE)

# Title
d.text((90, 250), "Public adjuster jobs", font=title_font, fill=WHITE)
d.text((90, 335), "across the U.S.", font=title_font, fill=ACCENT)

# Tagline
d.text((90, 460), "Licensed desks · Apprentices · Firm roles", font=tag_font, fill=MUTED)
d.text((90, 505), "openpajobs.com", font=tag_font, fill=MUTED)

img.save("og-image.png", "PNG", optimize=True)
print("saved", img.size)
