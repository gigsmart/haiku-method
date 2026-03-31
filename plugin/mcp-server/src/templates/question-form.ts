import type { QuestionDef } from "../sessions.js";
import { renderLayout, escapeHtml, escapeAttr } from "./layout.js";
import { card, sectionHeading, renderMarkdownBlock } from "./components.js";

export interface QuestionPageData {
  title: string;
  questions: QuestionDef[];
  context: string;
  sessionId: string;
}

export function renderQuestionPage(data: QuestionPageData): string {
  const { title, questions, context, sessionId } = data;

  let bodyContent = "";

  // Context block
  if (context) {
    bodyContent += card(
      sectionHeading("Context", 2) + renderMarkdownBlock("question-context", context),
    );
  }

  // Question form
  bodyContent += `<form id="question-form" novalidate>`;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const inputType = q.multiSelect ? "checkbox" : "radio";
    const fieldName = `q-${i}`;

    let fieldContent = `<fieldset>
      <legend class="text-base font-semibold mb-1 text-gray-900 dark:text-gray-100">${escapeHtml(q.question)}</legend>`;

    if (q.header) {
      fieldContent += `<p class="text-sm text-gray-500 dark:text-gray-400 mb-3">${escapeHtml(q.header)}</p>`;
    }

    fieldContent += `<div class="space-y-2">`;

    // Render each option
    for (const option of q.options) {
      fieldContent += `<label class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors">
        <input type="${inputType}" name="${escapeAttr(fieldName)}" value="${escapeAttr(option)}"
               class="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
               aria-label="${escapeAttr(option)}">
        <span class="text-gray-700 dark:text-gray-300">${escapeHtml(option)}</span>
      </label>`;
    }

    // "Other" option
    fieldContent += `<label class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors">
        <input type="${inputType}" name="${escapeAttr(fieldName)}" value="__other__"
               class="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
               aria-label="Other"
               data-other-toggle="${i}">
        <span class="text-gray-700 dark:text-gray-300">Other</span>
      </label>
      <textarea name="${escapeAttr(fieldName)}-other" rows="2"
                id="other-text-${i}"
                class="hidden w-full ml-7 p-2 border border-gray-300 dark:border-gray-600 rounded-lg
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                       focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y text-sm"
                placeholder="Please specify..."
                aria-label="Other answer for: ${escapeAttr(q.question)}"></textarea>`;

    fieldContent += `</div></fieldset>`;

    bodyContent += card(fieldContent);
  }

  // Submit button
  bodyContent += `<button type="submit"
    class="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg
           transition-colors focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900">
    Submit Answers
  </button>`;

  // Result area
  bodyContent += `<div id="submit-result" class="hidden mt-4 p-4 rounded-lg"></div>`;

  bodyContent += `</form>`;

  // Client-side JS
  const clientScript = `
  <script>
  (function() {
    var sessionId = '${sessionId}';
    var questionCount = ${questions.length};
    var questionsData = ${JSON.stringify(questions.map((q) => ({ question: q.question, multiSelect: !!q.multiSelect })))};

    // Show/hide Other textarea
    document.querySelectorAll('[data-other-toggle]').forEach(function(input) {
      var idx = input.getAttribute('data-other-toggle');
      var textarea = document.getElementById('other-text-' + idx);
      if (!textarea) return;

      var fieldName = 'q-' + idx;

      function updateVisibility() {
        var inputs = document.querySelectorAll('input[name="' + fieldName + '"]');
        var otherChecked = false;
        inputs.forEach(function(inp) {
          if (inp.value === '__other__' && inp.checked) otherChecked = true;
        });
        textarea.classList.toggle('hidden', !otherChecked);
        if (otherChecked) textarea.focus();
      }

      // Listen on all inputs in this group
      document.querySelectorAll('input[name="' + fieldName + '"]').forEach(function(inp) {
        inp.addEventListener('change', updateVisibility);
      });
    });

    // Form submit
    document.getElementById('question-form').addEventListener('submit', function(e) {
      e.preventDefault();

      var answers = [];
      for (var i = 0; i < questionCount; i++) {
        var fieldName = 'q-' + i;
        var inputs = document.querySelectorAll('input[name="' + fieldName + '"]:checked');
        var selected = [];
        var hasOther = false;
        inputs.forEach(function(inp) {
          if (inp.value === '__other__') {
            hasOther = true;
          } else {
            selected.push(inp.value);
          }
        });

        var otherText = '';
        if (hasOther) {
          var textarea = document.getElementById('other-text-' + i);
          otherText = textarea ? textarea.value.trim() : '';
        }

        answers.push({
          question: questionsData[i].question,
          selectedOptions: selected,
          otherText: hasOther ? otherText : undefined
        });
      }

      // Disable form
      var form = document.getElementById('question-form');
      var buttons = form.querySelectorAll('button');
      var allInputs = form.querySelectorAll('input, textarea');
      buttons.forEach(function(b) { b.disabled = true; b.classList.add('opacity-50', 'cursor-not-allowed'); });
      allInputs.forEach(function(inp) { inp.disabled = true; });

      fetch('/question/' + sessionId + '/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: answers })
      })
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function() {
        var result = document.getElementById('submit-result');
        result.className = 'mt-4 p-4 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200';
        result.classList.remove('hidden');
        result.innerHTML = '<p class="font-semibold">Answers submitted successfully.</p><p class="text-sm mt-1">You can close this tab.</p>';
      })
      .catch(function(err) {
        var result = document.getElementById('submit-result');
        result.className = 'mt-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200';
        result.classList.remove('hidden');
        result.textContent = 'Error: ' + err.message;
        buttons.forEach(function(b) { b.disabled = false; b.classList.remove('opacity-50', 'cursor-not-allowed'); });
        allInputs.forEach(function(inp) { inp.disabled = false; });
      });
    });
  })();
  </script>`;

  const clientData = { sessionId, questionCount: questions.length };

  return renderLayout(title, bodyContent + clientScript, JSON.stringify(clientData));
}
