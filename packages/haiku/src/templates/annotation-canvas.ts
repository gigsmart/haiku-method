import { escapeAttr } from "./layout.js";

/**
 * Renders an annotation canvas overlay for visual review of design/wireframe content.
 *
 * Features:
 * - Click to add numbered pin markers with text callouts
 * - Freehand pen drawing (toggle on/off)
 * - Toolbar: Pen tool, Pin tool, Clear, Undo
 * - Comments sidebar listing each annotation
 * - Capture: serialises to { screenshot: base64, annotations: [{x,y,text}] }
 *
 * @param imageContent - URL or base64 data URI of the image/wireframe to annotate
 * @returns HTML string with canvas overlay, pin system, and comments sidebar
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

  <div class="flex gap-4">
    <!-- Canvas area -->
    <div class="flex-1 min-w-0">
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

    <!-- Comments sidebar -->
    <div id="comments-sidebar"
         class="w-64 shrink-0 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col"
         style="max-height: 600px;">
      <div class="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Annotations <span id="pin-count" class="text-gray-400 dark:text-gray-500">(0)</span>
        </h3>
      </div>
      <div id="comments-list" class="flex-1 overflow-y-auto p-2 space-y-2">
        <p id="no-annotations" class="text-xs text-gray-400 dark:text-gray-500 italic p-2">
          Click on the image to add annotation pins.
        </p>
      </div>
    </div>
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
  .comment-entry {
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid transparent;
    transition: border-color 0.15s;
  }
  .comment-entry:hover,
  .comment-entry.active {
    border-color: #3b82f6;
  }
  .comment-number {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #e11d48;
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
</style>

<script>
(function() {
  var img = document.getElementById('annotation-image');
  var canvas = document.getElementById('draw-canvas');
  var ctx = canvas.getContext('2d');
  var pinsLayer = document.getElementById('pins-layer');
  var commentsList = document.getElementById('comments-list');
  var noAnnotations = document.getElementById('no-annotations');
  var pinCountEl = document.getElementById('pin-count');
  var toolStatus = document.getElementById('tool-status');
  var wrapper = document.getElementById('canvas-wrapper');

  var currentTool = 'pin'; // 'pin' or 'pen'
  var pins = []; // { x, y, text, el, commentEl }
  var drawHistory = []; // array of ImageData snapshots
  var isDrawing = false;

  // Wait for image to load, then size the canvas
  function sizeCanvas() {
    canvas.width = img.naturalWidth || img.offsetWidth;
    canvas.height = img.naturalHeight || img.offsetHeight;
    canvas.style.width = img.offsetWidth + 'px';
    canvas.style.height = img.offsetHeight + 'px';
    // Restore drawing if we had any
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

    // Create pin element
    var pinEl = document.createElement('div');
    pinEl.className = 'annotation-pin';
    pinEl.textContent = num;
    pinEl.style.left = pctX + '%';
    pinEl.style.top = pctY + '%';
    pinEl.setAttribute('role', 'button');
    pinEl.setAttribute('aria-label', 'Annotation ' + num);
    pinsLayer.appendChild(pinEl);

    // Create comment entry
    var commentEl = document.createElement('div');
    commentEl.className = 'comment-entry bg-gray-50 dark:bg-gray-800/50';
    commentEl.innerHTML =
      '<div class="flex items-start gap-2">' +
        '<span class="comment-number mt-0.5">' + num + '</span>' +
        '<textarea class="flex-1 text-xs p-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500" ' +
          'rows="2" placeholder="Add comment..." ' +
          'aria-label="Comment for annotation ' + num + '"></textarea>' +
        '<button type="button" class="pin-delete text-gray-400 hover:text-red-500 text-xs mt-0.5" ' +
          'aria-label="Delete annotation ' + num + '" title="Delete">&times;</button>' +
      '</div>';
    commentsList.appendChild(commentEl);

    var pin = { x: pctX, y: pctY, text: '', el: pinEl, commentEl: commentEl };
    pins.push(pin);

    // Focus the textarea
    var textarea = commentEl.querySelector('textarea');
    textarea.focus();

    // Update text on input
    textarea.addEventListener('input', function() {
      pin.text = textarea.value;
    });

    // Highlight pin on hover
    commentEl.addEventListener('mouseenter', function() {
      pinEl.classList.add('selected');
      commentEl.classList.add('active');
    });
    commentEl.addEventListener('mouseleave', function() {
      pinEl.classList.remove('selected');
      commentEl.classList.remove('active');
    });
    pinEl.addEventListener('mouseenter', function() {
      pinEl.classList.add('selected');
      commentEl.classList.add('active');
    });
    pinEl.addEventListener('mouseleave', function() {
      pinEl.classList.remove('selected');
      commentEl.classList.remove('active');
    });

    // Click pin to scroll comment into view
    pinEl.addEventListener('click', function(e) {
      e.stopPropagation();
      commentEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      textarea.focus();
    });

    // Delete pin
    commentEl.querySelector('.pin-delete').addEventListener('click', function() {
      removePin(pin);
    });

    updatePinCount();

    // Save state for undo
    saveDrawState();
  }

  function removePin(pin) {
    var idx = pins.indexOf(pin);
    if (idx < 0) return;
    pins.splice(idx, 1);
    pin.el.remove();
    pin.commentEl.remove();
    // Renumber remaining pins
    for (var i = 0; i < pins.length; i++) {
      pins[i].el.textContent = i + 1;
      pins[i].el.setAttribute('aria-label', 'Annotation ' + (i + 1));
      var numEl = pins[i].commentEl.querySelector('.comment-number');
      if (numEl) numEl.textContent = i + 1;
      var ta = pins[i].commentEl.querySelector('textarea');
      if (ta) ta.setAttribute('aria-label', 'Comment for annotation ' + (i + 1));
    }
    updatePinCount();
  }

  function updatePinCount() {
    pinCountEl.textContent = '(' + pins.length + ')';
    if (pins.length > 0) {
      noAnnotations.style.display = 'none';
    } else {
      noAnnotations.style.display = '';
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
      removePin(pins[pins.length - 1]);
    }
  });

  // --- Clear ---
  document.getElementById('tool-clear').addEventListener('click', function() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawHistory = [];
    while (pins.length > 0) {
      var p = pins.pop();
      p.el.remove();
      p.commentEl.remove();
    }
    updatePinCount();
  });

  // --- Capture (called externally via window.captureAnnotations) ---
  window.captureAnnotations = function() {
    // Composite: draw image + canvas drawing + pins onto a single capture canvas
    var captureCanvas = document.createElement('canvas');
    captureCanvas.width = canvas.width;
    captureCanvas.height = canvas.height;
    var captureCtx = captureCanvas.getContext('2d');

    // Draw the original image
    captureCtx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Draw the freehand annotations
    captureCtx.drawImage(canvas, 0, 0);

    // Draw pin markers
    for (var i = 0; i < pins.length; i++) {
      var px = (pins[i].x / 100) * canvas.width;
      var py = (pins[i].y / 100) * canvas.height;
      // Circle
      captureCtx.beginPath();
      captureCtx.arc(px, py, 14, 0, 2 * Math.PI);
      captureCtx.fillStyle = '#e11d48';
      captureCtx.fill();
      captureCtx.strokeStyle = '#fff';
      captureCtx.lineWidth = 2;
      captureCtx.stroke();
      // Number
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
