TankShift regression checks

Engine (Node 20+, no dependencies):
  node --test tests/engine.test.cjs

Browser (uses installed Google Chrome; keeps test dependency outside the project):
  npm install --prefix /tmp/tankshift-browser-tests playwright-core --no-audit --no-fund
  NODE_PATH=/tmp/tankshift-browser-tests/node_modules node --test tests/browser.test.cjs

Browser tests open dist/index.html directly by default, proving the core works offline.
Optional environment variables:
  TANKSHIFT_URL=http://127.0.0.1:8013/ to test a local server
  CHROME_PATH=/path/to/chrome for another Chrome installation
  TANKSHIFT_ARTIFACTS=/tmp/tankshift-browser-artifacts for screenshot location

Rebuild START-HERE.html with python3 scripts/bundle.py before running browser tests.
Tests never publish or contact an API. The driver download requires internet only for setup.
