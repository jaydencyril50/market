import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import Candle, { ICandle } from './models/Candle';
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
const getCurrentCandleTime = () => Math.floor(Date.now() / 60) * 60;

// Create a new candle every 1 minute
const createNewCandle = async () => {
  const now = getCurrentCandleTime();
  const last = await Candle.findOne().sort({ time: -1 });
  // Simulate gap: sometimes jump price
  let basePrice = last?.close ?? 500;
  if (Math.random() < 0.05) {
    basePrice += (Math.random() - 0.5) * 40; // gap up/down
  }
  basePrice = Math.max(400, Math.min(600, basePrice));
  // Trend can persist for several candles
  if (trendDuration <= 0) pickNewTrend();
  trendDuration--;
  // Add trend to open
  let open = basePrice + marketTrend * trendStrength * (Math.random() * 2);
  open = Math.max(400, Math.min(600, +open.toFixed(2)));
  const close = open;
  const high = open;
  const low = open;
  const volume = Math.floor(Math.random() * 100) + 20;
  currentCandle = new Candle({ time: now, open, high, low, close, volume });
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
  let priceChange = (Math.random() - 0.5) * 2; // base noise
  priceChange += marketTrend * trendStrength * (Math.random() * 0.7 + 0.3); // trend
  if (Math.random() < 0.03) priceChange += (Math.random() - 0.5) * 20; // rare pump/dump
  let newClose = +(currentCandle.close + priceChange).toFixed(2);
  newClose = Math.max(400, Math.min(600, newClose));
  // Wicks: high/low can spike
  let wickUp = Math.random() < 0.2 ? Math.random() * 10 : 0;
  let wickDown = Math.random() < 0.2 ? Math.random() * 10 : 0;
  const newHigh = Math.max(currentCandle.high, newClose, Math.max(400, Math.min(600, +(newClose + wickUp).toFixed(2))));
  const newLow = Math.min(currentCandle.low, newClose, Math.max(400, Math.min(600, +(newClose - wickDown).toFixed(2))));
  // Volume: higher on big moves
  let volBoost = Math.abs(priceChange) > 5 ? Math.random() * 100 : Math.random() * 20;
  const newVolume = +(currentCandle.volume + Math.floor(volBoost)).toFixed(2);
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

// Start the intervals
createNewCandle();
setInterval(createNewCandle, 60 * 1000); // every 1 minute
setInterval(updateCurrentCandle, 10 * 1000); // every 10 seconds

// API endpoint
app.get('/api/market/candles', async (req, res) => {
  const candles = await Candle.find().sort({ time: 1 }).limit(500);
  res.json(candles);
});

app.listen(PORT, () => {
  console.log(`✅ Market API running on http://localhost:${PORT}`);
});
