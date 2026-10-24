# BiteVo Android app

The BiteVo app, built with React Native (no Expo). It uses the same backend as the website
(`https://api.bitevo.in`, set in `src/config.js`): the same menu, accounts, addresses, orders and wallet.

What it does (first version):

- Menu: offer banners, the five tabs (All, 1 Item, Food & Meals, Drinks, Combo), search, veg only,
  two dishes per row inside a tab, dish details, and the red cart bar.
- Sign in with a mobile number (WhatsApp/SMS code) or email code; name and referral code for new accounts.
- Delivery addresses, with "Service unavailable" outside the delivery area (Sector 40, 44 and 45 in
  Gurugram, as set on the backend).
- Checkout: offers and coupon codes, wallet, cooking note, the bill from the server, cash on delivery.
- My orders, live order tracking (refreshes every 15 seconds), cancelling, wallet history, account.

Still to come: paying online (Razorpay), Google sign-in, picking the address on a map, push notifications.

## Build the APK on this PC

Needs Node 22+, and Java 17 plus the Android SDK in `D:\Android` (`jdk\`, `Sdk\`; Gradle's cache goes in
`gradle-home\`). Set `BITEVO_ANDROID_TOOLS` to use another folder.

```
npm install
npm run build:android
```

The APK is written to `mobile\BiteVo.apk`. Copy it to an Android phone and open it to install (allow
"Install unknown apps" for the app you open it with).

The release APK is signed with React Native's debug key, which is fine for installing directly. For the
Play Store, create your own upload key (keep it and its password safe, never commit it) and set it up in
`android/app/build.gradle` under `signingConfigs.release`.

## Code

- `App.js`: navigation (bottom tabs: Menu, Orders, Wallet, Account; checkout, sign-in, addresses and order
  pages open on top).
- `src/api.js`: every call to the backend. `src/config.js`: API address and contact details.
- `src/state/`: menu and settings, the signed-in customer, the cart (kept on the phone), the chosen address.
- `src/lib/`: the same menu-tab and delivery-area rules as the website, money and date formatting.
- `src/screens/`, `src/components/`: the screens and their parts.
