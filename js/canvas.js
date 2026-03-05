// お絵描きキャンバス管理
class DrawingCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.isDrawing = false;
    this.tool = 'pen';
    this.color = '#000000';
    this.brushSize = 5;
    this.history = [];
    this.maxHistory = 30;

    // 白背景で初期化
    this.clear();
    this.saveState();

    this.setupEvents();
  }

  setupEvents() {
    const canvas = this.canvas;

    // マウスイベント
    canvas.addEventListener('mousedown', (e) => this.startDraw(e));
    canvas.addEventListener('mousemove', (e) => this.draw(e));
    canvas.addEventListener('mouseup', () => this.endDraw());
    canvas.addEventListener('mouseleave', () => this.endDraw());

    // タッチイベント
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.startDraw(e.touches[0]);
    });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this.draw(e.touches[0]);
    });
    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.endDraw();
    });
  }

  getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  startDraw(e) {
    this.isDrawing = true;
    const pos = this.getPos(e);
    this.ctx.beginPath();
    this.ctx.moveTo(pos.x, pos.y);
  }

  draw(e) {
    if (!this.isDrawing) return;
    const pos = this.getPos(e);

    this.ctx.lineWidth = this.brushSize;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    if (this.tool === 'eraser') {
      this.ctx.globalCompositeOperation = 'destination-out';
      this.ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.strokeStyle = this.color;
    }

    this.ctx.lineTo(pos.x, pos.y);
    this.ctx.stroke();
  }

  endDraw() {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.ctx.closePath();
    // 消しゴム後に白背景を復元
    if (this.tool === 'eraser') {
      this.restoreWhiteBackground();
    }
    this.saveState();
  }

  // 消しゴムで透明になった部分を白に復元
  restoreWhiteBackground() {
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }
    this.ctx.putImageData(imageData, 0, 0);
  }

  saveState() {
    if (this.history.length >= this.maxHistory) {
      this.history.shift();
    }
    this.history.push(this.canvas.toDataURL());
  }

  undo() {
    if (this.history.length <= 1) return;
    this.history.pop();
    const img = new Image();
    img.onload = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(img, 0, 0);
    };
    img.src = this.history[this.history.length - 1];
  }

  clear() {
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  clearWithSave() {
    this.clear();
    this.saveState();
  }

  setTool(tool) {
    this.tool = tool;
    this.canvas.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
  }

  setColor(color) {
    this.color = color;
    // ペンに切り替え
    if (this.tool === 'eraser') {
      this.setTool('pen');
    }
  }

  setBrushSize(size) {
    this.brushSize = size;
  }

  // Base64画像データを取得
  getImageData() {
    return this.canvas.toDataURL('image/png');
  }

  // 別のキャンバスに絵をコピー（縮小表示用）
  copyTo(targetCanvasId) {
    const target = document.getElementById(targetCanvasId);
    if (!target) return;
    const tCtx = target.getContext('2d');
    tCtx.clearRect(0, 0, target.width, target.height);
    tCtx.drawImage(this.canvas, 0, 0, target.width, target.height);
  }

  // リセット（新しいターン用）
  reset() {
    this.history = [];
    this.clear();
    this.saveState();
    this.setTool('pen');
    this.color = '#000000';
    this.brushSize = 5;
  }
}
