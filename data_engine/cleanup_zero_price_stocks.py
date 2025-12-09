"""
Remove RTDB stock entries whose price is 0.

Uses the same firebase_admin initialization as scheduler_rtdb.py via
firestore_client import side effect.
"""

from firebase_admin import db

import firestore_client  # noqa: F401  # Initializes Firebase app and RTDB URL


def main() -> None:
    ref = db.reference("stocks")
    snapshot = ref.get() or {}

    zero_priced = []
    for symbol, value in snapshot.items():
        if not isinstance(value, dict):
            continue

        price = value.get("price")
        try:
            price_val = float(price)
        except (TypeError, ValueError):
            continue

        if price_val == 0:
            zero_priced.append(symbol)

    if not zero_priced:
        print("No zero-priced stocks found.")
        return

    print(f"Found {len(zero_priced)} zero-priced stocks: {', '.join(zero_priced)}")

    for symbol in zero_priced:
        ref.child(symbol).delete()
        print(f"Deleted stocks/{symbol}")

    print("Cleanup complete.")


if __name__ == "__main__":
    main()
