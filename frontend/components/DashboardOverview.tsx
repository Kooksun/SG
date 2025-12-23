"use client";

import React from 'react';
import { UserProfile } from "@/types";
import AssetAllocationChart from "./AssetAllocationChart";
import { CreditCard, Wallet, TrendingUp, DollarSign } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface DashboardOverviewProps {
    userProfile: UserProfile;
    stockValue: number;
    shortValue: number;
    shortInitialValue: number;
    totalAssets: number;
    aiStatus: 'idle' | 'pending' | 'processing' | 'completed';
    aiResult: string | null;
    aiTimestamp: string | null;
    onAiRequest: () => void;
}

export default function DashboardOverview({
    userProfile,
    stockValue,
    shortValue,
    shortInitialValue,
    totalAssets,
    aiStatus,
    aiResult,
    aiTimestamp,
    onAiRequest
}: DashboardOverviewProps) {

    // Calculate safely
    const creditLimit = userProfile.creditLimit || 0;
    const usedCredit = userProfile.usedCredit || 0;
    const availableCredit = creditLimit - usedCredit;
    const buyingPower = userProfile.balance + availableCredit;

    // Net Worth Calculation:
    // Net Worth = Cash + Long Value - Short Value - (Debt from Longs)
    // Debt from Longs = Total Used Credit - Initial Short Margin
    const debtFromLongs = Math.max(0, usedCredit - shortInitialValue);
    const netWorth = userProfile.balance + stockValue - shortValue - debtFromLongs;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Top Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-gray-400 text-sm">Net Worth (Equity)</div>
                        <Wallet className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-2xl font-bold text-white">{netWorth.toLocaleString()} <span className="text-sm font-normal text-gray-500">KRW</span></div>
                    <div className="text-[10px] text-gray-500 mt-1">Cash + Longs - Shorts - Debt</div>
                </div>
                <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-gray-400 text-sm">Cash Balance</div>
                        <DollarSign className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="text-2xl font-bold text-white">{userProfile.balance.toLocaleString()} <span className="text-sm font-normal text-gray-500">KRW</span></div>
                    {shortInitialValue > 0 && (
                        <div className="text-[10px] text-gray-400 mt-1 flex flex-col">
                            <div className="flex justify-between">
                                <span>Pure Cash:</span>
                                <span>{(userProfile.balance - shortInitialValue).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-blue-400">
                                <span>Short Proceeds:</span>
                                <span>+ {shortInitialValue.toLocaleString()}</span>
                            </div>
                        </div>
                    )}
                </div>
                <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-gray-400 text-sm">Market Value (Net)</div>
                        <TrendingUp className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="text-2xl font-bold text-white">{(stockValue - shortValue).toLocaleString()} <span className="text-sm font-normal text-gray-500">KRW</span></div>
                    <div className="text-[10px] text-gray-400 mt-1 flex justify-between">
                        <span>Long: {stockValue.toLocaleString()}</span>
                        <span>Short: -{shortValue.toLocaleString()}</span>
                    </div>
                </div>
                <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-gray-400 text-sm">Buying Power</div>
                        <CreditCard className="w-4 h-4 text-yellow-400" />
                    </div>
                    <div className="text-2xl font-bold text-yellow-400">{buyingPower.toLocaleString()} <span className="text-sm font-normal text-gray-500">KRW</span></div>
                    <div className="text-[10px] text-gray-500 mt-1">Cash + Available Credit</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column (1 col): Credit Info & Asset Chart */}
                <div className="space-y-6">
                    {/* Credit Status */}
                    <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
                        <h3 className="text-lg font-semibold mb-4 text-gray-200 flex items-center">
                            Credit Status
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-gray-400">Used Credit</span>
                                    <span className="text-red-400 font-bold">{usedCredit.toLocaleString()} KRW</span>
                                </div>
                                <div className="w-full bg-gray-700 rounded-full h-2">
                                    <div
                                        className="bg-red-500 h-2 rounded-full transition-all duration-500"
                                        style={{ width: `${Math.min(100, (usedCredit / creditLimit) * 100)}%` }}
                                    ></div>
                                </div>
                                <div className="flex justify-between text-xs text-gray-500 mt-1">
                                    <span>0</span>
                                    <span>Limit: {creditLimit.toLocaleString()}</span>
                                </div>
                            </div>

                            {usedCredit > 0 ? (
                                <div className="p-3 bg-red-900/20 border border-red-900/50 rounded text-sm text-red-300">
                                    Est. Daily Interest: <span className="font-bold">{Math.floor(usedCredit * 0.001).toLocaleString()} KRW</span>
                                </div>
                            ) : (
                                <div className="p-2 text-xs text-gray-500 text-center">
                                    No active credit usage.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Asset Allocation Chart */}
                    <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700 flex flex-col justify-between">
                        <h3 className="text-sm font-semibold mb-2 text-gray-400">Asset Composition</h3>
                        <div className="h-40 relative w-full">
                            <AssetAllocationChart cash={userProfile.balance} stockValue={stockValue} shortValue={shortValue} usedCredit={usedCredit} />
                        </div>
                        {(() => {
                            const debtUsedForLong = Math.min(stockValue, usedCredit);
                            const longEquity = Math.max(0, stockValue - debtUsedForLong);
                            const totalChartValue = userProfile.balance + longEquity + shortValue + usedCredit;
                            const getPct = (val: number) => totalChartValue > 0 ? ((val / totalChartValue) * 100).toFixed(0) + '%' : '0%';

                            return (
                                <div className="flex justify-center flex-wrap gap-x-4 gap-y-2 mt-3 text-xs">
                                    <div className="flex items-center space-x-1">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                        <span className="text-gray-400">Cash {getPct(userProfile.balance)}</span>
                                    </div>
                                    <div className="flex items-center space-x-1">
                                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                        <span className="text-gray-400">Long {getPct(longEquity)}</span>
                                    </div>
                                    <div className="flex items-center space-x-1">
                                        <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                                        <span className="text-gray-400">Short {getPct(shortValue)}</span>
                                    </div>
                                    {usedCredit > 0 && (
                                        <div className="flex items-center space-x-1">
                                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                            <span className="text-gray-400">Debt {getPct(usedCredit)}</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* Right Column (2 cols): AI Coach */}
                <div className="lg:col-span-2">
                    <div className="h-full bg-gradient-to-br from-green-900/40 to-teal-900/40 border border-green-800 p-6 rounded-lg shadow backdrop-blur-sm flex flex-col">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-xl font-bold text-green-100 flex items-center gap-2">
                                    🤖 AI Portfolio Coach
                                </h3>
                                <p className="text-green-300/60 text-sm mt-1">
                                    Your personal investment assistant analyzing real-time data.
                                </p>
                            </div>
                            {(aiStatus !== 'pending' && aiStatus !== 'processing') && (
                                <button
                                    onClick={onAiRequest}
                                    className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded shadow transition text-sm font-medium"
                                >
                                    {aiStatus === 'completed' ? 'Refresh Analysis' : 'Start Analysis'}
                                </button>
                            )}
                        </div>

                        <div className="flex-grow bg-black/20 rounded-lg p-4 border border-white/5 min-h-[300px]">
                            {(aiStatus === 'pending' || aiStatus === 'processing') && !aiResult ? (
                                <div className="h-full flex flex-col items-center justify-center text-green-300 space-y-4">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-400"></div>
                                    <span className="animate-pulse font-medium">Analyzing market data & your portfolio...</span>
                                </div>
                            ) : aiResult ? (
                                <div className="h-full flex flex-col relative">
                                    {(aiStatus === 'pending' || aiStatus === 'processing') && (
                                        <div className="absolute top-0 right-0 flex items-center gap-2 bg-green-900/40 px-2 py-1 rounded text-[10px] text-green-400 border border-green-700/50 animate-pulse">
                                            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-ping"></div>
                                            Updating...
                                        </div>
                                    )}
                                    <div className="flex-grow overflow-y-auto leading-relaxed text-green-50 font-light text-base p-2">
                                        <ReactMarkdown
                                            components={{
                                                h1: ({ ...props }) => <h1 className="text-xl font-bold mt-4 mb-2 text-green-200" {...props} />,
                                                h2: ({ ...props }) => <h2 className="text-lg font-bold mt-3 mb-1 text-green-300" {...props} />,
                                                h3: ({ ...props }) => <h3 className="text-md font-bold mt-2 mb-1 text-green-400" {...props} />,
                                                p: ({ ...props }) => <p className="mb-3 last:mb-0" {...props} />,
                                                ul: ({ ...props }) => <ul className="list-disc list-inside mb-3 ml-2" {...props} />,
                                                ol: ({ ...props }) => <ol className="list-decimal list-inside mb-3 ml-2" {...props} />,
                                                li: ({ ...props }) => <li className="mb-1" {...props} />,
                                                strong: ({ ...props }) => <strong className="font-bold text-green-300" {...props} />,
                                                blockquote: ({ ...props }) => <blockquote className="border-l-4 border-green-700 pl-4 py-1 my-3 bg-green-900/20 italic" {...props} />,
                                            }}
                                        >
                                            {aiResult}
                                        </ReactMarkdown>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-white/10 text-xs text-green-500/70 text-right">
                                        Last Updated: {aiTimestamp ? new Date(aiTimestamp).toLocaleString() : ''}
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                                    <div className="bg-gray-800/50 p-4 rounded-full">
                                        <TrendingUp className="w-8 h-8 opacity-50" />
                                    </div>
                                    <p className="max-w-md text-center leading-relaxed">
                                        Tap the analyze button to get detailed insights, risk assessments, and rebalancing recommendations based on current market trends.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
