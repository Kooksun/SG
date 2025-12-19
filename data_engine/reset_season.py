import argparse
import sys
from firebase_admin import db as rtdb_admin
from firebase_admin import firestore
import firestore_client  # Initializes Firebase app
from firestore_client import db as firestore_db

def delete_collection(coll_ref, batch_size):
    """
    Recursively delete a collection in batches.
    """
    docs = coll_ref.limit(batch_size).stream()
    deleted = 0

    for doc in docs:
        print(f"    Deleting document {doc.id}...")
        doc.reference.delete()
        deleted += 1

    if deleted >= batch_size:
        return deleted + delete_collection(coll_ref, batch_size)
    return deleted

def delete_user_data(dry_run=False):
    print("Fetching users...")
    users_ref = firestore_db.collection("users")
    docs = users_ref.stream()
    
    count = 0
    for doc in docs:
        uid = doc.id
        print(f"Found user: {uid}")
        
        if not dry_run:
            # 1. Delete Subcollections (Portfolio)
            portfolio_ref = users_ref.document(uid).collection("portfolio")
            deleted_items = delete_collection(portfolio_ref, 100)
            if deleted_items > 0:
                print(f"  - Deleted {deleted_items} portfolio items.")
            
            # 2. Delete User Document
            doc.reference.delete()
            print(f"  - Deleted user profile.")
        else:
            print(f"  [Dry Run] Would delete user {uid} and their portfolio.")
            
        count += 1
        
    print(f"Total users processed: {count}")

def delete_transactions(dry_run=False):
    print("Fetching transactions...")
    tx_ref = firestore_db.collection("transactions")
    
    if dry_run:
        # Just count them for dry run (counting huge collections might be slow but safe for now)
        # Using aggregation query is better for counting but simple stream limit is okay for small scale
        # For safety/speed let's just stream a few or check existence
        docs = tx_ref.limit(5).stream()
        found = sum(1 for _ in docs)
        if found > 0:
             print("  [Dry Run] Found transactions. Would delete all documents in 'transactions' collection.")
        else:
             print("  [Dry Run] No transactions found.")
    else:
        deleted = delete_collection(tx_ref, 100)
        print(f"Total transactions deleted: {deleted}")

def delete_rtdb_nodes(dry_run=False):
    print("Checking RTDB nodes...")
    ref = rtdb_admin.reference('ai_requests')
    
    if dry_run:
        data = ref.get()
        if data:
            print(f"  [Dry Run] Would delete 'ai_requests' node containing {len(data)} items.")
        else:
            print("  [Dry Run] 'ai_requests' node is empty or missing.")
    else:
        ref.delete()
        print("Deleted 'ai_requests' node from RTDB.")

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

    print("\n--- Step 1: Cleaning Firestore Users & Portfolios ---")
    delete_user_data(dry_run=args.dry_run)
    
    print("\n--- Step 2: Cleaning Firestore Transactions ---")
    delete_transactions(dry_run=args.dry_run)
    
    print("\n--- Step 3: Cleaning RTDB User Data ---")
    delete_rtdb_nodes(dry_run=args.dry_run)
    
    print("\n" + "="*60)
    if args.dry_run:
        print("Dry run completed. No changes made.")
    else:
        print("SEASON RESET COMPLETED SUCCESSFULLY.")
    print("="*60)

if __name__ == "__main__":
    main()
