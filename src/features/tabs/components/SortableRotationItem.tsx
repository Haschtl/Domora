import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { MemberAvatar } from "../../../components/member-avatar";
import { PimpersIcon } from "../../../components/pimpers-icon";

interface SortableRotationItemProps {
  id: string;
  label: string;
  avatarSrc: string;
  isVacation?: boolean;
  pimperCount: number;
  dragHandleLabel: string;
}

export const SortableRotationItem = ({
  id,
  label,
  avatarSrc,
  isVacation = false,
  pimperCount,
  dragHandleLabel
}: SortableRotationItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between gap-2 rounded-lg border p-2 ${
        isDragging
          ? "border-brand-300 bg-brand-50 dark:border-brand-700 dark:bg-slate-800"
          : "border-brand-100 bg-white/90 dark:border-slate-700 dark:bg-slate-900"
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-brand-200 text-slate-600 touch-none dark:border-slate-700 dark:text-slate-300"
          aria-label={dragHandleLabel}
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <MemberAvatar
          src={avatarSrc}
          alt={label}
          isVacation={isVacation}
          className="h-8 w-8 rounded-full border border-brand-200 bg-brand-50 dark:border-slate-700 dark:bg-slate-800"
        />
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{label}</p>
      </div>

      <div className="flex items-center gap-2">
        <Badge className="inline-flex items-center gap-1">
          <span>{pimperCount}</span>
          <PimpersIcon />
        </Badge>
      </div>
    </div>
  );
};
