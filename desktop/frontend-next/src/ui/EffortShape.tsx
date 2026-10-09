import { t } from "../i18n";
import { effortExample } from "./provider_compat";

export const EXAMPLE_LEVEL = "high";

// Only the protocols whose request shape is the wire's own declare it; deepseek,
// glm and the rest reshape the request, and "none" sends nothing.
export function EffortShape({ field, protocol, level, className = "tip" }: { field?: string; protocol: string; level?: string; className?: string }) {
  if (!field || (protocol !== "" && protocol !== "openai")) return null;
  return (
    <i className={className} data-effort-field={field}>
      {t("当前接口类型会按 {field} 发送，例如 {example}", { field, example: effortExample(field, level || EXAMPLE_LEVEL) })}
    </i>
  );
}
