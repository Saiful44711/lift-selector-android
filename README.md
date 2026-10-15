# Lift Selector — Android package

আপনার PC-তে বর্তমান GitHub / Apps Script লিংক চলবে। মোবাইলে এই package থেকে তৈরি APK ব্যবহার করবেন। দুটিই একই Google Sheet, users, approval ও roles ব্যবহার করে। Company footer আপাতত রাখা হয়নি, আপনার নির্দেশ অনুযায়ী।

**এই ZIP source/build package; এর মধ্যে তৈরি `.apk` নেই।** Browser এবং shared logic-এর পরীক্ষাগুলো পাস করেছে। স্থানীয় Android compile Gradle download-এর `Network is unreachable` / redirect timeout-এ আটকে গেছে। সংযুক্ত GitHub account-এ আপনার repository-র write access নেই, তাই এখানে GitHub Actions চালানো যায়নি। নিচের Actions run হবে আসল Android compile-এর প্রথম যাচাই।

## আগে demo দেখুন

[Click to open the working fictional demo](https://lift-selector-android-demo.digitavision-7629.chatgpt.site)

Demo-তে সব তথ্য **FICTIONAL**। এগুলো বাস্তব component recommendation নয়। একই password: `DemoPass123`।

| কাজ | Demo login |
|---|---|
| Admin: approval, users, components, reports | admin@example.test |
| Engineer: selection এবং সব calculation | full@example.test |
| Technician: শুধু selection | selection@example.test |

Demo signup local sample user তৈরি করে; email পাঠায় না। Demo record কখনো আপনার Google Sheet-এ sync হয় না। Settings → Data mode দিয়ে পরে Live data চালু করবেন।

## যে সিদ্ধান্তগুলো ব্যবহার করা হয়েছে

| বিষয় | সিদ্ধান্ত |
|---|---|
| Backend | বর্তমান Google Sheets + একই Apps Script project |
| Users | বর্তমান accounts, passwords, approval, Admin / Full / Selection roles |
| PC | বর্তমান web app; APK package আলাদা repository-তে রাখতে পারেন |
| Android | Capacitor-এ packaged HTML/CSS/JS; প্রথম চালুতে fictional demo |
| Live login | Existing app email/password; APK-তে Google account chooser লাগে না |
| Offline | Demo এবং engineering calculation চলে; live প্রথম login অনলাইনে করতে হবে |
| Offline entry | Calculation record locally save; own account/backend-এ reconnect হলে outbox sync |
| Offline admin | Approval, password পরিবর্তন, component edit অনলাইনে করতে হবে |
| Report | Component print/PDF এবং latest/records CSV; Android-এ system print/share |
| Android support | Generated project-এর বর্তমান minimum Android API 24 (Android 7+) |
| Footer | আপাতত বাদ, আপনার নির্দেশ অনুযায়ী |

## 1. Google Apps Script-এ কোথায় কী বসাবেন

আগে বর্তমান Apps Script code-এর backup রাখুন। **বর্তমান Google Sheet-এর সঙ্গে যুক্ত একই project-এ কাজ করুন। নতুন Sheet বা নতুন authentication setup করবেন না।**

1. PC থেকে আপনার Google Sheet খুলুন → **Extensions → Apps Script**।
2. এই ZIP-এর `backend` folder খুলুন। নিচের table অনুযায়ী code বসান। Editor-এ existing file-এর সব code select করে replacement paste করুন।

| ZIP-এর file | Apps Script editor-এ ধরন / নাম | কী করবেন |
|---|---|---|
| backend/Code.gs | Script → Code | Existing Code.gs replace |
| backend/Engineering.gs | Script → Engineering | Existing replace; না থাকলে add |
| backend/Shared.gs | Script → Shared | Add; existing থাকলে replace |
| backend/ApiAdapter.gs | Script → ApiAdapter | Add; existing থাকলে replace |
| backend/Index.html | HTML → Index | আগের v4 install থাকলে একই; পুরোনো version হলে replace |
| backend/Stylesheet.html | HTML → Stylesheet | আগের v4 install থাকলে একই; পুরোনো হলে replace |
| backend/JavaScript.html | HTML → JavaScript | আগের v4 install থাকলে একই; পুরোনো হলে replace |
| backend/EngineeringUI.html | HTML → EngineeringUI | HTML হিসেবেই রাখুন; পুরোনো হলে replace |

3. নতুন Script করতে Files-এর পাশে **+ → Script**; নাম লিখুন যেমন `Shared`। নতুন HTML করতে **+ → HTML**; নাম যেমন `EngineeringUI`। Editor নিজেই extension দেয়।
4. যদি আগের ভুল file `EngineeringUI.gs` থাকে এবং তার মধ্যে HTML / `<script>` থাকে, content backup নিয়ে সেটি সরিয়ে **EngineeringUI.html** তৈরি করুন। একই নামে ভুল `.gs` রেখে দিলে পুরো project parse হবে না।
5. Save করুন। আপনার existing Users tab/passwords এবং project properties রাখুন। **`setupAdmin()` আবার run করবেন না; সেটি first-time setup-এর জন্য।**
6. **Deploy → Manage deployments → current Web app → pencil/Edit → Version → New version → Deploy**। এতে একই `/exec` URL থাকে। Delete/archive deployment করবেন না।
7. APK-এর API Google browser session ছাড়া কাজ করতে **Execute as: Me** এবং **Who has access: Anyone** প্রয়োজন। Access-এর এই অর্থ API endpoint reachable; account approval ও role checks এখনও server-এ আছে। Workspace policy যদি Anyone দিতে না দেয়, APK live connection-এ আলাদা authentication design লাগবে—এই package দিয়ে সেই policy পরিবর্তন হবে না।
8. আপনার `/exec` URL-এর শেষে `?api=ping` দিয়ে PC browser-এ খুলুন। JSON-এ `ok:true` এবং `version:1` পেলে নতুন API চালু হয়েছে। এটা API deployment check; real account login যাচাই আলাদা।

Calculation record প্রথম live save-এ backend নিজে `EngineeringRecords` tab তৈরি করবে। Existing component/user data Excel থেকে আবার import করতে হবে না।

## 2. GitHub থেকে APK বানাবেন — Android Studio লাগবে না

APK-এর জন্য **আলাদা repository** ব্যবহার করলে আপনার বর্তমান PC hosting সহজে আলাদা থাকে। এই package সেটির জন্য প্রস্তুত।

1. ZIP download করে PC-তে **Extract all** করুন। ZIP file নিজে GitHub-এ upload করবেন না—ভিতরের files/folders upload করতে হবে।
2. GitHub-এ login → ওপরের **+ → New repository** → নাম `lift-selector-android` → Public অথবা Private → **Create repository**। Secrets কখনো repository files-এ রাখবেন না।
3. Empty repository-র **uploading an existing file** link, অথবা **Add file → Upload files** চাপুন। Extract করা folder-এর contents drag করুন। `package.json`, `package-lock.json`, `capacitor.config.json`, `README.md` root-এ থাকবে; `web`, `shared`, `backend`, `scripts`, `tests`, `evidence` folders-ও root-এ। ZIP-এর বাইরের enclosing folder upload করবেন না।
4. **Commit changes** চাপুন। `node_modules`, toolchain বা generated `android` folder upload করতে হবে না; Actions তৈরি করবে।
5. Windows-এ `.github` folder দেখা না গেলে সবচেয়ে সহজ উপায়: repository root → **Add file → Create new file** → filename লিখুন **`.github/workflows/android.yml`**। আলাদা করে folders তৈরি করবেন না—filename-এ `/` দিলে GitHub নিজে folders তৈরি করে।
6. ZIP-এর `.github/workflows/android.yml` খুলে পুরো text paste করুন; অথবা দেওয়া standalone `Lift_Selector_Android_Workflow.yml`-এর content paste করুন। Destination filename অবশ্যই `android.yml`, `.txt` নয়। **Commit changes**।
7. প্রয়োজনে একইভাবে **Add file → Create new file**, filename `.gitignore`, ZIP-এর content paste করুন।
8. ওপরে **Actions** tab → **Build Lift Selector APK**। Actions enable করার banner থাকলে নিজের repository-তে enable করুন।
9. **Run workflow → Branch: main**। `signed_release` আপাতত unchecked রাখুন → **Run workflow**। Debug build-এ signing secrets লাগে না। Main-এ push-ও build শুরু করতে পারে; একবার run শুরু হলে duplicate run প্রয়োজন নেই।
10. Run page খুলুন। Browser tests, Android project generation, SDK discovery এবং compile শেষ হওয়া পর্যন্ত অপেক্ষা করুন। সবুজ success হলে নিচের **Artifacts → Lift-Selector-debug-APK** download করুন। GitHub-এ signed in থাকতে হবে।
11. Artifact ZIP extract করুন। এর মধ্যে **app-debug.apk** পাবেন। Source package ZIP এবং artifact ZIP আলাদা জিনিস।
12. APK ফোনে পাঠিয়ে খুলুন। Android চাইলে নিজের ব্যবহৃত file manager/browser-এর **Install unknown apps** অনুমতি দিয়ে install করুন। Install হয়ে গেলে permission বন্ধ করতে পারেন। Android Studio লাগবে না।

Build output path: `android/app/build/outputs/apk/debug/app-debug.apk`। Browser screenshots Actions-এর `Lift-browser-verification` artifact-এ পাবেন। Failed compile হলে run-এর failed step খুলে error text দেখুন; diagnostics artifact available হলে সেটিও download করুন।

## 3. APK-তে বাস্তব app connect করবেন

1. App খুললে **FICTIONAL DEMO** দেখা যাবে। আগে demo login দিয়ে layout এবং calculation দেখুন।
2. ওপরের **Settings → Data mode: Live data**।
3. **Backend URL**-এ section 1-এর current `/exec` URL paste করুন। Default-এ আপনার আগের URL আছে; অন্য deployment হলে এখানে বদলান। `/dev` বা Google Sheet URL নয়।
4. **Apply settings** → API connected message হলে নিজের existing approved email/password দিয়ে login করুন।
5. PC-তে আগের Apps Script/GitHub link ব্যবহার করুন। নতুন repository-র GitHub Pages চালু করা প্রয়োজন নেই।

Backend code install/deploy না করা পর্যন্ত real login API কাজ করবে না; APK/demo তৈরি করতে backend install বাধ্যতামূলক নয়। Clickable demo-টি sample পরীক্ষা করার জন্য; PC-র real production কাজ বর্তমান web app-এ করুন। Live browser API fetch Google redirect/CORS policy-তে আটকে যেতে পারে; APK native HTTP ব্যবহার করে।

## Offline calculation ও outbox

Live mode-এ প্রথম login internet-এ করুন। পরে app বন্ধ করে offline অবস্থায় খুললেও cached account দিয়ে calculations করা যায়। Previously downloaded component index ও আগে খোলা component details পাওয়া যায়; নতুন details internet ছাড়া download হয় না।

Calculate → result দেখুন → চাইলে Record note → **Save calculation**। Offline live record `Pending` থাকবে; reconnect হলে নিজের একই account/backend-এর outbox sync হবে। Server result আবার calculate করে, owner নিজে নির্ধারণ করে এবং retry-তে একই ID দ্বিতীয়বার append করে না। **Records / Outbox**-এ status, retry এবং CSV আছে। Approval/token expired হলে online re-login করুন; pending record থাকে।

Unsynced record থাকলে app uninstall বা Android app data clear করবেন না। আগে sync করুন বা CSV export রাখুন। Demo data ও pending records device-local।

## Calculation scope

Geared car speed uses motor RPM, sheave diameter, gear ratio and roping ratio. Induction slip uses the motor's actual operating electrical frequency and pole count. Gearless speed does not show induction slip. Use motor nameplate/operating measurements; drive output frequency is not automatically mains frequency.

Energy bill is an engineering estimate using trips/travel/duty, loading and efficiency assumptions plus fan/light/standby and tariff. Capacity, speed and motor kW alone do not uniquely determine a measured bill. Daily/monthly/annual results show assumptions in the app.

Solar/battery sizing estimates an AC supply feeding the existing elevator controller, with motor current, auxiliary load, runtime, battery voltage/usable fraction, sun hours and losses. It is not a ready-to-wire panel string or universal solar pump drive selection. Existing app calculation guidance remains available.

## Optional signed release — debug build-এর জন্য প্রয়োজন নেই

For a stable production signing identity, use your own existing Android keystore and keep a private backup. Repository → **Settings → Secrets and variables → Actions → New repository secret**; add:

| Secret name | Value |
|---|---|
| ANDROID_KEYSTORE_BASE64 | Base64 contents of your release keystore |
| ANDROID_STORE_PASSWORD | Keystore password |
| ANDROID_KEY_ALIAS | Key alias |
| ANDROID_KEY_PASSWORD | Key password |

Run workflow with `signed_release` checked. Output: `android/app/build/outputs/apk/release/app-release.apk`; artifact `Lift-Selector-signed-release-APK`. Missing secrets stop release with a named error; debug artifact has already been built/uploaded. Never paste signing passwords or private keys into chat/code.

Fresh CI debug builds may have different temporary signing keys, so installing over an older debug APK can fail. Sync/export first, then uninstall the old debug build and install the new one. Release updates require the same signing key and a higher versionCode; generated versioning is configured in `scripts/android-prepare.mjs`.

## Troubleshooting

| Error / symptom | Root cause | Fix |
|---|---|---|
| `Unexpected token '<'` in `EngineeringUI.gs` | HTML pasted into a Script file | Use HTML file `EngineeringUI.html`; remove wrong `.gs` after backup |
| `Backend returned a webpage instead of API JSON` | Old deployment, missing API adapter, or Google sign-in/access page | Install all required `.gs` files; deploy New version; verify Me / Anyone and `/exec?api=ping` |
| `Backend API version mismatch` | Endpoint is not the new version 1 adapter | Deploy matching backend files; correct Settings URL |
| `SESSION_EXPIRED` | Token expired or user approval was revoked | Reconnect and log in; Admin verifies approved role |
| `You do not have permission` | Server rejected current role | Admin grants the intended role; Selection cannot save calculations/admin edit |
| PC Google account redirect / phone Chrome only works in incognito | Google browser profile routing | Current Chrome primary-account fix applies to web app; APK uses own app login/API |
| No workflow / Run workflow button | YAML absent from default branch or wrong filename | Create `.github/workflows/android.yml` on `main`; commit all source files |
| `Cannot find package` / `npm ci` error | Files missing or lockfile mismatch | Upload original package.json AND package-lock.json at root; inspect actual install error |
| `sdkmanager not found` / required platform unavailable | Runner SDK missing or Android repository unreachable | Use the supplied GitHub-hosted Ubuntu workflow; see SDK step logs, not a guessed version |
| `Network is unreachable` / Gradle distribution redirect timeout (observed locally) | Local build environment could not reach Gradle download | Compile using supplied GitHub Actions; actual compile not locally verified |
| `PKIX path building failed` / source lists unavailable (local SDK setup) | Vendor JDK truststore lacked environment CA | Use trusted environment CA; CI uses setup-java; never disable TLS verification |
| SDK archive missing ZIP end directory (observed locally) | Download was truncated | Redownload and verify official SHA-256 before extraction; CI uses runner SDK |
| `ERR_INTERNET_DISCONNECTED` on browser reload (fixed in this package) | Browser had no cached interface | This version caches public interface assets; visit online once; APK bundles assets locally |
| Chromium socket permission error (local QA environment) | Full Chrome process features restricted in test environment | Local QA passed using official Chromium Headless Shell; CI uses Playwright browser |
| Android `App not installed` / conflicting package | Signature differs from older installed build | Sync/export first, uninstall older debug app; use same release keystore for production |
| `Missing signing secret: ...` | Optional release selected without all secrets | Run debug unchecked, or add the specifically named secret |

## Verified here / remaining checks

- Nine shared/backend unit checks passed: identical module, calculations, input validation, role denial, recomputation, CSV safety and server ID/owner deduplication.
- Real browser end-to-end checks passed: demo registration → pending → approval/login; component validation/entry; dashboard; selection report/print content; all six calculators; two CSV exports; Selection permission denial.
- Simulated live API passed offline entry, reconnect sync, adding a second record during an ongoing sync, and cached offline restart. Those calls used fictional data and did not touch your real Sheet/accounts.
- Four real screenshots (desktop/mobile, light/dark) were taken and visually inspected. Included in `evidence`.
- Dependency installation, asset generation, Capacitor Android generation/plugins and workflow YAML parsing passed. SDK requirement was read from generated project files and installed locally.
- **Not verified:** successful Gradle APK compile; actual Android installation, native print/share UI, production API after you install adapter, signed release and GitHub-hosted workflow execution. Do not treat source ZIP or screenshots as proof that Android compile succeeded.

## Developer files / future corrections

`shared/logic.js` is the single source for business validation, role permissions, record shape and all calculators. `npm run build` copies it byte-for-byte into `dist/logic.js` and `backend/Shared.gs`; do not edit those generated copies independently. Privileged operations authenticate and check approval/roles in Apps Script on each request. Browser cached permissions only support offline UI/calculation; server permissions control live writes.

`web` contains plain HTML/CSS/JS. `scripts/android-prepare.mjs` reproducibly generates Android/native print/icons/signing configuration. `scripts/sdk-prepare.mjs` reads generated SDK requirements and queries real SDK availability. CI does not pin a guessed SDK/build-tools version. `tests` contains reproducible checks.

Local developer checks: `npm ci`, `npm run build`, `npm test`, `npx playwright install chromium`, `npm run test:e2e`, `npm run android:prepare`. These commands are not required on your PC when using GitHub Actions.

Official instructions: [GitHub new files/folders](https://docs.github.com/en/repositories/working-with-files/managing-files/creating-new-files), [GitHub artifact download](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts?tool=webui), [Apps Script deployments](https://developers.google.com/apps-script/concepts/deployments), [Apps Script web apps](https://developers.google.com/apps-script/guides/web).
