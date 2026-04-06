/**
 * Renders an inline commenting system for text-based review content (specs, docs).
 *
 * Features:
 * - Highlight text to trigger a "Add Comment" popover
 * - Margin comments panel connected to highlighted text
 * - Comments numbered sequentially
 * - On submit: collects { comments: [{selectedText, comment, paragraph}] }
 *
 * @param markdownHtml - Pre-rendered HTML from markdown content
 * @returns HTML string with inline commenting system
 */
export function renderInlineComments(markdownHtml: string): string {
  return `
<div id="inline-comments-container" class="relative">
  <div class="flex gap-4">
    <!-- Content area -->
    <div class="flex-1 min-w-0">
      <div id="commentable-content"
           class="prose prose-sm dark:prose-invert max-w-none
                  prose-code:bg-gray-100 prose-code:dark:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
                  prose-pre:bg-gray-100 prose-pre:dark:bg-gray-800 prose-pre:rounded-lg
                  prose-table:border-collapse prose-th:border prose-th:border-gray-300 prose-th:dark:border-gray-600 prose-th:px-3 prose-th:py-1.5
                  prose-td:border prose-td:border-gray-300 prose-td:dark:border-gray-600 prose-td:px-3 prose-td:py-1.5
                  selection:bg-amber-200 dark:selection:bg-amber-700/50">
        ${markdownHtml}
      </div>
    </div>

    <!-- Margin comments panel -->
    <div id="margin-comments-panel"
         class="w-64 shrink-0 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col"
         style="max-height: 600px;">
      <div class="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Comments <span id="comment-count" class="text-gray-400 dark:text-gray-500">(0)</span>
        </h3>
      </div>
      <div id="margin-comments-list" class="flex-1 overflow-y-auto p-2 space-y-2">
        <p id="no-comments-msg" class="text-xs text-gray-400 dark:text-gray-500 italic p-2">
          Select text in the content to add a comment.
        </p>
      </div>
    </div>
  </div>

  <!-- Floating "Add Comment" button (hidden by default) -->
  <div id="add-comment-popover"
       class="hidden absolute z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg px-3 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
       role="button"
       tabindex="0"
       aria-label="Add comment on selected text">
    <span class="text-sm font-medium text-blue-600 dark:text-blue-400">+ Comment</span>
  </div>
</div>

<style>
  .inline-highlight {
    background-color: rgba(251, 191, 36, 0.3);
    border-bottom: 2px solid rgba(251, 191, 36, 0.7);
    cursor: pointer;
    transition: background-color 0.15s;
    border-radius: 2px;
  }
  .inline-highlight:hover,
  .inline-highlight.active {
    background-color: rgba(251, 191, 36, 0.5);
  }
  .margin-comment {
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid transparent;
    border-left: 3px solid rgba(251, 191, 36, 0.7);
    transition: border-color 0.15s, background-color 0.15s;
  }
  .margin-comment:hover,
  .margin-comment.active {
    border-color: #3b82f6;
    background-color: rgba(59, 130, 246, 0.05);
  }
  .margin-comment-number {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: rgba(251, 191, 36, 0.8);
    color: #78350f;
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
  var contentArea = document.getElementById('commentable-content');
  var popover = document.getElementById('add-comment-popover');
  var commentsList = document.getElementById('margin-comments-list');
  var noCommentsMsg = document.getElementById('no-comments-msg');
  var commentCountEl = document.getElementById('comment-count');

  var comments = []; // { selectedText, comment, paragraph, highlightEl, commentEl }
  var pendingSelection = null;

  // Assign paragraph indices to block-level elements in the content
  function getParagraphIndex(node) {
    var el = node.nodeType === 3 ? node.parentElement : node;
    if (!el) return 0;
    // Walk up to find the direct child of contentArea
    var block = el;
    while (block && block.parentElement !== contentArea) {
      block = block.parentElement;
    }
    if (!block) return 0;
    var children = Array.from(contentArea.children);
    return children.indexOf(block);
  }

  // Show popover near the selection
  function showPopover(x, y) {
    popover.style.left = x + 'px';
    popover.style.top = (y - 40) + 'px';
    popover.classList.remove('hidden');
  }

  function hidePopover() {
    popover.classList.add('hidden');
    pendingSelection = null;
  }

  // Listen for text selection in the content area
  contentArea.addEventListener('mouseup', function(e) {
    // Small delay to let the selection settle
    setTimeout(function() {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        hidePopover();
        return;
      }

      var range = sel.getRangeAt(0);

      // Verify the selection is within our content area
      if (!contentArea.contains(range.commonAncestorContainer)) {
        hidePopover();
        return;
      }

      var text = sel.toString().trim();
      if (!text) {
        hidePopover();
        return;
      }

      // Store the pending selection info
      pendingSelection = {
        text: text,
        range: range.cloneRange(),
        paragraph: getParagraphIndex(range.startContainer)
      };

      // Position the popover near the selection
      var rect = range.getBoundingClientRect();
      var containerRect = document.getElementById('inline-comments-container').getBoundingClientRect();
      showPopover(
        rect.left + (rect.width / 2) - containerRect.left - 40,
        rect.top - containerRect.top
      );
    }, 10);
  });

  // Clicking elsewhere hides the popover
  document.addEventListener('mousedown', function(e) {
    if (!popover.contains(e.target) && !contentArea.contains(e.target)) {
      hidePopover();
    }
  });

  // Add comment when popover is clicked
  popover.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!pendingSelection) return;
    addComment(pendingSelection);
    hidePopover();
    window.getSelection().removeAllRanges();
  });

  popover.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      popover.click();
    }
  });

  function addComment(selData) {
    var num = comments.length + 1;

    // Wrap the selected text in a highlight span
    var highlightEl = document.createElement('span');
    highlightEl.className = 'inline-highlight';
    highlightEl.setAttribute('data-comment-idx', num - 1);
    highlightEl.setAttribute('role', 'mark');
    highlightEl.setAttribute('aria-label', 'Commented text, annotation ' + num);

    try {
      selData.range.surroundContents(highlightEl);
    } catch (ex) {
      // surroundContents fails if the selection spans multiple elements;
      // fall back to inserting at boundaries
      try {
        var fragment = selData.range.extractContents();
        highlightEl.appendChild(fragment);
        selData.range.insertNode(highlightEl);
      } catch (ex2) {
        // If even that fails, just proceed without visual highlight
        highlightEl = null;
      }
    }

    // Create margin comment entry
    var commentEl = document.createElement('div');
    commentEl.className = 'margin-comment bg-gray-50 dark:bg-gray-800/50';
    commentEl.innerHTML =
      '<div class="flex items-start gap-2 mb-1">' +
        '<span class="margin-comment-number mt-0.5">' + num + '</span>' +
        '<p class="text-xs text-gray-500 dark:text-gray-400 italic truncate flex-1" ' +
          'title="' + escapeHtmlAttr(selData.text) + '">"' +
          truncateText(selData.text, 50) + '"</p>' +
        '<button type="button" class="comment-delete text-gray-400 hover:text-red-500 text-xs" ' +
          'aria-label="Delete comment ' + num + '" title="Delete">&times;</button>' +
      '</div>' +
      '<textarea class="w-full text-xs p-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500" ' +
        'rows="2" placeholder="Add your comment..." ' +
        'aria-label="Comment for highlighted text: ' + escapeHtmlAttr(truncateText(selData.text, 30)) + '"></textarea>';
    commentsList.appendChild(commentEl);

    var comment = {
      selectedText: selData.text,
      comment: '',
      paragraph: selData.paragraph,
      highlightEl: highlightEl,
      commentEl: commentEl
    };
    comments.push(comment);

    // Focus the textarea
    var textarea = commentEl.querySelector('textarea');
    textarea.focus();

    textarea.addEventListener('input', function() {
      comment.comment = textarea.value;
    });

    // Cross-highlighting: hovering comment highlights text and vice versa
    if (highlightEl) {
      commentEl.addEventListener('mouseenter', function() {
        highlightEl.classList.add('active');
        commentEl.classList.add('active');
      });
      commentEl.addEventListener('mouseleave', function() {
        highlightEl.classList.remove('active');
        commentEl.classList.remove('active');
      });
      highlightEl.addEventListener('mouseenter', function() {
        highlightEl.classList.add('active');
        commentEl.classList.add('active');
      });
      highlightEl.addEventListener('mouseleave', function() {
        highlightEl.classList.remove('active');
        commentEl.classList.remove('active');
      });
      highlightEl.addEventListener('click', function(e) {
        e.stopPropagation();
        commentEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        textarea.focus();
      });
    }

    // Delete
    commentEl.querySelector('.comment-delete').addEventListener('click', function() {
      removeComment(comment);
    });

    updateCommentCount();
  }

  function removeComment(comment) {
    var idx = comments.indexOf(comment);
    if (idx < 0) return;
    comments.splice(idx, 1);

    // Unwrap the highlight
    if (comment.highlightEl && comment.highlightEl.parentNode) {
      var parent = comment.highlightEl.parentNode;
      while (comment.highlightEl.firstChild) {
        parent.insertBefore(comment.highlightEl.firstChild, comment.highlightEl);
      }
      parent.removeChild(comment.highlightEl);
      parent.normalize(); // merge adjacent text nodes
    }

    comment.commentEl.remove();

    // Renumber remaining
    for (var i = 0; i < comments.length; i++) {
      var numEl = comments[i].commentEl.querySelector('.margin-comment-number');
      if (numEl) numEl.textContent = i + 1;
      if (comments[i].highlightEl) {
        comments[i].highlightEl.setAttribute('data-comment-idx', i);
        comments[i].highlightEl.setAttribute('aria-label', 'Commented text, annotation ' + (i + 1));
      }
    }

    updateCommentCount();
  }

  function updateCommentCount() {
    commentCountEl.textContent = '(' + comments.length + ')';
    noCommentsMsg.style.display = comments.length > 0 ? 'none' : '';
  }

  function truncateText(text, max) {
    if (text.length <= max) return escapeHtmlText(text);
    return escapeHtmlText(text.substring(0, max)) + '...';
  }

  function escapeHtmlText(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeHtmlAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // --- Capture (called externally via window.captureInlineComments) ---
  window.captureInlineComments = function() {
    return comments.map(function(c) {
      return {
        selectedText: c.selectedText,
        comment: c.comment,
        paragraph: c.paragraph
      };
    });
  };

  // --- Check if there are any inline comments ---
  window.hasInlineComments = function() {
    return comments.length > 0;
  };
})();
</script>`;
}
