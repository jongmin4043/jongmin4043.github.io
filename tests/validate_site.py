from html.parser import HTMLParser
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]


class AssetParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.assets = []
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if "id" in values:
            self.ids.add(values["id"])
        if tag in {"script", "img"} and values.get("src"):
            self.assets.append(values["src"])
        if tag == "link" and values.get("href"):
            self.assets.append(values["href"])


required_ids = {
    "pipeline-chart",
    "pipeline-mode",
    "paper-trades-body",
    "stream-status",
    "health-public",
}
failures = []

for html_path in ROOT.glob("*.html"):
    parser = AssetParser()
    parser.feed(html_path.read_text(encoding="utf-8"))
    for asset in parser.assets:
        if asset.startswith(("http://", "https://", "#", "mailto:")):
            continue
        clean_asset = asset.split("?", 1)[0].split("#", 1)[0]
        if clean_asset and not (ROOT / clean_asset).exists():
            failures.append(f"{html_path.name}: missing local asset {clean_asset}")
    if html_path.name == "data-pipeline.html":
        missing_ids = required_ids - parser.ids
        if missing_ids:
            failures.append(f"data-pipeline.html: missing IDs {sorted(missing_ids)}")

if failures:
    print("\n".join(failures), file=sys.stderr)
    raise SystemExit(1)

print("site asset validation passed")
