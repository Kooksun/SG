import React from 'react';
import Card from '../components/Card';
import { Trophy, Users, BarChart3, PieChart } from 'lucide-react';

const LeaderboardPage: React.FC = () => {
    return (
        <main className="dashboard">
            <header className="dashboard-header">
                <h1 className="welcome-text">리더보드 & <span className="highlight">통합 분석</span></h1>
                <p className="subtitle">상위 투자자들의 수익률과 시장 전체의 포트폴리오 동향을 확인하세요.</p>
            </header>

            <section className="asset-overview">
                <Card title="현재 참가자" glow="blue" className="asset-card">
                    <div className="asset-value">
                        <Users className="icon blue" />
                        <div className="value-info">
                            <span className="amount">1,234 <small>명</small></span>
                            <span className="subtitle">시즌 3 경쟁 중</span>
                        </div>
                    </div>
                </Card>

                <Card title="평균 수익률" glow="emerald" className="asset-card">
                    <div className="asset-value">
                        <BarChart3 className="icon emerald" />
                        <div className="value-info">
                            <span className="amount">+12.4%</span>
                            <span className="subtitle">전체 사용자 평균</span>
                        </div>
                    </div>
                </Card>

                <Card title="인기 섹터" glow="none" className="asset-card">
                    <div className="asset-value">
                        <PieChart className="icon secondary" />
                        <div className="value-info">
                            <span className="amount">반도체 / AI</span>
                            <span className="subtitle">가장 많은 보유 비중</span>
                        </div>
                    </div>
                </Card>
            </section>

            <section className="main-content leaderboard-layout">
                <div className="leaderboard-main">
                    <Card title="실시간 수익률 랭킹" className="full-height">
                        <div className="placeholder-content">리더보드 랭킹 리스트 (준비 중)</div>
                    </Card>
                </div>

                <div className="leaderboard-side">
                    <Card title="종목별 보유 랭킹" className="side-card">
                        <div className="ranking-mini-list">
                            <div className="ranking-item">
                                <span className="rank">1</span>
                                <span className="name">삼성전자</span>
                                <span className="val">42% 보유</span>
                            </div>
                            <div className="ranking-item">
                                <span className="rank">2</span>
                                <span className="name">SK하이닉스</span>
                                <span className="val">28% 보유</span>
                            </div>
                        </div>
                    </Card>

                    <Card title="통합 포트폴리오 비중" className="side-card">
                        <div className="placeholder-content">파이 차트 영역</div>
                    </Card>
                </div>
            </section>
        </main>
    );
};

export default LeaderboardPage;
