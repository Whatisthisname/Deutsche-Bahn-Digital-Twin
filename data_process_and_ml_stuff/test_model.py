# load model
import joblib
import m2cgen as m2c
import pandas as pd
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeRegressor

model = joblib.load("data_process_and_ml_stuff/tree_model.joblib")

df = pd.read_csv("data_process_and_ml_stuff/ml_dataset_real.csv")

# If the target column has a name, set it here, e.g.: target_col = "y"
# Otherwise, assume last column is target:
target_col = df.columns[-1]

X = df.drop(columns=[target_col]).values  # shape: (n_samples, 15)
y = df[target_col].values  # shape: (n_samples,)

# Evaluate the model
preds = model.predict(X)

# Draw a histogram of predictions
import matplotlib.pyplot as plt

plt.hist(preds, bins=50, label="Predictions", alpha=0.5)
plt.hist(y, bins=50, label="The truth", alpha=0.5)
plt.title("Predictions Histogram")
plt.legend()
plt.show()

print("R2:", r2_score(y, preds))
print("MAE:", mean_absolute_error(y, preds))
mean_guess = [y.mean()] * len(y)
print("MAE (mean guess):", mean_absolute_error(y, mean_guess))
