# The format of a map

One map is one JSON object, sent with `wb map <file>` or `wb map -`.

```json
{
  "id": "business",
  "question": "What does Brightleaf sell, and who buys it?",
  "summary": "It sells packaged tea under one brand. Most goes to households through small shops.",
  "columns": ["The company", "What it sells", "How it reaches buyers", "Who buys"],
  "sources": [
    { "id": "ar25", "title": "Annual report 2025", "publisher": "Brightleaf Tea", "date": "2025-06-30", "url": "https://example.com/annual-report-2025" }
  ],
  "nodes": [
    { "id": "co", "label": "Brightleaf Tea", "kind": "company", "col": 0,
      "detail": "It does not grow tea. It blends leaves, packs them and puts its brand on them." },
    { "id": "packs", "label": "Everyday tea packs", "kind": "product", "col": 1,
      "sub": "Loose tea and tea bags for the home", "value": "71% of sales", "source": "ar25",
      "detail": "The ordinary packs people buy for home. This is where most of the money comes from." },
    { "id": "dist", "label": "Distributors", "kind": "channel", "col": 2,
      "detail": "Middlemen who carry the packs to thousands of small shops, and take a cut." },
    { "id": "homes", "label": "Households", "kind": "customer", "col": 3,
      "detail": "Families who buy a pack every few weeks and often stay with one brand for years." }
  ],
  "edges": [
    { "from": "co", "to": "packs", "label": "makes" },
    { "from": "packs", "to": "dist", "label": "sold through" },
    { "from": "dist", "to": "homes", "label": "through small shops" }
  ],
  "walkthrough": [
    { "title": "Start with the company", "focus": ["co"], "text": "Brightleaf blends and packs tea and sells it under its own name. It does not grow any." },
    { "title": "What is on the shelf", "focus": ["packs"], "text": "Everyday packs bring in about 71 of every 100 rupees." },
    { "title": "Getting it to shops", "focus": ["packs", "dist"], "text": "Local distributors carry the packs to small shops." },
    { "title": "Who buys", "focus": ["homes"], "text": "Most of it ends up in homes, where people buy the same brand again and again." }
  ]
}
```

(Brightleaf Tea is made up. All six of its maps are in `scripts/sample.json`, and `wb sample` draws them.)

## The map

| Field | Needed | What it is |
|---|---|---|
| `id` | yes | `business`, `money`, `supply`, `technology`, `competition` or `thesis` for the six base maps. Anything else (lowercase letters, digits, `-`) for an extra map. Sending a map with an `id` already on the board replaces it. |
| `title` | extra maps only | The name on the tab. Base maps have theirs. |
| `question` | yes | The one plain question this map answers. 120 characters or fewer. |
| `summary` | yes | The answer in one or two plain sentences. 240 characters or fewer. |
| `layout` | no | `"columns"` (the default) or `"hub"`. |
| `columns` | for columns | The name of each column, left to right, counting from 0. 30 characters or fewer each. |
| `sources` | when you cite | Documents this map's figures come from. A source defined on an earlier map can be cited by later ones. |
| `nodes` | yes | The boxes. 3 to 16; 12 or fewer reads best. |
| `edges` | yes | The links. |
| `walkthrough` | yes | 4 to 7 steps. |

## A box (`nodes`)

| Field | Needed | What it is |
|---|---|---|
| `id` | yes | Short, lowercase, unique in this map. |
| `label` | yes | The name on the box. 38 characters or fewer; two to five words is right. |
| `kind` | yes | What sort of thing it is (see below). It decides the colour and the small line above the label. |
| `col` | columns layout | Which column, counting from 0. |
| `center` | hub layout | `true` on exactly one box: the company. |
| `group` | hub layout | The name of the group this box sits in, such as "Direct rivals". |
| `sub` | no | One short line under the label. 72 characters or fewer. |
| `value` | no | One figure, such as "62 of every 100" or "Rs 1,400 crore". 28 characters or fewer. |
| `detail` | yes | One to three plain sentences shown when the box is clicked: what this is and why it matters. 20 to 440 characters. |
| `source` | with a `value` | The `id` of a source, or a list of them. |
| `basis` | no | `"reported"` (needs a source; the default when there is one), `"estimate"` (your own working) or `"view"` (a judgement). A `value` with no source must be an estimate or a view. An estimate may also carry the `source` it was worked out from, and a box with no `value` may still cite a `source` for what its `detail` says. |

Kinds: `company`, `product`, `process`, `channel`, `asset`, `customer`, `supplier`, `input`, `partner`, `tech`, `revenue`, `profit`, `cash`, `strength`, `evidence`, `cost`, `competitor`, `substitute`, `entrant`, `risk`, `claim`, `pillar`, `signal`, `question`, `note`.

## A link (`edges`)

| Field | Needed | What it is |
|---|---|---|
| `from`, `to` | yes | The `id`s of two boxes in this map. The arrow points at `to`. One link per pair. |
| `label` | no | A verb phrase. 32 characters or fewer. |
| `kind` | no | `flow` (the default: goods, services or work), `money`, `depends` (dashed blue: one needs the other), `competes` (red, no arrow), `supports` (green), `threatens` (dotted red). |
| `weight` | no | A share out of 100. It sets the line's thickness. Use it on every link of the Money flow map. |
| `detail` | no | A sentence shown when the link is clicked. |
| `source` | no | The `id` of a source, or a list. |

A link normally goes to the next column, but it may point either way and may skip a column, in which case it is routed around the boxes in between. When several links leave one box (or arrive at one) with the same label, the board writes the label once.

## A walk-through step (`walkthrough`)

| Field | Needed | What it is |
|---|---|---|
| `text` | yes | What happens at this step, in one or two plain sentences. 20 to 340 characters. |
| `focus` | yes | The `id`s of the boxes this step is about. They are highlighted and the view moves to them. |
| `title` | no | A few words. 60 characters or fewer. |

## A source (`sources`)

`id` (short, lowercase) and `title` are needed. `url` (must start with `http://` or `https://`), `publisher` and `date` (the date of the document, `YYYY-MM-DD` or a year) are worth giving whenever you have them. List a page as a source only if you opened it.

## What the tool refuses

It refuses a map, and says why, when: a label or text is too long; a box has no `detail`; a `kind` is unknown; a link points at a box that isn't there or repeats a pair; a figure has no source and isn't marked as an estimate; a source that is cited isn't defined; the walk-through has fewer than 4 or more than 7 steps, or a step's `focus` names a missing box; a base map lacks the boxes it needs (for example a Business map with no `customer`).

It warns, but still draws, when: there are more than 12 boxes; a box isn't linked to anything; a finance word (EBITDA, capex, moat and the like) is used without explaining it; `columns` is missing; the Money flow map has no weights.
