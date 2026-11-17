import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode
} from "lightweight-charts";

/**
 * ARVEX Chart Engine 2.0 — first migration adapter.
 * Keeps the legacy CandleChart contract while moving rendering, time/price
 * scales, crosshair and gestures to Lightweight Charts.
 */
class CandleChartV2 {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.host = canvas.parentElement;
    this.onCross = opts.onCross || null;
    this.data = [];
    this.lines = [];
    this.cross = null;
    this.tfMs = 900000;
    this._ma = true;
    this._ema = false;
    this._vol = true;
    this._priceLines = [];
    this._timeIndex = new Map();

    canvas.style.display = "none";
    this.host.classList.add("chart-engine-v2");
    this.host.style.position = "relative";
    this.mount = document.createElement("div");
    this.mount.className = "chart-v2-host";
    this.mount.setAttribute("aria-label", "График ARVEX");
    this.host.appendChild(this.mount);

    this.chart = createChart(this.mount, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#090a10" },
        textColor: "#8890a6",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        fontSize: 11,
        attributionLogo: false
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.035)" },
        horzLines: { color: "rgba(255,255,255,0.06)" }
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
        scaleMargins: { top: 0.08, bottom: 0.2 }
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 3,
        barSpacing: 8,
        minBarSpacing: 2
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(165,139,255,0.65)", style: 2, labelBackgroundColor: "#7c5cff" },
        horzLine: { color: "rgba(165,139,255,0.65)", style: 2, labelBackgroundColor: "#7c5cff" }
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true }
    });

    this.candles = this.chart.addSeries(CandlestickSeries, {
      upColor: "#2ee59d",
      downColor: "#ff5470",
      borderUpColor: "#2ee59d",
      borderDownColor: "#ff5470",
      wickUpColor: "#2ee59d",
      wickDownColor: "#ff5470",
      priceLineVisible: true,
      lastValueVisible: true
    });

    this.maSeries = this.chart.addSeries(LineSeries, {
      color: "#f5c451", lineWidth: 2, priceLineVisible: false,
      lastValueVisible: false, crosshairMarkerVisible: false
    });
    this.emaSeries = this.chart.addSeries(LineSeries, {
      color: "#4f8cff", lineWidth: 2, priceLineVisible: false,
      lastValueVisible: false, crosshairMarkerVisible: false
    });
    this.volumeSeries = this.chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false
    });
    this.chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
      borderVisible: false
    });

    this.chart.subscribeCrosshairMove(param => {
      if (!param || param.time == null) {
        this.cross = null;
        if (this.onCross) this.onCross(null);
        return;
      }
      const key = Number(param.time);
      const index = this._timeIndex.get(key);
      if (index == null) return;
      this.cross = { i: index };
      if (this.onCross) this.onCross(this.data[index] || null);
    });

    this._resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => this.resize())
      : null;
    if (this._resizeObserver) this._resizeObserver.observe(this.host);
    this.resize();
  }

  get ma() { return this._ma; }
  set ma(value) { this._ma = !!value; this._syncIndicators(); }
  get ema() { return this._ema; }
  set ema(value) { this._ema = !!value; this._syncIndicators(); }
  get vol() { return this._vol; }
  set vol(value) {
    this._vol = !!value;
    this.volumeSeries.applyOptions({ visible: this._vol });
    this.chart.priceScale("right").applyOptions({
      scaleMargins: this._vol ? { top: 0.08, bottom: 0.2 } : { top: 0.08, bottom: 0.08 }
    });
  }

  _sma(period) {
    let sum = 0;
    return this.data.map((c, i) => {
      sum += c.c;
      if (i >= period) sum -= this.data[i - period].c;
      return i >= period - 1 ? { time: Math.floor(c.t / 1000), value: sum / period } : null;
    }).filter(Boolean);
  }

  _ema(period) {
    const k = 2 / (period + 1);
    let value = null;
    return this.data.map((c, i) => {
      value = value == null ? c.c : c.c * k + value * (1 - k);
      return i >= period - 1 ? { time: Math.floor(c.t / 1000), value } : null;
    }).filter(Boolean);
  }

  _syncIndicators() {
    this.maSeries.applyOptions({ visible: this._ma });
    this.emaSeries.applyOptions({ visible: this._ema });
    if (this.data.length) {
      this.maSeries.setData(this._ma ? this._sma(20) : []);
      this.emaSeries.setData(this._ema ? this._emaData() : []);
    }
  }

  _emaData() { return this._emaValues(50); }
  _emaValues(period) {
    const k = 2 / (period + 1);
    let value = null;
    return this.data.map((c, i) => {
      value = value == null ? c.c : c.c * k + value * (1 - k);
      return i >= period - 1 ? { time: Math.floor(c.t / 1000), value } : null;
    }).filter(Boolean);
  }

  setData(arr, tfMs) {
    const wasEmpty = this.data.length === 0;
    this.data = Array.isArray(arr) ? arr : [];
    if (tfMs) this.tfMs = tfMs;
    this._timeIndex.clear();

    const candles = this.data.map((c, i) => {
      const time = Math.floor(c.t / 1000);
      this._timeIndex.set(time, i);
      return { time, open: c.o, high: c.h, low: c.l, close: c.c };
    });
    const volume = this.data.map(c => ({
      time: Math.floor(c.t / 1000),
      value: Number(c.v) || 0,
      color: c.c >= c.o ? "rgba(46,229,157,0.28)" : "rgba(255,84,112,0.28)"
    }));

    this.candles.setData(candles);
    this.volumeSeries.setData(volume);
    this.maSeries.setData(this._ma ? this._sma(20) : []);
    this.emaSeries.setData(this._ema ? this._emaValues(50) : []);
    this.cross = null;

    if (wasEmpty && candles.length) {
      this.chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, candles.length - 82),
        to: candles.length + 2
      });
    }
    this.setLines(this.lines);
  }

  setLines(lines) {
    for (const item of this._priceLines) this.candles.removePriceLine(item);
    this._priceLines = [];
    this.lines = Array.isArray(lines) ? lines : [];
    for (const line of this.lines) {
      if (!Number.isFinite(line.price) || line.price <= 0) continue;
      this._priceLines.push(this.candles.createPriceLine({
        price: line.price,
        color: line.color || "#a58bff",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: line.label || ""
      }));
    }
  }

  zoom(factor) {
    const scale = this.chart.timeScale();
    const range = scale.getVisibleLogicalRange();
    if (!range) return;
    const center = (range.from + range.to) / 2;
    const width = Math.max(12, Math.min(600, (range.to - range.from) * factor));
    scale.setVisibleLogicalRange({ from: center - width / 2, to: center + width / 2 });
  }

  resize() {
    if (!this.chart || !this.host) return;
    const rect = this.host.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.chart.applyOptions({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
    }
  }

  draw() { this._syncIndicators(); }
  destroy() {
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this.chart) this.chart.remove();
    if (this.mount) this.mount.remove();
    this.canvas.style.display = "";
    this.host.classList.remove("chart-engine-v2");
  }
}

window.ARVEXChartEngine = { CandleChartV2 };
