import { db } from "@/lib/firebase";
import { doc, runTransaction, serverTimestamp, increment, collection } from "firebase/firestore";

export async function buyStock(uid: string, symbol: string, name: string, price: number, quantity: number) {
    if (quantity <= 0) throw new Error("Quantity must be positive");

    const cost = Math.floor(price * quantity);

    await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", uid);
        const portfolioRef = doc(db, "users", uid, "portfolio", symbol);

        // READS FIRST
        const userDoc = await transaction.get(userRef);
        const portfolioDoc = await transaction.get(portfolioRef);

        if (!userDoc.exists()) throw new Error("User does not exist");

        const userData = userDoc.data();
        if (typeof userData.startingBalance !== "number") {
            transaction.update(userRef, {
                startingBalance: 100000000,
            });
        }
        if (userData.balance < cost) throw new Error("Insufficient funds");

        // WRITES
        // Deduct balance
        transaction.update(userRef, {
            balance: increment(-cost)
        });

        // Update Portfolio
        if (portfolioDoc.exists()) {
            const currentQty = portfolioDoc.data().quantity;
            const currentAvg = portfolioDoc.data().averagePrice;
            const newQty = currentQty + quantity;
            const newAvg = Math.floor(((currentAvg * currentQty) + cost) / newQty);

            transaction.update(portfolioRef, {
                quantity: newQty,
                averagePrice: newAvg,
                currentPrice: price,
                valuation: newQty * price
            });
        } else {
            transaction.set(portfolioRef, {
                symbol: symbol,
                name: name,
                quantity: quantity,
                averagePrice: price,
                currentPrice: price,
                valuation: cost
            });
        }

        // Record Transaction
        const newTransactionRef = doc(collection(db, "transactions"));
        transaction.set(newTransactionRef, {
            uid: uid,
            symbol: symbol,
            type: "BUY",
            price: price,
            quantity: quantity,
            amount: cost,
            fee: 0,
            timestamp: serverTimestamp()
        });
    });
}

export async function sellStock(uid: string, symbol: string, price: number, quantity: number) {
    if (quantity <= 0) throw new Error("Quantity must be positive");

    const amount = Math.floor(price * quantity);
    const fee = Math.floor(amount * 0.0005); // 0.05% fee
    const proceeds = amount - fee;

    await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", uid);
        const portfolioRef = doc(db, "users", uid, "portfolio", symbol);

        // READS FIRST
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("User does not exist");
        const portfolioDoc = await transaction.get(portfolioRef);
        if (!portfolioDoc.exists()) throw new Error("You do not own this stock");

        const userData = userDoc.data();
        if (typeof userData.startingBalance !== "number") {
            transaction.update(userRef, {
                startingBalance: 100000000,
            });
        }

        const currentQty = portfolioDoc.data().quantity;
        const averagePrice = portfolioDoc.data().averagePrice; // Get average price
        if (currentQty < quantity) throw new Error("Insufficient quantity");

        // Calculate Profit
        const costBasis = Math.floor(averagePrice * quantity);
        const profit = proceeds - costBasis; // Net profit after fee

        // WRITES
        // Update Balance
        transaction.update(userRef, {
            balance: increment(proceeds)
        });

        // Update Portfolio
        const newQty = currentQty - quantity;
        if (newQty === 0) {
            transaction.delete(portfolioRef);
        } else {
            transaction.update(portfolioRef, {
                quantity: newQty,
                currentPrice: price,
                valuation: newQty * price
            });
        }

        // Record Transaction
        const newTransactionRef = doc(collection(db, "transactions"));
        transaction.set(newTransactionRef, {
            uid: uid,
            symbol: symbol,
            type: "SELL",
            price: price,
            quantity: quantity,
            amount: amount,
            fee: fee,
            profit: profit, // Store profit
            timestamp: serverTimestamp()
        });
    });
}
