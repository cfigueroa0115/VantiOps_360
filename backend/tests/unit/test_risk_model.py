"""Unit tests for risk.model module.

Tests the RiskModel class including feature preparation, class imbalance
detection, training, evaluation, and feature importance extraction.

Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10
"""

from __future__ import annotations

import numpy as np
import polars as pl
import pytest

from risk.model import (
    CREATION_TIME_FEATURES,
    DISCLAIMER,
    LEAKAGE_FIELDS,
    FeatureImportance,
    ModelMetrics,
    ModelResult,
    RiskModel,
)


def _build_sample_df(n: int = 500, seed: int = 42) -> pl.DataFrame:
    """Build a synthetic PQR DataFrame for testing.

    Creates a dataset with known P90 and a mix of features to ensure
    the model can be trained successfully.
    """
    rng = np.random.default_rng(seed)

    causas = ["cancelacion_servihogar", "falla_servicio", "facturacion", "otros"]
    canales = ["telefono", "presencial", "web", "correo"]
    empresas = ["vanti_sa", "vanti_gas"]
    tipos = ["peticion", "queja", "reclamo"]
    unidades = ["operaciones", "comercial", "tecnico"]
    marcaciones = ["urgente", "normal", "baja"]
    resultados = ["accede", "no_accede", "parcial"]

    # Generate management times with some correlation to features
    # causa=cancelacion_servihogar tends to have higher times
    tiempos = []
    causa_vals = []
    for _ in range(n):
        causa = rng.choice(causas, p=[0.50, 0.20, 0.20, 0.10])
        causa_vals.append(causa)
        if causa == "cancelacion_servihogar":
            t = rng.exponential(8.0)
        elif causa == "falla_servicio":
            t = rng.exponential(5.0)
        else:
            t = rng.exponential(4.0)
        tiempos.append(max(0.5, t))

    return pl.DataFrame(
        {
            "causa": causa_vals,
            "canal_atencion": rng.choice(canales, size=n).tolist(),
            "empresa": rng.choice(empresas, size=n).tolist(),
            "tipo_pqr": rng.choice(tipos, size=n).tolist(),
            "unidad_responsable": rng.choice(unidades, size=n).tolist(),
            "marcacion": rng.choice(marcaciones, size=n).tolist(),
            "tiempo_gestion_dias": tiempos,
            "fecha_cierre": [None] * n,  # leakage field
            "resultado": rng.choice(resultados, size=n).tolist(),  # leakage field
            "motivo_cierre": [None] * n,  # leakage field
        }
    )


class TestPrepareFeatures:
    """Tests for RiskModel.prepare_features()."""

    def test_excludes_leakage_fields(self):
        """Leakage fields (fecha_cierre, resultado, tiempo_gestion_dias, motivo_cierre)
        must not appear in features (Req 9.3, 9.7)."""
        df = _build_sample_df(n=100)
        model = RiskModel()
        X, y = model.prepare_features(df)

        feature_cols = X.columns
        for leak_field in LEAKAGE_FIELDS:
            assert not any(
                col.startswith(leak_field) for col in feature_cols
            ), f"Leakage field '{leak_field}' found in features"

    def test_uses_only_creation_time_features(self):
        """Only features available at creation time should be used (Req 9.3)."""
        df = _build_sample_df(n=100)
        model = RiskModel()
        X, y = model.prepare_features(df)

        # Each column in X should start with one of the creation-time feature names
        # (since they are one-hot encoded, they will be like 'causa_cancelacion_servihogar')
        for col in X.columns:
            assert any(
                col.startswith(feat) for feat in CREATION_TIME_FEATURES
            ), f"Column '{col}' does not correspond to a creation-time feature"

    def test_target_is_binary(self):
        """Target variable should be binary (0 or 1)."""
        df = _build_sample_df(n=200)
        model = RiskModel()
        X, y = model.prepare_features(df)

        unique_vals = set(y.to_list())
        assert unique_vals.issubset({0, 1})

    def test_target_is_p90_threshold(self):
        """Target = 1 iff tiempo_gestion_dias > P90."""
        df = _build_sample_df(n=200)
        model = RiskModel()
        X, y = model.prepare_features(df)

        # ~10% should be positive class (above P90)
        positive_rate = y.sum() / len(y)
        # Allow some tolerance due to > vs >= semantics
        assert 0.05 <= positive_rate <= 0.15

    def test_null_management_time_excluded(self):
        """Records with null tiempo_gestion_dias should be excluded."""
        df_with_nulls = pl.DataFrame(
            {
                "causa": ["A"] * 50 + ["B"] * 50,
                "canal_atencion": ["tel"] * 100,
                "empresa": ["vanti"] * 100,
                "tipo_pqr": ["peticion"] * 100,
                "unidad_responsable": ["ops"] * 100,
                "marcacion": ["normal"] * 100,
                "tiempo_gestion_dias": [5.0] * 40 + [None] * 10 + [3.0] * 45 + [None] * 5,
                "fecha_cierre": [None] * 100,
                "resultado": ["accede"] * 100,
                "motivo_cierre": [None] * 100,
            }
        )
        model = RiskModel()
        X, y = model.prepare_features(df_with_nulls)

        # 15 nulls removed → 85 records
        assert len(y) == 85
        assert X.height == 85

    def test_one_hot_encoding(self):
        """Features should be one-hot encoded (all numeric columns)."""
        df = _build_sample_df(n=100)
        model = RiskModel()
        X, y = model.prepare_features(df)

        # All columns should be numeric after one-hot encoding
        for col in X.columns:
            assert X[col].dtype in (pl.UInt8, pl.Int8, pl.Int32, pl.Int64, pl.Float64, pl.UInt32)


class TestCheckClassImbalance:
    """Tests for RiskModel.check_class_imbalance()."""

    def test_imbalanced_returns_true(self):
        """Should return True when minority < 20% (Req 9.9)."""
        # 90% class 0, 10% class 1
        y = pl.Series("target", [0] * 90 + [1] * 10)
        model = RiskModel()
        assert model.check_class_imbalance(y) is True

    def test_balanced_returns_false(self):
        """Should return False when minority >= 20%."""
        # 60% class 0, 40% class 1
        y = pl.Series("target", [0] * 60 + [1] * 40)
        model = RiskModel()
        assert model.check_class_imbalance(y) is False

    def test_exact_boundary_20_percent(self):
        """Exactly 20% minority should return False (not < 20%)."""
        # 80% class 0, 20% class 1
        y = pl.Series("target", [0] * 80 + [1] * 20)
        model = RiskModel()
        assert model.check_class_imbalance(y) is False

    def test_just_below_boundary(self):
        """Just under 20% (19%) should return True."""
        y = pl.Series("target", [0] * 81 + [1] * 19)
        model = RiskModel()
        assert model.check_class_imbalance(y) is True

    def test_empty_series(self):
        """Empty series should return False (no imbalance detected)."""
        y = pl.Series("target", [], dtype=pl.Int32)
        model = RiskModel()
        assert model.check_class_imbalance(y) is False


class TestTrain:
    """Tests for RiskModel.train()."""

    def test_returns_model_result(self):
        """Training should return a complete ModelResult."""
        df = _build_sample_df(n=300)
        model = RiskModel()
        result = model.train(df)

        assert isinstance(result, ModelResult)
        assert result.model is not None
        assert isinstance(result.metrics, ModelMetrics)
        assert len(result.feature_importance) > 0
        assert result.training_size > 0
        assert result.test_size > 0

    def test_stratified_split_proportions(self):
        """Train/test split should be approximately 75/25 (Req 9.2)."""
        df = _build_sample_df(n=400)
        model = RiskModel()
        result = model.train(df)

        total = result.training_size + result.test_size
        test_ratio = result.test_size / total
        assert 0.20 <= test_ratio <= 0.30

    def test_fixed_random_seed_reproducibility(self):
        """Same seed should produce identical results (Req 9.2)."""
        df = _build_sample_df(n=200)

        model1 = RiskModel(random_seed=42)
        result1 = model1.train(df)

        model2 = RiskModel(random_seed=42)
        result2 = model2.train(df)

        assert result1.metrics.roc_auc == result2.metrics.roc_auc
        assert result1.metrics.precision == result2.metrics.precision
        assert result1.metrics.recall == result2.metrics.recall

    def test_disclaimer_in_result(self):
        """All outputs must include disclaimer (Req 9.6)."""
        df = _build_sample_df(n=200)
        model = RiskModel()
        result = model.train(df)

        assert result.disclaimer == DISCLAIMER
        assert result.metrics.disclaimer == DISCLAIMER

    def test_p90_threshold_stored(self):
        """P90 threshold should be computed and stored."""
        df = _build_sample_df(n=200)
        model = RiskModel()
        result = model.train(df)

        assert result.p90_threshold > 0

    def test_class_balance_reported(self):
        """Class balance should be reported in results."""
        df = _build_sample_df(n=200)
        model = RiskModel()
        result = model.train(df)

        assert "0" in result.class_balance or "1" in result.class_balance
        # Sum of class proportions should be ~1.0
        total_prop = sum(result.class_balance.values())
        assert total_prop == pytest.approx(1.0, abs=0.01)

    def test_uses_sklearn(self):
        """Model should be a scikit-learn estimator (Req 9.8)."""
        df = _build_sample_df(n=200)
        model = RiskModel()
        result = model.train(df)

        assert hasattr(result.model, "predict")
        assert hasattr(result.model, "predict_proba")
        assert hasattr(result.model, "fit")


class TestEvaluate:
    """Tests for RiskModel.evaluate()."""

    def test_metrics_range(self):
        """All metrics should be in valid ranges (Req 9.4)."""
        df = _build_sample_df(n=300)
        model = RiskModel()
        result = model.train(df)

        assert 0.0 <= result.metrics.precision <= 1.0
        assert 0.0 <= result.metrics.recall <= 1.0
        assert 0.0 <= result.metrics.f1_score <= 1.0
        assert 0.0 <= result.metrics.roc_auc <= 1.0

    def test_confusion_matrix_shape(self):
        """Confusion matrix should be 2x2 for binary classification."""
        df = _build_sample_df(n=300)
        model = RiskModel()
        result = model.train(df)

        cm = result.metrics.confusion_matrix
        assert len(cm) == 2
        assert len(cm[0]) == 2
        assert len(cm[1]) == 2

    def test_confusion_matrix_sums_to_test_size(self):
        """Confusion matrix values should sum to test set size."""
        df = _build_sample_df(n=300)
        model = RiskModel()
        result = model.train(df)

        cm = result.metrics.confusion_matrix
        cm_total = sum(sum(row) for row in cm)
        assert cm_total == result.test_size

    def test_model_type_label(self):
        """Model type should be properly labeled."""
        df = _build_sample_df(n=200)
        model = RiskModel()
        result = model.train(df)

        assert result.metrics.model_type in ("logistic_regression", "decision_tree")


class TestFeatureImportance:
    """Tests for RiskModel.feature_importance()."""

    def test_returns_sorted_list(self):
        """Feature importance should be sorted by absolute value descending (Req 9.5)."""
        df = _build_sample_df(n=300)
        model = RiskModel()
        result = model.train(df)

        importances = result.feature_importance
        assert len(importances) > 0

        # Verify sorted descending by absolute importance
        for i in range(len(importances) - 1):
            assert abs(importances[i].importance) >= abs(importances[i + 1].importance)

    def test_feature_importance_dataclass(self):
        """Each entry should be a FeatureImportance dataclass."""
        df = _build_sample_df(n=200)
        model = RiskModel()
        result = model.train(df)

        for fi in result.feature_importance:
            assert isinstance(fi, FeatureImportance)
            assert isinstance(fi.feature, str)
            assert isinstance(fi.importance, float)

    def test_all_features_have_importance(self):
        """All encoded features should have an importance value."""
        df = _build_sample_df(n=200)
        model = RiskModel()
        result = model.train(df)

        # Number of importance entries should match number of encoded features
        assert len(result.feature_importance) == len(model._feature_columns)


class TestLimitations:
    """Tests for low ROC-AUC documentation (Req 9.10)."""

    def test_limitations_list_type(self):
        """Limitations should always be a list."""
        df = _build_sample_df(n=200)
        model = RiskModel()
        result = model.train(df)

        assert isinstance(result.limitations, list)

    def test_low_roc_auc_documented(self):
        """If ROC-AUC < 0.60, limitations should be documented (Req 9.10).

        We create a dataset with no signal to force low ROC-AUC.
        """
        rng = np.random.default_rng(123)
        n = 300
        # Random features with no correlation to target
        df = pl.DataFrame(
            {
                "causa": rng.choice(["A", "B"], size=n).tolist(),
                "canal_atencion": rng.choice(["X", "Y"], size=n).tolist(),
                "empresa": rng.choice(["E1", "E2"], size=n).tolist(),
                "tipo_pqr": rng.choice(["peticion", "queja"], size=n).tolist(),
                "unidad_responsable": rng.choice(["U1", "U2"], size=n).tolist(),
                "marcacion": rng.choice(["M1", "M2"], size=n).tolist(),
                # Random times → no pattern for model to learn
                "tiempo_gestion_dias": rng.uniform(1, 20, size=n).tolist(),
            }
        )
        model = RiskModel()
        result = model.train(df)

        # With random data, ROC-AUC should be near 0.5
        if result.metrics.roc_auc < 0.60:
            assert len(result.limitations) > 0
            # Should mention feature engineering improvements
            limitation_text = " ".join(result.limitations)
            assert "feature engineering" in limitation_text.lower() or "0.60" in limitation_text
