import { escapeAttr } from "./layout.js";

/**
 * Renders an annotation canvas overlay for visual review of design/wireframe content.
 *
 * Features:
 * - Click to add numbered pin markers with text callouts
 * - Freehand pen drawing (toggle on/off)
 * - Toolbar: Pen tool, Pin tool, Clear, Undo
 * - Pins route to the unified review sidebar via window.addReviewComment()
 * - Capture: serialises to { screenshot: base64, annotations: [{x,y,text}] }
 *
 * @param imageContent - URL or base64 data URI of the image/wireframe to annotate
 * @returns HTML string with canvas overlay and pin system (no built-in sidebar)
 */
export function renderAnnotationCanvas(imageContent: string): string {
  return `
<div id="annotation-container" class="relative">
  <!-- Toolbar -->
  <div class="flex items-center gap-2 mb-3 p-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
    <button type="button" id="tool-pin"
            class="annotation-tool active-tool px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                   bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
            aria-pressed="true"
            title="Pin tool: click on the image to add a numbered annotation marker">
      <span aria-hidden="true">&#128204;</span> Pin
    </button>
    <button type="button" id="tool-pen"
            class="annotation-tool px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                   bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300
                   hover:bg-gray-200 dark:hover:bg-gray-700"
            aria-pressed="false"
            title="Pen tool: draw freehand on the image to highlight areas">
      <span aria-hidden="true">&#9998;</span> Pen
    </button>
    <div class="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"></div>
    <button type="button" id="tool-undo"
            class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                   bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300
                   hover:bg-gray-200 dark:hover:bg-gray-700"
            title="Undo last action">
      <span aria-hidden="true">&#8630;</span> Undo
    </button>
    <button type="button" id="tool-clear"
            class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                   bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300
                   hover:bg-gray-200 dark:hover:bg-gray-700"
            title="Clear all annotations and drawings">
      <span aria-hidden="true">&#10060;</span> Clear
    </button>
    <div class="flex-1"></div>
    <span id="tool-status" class="text-xs text-gray-500 dark:text-gray-400">Pin mode</span>
  </div>

  <!-- Canvas area (full width — sidebar is external) -->
  <div id="canvas-wrapper" class="relative inline-block border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-crosshair">
    <img id="annotation-image"
         src="${escapeAttr(imageContent)}"
         alt="Content to annotate"
         class="block max-w-full h-auto select-none"
         draggable="false" />
    <canvas id="draw-canvas"
            class="absolute top-0 left-0 w-full h-full"
            style="pointer-events: auto;"></canvas>
    <div id="pins-layer" class="absolute top-0 left-0 w-full h-full" style="pointer-events: none;"></div>
  </div>
</div>

<style>
  #canvas-wrapper.pen-mode { cursor: crosshair; }
  #canvas-wrapper.pin-mode { cursor: crosshair; }
  .annotation-pin {
    position: absolute;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #e11d48;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    transform: translate(-50%, -50%);
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    pointer-events: auto;
    cursor: pointer;
    z-index: 10;
    border: 2px solid #fff;
    transition: transform 0.1s;
  }
  .annotation-pin:hover { transform: translate(-50%, -50%) scale(1.2); }
  .annotation-pin.selected {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }
</style>

<script>
(function() {
  var img = document.getElementById('annotation-image');
  var canvas = document.getElementById('draw-canvas');
  var ctx = canvas.getContext('2d');
  var pinsLayer = document.getElementById('pins-layer');
  var toolStatus = document.getElementById('tool-status');
  var wrapper = document.getElementById('canvas-wrapper');

  var currentTool = 'pin'; // 'pin' or 'pen'
  var pins = []; // { x, y, text, el, sidebarCommentId }
  var drawHistory = []; // array of ImageData snapshots
  var isDrawing = false;

  // Wait for image to load, then size the canvas
  function sizeCanvas() {
    canvas.width = img.naturalWidth || img.offsetWidth;
    canvas.height = img.naturalHeight || img.offsetHeight;
    canvas.style.width = img.offsetWidth + 'px';
    canvas.style.height = img.offsetHeight + 'px';
    if (drawHistory.length > 0) {
      ctx.putImageData(drawHistory[drawHistory.length - 1], 0, 0);
    }
  }

  if (img.complete) { sizeCanvas(); }
  img.addEventListener('load', sizeCanvas);
  window.addEventListener('resize', sizeCanvas);

  // Tool switching
  var toolButtons = {
    pin: document.getElementById('tool-pin'),
    pen: document.getElementById('tool-pen')
  };

  function setTool(tool) {
    currentTool = tool;
    for (var key in toolButtons) {
      var btn = toolButtons[key];
      if (key === tool) {
        btn.classList.remove('bg-gray-100', 'text-gray-700', 'dark:bg-gray-800', 'dark:text-gray-300');
        btn.classList.add('bg-blue-100', 'text-blue-700', 'dark:bg-blue-900/40', 'dark:text-blue-300');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.classList.add('bg-gray-100', 'text-gray-700', 'dark:bg-gray-800', 'dark:text-gray-300');
        btn.classList.remove('bg-blue-100', 'text-blue-700', 'dark:bg-blue-900/40', 'dark:text-blue-300');
        btn.setAttribute('aria-pressed', 'false');
      }
    }
    wrapper.classList.toggle('pen-mode', tool === 'pen');
    wrapper.classList.toggle('pin-mode', tool === 'pin');
    toolStatus.textContent = tool === 'pin' ? 'Pin mode' : 'Pen mode';
  }

  toolButtons.pin.addEventListener('click', function() { setTool('pin'); });
  toolButtons.pen.addEventListener('click', function() { setTool('pen'); });

  // Get coordinates relative to the canvas (accounting for CSS scaling)
  function getCanvasCoords(e) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  // Get percentage coordinates for pin positioning (relative to image display)
  function getPctCoords(e) {
    var rect = wrapper.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100
    };
  }

  // --- Pen drawing ---
  function saveDrawState() {
    drawHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  }

  canvas.addEventListener('mousedown', function(e) {
    if (currentTool !== 'pen') return;
    e.preventDefault();
    isDrawing = true;
    saveDrawState();
    var coords = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  });

  canvas.addEventListener('mousemove', function(e) {
    if (!isDrawing) return;
    var coords = getCanvasCoords(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  });

  canvas.addEventListener('mouseup', function(e) {
    if (isDrawing) {
      isDrawing = false;
      ctx.closePath();
    }
  });

  canvas.addEventListener('mouseleave', function() {
    if (isDrawing) {
      isDrawing = false;
      ctx.closePath();
    }
  });

  // --- Pin placement ---
  canvas.addEventListener('click', function(e) {
    if (currentTool !== 'pin') return;
    e.preventDefault();
    var pct = getPctCoords(e);
    addPin(pct.x, pct.y);
  });

  function addPin(pctX, pctY) {
    var num = pins.length + 1;
    var pinId = 'annotation-pin-' + num + '-' + Date.now();

    // Create pin element
    var pinEl = document.createElement('div');
    pinEl.className = 'annotation-pin';
    pinEl.id = pinId;
    pinEl.textContent = num;
    pinEl.style.left = pctX + '%';
    pinEl.style.top = pctY + '%';
    pinEl.setAttribute('role', 'button');
    pinEl.setAttribute('aria-label', 'Annotation ' + num);
    pinsLayer.appendChild(pinEl);

    var pin = { x: pctX, y: pctY, text: '', el: pinEl, sidebarCommentId: null };
    pins.push(pin);

    // Add to unified sidebar
    if (typeof window.addReviewComment === 'function') {
      var sidebarId = window.addReviewComment({
        type: 'pin',
        sourceId: pinId,
        sourceLabel: 'Pin #' + num,
        text: '',
        scrollTargetId: pinId,
        highlightEl: pinEl,
        onDelete: function() {
          removePin(pin, true);
        },
        onTextChange: function(val) {
          pin.text = val;
        }
      });
      pin.sidebarCommentId = sidebarId;
    }

    // Click pin to scroll sidebar comment into view
    pinEl.addEventListener('click', function(e) {
      e.stopPropagation();
      if (pin.sidebarCommentId) {
        var card = document.querySelector('[data-comment-id="' + pin.sidebarCommentId + '"]');
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          var ta = card.querySelector('textarea');
          if (ta) ta.focus();
        }
      }
    });

    // Save state for undo
    saveDrawState();
  }

  function removePin(pin, fromSidebar) {
    var idx = pins.indexOf(pin);
    if (idx < 0) return;
    pins.splice(idx, 1);
    pin.el.remove();

    // If not called from sidebar, remove from sidebar
    if (!fromSidebar && pin.sidebarCommentId && typeof window.removeReviewComment === 'function') {
      window.removeReviewComment(pin.sidebarCommentId);
    }

    // Renumber remaining pins and update sidebar labels
    for (var i = 0; i < pins.length; i++) {
      pins[i].el.textContent = i + 1;
      pins[i].el.setAttribute('aria-label', 'Annotation ' + (i + 1));
      if (pins[i].sidebarCommentId && typeof window.updateReviewCommentLabel === 'function') {
        window.updateReviewCommentLabel(pins[i].sidebarCommentId, 'Pin #' + (i + 1));
      }
    }
  }

  // --- Undo ---
  document.getElementById('tool-undo').addEventListener('click', function() {
    if (drawHistory.length > 0) {
      drawHistory.pop();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (drawHistory.length > 0) {
        ctx.putImageData(drawHistory[drawHistory.length - 1], 0, 0);
      }
    } else if (pins.length > 0) {
      removePin(pins[pins.length - 1], false);
    }
  });

  // --- Clear ---
  document.getElementById('tool-clear').addEventListener('click', function() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawHistory = [];
    while (pins.length > 0) {
      var p = pins.pop();
      p.el.remove();
      if (p.sidebarCommentId && typeof window.removeReviewComment === 'function') {
        window.removeReviewComment(p.sidebarCommentId);
      }
    }
  });

  // --- Capture (called externally via window.captureAnnotations) ---
  window.captureAnnotations = function() {
    var captureCanvas = document.createElement('canvas');
    captureCanvas.width = canvas.width;
    captureCanvas.height = canvas.height;
    var captureCtx = captureCanvas.getContext('2d');

    captureCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
    captureCtx.drawImage(canvas, 0, 0);

    for (var i = 0; i < pins.length; i++) {
      var px = (pins[i].x / 100) * canvas.width;
      var py = (pins[i].y / 100) * canvas.height;
      captureCtx.beginPath();
      captureCtx.arc(px, py, 14, 0, 2 * Math.PI);
      captureCtx.fillStyle = '#e11d48';
      captureCtx.fill();
      captureCtx.strokeStyle = '#fff';
      captureCtx.lineWidth = 2;
      captureCtx.stroke();
      captureCtx.fillStyle = '#fff';
      captureCtx.font = 'bold 12px system-ui, sans-serif';
      captureCtx.textAlign = 'center';
      captureCtx.textBaseline = 'middle';
      captureCtx.fillText(String(i + 1), px, py);
    }

    var screenshot = captureCanvas.toDataURL('image/png');
    var annotations = pins.map(function(p, i) {
      return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, text: p.text };
    });

    return { screenshot: screenshot, annotations: annotations };
  };

  // --- Check if there are any annotations ---
  window.hasCanvasAnnotations = function() {
    return pins.length > 0 || drawHistory.length > 0;
  };
})();
</script>`;
}
