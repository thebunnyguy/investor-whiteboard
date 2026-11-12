# The six maps

Every company gets these six, in this order. Each answers one question a person would actually ask. Keep each to about 12 boxes (the tool allows 16, and the Thesis map often needs 13 or 14): a map someone can take in at a glance is worth more than a complete one.

Links usually run left to right, but they may point either way. An arrow always points at the thing being acted on: evidence points at the pillar it supports, a risk at what it threatens. For `depends`, draw the link the way things flow (supplier to company); the dashed blue line says the receiver could not easily replace it.

A `question` box (something you could not find out) is linked like any other box, with an ordinary labelled link such as "not disclosed".

All of them read left to right in named columns, except Competition, which puts the company in the middle.

Colour is decided by the kind of box, so choose kinds by what the thing *is*:

- **Black** is the company and its own parts: `company`, `product`, `process`, `channel`, `asset`.
- **Blue** is the world outside: `customer`, `supplier`, `input`, `partner`, `tech`.
- **Green** is money coming in and what helps: `revenue`, `profit`, `cash`, `strength`, `evidence`.
- **Red** is money going out and what hurts: `cost`, `competitor`, `substitute`, `entrant`, `risk`.
- **Yellow** is what to keep an eye on: `signal`, `question`.
- The Thesis map adds `claim` (the idea) and `pillar` (what must be true).

---

## 1. Business (`business`)

**Question:** What does it sell, and who buys it?

**Columns:** The company → What it sells → How it reaches buyers → Who buys.

**Boxes:** one `company` box, two to four `product` boxes (its main lines), the `channel` boxes that matter (own shops, dealers, distributors, an app, a sales team), and the main `customer` groups. Draw it first without figures. Once you have them, send it again with each product's share as its `value`: share of sales if the company publishes that, otherwise share of units sold, and say which ("38 of every 100 cars").

**Links:** "makes", "sold through", "sells to". Link each product only to the channels that carry most of it, so the main paths stand out.

**Must show:** which product line brings in the most money, and which path from product to buyer is the main one.

**Walk-through:** start with the company in one sentence; what it sells and which part is biggest; how it reaches people; who buys and why they keep buying; the one path that matters most.

**Avoid:** listing every brand or subsidiary. Group them ("Paints for homes") and put the names in `detail`.

## 2. Money flow (`money`)

**Question:** For every 100 of sales, where does the money come from and where does it go?

**Columns:** Money coming in → Sales → Where it goes → What is left → Where the profit goes.

**Boxes:** `revenue` boxes for the main streams; one box for total sales (use kind `company`, with the full-year figure as its `value`); three to five `cost` boxes (the big ones only: materials, staff, selling and advertising, interest, tax); a `profit` box; and `cash` boxes for where profit goes (paid to shareholders, put back into the business, used to repay loans).

**Links:** every link that carries money is `"kind": "money"` with a `weight`: its share out of 100 of total sales, all the way through, including where the profit goes (if profit is 8 and a third of it is paid out, that link's weight is about 2.7, not 33). The board draws thick lines for big shares, so the picture itself shows where the money goes.

**Must show:** the single biggest cost, and how much of each 100 is left as profit. Write every figure as "N of every 100". Dividing one reported figure by another from the same document is still reported.

**If it doesn't add up to 100** (income that isn't sales, rounding, items you could not find): put the small pieces in one "Everything else" box marked as an estimate, and say in the summary what it covers. If something important is missing, say so in the `detail` of the box it belongs to.

**Walk-through:** money comes in; the biggest bite; the other costs; what is left; where what is left goes.

**Avoid:** accounting detail. Fold small items into one "Everything else" box. If you had to work a share out yourself, mark it `"basis": "estimate"`.

## 3. Supply chain (`supply`)

**Question:** What has to arrive, and from whom, before the product reaches the buyer?

**Columns:** What it needs → Who supplies it → Inside the company → On the way to buyers.

**Boxes:** `input` boxes (raw materials, parts, energy, for a bank: deposits, for a software firm: skilled people and computing power); `supplier` boxes; `process` and `asset` boxes for what the company itself does and owns (factories, plants, warehouses, stores); then `channel` or `customer` boxes for the last step.

**Links:** "supplied by", "made into", "shipped to". Use `"kind": "depends"` for a link the company could not easily replace.

**Must show:** the weak point. One supplier, one country, one plant or one material that the whole chain leans on. If there truly is none, say so in the last step of the walk-through.

**Walk-through:** what must arrive; where it comes from; what happens inside the company; how it gets out to buyers; the weak point.

**Avoid:** inventing supplier names. If the company does not name its suppliers, use the type ("Steel makers") and say in `detail` that names are not disclosed.

## 4. Technology (`technology`)

**Question:** What know-how makes it work, and how hard is that to copy?

**Columns:** Know-how and tools → What it makes possible → What it protects or threatens.

**Boxes:** `tech` boxes for the know-how, patents, software, machines or licences that matter; `strength` boxes for what each one makes possible; an `asset` box for what all of it adds up to (the brand, the network, the cost advantage); `risk` boxes for a technology shift or a dependence that could undo it.

**Links:** `"kind": "supports"` from know-how to what it makes possible; `"kind": "depends"` where the company relies on someone else's technology; `"kind": "threatens"` for what could undo it.

**Must show:** which piece of know-how is truly hard to copy, and which is something any rival with money could buy. Many companies have no special technology. Say so plainly: the map is then about skill, scale or licences.

**Walk-through:** what the company knows how to do; what that lets it do that others cannot; what it all protects; where it is fragile.

**Avoid:** buzzwords. "Uses AI" is not a box unless you can say what it does and what it changes.

## 5. Competition (`competition`)

**Question:** Who else wants the same buyers, and what keeps them out?

**Layout:** `"layout": "hub"`. One box has `"center": true` (the company). Every other box has a `group`, and boxes in the same group sit together around the middle with the group's name beside them.

**Groups and boxes:** "Direct rivals" (`competitor`, the two to four that matter, with what each is strong at in `sub`); "Other ways to do the job" (`substitute`); "New challengers" (`entrant`); "What protects it" (`strength`).

**Links:** each box links to the company. `"kind": "competes"` for rivals, `"threatens"` for substitutes and challengers, `"supports"` for what protects it. Label the few that need it ("undercuts on price").

**Must show:** the one rival that matters most and why, and the one thing that most protects the company.

**Walk-through:** the company in the middle; the direct rivals; pressure from the sides; what holds the line.

**Avoid:** more than four direct rivals. Say where the company stands ("second largest") only if you have a source.

## 6. Thesis (`thesis`)

**Question:** What would have to be true for this to be a good business to own, and what would break it?

**Columns:** The idea → What must be true → For and against → What to watch.

**Boxes:** one `claim` box (the idea in a few words, `"basis": "view"`); three or four `pillar` boxes (the things that must hold for the idea to work); `evidence` boxes that support a pillar (with sources) and `risk` boxes that threaten one; two or three `signal` boxes: numbers or events the investor can check each time results come out, with today's level as the `value` (with its source) and what a change would mean in `detail`. Up to 14 boxes is fine here.

**Links:** claim to pillars ("needs"); evidence to pillar `"kind": "supports"`; risk to pillar `"kind": "threatens"`; pillar to signal ("shows up in").

**Must show:** both sides. Every pillar should have something for it or against it, and at least one risk must be serious enough to break the idea.

**Walk-through:** the idea, said as an idea and not as advice; what must hold; what supports it; what could break it; how you would know.

**Never:** a buy, sell or hold view, a price target, or a size to own. This map is a way to think about the company. Say so in the first step.

---

## Extra maps

Follow-up questions get their own map with any `id` you choose (`suppliers-detail`, `versus-rival`, `debt`). Give it a `title`. The same rules apply: a question, a summary, 12 boxes or fewer, a walk-through.
