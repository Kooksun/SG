import argparse
import sys
from firebase_admin import db as rtdb_admin
from firebase_admin import firestore, auth
import firestore_client  # Initializes Firebase app
from firestore_client import db as firestore_db
from supabase_client import get_supabase

def delete_collection(coll_ref, batch_size, dry_run=False):
    """
    Recursively delete a collection and all its documents and subcollections in batches.
    """
    docs = coll_ref.limit(batch_size).stream()
    deleted = 0

    for doc in docs:
        # First, recursively delete all subcollections of this document
        subcollections = doc.reference.collections()
        for sub_coll in subcollections:
            if not dry_run:
                print(f"    Processing subcollection: {doc.id}/{sub_coll.id}")
                delete_collection(sub_coll, batch_size, dry_run)
            else:
                print(f"    [Dry Run] Would process subcollection: {doc.id}/{sub_coll.id}")

        print(f"    Deleting document {doc.id}...")
        if not dry_run:
            doc.reference.delete()
        deleted += 1

    if deleted >= batch_size:
        return deleted + delete_collection(coll_ref, batch_size, dry_run)
    return deleted

def delete_auth_users(dry_run=False):
    print("Fetching Firebase Authentication users...")
    
    users = []
    page = auth.list_users()
    while page:
        users.extend(page.users)
        page = page.get_next_page()
    
    count = len(users)
    print(f"Found {count} users in Firebase Authentication.")
    
    if count == 0:
        return

    if not dry_run:
        uids = [user.uid for user in users]
        # auth.delete_users can handle up to 1000 users per call
        for i in range(0, len(uids), 1000):
            batch = uids[i:i+1000]
            result = auth.delete_users(batch)
            print(f"  - Deleted {result.success_count} users. Errors: {result.failure_count}")
    else:
        for user in users[:5]:
            print(f"  [Dry Run] Would delete user: {user.uid} ({user.email or 'No Email'})")
        if count > 5:
            print(f"  [Dry Run] ... and {count - 5} more users.")

def delete_all_firestore_collections(dry_run=False):
    print("Fetching all top-level Firestore collections...")
    collections = firestore_db.collections()
    
    count = 0
    for coll_ref in collections:
        print(f"Processing collection: {coll_ref.id}")
        if not dry_run:
            deleted_items = delete_collection(coll_ref, 100, dry_run=False)
            print(f"  - Deleted {deleted_items} documents from '{coll_ref.id}'.")
        else:
            deleted_items = delete_collection(coll_ref, 100, dry_run=True)
            print(f"  [Dry Run] Would delete {deleted_items} documents and their subcollections in '{coll_ref.id}'.")
        count += 1
    
    if count == 0:
        print("No Firestore collections found.")
    else:
        print(f"Total collections processed: {count}")

# delete_transactions is now redundant as we delete ALL collections, but kept here for reference if needed
# or can be removed. Let's remove it to keep it clean.

def delete_rtdb_nodes(dry_run=False):
    nodes = ['ai_requests', 'custom_symbols', 'search_requests', 'search_results']
    print(f"Checking RTDB nodes: {', '.join(nodes)}")
    
    for node in nodes:
        ref = rtdb_admin.reference(node)
        if dry_run:
            data = ref.get()
            if data:
                print(f"  [Dry Run] Would delete '{node}' node containing {len(data) if isinstance(data, (dict, list)) else 1} items.")
            else:
                print(f"  [Dry Run] '{node}' node is empty or missing.")
        else:
            ref.delete()
            print(f"Deleted '{node}' node from RTDB.")

def delete_supabase_data(dry_run=False):
    print("Connecting to Supabase...")
    supabase = get_supabase()
    if not supabase:
        print("Supabase client not initialized. Skipping.")
        return

    table = "user_ranking_history"
    print(f"Checking Supabase table: {table}")
    
    if not dry_run:
        try:
            # PostgREST requires a filter to perform a delete. 
            # We'll delete all rows where 'uid' is not empty (which should be all rows).
            response = supabase.table(table).delete().neq("uid", "").execute()
            print(f"  - Deleted rows from Supabase table '{table}'.")
        except Exception as e:
            print(f"  - Error deleting from Supabase: {e}")
    else:
        print(f"  [Dry Run] Would delete all rows from Supabase table '{table}'.")

def main():
    parser = argparse.ArgumentParser(description="RESET SEASON: Deletes all user data to start a new season.")
    parser.add_argument("--dry-run", action="store_true", help="Scan and print what would be deleted without actually deleting.")
    parser.add_argument("--force", action="store_true", help="Skip confirmation prompt.")
    
    args = parser.parse_args()
    
    print("="*60)
    print("SEASON RESET SCRIPT")
    print("="*60)
    
    if args.dry_run:
        print("!!! DRY RUN MODE - NO DATA WILL BE DELETED !!!")
    
    if not args.dry_run and not args.force:
        print("WARNING: THIS WILL PERMANENTLY DELETE ALL USER DATA (Portfolios, Users, Transactions).")
        print("Stock market data and history will be PRESERVED.")
        confirm = input("Are you sure you want to proceed? Type 'RESET' to confirm: ")
        if confirm != "RESET":
            print("Aborted.")
            sys.exit(0)

    print("\n--- Step 1: Cleaning Firebase Authentication Users ---")
    delete_auth_users(dry_run=args.dry_run)

    print("\n--- Step 2: Cleaning ALL Firestore Collections ---")
    delete_all_firestore_collections(dry_run=args.dry_run)
    
    print("\n--- Step 3: Cleaning RTDB User Data ---")
    delete_rtdb_nodes(dry_run=args.dry_run)
    
    print("\n--- Step 4: Cleaning Supabase Ranking History ---")
    delete_supabase_data(dry_run=args.dry_run)
    
    print("\n" + "="*60)
    if args.dry_run:
        print("Dry run completed. No changes made.")
    else:
        print("SEASON RESET COMPLETED SUCCESSFULLY.")
    print("="*60)

if __name__ == "__main__":
    main()
