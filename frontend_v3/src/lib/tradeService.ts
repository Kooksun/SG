import {
    doc,
    setDoc,
    serverTimestamp as firestoreTimestamp,
    deleteDoc
} from "firebase/firestore";
import { ref, push, serverTimestamp as rtdbTimestamp } from "firebase/database";
import { db, rtdb } from "./firebase";

export interface TradeRequest {
    uid: string;
    symbol: string;
    name: string;
    type: 'BUY' | 'SELL';
    price: number;
    quantity: number;
    orderType?: 'MARKET' | 'LIMIT';
}

export const tradeService = {
    // 실시간 거래 처리 (RTDB 주문 요청 방식 - 시즌3 엔진 연동)
    async executeTrade({ uid, symbol, name, type, price, quantity, orderType = 'MARKET' }: TradeRequest) {
        if (!uid) throw new Error("로그인이 필요합니다.");

        // RTDB orders/{uid} 경로에 주문 추가
        const ordersRef = ref(rtdb, `orders/${uid}`);

        const orderData = {
            symbol,
            name,
            type,
            price, // 요청 당시 가격 (시장가 주문의 기준가 또는 지정가 주문의 타겟가)
            quantity,
            orderType,
            status: 'PENDING',
            createdAt: rtdbTimestamp()
        };

        try {
            await push(ordersRef, orderData);
        } catch (error: any) {
            console.error("Order submission failed:", error);
            throw new Error("주문 요청에 실패했습니다: " + error.message);
        }
    },

    // Watchlist 토글
    async toggleWatchlist(uid: string, symbol: string, isWatched: boolean) {
        const watchlistRef = doc(db, "users", uid, "watchlist", symbol);

        if (isWatched) {
            await setDoc(watchlistRef, {
                symbol,
                createdAt: firestoreTimestamp()
            });
        } else {
            await deleteDoc(watchlistRef);
        }
    }
};
