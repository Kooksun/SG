import TradeHistoryTable from '../components/TradeHistoryTable';
import DashboardHeader from '../components/DashboardHeader';
import Card from '../components/Card';
import { useUserStore } from '../hooks/useUserStore';
import { HoldingItem } from '../hooks/useDetailedHoldings';
import PortfolioTable from '../components/PortfolioTable';
import { StockItem } from '../components/StockList';
import React, { useState } from 'react';
import TradeModal from '../components/TradeModal';
import { useAuth } from '../hooks/useAuth';

interface PortfolioPageProps {
    holdings: HoldingItem[];
    stocks: StockItem[];
}

const PortfolioPage: React.FC<PortfolioPageProps> = ({ holdings, stocks }) => {
    const { nickname, balance } = useUserStore();
    const { user } = useAuth();
    const [selectedStock, setSelectedStock] = useState<StockItem | null>(null);

    const handleSelectHolding = (holding: HoldingItem) => {
        const stock = stocks.find(s => s.symbol === holding.symbol);
        if (stock) {
            setSelectedStock(stock);
        }
    };

    return (
        <main className="dashboard">
            <DashboardHeader
                nickname={nickname}
                subtitle="현재 보유 중인 종목들의 상세 현황입니다."
            />

            <div className="tab-content">
                <Card title="보유 종목 내역" glow="blue">
                    <PortfolioTable holdings={holdings} onSelect={handleSelectHolding} />
                </Card>
            </div>

            {selectedStock && user && (
                <TradeModal
                    stock={selectedStock}
                    onClose={() => setSelectedStock(null)}
                    userBalance={balance}
                    uid={user.uid}
                    initialTradeType="SELL" // Changed to SELL per user feedback (assumed clarification)
                />
            )}
        </main>
    );
};

export default PortfolioPage;
