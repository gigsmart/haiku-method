/**
 * Renders an inline commenting system for text-based review content (specs, docs).
 *
 * Features:
 * - Highlight text to trigger a "Add Comment" popover
 * - Highlights persist on the page after commenting
 * - Comments are routed to the unified review sidebar via window.addReviewComment()
 * - Clicking a comment in the sidebar scrolls to and pulses the highlight
 * - On capture: collects { comments: [{selectedText, comment, paragraph}] }
 *
 * @param markdownHtml - Pre-rendered HTML from markdown content
 * @returns HTML string with inline commenting system (no built-in sidebar)
 */
export function renderInlineComments(markdownHtml: string): string {
	return `
<div id="inline-comments-container" class="relative">
  <!-- Content area (full width — sidebar is external) -->
  <div id="commentable-content"
       class="prose prose-sm dark:prose-invert max-w-none
              prose-code:bg-gray-100 prose-code:dark:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
              prose-pre:bg-gray-100 prose-pre:dark:bg-gray-800 prose-pre:rounded-lg
              prose-table:border-collapse prose-th:border prose-th:border-gray-300 prose-th:dark:border-gray-600 prose-th:px-3 prose-th:py-1.5
              prose-td:border prose-td:border-gray-300 prose-td:dark:border-gray-600 prose-td:px-3 prose-td:py-1.5
              selection:bg-amber-200 dark:selection:bg-amber-700/50">
    ${markdownHtml}
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
</style>

<script>
(function() {
  var contentArea = document.getElementById('commentable-content');
  var popover = document.getElementById('add-comment-popover');

  var comments = []; // { selectedText, comment, paragraph, highlightEl, sidebarCommentId }
  var pendingSelection = null;
  var highlightCounter = 0;

  // Assign paragraph indices to block-level elements in the content
  function getParagraphIndex(node) {
    var el = node.nodeType === 3 ? node.parentElement : node;
    if (!el) return 0;
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
    setTimeout(function() {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        hidePopover();
        return;
      }

      var range = sel.getRangeAt(0);

      if (!contentArea.contains(range.commonAncestorContainer)) {
        hidePopover();
        return;
      }

      var text = sel.toString().trim();
      if (!text) {
        hidePopover();
        return;
      }

      pendingSelection = {
        text: text,
        range: range.cloneRange(),
        paragraph: getParagraphIndex(range.startContainer)
      };

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
    var highlightId = 'inline-highlight-' + (++highlightCounter);

    // Wrap the selected text in a highlight span
    var highlightEl = document.createElement('span');
    highlightEl.className = 'inline-highlight';
    highlightEl.id = highlightId;
    highlightEl.setAttribute('data-comment-idx', num - 1);
    highlightEl.setAttribute('role', 'mark');
    highlightEl.setAttribute('aria-label', 'Commented text, annotation ' + num);

    try {
      selData.range.surroundContents(highlightEl);
    } catch (ex) {
      try {
        var fragment = selData.range.extractContents();
        highlightEl.appendChild(fragment);
        selData.range.insertNode(highlightEl);
      } catch (ex2) {
        highlightEl = null;
      }
    }

    var comment = {
      selectedText: selData.text,
      comment: '',
      paragraph: selData.paragraph,
      highlightEl: highlightEl,
      sidebarCommentId: null
    };
    comments.push(comment);

    // Add to unified sidebar
    if (typeof window.addReviewComment === 'function') {
      var sidebarId = window.addReviewComment({
        type: 'text',
        sourceId: highlightId,
        sourceLabel: 'Selected text #' + num,
        text: '',
        scrollTargetId: highlightId,
        highlightEl: highlightEl,
        quotedText: selData.text,
        onDelete: function() {
          removeComment(comment, true);
        },
        onTextChange: function(val) {
          comment.comment = val;
        }
      });
      comment.sidebarCommentId = sidebarId;
    }

    // Click highlight -> scroll to sidebar comment and focus it
    if (highlightEl) {
      highlightEl.addEventListener('click', function(e) {
        e.stopPropagation();
        var card = document.querySelector('[data-comment-id="' + comment.sidebarCommentId + '"]');
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          var ta = card.querySelector('textarea');
          if (ta) ta.focus();
        }
      });
    }
  }

  function removeComment(comment, fromSidebar) {
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
      parent.normalize();
    }

    // If not already called from sidebar, remove from sidebar
    if (!fromSidebar && comment.sidebarCommentId && typeof window.removeReviewComment === 'function') {
      window.removeReviewComment(comment.sidebarCommentId);
    }

    // Renumber remaining and update sidebar labels
    for (var i = 0; i < comments.length; i++) {
      if (comments[i].highlightEl) {
        comments[i].highlightEl.setAttribute('data-comment-idx', i);
        comments[i].highlightEl.setAttribute('aria-label', 'Commented text, annotation ' + (i + 1));
      }
      if (comments[i].sidebarCommentId && typeof window.updateReviewCommentLabel === 'function') {
        window.updateReviewCommentLabel(comments[i].sidebarCommentId, 'Selected text #' + (i + 1));
      }
    }
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
</script>`
}
