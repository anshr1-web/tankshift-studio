TankShift Studio — Campus water operations

RUN ON YOUR MAC
From the TankShift-Studio folder:
  python3 -m http.server 8013 --bind 127.0.0.1 --directory dist
Open http://127.0.0.1:8013/ in Chrome or Safari. Stop the server with Ctrl+C.
No API keys, build step, internet connection, or Python packages are required to run the app.
You can also open START-HERE.html directly for the self-contained offline demo.

THE DISPATCH WORKFLOW
The initial scenario is Uncertain readings. The main table shows reported stock,
stock uncertainty against the 8,000 L tank capacity, six-hour demand and its calibrated
range, recommended deliveries, and expected unmet demand. The inspection panel ranks
the benefit of obtaining each reading. Choose a tank, enter its verified stock, and
Apply reading. The previous plan is preserved for comparison with the revised plan.
The explanation describes changed deliveries, not water physically saved.

Edit conditions contains the full input set. Draft edits leave the plan unchanged
until Apply conditions. Invalid inputs cannot replace the current plan.
Reset, scenario changes, applied conditions, and applied what-if alternatives clear
the reading comparison. Each new verification compares with the immediately prior plan.

The what-if planner supports a two-hour later arrival, another 1,000 L, and a 3°C
hotter day. Preview and Cancel preserve the current plan; Apply commits the alternative.
Alternatives beyond the input limits are explained without being applied.
Ask about this plan is an offline scenario assistant with supported intents, not a
language model. Answers use the same solver and are cleared when the plan changes.
Export dispatch downloads current inputs, forecast ranges, delivery and expected unmet
quantities, retained supply, and previous/revised/change values when available.

60-SECOND DEMO
1. Click Try the 60-second demo, or select Uncertain readings.
2. Show the 3,000 L tanker: East receives 2,000 L, West 750 L, Annexe 250 L.
3. The inspection ranking recommends East (about 241 L expected shortage preventable).
4. Enter 5300 under Verified stock (L), with East selected, and Apply reading.
5. The comparison shows East 250 L (-1,750), West 1,750 L (+1,000), Annexe 1,000 L (+750).
   Supply stays 3,000 L; expected unmet demand is now zero under the modelled cases.
6. Export dispatch, then reset or preview a later arrival.
The comparison and explanation are computed from the plans; these values are regression
expectations, not forced solver outputs.

SOURCE FILES
  dist/index.html: application structure
  dist/style.css: responsive desktop and mobile layout
  dist/ui.js: state, forms, display, previews, questions, walkthrough and CSV
  dist/engine.js: existing demand prediction and 250 L allocation solver (unchanged)
  dist/model.js: trained coefficients and evaluation metrics (unchanged)
  train.py: synthetic training/calibration/test pipeline (unchanged)
  scripts/bundle.py: regenerate the offline bundle from dist

After editing frontend files or retraining, rebuild the bundle:
  python3 scripts/bundle.py
For static hosting, dist/ contains the complete website. No publishing is performed by
any run, build, or test command. Retraining separately requires NumPy and python3 train.py.
All campus and training data are simulated.

TESTS
  node --test tests/engine.test.cjs
See tests/README.txt for real-browser regression tests and screenshots at 1440x900 and
390x844. The browser test driver is installed separately; the app has no dependency on it.
