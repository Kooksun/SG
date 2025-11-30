import { db, rtdb } from "@/lib/firebase";
import { sellStock } from "@/lib/trade";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, where } from "firebase/firestore";
import { get, ref } from "firebase/database";

const DAILY_INTEREST_RATE = 0.001; // 0.1% per day

interface ApplyInterestOptions {
    priceMap?: Record<string, number>;
}

interface PortfolioItem {
    symbol: string;
    quantity: number;
    averagePrice?: number;
    currentPrice?: number;
}

function diffInDays(lastDateString?: string): number {
    if (!lastDateString) return 0;
    const today = new Date();
    const todayUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const [year, month, day] = lastDateString.split("-").map((part) => parseInt(part, 10));
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return 0;
    const lastUTC = Date.UTC(year, month - 1, day);
    const diffMs = todayUTC - lastUTC;
    return diffMs > 0 ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : 0;
}

async function fetchPrice(symbol: string, portfolio: Record<string, PortfolioItem>, options?: ApplyInterestOptions, cache?: Record<string, number>): Promise<number> {
    const priceCache = cache || {};
    if (priceCache[symbol]) return priceCache[symbol];

    if (options?.priceMap && typeof options.priceMap[symbol] === "number") {
        priceCache[symbol] = options.priceMap[symbol];
        return priceCache[symbol];
    }

    try {
        const snapshot = await get(ref(rtdb, `stocks/${symbol}/price`));
        const price = snapshot.val();
        if (typeof price === "number") {
            priceCache[symbol] = price;
            return price;
        }
    } catch (err) {
        console.warn("Failed to fetch RTDB price", err);
    }

    const fallback = portfolio[symbol]?.currentPrice || portfolio[symbol]?.averagePrice || 0;
    priceCache[symbol] = fallback;
    return fallback;
}

export async function applyDailyInterestAndAutoLiquidate(uid: string, options?: ApplyInterestOptions) {
    // Step 1: accrue daily interest (deferred, on-demand)
    const userRef = doc(db, "users", uid);
    const todayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD in local time

    const { usedCreditAfterInterest, creditLimit } = await runTransaction(db, async (transaction) => {
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) throw new Error("User does not exist");

        const userData = userSnap.data();
        const usedCredit = userData.usedCredit || 0;
        const limit = userData.creditLimit || 0;
        const lastInterestDate = userData.lastInterestDate as string | undefined;

        const daysDiff = diffInDays(lastInterestDate);

        if (daysDiff > 0 && usedCredit > 0) {
            const interest = Math.floor(usedCredit * DAILY_INTEREST_RATE * daysDiff);
            const updatedUsedCredit = usedCredit + interest;
            transaction.update(userRef, {
                usedCredit: updatedUsedCredit,
                lastInterestDate: todayKey,
            });
            return { usedCreditAfterInterest: updatedUsedCredit, creditLimit: limit };
        }

        // If no interest applied, at least stamp lastInterestDate so we don't accrue repeatedly the same day
        if (!lastInterestDate) {
            transaction.update(userRef, { lastInterestDate: todayKey });
        }

        return { usedCreditAfterInterest: usedCredit, creditLimit: limit };
    });

    if (usedCreditAfterInterest <= creditLimit) return;

    // Step 2: enforce credit limit by liquidating most recent buys until back under limit
    let currentUsedCredit = usedCreditAfterInterest;
    let excessCredit = currentUsedCredit - creditLimit;

    if (excessCredit <= 0) return;

    console.log(`[Auto-Liquidation] User ${uid} is over limit by ${excessCredit}. Starting liquidation...`);

    // Build current portfolio map
    const portfolioSnap = await getDocs(collection(db, "users", uid, "portfolio"));
    const portfolioMap: Record<string, PortfolioItem> = {};
    portfolioSnap.forEach((docSnap) => {
        const data = docSnap.data();
        portfolioMap[data.symbol] = {
            symbol: data.symbol,
            quantity: data.quantity,
            averagePrice: data.averagePrice,
            currentPrice: data.currentPrice,
        };
    });

    // Load buy transactions (latest first) to implement LIFO-like liquidation
    const buyQuery = query(
        collection(db, "transactions"),
        where("uid", "==", uid),
        where("type", "==", "BUY"),
        orderBy("timestamp", "desc"),
        limit(200)
    );
    const buySnap = await getDocs(buyQuery);

    const priceCache: Record<string, number> = {};
    let sellsExecuted = 0;

    for (const docSnap of buySnap.docs) {
        if (excessCredit <= 0) break;

        const data = docSnap.data();
        const symbol = data.symbol as string;

        // Skip if we don't own this stock anymore
        if (!symbol || !portfolioMap[symbol] || portfolioMap[symbol].quantity <= 0) continue;

        const sellPrice = await fetchPrice(symbol, portfolioMap, options, priceCache);
        if (!sellPrice || sellPrice <= 0) continue;

        // Calculate how many shares we need to sell to cover the excess credit
        // We add a buffer of 1 share to be safe due to price fluctuations or fees
        // Fee is 0.05%, so net proceeds = price * 0.9995
        const netPricePerShare = sellPrice * 0.9995;
        const sharesNeeded = Math.ceil(excessCredit / netPricePerShare);

        // We can only sell what we have
        const sharesToSell = Math.min(sharesNeeded, portfolioMap[symbol].quantity);

        if (sharesToSell <= 0) continue;

        try {
            console.log(`[Auto-Liquidation] Selling ${sharesToSell} of ${symbol} @ ${sellPrice} to cover ${excessCredit}`);
            await sellStock(uid, symbol, sellPrice, sharesToSell);

            portfolioMap[symbol].quantity -= sharesToSell;
            sellsExecuted += 1;

            // Estimate the reduction in used credit
            // The actual reduction happens in sellStock transaction, but we estimate here to break the loop
            // In sellStock: creditRepayment = Math.min(usedCredit, proceeds)
            const proceeds = Math.floor(sellPrice * sharesToSell * 0.9995);
            const repaid = Math.min(currentUsedCredit, proceeds);

            currentUsedCredit -= repaid;
            excessCredit = currentUsedCredit - creditLimit;

        } catch (err) {
            console.error("Auto-liquidation failed for", symbol, err);
        }

        if (sellsExecuted >= 50) break; // safety guard
    }

    // Fallback: If we still have excess credit (maybe because recent buys didn't cover it, or portfolio is from legacy buys)
    // iterate through remaining portfolio items
    if (excessCredit > 0) {
        console.log(`[Auto-Liquidation] Still over limit by ${excessCredit} after checking recent buys. Checking remaining portfolio...`);
        for (const symbol in portfolioMap) {
            if (excessCredit <= 0) break;
            const item = portfolioMap[symbol];
            if (item.quantity <= 0) continue;

            const sellPrice = await fetchPrice(symbol, portfolioMap, options, priceCache);
            if (!sellPrice || sellPrice <= 0) continue;

            const netPricePerShare = sellPrice * 0.9995;
            const sharesNeeded = Math.ceil(excessCredit / netPricePerShare);
            const sharesToSell = Math.min(sharesNeeded, item.quantity);

            if (sharesToSell <= 0) continue;

            try {
                console.log(`[Auto-Liquidation] Fallback Selling ${sharesToSell} of ${symbol} @ ${sellPrice}`);
                await sellStock(uid, symbol, sellPrice, sharesToSell);

                item.quantity -= sharesToSell;

                const proceeds = Math.floor(sellPrice * sharesToSell * 0.9995);
                const repaid = Math.min(currentUsedCredit, proceeds);
                currentUsedCredit -= repaid;
                excessCredit = currentUsedCredit - creditLimit;
            } catch (err) {
                console.error("Auto-liquidation fallback failed for", symbol, err);
            }
        }
    }
}
