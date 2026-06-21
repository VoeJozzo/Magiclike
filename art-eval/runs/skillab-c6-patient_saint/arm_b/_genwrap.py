#!/usr/bin/env python3
"""Tiny wrapper: build the spec dict in Python (no shell-escaping of JSON),
then hand it to art-eval/gen_image.py's generate(). DELETE when done."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
from importlib.machinery import SourceFileLoader
gi = SourceFileLoader("gen_image", os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "gen_image.py")).load_module() \
    if False else None

# Load gen_image.py by path (it lives at art-eval/gen_image.py)
GEN = os.path.join(os.path.dirname(__file__), "..", "..", "..", "gen_image.py")
GEN = os.path.abspath(GEN)
gen_image = SourceFileLoader("gen_image", GEN).load_module()

OUT = os.path.abspath(os.path.dirname(__file__))
CARD = "patient_saint"

SPECS = {
 1: {"gen":1,"seed":1831245621,"mode":"explore","parent":None,
     "prompt":"A serene saint in flowing cream-white linen robes with frayed gold-thread hems, kneeling in patient prayer, hands cupped open at the chest. A thin slow font of warm golden healing light wells up from the cupped hands and pools across the cracked marble floor, and a faint pale-gold halo ring hovers behind the bowed head. The saint is utterly still, eyes closed, at rest in eternal vigil. The background is a ruined moonlit chapel with broken stone arches and a single high window; the only source of light is the soft golden glow from the saint's hands."},
 2: {"gen":2,"seed":2012942517,"mode":"explore","parent":None,
     "prompt":"A translucent ghostly spirit-saint in tattered pale-grey burial vestments, kneeling and faintly transparent so the stone behind shows through, hands clasped in patient prayer. A single soft point of cool white light glows at the spirit's chest, and slow drifting motes of pale healing light rise upward like a held breath. A thin moonlit halo rings the bowed hooded head. The figure is silent, immobile, keeping an endless vigil. The background is a dark worn stone shrine with a guttering candle; the only source of light is the spirit's cool white inner glow."},
 3: {"gen":3,"seed":11439880,"mode":"explore","parent":None,
     "prompt":"A broad-shouldered guardian cleric in weathered ivory-and-gold ceremonial plate armor, standing planted and rigid, facing the viewer, feet wide, immovable. A translucent dome of pale golden light arcs protectively overhead. One gauntleted hand rests open at the side, a faint warm glow seeping from the palm. The cleric never strikes, only holds the line. The background is a breached stone gateway at dusk with rubble at the feet; warm torchlight rakes across the armor from the left."},
 4: {"gen":4,"seed":598201739,"mode":"explore","parent":None,
     "prompt":"Close-up of an elderly saint's serene face and cupped weathered hands, eyes gently closed in patience, framed three-quarter. A single bright bead of warm golden healing light rests in the cupped palms, casting a soft glow up onto the wrinkled face and a thin gold halo behind the head. White hair and a plain cream cowl. The background is the dim interior of a stone chapel softly out of focus; the only source of light is the golden bead in the hands."},
 5: {"gen":5,"seed":1681165825,"mode":"explore","parent":None,
     "prompt":"A spectral saint floating cross-legged in calm meditation a hand's breadth above a worn shrine floor, faintly translucent pale-blue spirit body, hands resting open on the knees. A slow steady ribbon of soft white healing light curls upward from the chest into the dark. A thin luminous halo rings the serene downturned face. The background is a moonlit ruined cloister with ivy on broken columns; the only source of light is the saint's pale spectral glow."},
}

want = [int(x) for x in sys.argv[1:]]
for n in want:
    gen_image.generate(CARD, OUT, SPECS[n])
