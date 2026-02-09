import React, { useState } from 'react';
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
    const { nickname, balance, equity, totalPnl, pnlRate } = useUserStore();

    const stockValue = equity - balance;

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
                                        <span className="amount">{equity.toLocaleString()}</span>
                                        <span className="unit">원</span>
                                    </div>
                                    <div className={`asset-pnl-chip ${totalPnl >= 0 ? 'up' : 'down'}`}>
                                        {totalPnl >= 0 ? <TrendingUp size={14} /> : <TrendingUp size={14} className="flip-v" />}
                                        <span>
                                            {pnlRate >= 0 ? '+' : ''}{pnlRate.toFixed(2)}% ({totalPnl >= 0 ? '+' : ''}{totalPnl.toLocaleString()}원)
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
                                    <span className="row-value">{stockValue.toLocaleString()}원</span>
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
