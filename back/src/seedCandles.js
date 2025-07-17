"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const Candle_1 = __importDefault(require("./models/Candle"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const MONGO_URI = process.env.MONGO_URI || '';
const TOTAL_CANDLES = 2000;
const START_TIME = Math.floor(Date.now() / 60000) * 60000 - (TOTAL_CANDLES - 1) * 3 * 60 * 1000; // 3 min interval
function seedCandles() {
    return __awaiter(this, void 0, void 0, function* () {
        yield mongoose_1.default.connect(MONGO_URI, { dbName: 'tradespot-market' });
        console.log('Connected to MongoDB');
        yield Candle_1.default.deleteMany({});
        const candles = [];
        let lastClose = 500;
        for (let i = 0; i < TOTAL_CANDLES; i++) {
            const time = START_TIME + i * 3 * 60 * 1000;
            // Simulate price within 475-525
            let open = lastClose + (Math.random() - 0.5) * 2;
            open = Math.max(475, Math.min(525, +open.toFixed(2)));
            let high = open + Math.random() * 2;
            let low = open - Math.random() * 2;
            let close = open + (Math.random() - 0.5) * 2;
            high = Math.max(open, Math.min(525, +high.toFixed(2)));
            low = Math.min(open, Math.max(475, +low.toFixed(2)));
            close = Math.max(low, Math.min(high, +close.toFixed(2)));
            const volume = Math.floor(Math.random() * 50) + 10;
            candles.push({ time, open, high, low, close, volume });
            lastClose = close;
        }
        yield Candle_1.default.insertMany(candles);
        console.log('Seeded 2000 candles');
        yield mongoose_1.default.disconnect();
    });
}
seedCandles().catch(err => {
    console.error(err);
    process.exit(1);
});
