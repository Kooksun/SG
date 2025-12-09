import math
from datetime import datetime
from firebase_admin import firestore
from google.cloud.firestore_v1.base_transaction import BaseTransaction
from firestore_client import db

def sell_stock(uid: str, symbol: string, price: float, quantity: int):
    """
    Executes a sell order for a user.
    Replicates the logic from frontend/lib/trade.ts
    """
    if quantity <= 0:
        raise ValueError("Quantity must be positive")

    transaction = db.transaction()
    
    @firestore.transactional
    def update_in_transaction(transaction: BaseTransaction):
        user_ref = db.collection("users").document(uid)
        portfolio_ref = db.collection("users").document(uid).collection("portfolio").document(symbol)

        # Reads
        user_snap = user_ref.get(transaction=transaction)
        portfolio_snap = portfolio_ref.get(transaction=transaction)

        if not user_snap.exists:
            raise ValueError("User does not exist")
        
        user_data = user_snap.to_dict()
        
        if not portfolio_snap.exists:
             raise ValueError("Stock not owned")

        portfolio_data = portfolio_snap.to_dict()
        current_qty = portfolio_data.get("quantity", 0)
        
        if current_qty < quantity:
            raise ValueError(f"Not enough shares. Owned: {current_qty}, Selling: {quantity}")

        # Calculations
        amount = math.floor(price * quantity)
        fee = math.floor(amount * 0.0005) # 0.05% fee
        proceeds = amount - fee
        
        avg_price = portfolio_data.get("averagePrice", 0)
        cost_basis = math.floor(avg_price * quantity)
        profit = proceeds - cost_basis

        # Credit Repayment Logic
        used_credit = user_data.get("usedCredit", 0)
        credit_repayment = min(used_credit, proceeds)
        net_proceeds = proceeds - credit_repayment
        
        # Updates
        new_qty = current_qty - quantity
        
        # Update Portfolio
        if new_qty > 0:
            transaction.update(portfolio_ref, {
                "quantity": new_qty,
                "currentPrice": price,
                "valuation": math.floor(new_qty * price)
            })
        else:
            transaction.delete(portfolio_ref)

        # Update User
        transaction.update(user_ref, {
            "balance": firestore.Increment(net_proceeds),
            "usedCredit": firestore.Increment(-credit_repayment),
            "totalAssetValue": firestore.Increment(profit) 
            # Note: totalAssetValue change is roughly profit. 
            # Old Asset = Cash + StockVal. New Asset = (Cash + Proceeds) + (StockVal - StockValSold)
            # Change = Proceeds - StockValSold ~= Proceeds - (Price * Qty) = -Fee? 
            # Wait, frontend logic says:
            # totalAssetValue: increment(profit) ?? 
            # Let's check frontend logic again.
            # Frontend: totalAssetValue: increment(profit)
            # profit = proceeds - (averagePrice * quantity)
            # This seems to track realized profit. 
            # But totalAssetValue usually means Mark-to-Market.
            # If we just update balance, the stock value is gone.
            # If we assume totalAssetValue is sum of all assets, then:
            # Delta = (Cash_new - Cash_old) + (Stock_new - Stock_old)
            # Cash_new = Cash_old + Proceeds
            # Stock_new = Stock_old - (CurrentPrice * Qty)
            # Delta = Proceeds - (CurrentPrice * Qty) = (Price*Qty - Fee) - (Price*Qty) = -Fee.
            # However, the frontend implementation adds 'profit' to totalAssetValue.
            # This implies totalAssetValue might be "Realized Account Value" or something?
            # Or maybe it's just tracking realized gains?
            # Let's stick to replicating frontend logic exactly for now.
        })

        # Record Transaction
        new_tx_ref = db.collection("transactions").document()
        transaction.set(new_tx_ref, {
            "uid": uid,
            "symbol": symbol,
            "type": "SELL",
            "price": price,
            "quantity": quantity,
            "amount": amount,
            "fee": fee,
            "profit": profit,
            "creditRepaid": credit_repayment,
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        
        return proceeds

    return update_in_transaction(transaction)
