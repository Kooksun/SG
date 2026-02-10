import TradeHistoryTable from '../components/TradeHistoryTable';
import DashboardHeader from '../components/DashboardHeader';
import Card from '../components/Card';
import { useUserStore } from '../hooks/useUserStore';
import { TradeHistoryItem } from '../hooks/useTradeHistory';

interface HistoryPageProps {
    history: TradeHistoryItem[];
    hasMore: boolean;
    loadingMore: boolean;
    loadMore: () => void;
}

const HistoryPage: React.FC<HistoryPageProps> = ({ history, hasMore, loadingMore, loadMore }) => {
    const { nickname } = useUserStore();

    return (
        <main className="dashboard">
            <DashboardHeader
                nickname={nickname}
                subtitle="최근 거래 내역을 통해 투자 흐름을 파악해보세요."
            />

            <div className="tab-content">
                <Card title="최근 거래 내역" glow="blue">
                    <TradeHistoryTable
                        history={history}
                        hasMore={hasMore}
                        loadingMore={loadingMore}
                        loadMore={loadMore}
                    />
                </Card>
            </div>
        </main>
    );
};

export default HistoryPage;
