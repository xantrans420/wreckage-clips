# LEAN.SYS

A personal recomp tracker for **one operator**. Not a generic fitness app — a
hard-coded implementation of a specific protocol. No social, no gamification, no
marketplace, no accounts, no cloud. Dark HUD / terminal aesthetic, single orange
accent (`#ff5a00`), monospace, zero border-radius.

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

## Run

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

## Config — seeded on first launch

The owner profile is pre-loaded (editable in **SYS**). Two things are asked on
first launch:

| Field | Default | Notes |
|---|---|---|
| Height | 197 cm | |
| Start weight | 95 kg | live — drives all targets |
| Age | 35 | **confirmed in onboarding** |
| Sex | male | |
| Activity × | 1.375 | 3× gym + daily walking |
| Deficit | 300 kcal | easy. never raised for this profile. |
| `equipment` | **asked on first launch** | `free_weights` \| `machines_only` |
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

At 95 kg / 197 cm / 35: maintenance ≈ 2,720 · cut ≈ 2,420 · protein ≈ 180 g/day.

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
health_daily · session_log · meta`. Targets are derived from `profile`, never
stored. See `src/db/database.ts`.

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
