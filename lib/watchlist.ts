import { db } from "@/lib/firebase";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";

export async function addToWatchlist(uid: string, symbol: string) {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
        watchlist: arrayUnion(symbol)
    });
}

export async function removeFromWatchlist(uid: string, symbol: string) {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
        watchlist: arrayRemove(symbol)
    });
}
