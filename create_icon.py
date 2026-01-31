from PIL import Image, ImageDraw

# Create a 128x128 image with RGB (solid background)
img = Image.new('RGB', (128, 128), (30, 58, 138))
draw = ImageDraw.Draw(img)

# Background gradient effect
for y in range(128):
    r = int(30 + (59 - 30) * y / 128)
    g = int(58 + (130 - 58) * y / 128)
    b = int(138 + (246 - 138) * y / 128)
    draw.line([(0, y), (128, y)], fill=(r, g, b))

# Draw server bars (3 horizontal bars)
bar_color = (147, 197, 253)
bar_positions = [30, 55, 80]

for bar_y in bar_positions:
    # Draw rectangular bar
    draw.rectangle([(24, bar_y), (104, bar_y + 18)], fill=bar_color)
    # Draw two small circles (indicator lights)
    draw.ellipse([(31, bar_y + 6), (37, bar_y + 12)], fill=(30, 58, 138))
    draw.ellipse([(41, bar_y + 6), (47, bar_y + 12)], fill=(30, 58, 138))

# Draw API symbol (brackets and slash) in white - simplified
white = (255, 255, 255)

# Left bracket [
draw.line([(68, 47), (64, 47)], fill=white, width=3)
draw.line([(64, 47), (62, 49)], fill=white, width=3)
draw.line([(62, 49), (62, 71)], fill=white, width=3)
draw.line([(62, 71), (64, 73)], fill=white, width=3)
draw.line([(64, 73), (68, 73)], fill=white, width=3)

# Right bracket ]
draw.line([(80, 47), (84, 47)], fill=white, width=3)
draw.line([(84, 47), (86, 49)], fill=white, width=3)
draw.line([(86, 49), (86, 71)], fill=white, width=3)
draw.line([(86, 71), (84, 73)], fill=white, width=3)
draw.line([(84, 73), (80, 73)], fill=white, width=3)

# Forward slash /
draw.line([(71, 73), (77, 47)], fill=white, width=3)

# Draw indicator dots on the right side
for dot_y in [39, 64, 89]:
    draw.ellipse([(92, dot_y - 2), (96, dot_y + 2)], fill=white)

# Save the image
img.save('icon.png', 'PNG')
print("Icon created successfully: icon.png")
