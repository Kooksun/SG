import React from 'react';
import DashboardHeader from '../components/DashboardHeader';
import Card from '../components/Card';
import { useUserStore } from '../hooks/useUserStore';
import { usePendingOrders } from '../hooks/usePendingOrders';
import PendingOrdersTable from '../components/PendingOrdersTable';
import ConfirmModal from '../components/ConfirmModal';
import { useState } from 'react';

const PendingOrdersPage: React.FC = () => {
    const { nickname, uid } = useUserStore();
    const { pendingOrders, loading, cancelOrder } = usePendingOrders(uid);
    const [showConfirm, setShowConfirm] = useState(false);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

    const handleDeleteClick = (id: string) => {
        setSelectedOrderId(id);
        setShowConfirm(true);
    };

    const handleConfirmCancel = () => {
        if (selectedOrderId) {
            cancelOrder(selectedOrderId);
        }
        setShowConfirm(false);
        setSelectedOrderId(null);
    };

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
                            onCancelClick={handleDeleteClick}
                        />
                    )}
                </Card>
            </div>

            <ConfirmModal
                isOpen={showConfirm}
                title="주문 취소 확인"
                message="정말 이 주문을 취소하시겠습니까? 삭제된 주문은 복구되지 않습니다."
                onConfirm={handleConfirmCancel}
                onCancel={() => setShowConfirm(false)}
            />
        </main>
    );
};

export default PendingOrdersPage;
