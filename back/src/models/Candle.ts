import mongoose, { Schema, Document } from 'mongoose';

export interface ICandle extends Document {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const CandleSchema: Schema = new Schema({
  time: { type: Number, required: true, unique: true },
  open: { type: Number, required: true },
  high: { type: Number, required: true },
  low: { type: Number, required: true },
  close: { type: Number, required: true },
  volume: { type: Number, required: true },
});

const Candle = mongoose.model<ICandle>('Candle', CandleSchema);
export default Candle;
