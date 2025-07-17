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
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const mongoose_1 = __importDefault(require("mongoose"));
const Candle_1 = __importDefault(require("./models/Candle"));
const mongoose_2 = require("mongoose");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = 4000;
app.use((0, cors_1.default)());
// MongoDB connection
mongoose_1.default.connect(process.env.MONGO_URI || '', {
    dbName: 'tradespot-market',
}).then(() => {
    console.log('✅ Connected to MongoDB Atlas');
}).catch(err => {
    console.error('❌ MongoDB connection error:', err);
});
// Market state schema/model
const MarketStateSchema = new mongoose_2.Schema({
    trend: Number,
    strength: Number,
    duration: Number,
});
const MarketState = (0, mongoose_2.model)('MarketState', MarketStateSchema);
// Track current candle in memory
let currentCandle = null;
// Market state for trend and volatility
let marketTrend = 0; // -1 (down), 0 (sideways), 1 (up)
let trendStrength = 0; // how strong the trend is
let trendDuration = 0; // how long the trend lasts
function pickNewTrend() {
    // 60% sideways, 20% up, 20% down
    const r = Math.random();
    if (r < 0.2) {
        marketTrend = 1;
        trendStrength = Math.random() * 2 + 1; // 1-3
        trendDuration = Math.floor(Math.random() * 10) + 5; // 5-15 updates
    }
    else if (r < 0.4) {
        marketTrend = -1;
        trendStrength = Math.random() * 2 + 1;
        trendDuration = Math.floor(Math.random() * 10) + 5;
    }
    else {
        marketTrend = 0;
        trendStrength = Math.random() * 0.5 + 0.1; // 0.1-0.6
        trendDuration = Math.floor(Math.random() * 20) + 10; // 10-30 updates
    }
}
// Helper to get the current 1-min interval timestamp
const getCurrentCandleTime = () => Math.floor(Date.now() / 60000) * 60000;
// Helper for normal distribution (Box-Muller transform)
function randn_bm() {
    let u = 0, v = 0;
    while (u === 0)
        u = Math.random();
    while (v === 0)
        v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
// Create a new candle every 1 minute
const createNewCandle = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const now = getCurrentCandleTime();
    const last = yield Candle_1.default.findOne().sort({ time: -1 });
    // Backfill missed candles if needed
    if (last && now - last.time >= 60000 * 2) {
        const missed = Math.floor((now - last.time) / 60000);
        for (let i = 1; i < missed; i++) {
            const fillTime = last.time + i * 60000;
            // Add randomization to backfilled candles
            let base = last.close + (Math.random() - 0.5) * 2; // small random walk
            base = Math.max(450, Math.min(550, +base.toFixed(2)));
            const high = base + Math.random() * 2;
            const low = base - Math.random() * 2;
            const close = base + (Math.random() - 0.5) * 2;
            const volume = Math.floor(Math.random() * 50) + 10;
            const fillCandle = new Candle_1.default({
                time: fillTime,
                open: base,
                high: Math.max(base, high),
                low: Math.min(base, low),
                close: +close.toFixed(2),
                volume
            });
            try {
                yield fillCandle.save();
            }
            catch (err) {
                // Ignore duplicate errors
            }
        }
    }
    // Simulate gap: sometimes jump price (now much more rare and smaller)
    let basePrice = (_a = last === null || last === void 0 ? void 0 : last.close) !== null && _a !== void 0 ? _a : 500;
    // Reduce probability and size of random gap
    if (Math.random() < 0.002) {
        basePrice += randn_bm() * 3;
    }
    // Bounce price if out of bounds (limit to 475-525)
    if (basePrice > 525)
        basePrice = 525 - (basePrice - 525);
    if (basePrice < 475)
        basePrice = 475 + (475 - basePrice);
    // Trend can persist for several candles
    if (trendDuration <= 0)
        pickNewTrend();
    trendDuration--;
    // Add trend to open, but keep it subtle
    let open = basePrice + marketTrend * trendStrength * (Math.random() * 0.5 + 0.5);
    open += randn_bm() * 0.7;
    if (open > 525)
        open = 525 - (open - 525);
    if (open < 475)
        open = 475 + (475 - open);
    open = +open.toFixed(2);
    // Add some variation to high, low, close
    let high = open + Math.abs(randn_bm() * 1.5);
    let low = open - Math.abs(randn_bm() * 1.5);
    let close = open + randn_bm() * 1.2;
    if (high > 525)
        high = 525 - (high - 525);
    if (low < 475)
        low = 475 + (475 - low);
    if (close > high)
        close = high;
    if (close < low)
        close = low;
    high = +Math.max(open, high).toFixed(2);
    low = +Math.min(open, low).toFixed(2);
    close = +Math.max(low, Math.min(high, close)).toFixed(2);
    // Volume: higher on bigger moves, but mostly small
    const baseVol = Math.abs(close - open) * 8 + Math.abs(high - low) * 2;
    const volume = Math.floor(baseVol + randn_bm() * 5 + 20);
    currentCandle = new Candle_1.default({
        time: now,
        open,
        high: +high.toFixed(2),
        low: +low.toFixed(2),
        close: +close.toFixed(2),
        volume
    });
    try {
        yield currentCandle.save();
        // Ensure candle count does not exceed 2000
        const candleCount = yield Candle_1.default.countDocuments();
        if (candleCount > 2000) {
            const excess = candleCount - 2000;
            // Delete the oldest candles using an efficient two-step process
            const oldest = yield Candle_1.default.find().sort({ time: 1 }).limit(excess).select('_id');
            const idsToDelete = oldest.map(doc => doc._id);
            yield Candle_1.default.deleteMany({ _id: { $in: idsToDelete } });
        }
    }
    catch (err) {
        // If duplicate, fetch and use existing
        currentCandle = yield Candle_1.default.findOne({ time: now });
    }
});
// Update the current candle every 10 seconds
const updateCurrentCandle = () => __awaiter(void 0, void 0, void 0, function* () {
    if (!currentCandle)
        return;
    // Trend and volatility
    if (trendDuration <= 0)
        pickNewTrend();
    trendDuration--;
    // Controlled price move with trend, noise, and rare big moves
    let priceChange = randn_bm() * 0.7; // small, natural noise
    priceChange += marketTrend * trendStrength * (Math.random() * 0.3 + 0.2); // trend, subtle
    if (Math.random() < 0.01)
        priceChange += randn_bm() * 8; // rare, moderate move
    let newClose = +(currentCandle.close + priceChange).toFixed(2);
    // Bounce close if out of bounds
    if (newClose > 525)
        newClose = 525 - (newClose - 525);
    if (newClose < 475)
        newClose = 475 + (475 - newClose);
    // Wicks: high/low can spike, but less often
    let wickUp = Math.random() < 0.1 ? Math.abs(randn_bm() * 3) : 0;
    let wickDown = Math.random() < 0.1 ? Math.abs(randn_bm() * 3) : 0;
    let newHigh = Math.max(currentCandle.high, newClose, +(newClose + wickUp).toFixed(2));
    let newLow = Math.min(currentCandle.low, newClose, +(newClose - wickDown).toFixed(2));
    if (newHigh > 525)
        newHigh = 525 - (newHigh - 525);
    if (newLow < 475)
        newLow = 475 + (475 - newLow);
    // Volume: higher on big moves, but mostly small
    let volBoost = Math.abs(priceChange) * 8 + Math.abs(newHigh - newLow) * 2 + randn_bm() * 3;
    const newVolume = +(currentCandle.volume + Math.max(0, Math.floor(volBoost))).toFixed(2);
    currentCandle.close = newClose;
    currentCandle.high = newHigh;
    currentCandle.low = newLow;
    currentCandle.volume = newVolume;
    yield Candle_1.default.findOneAndUpdate({ time: currentCandle.time }, {
        close: newClose,
        high: newHigh,
        low: newLow,
        volume: newVolume,
    }, { new: true });
    // Also update in-memory
    currentCandle = yield Candle_1.default.findOne({ time: currentCandle.time });
});
// Self-healing loop for new candle creation
const loopNewCandle = () => __awaiter(void 0, void 0, void 0, function* () {
    yield createNewCandle();
    setTimeout(loopNewCandle, 3 * 60 * 1000); // every 3 minutes
});
// Self-healing loop for updating current candle
const loopUpdateCandle = () => __awaiter(void 0, void 0, void 0, function* () {
    yield updateCurrentCandle();
    setTimeout(loopUpdateCandle, 30 * 1000); // every 30 seconds
});
// Load market state from DB on startup
function loadMarketState() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        let state = yield MarketState.findOne();
        if (!state) {
            state = yield MarketState.create({ trend: 0, strength: 0, duration: 0 });
        }
        marketTrend = (_a = state.trend) !== null && _a !== void 0 ? _a : 0;
        trendStrength = (_b = state.strength) !== null && _b !== void 0 ? _b : 0;
        trendDuration = (_c = state.duration) !== null && _c !== void 0 ? _c : 0;
    });
}
// Save market state to DB
function saveMarketState() {
    return __awaiter(this, void 0, void 0, function* () {
        yield MarketState.updateOne({}, { trend: marketTrend, strength: trendStrength, duration: trendDuration }, { upsert: true });
    });
}
// Call loadMarketState before starting loops
mongoose_1.default.connection.once('open', () => __awaiter(void 0, void 0, void 0, function* () {
    yield loadMarketState();
    loopNewCandle();
    loopUpdateCandle();
    // Periodically save state
    setInterval(saveMarketState, 10 * 1000);
}));
// API endpoints
app.get('/api/market/candles', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const candles = yield Candle_1.default.find().sort({ time: 1 }).limit(500);
    res.json(candles);
}));
app.get('/api/health', (req, res) => {
    res.send('✅ Alive');
});
app.listen(PORT, () => {
    console.log(`✅ Market API running on http://localhost:${PORT}`);
});
