#!/usr/bin/env python3
"""Build the self-contained board mockup.

Inlines the real card frames, P/T boxes and card art from the html-proto
(as data: URIs) plus the card data the mockup scenes use, into
mockup.template.html -> mockup.html. No network, no dependencies beyond
the standard library.

Run from anywhere:  python3 docs/design/board-tapestry/build.py
"""
import base64
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PROTO = ROOT / "reference" / "html-proto"

# Cards the scenes use. Oracle text is hand-written here (the proto
# generates it from effects at runtime); keep it short.
CARDS = {
    "grizzly_bears": "",
    "goblin_chieftain": "Haste. Other Goblins you control get +1/+1 and haste.",
    "blood_knight": "First strike, trample.",
    "llanowar_elves": "Tap: add G.",
    "great_stag": "",
    "shivan_dragon": "R: +1/+0 until end of turn.",
    "giant_growth": "Flash. Target creature you control gets +3/+3 until end of turn.",
    "warrior_champion": "First strike, haste.",
    "shock": "Flash. Deal 2 damage to any target.",
    "lightning_bolt": "Flash. Deal 3 damage to any target.",
    "vampire_nighthawk": "Flying, deathtouch, lifelink.",
    "morticians_assistant": "When this dies, return a creature card from your graveyard to your hand.",
    "soul_reaper": "Flying. Whenever another creature dies, gain 1 life.",
    "merfolk_looter": "Tap: draw a card, then discard a card.",
    "dread_wraith": "Flying.",
    "doom_blade": "Flash. Destroy target nonblack creature.",
    "forest": "Tap: add G.",
    "mountain": "Tap: add R.",
    "island": "Tap: add U.",
    "swamp": "Tap: add B.",
    "phylactery": "",
}

LAND_COLOR = {"Forest": "g", "Mountain": "r", "Island": "u", "Swamp": "b", "Plains": "w"}
CARD_TYPES = {"Basic", "Legendary", "Artifact", "Creature", "Land", "Sorcery",
              "Instant", "Enchantment"}


def data_uri(path: pathlib.Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()


def frame_color(card: dict) -> str:
    cost = card.get("cost") or {}
    cols = [k for k in "WUBRG" if k in cost]
    if len(cols) == 1:
        return cols[0].lower()
    for t in card.get("types") or []:
        if t in LAND_COLOR:
            return LAND_COLOR[t]
    return "c"


def type_line(types: list) -> str:
    main = [t for t in types if t in CARD_TYPES]
    sub = [t for t in types if t not in CARD_TYPES]
    return " ".join(main) + (" — " + " ".join(sub) if sub else "")


def main() -> None:
    cards = {}
    for cid, text in CARDS.items():
        d = json.loads((PROTO / "cards" / cid / "card.json").read_text())
        types = d.get("types") or []
        cost = d.get("cost") or {}
        cards[cid] = {
            "name": d["name"],
            "col": frame_color(d),
            "cost": {"C": cost.get("C", 0), **{k: cost[k] for k in "WUBRG" if k in cost}},
            "type": type_line(types),
            "land": "Land" in types,
            "creature": "Creature" in types,
            "p": d.get("power"),
            "t": d.get("toughness"),
            "text": text,
            "art": data_uri(PROTO / "cards" / cid / "art.png"),
        }
    frames = {c: data_uri(PROTO / "assets" / "frames" / f"frame_{c}.png") for c in "wubrgc"}
    ptbox = {c: data_uri(PROTO / "assets" / "frames" / f"pt_box_{c}.png") for c in "wubrgc"}
    payload = json.dumps({"cards": cards, "frames": frames, "pt": ptbox}, separators=(",", ":"))

    tpl = (HERE / "mockup.template.html").read_text()
    out = tpl.replace("/*__ASSETS__*/null", payload)
    assert out != tpl, "asset placeholder not found in template"
    (HERE / "mockup.html").write_text(out)
    print(f"wrote {HERE / 'mockup.html'} ({len(out) // 1024} KB, {len(cards)} cards)")


if __name__ == "__main__":
    main()
