"""
imputer_clean.py
================
Cleaned version of D:/dummy/imputer.py
Provides predictive imputation for missing CVD input fields.

Two modes:
  1. If a trained imputer_models.joblib exists → use XGBoost regressors
  2. Otherwise  → fall back to evidence-based population medians/modes
"""

import os
import numpy as np
import pandas as pd

try:
    import joblib
    import xgboost as xgb
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False

# ---------------------------------------------------------------------------
# Population-level medians / modes from the Kaggle Cardiovascular Disease
# dataset (n ≈ 70 000).  Used as a safe fallback when no trained imputer
# model is available.
# ---------------------------------------------------------------------------
POPULATION_DEFAULTS = {
    "age":         19720,   # ~54 years in days
    "height":      165,
    "weight":      72,
    "ap_hi":       120,
    "ap_lo":       80,
    "cholesterol": 1,       # 1=Normal, 2=Above Normal, 3=Well Above
    "gluc":        1,
    "smoke":       0,
    "alco":        0,
    "active":      1,
    "gender":      2,       # 1=Female, 2=Male (dataset encoding)
}

MODEL_PATH = os.path.join(os.path.dirname(__file__), "imputer_models.joblib")


def train_and_save_imputer(df: pd.DataFrame, target_cols: list, save_path: str = MODEL_PATH):
    """
    Train XGBoost regressors for each target column and persist to disk.
    Call once offline with the full dataset.

    Parameters
    ----------
    df         : cleaned, fully-populated DataFrame
    target_cols: columns that may be missing at inference time (e.g. ['ap_hi', 'cholesterol'])
    save_path  : where to save the joblib bundle
    """
    if not XGBOOST_AVAILABLE:
        raise RuntimeError("xgboost and joblib are required to train the imputer.")

    imputers = {}
    # Training uses only rows with no missing predictor values
    clean_df = df.dropna(subset=[c for c in df.columns if c not in target_cols])

    for col in target_cols:
        print(f"  Training imputer for: {col} ...", flush=True)
        mask = clean_df[col].notnull()
        X = clean_df[mask].drop(columns=target_cols)
        y = clean_df.loc[mask, col]

        reg = xgb.XGBRegressor(n_estimators=200, max_depth=6, random_state=42)
        reg.fit(X, y)
        imputers[col] = reg

    joblib.dump(imputers, save_path)
    print(f"  Imputer models saved → {save_path}")
    return imputers


def impute_input(user_dict: dict) -> tuple:
    """
    Fill any missing (None / NaN) fields in user_dict.

    Returns
    -------
    (complete_dict, imputed_fields)
      complete_dict  : dict with all fields present and filled
      imputed_fields : list of field names that were filled automatically
    """
    complete = dict(user_dict)
    imputed_fields = []

    # Identify which fields are missing
    missing_cols = [
        col for col, val in complete.items()
        if val is None or (isinstance(val, float) and np.isnan(val))
    ]

    if not missing_cols:
        return complete, []

    # ── Mode A: XGBoost-based imputation ──────────────────────────────────
    if XGBOOST_AVAILABLE and os.path.exists(MODEL_PATH):
        try:
            imputers = joblib.load(MODEL_PATH)
            user_df = pd.DataFrame([complete])

            for col, model in imputers.items():
                if col in missing_cols:
                    features = user_df.drop(columns=list(imputers.keys()), errors="ignore")
                    pred = model.predict(features)[0]
                    complete[col] = float(pred)
                    imputed_fields.append(col)
                    user_df[col] = float(pred)

            # Any remaining missing cols fall through to the default fallback
            still_missing = [
                c for c in missing_cols
                if complete.get(c) is None or (
                    isinstance(complete.get(c), float) and np.isnan(complete.get(c))
                )
            ]
            missing_cols = still_missing
        except Exception as e:
            print(f"  [Imputer] XGBoost load failed ({e}), using defaults.", flush=True)

    # ── Mode B: Population-median fallback ────────────────────────────────
    for col in missing_cols:
        if col in POPULATION_DEFAULTS:
            complete[col] = POPULATION_DEFAULTS[col]
            if col not in imputed_fields:
                imputed_fields.append(col)
        else:
            # Unknown column — leave as 0
            complete[col] = 0
            imputed_fields.append(col)

    return complete, imputed_fields
