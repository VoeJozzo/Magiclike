# Elystra — art notes

`art.png` is the active card art (rendered in-game).

`art-alt-1.png` and `art-alt-2.png` are alternates kept on disk but not
referenced by `card.json`. The engine doesn't load them. They're here
because the user has a "weird concept" planned for Elystra that may
swap her art mid-run or rotate it; saving the alternates with the
card keeps them findable.

Nothing in `card.json` or engine code references the alt files. To
activate one in the future, copy or rename it to `art.png` (or update
the JSON's `art` field to point at the alt directly).
