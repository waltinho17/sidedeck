"""Generates SideDeck's default background videos.

Everything here is drawn from math, so the videos are original and free to
ship. Every motion is periodic over the clip length, so each video loops
without a seam.

    python make_videos.py            # all videos into ../../pc-monitor-host/src-tauri/videos
    python make_videos.py --stills   # one frame of each, as PNG, for a quick look

Needs numpy, Pillow and ffmpeg (with libvpx-vp9) on PATH.
"""
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1280, 720
FPS = 30
SECONDS = 12
FRAMES = FPS * SECONDS
OUT = Path(__file__).resolve().parents[2] / "pc-monitor-host" / "src-tauri" / "videos"
TAU = 2 * math.pi


def rgb(hex_color):
    return np.array([int(hex_color[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32) / 255


def to_image(field):
    """float RGB (h, w, 3) in 0..1 -> full-size PIL image."""
    img = Image.fromarray((np.clip(field, 0, 1) * 255).astype(np.uint8), "RGB")
    return img if img.size == (W, H) else img.resize((W, H), Image.BICUBIC)


# ---------------------------------------------------------------- Aurora

def aurora(frame):
    """Rippling curtains of light over a starry night sky."""
    h, w = H // 2, W // 2
    theta = TAU * frame / FRAMES
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    x /= w
    y /= h
    sky = rgb("#03060f") * (1 - y[..., None]) + rgb("#0b1030") * y[..., None]
    out = sky.copy()
    curtains = [
        # color, base height, amplitude, waves across, speed (cycles), thickness
        (rgb("#23e6a8"), 0.46, 0.09, 1.3, 1, 0.06),
        (rgb("#1fb4ff"), 0.54, 0.07, 2.1, -1, 0.05),
        (rgb("#b04dff"), 0.38, 0.06, 0.9, 2, 0.07),
    ]
    for n, (color, base, amp, waves, speed, thick) in enumerate(curtains):
        center = (base + amp * np.sin(TAU * waves * x + speed * theta + n)
                  + 0.025 * np.sin(TAU * 3.7 * x - 2 * theta + 2 * n))
        d = y - center
        # A bright lower edge that fades slowly upward, like real curtains.
        glow = np.where(d > 0, np.exp(-(d / (thick * 0.45)) ** 2), np.exp(-(np.abs(d) / (thick * 3.2)) ** 1.6))
        # Irregular vertical rays, stronger higher up, drifting sideways.
        rays = (0.5 * np.sin(TAU * 13 * x + theta + n) + 0.3 * np.sin(TAU * 29 * x - 2 * theta + 3 * n)
                + 0.2 * np.sin(TAU * 47 * x + 3 * theta))
        ray_strength = np.clip(-d / (thick * 3), 0, 1) * 0.55
        light = glow * (1 - ray_strength + ray_strength * (0.5 + 0.5 * rays))
        out += color * light[..., None] * 0.6
    img = to_image(out)
    # Stars: fixed, twinkling with the loop.
    rng = np.random.default_rng(7)
    draw = ImageDraw.Draw(img)
    for sx, sy, phase in zip(rng.random(90) * W, rng.random(90) * H * 0.6, rng.random(90) * TAU):
        a = int(90 + 120 * (0.5 + 0.5 * math.sin(theta * 2 + phase)))
        draw.point((sx, sy), fill=(a, a, a))
    return img


# ---------------------------------------------------------------- Waves

def waves(frame):
    """Neon ribbons in SideDeck orange and pink, flowing across."""
    h, w = H // 2, W // 2
    theta = TAU * frame / FRAMES
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    x /= w
    y /= h
    out = rgb("#07060a") + np.zeros((h, w, 3), np.float32)
    along = x[..., None]
    for i in range(6):
        color = rgb("#ff7a1a") * (1 - along) + rgb("#ff3fa4") * along
        if i % 3 == 2:
            color = rgb("#ffb020") * (1 - along) + rgb("#ff7a1a") * along
        center = (0.5 + 0.18 * np.sin(TAU * (0.8 + 0.25 * i) * x + (1 + i % 2) * theta + i)
                  + 0.06 * np.sin(TAU * 2.3 * x - 2 * theta + i * 1.7))
        d = np.abs(y - center)
        glow = np.exp(-(d / 0.004) ** 2) * 0.9 + np.exp(-(d / 0.03) ** 2) * 0.35 + np.exp(-(d / 0.12) ** 2) * 0.08
        out += color * glow[..., None] * (0.55 + 0.1 * i / 6)
    return to_image(out)


# ---------------------------------------------------------------- Bokeh

RNG = np.random.default_rng(3)
BOKEH = [
    dict(x=RNG.random() * W, y=RNG.random() * H, r=RNG.uniform(10, 70), laps=1 + (i % 3 == 0),
         sway=RNG.uniform(10, 50), phase=RNG.random() * TAU,
         color=RNG.choice([rgb("#2f7dff"), rgb("#00d4ff"), rgb("#8b2fd9"), rgb("#4affd0")]),
         alpha=RNG.uniform(0.18, 0.5))
    for i in range(70)
]


def bokeh(frame):
    """Out-of-focus lights drifting up through a deep blue haze."""
    theta = TAU * frame / FRAMES
    t = frame / FRAMES
    yy = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    out = rgb("#02040c") * (1 - yy) + rgb("#0a1535") * yy + np.zeros((H, W, 3), np.float32)
    for p in BOKEH:
        span = H + 2 * p["r"]
        cy = (p["y"] - t * p["laps"] * span) % span - p["r"]
        cx = p["x"] + p["sway"] * math.sin(theta + p["phase"])
        r = p["r"]
        x0, x1 = int(max(0, cx - r - 2)), int(min(W, cx + r + 2))
        y0, y1 = int(max(0, cy - r - 2)), int(min(H, cy + r + 2))
        if x0 >= x1 or y0 >= y1:
            continue
        gy, gx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
        dist = np.sqrt((gx - cx) ** 2 + (gy - cy) ** 2) / r
        # Flat disc with a soft rim, like a real out-of-focus highlight.
        disc = np.clip((1 - dist) * 6, 0, 1) * (0.75 + 0.25 * dist)
        out[y0:y1, x0:x1] += p["color"] * (disc * p["alpha"])[..., None]
    return to_image(out)


# ---------------------------------------------------------------- Synthwave

def synthwave(frame):
    """Retro sunset with a striped sun and a neon grid rolling forward."""
    theta = TAU * frame / FRAMES
    t = frame / FRAMES
    horizon = int(H * 0.56)
    yy = np.linspace(0, 1, horizon, dtype=np.float32)[:, None, None]
    sky = rgb("#0b0420") * (1 - yy) ** 1.5 + rgb("#5a0f5c") * (1 - (1 - yy) ** 1.5)
    field = np.zeros((H, W, 3), np.float32)
    field[:horizon] = sky
    field[horizon:] = rgb("#07020f")
    img = to_image(field)

    # Sun: vertical gradient, bands cut out of its lower half sliding down.
    sun = Image.new("RGB", (W, H))
    r = int(H * 0.26)
    cx, cy = W // 2, horizon - int(r * 0.25)
    grad = np.linspace(0, 1, 2 * r, dtype=np.float32)[:, None]
    colors = rgb("#ffd23f") * (1 - grad[..., None]) + rgb("#ff2d78") * grad[..., None]
    sun_patch = to_patch = Image.fromarray((np.repeat(colors, 2 * r, axis=1) * 255).astype(np.uint8), "RGB")
    mask = Image.new("L", (2 * r, 2 * r), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.ellipse((0, 0, 2 * r - 1, 2 * r - 1), fill=255)
    # Bands slide down two gaps per loop and are only cut below `top`, so
    # the pattern at the end of the clip is exactly the one at the start.
    band_gap = r * 0.16
    top = r * 1.05
    for k in range(-3, 10):
        by = top + (k + t * 2) * band_gap
        thickness = 2 + (by - r) / r * band_gap * 0.45
        if by + thickness > top:
            mdraw.rectangle((0, max(by, top), 2 * r, by + thickness), fill=0)
    sun.paste(sun_patch, (cx - r, cy - r), mask)
    glow = np.asarray(sun.filter(ImageFilter.GaussianBlur(45)), np.float32) * 0.55
    base = np.asarray(img, np.float32) + glow
    sun_mask = np.zeros((H, W), np.float32)
    sun_mask[cy - r:cy + r, cx - r:cx + r] = np.asarray(mask, np.float32) / 255
    base = base * (1 - sun_mask[..., None]) + np.asarray(sun, np.float32) * sun_mask[..., None]
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))
    img.paste(Image.new("RGB", (W, H - horizon), (7, 2, 15)), (0, horizon))

    # Grid on the floor, drawn on its own layer to add a glow.
    grid = Image.new("RGB", (W, H))
    g = ImageDraw.Draw(grid)
    color = (255, 60, 200)
    for i in range(-24, 25):
        g.line((W / 2 + i * 12, horizon, W / 2 + i * 260, H + 40), fill=color, width=2)
    depth = 1.0
    for k in range(0, 26):
        z = (k + 1 - (t * 2) % 1) * depth
        py = horizon + (H - horizon) * 1.1 / z
        if py > H + 2:
            continue
        g.line((0, py, W, py), fill=color, width=2 if z > 3 else 3)
    grid_glow = grid.filter(ImageFilter.GaussianBlur(6))
    floor = np.asarray(grid, np.int16) + np.asarray(grid_glow, np.int16)
    fade = np.clip((np.arange(H) - horizon) / (H - horizon), 0, 1)[:, None, None] ** 0.7
    floor = (floor * fade).astype(np.int16)
    img = Image.fromarray(np.clip(np.asarray(img, np.int16) + floor, 0, 255).astype(np.uint8))

    # Stars in the upper sky.
    draw = ImageDraw.Draw(img)
    rng = np.random.default_rng(11)
    for sx, sy, phase in zip(rng.random(70) * W, rng.random(70) * horizon * 0.7, rng.random(70) * TAU):
        a = int(80 + 110 * (0.5 + 0.5 * math.sin(theta * 3 + phase)))
        draw.point((sx, sy), fill=(a, a, min(255, a + 30)))
    return img


VIDEOS = {"aurora": aurora, "ondas": waves, "bokeh": bokeh, "synthwave": synthwave}


def encode(name, render):
    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / f"{name}.webm"
    ffmpeg = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
         "-i", "-", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "30", "-row-mt", "1", "-cpu-used", "2",
         "-g", str(FPS * 4), "-pix_fmt", "yuv420p", str(target)],
        stdin=subprocess.PIPE,
    )
    for frame in range(FRAMES):
        ffmpeg.stdin.write(render(frame).convert("RGB").tobytes())
    ffmpeg.stdin.close()
    if ffmpeg.wait() != 0:
        raise SystemExit(f"ffmpeg failed on {name}")
    print(f"{target.name}: {target.stat().st_size / 1e6:.1f} MB")


def main():
    names = [a for a in sys.argv[1:] if not a.startswith("--")] or list(VIDEOS)
    if "--stills" in sys.argv:
        for name in names:
            path = Path(__file__).parent / f"still-{name}.png"
            VIDEOS[name](FRAMES // 3).save(path)
            print(path)
        return
    for name in names:
        encode(name, VIDEOS[name])


if __name__ == "__main__":
    main()
