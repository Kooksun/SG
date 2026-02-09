import PortfolioTable from '../components/PortfolioTable';
import DashboardHeader from '../components/DashboardHeader';
import Card from '../components/Card';
import { useUserStore } from '../hooks/useUserStore';
import { HoldingItem } from '../hooks/useDetailedHoldings';

interface PortfolioPageProps {
    holdings: HoldingItem[];
}

const PortfolioPage: React.FC<PortfolioPageProps> = ({ holdings }) => {
    const { nickname } = useUserStore();

    return (
        <main className="dashboard">
            <DashboardHeader
                nickname={nickname}
                subtitle="현재 보유 중인 종목들의 상세 현황입니다."
            />

            <div className="tab-content">
                <Card title="보유 종목 내역" glow="blue">
                    <PortfolioTable holdings={holdings} />
                </Card>
            </div>
        </main>
    );
};

export default PortfolioPage;
