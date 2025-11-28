import { Timestamp } from "firebase/firestore";

export interface Stock {
    symbol: string;
    name: string;
    price: number;
    change: number;
    change_percent: number;
    updatedAt: Timestamp | string;
    currency?: string;
}

export interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    balance: number;
    creditLimit: number;
    usedCredit: number;
    lastInterestDate?: string;
    totalAssetValue: number;
    startingBalance?: number;
    createdAt: Timestamp;
}
