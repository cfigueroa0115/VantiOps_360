"""Unit tests for PII detection and masking module.

Tests cover:
- PII column detection with default and custom patterns
- Value masking for strings of various lengths
- DataFrame masking with quarantine handling
- Edge cases: empty strings, nulls, special characters
"""

import hashlib

import polars as pl

from pipeline.pii_masking import (
    DEFAULT_PII_PATTERNS,
    MaskingResult,
    PIIMasker,
)


class TestPIIMaskerInit:
    """Test PIIMasker initialization and configuration."""

    def test_default_patterns_loaded(self):
        masker = PIIMasker()
        assert len(masker.patterns) == len(DEFAULT_PII_PATTERNS)

    def test_custom_patterns(self):
        custom = [r".*secret.*", r".*password.*"]
        masker = PIIMasker(pii_patterns=custom)
        assert len(masker.patterns) == 2

    def test_empty_patterns(self):
        masker = PIIMasker(pii_patterns=[])
        assert len(masker.patterns) == 0


class TestDetectPIIColumns:
    """Test PII column detection based on name patterns."""

    def test_detects_nombre_column(self):
        masker = PIIMasker()
        df = pl.DataFrame({"nombre_cliente": ["Ana"], "edad": [30]})
        detected = masker.detect_pii_columns(df)
        assert "nombre_cliente" in detected
        assert "edad" not in detected

    def test_detects_telefono(self):
        masker = PIIMasker()
        df = pl.DataFrame({"telefono_contacto": ["3001234567"]})
        detected = masker.detect_pii_columns(df)
        assert "telefono_contacto" in detected

    def test_detects_celular(self):
        masker = PIIMasker()
        df = pl.DataFrame({"celular": ["3109876543"]})
        detected = masker.detect_pii_columns(df)
        assert "celular" in detected

    def test_detects_direccion(self):
        masker = PIIMasker()
        df = pl.DataFrame({"direccion_residencia": ["Calle 123"]})
        detected = masker.detect_pii_columns(df)
        assert "direccion_residencia" in detected

    def test_detects_cedula(self):
        masker = PIIMasker()
        df = pl.DataFrame({"cedula": ["1234567890"]})
        detected = masker.detect_pii_columns(df)
        assert "cedula" in detected

    def test_detects_nit(self):
        masker = PIIMasker()
        df = pl.DataFrame({"nit_empresa": ["900123456"]})
        detected = masker.detect_pii_columns(df)
        assert "nit_empresa" in detected

    def test_detects_email(self):
        masker = PIIMasker()
        df = pl.DataFrame({"email_cliente": ["test@example.com"]})
        detected = masker.detect_pii_columns(df)
        assert "email_cliente" in detected

    def test_detects_correo(self):
        masker = PIIMasker()
        df = pl.DataFrame({"correo_electronico": ["test@example.com"]})
        detected = masker.detect_pii_columns(df)
        assert "correo_electronico" in detected

    def test_case_insensitive_detection(self):
        masker = PIIMasker()
        df = pl.DataFrame({"NOMBRE_CLIENTE": ["Ana"], "Telefono": ["123"]})
        detected = masker.detect_pii_columns(df)
        assert "NOMBRE_CLIENTE" in detected
        assert "Telefono" in detected

    def test_no_false_positives(self):
        masker = PIIMasker()
        df = pl.DataFrame({
            "fecha_creacion": ["2024-01-01"],
            "estado": ["activo"],
            "cantidad": [5],
        })
        detected = masker.detect_pii_columns(df)
        assert detected == []

    def test_multiple_pii_columns(self):
        masker = PIIMasker()
        df = pl.DataFrame({
            "nombre": ["Carlos"],
            "cedula": ["123"],
            "telefono": ["300"],
            "estado": ["activo"],
        })
        detected = masker.detect_pii_columns(df)
        assert len(detected) == 3
        assert "nombre" in detected
        assert "cedula" in detected
        assert "telefono" in detected


class TestMaskValue:
    """Test individual value masking."""

    def test_none_returns_none(self):
        assert PIIMasker.mask_value(None) is None

    def test_empty_string_returns_empty(self):
        assert PIIMasker.mask_value("") == ""

    def test_length_3_preserves_first_last(self):
        result = PIIMasker.mask_value("Ana")
        assert result == "A*a"

    def test_length_6_carlos(self):
        result = PIIMasker.mask_value("Carlos")
        assert result == "C****s"
        assert len(result) == 6

    def test_length_10_phone(self):
        result = PIIMasker.mask_value("3001234567")
        assert result == "3********7"
        assert result[0] == "3"
        assert result[-1] == "7"
        assert result[1:-1] == "********"

    def test_length_1_sha256_hash(self):
        result = PIIMasker.mask_value("A")
        expected_hash = hashlib.sha256("A".encode("utf-8")).hexdigest()[:8]
        assert result == expected_hash
        assert len(result) == 8

    def test_length_2_sha256_hash(self):
        result = PIIMasker.mask_value("AB")
        expected_hash = hashlib.sha256("AB".encode("utf-8")).hexdigest()[:8]
        assert result == expected_hash
        assert len(result) == 8

    def test_masked_never_equals_original_for_len_ge_2(self):
        """Property 24: masked output never equals original for strings len >= 2."""
        test_values = ["AB", "Ana", "Carlos", "María García", "3001234567"]
        for val in test_values:
            result = PIIMasker.mask_value(val)
            assert result != val, f"Masked value should differ from original for '{val}'"

    def test_preserves_length_for_ge_3(self):
        """For len >= 3, masked output has same length as input."""
        test_values = ["Ana", "Carlos", "María García López", "3001234567"]
        for val in test_values:
            result = PIIMasker.mask_value(val)
            assert len(result) == len(val)

    def test_special_characters_in_middle(self):
        result = PIIMasker.mask_value("a@b")
        assert result == "a*b"

    def test_unicode_string(self):
        result = PIIMasker.mask_value("María")
        assert result[0] == "M"
        assert result[-1] == "a"
        assert len(result) == len("María")


class TestMaskDataFrame:
    """Test DataFrame-level masking with quarantine handling."""

    def test_masks_pii_columns_only(self):
        masker = PIIMasker()
        df = pl.DataFrame({
            "nombre": ["Carlos", "Ana", "Pedro"],
            "edad": [30, 25, 40],
        })
        result = masker.mask_dataframe(df)
        assert result.masked_df["nombre"][0] == "C****s"
        assert result.masked_df["nombre"][1] == "A*a"
        assert result.masked_df["nombre"][2] == "P***o"
        # Non-PII column unchanged
        assert result.masked_df["edad"].to_list() == [30, 25, 40]

    def test_no_pii_columns_returns_original(self):
        masker = PIIMasker()
        df = pl.DataFrame({"estado": ["activo", "cerrado"], "cantidad": [1, 2]})
        result = masker.mask_dataframe(df)
        assert result.masked_df.equals(df)
        assert result.failed_records == []

    def test_null_values_pass_through(self):
        masker = PIIMasker()
        df = pl.DataFrame({"nombre": ["Carlos", None, "Ana"]})
        result = masker.mask_dataframe(df)
        assert result.masked_df["nombre"][0] == "C****s"
        assert result.masked_df["nombre"][1] is None
        assert result.masked_df["nombre"][2] == "A*a"

    def test_multiple_pii_columns_masked(self):
        masker = PIIMasker()
        df = pl.DataFrame({
            "nombre": ["Carlos"],
            "telefono": ["3001234567"],
            "estado": ["activo"],
        })
        result = masker.mask_dataframe(df)
        assert result.masked_df["nombre"][0] == "C****s"
        assert result.masked_df["telefono"][0] == "3********7"
        assert result.masked_df["estado"][0] == "activo"

    def test_empty_dataframe(self):
        masker = PIIMasker()
        df = pl.DataFrame({"nombre": pl.Series([], dtype=pl.Utf8)})
        result = masker.mask_dataframe(df)
        assert len(result.masked_df) == 0
        assert result.failed_records == []

    def test_failed_records_are_empty_on_success(self):
        masker = PIIMasker()
        df = pl.DataFrame({"nombre": ["Carlos", "Ana"]})
        result = masker.mask_dataframe(df)
        assert result.failed_records == []

    def test_short_values_get_hashed(self):
        masker = PIIMasker()
        df = pl.DataFrame({"nombre": ["AB", "X"]})
        result = masker.mask_dataframe(df)
        expected_ab = hashlib.sha256("AB".encode()).hexdigest()[:8]
        expected_x = hashlib.sha256("X".encode()).hexdigest()[:8]
        assert result.masked_df["nombre"][0] == expected_ab
        assert result.masked_df["nombre"][1] == expected_x

    def test_result_type(self):
        masker = PIIMasker()
        df = pl.DataFrame({"nombre": ["Carlos"]})
        result = masker.mask_dataframe(df)
        assert isinstance(result, MaskingResult)
        assert isinstance(result.masked_df, pl.DataFrame)
        assert isinstance(result.failed_records, list)
