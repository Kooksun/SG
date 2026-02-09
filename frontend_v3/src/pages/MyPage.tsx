import React, { useState, useMemo } from 'react';
import Card from '../components/Card';
import { LogOut, Wallet, TrendingUp, Briefcase, CircleDollarSign, User, History, PieChart as PieIcon } from 'lucide-react';
import { useUserStore } from '../hooks/useUserStore';
import { authService } from '../lib/authService';
import { useAuth } from '../hooks/useAuth';
import AssetCompositionChart from '../components/AssetCompositionChart';
import PortfolioTable from '../components/PortfolioTable';
import TradeHistoryTable from '../components/TradeHistoryTable';
import { useDetailedHoldings } from '../hooks/useDetailedHoldings';
import { useTradeHistory } from '../hooks/useTradeHistory';
import DashboardHeader from '../components/DashboardHeader';
import './MyPage.css';

const MyPage: React.FC = () => {
    const { user } = useAuth();
    const { nickname, balance, uid } = useUserStore();
    const { detailedHoldings } = useDetailedHoldings(uid);

    const assetStats = useMemo(() => {
        const stockValue = detailedHoldings.reduce((sum, h) => sum + h.marketValue, 0);
        const equity = balance + stockValue;
        const totalPnl = detailedHoldings.reduce((sum, h) => sum + (h.currentPrice - h.averagePrice) * h.quantity, 0);
        const investmentCost = detailedHoldings.reduce((sum, h) => sum + (h.averagePrice * h.quantity), 0);
        const pnlRate = investmentCost > 0 ? (totalPnl / investmentCost) * 100 : 0;

        return { stockValue, equity, totalPnl, pnlRate };
    }, [balance, detailedHoldings]);

    return (
        <main className="dashboard my-page">
            <DashboardHeader
                nickname={nickname}
                subtitle="자산 현황을 한눈에 확인하고 전략을 세워보세요."
            />

            <div className="tab-content">
                <div className="mypage-content-grid">
                    {/* 1열: 자산 정보 */}
                    <section className="mypage-column">
                        <Card title="자산 현황" className="unified-asset-card" glow="blue">
                            <div className="asset-summary-content">
                                <div className="asset-primary-value">
                                    <div className="value-row">
                                        <span className="amount">{assetStats.equity.toLocaleString()}</span>
                                        <span className="unit">원</span>
                                    </div>
                                    <div className={`asset-pnl-chip ${assetStats.totalPnl >= 0 ? 'up' : 'down'}`}>
                                        {assetStats.totalPnl >= 0 ? <TrendingUp size={14} /> : <TrendingUp size={14} className="flip-v" />}
                                        <span>
                                            {assetStats.pnlRate >= 0 ? '+' : ''}{assetStats.pnlRate.toFixed(2)}% ({assetStats.totalPnl >= 0 ? '+' : ''}{assetStats.totalPnl.toLocaleString()}원)
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="asset-divider" />

                            <div className="asset-details-rows">
                                <div className="asset-row">
                                    <div className="row-label">
                                        <CircleDollarSign size={18} className="cash-icon" />
                                        <span>보유 현금</span>
                                    </div>
                                    <span className="row-value">{balance.toLocaleString()}원</span>
                                </div>
                                <div className="asset-row">
                                    <div className="row-label">
                                        <Briefcase size={18} className="stock-icon" />
                                        <span>주식 평가금</span>
                                    </div>
                                    <span className="row-value">{assetStats.stockValue.toLocaleString()}원</span>
                                </div>
                            </div>
                        </Card>
                    </section>

                    {/* 2열: 포트폴리오 차트 */}
                    <section className="mypage-column">
                        <AssetCompositionChart />
                    </section>
                </div>
            </div>
        </main>
    );
};

export default MyPage;
