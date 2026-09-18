import type { AccessLevel, PublishStatus } from "@/contracts/admin/content";
import {
  accessLevelLabels,
  accessLevelStyles,
  publishStatusLabels,
  publishStatusStyles,
} from "@/features/content/content-labels";

const badgeBase =
  "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium";

export function StatusBadge({ status }: { status: PublishStatus }) {
  return (
    <span className={`${badgeBase} ${publishStatusStyles[status]}`}>
      {publishStatusLabels[status]}
    </span>
  );
}

export function AccessBadge({ access }: { access: AccessLevel }) {
  return (
    <span className={`${badgeBase} ${accessLevelStyles[access]}`}>
      {accessLevelLabels[access]}
    </span>
  );
}
