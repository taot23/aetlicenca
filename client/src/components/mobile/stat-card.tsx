import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: number | string;
  icon: ReactNode;
  changePercentage?: number;
  changeText?: string;
  className?: string;
  iconClassName?: string;
  valueClassName?: string;
  changeClassName?: string;
}

export function StatCard({
  title,
  value,
  icon,
  changePercentage,
  changeText,
  className,
  iconClassName,
  valueClassName,
  changeClassName
}: StatCardProps) {
  const isPositiveChange = typeof changePercentage === 'number' ? changePercentage >= 0 : false;
  
  return (
    <div className={cn(
      "bg-white rounded-lg p-3 flex flex-col shadow-sm w-full h-full", 
      className
    )}>
      <div className="text-gray-500 text-xs font-medium mb-1.5">{title}</div>
      
      <div className="flex items-center">
        <div className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center bg-blue-100",
          iconClassName
        )}>
          {icon}
        </div>
        
        <div className={cn(
          "text-2xl font-bold ml-2.5", 
          valueClassName
        )}>
          {value}
        </div>
      </div>
      
      {(changePercentage !== undefined || changeText) && (
        <div className={cn(
          "mt-1.5 text-[10px] flex items-center flex-wrap",
          isPositiveChange ? "text-green-500" : "text-red-500",
          changeClassName
        )}>
          <span className="mr-0.5">
            {isPositiveChange ? "↑" : "↓"}
          </span>
          {typeof changePercentage === 'number' && (
            <span>{Math.abs(changePercentage)}% </span>
          )}
          <span className="text-gray-500 text-[10px] leading-tight">
            {changeText || "em relação ao mês anterior"}
          </span>
        </div>
      )}
    </div>
  );
}