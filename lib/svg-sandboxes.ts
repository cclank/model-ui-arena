export const SVG_SANDBOXES = [
  {
    id: "qoder",
    label: "Qoder",
    directory: "qoder"
  },
  {
    id: "claudeCode",
    label: "Claude Code",
    directory: "claudeCode"
  }
] as const;

export type SvgSandbox = (typeof SVG_SANDBOXES)[number];
export type SvgSandboxId = SvgSandbox["id"];

export function isSvgSandboxId(value: string): value is SvgSandboxId {
  return SVG_SANDBOXES.some((item) => item.id === value);
}

export function getSvgSandboxById(id: SvgSandboxId): SvgSandbox {
  const sandbox = SVG_SANDBOXES.find((item) => item.id === id);

  if (!sandbox) {
    throw new Error(`Unknown SVG sandbox: ${id}`);
  }

  return sandbox;
}
