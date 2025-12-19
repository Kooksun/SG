"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, collection, query, where } from "firebase/firestore";
import { ref, onValue, set } from "firebase/database";
import { db, rtdb } from "@/lib/firebase";
import Navbar from "@/components/Navbar";
import PortfolioTable from "@/components/PortfolioTable";
import TransactionHistory from "@/components/TransactionHistory";
import DashboardOverview from "@/components/DashboardOverview";
import ActiveOrders from "@/components/ActiveOrders";
import { UserProfile, Stock } from "@/types";
import { useAuth } from "@/lib/hooks/useAuth";
import { applyDailyInterestAndAutoLiquidate } from "@/lib/credit";
import { LayoutDashboard, PieChart, History } from "lucide-react";

interface PortfolioItem {
    symbol: string;
    quantity: number;
    averagePrice: number;
}

interface UserDashboardProps {
    uid: string;
}

type Tab = 'overview' | 'portfolio' | 'history' | 'orders';

export default function UserDashboard({ uid }: UserDashboardProps) {
    const { user: currentUser } = useAuth();
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
    const [stocks, setStocks] = useState<Record<string, Stock>>({});
    const [exchangeRate, setExchangeRate] = useState(1400);
    const [aiStatus, setAiStatus] = useState<'idle' | 'pending' | 'completed'>('idle');
    const [aiResult, setAiResult] = useState<string | null>(null);
    const [aiTimestamp, setAiTimestamp] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [pendingSymbols, setPendingSymbols] = useState<Set<string>>(new Set());
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
                    setAiTimestamp(data.completedAt);
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
                const symbol = data.symbol || docSnapshot.id;
                items.push({
                    symbol: symbol,
                    quantity: data.quantity,
                    averagePrice: data.averagePrice || 0,
                });
            });
            setPortfolio(items);
        });
        return () => unsubscribe();
    }, [uid]);

    useEffect(() => {
        if (!uid || currentUser?.uid !== uid) {
            setPendingSymbols(new Set());
            return;
        }
        const q = query(
            collection(db, "active_orders"),
            where("uid", "==", uid),
            where("status", "==", "PENDING")
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const symbols = new Set<string>();
            snapshot.docs.forEach(doc => {
                symbols.add(doc.data().symbol);
            });
            setPendingSymbols(symbols);
        });
        return () => unsubscribe();
    }, [uid, currentUser]);

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

    let longStockValue = 0;
    let shortStockValue = 0;
    let totalShortInitialValue = 0;
    portfolio.forEach((item) => {
        const stock = stocks[item.symbol];
        if (stock) {
            const price = stock.currency === 'USD' ? stock.price * exchangeRate : stock.price;
            if (item.quantity > 0) {
                longStockValue += item.quantity * price;
            } else if (item.quantity < 0) {
                // Short value is the current cost to cover. 
                shortStockValue += Math.abs(item.quantity) * price;
                // Initial value is what was added to usedCredit when shorting
                totalShortInitialValue += Math.abs(item.quantity) * (item.averagePrice || 0);
            }
        }
    });

    const totalAssets = userProfile.balance + longStockValue;

    return (
        <main className="min-h-screen bg-gray-900 text-white">
            <Navbar />
            <div className="container mx-auto p-4 space-y-6">
                {/* Header & Tabs Compact Layout */}
                <div className="flex flex-col md:flex-row justify-between items-center bg-gray-800 p-2 rounded-lg mb-6 shadow-md border border-gray-700">
                    <div className="flex items-center space-x-6 px-4">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <LayoutDashboard className="text-blue-400" size={24} />
                            {userProfile.displayName}'s Page
                        </h2>

                        <div className="h-6 w-px bg-gray-600 hidden md:block"></div>

                        <div className="flex space-x-1">
                            <button
                                onClick={() => setActiveTab('overview')}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'overview'
                                    ? 'bg-blue-600 text-white shadow'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                                    }`}
                            >
                                Overview
                            </button>
                            <button
                                onClick={() => setActiveTab('portfolio')}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'portfolio'
                                    ? 'bg-blue-600 text-white shadow'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                                    }`}
                            >
                                Portfolio
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'history'
                                    ? 'bg-blue-600 text-white shadow'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                                    }`}
                            >
                                History
                            </button>
                            {currentUser?.uid === uid && (
                                <button
                                    onClick={() => setActiveTab('orders')}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'orders'
                                        ? 'bg-blue-600 text-white shadow'
                                        : 'text-gray-400 hover:text-white hover:bg-gray-700'
                                        }`}
                                >
                                    Orders
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Tab Content */}
                <div className="min-h-[500px]">
                    {activeTab === 'overview' && (
                        <DashboardOverview
                            userProfile={userProfile}
                            stockValue={longStockValue}
                            shortValue={shortStockValue}
                            shortInitialValue={totalShortInitialValue}
                            totalAssets={totalAssets}
                            aiStatus={aiStatus}
                            aiResult={aiResult}
                            aiTimestamp={aiTimestamp}
                            onAiRequest={handleRequestAiAnalysis}
                        />
                    )}

                    {activeTab === 'portfolio' && (
                        <div className="animate-fade-in">
                            <PortfolioTable
                                uid={uid}
                                realtimeStocks={stocks}
                                isOwner={currentUser?.uid === uid}
                                balance={userProfile.balance}
                                creditLimit={userProfile.creditLimit || 0}
                                usedCredit={userProfile.usedCredit || 0}
                                pendingSymbols={pendingSymbols}
                                onTabChange={setActiveTab}
                            />
                        </div>
                    )}

                    {activeTab === 'history' && (
                        <div className="animate-fade-in">
                            <TransactionHistory uid={uid} stocks={stocks} />
                        </div>
                    )}

                    {activeTab === 'orders' && currentUser?.uid === uid && (
                        <div className="animate-fade-in">
                            <ActiveOrders stocks={stocks} exchangeRate={exchangeRate} />
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}

