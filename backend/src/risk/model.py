"""Explainable risk model for P90 exceedance prediction.

Implements logistic regression or decision tree (max_depth=4) to estimate
the probability of a PQR exceeding P90 management time using only features
available at creation time. All outputs include a disclaimer labeling this
as an analytical demonstration.

Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, cast

import numpy as np
import polars as pl
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier

# --- Disclaimer constant (Req 9.6) ---
DISCLAIMER = "Analytical demonstration — not a production-grade model"

# --- Features available at creation time (Req 9.3, 9.7) ---
CREATION_TIME_FEATURES = [
    "causa",
    "canal_atencion",
    "empresa",
    "tipo_pqr",
    "unidad_responsable",
    "marcacion",
]

# --- Leakage fields to exclude (Req 9.3, 9.7) ---
LEAKAGE_FIELDS = [
    "fecha_cierre",
    "resultado",
    "tiempo_gestion_dias",
    "motivo_cierre",
]


@dataclass
class ModelMetrics:
    """Evaluation metrics for the risk model (Req 9.4)."""

    precision: float
    recall: float
    f1_score: float
    roc_auc: float
    confusion_matrix: list[list[int]]
    model_type: str
    disclaimer: str = DISCLAIMER


@dataclass
class FeatureImportance:
    """Single feature importance entry (Req 9.5)."""

    feature: str
    importance: float


@dataclass
class ModelResult:
    """Complete result of model training and evaluation."""

    model: Any  # sklearn model object
    metrics: ModelMetrics
    feature_importance: list[FeatureImportance]
    training_size: int
    test_size: int
    class_balance: dict[str, float]
    p90_threshold: float
    limitations: list[str]
    disclaimer: str = DISCLAIMER


class RiskModel:
    """Explainable risk model for P90 exceedance prediction.

    Uses logistic regression or decision tree (max_depth=4) trained on
    creation-time features only. All outputs are labeled as analytical
    demonstrations (Req 9.6).
    """

    def __init__(self, random_seed: int = 42, test_size: float = 0.25):
        self._random_seed = random_seed
        self._test_size = test_size
        self._feature_columns: list[str] = []

    def prepare_features(self, df: pl.DataFrame) -> tuple[pl.DataFrame, pl.Series]:
        """Select creation-time features and build target variable.

        Excludes leakage fields (fecha_cierre, resultado, tiempo_gestion_dias,
        motivo_cierre) per Req 9.3, 9.7.

        Args:
            df: Full PQR DataFrame with all columns.

        Returns:
            Tuple of (feature DataFrame with one-hot encoded categoricals,
            binary target Series where 1 = tiempo_gestion_dias > P90).
        """
        # Compute P90 threshold for target variable
        management_time = df["tiempo_gestion_dias"].drop_nulls()
        # quantile on numeric series returns float (cast for pyright's broad PythonLiteral type)
        p90_raw = cast("float | None", management_time.quantile(0.9, interpolation="linear"))
        p90 = float(p90_raw) if p90_raw is not None else 0.0
        self._p90_threshold = p90

        # Filter out rows with null management time (cannot compute target)
        df_valid = df.filter(pl.col("tiempo_gestion_dias").is_not_null())

        # Create binary target: 1 if > P90, 0 otherwise
        target = (df_valid["tiempo_gestion_dias"] > p90).cast(pl.Int32)

        # Select only creation-time features
        available_features = [col for col in CREATION_TIME_FEATURES if col in df_valid.columns]

        features_df = df_valid.select(available_features)

        # Fill nulls with "desconocido" for categoricals before encoding
        features_df = features_df.with_columns(
            [pl.col(c).fill_null("desconocido") for c in available_features]
        )

        # One-hot encode categorical features
        features_encoded = features_df.to_dummies(columns=available_features)

        self._feature_columns = features_encoded.columns

        return features_encoded, target

    def check_class_imbalance(self, y: pl.Series) -> bool:
        """Check if class imbalance exceeds 80/20 ratio (Req 9.9).

        Args:
            y: Binary target series.

        Returns:
            True if minority class < 20% of total records.
        """
        counts = y.value_counts()
        total = len(y)
        if total == 0:
            return False

        # "count" column is always integer; cast for pyright since
        # .min() returns PythonLiteral | None
        min_count_raw = cast("int | None", counts["count"].min())
        minority_ratio = int(min_count_raw) / total if min_count_raw is not None else 0.0
        return minority_ratio < 0.20

    def train(self, df: pl.DataFrame) -> ModelResult:
        """Train risk model end-to-end.

        Steps:
        1. Prepare features and target
        2. Stratified train/test split (75/25, seed=42) (Req 9.2)
        3. Check class imbalance → apply class_weight if needed (Req 9.9)
        4. Train logistic regression (Req 9.1)
        5. If ROC-AUC < 0.60, try decision tree with max_depth=4 (Req 9.10)
        6. Evaluate and return results

        Args:
            df: Full PQR DataFrame.

        Returns:
            ModelResult with metrics, feature importance, and metadata.
        """
        # Step 1: Prepare features
        X, y = self.prepare_features(df)

        # Convert to numpy for sklearn
        X_np = X.to_numpy().astype(np.float64)
        y_np = y.to_numpy().astype(np.int32)

        # Step 2: Stratified split (Req 9.2)
        X_train, X_test, y_train, y_test = train_test_split(
            X_np,
            y_np,
            test_size=self._test_size,
            random_state=self._random_seed,
            stratify=y_np,
        )

        # Ensure arrays are np.ndarray for type safety
        X_test_arr: np.ndarray = np.asarray(X_test)
        y_test_arr: np.ndarray = np.asarray(y_test)

        # Step 3: Check class imbalance
        imbalanced = self.check_class_imbalance(y)
        class_weight = "balanced" if imbalanced else None

        # Compute class balance info
        unique_counts = y.value_counts().sort("tiempo_gestion_dias")
        total = len(y)
        class_balance = {}
        for row in unique_counts.iter_rows():
            class_balance[str(row[0])] = round(row[1] / total, 4)

        # Step 4: Train logistic regression (Req 9.1)
        lr_model = LogisticRegression(
            class_weight=class_weight,
            random_state=self._random_seed,
            max_iter=1000,
            solver="lbfgs",
        )
        lr_model.fit(X_train, y_train)

        # Evaluate logistic regression
        lr_metrics = self.evaluate(
            lr_model, X_test_arr, y_test_arr, model_type="logistic_regression"
        )

        limitations: list[str] = []
        final_model = lr_model
        final_metrics = lr_metrics

        # Step 5: If ROC-AUC < 0.60, try decision tree (Req 9.10)
        if lr_metrics.roc_auc < 0.60:
            limitations.append(
                f"Logistic regression ROC-AUC ({lr_metrics.roc_auc:.4f}) below 0.60 threshold. "
                "Attempted decision tree as alternative."
            )

            dt_model = DecisionTreeClassifier(
                max_depth=4,
                class_weight=class_weight,
                random_state=self._random_seed,
            )
            dt_model.fit(X_train, y_train)
            dt_metrics = self.evaluate(dt_model, X_test_arr, y_test_arr, model_type="decision_tree")

            if dt_metrics.roc_auc >= lr_metrics.roc_auc:
                final_model = dt_model
                final_metrics = dt_metrics
            else:
                limitations.append(
                    f"Decision tree ROC-AUC ({dt_metrics.roc_auc:.4f}) did not improve over "
                    f"logistic regression ({lr_metrics.roc_auc:.4f})."
                )

        # Check if final model still below threshold
        if final_metrics.roc_auc < 0.60:
            limitations.append(
                f"Final model ROC-AUC ({final_metrics.roc_auc:.4f}) is below 0.60. "
                "This model has limited predictive power. Consider feature engineering "
                "improvements such as: adding temporal features (day of week, month), "
                "interaction terms between cause and channel, or external data enrichment."
            )

        # Step 6: Compute feature importance
        importance = self.feature_importance(final_model)

        return ModelResult(
            model=final_model,
            metrics=final_metrics,
            feature_importance=importance,
            training_size=len(X_train),
            test_size=len(X_test),
            class_balance=class_balance,
            p90_threshold=self._p90_threshold,
            limitations=limitations,
            disclaimer=DISCLAIMER,
        )

    def evaluate(
        self, model: Any, X_test: np.ndarray, y_test: np.ndarray, model_type: str
    ) -> ModelMetrics:
        """Evaluate model on test set (Req 9.4).

        Computes precision, recall, F1-score, ROC-AUC, and confusion matrix.

        Args:
            model: Trained sklearn model.
            X_test: Test feature matrix.
            y_test: Test target vector.
            model_type: String identifier for the model type.

        Returns:
            ModelMetrics with all evaluation results.
        """
        y_pred = model.predict(X_test)
        y_proba = model.predict_proba(X_test)[:, 1]

        precision = float(precision_score(y_test, y_pred, zero_division="warn"))
        recall = float(recall_score(y_test, y_pred, zero_division="warn"))
        f1 = float(f1_score(y_test, y_pred, zero_division="warn"))
        roc_auc = float(roc_auc_score(y_test, y_proba))
        cm = confusion_matrix(y_test, y_pred).tolist()

        return ModelMetrics(
            precision=round(precision, 4),
            recall=round(recall, 4),
            f1_score=round(f1, 4),
            roc_auc=round(roc_auc, 4),
            confusion_matrix=cm,
            model_type=model_type,
            disclaimer=DISCLAIMER,
        )

    def feature_importance(self, model: Any) -> list[FeatureImportance]:
        """Extract and rank feature importance (Req 9.5).

        Uses coefficients for logistic regression or feature_importances_
        for decision trees, ranked in descending order of absolute value.

        Args:
            model: Trained sklearn model.

        Returns:
            List of FeatureImportance sorted by absolute importance descending.
        """
        if hasattr(model, "coef_"):
            # Logistic regression: use absolute value of coefficients
            importances = model.coef_[0]
        elif hasattr(model, "feature_importances_"):
            # Decision tree: use feature_importances_
            importances = model.feature_importances_
        else:
            return []

        # Build list and sort by absolute importance descending
        result = [
            FeatureImportance(feature=name, importance=round(float(imp), 6))
            for name, imp in zip(self._feature_columns, importances)
        ]
        result.sort(key=lambda x: abs(x.importance), reverse=True)

        return result
