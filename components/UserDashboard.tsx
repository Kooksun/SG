"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, collection } from "firebase/firestore";
import { ref, onValue, set } from "firebase/database";
import { db, rtdb } from "@/lib/firebase";
import Navbar from "@/components/Navbar";
import PortfolioTable from "@/components/PortfolioTable";
import TransactionHistory from "@/components/TransactionHistory";
import { UserProfile, Stock } from "@/types";
import { useAuth } from "@/lib/hooks/useAuth";
import { applyDailyInterestAndAutoLiquidate } from "@/lib/credit";

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
    const [exchangeRate, setExchangeRate] = useState(1400);
    const [aiStatus, setAiStatus] = useState<'idle' | 'pending' | 'completed'>('idle');
    const [aiResult, setAiResult] = useState<string | null>(null);
    const [aiTimestamp, setAiTimestamp] = useState<string | null>(null);
    const interestAppliedRef = useRef(false);

    useEffect(() => {
        const rateRef = ref(rtdb, 'system/exchange_rate');
        const unsubscribe = onValue(rateRef, (snapshot) => {
            const data = snapshot.val();
            if (data) setExchangeRate(data);
        });
        return () => unsubscribe();
    }, []);

    // Listen for AI Analysis Request Status
    useEffect(() => {
        if (!uid) return;
        const aiRef = ref(rtdb, `ai_requests/${uid}`);
        const unsubscribe = onValue(aiRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setAiStatus(data.status);
                if (data.status === 'completed' && data.result) {
                    setAiResult(data.result);
                    setAiTimestamp(data.completedAt); // Set timestamp
                }
            } else {
                setAiStatus('idle');
                setAiResult(null);
                setAiTimestamp(null);
            }
        });
        return () => unsubscribe();
    }, [uid]);

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
        if (!uid || !currentUser || currentUser.uid !== uid) return;
        if (interestAppliedRef.current) return;
        interestAppliedRef.current = true;

        const priceMap: Record<string, number> = {};
        Object.entries(stocks).forEach(([symbol, stock]) => {
            if (typeof stock.price === "number") {
                priceMap[symbol] = stock.price;
            }
        });

        void applyDailyInterestAndAutoLiquidate(uid, { priceMap });
    }, [uid, currentUser, stocks]);

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

    const handleRequestAiAnalysis = async () => {
        if (!uid) return;
        try {
            await set(ref(rtdb, `ai_requests/${uid}`), {
                status: 'pending',
                timestamp: Date.now()
            });
        } catch (error) {
            console.error("Failed to request AI analysis:", error);
            alert("분석 요청 중 오류가 발생했습니다.");
        }
    };

    if (!userProfile) return <div className="text-white p-8">Loading...</div>;

    let stockValue = 0;
    portfolio.forEach((item) => {
        const stock = stocks[item.symbol];
        if (stock) {
            const price = stock.currency === 'USD' ? stock.price * exchangeRate : stock.price;
            stockValue += item.quantity * price;
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

                    {/* Credit Information */}
                    <div className="mt-6 bg-gradient-to-r from-blue-900 to-purple-900 p-4 rounded-lg border border-blue-700">
                        <h2 className="text-xl font-bold mb-3 flex items-center">
                            💳 Credit Information
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div>
                                <div className="text-gray-300 text-sm">Credit Limit</div>
                                <div className="text-lg font-bold text-blue-300">
                                    {(userProfile.creditLimit || 0).toLocaleString()} KRW
                                </div>
                            </div>
                            <div>
                                <div className="text-gray-300 text-sm">Used Credit</div>
                                <div className="text-lg font-bold text-red-300">
                                    {(userProfile.usedCredit || 0).toLocaleString()} KRW
                                </div>
                                {(userProfile.usedCredit || 0) > 0 && (
                                    <div className="text-xs text-red-400 mt-1">
                                        (Est. Daily Interest: {Math.floor((userProfile.usedCredit || 0) * 0.001).toLocaleString()} KRW)
                                    </div>
                                )}
                            </div>
                            <div>
                                <div className="text-gray-300 text-sm">Available Credit</div>
                                <div className="text-lg font-bold text-green-300">
                                    {((userProfile.creditLimit || 0) - (userProfile.usedCredit || 0)).toLocaleString()} KRW
                                </div>
                            </div>
                            <div>
                                <div className="text-gray-300 text-sm">Total Buying Power</div>
                                <div className="text-lg font-bold text-yellow-300">
                                    {(userProfile.balance + (userProfile.creditLimit || 0) - (userProfile.usedCredit || 0)).toLocaleString()} KRW
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* AI Portfolio Analysis */}
                    <div className="mt-6 bg-gradient-to-r from-green-900 to-teal-900 p-4 rounded-lg border border-green-700">
                        <div className="flex justify-between items-start">
                            <div>
                                <h2 className="text-xl font-bold mb-2 flex items-center">
                                    🤖 AI Portfolio Coach
                                </h2>
                                <p className="text-gray-300 text-sm mb-4">
                                    Get personalized advice on your portfolio from AI.
                                </p>
                            </div>
                            {aiStatus !== 'pending' && (
                                <button
                                    onClick={handleRequestAiAnalysis}
                                    className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded shadow transition"
                                >
                                    {aiStatus === 'completed' ? 'Re-analyze' : 'Analyze Portfolio'}
                                </button>
                            )}
                        </div>

                        {aiStatus === 'pending' && (
                            <div className="flex items-center space-x-2 text-green-200 animate-pulse">
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>AI is analyzing your portfolio...</span>
                            </div>
                        )}

                        {aiStatus === 'completed' && aiResult && (
                            <div className="bg-black bg-opacity-30 p-4 rounded text-green-100 whitespace-pre-wrap leading-relaxed border border-green-800">
                                {aiResult}
                                {aiTimestamp && (
                                    <div className="text-xs text-green-400 mt-4 text-right">
                                        Analysed at: {new Date(aiTimestamp).toLocaleString()}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <PortfolioTable
                    uid={uid}
                    realtimeStocks={stocks}
                    isOwner={currentUser?.uid === uid}
                    balance={userProfile.balance}
                    creditLimit={userProfile.creditLimit || 0}
                    usedCredit={userProfile.usedCredit || 0}
                />

                <TransactionHistory uid={uid} stocks={stocks} />
            </div>
        </main>
    );
}
