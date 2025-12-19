import math
from datetime import datetime
from firebase_admin import firestore
from google.cloud.firestore_v1.base_transaction import BaseTransaction
from firestore_client import db

def buy_stock(uid: str, symbol: str, name: str, price: float, quantity: int):
    """
    Executes a buy order for a user.
    Replicates the logic from frontend/lib/trade.ts
    """
    if quantity <= 0:
        raise ValueError("Quantity must be positive")

    cost = math.floor(price * quantity)
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
        
        balance = user_data.get("balance", 0)
        credit_limit = user_data.get("creditLimit", 500000000)
        used_credit = user_data.get("usedCredit", 0)
        
        current_qty = 0
        current_avg = 0
        if portfolio_snap.exists:
            portfolio_data = portfolio_snap.to_dict()
            current_qty = portfolio_data.get("quantity", 0)
            current_avg = portfolio_data.get("averagePrice", 0)

        # Universal logic for Cash vs Credit usage
        cash_to_use = cost
        credit_to_use = 0
        credit_to_release = 0
        profit = 0

        if current_qty < 0:
            # Covering a short position
            covered_qty = min(abs(current_qty), quantity)
            credit_to_release = math.floor(current_avg * covered_qty)
            # Profit for short: (SellPrice - BuyPrice) * Qty
            profit = (current_avg - price) * covered_qty

        if balance < cost:
            # Not enough cash, use all available cash and then credit
            cash_to_use = max(0, balance)
            credit_to_use = cost - cash_to_use
        else:
            cash_to_use = cost
            credit_to_use = 0

        total_available = balance + (credit_limit - used_credit)
        if total_available < cost and current_qty >= 0:
             raise ValueError("Insufficient funds (including credit limit)")

        # Updates
        new_qty = current_qty + quantity
        
        # Update User
        update_data = {
            "balance": firestore.Increment(credit_to_release - cash_to_use),
            "usedCredit": firestore.Increment(credit_to_use - credit_to_release)
        }
        if profit != 0:
            update_data["totalAssetValue"] = firestore.Increment(profit)
        transaction.update(user_ref, update_data)

        # Update Portfolio
        if new_qty == 0:
            transaction.delete(portfolio_ref)
        else:
            new_avg = price
            if current_qty > 0:
                # Average price for long: (prev_val + cost) / total_qty
                new_avg = math.floor(((current_avg * current_qty) + cost) / new_qty)
            elif current_qty < 0 and new_qty < 0:
                # Average price for short remains the same sell price
                new_avg = current_avg
            elif current_qty < 0 and new_qty > 0:
                # Flipped from short to long
                new_avg = price

            transaction.set(portfolio_ref, {
                "symbol": symbol,
                "name": name,
                "quantity": new_qty,
                "averagePrice": new_avg,
                "currentPrice": price,
                "valuation": math.floor(abs(new_qty) * price)
            }, merge=True)

        # Record Transaction
        new_tx_ref = db.collection("transactions").document()
        transaction.set(new_tx_ref, {
            "uid": uid,
            "symbol": symbol,
            "name": name,
            "type": "COVER" if current_qty < 0 else "BUY",
            "price": price,
            "quantity": quantity,
            "amount": cost,
            "fee": 0,
            "creditUsed": credit_to_use,
            "creditReleased": credit_to_release,
            "profit": profit,
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        
        return cost

    return update_in_transaction(transaction)

def sell_stock(uid: str, symbol: str, name: str, price: float, quantity: int):
    """
    Executes a sell order for a user.
    Replicates the logic from frontend/lib/trade.ts
    """
    if quantity <= 0:
        raise ValueError("Quantity must be positive")

    amount = math.floor(price * quantity)
    fee = math.floor(amount * 0.0005) # 0.05% fee
    proceeds = amount - fee

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
        
        current_qty = 0
        current_avg = 0
        if portfolio_snap.exists:
            portfolio_data = portfolio_snap.to_dict()
            current_qty = portfolio_data.get("quantity", 0)
            current_avg = portfolio_data.get("averagePrice", 0)

        credit_limit = user_data.get("creditLimit", 500000000)
        used_credit = user_data.get("usedCredit", 0)

        # Logic for Short Selling vs Normal Sell
        credit_to_use = 0
        credit_repayment = 0
        cash_to_recieve = proceeds
        profit = 0

        if current_qty <= 0:
            # Short Selling (Starting or Increasing)
            # Proceeds are NOT added to balance immediately.
            cash_to_recieve = 0
            credit_to_use = amount # The value of the shorted stock is considered margin usage
            
            available_credit = credit_limit - used_credit
            if available_credit < credit_to_use:
                raise ValueError("Insufficient credit limit for short selling")
        else:
            # Normal Sell (Long Position)
            sellable_qty = min(current_qty, quantity)
            short_qty = max(0, quantity - sellable_qty)
            
            # Profit for long: proceeds - (cost basis)
            profit = proceeds - math.floor(current_avg * sellable_qty)
            
            if used_credit > 0:
                credit_repayment = min(used_credit, proceeds)
            
            if short_qty > 0:
                # Part of it is short selling
                short_value = math.floor(price * short_qty)
                credit_to_use = short_value
                # Proceeds from the 'short' part are restricted
                cash_to_recieve = proceeds - short_value

                available_credit = credit_limit - (used_credit - credit_repayment)
                if available_credit < credit_to_use:
                    raise ValueError("Insufficient credit limit for additional short selling")
            else:
                cash_to_recieve = proceeds - credit_repayment

        # Updates
        update_data = {
            "balance": firestore.Increment(cash_to_recieve),
            "usedCredit": firestore.Increment(credit_to_use - credit_repayment)
        }
        # In trade_executor.py, we also track totalAssetValue change (realized profit)
        if profit != 0:
             update_data["totalAssetValue"] = firestore.Increment(profit)
        
        transaction.update(user_ref, update_data)

        # Update Portfolio
        new_qty = current_qty - quantity
        if new_qty == 0:
            transaction.delete(portfolio_ref)
        else:
            new_avg = current_avg
            if current_qty > 0 and new_qty > 0:
                # Selling long doesn't change average price
                new_avg = current_avg
            elif current_qty <= 0:
                # Increasing short: weighted average of sell prices
                new_avg = math.floor(((current_avg * abs(current_qty)) + amount) / abs(new_qty))
            elif current_qty > 0 and new_qty < 0:
                # Flipped from long to short
                new_avg = price

            transaction.set(portfolio_ref, {
                "symbol": symbol,
                "name": name,
                "quantity": new_qty,
                "averagePrice": new_avg,
                "currentPrice": price,
                "valuation": math.floor(abs(new_qty) * price)
            }, merge=True)

        # Record Transaction
        new_tx_ref = db.collection("transactions").document()
        transaction.set(new_tx_ref, {
            "uid": uid,
            "symbol": symbol,
            "name": name,
            "type": "SHORT" if cash_to_recieve < proceeds else "SELL",
            "price": price,
            "quantity": quantity,
            "amount": amount,
            "fee": fee,
            "profit": profit,
            "creditUsed": credit_to_use,
            "creditRepaid": credit_repayment,
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        
        return proceeds

    return update_in_transaction(transaction)

