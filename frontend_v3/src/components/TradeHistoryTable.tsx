import React from 'react';
import { TradeHistoryItem } from '../hooks/useTradeHistory';
import './Table.css';
import StockIcon from './StockIcon';

interface TradeHistoryTableProps {
    history: TradeHistoryItem[];
    hasMore: boolean;
    loadingMore: boolean;
    loadMore: () => void;
}

const TradeHistoryTable: React.FC<TradeHistoryTableProps> = ({ history, hasMore, loadingMore, loadMore }) => {
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
        <div className="table-container">
            <table className="data-table">
                <thead>
                    <tr>
                        <th>일시</th>
                        <th>종목명</th>
                        <th className="text-center">구분</th>
                        <th className="text-right">체결가</th>
                        <th className="text-right">수량</th>
                        <th className="text-right font-bold">총 금액</th>
                        <th className="text-right">손익 (수익률)</th>
                        <th className="text-right">거래세</th>
                    </tr>
                </thead>
                <tbody>
                    {history.length > 0 ? (
                        history.map((item) => {
                            const isDonation = item.symbol === 'DONATION';
                            const isPointTrade = (item.type === 'REWARD' || item.type === 'TAX' || item.type === 'LUCKY_BOX') && !isDonation;

                            return (
                                <tr key={item.id}>
                                    <td className="text-xs text-secondary">{formatDate(item.timestamp)}</td>
                                    <td>
                                        <div className="symbol-info">
                                            <StockIcon symbol={item.symbol} name={item.name} size={24} className="mr-2" />
                                            <div className="stock-details">
                                                <span className="name">{item.name}</span>
                                                <span className="code">{item.symbol}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="text-center">
                                        <span className={`type-badge ${item.type.toLowerCase()}`}>
                                            {isDonation ? '기부' :
                                                item.type === 'BUY' ? '매수' :
                                                    item.type === 'REWARD' ? '적립' :
                                                        item.type === 'TAX' ? '사용' :
                                                            item.type === 'LUCKY_BOX' ? '랜덤뽑기' : '매도'}
                                        </span>
                                    </td>
                                    <td className="text-right font-mono">{isPointTrade || isDonation ? '-' : item.price.toLocaleString()}</td>
                                    <td className="text-right font-mono">{isPointTrade || isDonation ? '-' : item.quantity.toLocaleString()}</td>
                                    <td className="text-right font-mono font-bold">
                                        {isDonation ? '-' : (
                                            <>{item.totalAmount.toLocaleString()}{isPointTrade ? ' P' : '원'}</>
                                        )}
                                    </td>
                                    <td className={`text-right font-mono ${item.profit && item.profit > 0 ? 'up' : (item.profit && item.profit < 0) || isDonation ? 'down' : ''}`}>
                                        {item.type === 'SELL' && item.profit !== undefined ? (
                                            <>
                                                <div className="font-bold">{item.profit > 0 ? '+' : ''}{item.profit.toLocaleString()}</div>
                                                <div className="text-xs opacity-80">({item.profitRatio ? (item.profitRatio * 100).toFixed(2) : '0.00'}%)</div>
                                            </>
                                        ) : isDonation ? (
                                            <div className="font-bold">{item.totalAmount.toLocaleString()}</div>
                                        ) : '-'}
                                    </td>
                                    <td className="text-right font-mono text-xs">
                                        {isPointTrade ? '-' : (
                                            <div className="fee-display">
                                                <div>{item.fee.toLocaleString()}원</div>
                                                {item.discount !== undefined && item.discount > 0 && (
                                                    <div className="discount-text">-{item.discount.toLocaleString()} 할인</div>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            )
                        })
                    ) : (
                        <tr>
                            <td colSpan={8} className="text-center no-data">거래 내역이 없습니다.</td>
                        </tr>
                    )}
                </tbody>
            </table>

            {hasMore && (
                <div className="load-more-container">
                    <button
                        className="load-more-btn"
                        onClick={loadMore}
                        disabled={loadingMore}
                    >
                        {loadingMore ? '로딩 중...' : '더 보기'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default TradeHistoryTable;
