import os
import sys
import unittest
from datetime import datetime, timezone


sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from config import is_market_collection_time  # noqa: E402
from kis_client import transform_minute_rows  # noqa: E402


class TransformMinuteRowsTest(unittest.TestCase):
    def setUp(self):
        self.valid = {
            "stck_bsop_date": "20260902",
            "stck_cntg_hour": "100000",
            "stck_oprc": "72000",
            "stck_hgpr": "72300",
            "stck_lwpr": "71900",
            "stck_prpr": "72200",
            "cntg_vol": "1250",
        }
        self.cutoff = datetime(2026, 9, 2, 1, 1, tzinfo=timezone.utc)

    def test_valid_completed_bar_is_transformed_to_utc(self):
        result = transform_minute_rows("005930", [self.valid], self.cutoff, False)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["bar_time"], "2026-09-02T01:00:00+00:00")
        self.assertEqual(result[0]["close"], "72200")
        self.assertFalse(result[0]["public_visible"])

    def test_current_incomplete_bar_is_rejected(self):
        current = {**self.valid, "stck_cntg_hour": "100100"}
        result = transform_minute_rows("005930", [current], self.cutoff, False)
        self.assertEqual(result, [])

    def test_invalid_ohlc_is_rejected(self):
        invalid = {**self.valid, "stck_hgpr": "71000"}
        result = transform_minute_rows("005930", [invalid], self.cutoff, False)
        self.assertEqual(result, [])


class MarketHoursTest(unittest.TestCase):
    def test_weekday_open(self):
        self.assertTrue(
            is_market_collection_time(datetime(2026, 9, 2, 1, 0, tzinfo=timezone.utc))
        )

    def test_weekend_closed(self):
        self.assertFalse(
            is_market_collection_time(datetime(2026, 9, 5, 1, 0, tzinfo=timezone.utc))
        )


if __name__ == "__main__":
    unittest.main()
