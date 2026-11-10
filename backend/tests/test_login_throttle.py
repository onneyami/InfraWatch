import unittest

from src.login_throttle import FailureThrottle


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


class FailureThrottleTests(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self.t = FailureThrottle(window_seconds=900, clock=self.clock)

    def test_below_limit_is_not_blocked(self):
        for _ in range(4):
            self.t.record_failure(["ip:1"])
        self.assertEqual(self.t.retry_after([("ip:1", 5)]), 0)

    def test_blocks_at_limit_and_reports_wait(self):
        for _ in range(5):
            self.t.record_failure(["ip:1"])
        wait = self.t.retry_after([("ip:1", 5)])
        self.assertGreater(wait, 0)
        self.assertLessEqual(wait, 901)

    def test_unblocks_after_window(self):
        for _ in range(5):
            self.t.record_failure(["ip:1"])
        self.clock.advance(901)
        self.assertEqual(self.t.retry_after([("ip:1", 5)]), 0)

    def test_sliding_window_frees_one_slot_at_a_time(self):
        self.t.record_failure(["ip:1"])          # t=0
        self.clock.advance(500)
        for _ in range(4):
            self.t.record_failure(["ip:1"])      # t=500
        self.assertGreater(self.t.retry_after([("ip:1", 5)]), 0)
        self.clock.advance(401)                  # t=901: the first failure aged out
        self.assertEqual(self.t.retry_after([("ip:1", 5)]), 0)

    def test_keys_are_independent(self):
        for _ in range(5):
            self.t.record_failure(["ip:1"])
        self.assertEqual(self.t.retry_after([("ip:2", 5)]), 0)

    def test_most_restrictive_key_wins(self):
        for _ in range(3):
            self.t.record_failure(["ip:1", "id:bob"])
        # ip allows 3 (blocked), id allows 20 (fine) -> blocked overall
        self.assertGreater(self.t.retry_after([("ip:1", 3), ("id:bob", 20)]), 0)

    def test_reset_clears_only_given_keys(self):
        for _ in range(5):
            self.t.record_failure(["ip:1", "id:bob"])
        self.t.reset(["id:bob"])
        self.assertEqual(self.t.retry_after([("id:bob", 5)]), 0)
        self.assertGreater(self.t.retry_after([("ip:1", 5)]), 0)

    def test_memory_is_bounded(self):
        t = FailureThrottle(window_seconds=900, max_keys=50, clock=self.clock)
        for i in range(500):
            self.clock.advance(0.001)
            t.record_failure([f"ip:{i}"])
        self.assertLessEqual(len(t._failures), 50)

    def test_expired_keys_are_removed(self):
        self.t.record_failure(["ip:1"])
        self.clock.advance(901)
        self.t.retry_after([("ip:1", 5)])
        self.assertNotIn("ip:1", self.t._failures)


if __name__ == "__main__":
    unittest.main()
