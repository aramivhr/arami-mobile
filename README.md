# Arami Portal (iOS + Android)

The mobile app for Arami Vacation Homes staff and owners. It mirrors the
PropManager website (`aramivhr/rent-halo-system`, built in Lovable) and uses the
same Supabase backend and logins. **It never changes the website's code**: it
only reads and writes the same data the website already uses, through each
person's own login, so database permissions (RLS) apply exactly as on the web.

## What's in version 1

| User type | Bottom tabs | Under "More" |
| --- | --- | --- |
| Super admin | Dashboard, Calendar, Messages, Inspections | Reservations, Notifications, Financial |
| Admin | Dashboard, Calendar, Messages, Inspections | Reservations, Notifications |
| Owner | Dashboard, Calendar, Reservations | Financial |

The tab table lives in `src/lib/access.ts`; add new user types there.

- Sign in with the website email or username, then Face ID / fingerprint.
- Dashboard, Calendar (block / unblock dates, new booking from a cell),
  Reservations (filters, confirmation, Share PDF, CSV) and Messages (Airbnb +
  Booking.com via the website's `channex-messages` function, text replies).
- Reservations can only be created, edited or deleted when they are **direct**
  bookings. Channel bookings are read-only in the app.
- Notifications list with "Last Minute Reservation" for same-day bookings.
- Inspections and Financial are placeholders until their backend is set up.

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

## Keeping up with the website

Types in `src/lib/types.ts` and the queries in `src/hooks/` copy the website's
`src/lib/data.ts` and `src/hooks/use-*.ts`. When the website's schema changes,
update them here.
