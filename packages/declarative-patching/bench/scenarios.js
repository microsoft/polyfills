/**
 * Benchmark scenario helpers.
 *
 * Each `setup*` function builds the DOM state needed for a benchmark
 * iteration and returns a `run` callback that performs the operation
 * under test.  A `teardown` callback restores the DOM so the next
 * iteration starts from a clean state.
 */

// ---- helpers ---------------------------------------------------------------

function pi(type, name) {
  return document.createComment(`?${type} name="${name}"`);
}

function makeTemplate(name, content) {
  const tpl = document.createElement("template");
  tpl.setAttribute("for", name);
  tpl.innerHTML = content;
  return tpl;
}

// ---- scenarios -------------------------------------------------------------

/**
 * Single start/end replacement.
 */
export function setupSinglePatch(container) {
  const section = document.createElement("section");
  section.setAttribute("marker", "s");
  section.appendChild(pi("start", "s"));
  section.appendChild(document.createTextNode("Loading..."));
  section.appendChild(pi("end", "s"));
  container.appendChild(section);

  const tpl = makeTemplate("s", "<p>content</p>");
  container.appendChild(tpl);

  return {
    run(observe) {
      const disconnect = observe(container);
      disconnect();
    },
    teardown() {
      container.innerHTML = "";
    },
  };
}

/**
 * Many [marker] elements in the page, single patch targeting the last one.
 */
export function setupManyTargets(container, count = 1000) {
  for (let i = 0; i < count; i++) {
    const div = document.createElement("div");
    div.setAttribute("marker", `t${i}`);
    container.appendChild(div);
  }
  const last = container.lastElementChild;
  last.appendChild(pi("start", `t${count - 1}`));
  last.appendChild(document.createTextNode("old"));
  last.appendChild(pi("end", `t${count - 1}`));

  const tplHTML = "<p>new</p>";

  return {
    run(observe) {
      const tpl = makeTemplate(`t${count - 1}`, tplHTML);
      container.appendChild(tpl);
      const disconnect = observe(container);
      disconnect();
    },
    teardown() {
      // restore last target
      last.innerHTML = "";
      last.appendChild(pi("start", `t${count - 1}`));
      last.appendChild(document.createTextNode("old"));
      last.appendChild(pi("end", `t${count - 1}`));
      // remove any leftover templates
      for (const t of container.querySelectorAll("template")) {
        t.remove();
      }
    },
  };
}

/**
 * Batch: apply N patches in one processTemplates call.
 */
export function setupBatchPatches(container, count = 100) {
  for (let i = 0; i < count; i++) {
    const div = document.createElement("div");
    div.setAttribute("marker", `b${i}`);
    div.appendChild(pi("start", `b${i}`));
    div.appendChild(document.createTextNode("placeholder"));
    div.appendChild(pi("end", `b${i}`));
    container.appendChild(div);
  }

  return {
    run(observe) {
      for (let i = 0; i < count; i++) {
        container.appendChild(makeTemplate(`b${i}`, `<p>patched ${i}</p>`));
      }
      const disconnect = observe(container);
      disconnect();
    },
    teardown() {
      container.innerHTML = "";
      for (let i = 0; i < count; i++) {
        const div = document.createElement("div");
        div.setAttribute("marker", `b${i}`);
        div.appendChild(pi("start", `b${i}`));
        div.appendChild(document.createTextNode("placeholder"));
        div.appendChild(pi("end", `b${i}`));
        container.appendChild(div);
      }
    },
  };
}

/**
 * Single patch with a large template (many child nodes).
 */
export function setupLargeContent(container, childCount = 1000) {
  const section = document.createElement("section");
  section.setAttribute("marker", "lg");
  section.appendChild(pi("start", "lg"));
  section.appendChild(document.createTextNode("old"));
  section.appendChild(pi("end", "lg"));
  container.appendChild(section);

  const children = Array.from(
    { length: childCount },
    (_, i) => `<li>item ${i}</li>`,
  ).join("");
  const tplHTML = `<ul>${children}</ul>`;

  return {
    run(observe) {
      const tpl = makeTemplate("lg", tplHTML);
      container.appendChild(tpl);
      const disconnect = observe(container);
      disconnect();
    },
    teardown() {
      section.innerHTML = "";
      section.appendChild(pi("start", "lg"));
      section.appendChild(document.createTextNode("old"));
      section.appendChild(pi("end", "lg"));
      for (const t of container.querySelectorAll("template")) {
        t.remove();
      }
    },
  };
}

/**
 * Interleaved: N sequential patches using continuation markers.
 */
export function setupInterleaved(container, count = 100) {
  const div = document.createElement("div");
  div.setAttribute("marker", "il");
  div.appendChild(pi("start", "il"));
  div.appendChild(document.createTextNode("loading"));
  container.appendChild(div);

  return {
    run(observe) {
      // First patch replaces start-only range
      const first = makeTemplate("il", '<p>0</p><?marker name="il">');
      container.appendChild(first);
      const disconnect = observe(container);

      // Subsequent patches insert at continuation marker
      for (let i = 1; i < count; i++) {
        const markerPI = i < count - 1 ? '<?marker name="il">' : "";
        const tpl = makeTemplate("il", `<p>${i}</p>${markerPI}`);
        container.appendChild(tpl);
      }

      disconnect();
    },
    teardown() {
      container.innerHTML = "";
      const div = document.createElement("div");
      div.setAttribute("marker", "il");
      div.appendChild(pi("start", "il"));
      div.appendChild(document.createTextNode("loading"));
      container.appendChild(div);
    },
  };
}

/**
 * Deep DOM: markers nested many levels deep.
 */
export function setupDeepDOM(container, depth = 50) {
  let current = container;
  for (let i = 0; i < depth; i++) {
    const child = document.createElement("div");
    current.appendChild(child);
    current = child;
  }
  current.setAttribute("marker", "deep");
  current.appendChild(pi("start", "deep"));
  current.appendChild(document.createTextNode("deep placeholder"));
  current.appendChild(pi("end", "deep"));

  return {
    run(observe) {
      const tpl = makeTemplate("deep", "<p>deep content</p>");
      container.appendChild(tpl);
      const disconnect = observe(container);
      disconnect();
    },
    teardown() {
      current.innerHTML = "";
      current.appendChild(pi("start", "deep"));
      current.appendChild(document.createTextNode("deep placeholder"));
      current.appendChild(pi("end", "deep"));
      for (const t of container.querySelectorAll("template")) {
        t.remove();
      }
    },
  };
}
