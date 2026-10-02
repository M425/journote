from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
BASE_SIZE = 1024


def render_icon():
    icon = Image.new("RGBA", (BASE_SIZE, BASE_SIZE), (0, 0, 0, 0))

    tile = Image.new("RGBA", icon.size, (0, 0, 0, 0))
    tile_draw = ImageDraw.Draw(tile)
    tile_draw.rounded_rectangle((48, 48, 976, 976), radius=220, fill="#1B5744")
    tile_draw.rounded_rectangle((66, 66, 958, 958), radius=204, outline="#3B7A61", width=8)
    icon.alpha_composite(tile)

    shadow = Image.new("RGBA", icon.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (228, 168, 790, 884), radius=58, fill=(8, 32, 23, 100)
    )
    icon.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(24)))

    draw = ImageDraw.Draw(icon)
    draw.rounded_rectangle((212, 132, 772, 852), radius=58, fill="#F7F8F2")

    # A bookmark and a short ruled page form a compact note-taking mark.
    draw.rounded_rectangle((620, 132, 716, 376), radius=28, fill="#D2644F")
    draw.polygon([(620, 338), (668, 302), (716, 338), (716, 392), (668, 356), (620, 392)], fill="#D2644F")

    ink = "#286B56"
    muted_ink = "#A9BDB1"
    draw.rounded_rectangle((302, 300, 566, 344), radius=22, fill=ink)
    draw.rounded_rectangle((302, 412, 682, 452), radius=20, fill=muted_ink)
    draw.rounded_rectangle((302, 512, 644, 552), radius=20, fill=muted_ink)
    draw.rounded_rectangle((302, 612, 664, 652), radius=20, fill=muted_ink)

    draw.rounded_rectangle((302, 718, 478, 774), radius=28, fill="#E1EEE7")
    draw.rounded_rectangle((326, 738, 454, 754), radius=8, fill=ink)
    return icon


def main():
    STATIC.mkdir(parents=True, exist_ok=True)
    icon = render_icon()
    png_sizes = {
        "android-chrome-192x192.png": 192,
        "android-chrome-512x512.png": 512,
        "apple-touch-icon.png": 180,
        "favicon-32x32.png": 32,
        "favicon-16x16.png": 16,
    }
    for filename, size in png_sizes.items():
        icon.resize((size, size), Image.Resampling.LANCZOS).save(STATIC / filename)
    icon.save(
        STATIC / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )


if __name__ == "__main__":
    main()