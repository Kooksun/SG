import React, { useState } from 'react';
import { PendingOrder } from '../hooks/usePendingOrders';
import './Table.css';
import { Trash2 } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import StockIcon from './StockIcon';

interface PendingOrdersTableProps {
    orders: PendingOrder[];
    onCancelClick: (id: string) => void;
}

const PendingOrdersTable: React.FC<PendingOrdersTableProps> = ({ orders, onCancelClick }) => {
    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat('ko-KR', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    };

    return (
        <div className="table-container">
            <table className="data-table">
                <thead>
                    <tr>
                        <th>요청일시</th>
                        <th>종목명</th>
                        <th className="text-center">구분</th>
                        <th className="text-right">주문가(지정가)</th>
                        <th className="text-right">수량</th>
                        <th className="text-right font-bold">주문 금액</th>
                        <th className="text-center">상태</th>
                        <th className="text-center">작업</th>
                    </tr>
                </thead>
                <tbody>
                    {orders.length > 0 ? (
                        orders.map((order) => (
                            <tr key={order.id}>
                                <td className="text-xs text-secondary">{formatDate(order.createdAt)}</td>
                                <td>
                                    <div className="symbol-info">
                                        <StockIcon symbol={order.symbol} name={order.name} size={36} className="mr-3" />
                                        <div className="stock-details">
                                            <span className="name">{order.name}</span>
                                            <span className="code">{order.symbol}</span>
                                        </div>
                                    </div>
                                </td>
                                <td className="text-center">
                                    <span className={`type-badge ${order.type.toLowerCase()}`}>
                                        {order.type === 'BUY' ? '매수' : '매도'}
                                    </span>
                                </td>
                                <td className="text-right font-mono">
                                    {order.price.toLocaleString()}원
                                    <div className="text-xs opacity-60">({order.orderType})</div>
                                </td>
                                <td className="text-right font-mono">{order.quantity.toLocaleString()}</td>
                                <td className="text-right font-mono font-bold">
                                    {(order.price * order.quantity).toLocaleString()}원
                                </td>
                                <td className="text-center">
                                    <span className="status-badge pending">대기중</span>
                                </td>
                                <td className="text-center">
                                    <button
                                        type="button"
                                        className="cancel-btn"
                                        onClick={() => onCancelClick(order.id)}
                                        title="주문 취소"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={8} className="text-center no-data">대기 중인 주문이 없습니다.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default PendingOrdersTable;
