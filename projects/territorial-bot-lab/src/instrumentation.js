(() => {
  const maxEvents = 5000;
  const maxTexts = 2000;
  const state = {
    startedAt: Date.now(),
    canvases: [],
    events: [],
    texts: [],
    rects: [],
    drawImages: [],
    drawCounts: Object.create(null),
    latestPointer: null,
    latestKeys: [],
  };

  function pushBounded(list, item, limit) {
    list.push(item);
    if (list.length > limit) list.splice(0, list.length - limit);
  }

  function count(name) {
    state.drawCounts[name] = (state.drawCounts[name] || 0) + 1;
  }

  function describeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
      id: canvas.id || null,
      width: canvas.width,
      height: canvas.height,
      clientWidth: canvas.clientWidth,
      clientHeight: canvas.clientHeight,
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
    };
  }

  function refreshCanvases() {
    state.canvases = Array.from(document.querySelectorAll("canvas")).map(describeCanvas);
  }

  function wrapMethod(proto, name, after) {
    const original = proto && proto[name];
    if (typeof original !== "function" || original.__territorialBotLabWrapped) return;
    function wrapped(...args) {
      const result = original.apply(this, args);
      try {
        count(name);
        after?.(this, args);
      } catch {
        // Instrumentation must never change game behavior.
      }
      return result;
    }
    wrapped.__territorialBotLabWrapped = true;
    proto[name] = wrapped;
  }

  function transformFor(ctx) {
    if (typeof ctx.getTransform !== "function") return null;
    const matrix = ctx.getTransform();
    return {
      a: matrix.a,
      b: matrix.b,
      c: matrix.c,
      d: matrix.d,
      e: matrix.e,
      f: matrix.f,
    };
  }

  function screenPoint(ctx, x, y) {
    const transform = transformFor(ctx);
    if (!transform) return { x: Number(x), y: Number(y) };
    return {
      x: transform.a * Number(x) + transform.c * Number(y) + transform.e,
      y: transform.b * Number(x) + transform.d * Number(y) + transform.f,
    };
  }

  wrapMethod(CanvasRenderingContext2D.prototype, "fillText", (ctx, args) => {
    const [text, x, y] = args;
    pushBounded(
      state.texts,
      {
        at: Date.now(),
        type: "fillText",
        text: String(text),
        x: Number(x),
        y: Number(y),
        screen: screenPoint(ctx, x, y),
        transform: transformFor(ctx),
        font: ctx.font,
        fillStyle: String(ctx.fillStyle),
      },
      maxTexts,
    );
  });

  wrapMethod(CanvasRenderingContext2D.prototype, "strokeText", (ctx, args) => {
    const [text, x, y] = args;
    pushBounded(
      state.texts,
      {
        at: Date.now(),
        type: "strokeText",
        text: String(text),
        x: Number(x),
        y: Number(y),
        screen: screenPoint(ctx, x, y),
        transform: transformFor(ctx),
        font: ctx.font,
        strokeStyle: String(ctx.strokeStyle),
      },
      maxTexts,
    );
  });

  for (const name of [
    "fillRect",
    "strokeRect",
  ]) {
    wrapMethod(CanvasRenderingContext2D.prototype, name, (ctx, args) => {
      const [x, y, width, height] = args;
      pushBounded(
        state.rects,
        {
          at: Date.now(),
          type: name,
          x: Number(x),
          y: Number(y),
          width: Number(width),
          height: Number(height),
          screen: screenPoint(ctx, x, y),
          transform: transformFor(ctx),
          fillStyle: String(ctx.fillStyle),
          strokeStyle: String(ctx.strokeStyle),
        },
        maxEvents,
      );
    });
  }

  wrapMethod(CanvasRenderingContext2D.prototype, "drawImage", (ctx, args) => {
    const source = args[0];
    const sourceInfo =
      source && typeof source === "object"
        ? {
            tagName: source.tagName || null,
            id: source.id || null,
            width: source.width ?? source.videoWidth ?? null,
            height: source.height ?? source.videoHeight ?? null,
          }
        : null;
    const destination =
      args.length === 3
        ? { x: Number(args[1]), y: Number(args[2]), width: null, height: null }
        : args.length === 5
          ? { x: Number(args[1]), y: Number(args[2]), width: Number(args[3]), height: Number(args[4]) }
          : args.length === 9
            ? { x: Number(args[5]), y: Number(args[6]), width: Number(args[7]), height: Number(args[8]) }
            : null;
    pushBounded(
      state.drawImages,
      {
        at: Date.now(),
        source: sourceInfo,
        destination,
        screen: destination ? screenPoint(ctx, destination.x, destination.y) : null,
        transform: transformFor(ctx),
      },
      maxEvents,
    );
  });

  for (const name of [
    "clearRect",
    "fill",
    "lineTo",
    "moveTo",
    "putImageData",
    "rect",
    "stroke",
  ]) {
    wrapMethod(CanvasRenderingContext2D.prototype, name);
  }

  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContextWithProbe(...args) {
    const ctx = originalGetContext.apply(this, args);
    refreshCanvases();
    return ctx;
  };

  function recordEvent(type, event) {
    const item = {
      at: Date.now(),
      type,
      x: "clientX" in event ? event.clientX : null,
      y: "clientY" in event ? event.clientY : null,
      button: "button" in event ? event.button : null,
      key: "key" in event ? event.key : null,
    };
    if (type.startsWith("pointer") || type === "click") state.latestPointer = item;
    if (type === "keydown") {
      state.latestKeys.push(item);
      if (state.latestKeys.length > 50) state.latestKeys.shift();
    }
    pushBounded(state.events, item, maxEvents);
  }

  for (const type of ["click", "pointerdown", "pointerup", "pointermove", "keydown"]) {
    window.addEventListener(type, (event) => recordEvent(type, event), true);
  }

  window.__territorialBotLab = {
    version: 1,
    getSnapshot() {
      refreshCanvases();
      return JSON.parse(
        JSON.stringify({
          now: Date.now(),
          url: location.href,
          title: document.title,
          state,
        }),
      );
    },
    reset() {
      state.events.length = 0;
      state.texts.length = 0;
      state.rects.length = 0;
      state.drawImages.length = 0;
      state.latestPointer = null;
      state.latestKeys.length = 0;
      state.drawCounts = Object.create(null);
      state.startedAt = Date.now();
    },
  };
})();
