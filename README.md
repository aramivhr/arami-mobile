# Arami Portal (iOS + Android)

The mobile app for Arami Vacation Homes staff and owners. It mirrors the
PropManager website (`aramivhr/rent-halo-system`, built in Lovable) and uses the
same Supabase backend and logins. **It never changes the website's code**: it
only reads and writes the same data the website already uses, through each
person's own login, so database permissions (RLS) apply exactly as on the web.

## What's in version 1

| User type | Bottom tabs | Under "More" |
| --- | --- | --- |
| Super admin | Dashboard, Calendar, Messages, Inspections | Reservations, Notifications, Phone alerts, Financial |
| Admin | Dashboard, Calendar, Messages, Inspections | Reservations, Notifications, Phone alerts |
| Owner | Dashboard, Calendar, Reservations | Financial |

The tab table lives in `src/lib/access.ts`; add new user types there.

- Sign in with the website email or username, then Face ID / fingerprint.
- Dashboard, Calendar (block / unblock dates, new booking from a cell),
  Reservations (filters, confirmation, Share PDF, CSV) and Messages (Airbnb +
  Booking.com via the website's `channex-messages` function, text replies).
- Reservations can only be created, edited or deleted when they are **direct**
  bookings. Channel bookings are read-only in the app.
- Notifications list with "Last Minute Reservation" for same-day bookings.
- Inspections: a to-do list of every checkout (urgent when a guest arrives the same day), a room-by-room checklist with notes and photos, an AI-written report, Finish (damaged or missing items create a task and alert super admins), Previous inspections filtered by unit and dates, and a shareable PDF. Works offline: changes are saved on the phone and upload when there's a connection.
- Phone alerts for admins and super admins (owners never get them), with an on/off switch per alert type.
- Financial is still a placeholder.

## Run it

```bash
npm install
npx expo start          # scan the QR code with a development build
npx tsc --noEmit        # typecheck
```

Builds: `npx eas-cli build -p ios` (TestFlight) and
`npx eas-cli build -p android --profile preview` (installable APK).

## Configuration

`.env` holds the website's public Supabase URL and publishable key
(`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`). They are the same
public values the website ships to every browser.

## Try it in Expo Go (before publishing)

1. Install Node.js (LTS) on a computer, and the Expo Go app on the phone.
2. Download this repo (GitHub: Code → Download ZIP, then unzip), open a terminal in the folder.
3. `npm install`, then `npx expo start`.
4. Scan the QR code: iPhone camera, or the scanner inside Expo Go on Android.
   Phone and computer must be on the same Wi-Fi; otherwise use `npx expo start --tunnel`.

Everything works in Expo Go except phone alerts, which need a real build.

## Backend

The app uses the website's Supabase (Lovable Cloud). Its own data lives only in
`mobile_*` tables and `mobile-*` edge functions, added through Lovable:

- `mobile_devices`, `mobile_notification_settings`, `mobile_push_log`
- `mobile_inspection_templates`, `mobile_inspections`, storage bucket `mobile-inspection-photos`
- `mobile-push-dispatch` (every minute: guest-message notifications, today's inspections, Expo pushes),
  `mobile-inspection-summary` (AI report), `mobile-inspection-complete`

## Phone alerts setup (once, before the first build)

1. `npx eas init` links the app to an Expo project; push tokens need its project id.
2. iOS: `npx eas credentials` creates the push key with the Apple developer account.
3. Android: create a Firebase project, add an Android app `com.aramivhr.portal`, put
   `google-services.json` in the repo root, add `"googleServicesFile": "./google-services.json"`
   under `android` in app.json, and upload the FCM V1 service-account key with `npx eas credentials`.

## Tests

`npm test` runs 10,589 generated test cases (seeded, so the same every run):

- the app's access, login, overlap check and change summaries against the website's own code
  (copied read-only into `tests/web` by `npm run test:web-refresh`);
- dates, Last Minute labels and alert taps;
- the checklist and the website's `mobile-inspection-complete` function;
- the inspection PDF (escaping, counts);
- 1,000 offline scenarios (lost connection, failed uploads, edits during upload, Finish);
- 1,000 runs of the website's `mobile-push-dispatch` function, checking who gets which alert.

Run `npm run test:web-refresh` after the website changes, then `npm test`, to catch the app drifting from it.

## Keeping up with the website

Types in `src/lib/types.ts` and the queries in `src/hooks/` copy the website's
`src/lib/data.ts` and `src/hooks/use-*.ts`. When the website's schema changes,
update them here.
