from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parent.parent
ASSET_DIR = ROOT / "public" / "assets"
ASSET_DIR.mkdir(parents=True, exist_ok=True)


def add_grain(image: Image.Image, strength: int = 18) -> Image.Image:
    w, h = image.size
    noise = Image.effect_noise((max(1, w // 2), max(1, h // 2)), strength).convert("RGB")
    noise = noise.resize((w, h))
    return Image.blend(image, noise, 0.06)


def draw_hero() -> Image.Image:
    w, h = 1600, 760
    image = Image.new("RGB", (w, h), "#173e38")
    draw = ImageDraw.Draw(image, "RGBA")

    # Desk surface
    draw.polygon([(0, 520), (1600, 470), (1600, 760), (0, 760)], fill=(10, 35, 31, 255))

    # Open notebook
    draw.rounded_rectangle([430, 190, 1290, 600], radius=22, fill=(238, 242, 233))
    draw.line([860, 190, 860, 600], fill=(177, 194, 181), width=4)
    for x in range(455, 850, 36):
        draw.rounded_rectangle([x, 220, x + 25, 570], radius=4, fill=(219, 228, 217))
    for x in range(885, 1270, 36):
        draw.rounded_rectangle([x, 220, x + 25, 570], radius=4, fill=(219, 228, 217))
    for y in range(260, 570, 48):
        draw.line([455, y, 845, y], fill=(202, 214, 204), width=3)
        draw.line([885, y, 1270, y], fill=(202, 214, 204), width=3)

    # Code-like blocks on the notebook
    for x0, x1 in [(500, 790), (940, 1200), (500, 690), (940, 1090)]:
        draw.line([x0, 310, x1, 310], fill=(69, 112, 95), width=8)
    draw.rounded_rectangle([500, 360, 790, 400], radius=8, fill=(216, 226, 215))
    draw.rounded_rectangle([940, 360, 1200, 400], radius=8, fill=(226, 178, 103))

    # Sticky notes
    draw.rounded_rectangle([150, 150, 360, 300], radius=12, fill=(221, 108, 83))
    draw.rounded_rectangle([330, 120, 540, 270], radius=12, fill=(227, 174, 86))
    draw.rounded_rectangle([1240, 130, 1450, 280], radius=12, fill=(119, 171, 186))

    # Pencil
    draw.line([150, 650, 1120, 610], fill=(227, 174, 86), width=20)
    draw.polygon([(1135, 608), (1220, 598), (1140, 620)], fill=(236, 231, 213))

    image = add_grain(image, 16)
    image = image.filter(ImageFilter.GaussianBlur(0.4))
    return image


def draw_avatar() -> Image.Image:
    size = 512
    image = Image.new("RGB", (size, size), "#173e38")
    draw = ImageDraw.Draw(image, "RGBA")

    draw.ellipse([34, 34, 478, 478], fill=(26, 74, 64, 255))

    # Note stack
    draw.rounded_rectangle([126, 172, 386, 372], radius=20, fill=(219, 164, 86))
    draw.rounded_rectangle([146, 150, 406, 350], radius=20, fill=(213, 99, 74))
    draw.rounded_rectangle([166, 128, 426, 328], radius=20, fill=(238, 241, 231))

    # Paper lines
    for y in range(168, 296, 24):
        draw.line([196, y, 396, y], fill=(165, 185, 172), width=7)
    draw.line([196, 296, 330, 296], fill=(165, 185, 172), width=7)
    draw.rounded_rectangle([196, 194, 286, 226], radius=8, fill=(72, 122, 103))

    # Bookmark
    draw.polygon([(376, 130), (406, 130), (406, 246), (391, 222), (376, 246)], fill=(219, 164, 86))

    image = add_grain(image, 12)
    image = image.filter(ImageFilter.GaussianBlur(0.3))
    return image


hero = draw_hero()
hero.save(ASSET_DIR / "hero.png", optimize=True)

avatar = draw_avatar()
avatar.save(ASSET_DIR / "avatar.png", optimize=True)

print("assets generated")
