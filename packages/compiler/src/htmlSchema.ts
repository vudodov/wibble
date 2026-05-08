import type { SourceLine } from "./ast";

export interface HtmlDiagnostic {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly line: number;
  readonly column: number;
}

const htmlElements = new Set([
  "a",
  "abbr",
  "address",
  "area",
  "article",
  "aside",
  "audio",
  "b",
  "base",
  "bdi",
  "bdo",
  "blockquote",
  "body",
  "br",
  "button",
  "canvas",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "data",
  "datalist",
  "dd",
  "del",
  "details",
  "dfn",
  "dialog",
  "div",
  "dl",
  "dt",
  "em",
  "embed",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hgroup",
  "hr",
  "html",
  "i",
  "iframe",
  "img",
  "input",
  "ins",
  "kbd",
  "label",
  "legend",
  "li",
  "link",
  "main",
  "map",
  "mark",
  "menu",
  "meta",
  "meter",
  "nav",
  "noscript",
  "object",
  "ol",
  "optgroup",
  "option",
  "output",
  "p",
  "picture",
  "pre",
  "progress",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "script",
  "search",
  "section",
  "select",
  "slot",
  "small",
  "source",
  "span",
  "strong",
  "style",
  "sub",
  "summary",
  "sup",
  "svg",
  "table",
  "tbody",
  "td",
  "template",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "time",
  "title",
  "tr",
  "track",
  "u",
  "ul",
  "var",
  "video",
  "wbr"
]);

const eventNames = new Set([
  "abort",
  "animationcancel",
  "animationend",
  "animationiteration",
  "animationstart",
  "auxclick",
  "beforeinput",
  "blur",
  "cancel",
  "change",
  "click",
  "close",
  "compositionend",
  "compositionstart",
  "compositionupdate",
  "contextmenu",
  "copy",
  "cut",
  "dblclick",
  "drag",
  "dragend",
  "dragenter",
  "dragleave",
  "dragover",
  "dragstart",
  "drop",
  "error",
  "focus",
  "focusin",
  "focusout",
  "formdata",
  "input",
  "invalid",
  "keydown",
  "keypress",
  "keyup",
  "load",
  "mousedown",
  "mouseenter",
  "mouseleave",
  "mousemove",
  "mouseout",
  "mouseover",
  "mouseup",
  "paste",
  "pointercancel",
  "pointerdown",
  "pointerenter",
  "pointerleave",
  "pointermove",
  "pointerout",
  "pointerover",
  "pointerup",
  "reset",
  "scroll",
  "select",
  "submit",
  "toggle",
  "touchcancel",
  "touchend",
  "touchmove",
  "touchstart",
  "transitioncancel",
  "transitionend",
  "transitionrun",
  "transitionstart",
  "wheel"
]);

const viewKeywords = new Set(["text", "if", "else", "for", "slot"]);

export function isKnownHtmlElement(tag: string): boolean {
  return htmlElements.has(tag);
}

export function isKnownHtmlEvent(eventName: string): boolean {
  return eventNames.has(eventName);
}

export function validateHtmlLine(line: SourceLine): HtmlDiagnostic[] {
  const diagnostics: HtmlDiagnostic[] = [];
  const text = line.text.trim();
  const tag = /^[A-Za-z][A-Za-z0-9-]*/.exec(text)?.[0];
  if (!tag || viewKeywords.has(tag) || /^[A-Z]/.test(tag)) {
    return diagnostics;
  }

  if (!tag.includes("-") && !isKnownHtmlElement(tag)) {
    diagnostics.push({
      code: "WIB_HTML_ELEMENT",
      severity: "warning",
      message: `Unknown HTML element \`${tag}\`. Use a standard element, an imported component, or a custom element with a dash in its name.`,
      line: line.line,
      column: 1
    });
  }

  for (const match of text.matchAll(/\bon\s+([A-Za-z][A-Za-z0-9]*)\s*->/g)) {
    const eventName = match[1] ?? "";
    if (!isKnownHtmlEvent(eventName)) {
      diagnostics.push({
        code: "WIB_HTML_EVENT",
        severity: "warning",
        message: `Unknown DOM event \`${eventName}\`. Wibble supports standard lower-case DOM event names.`,
        line: line.line,
        column: Math.max(1, (match.index ?? 0) + 1)
      });
    }
  }

  return diagnostics;
}
