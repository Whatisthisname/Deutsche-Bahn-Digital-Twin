"""This script will load the ML dataset from 'build_ml_dataset.py' and train a decisiontree on it. It will then convert the tree to a function that can be called from Javascript."""

import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeRegressor
from sklearn.metrics import r2_score, mean_absolute_error
import m2cgen as m2c

# 1) Load CSV: assumes 16 columns total → 15 features + 1 target (last column is target).
#    If you have headers, this still works. Adjust indexing if needed.
df = pd.read_csv("dataset.csv")

# If the target column has a name, set it here, e.g.: target_col = "y"
# Otherwise, assume last column is target:
target_col = df.columns[-1]

X = df.drop(columns=[target_col]).values  # shape: (n_samples, 15)
y = df[target_col].values  # shape: (n_samples,)

# 2) Train a simple CART regressor (tune as you like)
model = DecisionTreeRegressor(
    max_depth=10,  # tweak
    min_samples_split=8,  # tweak
    random_state=42,
)
model.fit(X, y)

# 3) Quick evaluation
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42)
model.fit(Xtr, ytr)
preds = model.predict(Xte)
print("R2:", r2_score(yte, preds))
print("MAE:", mean_absolute_error(yte, preds))
mean_guess = [ytr.mean()] * len(yte)
print("MAE (mean guess):", mean_absolute_error(yte, mean_guess))

# 4) Export to JavaScript using m2cgen
#    This generates a pure function taking a numeric array -> number.
js_code = m2c.export_to_javascript(model)

# 5) Write the JS model to disk (check this into your frontend repo)
with open("tree_model.js", "w", encoding="utf-8") as f:
    f.write(js_code)
