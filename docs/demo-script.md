# Demo recording script — about 2:40 (hard ceiling 3:00)

**Why this is a script and not a video:** this machine has no screen recorder (no OBS, no ffmpeg) and the
browser I automate is not signed in to the Shopify admin, so the "draft in the admin" shot cannot be captured
here. Everything below is written to be recorded in one take by Chase on the store machine.

**Target:** 2:35, hard ceiling 3:00. 16:9, 1440×900 window, 100% zoom.

## Before you hit record

1. `cd kindred-listing-writer && npm start` — leave the terminal open, it is not filmed.
2. Open <http://localhost:4173>, then open a second tab at the store's **Products** list and filter to `Draft`.
   Log in to the admin first; the demo must never show a login screen.
3. Close every other tab, silence notifications (Windows Focus assist → Alarms only).
4. Browser at 100% zoom, window 1440×900, no bookmarks bar.
5. Pick the product you will demo: **Jade Roller + Gua Sha Set**. It already has a draft, so the save
   demonstrates the update path (one product, never a duplicate). If you would rather show creation, click
   **+ Add product** first — that adds ~20 s and a new draft to the store.
6. Have the specs text ready to paste: `Genuine jade roller and gua sha stone, gift box.`

## Shot list

| Time | Screen | Do | Say |
|---|---|---|---|
| 0:00–0:12 | App, full view | Nothing. Sit still on the queue. | "Kindred Goods writes Shopify listings from a photo and the supplier's specs. Five products are queued here; every draft in this demo is real." |
| 0:12–0:30 | Top bar + left queue | Point at the cost meter, then the queue. | "The meter is live: eleven thousandths of a dollar spent, ten dollar budget. The queue is the five holiday winners, each with a status." |
| 0:30–0:50 | Product in panel | Click **Jade Roller + Gua Sha Set**. Click the photo drop zone, choose a photo. Point at the thumbnail. | "Photo in, specs in. This is everything the model is allowed to use — it is told not to invent features, materials or claims." |
| 0:50–1:25 | Product in → Listing out | Click **Generate listing**. While the button reads "Drafting…", keep the mouse still. | "This is a live call to Muse Ember, Meta's small model. Usually fifteen to thirty seconds. It returns strict JSON — title, description, bullets, tags — not prose I have to parse." |
| 1:25–1:42 | Listing out | Fields fill. Scroll the bullets slowly. | "There it is: title, two short paragraphs, four bullets, six search tags. All of it grounded in the specs I pasted." |
| 1:42–2:00 | Listing out | Change the bullet "Includes a roller" to "Includes a jade roller". | "I can edit any field before it goes anywhere. Edits stick per product." |
| 2:00–2:18 | Listing out, bottom | Click **Save as Shopify draft**. Wait for the line under it. | "One click creates a draft product — status draft, never published. Saving again updates the same product instead of making a second one." |
| 2:18–2:32 | Shopify admin, product page | Show the product: title, **Draft** badge, tags, description. Scroll once. | "Here it is in the store: draft, unpublished, the tags we generated, the bullets as a list. Nothing is live." |
| 2:32–2:40 | Admin, back to app | Cut back to the app, trace panel visible. | "Every call is logged with its tokens and cost" — point at the meter — "eighteen thousandths of a dollar for the whole build." |

## Narration notes

- Speak at about 140 words per minute; the script above is ~330 words, which fits 2:35 with pauses.
- Do not narrate while the Generate call is running — one sentence, then silence. Dead air on a live call reads as real.
- Move the mouse in straight lines and pause one beat after every click so the viewer's eye can follow.
- Never open the Shopify admin's "Publish" menu. The point is that nothing publishes.

## If a step fails on camera

Stop the take. Check the terminal for the error, fix it, start over. Do not narrate around a broken step.

## Optional 20-second insert (creation instead of update)

At 0:30, instead of selecting an existing product: click **+ Add product**, type a name and the specs,
pick a photo, click **Add product**, then continue from Generate. The save then reports "Draft created".
The rest of the script is unchanged.
