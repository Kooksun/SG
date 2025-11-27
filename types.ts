import { Timestamp } from "firebase/firestore";

export interface Stock {
    symbol: string;
    name: string;
    price: number;
    change: number;
    change_percent: number;
    updatedAt: Timestamp;
}

export interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    balance: number;
    totalAssetValue: number;
    createdAt: Timestamp;
}
