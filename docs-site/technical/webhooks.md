# Webhooks

A webhook sends a club's or a competition's results to another system as soon as they're published: a club's own website, a league's results table, a chat bot. FH Match Centre posts each change to an address you choose, and signs it, so the receiver can be sure it came from here.

- **A club's webhook** hears about every match one of the club's teams plays (once both teams are linked, a match is heard about by both clubs). Its club admins add it from **Dashboard → webhooks**, and admins from **Admin → Webhooks**.
- **A competition's webhook** hears about every match whose competition has that name, in any capitals. Only admins add these, for example for a league secretary.

There can be up to 5 for each club or competition. Only published matches are sent: a draft never is.

## Events

| Event | When | `data` |
| --- | --- | --- |
| `match.published` | An umpire publishes a match | `match` and `summary` |
| `match.updated` | A published match changes: a new revision, umpire 2 set or removed, or an admin merging duplicate teams, venues or competitions | `match` and `summary` |
| `match.unpublished` | A published match is made a draft again | `matchId` only |
| `match.deleted` | An admin deletes a published match | `matchId` only |
| `ping` | Someone presses **Send test** | Nothing |

A match can be heard about first as `match.updated`, for example when an umpire links a published match's team to your club. Treat `match.published` and `match.updated` the same: store the match as given, replacing any copy you have. When a match is unpublished or deleted, remove it.

## What's sent

Each delivery is a `POST` with a JSON body:

```json
{
  "id": "6a1f…",
  "event": "match.published",
  "createdAt": "2026-10-11T15:42:03.120Z",
  "data": {
    "match": {
      "id": "01a0d411-fdbd-7e09-8e61-631dc586ceed",
      "status": "published",
      "playedAt": "2026-10-11T13:00:00.000Z",
      "home": { "name": "Oxford Hawks M1", "teamId": "…", "score": 3, "shootout": null },
      "away": { "name": "Reading M1", "teamId": "…", "score": 1, "shootout": null },
      "venue": "Banbury Road, Oxford",
      "competition": "South League Premier",
      "umpires": [{ "slot": 1, "userId": "…", "name": "Sam Taylor" }],
      "shareUrl": "https://app.fhmatchcentre.com/m/K7P2QX",
      "…": "…"
    },
    "summary": { "score": { "home": 3, "away": 1 }, "periodScores": […], "cards": {…}, "timeline": […], "…": "…" }
  }
}
```

`match` is the same as `GET /v1/matches/:id` gives, and `summary` the same as its `summary`: the score, each period's score, the shootout, penalty corners and strokes, cards and the timeline of events. For the full match document, fetch `GET /v1/matches/:id` (no sign-in is needed for a published match). See [The match format](technical/match-format.md).

The headers say what it is:

| Header | |
| --- | --- |
| `X-FH-Event` | The event, e.g. `match.published` |
| `X-FH-Delivery` | The delivery's ID, the same as the body's `id`. A retry has the same one, so use it to ignore repeats |
| `X-FH-Signature` | `t=<time>,v1=<signature>` (below) |
| `User-Agent` | `FH-Match-Centre-Webhooks/1.0` |

## Checking the signature

When a webhook is added, you're shown its **secret** once (it starts `whsec_`). Keep it on the receiver. **New secret** replaces it, and the old one stops working straight away.

`X-FH-Signature` is `t=` the time it was sent (seconds since 1970) and `v1=` the HMAC-SHA256 of the time, a full stop and the raw body, keyed with the secret, in hex. To check it, work out the same and compare, and turn away anything more than 5 minutes old, so a delivery someone copied can't be sent again later. In Node:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

/** `body` is the request body exactly as received, before parsing it. */
function isGenuine(body, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return v1?.length === expected.length && timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}
```

And in Python:

```python
import hashlib, hmac, time

def is_genuine(body: bytes, header: str, secret: str) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    if abs(time.time() - int(parts["t"])) > 300:
        return False
    expected = hmac.new(secret.encode(), f"{parts['t']}.".encode() + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(parts.get("v1", ""), expected)
```

## Delivery and retries

- Changes are sent within half a minute, in the order they happened.
- Answer with any `2xx` status within 10 seconds. Anything else, including a redirect, counts as a failure.
- A failed delivery is tried again after 1 minute, 5 minutes, 30 minutes, 2 hours and 6 hours: 6 attempts in all over about 8½ hours. Because of retries, a later change can arrive before an earlier one that failed; compare the match's `updatedAt` if the order matters to you.
- After 5 deliveries in a row have failed for good, the webhook is turned off, and nothing more is queued for it. Fix the receiver, then **Turn on** (which clears the failures) and **Send test**.
- Each webhook's page lists its last deliveries, with the receiver's answer or the error. Deliveries are kept for 30 days.

The address must start with `https://` and be on the public internet. Addresses on the server's own network (`localhost`, `192.168.…`, `10.…` and the like) are refused, when the webhook is added and again on every delivery, wherever the name leads.

## API

| | Route | |
| --- | --- | --- |
| 🏷️ | `GET /webhooks?clubId=` · `?competitionId=` | A club's (its admins, admins) or a competition's (admins) webhooks. With neither, admins get all of them and club admins their club's |
| 🏷️ | `POST /webhooks` | Add one: `{ clubId \| competitionId, url, description? }`. Answers `{ webhook, secret }`; the secret isn't shown again |
| 🏷️ | `PATCH /webhooks/:id` | Change `{ url, description, enabled }`. Turning it back on clears its failures |
| 🏷️ | `DELETE /webhooks/:id` | Delete it and its deliveries |
| 🏷️ | `POST /webhooks/:id/secret` | A new secret, `{ webhook, secret }` |
| 🏷️ | `POST /webhooks/:id/ping` | Queue a `ping` |
| 🏷️ | `GET /webhooks/:id/deliveries` | The last 50 deliveries, newest first |

🏷️ is the club's admins for a club's webhooks, and admins for any. Every change to a webhook is in the [audit log](technical/api.md?id=admin-audit-log), without its secret.
