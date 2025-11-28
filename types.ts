import { Timestamp } from "firebase/firestore";

export interface Stock {
    symbol: string;
    name: string;
    price: number;
    change: number;
    change_percent: number;
    updatedAt: Timestamp | string;
}

export interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    balance: number;
    totalAssetValue: number;
    startingBalance?: number;
    createdAt: Timestamp;
}
