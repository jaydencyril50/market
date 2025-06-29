import { useEffect, useRef, useState } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import type { MouseEventParams, UTCTimestamp } from 'lightweight-charts';

// Candle type definition
interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const SimulatedMarketChart = () => {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [showSMA, setShowSMA] = useState(true);
  const [showEMA, setShowEMA] = useState(false);
  const [showRSI, setShowRSI] = useState(false);
  const [showMACD, setShowMACD] = useState(false);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Dynamically get container height
    const getContainerSize = () => ({
      width: chartContainerRef.current?.clientWidth || window.innerWidth,
      height: chartContainerRef.current?.clientHeight || window.innerHeight,
    });

    const { width, height } = getContainerSize();
    const chart = createChart(chartContainerRef.current, {
      width,
      height,
      layout: {
        background: { color: '#131722' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#2B2B43' },
        horzLines: { color: '#2B2B43' },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
      },
      timeScale: {
        borderColor: '#485c7b',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    const volumeSeries = chart.addHistogramSeries({
      color: 'rgba(38, 166, 154, 0.3)',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    const smaSeries = chart.addLineSeries({ color: '#e0e722' });
    const emaSeries = chart.addLineSeries({ color: '#ff6f61' });
    const rsiSeries = chart.addLineSeries({ color: '#9b59b6' });
    const macdSeries = chart.addLineSeries({ color: '#3498db' });

    const getSMA = (data: Candle[], window: number) =>
      data
        .map((d, i) => {
          if (i < window) return null;
          const avg =
            data.slice(i - window, i).reduce((sum, c) => sum + c.close, 0) / window;
          return { time: d.time, value: +avg.toFixed(2) };
        })
        .filter((point): point is { time: number; value: number } => point !== null);

    const getEMA = (data: (Candle | LinePoint)[], window: number) => {
      const k = 2 / (window + 1);
      let ema = data[0].close;
      return data.map((d, i) => {
        if (i === 0) return { time: d.time, value: ema };
        ema = d.close * k + ema * (1 - k);
        return { time: d.time, value: +ema.toFixed(2) };
      });
    };

    const getRSI = (data: Candle[], period = 14) => {
      let gains = 0, losses = 0;
      const result = [];

      for (let i = 1; i <= period; i++) {
        const change = data[i].close - data[i - 1].close;
        if (change > 0) {
          gains += change;
        } else {
          losses -= change;
        }
      }

      let avgGain = gains / period;
      let avgLoss = losses / period;

      result.push({ time: data[period].time, value: +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(2) });

      for (let i = period + 1; i < data.length; i++) {
        const change = data[i].close - data[i - 1].close;
        if (change > 0) {
          avgGain = (avgGain * (period - 1) + change) / period;
        } else {
          avgLoss = (avgLoss * (period - 1) - change) / period;
        }

        const rs = avgGain / avgLoss;
        result.push({ time: data[i].time, value: +(100 - 100 / (1 + rs)).toFixed(2) });
      }

      return result;
    };

    interface LinePoint {
      time: number;
      close: number;
    }

    const getMACD = (data: Candle[], short = 12, long = 26, signal = 9) => {
      const emaShort = getEMA(data, short);
      const emaLong = getEMA(data, long);
      const macdLine = emaShort.map((point, i) => ({
        time: point.time,
        value: point.value - (emaLong[i]?.value || 0),
      }));
      const macdLineForEMA: LinePoint[] = macdLine.map((m) => ({
        time: m.time,
        close: m.value ?? 0,
      }));
      const signalLine = getEMA(macdLineForEMA as LinePoint[], signal);
      return signalLine;
    };

    const updateChart = async () => {
      const response = await fetch('https://market-egl7.onrender.com/api/market/candles');
      const candles: Candle[] = await response.json();
      candleSeries.setData(
        candles.map(c => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
      volumeSeries.setData(
        candles.map(c => ({
          time: c.time as UTCTimestamp,
          value: c.volume,
          color: c.close > c.open ? 'rgba(38, 166, 154, 0.3)' : 'rgba(239, 83, 80, 0.3)'
        }))
      );
      smaSeries.setData(showSMA ? getSMA(candles, 14).map(d => ({ time: d.time as UTCTimestamp, value: d.value })) : []);
      emaSeries.setData(showEMA ? getEMA(candles, 14).map(d => ({ time: d.time as UTCTimestamp, value: d.value })) : []);
      rsiSeries.setData(showRSI ? getRSI(candles).map(d => ({ time: d.time as UTCTimestamp, value: d.value })) : []);
      macdSeries.setData(showMACD ? getMACD(candles).map(d => ({ time: d.time as UTCTimestamp, value: d.value })) : []);
    };

    chart.subscribeCrosshairMove((param: MouseEventParams) => {
      if (!param || !param.time || !param.seriesPrices) return;
      const tooltip = tooltipRef.current;
      if (!tooltip) return;

      const price = param.seriesPrices.get(candleSeries);
      if (!price) return;

      tooltip.style.display = 'block';
      tooltip.style.left = `${param.point?.x ?? 0}px`;
      tooltip.style.top = '10px';
      if (typeof price === 'object' && price !== null && 'open' in price && 'high' in price && 'low' in price && 'close' in price) {
        tooltip.innerText = `O: ${price.open} H: ${price.high} L: ${price.low} C: ${price.close}`;
      } else {
        tooltip.innerText = `Price: ${price}`;
      }
    });

    updateChart();
    const interval = setInterval(updateChart, 5000);

    const handleResize = () => {
      if (chartContainerRef.current) {
        const { width, height } = getContainerSize();
        chart.applyOptions({ width, height });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [showSMA, showEMA, showRSI, showMACD]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: 0, margin: 0, height: '100vh', width: '100vw' }}>
      <h2 style={{ color: '#fff', marginBottom: '1rem' }}>TradeSpot SPOT/USDT Market</h2>
      <div>
        <label><input type="checkbox" checked={showSMA} onChange={() => setShowSMA(!showSMA)} /> SMA</label>
        <label><input type="checkbox" checked={showEMA} onChange={() => setShowEMA(!showEMA)} /> EMA</label>
        <label><input type="checkbox" checked={showRSI} onChange={() => setShowRSI(!showRSI)} /> RSI</label>
        <label><input type="checkbox" checked={showMACD} onChange={() => setShowMACD(!showMACD)} /> MACD</label>
      </div>
      <div
        ref={chartContainerRef}
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          backgroundColor: '#131722',
          position: 'relative',
          borderRadius: 0,
          minHeight: 0,
        }}
      >
        <div
          ref={tooltipRef}
          style={{
            position: 'absolute',
            color: 'white',
            background: 'rgba(0,0,0,0.7)',
            padding: '4px 8px',
            borderRadius: 4,
            pointerEvents: 'none',
            display: 'none',
            fontSize: '12px',
            zIndex: 1000,
          }}
        />
      </div>
    </div>
  );
};

export default SimulatedMarketChart;
