import React from 'react';
import Card from '../components/Card';
import { Trophy, TrendingUp, BarChart3 } from 'lucide-react';

const GlobalDashboard: React.FC = () => {
    return (
        <main className="dashboard">
            <header className="dashboard-header">
                <h1 className="welcome-text">글로벌 <span className="highlight">랭킹</span></h1>
                <p className="subtitle">StockGame 시즌 3의 최고 투자자들을 확인하세요.</p>
            </header>

            <section className="asset-overview">
                <Card title="참가자 수" glow="blue" className="asset-card">
                    <div className="asset-value">
                        <Trophy className="icon blue" />
                        <div className="value-info">
                            <span className="amount">1,234 <small>명</small></span>
                            <span className="subtitle">치열한 경쟁 중</span>
                        </div>
                    </div>
                </Card>

                <Card title="오늘의 급등주" glow="emerald" className="asset-card">
                    <div className="asset-value">
                        <TrendingUp className="icon emerald" />
                        <div className="value-info">
                            <span className="amount">삼성전자</span>
                            <span className="change positive">+2.5%</span>
                        </div>
                    </div>
                </Card>

                <Card title="시장 분위기" glow="none" className="asset-card">
                    <div className="asset-value">
                        <BarChart3 className="icon secondary" />
                        <div className="value-info">
                            <span className="amount">탐욕</span>
                            <span className="subtitle">투자 심리 지수: 75</span>
                        </div>
                    </div>
                </Card>
            </section>

            <section className="main-content">
                <Card title="실시간 리더보드" className="chart-card">
                    <div className="placeholder-content">리더보드 영역 (준비 중)</div>
                </Card>

                <Card title="주요 시장 지표" className="stock-list-card">
                    <div className="placeholder-content">인기 종목 / 지표 영역 (준비 중)</div>
                </Card>
            </section>
        </main>
    );
};

export default GlobalDashboard;
