# BiteVo — Main Website (customer ordering)

The public website where customers browse the menu, sign in with their phone, order and follow
their order live. It shares its database with the admin panel (`../bitevoadminpanel`), so website
orders show up on the panel's Orders page and the kitchen moves them along from there.

```
backend/   Node.js + Express API (port 4001)
frontend/  React + Vite website (port 2002)
```

| App | Port |
|---|---|
| Marketing site (`../bitevo`) | 2000 |
| Admin panel web / API | 2001 / 4000 |
| **This website / its API** | **2002 / 4001** |

## Run it

```bash
npm install --prefix backend
npm install --prefix frontend
npm run dev --prefix backend     # API on http://localhost:4001
npm run dev --prefix frontend    # website on http://localhost:2002
```

Copy `backend/.env.example` to `backend/.env` first. With no MongoDB settings, the API keeps data in
`backend/data/db.json` and loads a starter menu, so it works offline.

**To share data with the admin panel**, put the same `MONGO_DB_URL` / `MONGO_DB_USER` /
`MONGO_DB_PASSWORD` / `MONGO_DB_NAME` as `../bitevoadminpanel/backend/.env` into `backend/.env`. The
menu, offers and delivery areas then come from the panel, and menu photos uploaded in the panel load
through the admin API (Vite forwards `/uploads` to port 4000 in development; set `ADMIN_PUBLIC_URL` in
production).

## What customers can do

- Browse the live menu: categories, search, veg-only filter, combos, sold-out dishes.
- Build a cart (saved in the browser) and check out.
- Sign in with a mobile number and a 6-digit code; new numbers become new customers.
- Save delivery addresses (areas = the delivery zones set in the admin panel).
- Apply offer codes (all the panel's coupon types, with the same maths and limits).
- Pay on delivery, or partly or fully from the BiteVo wallet.
- Follow the order live (placed → preparing → out for delivery → delivered), cancel it before the
  kitchen accepts it (wallet money is refunded), rate it, and order it again.
- See wallet balance and history; send a message to support.
- Refer friends: share a code or link, and earn wallet cashback when a friend completes their first orders.

## Refer & earn

Every customer has a referral code (e.g. `PRIY7K2Q`) and a link (`/r/PRIY7K2Q`) on the **Refer & Earn**
page (`/refer`, linked from My Account, the ☰ menu and the footer). A new customer can enter a friend's code
when they sign up (it's filled in for them when they arrived through an invite link) or later on that page,
as long as they haven't ordered yet. When that friend's 2nd order is **delivered**, the friend who invited
them gets ₹100 in their BiteVo wallet.

- Settings in `backend/.env`: `REFERRAL_REWARD` (₹, default 100), `REFERRAL_ORDERS` (default 2),
  `REFERRAL_ENABLED=false` to switch it off. Each referral keeps the reward it was promised when it started.
- Orders are marked delivered in the admin panel, so the website API checks for rewards that are due every
  3 minutes, and straight away whenever a customer opens their wallet or the Refer & Earn page.
- The reward is a wallet transaction of type `cashback` with `source: 'referral'`, so the admin panel's
  Wallet page lists it as cashback ("Referral: Rahul K. completed 2 orders"). Its id is derived from the
  referral, so it can never be paid twice.
- Rules: no using your own code (or the code of a friend you invited), one code per customer, codes only
  before the first order, cancelled orders don't count. If either person deletes their account before the
  reward is due, the referral lapses.
- Data: `customers.referralCode` / `referredBy`, and one document per referral in `referrals`
  (`pending` → `rewarded`, or `void`).

## Continue with Google

The sign-in sheet shows Google's "Continue with Google" button when `GOOGLE_CLIENT_ID` is set in
`backend/.env`. A Google account that's already linked signs straight in. A new one is asked for the
mobile number once (same 6-digit code; deliveries need a number), and the Google account is then linked to
that number's BiteVo account, a new one or the customer's existing one. Accounts are only ever matched by
the Google account itself (never by email address), so no-one can sign in to someone else's account.

To set it up: Google Cloud console → APIs & Services → Credentials → Create credentials → OAuth client ID →
"Web application". Under "Authorised JavaScript origins" add `https://bitevo.in` (and
`http://localhost:2002` for testing). Put the Client ID in `GOOGLE_CLIENT_ID`, and any long random text in
`AUTH_SECRET`. The OAuth consent screen needs your app name, logo and support email before going public.

## Emails (Hostinger)

Customers who have an email address (all Google sign-ins, and anyone who adds one in My Account) get a
welcome email and an order confirmation for each order, sent from your Hostinger mailbox. In
`backend/.env` set `SMTP_USER` (e.g. `hello@bitevo.in`), `SMTP_PASS` (that mailbox's password) and
`MAIL_FROM`; `SMTP_HOST=smtp.hostinger.com` and `SMTP_PORT=465` are Hostinger's defaults. Without a
password nothing is sent (the API log notes each email it skipped), and sending never slows down or breaks
sign-in or ordering.

## Image uploads (Supabase Storage)

`POST /api/uploads` stores an image in the public Supabase Storage bucket the admin panel also uses
(`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_BUCKET`, default `bitevo-images`) and returns
`{ url, name, type, size }`. `url` is a public link (`https://<project>.supabase.co/storage/v1/object/public/bitevo-images/site/<id>.jpg`)
that works in any `<img>` on the website, in the admin panel and in the app.

- Send the image itself as the request body with its Content-Type (`image/jpeg`, `image/png`,
  `image/webp` or `image/gif`), at most 5 MB. The file's first bytes must really be that kind of image.
- Who can upload: a signed-in customer (website or app, same session cookie), or anyone sending an
  `x-upload-key` header that matches `UPLOAD_API_KEY` (for scripts and other servers). 40 uploads an hour per address.
- On the website: `const { url } = await api.uploadImage(file)` with a File from `<input type="file" accept="image/*">`.
- With curl: `curl -X POST https://bitevo.in/api/uploads -H "x-upload-key: $UPLOAD_API_KEY" -H "Content-Type: image/jpeg" --data-binary @photo.jpg`
- Every upload is noted in the `uploads` collection (name, link, size, who uploaded it).

## Sign-in codes (OTP)

No SMS provider is connected yet. With `OTP_DEV_MODE=true` (the default) the code is shown on screen
and printed in the API log. To go live, connect a provider in `backend/src/lib/sms.js` and set
`OTP_DEV_MODE=false`.

## How data lines up with the admin panel

| Collection | Website | Notes |
|---|---|---|
| `products`, `categories`, `coupons`, `settings` | reads | Managed in the panel |
| `customers` | reads/writes | Phone `+91 98765 43210`, plus `addresses` and `email` |
| `orders` | writes | Panel format (`BVmmdd-NNN`, `status: placed`, …) plus `address`, `note`, `source: 'web'` |
| `walletTxns` | reads/writes | `payment` when the wallet is used, `refund` when a customer cancels |
| `sessions`, `loginEvents` | writes | `role: 'customer'`, shown on the panel's Login status page (and revocable there) |
| `otpCodes`, `supportMessages` | writes | Website only |
| `referrals` | reads/writes | Website only (refer & earn); rewards go into `walletTxns` as `cashback` |

Prices, availability, coupon checks and wallet balances are always worked out on the server.
Cashback is credited by the admin panel when an order is marked delivered.

With the panel's `DEMO_MODE=true`, its simulator places demo orders for random existing customers,
which can include real website customers. Use `DEMO_MODE=false` with real customers.

## Not built yet

- Online payments (UPI / card via a gateway such as Razorpay). Orders are pay-on-delivery or wallet.
- SMS delivery of sign-in codes (see above).
- The admin panel's order screen doesn't show the delivery address or kitchen note yet.

## Going live

- `COOKIE_SECURE=true`, `TRUST_PROXY=true` behind a proxy, `CLIENT_ORIGIN=https://bitevo.in`.
- If the API is on another domain: `COOKIE_SAMESITE=none`, and build the frontend with
  `VITE_API_URL=https://api.bitevo.in`.
- `npm run build --prefix frontend` and serve `frontend/dist` with a fallback to `index.html`.
- On a server or host that deploys from the repo root (Node 20.19 or newer), create `backend/.env` and
  `frontend/.env` from their `.env.example` files, then run `npm install` (installs both folders),
  `npm run build` (builds the website into `frontend/dist`) and `npm start` (starts the API on `PORT`; it
  also serves the built website, so one address hosts both. Restart it after each new build).
