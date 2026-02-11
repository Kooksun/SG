import React from 'react';
import DashboardHeader from '../components/DashboardHeader';
import Card from '../components/Card';
import { useUserStore } from '../hooks/useUserStore';
import { usePendingOrders } from '../hooks/usePendingOrders';
import PendingOrdersTable from '../components/PendingOrdersTable';

const PendingOrdersPage: React.FC = () => {
    const { nickname, uid } = useUserStore();
    const { pendingOrders, loading, cancelOrder } = usePendingOrders(uid);

    return (
        <main className="dashboard">
            <DashboardHeader
                nickname={nickname}
                subtitle="체결 대기 중인 주문입니다. 시장 상황에 따라 가격을 수정하거나 취소할 수 있습니다."
            />

            <div className="tab-content">
                <Card title="주문 대기 현황" glow="amber">
                    {loading ? (
                        <div className="loading-container">데이터를 불러오는 중...</div>
                    ) : (
                        <PendingOrdersTable
                            orders={pendingOrders}
                            onCancel={cancelOrder}
                        />
                    )}
                </Card>
            </div>
        </main>
    );
};

export default PendingOrdersPage;
