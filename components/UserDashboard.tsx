"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, collection } from "firebase/firestore";
import { ref, onValue } from "firebase/database";
import { db, rtdb } from "@/lib/firebase";
import Navbar from "@/components/Navbar";
import PortfolioTable from "@/components/PortfolioTable";
import TransactionHistory from "@/components/TransactionHistory";
import { UserProfile, Stock } from "@/types";
import { useAuth } from "@/lib/hooks/useAuth";

interface PortfolioItem {
    symbol: string;
    quantity: number;
}

interface UserDashboardProps {
    uid: string;
}

export default function UserDashboard({ uid }: UserDashboardProps) {
    const { user: currentUser } = useAuth();
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
    const [stocks, setStocks] = useState<Record<string, Stock>>({});

    useEffect(() => {
        if (!uid) return;
        const unsubscribe = onSnapshot(doc(db, "users", uid), (docSnapshot) => {
            if (docSnapshot.exists()) {
                setUserProfile(docSnapshot.data() as UserProfile);
            }
        });
        return () => unsubscribe();
    }, [uid]);

    useEffect(() => {
        if (!uid) return;
        const unsubscribe = onSnapshot(collection(db, "users", uid, "portfolio"), (snapshot) => {
            const items: PortfolioItem[] = [];
            snapshot.forEach((docSnapshot) => {
                const data = docSnapshot.data();
                items.push({
                    symbol: data.symbol,
                    quantity: data.quantity,
                });
            });
            setPortfolio(items);
        });
        return () => unsubscribe();
    }, [uid]);

    useEffect(() => {
        const stocksRef = ref(rtdb, 'stocks');
        const unsubscribe = onValue(stocksRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setStocks(data);
            } else {
                setStocks({});
            }
        });
        return () => unsubscribe();
    }, []);

    if (!userProfile) return <div className="text-white p-8">Loading...</div>;

    let stockValue = 0;
    portfolio.forEach((item) => {
        const stock = stocks[item.symbol];
        if (stock) {
            stockValue += item.quantity * stock.price;
        }
    });

    const totalAssets = userProfile.balance + stockValue;

    return (
        <main className="min-h-screen bg-gray-900 text-white">
            <Navbar />
            <div className="container mx-auto p-4 space-y-8">
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                    <h1 className="text-3xl font-bold mb-4">{userProfile.displayName}'s Dashboard</h1>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-gray-700 p-4 rounded">
                            <div className="text-gray-400">Total Assets</div>
                            <div className="text-2xl font-bold">{totalAssets.toLocaleString()} KRW</div>
                        </div>
                        <div className="bg-gray-700 p-4 rounded">
                            <div className="text-gray-400">Cash Balance</div>
                            <div className="text-2xl font-bold">{userProfile.balance.toLocaleString()} KRW</div>
                        </div>
                        <div className="bg-gray-700 p-4 rounded">
                            <div className="text-gray-400">Stock Value</div>
                            <div className="text-2xl font-bold">{stockValue.toLocaleString()} KRW</div>
                        </div>
                    </div>
                </div>

                <PortfolioTable
                    uid={uid}
                    realtimeStocks={stocks}
                    isOwner={currentUser?.uid === uid}
                    balance={userProfile.balance}
                />

                <TransactionHistory uid={uid} stocks={stocks} />
            </div>
        </main>
    );
}
