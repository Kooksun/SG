import React from 'react';
import { HoldingItem } from '../hooks/useDetailedHoldings';
import { PendingOrder } from '../hooks/usePendingOrders';
import './Table.css';
import StockIcon from './StockIcon';

interface PortfolioTableProps {
    holdings: HoldingItem[];
    onSelect: (holding: HoldingItem) => void;
    pendingOrders?: PendingOrder[];
}

const PortfolioTable: React.FC<PortfolioTableProps> = ({ holdings, onSelect, pendingOrders = [] }) => {
    return (
        <div className="table-container">
            <table className="data-table selectable">
                <thead>
                    <tr>
                        <th>종목명</th>
                        <th className="text-right">보유수량</th>
                        <th className="text-right">평균단가</th>
                        <th className="text-right">현재가</th>
                        <th className="text-right">평가금액</th>
                        <th className="text-right">수익률</th>
                    </tr>
                </thead>
                <tbody>
                    {holdings.length > 0 ? (
                        holdings.map((item) => {
                            const pnl = (item.currentPrice - item.averagePrice) * item.quantity;
                            const pnlRate = ((item.currentPrice - item.averagePrice) / item.averagePrice) * 100;
                            const isPositive = pnl >= 0;

                            return (
                                <tr key={item.symbol} onClick={() => onSelect(item)} className="clickable-row">
                                    <td>
                                        <div className="symbol-info">
                                            <StockIcon symbol={item.symbol} name={item.name} size={36} className="mr-3" />
                                            <div className="stock-details">
                                                <div className="flex items-center gap-2">
                                                    <span className="name">{item.name}</span>
                                                    {pendingOrders.some(o => o.symbol === item.symbol) && (
                                                        <div className="flex gap-1">
                                                            {pendingOrders.filter(o => o.symbol === item.symbol).map(order => (
                                                                <span key={order.id} className="status-badge pending text-xs">
                                                                    {order.type === 'BUY' ? '매수' : '매도'} 대기
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="code">{item.symbol}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="text-right font-mono">{item.quantity.toLocaleString()}</td>
                                    <td className="text-right font-mono">{item.averagePrice.toLocaleString()}</td>
                                    <td className="text-right font-mono">{item.currentPrice.toLocaleString()}</td>
                                    <td className="text-right font-mono">{item.marketValue.toLocaleString()}</td>
                                    <td className={`text-right font-mono ${isPositive ? 'up' : 'down'}`}>
                                        {isPositive ? '+' : ''}{pnlRate.toFixed(2)}%
                                        <div className="pnl-amount">
                                            ({isPositive ? '+' : ''}{pnl.toLocaleString()}원)
                                        </div>
                                    </td>
                                </tr>
                            );
                        })
                    ) : (
                        <tr>
                            <td colSpan={6} className="text-center no-data">보유 중인 종목이 없습니다.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default PortfolioTable;
