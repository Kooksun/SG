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

// Function removed as logic moved to backend scheduler
export async function applyDailyInterestAndAutoLiquidate(uid: string, options?: ApplyInterestOptions) {
    console.log("Interest calculation moved to backend.");
    return;
}

