"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import PortfolioTable from "@/components/PortfolioTable";
import TransactionHistory from "@/components/TransactionHistory";
import { UserProfile, Stock } from "@/types";
import { useAuth } from "@/lib/hooks/useAuth";

interface PortfolioItem {
    symbol: string;
    quantity: number;
}

export default function UserPage() {
    const params = useParams();
    const uid = params.uid as string;
    const { user: currentUser } = useAuth();
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
    const [stocks, setStocks] = useState<Record<string, Stock>>({});

    // Fetch User Profile
    useEffect(() => {
        if (!uid) return;
        const unsubscribe = onSnapshot(doc(db, "users", uid), (doc) => {
            if (doc.exists()) {
                setUserProfile(doc.data() as UserProfile);
            }
        });
        return () => unsubscribe();
    }, [uid]);

    // Fetch Portfolio
    useEffect(() => {
        if (!uid) return;
        const unsubscribe = onSnapshot(collection(db, "users", uid, "portfolio"), (snapshot) => {
            const items: PortfolioItem[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                items.push({
                    symbol: data.symbol,
                    quantity: data.quantity,
                });
            });
            setPortfolio(items);
        });
        return () => unsubscribe();
    }, [uid]);

    // Fetch All Stocks (for real-time pricing)
    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, "stocks"), (snapshot) => {
            const stockMap: Record<string, Stock> = {};
            snapshot.forEach((doc) => {
                stockMap[doc.id] = doc.data() as Stock;
            });
            setStocks(stockMap);
        });
        return () => unsubscribe();
    }, []);

    if (!userProfile) return <div className="text-white p-8">Loading...</div>;

    // Calculate Dynamic Values
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

                {/* Pass stocks map to PortfolioTable to ensure it also uses real-time prices */}
                <PortfolioTable
                    uid={uid}
                    realtimeStocks={stocks}
                    isOwner={currentUser?.uid === uid}
                />

                <TransactionHistory uid={uid} />
            </div>
        </main>
    );
}
