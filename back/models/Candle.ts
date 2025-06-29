import mongoose from 'mongoose';

const candleSchema = new mongoose.Schema({
  time: { type: Number, required: true, unique: true },
  open: Number,
  high: Number,
  low: Number,
  close: Number,
  volume: Number,
});

export default mongoose.model('Candle', candleSchema);
