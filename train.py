"""Fit the campus demand model and measure six-hour residuals on separate days."""
from pathlib import Path
import numpy as np
import json
root = Path(__file__).resolve().parent
rng = np.random.default_rng(2026)

def days(n):
    data = []
    for _ in range(n):
        temp = rng.uniform(24, 40)
        hours = np.arange(24)
        morning = np.exp(-((hours - 8) / 2.2)**2)
        evening = np.exp(-((hours - 19) / 2.8)**2)
        features = np.column_stack((np.ones(24), morning, evening, np.full(24,temp-28)))
        values = (1.85 + 3.4*morning + 2.6*evening + .085*(temp-28)) * rng.lognormal(0,.085)
        values += rng.normal(0,.22,24)
        data.append((features,values))
    return data

train, calibration, test = days(90), days(35), days(35)
weights = np.linalg.lstsq(np.vstack([x for x,y in train]), np.concatenate([y for x,y in train]),rcond=None)[0]

def errors(dataset):
    return np.array([sum(y[h:h+6])-sum(x[h:h+6] @ weights) for x,y in dataset for h in [6,12,17]])

lo, hi = np.quantile(errors(calibration), [.1,.9])
e = errors(test)
model = dict(weights=weights.tolist(),lo=lo,hi=hi,mae=np.abs(e).mean(),coverage=((lo<=e)&(e<=hi)).mean())
(root/'dist/model.js').write_text('const MODEL = '+json.dumps(model)+';\n')
print(model)
