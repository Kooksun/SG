import React from 'react';
import { TradeHistoryItem } from '../hooks/useTradeHistory';

interface TradeHistoryTableProps {
    history: TradeHistoryItem[];
}

const TradeHistoryTable: React.FC<TradeHistoryTableProps> = ({ history }) => {
    const formatDate = (timestamp: any) => {
        if (!timestamp) return '-';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return new Intl.DateTimeFormat('ko-KR', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    };

    return (
        <div className="table-container glass-card">
            <table className="data-table">
                <thead>
                    <tr>
                        <th>일시</th>
                        <th>종목명</th>
                        <th className="text-center">구분</th>
                        <th className="text-right">체결가</th>
                        <th className="text-right">수량</th>
                        <th className="text-right">총 금액</th>
                    </tr>
                </thead>
                <tbody>
                    {history.length > 0 ? (
                        history.map((item) => (
                            <tr key={item.id}>
                                <td className="text-secondary text-sm">{formatDate(item.timestamp)}</td>
                                <td>
                                    <div className="symbol-info">
                                        <span className="name">{item.name}</span>
                                        <span className="code">{item.symbol}</span>
                                    </div>
                                </td>
                                <td className="text-center">
                                    <span className={`type-badge ${item.type.toLowerCase()}`}>
                                        {item.type === 'BUY' ? '매수' : '매도'}
                                    </span>
                                </td>
                                <td className="text-right font-mono">{item.price.toLocaleString()}</td>
                                <td className="text-right font-mono">{item.quantity.toLocaleString()}</td>
                                <td className="text-right font-mono font-bold">{item.totalAmount.toLocaleString()}원</td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={6} className="text-center no-data">거래 내역이 없습니다.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default TradeHistoryTable;
