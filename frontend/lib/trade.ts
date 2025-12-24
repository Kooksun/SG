import { db, rtdb } from "@/lib/firebase";
import { doc, runTransaction, serverTimestamp, increment, collection, setDoc } from "firebase/firestore";
import { ref, update } from "firebase/database";

export async function buyStock(uid: string, symbol: string, name: string, price: number, quantity: number, market: string = "KRX") {
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

        // Initialize missing fields for legacy users
        if (typeof userData.startingBalance !== "number") {
            transaction.update(userRef, { startingBalance: 500000000 });
        }
        if (typeof userData.creditLimit !== "number") {
            transaction.update(userRef, {
                creditLimit: 500000000,
                usedCredit: 0,
            });
        }

        const balance = userData.balance || 0;
        const creditLimit = userData.creditLimit || 0;
        const usedCredit = userData.usedCredit || 0;

        let currentQty = 0;
        let currentAvg = 0;
        if (portfolioDoc.exists()) {
            currentQty = portfolioDoc.data().quantity;
            currentAvg = portfolioDoc.data().averagePrice;
        }

        // Universal logic for Cash vs Credit usage
        let cashToUse = cost;
        let creditToUse = 0;
        let creditToRelease = 0;

        if (currentQty < 0) {
            // Covering a short position
            const coveredQty = Math.min(Math.abs(currentQty), quantity);
            creditToRelease = Math.floor(currentAvg * coveredQty);
        }

        if (balance < cost) {
            // Not enough cash, use all available cash and then credit
            cashToUse = Math.max(0, balance);
            creditToUse = cost - cashToUse;
        } else {
            cashToUse = cost;
            creditToUse = 0;
        }

        const totalAvailable = balance + (creditLimit - usedCredit);
        if (totalAvailable < cost && currentQty >= 0) {
            throw new Error("Insufficient funds (including credit limit)");
        }

        // WRITES
        transaction.update(userRef, {
            balance: increment(-cashToUse),
            usedCredit: increment(creditToUse - creditToRelease)
        });

        // Update Portfolio
        const newQty = currentQty + quantity;
        if (newQty === 0) {
            transaction.delete(portfolioRef);
        } else {
            let newAvg = price;
            if (currentQty > 0) {
                // Average price for long: (prev_val + cost) / total_qty
                newAvg = Math.floor(((currentAvg * currentQty) + cost) / newQty);
            } else if (currentQty < 0 && newQty < 0) {
                // Average price for short remains the same sell price (or weighted sell price if adding to short)
                newAvg = currentAvg;
            } else if (currentQty < 0 && newQty > 0) {
                // Flipped from short to long
                newAvg = price;
            }

            transaction.set(portfolioRef, {
                symbol: symbol,
                name: name,
                quantity: newQty,
                averagePrice: newAvg,
                currentPrice: price,
                valuation: Math.abs(newQty) * price
            }, { merge: true });
        }

        // Record Transaction
        const newTransactionRef = doc(collection(db, "transactions"));
        const coveredQty = currentQty < 0 ? Math.min(Math.abs(currentQty), quantity) : 0;
        const profit = coveredQty > 0 ? (currentAvg - price) * coveredQty : 0;

        transaction.set(newTransactionRef, {
            uid: uid,
            symbol: symbol,
            name: name,
            type: currentQty < 0 ? "COVER" : "BUY",
            price: price,
            quantity: quantity,
            amount: cost,
            fee: 0,
            profit: profit,
            orderType: "MARKET",
            market: market,
            creditUsed: creditToUse,
            creditReleased: creditToRelease,
            timestamp: serverTimestamp()
        });
    });

    try {
        await update(ref(rtdb, `user_activities/${uid}`), {
            lastTransactionAt: new Date().toISOString()
        });
    } catch (error) {
        console.error("Error updating activity in RTDB:", error);
    }
}

export async function sellStock(uid: string, symbol: string, name: string, price: number, quantity: number, market: string = "KRX") {
    if (quantity <= 0) throw new Error("Quantity must be positive");

    const amount = Math.floor(price * quantity);
    const fee = Math.floor(amount * 0.001); // 0.1% fee
    const proceeds = amount - fee;

    await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", uid);
        const portfolioRef = doc(db, "users", uid, "portfolio", symbol);

        // READS FIRST
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("User does not exist");
        const portfolioDoc = await transaction.get(portfolioRef);

        const userData = userDoc.data();
        const currentQty = portfolioDoc.exists() ? portfolioDoc.data().quantity : 0;
        const currentAvg = portfolioDoc.exists() ? portfolioDoc.data().averagePrice : 0;

        // Initialize missing fields for legacy users
        if (typeof userData.startingBalance !== "number") {
            transaction.update(userRef, { startingBalance: 500000000 });
        }
        if (typeof userData.creditLimit !== "number") {
            transaction.update(userRef, {
                creditLimit: 500000000,
                usedCredit: 0,
            });
        }

        const creditLimit = userData.creditLimit || 500000000;
        const usedCredit = userData.usedCredit || 0;

        // Logic for Short Selling vs Normal Sell
        let creditToUse = 0;
        let creditRepayment = 0;
        let cashToRecieve = proceeds;

        if (currentQty <= 0) {
            // Short Selling (Starting or Increasing)
            // Proceeds are NOT added to balance immediately. They are 'held' in usedCredit liability.
            cashToRecieve = 0;
            creditToUse = amount;

            const availableCredit = creditLimit - usedCredit;
            if (availableCredit < creditToUse) {
                throw new Error("Insufficient credit limit for short selling");
            }
        } else {
            // Normal Sell (Long Position)
            const sellableQty = Math.min(currentQty, quantity);
            const shortQty = Math.max(0, quantity - sellableQty);

            if (usedCredit > 0) {
                creditRepayment = Math.min(usedCredit, proceeds);
            }

            if (shortQty > 0) {
                // Part of it is short selling
                const shortValue = Math.floor(price * shortQty);
                creditToUse = shortValue;
                // Proceeds from the 'short' part are restricted
                cashToRecieve = proceeds - shortValue;

                const availableCredit = creditLimit - (usedCredit - creditRepayment);
                if (availableCredit < creditToUse) {
                    throw new Error("Insufficient credit limit for additional short selling");
                }
            } else {
                cashToRecieve = proceeds - creditRepayment;
            }
        }

        // WRITES
        transaction.update(userRef, {
            balance: increment(proceeds - creditRepayment),
            usedCredit: increment(creditToUse - creditRepayment)
        });

        // Update Portfolio
        const newQty = currentQty - quantity;
        if (newQty === 0) {
            transaction.delete(portfolioRef);
        } else {
            let newAvg = currentAvg;
            if (currentQty > 0 && newQty > 0) {
                // Selling long doesn't change average price
                newAvg = currentAvg;
            } else if (currentQty <= 0) {
                // Increasing short: weighted average of sell prices
                newAvg = Math.floor(((currentAvg * Math.abs(currentQty)) + amount) / Math.abs(newQty));
            } else if (currentQty > 0 && newQty < 0) {
                // Flipped from long to short
                newAvg = price;
            }

            transaction.set(portfolioRef, {
                symbol: symbol,
                name: name,
                quantity: newQty,
                averagePrice: newAvg,
                currentPrice: price,
                valuation: Math.abs(newQty) * price,
            }, { merge: true });
        }

        // Record Transaction(s)
        const sellableQty = currentQty > 0 ? Math.min(currentQty, quantity) : 0;
        const shortQty = currentQty > 0 ? Math.max(0, quantity - sellableQty) : quantity;

        // 1. Record SELL transaction for long position part
        if (sellableQty > 0) {
            const sellAmount = Math.floor(price * sellableQty);
            const sellFee = Math.floor(sellAmount * 0.001);
            const sellProceeds = sellAmount - sellFee;
            const sellProfit = sellProceeds - Math.floor(currentAvg * sellableQty);

            const newTransactionRef = doc(collection(db, "transactions"));
            transaction.set(newTransactionRef, {
                uid: uid,
                symbol: symbol,
                name: name,
                type: "SELL",
                price: price,
                quantity: sellableQty,
                amount: sellAmount,
                fee: sellFee,
                profit: sellProfit,
                orderType: "MARKET",
                market: market,
                creditUsed: 0,
                creditRepaid: shortQty === 0 ? creditRepayment : 0,
                timestamp: serverTimestamp()
            });
        }

        // 2. Record SHORT transaction for the shorting part
        if (shortQty > 0) {
            const shortAmount = Math.floor(price * shortQty);
            const shortFee = Math.floor(shortAmount * 0.001);

            const newTransactionRef = doc(collection(db, "transactions"));
            transaction.set(newTransactionRef, {
                uid: uid,
                symbol: symbol,
                name: name,
                type: "SHORT",
                price: price,
                quantity: shortQty,
                amount: shortAmount,
                fee: shortFee,
                profit: 0,
                orderType: "MARKET",
                market: market,
                creditUsed: shortAmount,
                creditRepaid: sellableQty === 0 ? creditRepayment : 0,
                timestamp: serverTimestamp()
            });
        }
    });

    try {
        await update(ref(rtdb, `user_activities/${uid}`), {
            lastTransactionAt: new Date().toISOString()
        });
    } catch (error) {
        console.error("Error updating activity in RTDB:", error);
    }
}

export async function placeLimitOrder(uid: string, symbol: string, name: string, type: "BUY" | "SELL", targetPrice: number, quantity: number, market: string = "KRX") {
    if (quantity <= 0) throw new Error("Quantity must be positive");
    if (targetPrice <= 0) throw new Error("Target price must be positive");

    const orderRef = doc(collection(db, "active_orders"));
    await setDoc(orderRef, {
        uid,
        symbol,
        name,
        type,
        orderType: "LIMIT",
        targetPrice,
        quantity,
        market,
        status: "PENDING",
        timestamp: serverTimestamp()
    });
}

export async function claimMissionReward(uid: string, missionId: string) {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD
    const missionRef = doc(db, "users", uid, "missions", today);

    await runTransaction(db, async (transaction) => {
        const missionDoc = await transaction.get(missionRef);
        if (!missionDoc.exists()) throw new Error("오늘의 미션 정보를 찾을 수 없습니다.");

        const data = missionDoc.data();
        const missions = data.missions || [];
        const index = missions.findIndex((m: any) => m.id === missionId);

        if (index === -1) throw new Error("미션을 찾을 수 없습니다.");
        const mission = missions[index];

        if (mission.status !== "COMPLETED") {
            throw new Error("미션이 완료되지 않았거나 이미 보상을 받았습니다.");
        }

        const reward = mission.reward || 0;
        const userRef = doc(db, "users", uid);

        // Update User Points
        transaction.update(userRef, {
            points: increment(reward)
        });

        // Update Mission Status
        missions[index].status = "CLAIMED";
        transaction.update(missionRef, {
            missions: missions,
            updatedAt: serverTimestamp()
        });

        // Record Reward Transaction
        const txRef = doc(collection(db, "transactions"));
        transaction.set(txRef, {
            uid: uid,
            type: "REWARD",
            points: reward,
            name: `미션 보상: ${mission.title}`,
            timestamp: serverTimestamp()
        });
    });
}
