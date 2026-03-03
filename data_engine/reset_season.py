"""
Season 3 Reset Script
Deletes all user data (including AI bots) to prepare for a fresh season start.

Targets:
  - Firebase Auth: All users
  - Firestore (Main): 'users' collection and all subcollections (portfolio, history)
  - RTDB (Main): orders, rankings, user_activities, commands
  - Supabase: trade_records, user_ranking_history tables
"""
import argparse
import sys
import os

# Add project root so we can import backend modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from backend.firebase_config import main_firestore, main_db
from firebase_admin import auth

# Supabase
try:
    from backend.supabase_client import get_supabase
except ImportError:
    from data_engine.supabase_client import get_supabase


def delete_collection(coll_ref, batch_size=100, dry_run=False):
    """Recursively delete a Firestore collection including all subcollections."""
    docs = coll_ref.limit(batch_size).stream()
    deleted = 0

    for doc in docs:
        # Recursively delete subcollections first
        for sub_coll in doc.reference.collections():
            if dry_run:
                print(f"    [Dry Run] Would delete subcollection: {doc.id}/{sub_coll.id}")
            else:
                print(f"    Deleting subcollection: {doc.id}/{sub_coll.id}")
            delete_collection(sub_coll, batch_size, dry_run)

        if not dry_run:
            doc.reference.delete()
        deleted += 1

    if deleted >= batch_size:
        return deleted + delete_collection(coll_ref, batch_size, dry_run)
    return deleted


# --- Step 1: Firebase Auth ---
def delete_auth_users(dry_run=False):
    """Delete ALL Firebase Authentication users (regular + bot accounts)."""
    print("Fetching Firebase Authentication users...")

    # Use main app for auth
    from backend.firebase_config import main_app
    users = []
    page = auth.list_users(app=main_app)
    while page:
        users.extend(page.users)
        page = page.get_next_page()

    count = len(users)
    print(f"Found {count} users in Firebase Authentication.")

    if count == 0:
        return

    if not dry_run:
        uids = [user.uid for user in users]
        for i in range(0, len(uids), 1000):
            batch = uids[i:i+1000]
            result = auth.delete_users(batch, app=main_app)
            print(f"  - Deleted {result.success_count} users. Errors: {result.failure_count}")
    else:
        for user in users[:10]:
            bot_tag = " [BOT]" if (user.custom_claims or {}).get("isBot") else ""
            print(f"  [Dry Run] Would delete: {user.uid} ({user.email or user.display_name or 'N/A'}){bot_tag}")
        if count > 10:
            print(f"  [Dry Run] ... and {count - 10} more users.")


# --- Step 2: Firestore ---
def delete_firestore_users(dry_run=False):
    """Delete 'users' collection and all subcollections (portfolio, history)."""
    print("Deleting Firestore 'users' collection (includes portfolio, history subcollections)...")

    users_ref = main_firestore.collection('users')
    docs = list(users_ref.stream())
    count = len(docs)
    print(f"Found {count} user documents in Firestore.")

    if count == 0:
        return

    for doc in docs:
        uid = doc.id
        data = doc.to_dict()
        name = data.get('displayName', uid)
        is_bot = data.get('isBot', False)
        tag = " [BOT]" if is_bot else ""

        # Delete subcollections (portfolio, history)
        for sub_name in ['portfolio', 'history']:
            sub_ref = doc.reference.collection(sub_name)
            sub_docs = list(sub_ref.stream())
            sub_count = len(sub_docs)
            if sub_count > 0:
                if dry_run:
                    print(f"  [Dry Run] Would delete {sub_count} docs from {uid}/{sub_name}")
                else:
                    for sub_doc in sub_docs:
                        sub_doc.reference.delete()
                    print(f"  - Deleted {sub_count} docs from {uid}/{sub_name}")

        # Delete the user document itself
        if dry_run:
            print(f"  [Dry Run] Would delete user: {name} ({uid}){tag}")
        else:
            doc.reference.delete()
            print(f"  - Deleted user: {name} ({uid}){tag}")


# --- Step 3: RTDB ---
def delete_rtdb_nodes(dry_run=False):
    """Delete user-related RTDB nodes (orders, rankings, user_activities, commands)."""
    nodes = ['orders', 'rankings', 'user_activities', 'commands', 'system/tickers']
    print(f"Cleaning RTDB nodes: {', '.join(nodes)}")

    for node in nodes:
        ref = main_db.child(node)
        data = ref.get()
        if data:
            item_count = len(data) if isinstance(data, (dict, list)) else 1
            if dry_run:
                print(f"  [Dry Run] Would delete '{node}' ({item_count} items)")
            else:
                ref.delete()
                print(f"  - Deleted '{node}' ({item_count} items)")
        else:
            print(f"  - '{node}' is already empty.")


# --- Step 4: Supabase ---
def delete_supabase_data(dry_run=False):
    """Delete all rows from trade_records and user_ranking_history tables."""
    print("Connecting to Supabase...")
    supabase = get_supabase()
    if not supabase:
        print("Supabase client not initialized. Skipping.")
        return

    tables = ["trade_records", "user_ranking_history"]

    for table in tables:
        print(f"  Cleaning table: {table}")
        if not dry_run:
            try:
                supabase.table(table).delete().neq("uid", "").execute()
                print(f"  - Deleted all rows from '{table}'.")
            except Exception as e:
                print(f"  - Error deleting from '{table}': {e}")
        else:
            print(f"  [Dry Run] Would delete all rows from '{table}'.")


# --- Main ---
def main():
    parser = argparse.ArgumentParser(description="SEASON 3 RESET: Deletes all user data (including AI bots) for a fresh start.")
    parser.add_argument("--dry-run", action="store_true", help="Preview what would be deleted without actually deleting.")
    parser.add_argument("--force", action="store_true", help="Skip confirmation prompt.")

    args = parser.parse_args()

    print("=" * 60)
    print("  SEASON 3 RESET SCRIPT")
    print("=" * 60)

    if args.dry_run:
        print("!!! DRY RUN MODE - NO DATA WILL BE DELETED !!!\n")

    if not args.dry_run and not args.force:
        print("⚠️  WARNING: This will PERMANENTLY DELETE all user data:")
        print("   - All Firebase Auth users")
        print("   - All Firestore user documents (portfolios, trade history)")
        print("   - All RTDB user data (orders, rankings, activities)")
        print("   - All Supabase records (trade_records, ranking_history)")
        print("   - ALL AI bot accounts and their data")
        print()
        confirm = input("Type 'RESET' to confirm: ")
        if confirm != "RESET":
            print("Aborted.")
            sys.exit(0)

    print("\n--- Step 1/4: Firebase Authentication Users ---")
    delete_auth_users(dry_run=args.dry_run)

    print("\n--- Step 2/4: Firestore Users & Subcollections ---")
    delete_firestore_users(dry_run=args.dry_run)

    print("\n--- Step 3/4: RTDB User Data ---")
    delete_rtdb_nodes(dry_run=args.dry_run)

    print("\n--- Step 4/4: Supabase Tables ---")
    delete_supabase_data(dry_run=args.dry_run)

    print("\n" + "=" * 60)
    if args.dry_run:
        print("  Dry run completed. No changes were made.")
    else:
        print("  ✅ SEASON 3 RESET COMPLETED SUCCESSFULLY.")
        print("  Run 'python -m backend.init_bots' to re-initialize AI bots.")
    print("=" * 60)


if __name__ == "__main__":
    main()
