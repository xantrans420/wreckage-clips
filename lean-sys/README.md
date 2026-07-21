# LEAN.SYS

A personal recomp tracker for **two operators on one device** — you and your
wife, each with a separate log, split, weigh-ins and photos, one tap apart. Not a
generic fitness app — a hard-coded implementation of a specific protocol. No
social, no gamification, no marketplace, no accounts, no cloud. Dark HUD /
terminal aesthetic, single orange accent (`#ff5a00`), monospace, zero
border-radius.

Runs on **iPhone and Android** from one codebase. Each operator has their own
sex (the BMR formula switches male/female), body stats and targets; a switcher
at the top of every screen flips between them.

The hero number on the home screen is **protein remaining today**. The core rule
the app reinforces everywhere: `protein → stay near target → lift hard → walk →
sleep`. Abs are built in training, revealed in the kitchen.

> Local-first by design. Nothing leaves the device — the progress photos are
> half-naked mirror shots and there is no upload path anywhere in the code.

---

## Stack

- **Expo (React Native) + TypeScript** — one codebase, iOS + Android.
- **expo-sqlite** — all data lives in one on-device SQLite file. No backend.
- **expo-image-picker + expo-file-system** — progress photos, stored in the
  app's private documents dir, never uploaded.
- **expo-notifications** — quiet gym-day / weigh-in nudges.
- **react-native-svg** — hand-rolled weight trend chart (kept light).
- **HealthKit / Health Connect** — read-only, behind one `HealthProvider`
  interface (Phase 3). Optional — the app is fully usable on manual entry.

## Web build (open in a browser now — with an AI coach)

`lean-sys/web/index.html` is a **single self-contained web app** — no toolchain, no
phone. Double-click it (or host it anywhere static) and it runs: FUEL / TRAIN /
BODY / HOME / SYS, the two-operator switcher, weight trend, and progress photos,
all persisted in the browser (localStorage; photos in IndexedDB — nothing is
uploaded).

**Snap-to-log (FUEL):** tap "Estimate from a photo", point at your plate, and
Claude's vision estimates the food's name, calories, and **protein grams** — it
prefills the log form so you review and tap **Log it**. The photo is sent to the
API for the estimate only, never stored. Needs the API key (below).

It also adds a **COACH** tab wired to an LLM: the coach knows your protocol,
targets, and today's log, and answers in the app's plain terminal voice. It calls the
Anthropic API directly from the browser using **your own API key** (from
console.anthropic.com), stored only on your device and sent only to
`api.anthropic.com` — set it in **SYS**. Model defaults to Claude Opus 4.8; switch
to Sonnet or Haiku there to cut cost. **SYS → Export** writes a JSON backup
(clearing browser data wipes everything, so back up first).

**The journey (BODY):** shoot the same angle each week — front / side / relaxed —
and the app builds a **time-lapse reel** that plays your photos in order,
START → weekly → NOW, captioned with the week, date and weight. It's the
"how have you grown" story, and it makes the flat-scale recomp visible.
**Export shareable video** renders the reel to a real file on your device
(`.mp4` where the browser supports it, else `.webm`) with title/end cards and
per-frame captions — no server, no library. **Weekly reminder:** pick a photo
day in SYS and **add it to your phone calendar (.ics)** — a repeating weekly
event with an alarm that fires even when the app is closed (the reliable path);
an in-app "photo day" banner also appears when you're due.

BODY also carries the motivation layer: your editable **mission** ("why" —
defaults to being able to run and play with your kids in 10 years), a **protein
streak**, **weeks-in / sessions** counts, unlockable **milestone** badges, and a
rotating deck of health-span facts. The mission also shows on HOME.

> The native Expo app below is the fuller build (health/watch sync, notifications).
> The web build is the "use it today, with a coach" path. They don't share storage.

## Run (native Expo app)

```bash
cd lean-sys
npm install
npx expo start            # scan the QR with Expo Go (Phases 1–2 work here)
# or: npx expo run:ios / npx expo run:android for a native dev build (Phase 3)
```

Typecheck / bundle sanity:

```bash
npx tsc --noEmit
npx expo export --platform ios --output-dir /tmp/leansys-export
```

> **Expo Go vs dev build.** Phases 1 & 2 (FUEL / TRAIN / BODY / SCHEDULE) run in
> Expo Go. The WATCH module needs the native health modules (below), which are
> not in Expo Go — install them and use a dev build. Without them the app
> degrades gracefully to manual entry; it never hard-crashes.

## Two operators

Both operators are **seeded at launch — nothing is asked**:

- **Operator 1 (primary)** — fully seeded: male, 197 cm / 95 kg / 36, free
  weights, gym Mon/Wed/Fri, the A/B/C split and "My foods". The app opens
  straight to Op1's log.
- **Operator 2 (secondary)** — a female / 38 profile stub. Height, weight and
  deficit are **collected on setup** (switch to her via the top pills and the
  setup screen appears), and her **training plan is intentionally empty** — the
  app never invents one. Assign the standard A/B/C split on demand from TRAIN
  ("Assign A/B/C split"), then edit it freely.

Every data table is scoped by operator, so the two logs never mix. The
**switcher pills** at the top of HOME / FUEL / TRAIN / BODY flip whose data
you're viewing; SYS is where you switch, edit, add, or delete an operator.
Equipment is locked to free weights for Op1 but the machine-swap map is
toggleable per operator in SYS. Health data maps to whoever is active (one watch
per person). Reset is available per-operator or for everyone.

## Config — Operator 1 (seeded, not asked)

Operator 1 is fully pre-loaded on first launch — no onboarding questions —
editable afterwards in **SYS**:

| Field | Value | Notes |
|---|---|---|
| Height | 197 cm | |
| Start weight | 95 kg | live — drives all targets |
| Age | 36 | |
| Sex | male | |
| Activity × | 1.375 | 3× gym + daily walking |
| Deficit | 300 kcal | easy. never raised for this profile. |
| Equipment | `free_weights` | locked; machine-swap map toggleable per operator |
| Gym days | Mon / Wed / Fri | editable |

`platform` (iOS vs Android) is not a stored choice — the app picks HealthKit or
Health Connect automatically from `Platform.OS` behind the `HealthProvider`
abstraction.

### Computed targets (Mifflin-St Jeor)

Targets are **computed, never stored** — they self-update the moment weight
changes.

```
BMR (male)  = 10*kg + 6.25*cm - 5*age + 5
Maintenance = BMR * activity_mult
Cut target  = Maintenance - deficit
Protein     = bodyweight_kg * 1.9        (high — protects muscle during recomp)
```

At 95 kg / 197 cm / 36: maintenance ≈ 2,720 · cut ≈ 2,420 · protein ≈ 180 g/day.

## Modules

- **HOME** — protein remaining (hero) + calories, today's session in the A/B/C
  rotation, steps / sleep / resting-HR recovery panel, priority-order reminder.
- **FUEL** — food log (protein mandatory), protein hero readout, "My foods"
  one-tap quick-add (seeded), plate-formula + batch-prep reference cards.
- **TRAIN** — the hard-coded posture-biased A/B/C split. Per-set weight × reps,
  last session shown as the number to beat, auto "ADD WEIGHT" flag when every
  set caps the rep range. `machines_only` auto-swaps the free-weight movements.
- **BODY** — weekly weigh-in with a trend line (not daily noise) + total change,
  3-angle progress photos (front / side / relaxed-front), side-by-side compare
  of any two dates with an optional ghost overlay to line up the pose.
- **SYS** — live targets, operator edit, equipment, gym-day schedule +
  notifications, WATCH/health connect + status, and a local data reset.

## WATCH — Garmin via the health platform (Phase 3)

There is no clean public Garmin API for a personal app, so LEAN.SYS **does not
integrate Garmin directly**. Garmin Connect already syncs to Apple Health /
Health Connect automatically; the app reads from the OS store.

One-time setup, shown in-app: *Garmin Connect → Settings → connect to Apple
Health / Health Connect.*

`HealthProvider.getDailyMetrics(date)` returns
`{ steps, activeKcal, restingHR, sleepHours, workouts[] }`, implemented by
`HealthKitProvider` (iOS) and `HealthConnectProvider` (Android). A recorded
strength/gym workout auto-marks that day's training session done. HRV / body
battery / training load may not cross the health-platform bridge — an accepted
v1 tradeoff.

To enable it, add the native modules and use a dev build:

```bash
npx expo install react-native-health react-native-health-connect
```

They are intentionally **not** in `package.json` so Phases 1–2 stay Expo-Go
runnable; the providers load them lazily and fall back to manual entry when
absent.

## Data model (SQLite)

`profile · food_log · saved_food · exercise · lift_log · weight_log · photo ·
health_daily · session_log · meta`. The `profile` table is the spec's `operator`
(and `profile_id` its `operator_id`) — same shape, kept under the original name
to avoid a rename migration. Every data table carries a `profile_id`
(FK → `profile`, `ON DELETE CASCADE`) so the two operators stay fully separate;
the active operator is stored in `meta`. Op1 is seeded with the split; Op2 is
seeded as a profile with **no exercises** (empty, assignable). Targets are
derived from each operator, never stored. Schema is versioned with an in-place
v1→v2 migration. See `src/db/database.ts`.

## Non-goals

No social/sharing, no accounts, no cloud upload of photos (ever, without opt-in
E2E encryption), no macro obsession beyond protein, no AI coach chatbot, no
direct Garmin API, no calorie-database API. Small surface, fast app.

## Layout

```
lean-sys/
├─ App.tsx · index.ts · app.json
├─ src/
│  ├─ theme.ts · types.ts
│  ├─ domain/       targets · seed · rotation · progression · dates · photos
│  ├─ db/           database (schema+migrations+seed) + repositories/
│  ├─ health/       HealthProvider + HealthKit/HealthConnect impls
│  ├─ notifications/schedule
│  ├─ context/      AppContext (profile + live targets)
│  ├─ components/   HUD ui · HeroNumber · Bar · TrendChart · ExerciseLogger · PhotoCompare
│  ├─ screens/      Onboarding · Home · Fuel · Train · Body · Sys
│  └─ navigation/   RootNavigator (bottom tabs)
```
