try:
    from google.cloud.firestore_v1.base_query import FieldFilter
    print("Imported FieldFilter from google.cloud.firestore_v1.base_query")
except ImportError:
    try:
        from google.cloud.firestore import FieldFilter
        print("Imported FieldFilter from google.cloud.firestore")
    except ImportError:
        print("Failed to import FieldFilter")
