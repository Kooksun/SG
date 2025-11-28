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

    // Step 2: enforce credit limit by liquidating most recent buys (1 share each) until back under limit
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

    // Load buy transactions (latest first)
    const buyQuery = query(
        collection(db, "transactions"),
        where("uid", "==", uid),
        where("type", "==", "BUY"),
        orderBy("timestamp", "desc"),
        limit(200)
    );
    const buySnap = await getDocs(buyQuery);

    const priceCache: Record<string, number> = {};
    let currentUsedCredit = usedCreditAfterInterest;
    let sellsExecuted = 0;

    for (const docSnap of buySnap.docs) {
        if (currentUsedCredit <= creditLimit) break;
        const data = docSnap.data();
        const symbol = data.symbol as string;
        if (!symbol || !portfolioMap[symbol] || portfolioMap[symbol].quantity <= 0) continue;

        const sellPrice = await fetchPrice(symbol, portfolioMap, options, priceCache);
        if (!sellPrice || sellPrice <= 0) continue;

        try {
            await sellStock(uid, symbol, sellPrice, 1);
            portfolioMap[symbol].quantity -= 1;
            sellsExecuted += 1;

            // Refresh usedCredit after each sale to know if we can stop
            const refreshed = await getDoc(userRef);
            if (refreshed.exists()) {
                currentUsedCredit = refreshed.data().usedCredit || 0;
            }
        } catch (err) {
            console.error("Auto-liquidation failed for", symbol, err);
        }

        if (sellsExecuted >= 50) break; // safety guard
    }
}
