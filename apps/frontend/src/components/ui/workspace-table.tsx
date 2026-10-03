import type { ComponentPropsWithRef, ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { Empty, EmptyHeader, EmptyTitle } from "./empty";
import { Skeleton } from "./skeleton";
import { cn } from "cn";
import "./workspace-data.css";

/** Presentation only. Queries, selection, pagination and permissions belong to the caller. */
export function WorkspaceTable({
  caption,
  columns,
  children,
  loading,
  empty,
  emptyTitle,
  emptyAction,
  className,
  containerProps,
}: {
  caption: string;
  columns: { key: string; label: ReactNode }[];
  children?: ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyTitle?: string;
  emptyAction?: ReactNode;
  className?: string;
  containerProps?: ComponentPropsWithRef<"div">;
}) {
  return (
    <Table
      className={cn("ds-data-table", className)}
      aria-busy={loading || undefined}
      containerProps={{
        tabIndex: 0,
        role: "region",
        "aria-label": `${caption} 스크롤`,
        ...containerProps,
        className: cn("ds-data-table-scroll", containerProps?.className),
      }}
    >
      <TableCaption className="sr-only">{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column.key} scope="col">
              {column.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <>
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="ds-table-loading-label"
              >
                <span role="status">자료 불러오는 중</span>
              </TableCell>
            </TableRow>
            {Array.from({ length: 6 }, (_, row) => (
              <TableRow key={row} aria-hidden="true">
                {columns.map((column) => (
                  <TableCell key={column.key}>
                    <Skeleton className="h-5 w-3/4" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </>
        ) : empty ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="ds-table-empty-cell">
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>{emptyTitle ?? "결과가 없습니다."}</EmptyTitle>
                </EmptyHeader>
                {emptyAction}
              </Empty>
            </TableCell>
          </TableRow>
        ) : (
          children
        )}
      </TableBody>
    </Table>
  );
}
