import express, { Request, Response } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import Candle, { ICandle } from './models/Candle';
import { Schema, model } from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 4000;

app.use(cors());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI || '', {
  dbName: 'tradespot-market',
}).then(() => {
  console.log('✅ Connected to MongoDB Atlas');
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
});

// Market state schema/model
const MarketStateSchema = new Schema({
  trend: Number,
  strength: Number,
  duration: Number,
});
const MarketState = model('MarketState', MarketStateSchema);

// Track current candle in memory
let currentCandle: ICandle | null = null;

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
  } else if (r < 0.4) {
    marketTrend = -1;
    trendStrength = Math.random() * 2 + 1;
    trendDuration = Math.floor(Math.random() * 10) + 5;
  } else {
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
  while(u === 0) u = Math.random();
  while(v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Create a new candle every 1 minute
const createNewCandle = async () => {
  const now = getCurrentCandleTime();
  const last = await Candle.findOne().sort({ time: -1 });
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
      const fillCandle = new Candle({
        time: fillTime,
        open: base,
        high: Math.max(base, high),
        low: Math.min(base, low),
        close: +close.toFixed(2),
        volume
      });
      try {
        await fillCandle.save();
        console.log('🛠️ Backfilled missing candle:', fillTime);
      } catch (err) {
        // Ignore duplicate errors
      }
    }
  }
  // Simulate gap: sometimes jump price (now much more rare and smaller)
  let basePrice = last?.close ?? 500;
  if (Math.random() < 0.01) {
    basePrice += randn_bm() * 10; // rare, moderate gap
  }
  // Bounce price if out of bounds
  if (basePrice > 550) basePrice = 550 - (basePrice - 550);
  if (basePrice < 450) basePrice = 450 + (450 - basePrice);
  // Trend can persist for several candles
  if (trendDuration <= 0) pickNewTrend();
  trendDuration--;
  // Add trend to open, but keep it subtle
  let open = basePrice + marketTrend * trendStrength * (Math.random() * 0.5 + 0.5);
  open += randn_bm() * 0.7; // small random walk
  if (open > 550) open = 550 - (open - 550);
  if (open < 450) open = 450 + (450 - open);
  open = +open.toFixed(2);
  // Add some variation to high, low, close
  let high = open + Math.abs(randn_bm() * 1.5);
  let low = open - Math.abs(randn_bm() * 1.5);
  let close = open + randn_bm() * 1.2;
  if (high > 550) high = 550 - (high - 550);
  if (low < 450) low = 450 + (450 - low);
  if (close > high) close = high;
  if (close < low) close = low;
  high = +Math.max(open, high).toFixed(2);
  low = +Math.min(open, low).toFixed(2);
  close = +Math.max(low, Math.min(high, close)).toFixed(2);
  // Volume: higher on bigger moves, but mostly small
  const baseVol = Math.abs(close - open) * 8 + Math.abs(high - low) * 2;
  const volume = Math.floor(baseVol + randn_bm() * 5 + 20);
  currentCandle = new Candle({
    time: now,
    open,
    high: +high.toFixed(2),
    low: +low.toFixed(2),
    close: +close.toFixed(2),
    volume
  });
  try {
    await currentCandle.save();
    console.log('🕒 New 1-min candle created:', now);
  } catch (err) {
    // If duplicate, fetch and use existing
    currentCandle = await Candle.findOne({ time: now });
    console.warn('⚠️ Candle already exists for this interval, using existing.');
  }
};

// Update the current candle every 10 seconds
const updateCurrentCandle = async () => {
  if (!currentCandle) return;
  // Trend and volatility
  if (trendDuration <= 0) pickNewTrend();
  trendDuration--;
  // Controlled price move with trend, noise, and rare big moves
  let priceChange = randn_bm() * 0.7; // small, natural noise
  priceChange += marketTrend * trendStrength * (Math.random() * 0.3 + 0.2); // trend, subtle
  if (Math.random() < 0.01) priceChange += randn_bm() * 8; // rare, moderate move
  let newClose = +(currentCandle.close + priceChange).toFixed(2);
  // Bounce close if out of bounds
  if (newClose > 550) newClose = 550 - (newClose - 550);
  if (newClose < 450) newClose = 450 + (450 - newClose);
  // Wicks: high/low can spike, but less often
  let wickUp = Math.random() < 0.1 ? Math.abs(randn_bm() * 3) : 0;
  let wickDown = Math.random() < 0.1 ? Math.abs(randn_bm() * 3) : 0;
  let newHigh = Math.max(currentCandle.high, newClose, +(newClose + wickUp).toFixed(2));
  let newLow = Math.min(currentCandle.low, newClose, +(newClose - wickDown).toFixed(2));
  if (newHigh > 550) newHigh = 550 - (newHigh - 550);
  if (newLow < 450) newLow = 450 + (450 - newLow);
  // Volume: higher on big moves, but mostly small
  let volBoost = Math.abs(priceChange) * 8 + Math.abs(newHigh - newLow) * 2 + randn_bm() * 3;
  const newVolume = +(currentCandle.volume + Math.max(0, Math.floor(volBoost))).toFixed(2);
  currentCandle.close = newClose;
  currentCandle.high = newHigh;
  currentCandle.low = newLow;
  currentCandle.volume = newVolume;
  await Candle.findOneAndUpdate(
    { time: currentCandle.time },
    {
      close: newClose,
      high: newHigh,
      low: newLow,
      volume: newVolume,
    },
    { new: true }
  );
  // Also update in-memory
  currentCandle = await Candle.findOne({ time: currentCandle.time });
  if (currentCandle) {
    console.log('💹 Updated current candle:', currentCandle.time, 'close:', newClose);
  } else {
    console.log('💹 Updated current candle: null', 'close:', newClose);
  }
};

// Self-healing loop for new candle creation
const loopNewCandle = async () => {
  await createNewCandle();
  setTimeout(loopNewCandle, 60 * 1000);
};
// Self-healing loop for updating current candle
const loopUpdateCandle = async () => {
  await updateCurrentCandle();
  setTimeout(loopUpdateCandle, 10 * 1000);
};

// Load market state from DB on startup
async function loadMarketState() {
  let state = await MarketState.findOne();
  if (!state) {
    state = await MarketState.create({ trend: 0, strength: 0, duration: 0 });
  }
  marketTrend = state.trend ?? 0;
  trendStrength = state.strength ?? 0;
  trendDuration = state.duration ?? 0;
}
// Save market state to DB
async function saveMarketState() {
  await MarketState.updateOne({}, { trend: marketTrend, strength: trendStrength, duration: trendDuration }, { upsert: true });
}

// Call loadMarketState before starting loops
mongoose.connection.once('open', async () => {
  await loadMarketState();
  loopNewCandle();
  loopUpdateCandle();
  // Periodically save state
  setInterval(saveMarketState, 10 * 1000);
});

// API endpoints
app.get('/api/market/candles', async (req, res) => {
  const candles = await Candle.find().sort({ time: 1 }).limit(500);
  res.json(candles);
});
app.get('/api/health', (req: Request, res: Response) => {
  res.send('✅ Alive');
});

app.listen(PORT, () => {
  console.log(`✅ Market API running on http://localhost:${PORT}`);
});
