import mongoose from 'mongoose';
import Candle from './models/Candle';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || '';
const TOTAL_CANDLES = 2000;
const START_TIME = Math.floor(Date.now() / 60000) * 60000 - (TOTAL_CANDLES - 1) * 3 * 60 * 1000; // 3 min interval

async function seedCandles() {
  await mongoose.connect(MONGO_URI, { dbName: 'tradespot-market' });
  console.log('Connected to MongoDB');
  await Candle.deleteMany({});
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
  await Candle.insertMany(candles);
  console.log('Seeded 2000 candles');
  await mongoose.disconnect();
}

seedCandles().catch(err => {
  console.error(err);
  process.exit(1);
});
