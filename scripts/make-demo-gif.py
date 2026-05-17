from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "apps" / "web" / "assets" / "txreceipts-demo.gif"


def font(size, bold=False):
    candidates = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def draw_receipt(draw, x, y, title, sent, received, status):
    draw.rounded_rectangle((x, y, x + 520, y + 330), radius=10, fill="#ffffff", outline="#d7ddd4", width=2)
    draw.text((x + 28, y + 28), "TXRECEIPTS", fill="#0052ff", font=font(14, True))
    draw.text((x + 28, y + 66), title, fill="#111412", font=font(30, True))
    draw.rounded_rectangle((x + 390, y + 30, x + 488, y + 62), radius=16, fill="#e5f4ec")
    draw.text((x + 414, y + 38), status, fill="#0b7a45", font=font(14, True))
    draw.line((x + 28, y + 122, x + 492, y + 122), fill="#d7ddd4", width=2)
    draw.text((x + 28, y + 154), "Sent", fill="#5c655f", font=font(14))
    draw.text((x + 28, y + 182), sent, fill="#111412", font=font(28, True))
    draw.text((x + 292, y + 154), "Received", fill="#5c655f", font=font(14))
    draw.text((x + 292, y + 182), received, fill="#111412", font=font(28, True))
    draw.line((x + 28, y + 242, x + 492, y + 242), fill="#d7ddd4", width=2)
    draw.text((x + 28, y + 274), "Gas itemized  |  Intent ready  |  Base verified", fill="#5c655f", font=font(16))


def frame(step, subtitle, tx_text, receipt_title, sent, received):
    image = Image.new("RGB", (960, 540), "#f6f7f2")
    draw = ImageDraw.Draw(image)
    draw.text((54, 48), "TxReceipts", fill="#111412", font=font(34, True))
    draw.text((54, 92), "Human-readable, verified Base transaction receipts", fill="#5c655f", font=font(18))

    draw.rounded_rectangle((54, 142, 520, 220), radius=10, fill="#ffffff", outline="#d7ddd4", width=2)
    draw.text((78, 158), step, fill="#0052ff", font=font(14, True))
    draw.text((78, 184), subtitle, fill="#111412", font=font(21, True))

    draw.rounded_rectangle((54, 250, 520, 310), radius=8, fill="#ffffff", outline="#d7ddd4", width=2)
    draw.text((76, 270), tx_text, fill="#5c655f", font=font(16))

    draw_receipt(draw, 560, 130, receipt_title, sent, received, "Verified")
    return image


frames = [
    frame("STEP 1", "Paste a Base transaction hash", "0x1111...1111", "Waiting for tx hash", "Base tx", "Receipt"),
    frame("STEP 2", "Fetch transaction receipt from Base RPC", "eth_getTransactionReceipt", "Base transaction", "Observed tx", "Logs"),
    frame("STEP 3", "Parse token transfers and gas paid", "Transfer logs + effective gas price", "USDC to ETH activity", "25.00 USDC", "0.0068 ETH"),
    frame("STEP 4", "Download a clean SVG or PNG receipt", "Accounting-ready artifact", "USDC to ETH activity", "25.00 USDC", "0.0068 ETH"),
]

durations = [1600, 1600, 1600, 2200]
OUT.parent.mkdir(parents=True, exist_ok=True)
frames[0].save(OUT, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True)
print(f"Wrote {OUT}")
