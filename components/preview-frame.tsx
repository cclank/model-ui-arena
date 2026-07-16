"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_VIEWPORT_WIDTH = 576;
const DEFAULT_VIEWPORT_HEIGHT = 720;
const MIN_VIEWPORT_WIDTH = 390;
const MAX_VIEWPORT_WIDTH = 1200;
const FIT_RETRIES = [100, 320, 760, 1400, 2400];
const MAX_FOCUS_SCALE = 2.2;
const FOCUS_FILL = 0.96;
const MIN_MARKER_COVERAGE = 0.9;
const SURFACE_FOCUS_THRESHOLD = 0.86;
const AMBIENT_FILL_THRESHOLD = 0.82;
const MAX_AMBIENT_SCALE = 1.9;
const MAX_SCANNED_ELEMENTS = 520;
const LAZY_ROOT_MARGIN = "1200px 0px";
const TRANSPARENT_COLORS = new Set(["transparent", "rgba(0, 0, 0, 0)"]);
const IGNORED_CONTENT_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
const MEDIA_TAGS = new Set(["CANVAS", "SVG", "VIDEO", "IMG", "PICTURE"]);
const CONTROL_TAGS = new Set(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"]);
const SEMANTIC_CONTAINER_TAGS = new Set(["MAIN", "ARTICLE", "SECTION", "FORM", "DIALOG"]);

type PreviewFrameProps = {
  src: string;
  title: string;
  className?: string;
  loading?: "eager" | "lazy";
  viewportWidth?: number;
  viewportHeight?: number;
};

type Bounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type Marker = {
  element: Element;
  weight: number;
};

type FocusTarget = Bounds;

type PreviewMode = "viewport" | "surface" | "ambient";

function isTransparent(color: string) {
  return TRANSPARENT_COLORS.has(color);
}

function normalizedTag(element: Element) {
  return element.tagName.toUpperCase();
}

function toBounds(rect: DOMRect): Bounds {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  };
}

function hasVisibleBox(
  element: Element,
  view: Window,
  viewportWidth: number,
  viewportHeight: number
) {
  const tag = normalizedTag(element);
  if (IGNORED_CONTENT_TAGS.has(tag)) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  const style = view.getComputedStyle(element);
  const isMedia = MEDIA_TAGS.has(tag);
  const isDecorative = !isMedia && (
    element.getAttribute("aria-hidden") === "true" ||
    (style.pointerEvents === "none" && ["absolute", "fixed"].includes(style.position))
  );

  return !isDecorative &&
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity) > 0.02 &&
    rect.width > 4 &&
    rect.height > 4 &&
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < viewportWidth &&
    rect.top < viewportHeight;
}

function directTextLength(element: Element) {
  return Array.from(element.childNodes).reduce((length, node) => {
    if (node.nodeType !== Node.TEXT_NODE) {
      return length;
    }
    return length + (node.textContent?.trim().length ?? 0);
  }, 0);
}

function hasSurfaceStyling(style: CSSStyleDeclaration) {
  const borderWidth = Number.parseFloat(style.borderTopWidth) || 0;
  const radius = Number.parseFloat(style.borderTopLeftRadius) || 0;

  return style.backgroundImage !== "none" ||
    !isTransparent(style.backgroundColor) ||
    style.boxShadow !== "none" ||
    borderWidth > 0 ||
    radius >= 4;
}

function markerWeight(
  element: Element,
  style: CSSStyleDeclaration,
  viewportArea: number
) {
  const tag = normalizedTag(element);
  if (MEDIA_TAGS.has(tag)) {
    return 5;
  }
  if (CONTROL_TAGS.has(tag)) {
    return 3;
  }

  const textLength = directTextLength(element);
  if (textLength > 0) {
    return 1 + Math.min(textLength / 60, 2);
  }

  const rect = element.getBoundingClientRect();
  const areaRatio = (rect.width * rect.height) / viewportArea;
  if (areaRatio >= 0.012 && areaRatio <= 0.85 && hasSurfaceStyling(style)) {
    return Math.min(3, 0.75 + areaRatio * 4);
  }

  return 0;
}

function elementDepth(element: Element, body: HTMLElement) {
  let depth = 0;
  let current: Element | null = element;

  while (current && current !== body && depth < 8) {
    depth += 1;
    current = current.parentElement;
  }

  return depth;
}

function measureFocusTarget(
  doc: Document,
  viewportWidth: number,
  viewportHeight: number
): FocusTarget | null {
  const view = doc.defaultView;
  if (!view || !doc.body) {
    return null;
  }

  const visible = Array.from(doc.body.querySelectorAll("*"))
    .slice(0, MAX_SCANNED_ELEMENTS)
    .filter((element) => hasVisibleBox(element, view, viewportWidth, viewportHeight));

  const viewportArea = viewportWidth * viewportHeight;
  const markers: Marker[] = visible.flatMap((element) => {
    const weight = markerWeight(element, view.getComputedStyle(element), viewportArea);
    return weight > 0 ? [{ element, weight }] : [];
  });
  const totalMarkerWeight = markers.reduce((sum, marker) => sum + marker.weight, 0);

  if (totalMarkerWeight < 1) {
    return null;
  }

  let best: { target: FocusTarget; score: number } | null = null;

  for (const element of visible) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) {
      continue;
    }

    const style = view.getComputedStyle(element);
    const styledSurface = hasSurfaceStyling(style);
    const semanticContainer = SEMANTIC_CONTAINER_TAGS.has(normalizedTag(element));
    if (!styledSurface && !semanticContainer && element.children.length < 2) {
      continue;
    }

    const markerWeightInside = markers.reduce(
      (sum, marker) => sum + (element.contains(marker.element) ? marker.weight : 0),
      0
    );
    const markerCoverage = markerWeightInside / totalMarkerWeight;
    if (markerCoverage < MIN_MARKER_COVERAGE) {
      continue;
    }

    const widthRatio = rect.width / viewportWidth;
    const heightRatio = rect.height / viewportHeight;
    const coversViewport = widthRatio >= 0.95 && heightRatio >= 0.95;
    if (coversViewport) {
      continue;
    }

    const areaRatio = (rect.width * rect.height) / (viewportWidth * viewportHeight);
    const depth = elementDepth(element, doc.body);
    const score = markerCoverage * 120 +
      (styledSurface ? 18 : 0) +
      (semanticContainer ? 8 : 0) +
      Math.min(depth, 5) * 2 -
      Math.min(areaRatio, 1.5) * 20;

    if (!best || score > best.score) {
      best = {
        score,
        target: toBounds(rect)
      };
    }
  }

  return best?.target ?? null;
}

function getVisibleBodyChildren(
  doc: Document,
  viewportWidth: number,
  viewportHeight: number
) {
  const view = doc.defaultView;
  if (!view || !doc.body) {
    return [];
  }

  return Array.from(doc.body.children).filter((element) =>
    hasVisibleBox(element, view, viewportWidth, viewportHeight)
  );
}

function extendDocumentBackground(
  stage: HTMLDivElement,
  doc: Document,
  viewportWidth: number,
  viewportHeight: number
) {
  const view = doc.defaultView;
  if (!view || !doc.body) {
    return;
  }

  const bodyStyle = view.getComputedStyle(doc.body);
  const rootStyle = view.getComputedStyle(doc.documentElement);
  const contentStyle = getVisibleBodyChildren(doc, viewportWidth, viewportHeight)
    .map((element) => view.getComputedStyle(element))
    .find((style) => style.backgroundImage !== "none");
  const imageStyle = bodyStyle.backgroundImage !== "none"
    ? bodyStyle
    : rootStyle.backgroundImage !== "none"
      ? rootStyle
      : contentStyle ?? bodyStyle;
  const colorStyle = !isTransparent(bodyStyle.backgroundColor)
    ? bodyStyle
    : rootStyle;

  stage.style.backgroundColor = isTransparent(colorStyle.backgroundColor)
    ? "#0b1018"
    : colorStyle.backgroundColor;
  stage.style.backgroundImage = imageStyle.backgroundImage;
  stage.style.backgroundPosition = imageStyle.backgroundPosition;
  stage.style.backgroundSize = imageStyle.backgroundImage === "none" ? "auto" : "cover";
  stage.style.backgroundRepeat = imageStyle.backgroundRepeat;
}

export function PreviewFrame({
  src,
  title,
  className = "preview",
  loading = "lazy",
  viewportWidth,
  viewportHeight = DEFAULT_VIEWPORT_HEIGHT
}: PreviewFrameProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fitFrameRef = useRef<number | null>(null);
  const [renderWidth, setRenderWidth] = useState(viewportWidth ?? DEFAULT_VIEWPORT_WIDTH);
  const [stageScale, setStageScale] = useState(1);
  const [ambientScale, setAmbientScale] = useState(1);
  const [showAmbient, setShowAmbient] = useState(false);
  const [mode, setMode] = useState<PreviewMode>("viewport");
  const [ready, setReady] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(loading === "eager");

  useEffect(() => {
    if (loading === "eager") {
      setShouldLoad(true);
      return;
    }

    const stage = stageRef.current;
    if (!stage || !("IntersectionObserver" in window)) {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: LAZY_ROOT_MARGIN }
    );
    observer.observe(stage);

    return () => observer.disconnect();
  }, [loading, src]);

  const resizePreview = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const { width, height } = stage.getBoundingClientRect();
    if (!width || !height) {
      return;
    }

    const nextRenderWidth = viewportWidth ?? Math.min(
      Math.max(Math.round(viewportHeight * (width / height)), MIN_VIEWPORT_WIDTH),
      MAX_VIEWPORT_WIDTH
    );
    const nextScale = Math.min(width / nextRenderWidth, height / viewportHeight);
    setRenderWidth((current) =>
      Math.abs(current - nextRenderWidth) > 1 ? nextRenderWidth : current
    );
    setStageScale((current) =>
      Math.abs(current - nextScale) > 0.002 ? nextScale : current
    );
  }, [viewportHeight, viewportWidth]);

  const fitDocument = useCallback(() => {
    const frame = iframeRef.current;
    if (!frame) {
      return;
    }

    try {
      const doc = frame.contentDocument;
      if (!doc || doc.readyState !== "complete" || !doc.body) {
        return;
      }

      let style = doc.getElementById("__arena_preview_fit") as HTMLStyleElement | null;
      if (!style) {
        style = doc.createElement("style");
        style.id = "__arena_preview_fit";
        (doc.head || doc.documentElement).appendChild(style);
      }

      const baseRules = [
        `html{width:${renderWidth}px!important;height:${viewportHeight}px!important;min-width:${renderWidth}px!important;min-height:${viewportHeight}px!important;overflow:hidden!important}`,
        `body{height:auto!important;min-height:${viewportHeight}px!important;overflow:visible!important;transform:none!important;transform-origin:top left!important}`
      ].join("");

      style.textContent = baseRules;
      const stage = stageRef.current;
      if (stage) {
        extendDocumentBackground(stage, doc, renderWidth, viewportHeight);
      }
      if (fitFrameRef.current !== null) {
        window.cancelAnimationFrame(fitFrameRef.current);
      }

      fitFrameRef.current = window.requestAnimationFrame(() => {
        if (iframeRef.current?.contentDocument !== doc || !doc.body) {
          return;
        }

        const body = doc.body;
        const root = doc.documentElement;
        const bodyRect = body.getBoundingClientRect();
        const naturalWidth = Math.max(
          renderWidth,
          body.scrollWidth,
          body.offsetWidth,
          root.scrollWidth,
          root.offsetWidth,
          Math.ceil(bodyRect.right - Math.min(bodyRect.left, 0))
        );
        const naturalHeight = Math.max(
          viewportHeight,
          body.scrollHeight,
          body.offsetHeight,
          root.scrollHeight,
          Math.ceil(bodyRect.bottom - Math.min(bodyRect.top, 0))
        );
        const focusTarget = measureFocusTarget(doc, renderWidth, viewportHeight);
        let contentScale = Math.min(
          1,
          renderWidth / naturalWidth,
          viewportHeight / naturalHeight
        );
        let offsetX = Math.max((renderWidth - naturalWidth * contentScale) / 2, 0);
        let offsetY = Math.max((viewportHeight - naturalHeight * contentScale) / 2, 0);
        let nextMode: PreviewMode = "viewport";
        let nextShowAmbient = false;
        let nextAmbientScale = 1;

        if (focusTarget) {
          const focusScale = Math.min(
            MAX_FOCUS_SCALE,
            (renderWidth * FOCUS_FILL) / focusTarget.width,
            (viewportHeight * FOCUS_FILL) / focusTarget.height
          );
          const localCenterX = focusTarget.left - bodyRect.left + focusTarget.width / 2;
          const localCenterY = focusTarget.top - bodyRect.top + focusTarget.height / 2;
          const filledWidth = (focusTarget.width * focusScale) / renderWidth;
          const filledHeight = (focusTarget.height * focusScale) / viewportHeight;
          const leastFilledAxis = Math.min(filledWidth, filledHeight);
          const naturalFilledWidth = (focusTarget.width * contentScale) / renderWidth;
          const naturalFilledHeight = (focusTarget.height * contentScale) / viewportHeight;
          const leastNaturalFill = Math.min(naturalFilledWidth, naturalFilledHeight);
          const shouldFocusSurface = leastNaturalFill < SURFACE_FOCUS_THRESHOLD &&
            focusScale > contentScale * 1.04;

          if (shouldFocusSurface) {
            contentScale = focusScale;
            offsetX = renderWidth / 2 - bodyRect.left - localCenterX * focusScale;
            offsetY = viewportHeight / 2 - bodyRect.top - localCenterY * focusScale;
            nextMode = "surface";
            nextShowAmbient = leastFilledAxis < AMBIENT_FILL_THRESHOLD;
            nextAmbientScale = nextShowAmbient
              ? Math.min(MAX_AMBIENT_SCALE, Math.max(1.16, 1.04 / leastFilledAxis))
              : 1;
          } else if (leastNaturalFill < AMBIENT_FILL_THRESHOLD) {
            nextMode = "ambient";
            nextShowAmbient = true;
            nextAmbientScale = Math.min(
              MAX_AMBIENT_SCALE,
              Math.max(1.16, 1.04 / leastNaturalFill)
            );
          }
        }

        style.textContent = [
          baseRules,
          nextMode !== "viewport"
            ? "html,body{background-color:transparent!important;background-image:none!important}"
            : "",
          `body{transform:matrix(${contentScale},0,0,${contentScale},${offsetX},${offsetY})!important}`
        ].join("");
        setMode(nextMode);
        setShowAmbient(nextShowAmbient);
        setAmbientScale(nextAmbientScale);
        setReady(true);
      });
    } catch {
      setReady(true);
    }
  }, [renderWidth, viewportHeight]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    resizePreview();
    const observer = new ResizeObserver(resizePreview);
    observer.observe(stage);

    return () => {
      observer.disconnect();
    };
  }, [resizePreview]);

  useEffect(() => {
    if (!shouldLoad) {
      return;
    }

    setReady(false);
    setShowAmbient(false);
    setAmbientScale(1);
    setMode("viewport");
    const stage = stageRef.current;
    if (stage) {
      stage.style.removeProperty("background-color");
      stage.style.removeProperty("background-image");
      stage.style.removeProperty("background-position");
      stage.style.removeProperty("background-size");
      stage.style.removeProperty("background-repeat");
    }
    const timers = FIT_RETRIES.map((delay) => window.setTimeout(fitDocument, delay));

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      if (fitFrameRef.current !== null) {
        window.cancelAnimationFrame(fitFrameRef.current);
        fitFrameRef.current = null;
      }
    };
  }, [fitDocument, shouldLoad, src]);

  return (
    <div
      ref={stageRef}
      className={`${className} preview-stage${showAmbient ? " has-ambient" : ""}`}
      aria-busy={!ready}
      data-preview-mode={mode}
    >
      {shouldLoad && showAmbient ? (
        <iframe
          aria-hidden="true"
          className="preview-frame preview-frame-ambient"
          src={src}
          title=""
          width={renderWidth}
          height={viewportHeight}
          sandbox="allow-same-origin"
          loading={loading}
          scrolling="no"
          tabIndex={-1}
          style={{
            width: renderWidth,
            height: viewportHeight,
            transform: `translate(-50%, -50%) scale(${stageScale * ambientScale})`
          }}
        />
      ) : null}
      {shouldLoad ? (
        <iframe
          ref={iframeRef}
          className={ready
            ? "preview-frame preview-frame-main ready"
            : "preview-frame preview-frame-main"}
          src={src}
          title={title}
          width={renderWidth}
          height={viewportHeight}
          sandbox="allow-scripts allow-same-origin"
          loading={loading}
          scrolling="no"
          style={{
            width: renderWidth,
            height: viewportHeight,
            transform: `translate(-50%, -50%) scale(${stageScale})`
          }}
          onLoad={fitDocument}
        />
      ) : null}
    </div>
  );
}
