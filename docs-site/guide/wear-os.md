# The Wear OS watch app

For Wear OS 3 and later: Samsung Galaxy Watch 4 and newer, Google Pixel Watch. The layout follows MatchGear's, so it'll feel familiar if you've used that.

## Home

- **New match**: set one up on the watch.
- **Setup on phone**: opens the setup screen in the phone app, where you type the teams; tap **Send to watch** there and the setup opens on the watch to check.
- **Back to match**: when one is in progress.
- **Past matches**: finished matches, and whether your phone has each one yet.
- **Settings**: see [Settings](guide/wear-os.md?id=settings).

## Setting up a match

| Setting | |
| --- | --- |
| **Format** | Tap to cycle through 4 × 15 min, 2 × 35, 2 × 30 and 2 × 25. Or set the periods and length yourself. |
| **Periods**, **Period length** | Any number of periods (1 to 8), each 1 to 90 minutes. |
| **Breaks**, **Half-time** | The break after each period. With quarters, the one after Q2 is half-time. |
| **Teams** | Tap a team to rename it (keyboard or voice). Pick each team's colour. |
| **Captain** | Optional: the captain's shirt number. |
| **Venue** | Optional. |
| **Competition** | Optional. Usually filled in from the phone, which has the list of competitions. |
| **Shootout if drawn** | Offers a shootout at full time when the score is level. |

Tap **Ready**. The watch remembers these choices for next time.

## The match screen

Swipe left and right between four pages. Swiping right from **Timing** goes back home; the match carries on.

### Timing

The clock, the period, the score and any suspensions running, soonest first (for example `A10 1:47`: away player 10, 1 minute 47 left).

The small number beside the period (`Q2 · 23′`) is the match minute: time played in all periods together.

The clock counts down by default; switch to counting up in Settings. It turns **amber** when stopped and **red** at time up.

### Starting and stopping the clock

On a **Galaxy Watch**, press the **lower side button**. It works on every page:

| When | The button… |
| --- | --- |
| Before kickoff | Starts the first period |
| In a period, clock running | Stops the clock (a stoppage) |
| In a period, clock stopped | Restarts it |
| Time is up | Ends the period |
| In a break | Moves on to the next period, without starting it |
| Next period up, not started | Starts it |
| In a shootout | Starts or stops a shoot-out's 8 seconds |

Watches without a usable button (a Pixel Watch, say): turn on **Start/stop on screen** in Settings for a button on the Timing page.

### Breaks and the next period

When a period ends, the break clock counts down. A **Next: Q2** button (or H2, P2) is on the Timing page throughout the break, whether or not you have the on-screen Start/stop button turned on.

Tapping it — or pressing the side button — moves the watch on to the next period and shows it at **Q2 · ready**, with the clock at the full period length and **not running**. It starts when you press the side button again, or tap **Start Q2**, so the clock begins with the whistle rather than with the end of the break.

Stoppages don't count towards the period, and the watch keeps perfect time through them, with the screen off, and even if the app restarts or the watch reboots.

### Goals

The score and a **+1** button for each team. Then:

1. The **scorer**: type the shirt number, or **None** if you didn't see.
2. **How**: field goal, penalty corner, penalty stroke, or **Skip**.

A stroke goal also records the stroke. For ten seconds afterwards an **Undo** button takes it back.

### Cards

Tap **+**, then:

1. The **team**.
2. The **card**: green (2 min), yellow (5 or 10 min) or red (rest of the match). The lengths can be changed per match on the phone.
3. The **player**: the shirt number is needed. If the player already has a card this match, the watch shows it and asks before carrying on.
4. **Why** (optional): danger, breakdown of play, physical misconduct, dissent, or other.

Suspensions count down **only while the clock runs**, so they pause for stoppages and breaks and carry over into the next period, as the rules say. The watch buzzes when one ends. The page lists current suspensions (with **paused** while the clock is stopped) and earlier cards.

### Settings (during a match)

- **Clock counts down**, **Start/stop on screen**.
- **Events**: everything recorded so far. Tap a goal or card to cancel it; cancelled ones stay, struck through.
- Whether your **phone is in reach**, and a button to send earlier matches that haven't gone yet.
- **Cancel match** (before kickoff), **End Q2 early**, **End match**. These ask first, as they can't be undone.

## Vibrations

You can tell them apart without looking:

| You feel | It means |
| --- | --- |
| One buzz | The clock started or stopped; a suspension is over |
| Two buzzes | Two minutes left in the period |
| Three buzzes | One minute left |
| Long, short, short, long | Time up: the end of the period, or of a shoot-out's 8 seconds |
| Four quick buzzes | The end of a break |

They're alarms, so Do Not Disturb doesn't silence them.

## Full time and shootouts

After the last period, **Full time** offers **End match**, and **Shootout** if the score is level and it was set up.

The shootout follows the FIH shoot-out competition:

- **The first shoot-out** is whichever team you tap, so tap the team that won the toss and chose to go first. From then on the watch only offers the team that's up: the teams alternate, five each, stopping early once one side can't catch up.
- **Level after five each**, it goes to sudden death in series of five with the same players. The team that went first in one series goes second in the next, and the first team ahead after the same number of shoot-outs wins.
- **The side button** times each shoot-out: press it with the starting whistle and the watch counts down the 8 seconds, then buzzes long, short, short, long. Recording the attempt stops it; pressing again stops it early.
- **Card** gives a yellow or red card (no green in a shootout). Either way the player takes no further part, so there's no timer. When it's that team's turn, **Forfeit** records a shoot-out the suspended player can't take.
- **Undo** takes back the last attempt or card.

When you end the match, the summary shows the result and whether your phone has it yet.

## After the match

The match goes to your phone automatically whenever it's in reach, even hours later and even if the phone app isn't open. The summary says **✓ On your phone** once it's there.

- **Past matches** lists them with their sync status. **Send to phone** sends one again.
- **Delete from watch** removes a match. If your phone has it, it stays there.
- The watch deletes matches 30 days after your phone has received them.

## Settings

| Setting | |
| --- | --- |
| **Clock counts down** | Time left (on) or time played (off). |
| **Start/stop on screen** | For watches without a usable side button. |
| **Record workout** | Records your heart rate, steps and distance during each match. See [Workouts](guide/workouts.md). |
| **Resend all unsynced** | Sends every match your phone hasn't confirmed. |

While the app is open the screen stays on at the brightness you've set, so the clock is always in view.
