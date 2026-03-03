import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "../../components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../../components/ui/dropdown-menu";

type BaseWidgetProps = {
  title: ReactNode;
  description?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
};

export const HouseholdCalendarWidget = ({ title, description, headerActions, children }: BaseWidgetProps) => (
  <>
    <CardHeader className="gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {headerActions}
      </div>
    </CardHeader>
    <CardContent className="select-none space-y-2">{children}</CardContent>
  </>
);

export const HouseholdWhiteboardWidget = ({ title, description, headerActions, children }: BaseWidgetProps) => (
  <>
    <CardHeader className="gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {headerActions}
      </div>
    </CardHeader>
    <CardContent className="pt-2">{children}</CardContent>
  </>
);

export const HouseholdMapWidget = ({ title, description, headerActions, children }: BaseWidgetProps) => (
  <>
    <CardHeader className="gap-1">
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {headerActions}
      </div>
    </CardHeader>
    <CardContent className="space-y-2 pt-2">{children}</CardContent>
  </>
);

type HouseholdWeatherDailyPreviewProps = {
  children: ReactNode;
};

export const HouseholdWeatherDailyPreview = ({ children }: HouseholdWeatherDailyPreviewProps) => (
  <div className="-mx-1 overflow-x-auto px-1 pb-1">
    <div className="flex min-w-max gap-3">{children}</div>
  </div>
);

type WeatherLegendItem = {
  index: number;
  label: string;
  visible: boolean;
};

type HouseholdWeatherPlotProps = {
  hint: ReactNode;
  isMobile?: boolean;
  legendButtonLabel: ReactNode;
  legendItems: WeatherLegendItem[];
  onToggleLegendItem: (datasetIndex: number) => void;
  children: ReactNode;
};

export const HouseholdWeatherPlot = ({
  hint,
  isMobile,
  legendButtonLabel,
  legendItems,
  onToggleLegendItem,
  children
}: HouseholdWeatherPlotProps) => (
  <>
    {isMobile ? (
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
        {legendItems.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs">
                <SlidersHorizontal className="mr-1 h-3.5 w-3.5" />
                {legendButtonLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{legendButtonLabel}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {legendItems.map((item) => (
                <DropdownMenuCheckboxItem
                  key={`weather-legend-item-${item.index}`}
                  checked={item.visible}
                  onCheckedChange={() => onToggleLegendItem(item.index)}
                >
                  {item.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    ) : (
      <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    )}
    {children}
  </>
);
