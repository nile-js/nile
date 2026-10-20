"""Render shareable charts and an offline HTML comparison from verified benchmark data."""
from pathlib import Path
from html import escape
import json
from PIL import Image, ImageDraw, ImageFont

import argparse
import hashlib
import os

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("rankings", type=Path, help="Rankings JSON produced by rank-results.mjs")
parser.add_argument("output", nargs="?", type=Path, help="Output directory; defaults to the rankings directory")
args = parser.parse_args()
RANKINGS = args.rankings.resolve()
OUTPUT = (args.output or RANKINGS.parent).resolve()
DATA = json.loads(RANKINGS.read_text())
source_path = Path(DATA["source"]["path"])
SOURCE_PATH = source_path if source_path.is_absolute() else RANKINGS.parent / source_path
source_bytes = SOURCE_PATH.read_bytes()
if hashlib.sha256(source_bytes).hexdigest() != DATA["source"]["sha256"]:
    raise ValueError("Benchmark source hash does not match the rankings")
SOURCE = json.loads(source_bytes)
HOST = SOURCE["provenance"]["host"]
ROUNDS = SOURCE["rounds"]
OUTPUT.mkdir(parents=True, exist_ok=True)
WIDTH, HEIGHT, SCALE = 1040, 1000, 2
FONT_NAMES = {
    "regular": ("FiraSans-Regular.otf", "DejaVuSans.ttf", "Arial.ttf"),
    "bold": ("FiraSans-Bold.otf", "DejaVuSans-Bold.ttf", "Arial Bold.ttf"),
    "mono": ("FiraMono-Medium.otf", "DejaVuSansMono.ttf", "Courier New.ttf"),
}


def load_font(kind, size):
    """Use locally available fonts through Pillow's platform lookup, then its bundled fallback."""
    for name in FONT_NAMES[kind]:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


INK, MUTED, ACCENT = "#eee9eb", "#999296", "#38bdf8"


def render_chart(mode):
    """Use one geometry for PNG and SVG so exported charts retain the same data and layout."""
    rows = DATA["rankings"][mode]
    image = Image.new("RGB", (WIDTH * SCALE, HEIGHT * SCALE), "#0d0b0c")
    draw = ImageDraw.Draw(image)
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="title-{mode} desc-{mode}">',
           f'<title id="title-{mode}">Ecommerce framework throughput, {mode}</title>',
           f'<desc id="desc-{mode}">{ROUNDS}-round means. Ten frameworks ranked by requests per second. Nile is highlighted. All samples retained. Active workstation with large variation.</desc>',
           '<rect width="1040" height="1000" fill="#0d0b0c"/>']

    def rectangle(box, color, stroke=None):
        """Draw proportional bars and thin borders consistently across export formats."""
        draw.rectangle(tuple(int(value * SCALE) for value in box), fill=color, outline=stroke, width=SCALE)
        x0, y0, x1, y1 = box
        svg.append(f'<rect x="{x0}" y="{y0}" width="{x1-x0}" height="{y1-y0}" fill="{color}"' + (f' stroke="{stroke}"' if stroke else '') + '/>')

    def text(x, y, value, size=18, color=INK, font="regular", anchor="start"):
        """Align labels and tabular measurements without relying on external web fonts."""
        selected = load_font(font, size * SCALE)
        available = (916 if anchor == "start" else x - 62) * SCALE
        while draw.textlength(value, font=selected) > available and size > 10:
            size -= 1
            selected = load_font(font, size * SCALE)
        length = draw.textlength(value, font=selected)
        left = x * SCALE - (length if anchor == "end" else 0)
        draw.text((left, y * SCALE), value, font=selected, fill=color, anchor="lt")
        family = "Fira Mono, monospace" if font == "mono" else "Fira Sans, sans-serif"
        weight = "700" if font == "bold" else "400"
        svg.append(f'<text x="{x}" y="{y+size*.82}" fill="{color}" font-family="{family}" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}">{escape(value)}</text>')

    rectangle((20, 20, 1020, 980), "#0d0b0c", "#3c3439")
    text(62, 52, "NILE / BENCHMARKS", 13, MUTED, "mono")
    text(978, 52, f"{ROUNDS}-ROUND AVERAGES", 13, MUTED, "mono", "end")
    title = "Validated ecommerce API" if mode == "validated" else "Ecommerce API · payload validation off"
    text(62, 91, title, 30, INK, "bold")
    subtitle = f'{SOURCE["actionCount"]} actions · JWT + CORS · shared Zod payload validation' if mode == "validated" else f'{SOURCE["actionCount"]} actions · JWT + CORS · payload validation disabled'
    text(62, 135, subtitle, 18, MUTED)
    text(80, 183, "FRAMEWORK", 13, MUTED, "mono")
    text(850, 183, "REQ/S ↑", 13, MUTED, "mono", "end")
    text(976, 183, "NILE ÷", 13, MUTED, "mono", "end")
    maximum = rows[0]["meanRequestsPerSecond"]
    for index, row in enumerate(rows):
        y = 216 + index * 45
        is_nile = row["framework"] == "nile-native"
        rectangle((278, y, 728, y + 29), "#1a1619")
        rectangle((278, y, 278 + 450 * row["meanRequestsPerSecond"] / maximum, y + 29), ACCENT if is_nile else "#7e797c")
        text(61, y + 5, str(index + 1).zfill(2), 12, "#746c72", "mono")
        text(93, y + 3, row["label"], 21, INK if is_nile else "#c0b9bd", "bold" if is_nile else "regular")
        text(850, y + 1, f'{row["meanRequestsPerSecond"]:,.0f}', 23, INK if is_nile else "#b9b2b7", "mono", "end")
        text(976, y + 5, "—" if is_nile else f'{row["nileBunThroughputDividedByThis"]:.2f}×', 17, MUTED, "mono", "end")
    rectangle((62, 693, 978, 694), "#30272d")
    text(62, 715, "HOW WE TESTED", 12, MUTED, "mono")
    text(62, 739, f'We built the same shopping API in each framework, with {SOURCE["actionCount"]} operations.', 16, MUTED)
    text(62, 764, f'Up to {SOURCE["concurrency"]} simulated shoppers browsed products, filled carts and placed orders at once.', 16, MUTED)
    text(62, 789, f'We sent {SOURCE["warmupJourneysPerScenario"]:,} practice journeys, then timed {SOURCE["measuredJourneysPerScenario"]:,} journeys. Each journey made {SOURCE["operationsPerJourney"]} requests.', 16, MUTED)
    text(62, 814, f'Every framework ran in each of {SOURCE["rounds"]} rounds. The chart shows its average requests per second.', 16, MUTED)
    text(62, 839, "Responses and order counts were checked. Data stayed in memory, with no database.", 16, MUTED)
    text(62, 881, "BENCHMARK MACHINE", 12, MUTED, "mono")
    cpu = HOST["cpu"].replace("(R)", "").replace("(TM)", "").replace("CPU ", "").replace("GHz", " GHz")
    ram = HOST["totalMemoryBytes"] / (1024 ** 3)
    text(62, 905, f'{cpu} · {HOST["logicalCpus"]} logical CPUs · {ram:.1f} GiB RAM', 16, MUTED)
    text(62, 934, "The app and test client shared this PC. Other apps were running and could affect the results.", 14, "#857c83")
    svg.append('</svg>')
    output = "benchmark-validated" if mode == "validated" else "benchmark-no-payload-validation"
    (OUTPUT / f"{output}.svg").write_text("\n".join(svg))
    image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS).save(OUTPUT / f"{output}.png")
    return "\n".join(svg)


validated = render_chart("validated")
plain = render_chart("plain")
html = '''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nile — framework throughput benchmark</title>
<style>
:root{color-scheme:dark;background:#0d0b0c;color:#eee9eb;font-family:"Fira Sans",sans-serif}
*{box-sizing:border-box}body{margin:0;padding:28px 16px 42px}main{max-width:1040px;margin:auto}
.controls{display:flex;gap:8px;align-items:center;padding:0 20px 14px;flex-wrap:wrap}
input{position:absolute;opacity:0;width:1px;height:1px}label{padding:9px 14px;border:1px solid #45343f;color:#bdb3ba;font-size:14px;cursor:pointer}
#validated:checked~.controls label[for=validated],#plain:checked~.controls label[for=plain]{border-color:#38bdf8;color:#fff;background:#10232c}
input:focus-visible~.controls label{outline:2px solid #fff;outline-offset:3px}
.figure{display:none}#validated:checked~.validated,#plain:checked~.plain{display:block}
svg{width:100%;height:auto;display:block}.downloads{display:flex;gap:22px;padding:12px 20px;font-size:14px;flex-wrap:wrap}
a{color:#bdb3ba;text-underline-offset:4px}a:hover{color:#38bdf8}.note{padding:8px 20px;color:#8d818a;font-size:13px;line-height:1.7}
@media(max-width:600px){body{padding:16px 0}.controls,.downloads,.note{padding-left:18px;padding-right:18px}}
</style></head><body><main>
<input type="radio" name="mode" id="validated" checked><input type="radio" name="mode" id="plain">
<div class="controls"><label for="validated">Validation on</label><label for="plain">Validation off</label></div>
<section class="figure validated" aria-label="Payload validation on">VALIDATED_SVG<div class="downloads"><a href="benchmark-validated.png" download>Download PNG</a><a href="benchmark-validated.svg" download>Download SVG</a><a href="RANKING_LINK">Methodology / rankings</a></div></section>
<section class="figure plain" aria-label="Payload validation off">PLAIN_SVG<div class="downloads"><a href="benchmark-no-payload-validation.png" download>Download PNG</a><a href="benchmark-no-payload-validation.svg" download>Download SVG</a><a href="RANKING_LINK">Methodology / rankings</a></div></section>
<p class="note">We used one setup for each framework and checked the responses and order counts. <a href="RANKING_LINK">Full rankings</a> · <a href="DATA_LINK">Raw numbers and pairwise ratios</a>. Previously measured data; no new timing run.</p>
</main></body></html>'''.replace("VALIDATED_SVG", validated).replace("PLAIN_SVG", plain).replace(
    "RANKING_LINK", escape(Path(os.path.relpath(RANKINGS.parent / "RANKING.md", OUTPUT)).as_posix(), quote=True)
).replace("DATA_LINK", escape(Path(os.path.relpath(RANKINGS, OUTPUT)).as_posix(), quote=True))
(OUTPUT / "index.html").write_text(html)
print(OUTPUT / "index.html")
