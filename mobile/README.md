# BiteVo Android app

The BiteVo app, built with React Native (no Expo). It uses the same backend as the website
(`https://api.bitevo.in`, set in `src/config.js`): the same menu, accounts, addresses, orders and wallet.

What it does (first version):

- Menu: offer banners, the five tabs (All, 1 Item, Food & Meals, Fastfood & Drinks, Combo), search, veg only,
  two dishes per row inside a tab, dish details, and the red cart bar.
- Sign in with a mobile number (WhatsApp/SMS code) or email code; new accounts give their name, the email
  address (invoices, refund updates) or mobile number they didn't sign in with, and an optional referral code.
- Delivery addresses, with "Service unavailable" outside the delivery area (Sector 40, 44 and 45 in
  Gurugram, as set on the backend).
- Checkout: offers and coupon codes, wallet, cooking note and the bill from the server, then "Proceed to pay":
  the Payment screen (`src/screens/PaymentScreen.js`) with Google Pay, PhonePe, Paytm and other UPI apps,
  cards, wallets and cash on delivery ("Recently used" first). Razorpay's checkout opens in a web view on the
  chosen method (`src/components/RazorpayCheckout.js`; UPI apps open from it). Online payment shows when the API
  has the Razorpay keys; otherwise "Place order" (cash on delivery).
- An "Invoice" button on every order: the API's invoice (the whole bill, GST when set up) opens in the phone's
  browser, where it can be saved as a PDF or shared.
- My orders, live order tracking (refreshes every 5 seconds while the order is live), cancelling, wallet
  history, account.
- On a live order, as on the website: the delivery partner card (who's bringing it; picking up, at the
  kitchen or on the way) with the live arrival time ("Arriving in ~14 min, by 7:52 pm"), and the live map: the
  rider (blue, with a bike and the way they're heading), the rider app's kitchen and home pins, the road route
  to the kitchen or your door, and the time of that ride. The map is Leaflet + OpenStreetMap in a web view
  (`src/components/RiderMap.js`, no Google key); the road route comes from the OSRM server in the backend's
  `/api/config` (`routing`).
- The arrival time (`src/lib/eta.js`, the same file as the website's `frontend/src/lib/eta.js`) is worked out
  from the rider's live position: before pickup, the ride to the kitchen, or the food still cooking if that
  takes longer (`prepMinutes` in `/api/config`, the backend's `PREP_MINUTES`), a minute to collect it, then the
  ride from the kitchen to the door; once picked up, the ride to the door. Ride times are the road route's,
  kept current as the rider gets nearer; without a route, the distance on city roads at about 22 km/h.

- Live location (`src/lib/location.js`, `src/state/here.js`; `@react-native-community/geolocation`, location
  permission asked on first open): the menu's "Delivering to" shows where the phone is (or the saved address
  there, within 300 m), with "Service unavailable" outside the delivery area. Adding an address fills it in
  from the current location (sector, city, pincode, building), and every field can still be typed or changed;
  "Use my current location" refreshes it. The rider is taken to that spot. The address comes from the API's
  `/api/places/reverse` (Google Maps with a key, otherwise OpenStreetMap).

Still to come: Google sign-in, picking the address on a map, push notifications.

## Build the app on this PC

Needs Node 22+, Java 17 or newer and the Android SDK. Android Studio's own Java (`C:\Program Files\Android\Android
Studio\jbr`) and SDK (`%LOCALAPPDATA%\Android\Sdk`) are used through `JAVA_HOME` and `ANDROID_HOME`, or found
there when those aren't set. Alternatively put `jdk\<version>\`, `Sdk\` and `gradle-home\` in `D:\Android` (or
the folder in `BITEVO_ANDROID_TOOLS`).

```
npm install
npm run build:android     # the APK, to install on phones directly: mobile\BiteVo.apk
npm run build:aab         # the app bundle, to upload to the Play Store: mobile\BiteVo.aab
```

To install the APK, copy it to an Android phone and open it (allow "Install unknown apps" for the app you open
it with). The app bundle can't be installed directly; upload it in the Play Console.

### Play Store upload key

Release builds are signed with the upload key when this PC has it, otherwise with React Native's debug key
(fine for installing the APK, refused by the Play Store). The upload key lives outside this repository:

- the key file, e.g. `C:\Users\<you>\bitevo-keys\bitevo-upload.jks` (PKCS12, alias `bitevo-upload`);
- its settings, in `C:\Users\<you>\.gradle\gradle.properties`:

  ```
  BITEVO_UPLOAD_STORE_FILE=C:/Users/<you>/bitevo-keys/bitevo-upload.jks
  BITEVO_UPLOAD_STORE_PASSWORD=...
  BITEVO_UPLOAD_KEY_ALIAS=bitevo-upload
  BITEVO_UPLOAD_KEY_PASSWORD=...
  ```

Back up both (the key file and the passwords) somewhere safe and private: every update on the Play Store must
be signed with the same upload key. Never commit them. On the first upload, let Google keep the app signing key
("Play App Signing"); if the upload key is ever lost, Google can then reset it from the Play Console.

Every upload needs a higher `versionCode` (and usually a new `versionName`) in `android/app/build.gradle`.

## Code

- `App.js`: navigation (bottom tabs: Menu, Orders, Wallet, Account; checkout, sign-in, addresses and order
  pages open on top).
- `src/api.js`: every call to the backend. `src/config.js`: API address and contact details.
- `src/state/`: menu and settings, the signed-in customer, the cart (kept on the phone), the chosen address.
- `src/lib/`: the same menu-tab and delivery-area rules as the website, money and date formatting.
- `src/screens/`, `src/components/`: the screens and their parts.
