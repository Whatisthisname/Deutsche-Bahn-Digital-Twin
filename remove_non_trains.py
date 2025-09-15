#!/usr/bin/env python3
import pathlib
import pandas as pd

path = pathlib.Path("dashboard/public/data")

df = pd.read_csv(path / "events-2024-07.csv")

print(df['train_type'].unique())