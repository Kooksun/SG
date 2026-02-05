import {
    doc,
    setDoc,
    updateDoc,
    increment,
    serverTimestamp,
    writeBatch,
    getDoc,
    collection
} from "firebase/firestore";
import { db } from "./firebase";

export interface TradeRequest {
    uid: string;
    symbol: string;
    name: string;
    type: 'BUY' | 'SELL';
    price: number;
    quantity: number;
}

export const tradeService = {
    // 실시간 거래 처리 (전수 정산 방식)
    async executeTrade({ uid, symbol, name, type, price, quantity }: TradeRequest) {
        const userRef = doc(db, "users", uid);
        const portfolioRef = doc(db, "users", uid, "portfolio", symbol);
        const totalCost = price * quantity;

        const batch = writeBatch(db);

        if (type === 'BUY') {
            // 1. 잔고 차감 및 보유 주식 수 증가 (기본 데이터)
            batch.update(userRef, {
                balance: increment(-totalCost),
                lastTradeAt: serverTimestamp()
            });

            // 2. 포트폴리오 업데이트
            const portfolioSnap = await getDoc(portfolioRef);
            if (portfolioSnap.exists()) {
                const data = portfolioSnap.data();
                const newQuantity = data.quantity + quantity;
                const newTotalCost = (data.averagePrice * data.quantity) + totalCost;
                const newAveragePrice = Math.floor(newTotalCost / newQuantity);

                batch.update(portfolioRef, {
                    quantity: newQuantity,
                    averagePrice: newAveragePrice,
                    updatedAt: serverTimestamp()
                });
            } else {
                batch.set(portfolioRef, {
                    symbol,
                    name,
                    quantity,
                    averagePrice: price,
                    updatedAt: serverTimestamp()
                });
                // 종목 수 증가
                batch.update(userRef, {
                    stockCount: increment(1)
                });
            }
        } else {
            // SELL
            // 1. 잔고 증가
            batch.update(userRef, {
                balance: increment(totalCost),
                lastTradeAt: serverTimestamp()
            });

            // 2. 포트폴리오 업데이트
            const portfolioSnap = await getDoc(portfolioRef);
            if (!portfolioSnap.exists() || portfolioSnap.data().quantity < quantity) {
                throw new Error("보유 수량이 부족합니다.");
            }

            const data = portfolioSnap.data();
            const newQuantity = data.quantity - quantity;

            if (newQuantity === 0) {
                batch.delete(portfolioRef);
                batch.update(userRef, {
                    stockCount: increment(-1)
                });
            } else {
                batch.update(portfolioRef, {
                    quantity: newQuantity,
                    updatedAt: serverTimestamp()
                });
            }
        }

        // 3. 거래 내역 기록 (테이블 보관용)
        const historyRef = doc(collection(db, "users", uid, "history"));
        batch.set(historyRef, {
            symbol,
            name,
            type,
            price,
            quantity,
            totalAmount: totalCost,
            timestamp: serverTimestamp()
        });

        await batch.commit();
    }
};
