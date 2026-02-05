import React from 'react';
import './StockList.css';
import { TrendingUp, TrendingDown } from 'lucide-react';

export interface StockItem {
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    market: string;
}

interface StockListProps {
    stocks: StockItem[];
    onSelect: (stock: StockItem) => void;
}

const StockList: React.FC<StockListProps> = ({ stocks, onSelect }) => {
    return (
        <div className="stock-list-container">
            <table className="stock-table">
                <thead>
                    <tr>
                        <th>종목명</th>
                        <th className="text-right">현재가</th>
                        <th className="text-right">등락</th>
                    </tr>
                </thead>
                <tbody>
                    {stocks.length > 0 ? (
                        stocks.map((stock) => (
                            <tr key={stock.symbol} onClick={() => onSelect(stock)} className="stock-row">
                                <td>
                                    <div className="stock-info">
                                        <span className="stock-name">{stock.name}</span>
                                        <span className="stock-symbol">{stock.symbol} ∙ {stock.market}</span>
                                    </div>
                                </td>
                                <td className="text-right font-bold">
                                    {stock.price.toLocaleString()}원
                                </td>
                                <td className={`text-right font-medium ${stock.change >= 0 ? 'up' : 'down'}`}>
                                    <div className="price-change">
                                        {stock.change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                        <span>{Math.abs(stock.changePercent).toFixed(2)}%</span>
                                    </div>
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={3} className="empty-message">검색 결과가 없습니다.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default StockList;
